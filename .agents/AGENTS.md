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

### Y que cada compra vaya donde corresponde

Tener el comprobante no alcanza si la declaración lo mete en el casillero
equivocado. La declaración separa lo deducible de lo no deducible según la
actividad del proveedor, y hoy el bot mete todas las facturas en un solo
bloque. La base de proveedores de la §7 es lo que falta para cerrar eso — y de
paso resuelve el anexo de gastos personales y la devolución de IVA de tercera
edad, que preguntan lo mismo sobre el mismo RUC.

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
5. **`frenarSiHayIvaSinUbicar()` devuelve `false`** — no quedó plata de
   compras sin casillero (ver §9a).

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
| **Casillero 502 (sin derecho a crédito)** | *sin confirmar* | Otras adquisiciones tarifa ≠ 0 SIN crédito tributario · ver §9 |
| **Casillero 512 (NC del 502)** | *sin confirmar* | Menos notas de crédito del 502 |
| **Casillero 540 (compras 5%)** | *sin confirmar* | Adquisiciones locales gravadas 5% con crédito · ver §9 |
| **Casillero 550 (NC del 540)** | *sin confirmar* | Menos notas de crédito del 540 |
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


---

## 7. La base de proveedores — la pieza que falta

> **Estado (06-sep-2026)**: el cimiento está construido y probado. Falta el
> mapa CIIU → deducible, que es criterio contable, y el casillero donde va lo
> no deducible (§9a).

### Lo que ya funciona

`Proveedores` en `02_servicios_y_memoria.js`, con la marca `sc_proveedores`.

**Se aprende mirando, sin preguntarle nada a nadie.** Cada factura y cada nota
de crédito que pasa por el bot deja anotado a su proveedor, desde las tres
bocas por donde entran:

- el TXT de recibidos — la mejor fuente: da RUC y razón social **separados**;
- la tabla del portal — los da pegados en una celda, y se parten;
- las notas de crédito, que las emite el mismo proveedor.

Las **retenciones no entran**: las emite el cliente que te retuvo, no un
proveedor.

| Método | Qué hace |
| :--- | :--- |
| `registrarLote(lista, clienteRuc)` | anota o actualiza, una sola escritura |
| `saber(ruc)` | lo que se sabe, o `null` |
| `clasificar(ruc, {actividad, deducible, origen})` | ver la regla de abajo |
| `pendientes(tope)` | los que faltan, **los más frecuentes primero** |
| `resumen()` · `exportar()` | conteos · TSV para revisar afuera |

El orden de `pendientes()` no es cosmético: clasificar el proveedor que aparece
en 200 facturas rinde doscientas veces más que el que aparece en una. Con 500
contribuyentes, esa diferencia es la que hace que la base se llene sola en vez
de nunca.

**La regla del `origen`, probada:** una sugerencia —`catastro`, `sugerido`,
`ia`— **nunca pisa** una decisión con `origen: 'usuario'`. Sólo el contador
puede cambiar lo que decidió el contador. Es la misma regla de todo el
proyecto: nunca presentar como dato lo que es una suposición.

El botón **🏷️** del HUD muestra el resumen, los pendientes ordenados, y deja
marcar cada uno como deducible o no. En el DOM del SRI va **sólo el RUC del
proveedor** — ni el nombre del cliente, ni nada más. Los RUC de los clientes del
estudio tampoco salen en la exportación: es con quién opera cada uno.

Banco: `tests/proveedores.html` (31 comprobaciones, verdes el 06-sep-2026).

### La base es de tres proyectos, no de uno

> **Anotado el 06-sep-2026 a pedido del usuario.** La base de proveedores y el
> catastro **se guardan también para un proyecto aparte: la selección de IVA
> por tipo para la devolución de tercera edad.**

Es la misma pregunta hecha tres veces, y el dato es uno solo:

| Quién pregunta | Qué necesita saber del RUC |
| :--- | :--- |
| **Nueva Luz** (IVA) | ¿la compra es deducible o no? → 500/510 vs 502/512 |
| **Anexo de Gastos Personales** | ¿vivienda, salud, educación, alimentación, vestimenta o turismo? |
| **Devolución de IVA · tercera edad** | ¿esta compra califica para la devolución? |

Por eso `Proveedores` guarda `actividad` y `ciiu` **además** de `deducible`, y
por eso `exportar()` los saca en TSV: la base no es de la extensión de IVA, es
del estudio. Cuando se arme el proyecto de tercera edad, la parte cara —saber a
qué se dedica cada RUC— ya va a estar hecha y confirmada por el contador.

### La cascada, construida el 06-sep-2026

```
1. lo que decidió el contador   → MANDA      gratis, instantáneo
2. el catastro del SRI (CIIU)   → sugiere    gratis, en disco
3. la IA                        → sugiere    cuesta y sale de casa
```

`Proveedores.sugerirDesdeIA()` pregunta **sólo por los que llegaron hasta ahí
sin categoría**, los más frecuentes primero. Lo que confirme se guarda: al mes
siguiente ese proveedor no cuesta nada. Con 500 contribuyentes los proveedores
se repiten muchísimo, así que el gasto tiende a cero solo.

**Qué sale de la máquina, y nada más:** el nombre del proveedor y su actividad
pública del catastro. **No** sale el RUC del proveedor, **no** sale el RUC del
cliente, **no** salen importes. Quien responde no puede armar el mapa comercial
del estudio — que es exactamente por lo que se descartó la extensión de
terceros. Probado en `tests/proveedores.html`.

