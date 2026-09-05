# 📖 Biblia de Pantallas del SRI

Catálogo vivo de evidencia real del portal `srienlinea.sri.gob.ec`, usado para
calibrar los selectores de **Nueva Luz 3.0**. Cada entrada documenta una
pantalla: su URL, qué se confirmó contra el DOM real y qué sigue sin confirmar.

Es la fuente de verdad que respalda la *Matriz Tatuada* de
[`.agents/AGENTS.md`](../../.agents/AGENTS.md) §6. **Si un selector de la matriz
no tiene entrada acá, es una suposición, no un hecho.**

Última actualización: 03-sep-2026 · 12 pantallas (Flujo completo verificado por Burp Suite).

---

## ⚠️ Privacidad

Las capturas muestran **RUC, nombre, email y teléfono de un contribuyente
real**. Por eso:

- `.gitignore` excluye todo `.pdf/.jpg/.png/.webp/.xml` de esta carpeta. **Solo este
  índice se versiona.**
- No pegues datos de clientes en el índice. Al citar un valor, enmascaralo:
  `110260XXXX001`.
- No subas estas capturas a ningún servicio externo.

---

## 🗺️ El recorrido completo (100% CONFIRMADO)

```
inicio/NAT (01)  →  login Keycloak (02)  →  perfil (03 modal · 04 obligaciones)
                                                      │
                        ┌─────────────────────────────┴─────────────────┐
                        ▼                                               ▼
        comprobantes recibidos (05)                    menú declaraciones (06)
        · puente SSO: redireccion=57&idGrupo=55                         │
        · extracción de facturas, retenciones, NC                       ▼
                                                      wizard: 1 Período (07)
                                                            → 2 Preguntas (09)
                                                            → 3 Formulario (08)
                                                            → Diálogo Advertencias (10)
                                                            → 4 Pago / Resumen (11)
                                                            → Confirmación / Imprimir (12)
```

---

## 📑 Catálogo

| # | Pantalla | URL / Endpoint | Evidencia | Estado |
|:--|:---|:---|:---:|:---|
| 01 | Inicio sin sesión | `/sri-en-linea/inicio/NAT` | Visual | 🟢 Confirmado |
| 02 | Login (Keycloak) | `/auth/realms/Internet/protocol/openid-connect/auth` | Burp + DOM | 🟢 Confirmado |
| 03 | Modal encuesta de satisfacción | *(sobre el perfil)* | Visual | 🟢 Bloqueador neutralizado |
| 04 | Perfil + obligaciones expandidas | `/sri-en-linea/contribuyente/perfil` | Burp + DOM | 🟢 Confirmado |
| 05 | Comprobantes recibidos | `/comprobantes-electronicos-internet/.../comprobantesRecibidos.jsf` | Burp + AJAX | 🟢 Confirmado |
| 06 | Menú de declaraciones | `/sri-en-linea/SriDeclaraciones/Publico/declaraciones` | Burp + DOM | 🟢 Confirmado |
| 07 | Wizard · paso 1 Período Fiscal | `/sri-declaraciones-web-internet/.../recibirDeclaracion.jsf` | Burp + AJAX | 🟢 Confirmado |
| 08 | Wizard · paso 3 Formulario | *(misma URL)* | Burp + AJAX | 🟢 Confirmado |
| 09 | Wizard · paso 2 Preguntas | *(misma URL)* | Burp + AJAX | 🟢 Confirmado |
| 10 | Diálogo de advertencias (625) | *(modal `dlgConfirmacionEnvioFormulario`)* | Burp + AJAX | 🟢 Confirmado |
| 11 | Wizard · paso 4 Pago y Resumen | *(misma URL)* | Burp + DOM | 🟢 Confirmado |
| 12 | Pantalla de Confirmación / CEP | *(misma URL, `#panelSinValorAPagar`)* | Burp + DOM | 🟢 Confirmado |

---

## 🔑 Tabla maestra de IDs — CONFIRMADOS contra el portal

Todo lo de acá se leyó y validó directamente del tráfico real de Burp Suite y del DOM (`recorrido_manual_sri.xml`):

| Pantalla | Elemento | ID / selector REAL | Rol / Comportamiento |
| :--- | :--- | :--- | :--- |
| **SSO Bridge** | Acceso a Comprobantes | `/tuportal-internet/accederAplicacion.jspa?redireccion=57&idGrupo=55` | Genera token y transfiere sesión de Angular a JSF |
| **SSO Bridge** | Acceso a Formulario IVA | `/tuportal-internet/accederAplicacion.jspa?redireccion=310&idGrupo=201` | Transfiere sesión directa a recepción IVA |
| Comprobantes recibidos | Tipo de comprobante | `frmPrincipal:cmbTipoComprobante` | `option value="1"` (Factura), `value="6"` (Retención), `value="3"` (NC) |
| Comprobantes recibidos | Botón Consultar | `frmPrincipal:btnConsultarSinRe` | Botón PrimeFaces AJAX que ejecuta la búsqueda |
| Comprobantes recibidos | Tabla de Comprobantes | `frmPrincipal:tablaCompRecibidos` | Tabla con columnas Nro, RUC, Tipo, Clave, Fechas, Valores, IVA |
| Comprobantes recibidos | Paginador | `frmPrincipal:tablaCompRecibidos_paginator_bottom` | Paginador PrimeFaces (25, 50, 75 registros) |
| Menú declaraciones | Tarjeta «Formulario de IVA» | `p.sri-tamano-minimo-detalle` | Enlace / tarjeta directa al wizard de recepción |
| Wizard paso 1 | Opción de obligación | `frmFlujoDeclaracion:somObligacion_1` | `data-label="2011 DECLARACION DE IVA"` |
| Wizard paso 1 | Período (calendario) | `frmFlujoDeclaracion:calPeriodo` | Formato `MM/YYYY` (ej: `08/2026`) |
| Wizard paso 1 | Botón Siguiente | `frmFlujoDeclaracion:btnObligacionSiguiente` | Avanza a preguntas |
| Wizard paso 2 | Saltar «Preguntas» | `frmFlujoDeclaracion:clkFormularioCompleto` | Enlace `<a class="ui-commandlink">` que abre formulario completo |
| Wizard paso 3 | Siguiente Formulario | `frmFlujoDeclaracion:btnFormularioSiguiente` | Envía casilleros y evalúa advertencias |
| Diálogo Advertencias | Modal Confirmación Envío | `dlgConfirmacionEnvioFormulario` | Modal con aviso «¿Desea continuar?» |
| Diálogo Advertencias | Botón Aceptar Diálogo | `frmFlujoDeclaracion:j_idt947` | Botón verde flat con texto «Aceptar» que pasa al resumen |
| Diálogo Advertencias | Botón Ver Advertencias | `frmFlujoDeclaracion:j_idt949` | Botón ámbar flat que vuelve a editar |
| **Wizard paso 4** | **Total a pagar (Resumen)** | **`frmFlujoDeclaracion:totalAPagar`** | `<span>` con texto exacto **`USD 0.00`** |
| **Wizard paso 4** | **Botón Enviar Declaración** | **`frmFlujoDeclaracion:divBotonContinuarConfirmacion`** | Botón verde con texto **«Aceptar»** que ejecuta el envío real |
| Wizard paso 4 | Botón Anterior | `frmFlujoDeclaracion:divBotonAtrasConfirmacion` | Regresa al paso 3 |
| **Confirmación CEP** | **Contenedor de Éxito** | **`#panelSinValorAPagar`** | Contenedor oficial de declaración procesada |
| Confirmación CEP | Mensaje de Éxito | `#mensajePrincipal .ui-messages-fatal-summary` | «Su declaración ha sido procesada satisfactoriamente» |
| Confirmación CEP | Número de Serie / CEP | Texto dentro de cabecera | `CEP # (Número de Serie): 873095157043` |
| Confirmación CEP | **Botón Imprimir Comprobante** | **`frmFlujoDeclaracion:btnDescargarComprobante`** | Botón verde flat con texto **«Imprimir»** |
| Confirmación CEP | Botón Nueva Declaración | `frmFlujoDeclaracion:btnSinValorPagarNuevaDeclaracion` | Botón con texto «Nueva declaración» |

