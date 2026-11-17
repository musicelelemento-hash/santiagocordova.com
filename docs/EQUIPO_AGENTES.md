# Equipo de agentes — SantiagoCordova.com / Soluciones Contables Pro

> **Qué es este documento.** El contrato de convivencia para varios agentes de IA
> trabajando a la vez sobre este workspace: quién escribe qué, cómo se reparten
> las tareas, cómo se verifica que algo está bien y dónde está la raya de
> seguridad. Es un documento vivo: si una regla molesta o falta, se propone el
> cambio (formato de propuesta en `.agents/AGENTS.md` §0a) en vez de romperla.
>
> **Cómo convive con los otros documentos** (no se contradicen, se reparten):
>
> | Documento | Qué guarda |
> | :--- | :--- |
> | `.agents/AGENTS.md` | la memoria permanente del proyecto: arquitectura, matriz de selectores, lecciones |
> | `STATE.md` | el parte del día: quién está en qué |
> | `docs/EQUIPO_AGENTES.md` (éste) | el reparto entre agentes: roles, gates, seguridad y flujo de una tarea |

---

## 1. El modelo «3 + 1»

Tres agentes de trabajo, cada uno con un dueño de área, más un Lead que integra,
verifica y publica. El Lead **no compite por archivos**: su trabajo es revisar y
publicar, no escribir producto.

| Rol | Área | Escribe en | Gate que corre | No toca |
| :--- | :--- | :--- | :--- | :--- |
| **Extensión** | `extenciones web/01_Nueva_Luz_3.0/src/*.js`, `bridge_content.js`, `popup.js`, `options.js`, `background.js`, `tests/*.html` | Sólo el código de la extensión y sus bancos | `verificar.ps1 -SaltarBanco` + 914 bancos + `node --check` | `santiagocordova-main/`, manifiestos, workflow, versión |
| **Web** | `santiagocordova-main/**` (React + Vite + TS) | Pantallas, componentes, servicios, tipos | `tsc --noEmit` + `vite build` | extensiones, manifiestos, CI, versión |
| **QA / Release** | `extenciones web/tools/**`, `docs/**`, empaquetado, CI | Herramientas de verificación, empaquetado, documentación y el vigía de CI | empaquetar + CI verde (ver §5 y §10) | código de producto (extensión o web) salvo su propio scope |
| **Lead** | integración y publicación | commit y push, `STATE.md`, decisiones de coordinación | revisa diff + corre los gates de todos | no escribe producto: si hace falta un cambio, crea tarea |

Reglas del modelo:

- **Máximo 3 agentes de trabajo vivos a la vez** (más el Lead). Si hay más
  trabajo, se encola: una cuarta tarea espera a que se libere un rol. Cinco
  agentes tocando cuatro repos a la vez no van más rápido: se pisan.
- **Un área, un dueño.** Dos agentes no escriben el mismo archivo ni aunque
  «sea un cambio chiquito». Si te falta un archivo de otra área, no lo edites:
  creá una tarea para el dueño o pedíselo al Lead.
- **El Lead publica.** Los agentes **no hacen commit ni push**. El commit lo
  arma el Lead con el diff revisado, un commit por tema, y desde ahí corre el CI.

---

## 2. Un dueño por archivo y write scopes

Cada tarea se crea declarando **write scopes**: la lista de prefijos de archivo
que va a modificar, en relación a la raíz del workspace. Ejemplos:

```text
extenciones web/01_Nueva_Luz_3.0/tests
extenciones web/tools/ci_estado.mjs
santiagocordova-main/screens/SettingsScreen.tsx
docs/EQUIPO_AGENTES.md
```

Reglas de los write scopes:

1. **Se declaran al crear la tarea** y no se cambian a mitad de camino sin
   avisar al Lead (si cambian, se edita la tarea con su revisión actual).
2. **No pueden solaparse entre tareas listas al mismo tiempo.** El solape es
   *advisory*, no un lock: si dos scopes se tocan, alguien tiene que parar antes
   de escribir, no «ver quién gana».
3. **El scope no es una sugerencia: es el límite.** Antes de escribir, mirá
   `git status`. Si el archivo que ibas a tocar ya tiene cambios que no son
   tuyos, hay otro agente trabajando: **parar y avisar**.
4. **Scopes que nunca son de un agente de trabajo** (son del Lead): el commit,
   el push, `.github/workflows/**`, los `manifest.json` (salvo QA/Release en su
   rol de versión, §7) y `STATE.md`.

