# Runbook — operar y entregar SC PRO

Manual corto para quien toca esto (vos hoy, otra persona mañana): cómo cambiar
algo sin romperlo, cómo entregarlo y qué hacer cuando algo falla.

> Regla de oro: **el código vive en las carpetas individuales; `suite/` es un
> artefacto**. Se arregla el módulo y se vuelve a compilar. Editar `suite/` a
> mano es la forma más rápida de tener dos versiones distintas del mismo bug.

---

## 1 · Los cinco artefactos

| Artefacto | Carpeta | Versión actual | Qué es |
| :--- | :--- | :--- | :--- |
| 01 · IVA | `01_Nueva_Luz_3.0/` | 3.2.0 | El motor: declaración mensual + HUD + experiencia |
| 02 · Claves | `02_Cambio_Claves_SRI/` | 1.1.0 | Cambio de clave `*` → `@` |
| 03 · Gastos | `03_Anexo_Gastos_Personales/` | 1.2.0 | Anexo de gastos personales |
| 04 · Anulador | `04_Anulador_Comprobantes_SRI/` | 2.5.0 | Anulación de comprobantes (motor v2.5, el que funciona) |
| Suite | `suite/` | 4.1.0 | Los cuatro juntos (generada) |

Las cinco se cargan igual: `chrome://extensions/` → *Modo de desarrollador* →
*Cargar descomprimida*.

---

## 2 · Ciclo de cambio

```
editar  →  compilar  →  probar  →  regenerar suite  →  recargar
```

```powershell
cd "C:\Programacion\Paginas Web\SantiagoCordova.com\extenciones web"

# 1) La puerta de calidad (hace todo: sintaxis, build, 909 bancos, suite, manifiestos)
powershell -ExecutionPolicy Bypass -File tools\verificar.ps1

# 2) Con las pruebas de navegador (Edge + Python), ~3 min
powershell -ExecutionPolicy Bypass -File tools\verificar.ps1 -ConNavegador -Python "C:\ruta\python.exe"

# 3) Rápido mientras iterás (sin los 57 s de bancos)
powershell -ExecutionPolicy Bypass -File tools\verificar.ps1 -SaltarBanco
```

Después: `chrome://extensions/` → ↻ en la extensión y **recargar la pestaña del
SRI**. Los content scripts sólo entran al cargar la página: si no recargás, ves
el código viejo y parece que “no tomó el cambio”.

### Qué toca cada cambio

| Si cambiás… | Hay que… |
| :--- | :--- |
| `01/src/*.js` | `vite build` (lo hace `verificar`) + regenerar suite |
| `01/popup.*`, `01/options.*`, `01/background.js`, `01/shared_config.js` | regenerar suite (la copia) |
| `02/*`, `03/content.js`, `04/content.js` | regenerar suite |
| `03/popup.*` (no va en la suite) | nada más que recargar 03 |
| `tools/suite_rail.js` | regenerar suite |
| una traza de Burp nueva | copiarla a `<extensión>/recorridos/` (ver `RECORRIDOS.md` §4) |
| Docs | nada |

`node tools/construir_suite.mjs --check` dice si la suite quedó vieja sin
mirar fechas. Si el build de la 01 es más viejo que su `src/`, el constructor
lo avisa: significa que te olvidaste de compilar.

---

## 3 · Versionado y entrega

- **Semver por artefacto.** Se sube la versión en `manifest.json`
  (`3.2.0`). La suite tiene la suya (`4.1.0`) y se toca en
  `tools/construir_suite.mjs` **y** en `tools/suite_rail.js` (tienen que
  coincidir; el riel la muestra).
- **Cambio de UI o de contrato de almacén** → sube el minor. **Arreglo** →
  patch. **Rompe compatibilidad** → major.
- La versión del popup ya se lee del manifiesto (no se escribe a mano).

### Checklist de entrega

1. `verificar.ps1 -ConNavegador` en verde.
2. `construir_suite.mjs --check` al día.
3. Probar **un cliente de punta a punta** en el portal (modo 👣): login →
   comprobantes → formulario → cierre → comprobante.
4. Revisar que no haya secretos nuevos: `git diff` de `shared_config.js`,
   `03/content.js`, `04/content.js`.
5. Si se arma un ZIP para publicar: **excluir `recorridos/`** (Chrome ignora
   las carpetas `_*`, pero `Compress-Archive` no).
6. Commit con el qué y el por qué (no sólo “cambios”).

---

## 4 · Rollback

| Situación | Qué hacer |
| :--- | :--- |
| Un cambio rompió algo y no hay commit | `git diff` para ver qué tocaste; `git checkout -- <archivo>` devuelve ese archivo |
| Hay commit y salió mal | `git revert <sha>` (no `reset --hard`: no borres historia de un repo con evidencia) |
| Se perdió una carpeta | `_respaldos/extensiones_2026/` tiene el respaldo completo previo a la reorganización |
| La suite quedó rara | borrala y regenerala: `node tools/construir_suite.mjs` |
| Una versión vieja funcionaba | `_archivo/legacy/` y `_respaldos/` |

La suite **nunca** hace falta respaldarla: se regenera desde las cuatro
carpetas en segundos.

---

## 5 · Incidentes frecuentes

