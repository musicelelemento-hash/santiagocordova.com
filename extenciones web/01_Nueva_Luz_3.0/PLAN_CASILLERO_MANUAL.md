# 📝 Plan — Casillero manual de documentos físicos

Cargar a mano lo que no está en el portal (notas de venta, comprobantes
físicos) antes de que el bot llene el formulario. 04-sep-2026.

---

## El problema

El bot declara **solo con lo que extrae del SRI**. Todo lo que existe en papel
—notas de venta, facturas físicas, retenciones en papel— hoy simplemente no
entra, y la declaración sale incompleta sin que nada avise.

## La tensión de diseño

Casi nunca hay notas de venta. Si el bot frena en cada cliente a preguntar,
41 clientes se vuelven 41 interrupciones para escribir 41 ceros. Pero si no
pregunta nunca, el mes que sí hay una nota, la declaración sale mal.

**La salida: que el caso normal no cueste nada y el excepcional sea imposible
de pasar por alto.** De ahí el temporizador — y algo más importante que el
temporizador, que es que la ventana aprenda a dejar de aparecer.

---

## Cómo se ve

Una tarjeta chica sobre el formulario, antes de llenarlo:

```
┌──────────────────────────────────────────────┐
│  📝 ¿Algo en papel?          LABANDA · ago 2026│
│                                               │
│  Notas de venta        base [ 0.00 ]          │
│  Ventas no electrón.   base [ 0.00 ] IVA [0.00]│
│  Compras físicas       base [ 0.00 ] IVA [0.00]│
│     ☑ con derecho a crédito tributario        │
│  Retenciones en papel       [ 0.00 ]          │
│                                               │
│  Continuando sin agregar nada en 12s…         │
│  [ Continuar ]  [ No preguntar para este ]    │
└──────────────────────────────────────────────┘
```

**El temporizador corre hacia el caso seguro.** Al llegar a cero continúa con
todo en cero, que es exactamente lo que el bot hace hoy: no agrega nada, no
inventa nada. Y se cancela apenas tocás cualquier campo — si empezaste a
escribir, la ventana te espera.

---

## Las cuatro fases

### Fase 1 · La ventana y el temporizador

Se abre en `autoLlenarFormulario(data)`, antes de `llenarVentas`. Devuelve un
objeto de extras que se fusiona con lo extraído.

- Temporizador de 12 s, cancelable con cualquier interacción.
- Botón **Continuar** para saltarlo.
- Si el periodo ya tenía datos manuales guardados, los precarga.
- Todo lo cargado queda en `SafeStorage` bajo `manual_docs_<RUC>_<AAAA-MM>`:
  reintentar un cliente no obliga a volver a escribir.

**Verificable en banco**: que el temporizador llegue a cero y devuelva ceros;
que una tecla lo cancele; que los valores escritos sobrevivan a una recarga.

### Fase 2 · Que aprenda a callarse

Acá está el verdadero ahorro. Cada vez que un cliente cierra en cero, se cuenta.

- **Tres periodos seguidos en cero → deja de preguntar** para ese cliente. No
  desaparece en silencio: registra `📝 [MANUAL] LABANDA: sin documentos físicos
  en 3 periodos. No se pregunta más (reactivar desde el panel).`
- En el panel, cada cliente muestra si tiene la pregunta activa, con un botón
  para reactivarla.
- Si alguna vez cargás algo, el contador se reinicia y vuelve a preguntar.

Después de dos o tres meses la ventana solo aparece para los clientes que de
verdad manejan papel. Los otros 38 no molestan nunca más.

### Fase 3 · Que se note de dónde salió cada número

Un número cargado a mano y uno extraído del portal **no valen lo mismo** cuando
algo no cuadra. Hay que poder distinguirlos.

- El resumen del panel los separa: `Ventas 15%: 4.520,00 (4.200,00 SRI + 320,00 manual)`.
- Lo que se sincroniza a Supabase lleva el desglose, para que el dashboard web
  también pueda mostrarlo.
- El PDF de respaldo, si se genera a mano, lo menciona.

### Fase 4 · Los casilleros correctos

**Esta fase necesita tu confirmación y por eso va al final.** Los campos del
boceto son mi propuesta a partir de lo que el código ya llena (115, 500, 507,
510, 517, 543, 544, 564, 565, 609), pero cuál casillero recibe cada tipo de
documento físico es criterio contable, no algo que yo deba adivinar.

Lo que necesito de vos: **qué documento en papel va a qué casillero**. Con eso
el mapeo queda explícito en el código y auditable.

Mientras tanto, las fases 1 a 3 funcionan igual: guardan, recuerdan y muestran.
Solo el destino final de cada monto queda pendiente.

---

## Lo que este plan NO hace

- **No decide crédito tributario.** Marcás vos la casilla; el bot no interpreta
  la actividad del cliente. Eso es el laboratorio de proveedores, otro tema.
- **No inventa valores.** Sin carga manual, cero. Nunca estima ni arrastra el
  mes anterior.
- **No cambia el contrato de envío.** El freno sigue igual: si el saldo no se
  puede confirmar en cero, guarda borrador y para.

---

## Orden sugerido

La fase 1 es chica y ya sirve sola. La 2 es la que convierte la función en algo
usable con 41 clientes. La 3 es media hora. La 4 depende de tu respuesta.

Empezaría por 1 y 2 juntas: sin la 2, la ventana es una molestia y la vas a
terminar apagando.

---

## Una pregunta antes de arrancar

El temporizador de 12 s corre hacia **cero**, que es lo seguro. Pero si en el
mes que sí tenías una nota de venta estás mirando otra pantalla, se pasa solo
y la declaración sale sin ese dato.

Dos alternativas, según cómo trabajes:

1. **Timer siempre** (lo del plan). Rápido, con el riesgo de arriba.
2. **Timer solo para los clientes que ya fueron cero antes.** El primer mes te
   pregunta de verdad a todos, y a partir de ahí solo corre solo para los que
   ya demostraron no tener papeles.

La 2 es más segura y encaja mejor con la fase 2. Decime cuál preferís.
