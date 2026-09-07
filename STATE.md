# ESTADO DEL PROYECTO — COLABORACIÓN ANTIGRAVITY & CLAUDE CODE
> **Fecha de actualización:** 07-sep-2026  
> **Entorno de trabajo:** Multi-agente (Antigravity IDE + Claude Code en paralelo)  
> **Rama activa en repositorio raíz:** `extension/nueva-luz-control-bucle`  
> **Sub-repositorio web (`santiagocordova-main`):** `main`

---

> 🧭 **Los dos documentos, y para qué sirve cada uno** (anotado por Claude,
> 07-sep-2026). No compiten:
>
> | Archivo | Qué es | Cuándo se escribe |
> | :--- | :--- | :--- |
> | **`.agents/AGENTS.md`** | la **memoria permanente**: reglas, la Matriz de selectores del SRI, las lecciones y por qué se tomaron | cuando algo se aprende para siempre |
> | **`STATE.md`** (éste) | el **parte del día**: qué se resolvió hoy, quién está en qué, el mapa de archivos | cada jornada |
>
> Los `CLAUDE.md` cargan el primero solo (`@.agents/AGENTS.md`); **éste hay que
> abrirlo a mano**. Y si los dos se contradicen, gana el que traiga
> **evidencia** — un log, una respuesta HTTP, una captura — no el más reciente.

---

## 🤝 1. REGLAS DE CONVIVENCIA Y FLUJO MULTI-AGENTE

1. **Arquitectura de la Extensión (Nueva Luz 3.0):**
   - El código fuente vive exclusivamente en `extenciones web/01_Nueva_Luz_3.0/src/` (archivos `01` al `07`).
   - **PROHIBIDO editar directamente `build/content.js`**. Ese archivo es el bundle generado por Vite.
   - **Pipeline obligatorio tras cambios en `src/`**:
     ```bash
     node --check "extenciones web/01_Nueva_Luz_3.0/src/<archivo_modificado>.js"
     cd "extenciones web/01_Nueva_Luz_3.0" && npm run build
     ```
   - No usar `import` / `export` en `src/`: los archivos se concatenan ordenadamente del 01 al 07 en el bundle final.
2. **Separación de Repositorios:**
   - La raíz `c:\Programacion\Paginas Web\SantiagoCordova.com` gestiona la extensión y utilidades generales.
   - La carpeta `santiagocordova-main` es un repositorio git independiente (`.gitignore` en raíz lo ignora). Los commits de la aplicación web deben realizarse dentro de su propio directorio.
3. **Reglas de Negocio Inmutables del SRI:**
   - **NUNCA presentar sustitutivas**: el bot se frena y redirige a *Consulta de declaraciones* para descargar el comprobante oficial existente.
   - **NUNCA purgar cookies de sesión en el formulario de Keycloak**: el `AUTH_SESSION_ID` está ligado al formulario; purgarlo produce `HTTP 400 Bad Request`.
   - **NUNCA inventar un casillero o suponer datos tributarios**: cuando falta un dato contable/legal, el bot reúne la evidencia, la muestra y pide confirmación o marca al cliente en Omitidos.

---

## 🏆 2. HITOS Y BUGS CRÍTICOS RESUELTOS HOY (07-SEP-2026)

### A. Diagnóstico y Solución Definitiva del "401" de Supabase en `sri_declaraciones`
- **Problema histórico:** Las declaraciones se presentaban y los PDFs se subían a Cloudflare R2 con éxito, pero la sincronización de métricas a la tabla relacional `sri_declaraciones` devolvía `HTTP 401 Unauthorized`.
> ⚠️ **Corrección del 07-sep-2026 (Claude): eran DOS causas, no una.** Lo de
> abajo es correcto para `sri_declaraciones`. Pero el 401 también salía de
> `clients`, por un motivo distinto — un permiso de **columna**: el rol `anon`
> no puede leer `is_deleted`, y la extensión filtraba todas sus consultas por
> `is_deleted=eq.false`. Probado: `select=id` → 200, `select=is_deleted` → 401
> con 42501. Ya se quitó el filtro del código (commit `c6c8de5`) y el `GRANT`
> se agregó al mismo archivo SQL (`46bcbae`), para una sola pasada por el
> editor de Supabase.
>
> Cada uno había encontrado una mitad y la daba por completa. **Cuando dos
> agentes diagnostican el mismo síntoma, comparar antes de cerrar.**

