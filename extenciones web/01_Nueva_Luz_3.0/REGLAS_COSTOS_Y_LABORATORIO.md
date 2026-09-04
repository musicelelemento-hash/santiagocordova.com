# 💳 Costos y 🧪 Laboratorio de proveedores — reglas

Dos cosas que conviene tener escritas para no descubrirlas por la factura o por
una declaración mal hecha. 04-sep-2026.

---

# Parte 1 · Costos: R2 y Supabase

## Las cuentas, con tus números

**Un comprobante del SRI pesa 112.784 bytes** — medido en tu corrida real, no
estimado.

```
41 clientes × 110 KB × 12 meses  =  ~54 MB al año
```

El plan gratuito de R2 son **10 GB de almacenamiento**. A este ritmo tardarías
**unos 185 años** en llenarlo. El almacenamiento no es el riesgo.

## Dónde sí se puede escapar

R2 no cobra egreso, pero **sí cuenta operaciones**:

| Concepto | Gratis / mes | Tu uso real |
| :--- | ---: | ---: |
| Almacenamiento | 10 GB | ~4,5 MB/mes |
| **Clase A** (escrituras, PUT/POST) | 1.000.000 | ~41 |
| **Clase B** (lecturas, GET/HEAD) | 10.000.000 | pocas |

Con 41 clientes estás cuatro órdenes de magnitud por debajo. **Para pasarte
harían falta unos 24.000 clientes.**

## 🚨 Lo único que sí te podría costar

**Un bucle que reintente sin techo.** Si algo falla y el código reintenta la
subida en un ciclo cerrado, esas 41 escrituras se vuelven miles en una tarde.
No es hipotético: ya hubo tres rutas que arrancaban solas en este proyecto.

### Reglas para no llegar ahí

1. **Toda subida tiene un tope de intentos.** Hoy `uploadToCloudflareR2Direct`
   intenta Worker y después S3: dos, y se rinde. **Nunca meter reintentos en
   bucle sin contador.**
2. **El registro local ya evita el reintento infinito.** `sc_declaraciones_locales`
   impide volver a declarar, y con eso, volver a subir el mismo comprobante.
3. **Antes de subir, preguntar si ya está.** `syncDeclarationToSupabase` hace
   `HEAD` antes del `POST`. Es una operación Clase B (baratísima) que evita una
   Clase A. Mantenerlo.
4. **Nada de subir en un `setInterval`.** Si aparece esa necesidad, está mal
   planteado el problema.
5. **Poné una alerta de gasto en Cloudflare.** En el panel de facturación,
   avisos a $1. Con tu volumen no debería dispararse nunca; si suena, hay un
   bucle.

## Supabase

El plan gratuito da 500 MB de base y 1 GB de Storage. Tu uso:

- **Base**: una fila por declaración. 41 × 12 = 492 filas al año. Irrelevante.
- **Storage**: es el respaldo Tier 2, y **solo se usa si R2 falla**. Hoy da 403
  por RLS — y con R2 andando no importa, porque nunca se llega ahí.

**Regla**: si algún día el Tier 2 empieza a usarse seguido, es señal de que R2
está fallando. No lo tapes arreglando el RLS: arreglá R2.

## 🔑 Sobre las credenciales

Sigue pendiente lo que ya marqué: la `R2_SECRET_ACCESS_KEY` está en
`shared_config.js` y en el bundle. **Una clave S3 filtrada no es un problema de
cuota, es alguien escribiendo en tu bucket con tu tarjeta detrás.**

Con el service worker el Worker relay ya no necesita esa clave. En cuanto
confirmemos que sube por ahí, se saca del cliente y se rota.

---

# Parte 2 · Laboratorio de proveedores

## Lo que cambia tu base del SRI

Dijiste que tenés una base con **RUC y actividad económica**. Eso mueve el
proyecto de "adivinar" a "consultar", que es otra cosa completamente distinta.

Y el TXT de comprobantes recibidos ya trae, por cada factura:

```
RUC_EMISOR · RAZON_SOCIAL_EMISOR · VALOR_SIN_IMPUESTOS · IVA · IMPORTE_TOTAL
```

**Con el RUC del emisor podés cruzar contra tu base y saber la actividad del
proveedor sin pedirle nada al portal.** Ese es el insumo del laboratorio.

## Cómo lo plantearía

### Fase 1 · Memoria, sin ninguna regla *(la más valiosa y la más segura)*

Una tabla `proveedores_clasificados`: `ruc_proveedor`, `ruc_cliente`,
`con_derecho`, `clasificado_por`, `fecha`.

La primera vez que aparece un proveedor, se pregunta. Nunca más. La próxima
factura de ese emisor se resuelve sola con lo que **vos** decidiste.

Sin inteligencia, sin reglas, sin riesgo. Y a los dos o tres meses la mayoría
del trabajo desaparece solo, porque los proveedores se repiten.

### Fase 2 · Sugerir con la actividad, nunca decidir

Recién acá entra tu base del SRI. El cruce por RUC propone:

> *«Proveedor de combustibles · el cliente es RIMPE de servicios → sugiero
> SIN derecho a crédito»*

Con dos condiciones que no negociaría:

- **Sugiere, no aplica.** La casilla la marcás vos.
- **Muestra el porqué.** «Sugerido por actividad» vs «como lo clasificaste en
  julio» son cosas distintas y hay que poder distinguirlas.

### Fase 3 · Proporcionalidad

Cuando el cliente tiene ventas mixtas (0% y 15%), el crédito es parcial. Eso ya
toca los casilleros 564/565 que el código maneja hoy. **No lo mezclaría con las
fases anteriores**: es un cálculo distinto y merece su propia verificación.

## 🛑 La regla que no se toca

**El bot nunca decide crédito tributario por su cuenta.**

Clasificar mal un proveedor no rompe el software: hace una declaración
incorrecta, con tu firma. Todo lo que el laboratorio produzca es una
**sugerencia con explicación**, y la confirmación es humana.

Es la misma lógica que el freno de envío: ante la duda, se detiene y pregunta.

---

# Reglas rápidas, para tener a mano

| # | Regla |
| :-: | :--- |
| 1 | Toda subida tiene tope de intentos. Nunca un reintento en bucle. |
| 2 | `HEAD` antes de `POST`: verificar si el archivo ya está. |
| 3 | Nada de subir dentro de un `setInterval`. |
| 4 | Si Supabase Storage (Tier 2) se usa seguido, el problema es R2. |
| 5 | Alerta de gasto en Cloudflare a $1. |
| 6 | La clave S3 no vive en el cliente. El Worker no la necesita. |
| 7 | El bot no decide crédito tributario. Sugiere y explica. |
| 8 | Toda sugerencia dice de dónde salió. |
| 9 | Un proveedor nuevo se pregunta una vez y se recuerda para siempre. |
| 10 | Ante la duda, frenar. Vale para el envío y para la clasificación. |
