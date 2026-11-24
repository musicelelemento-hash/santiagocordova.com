# Informe de capas flotantes — Nueva Luz 3.0

**Fecha:** 07-nov-2026 · **Build auditado:** `3.1.0+20261107.1300` · **Suite:** 909 verdes

**Alcance:** sólo lo que **flota sobre el portal del SRI**. No audita el portal, ni el popup, ni
Ajustes, ni la web `santiagocordova-main`. Es el complemento de `AUDITORIA_INTERFAZ_2026-11.md`
(que cubre botones y superficies completas): acá se mira **la capa flotante como sistema** —
quién va encima de quién, dónde se ancla, cuánto ocupa y qué pasa cuando se cruzan.

**Método:** lectura del código que construye cada capa, más la corrida real del 07-nov-2026
(clientes 3→6) que quedó en consola. Donde un número es estimación, se dice.

> **Avance al 24-nov-2026 (v3.7.16, suite 1008 verdes, banco nuevo `tests/capas.html`):**
> - **G hecha**: escala única `SC_Z` en `01` (hud < riel < toast < modal < crítico) y variables
>   `--sc-z-*` en `:root`. Se dejaron valores altos (desde `2147483000`) en vez de 1000–1400: el portal
>   del SRI apila sus diálogos de PrimeFaces desde 1000 y no queremos quedar debajo. El banco revisa que
>   el bundle no tenga ningún `z-index` literal de 3+ cifras. «Descongelar» comparaba `zIndex` como
>   texto (`>= '999999'`); ahora compara número contra `SC_Z.modal`.
> - **H revisada, no aplicada**: el `showEliteToast` global de `07` no es un duplicado del aviso: es la
>   tarjeta de resultado de la extracción (facturas, retenciones, botón «Ir a declaración»). Se dejó,
>   sólo entra en la capa `toast`.
> - **I hecha**: `renderPillLegacy()` borrada con `#btn-force-sync`, `#btn-pill-skip` y `#btn-force-scan`.
> - **J hecha**: Detener ya no tiene rama con `confirm()`; Omitir pide un segundo toque dentro de 5 s y
>   sobre el mismo cliente (aviso en toast), sin diálogo del navegador.
> - **F4 hecha**: el contador ⚠️ dice `99+` desde 100 (número real en `title`/`aria-label`). Además
>   tenía un bug: al actualizarse pisaba el botón con `textContent` y borraba el ícono SVG.
> - **Pendiente**: K (HUD `nowrap`, cajón popover, riel con `--sc-hud-alto`) y L (carril de avisos,
>   isla con ellipsis). Son de riesgo medio y conviene verlas en el portal real antes de publicar.

---

## 1 · Inventario medido

| # | Superficie | Id / clase | Anclaje | Tamaño | `z-index` | Aparece cuando | Se cierra |
|---|---|---|---|---|---|---|---|
| 1 | Isla del login | `#sri-dynamic-island` | `top:12px` centrada | alto ~44 px, ancho variable, `max-width:98vw` | `2147483647` | Sesión sin abrir | Se oculta sola |
| 2 | Minibar | `#sri-island-minibar` | `top:12px` centrada | alto ~30 px | `2147483647` | Isla minimizada | Clic |
| 3 | HUD del lote | `#sri-loop-hud` | `right:18px; bottom:18px` | 9 controles, `flex-wrap`, alto 1–2 filas | `2147483646` | Web interactuada | No se cierra |
| 4 | Cajón 🧰 | `#slh-cajon` | dentro del HUD | `max-height:min(52vh,360px)`, scroll | hereda | Clic en 🧰 | Clic en 🧰 |
| 5 | Panel (riel) | `#sri-assistant-panel-root` | `right:18px; top:88px; bottom:88px` | `330px` | `999999` | Clic en 🗔 o pestaña | Se pliega a pestaña |
| 6 | Pestaña del panel | `.sc-pestana` | `right:18px`, centrada vertical | `44×116` | `999999` | Panel plegado | Clic |
| 7 | Toast | `#sri-main-toast` | `top:25px; right:25px` | `320px` | `2000000` | Cualquier aviso | 5 s o 1 solo a la vez |
| 8 | Toast 2 (global) | `#sri-elite-toast` | `top:…` centrado | variable | ver §3 F1 | Rutas que llaman a la global | 5 s |
| 9 | Modal de notas | `#slh-nv-*` | overlay `inset:0` | caja centrada | `99999999` | Cliente con 📒 encendido | Guardar / Esc |
| 10 | Barras de error | barra roja | `top:12px; right:20px` | variable | `2147483647` | Clave vencida / bloqueo | Clic |
| 11 | Saludo / tarjeta contextual | `#sc-saludo`, `.elite-context-card` | `top:20px; right:20px` | `320px` | `999999` | Primera carga | Solo |