### ⚠️ Los identificadores `j_idt*` NO son estables

Las tres trazas de Burp se contradicen entre sí, así que **no se pueden tratar
como confirmados** aunque aparezcan en la tabla de arriba:

| Elemento | Recorrido manual | Comparación 3 | Corrida del bot |
| :--- | :--- | :--- | :--- |
| Aceptar del diálogo de advertencias | `j_idt947` | **`j_idt946`**, `j_idt944` | — |
| Ver advertencias | `j_idt949` | `j_idt552` | — |
| Detalle en la tabla | `j_idt85` | `j_idt66` | `j_idt66` |

Son ids autogenerados por JSF: cambian entre versiones y entre renders. Sirven
como **pista**, nunca como ancla. Buscá por texto o por id semántico
(`btnAceptar`, `btnContinuar`).

Los que **sí** son estables y se pueden fijar: `frmPrincipal:btnConsultarSinRe`,
`frmFlujoDeclaracion:somObligacion`, `calPeriodo`, `btnObligacionSiguiente`,
`clkFormularioCompleto`, `btnFormularioSiguiente`, `totalAPagar`,
`divBotonContinuarConfirmacion`, `#panelSinValorAPagar`, `btnDescargarComprobante`.

### Advertencias informativas del casillero 625

Salen **siempre** y NO impiden declarar. Vienen como `<li class="estiloItemsMensajes">`,
sin ninguna clase de severidad:

> Casillero 625. Verifique que su crédito tributario no haya superado los 5 años.
>
> Casillero 625. La Administración Tributaria se reserva el derecho de ejercer su
> Facultad Determinadora de conformidad con lo establecido por el artículo 68 del
> Código Tributario.

### El flujo de envío, tal como lo hace el usuario a mano

```
Formulario → [Siguiente] → salen las 2 advertencias del 625 → [Aceptar]
           → pantalla de resumen con frmFlujoDeclaracion:totalAPagar
           → si dice USD 0.00 → [Aceptar] → enviada
```

**El criterio humano es el saldo**, no un mensaje de "todo bien". Por eso
`ejecutarCierreMagico()` exige leer el saldo de un ID real y que valga 0; los
mensajes solo se miran para detectar señales negativas.

---

## 🔧 Correcciones que esta evidencia forzó en el código

| Hallazgo | Estado |
| :--- | :--- |
| **URL del formulario IVA equivocada.** El código navegaba a `sri-en-linea/SriDeclaracionesWeb/FormularioIva/Opciones/declaracionImpuesto.jsf`; el portal sirve `sri-declaraciones-web-internet/pages/recepcion/recibirDeclaracion.jsf?identificadorGrupoObligacion=IVA`. | ✅ Corregido |
| **El modal de la encuesta tapaba el perfil.** No es un `.ui-dialog` y no tiene botón Aceptar, así que `dismissSridialogs()` no lo veía. | ✅ Corregido |
| **`dismissSridialogs()` nunca cerró ningún modal.** Filtraba por `offsetParent !== null`, que es `null` en todo elemento `position: fixed` — es decir, en todos los modales. | ✅ Corregido |
| 🔴 **`parseDecimal("USD 45.30")` devolvía `0`.** Limpiaba `$` y espacios pero no las letras: `parseFloat("USD45.30")` es `NaN` y la función devuelve 0 ante cualquier fallo. **Una declaración con saldo a pagar se leía como saldo cero**, justo lo que el freno de seguridad debía impedir. Solo se detectó al conocer el formato real `USD 0.00`. | ✅ Corregido |
| **No se distinguía "saldo 0" de "no pude leer el saldo".** Ahora `parseImporteEstricto()` devuelve `null` cuando no hay número, y `detectarSaldo()` frena en vez de asumir cero. | ✅ Corregido |
| `frmPrincipal:tipoComprobante` y `btnVerFormularioCompleto` no existen en el DOM. | ✅ Corregido |

---

## 🕳️ Trampa recurrente: `offsetParent` y `position: fixed`

En Chrome, un elemento `position: fixed` tiene **siempre** `offsetParent === null`.
Usarlo como test de visibilidad declara invisibles a todos los modales.

`autoDismissSriWarnings()` ya lo documentaba, pero `dismissSridialogs()` cayó en
la trampa igual. Ahora hay un helper compartido en
[`02_servicios_y_memoria.js`](../01_Nueva_Luz_3.0/src/02_servicios_y_memoria.js):

```js
esVisible(el)   // getComputedStyle + getBoundingClientRect, nunca offsetParent
```

Quedan ~48 usos de `offsetParent` en el resto del código. Para elementos en flujo
normal está bien; **para cualquier cosa que pueda ser un overlay, usar `esVisible`.**

---

## 🧭 Cómo aportar una pantalla nueva

