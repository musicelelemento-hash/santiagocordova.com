# ESTADO DEL PROYECTO — COLABORACIÓN ANTIGRAVITY & CLAUDE CODE
> **Fecha de actualización:** 09-sep-2026  
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

## 🏆 2. HITOS Y BUGS CRÍTICOS RESUELTOS HOY (09-SEP-2026)

### 2.0 · La suite decía «544 en verde» sobre dos bancos que no corrían — 561 reales, 3 bugs destapados

> Verificación con Chrome headless (CDP) sobre los **16 bancos** de
> `tests/index.html`, cargando el `build/content.js` de verdad. Lo que se creía
> «544 comprobaciones, 14-15 bancos» venía de corridas parciales o
> documentación desincronizada. La corrida completa del 09-sep destapó que dos
> bancos estaban **rotos y mudos**, y que debajo había tres fallos reales:

| Qué | Estado antes | Qué pasaba de verdad |
| :--- | :--- | :--- |
| `tests/iva5.html` | «en verde» (104) | Roto desde el 08-sep (commit `523f407` borró `const raro`): moría con `ReferenceError` y no pintaba veredicto. Los fixes anti-falso-5% del 08-sep se commitearon sin que este banco corriera. |
| `tests/recibidos_nodata.html` | «agregado» | Nunca corrió en el runner: escribía `Total: X/Y en verde`, que no matchea el contrato (`✓ N…todas bien` / `✗ N de M fallaron`) → timeout de 90s siempre. |
| `detectarMensajeNoDatosSRI()` | bug real | Un «No existen datos» de una consulta previa volvía a detectarse como nuevo cuando la marca `data-sri-old` estaba en el contenedor `.ui-messages-warn` y no en el span (o al revés). Lo destapó `recibidos_nodata` al poder correr. Corregido: se ignora el elemento marcado, el que cuelga de un contenedor marcado (`closest`), y el texto de un clon sin nodos viejos. |
| `iva5.html` · Heineken con ICE | esperaba 234.80 | El fixture trae total 270.01: la base que cabe es `total − IVA` = 234.79 (234.80+35.22 = 270.02 > 270.01). El código respetaba el total; el test esperaba lo imposible. |
| `iva5.html` · cociente 4,95% | esperaba 5% | La mezclada exacta 33/67 (un tercio al 15%) ya no se confunde con 5% desde el blindaje del 08-sep (Cabrera, Ramón Orellana, Walter Miño): devuelve `null`, no 5. Test desactualizado, no código. |

**Estado final:** 561 comprobaciones, **todas verdes, 16 bancos** (09-sep-2026).
Commits: `4296a7b` (fix detector), `f769ae7` (bancos y expectativas), `7794e80`
(AGENTS.md con cifra real). Detalle en `extenciones web/01_Nueva_Luz_3.0/HANDOFF.md §4.11`.

**Lección anotada para siempre (también en HANDOFF §5):** un banco que no pinta
veredicto no es un banco en verde — es un banco mudo, y todo lo que cuidaba
queda sin vigilar.

### 2.0b · La Lista Bendita + la cura de los clientes viejos (misma jornada, 09-sep)

> Pedido del usuario: que la lista del popup sea "la Lista Bendita" — todo el
> que esté en esa lista corre; el resto no. Y que desaparezcan los clientes
> viejos que aparecían.

**Causa raíz de los clientes viejos — confirmada con HTTP contra Supabase real:**
el popup pedía `clients?is_deleted=eq.false`, columna que el rol `anon` no puede
leer (`HTTP 401 / 42501`). El fetch fallaba **siempre**, en silencio, y la lista
vivía de `sc_clients_cache` (caché local inmortal): los dados de baja nunca se
iban. La web ya había sacado ese filtro; la extensión había quedado pidiendo lo
que no puede leer.

**Qué se hizo (commits `651ccf5`, `0b212bc`, `bed47a4`, `6e6992d`):**

1. **`grant_is_deleted_anon.sql`** — el GRANT de una línea para Supabase
   (`GRANT SELECT (is_deleted) ON public.clients TO anon;`). Es la misma línea
   documentada en `database/fix_sri_declaraciones_anon_rls.sql`. **Acción
   pendiente del usuario**: correrla en el SQL Editor. Sin ella el popup anda en
   "modo degradado" con aviso ámbar.
