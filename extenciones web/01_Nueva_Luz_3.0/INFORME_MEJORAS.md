# Informe de mejora — Nueva Luz 3.0

**Fecha:** 06-nov-2026
**Alcance:** extensión `extenciones web/01_Nueva_Luz_3.0` (código, seguridad, rendimiento, diseño/UX, pruebas y operación).
**Base medida:** commit `fe67069`, build `3.1.0+20261106.1745`, suite completa en verde.
**Método:** métricas tomadas del árbol actual (no impresiones): líneas, tamaño del bundle, `tsc`, conteo de patrones, permisos del manifest y corrida real de los 24 bancos. Donde hay una estimación, se dice.

> Este informe **no repite** lo ya resuelto en las Tandas 0, 1 y 2 (claves R2 fuera del código, `host_permissions` acotados, validación del bridge, logger con niveles, tests headless, `catch` explicados y piso de legibilidad). Parte de ese estado.

---

## 1. Resumen ejecutivo

La extensión funciona y tiene una red de seguridad poco común para un proyecto de este tamaño: **891 comprobaciones automáticas, 24 bancos, runner headless**. El problema ya no es «si anda», sino **cuánto cuesta cambiarla sin romperla** y **cuánto secreto vive en texto plano**.

Las siete acciones con mejor relación impacto/esfuerzo, en orden:

| # | Acción | Por qué | Esfuerzo |
| :-- | :--- | :--- | :--- |
| 1 | **Cerrar el frente de credenciales** (contraseñas SRI en storage, CSV de respaldo, Zifact, R2, token de GitHub) | Es el riesgo real: hoy un acceso al perfil de Chrome entrega todas las claves del SRI | M–L |
| 2 | **CI obligatoria** (GitHub Actions con `npm run check`) | Los 891 checks existen pero nada impide mergear en rojo | S |
| 3 | **Migrar la UI a clases y tokens** | 734 atributos `style=` contra 108 `class=`; cada cambio visual toca decenas de líneas | M |
| 4 | **Namespacing / modularización progresiva** | El bug de `scLog` (una función pisada por un objeto) ya costó una tarde; el diseño actual lo permite | L |
| 5 | **Tipado incremental** | 1.056 errores de `tsc` esconden los que importan | M–L |
| 6 | **Presupuesto de rendimiento y virtualización** | 13 `setInterval` + 54 `setTimeout` y listas de hasta 500 clientes sin virtualizar | M |
| 7 | **Accesibilidad y observabilidad** | Foco y `prefers-reduced-motion` ya están; faltan `aria-live`, contraste y exportar el diagnóstico | S–M |

**Regla de oro para todo lo anterior:** nada de reescritura big-bang. Cada tanda tiene que entrar con la suite en verde y poder revertirse sola.

---

## 2. Salud actual, medida

| Métrica | Valor actual | Lectura |
| :--- | ---: | :--- |
| Líneas en `src/` | **24.051** | 7 módulos concatenados; el más grande, 07 con 4.819 |
| Módulos | 7 (`01`…`07`) + `main.js` | Sin `import`/`export`: todo comparte el mismo ámbito global |
| Bundle `build/content.js` | **699 KB** minificado | Se inyecta en cada página del SRI |
| `bridge_content.js` | 33 KB | Content script aparte, sin logger propio |
| `background.js` | 22 KB | Service worker |
| Banco de pruebas | **891 checks / 24 bancos / ~57 s** | Excelente base; corre sin dependencias nuevas |
| CI | **no hay** | Los checks no bloquean nada |
| Errores `tsc` (`checkJs`) | **1.056** (946 `TS2339`) | `jsconfig` con `checkJs: true`; TypeScript no está instalado |
| `console.*` activos en `src/` | **1** (banner de arranque) | El resto pasó al logger en la Tanda 2 |
| `catch` vacíos en `src/` | **0** | Anotados en la Tanda 2 |
| `catch` vacíos fuera de `src/` | **13** (bridge 11, background 1, popup 1) | Pendiente de la misma pasada |
| Atributos `style=` | **734** | Contra 108 `class=` |
| Colores hexadecimales sueltos | **487** | Tokens `--sc-*` existen, pero se usan poco |
| `innerHTML =` | **94** | Revisar cuáles interpolan datos externos sin `escapeHtml` |
| `setInterval` / `setTimeout` | **13 / 54** | Sin presupuesto ni limpieza centralizada |
| `MutationObserver` | 1 | Bien: no hay observadores de más |
| `TODO`/`FIXME` en comentarios | **67** | Deuda visible, pero dispersa |
| Dependencias | `vite`, `esbuild`, `jspdf` | Muy pocas; bueno |
| Permisos | `storage`, `activeTab`, `cookies` | `cookies` es potente: justificarlo y documentarlo |
| Hosts permitidos | 15 | Incluye `http://localhost/*` y `http://127.0.0.1/*` en producción |
| `build/content.js` versionado | **sí** | El artefacto está en git; riesgo de editar el archivo equivocado |
| `.gitattributes` | **no** | CRLF/LF mezclados (ya generó warnings en git) |

