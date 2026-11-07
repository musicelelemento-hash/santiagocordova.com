# Auditoría de botones e interfaz — SC TaxPilot PRO / Nueva Luz 3.0

**Fecha:** 06-nov-2026 · **Build auditado:** `3.1.0+20261106.1859` · **Suite:** 891 comprobaciones verdes

**Alcance:** todos los controles que dibuja la extensión, incluidos los flotantes:
HUD del bucle, cajón 🧰, panel central, isla del login, popup y Ajustes. No se audita
el portal del SRI ni la web `santiagocordova-main`.

**Método:** lectura del markup y de los handlers reales (no del diseño ideal), conteo de
glifos por archivo, y verificación de qué hace cada botón contra el rótulo que muestra.

---

## 1. Resumen ejecutivo

1. Hay **cuatro superficies** de control (HUD, panel, isla del login, popup) y **tres
   lenguajes visuales distintos** entre ellas: el HUD es oscuro slate + esmeralda, la isla
   del login es teal `#00A896` con tipografía del sistema, el panel es índigo `#6366f1`
   con `Inter`. El popup y Ajustes usan un cuarto matiz (`Manrope` + `JetBrains Mono`).
2. El producto se llama de **tres formas** en la misma sesión: `SC TaxPilot PRO`
   (manifest, popup, isla), `GHOST ASISTENTE` (panel) y `Nueva Luz 3.0` (carpeta y docs).
3. Se muestran **tres versiones distintas**: manifest `3.1.0`, Ajustes `3.1.0` escrito a
   mano, popup `v3.2.0` escrito a mano.
4. **Tres riesgos de operación reales** (§3, P0): un botón que dice "Sync" y **envía** la
   declaración al SRI; un "Borrar TODAS" sin confirmación al lado de "Guardar"; y el panel
   que se abre solo **en el centro del formulario**.
5. **El icono está roto**: los tres PNG del manifest son tres diseños distintos entre sí y
   ninguno coincide con la interfaz; los SVG coherentes que existen no se usan. Hay
   propuesta lista en §5 y archivos generados en `assets/iconos/`.

**Lo que está bien y no hay que tocar:** el HUD oscuro con una sola barra, el cajón
colapsable (la decisión que resolvió las 17 controles sueltos), el `🛑 Detener` único y
rotulado, el piso de legibilidad de 11 px, `:focus-visible` y `prefers-reduced-motion`.

---

## 2. Inventario

### 2.1 HUD del bucle — flotante, abajo a la derecha (`07_navegacion_sri.js:716-759`)

| # | Control | Glifo | Qué hace de verdad | Nota |
|---|---------|-------|--------------------|------|
| 1 | Arrastrar | `⠿` | Mueve el HUD; guarda posición | Solo mouse, no teclado |
| 2 | Play/Pausa | `▶` / `⏸` | Arranca, pausa o reanuda el lote | `aria-label` fijo: "Reanudar o pausar" |
| 3 | Modo paso | `👣` | Frena al empezar cada fase | Estado por color, sin texto |
| 4 | Estado | texto | `DETENIDO` + "cliente 3 de 47" | Sin `aria-live` |
| 5 | Declarar al logueado | `🎯` | Corre el flujo con el RUC de la sesión | Se oculta si el lote corre |
| 6 | Omitidos | `⚠️ 0` | Lista quién quedó afuera y por qué | Aparece solo si hay omitidos |
| 7 | Omitir cliente | `⏭️` | Salta al siguiente | Duplicado en el panel |
| 8 | Cerrar y enviar | `🏁` | Valida el resumen y **ENVÍA** al SRI | Sin confirmación |
| 9 | Herramientas | `🧰` | Abre el cajón | `aria-expanded`, sin `aria-controls` |
| 10 | Período | `🗓 —` | Abre el selector de mes/año | Botón de ancho variable |
| 11 | Detener | `🛑 Detener` | Parada de emergencia real | Único, correcto |

Visible en reposo: **9 botones + el asa**. El resto del HUD se mueve al cajón.