2. **Fetch honesto + caché que expira**: el popup detecta el 401, avisa con el
   SQL exacto y ya no finge que sincronizó. Con el GRANT, pide además las bajas
   (`sc_clientes_baja`, clave aparte: la caché común alimenta el lote y no debe
   llevar bajas). Marca `sc_clients_cache_ts` para saber cuándo se sincronizó.
3. **La Lista Bendita** (`sc_lista_bendita`): `null` = inactiva (corre todo,
   como siempre); array de RUC = activa (corre SOLO eso). El switch 🙏/🤍 por
   tarjeta, acciones masivas (bendecir pendientes / quitar todos / modo
   clásico), y el Modo Auto solo arranca con benditos. Global entre períodos
   (decisión del usuario). El ▶ manual de un cliente puntual NO se filtra.
4. **Las cuatro bocas del lote pasan por el filtro** (`SriLoop.armarCola`, el
   mensaje `SRI_START_BATCH_DECLARATION`, el botón maestro del cockpit y el
   ferrocarril dinámico que re-agrega clientes en caliente).
5. **Visual**: barra-resumen viva (benditos · correrán · sin clave), aviso de
   sync, clave con revelado temporal de 5 s, pestaña 🚫 Bajas separada de Otros,
   panel del Modo Auto con destino, footer v3.2.0.
6. **Banco nuevo `tests/bendita.html`** (26 comprobaciones) — monta el popup
   real con mocks (patrón de `claves.html`) y cazó un bug real del código
   (`bendecirTodosPendientes` filtraba por bendito sobre una lista vacía y no
   bendecía a nadie).

**Estado final: 587 comprobaciones, todas verdes, 17 bancos** (09-sep-2026).

### 2.0c · Criterio del usuario sobre ND, liquidaciones y excedentes de NC — DOCUMENTADO, no cableado

> El usuario describió el manejo de los tipos de comprobante que faltan
> (notas de débito, liquidaciones de compra, excedentes de notas de crédito).
> **Se anotó en `.agents/AGENTS.md §8a` como criterio pendiente de validar** —
> no se tocó código ni diccionario (decisión del usuario: "solo documentar").

**Lo que dijo (criterio contable):**
- **Liquidaciones de compra**: sustentan crédito tributario solo si se retuvo y
  depositó el 100% del IVA; van a los casilleros de compras locales según
  tarifa; la retención se reporta aparte (103/retenciones); cuentan en el
  casillero **119** (DOM `concepto260`, ya en la Biblia).
- **Notas de crédito recibidas**: reducen base imponible E IVA en el período
  recibido (el bot ya resta NC del 510/517/550). Hay excedentes por compensar
  (543 NC 0% · 544/554 NC 15% en la Biblia) que hoy no se usan.
- **Notas de débito recibidas**: incrementan el bruto del tipo de compra del
  período. Nunca se barrió una ND — es el tipo que falta construir.

**⚠️ Discrepancia de numeración que quedó anotada para resolver con el 📐:**
el usuario describió la sección compras con **501/511/521 corriente 15%**,
**502 como activo fijo** y **553/554 proporcionalidad**; la Biblia del 2011
(armada con capturas y escrituras reales) dice **500/510/520 corriente**,
**501/511/521 activo fijo**, **502/512/522 sin derecho**, **563/564/565
proporcionalidad**. Puede ser el Formulario 104 histórico vs el 2011 del
wizard, o un error de la Biblia. **No se resuelve discutiendo: se resuelve con
el 📐 sobre la fila real** (AGENTS §8a / §9d / §0b.5).

### 2.0d · El Reglamento SRI — fuente única de reglas que no se rompen (09-sep, tarde)

> Pedido del usuario: *"crear algo como reglas en base al SRI, como la Biblia,
> para regirnos mejor en las leyes del SRI perfectamente y reducir errores por
> fallos, pues no se pueden romper"*.

**Qué se construyó (Fase 1, commits `3797b2e` + `6af323f` + `2737cbe`):**

1. **`reglas_sri.js`** (raíz de la extensión) — fuente única ejecutable: 20
   reglas, cada una con `id` inmutable, `severidad` (crítica/aviso), `tipo`
   (ley/portal/bot), el mandato, el `porque` (la historia real), `fuente` y
   `cobertura` (banco que la demuestra). Centraliza lo que estaba disperso
   entre AGENTS y la Biblia.
2. **Reglas de oro ya vigentes**: nunca sustitutiva · nunca pagar · saldo USD
   0.00 estricto · `null`≠0 · ausencia≠limpio · id solo con evidencia (📐) ·
   203 sin decreto inventado · 540 solo con 5% legítimo · claves fuera del DOM
   · no cambiar claves · no leerse a sí mismo · no saltear por aviso · no
   contestar encuestas · `%PDF` real · respetar sugerido 0.00.