Sale por el **service worker**, no por el content script: la clave no tiene por
qué estar dentro de la página del SRI, y un fetch cross-origin del content
script está sujeto a CORS (la misma lección que la subida a R2).

Categorías: las seis del anexo de gastos personales más `ninguna`. **`ninguna`
es «no sé» y no se guarda** — una respuesta honesta no se convierte en dato.
Una categoría que no esté en la lista se normaliza a `ninguna`: la IA no puede
inventar categorías nuevas.

La IA **nunca dice si algo es deducible**. Igual que el catastro: dice a qué se
dedica el proveedor; si esa compra concreta da crédito tributario depende del
gasto y lo decide el contador.

### Lo que falta

- El **mapa CIIU → deducible**: criterio contable, lo pone el contador.
- El **casillero** donde va lo no deducible (502/512) — sin confirmar (§9a).
- El interruptor **preguntar / seguir** para los desconocidos. Hoy rige el modo
  por defecto de hecho: un proveedor sin clasificar va donde va hoy y queda en
  la lista, **nunca al 502 por las dudas**.

---

### El diseño original, para no perderlo

### El problema, dicho una vez

Hoy el bot toma **todas** las facturas de compras recibidas y las mete al
formulario como un solo bloque. Pero la declaración no las trata igual: separa
lo deducible de lo no deducible según **la actividad del proveedor**. Esa
distinción hoy no se hace, y el bot no tiene con qué hacerla.

Lo que falta no es lógica: es **saber a qué se dedica cada RUC**.

### La misma pregunta, tres veces

El dato es uno solo y hoy cada extensión lo resuelve por su cuenta:

| Quién pregunta | Qué necesita saber del RUC |
| :--- | :--- |
| **Nueva Luz** (IVA) | ¿la compra es deducible o no? |
| **Anexo de Gastos Personales** | ¿vivienda, salud, educación, alimentación, vestimenta o turismo? |
| **Devolución de IVA · tercera edad** | ¿esta compra califica? |

`03_Anexo_Gastos_Personales/content.js` ya tiene las seis categorías del SRI
(`vivienda`, `salud`, `educacionArteCultura`, `alimentacion`, `vestimenta`,
`turismo`). Lo que no tiene —ni él ni Nueva Luz— es memoria: cada corrida
vuelve a empezar de cero.

### Cómo debería funcionar

**Se aprende una vez y sirve para siempre.** Cada RUC que aparece en una
factura se guarda con su nombre. La primera vez que se lo ve, se pregunta a qué
se dedica. Desde ahí, todas las extensiones lo saben.

    proveedores: {
      "0990123456001": {
        nombre: "COMERCIAL XYZ S.A.",
        actividad: "alimentacion",      // categoría del anexo
        deducible: true,                // para el IVA
        vistoEn: ["0703891838001", …],  // qué clientes le compran
        cuando: 1788646356641,
        origen: "usuario" | "sugerido"  // quién lo decidió
      }
    }

**El `origen` no es decoración.** Es la misma regla que ya rige todo el
proyecto: nunca presentar como dato lo que es una suposición. Una clasificación
`sugerido` —adivinada por el nombre, por ejemplo «FARMACIA» → salud— se muestra
distinta de una que confirmó el contador, y nunca decide sola sobre plata.

**Los que no se conocen**: un interruptor decide qué pasa.

- **Preguntar** — el lote frena y muestra los RUC nuevos para clasificar.
- **Seguir** — se declaran como hasta ahora y quedan en una lista de pendientes
  para revisar después.

Lo segundo es el modo por defecto: un lote de 27 clientes no puede quedarse
esperando a que alguien conteste. Vale la misma lección del `confirm()` que
bloqueaba la automatización.

### Por qué vale la pena

Un proveedor clasificado una vez sirve para **todos** los clientes que le
compren. Un estudio con 27 contribuyentes comparte buena parte de sus
proveedores: la base se llena sola en los primeros meses y después casi no hay
que tocarla.

### Pendiente de tu lado

- El **número de casillero** donde van las compras no deducibles.
- El **casillero de cantidad** de comprobantes de esa categoría.

Sin esos dos, la clasificación se puede guardar pero no se puede declarar.

---

## 8. Pendientes anotados

### 8a. Los tipos de comprobante que faltan

`frmPrincipal:cmbTipoComprobante` solo tiene tres valores confirmados en la
Biblia: `1` (Factura), `3` (Nota de Crédito), `6` (Retención). Faltan **nota de
débito** y **liquidación de compra**, entre otros.

**No inventar los códigos.** Se leen del portal, estando en Comprobantes
Recibidos:

```js
[...document.getElementById('frmPrincipal:cmbTipoComprobante').options]
    .map(o => o.value + ' = ' + o.text).join('\n')
```

Con esa salida se agregan al barrido: el extractor de facturas ya sirve para
todos los tipos, solo hay que decirle cuáles pedir.

### 8b. Notas de venta — casilleros 508 y 117

Son comprobantes **físicos**: nunca aparecen en «comprobantes electrónicos
recibidos» y el bot no tiene de dónde sacarlos. El dato solo lo tiene el
contador.