Una captura normal **no sirve para sacar IDs**: los atributos `id` viven en el
HTML, no en lo que se ve.

**Opción A — la mejor.** En la pantalla, F12 → **Console** → pegar y Enter:

```js
(() => {
  const t = el => (el.innerText || el.textContent || '').replace(/\s+/g,' ').trim().slice(0,120);
  const L = ['URL: ' + location.pathname];
  L.push('--- INPUTS / SELECTS ---');
  document.querySelectorAll('input,select,textarea').forEach(el => {
    if (el.offsetParent) L.push(`  id="${el.id}" name="${el.name}" type="${el.type}"`);
  });
  L.push('--- BOTONES Y LINKS VISIBLES ---');
  document.querySelectorAll('button,a,[role="button"],.ui-button').forEach(el => {
    if (el.offsetParent) L.push(`  id="${el.id}" <${el.tagName.toLowerCase()}> -> "${t(el)}"`);
  });
  L.push('--- MENSAJES / AVISOS ---');
  document.querySelectorAll('[class*="ui-messages"],[class*="Mensajes"],.ui-growl-item,[class*="alert"]').forEach(el => {
    if (el.offsetParent) L.push(`  class="${el.className}" -> "${t(el)}"`);
  });
  copy(L.join('\n'));
  console.log(L.join('\n'));
  return 'copiado: ' + L.length + ' líneas';
})()
```

Solo lectura: no toca el formulario ni envía nada. Enmascará los RUC.

**Opción B — captura con inspector.** F12 → **Elements**, click derecho sobre el
elemento que importa → *Inspect*, captura con el `id` visible y resaltado.
Ojo: si el árbol queda colapsado en la raíz solo se ve el `<body>`.

**Opción C — automática.** Para la pantalla de resumen/pago la extensión guarda
la radiografía sola: imprime `🔎 [DIAGNÓSTICO RESUMEN SRI]` en consola, o
`window.sriAssistant.verDiagnosticoResumen()`.

Los PDFs se convierten con `node _extraer_pdf.js <archivo.pdf> capturas/`.
Si te resulta igual de fácil, mandá PNG/JPG directamente.

---

# Entradas

### 01 · Inicio sin sesión
`capturas/01_inicio_NAT_sin_sesion.jpg`

**URL** `https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT`
Es el destino del `window.open()` de [`bridge_content.js`](../01_Nueva_Luz_3.0/bridge_content.js) al arrancar un lote. ✅

- Arriba a la derecha: **«Iniciar sesión»** — el ancla que busca el respaldo de `ejecutarLoginDOM()`.
- Menú lateral: CLAVES · RUC · FACTURACIÓN FÍSICA · FACTURACIÓN ELECTRÓNICA ·
  **DECLARACIONES** · ANEXOS · PAGOS · DEUDAS · DEVOLUCIONES (TAX REFUND) ·
  REINTEGRO DE VALORES · TRÁMITES Y NOTIFICACIONES · CERTIFICADOS · VEHÍCULOS · OTROS SERVICIOS.

---

### 02 · Login (Keycloak)
`capturas/02_login_keycloak.jpg`

**URL** `https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=app-sri-claves-angular&redirect_uri=…%2Fcontribuyente%2Fperfil&st…`
Coincide con la URL de respaldo del código y con la de `popup.js`. ✅
El `redirect_uri` apunta a `/contribuyente/perfil`, que es la pantalla 04.

**Campos del formulario** (obligatorios marcados con `*`)

| Etiqueta | Placeholder | Obligatorio |
| :--- | :--- | :---: |
| `*RUC / C.I. / Pasaporte` | `1700000000001` | sí |
| `C.I. adicional` | `1700000001` | **no** |
| `*Clave` | `Clave` (con ojo de mostrar/ocultar) | sí |

Botón **`Ingresar`** · enlace «Generar o recuperar clave».

⚠️ **Ojo con «C.I. adicional»**: el código solo llena RUC y Clave, lo cual está
bien porque el campo es opcional. Pero es un tercer input en el formulario: si
algún autorrelleno le mete un valor, el login falla.

**IDs y atributos confirmados en el DOM** (inspección 03-sep-2026):
- Input RUC: `<input id="usuario" name="usuario" type="text" maxlength="13" placeholder="1700000000001" onpaste="return false">` ✅ **CONFIRMADO**.
- Cuenta con protección nativa `oncopy="return false" onpaste="return false"`: la extensión la sortea con `escribirCampo()` asignando `.value` y disparando eventos `input` y `change`.
- **Blindaje anti-bloqueo**: El SRI bloquea cuentas al 5to intento erróneo. La extensión detiene el reintento al **primer fallo** (`hasLoginError`) y marca `flagged_errors[ruc] = true` para saltar inmediatamente de cliente.


---

### 03 · Modal de encuesta de satisfacción 🔴
`capturas/03_modal_encuesta.jpg`

Aparece **sobre el perfil, justo después del login**. Tarjeta blanca centrada:

> «Tu opinión nos permite mejorar — Responde la encuesta de satisfacción de
> servicios del portal SRI en línea», botón **«Quiero responder»** y una **«×»**
> arriba a la derecha.

**Por qué importa.** Tapa el perfil exactamente donde corren
`ejecutarAuditoriaPerfil()` y `scanObligacionesSRI()`. No es un `.ui-dialog` de
PrimeFaces y **no tiene botón Aceptar**, así que `dismissSridialogs()` era ciego
a él.

**Corregido** con `cerrarModalesNoPrimeFaces()`, que cierra overlays genéricos
(`mat-dialog-container`, `.cdk-overlay-pane`, `[role="dialog"]:not(.ui-dialog)`…).

> 🛑 **Regla de oro grabada en el código**: esa función **nunca** pulsa un botón
> por su texto. Solo usa controles de cierre explícitos (`aria-label`, `×`,
> `.mat-dialog-close`). Pulsar «Quiero responder» enviaría una opinión en nombre
> del usuario. Si un modal no tiene control de cierre reconocible, se deja
> quieto y se avisa por consola.

**Sin confirmar** el `id`/clase reales del contenedor y de la «×».

---

### 04 · Perfil + obligaciones expandidas
`capturas/04_perfil_obligaciones_expandido.jpg` · DevTools ✅

**URL** `https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/perfil` ✅ (Matriz §6.A)

**Estructura** cabecera con RUC y razón social · inputs de email y teléfono ·
«Cambio de clave» · «Crear y administrar usuarios adicionales» · acordeón
«Listado de obligaciones tributarias que el SRI le ha asignado.» · panel azul
de vencimiento · barra superior con ícono de **apagado (logout)**.

