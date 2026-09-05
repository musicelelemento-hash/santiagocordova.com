# Nueva Luz 3.0 & SantiagoCordova - Agente Maestro

Este archivo define las reglas arquitectónicas, los flujos de estado crítico y las pautas de desarrollo para el ecosistema "SantiagoCordova" (Aplicación Web) y la Extensión "Nueva Luz 3.0" (SRI Automation). 

Cualquier IA operando en este entorno **DEBE** leer y respetar estas instrucciones antes de proponer u ejecutar cambios en el código.

---

## 0. OBJETIVO GENERAL DEL PROYECTO

> **Obtener TODOS los comprobantes de declaraciones a la fecha.**

No es «declarar el mes en curso». Es que cada contribuyente tenga guardado el
comprobante de **cada** declaración presentada. Declarar lo pendiente es una
parte del trabajo; la otra —y la que quedaba sin hacer— es recuperar los
comprobantes de lo que ya se declaró.

De ahí que Consulta de declaraciones sea tan importante como el wizard de
recepción: ahí está el histórico completo, una fila por período, cada una con
su botón «Comprobante de declaración».

`bajarTodosLosComprobantes()` recorre esa tabla entera y baja lo que falte,
salteando lo que el registro local ya da por guardado. El botón 🧾 del HUD lo
dispara a mano; `sriTraerComprobantes()` hace lo mismo desde la consola.

---

## 1. Arquitectura de la Extensión (Nueva Luz 3.0)

La extensión dejó de ser un solo archivo monolítico (`content.js`). Ahora utiliza **Vite** para concatenar ordenadamente múltiples archivos `.js` ubicados en `src/`.

### Reglas Estrictas de Modificación
- **YA NO HAY `content.js` EN LA RAÍZ**: el monolito histórico (433 KB) se archivó en `extenciones web/_ARCHIVADAS_Y_LEGACY/01_Nueva_Luz_3.0_cruft/content.js`. Es solo referencia: no lo edites ni lo devuelvas a la carpeta de la extensión. El único content script real es `build/content.js`, generado por Vite.
- **FLUJO DE TRABAJO**: Para modificar el comportamiento del SRI, debes editar el archivo semántico correspondiente dentro de `src/` (ej. `04_extraccion_datos.js`).
- **COMPILACIÓN REQUERIDA**: Tras modificar cualquier archivo en `src/`, debes obligatoriamente ejecutar el comando `npm run build` (o asegurar que el desarrollador lo haga) dentro de la carpeta de la extensión para que Vite ensamble los cambios en `build/content.js`.
- **jsPDF NO SE CONCATENA**: vive en `vendor/jspdf.umd.min.js` (355 KB), declarado en `web_accessible_resources` del manifest, y se trae bajo demanda con `ensureJsPdfLoaded()` (en `01_utilidades_y_pdf.js`) sólo cuando hay que maquetar un PDF de respaldo. No lo devuelvas al bundle: duplicaría el peso del content script en cada página del SRI. Si su carga falla, `generateValidPdfBase64()` arma igual un PDF válido a mano — nunca es un error fatal.
- **VARIABLE SCOPING (Modo Concatenación)**: Los 7 archivos de `src/` se concatenan en orden estricto (01 al 07). Esto significa que no usamos `import/export`. Las funciones declaradas en el archivo `01` están disponibles de manera global para el archivo `06`. Mantener el orden lógico es imperativo para evitar "Temporal Dead Zones" de variables constantes (`const`).
- **TIPO DE CHEQUEO**: `jsconfig.json` activa `checkJs` para `src/**`, pero **solo aplica dentro del editor**: `typescript` no está instalado y no hay paso de type-check en el build ni en CI (`npm test` falla a propósito). Ningún archivo lleva `// @ts-check`. Antes de dar un cambio por terminado, la verificación real es `node --check` sobre cada archivo de `src/` más `npm run build`.
- **CUIDADO CON LOS MÉTODOS DUPLICADOS**: `SriAssistantPanel` es una clase de ~3.500 líneas. Un método declarado dos veces **no da error**: el segundo pisa silenciosamente al primero y el primero queda muerto. Antes de añadir un método, verificá que el nombre no exista ya:
  ```bash
  grep -n "async nombreDelMetodo(" src/06_panel_interfaz.js
  ```