**Total: 11 capas flotantes**, con **7 valores de `z-index` distintos** y ningún orden declarado.

---

## 2 · El problema central: siete números mágicos sin jerarquía

Hoy cada capa eligió su `z-index` por su cuenta. Eso produce cruces que no deberían existir:

| Cruce | Qué pasa | Dónde |
|---|---|---|
| **Isla/HUD sobre el modal de notas** | Isla `2147483647` y HUD `2147483646` están **por encima** del modal (`99999999`). Al pedir el importe de una nota de venta, el HUD flota encima del fondo oscurecido y sigue clickeable. | `07:703`, `03:2444`, `07:2311` |
| **Toast sobre el panel** | Toast `2000000` > panel `999999`: un aviso tapa la cabecera del riel. | `06:1058`, `06:2160` |
| **Dos toasts** | `showEliteToast` existe dos veces: método de clase (`06:1040`, `#sri-main-toast`, índigo) y función global (`07:4818`, `#sri-elite-toast`). Según quién llame, el mismo aviso sale en otra esquina y con otro color. | `06:1040`, `07:4818` |
| **Barra de error vs. isla** | Ambas `top:12px`, una centrada y otra a `right:20px`. En una ventana angosta se tocan. | `01:1338`, `03:2444` |

**Propuesta: una escala de 5 capas, declarada una sola vez en `:root`.**

```css
--sc-z-base:0;        /* nada flota */
--sc-z-hud:1000;      /* HUD, isla, minibar, barras de error */
--sc-z-riel:1100;     /* panel + pestaña */
--sc-z-toast:1200;    /* avisos */
--sc-z-modal:1300;    /* overlay + caja, SIEMPRE por encima de lo anterior */
--sc-z-critico:1400;  /* sólo la parada de emergencia, si alguna vez la necesita */
```

Regla de aceptación: **ninguna capa escribe un número**. Si aparece un `z-index` literal en un
`cssText`, el PR se rechaza. Es la misma disciplina que ya se aplicó a las fuentes con `--sc-fuente`.

---

## 3 · Hallazgos

### P0

**F1 · El toast está duplicado y no comparte estilo.**
`06:1040` dibuja `#sri-main-toast` (índigo `#6366f1`, `top:25 right:25`, 320 px) y `07:4818`
dibuja `#sri-elite-toast`. Ambos se llaman `showEliteToast`. El usuario ve dos lenguajes para
el mismo mensaje según la ruta que lo dispare, y **nada garantiza que el aviso salga una sola
vez**: son dos nodos distintos.

*Arreglo:* dejar una única implementación en `06` (la del método, que ya respeta
`prefers-reduced-motion`) y que la global de `07` delegue en `window.sriAssistant.showEliteToast`.
Un solo id (`#sc-toast`), una cola: si llega un aviso mientras hay otro, se reemplaza el texto y
se reinicia el timer, no se crea otro nodo.

**F2 · `renderPillLegacy()` sigue vivo y resucita el bug de «Sync que envía».**
`06:2379-2416` conserva la píldora vieja con `✨ Sync` cableado a `ejecutarCierreMagico()`.
Hoy no tiene llamadas, pero es exactamente el defecto P0-1 que el informe anterior dio por
cerrado: si alguien la invoca desde una ruta nueva, vuelve a presentar una declaración con un
rótulo que dice otra cosa.

*Arreglo:* borrar el método (y `#btn-pill-skip`, `#btn-force-scan`, `#btn-force-sync` con él).
Verificación: `grep -n "renderPillLegacy"` vacío y `renderPill()` como único camino plegado.

**F3 · La parada de emergencia pregunta con `confirm()`.**
`07:4617`: `if (requireConfirm && !confirm('¿Desea detener la automatización?'))`. Un `confirm()`
en el botón 🛑 es un modal del navegador en medio de un lote desatendido — la lección que el
propio proyecto documentó el 05-sep (`07:975`, `03:2664`, `04:989`). Además, si algo está
pulsando el botón en bucle, el diálogo se reabre.

