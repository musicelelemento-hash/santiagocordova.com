# 🔬 Informe de coherencia — Nueva Luz 3.0 (01, Declaración IVA & Robot SRI)

Diagnóstico interno: qué hace, por qué su arquitectura es como es, dónde se
contradice consigo misma y qué conviene hacer. 22-sep-2026.

Datos medidos hoy: manifest **3.1.0**, `build/content.js` de **1.237 líneas y
580 KB**, `src/` de **8 archivos JS (módulos 01→07 + main.js) y ~22.500 líneas**.

Fuentes: `HANDOFF.md` (06/09-sep), `INFORME_UI.md` (04-sep), `src/SRI_DOM_KNOWLEDGE.md`,
lectura de código y mediciones de hoy.

---

## Resumen ejecutivo

Nueva Luz 3.0 es la pieza central del ecosistema y es **internamente coherente en
lo funcional**: un solo bundle inyectado en el portal que recorre la declaración de
IVA de principio a fin, con frenos de seguridad claros y una suite de pruebas que
valida el código real. Pero la coherencia de *control y superficie* se ha quedado
atrás de la coherencia de *lógica*: **seis superficies flotantes que no se hablan,
tres juegos de botones para la misma acción, y una credencial que sigue viva en el
código y en git**.

El veredicto es el mismo que a nivel ecosistema, pero concentrado: **el cerebro del
bot está sano; su interfaz y su higiene de secretos arrastran la deuda.**

---

## 1. Qué es y por qué está construida así

**Un monolito por decisión, no por descuido.** Chrome inyecta un `content script`;
Vite concatena los 7 módulos (01→07) en un único `build/content.js` **sin
`import`/`export`**, donde todo es global compartido y una función del 01 la ve el
07. Esto es coherente con el destino —una sola inyección en `sri.gob.ec`— y con el
entorno (sin bundler en runtime, sin type-check). El costo es conocido y asumido:
todo global, riesgo de `window.f = () => f()` recursivo y de métodos duplicados que
se pisan en silencio (ambos documentados como "trampas" en HANDOFF §5).

```
01 utilidades+PDF → 02 servicios+memoria → 03 login/sesión → 04 extracción
→ 05 llenado → 06 panel/cierre mágico → 07 navegación/HUD
```

El flujo es lineal y el orden de carga importa: cada módulo usa a los anteriores.
Es la arquitectura clásica de "procedimiento superior con helpers agregados", y
para un bot que entra y sale del portal es la más simple que funciona.

**El contrato central — `ejecutarCierreMagico`** solo envía si puede confirmar
**las cinco cosas a la vez** (en resumen, saldo = 0, mensajes limpios, no
sustitutiva, no IVA sin ubicar). Es el diseño más coherente de toda la extensión:
la potencia del bot está en los frenos, no en la velocidad.

---

## 2. Lo que sí tiene sentido (sano)

- **Los frenos de comportamiento** (§2 del HANDOFF): nunca paga, nunca presenta
  sustitutiva, nunca cambia claves, nunca contesta la encuesta, nunca escribe la
  clave en el DOM del portal. Cinco reglas que protegen la firma del contador.
- **`null` ≠ 0 y el campo `origen`**: un "no sé" jamás se guarda como dato, y una
  sugerencia (catastro/IA) no pisa una decisión del contador (`usuario` manda).
  Es la diferencia entre automatizar y **asumir**.
- **La cascada de proveedores** (decisión del contador → catastro CIIU → IA): paga
  por la IA solo cuando las fuentes locales no alcanzan, y hacia la IA solo sale el
  nombre y la actividad del proveedor — ni RUC, ni importes.
- **Los 16 bancos de pruebas** (561 comprobaciones verdes al 09-sep): cargan el
  `build/content.js` real, el mismo que inyecta en el portal. Lo que se prueba es
  lo que corre.
- **La honestidad del HANDOFF**: cada pieza a medias está listada con su riesgo
  (§4). Un proyecto donde la deuda está mapeada es un proyecto manejable.