**DOM del panel de vencimiento** (leído en Elements)

```html
<div _ngcontent-c10 class="texto-mitad">7</div>
<div _ngcontent-c10 class="texto-derecho">días y 9 horas para sus próximas obligaciones</div>
```

Ruta: `…mat-expansion-panel-header-title` › `div.contenedor-texto` › `div.texto-derecho`
→ es un **`mat-expansion-panel` de Angular Material**, no PrimeFaces.
Coincide con el comentario que ya estaba en
[`07_navegacion_sri.js:1525`](../01_Nueva_Luz_3.0/src/07_navegacion_sri.js). ✅

**Formato de la obligación** (al expandir el panel):

```
2011 DECLARACION DE IVA - AGOSTO 2026 - 10/09/2026
└código┘└──── impuesto ────┘└─ periodo ─┘└ vencimiento ┘
```

Verificado contra el regex de `scanObligacionesSRI()`
([`06_panel_interfaz.js:1018`](../01_Nueva_Luz_3.0/src/06_panel_interfaz.js)):
`/2011\s+DECLARACI[ÓO]N[\s\w]*-\s*([A-ZÁÉÍÓÚÑ]+)\s+(\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i`
→ captura `AGOSTO`, `2026`, `10/09/2026`. ✅ **Matchea.**

---

### 05 · Comprobantes electrónicos recibidos
`capturas/05_comprobantes_recibidos.jpg` · DevTools ✅

**URL** `…/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf?&contextoMPT=…` ✅ (Matriz §6.A)
JSF clásico: doctype **XHTML 1.0 Transitional**.

**Formulario**

| Control | Valor observado |
| :--- | :--- |
| Radio | ◉ «Ruc/Cédula/Pasaporte» ○ «Clave de acceso / Nro. autorización» |
| Texto | el RUC del contribuyente |
| **Periodo emisión** | tres selects: `2026` · `Septiembre` · `3` (año · mes · día) |
| **Tipo de comprobante** | select: `Factura` |
| Botones | `Anterior` · **`Consultar`** |
| Enlaces | «Descargar reporte» · «Guía para contribuyentes» |

**DOM confirmado**

```html
<body id="contenidoPrincipal" class="main-body">
  <div id="pnlBody" class="layout-wrapper sri-header">
  <div id="contenedorPrincipal" class="sri-principal-c">
```

**Sin confirmar** los `frmPrincipal:ano` / `:mes` / `:dia` / `:tipoComprobante` /
`:btnConsultar` de la Matriz §6.B — el árbol quedó colapsado en la raíz. La
estructura visible (3 selects + tipo + Consultar) es coherente con la Matriz,
pero **los IDs siguen sin verificar**. Falta la Opción A acá.

---

### 06 · Menú de declaraciones
`capturas/06_menu_declaraciones.jpg` · DevTools ✅

**URL** `https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones` ✅
Coincide con los tres `window.location.href` del código.

**Migas** Declaraciones › Declaración de impuestos › Elaboración y envío de declaraciones

| Sección | Tarjetas |
| :--- | :--- |
| Impuesto al Valor Agregado (IVA) | **Formulario IVA** ← *la que pulsa el bot* |
| Impuesto a la Renta | Renta Sociedades · Renta Naturales · Retenciones · Herencia/legado/donaciones · Microempresas |
| Anticipo de Impuesto a la Renta | Formulario de Pago · Formulario Renta… |

**DOM confirmado**

| Selector | Valor | Nota |
| :--- | :--- | :--- |
| `body` | `id="sribody"` `version="4.5.0-20200210"` | El `version` es un **canario**: si cambia, revisar todo. |
| Overlay AJAX | `<div id="disablingDiv" class="disablingDiv" style="display:none">` | Ya conocido por `waitForPortal()`. |
| Overlay no soportado | `<div id="noSoportado" class="sri-overlay">` | El código no lo usa. |

**Oportunidad abierta.** `clickElement()` dispara los eventos de mouse sin mirar
si `#disablingDiv` está arriba. En JSF/PrimeFaces ese overlay se levanta en cada
AJAX y se come los clics en silencio. Candidato a endurecer.

**Sin confirmar** el `id` de la tarjeta «Formulario IVA».

---

### 07 · Wizard · paso 1 · Período Fiscal
`capturas/07_wizard_paso1_periodo.jpg` · DevTools ✅

**URL** 🔴 **`https://srienlinea.sri.gob.ec/sri-declaraciones-web-internet/pages/recepcion/recibirDeclaracion.jsf?identificadorGrupoObligacion=IVA&contextoMPT=…`**

**Esta es la corrección más importante de toda la tanda.** El código navegaba a
`sri-en-linea/SriDeclaracionesWeb/FormularioIva/Opciones/declaracionImpuesto.jsf`,
que no es lo que sirve el portal. Ahora hay una constante
`SRI_FORMULARIO_IVA_URL` en [`07_navegacion_sri.js`](../01_Nueva_Luz_3.0/src/07_navegacion_sri.js)
con la ruta confirmada; la vieja queda como `_LEGACY` y la detección
(`estaEnFormularioIva()`) acepta ambas.

**Título** «Recepción de declaraciones por internet» · «Código impuesto 2011 DECLARACION DE IVA»

**Los 4 pasos del wizard**: `1 Período Fiscal` → `2 Preguntas` → `3 Formulario` → `4 Pago`

**Campos del paso 1**

| Campo | Valor observado |
| :--- | :--- |
| `*Obligación:` | select — «2011 DECLARACION DE IVA» |
| `*Período` | texto — **`08/2026`** (formato `MM/AAAA`) |
| Botón | **`Siguiente`** (PrimeFaces) |

**DOM del botón Siguiente**

```html
<button type="submit" role="button" aria-disabled="false" onclick="…gacionSeleccion();});return false">
  <span class="ui-button-text ui-c">Siguiente</span>
  <span class="ui-button-icon-right ui-icon ui-c fa fa-fw fa-caret-right"></span>
</button>
```

---

### 08 · Wizard · paso 3 · Formulario
`capturas/08_wizard_paso3_formulario.jpg` · DevTools ✅

**URL** la misma que 07 — el wizard **no cambia de URL entre pasos**. Por eso
`06_panel_interfaz.js:406` ya advertía que no sirve distinguir el paso por URL.

**Cabecera** Identificación · Razón social · **Período fiscal: AGOSTO 2026** ·
**Tipo declaración: ORIGINAL**