---

## 3. Seguridad

### 3.1 Crítico — contraseñas del SRI en texto plano

Hoy las claves del SRI viven, sin cifrar, en el almacén local de Chrome y en varios arreglos que se copian entre sí:

- `sri_active_credentials`
- `sc_clients_history`
- `sc_clients_cache`
- `auto_batch_queue`
- `sc_loop.cola`
- `pending_sri_autofill`

Además, **Ajustes → «Exportar claves»** genera un CSV en texto plano (`claves_sri_respaldo_YYYY-MM-DD.csv`) con RUC y contraseña. Y `zifact_autologin.js` acepta usuario y contraseña **en el hash de la URL** y lee `billingPlan.password` / `facturadorConfig.password` de `sc_clients_cache`.

**Impacto:** cualquier persona o programa con acceso al perfil de Chrome —o al CSV descargado— obtiene las claves de todos los contribuyentes. El hash de la URL queda en el historial, en capturas y en logs.

**Propuesta por fases (no romper el login):**

1. **Inventario y duplicación cero.** Un solo módulo `ScVault` como dueño de las credenciales. El resto pide `ScVault.get(ruc)`; nadie más guarda `password`.
2. **Cifrado en reposo.** `AES-GCM` con `WebCrypto` y una clave derivada con `PBKDF2` (o `Argon2` vía WASM) de una frase que el usuario introduce al iniciar la sesión. En storage solo queda `{ iv, ciphertext, salt, iteraciones, versión }`.
3. **Desbloqueo por sesión.** La clave derivada vive en memoria (`chrome.storage.session` o variable del service worker), nunca en `local`. Al cerrar Chrome se pide de nuevo.
4. **Migración dual.** Leer texto plano si existe, cifrar al vuelo, borrar el original y escribir `v2`. Bandera `sc_vault_version` para poder volver atrás una vez.
5. **Cola sin secretos.** `sc_loop.cola` guarda `credentialId` (o solo RUC) y resuelve la clave en el momento de usarla. `pending_sri_autofill` usa un objeto efímero en memoria.
6. **CSV con fricción.** Por defecto, exportar **sin** contraseñas. Si se eligen incluir, pedir frase y cifrar el archivo; aviso explícito de que es material sensible.
7. **Zifact.** Sacar las credenciales del hash y de `sc_clients_cache`. Usar un token de un solo uso, caducidad corta y acción explícita del usuario.

**Criterio de aceptación:** `chrome.storage.local` no contiene ninguna cadena que parezca una contraseña; el login, el lote y la subida siguen pasando los 891 checks; existe una prueba que falla si aparece una clave en claro.

### 3.2 Alto — claves R2 viejas y token de GitHub

- Las claves R2 estuvieron publicadas en `shared_config.js` y siguen en el **historial de git**. Ya no están en el código, pero **hay que rotarlas en Cloudflare** y purgar el historial (`git filter-repo`) si se quiere cerrar el tema.
- El remoto de git tiene un **token de GitHub embebido en `.git/config`**. No se versiona, pero está en texto plano en la máquina. Rotarlo y pasar a SSH o al credential manager.