| Casillero | Qué es |
| :--- | :--- |
| **508** | Adquisiciones a contribuyentes RISE (hasta dic-2021) / NEGOCIOS POPULARES (desde ene-2022) |
| **117** | Total de notas de venta recibidas (cantidad) |

**Construido el 06-sep-2026.** `NotasDeVenta` en `02_servicios_y_memoria.js`,
interruptor **📒** en la barra flotante — **apagado por defecto**.

Cuando está encendido, el paso 3.5 de `llenarCompras()` pide los dos números en
un panel del HUD, con temporizador visible. Si nadie contesta, la promesa se
resuelve sola con `null` y el lote sigue.

> **`null` no es cero.** Un silencio significa «no sé» y **no se escribe nada**
> en el 508 ni en el 117. Un cero inventado ahí es una declaración mal hecha.
> El botón «No tiene» sí es una respuesta: se guarda como 0/0.

Nunca un `confirm()`: un diálogo del navegador congela la página y el lote
entero se queda ahí. Vale la misma lección del cuadro que bloqueaba la
automatización.

**Tres períodos seguidos en cero y se deja de preguntarle a ese cliente**
(`noUsa`). Con 500 contribuyentes, seguir preguntándole al que nunca usa notas
de venta es justo lo que haría inservible el interruptor. Un período con datos
lo despierta solo, y `volverAPreguntar(ruc)` lo despierta a mano.

Los `id` del 508 y el 117 **no están confirmados**: se buscan por número de
casillero. Si hay dato y el casillero no aparece, la plata **no** se manda a
otro lado — se anota en `iva_sin_ubicar` y el cierre mágico frena (§9a).

Banco: `tests/notasventa.html` (23 comprobaciones, verdes el 06-sep-2026).

### 8c. Cambio de clave por lote

Hay una traza de Burp (`cambio_de_clave_obligatorio_ID`) y una extensión propia
(`02_Cambio_Claves_SRI`). La regla acordada: **no aplastar por aplastar**. Vale
lo mismo que en el importador de CSV de Chrome — proponer los cambios, mostrar
a quién le pisa una clave que ya funcionaba, y aplicar solo lo confirmado.

---

## 9. Los casilleros de compras que faltan — y un hueco de tarifa

### 9a. Lo que se declara y lo que no

| Casillero | Qué es | ¿Se llena? |
| :--- | :--- | :---: |
| **500 / 510** | Compras 15% con derecho a crédito · menos NC | ✅ |
| **507 / 517** | Compras 0% · menos NC | ✅ |
| **540 / 550** | Adquisiciones locales (excluye activos fijos) gravadas con **tarifa 5%**, con derecho a crédito · menos NC | ✅ desde 05-sep-2026 |
| **502 / 512** | Otras adquisiciones y pagos gravados **tarifa distinta de cero, SIN derecho a crédito tributario** · menos NC | ❌ |

**El 502 es el casillero que faltaba** para separar deducible de no deducible.
Es el destino de las compras que la base de proveedores marque como sin
derecho a crédito.

#### El agujero del 5%, y por qué costaba plata

Hasta el 05-sep-2026 el corte de tarifas era **binario**: «tiene IVA» → 15%,
«no tiene» → 0%. Una compra al 5% caía entera en el 500.

No era solo un casillero mal puesto. El SRI calcula el **520** (impuesto
generado en compras) a partir del **510**, y de ahí sale el crédito
tributario: $1.000 al 5% declarados como 15% le daban al contribuyente $150 de
crédito donde le correspondían $50. **Pagaba de menos, con la firma del
contador.**

#### Cómo se resuelve — y qué NO resuelve

`clasificarTarifaIva(base, iva)` en `04_extraccion_datos.js` deduce la tarifa
por el cociente **IVA / base**. Tarifas reconocidas: `[5, 12, 13, 14, 15]`
(12% hasta marzo de 2024, 13% ese marzo, 15% desde abril).

Devuelve **tres** respuestas, no dos, y la tercera es `null` = «no sé»:

| Cociente | Resultado | Destino |
| :--- | :--- | :--- |
| ≈ 0 | tarifa `0` | 507 / 517 |
| ≈ 5% | tarifa `5` | **540 / 550** |
| ≈ 12/13/14/15% | tarifa plena | 500 / 510 |
| cualquier otro | `null` | 500/510 **y anotada para frenar** |

**El cociente no distingue una factura al 5% de una mezclada.** Una de $100 con
un tercio al 15% y el resto al 0% da 4,95%, y el clasificador la lee como
**5%** — no la marca como dudosa, la confunde. Está medido en el banco, no
supuesto.

No es un bug que haya que «arreglar»: rechazar todo lo que caiga en 5% frenaría
cada lote con compras legítimas al 5%. Es el límite del método, y la razón por
la que hace falta el XML (§11).

En plata el daño es chico —el crédito sale $5,00 donde correspondían $4,95—
pero las **bases** quedan mal repartidas, y eso sí se cruza contra el ATS. Por
eso:

- **El 8% de feriados queda AFUERA de la lista a propósito.** Existe, pero cae
  justo en la zona donde una mezclada produce ese cociente. Preferimos que una
  factura al 8% caiga en «no sé» y la mire el contador, antes que una mezclada
  se declare como si fuera de una sola tarifa.
- La holgura es en **plata**, no en puntos porcentuales:
  `max($0.02, base × 0.001)`. En una factura de $5 un centavo son 0,2 puntos.