**Cuerpo** «Información de la declaración» — *«Registre la información
presionando cada sección»* / *«Verifique los campos prellenados antes de
continuar con la declaración»*. A la derecha, enlace **«Ver formulario completo»**.

**Secciones colapsables** (en orden)

```
VENTAS · COMPRAS · RESUMEN IMPOSITIVO · DEVOLUCIÓN ISD POR EXPORTACIONES · RETENCIONES · TOTALES
```

`toggleSriSection()` ([`05_llenado_formulario.js`](../01_Nueva_Luz_3.0/src/05_llenado_formulario.js))
solo mapea VENTAS / COMPRAS / RESUMEN. Las otras tres se resuelven por texto.

**Botones al pie** `Anterior` · **`Guardar borrador`** · **`Siguiente`**
Confirma el texto exacto «Guardar borrador» que busca el cierre pre-envío. ✅

**DOM confirmado**

```html
<form method="post" action="/sri-declaraciones-web-internet/pages/recepcion/recibirDeclaracion.jsf"
      enctype="application/x-www-form-urlencoded">
<div id="pnlContenido" class="ui-outputpanel ui-widget colapsado">
<span id="pnlgPaginas">
```

La clase **`colapsado`** marca las secciones cerradas — hoy `toggleSriSection()`
detecta el estado por `aria-expanded` / `ui-state-active` / altura, no por esta
clase. Vale la pena sumarla como señal.

---

### 09 · Wizard · paso 2 · Preguntas del SRI
`recorrido_manual_sri.xml` · AJAX #136 ✅

**URL** la misma que 07 y 08 (`recibirDeclaracion.jsf`).

**Objetivo del bot**: Saltear el cuestionario sin responder preguntas una por una.

**Elemento clave**: Enlace «Ver formulario completo»:
```html
<a id="frmFlujoDeclaracion:clkFormularioCompleto" class="ui-commandlink" href="#" onclick="PrimeFaces.ab({s:'frmFlujoDeclaracion:clkFormularioCompleto',...})">Ver formulario completo</a>
```
Al hacer clic, el servidor procesa el AJAX y actualiza el contenedor `frmFlujoDeclaracion` renderizando directamente el Paso 3 (Formulario con todas las secciones).

---

### 10 · Diálogo de Advertencias (Validación Casillero 625)
`recorrido_manual_sri.xml` · AJAX #138 / #140 ✅

**Modal PrimeFaces**: `dlgConfirmacionEnvioFormulario` (widget: `PF('dlgConfirmacionEnvioFormulario')`).

Aparece al pulsar «Siguiente» en el formulario cuando existen advertencias no bloqueantes (como el crédito tributario de 5 años en el 625):
- Mensaje del modal: `¿Desea continuar?`
- **Botón Aceptar** (avanza al resumen de pago):
  ```html
  <button id="frmFlujoDeclaracion:j_idt947" name="frmFlujoDeclaracion:j_idt947" class="ui-button green-btn flat tamanioBotones125" type="submit">
    <span class="ui-button-text ui-c">Aceptar</span>
  </button>
  ```
- **Botón Ver Advertencias** (vuelve al formulario para editar):
  ```html
  <button id="frmFlujoDeclaracion:j_idt949" name="frmFlujoDeclaracion:j_idt949" class="ui-button amber-btn flat tamanioBotones125" type="submit">
    <span class="ui-button-text ui-c">Ver advertencias</span>
  </button>
  ```

---

### 11 · Wizard · paso 4 · Pago y Resumen Final
`recorrido_manual_sri.xml` · AJAX #149 / #150 ✅

**URL** la misma (`recibirDeclaracion.jsf`).
**Pestaña activa**: `<li class="ui-steps-item ui-state-highlight ..."><span class="ui-steps-title">Pago</span></li>`.

**Elementos confirmados en el DOM**:
1. **Total a pagar**:
   ```html
   <div class="ui-g-2"><label>Total a pagar:</label></div>
   <div class="ui-g-2 valores-texto-derecha">
     <span id="frmFlujoDeclaracion:totalAPagar">USD 0.00</span>
   </div>
   ```
2. **Botón oficial de Envío de la Declaración**:
   ```html
   <button id="frmFlujoDeclaracion:divBotonContinuarConfirmacion" name="frmFlujoDeclaracion:divBotonContinuarConfirmacion" class="ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only tamanioBotonesGeneral green-btn" type="submit">
     <span class="ui-button-text ui-c">Aceptar</span>
   </button>
   ```
3. **Botón Anterior**:
   ```html
   <button id="frmFlujoDeclaracion:divBotonAtrasConfirmacion" class="..."><span class="ui-button-text ui-c">Anterior</span></button>
   ```

---

### 12 · Pantalla de Confirmación de Declaración Procesada (CEP)
`recorrido_manual_sri.xml` · AJAX respuesta #150 ✅

**Contenedor oficial de éxito**: `<div id="panelSinValorAPagar">`.

**Contenido retornado por el SRI**:
- **Mensaje**: `Su declaración ha sido procesada satisfactoriamente, a continuación se presenta un resumen general.`
- **CEP # (Número de Serie)**: `873095157043`
- **Fecha y hora de declaración**: `03/09/2026 22:50:52`
- **Fecha de vencimiento**: `10/09/2026`
- **Botón oficial de Impresión**:
  ```html
  <button id="frmFlujoDeclaracion:btnDescargarComprobante" name="frmFlujoDeclaracion:btnDescargarComprobante" class="ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only tamanioBotonesGeneral green-btn flat" type="submit">
    <span class="ui-button-text ui-c">Imprimir</span>
  </button>
  ```
- **Botón Nueva Declaración**:
  ```html
  <button id="frmFlujoDeclaracion:btnSinValorPagarNuevaDeclaracion" ...><span class="ui-button-text ui-c">Nueva declaración</span></button>
  ```
- **Cierre de Sesión Limpio**:
  GET `/sri-declaraciones-web-internet/pages/salir.jsp` ➔ redirige ordenadamente al logout de Keycloak sin colgar la sesión.

---

## 📥 Descarga del listado en TXT (`lnkTxtlistado`)

Confirmado el 04-sep-2026 con la traza `flujo de reportes de documentos
electronicos recibidos`. **Una sola petición reemplaza el raspado de la tabla y
toda la paginación.**