- **Causa raíz descubierta:**
  - En agosto de 2026, la política RLS en `harden_full_rls.sql` solo otorgó `INSERT TO anon WITH CHECK (true)`, eliminando `SELECT` y `UPDATE` para el rol `anon`.
  - La extensión enviaba la petición de guardado con `on_conflict=client_id,type,period` y la cabecera `Prefer: resolution=merge-duplicates` (UPSERT).
  - En PostgreSQL / PostgREST, un `INSERT ... ON CONFLICT DO UPDATE` requiere **permiso y política de `UPDATE`**, incluso si se inserta una fila nueva.
  - Al no existir política de `UPDATE` para `anon`, Postgres arrojaba el error `42501 (new row violates row-level security policy for table "sri_declaraciones")`, que PostgREST traduce en `HTTP 401`.
  - Adicionalmente, al no tener política de `SELECT`, las consultas anidadas `sri_declaraciones(...)` en `fetchClientsDirectly` devolvían siempre `[]`.
- **Soluciones aplicadas:**
  1. **En la extensión (`src/01_utilidades_y_pdf.js`, commit `f6454c1`):** Se implementó fallback inmediato a `INSERT` directo (sin `merge-duplicates`) si el upsert falla con 401 o 42501. Probado en vivo: el `INSERT` directo devuelve `201 Created` y guarda la declaración en `sri_declaraciones`. Si ya existía, responde `409 Conflict (23505 duplicate key)`.
  2. **En la base de datos (`santiagocordova-main/database/fix_sri_declaraciones_anon_rls.sql`, commit `5260014`):** Se creó el script SQL para crear las políticas de `SELECT` y `UPDATE` para `anon`, permitiendo tanto el upsert completo como la lectura de declaraciones históricas.

### B. Prevención de Rebotes y Errores 400 en Keycloak (Commit `820aa95`)
- Se eliminó la purga de cookies en caliente mientras el navegador está sobre el formulario de Keycloak (`src/03_ingreso_y_sesion.js`).
- Se añadió interceptor para pantallas de error genéricas de Keycloak (`/auth/realms/` sin campos de login): anota al cliente como `sesion_caida` en `Omitidos` y avanza inmediatamente al siguiente cliente sin esperar 6 segundos en bucle.

### C. Detección Temprana y Recuperación Automática de Sustitutivas (Commits `57885ba` y `668002f`)
- El bot detecta si el período ya fue presentado revisando `#frmFlujoDeclaracion:outMarcaDeclaracion` tanto en el Wizard como en el formulario.
- Si detecta `SUSTITUTIVA`, aborta el llenado, redirige a `irARecuperarComprobante()`, baja el comprobante existente desde *Consulta de declaraciones*, lo sube a R2 y Supabase, registra `pdfSubido: true` en el historial local y avanza al siguiente cliente en el lote.

### D. Blindaje contra RUCs con Números de Año (Commit `54b415b`)
- Se eliminó el matching voraz de años sobre la cabecera que capturaba partes de RUCs (ej. `0706482023001` leía erróneamente año `2023` en lugar de `2026`).
- Se prohibió la lectura de períodos sobre `document.body` (evitando que el bot lea su propio HUD).
- Se añadió suite de pruebas dedicada en `tests/periodo.html`.

### E. Incidencia en Vivo: `chrome-error://chromewebdata/` tras Auto-Login (Walter Miño, RUC 0801048844001)
- **Hecho observado en la corrida:**
  - El auto-login de Walter Miño en Keycloak funcionó exitosamente (`[KEYCLOAK] Token expires in 300 s`, perfil detectado y cliente identificado con alta fidelidad).
  - El bot detectó obligación pendiente de IVA Agosto 2026 y disparó la navegación al Paso 1:
    `window.location.href = SRI_PUENTE_RECIBIDOS` (`https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=57&idGrupo=55`).
  - Inmediatamente, la pestaña del navegador cayó en `chrome-error://chromewebdata/` (página de error interna de Chrome).
- **Hipótesis técnicas bajo análisis:**
  1. **Bucle de redirección (`ERR_TOO_MANY_REDIRECTS`):** Si el contribuyente tiene pendiente la pantalla de confirmación de medios de contacto del SRI, `accederAplicacion.jspa` redirige a `tuportal-internet/verificaEmail.jspa` (comprobado vía fetch: HTTP 302). Si no hay cookie de `tuportal-internet`, `verificaEmail` intenta volver a Keycloak provocando bucle.
  2. **Colisión de navegación en el ciclo de vida:** `window.location.href` se asignó inmediatamente mientras Angular aún emitía eventos y verificaciones en segundo plano.
  3. **Proxy / Red:** Intercepción activa de Burp Suite o corte de socket por el WAF del SRI.
- **Acciones y mitigaciones en evaluación:**
  - Añadir un pequeño respiro (`await sleep(500)`) antes del salto de navegación desde el perfil.
  - Soportar el fallback a la URL directa de comprobantes (`SRI_RECIBIDOS_URL`) o detectar `verificaEmail.jspa`.

---

## 🎯 3. TABLERO DE PENDIENTES Y PRÓXIMAS TAREAS