Las notas de crédito son el caso fácil: el modal trae el `codigoPorcentaje`
del SRI, que es la tarifa **declarada por quien emitió**, no deducida
(`0`=0%, `2`=12%, `3`=14%, `4` y `10`=15%, **`5`=5%**, `6`=no objeto,
`7`=exento). Ahí no se adivina nada. Solo se deduce cuando el modal no abrió.

#### El freno

`anotarIvaSinUbicar()` / `frenarSiHayIvaSinUbicar()` en
`02_servicios_y_memoria.js`, con la marca `iva_sin_ubicar` en `SafeStorage`.
Se levanta cuando:

1. Hay plata al 5% y **no apareció el 540 o el 550** en el DOM, o
2. Alguna factura o NC quedó sin tarifa reconocible.

El cierre mágico no envía con la marca puesta: llena el formulario, lo deja en
pantalla y avisa cuáles son. **Repartir una factura mezclada es criterio
contable, no algo que el bot pueda deducir.** La marca se borra en los mismos
seis puntos donde ya se borraba `declaration_synced_flag` (arranque de
declaración, siguiente cliente, reset total) — si quedara pegada, el freno de
un cliente bloquearía al próximo.

> **El 540 y el 550 NO aparecen en el formulario.** Verificado por el usuario
> el 05-sep-2026 mirando la pantalla real. No se sabe si es porque no existen,
> porque se llaman distinto, o porque el portal solo los muestra en ciertos
> períodos u obligaciones.
>
> **No se cablearon en el `fieldMap`** y no se van a cablear por suposición. Se
> buscan por número de casillero con el XPath que ya usa el resto del
> formulario; si no aparecen, la plata **no** se manda al 500 por las dudas —
> se anota y se frena. Lo mismo vale para el 502 y el 512.

#### Cómo se sale de la duda: el botón 📐

En el HUD, entre 📜 y 🗔. **Siempre visible.** Abre un panel con
**todos** los casilleros que el formulario tiene de verdad —número, `id` real,
rótulo y si es editable—, resalta los del 5% y los del 502/512, y tiene un
botón que copia la tabla en Markdown lista para pegar en la Biblia.

Es un botón y no un comando de consola a propósito: **Chrome bloquea el pegado
en la consola** (la protección contra self-XSS, que pide escribir `allow
pasting`), y un dato que sólo se saca escribiendo es un dato que no se saca.

> **No se esconde fuera del formulario.** Nació condicionado a
> `estaEnFormularioIva()` y el día que hizo falta no apareció — la detección es
> justo lo que puede fallar. Un botón que a veces no está es peor que uno que a
> veces abre un panel diciendo que no hay nada que leer. Misma lección que el
> `offsetParent` de los modales: no condicionar lo visible a una detección
> frágil. Si el portapapeles tampoco responde, el panel muestra el
texto ya seleccionado para un Ctrl+C.

Desde la consola sigue estando como `sriMapaCasilleros({ desde, hasta })`.

> ⚠️ **No envolver estas funciones en `window.<mismo nombre>`.** El bundle es
> una concatenación sin IIFE, así que toda función de nivel superior **ya es**
> `window.<nombre>`. Reasignarla con un envoltorio que la llama por su propio
> nombre se llama a sí mismo hasta reventar la pila. Pasó el 06-sep-2026 y lo
> cazó el banco, no la lectura. Un alias sólo vale si el nombre es distinto
> (`sriLeerXml`, `sriBajarXml`).

Con esa salida se cierran de una sola vez el 540/550, el 502/512 y el resto del
`fieldMap`. Es el único camino que no viola la §5b.

Banco de pruebas: `extenciones web/01_Nueva_Luz_3.0/tests/iva5.html`
(30 comprobaciones, todas en verde el 05-sep-2026). Se sirve con la
configuración `bancos-extension` de `.claude/launch.json`, que levanta la
carpeta de la extensión en `localhost:8791`; el banco queda en
`/tests/iva5.html`. Hace falta el servidor: los `file://` no ejecutan
scripts en el panel del navegador.

### 9b. Cómo decide qué va a cada uno

Con la base de proveedores de la §7:

    factura recibida
        ├─ proveedor con derecho a crédito  → 500/510 (15%) · 540/550 (5%) · 507/517 (0%)
        └─ proveedor sin derecho a crédito  → 502/512

Y la misma regla de siempre: **si no se sabe, no se inventa.** Un proveedor sin
clasificar va donde va hoy, queda en la lista de pendientes, y no se lo manda
al 502 por las dudas — mandarlo ahí le quita al contribuyente un crédito que
quizá le corresponde.

---

## 10. Los datasets del SRI — https://www.sri.gob.ec/datasets

Consultada la página el 05-sep-2026. Hay más de lo que el proyecto está usando.

### Lo que sirve, en orden

**1 · Catastro RUC por provincia** — *ya se tiene el de El Oro*
ZIP con CSV, una descarga por provincia. Trae RUC, razón social y actividad
económica. Es la fuente de la base de proveedores de la §7. Viene con un
**Diccionario RUC** que documenta las columnas: leerlo antes de parsear.

**2 · Empresas fantasmas** — *pendiente, y NO está en el archivo que tenemos*

