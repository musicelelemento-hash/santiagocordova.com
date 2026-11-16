# Paquetes para la tienda · versiones al día

Generado el **15-nov-2026**. Los ZIP se regeneran con:

```powershell
cd "extenciones web"
node "tools/empaquetar_tienda.mjs"
```

Salida en `extenciones web/entregables/` (ignorada por git):

| Paquete | Archivo | Contenido |
|---|---|---|
| 01 | `SC-PRO-01-NuevaLuz-v3.5.1.zip` | 40 archivos · ~2 MB |
| 02 | `SC-PRO-02-ClavesSRI-v1.1.0.zip` | 6 archivos · ~11 KB |
| 03 | `SC-PRO-03-GastosPersonales-v1.2.0.zip` | 6 archivos · ~62 KB |
| 04 | `SC-PRO-04-Anulador-v2.5.0.zip` | 11 archivos · ~987 KB |
| SUITE | `SC-PRO-SUITE-v4.5.1.zip` | 27 archivos · ~2,6 MB |

Cada paquete incluye solo lo que carga la extensión en runtime:
`manifest.json`, `build/`, `popup`, `options`, `background.js`, `bridge_content.js`,
`shared_config.js`, `vendor/`, iconos y assets.

**Nunca** va: `node_modules/`, `recorridos/` (evidencia Burp, 112 MB),
`_EVIDENCIAS_SRI/`, `_respaldos/`, `_archivo/`, `src/`, `tests/`, `tools/`,
`entregables/`, `.env*`.

---

## Novedades de esta versión

### 01 · Nueva Luz `v3.5.0 → v3.5.1` (tema claro + SCVS + pulido final)

**Interfaz (Obsidian & Liquid Gold + Glass Light)**
- **Tema claro** con botón 🌙/☀️ en el encabezado; se guarda entre sesiones (`sc_popup_tema`).
- **Modo compacto** ▤: una línea por cliente para carteras grandes.
- **Bienvenida de 3 pasos** la primera vez (se oculta sola).
- Botón **👁️ Solo entrar** por cliente: entra al perfil y **no declara**.
- **Línea del mes**: `OCT 2026 · 12 sin declarar · 38 con comprobante · 2 ATS · web`.
- **Progreso del lote en vivo** con ETA y chip del **último acuse** en el pie.
- Fuente **Inter** para texto (Manrope para títulos, JetBrains Mono para cifras).

**Funcionalidad**
- **ATS pendientes oficiales**: la web publica el resumen del mes (declaraciones + `proof_file`) y el popup usa esos números, no su caché.
- **Ventas del 104 sin declarar**: captura casilleros 401/411/413/419/421… y las guarda en `tax_profile.ventasPorPeriodo` (aunque la cuenta esté bloqueada).
- **Anexo subido** se marca en `sri_declaraciones` + acuse en el cliente (la matriz deja de verlo pendiente).
- **Anti-bloqueo de login**: bóveda obligatoria, tope propio de 3 intentos/día y WAKE solo para entradas manuales.
- **Tira de sesión SRI** con botón para cerrar la sesión (purga completa).

**SCVS (Superintendencia de Compañías)**
- Obligaciones anuales: **nómina de socios** (fin de febrero), **EEFF** y **actas** (30 de abril).
- Recordatorios del bot **por documento** (omite lo ya subido).

### SUITE `v4.5.0 → v4.5.1`
- Incluye la 01 v3.5.1 y la 04 v2.5.0; se reempaquetó para mantener la tienda sincronizada.

### 02 · 03 · 04
- Sin cambios de código en esta tanda; se reempaquetaron con la misma versión.

### Publicación automatizada
- Nuevo `tools/publicar_tienda.mjs` (API Chrome Web Store) y guía `docs/PUBLICAR_TIENDA.md`.
- `--check` valida entorno sin tocar la tienda; `--upload` / `--publish` / `--status`.


### 01 · Nueva Luz `v3.3.5 → v3.3.6` (ATS pendientes)

- Al terminar el **IVA mensual de una sociedad**, la extensión anota que queda pendiente **subir el ATS** de ese período.
- El popup muestra la tira **📌 ATS pendientes**: cliente, período, si ya están las compras y hace cuántos días.
- Botones por fila: **Abrir** (Anexos del SRI) y **Listo** (marca subido).
- Al subir el ZIP con 📤, el pendiente de esa sociedad **se cierra solo**.