### 2.2 Cajón 🧰 — 16 herramientas en celdas de 70 px (`07_navegacion_sri.js:1362-1379`)

`Comprobantes · Registro · La cola · Bitácora · Proveedores · Notas de venta ·
Casilleros · Ir a… · Chequeo · Sincronizar · Probar claves · Extractor · Períodos ·
Probar subida · Migrar a la nube · Panel`

Cada celda es **icono + rótulo de 9-10 px**. Sin agrupación y sin `max-height`: al abrirse,
el HUD puede pasar de 44 px de alto a ~200 px y tapar el formulario.

### 2.3 Panel — flotante, centrado (`06_panel_interfaz.js:2343-2545`)

| Zona | Control | Problema |
|------|---------|----------|
| Cabecera | `⏭️ Omitir`, `✨ Sync`, `×` | `×` sin `aria-label`; los dos primeros son `div` sin `role` |
| Estado | `MODO MANUAL` / `SALIR` | Botón de 9 px |
| Datos | `🏆 VER REPORTE MAESTRO` | Oculto hasta que hay datos |
| Acción | `🔥 EJECUCIÓN MAESTRA`, `🌍 IR A FORMULARIO IVA` | Dos primarios verdes compitiendo |
| Formulario | `💰 VENTAS`, `🛒 COMPRAS`, `💎 RESUMEN`, `⚡ LLENAR TODO`, `✨ CIERRE MÁGICO` | Cinco botones, tres jerarquías distintas |
| Control | `⏭️ Next`, `🔄 Recargar` + rótulo "Pausa y parada: en el HUD ↘" | `Next` ≠ `Omitir`; `🔄` también es "Nube" y "Sincronizar" |
| Clientes | `Sincronizar`, pestañas Pendientes/Completados, `Iniciar` por cliente | — |
| Datos copiables | 8 valores con `title="Click para copiar"` | No son botones: no enfocan ni avisan |

### 2.4 Isla del login (`03_ingreso_y_sesion.js:2435-2558`)

`INICIAR BUCLE · Omitir · Login · Lista · Ocultar` + 2 selectores + `👁️` / `✏️` + minibar
`Mostrar ▾`. Es la superficie más usable de las cuatro (un solo botón principal, acciones
en pills), pero es la que tiene **otra paleta y otra tipografía**.

### 2.5 Popup (`popup.html`)

Fijos: `📥 Claves CSV · 🔄 Nube · + Clave manual · 💾 Guardar clave · 5 pestañas ·
🗓 Mes que falta · ✨ Bendecir pendientes · ⋯ menú · Ajustes`.
Por cada uno de los 47 clientes: pestaña de la lista, `👁️`, copiar, `✏️`, marcar error y
1-2 botones de acción (`Ingresar`, `Nueva Clave`, `Reintentar`, `Forzar mensual`).
Son ~250 objetivos clicables en una ventana de 380 px.

### 2.6 Ajustes (`options.html`)

`Borrar sólo ésta` ×4 · `Guardar` · `Borrar TODAS` · `Importar CSV` · `Exportar claves` ·
`Probar ahora` · checkbox de log · `🩺 Chequear antes del lote`.

---

## 3. Hallazgos priorizados

### P0 — pueden causar un daño real

**P0-1 · `✨ Sync` del panel miente y contradice al HUD.**
`06_panel_interfaz.js:2379` lo rotula `✨ Sync` con tooltip *"Marcar como COMPLETADO en
Supabase"*, pero el handler (`:2552-2555`) llama a `ejecutarCierreMagico()`: **valida el
resumen y envía la declaración al SRI**. El HUD ya corrigió el mismo botón a `🏁` con el
tooltip correcto (`07_navegacion_sri.js:730-732`). Un usuario que lea el tooltip del panel
cree que está marcando una fila en la nube y está presentando una declaración.

*Arreglo:* un solo rótulo y un solo handler. `🏁 Cerrar y enviar`, tooltip "Valida el
resumen y, si el saldo es $0, la ENVÍA al SRI", con confirmación (P0-3). Borrar el
duplicado del panel: la acción ya vive en el HUD.