**Criterio de aceptación:** claves nuevas cargadas en Ajustes, claves viejas revocadas, historial limpio y un escáner de secretos (`gitleaks` o `trufflehog`) corriendo en CI.

### 3.3 Medio — `http://localhost/*` y `http://127.0.0.1/*` en producción

El manifest de producción le da permiso a la extensión sobre **cualquier servicio local**. En la máquina del contador eso incluye paneles de administración, APIs de otros programas y servidores de desarrollo.

**Propuesta:** separar `manifest.json` (producción, sin localhost) de `manifest.dev.json` (con localhost), y que `npm run build:dev` use el de desarrollo. El bridge ya acepta localhost para pruebas; que eso no viaje al usuario final.

### 3.4 Medio — superficie del bridge

`bridge_content.js` ya valida forma y topes (Tanda 0). Lo que queda:

- **No hay autenticación posible** entre página y content script; el modelo correcto es «todo lo que llega es hostil». Está bien encaminado, pero conviene **rate limiting** (p. ej. máximo N mensajes por segundo) y un **nonce por carga** para descartar mensajes viejos reproducidos.
- La lista de orígenes acepta `http://localhost:*`; en producción debería quedar cerrada.
- 11 `catch` vacíos siguen ahí: mismo tratamiento que en `src/` (comentario o `console.debug`).

### 3.5 Medio — `innerHTML` con datos externos

Hay **94 asignaciones a `innerHTML`**. Muchas usan `escapeHtml`; otras interpolan texto del portal o de la nube. No se afirma que haya un XSS explotable: se afirma que **hoy no se puede saber sin revisarlas una por una**.

**Propuesta:** inventario de las 94, marcar las que reciben datos externos, y para esas usar `textContent` o `escapeHtml` obligatorio. Agregar una prueba que recorra el bundle y falle si aparece `innerHTML` con una interpolación que no pase por el escapador (heurística, no perfecta).

### 3.6 Bajo — `new Function` para cargar jsPDF

`ensureJsPdfLoaded()` hace `new Function(code).call(window)` con un archivo **empaquetado** (`vendor/jspdf.umd.min.js`), no con contenido de red. El riesgo es bajo, pero es la única evaluación dinámica del proyecto. Alternativa: incluir jsPDF como chunk del build y cargarlo con `import()`; si se mantiene, verificar el hash del archivo antes de evaluarlo.

---

## 4. Arquitectura y mantenibilidad

### 4.1 El problema de fondo: 24.000 líneas en un solo ámbito global

Los 7 módulos se concatenan y comparten todas las declaraciones. Eso permitió avanzar rápido, pero tiene un costo concreto y ya documentado: **`window.scLog = log` pisó la función `scLog`** y colgó dos bancos. No fue un error de una persona: fue el diseño.

**Propuesta en dos velocidades:**

**Corto plazo (barato):**
- Envolver cada módulo en un IIFE que exporte solo lo necesario a `window.SC`:
  ```js
  // 02_servicios_y_memoria.js
  (function (SC) {
    // ...todo el módulo...
    SC.SriLoop = SriLoop;
    SC.SafeStorage = SafeStorage;
  })(window.SC = window.SC || {});
  ```
- Regla de lint `no-redeclare` y una prueba que detecte dos declaraciones top-level con el mismo nombre en el bundle.
- Prohibir nuevas variables globales implícitas (`no-implicit-globals`).

**Mediano plazo (ordenado):**
- Migrar a ESM real: `src/core/`, `src/sri/`, `src/ui/`, `src/bridge/`, con `import`/`export` y un único `entry.js`. Vite ya está; el `concatPlugin` se retira al final.
- Dependencias explícitas: `PDF`, `Storage`, `Loop`, `UI`, `SriNav`. Nada de funciones «que existen porque sí».

**Criterio de aceptación:** el bundle se genera desde ESM, no hay colisiones posibles y los tests siguen corriendo igual.

### 4.2 Tipado: 1.056 errores es una señal, no un objetivo