*Arreglo:* `Detener` no pregunta nunca (así está en el HUD) y `requireConfirm` desaparece de esa
rama. Si hace falta fricción, va en el cajón como segundo paso visual, no como diálogo del SO.

### P1

**F4 · El HUD se desborda con un contador de tres dígitos.**
En la corrida de esta mañana el badge de omitidos mostraba `⚠️ 112`. Con `min-width:34px`,
`font-size:13px` y `flex-wrap:wrap`, ese solo botón mide ~52 px más y empuja la fila a una
segunda línea, que crece **hacia arriba** (está anclado con `bottom:18px`) y tapa el pie del
formulario. `07:707` prevé el wrap como solución de pantalla angosta, pero el wrap aquí es el
problema, no la solución.

*Arreglo:* ancho fijo de 40 px para el badge y `99+` a partir de 100; y `flex-wrap:nowrap` con
`overflow-x:auto` sólo por debajo de 900 px. El HUD nunca debe tener dos filas.

**F5 · El panel y el HUD no se hablan.**
El riel va de `top:88px` a `bottom:88px` (`06:2170-2178`) — deja 88 px abajo para el HUD. Con una
fila alcanza (el HUD ocupa de 18 a ~62 px). Con **dos filas** el HUD mide ~88 px y, anclado a
18 px, llega hasta ~106 px: el riel, que termina a 88 px, queda **debajo del HUD entre 18 y 36 px**.
Y cuando el cajón está abierto (`min(52vh,360px)`), el HUD mide ~400 px y el riel queda tapado casi
por completo.

*Arreglo:* que el riel reserve la altura real del HUD (`bottom: calc(72px + var(--sc-hud-alto,44px))`,
con `--sc-hud-alto` escrito por el HUD al montar) y que abrir el cajón **no** cambie esa variable
(el cajón es un popover, ver F6).

**F6 · El cajón empuja el layout en vez de flotar.**
`#slh-cajon` es hijo del HUD con `flex-basis:100%`: al abrirse, el HUD pasa de 44 px a ~360 px y
todo lo demás se reacomoda. La auditoría anterior ya lo había señalado como «el cajón crece sin
scroll»; el scroll se agregó, el crecimiento no se resolvió.

*Arreglo:* el cajón pasa a `position:absolute; bottom:calc(100% + 8px); right:0; width:340px`
—un popover por encima del HUD— con `border-radius:14px`, sombra y `z-index` de la capa HUD. El
HUD mantiene siempre 44 px de alto. Ganancia medible: el HUD deja de tapar el formulario y el
riel ya no tiene que adivinar alturas.

**F7 · La isla se vuelve scroll horizontal.**
`03:2444` usa `max-width:98vw; overflow-x:auto; scrollbar-width:none`. En 1280 px con el nombre
largo, la isla se corta y se arrastra sin indicador visible (la barra está oculta). No hay pista
de que hay más contenido.

*Arreglo:* truncar el nombre con `text-overflow:ellipsis` (`max-width:38ch`) y mover el resto al
`title`/`aria-label`; el overflow horizontal sólo en el grupo de acciones, nunca en toda la isla.

**F8 · La pestaña del panel compite con el HUD y con el borde.**
`.sc-pestana` mide `44×116` y va centrada vertical a `right:18px`. El HUD está abajo a la derecha;
la pestaña, a media altura. Dos controles en el mismo borde, a 18 px, de dos colores distintos
(uno translúcido, la pestaña opaca): el ojo lee dos productos.

*Arreglo:* la pestaña baja al mismo carril del HUD (`bottom:72px; right:18px`, `44×44`, sólo
icono) y desaparece mientras el HUD esté montado (el HUD ya tiene 🗔). Queda sólo en páginas sin
HUD —que es el caso que la justificó (`06:2362`)—.

### P2

**F9 · El `focus-visible` no cubre la pestaña ni el modal.** Los selectores de `01:255-257`
listan `#sri-assistant-panel-root`, pero la pestaña vive **dentro** de ese contenedor, así que sí
hereda. El modal de notas (`07:2311`) no está en la lista: sus botones no muestran foco con
teclado. *Arreglo:* sumar `.sc-modal` a la lista.

**F10 · El saludo y la tarjeta contextual caen en el mismo sitio que el toast.**
`06:2112` (`top:20px; right:20px`) y `06:1040` (`top:25px; right:25px`): conviven 5 px corridos,
se superponen. *Arreglo:* un solo «carril de avisos» en la esquina superior derecha, con cola:
lo que llegue espera 300 ms y se apila hacia abajo con 8 px.