### El disco no es tuyo mientras lo leés

Todos los agentes comparten el mismo sistema de archivos. Entre que leés un
archivo y lo escribís, otro pudo haberlo cambiado. Por eso:

- Para modificar, **buscá el fragmento exacto**, comprobá que aparece **una sola
  vez** y reemplazá ése. Nada de reescribir un archivo entero con lo leído hace
  rato.
- Si el conteo no da exactamente 1, **parar y mirar**: significa que el archivo
  no es el que creías.
- `npm run build` (extensión) es **de a uno por vez**. Si hay un build de otro
  agente en curso, esperá: dos builds simultáneos dejan un bundle que no
  corresponde a ningún código y el fallo es imposible de reproducir.

---

## 3. El tablero de tareas

El tablero compartido es la única fuente de verdad de quién hace qué. Una tarea
tiene estos campos:

| Campo | Para qué sirve |
| :--- | :--- |
| `subject` | título corto, en español, acción + objeto |
| `description` | qué hay que hacer, **criterio de aceptación** y **gate** con el que se verifica |
| `writeScopes` | prefijos de archivo que puede tocar (sólo los suyos) |
| `blockedBy` | ids de tareas que deben terminar antes (dependencias) |
| `owner` | el rol/agente que la reclamó |
| `revision` | número que sube con cada cambio de la tarea (control de concurrencia) |
| `status` | `pending` → `in_progress` → `completed` |

### Flujo obligatorio de una tarea

```text
Lead/usuario ──► crear tarea (subject + descripción + writeScopes + gate)
                    │
agente  ──► listar ─► obtener ─► RECLAMAR con la revisión actual
                    │                 │
                    │                 ├── trabajar (sólo sus archivos)
                    │                 ├── verificar con el gate de su rol
                    │                 ├── juntar evidencia (salida real)
                    │                 └── COMPLETAR con la revisión actual
                    ▼
                 Lead: revisa el diff ─► corre/confirma los gates
                       ─► publica (commit + push) ─► CI
                       ─► si el CI falla de verdad: reabre la tarea
```

Paso a paso, con las herramientas del tablero:

1. **Listar** (`team_task_list`) y elegir una tarea `pending` y `ready`.
2. **Obtenerla** (`team_task_get`) para leer la revisión y los scopes al día.
3. **Reclamarla** (`team_task_update` con `action: claim` y la `expected_revision`
   exacta que trajiste). Reclamar con una revisión vieja falla: si eso pasa, no
   insistas con el mismo número — volvé a obtener la tarea, mirá qué cambió y
   decidí si sigue siendo tuya.
4. **Trabajar** escribiendo sólo dentro de los scopes. Revisá `git status` antes
   y después.
5. **Verificar** con el gate de tu rol (§5) y guardar la salida real. La
   verificación no es «me parece que anda»: es un comando con código de salida y
   evidencia.
6. **Completar** (`action: complete` con la revisión actual).
7. **Reportar al Lead** con el formato de §11:
   `send_message` target `lead`, resumen corto + evidencia.

Reglas de convivencia del tablero:

- **Reclamar no es empezar a escribir.** Primero se reclama, después se toca el
  disco. Una tarea sin dueño puede ser de cualquiera; una reclamada, no.
- **`blocked_by` se respeta.** Si tu tarea depende de otra, esperá a que esté
  `completed`. Si la bloqueada no avanza, avisá al Lead en vez de hacer el
  trabajo de otro.
- **Tareas de ≤ 40 minutos.** Si estimás más, se parte en dos tareas (una por
  tema) o se devuelve un avance parcial con lo hecho y lo que falta. Una tarea
  eterna oculta que el alcance estaba mal definido.
- **No se borran tareas ajenas** y no se completa una tarea que no reclamaste.

---

## 4. Límites operativos

| Límite | Regla |
| :--- | :--- |
| **Agentes vivos** | Máximo **3 agentes de trabajo** (+ el Lead). Al terminar, el rol se libera para la próxima tarea. |
| **Duración de tarea** | **≤ 40 minutos** de trabajo efectivo. Si se pasa, se parte en subtareas o se reporta avance parcial. Las esperas largas de CI (§10) no cuentan como trabajo, pero se avisan. |
| **Contexto** | **Contexto fresco por tarea.** Cada agente arranca con el contexto justo: la tarea, su gate y los archivos de su scope. No se arrastra el contexto de otra tarea ni se depende de «lo que hablamos la vez pasada»: la memoria permanente es el repo (`.agents/AGENTS.md`, `STATE.md`, `docs/`). |
| **Herramientas** | Las de la sesión: leer/escribir/editar archivos, `pwsh`, tablero compartido y mensajes. Sin dependencias externas nuevas si el gate no las pide. |
| **Commits** | Cero. El commit y el push son del Lead. |