**P0-2 · "Borrar TODAS" borra sin preguntar.**
`options.js:147` hace `storage.local.remove([CLAVE_IA, CLAVE_R2, CLAVE_WEB])` sin
`confirm()`, y el botón está pegado a `Guardar`, con el mismo tamaño y a un tab de
distancia. Borra las claves de R2, que **no se pueden recuperar** (Cloudflare las muestra
una sola vez): se rompe la subida de comprobantes hasta crear un token nuevo.

*Arreglo:* confirmación armada (§4.5) + separar visualmente `Guardar` de la zona de
borrado + mover los cuatro "Borrar sólo ésta" dentro de la fila de estado del campo, como
un `✕` de 24 px con tooltip, en vez de cuatro botones rojos de texto antes de cada input.

**P0-3 · Las acciones irreversibles no confirman.**
`🏁` (HUD), `✨ EFECTUAR CIERRE MÁGICO` y `🔥 EJECUCIÓN MAESTRA` (panel) pueden presentar
una declaración. Ninguno pide confirmación; además no se deshabilitan al primer clic, así
que un doble clic entra dos veces al mismo flujo.

*Arreglo:* confirmación de una sola vez por cliente/período con el resumen a la vista
("Período 2026-10 · Saldo $0,00 · 12 comprobantes · ENVIAR"), y `disabled` + spinner
mientras corre.

**P0-4 · El panel se abre solo en el centro del formulario.**
`updateContainerStyles()` (`:2081-2089`) lo posiciona `left:50%` + `translateX(-50%)`,
`top:88px`, `width:320px`, `max-height:80vh`; y `checkIfOnForm()` (`:448-450`) lo
**fuerza expandido** al detectar el formulario IVA. En una pantalla de 1366 px tapa la
columna central del formulario justo cuando el usuario tiene que revisar los casilleros.

*Arreglo:* acoplarlo al borde derecho (o izquierdo) como riel de 320 px, y que **no** se
expanda solo: que arranque plegado y muestre una pestaña de 40 px con el estado. El HUD ya
tiene todo lo urgente; el panel es para leer, no para estar abierto.

### P1 — fricción y errores de lectura

**P1-5 · Botones que son `div`.** `#btn-force-skip-panel`, `#btn-force-sync-panel`,
`#btn-minimize-pill` y `#btn-reopen-report` son `div` con `onclick`: no reciben foco, no
responden a Enter/Espacio y no existen para el lector de pantalla. Los 8 valores
"click para copiar" tampoco. En el HUD sí se usó `<button>`: la corrección es mecánica.

**P1-6 · Objetivos táctiles por debajo del mínimo.** El HUD cumple (34 px), pero el panel
usa `padding:4px 8px` + `font-size:10px` → ~22 px de alto; las acciones de tarjeta del
popup son `<span>` de 10 px → ~14 px. En una notebook con touchpad y en remoto (RDP) eso
es puntería, no interface. *Mínimo:* 28 px de alto para acciones secundarias, 34 px para
primarias.

**P1-7 · Un glifo, tres significados.** `🔄` es "Nube" en el popup, "Sincronizar claves" en
el cajón y "Recargar" en el panel. `⏭️` es "Omitir" en el HUD y "Next" en el panel.
`📥` es "Claves CSV" (popup), "Extractor" (cajón) y "EXTRAER DATOS" (panel). En total, en
los seis archivos que dibujan interfaz hay **126 glifos distintos** (≈40 en la UI visible);
un set de iconos SVG propio no es estética, es evitar que el mismo dibujo haga tres cosas.

**P1-8 · Tres nombres.** `GHOST ASISTENTE` en la cabecera del panel, `SC TaxPilot PRO` en
popup/isla/manifest, `Nueva Luz 3.0` en la carpeta y los informes. El usuario no sabe si
son tres productos. *Arreglo:* un nombre (`SC TaxPilot PRO`), un subtítulo
(`Nueva Luz 3.0`) y el mismo lockup en las cuatro superficies.