`jsconfig.json` tiene `checkJs: true`, pero TypeScript no está instalado y `tsc` reporta **1.056 errores**, casi todos `TS2339` («la propiedad no existe»). Eso significa que el editor no ayuda y que los errores reales quedan sepultados.

**Propuesta:**
1. Instalar `typescript` como `devDependency` y agregar `npm run typecheck`.
2. **No** arreglar los 1.056 de golpe. Congelar el número actual y exigir que **no suba** (baseline en CI).
3. Tipar primero las fronteras: `ScVault`, `SafeStorage`, `SriLoop`, `bridge`, `background`.
4. Migrar módulo por módulo a `// @ts-check` + JSDoc; el resto queda con `checkJs` apagado temporalmente.
5. Cuando el baseline baje de ~200, activar `strict` en los módulos migrados.

### 4.3 Deuda dispersa

67 comentarios `TODO`/`FIXME` sin dueño ni fecha. Propuesta: convertirlos en issues con etiqueta `deuda`, o al menos en un registro `DEUDA.md` con impacto y módulo. Un `TODO` sin dueño no se paga nunca.

### 4.4 Artefacto versionado y saltos de línea

- `build/content.js` está en git. Eso invita a editarlo a mano (prohibido por las reglas) y genera diffs de 700 KB. **Propuesta:** dejar de versionarlo y publicarlo como artefacto del build/Release; o, si se quiere conservar para instalación manual, generarlo solo en `release`.
- Falta `.gitattributes`. Agregar `* text=auto` y reglas para `.js`, `.json`, `.md` evita los warnings de CRLF/LF y los diffs falsos.

---

## 5. Pruebas y CI

### 5.1 Lo que ya está bien

- 24 bancos, 891 comprobaciones, runner headless sin dependencias nuevas.
- Cada banco carga el `build/content.js` real.
- `npm test` devuelve código 0/1.
- `npm run check` valida sintaxis y corre la suite.

### 5.2 Lo que falta

| Falta | Propuesta |
| :--- | :--- |
| CI | Workflow de GitHub Actions: `npm ci`, `npm run check`, `npm run typecheck` (baseline), `gitleaks`. En Windows y Linux. |
| Cobertura de `options.js` | Probar importación/exportación CSV, borrado de una sola clave y el interruptor de diagnóstico. |
| Cobertura de `background.js` | `credencialesR2`, `porQueFalloElFetch`, `WorkerCaido`, `verificarR2`. |
| Cobertura de `bridge_content.js` | Mensajes válidos, inválidos, gigantes, RUC mal formado, rate limit. |
| Cobertura de `zifact_autologin.js` | Parseo del hash, caducidad, limpieza de la orden, claves ausentes. |
| Migraciones de storage | Probar `v1 → v2` del vault y de la cola. |
| Lint | ESLint con `no-empty`, `no-redeclare`, `no-implicit-globals`, `no-eval` (con excepción documentada), `no-console` (salvo el banner). |
| Accesibilidad automatizada | Axe sobre `options.html`, `popup.html` y los bancos con UI. |

**Regla propuesta:** un PR no entra si baja el número de checks, sube el baseline de `tsc` o agrega un `console.log` fuera del logger.

---

## 6. Rendimiento

### 6.1 Lo medido

- 13 `setInterval` y 54 `setTimeout`. El HUD late cada segundo (`startHeartbeat`), hay intervalos en 03 y 07, y `bridge_content.js` tiene el suyo.
- Lista de clientes de hasta **500** en lote y **2.000** en matriz, renderizada sin virtualización.
- Bundle de 699 KB que se parsea en cada página del SRI (una vez por carga).
- 90 `addEventListener` en `src/`; sin un registro central de limpieza.

### 6.2 Propuesta