---

## 4 · Sistema propuesto

### 4.1 Reglas duras (las que se pueden verificar con grep)

1. Un solo `z-index` por capa, declarado una vez en `:root`.
2. Un solo toast (`#sc-toast`), con cola.
3. El HUD nunca tiene dos filas; el cajón nunca cambia su alto.
4. Ningún `confirm()` en acciones del bucle (Detener, Omitir, Enviar).
5. Ningún aviso modal mientras `estado === 'CORRIENDO'`: los avisos son toasts, no diálogos.

### 4.2 Tokens que faltan

| Token | Valor | Reemplaza |
|---|---|---|
| `--sc-z-hud / riel / toast / modal` | 1000 / 1100 / 1200 / 1300 | 7 números mágicos |
| `--sc-hud-alto` | 44px (escrito por el HUD) | el `88px` a ojo del riel |
| `--sc-lane-x` | 18px | `18 / 20 / 25` mezclados |
| `--sc-motion-fast / base` | 120ms / 220ms | `.15s`, `.25s`, `.28s`, `.3s`, `.4s`, `.5s` |
| `--sc-toast-ancho` | 320px | `320` repetido en 3 lugares |

### 4.3 Movimiento

Hoy hay **seis duraciones** distintas (0,15 / 0,22 / 0,25 / 0,28 / 0,3 / 0,4 / 0,5 s) y tres
curvas. Propuesta: dos duraciones (`fast` para hover, `base` para aparición) y una curva
`cubic-bezier(.22,1,.36,1)`. El latido del HUD (1 Hz) se mantiene, pero sólo si
`document.visibilityState === 'visible'` — hoy late igual con la pestaña en segundo plano.

---

## 5 · Tandas

| Tanda | Contenido | Riesgo | Criterio de aceptación |
|---|---|---|---|
| **G** | Escala de `z-index` en `:root` + reemplazo de los 7 valores; modal por encima de HUD e isla | Bajo | Abrir el modal de notas con el lote corriendo: el HUD no se ve encima |
| **H** | Un solo toast con cola; borrar `#sri-elite-toast` | Bajo | Un aviso a la vez, mismo lugar, mismo estilo desde cualquier ruta |
| **I** | Borrar `renderPillLegacy()` | Bajo | `grep renderPillLegacy` vacío; 909 verdes |
| **J** | Detener sin `confirm()`; sacar `confirm()` de Omitir | Bajo | 🛑 responde en < 200 ms con el lote corriendo |
| **K** | HUD `nowrap` + badge `99+` + cajón popover + riel reservando `--sc-hud-alto` | Medio | A 1366×768, HUD 1 fila, cajón abierto y el formulario del SRI visible detrás |
| **L** | Carril de avisos (saludo/tarjeta/toast) + isla con ellipsis | Bajo | Nada se superpone en la esquina superior derecha |

Orden recomendado: **G → H → I → J** (todas baratas y sin tocar lógica del bucle) y después
**K → L**. La F (iconos SVG) sigue pendiente del informe anterior y no se mezcla con esto.

---

## 6 · Cómo probarlo (checklist de 10 pasos)

1. Recargar la extensión en `chrome://extensions` y abrir el portal.
2. **Login**: la isla entra sin scroll horizontal con el nombre más largo de la cartera.
3. **Formulario IVA**: el panel arranca plegado; la pestaña no tapa ningún casillero.
4. Abrir 🧰: el HUD **no** cambia de alto y el formulario sigue visible.
5. Correr un cliente con muchas omisiones y ver el badge: con 112 debe decir `99+` y no romper
   la fila.
6. Mientras corre, pulsar 🛑: debe detenerse **sin** diálogo del navegador.
7. Encender 📒 y llegar a una nota de venta: el modal debe quedar **encima** del HUD.
8. Disparar dos avisos seguidos: mismo lugar, uno reemplaza al otro, sin dos cajas.
9. Pestaña en segundo plano durante 2 min: sin latidos de CPU en el HUD.
10. Redimensionar a 1280×720: HUD en una fila, isla con ellipsis, nada superpuesto.

---

## 7 · Lo que no tocaría

- El **HUD de una sola barra**: es la decisión que resolvió los 17 controles sueltos.
- El **cajón agrupado en 3 bloques**: la agrupación funciona; lo que falla es que empuja layout.
- **`prefers-reduced-motion` global**: ya está bien resuelto.
- **La pestaña como concepto**: el problema es su posición, no su existencia.