**P1-9 · `Inter` por `@import` en el panel.** `06_panel_interfaz.js:2102` inyecta
`@import url(fonts.googleapis.com)` dentro del portal del SRI: una request externa
bloqueante en cada formulario, y si falla (portal restringido, sin red) el panel cambia de
tipografía a mitad de vuelo. El resto ya usa `Manrope` + `JetBrains Mono` con `<link>`.
*Arreglo:* borrar el `@import` y usar `var(--sc-fuente)`; las fuentes ya las carga el
popup/Ajustes, y en el portal alcanza con `system-ui` de respaldo.

**P1-10 · Tres versiones.** `popup.html:531` dice `v3.2.0`, `options.html:334` dice
`v3.1.0`, el manifest `3.1.0`. *Arreglo:* pintar `chrome.runtime.getManifest().version` en
las dos y dejar de escribirla a mano.

**P1-11 · Falta el estado "trabajando".** Ningún botón del HUD se deshabilita ni muestra
progreso; el panel usa `setWorking()` pero el HUD no lo lee. El estado global solo se ve en
`#slh-estado`. *Arreglo:* mientras `estado === 'CORRIENDO'`, apagar `🏁`, `⏭️` y las
herramientas destructivas y mostrar el spinner en `#slh-detalle`.

### P2 — pulido

| # | Hallazgo | Arreglo |
|---|----------|---------|
| P2-12 | El cajón crece sin scroll (16 celdas) | `max-height:46vh; overflow:auto`, agrupado en 3 bloques: *Lote*, *Datos*, *Diagnóstico* |
| P2-13 | `🗓 —` cambia de ancho según el mes | Ancho fijo `min-width:64px` y el mes en `JetBrains Mono` |
| P2-14 | 9 colores de acento compitiendo (esmeralda, índigo, ámbar, rosa, violeta, celeste, teal, slate, rojo) | 5 roles: neutro, activo, atención, peligro, hecho (§4.2) |
| P2-15 | `#slh-estado` cambia sin `aria-live` | `role="status" aria-live="polite"` en el bloque de estado |
| P2-16 | El asa `⠿` no se puede usar con teclado | Flechas con el HUD enfocado, o botones "mover a la izquierda/derecha" en el cajón |
| P2-17 | `aria-expanded` sin `aria-controls` en 🧰 | `aria-controls="slh-cajon"` |
| P2-18 | El popup no dice cuántos van ni cuántos faltan arriba | Un contador `12/47` fijo en la cabecera, junto a "Nube" |

---

## 4. Sistema propuesto (para que no vuelva a divergir)

### 4.1 Escala de botones — 3 tamaños, 4 variantes

| Tamaño | Alto | Uso | Tipografía |
|--------|------|-----|------------|
| `sm` | 28 px | acciones dentro de tarjetas, cajón | 11 px / 700 |
| `md` | 34 px | HUD, barras de acción | 12 px / 800 |
| `lg` | 44 px | acción principal del panel (una sola por vista) | 13 px / 800 |

Variantes: `primario` (esmeralda sólido), `secundario` (translúcido con borde),
`fantasma` (sin fondo, para "volver"/"cerrar"), `peligro` (rojo translúcido).
**Regla:** una sola variante `primario` visible por superficie. Hoy el panel tiene dos
verdes y tres violetas compitiendo.

### 4.2 Color por rol, no por gusto

- **Neutro** `#cbd5e1` sobre `rgba(148,163,184,.16)` — todo lo que no urge.
- **Activo** `#7dd3fc` — navegación y foco.
- **Atención** `#fbbf24` — omitir, período, advertencias (no destructivo).
- **Peligro** `#f87171` — detener, borrar. Solo estos dos verbos.
- **Hecho** `#4edea3` — cerrar y enviar, chequeo aprobado.

Se eliminan violeta, teal `#00A896`, rosa y `#818cf8` como colores de botón. El teal de la
isla se reemplaza por `#4edea3` para que el login y el HUD sean el mismo producto.

