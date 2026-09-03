# SRI Automation Project: Technical Specifications & Rules

This document serves as the master reference for the "Anulador PDF a Form SRI" Chrome Extension. It contains the exact DOM selectors, extraction patterns, and workflow logic required to maintain the automation.

## 1. Target Portal Information
- **Domain**: `srienlinea.sri.gob.ec`
- **Specific Page**: `/comprobantes-electronicos-internet/pages/solicitud/anulacion/menuAnulacion.jsf`
- **Framework**: JavaServer Faces (JSF) with PrimeFaces / RichFaces.

## 2. Key DOM Selectors (PrimeFaces IDs)
Use these exact IDs to target form fields. Avoid label-based matching if possible.

| Field Name | DOM ID | Component Type |
|------------|--------|----------------|
| Tipo de Comprobante | `frmPrincipal:cmbTipoComprobante` | `<select>` |
| Fecha Autorización | `frmPrincipal:calendarFechaAutorizacion_input` | `<input type="text">` |
| Clave de Acceso | `frmPrincipal:itxtClaveAcceso` | `<input type="text">` |
| No. Autorización | `frmPrincipal:itxtNoAutorizacion` | `<input type="text">` |
| Identificación Receptor | `frmPrincipal:itxtIdentificacion` | `<input type="text">` |
| Correo Electrónico | `frmPrincipal:itxtCorreoElectronico` | `<input type="text">` |
| Button: Solicitar | `frmPrincipal:btnAceptar` | `<input type="submit">` |
| Button: Enviar | `frmPrincipal:btnEnviar` | `<input type="submit">` |

## 3. Data Extraction Patterns (Regex)
Hardened patterns based on real-world Ecuadorian SRI PDFs (New Format).

### Access Key (Clave de Acceso)
- **Pattern**: `/CLAVE\s*(?:DE\s+)?ACCESO[\s\S]*?(\d{49})/i`
- **Fallback**: Search for any contiguous 49-digit number.

### Authorization Date
- **Pattern**: `/(\d{1,2})\s+([a-z]{3,12})\s*[\/ \.]+\s*(\d{4})/i`
- **Mapping**: Months are mapped from local names (enero, abril, etc.) to numeric (01, 04, etc.).
- **Special Case**: Handles slashes like `27 abril /2026`.

### Email (Receptor)
- **Primary**: `/(?:DIR\.\s*EMAIL|Correo\s*electr[óo]nico|Email).*?[:\s]+([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i`
- **Strategy**: Prioritize emails near "DIR. EMAIL" labels to avoid picking the issuer's email.

### Total Amount
- **Pattern**: `/(?:VALOR TOTAL|IMPORTE TOTAL|TOTAL(?: A PAGAR)?|Total)[\s\S]{0,50}?(\d{1,5}[\.,]\d{2})/i`
- **Logic**: Search within a 50-character window after the label to handle columnar shifts.

## 4. Automation Workflow (Auto-Pilot)

### Phase 1: Injection
1. Focus field.
2. Set value (with `.trim()`).
3. Dispatch `input`, `change` events.
4. Set value again (persistence check).
5. Dispatch `blur`.
6. Wait (600ms) for SRI AJAX processing.

### Phase 2: Confirmation Bypass
The "Enviar" button triggers a native `confirm()` dialog.
- **Solution**: Modify the `onclick` attribute of `frmPrincipal:btnEnviar` to remove the `if(!confirm(...))` check before clicking.

### Phase 3: Batch Loop
1. Detect success message (`enviada con éxito` or `estado ANULADO`).
2. Update `chrome.storage.local` results.
3. Shift the `sri_batch_queue`.
4. Redirect to the start URL to trigger the next cycle.

## 5. Critical Troubleshooting
- **Conflict**: Other extensions (e.g., "SRI ASISTENTE GHOST") can overwrite fields. Disable them if issues persist.
- **CSP**: Content Security Policy blocks inline script injection. Use DOM attribute modification instead of `eval()` or `<script>` tags.
- **Z-Index**: The widget uses `z-index: 2147483647` to stay above SRI system modals.

---
*Created by Antigravity AI for Santiago - April 2026*