- **CLAVES FUERA DEL DOM**: nunca escribas contraseñas del SRI en el HTML que se inyecta en `srienlinea.sri.gob.ec` — ni en atributos `data-*`, ni en handlers `onclick` inline. Poné solo el RUC en el elemento y resolvé la credencial en el momento del click contra `sc_clients_cache`. Todo dato de cliente que vaya a `innerHTML` pasa por `escapeHtml()`.
- **`offsetParent` NO SIRVE PARA MODALES**: en Chrome todo elemento
  `position: fixed` tiene `offsetParent === null`, y los modales del SRI
  (PrimeFaces y Angular Material) son fixed. Usar el helper `esVisible(el)` de
  `02_servicios_y_memoria.js`, que combina `getComputedStyle` con
  `getBoundingClientRect`. Por esta trampa `dismissSridialogs()` nunca llegó a
  cerrar un solo modal.
- **NUNCA PULSAR UN BOTÓN DE MODAL POR SU TEXTO** cuando el modal no es un aviso
  conocido del SRI: el portal muestra una encuesta de satisfacción con un botón
  «Quiero responder» que enviaría una opinión en nombre del usuario.
  `cerrarModalesNoPrimeFaces()` solo usa controles de cierre explícitos
  (`aria-label`, `×`, `.mat-dialog-close`) y, si no encuentra ninguno, deja el
  modal quieto y avisa por consola.
- **NADA DE `onclick` INLINE QUE LLAME FUNCIONES DEL CONTENT SCRIPT**: los handlers inline se ejecutan en el *main world* de la página y no ven las funciones del content script (mundo aislado). Usá `addEventListener`.

### Los 7 Módulos Semánticos
1. `01_utilidades_y_pdf.js`: Helpers, conversiones, y lógica de captura (foto) del PDF final.
2. `02_servicios_y_memoria.js`: Estados persistentes (`GhostMemory`, `SafeStorage`).
3. `03_ingreso_y_sesion.js`: Navegación hacia `inicio/NAT` y auto-login (Keycloak).
4. `04_extraccion_datos.js`: Lógica profunda para raspar tablas del SRI (Facturas, Retenciones, Notas de crédito).
5. `05_llenado_formulario.js`: Cálculos matemáticos Elite y escritura del DOM en el formulario del SRI.
6. `06_panel_interfaz.js`: Todo lo relacionado al HUD visual flotante (`SriAssistantPanel`).
7. `07_navegacion_sri.js`: Secuenciadores "Wizards", `autoDismissSriWarnings` (saltador de modales) y el `SafeStorage.get()` inicial.

---

## 2. Memoria y Manejo de Estado (Anti-Reloads)

Dado que la plataforma del SRI es una Single Page Application (SPA) híbrida que frecuentemente fuerza recargas completas (Full Page Reloads) al cambiar de sección, la extensión utiliza una memoria fantasma para recordar en qué paso estaba.

- `GhostMemory`: Almacena el progreso lógico temporal.
- `SafeStorage`: Envuelve `chrome.storage.local`. La llave `pendingAction` dicta qué bloque de código debe ejecutarse cuando la página termine de cargar (ej. `pendingAction: 'startIvaNavigation'`).
- `actionTimestamp`: Previene bucles infinitos. Toda acción tiene una fecha de caducidad.

**Regla**: Si necesitas crear un flujo que atraviese más de una URL del SRI, **debes** usar `SafeStorage` para guardar el estado siguiente antes de inyectar el redireccionamiento `window.location.href`.

---

## 3. Matemática "Elite" y Flujo de Sugeridos (SRI)

La extensión tiene la responsabilidad fiduciaria de calcular impuestos. No asumas ni adivines cálculos lógicos que puedan alterar la contabilidad del usuario.

### El Protocolo de Casilleros y "Refuerzo Técnico"
El SRI inyecta "Valores Sugeridos" oficiales en ciertos casilleros (ej. **615** y **617**).
- El sistema **prioriza** el sugerido oficial del SRI. 
- Si el SRI explícitamente sugiere `0.00` en el DOM, **DEBE SER RESPETADO Y MANTENIDO EN CERO**, devolviendo `true` en la función manejadora.
- Si no hay ningún sugerido (la caja está vacía o desaparecida), la función `calculateEliteFinancials()` asume el control ("Refuerzo Técnico") e inyecta cálculos basados en periodos previos o acumulados.
- **Regla**: Nunca permitas que el Refuerzo Técnico sobrescriba un `0.00` proporcionado deliberadamente por el sistema del SRI en las clases `.sugerido`.

---

## 3a. El bot NUNCA presenta una sustitutiva

La cabecera del wizard rotula el tipo en
`#frmFlujoDeclaracion:outMarcaDeclaracion`. Si dice **SUSTITUTIVA**, ese
período **ya fue declarado** y el portal está armando un reemplazo.

