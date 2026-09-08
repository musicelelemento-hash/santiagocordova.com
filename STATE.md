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

### A2. El camino de «ya declaró»: el atajo se pisaba y el PDF no llegaba (Claude, commit `a7d7713`)

Los dos fallos están en el camino que **cierra el objetivo de la §0**: traer el
comprobante de quien ya declaró.

1. **El atajo se perdía.** El perfil acertaba (`Veredicto: ya_declarada`) y
   arrancaba `recuperar_comprobante`. Pero el bloque de auto-arranque de
   `03_ingreso_y_sesion.js` corre en cada carga con sesión abierta y terminaba
   siempre plantando `turbo_step1_facturas` sin mirar si ya había algo en
   curso: al cargar `lista-obligaciones.jsf` lo borraba. Extraía 19 facturas,
   retenciones, NC y el wizard entero **para nada**, hasta que el paso 4 decía
   lo que el perfil ya había dicho. **No rompía nada** — el freno de la
   sustitutiva agarraba al final— así que costaba un minuto por cliente sin
   que se notara. Guardia: `YA_DECIDIDAS = ['recuperar_comprobante', 'bajar_todos_comprobantes', 'bajarTodos']`.
   *Nota del 07-sep:* Al cortar la extracción con `return`, se omitía la llamada
   posterior a `ejecutarAccionPendiente()`, dejando al bot congelado en
   `lista-obligaciones.jsf`. Se corrigió despachando `ejecutarAccionPendiente()`
   antes de salir.

2. **El PDF se iba a la carpeta de descargas.** El botón «Comprobante de
   declaración» es un `submit` de JSF; el portal responde con
   `Content-Disposition: attachment` y el navegador se lo lleva al disco, donde
   ni `fetch` ni `createObjectURL` lo ven. El archivo probablemente bajaba
   mientras el log decía «no llegó ningún PDF». Mismo caso que `lnkXml` (§11):
   `traerPdfDelComprobantePresentado()` reproduce el POST — todos los campos
   del form más el `name` del botón— y comprueba que la respuesta empiece con
   `%PDF`, porque con la sesión caída el portal contesta HTML y guardar eso
   como comprobante es peor que no tener ninguno.

Banco: `tests/recuperar.html` (20). **531 comprobaciones verdes, quince bancos.**

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

### F. Recuperación Directa de Comprobante y Captura de PDF en Consulta de Declaraciones
- **Problema detectado en corrida con Guido Chávez (RUC `0706482023001`):**
  1. **Secuestro de flujo y pérdida de tiempo:** El perfil detectaba correctamente `ya_declarada` y redirigía a *Consulta de declaraciones*, pero al cargar `lista-obligaciones.jsf`, la guarda de sesión activa sin filtro sobreescribía `pendingAction = 'turbo_step1_facturas'`, haciendo que el bot perdiera 25 segundos extrayendo 19 facturas, retenciones y navegando el wizard de declaración hasta que el paso 4 volvía a detectar sustitutiva.
  2. **Descarga de PDF no capturada:** Al pulsar «Comprobante de declaración» (`PrimeFaces.onPost()`), el navegador enviaba el archivo a la carpeta de descargas del usuario sin pasar por `fetch` ni `URL.createObjectURL`, por lo que el log arrojaba `Se pulsó la descarga pero no llegó ningún PDF`.
- **Solución implementada:**
  1. **Blindaje de acción decidida (`src/03_ingreso_y_sesion.js`):** Guarda `YA_DECIDIDAS = ['recuperar_comprobante', 'bajar_todos_comprobantes', 'bajarTodos']`. Si ya hay una acción de recuperación o barrido en curso, o ya estamos en Consulta de declaraciones, no se pisa con la extracción. Va directo por el comprobante.
  2. **Reproducción de POST nativo (`src/07_navegacion_sri.js`):** Nueva función `traerPdfDelComprobantePresentado(boton)` que emula el POST JSF vía `fetch` enviando el formulario completo con `javax.faces.ViewState` y el `name` del botón. Valida los magic bytes `%PDF` y convierte a base64 para subirlo directamente a Supabase y Cloudflare R2 sin depender de descargas del navegador.
  3. **Banco de pruebas:** `tests/recuperar.html` (añadido a `tests/index.html`).


