# 📖 Biblia de Pantallas del SRI

Catálogo vivo de evidencia real del portal `srienlinea.sri.gob.ec`, usado para
calibrar los selectores de **Nueva Luz 3.0**. Cada entrada documenta una
pantalla: su URL, qué se confirmó contra el DOM real y qué sigue sin confirmar.

Es la fuente de verdad que respalda la *Matriz Tatuada* de
[`.agents/AGENTS.md`](../../.agents/AGENTS.md) §6. **Si un selector de la matriz
no tiene entrada acá, es una suposición, no un hecho.**

Última actualización: 03-sep-2026 · 8 pantallas.

---

## ⚠️ Privacidad

Las capturas muestran **RUC, nombre, email y teléfono de un contribuyente
real**. Por eso:

- `.gitignore` excluye todo `.pdf/.jpg/.png/.webp` de esta carpeta. **Solo este
  índice se versiona.**
- No pegues datos de clientes en el índice. Al citar un valor, enmascaralo:
  `110260XXXX001`.
- No subas estas capturas a ningún servicio externo.

---

## 🗺️ El recorrido completo

```
inicio/NAT (01)  →  login Keycloak (02)  →  perfil (03 modal · 04 obligaciones)
                                                      │
                        ┌─────────────────────────────┴─────────────────┐
                        ▼                                               ▼
        comprobantes recibidos (05)                    menú declaraciones (06)
        · extracción de facturas                                        │
                                                                        ▼
                                          wizard: 1 Período (07) → 2 Preguntas ❓
                                                → 3 Formulario (08) → 4 Pago ❓
                                                → confirmación/IMPRIMIR ❓
```

❓ = sin evidencia todavía.

---

## 📑 Catálogo

| # | Pantalla | URL | DevTools | Estado |
|:--|:---|:---|:---:|:---|
| 01 | Inicio sin sesión | `/sri-en-linea/inicio/NAT` | — | 🟡 Visual |
| 02 | Login (Keycloak) | `/auth/realms/Internet/protocol/openid-connect/auth` | — | 🟡 Visual |
| 03 | Modal encuesta de satisfacción | *(sobre el perfil)* | — | 🔴 **Bloqueador** |
| 04 | Perfil + obligaciones expandidas | `/sri-en-linea/contribuyente/perfil` | ✅ | 🟢 Confirmado |
| 05 | Comprobantes recibidos | `/comprobantes-electronicos-internet/.../comprobantesRecibidos.jsf` | ✅ | 🟢 Confirmado |
| 06 | Menú de declaraciones | `/sri-en-linea/SriDeclaraciones/Publico/declaraciones` | ✅ | 🟢 Confirmado |
| 07 | Wizard · paso 1 Período Fiscal | `/sri-declaraciones-web-internet/.../recibirDeclaracion.jsf` | ✅ | 🟢 Confirmado |
| 08 | Wizard · paso 3 Formulario | *(misma URL)* | ✅ | 🟢 Confirmado |

---

## 🔑 Tabla maestra de IDs — CONFIRMADOS contra el portal

Todo lo de acá se leyó del DOM real el 03-sep-2026 (capturas 10-14).

| Pantalla | Elemento | ID / selector REAL | Antes el código usaba |
| :--- | :--- | :--- | :--- |
| Comprobantes recibidos | Tipo de comprobante | `frmPrincipal:cmbTipoComprobante` <br>(`option value="1"` = Factura) | ❌ `frmPrincipal:tipoComprobante` — no existe |
| Menú declaraciones | Tarjeta «Formulario de IVA» | `p.sri-tamano-minimo-detalle` | búsqueda por texto |
| Wizard paso 1 | Opción de obligación | `frmFlujoDeclaracion:somObligacion_1` <br>`data-label="2011 DECLARACION DE IVA"` | `…somObligacion_label` ✅ misma familia |
| Wizard paso 1 | Período (calendario) | `frmFlujoDeclaracion:calPeriodo` <br>`data-p-pattern="mm/yy"` | ✅ ya lo usaba |
| Wizard paso 2 | Saltar «Preguntas» | `frmFlujoDeclaracion:clkFormularioCompleto` <br>(es un `<a class="ui-commandlink">`) | ❌ `…btnVerFormularioCompleto` — no existe |
| Wizard paso 3 | Total a pagar (TOTALES) | `concepto2610` (input readonly) | ✅ ya lo usaba |
| **Resumen final** | **Total a pagar** | **`frmFlujoDeclaracion:totalAPagar`** <br>texto: `USD 0.00` | ✅ **la apuesta era correcta** |
| Todos | Siguiente / Guardar borrador / Aceptar | `span.ui-button-text.ui-c` con ese texto | ✅ |

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

## 🎯 Lo que falta

| Prioridad | Pantalla | Para qué |
| :---: | :--- | :--- |
| 🔴 1 | **Wizard paso 4 · Pago / resumen** | El `id` del saldo. Es lo único que frena el envío automático. Sale solo con la Opción C. |
| 🔴 2 | **Una declaración CON inconsistencias** | Texto y clase exactos del error. Sin esto `analizarMensajesResumen()` devuelve `desconocido` y el bot frena por diseño. |
| 🟠 3 | **Confirmación final (botón IMPRIMIR)** | Blindar `initDeclarationSuccessWatcher()` y la captura del comprobante. |
| 🟡 4 | Opción A sobre **comprobantes recibidos** (05) | Verificar los `frmPrincipal:*` de la Matriz §6.B. |
| 🟡 5 | Opción A sobre el **login** (02) | Verificar `#usuario` / `#password` / `#kc-login`. |
| 🟡 6 | Wizard **paso 2 · Preguntas** | Nunca se documentó qué pregunta ni cómo se responde. |

Hasta que 1 y 2 estén, rige el contrato de `.agents/AGENTS.md` §4:
**ante la duda, guardar borrador y frenar.** Nunca enviar a ciegas.