> ⚠️ **Corrección del 06-sep-2026.** Acá decía que el catastro provincial trae
> la clasificación de empresas fantasma. **No la trae.** Las 21 columnas del
> ZIP de El Oro están listadas abajo y ninguna es esa: la lista de fantasmas es
> un dataset aparte en sri.gob.ec. Queda pendiente bajarlo.

Cuando esté: si un cliente recibió una factura de una empresa marcada como
fantasma, esa compra no es deducible y el SRI la va a objetar. Un aviso **antes
de declarar** protege la firma del contador. Encaja con el resto de frenos del
proyecto: no impedir, avisar y dejar decidir.

Mientras tanto, el **estado del contribuyente** sí está y ya se usa: un
proveedor SUSPENDIDO o PASIVO que sigue emitiendo es la misma señal, más
débil pero real. Ver §10a.

**3 · Agentes de retención**
También en el catastro. Dice si un proveedor debía retener, lo que se cruza
con las retenciones que efectivamente aparecen.

**4 · Contribuyentes activos**
Un proveedor dado de baja que sigue emitiendo es una señal de alerta.

**5 · Ventas-compras (F104) por tarifa, provincia y actividad**
Datos agregados, no por RUC. No sirve para clasificar, pero sí para comparar:
un cliente cuyas compras se desvían mucho del promedio de su actividad y
provincia es un caso a revisar antes de presentar.

### 10a. El catastro, adentro de la extensión — hecho el 06-sep-2026

Las **21 columnas** del ZIP de El Oro:

```
NUMERO_RUC · RAZON_SOCIAL · CODIGO_JURISDICCION · ESTADO_CONTRIBUYENTE
CLASE_CONTRIBUYENTE · FECHA_INICIO_ACTIVIDADES · FECHA_ACTUALIZACION
FECHA_SUSPENSION_DEFINITIVA · FECHA_REINICIO_ACTIVIDADES · OBLIGADO
TIPO_CONTRIBUYENTE · NUMERO_ESTABLECIMIENTO · NOMBRE_FANTASIA_COMERCIAL
ESTADO_ESTABLECIMIENTO · DESCRIPCION_PROVINCIA_EST · DESCRIPCION_CANTON_EST
DESCRIPCION_PARROQUIA_EST · CODIGO_CIIU · ACTIVIDAD_ECONOMICA
AGENTE_RETENCION · ESPECIAL
```

`tools/construir_catastro.py` lo reduce a dos archivos en `vendor/`:

| Archivo | Qué es | Peso |
| :--- | :--- | ---: |
| `catastro_eloro.txt` | 283.879 RUC, **ancho fijo y ordenado**: RUC(13) + CIIU(7) + estado(1) + agente(1) | 6,2 MB |
| `ciiu.json` | los 1.302 códigos CIIU presentes → su descripción | 0,23 MB |

**No se guarda la razón social**: ya la da el portal en cada factura, y
duplicaría el archivo sin agregar nada. Una fila por RUC, la de la matriz
(establecimiento `001`).

`Catastro` en `02_servicios_y_memoria.js` lo trae **bajo demanda**, igual que
jsPDF — 166 ms medidos. Y **no arma un Map de 283.000 entradas**: el archivo
viene ordenado y de ancho fijo, así que busca por bisección sobre el texto,
~18 comparaciones por consulta y sin inflar el heap del content script.

`Proveedores.sugerirDesdeCatastro()` completa la **actividad** de cada
proveedor pendiente, con `origen: 'catastro'`.

> **Sólo la actividad.** El catastro dice a qué se dedica un RUC; **no** dice si
> esa compra es deducible — eso depende del gasto y lo decide el contador.
> Poner `deducible` desde acá sería inventar un dato. Y por la regla de la §7,
> nada de esto pisa lo que el contador ya haya decidido.

El **estado** sí se usa como aviso: un proveedor SUSPENDIDO o PASIVO que sigue
emitiendo aparece con bandera roja en el panel 🏷️. No impide nada; avisa.

Estados en El Oro: ACTIVO 161.808 · SUSPENDIDO 148.867 · PASIVO 31.343.

Banco: `tests/catastro.html` (31 comprobaciones, verdes el 06-sep-2026). Usa
RUC reales de los **bordes** de la lista, que es donde una bisección mal
escrita se equivoca.

### Cómo se usa un archivo de un GB

No entero. Para clasificar solo hacen falta **dos columnas**: RUC y actividad.

    catastro provincial      ~1 GB   (todas las columnas)
        ↓ reducir una vez, leyendo en streaming
    RUC + código de actividad  ~7 MB
        ↓ gzip
                              ~1-2 MB

Ese tamaño entra como recurso de la extensión cargado **bajo demanda**, el
mismo patrón que ya usa `jsPDF` (355 KB en `vendor/`, fuera del bundle, traído
por `ensureJsPdfLoaded()` solo cuando hace falta). Nunca dentro de
`build/content.js`, que se inyecta en cada página del SRI.

### Lo que el archivo no cubre

Los contribuyentes **nuevos**, y los de **otras provincias**. Para esos queda
el interruptor de la §7: preguntar, o seguir y dejarlos pendientes.

El endpoint `movil-servicios/api/v1.0/contribuyente/{RUC}` podría cubrirlos,
pero está detrás de un WAF: probado el 05-sep-2026 desde curl con cabeceras
completas de Chrome y por `corsproxy.io`, las dos veces rechazado. Falta
probarlo desde un content script en el portal, con la sesión del usuario —
que es el único contexto donde tiene chance de pasar.