1. **Presupuesto explícito:** ningún `setInterval` nuevo por debajo de 250 ms; todo intervalo debe tener `clearInterval` en un `destroy()` y una prueba que lo verifique.
2. **Heartbeat dirigido por eventos:** el estado del bucle ya se escribe en storage; usar `chrome.storage.onChanged` en vez de consultar cada segundo. Dejar el latido visual solo cuando el panel está visible (`document.visibilityState`).
3. **Virtualizar** la lista de clientes (ventana de 50–80 filas). Es la mejora más visible en lotes grandes.
4. **Medir antes de optimizar:** una corrida de `Performance` con CDP sobre `lote.html` y `iva5.html`, y un presupuesto de *long tasks* (< 50 ms) para las acciones de UI.
5. **Debounce de escrituras:** agrupar `SafeStorage.set` en ventanas de 100–250 ms cuando se actualiza progreso; hoy puede escribir por cliente.
6. **Carga diferida real:** jsPDF ya es lazy (bien). Evaluar separar el panel/HUD del núcleo de navegación para que el SRI no pague la UI si no se usa.

---

## 7. Diseño y UX

### 7.1 Lo que ya se corrigió

- Piso de legibilidad: 9/9.5 px → 11 px; 10/10.5 px → 11.5 px, solo dentro de la extensión.
- Foco visible con teclado, `prefers-reduced-motion` y antialiasing.
- Tokens `--sc-*` y clases base (`sc-panel`, `sc-btn`, `sc-rotulo`) en `instalarEstilosSC()`.

### 7.2 El problema que queda

**734 atributos `style=` contra 108 `class=`.** La capa de tokens existe, pero la mayoría de los componentes no la usa. Cambiar un color, un radio o un tamaño sigue siendo una búsqueda de texto por 7 archivos.

**Propuesta por etapas:**

1. **Inventario visual** de las 6 superficies: isla, minibar, HUD del lote, panel de clientes, saludo/anticipación y modales. Una captura de cada una, en claro y oscuro.
2. **Vocabulario mínimo:** `sc-card`, `sc-row`, `sc-chip`, `sc-badge`, `sc-field`, `sc-modal`, `sc-empty`, `sc-progress`. Cada uno con sus variantes (`--ok`, `--aviso`, `--error`, `--tenue`).
3. **Migrar de a un componente por PR**, empezando por los más repetidos (filas de cliente, botones del HUD, tarjetas del panel). Los 734 bajan solos.
4. **Prohibir `style=` nuevo** en CI (regla de lint o grep con lista blanca para valores dinámicos como `left/top/width`).
5. **Contraste:** auditar los pares texto/fondo con una herramienta (Axe o similar) y llevar todo a ≥ 4.5:1. El texto `--sc-tenue` sobre fondo oscuro suele quedar justo.
6. **Accesibilidad de flujo:** `aria-live="polite"` en estado del lote y progreso; `role="status"` en avisos; foco atrapado y `Escape` en modales; objetivos táctiles de al menos 40×40 px en el HUD; alternativa de teclado al arrastre (`slh-drag`).
7. **Una sola superficie:** la isla, la minibar y el panel compiten por el mismo espacio. Definir jerarquía (una principal + una secundaria) y evitar que dos muestren el mismo estado.

### 7.3 Consistencia de contenido

Los textos mezclan «tú» y «vos», mayúsculas de grito y tecnicismos (`host_permissions`, `hash`, `worker`) en mensajes de usuario. Propuesta: glosario corto y revisión de los ~40 mensajes visibles. Los errores deberían decir **qué pasó, qué se puede hacer y qué no se perdió**.

---

## 8. Operación y observabilidad

- **Exportar diagnóstico con un botón.** Ya existe `scLogBuffer()`; falta un botón en Ajustes que descargue un JSON con build, permisos, versiones, últimos 300 logs y estado del lote (sin secretos).
- **Errores de lote con contexto.** Cuando un cliente falla, guardar `{ ruc, fase, selector, mensaje, captura de pantalla }` en `sc_bitacora`, no solo el texto.
- **Telemetría opcional y explícita.** Si algún día se envía algo, que sea opt-in, agregado y sin RUC ni contraseñas.
- **Runbook de incidentes:** qué hacer si el SRI cambia un selector, si el Worker está caído, si una clave quedó vencida y si el lote se detuvo solo. `STATE.md`/`HANDOFF.md` ya tienen la materia prima; falta el «si pasa X, hacé Y» en una página.