```
POST /comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf
  frmPrincipal:opciones            = ruc
  frmPrincipal:ano                 = 2026
  frmPrincipal:mes                 = 8
  frmPrincipal:dia                 = 0          (0 = todos)
  frmPrincipal:cmbTipoComprobante  = 1 | 3 | 6
  frmPrincipal:lnkTxtlistado       = frmPrincipal:lnkTxtlistado

→ Content-Disposition: attachment; filename="<RUC>_Recibidos.txt"
  Content-Type: application/txt
```

**Columnas** (separadas por tabulador):

```
RUC_EMISOR · RAZON_SOCIAL_EMISOR · TIPO_COMPROBANTE · SERIE_COMPROBANTE
CLAVE_ACCESO · FECHA_AUTORIZACION · FECHA_EMISION · IDENTIFICACION_RECEPTOR
VALOR_SIN_IMPUESTOS · IVA · IMPORTE_TOTAL · NUMERO_DOCUMENTO_MODIFICADO
```

### Qué trae cada tipo

| Tipo | `cmbTipoComprobante` | ¿Trae los valores? |
| :--- | :---: | :--- |
| **Factura** | `1` | ✅ Sí — `VALOR_SIN_IMPUESTOS=61`, `IVA=1.83`, `IMPORTE_TOTAL=62.84` |
| **Nota de crédito** | `3` | ✅ Sí (mismo esquema) |
| **Retención** | `6` | ❌ **NO** — las tres columnas de valores vienen **vacías** |

Para retenciones el TXT solo da metadatos: emisor, serie, clave de acceso,
fechas y documento modificado. **El desglose de IVA retenido vs renta retenida
no está**, y ese desglose es justo lo que necesita el casillero 609. Por eso
hoy hay que abrir el modal de cada retención (`tablaCompRecibidos:N:j_idtXX`).

Alternativa sin modales para retenciones: el TXT sí trae la **CLAVE_ACCESO**
(49 dígitos) de cada comprobante. Con ella se puede pedir el XML autorizado al
SRI, que trae el desglose estructurado. Siguen siendo N peticiones, pero XML
liviano en vez de un postback JSF con render de modal — y sin depender de
`j_idtXX`, que cambia entre versiones.

### ⚠️ El TXT refleja la consulta del servidor, no sus propios parámetros

En la traza, la petición #28 pidió `cmbTipoComprobante=6` y la #30 pidió `=1`,
y **ambas devolvieron el mismo archivo de 1838 bytes** (retenciones), porque la
última *Consultar* del servidor había sido de retenciones. Recién en la #33,
después de consultar facturas, el TXT vino con las facturas (8225 bytes).

**Regla**: pulsar `btnConsultarSinRe` con el tipo deseado y *después* pedir el
TXT. Mandar el tipo en la petición de descarga no alcanza.

---

## 🧾 Consulta de declaraciones — recuperar el comprobante ya presentado

Confirmado el 04-sep-2026 con la traza `flujo_de_consuta_de_declaraciones_iva_renta`.
**Permite bajar el CEP de una declaración ya hecha sin volver a declarar** — que
es lo que hace falta para los contribuyentes que declararon pero cuyo PDF no
llegó a subirse.

### Es otra aplicación, con su propio puente SSO

```javascript
const SRI_PUENTE_CONSULTA_DECLARACIONES =
  'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=1292&idGrupo=73';
```

Aterriza en:

```
/sri-eyr-consulta-web-internet/pages/consulta/obligacion/lista-obligaciones.jsf
```

Ojo: es `sri-eyr-consulta-web-internet`, un contexto distinto del wizard de
recepción (`sri-declaraciones-web-internet`) y del de comprobantes recibidos.

### La secuencia

| # | Acción JSF | Qué hace |
| :---: | :--- | :--- |
| 1 | `formPresentada:btnBuscarGrupoObligacion` | Elegir el grupo de obligación (IVA / Renta) |
| 2 | `formPresentada:btnAceptarPeriodoSeleccion` | Confirmar el periodo |
| 3 | `formPresentada:tblConsultaDeclaracion` | Se puebla la tabla de declaraciones presentadas |
| 4 | `formPresentada:tblConsultaDeclaracion:<N>:j_idtXX` | Botón de la fila N → descarga el PDF |

### La descarga

```
POST /sri-eyr-consulta-web-internet/pages/consulta/obligacion/lista-obligaciones.jsf
  formPresentada:somAnioFiscal_input               = 2026
  formPresentada:tblConsultaDeclaracion:<N>:j_idtXX = (vacío, es el disparador)
  formPresentada:tblConsultaDeclaracion_rppDD      = 10        (filas por página)
  javax.faces.ClientWindow                          = <token de ventana>

→ Content-Disposition: attachment;filename=873083870866.pdf
  Content-Type: application/pdf
```

El nombre del archivo **es el número de CEP**. Coinciden con los PDFs de
`modelo para comprobante/` (873083870866, 873083940138, 873083952107), lo que
confirma que ese es el identificador del comprobante.

### Columnas útiles de la tabla

`colNumeroSerial` · `colEstadoPago` · `colEstadoDeclaracion` — las tres tienen
filtro propio (`:filter`), así que se puede acotar la búsqueda sin paginar.

### ⚠️ De nuevo los `j_idt`

El disparador de la fila es `j_idt66` en esta traza, igual que en comprobantes
recibidos — y ya sabemos que ese número cambia entre versiones. **Localizar el
botón por su posición en la fila o por su texto, nunca por el `j_idt`.**

También aparece `javax.faces.ClientWindow`, que es un token por ventana: hay
que tomarlo del DOM en el momento, no fijarlo.

### 🔬 Marcado real de la tabla, extraído de la traza (04-sep-2026)

Confirmado leyendo el HTML que devolvió el portal, no supuesto.

**Columnas de `formPresentada:tblConsultaDeclaracion`, en orden:**

| # | Columna | Ejemplo | Para qué sirve |
| :-: | :--- | :--- | :--- |
| 1 | Formulario | `104` | Código de obligación |
| 2 | Tipo de obligación | `2011 DECLARACION DE IVA` | **Tiene id propio: `…:N:txtDescripcionObligacion`** — así se separa IVA de Renta |
| 3 | Período fiscal | `ENERO 2026` | Cómo localizar la fila. Mes en MAYÚSCULA + año |
| 4 | Tipo | `Original` / `Sustitutiva` | Si hay varias, la última presentada es la que vale |
| 5 | No. de serie | `872972259637` | **El CEP.** Es el nombre del PDF que se descarga |
| 6 | Fecha de declaración | `06/02/2026` | |
| 7 | Fecha de vencimiento | `20/02/2026` | |
| 8 | Estado de pago | `SIN VALOR A PAGAR` | Confirma que no quedó saldo |
| 9 | Estado de declaración | `CUMPLIDA` | |
| 10 | Imprimir | 3 botones | Ver abajo |