Una sustitutiva corrige una declaración que el SRI ya aceptó: es una decisión
del contador, no del software. `frenarSiEsSustitutiva()` se llama **antes de
llenar** y **antes de enviar**; al detectarla no se toca nada y se detiene el
lote entero.

Pasó de verdad el 04-sep-2026: el bot llenó el formulario y llegó a
«Confirmando envío en diálogo» sobre una sustitutiva. Solo no se envió porque
no encontró el botón.

---

## 3b. Nunca saltarse un contribuyente por un aviso

El endpoint `alertas/vencimiento` dice si una obligación figura como
presentada. **Esa señal NO alcanza para saltarse a un cliente.**

El aviso cambia alrededor del cierre de mes: la obligación puede dejar de
figurar sin que la declaración esté hecha. Saltar por ahí significa dejar a
alguien sin declarar, y eso termina en multa con la firma del usuario.

**Regla**: si el aviso dice que ya está presentada, el bot **va a comprobarlo**
a Consulta de declaraciones, que es el registro oficial de lo presentado:

- **Figura** → baja el comprobante y lo guarda. El cliente queda cerrado.
- **No figura** → vuelve al flujo normal y la declara.

Nunca se concluye «ya está hecha» sin haberla visto en la lista de
presentadas. Y si el aviso habla de un período distinto al que está declarando
el lote, de ahí no se deduce nada.

---

## 4. El "Cierre Mágico" (Cúspide de la Automatización)

La etapa final del llenado de una declaración automatizada involucra una secuencia delicada:
1. Verificación de Inconsistencias (cero errores permitidos).
2. `tryCaptureRealPdfFromDOM()`: Dibuja o captura un comprobante de que se completó.
3. `syncDeclarationToSupabase()`: Transfiere los metadatos (ventas, compras, retenciones) directamente a la base de datos de `SantiagoCordova.com`.
4. El lote automatizado salta automáticamente al **Siguiente Cliente** si el Auto-Batch está activado.

### Dos cierres distintos — no confundirlos
| Método (`06_panel_interfaz.js`) | Momento | Qué hace |
| :--- | :--- | :--- |
| `ejecutarCierreMagico()` | **PRE-envío** | Pulsa Siguiente, valida advertencias (`validarAdvertenciasSRI`), verifica que el saldo sea `$0.00` y que no haya inconsistencias, recién ahí envía. Si hay saldo a pagar guarda borrador y **se detiene**: nunca se paga automáticamente. |
| `finalizarPostEnvioSRI()` | **POST-envío** | Lo dispara `initDeclarationSuccessWatcher` al detectar la pantalla de confirmación. Solo respalda el comprobante, sincroniza y cierra sesión. No valida saldos porque ya es tarde. |

### Contrato de seguridad del envío (`ejecutarCierreMagico`)
El bot **sólo envía** si puede CONFIRMAR las cuatro cosas a la vez:

1. **`estaEnResumenDeclaracion()`** — estamos de verdad en el resumen de pago,
   no en el formulario.
2. `detectarSaldo()` devuelve un número y ese número es `0`.
3. `analizarMensajesResumen()` devuelve `'limpio'`.
4. `frenarSiEsSustitutiva()` devuelve `false`.

Cualquier otro resultado guarda borrador y frena.
**Nunca trates la ausencia de mensajes como "todo bien"**: esa era justamente la
regresión que permitía enviar a ciegas si el selector fallaba.

El punto 1 se agregó el 04-sep-2026 por un caso real: el bot anunció «TODO
PERFECTO. Saldo $0.00» leyendo el casillero TOTALES (`concepto2610`) **mientras
seguía en el formulario**. El saldo del formulario no es el saldo a pagar: el
resumen es donde el SRI lo dice, y en una sustitutiva incluye la imputación al
pago. Se reconoce el resumen por `frmFlujoDeclaracion:pagValoresRemision`,
`outTotalPagarSinRemision` o `totalAPagar`.

Ambos selectores ya están calibrados contra tráfico real (04-sep-2026):
- `frmFlujoDeclaracion:totalAPagar` — confirmado, devuelve `USD 0.00`.
- **Inconsistencias: no se detectan por texto.** El portal enciende y apaga
  `#frmFlujoDeclaracion:erroresField` (`display:block` = hay errores,
  `display:none` = no hay) desde su propio `mostrarErrores()`. Ver la Biblia,
  sección «Errores y advertencias del formulario». `advertenciasField` es el
  equivalente para advertencias, que **no** impiden declarar.