| Síntoma | Causa probable | Arreglo |
| :--- | :--- | :--- |
| “Manifest file is missing or unreadable” | La carpeta se movió o se borró | Recargar desde `chrome://extensions` con la ruta nueva |
| Dos paneles / dos burbujas iguales | Suite + standalone del mismo módulo instalados | Desinstalar uno (regla: un módulo, una extensión) |
| Chrome: “Filenames starting with _ are reserved” | Una carpeta o archivo de la raíz empieza con `_` (Chrome la rechaza; no la ignora) | Renombrarla (ej. `_recorridos` → `recorridos`) y recargar; `verificar.ps1` lo detecta |
| El cambio no aparece en el portal | Pestaña no recargada, o build viejo | ↻ extensión + F5; `verificar.ps1` avisa si el build está viejo |
| “Extension context invalidated” | Se recargó la extensión con la pestaña abierta | Recargar la página del SRI |
| La suite tiene un arreglo que la individual no | Se editó `suite/` a mano | Regenerar; editar siempre la individual |
| Las claves “desaparecieron” | `chrome.storage.local` es por extensión | Volver a cargarlas, o migrar con el recetario de `ESTADO_ACTUAL` §3 |
| El lote no arranca | `sc_loop` quedó en un estado viejo | 🛑 Detener y volver a arrancar; el semáforo es la única autoridad |
| La IA no clasifica | No hay clave en `sc_ia_credenciales` | Cargarla en el popup de la 03 (**IA · Gemini**) o en Ajustes de la 01/suite |
| La subida a la nube falla | Falta R2, o el Worker está caído | Ajustes → *Probar subida* (dice por qué falla cada camino) |
| La 04 no llena el formulario | Se instaló el rediseño v3.0 (archivado) en vez del motor v2.5 | Cargar `04_Anulador_Comprobantes_SRI`; el v3.0 está en `_archivo/04_anulador_v3_experimental/` |

---

## 6 · Secretos y rotación

Ningún secreto va en el código ni en un `.md`. Viven en
`chrome.storage.local` de cada extensión (Ajustes o popup) y se cargan a mano
una vez por navegador.

| Secreto | Dónde vive | Cómo se rota |
| :--- | :--- | :--- |
| Gemini (IA) | `sc_ia_credenciales.apiKey` | Google AI Studio → nueva clave → popup 03 / Ajustes |
| R2 (subida) | `sc_r2_credenciales` | Cloudflare → *Manage R2 API Tokens* → Ajustes de la 01 |
| Supabase `anon` | `shared_config.js` (pública por diseño) | Supabase → API Keys; vive en el repo, no es secreto |
| Certificados `.p12` | Fuera del repo (`*.p12` en `.gitignore`) | No se versionan nunca |

**Si una clave se filtró:** rotarla es lo único que la des-compromete.
Borrar el archivo no borra la historia de git.

**Riesgo abierto (07-nov-2026):** la URL de `origin` tenía el token de GitHub
embebido (`https://usuario:ghp_…@github.com/…`). No está versionado —vive en
`.git/config`— pero es una credencial en texto plano en el disco.

```powershell
# 1) rotar el token en GitHub → Settings → Developer settings → Tokens
# 2) sacarlo de la URL y usar el credential manager (o SSH)
git remote set-url origin https://github.com/<usuario>/<repo>.git
```

---

## 7 · Datos sensibles

`_EVIDENCIA_SRI/` tiene capturas con RUC, nombres y correos de contribuyentes
reales, y exports de Burp con cookies vivas. Está protegida por reglas de ruta
exactas en `.gitignore`.

- No se mueve, no se renombra, no se comparte.
- Si algún día hay que moverla: **primero** se actualizan las reglas, después
  la carpeta.
- Las copias de trabajo en `<extensión>/recorridos/` tienen la misma
  información: están ignoradas por git (`extenciones web/*/recorridos/`) y no
  se empaquetan.
- `git add -A` desde la raíz puede sumar cosas que no querés: mirá
  `git status` antes de commitear.

---

## 8 · Onboarding en 10 minutos

1. Leer `README.md` (mapa) y `docs/ESTADO_ACTUAL_2026-11.md` (qué está abierto).
2. Leer `01_Nueva_Luz_3.0/HANDOFF.md` §2: **los frenos de seguridad del motor**
   (nunca paga, nunca presenta sustitutiva, nunca cambia claves, `null` ≠ 0).
3. Correr `tools\verificar.ps1`. Si está en verde, el repo está sano.
4. Abrir el portal con la extensión y hacer un cliente en modo 👣.
5. Recién ahí tocar código.

---

## 9 · Mapa rápido de archivos

```
01_Nueva_Luz_3.0/
├── src/01…07  motor y superficies (orden de concatenación en vite.config.mjs)
├── src/08_experiencia.js   modos, cronómetro, resumen (no toca el motor)
├── tests/     24 bancos + run.mjs (909 comprobaciones)
├── popup.* / options.*    lote de clientes y claves
└── HANDOFF.md            diseño y reglas del motor

02/03/04/     un content script cada uno, sin build
tools/
├── construir_suite.mjs   generador + validador de la suite
├── verificar.ps1         la puerta de calidad
├── prueba_suite.ps1      popup + riel (Edge)
├── prueba_experiencia.ps1 HUD, modos, cronómetro (Edge)
└── prueba_inyeccion.ps1  módulo 02 de punta a punta (Edge)
```