3. **Reglas 'ley' quedan `requiere_contador`**: la fuente legal la pone el
   contador (liquidaciones 100% retenido · ND incrementan bruto · 502/512 sin
   derecho · numeración 104 vs 2011). **Ninguna regla se marca vigente sin
   demostración** — es la misma regla del proyecto.
4. **`tests/reglas.html`** (24 comprobaciones): valida ids únicos, estados
   válidos, cobertura real, críticas con acción, presencia de las reglas de
   oro y huecos del contador. **Si alguien borra o cambia una regla, el banco
   falla** — no se rompe en silencio.
5. **`tools/generar_reglamento.js`** → regenera `_EVIDENCIA_SRI/REGLAMENTO_SRI.md`
   (copia legible; no se edita a mano).
6. **Evidencia primaria anclada sin transcribir**: `codigo_fuente_decl_iva_mes.pdf`
   (view-source del portal) y `formulario_iva_mensual_sep_2026.pdf` — sus PDFs
   tienen fuente sin tabla ToUnicode / son imagen, así que **ningún id se tomó
   de ahí**: se transcriben con el 📐 y recién entonces se citan.

**Estado final: 611 comprobaciones, todas verdes, 18 bancos** (09-sep-2026).

---

## 🏆 2a. HITOS PREVIOS (08-SEP-2026)

### 2.1. Diagnóstico de «richfaces.js.jsf:746 [Violation] unload is not allowed»
- **Origen:** Advertencia nativa del motor Chromium (Chrome 117+) informando la depreciación del evento `unload` en la Permissions-Policy del navegador, disparada por el script legacy de RichFaces 4.3.7 del portal del SRI.
- **Impacto:** Es ruido informativo del navegador, no un error de JavaScript de la extensión ni una excepción fatal. La causa real que detenía las declaraciones estaba en dos bugs tributarios y de extracción abajo detallados.

### 2.2. Farmaenlace CIA. LTDA. ($3.56) detenía a CABRERA BERONICA MARIA como «ambigua 5%»
- **Causa raíz:** En una sesión previa, una factura ínfima de Farmaenlace se había clasificado erróneamente en `tarifas['5']` en `sc_proveedores`. La función `losQueFacturanAl5()` devolvía a Farmaenlace en `rucsAl5`. Como $3.56 con $0.16 de IVA cabe aritméticamente tanto en $1.07 al 15% + $2.49 al 0% como en $3.20 al 5% + $0.36 al 0%, el bot lo marcó como ambiguo y activó `anotarIvaSinUbicar`, impidiendo el envío.
- **Corrección:**
  1. Las farmacias y cadenas de retail/supermercados (`FARMAENLACE`, `SUPERMAXI`, `TIA`, etc.) nunca comercializan materiales de construcción al 5%. Se filtran explícitamente en `losQueFacturanAl5()` y en `registrarLote()`.
  2. En `calcularResumen()`, las compras menores a $30 o de emisores minoristas nunca se marcan como ambiguas frente al 5% de la construcción. Farmaenlace se reparte limpiamente como $1.07 al 15% y $2.49 al 0%.

### 2.3. Facturas con ICE (Heineken, Arcador/Coca-Cola, Ajecuador) corrompían 27 facturas en CARDENAS PESANTES
- **Causa raíz:** En `extraerFacturasPaginaActual()`, una reconciliación forzaba `iva = importeTotal - valorSinImpuestos` cuando la resta difería de la columna. En Ecuador, para bienes con ICE (cervezas, licores, gaseosas azucaradas), `total - base = IVA + ICE`. Además, bajo el Art. 65 de la LRTI, la base imponible del IVA **incluye el ICE**. La columna «IVA» del SRI ya traía el IVA oficial exacto ($35.22 en Heineken). Al pisarlo con `95.46` ($35.22 IVA + $60.24 ICE), la tarifa calculada saltaba a 54.69%, arrojando 27 facturas sin tarifa reconocible.
- **Corrección:**
  1. En `extraerFacturasPaginaActual()`, la columna oficial «IVA» del SRI se respeta y **nunca** se sobreescribe cuando trae un importe positivo. La diferencia con `total - base` se reconoce y registra como ICE/otros tributos.
  2. `repartirMezclada(base, iva, plena, totalFactura)` ahora recibe el `importeTotal` de la factura, permitiendo que la base imponible del 15% contemple el ICE (e.g. $234.80 de base para los $35.22 de IVA), asignando la compra íntegramente al casillero 500/510 y garantizando el 100% del crédito tributario.

