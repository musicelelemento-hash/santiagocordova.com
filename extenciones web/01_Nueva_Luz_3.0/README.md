# Nueva Luz 3.0 — Extensión Chrome de declaración automática de IVA (SRI Ecuador)

Extensión MV3 que automatiza la **declaración mensual de IVA** en el portal del
SRI para los contribuyentes del estudio contable: extrae comprobantes
recibidos (facturas, retenciones, notas de crédito), arma el Formulario 2011,
lo valida y guarda el comprobante de cada declaración en R2 + Supabase.

> ⚠️ **Regla de oro**: la declaración lleva la firma del contador. El bot junta
> y muestra; no decide criterio contable. Cuando no sabe, frena y avisa.

## 📖 Documentación — leé en este orden

1. [`.agents/AGENTS.md`](../../.agents/AGENTS.md) — **las reglas del proyecto**
   (frenos de seguridad, la Matriz Tatuada de selectores, por qué cada decisión
   es como es, y las reglas de convivencia si hay dos IAs trabajando).
2. [`HANDOFF.md`](HANDOFF.md) — el mapa de qué hay hecho y qué falta, y cómo
   saber si algo se rompió.
3. [`_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md`](../_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md)
   — evidencia real del portal. Un selector que no esté ahí **es una
   suposición**.

## 🚀 Instalación (desarrollo)

1. Abre Chrome y ve a `chrome://extensions/`
2. Activa el **Modo de desarrollador** (esquina superior derecha)
3. **Cargar extensión sin empaquetar** → seleccioná la carpeta
   `01_Nueva_Luz_3.0/` (esta misma, donde vive `manifest.json`)
4. La extensión se inyecta sola en `srienlinea.sri.gob.ec`

## ⚙️ Ajustes (clic derecho en el ícono → Opciones)

Ahí viven las claves — **nunca en el código ni en el DOM del SRI**:

- **Supabase**: URL pública + llave `anon` (viajan en el bundle por diseño; la
  de Ajustes pisa a la del código si está guardada).
- **R2 (Cloudflare)**: Access Key ID + clave secreta. ⚠️ El secreto **todavía
  está en `shared_config.js`** (ver HANDOFF §4.1): hay que rotarlo en
  Cloudflare y cargar la nueva credencial en Ajustes hasta que 🔌 diga
  *«del almacén»*; recién ahí se vacía el archivo.
- **IA (opcional)**: API key de Gemini para sugerir categorías de proveedores.
- Botón **🔌 Probar ahora** — verifica la subida real sin tocar una
  declaración.

## 🧪 Cómo saber si algo se rompió

```bash
# desde la carpeta de la extensión
node --check src/0*.js   # sintaxis de los 7 módulos
npm run build            # regenera build/content.js (IMPORTANTE: Chrome usa el bundle)
```

Y los **16 bancos de pruebas** (561 comprobaciones, verdes al 09-sep-2026),
cada uno carga el `build/content.js` real y comprueba algo que ya se rompió
alguna vez:

```
.claude/launch.json → configuración «bancos-extension» (localhost:8791)
→ http://localhost:8791/tests/   →  botón «Correr todos»
```

Los `file://` no ejecutan scripts: hace falta el servidor. Si algo sale en
rojo, la extensión tiene un problema real. **Un banco que no termina también es
un problema**: puede estar roto sin pintar veredicto (HANDOFF §4.11).

## 🛠️ Estructura

```
01_Nueva_Luz_3.0/
├── manifest.json          host_permissions: SRI, R2, workers.dev, Supabase, IA
├── background.js          service worker: subidas a R2, IA, cookies, cortacircuitos
├── options.html/.js       ⚙️ Ajustes — las claves viven acá
├── popup.js               la cola de clientes
├── shared_config.js       config pública (⚠️ aún con el secreto de R2 — HANDOFF §4.1)
├── src/01..07             el content script en 7 módulos (concatenados por Vite)
├── vendor/                jspdf · catastro_eloro.txt · ciiu.json (bajo demanda)
├── tools/
│   └── construir_catastro.py   ZIP del SRI → los dos archivos de vendor/
└── tests/                 🧪 16 bancos de pruebas (index.html = correr todos)
```

### Los 7 módulos de `src/` (orden estricto, sin `import`/`export`)

| | Vive ahí |
| :--- | :--- |
| `01_utilidades_y_pdf` | helpers, PDF, captura de comprobante, frenos de sustitutiva y clave vencida |
| `02_servicios_y_memoria` | `SafeStorage`, `SriLoop`, `SriApi`, `Proveedores`, `Catastro`, `Chequeo`, esperas |
| `03_ingreso_y_sesion` | login Keycloak, sesión, identidad, extracción turbo |
| `04_extraccion_datos` | raspar tablas, `clasificarTarifaIva`, `parsearXmlComprobante` |
| `05_llenado_formulario` | casilleros del 2011, `sriMapaCasilleros()` (📐) |
| `06_panel_interfaz` | `SriAssistantPanel` (HUD), el cierre mágico |
| `07_navegacion_sri` | wizards, recuperar comprobantes ya declarados |

**Regla de oro del flujo de trabajo**: se edita `src/`, se corre `npm run
build`, y Chrome recarga la extensión — si no, se depura un bundle fantasma.
`build/content.js` **no se edita a mano**.

## 🧭 Lo que el bot hace y no hace

- ✅ Declara el IVA del período navegado y guarda el comprobante (R2 + Supabase)
- ✅ Recupera comprobantes de declaraciones ya presentadas (Consulta de
  declaraciones), sin volver a declarar
- ✅ Separa tarifas 15% / 5% / 0% y detecta mezcladas y compras con ICE
- ✅ Aprende la actividad de los proveedores (catastro + IA como sugerencia,
  nunca como decisión)
- ⛔ **Nunca presenta una sustitutiva** (eso es decisión del contador)
- ⛔ **Nunca paga** — saldo ≠ $0 → guarda borrador y frena
- ⛔ **Nunca cambia contraseñas ni contesta encuestas del SRI**
- ⛔ **Nunca escribe claves en el DOM del portal**