> ⚠️ **`corsproxy.io` dejó de ser gratuito.** `fetchSRIPublicData()` en
> `services/sri.ts` lo sigue usando y hoy devuelve HTTP 403
> (`keyless_legacy_url`). Todo lo que dependa de esa función —autocompletar al
> crear un cliente, validar un RUC— está fallando en producción.

### Sobre extensiones de terceros

Se evaluó una extensión de terceros que ofrece consultas gratis. Consulta
contra el servidor de su autor, o sea que ese tercero vería los RUC de los
proveedores de todos los clientes del estudio — con quién opera cada
contribuyente. Teniendo el catastro en disco propio, no hay motivo para mandar
eso afuera. Descartada.

---

## 9c. La barra flotante: qué se ve y qué no

Llegó a **diecisiete controles**. Diecisiete íconos sueltos encima del portal
no se leen: se tropiezan, y el que hay que apretar cuando algo va mal queda
perdido entre los demás.

**A la vista quedan los del lote** — arrancar/pausar (▶), paso a paso (🏃), el
estado, declarar al que está logueado (🎯), omitidos (⚠️), saltar (⏭️), cerrar
(🏁), el cajón (🧰) y **🛑 Detener**, que es el único rotulado con palabras.

**El resto vive en el cajón 🧰**, en su propia línea y **con el rótulo escrito
debajo** de cada ícono: Comprobantes · Registro · La cola · Bitácora ·
Proveedores · Notas de venta · Casilleros · Ir a… · **Chequeo** · Probar
subida · Panel.

### Los bancos de prueba, en una sola página

`tests/index.html` corre **los ocho** en iframes y da un veredicto solo:
**271 comprobaciones, verdes el 06-sep-2026**, en unos 16 segundos.

De a uno, no en paralelo: ocho bancos a la vez se pisan el almacenamiento
simulado y el resultado dejaría de significar nada. Lee el `<pre id="out">` de
cada uno, así que un banco nuevo no necesita saber que esta página existe —
alcanza con agregarlo a la lista `BANCOS`.

| Banco | Qué cuida |
| :--- | :--- |
| `iva5` | que una compra al 5% no se declare como 15%, el XML, la botonera |
| `catastro` | la bisección, sobre todo en los bordes |
| `proveedores` | que una sugerencia no pise al contador |
| `notasventa` | que un silencio no se convierta en un cero |
| `chequeo` | que avise de lo que va a morder, sin filtrar claves |
| `esperas` | que se siga apenas el portal contesta |
| `subidas` | que «Failed to fetch» diga algo accionable |
| `claves` | que la pantalla nunca muestre el valor guardado |

### 🩺 El chequeo

`Chequeo.correr()` en `02_servicios_y_memoria.js`. Contesta «¿está todo listo
para correr el lote?» **antes** de arrancar, en vez de descubrirlo en el cliente
número doce.

Mira, todo de fuentes que ya existían: la versión · el portal · la cola · **la
marca `iva_sin_ubicar`** · los omitidos · si hay claves guardadas (sin
mostrarlas) · el catastro · los proveedores sin clasificar · el interruptor de
notas de venta · y la subida, contra la red.

Tres estados y ninguno más — `ok`, `aviso`, `problema` — y **cada uno dice qué
hacer**: un diagnóstico que no dice qué hacer no sirve de nada. En el panel, lo
que muerde va arriba: nadie lee veinte líneas buscando la roja.

El que más veces va a salvar una tarde es `iva_sin_ubicar`: si quedó pegada de
una corrida anterior, el cierre mágico **no envía nada** y no es obvio por qué.

Banco: `tests/chequeo.html` (26 comprobaciones, verdes el 06-sep-2026).

Los botones **no se recrean: se mueven** con `appendChild` después de armar el
`innerHTML`. Así los handlers, que se enganchan buscando por id, siguen
funcionando sin tocarlos — y no hay dos copias del mismo botón dando vueltas.

`pintar()` esconde la **celda** entera cuando una herramienta no corresponde
(🧾 sin nadie logueado), no sólo el botón: si no, quedaba el rótulo huérfano
flotando debajo de nada.

---

## 10a. Dónde viven las claves

**Nunca en `shared_config.js`.** Ese archivo viaja dentro de la extensión y
está en el repositorio: una clave ahí es una clave publicada, y el historial de
git no se deshace. La de R2 se coló así y hay que rotarla igual.

Van en `chrome.storage.local`, que no se versiona ni se distribuye. Se cargan
desde la **página de Ajustes** (`options.html`, declarada como `options_ui` en
el manifest): clic derecho en el ícono → *Opciones*, desde `chrome://extensions`
→ *Detalles*, o con el botón **⚙️ Ajustes y claves** del popup.

No están en el popup a propósito: el popup es chico y se cierra solo al perder
el foco. Pegar una clave ahí es incómodo y fácil de perder.

La página tiene además un botón **🔌 Probar ahora** que corre el diagnóstico de
subida y muestra por qué falla cada camino, sin subir ningún comprobante real.

Llaves:

| Llave | Qué guarda | Quién la lee |
| :--- | :--- | :--- |
| `sc_r2_credenciales` | `R2_SECRET_ACCESS_KEY` | `credencialesR2()` en `background.js`, por encima de `shared_config.js` |
| `sc_ia_credenciales` | `apiKey` | la clasificación de proveedores (§7), cuando exista |