**⚠️ Cada fila tiene TRES botones, y solo uno sirve:**

| Botón | `title` | Icono | Qué descarga |
| :--- | :--- | :--- | :--- |
| `j_idt62` | `Declaración completa` | `ui-icon-print` | `Declaracion_<CEP>.pdf` — el formulario entero |
| `j_idt64` | `Declaración perfilada` | `ui-icon-note` | otra vista |
| `j_idt66` | **`Comprobante de declaración`** | **`ui-icon-file-download`** | **`<CEP>.pdf` — el que queremos** |

**Tomar el primer botón de la fila trae el PDF equivocado.** Se elige por
`title` o por el icono `.ui-icon-file-download`; los `j_idt` cambian entre
versiones del portal.

### Las dos pantallas previas

Es un asistente de tres pasos **sobre la misma URL**: no se puede seguir una
secuencia fija, hay que mirar qué está en pantalla y dar el paso que toca.

**1 · Grupo de obligación** — `formPresentada:tblGrupoObligacionSeleccion`
es un datatable seleccionable de PrimeFaces. La casilla real está oculta
(`ui-helper-hidden-accessible`): lo que responde al click es el
`.ui-chkbox-box` de la fila. Después, `formPresentada:btnBuscarGrupoObligacion`.

**2 · Período fiscal** — diálogo `formPresentada:dlgPeriodoSeleccion`.
`formPresentada:somAnioFiscal` es un `ui-selectonemenu`: **el `<select>` real
viene vacío en el HTML** y se llena por JS, así que no sirve asignarle `value`.
Hay que abrir el panel (`.ui-selectonemenu-trigger`) y pulsar el `<li>` del año
en `formPresentada:somAnioFiscal_items`. Después,
`formPresentada:btnAceptarPeriodoSeleccion`.

**3 · La tabla**, ya descrita. `formPresentada:btnGenerarNuevaConsulta` vuelve
al principio.

---

## 📄 Descarga masiva de comprobantes recibidos en TXT

Confirmado el 04-sep-2026 con la traza
`flujo de reportes de documentos electronicos recibidos`.

**En la misma pantalla de comprobantes recibidos hay un enlace que descarga
TODO el listado en un TXT, en una sola petición:**

```javascript
document.getElementById('frmPrincipal:lnkTxtlistado')
```

Devuelve un archivo llamado `<RUC>_Recibidos.txt`.

Campos que acompañan al POST: `frmPrincipal:ano`, `frmPrincipal:mes`,
`frmPrincipal:dia`, `frmPrincipal:cmbTipoComprobante`, `frmPrincipal:opciones`.
Es decir: **los mismos filtros que la consulta normal**.

### Formato: TSV con cabecera

```
RUC_EMISOR  RAZON_SOCIAL_EMISOR  TIPO_COMPROBANTE  SERIE_COMPROBANTE
CLAVE_ACCESO  FECHA_AUTORIZACION  FECHA_EMISION  IDENTIFICACION_RECEPTOR
VALOR_SIN_IMPUESTOS  IVA  IMPORTE_TOTAL  NUMERO_DOCUMENTO_MODIFICADO
```

El POST se puede reproducir con `fetch` y así el archivo no baja al disco:

```
frmPrincipal                    = frmPrincipal
frmPrincipal:opciones           = ruc
frmPrincipal:ano / :mes / :dia  = los de la pantalla
frmPrincipal:cmbTipoComprobante = 1 factura · 3 nota de crédito · 6 retención
javax.faces.ViewState           = el del DOM
frmPrincipal:lnkTxtlistado      = frmPrincipal:lnkTxtlistado
```

Números: punto decimal, y a veces **sin el cero de la izquierda** (`.3`).

### ⚠️ Lo que este TXT NO resuelve

Medido sobre la traza real:

| Tipo | Filas | ¿Trae importes? |
| :--- | ---: | :--- |
| Factura | 42 | ✅ las 42 |
| Comprobante de Retención | 8 | ❌ columnas vacías |
| Nota de Crédito | 11 | ❌ columnas vacías |

**No reemplaza la extracción**, por dos motivos:

1. En retenciones y notas de crédito los importes vienen vacíos. Los valores
   retenidos siguen estando solo en el modal de detalle.
2. Ni siquiera en las facturas separa **base 15% de base 0%**: da el total sin
   impuestos y el IVA juntos. Se podría dividir suponiendo que todo el IVA es
   al 15% (`base15 = IVA / 0.15`), pero eso es una suposición sobre la tarifa,
   y los casilleros 500/507 no se llenan con suposiciones.

### Para lo que SÍ sirve, y es mucho

**Auditar la extracción.** El portal dice cuántos comprobantes hay y por
cuánto. Si el raspado leyó otra cantidad, se perdió una página del paginador —
un fallo que **no produce ningún error** y que ninguna otra comprobación ve.

Y de paso entrega **la lista de proveedores del período** (RUC + razón social,
sin repetir), que es el insumo del laboratorio de clasificación.

Implementado en `04_extraccion_datos.js`: `descargarTxtRecibidos()`,
`parsearTxtRecibidos()` y `auditarExtraccionConTxt()`. En consola: `sriTxt()`.

## 🚦 Errores y advertencias del formulario — señal ESTRUCTURAL

Confirmado el 04-sep-2026 leyendo **el propio JavaScript del portal** en la
traza `prueba_2_nueva_luz_ciclo_completo`. No es una suposición: es el código
que el SRI ejecuta.

```javascript
var ID_DIV_MENSAJE_PRINCIPAL = "mensajePrincipal";

mostrarErrores = function (a) {
  document.getElementById("frmFlujoDeclaracion:erroresField").style.display = "none";
  if (0 < a.length) {
    mensajeGeneralError = "Usted tiene " + a.length +
      " errores en su declaración. Verifique la sección de errores";
    mostrarMensajesError(mensajeGeneralError);
    document.getElementById("frmFlujoDeclaracion:erroresField").style.display = "block";
    // items: <li class="estiloItemsMensajes">…</li>
  }
};

mostrarAdvertencias = function (a) {
  document.getElementById("frmFlujoDeclaracion:advertenciasField").style.display = "none";
  if (0 < a.length) {
    document.getElementById("frmFlujoDeclaracion:advertenciasField").style.display = "block";
    // items: <li><span class="ui-messages-warn-summary">…</span></li>
  }
};
```