- **El nace el 5%**: `clasificarTarifaIva` devuelve tres respuestas (15 / 5 / `null`)
  y el `null` es deliberado — el cociente no distingue 5% real de mezclada, y el bot
  **prefiere no saber a equivocarse**. Es la misma filosofía de `null ≠ 0`.
- **Lo que no tocar**: la palette azul/accentos, los emojis como íconos, y los 4
  `sleep()` del cierre (`06_panel_interfaz.js:1398, 1421, 1433, 1502`) — secuencia
  de envío probada que no se toca sin el portal delante.

---

## 3. Incoherencias internas, priorizadas

### 🔴 P0 · Secretos

1. **Secreto de R2 en `shared_config.js`** → en el historial de git (§4.1). La
   subida ya va por `s3`, pero la credencial vieja sigue viva hasta que se **rote
   en Cloudflare R2** (no en "Mi Perfil"; el token S3 correcto está en *Manage R2
   API Tokens*). Rotar = también borrar el viejo, no solo crear uno nuevo, y luego
   vaciar `shared_config.js`.

2. **Las claves del SRI**: las claves de los contribuyentes viven en el
   almacén seguro (regla §2.5: nunca al DOM). Ese diseño **tiene sentido**; el punto
   pendiente es que el "estado" que decide dónde sale `claveSecreta`/`accessKeyId`
   (del almacén vs del código) hay que confirmarlo con **Ajustes → 🔌 Probar** antes
   de dar la rotación por cerrada.

### 🔴 P0 · Control: la UI se contradice consigo misma

Del DOM real de la pantalla de resumen (INFORME_UI): **ocho controles a la vez,
dos pausas y dos stops**, y en código tres versiones por acción:

```
detener   → btn-panel-detener · btn-pill-stop · slh-stop
sync      → btn-force-sync · btn-force-sync-panel · btn-sync-supabase
siguiente → btn-panel-force-next · btn-success-next
```

Con **396 atributos `style` inline** (13× más que las 31 clases propias) y **4
bloques `<style>` inyectados**, cambiar el color de acento hoy es tocar cientos de
líneas. No es estética: es la ambigüedad que produjo los bugs de control. El
principio (ya propuesto en INFORME_UI paso 2): **una acción por control, en un solo
lugar** — pausa/stop solo en el HUD.

### 🔴 P0 · Superficies: seis que no se comunican

Las seis superficies flotantes, dibujadas por cuatro módulos distintos:

| # | Superficie | Vive en | Aparece |
| :-: | :--- | :---: | :--- |
| 1 | HUD `SriLoopHUD` / cajón 🧰 | `07:643`–`07:769` | Siempre, en el portal |
| 2 | Panel/Píldora `SriAssistantPanel` | `06:1`, raíz `06:71` | Siempre, esquina opuesta |
| 3 | Barra de clientes (`renderAnticipationWidget`) | `01:2970` | Login |
| 4 | Cockpit de login (`renderLoginCockpit`) | `03:2186` | Login, **además de la 3** |
| 5 | Tarjetas (`showContextCard`) | `06` | Modal con overlay |
| 6 | Toasts (`showEliteToast`/`showMainToast`) | `06:934`, `07:3780` | Flotantes |

Problemas concretos (INFORME_UI):
- **Barra (3) + cockpit (4) se pisan en la misma pantalla de login**, mostrando dos
  listas de clientes que hay que sincronizar a mano. Es la duplicación más cara.
- **`showContextCard` auto-confirma a los 4 s por defecto**: una tarjeta que
  *pregunta* se responde sola salvo que recuerdes pasar `timeout: null`.
- **Falta jerarquía de botones**: `⚡ LLENAR TODO AUTOMÁTICO` (destructivo) compite
  visualmente con `🔄 Recargar` (trivial) — primarias, secundarias y peligros sin
  lenguaje propio.
- Botones de "Cerrar" delimitados, Escape cierra el cajón 🧰, y el HUD es **la única
  superficie con lenguaje visual propio** (fases con punto latiendo, arrastrable,
  recuerda posición) — debería ser la plantilla del resto.

### 🟠 P1 · Funcional a medias (construido pero desconectado)