Reglas de la ventana, probadas en `tests/claves.html`:

- Los campos son `type="password"` y `autocomplete="off"`.
- **Nunca se muestra el valor guardado**: solo si hay uno, cuántos caracteres
  tiene y sus últimos seis. Alcanza para saber cuál está puesta y no alcanza
  para nada más.
- Un campo vacío significa «no la toques», no «borrala». Para borrar hay un
  botón que lo dice.
- Al guardar, el campo se vacía: la clave no queda en el DOM.

> Una clave pegada en un chat, un correo o un ticket ya está comprometida:
> hay que anularla y generar otra, aunque nunca se haya escrito en un archivo.

### Rotar la de R2 — el camino, que no es el obvio

Los tokens de R2 **no** se crean desde *Mi Perfil → API Tokens*. Esa pantalla
genera un **Bearer token** de la API de Cloudflare, y la subida usa **firma
S3**, que necesita otra cosa: un par *Access Key ID + Secret Access Key*.

El único lugar que devuelve credenciales S3 es
**R2 Object Storage → Manage R2 API Tokens → Create API Token**, con permiso
*Object Read & Write* y alcance limitado al bucket.

**Al rotar cambian los DOS.** Guardar sólo el secreto deja el Access Key ID
viejo en `shared_config.js` y la firma falla igual — por eso Ajustes tiene los
dos campos y el 🩺 avisa cuando quedó a medias.

Y la rotación **no termina al crear el token nuevo**: termina al **borrar el
viejo**. Mientras siga vivo, la clave del historial de git sigue sirviendo.

> **Pendiente**: cuando la subida funcione con la clave del almacén, sacar el
> valor de `R2_SECRET_ACCESS_KEY` de `shared_config.js`. Hoy sigue ahí porque
> es el único respaldo mientras la rotación no esté hecha.

---

## 10b. Esperar al portal, no contar hasta tres

Un `sleep(2500)` es una apuesta a dos puntas: **sobra** cuando el SRI responde
en 300 ms —y eso, multiplicado por 500 contribuyentes, son horas— y **falta** el
día que el portal está cargado, y entonces el paso falla por impaciencia y el
cliente queda sin declarar.

`esperarAjaxSri(condicion, label, tope)` en `02_servicios_y_memoria.js` hace las
dos cosas bien: sigue apenas la respuesta llega, y aguanta más que antes si
tarda. Tres tramos:

1. Se le da un momento (400 ms) al velo de PrimeFaces para aparecer. Que **no**
   aparezca es normal — se sondea a mano, no con `waitFor()`, que dejaría un
   aviso de timeout falso en cada llamada.
2. Se espera a que el velo se vaya.
3. Se espera a que esté en el DOM lo que se estaba esperando. Sin esto, «el velo
   se fue» no quiere decir que lo nuevo ya se haya pintado.

Hereda la pausa de `waitFor()`: si el contador aprieta ⏸, esperar se queda
quieto. Probado.

### Cuánto cuesta de verdad la espera fija

Medido el 06-sep-2026, y no es lo que parecía a simple vista:

| | sleeps | tiempo |
| :--- | ---: | ---: |
| Totales en `src/` | 135 | 128,2 s |
| **Tras `location.href`** | 5 | 19,5 s — **no cuestan**: la página se va y el script muere |
| **Cuestan de verdad** | 130 | **108,8 s** |

Ya convertidos: las cinco de Consulta de declaraciones (el bucle que más
vueltas da: una por período, por cliente) y las tres de paginación de tablas.

Las tres de paginación eran tiempo muerto puro: `irSiguientePagina()` **ya
espera** de forma reactiva a que la página cambie —número del paginador o
contenido de la primera celda—, hasta 8 s. El `sleep` de después no agregaba
ninguna garantía.

> **Las del Cierre Mágico (`06_panel_interfaz.js` 1398, 1421, 1433, 1502) NO se
> tocaron.** Son la secuencia de envío y la §4 pide probarlas rigurosamente.
> Cambiarlas sin el portal delante es exactamente donde no hay que ahorrar.

---

## 11. El XML del comprobante — la tarifa dicha, no deducida

> **Estado**: parser y descarga construidos y probados (05-sep-2026).

### Por qué

El cociente IVA/base deduce la tarifa cuando la factura es de una sola tarifa.
Cuando trae líneas mezcladas no puede: $100 con un tercio al 15% da 4,95% y se
lee como 5% (§9a). El XML no deduce nada — trae la base y el IVA **separados
por tarifa**, tal como los declaró quien emitió.

### Lo que ya está

`parsearXmlComprobante(xmlTexto)` en `04_extraccion_datos.js`. Acepta el
comprobante suelto (`<factura>`, `<notaCredito>`) y también la respuesta de
autorización, que lo trae envuelto en un CDATA. Devuelve:

```js
{ claveAcceso, rucEmisor, razonSocial, codDoc, esNotaCredito, fechaEmision,
  porTarifa: { '15': {base, iva}, '0': {base, iva}, '5': {…} },
  totalSinImpuestos, importeTotal, tarifasDesconocidas: [] }
```

`repartirXmlEnResumen(resumen, xml)` lo vuelca en los baldes 0 / 5 / plena y
devuelve `false` si el XML traía un `codigoPorcentaje` que no se reconoce —
que **no se reparte a ojo**, se anota.