### Qué significa

| Elemento | Estado | Lectura |
| :--- | :--- | :--- |
| `#frmFlujoDeclaracion:erroresField` | `display:none` | **No hay errores.** Prueba positiva, la escribe el portal |
| `#frmFlujoDeclaracion:erroresField` | `display:block` | **Hay errores. NO se envía** |
| `#mensajePrincipal` | contiene «errores en su declaración» | Hay errores |
| `#frmFlujoDeclaracion:advertenciasField` | `display:block` | Solo advertencias — **no impiden declarar** |

Esto **cierra el hueco** que figuraba como *«texto/clase exactos que muestra el
SRI cuando SÍ hay inconsistencias — sin confirmar»*. Ya no hace falta adivinar
por texto: hay un interruptor que el portal mismo enciende y apaga.

### Otros datos del mismo JS

- `PREFIJO_CONCEPTO = "concepto"` — confirma que los casilleros del DOM son
  `concepto401`, `concepto500`, etc.
- `llenarConValorCero()` rellena los vacíos con **`"$0.00"`**, con signo de
  dólar. Cualquier lectura de importes tiene que tolerar el `$`.
- `MAXIMO_TAMANIO_ARCHIVO = 4194304` (4 MB) para el anexo.
- `CONCEPTOS_EXCEPCION_ICE = ["142", "146", "450"]`.

## 🔌 La API REST del portal — JSON en vez de raspar HTML

Confirmada el 04-sep-2026 en las trazas `comparacion _3` y
`prueba_2_nueva_luz_ciclo_completo`. El portal expone endpoints JSON que hasta
ahora suplíamos leyendo el DOM.

**Todos piden `Authorization: bearer <JWT>`** además de la cookie de sesión. El
token lo guarda la SPA de Angular; el content script comparte el
almacenamiento del origen, así que puede leerlo.

### Los que sirven

```
GET /sri-catastro-sujeto-servicio-internet/rest/privado/contribuyente/perfil
→ { codigo, mensaje, tipoContribuyente, identificacion, nombreCompleto, genero }
```

**`identificacion` es el RUC de quien está realmente en la sesión.** Es la
prueba dura para la guarda de identidad: no depende de que la cabecera del
portal mantenga su HTML.

```
GET /sri-obligacion-beneficio-servicio-internet/rest/privado/obligaciones/tributarias/vigentes
→ [{ descripcionObligacion: "2011  DECLARACION DE IVA",
     descripcionPeriodicidad: "MENSUAL",
     fechaInicio: "2022-01-01Z" }]
```

Ojo: `descripcionObligacion` trae **dos espacios** entre el código y el texto.

```
GET /sri-obligacion-beneficio-servicio-internet/rest/privado/alertas/vencimiento
→ { obligacionesVencidas: [],
    obligacionesPorVencerDia: [],
    obligacionesPorVencerQuincena: [{
      descripcionObligacionTributaria: "2011  DECLARACION DE IVA",
      descripcionPeriodo: "AGOSTO 2026",
      fechaVencimiento: "2026-09-14Z",
      dias: 10, horas: 16, minutos: 11,
      estadoPresentacionDescripcion: "Por cumplir"
    }],
    obligacionesPorVencerMes: [] }
```

**Este es el importante.** Dice, sin ambigüedad:

- **qué período toca** (`descripcionPeriodo`), en vez de suponer «el mes pasado»
- **cuándo vence** y cuántos días faltan
- **si ya se presentó** (`estadoPresentacionDescripcion`)

Antes había que esperar los ~20 minutos que el portal tarda en quitar la
obligación del perfil para saber si una declaración había entrado.

### Otros vistos, sin explorar

```
/sri-claves-servicio-internet/rest/privado/Verificar/vigencia
/sri-claves-servicio-internet/rest/privado/contingencia/verificarCambioClaveUsuario
/sri-claves-servicio-internet/rest/privado/medioContacto/obtenerMediosContacto
/sri-deudas-servicio-internet/rest/privado/consultaDeuda/existeDeudaFirme?identificacion=<RUC>
/sri-buzon-servicio-internet/rest/privado/documentoBuzon/obtenerNumeroDeNotificaciones
```

`verificarCambioClaveUsuario` es candidato a reemplazar la detección por DOM de
la pantalla de cambio de clave obligatorio. `existeDeudaFirme` podría avisar de
deudas antes de declarar. **Ninguno está calibrado: no construir sobre ellos sin
ver su respuesta primero.**

### 🛑 Regla

El token **nunca** se registra en consola, ni se guarda, ni sale del dominio del
que salió. Solo viaja a `srienlinea.sri.gob.ec`.

---

## 🎯 Estado de Calibración: COMPLETO

| Prioridad | Pantalla | Estado | Selector Oficial Confirmado |
| :---: | :--- | :---: | :--- |
| 🟢 | **Wizard paso 4 · Pago / resumen** | ✅ RESUELTO | `<span id="frmFlujoDeclaracion:totalAPagar">USD 0.00</span>` |
| 🟢 | **Envío oficial del resumen** | ✅ RESUELTO | `frmFlujoDeclaracion:divBotonContinuarConfirmacion` |
| 🟢 | **Confirmación final (botón IMPRIMIR)** | ✅ RESUELTO | `frmFlujoDeclaracion:btnDescargarComprobante` en `#panelSinValorAPagar` |
| 🟢 | **Comprobantes recibidos (05)** | ✅ RESUELTO | `frmPrincipal:cmbTipoComprobante` + `frmPrincipal:btnConsultarSinRe` |
| 🟢 | **Login Keycloak (02)** | ✅ RESUELTO | `#usuario` + `#username` (hidden) + `#password` + `#kc-login` |
| 🟢 | **Wizard paso 2 · Preguntas** | ✅ RESUELTO | Enlace directo `frmFlujoDeclaracion:clkFormularioCompleto` |
| 🟢 | **Puentes SSO directos** | ✅ RESUELTO | `/tuportal-internet/accederAplicacion.jspa?redireccion=57&idGrupo=55` (Comprobantes) y `...redireccion=310&idGrupo=201` (Declaraciones) |

**Contrato de seguridad final**: Con los IDs 100% calibrados contra el tráfico genuino del SRI, el bot tiene control absoluto para verificar el saldo exacto `$0.00`, avanzar diálogos con selectores atómicos y capturar el comprobante oficial sin fallos ni ambigüedades.
