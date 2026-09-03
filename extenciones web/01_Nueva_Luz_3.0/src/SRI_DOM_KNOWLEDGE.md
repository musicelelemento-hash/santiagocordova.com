# SRI Automation: DOM Architecture & Routing Knowledge (Nueva Luz 3.0)

Este documento es un Knowledge Item (KI) creado para que futuras IAs entiendan la arquitectura del sistema del Servicio de Rentas Internas (SRI) de Ecuador y cómo la extensión "Nueva Luz 3.0" interactúa con él.

## 1. Topología de URLs (SRI)

El SRI utiliza un sistema SPA (Single Page Application) construido mayoritariamente con PrimeFaces (JSF) y en algunas partes Angular.

- **Login**: `https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/perfil` (Tras el inicio de sesión vía Keycloak/OAuth, suele redirigir aquí o al inicio).
- **Inicio/Dashboard**: `https://srienlinea.sri.gob.ec/sri-en-linea/Inicio/Web/inicio.jsf`
- **Perfil del Contribuyente (Auditoría de Obligaciones)**: `https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/perfil`
- **Wizard de Declaración (IVA)**: `https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaracionesWeb/FormularioIva/Opciones/declaracionImpuesto.jsf` (A veces requiere redirecciones internas con `redireccion=310`).
- **Consulta de Comprobantes/Declaraciones (Recuperación de PDF)**: `https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaracionesWeb/ConsultaDeclaraciones/Opciones/consultaDeclaraciones.jsf`

## 2. IDs y Selectores Clave del DOM (PrimeFaces)

PrimeFaces genera IDs dinámicos pero con patrones predecibles. La extensión utiliza selectores defensivos (`[id*="patron"]`) para evitar que actualizaciones del SRI rompan la lógica.

### A. Wizard de Declaraciones (`startIvaNavigation`)
- **Dropdown de Obligación (2011)**: `frmFlujoDeclaracion:somObligacion_label` o `.ui-selectonemenu-trigger` dentro de `[id*="somObligacion"]`.
- **Calendario (Periodo)**: `frmFlujoDeclaracion:calPeriodo` o `.ui-datepicker`.
- **Botón Siguiente**: `frmFlujoDeclaracion:btnObligacionSiguiente`
- **Errores de Declaración Previa**: `.ui-messages-error-detail`, `.ui-messages-warn-detail`. Palabras clave: *"SUSTITUTIVA"*, *"YA FUE PRESENTADA"*.

### B. Recuperación de PDF (`recoverPDF`) / Consulta de Declaraciones
Flujo de Menú (SPA/JSF):
1. `<span class="ui-menuitem-text">DECLARACIONES</span>`
2. `<span class="ui-menuitem-text">Declaración de impuestos</span>`
3. `<span class="ui-menuitem-text">Consulta de declaraciones y comprobantes de pago</span>`

Elementos y selectores clave en pantalla:
- **Checkbox (Opcional/Todos)**: `<span class="ui-chkbox-icon ui-icon ui-icon-blank ui-c"></span>`
- **Dropdown del Año Fiscal**: Selector con `<span class="ui-icon ui-icon-triangle-1-s ui-c"></span>`
  - Selección de Año: `<li class="ui-selectonemenu-item ... ui-state-highlight" data-label="2026" id="formPresentada:somAnioFiscal_0">2026</li>` (El id puede variar el índice final según el año).
- **Botones de Búsqueda y Confirmación**: 
  - `<span class="ui-button-text ui-c">Buscar</span>` (Botón principal para iniciar consulta).
  - `<span class="ui-button-text ui-c">Aceptar</span>` (Botón para confirmar selecciones/modales).
- **Identificación de Fila en Tabla (Periodo Fiscal)**: 
  - Celda: `<td role="gridcell"><span class="ui-column-title">Período fiscal</span>JULIO 2026</td>`
- **Botón de Descarga (EL OBJETIVO)**:
  - Ícono de descarga de PDF/Comprobante: `<span class="ui-button-icon-left ui-icon ui-c ui-icon-file-download"></span>` (Suelen existir dos íconos iguales por fila, uno para la declaración y otro para el comprobante de pago).

### C. Auditoría de Perfil (`verifyProfile`) - [NUEVO]
- **Ubicación de la Información**: La página del perfil carga las obligaciones tributarias en una tabla o lista.
- **Selectores de Régimen/Frecuencia**: Se busca texto como "MENSUAL" o "SEMESTRAL" en relación con "IVA". Si el contribuyente es "RIMPE NEGOCIO POPULAR" o "RIMPE EMPRENDEDOR", suele estar explícitamente detallado en la cabecera o tabla de obligaciones.

## 3. Arquitectura de Estado (`SafeStorage` & `pendingAction`)

Debido a que el SRI hace *Full Page Reloads* constantes, el motor de la extensión no puede mantener variables en memoria RAM (`const`, `let`). Utiliza `chrome.storage.local` envuelto en una clase `SafeStorage`.

El flujo se controla mediante una "Máquina de Estados de Navegación":
1. Se asigna un `pendingAction` (Ej. `verifyProfile`).
2. Se inyecta un redireccionamiento de URL (`window.location.href = ...`).
3. La página recarga. El listener de inicio en `03_ingreso_y_sesion.js` lee el `pendingAction` apenas arranca.
4. Despacha la función correspondiente que controla el DOM para esa fase.
5. Al terminar, la fase asigna el siguiente `pendingAction` y vuelve a saltar, o cierra la sesión (`cerrarSesionSRI()`).

### Cadena Lógica Ideal (Auto-Batch):
1. Extension inyecta credenciales -> Login.
2. `verifyProfile` (Audita DB Web vs SRI).
3. `startIvaNavigation` (Rellena). Si da error de "ya declarado", salta a `recoverPDF`.
4. Extracción de PDF/Datos y sincronización final.
5. `cerrarSesionSRI()`, lo que dispara que la extensión despierte e inicie el cliente N+1 de la cola `auto_batch_queue`.