| Prioridad | Tarea / Asunto | Estado | Responsable / Acción Inmediata |
| :-: | :--- | :--- | :--- |
| **P1** | **Casillero 203 (Decreto del 5%)** | Scanner de `<select>` listo; falta automatizar la selección del decreto | Ver propuesta §4.1 abajo |
| **P1** | **Ejecutar migración RLS en Supabase** | Archivo SQL listo en `database/fix_sri_declaraciones_anon_rls.sql` | Ejecutar en SQL Editor de Supabase |
| **P2** | **Notificaciones Automáticas (WhatsApp / Email)** | `SalaDeEnvio.tsx` construida; falta automatizar envío vía Gmail API o Meta Cloud API | Ver propuesta §4.2 abajo |
| **P2** | **Laboratorio de Proveedores (CIIU → Crédito)** | Módulo base listo; falta mapear compatibilidad actividad cliente vs proveedor | Mantener criterio: el bot sugiere, no fuerza deducibilidad |
| **P3** | **Descarga Selectiva de XML para Facturas al 5% o Ambiguas** | Funciones `parsearXmlComprobante()` y `traerXmlDeComprobantes()` listas | Disparar solo en casos con `resumen.ambiguas` |

---

## 💡 4. PROPUESTAS TÉCNICAS Y DISEÑO DE SOLUCIONES

### 4.1. Propuesta: Automatización del Casillero 203 (Tarifa 5% - Decreto)
- **Contexto:** El SRI exige seleccionar un decreto en el casillero 203 (un `<select>` nativo o widget PrimeFaces) siempre que existan compras en materiales de construcción con tarifa 5% (casillero 540).
- **Diseño propuesto:**
  1. En Ajustes de la extensión (o en la configuración del cliente), permitir definir el decreto predeterminado (por ejemplo, el decreto de materiales de construcción vigente).
  2. Durante el paso de llenado (`05_llenado_formulario.js`), si el formulario reporta que requiere el casillero 203:
     - Leer las opciones disponibles con `sriMapaCasilleros()` / selector de opciones.
     - Si hay un solo decreto activo o coincide con la configuración predeterminada, seleccionarlo automáticamente y disparar el evento `change`.
     - Si hay ambigüedad y no está configurado, marcar en Omitidos como `formulario_incompleto` con la lista de decretos detectados para que el contador elija en 1 clic.

### 4.2. Propuesta: Envío Automático de Comprobantes por Email / WhatsApp
- **Email automático con PDF adjunto (Recomendado como siguiente paso):**
  - La infraestructura en `santiagocordova-main/telegram-bot/src/gmail.ts` ya tiene soporte de la API de Gmail.
  - Con una llamada al finalizar el guardado del comprobante (en `syncDeclarationToSupabase` o webhook), se puede disparar el correo al cliente con el PDF oficial adjunto directamente desde Gmail del estudio (límite de 500 correos/día gratuitos, suficiente para el volumen mensual).
- **WhatsApp Web / Meta Cloud API:**
  - Mantener la `SalaDeEnvio.tsx` para envíos manuales asistidos vía WhatsApp Web sin riesgo de baneo de número.
  - Para envíos 100% desatendidos, utilizar la Cloud API oficial de Meta con plantilla aprobada.

---

## 📁 5. MAPA DE ARCHIVOS CLAVE

```text
├── extenciones web/01_Nueva_Luz_3.0/
│   ├── src/
│   │   ├── 01_utilidades_y_pdf.js    <- Sincronización Supabase, subida R2, tokens
│   │   ├── 02_servicios_y_memoria.js  <- SafeStorage, GhostMemory, semáforo SriLoop, Proveedores
│   │   ├── 03_ingreso_y_sesion.js     <- Keycloak SSO, control de cookies, auto-login
│   │   ├── 04_extraccion_datos.js     <- Extracción de facturas, retenciones y NC
│   │   ├── 05_llenado_formulario.js   <- Matemática tributaria, casilleros, mapaCasilleros
│   │   ├── 06_panel_interfaz.js       <- Interfaz HUD, extracción de período, control de lote
│   │   └── 07_navegacion_sri.js       <- Wizard de declaraciones, detección de sustitutiva
│   ├── build/content.js               <- BUNDLE GENERADO POR VITE (NO EDITAR DIRECTAMENTE)
│   ├── shared_config.js               <- Credenciales públicas (Supabase URL, R2 endpoints)
│   └── tests/                         <- Suites de validación HTML (periodo, login, iva5, etc.)
│
├── santiagocordova-main/              <- REPO INDEPENDIENTE (APP WEB)
│   ├── database/
│   │   ├── fix_sri_declaraciones_anon_rls.sql <- MIGRACIÓN SQL CRÍTICA PARA RLS
│   │   └── harden_full_rls.sql
│   ├── components/features/
│   │   └── SalaDeEnvio.tsx            <- Sala de notificación WhatsApp de comprobantes
│   └── services/
│       ├── supabase.ts
│       └── fileService.ts
```
