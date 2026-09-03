# Handoff para Claude Code — Imprenta Córdova

**Qué es esto.** Las cuatro pantallas nuevas de este proyecto de diseño ya están resueltas visualmente. Este documento las traduce a tareas sobre el repositorio `musicelelemento-hash/ImprentaCordova` (rama `main`, raíz `ImprentaCordova/`), en orden, con criterios de aceptación. No hay que inventar nada: cada tarea apunta a un archivo que ya existe.

**Antes de escribir código, leer:** `design_manifest.md`, `MASTER_PROTOCOL_CORDOVA.md`, `CONTINUITY_RULES.md`, `AI_INSTRUCTIONS.md`. Si algo de aquí los contradice, **ellos ganan** y hay que avisar de la contradicción.

## Archivos de diseño de referencia

| Archivo | Qué contiene |
|---|---|
| `Informe-Faltantes.dc.html` | Auditoría: 9 pantallas sin diseño o fuera del tema, 10 hallazgos con archivo citado, plan en 4 fases. |
| `Ingreso.dc.html` | Ingreso al panel, escritorio + celular, tema claro, marca vectorial. |
| `Nueva-Orden-Unificada.dc.html` | Flujo único de 4 pasos con el formulario del SRI dentro del paso 2. |
| `Nueva-Orden-Movil.dc.html` | El mismo flujo en 390 px: 3 pasos, pie fijo, medidas táctiles. |
| `Pantallas-Faltantes.dc.html` | Buscador global, menú de sesión, estados vacíos, errores, avisos y barras claras de documento. |

Son prototipos HTML con un runtime propio (`<x-dc>`, `{{ }}`, `<sc-for>`, `<sc-if>`). **No portar ese runtime.** Equivalencias: `<sc-for>` → `.map()`, `<sc-if>` → render condicional, `renderVals()` → cuerpo del componente React.

## Reglas que no se negocian

1. **Tema claro.** Fondo `C.bg #F7F9FF`, superficies `C.surface #FFFFFF`. Máximo dos fondos por pantalla. `C.ink #0A1140` solo en: sidebar, cinta del formulario SRI, cabecera del cajón de detalle y tarjetas de acento puntuales.
2. **Ningún hex literal.** Todo valor sale de `components/panelTheme.ts` (`C.*`, `S.*`, `estadoCfg()`, `estadoPill()`, `dot()`, `MONO`, `DISPLAY`). Si falta un token, se agrega **ahí** y se documenta en `design_manifest.md` §2.
3. **El oro nunca es acción.** Acción primaria = `C.royal #16309B`. El oro es KPI, punto de estado, badge y el "Nueva Orden" del sidebar.
4. **Todo en español de Ecuador**, fechas y montos con `es-EC`.
5. **Radios:** 6–8 etiquetas · 9–11 botones e inputs · 12–16 tarjetas · 99 solo píldoras, puntos y avatares.
6. **Íconos:** `components/Icons.tsx`. No crear un set nuevo, no dibujar SVG a mano.
7. **Los documentos impresos no se tocan:** `NotaDeVenta`, `ReciboAbono`, `OrdenProduccion`, `SolicitudImpresion`, `ReciboEpson` siguen en papel blanco puro. Solo cambia la barra de pantalla alrededor.
8. **`useOrder.ts`, `DataContext.tsx` y la captura de `tempClient`** (cédula, teléfono, nombre) no se simplifican ni se eliminan.

---

## Fase 1 — Primitivas de UI (desbloquea todo lo demás)

**Archivos:** `components/ui/Button.tsx`, `Card.tsx`, `Input.tsx`, `Modal.tsx`, `Badge.tsx`.

Hoy usan `bg-obsidian-card`, `liquid-gold`, `shadow-gold-glow`, `text-slate-200`. Reescribir con los patrones del manifiesto §2.5 / §2.6:

- `Button` variantes: `primary` (`C.royal`, texto `#fff`, radio 10, padding 11×18, 13px/600, hover `C.royalHover`) · `outline` (`#fff`, texto `C.royal`, borde `C.borderStrong`, hover borde `C.royal`) · `soft` (`C.softGray`, texto `C.royal`, radio 9) · `gold` (solo marca) · `success` (`C.success`) · `danger` (texto `C.dangerText` sobre `C.dangerBg`). **Quitar** degradados, `uppercase`, `tracking-[0.15em]` y los halos.
- `Card`: `background C.surface`, `border 1px C.border`, radio 14–16. `interactive` añade `box-shadow:0 14px 28px -20px rgba(10,17,64,.4)` en hover.
- `Input`: fondo `C.bg`, borde `C.borderStrong`, radio 10, padding 12×14, 13.5px; foco borde `C.royal`. Campo monetario/sensible: fondo `C.goldBg`, borde `C.goldBorder`, texto `MONO`.
- `Modal`: overlay `C.scrim` + `backdrop-filter:blur`, contenedor `#fff` + borde `C.border` + radio 16.
- `Badge`: usar `estadoPill(estadoCfg(estado))`; eliminar las variantes `count` / `gold` doradas.

**Criterio de aceptación:** `grep -r "obsidian\|liquid-gold\|gold-glow\|champagne" components/ui/` no devuelve nada. Y `tailwind.config.js` pierde esos tokens (fase 2 los remata).

---

## Fase 2 — Ingreso (`pages/Login.tsx`)

Referencia: `Ingreso.dc.html`.