### G. Visualización de Declaraciones en santiagocordova.com (`services/supabaseClientService.ts`)
- **Problema detectado:** El comprobante de Guido Chávez (`0706482023001`) se subió exitosamente a Cloudflare R2 y se registró en `sri_declaraciones` y `clients.declaration_history`, pero la interfaz web en `santiagocordova.com` ("Gestión Interna -> Declaraciones") no reflejaba al cliente ni sus comprobantes.
- **Causas raíz descubiertas:**
  1. **Relación inexistente `billing_plans`:** `getClients()` y `getFacturadoresPaginated()` solicitaban `.select('*, sri_declaraciones(*), billing_plans(*)')`. La relación `billing_plans` no existe en la base de datos de Supabase, provocando que PostgREST rechace la consulta con `PGRST200 (Could not find relationship between clients and billing_plans)`.
  2. **Permisos de columnas para rol `anon`:** La consulta `clients` con `is_deleted=eq.false` o `*` arrojaba error `401 / 42501` (permisos insuficientes sobre columnas protegidas como `is_deleted`).
  3. **Consecuencia:** Al fallar `getClients()`, la capa de sincronización en `useAppStore` caía en el caché local obsoleto de IndexedDB/Firestore, sin refrescar nunca los nuevos datos de Supabase.
- **Solución implementada:**
  1. Se eliminó `billing_plans(*)` de `getClients()` y `getFacturadoresPaginated()`.
  2. Se agregó fallback automático en `getClients()`: si la consulta completa falla con error de columnas/RLS, consulta exclusivamente las columnas públicas permitidas (`id, ruc, name, regime, tax_profile, declaration_history, updated_at, sri_declaraciones(*)`).
  3. Se canonizó el estado a `DeclarationStatus.Enviada` (`'Enviada'`) en `src/01_utilidades_y_pdf.js` y se actualizó el registro en Supabase.
  4. Probado en vivo: la consulta responde HTTP 200 con 157 clientes y sus declaraciones completas.

### H. Blindaje de Búsqueda de Facturas Recibidas y Prevención de Falsos Ceros (`src/03_ingreso_y_sesion.js`)
- **Problema detectado (Walter Miño, RUC `0801048844001`):**
  - En el Paso 1 (`turbo_step1_facturas`), el bot configuró año, mes y tipo "Factura", y procedió a pulsar "Consultar".
  - Sin embargo, los eventos `change` en los `<select>` de PrimeFaces activaron peticiones AJAX en curso (`#popStatusPrime`, `.ui-blockui`), lo que ocasionó que el clic en `btnConsultar` fuera ignorado o bloqueado por el portal.
  - El bot esperó 30 segundos en polling; al no detectar la tabla ni un mensaje de "no existen datos", asumió erróneamente `noData: true` (0 facturas), pasando al paso de retenciones y dejando la base imponible de compras en blanco.
- **Solución implementada:**
  1. **Espera activa de AJAX:** Antes de pulsar "Consultar", el bot verifica y espera a que `#popStatusPrime`, `.ui-blockui` y `.ui-widget-overlay` desaparezcan.
  2. **Clic reforzado:** Se aplica `.focus()` y clic directo tanto al elemento `<button>` como al `span.ui-button-text`.
  3. **Reintentos inteligentes:** Si transcurren 3.5s o 7.5s de polling sin tabla, sin overlays y sin mensajes del SRI, se relanza el clic de búsqueda.
  4. **Detección exhaustiva de mensajes vacíos del SRI:** Se incorporaron selectores para `.ui-messages-warn-detail`, `#idMensajeConsulta`, "NO EXISTEN COMPROBANTES", "NO SE ENCONTRARON REGISTROS", etc.
  5. **Fallback nativo a TXT (`descargarTxtRecibidos`):** Si el polling finaliza sin tabla ni mensaje de error, el bot dispara la descarga del listado TXT oficial del SRI (`frmPrincipal:lnkTxtlistado`). Si el TXT contiene facturas, las extrae y procesa inmediatamente sin perder ninguna. Solo si el TXT está vacío concluye `noData: true`. Si el TXT falla, recarga la página para reintentar limpiamente en lugar de asumir 0.