---

## 9. Roadmap propuesto

| Tanda | Contenido | Impacto | Esfuerzo | Riesgo | Criterio de aceptación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **3** | CI + ESLint + `gitleaks` + `manifest.dev.json` sin localhost + `.gitattributes` | Alto | S (1–2 d) | Bajo | PR en rojo bloquea; no hay secretos nuevos; build de producción sin localhost |
| **4** | `ScVault` cifrado + migración dual + cola sin secretos + CSV con fricción + Zifact sin hash | **Muy alto** | M–L (3–5 d) | **Alto** (toca login y lote) | Storage sin contraseñas en claro; 891 checks verdes; rollback probado |
| **5** | Sistema de diseño: 8 componentes, migración de los más usados, contraste y `aria-live` | Alto | M (1–2 sem) | Medio | `style=` baja > 50 %; Axe sin errores críticos |
| **6** | ESM + namespacing + tipado incremental con baseline | Alto | L (2–3 sem) | Medio | Sin colisiones globales; `tsc` no sube; bundle estable |
| **7** | Virtualización de listas + heartbeat por eventos + presupuesto de timers + trazas CDP | Medio | M (1 sem) | Bajo | Lista de 500 fluida; sin intervalos < 250 ms; long tasks < 50 ms |
| **8** | Diagnóstico exportable + bitácora con contexto + runbook | Medio | S (2–3 d) | Bajo | Un fallo se puede diagnosticar sin abrir DevTools |

**Orden recomendado:** 3 → 4 → 5 → 6 → 7 → 8. La 3 es barata y protege todo lo demás. La 4 es la que más riesgo de negocio reduce. La 5 y la 6 se pueden solapar si hay dos frentes.

---

## 10. Lo que **no** haría

- **Reescribir la extensión desde cero.** 24.000 líneas con reglas de negocio del SRI y 891 checks no se reemplazan sin perder meses de aprendizaje.
- **Cifrar las credenciales sin migración dual.** Un despliegue a medias deja a los clientes sin poder entrar.
- **Arreglar los 1.056 errores de `tsc` de una sentada.** Se congela el baseline y se baja por fronteras.
- **Borrar `build/content.js` de git sin pipeline de release.** Primero el artefacto automático, después el borrado.
- **Seguir agregando `style=` inline.** La capa de tokens ya existe; el problema es de disciplina, no de herramienta.

---

## 11. Anexo: comandos y referencias

```bash
cd "extenciones web/01_Nueva_Luz_3.0"

npm run build        # producción, minificado
npm run build:dev    # sin minificar, stack legible
npm run check        # sintaxis de los 7 módulos + 891 checks
npm test             # solo la suite, headless (~57 s)
npm test -- --headed # con navegador visible
DEBUG_RUNNER=1 npm test

# tipado (cuando se instale typescript)
npx -p typescript tsc --noEmit -p jsconfig.json
```

Archivos clave:

- `src/01_utilidades_y_pdf.js` — logger, tokens, jsPDF, R2, helpers.
- `src/02_servicios_y_memoria.js` — `SafeStorage`, `SriLoop`, auditoría.
- `src/03_ingreso_y_sesion.js` — login SRI, isla/minibar.
- `src/04_extraccion_datos.js` — extracción de comprobantes.
- `src/05_llenado_formulario.js` — casilleros IVA, compras.
- `src/06_panel_interfaz.js` — panel, HUD, modales.
- `src/07_navegacion_sri.js` — navegación, lote, cajas de diálogo.
- `bridge_content.js` — puente web ↔ extensión.
- `background.js` — service worker, R2, cookies.
- `tests/run.mjs` — runner headless.
- `options.js` / `popup.js` — superficies de configuración y control.

---

### Nota final

La extensión está en un punto mejor que hace una semana: ya tiene tests automáticos, logger con niveles, permisos acotados y una UI más legible. El siguiente salto no es «más funciones»: es **bajar el costo de cambiar** y **sacar los secretos del almacén en claro**. Las Tandas 3 y 4 son las que más devuelven por día invertido.