### 4.3 Iconografía: un set SVG propio, no emoji

Los emoji cambian de forma según el sistema operativo (Windows 11 dibuja otros que Windows
10), no se pueden colorear ni alinear al texto, y ya están colisionando. Mínimo viable:
**12 iconos** en `assets/iconos/ui/*.svg` (24×24, `stroke:currentColor`), que cubren el 90 %
del uso real: `play`, `pause`, `step`, `target`, `skip`, `stop`, `check`, `tools`,
`calendar`, `warning`, `download`, `panel`.

Mapeo directo para no perder ninguna función:

| Hoy | Nuevo |
|-----|-------|
| `▶` / `⏸` | `play` / `pause` |
| `👣` | `step` |
| `🎯` | `target` |
| `⏭️` | `skip` (mismo icono en HUD y panel, rótulo "Omitir" en los dos) |
| `🏁` / `✨ Sync` | `check` + texto "Cerrar y enviar" |
| `🛑` | `stop` + texto "Detener" |
| `🧰` | `tools` |
| `🗓` | `calendar` |
| `🔄` | `sync` (solo claves) / `refresh` (solo recargar) |
| `⚠️` | `warning` |
| `📥` | `download` (solo comprobantes) |

Mientras no exista el set, la regla barata es: **un glifo = un verbo**, y los rótulos con
verbo explícito (`Omitir`, `Detener`, `Enviar`) en toda acción irreversible.

### 4.4 Copy: verbo + objeto, sin sinónimos

- `Omitir` (no `Next`, no `Saltar`).
- `Cerrar y enviar` (no `Sync`, no `Cierre mágico`, no `Completar`).
- `Sincronizar claves` (no `Nube`, no `Sincronizar` a secas).
- `Recargar` (no `Actualizar`, no `Refrescar`).
- `Detener` (no `Parar`, no `Cancelar`).

### 4.5 Confirmaciones que no usan `confirm()`

Patrón de dos pasos en el mismo botón, sin diálogo del navegador (que el portal puede
bloquear y que no se puede estilar):

```
[ 🏁 Cerrar y enviar ]  → clic →  [ ¿Enviar 2026-10 · saldo $0,00?  Sí, enviar ]  [ Cancelar ]
                                    (se desarma solo a los 6 s)
```

Aplica a: borrar todas las claves, migrar a la nube. **No** aplica a `Detener`: la parada
de emergencia tiene que ser inmediata, y así está bien hoy.

**`🏁 Cerrar y enviar` quedó SIN confirmación** (decisión del 06-nov-2026). El 05-sep un
`confirm()` en este mismo flujo se disparó solo —algo pulsaba el botón en bucle— y frenó la
corrida entera hasta que alguien contestó el cuadro. En un lote desatendido un diálogo
modal es una parada, no una protección. Lo que protege de verdad son las cuatro
validaciones del cierre: resumen real, saldo leído en cero, mensajes del SRI limpios y
declaración no sustitutiva. Lo que sí se agregó es el bloqueo anti-doble-clic: el botón se
deshabilita 4 s y marca `aria-busy` mientras envía.

### 4.6 Layout

- **HUD**: abajo a la derecha, 44 px de alto, 9 controles. No crece al abrir herramientas
  (el cajón va con `max-height` y scroll, o como panel flotante encima del HUD).
- **Panel**: riel lateral derecho de 320 px, plegado por defecto, se abre desde 🗔. Nunca
  centrado sobre el formulario.
- **Popup**: cabecera fija con `12/47` y el período; lista con scroll; acciones de tarjeta
  en un menú `⋯` para que cada cliente ocupe una fila y no cinco.
- **Isla del login**: se queda como está de estructura; solo se le cambia la paleta y la
  fuente a las del resto.

---

## 5. El icono

### 5.1 Diagnóstico