Mientras no estén calibrados, `capturarDiagnosticoResumen()` guarda una
radiografía del DOM en `SafeStorage.sri_diagnostico_resumen` cada vez que el
cierre llega al resumen (RUCs enmascarados). Se lee con
`window.sriAssistant.verDiagnosticoResumen()`.

La bandera `declaration_synced_flag` en `SafeStorage` es el candado que evita que ambos corran sobre la misma declaración; `ejecutarCierreMagico()` la levanta antes de sincronizar. Se limpia al iniciar cada navegación y al pasar al siguiente cliente del lote.

`tryCaptureRealPdfFromDOM(shouldClickPrint)` **devuelve un boolean**, no los bytes: deja el base64 en la global `capturedPdfBase64`. Para sincronizar, pasale `null` a `syncDeclarationToSupabase` y dejá que ella corra su propio bucle de captura.

**Regla**: Cualquier alteración al Cierre Mágico debe probarse rigurosamente, ya que un fallo aquí impediría que las métricas visuales del dashboard web de SantiagoCordova reciban la información del mes.

---

## 5. El Repositorio Web (`santiagocordova-main`)

- Es una app moderna usando **Next.js / Vite**, React, TypeScript estricto, y Supabase.
- Asegúrate de exportar interfaces `.ts` (ej. `Client`, `TaxDeclaration`) de manera uniforme si creas nuevos componentes visuales de métricas.
- Todo diseño web debe verse "Premium", moderno y fluido (ver reglas base del prompt).

---

## 5b. Biblia de Pantallas (evidencia real del portal)

`extenciones web/_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md` es el catálogo de
capturas reales del SRI que respalda la Matriz Tatuada de abajo.

**Regla**: si un selector de la §6 no tiene entrada en la Biblia, es una
suposición, no un hecho — trátalo como frágil y no construyas lógica de envío
sobre él. Cuando llegue evidencia nueva, agregá la entrada antes de tocar código.

Las capturas llevan datos de contribuyentes reales (RUC, nombre, email,
teléfono): están excluidas por `.gitignore`; solo se versiona el índice `.md`.
Los PDFs se convierten con `node _extraer_pdf.js <archivo.pdf> capturas/`.

---

## 6. Matriz Tatuada de Selectores, IDs y Rutas Inmutables del SRI

> **REGLA DE TATUAJE PERMANENTE:** Esta sección está fijada en la memoria permanente del sistema. NINGUNA IA debe borrar, ignorar o alterar estos identificadores y selectores oficiales del SRI.

### A. Rutas Canónicas Directas (URLs y Puentes Oficiales)
* **Puente SSO a Comprobantes Electrónicos Recibidos:**
  ```javascript
  const SRI_PUENTE_RECIBIDOS = 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=57&idGrupo=55';
  ```
  *(CONFIRMADO 03-sep-2026: Genera token automáticamente y transfiere la sesión de Angular a JSF).*
* **URL Directa de Comprobantes Recibidos:**
  ```javascript
  const SRI_RECIBIDOS_URL = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf?&contextoMPT=https://srienlinea.sri.gob.ec/tuportal-internet&pathMPT=Facturaci%F3n%20Electr%F3nica&actualMPT=Comprobantes%20electr%F3nicos%20recibidos%20&linkMPT=%2Fcomprobantes-electronicos-internet%2Fpages%2Fconsultas%2Frecibidos%2FcomprobantesRecibidos.jsf%3F&esFavorito=S';
  ```
* **Puente SSO a Wizard de Formulario IVA (2011):**
  ```javascript
  const SRI_PUENTE_FORMULARIO_IVA = 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=310&idGrupo=201';
  ```
  *(CONFIRMADO 03-sep-2026: Transfiere la sesión hacia el wizard de recepción de declaraciones).*
* **Menú de declaraciones (índice de tarjetas):**
  `https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones`
  *(CONFIRMADO 03-sep-2026 — Biblia entrada 06)*
* **Wizard de recepción (Formulario IVA 2011):**
  ```javascript
  const SRI_FORMULARIO_IVA_URL = 'https://srienlinea.sri.gob.ec/sri-declaraciones-web-internet/pages/recepcion/recibirDeclaracion.jsf?identificadorGrupoObligacion=IVA';
  ```
  *(CONFIRMADO 03-sep-2026 — Biblia entradas 07 a 12).*
  El wizard **no cambia de URL entre sus 4 pasos** (Período Fiscal → Preguntas → Formulario → Pago): no intentes distinguir el paso por la URL.
* **Perfil del Contribuyente (Auditoría de Obligaciones):**
  `https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/perfil`
* **Cierre de Sesión Limpio:**
  `https://srienlinea.sri.gob.ec/sri-declaraciones-web-internet/pages/salir.jsp`
  `https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/logout`