---

## 5. Reparto de gates (quién verifica qué)

Nadie completa una tarea sin pasar **su** gate. Los gates no son «lo que el
agente prefiera»: están asignados por rol y se corren tal cual.

| Rol | Gate obligatorio | Comando (desde la ruta indicada) |
| :--- | :--- | :--- |
| **Extensión** | sintaxis + build + suite completa de bancos | `powershell -ExecutionPolicy Bypass -File tools\verificar.ps1 -SaltarBanco` (desde `extenciones web/`) + `node tests/run.mjs` en `01_Nueva_Luz_3.0` (914 comprobaciones) + `node --check` sobre cada módulo tocado |
| **Web** | tipos + build de producción | `node node_modules/typescript/bin/tsc --noEmit` y `node node_modules/vite/bin/vite.js build` (desde `santiagocordova-main/`) |
| **QA / Release** | empaquetado + **CI verde** | `node "extenciones web/tools/empaquetar_tienda.mjs" --check` (y el empaquetado real) + `node "extenciones web/tools/ci_estado.mjs" --sha <sha> --esperar --reintentar-infra` con código de salida 0 |
| **Lead** | revisión + todos los anteriores | `git diff` revisado + gates de los roles que tocó el diff; no publica con gate rojo |

Notas de cada gate:

- **Extensión.** `verificar.ps1 -SaltarBanco` corre sintaxis, build y la suite
  **sin** los bancos de navegador; los bancos van aparte con
  `cd "extenciones web/01_Nueva_Luz_3.0"` y
  `node tests/run.mjs` con `TEST_TIMEOUT=600000` y
  `CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`.
  El resultado bueno es un `✅ N comprobaciones, todas bien` con **N ≥ 914**
  (el piso sólo sube: los bancos se agregan, nunca se borran). El job de CI se
  llama «909 bancos» por historia; ese nombre no se toca.
- **Web.** El `tsc --noEmit` es la fuente de verdad de los tipos; el build de
  Vite tiene que terminar sin errores. No hace falta que el build quede
  publicado: se verifica en local y el Lead publica.
- **QA / Release.** El empaquetado lee la versión de cada `manifest.json` (no la
  escribe al empaquetar). El CI se consulta con el vigía (§10), nunca «a ojo».
- **Lead.** Revisa el diff completo antes de publicar. Un gate verde no reemplaza
  la revisión: el CI no sabe si el cambio hace lo que pedía la tarea.

> **Regla de oro del gate:** si el gate falla, la tarea no está completa. Se
> arregla o se reporta bloqueada con la salida real; no se completa «para que el
> Lead lo vea».

---

## 6. «Log dorado → banco de prueba»

La regla que hace que el proyecto no rompa dos veces lo mismo:

> **Todo fallo que llegó a producción con un log real se convierte en un banco de
> prueba HTML.** El log es la evidencia; el banco es el candado.

### Qué es un «log dorado»

El mensaje exacto, en la consola del usuario o en el CI, con su stack y (si
aplica) el DOM de la pantalla donde falló. No es la interpretación del fallo: es
el fallo. Se copia textual en la descripción de la tarea, entre comillas o en un
bloque de código.

### Del log al banco, paso a paso

1. **Congelar la evidencia.** Copiar el log completo (mensaje, archivo, línea,
   stack) y, si el fallo es de DOM, el fragmento de HTML/PrimeFaces involucrado.
2. **Armar el banco** en `extenciones web/01_Nueva_Luz_3.0/tests/<nombre>.html`:
   el DOM de prueba (recortado a lo que importa), el bundle real
   (`build/content.js` o el que corresponda) y comprobaciones numeradas.
3. **Rojo antes del arreglo, verde después.** Si el banco pasa también sin el
   arreglo, no está probando lo que se corrigió: hay que ajustarlo.
4. **Nunca borrar comprobaciones.** Los bancos se agregan y se endurecen. Si una
   comprobación vieja molesta, se investiga antes de tocarla: cuida un fallo que
   llegó a pantalla y costó un lote.
5. **Reportar el número antes y después** (ej.: «909 → 914 comprobaciones,
   todas verdes») y el nombre de los bancos nuevos.