1. **Fuera la franja marino del 44%.** El layout pasa a una tarjeta blanca centrada sobre `C.bg`, en dos columnas: formulario (izquierda) y contexto del taller sobre `C.surfaceAlt` (derecha, `border-left 1px C.divider`). En `< 900px` la columna derecha desaparece y la marca sube al tope.
2. **Marca vectorial.** Reemplazar `<img src="/LOGO.png">` por el lockup SVG: arco `d="M29.1 10A14 14 0 1 0 29.1 24"`, `stroke-width 6.2`, `linecap round`, `viewBox 0 0 34 34`; la "I" `#E70101` contorneada `#FFC61A` con `stroke-width 1.7`. Sobre marino la C va blanca. Exportar además `logo.svg` y `favicon.ico` (pendiente #4 del handoff original).
3. **Personal del taller.** Lista de usuarios activos (de `AuthContext` / `usuarios`) como botones que llenan el campo. Es el atajo real del mostrador: nadie escribe su nombre 15 veces al día.
4. **Bloque de ayuda de acceso** con el teléfono del administrador, y enlace a la nueva vista de recuperación (fase 5).
5. Estados del botón: deshabilitado (`C.softGray` / `C.faint`), verificando (spinner `spin`), éxito (`C.success`). Error en `C.dangerBg` / `C.dangerBorder` / `C.dangerText`, con el nombre escrito entre comillas.

**Criterio:** ninguna superficie oscura salvo la tarjeta del sello SRI; contraste AA en todo el texto; `autoFocus` en usuario y `Enter` envía.

---

## Fase 3 — Nueva Orden unificada (el flujo crítico)

**Archivos:** `pages/NuevoPedido.tsx`, `components/orders/{ProductGrid,ServiceSelector,ProductConfigurator,OrderDetails,ClientSelector,OrderSummary,SriSolicitudStep,SriIdentityFlow,CommercialFlow}.tsx`, `services/orderPricing.ts`.

Referencias: `Nueva-Orden-Unificada.dc.html` (escritorio) y `Nueva-Orden-Movil.dc.html` (celular).

### 3.1 Eliminar la bifurcación

- Borrar el estado `missionCategory` y el paso "Categoría". El flujo pasa a ser **1 Producto → 2 Detalles → 3 Cliente → 4 Pago**, igual para todo.
- `isSriOrder` deja de ser una decisión del usuario: se **deriva** de las líneas del carrito (`items.some(i => i.esSRI)`), que a su vez lo toman de `Producto.esSRI`.
- `CommercialFlow.tsx` deja de ser un camino paralelo: lo que aporta de útil (captura rápida de trabajo comercial) se integra como una línea más del carrito. Si queda sin uso, borrarlo en vez de dejarlo muerto.
- Los atajos `1`–`6` eligen producto (ignorados si el foco está en un input). `F2` guarda.

### 3.2 El SRI como formulario, no como flujo

Dentro del paso 2 (`components/orders/OrderDetails.tsx`), renderizar el bloque fiscal **solo si la orden lleva preimpresos**:

- Cinta superior `C.ink` con el título "Formulario del SRI · solicitud de autorización" y la píldora "No grava IVA" (`onInkGoldLayer`).
- Cuerpo sobre `C.surfaceAlt`: modo (`Renovación` / `Nueva autorización` → `esRenovacion`), actividad económica (de `Cliente.fiscal_data`), establecimiento y punto de emisión (3 dígitos, `MONO`, fondo `C.goldBg`), numeración inicial, N° de autorización (queda pendiente hasta que el SRI responda) y clave de acceso opcional + "Imprimir clave en la solicitud" (`imprimirClave`).
- Aviso al pie: verde (`successBg`) si el formulario está completo, ámbar (`goldBg`) diciendo exactamente qué falta si no. Sin numeración ni establecimiento el SRI rechaza la solicitud: bloquear el guardado.
- Mantener la importación de la extensión (`CORDOVA_SRI_ORDER_EVENT` y `?mode=sri`): el banner llena cliente, documento, cantidad y este formulario, y deja al usuario en el paso 2. Hoy salta al paso 4 y se salta los detalles.

### 3.3 Un solo cálculo

`services/orderPricing.ts` es el **único** lugar donde vive la aritmética: `subtotal → diseño → recargo urgencia (+15%) → base → IVA 15% solo en líneas que gravan → total → abono → saldo`, con `round2()` en cada paso.

- El resumen lateral debe imprimir `desglose.total`, **no** la variable `precio`. Hoy muestran cifras distintas: es el hallazgo de severidad alta del informe.
- Órdenes mixtas: el IVA se calcula línea por línea y el resumen dice "IVA 15% · N de M líneas". Nunca aplicar IVA global.
- `escalaVolumen()` (≥200 → 8%, ≥500 → 15%) solo en flujos que cotizan directo desde `Producto.precio`. En ítems que vienen de `CalculadoraPrecios` pasar `aplicarEscala: false` para no descontar dos veces.
- Los atajos de abono (sin abono / 50% / total / +$10) se topan al total, y si el total baja el abono baja con él.
- Actualizar `__tests__/services/orderPricing.test.ts` si cambia una regla.

### 3.4 Resumen y guardado

Resumen sticky (`top:88px`) con líneas del carrito (badge SRI por línea), desglose, total en `Outfit 29px`, abono en tarjeta ámbar, saldo, **checklist de validación** (líneas, cliente, entrega, formulario SRI) y acciones: `Guardar e imprimir …` (F2), `Guardar y seguir`, `Solo cotización`, `Enviar por WhatsApp`.

Enrutamiento post-orden (ya existente, mantener): `TrabajoTipo.SRI` → `/solicitud-impresion/:id?format=a5`; general → `/recibo-epson/:id`. El botón debe **decir** cuál de los dos va a imprimir.

### 3.5 Celular (≤ 780px)

Misma página, no un componente aparte: bajo 780px el flujo se vuelve asistente de 3 pasos.

- Cabecera clara con barra de progreso de 3 segmentos.
- Paso 1: grilla 2×3 de productos, tarjetas de ≥120px, badge SRI, "desde $".
- Paso 2: stepper de **56px**, presets, entrega, urgencia (interruptor de 46×26) y el mismo bloque SRI, con campos de **54px** y `font-size:16px` (evita el zoom de iOS).
- Paso 3: RUC verificado, abono, forma de pago y desglose.
- **Pie fijo** (`position:sticky; bottom:0`, fondo `rgba(255,255,255,.97)` + blur, borde superior `C.border`): etiqueta que cambia (Total → Saldo), cifra viva y acción de 54px, con botón de retroceso de 56px desde el paso 2.
- Objetivos táctiles: ≥52px navegación y acción primaria, ≥44px secundarios.

**Criterio de aceptación de la fase 3:** una orden con notas de venta + tarjetas se registra en una sola pasada; la cifra del resumen, la del pie móvil y la del papel son idénticas; sin numeración el guardado se bloquea con mensaje; el cronómetro del mostrador baja de 30 s.

---

## Fase 4 — Piezas del sistema (`Pantallas-Faltantes.dc.html`)

1. **Buscador global** (`components/SearchOmni.tsx`): overlay `C.scrim` + panel `min(620px,100%)`, radio 16. Resultados agrupados en Órdenes / Clientes / Productos / **Acciones** (crear orden con ese cliente, registrar abono). Pie con atajos `↑↓`, `⏎`, `⌘⏎`, `ESC`. Estado vacío que ofrece crear el cliente. El `⌘K` de la cabecera debe abrirlo de verdad.
2. **Menú de sesión** (cabecera de `components/Layout.tsx`): panel de 290px con nombre, rol, turno abierto (verde), perfil y contraseña, cerrar turno y cuadrar caja, atajos (`?`), cerrar sesión en `C.dangerText`, y pie con versión + "Sincronizar".
3. **Estados vacíos:** tres tipos con respuestas distintas — por filtro (ofrece quitarlo), por dato inexistente (ofrece crearlo), y buena noticia (informa el siguiente riesgo). Regla de integridad: si el numerador sale de los datos, el denominador también. Prohibido un número fijo al lado de uno vivo.
4. **Errores** (`components/ErrorBoundary.tsx`): tarjeta clara, ícono en `dangerBg`, título de qué se cayó, la frase clave **"ninguna orden ni abono se perdió"**, tres acciones (recargar, ir a Órdenes, copiar detalle) y el código técnico en `MONO` sobre `surfaceAlt`. Banner ámbar de "sin conexión" con el conteo real de órdenes locales pendientes.
5. **Avisos (toasts):** abajo a la derecha en escritorio, sobre el pie fijo en celular. Cuatro tonos: éxito (verde, 4 s), informativo con **Deshacer** 8 s en toda acción reversible (`updateTrabajoStatus`, `registrarAbono`), error que **no borra lo escrito**, y proceso con spinner que no se cierra solo. Todo cambio de estado sigue escribiendo en `Trabajo.historial`.
6. **Barras de documento:** `NotaDeVenta.tsx`, `OrdenProduccion.tsx`, `ReciboAbono.tsx`, `SolicitudImpresion.tsx`, `ReciboEpson.tsx` — la barra pasa a `C.surface` sobre `C.bg`, radio 14, con Volver, título + N° de orden en `MONO`, selector de formato (A5 / A4 / Rollo 80 mm), Imprimir (`primary`) y Enviar PDF (verde). Todo con `no-print`. **El papel no cambia.**

---

## Fase 5 — Bordes que faltan

- **Recuperar acceso** (`pages/RecuperarAcceso.tsx`, nueva): dice la verdad — la clave la repone el administrador desde Usuarios. Campo de usuario, botón "Avisar al administrador" (WhatsApp), nota verde de que se puede seguir tomando órdenes en papel, teléfono en `MONO`. Sin promesas de correo de recuperación.
- **Tokens viejos:** limpiar `tailwind.config.js` e `index.css` de `obsidian`, `liquid-gold`, `champagne`, `gold-glow*`, `shadow-luxury`. Mientras existan, cualquier pantalla puede volver al tema oscuro sin que se note en revisión.
- **SRI oscuro:** migrar `components/orders/SriIdentityFlow.tsx` y `PhotoCapture.tsx` al tema claro (es el 30% del volumen del negocio y la vista más alejada del manifiesto).
- **Permisos por rol** (dueño, recepción, diseño, prensa) sobre las 17 pantallas: pendiente de definición del dueño, no inventarlos.

---

## Mapa de datos (no renombrar nada)

- Orden = `Trabajo` (`orden`, `titular`, `cantidad`, `total`, `abono`, `saldo`, `estado`, `fechaEntrega`, `prioridad`, `numeracion`, `autorizacion_sri`, `historial`, `observaciones`).
- Estados: `PENDIENTE` Pendiente · `EN_DISENO` En Diseño · `PROCESO` **En Prensa** · `VITRINA` **Listo** · `ENTREGADO` Entregado. Nunca mostrar el enum crudo: siempre `estadoCfg(estado).label`.
- `prioridad: 'Urgente'` es el interruptor del paso 2 (+15%). `esSRI` decide que **no grava IVA** y que se piden numeración y autorización.
- Precios reales: `Producto.precio` + `configCalculadora` vía `CalculadoraPrecios` / `PriceCalculatorDisplay`. Los precios de los prototipos son de muestra.

## Checklist final antes de dar por cerrada una fase

- [ ] Sin hex literales nuevos: todo por `C.*` / `S.*`.
- [ ] `grep -r "obsidian\|liquid-gold\|gold-glow"` limpio en las carpetas tocadas.
- [ ] Ningún texto de interfaz en inglés; fechas y montos en `es-EC`.
- [ ] La misma cifra en pantalla, en el pie móvil y en el papel.
- [ ] Toda acción reversible escribe en `historial` y ofrece Deshacer.
- [ ] Probado en 1440, 1180, 1024 y 390 px.
- [ ] `design_manifest.md` actualizado si se agregó un token o cambió una regla.