### B. IDs de Comprobantes Recibidos (`comprobantesRecibidos.jsf`)
| Campo | ID en el DOM | Selector / Estrategia |
| :--- | :--- | :--- |
| **Año** | `frmPrincipal:ano` | `document.getElementById('frmPrincipal:ano')` |
| **Mes** | `frmPrincipal:mes` | `document.getElementById('frmPrincipal:mes')` |
| **Día** | `frmPrincipal:dia` | `document.getElementById('frmPrincipal:dia')` (Valor '0' = TODOS) |
| **Tipo Comprobante** | `frmPrincipal:cmbTipoComprobante` | `option value="1"` = Factura, `value="6"` = Retención, `value="3"` = NC |
| **Botón Consultar** | `frmPrincipal:btnConsultarSinRe` | `document.getElementById('frmPrincipal:btnConsultarSinRe')` |
| **Tabla de Facturas** | `frmPrincipal:tablaCompRecibidos` | `document.getElementById('frmPrincipal:tablaCompRecibidos')` |
| **Paginador** | `frmPrincipal:tablaCompRecibidos_paginator_bottom` | Paginador PrimeFaces (`.ui-paginator-next`, selector `25, 50, 75`) |

### C. IDs del Wizard, Formulario y Cierre Mágico de IVA (`recibirDeclaracion.jsf`)
| Elemento | ID en el DOM | Selector / Estrategia |
| :--- | :--- | :--- |
| **Obligación IVA (Paso 1)** | `frmFlujoDeclaracion:somObligacion_1` | `data-label="2011 DECLARACION DE IVA"` |
| **Período (calendario Paso 1)** | `frmFlujoDeclaracion:calPeriodo` | `data-p-pattern="mm/yy"` (ej: `08/2026`) |
| **Siguiente (Paso 1 a 2)** | `frmFlujoDeclaracion:btnObligacionSiguiente` | Botón PrimeFaces AJAX |
| **Saltar Preguntas (Paso 2)** | `frmFlujoDeclaracion:clkFormularioCompleto` | `<a class="ui-commandlink">` "Ver formulario completo" |
| **Siguiente Formulario (Paso 3)** | `frmFlujoDeclaracion:btnFormularioSiguiente` | Botón "Siguiente" antes del resumen |
| **Casillero 401 (Ventas 15%)** | `concepto401` | Input casillero 401 |
| **Casillero 411 (Ventas Netas 15%)** | `concepto411` | Input casillero 411 |
| **Casillero 500 (Compras Brutas 15%)** | `concepto500` | Input casillero 500 |
| **Casillero 510 (Compras Netas 15%)** | `concepto510` | Input casillero 510 |
| **Casillero 601 (Impuesto Causado)** | `concepto601` | Lectura de impuesto causado |
| **Casillero 609 (Retenciones IVA)** | `concepto609` | Input retenciones IVA del mes |
| **Casilleros Sugeridos** | `615`, `617`, `564`, `565` | Clases `.sugerido` (respetar `0.00` oficial) |
| **Total a pagar (TOTALES)** | `concepto2610` | Input readonly dentro del formulario |
| **Modal Advertencias** | `dlgConfirmacionEnvioFormulario` | Diálogo PrimeFaces "¿Desea continuar?" |
| **Aceptar Advertencias (Diálogo)** | `frmFlujoDeclaracion:j_idt947` | Botón verde "Aceptar" del diálogo |
| **Total a pagar (Resumen Paso 4)** | `frmFlujoDeclaracion:totalAPagar` | `<span>` con texto **`USD 0.00`** — CONFIRMADO 03-sep-2026 |
| **Botón Enviar Declaración (Resumen)** | `frmFlujoDeclaracion:divBotonContinuarConfirmacion` | Botón verde con texto **"Aceptar"** |
| **Contenedor Éxito / Confirmación** | `#panelSinValorAPagar` | Contenedor oficial de declaración procesada |
| **Botón Imprimir Comprobante** | `frmFlujoDeclaracion:btnDescargarComprobante` | Botón verde flat con texto **"Imprimir"** |
| **Botón Nueva Declaración** | `frmFlujoDeclaracion:btnSinValorPagarNuevaDeclaracion` | Botón con texto "Nueva declaración" |

> ⚠️ **El saldo viene como `USD 0.00`, no como `0.00`.** Nunca uses `parseDecimal()`
> para decidir un envío: devuelve `0` tanto para "cero" como para "no pude leer".
> Para eso está `parseImporteEstricto()`, que devuelve `null` cuando no hay número.