### 2.4. Reconocimiento Rápido de Clientes (Alias) y Cifras de Declaraciones en Bóveda y Perfil (Web)
- **Problema:** Al usar la aplicación web no se disponía de un mecanismo ágil para poner notas/alias de reconocimiento ("Mecánica El Chino", "Don Pepe", etc.), y al recargar la página la consulta a Supabase con rol `anon` sobreescribía con `undefined` los campos locales de IndexedDB. Además, en la Bóveda y Perfil no se reflejaban ni podían copiarse los valores financieros de las declaraciones.
- **Solución implementada:**
  1. **Protección de Estado Local (`useAppStore.ts`):** `loadFromDB` preserva estrictamente notas, alias, tradeName, contraseñas SRI y firmas frente a consultas cloud restringidas por permisos de columna PostgreSQL.
  2. **Alias Inline:** Badge interactivo `🏷️ Alias / Reconocimiento` en `ClientHeader.tsx` con edición instantánea, además de visualización en tarjetas (`ClientCard.tsx`), tablas (`VirtualClientTable.tsx`) y drawer de edición.
  3. **Cifras y Copia en Bóveda (`VaultTab.tsx`)**: Nueva sección Obsidian con desglose completo (Ventas 15/0, Compras 15/5/0, IVA Compras, Retenciones IVA/Renta, Pagar, Saldo a Favor). Botones `[Copiar Cifras]` (WhatsApp), `[Copiar CEP]`, `[Ver PDF]` y `[Editar Cifras]` con modal y auto-cálculo de impuestos.
  4. **Cifras en Perfil (`ExecutiveObligationsTable.tsx`)**: Barra de resumen financiero con botones de copia rápida para declaraciones enviadas.
  5. **Verificación:** `npm run build` en `santiagocordova-main` (`tsc --noEmit && vite build`) completado con código de salida 0.

---

## 🏆 2b. HITOS PREVIOS (07-SEP-2026)

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

### K. Prevención de Botones Huérfanos y Timing de AJAX en Cambio de Tipo de Comprobante (Commit `78647af`, Build `3.1.0+20260907.2127`)
- **Problema reportado:** Durante la corrida automática (ej. en Notas de Crédito con Cárdenas Pesantes), el bot se detuvo ~40s en la consulta de recibidos con múltiples reintentos y fallback a TXT.
- **Causas raíz:**
  1. **Botón huérfano en reintentos:** `btnConsultar` se capturaba una sola vez por referencia antes de consultar. Si el evento `change` en `<select id="frmPrincipal:cmbTipoComprobante">` refrescaba el formulario vía JSF AJAX, el botón original quedaba desconectado del DOM (`isConnected === false`). Los reintentos (intento 2, 3, 4) hacían clic sobre un nodo muerto.
  2. **Colisión de eventos:** Se enviaba `btnConsultar.click()` a los 600ms de cambiar el combo, cuando la petición AJAX del combo aún estaba en tránsito o re-renderizando.
  3. **Salto prematuro de pendingAction en recarga:** Si la consulta fallaba, el estado en storage conservaba `nextStep` (ej. paso 6 extraer) en vez del paso de búsqueda (paso 5), forzando un timeout de 10s tras la recarga.
- **Solución implementada (`src/03_ingreso_y_sesion.js`):**
  1. `dispararClicConsultar()` ahora consulta `document.getElementById('frmPrincipal:btnConsultarSinRe')` fresco en el DOM en cada intento.
  2. Al cambiar `selTipo`, se espera `waitForPortal(3000)` para que JSF termine su actualización antes de buscar y pulsar "Consultar".
  3. En caso de error o recarga, se restablece explícitamente `pendingAction: 'turbo_stepX'` para reintentar la búsqueda limpia.

### L. Eliminación del Falso 5% en Facturas Mezcladas y Desbloqueo del Casillero 203 (Commit `a3deba6`, Build `3.1.0+20260907.2132`)
- **Problema detectado (Cabrera Berónica María, RUC `1103034052001`):**
  - Al presionar "Siguiente" en el formulario, el SRI bloqueó el avance con:
    `* casillero 203. seleccione el decreto que determina la tarifa reducida a aplicar.`
    `* casillero 203. el decreto seleccionado es incorrecto.`