| Archivo | Qué es | Problema |
|---------|--------|----------|
| `icon16.png` | cuadrado azul con "A\|" | Otro producto |
| `icon48.png` | trazo negro "C2" sobre transparente | Ilegible en barra oscura |
| `icon128.png` | llama naranja/amarilla | Es de otra marca |
| `icon16/48/128.svg` | púrpura `#667eea→#764ba2` con `$` | Coherente entre sí, **no se usa en el manifest**, y no coincide con la UI |

Chrome muestra `16` en la barra de herramientas, `48` en `chrome://extensions` y `128` en la
tienda. Hoy el usuario ve **tres marcas distintas** en tres lugares. Ninguna es la de la
extensión.

### 5.2 Propuesta: "sello"

- **Fondo:** cuadrado redondeado (`rx 28/128`), degradado `#0F2438 → #061320` (el mismo
  slate del HUD), borde blanco al 10 % y brillo superior al 16 % — el mismo recurso de la
  isla y del panel.
- **Marca:** un check con degradado `#10B981 → #5EEAD4`, trazo redondeado. Es el único
  glifo que se lee a 16 px y dice exactamente lo que hace la extensión: *declaración al día*.
- **Trazo óptico por tamaño:** 17 u a 16 px, 11 u a 32, 8.5 u a 48, 13 u a 128. Un icono
  vectorial escalado a la baja queda flaco; por eso el trazo no escala linealmente.
- **Por qué no un documento, una "S" o un "$":** a 16 px se convierten en una mancha. El
  check es el único que sobrevive. La "S"/"$" ya se probó en los SVG púrpura y no se usó.

**Archivos generados** (listos para copiar al manifest):

```
assets/iconos/icono-propuesto.svg       ← fuente 128
assets/iconos/icono-propuesto-16.png    ← barra de herramientas
assets/iconos/icono-propuesto-32.png    ← HiDPI
assets/iconos/icono-propuesto-48.png    ← chrome://extensions
assets/iconos/icono-propuesto-128.png   ← tienda / ficha
assets/iconos/generar-iconos.cjs        ← regenera todo
```

### 5.3 Cómo aplicarlo (cuando lo apruebes)

1. Copiar `icono-propuesto-16.png` → `icon16.png` (y 32/48/128 con sus nombres).
2. `manifest.json`: agregar `"32"` a `icons` y a `action.default_icon`.
3. Usar el mismo mark a 20 px en la cabecera del popup (hoy `⚡`), en la isla (hoy `⚡`) y
   en la cabecera del panel (hoy `👻`). Ahí se termina de entender que es un solo producto.
4. Borrar los `icon16/48/128.svg` púrpura o moverlos a `assets/iconos/descartados/`.

Riesgo: nulo para la suite (son assets). Verificación: recargar la extensión y mirar la
barra, `chrome://extensions` y el popup.

---

## 6. Plan de tandas

| Tanda | Qué | Archivos | Riesgo | Por qué en ese orden |
|-------|-----|----------|--------|----------------------|
| **A** | Iconos + versión dinámica + borrar `@import` de Inter | `manifest.json`, `assets/iconos/*`, `popup.html`, `options.html`, `06_panel_interfaz.js:2102` | Bajo | Cambio visible, cero lógica |
| **B** | P0-1: unificar `✨ Sync` → `🏁 Cerrar y enviar`; sacar el duplicado del panel | `06_panel_interfaz.js:2378-2380, 2550-2562` | Medio | Es el error que puede enviar una declaración |
| **C** | P0-2 + P1-6: confirmación armada, borrado por campo dentro de la fila de estado | `options.html`, `options.js:120-160, 468-496` | Medio | Protege claves irrecuperables |
| **D** | P0-4: panel como riel derecho, plegado por defecto | `06_panel_interfaz.js:2048-2091, 448-451` | Medio | Recupera el centro del formulario |
| **E** | P1-5 + P1-11: `div` → `<button>`, `disabled` + spinner en HUD | `06_panel_interfaz.js`, `07_navegacion_sri.js` | Bajo | Accesibilidad y doble clic |
| **F** | Set de 12 iconos SVG + reemplazo de glifos + agrupación del cajón | `01_utilidades_y_pdf.js`, `07_navegacion_sri.js` | Medio | Es el cambio más grande; va último |