### Lo que no se puede probar con un banco

Hay caminos que exigen el portal real (login, navegación entre pantallas, envío,
captura de PDF). En esos casos:

- El banco prueba **la lógica** (funciones puras, estados, contratos de datos),
  no la navegación.
- La limitación se dice explícitamente en el reporte: «el banco no puede probar
  X; falta corrida real». **Nunca** se declara verificado lo que no se probó.
- La corrida real contra el SRI la hace el usuario (§9). Un agente no abre
  `srienlinea.sri.gob.ec` ni usa credenciales.

### El caso especial del CI

Un fallo de CI por infraestructura (Chrome/DevTools, runner, red) **no es un log
dorado de producto**: no se convierte en banco, se trata con el vigía de CI
(§10). Un fallo de bancos de verdad sí: se arregla el banco o el código que el
banco está probando.

---

## 7. Un solo escritor de versión (manifest)

La versión de cada extensión vive en su `manifest.json`
(`01_Nueva_Luz_3.0`, `02_Cambio_Claves_SRI`, `03_Anexo_Gastos_Personales`,
`04_Anulador_Comprobantes_SRI`, `suite`). Que la toque un solo rol es lo que
evita el clásico «cada uno subió la versión y quedó cualquier cosa».

- **Único escritor: QA / Release.** Sólo ese rol cambia el campo `version` de un
  `manifest.json`, y sólo en una tarea cuyo alcance lo diga y con aprobación del
  Lead (es una decisión de release, no técnica).
- **Los demás roles no tocan `manifest.json`.** Si un cambio necesita versión
  nueva, lo reportan y el Lead decide; QA/Release la escribe una vez.
- **Se sube de versión una vez por release**, no una vez por commit. Un release
  = versión nueva + empaquetado + CI verde + publicación del Lead.
- **Lo que QA/Release NO hace:** no edita `.github/workflows/**` (es del Lead),
  no cambia el nombre del job de CI y no toca la versión de otra extensión sin
  que la tarea lo pida.

---

## 8. Frontera de seguridad (la raya que no se cruza)

Este workspace tiene credenciales reales de clientes y del SRI. Los agentes
trabajan **sobre el código**, nunca sobre esas credenciales.

### Prohibido, sin excepciones

| Objeto | Regla |
| :--- | :--- |
| `Contraseñas de Chrome.csv` | **Nunca leerlo, imprimirlo, citarlo, commitearlo ni subirlo.** Ni un fragmento, ni «para probar». El usuario debería moverlo a un gestor y borrarlo del disco. |
| `import_passwords.js` | Se trata con la misma cautela que el CSV: es parte del mismo material sensible. |
| Certificados `.p12` (firma electrónica) | No abrir, no copiar, no usar para firmar nada. |
| `*.env*`, `.env.local`, claves de Supabase/R2 | Nunca imprimir valores. Los scripts existentes ya enmascaran; no los desenmascares para «depurar». |
| Token de GitHub del remoto `origin` | Nunca imprimirlo, ni siquiera la URL del remoto completa. Las herramientas lo enmascaran (`***`); si una salida lo muestra, se considera un bug del script, no algo aceptable. |
| Claves del SRI / sesiones reales | Un agente no inicia sesión, no llena declaraciones y no responde encuestas del portal. |

### La corrida real la hace el usuario

- Los agentes **sólo simulan**: bancos HTML locales con el DOM copiado, datos
  falsos (RUCs de prueba, nombres inventados) y el bundle real.
- **La corrida contra el portal del SRI es del usuario.** El agente deja el
  cambio probado en lo que puede probar, y dice qué falta de la corrida real
  (§6). No pide credenciales, no las busca en el disco y no las usa.
- Nada de datos de clientes reales en bancos, logs de tarea, reportes ni
  commits: RUCs y nombres de prueba.

### El reporte también es superficie de fuga

Al reportar al Lead, **no** se pegan tokens, claves, contraseñas ni contenido de
archivos sensibles. Se pega la salida del comando con su evidencia (exit code,
conteos, rutas) — no los valores secretos que pueda contener el entorno.

---

## 9. El flujo completo de una tarea (resumen operativo)

1. **Se crea la tarea.** Subject en español, descripción con qué hacer, criterio
   de aceptación, gate y (si hay) el «log dorado». Write scopes explícitos.
   Las dependencias van en `blocked_by`.