### 01 · Nueva Luz `v3.3.4 → v3.3.5`

- **Subida de anexos**: acepta el ZIP generado (ATS/APS/ADI), lo adjunta en PrimeFaces, **espera el botón Cargar** y confirma con `btnAceptarConf`.
- Guarda el resultado en `sc_anexo_ultimo` (nombre, mensaje, acuse, URL, fecha) y el bridge lo publica a la web para el **círculo mensual**.
- Popup: 🧭 Mapear pantalla de Anexos y 📤 Subir ZIP del anexo (sin depender de la barra flotante).

### 01 · Nueva Luz `v3.3.1 → v3.3.2` (barra flotante a pedido)

- Botón **🎛** en el popup: **despierta** la extensión y **monta** la barra flotante en la pestaña del SRI.
- Si la pestaña activa no es del SRI, abre el portal (sri-en-linea/inicio/NAT).
- Si el content script no estaba cargado, **recarga la pestaña** y la barra aparece.
- Si la barra ya existía pero estaba oculta, la vuelve visible y muestra un toast de confirmación.

### 01 · Nueva Luz `v3.3.0 → v3.3.1` (login robusto)

- **Espera** a que el formulario del SSO esté pintado (hasta 10 s) antes de escribir.
- **Verifica** el resultado del envío: sesión iniciada, error visible o pantalla de cambio de clave.
- **Clasifica el fallo**: `clave_incorrecta`, `bloqueada`, `clave_vencida`, `captcha` o `timeout`.
- **Reintenta** una vez si el envío no tomó.
- Avisa por toast y por consola: `✅ [LOGIN SRI] sesión iniciada con <RUC>`.
- Si el portal pide **cambio de clave obligatorio**, se detiene y lo informa (no cambia claves).

### 01 · Nueva Luz `v3.2.0 → v3.3.0`

**Sociedades (nuevo):**
- Detección de **sociedad** por RUC (3.er dígito 9) y badge **S.A.S.** en la tarjeta.
- La extensión reconoce el **tipo de contribuyente** y no fuerza IVA semestral.

**Anexos (nuevo):**
- `abrirAnexoSRI(tipo)` — abre **Anexos → Envío y consulta** con el `codOperativo`
  correcto: **ATS = IVA**, **REBEFICS = APS**, **ADI = ADI**, ICE/PVP.
- Botón **🗂** en el HUD.
- Mapper **🧭** ampliado: ahora captura radios, enlaces y etiquetas del tipo de anexo.
- Mensaje `SRI_ABRIR_ANEXO` desde la web.

**Compras (mejora):**
- La extracción guarda por factura: **RUC del proveedor, fecha de emisión, clave de
  acceso (49 dígitos), establecimiento, punto de emisión, secuencial y tipo**.
- El arqueo incluye `invoices[]` y el bridge publica `sc_compras_<ruc>_<periodo>`,
  que es lo que usa la web para **generar el ATS**.

**Anexo ICE / declaración ICE en cero (nuevo):**
- Asistente `scIniciarDeclaracionICE()`: elige la obligación **3031** por texto.
- `SRI_SUBIR_ANEXO`: arma el ZIP del Anexo ICE y lo carga en la pantalla de Anexos.

**Sesión (correcciones):**
- La sesión de **otro cliente se cierra** al entrar con el pedido correcto.
- Despertar si las credenciales llegan **después** de abrir la pestaña.
- Modo **solo mirar**: no declara, no escanea obligaciones, no sugiere el mes siguiente.
- Badge `S.A.S.` dorado en la tarjeta del cliente.

### SUITE `v4.2.0 → v4.3.0`

- Incluye los módulos de la 01 v3.3.0 (mismo código, validado por
  `construir_suite.mjs --check`).
- Manifiesto validado y cada módulo pasa `node --check`.

### 02 · 03 · 04

Sin cambios de código en esta tanda; se reempaquetaron con la misma versión para
mantener la tienda sincronizada.

---

## Cómo publicar

1. Chrome Web Store (o la tienda que uses) → Subir nueva versión.
2. Elegí el ZIP correspondiente de `entregables/`.
3. Pegá como “novedades” el bloque de la versión de arriba.
4. Publicar.

> El registro de lo subido queda en `entregables/MANIFEST_ENTREGABLES.json`
> (archivo + versión + cantidad de archivos + KB + sha256).