Cada tanda cierra con `npm run check` (891) y una prueba manual de 2 clientes en modo 👣.

---

## 7. Verificación manual (después de cada tanda)

1. Recargar la extensión. La barra de herramientas muestra **el mismo** icono que
   `chrome://extensions`.
2. Abrir el popup: versión igual al manifest; `12/47` visible.
3. En el portal, login: isla con paleta nueva, `INICIAR BUCLE` sigue funcionando.
4. En el formulario IVA: el panel **no** tapa el centro; se abre desde 🗔.
5. `🏁` valida y envía; se deshabilita 4 s mientras envía (no pregunta, a propósito).
6. Un solo `⏭️ Omitir` por superficie.
7. Ajustes: `Borrar TODAS` pide confirmación; cada campo se borra desde su fila de estado.
8. Teclado: Tab recorre todos los botones del panel; `:focus-visible` se ve.
9. Lote de 2 clientes en 👣 de punta a punta, con PDF y sincronización.

---

## 8. Estado de aplicación — 06-nov-2026

Se aplicaron las tandas A→E completas y una F recortada (F-lite). Build
`3.1.0+20261106.2117`, suite en **893 comprobaciones verdes**.

| Tanda | Qué quedó aplicado | Pendiente |
|-------|--------------------|-----------|
| **A** | `icon16/32/48/128.png` son el sello; manifest declara 32 en `icons` y en `action.default_icon`; marca SVG en línea (`scMarcaHtml()`) en cabecera del panel, isla del login y botón «Iniciar bucle»; `icon32.png` en la cabecera del popup; versión del popup leída del manifest (ya no dice `v3.2.0`). | Borrar los `icon16/48/128.svg` púrpura viejos. |
| **B** | Fuera `✨ Sync` de la cabecera: decía «marcar como COMPLETADO en Supabase» y llamaba a `ejecutarCierreMagico()`, que **envía**. Ahora hay un solo `🏁 Cerrar y enviar` con subtítulo «Valida el resumen y, si el saldo es $0, la envía al SRI». | — |
| **C** | Los cuatro borrados de Ajustes son un `✕` de 34 px dentro de la fila de estado del campo; «Borrar todas…» arma y confirma en 6 s (clase `.confirmando`). Banco `tests/claves.html` actualizado y con dos comprobaciones nuevas. | — |
| **D** | Panel como riel derecho (`right:18px; top:88px; bottom:88px; width:330px`, scroll propio), plegado por defecto, pestaña `.sc-pestana` de 44 px. `checkIfOnForm()` ya no lo expande solo. Clave de persistencia cambiada a `assistantAbierto` para descartar el `true` viejo. | — |
| **E** | `div` → `<button>` en cabecera y reporte; `bindBtn` con `try/finally` (antes quedaba muerto si la acción fallaba); `🏁` del HUD bloqueado 4 s + `aria-busy`; `aria-label` del play dinámico; `aria-live` en el estado; `aria-controls` en 🧰. | — |
| **F-lite** | Cajón con `max-height:min(52vh,360px)`, scroll y tres grupos (Datos / Portal / Sistema) en 4 columnas; `@import` de Google Fonts eliminado; `Inter` → Manrope en panel e isla; paleta del login al esmeralda del sello. | Reemplazar los glifos restantes por el set SVG de 12 iconos. |

Decisiones que se tomaron al aplicar y conviene no revertir sin leer esto:

- **Sin `confirm()` en el envío** (§4.5). Un modal en un lote desatendido es una parada.
- **No se partió la lista de 47 del popup en menú `⋯`**: `popup.js` tiene 78 KB y el
  beneficio no compensa el riesgo antes de un lote mensual.
- **`ScVault` sigue guardando las claves SRI en texto plano**: es la deuda más grande que
  queda, y va en su propia tanda con migración, no colgada de un cambio de diseño.