- **XML listo pero no conectado** (§4.4): `parsearXmlComprobante()` y
  `descargarXmlComprobante(N)` existen, pero hay que llamarlos a mano. Es la pieza
  que cierra el falso-5% que el cociente no distingue.
- **Nota de débito y liquidación de compra no se barren** (§4.5); no inventar los
  códigos — leerlos del `cmbTipoComprobante`.
- **El "mapa de crédito tributario" falta** (§4.3): están los 3 datos (tarifa del
  proveedor, actividad del proveedor, actividad del cliente) pero **no la matriz
  que los traduce a sí/no**; y esa matriz la pone el contador, no una IA.
- **Empresas fantasma**: el catastro provincial no trae esa marca; se usa el estado
  del contribuyente (suspendido/pasivo) como proxy con bandera roja (§4.6).
- **Worker R2 muerto** (§4.8): `santiagocordova-r2-vault.workers.dev` no responde;
  lo cubre S3 con cortacircuitos, pero el canal muerto persiste como ruta.
- **La "escritura en el DOM" y el parser de XML de las 4 secciones**: conectados a
  medias en §4.4 y §4.5.

---

## 4. Dónde está el peso

Cifras de hoy:

```
build/content.js    1.237 líneas · 580 KB    ← lo que Chrome inyecta de verdad
src/ (8 .js)        ~22.500 líneas            ← lo que Vite concatena
vendor/             jspdf (355 KB) · catastro_eloro.txt (6,2 MB) · ciiu.json
tests/              16 bancos · 561 comprobaciones
```

La mayor parte de la inteligencia está en `02` (servicios: cierre, catastro,
proveedores, chequeo) y `06/07` (interfaz + navegación). El peso HTML/CSS inline
vive sobre todo en `06` (panel) y `07` (HUD), que es la fuente de la deuda de UI.

---

## 5. Recomendaciones, en orden

| # | Acción | Impacto | Riesgo |
| :-: | :--- | :--- | :---: |
| 1 | Confirmar 🔌 en Ajustes y **rotar R2**; vaciar `shared_config.js` | Cierra la filtración abierta en git | Bajo |
| 2 | **Tokens de diseño** (bloque `<style>` con variables, INFORME_UI paso 1) | Hace la UI mantenible sin cambios visuales | Bajo |
| 3 | **Un control por acción**: pausa/stop solo en HUD; quitar sync/next duplicados | Quita la ambigüedad que genera bugs | Medio |
| 4 | **Fusionar login**: barra de clientes + cockpit → una sola lista | Elimina la sincronización manual | Medio |
| 5 | `showContextCard`: no auto-confirmar sin `timeout` explícito | Las tarjetas que preguntan esperan | Bajo |
| 6 | **Conectar el XML** al flujo para facturas ambiguas/5% | Cierra el último hueco de tarifas | Alto (con banco nuevo) |
| 7 | Jerarquía de botones y cajón por defecto cerrado | Orden visual sin reescribir paneles | Bajo |

Pasos 1 y 3 primero: el 1 frena un riesgo de seguridad activo, el 3 es el que se
nota al usarla. El 6 es la deuda funcional de más plata.

---

## 6. Lo que NO tocar

- **La suite de frenos de §2** (saldo≠0 no envía, no sustitutiva, no cambia claves).
- **Los `sleep()` del cierre mágico** — probados en producción; no optimizar sin
  el portal delante (§4.7).
- **El comportamiento `null` para tarifas ambiguas**: es una decisión, no un bug.
- **La paleta y los emojis**: lenguaje visual del proyecto.
- **Cablear los `id` de casilleros por suposición**: un selector que no está en la
  Biblia no existe (§5b / §4.2).

---

## 7. Conclusión de una línea

Nueva Luz 3.0 tiene un cerebro coherente bien probado (frenos, cascada, cierre en
5 condiciones) y una **piel que quedó atrás**: seis superficies sin lenguaje común,
acciones triplicadas y un secreto que pide rotación. La consolidación (2→5) rinde
más hoy que la expansión (6→7).