### I. Resolución del Casillero 203 y el Falso 5% en Walter Miño (Commit `dacc26f`)
- **Problema detectado:** Al pulsar "Siguiente" en el formulario de Walter Miño, el SRI bloqueó el avance con:
  `* Casillero 203. Seleccione el decreto que determina la tarifa reducida a aplicar.`
  `* Casillero 203. El decreto seleccionado es incorrecto.`
- **Hallazgos con la radiografía del 📐:**
  1. El casillero 203 es el desplegable `concepto91` con 17 opciones.
  2. **Todas las opciones corresponden a Decretos Ejecutivos del 8%** (turismo en feriados). Ninguna es del 5%.
  3. **¿Por qué se activó el 203?** De las 157 facturas de Walter Miño, una factura minúscula (Fila 6) tenía `Base: $0.10, IVA: $0.02` (cociente 20%). Con holgura de centavos ($0.02), `clasificarTarifaIva()` la clasificaba erróneamente en el 5% por ser la primera del array `TARIFAS_IVA`. Esto escribió $0.10 en el casillero 540, disparando la exigencia del decreto en el casillero 203.
- **Solución implementada (`src/04_extraccion_datos.js`):**
  1. Se ajustó `clasificarTarifaIva()`: al 5% nunca se llega por simple holgura de centavos; se exige cercanía porcentual real (<= 1%). Para importes ínfimos (< $1), se asigna la tarifa más cercana (en este caso 15%).
  2. Al clasificarse al 15%, los $0.10 van al casillero 500/510 y **el casillero 540 queda en 0**, eliminando el reclamo del casillero 203 y permitiendo enviar la declaración de forma transparente.
  3. Matriz de `.agents/AGENTS.md` actualizada con `Casillero 203 = concepto91`.
  4. Suite de pruebas en `tests/iva5.html` ampliada a 544 comprobaciones verdes.

### J. Búsqueda Certera y Detección Verídica de "No existen datos" en Comprobantes Recibidos (Retenciones / NC)
- **Problema reportado:** Durante la extracción en `comprobantesRecibidos.jsf` (paso de retenciones o facturas), el bot no llegaba a disparar la consulta o se quedaba congelado esperando el mensaje oficial:
  `<span class="ui-messages-warn-summary">No existen datos para los parámetros  ingresados </span>`
- **Causas raíz detectadas en `src/03_ingreso_y_sesion.js` y `src/04_extraccion_datos.js`:**
  1. **Selector incompleto:** El bot solo buscaba `.ui-messages-warn-detail` y `.ui-messages-info-detail`. PrimeFaces inyecta el aviso "No existen datos..." dentro de `.ui-messages-warn-summary`, por lo que el mensaje existía en pantalla pero el bot no lo leía.
  2. **Destrucción de elementos en el DOM:** `oldMessages.forEach(m => m.remove())` eliminaba físicamente el contenedor `#formMessages:messages`. En la siguiente respuesta AJAX de JSF, PrimeFaces intentaba inyectar el nuevo mensaje en un elemento destruido, provocando fallos silenciosos.
  3. **Colisión de clics concurrentes:** `dispararClicConsultar()` disparaba `btnConsultar.click()` y una fracción de milisegundo después `span.click()`. En PrimeFaces, dos clics seguidos sobre el mismo botón disparan dos peticiones AJAX encoladas, cancelando la primera y congelando el ciclo.
  4. **Fallback ciego a 0:** En el Paso 3 (retenciones) y Paso 5 (notas de crédito), si el polling terminaba sin tabla ni `noData`, el bot asumía 0 retenciones/NC sin verificar el mensaje oficial de advertencia.
