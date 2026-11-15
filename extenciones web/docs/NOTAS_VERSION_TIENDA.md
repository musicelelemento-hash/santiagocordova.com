# Paquetes para la tienda · versiones al día

Generado el **15-nov-2026**. Los ZIP se regeneran con:

```powershell
cd "extenciones web"
node "tools/empaquetar_tienda.mjs"
```

Salida en `extenciones web/entregables/` (ignorada por git):

| Paquete | Archivo | Contenido |
|---|---|---|
| 01 | `SC-PRO-01-NuevaLuz-v3.3.0.zip` | 40 archivos · ~2 MB |
| 02 | `SC-PRO-02-ClavesSRI-v1.1.0.zip` | 6 archivos · ~11 KB |
| 03 | `SC-PRO-03-GastosPersonales-v1.2.0.zip` | 6 archivos · ~62 KB |
| 04 | `SC-PRO-04-Anulador-v2.5.0.zip` | 11 archivos · ~987 KB |
| SUITE | `SC-PRO-SUITE-v4.3.0.zip` | 27 archivos · ~2,6 MB |

Cada paquete incluye solo lo que carga la extensión en runtime:
`manifest.json`, `build/`, `popup`, `options`, `background.js`, `bridge_content.js`,
`shared_config.js`, `vendor/`, iconos y assets.

**Nunca** va: `node_modules/`, `recorridos/` (evidencia Burp, 112 MB),
`_EVIDENCIAS_SRI/`, `_respaldos/`, `_archivo/`, `src/`, `tests/`, `tools/`,
`entregables/`, `.env*`.

---

## Novedades de esta versión

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