Desde la consola: `sriLeerXml(texto)`.

**Códigos de `<codigoPorcentaje>`** (esquema de comprobantes electrónicos):

| Código | Tarifa | | Código | Tarifa |
| :---: | :--- | :--- | :---: | :--- |
| `0` | 0% | | `5` | **5%** |
| `2` | 12% | | `6` | no objeto de IVA |
| `3` | 14% | | `7` | exento |
| `4` | 15% | | `10` | 15% |

El `6` y el `7` **no son «tarifa cero»**: son transferencias que no gravan. Van
al 507/517 igual que el 0% porque el formulario no los separa, pero se cuentan
aparte por si hace falta. `<codigo>` `2` es IVA; `3` es ICE y no debe tocar
las bases de IVA (probado).

`<codDoc>`: `01` factura · `04` nota de crédito · `05` nota de débito ·
`03` liquidación de compra · `07` comprobante de retención.

### De dónde se baja — resuelto, y estaba a mano

El endpoint ya estaba en una traza que teníamos desde el 04-sep-2026 («flujo de
reportes de documentos electrónicos recibidos»). **No hizo falta traza nueva.**

Cada fila de `tablaCompRecibidos` trae dos enlaces, `lnkXml` y `lnkPdf`, y no
son AJAX: `mojarra.jsfcljs` manda el formulario entero con el id del enlace
como parámetro — el mismo mecanismo de `lnkTxtlistado`, que ya reproducíamos.
Ver la Biblia, «El XML de cada comprobante — `lnkXml`».

```js
descargarXmlComprobante(N)                 // una fila
traerXmlDeComprobantes([2, 7, 11])         // varias, de a una y con pausa
sriBajarXml(3)  ·  sriBajarXml([2, 7])     // desde la consola
```

Se reproduce el POST en vez de pulsar el enlace, así el archivo no baja al
disco del usuario. Si la sesión caducó el portal devuelve HTML en vez del
comprobante, y eso se detecta antes de parsear.

**No hay un enlace de «bajar todos»**: es una petición por comprobante. Por eso
`traerXmlDeComprobantes()` pausa 700 ms entre una y otra y corta a las 40. Una
ráfaga de 27 XML × 27 contribuyentes es la clase de cosa que termina en un
bloqueo del WAF.

> El servicio público de autorización (`AutorizacionComprobantesOffline`, SOAP
> sobre `cel.sri.gob.ec`) queda descartado: es otro origen, necesitaría
> `host_permissions` y salir por el service worker, y no aporta nada que el
> enlace de la propia página no dé con la sesión ya abierta.

### Cuándo conviene bajarlo — y cuándo no

No hace falta un XML por factura. El cociente resuelve la gran mayoría solo.
El XML se pide para las pocas que lo necesitan:

- las que quedaron **sin tarifa reconocible** (`resumen.ambiguas`),
- las que el cociente leyó como **5%**, para confirmar que no son mezcladas,
- y las candidatas a **activo fijo**, donde además se quiere ver *qué* se compró.

Con eso son unas pocas peticiones por cliente, no 27.

---

## 12. Sobre el informe técnico del 05-sep-2026

Llegó un documento externo («Especificación Técnica de Automatización:
Formulario 104 de IVA»). **Tiene partes correctas y partes equivocadas, y se
contradice a sí mismo.** Queda anotado para que nadie lo tome como fuente.

### Lo que sí sirve

- La estructura del XML: `totalConImpuestos/totalImpuesto` con `codigo`,
  `codigoPorcentaje`, `baseImponible` y `valor`. Coincide con lo que ya lee el
  modal de notas de crédito.
- `codDoc` `01` factura / `04` nota de crédito.
- La idea de tomar `<baseImponible>` y `<valor>` en vez de recalcular el
  impuesto, para no arrastrar redondeos.

### Lo que NO hay que copiar

| Dice el informe | Qué pasa |
| :--- | :--- |
| `411` = «Ventas Locales Tarifa 0%» (en el código Python) | **Se contradice con su propia tabla**, que pone 411 = ventas netas 15%. Lo confirmado en el DOM es `411 → concepto460`, ventas tarifa ≠ 0% neto. |
| `503 / 513 / 523` para compras sin derecho a crédito | Se contradice con su propia tabla, que dice `502 / 512 / 522`. |
| `553` factor de proporcionalidad · `554` crédito aplicable | Lo confirmado en el DOM es **`564`** (`concepto2130`, crédito según factor) y **`565`** (`concepto1276`, IVA no considerado como crédito). |
| `607` = arrastre de retenciones | Lo confirmado es **`606`** (`concepto2170`). El `605` sí coincide. |
| `429` = IVA de ventas 15% | Lo confirmado son `421` (`concepto470`), `422` activo fijo y `425` otros. |
| factor = `(411+412+415+416+417+418)/419` | Mete el `415`, que su propia tabla define como ventas 0% **sin** derecho a crédito. Por definición no va en el numerador. |
| «multa de USD 31.25» | Cifra suelta, sin respaldo. |

**Regla**: ese documento describe una versión del formulario que no es la que
tenemos delante. Ningún casillero de ahí entra al `fieldMap` sin pasar antes
por `sriMapaCasilleros()` y por la Biblia.