- **Causa raíz analizada:**
  - De las 12 facturas de Cabrera, una factura de comercio minorista tenía `Base: $3.56, IVA: $0.16` (cociente 4.49%).
  - La holgura previa de `clasificarTarifaIva()` admitía 2 centavos de diferencia ($0.16 vs $0.178), clasificándola erróneamente en el balde del 5% (`resumen.iva5`) antes de evaluar el reparto de tarifas mezcladas.
  - Esto inyectó $3.56 en los casilleros 540 y 550, disparando el reclamo de decreto en el casillero 203.
  - En realidad, dicha factura es 100% una compra mezclada: **$1.07 al 15% ($0.16 de IVA exacto, error residual $0.0005) + $2.49 al 0%**.
- **Solución implementada (`src/04_extraccion_datos.js`):**
  - Se blindó `clasificarTarifaIva()`: para clasificar una factura al 5%, la diferencia debe ser $\le 0.01$ y no debe existir un reparto como factura mezclada (15% + 0%) con menor residuo.
  - Al reclasificarse como mezclada, los $1.07 van al 500/510 y $2.49 al 507/517. **Los casilleros 540 y 550 quedan en 0.00**, eliminando la exigencia del casillero 203 y permitiendo enviar la declaración sin bloqueos.
### M. Desbloqueo de Casillero 203 en Compras Minoristas (<$100) — Caso Ramón Orellana (Build `3.1.0+20260908.1441`)
- **Problema detectado (Ramón Orellana Benito Efraín, RUC `0701672370001`):**
  - Al avanzar al resumen con el botón "Siguiente", el validador JSF del SRI bloqueó el envío con:
    `* casillero 203. seleccione el decreto que determina la tarifa reducida a aplicar.`
    `* casillero 203. el decreto seleccionado es incorrecto.`
- **Causa raíz analizada:**
  - De las 16 facturas del período, la factura 1 tenía `Base: $23.71, IVA: $1.19, Total: $24.90` (cociente 5.0189%).
  - La condición anterior redondeaba los residuos a 2 decimales (`redondear(0.0045) = 0.00` vs `redondear(0.0000) = 0.00`), por lo que `difMezcla < dif5` (`0.00 < 0.00`) evaluaba a falso, cayendo en el casillero 540.
  - Al cargar $23.71 en el 540, el portal SRI exige obligatoriamente un decreto en el 203, donde solo existen decretos de turismo al 8% que el backend del SRI rechaza como incorrectos.
  - En la realidad comercial, un gasto de $24.90 no es compra industrial de materiales de construcción, sino una compra minorista mixta: **$7.93 al 15% ($1.19 de IVA exacto, residuo 0.0000) + $15.78 al 0%**.
- **Solución implementada (`src/04_extraccion_datos.js`):**
  - Se comparan los residuos reales sin redondeo prematuro y se protege toda compra menor a $100 que se explique con alta exactitud como factura mixta (`base0 >= 0.10`, `rawDifMezcla < 0.002`).
  - Los $7.93 van al 500/510 y los $15.78 al 507/517. Los casilleros 540 y 550 permanecen en `0.00`, evitando el bloqueo del 203 y manteniendo idéntico crédito tributario ($1.19).
  - Comprobaciones agregadas en `tests/iva5.html`. Build generado: `3.1.0+20260908.1441`.

---

## 🎯 3. TABLERO DE PENDIENTES Y PRÓXIMAS TAREAS

| Prioridad | Tarea / Asunto | Estado | Responsable / Acción Inmediata |
| :-: | :--- | :--- | :--- |
| **P1** | **Casillero 203 (Decreto del 5%)** | Scanner de `<select>` listo; falta automatizar la selección del decreto | Ver propuesta §4.1 abajo |
| **P1** | **Rotar la clave de R2 (sigue en `shared_config.js`)** | Verificado 09-sep-2026: `R2_SECRET_ACCESS_KEY` sigue en el código (64 chars). El mecanismo de Ajustes está completo y probado (campos Access Key ID + secreto + botón "Probar ahora"; banco `tests/claves.html` 28 verdes). | **El usuario**: rotar el token en Cloudflare (R2 → *Manage R2 API Tokens*, no Mi Perfil → API Tokens), cargar **las dos** partes en Ajustes, correr 🔌 «Probar ahora» hasta que diga "del almacén", y recién ahí vaciar `shared_config.js` (HANDOFF §4.1 — no vaciarlo antes o se rompe la subida). |
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