2. **Se reclama.** Un agente lista, obtiene y reclama con la revisión actual.
   Si la revisión cambió, vuelve a leer.
3. **Se trabaja** sólo en los scopes declarados, por fragmentos, con
   `git status` de testigo antes y después.
4. **Se verifica** con el gate del rol (§5) y se guarda la evidencia real.
5. **Se completa** con la revisión actual del tablero.
6. **Se reporta** al Lead: resumen corto + rutas + salida + exit codes (§11).
7. **El Lead publica.** Revisa el diff, confirma los gates, hace el commit (un
   tema por commit) y el push. El push dispara el CI de extensiones.
8. **QA/Release vigila el CI** con `ci_estado.mjs` (§10). Si queda verde, se
   cierra el release. Si falla de verdad, la tarea se reabre para el dueño.
9. **Se actualiza la memoria** cuando algo se aprende para siempre:
   `.agents/AGENTS.md` (regla permanente) o `STATE.md` (parte del día). Eso lo
   decide el Lead; los agentes lo reportan.

---

## 10. Vigía de CI: `extenciones web/tools/ci_estado.mjs`

El workflow `.github/workflows/extensiones.yml` (job «Sintaxis · build · 909
bancos · suite») corre en cada push a la rama de extensiones y puede fallar por
**infraestructura del runner**, no por código. El caso conocido: el paso de
bancos muere con

```text
❌ Error: Chrome no abrió el puerto de DevTools
    at main (.../tests/run.mjs:189:25)
```

y al re-ejecutar el run pasa. El vigía automatiza exactamente eso.

### Uso

```powershell
# Estado del commit HEAD (sólo lectura)
node "extenciones web/tools/ci_estado.mjs"

# Un commit concreto (corto o completo)
node "extenciones web/tools/ci_estado.mjs" --sha 1d2b2e1

# Esperar a que termine
node "extenciones web/tools/ci_estado.mjs" --sha 1d2b2e1 --esperar

# Esperar y reintentar automáticamente SÓLO si el fallo es de infraestructura
node "extenciones web/tools/ci_estado.mjs" --sha 1d2b2e1 --esperar --reintentar-infra

# Ver por qué falló el primer intento de un run que ya se re-ejecutó
node "extenciones web/tools/ci_estado.mjs" --sha 227c60d --intento 1
```

Qué imprime: run id, estado, conclusión, intento, URL, historial de intentos y
—si falló— los pasos fallidos con las líneas `✗` de bancos o la evidencia de
infraestructura (mensaje de Chrome/DevTools, runner, red). El token sale del
remoto `origin` y **nunca** se imprime.

### Códigos de salida y qué hacer con cada uno

| Código | Significado | Qué hace el agente |
| :---: | :--- | :--- |
| **0** | run en verde | gate de QA cumplido: se puede cerrar |
| **1** | fallo real: bancos, build, sintaxis, suite o manifiestos | **NO reintentar.** Reabrir la tarea del dueño con la salida del log |
| **2** | infraestructura (sin `--reintentar-infra` o tras los reintentos), run cancelado, o no se pudo consultar | reintentar con `--reintentar-infra`; si sigue rojo tras los reintentos, avisar al Lead |

### Política de reintento

- **Sólo se reintenta infraestructura.** Un fallo de bancos reintentado «por si
  pasa» esconde un bug: la suite quedó verde una vez por suerte, no por arreglo.
- **Máximo 2 reintentos** (`--intentos`, default 2) con espera de hasta 20 min
  cada intento (`--limite-min`, default 20). Si después de eso sigue igual, es
  un problema de la infraestructura de GitHub (o de una causa no detectada) y se
  reporta; no se insiste en bucle.
- **Un run cancelado no se reintenta:** normalmente lo canceló un push más
  nuevo. Se busca el run del commit más nuevo.
- **La decisión queda en el reporte:** «infra, reintentado, verde en intento 2»
  o «fallo real en bancos, líneas ✗ …». Sin esa frase, el CI no está verificado.

---

## 11. Qué reportar al Lead

Formato corto y con evidencia. Sin secretos, sin capturas de datos de clientes:

```text
Tarea: task-N — <asunto>
Estado: completa | bloqueada | avance parcial
Archivos: <rutas del scope, sólo las tocadas>
Evidencia: <comando exacto> → exit N; <salida resumida: conteos, líneas clave>
Gate: <gate del rol> → verde
Notas: <riesgos, lo que falta de corrida real, dependencias>
```

Reglas del reporte:

- **La salida real, no el resumen.** Si el gate imprime «✅ 914 comprobaciones,
  todas bien», se cita así; si el CI da run id/URL, se cita.
- **Exit codes explícitos.** Un «pasó» sin código de salida no es evidencia.
- **Los bloqueos, temprano.** Si algo no se puede hacer (falta permiso, falta
  corrida real, dependencia sin terminar), se dice en el momento, no al final.
- **No se pega el remoto con token ni ninguna credencial.**

El Lead con esto decide: publicar, pedir ajuste o reabrir. **Un agente no
publica.**

---

## 12. Publicación (sólo el Lead)

1. Revisa el diff de los archivos de la tarea (`git diff`, `git status`).
2. Corre o confirma los gates de los roles involucrados.
3. Hace **un commit por tema** (nada de commits que mezclen extensión + web +
   documentación), con mensaje en español que diga qué se arregló.
4. Hace push a la rama de extensiones.
5. Lanza el vigía de CI (`--esperar --reintentar-infra`) y reporta el resultado.
6. Si el CI falla de verdad: reabre la tarea con la evidencia y no publica más
   cambios encima.
7. Si estaba todo verde: actualiza `STATE.md` con lo del día.

Lo que **nunca** se publica: cambios fuera de los scopes de las tareas
reclamadas, credenciales, `Contraseñas de Chrome.csv`, `*.p12`, `.env*`, o un
gate en rojo «para que se vea».

---

## 13. Checklist de «listo» (para cualquier rol)

- [ ] La tarea está reclamada con la revisión actual y sigue siendo mía.
- [ ] Sólo toqué archivos de mi scope; `git status` lo confirma.
- [ ] El gate de mi rol pasó, con la salida guardada.
- [ ] Si hubo un fallo en producción: quedó como banco de prueba (§6) y el
      número de comprobaciones no bajó.
- [ ] Si el cambio es de CI: el vigía dio **0** (o **2** por infra con el
      reintento documentado).
- [ ] No hay credenciales, tokens ni datos de clientes reales en el diff, el
      reporte ni los logs.
- [ ] Completé la tarea en el tablero y reporté al Lead con evidencia.
- [ ] No hice commit ni push.

---

## 14. Atajos rápidos (Windows, desde la raíz del workspace)

```powershell
# Node del entorno
$node = 'C:\Users\Usuario\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'

# Gate Extensión (rápido: sintaxis + build + suite, sin bancos)
powershell -ExecutionPolicy Bypass -File "extenciones web\tools\verificar.ps1" -SaltarBanco

# Gate Extensión (bancos completos, 914+)
$env:TEST_TIMEOUT = '600000'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
Set-Location "extenciones web\01_Nueva_Luz_3.0"
& $node tests/run.mjs

# Gate Web
Set-Location ..\..\santiagocordova-main
& $node node_modules/typescript/bin/tsc --noEmit
& $node node_modules/vite/bin/vite.js build

# Gate QA / Release
& $node "..\extenciones web\tools\empaquetar_tienda.mjs" --check
& $node "..\extenciones web\tools\ci_estado.mjs" --sha <sha> --esperar --reintentar-infra

# Sintaxis de un módulo de la extensión
& $node --check "..\extenciones web\01_Nueva_Luz_3.0\src\04_extraccion_datos.js"
```

---

## 15. Por qué estas reglas (para no deshacerlas sin querer)

- **Un dueño por archivo** existe porque dos agentes escribiendo el mismo archivo
  se pisan de una forma que no da error: gana el último y el otro queda con un
  código que no corresponde a lo que probó.
- **El gate único por rol** existe porque «cada uno verifica como puede» termina
  en un release que pasó una verificación que nadie corrió igual dos veces.
- **La corrida real es del usuario** porque el portal del SRI es un sistema real
  con credenciales reales; un agente no tiene por qué entrar ahí, y los bancos
  HTML prueban lo mismo que se puede probar sin riesgo.
- **El CI de infra se reintenta y el real no** porque en el primero el reintento
  es la evidencia de que era infraestructura; en el segundo el reintento borra la
  señal de que hay un banco roto.
- **Un solo escritor de versión** porque la versión es parte del contrato de
  release: si la escribe cualquiera, nadie sabe qué se publicó.
- **Contexto fresco por tarea** porque un agente que arrastra toda la
  conversación anterior repite decisiones viejas y contamina el alcance; el
  contexto durable vive en el repo, no en la memoria del agente.