- **Solución implementada (Commit `e31220d`, Build `3.1.0+20260907.2105`):**
  1. **Detector Universal y Canónico (`detectarMensajeNoDatosSRI` en `src/02_servicios_y_memoria.js`):**
     - Inspecciona `.ui-messages-warn-summary`, `.ui-messages-warn-detail`, `.ui-messages-warn`, `.ui-messages-info-summary`, `.ui-datatable-empty-message`, `#formMessages:messages` y tolera los espacios dobles del SRI (`NO EXISTEN DATOS PARA LOS PARÁMETROS  INGRESADOS`).
     - Ignora mensajes obsoletos de consultas previas mediante atributo `data-sri-old="true"` sin alterar la estructura DOM.
  2. **Clic Certero y Reintentos Automáticos:**
     - Secuencia limpia de eventos (`mousedown` -> `mouseup` -> `click`) exclusiva sobre el botón de PrimeFaces (`frmPrincipal:btnConsultarSinRe`).
     - Si tras 3.5s, 7.5s o 13s no hay respuesta, ni spinner activo, ni mensaje oficial, el bot re-dispara el clic automáticamente.
  3. **Seguridad contra falsos ceros:**
     - Si tras 30 segundos no hay tabla de retenciones ni mensaje verídico de "No existen datos", el bot NO asume 0; recarga la página de comprobantes y reintenta limpiamente.
  4. **Banco de pruebas:** Creado `tests/recibidos_nodata.html` (6 comprobaciones automáticas añadidas a `tests/index.html`).

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

### E. Despliegue a producción de `santiagocordova-main` y visibilidad de comprobantes (07-sep-2026)
- **Problema reportado:** El PDF de Walter Miño (`0801048844001`, `2026-08`) no aparecía en `santiagocordova.com` en "Gestión Interna -> Menú Declaraciones".
- **Verificación en infra:**
  - En Cloudflare R2: el archivo `Declaracion_IVA_0801048844001_2026-08.pdf` (85,935 bytes) existe y responde `HTTP 200 OK`.
  - En Supabase: Walter Miño tiene registrada la declaración `2026-08` en `declaration_history` con estado `Enviada`, compras 15% ($4,317.46), compras 0% ($79.05), retenciones y la URL pública de R2.
- **Causa raíz en la web:**
  - El sub-repositorio `santiagocordova-main` estaba 5 commits por delante de `origin/main`.
  - La versión vieja en Vercel llamaba en `getClients()` a `billing_plans(*)` (tabla inexistente) y `is_deleted` (columna denegada a `anon`), arrojando `HTTP 401 / 42501 permission denied`.
  - La web en Vercel abortaba el refresco de Supabase y mantenía en memoria el caché previo de IndexedDB.
- **Acción ejecutada:**
  - Se verificó el build (`tsc --noEmit && vite build`) en verde (`✓ built in 1m 16s`).
  - Se hizo `git push origin main` en `santiagocordova-main` (commits `a0ce6d9..9afe3c7`). Vercel re-despliega con el fallback de 7 columnas públicas que recupera a los 157 clientes y todas sus declaraciones.

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
├── extenciones web/
│   ├── _EVIDENCIA_SRI/
│   │   ├── BIBLIA_FORMULARIO_IVA_2011.md <- ESPECIFICACIÓN CANÓNICA CASILLEROS IVA 2011
│   │   └── BIBLIA_PANTALLAS_SRI.md       <- CATÁLOGO DE CAPTURAS REALES DEL PORTAL
│   └── 01_Nueva_Luz_3.0/
│       ├── src/
│       │   ├── 01_utilidades_y_pdf.js    <- Sincronización Supabase, subida R2, tokens
│       │   ├── 02_servicios_y_memoria.js  <- SafeStorage, GhostMemory, semáforo SriLoop, Proveedores
│       │   ├── 03_ingreso_y_sesion.js     <- Keycloak SSO, control de cookies, auto-login
│       │   ├── 04_extraccion_datos.js     <- Extracción de facturas, retenciones y NC
│       │   ├── 05_llenado_formulario.js   <- Matemática tributaria, casilleros, mapaCasilleros
│       │   ├── 06_panel_interfaz.js       <- Interfaz HUD, extracción de período, control de lote
│       │   └── 07_navegacion_sri.js       <- Wizard de declaraciones, detección de sustitutiva
│       ├── build/content.js               <- BUNDLE GENERADO POR VITE (NO EDITAR DIRECTAMENTE)
│       ├── shared_config.js               <- Credenciales públicas (Supabase URL, R2 endpoints)
│       └── tests/                         <- Suites de validación HTML (periodo, login, iva5, etc.)
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
