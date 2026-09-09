# Nueva Luz 3.0 & SantiagoCordova - Agente Maestro

Este archivo define las reglas arquitectónicas, los flujos de estado crítico y las pautas de desarrollo para el ecosistema "SantiagoCordova" (Aplicación Web) y la Extensión "Nueva Luz 3.0" (SRI Automation). 

Cualquier IA operando en este entorno **DEBE** leer y respetar estas instrucciones antes de proponer u ejecutar cambios en el código.

---

## 0. OBJETIVO GENERAL DEL PROYECTO

> **Obtener TODOS los comprobantes de declaraciones a la fecha.**

No es «declarar el mes en curso». Es que cada contribuyente tenga guardado el
comprobante de **cada** declaración presentada. Declarar lo pendiente es una
parte del trabajo; la otra —y la que quedaba sin hacer— es recuperar los
comprobantes de lo que ya se declaró.

De ahí que Consulta de declaraciones sea tan importante como el wizard de
recepción: ahí está el histórico completo, una fila por período, cada una con
su botón «Comprobante de declaración».

`bajarTodosLosComprobantes()` recorre esa tabla entera y baja lo que falte,
salteando lo que el registro local ya da por guardado. El botón 🧾 del HUD lo
dispara a mano; `sriTraerComprobantes()` hace lo mismo desde la consola.

### Y que cada compra vaya donde corresponde

Tener el comprobante no alcanza si la declaración lo mete en el casillero
equivocado. La declaración separa lo deducible de lo no deducible según la
actividad del proveedor, y hoy el bot mete todas las facturas en un solo
bloque. La base de proveedores de la §7 es lo que falta para cerrar eso — y de
paso resuelve el anexo de gastos personales y la devolución de IVA de tercera
edad, que preguntan lo mismo sobre el mismo RUC.

---

## 0a. DOS IAs TRABAJANDO A LA VEZ — leé esto antes de tocar nada

> Anotado el **07-sep-2026**, a pedido del usuario: *«estamos trabajando con
> Gemini en paralelo»*. Puede que quien lea esto no sea la única IA sobre este
> repositorio en este momento.

### Las tres reglas que evitan pisarse

**1 · El disco no es tuyo mientras lo leés.** Entre que leés un archivo y lo
escribís, la otra IA pudo haberlo cambiado. Nunca sobrescribas un archivo
entero a partir de lo que leíste hace rato: buscá el fragmento exacto,
verificá que aparezca **una sola vez**, y reemplazá ése. Todos los parches de
este proyecto se hacen así, y por eso se pueden aplicar sin miedo:

```python
if s.count(viejo) != 1:
    raise SystemExit('esperaba 1, encontro %d' % s.count(viejo))
```

Si el conteo no da 1, **parar y mirar** — significa que el archivo no es el que
creías. No "arreglarlo" ampliando el patrón.

**2 · `npm run build` es de a uno.** `build/content.js` lo generan los siete
`src/*.js` concatenados. Si las dos IAs compilan a la vez, gana la última y la
otra se queda con un bundle que no corresponde a su código — y el síntoma es
un fallo imposible de reproducir. Antes de compilar, `git status`: si hay
cambios en `src/` que no son tuyos, la otra IA está en el medio de algo.

**3 · Un commit, un tema.** Nada de commits que tocan el 5%, la subida y el
panel a la vez. Si hay que revertir, tiene que poder revertirse una cosa sin
llevarse las otras dos por delante.

### Los dos documentos, y para qué sirve cada uno

Hay **dos** archivos de estado, a propósito. No compiten:

| Archivo | Qué es | Cuándo se escribe |
| :--- | :--- | :--- |
| **`.agents/AGENTS.md`** (éste) | la **memoria permanente**: reglas, la Matriz de selectores, las lecciones y por qué se tomaron | cuando algo se aprende para siempre |
| **`STATE.md`** (raíz) | el **parte del día**: qué se resolvió hoy, quién está en qué, el mapa de archivos | cada jornada de trabajo |

Lo carga automáticamente sólo el primero (`@.agents/AGENTS.md` desde los
`CLAUDE.md`). **`STATE.md` hay que abrirlo a mano** — hacelo al empezar, dice
en qué anda la otra IA.

Si los dos se contradicen, gana el que traiga **evidencia** (un log, una
respuesta HTTP, una captura), no el más reciente.

### Cómo dejar una propuesta en vez de hacerla

Cuando veas algo que conviene cambiar pero **no es lo que te pidieron**, no lo
hagas: anotalo. Las propuestas viven en la **§0c**, con este formato:

```
### Propuesta · <título corto>
**Quién la propone**: <IA / fecha>
**Qué se vio**: el hecho concreto, con el log o el archivo.
**Qué se propone**: el cambio.
**Qué cuesta / qué rompe**: honesto, incluido «no sé».
**Estado**: propuesta · aceptada · descartada (con el motivo)
```

Una propuesta descartada **se deja escrita con el motivo**. Si no, la próxima
IA la vuelve a proponer y se vuelve a descartar.

### Lo que NO se toca sin pedirlo

- **La Matriz de la §6.** Un `id` entra sólo con evidencia de que el bot
  escribió en él, nunca por patrón numérico. Lo dice la §5b y ya salvó dos
  veces.
- **El contrato de envío de la §4.** Cinco condiciones, todas obligatorias.
  Agregar está bien; aflojar una, no.
- **Los bancos de `tests/`.** Se agregan comprobaciones; no se borran. Cada una
  cuida un fallo que llegó a pantalla y costó un lote.
- **Las claves.** Ni en `shared_config.js`, ni en el DOM del SRI, ni en un log.

### Antes de decir «listo»

```bash
node --check src/0*.js && npm run build
```

y los dieciocho bancos en `tests/index.html` (hace falta el servidor:
`bancos-extension` en `.claude/launch.json`, los `file://` no ejecutan
scripts). **611 comprobaciones, verdes el 09-sep-2026** (18 bancos, los dos
últimos agregados ese día: `bendita` y `reglas`). Si tu cambio baja ese número,
algo se rompió; si lo sube, dejá dicho qué agregaste.

---

## 0c. PROPUESTAS ABIERTAS

> Formato en la §0a. Lo que está acá **no está hecho**: es lo que una IA vio y
> dejó anotado para que lo decida el usuario, u otra IA con más contexto.

### Propuesta · Auditar los comprobantes archivados con el período equivocado

**Quién la propone**: Claude · 07-sep-2026
**Qué se vio**: el bug del período (§2c) archivó la declaración de agosto de
2026 de CHAVEZ CORDOVA como **agosto de 2023**, porque su RUC
(`0706482023001`) lleva `2023` adentro. El bug está arreglado, pero **lo que ya
se archivó mal sigue archivado mal**.
**Cuánta gente**: en el lote de 15 del 07-sep, 1 RUC de 15 contenía un `202X`.
Sobre 500 contribuyentes son del orden de **30 o 40** — no es un caso raro.
**Qué se propone**: un botón que no toca nada y sólo compara. La memoria local
(`filed_<ruc>_2011_<mes>_<año>`) tiene el período **correcto**, porque se arma
con `workflowPeriod` y no con la pantalla. Cruzarla contra lo que hay en
Supabase / R2 y listar los que no coinciden. Después el usuario decide si se
re-suben o se dejan.
**Qué cuesta / qué rompe**: nada, si es sólo de lectura. El riesgo está en
"arreglarlo solo": mover un comprobante puede pisar uno legítimo de ese
período viejo. **Listar sí, mover no** sin confirmación.
**Estado**: propuesta

### Propuesta · Un solo lector de texto del portal, y prohibir `document.body.innerText`

**Quién la propone**: Claude · 07-sep-2026
**Qué se vio**: el bot leyéndose a sí mismo ya rompió **tres** veces, cada una
en un lugar distinto y cada una descubierta en producción:

| Cuándo | Qué pasó |
| :--- | :--- |
| modales | `offsetParent` era null en todo `position:fixed`; `dismissSridialogs()` nunca cerró uno |
| login | `document.body.innerText` incluía el HUD, y el bot creyó que el SRI lo rechazaba |
| período | sin cabecera se raspaba la página entera y salía cualquier mes |

Es el mismo error tres veces. No es mala suerte: es que **no hay una sola
manera correcta de leer texto del portal**, así que cada quien improvisa la
suya.
**Qué se propone**: un helper único —`textoDelPortal(zonaOSelector)`— que
clone, saque los nodos de la extensión y devuelva el texto; que **devuelva
`null`** si la zona no existe, en vez de caer al `body`; y una comprobación en
un banco que falle si aparece un `document.body.innerText` nuevo en `src/`.
**Qué cuesta / qué rompe**: hay que revisar cada uso actual, y alguno puede
depender del comportamiento viejo. Es una tarde, no cinco minutos.
**Estado**: propuesta

### Propuesta · Que el 📐 se dispare solo cuando el portal reclama un casillero

**Quién la propone**: Claude · 07-sep-2026
**Qué se vio**: cuando el SRI pide el casillero 203 (§9d), lo que hace falta
para resolverlo es justamente lo que el 📐 sabe leer — el `id` del campo y sus
opciones. Hoy el usuario tiene que acordarse de apretarlo, estando en la
pantalla correcta, antes de que el lote siga.
**Qué se propone**: que `loQuePideElFormulario()`, al encontrar un reclamo con
número de casillero, corra el 📐 acotado a ese número y **deje la radiografía
guardada** en `SafeStorage`. Así el dato queda tomado en el momento exacto en
que el portal lo estaba pidiendo, sin depender de que alguien llegue a tiempo.
**Qué cuesta / qué rompe**: poco. El 📐 ya no toca nada del formulario, sólo
lee. Hay que cuidar que no se dispare en bucle si el reclamo persiste.
**Estado**: propuesta

### Propuesta · Crear `notification_count`, o sacarla del upsert

**Quién la propone**: Claude · 07-sep-2026
**Qué se vio**: `notification_count` **no existe** en ninguna de las dos
tablas — comprobado contra el proyecto real:
`{"code":"42703","message":"column ... does not exist"}`. Y
`services/supabaseClientService.ts:75` la manda en el upsert de cada
declaración. PostgREST rechaza el payload **entero** cuando trae una columna
desconocida.
**Por qué importa**: si ese upsert falla, no se guarda **nada** de la
declaración — ni la notificación ni el resto. La sala de envío nunca se
verificó en pantalla con datos reales (§0b.6), así que puede estar fallando
sin que nadie lo haya visto.
**Qué se propone**: o crear la columna
(`ALTER TABLE public.sri_declaraciones ADD COLUMN notification_count int DEFAULT 0;`)
o sacarla del payload. La columna hace falta de verdad — es la etapa del
mensaje, y sin ella todos vuelven a recibir el de bienvenida— así que crearla
parece lo correcto. **Decisión del usuario: toca su base.**
**Qué cuesta / qué rompe**: el `ALTER TABLE` es aditivo y no rompe nada. Falta
confirmar en qué tabla la quiere.
**Estado**: propuesta — **verificar primero si la sala de envío está guardando
algo**

### Propuesta · Preguntar por qué la llave anon funciona desde Node y no desde el content script

**Quién la propone**: Claude · 07-sep-2026
**Qué se vio**: la misma llave devuelve **HTTP 200** probada desde afuera y
**401** desde el content script del portal. Eso no es una llave revocada: es
algo del camino. Candidatos, sin haberlos probado: que el bundle la trunque,
que Supabase esté aplicando alguna restricción por `Origin`, o que el proyecto
tenga un problema (en la misma corrida hubo **500** y **521**).
**Qué se propone**: el aviso ya dice ahora **la forma** de la llave que sale
(cuántos caracteres, si sigue pareciendo un JWT de tres partes) sin decir su
valor. Con eso la próxima corrida distingue «está truncada» de «está entera y
la rechazan», que son dos arreglos completamente distintos. **Antes de rotar
nada, leer ese dato.**
**Qué cuesta / qué rompe**: la parte del diagnóstico ya está hecha. Lo que
falta es una corrida que lo muestre.
**Estado**: **CERRADA el 07-sep-2026 — no era la llave.** Era un permiso sobre
la columna `is_deleted` (`42501`). Ver la §0b.2. Se deja escrita porque la
lección vale más que el caso: **leer lo que la API contesta antes de acusar a
la credencial.**

---

## 0b. TABLERO DE PENDIENTES — empezá por acá

> Actualizado el **07-sep-2026**. Este documento pasa las 1.400 líneas y sus
> secciones **no están en orden** (la §9c vive después de la §10, la §9b
> después de la §9d). Esta sección es el índice de lo que falta, con el
> puntero a dónde está contado en detalle.
>
> **La regla que gobierna todo lo de abajo**: cuando algo depende de criterio
> contable o legal, el bot **junta los datos y los muestra; no decide**. Una
> suposición presentada como dato es lo único que este proyecto no perdona —
> la declaración lleva la firma del contador, no la del software.

### Lo que está mordiendo AHORA

| # | Qué | A quién frena | Detalle |
| :-: | :--- | :--- | :--- |
| 1 | **Casillero 203 · el decreto del 5%** | **todo contribuyente con compras al 5%** — no se puede enviar | §9d |
| 2 | ~~Supabase rechaza la llave (401)~~ **RESUELTO** — nunca fue la llave | — | §0b.2 |
| 3 | **jsPDF nunca carga** (CSP `unsafe-eval`) | el PDF de respaldo sale simple, siempre | §0b.3 |
| 4 | **9 declararon sin comprobante guardado** | esos 9 contribuyentes | §0b.4 |
| 5 | **La clave de R2 sigue en el repositorio** | seguridad, ya | §10a |
| 6 | **Comprobantes ya archivados con el año del RUC** | ~30-40 de 500 · el bug está arreglado, lo archivado no | §2c · propuesta en §0c |

### Lo que falta construir, por tamaño

| Qué | Estado | Quién lo cierra | Dónde |
| :--- | :--- | :--- | :--- |
| Laboratorio de proveedores · el mapa CIIU → crédito | cimiento hecho, falta el mapa | **el contador** | §7 · §9b · §0b.1 |
| Casilleros 502 / 512 (sin derecho a crédito) | `id` sin confirmar | 📐 + Biblia | §9a · §0b.5 |
| Casillero 560 (IVA generado del 540) | `id` sin confirmar | 📐 + Biblia | §6 C |
| Notificar declaraciones por WhatsApp | sala de envío lista, falta el automático | código + cuenta Meta | §0b.6 |
| Email automático con el PDF adjunto | decidido, no empezado | código | §0b.6 |
| Tipos de comprobante que faltan (ND, liquidación) | códigos sin leer del portal | una consulta al `<select>` | §8a |
| Empresas fantasmas | dataset sin bajar | código | §10 |
| El XML, cableado al flujo automático | parser y descarga hechos, no se disparan solos | código | §11 · §0b.7 |
| Cambio de clave por lote | traza guardada, nada construido | código | §8c |
| Botones de un clic desde la ficha del cliente | ideas anotadas | código | web §6 |

---

### 0b.1 · El laboratorio de proveedores — qué falta exactamente

**Lo que YA funciona** (§7, no hace falta reconstruirlo):

- `Proveedores` en `02_servicios_y_memoria.js`, marca `sc_proveedores`.
- Se aprende **mirando**: cada factura y cada NC deja anotado a su proveedor,
  desde el TXT de recibidos, la tabla del portal y las notas de crédito. Las
  retenciones **no** entran: las emite el cliente que te retuvo.
- `registrarLote()` cuenta **a qué tarifa factura cada proveedor**
  (`tarifas: {'15':n,'5':n,'0':n,'?':n}`). Eso es lo que resuelve la
  ambigüedad de las mezcladas que caben de dos maneras (§9a): un supermercado
  no puede facturar al 5%, y eso no hay que preguntárselo a nadie.
- El catastro de El Oro adentro (`vendor/catastro_eloro.txt`, 283.879 RUC,
  ancho fijo y ordenado, bisección sobre el texto) completa la **actividad**.
- `sugerirDesdeIA()` para los que ni el catastro cubre, por el service worker,
  mandando **sólo nombre y actividad pública** — nunca RUC ni importes.
- La cascada: **decisión del contador ≫ catastro ≫ IA**, y una sugerencia
  nunca pisa un `origen: 'usuario'`.
- El panel **🏷️** (cajón 🧰) muestra la actividad del cliente arriba, los del
  5% primero, chapas con las tarifas vistas, y bandera roja al proveedor
  SUSPENDIDO que sigue emitiendo.
- Bancos: `tests/proveedores.html` (58) y `tests/catastro.html` (31).

**Lo que falta, y NO lo puede poner una IA:**

1. **El mapa (tarifa · actividad del proveedor · actividad del cliente) →
   ¿da crédito tributario?** Son los **tres** datos juntos, dicho por el
   usuario el 06-sep-2026: *«la herramienta tiene que saber de IVA porcentaje
   y la actividad para saber si es crédito tributario, además saber la
   actividad del cliente para que sea compatible»*. Una compra da crédito
   cuando alimenta una actividad que a su vez está gravada: la misma factura
   da distinta respuesta para un constructor que para otro rubro.
   `Proveedores.porQueDecidir(rucProveedor, rucCliente)` ya junta los tres y
   devuelve `credito: null` mientras nadie haya decidido. **`null` no es «no
   da crédito».**
2. **El casillero donde va lo no deducible** (502/512) — ver §0b.5.
3. **El interruptor preguntar / seguir** para los desconocidos. Hoy rige el
   modo «seguir» de hecho: un proveedor sin clasificar va donde va hoy y queda
   en la lista de pendientes. **Nunca al 502 por las dudas** — mandarlo ahí le
   quita al contribuyente un crédito que quizá le corresponde.

**Y no se olvide**: esta base es de **tres** proyectos, no de uno (§7). El
mismo dato responde al IVA, al Anexo de Gastos Personales y a la devolución de
IVA de tercera edad. Por eso se guardan `actividad` y `ciiu` **además** de
`deducible`, y por eso `exportar()` los saca en TSV. Cuando se arme el
proyecto de tercera edad, la parte cara ya va a estar hecha.

### 0b.2 · El 401 de Supabase — RESUELTO, y nunca fue la llave

> Cerrado el **07-sep-2026**, después de dos tardes buscando en el lugar
> equivocado. **Vale como lección general del proyecto**, no sólo para esto.

Probado contra el proyecto real, con la llave que venía dando 401:

```
200  select=id                    ok
200  select=tax_profile           ok
401  select=is_deleted            {"code":"42501","message":"permission denied for table clients"}
401  is_deleted=eq.false          idem
```

`42501` es **insufficient_privilege** de PostgreSQL. La llave estaba perfecta:
el rol `anon` podía leer la tabla `clients` pero **no la columna
`is_deleted`** — y todas las consultas de la extensión filtraban por
`is_deleted=eq.false`.

#### Eran DOS causas, no una — y las encontramos por separado

Trabajando en paralelo el mismo día, Gemini llegó a la otra mitad. **Las dos
son ciertas y explican tablas distintas:**

| Tabla | Causa | Quién la encontró |
| :--- | :--- | :--- |
| `clients` | permiso de **columna**: `anon` no puede leer `is_deleted` | Claude |
| `sri_declaraciones` | **RLS**: `harden_full_rls.sql` dejó sólo política de INSERT, y un upsert con `on_conflict` necesita **UPDATE** | Gemini |

La de Gemini tiene una consecuencia que conviene tener presente: sin política
de `SELECT`, la consulta anidada `sri_declaraciones(...)` de
`fetchClientsDirectly` **devolvía siempre `[]`** — o sea que el panel no veía
ninguna declaración histórica, y eso no daba error, daba vacío.

> Lección que vale más que el caso: **un mismo síntoma podía tener dos causas
> a la vez**, y cada uno de los dos había encontrado una y la daba por
> completa. Cuando dos agentes diagnostican lo mismo, comparar antes de
> cerrar.

**Todo el SQL está en un solo archivo**, para una sola pasada por el editor de
Supabase: `santiagocordova-main/database/fix_sri_declaraciones_anon_rls.sql`
— las políticas de `sri_declaraciones`, el `GRANT` de `is_deleted` y el
`ALTER TABLE` de `notification_count`.

**Supabase venía diciendo exactamente esto en el cuerpo de cada 401**, y el
bot lo tiraba a la basura para en su lugar mandar a rotar una credencial sana.
Es la segunda vez que el mismo diagnóstico equivocado cuesta una tarde (la
primera fue la llave de Ajustes que tapaba a la del código).

> **Regla**: cuando una API contesta un error, **lo primero es leer lo que
> contestó**. Un 401 de Supabase casi nunca es la llave. `loQueDijoSupabase()`
> en `01_utilidades_y_pdf.js` traduce el `code` a qué hacer, y el aviso sobre
> la llave quedó como último recurso — para cuando la respuesta no dijo nada.

#### Qué se hizo, y qué podés hacer vos

Las dos consultas dejaron de pedir `is_deleted`. Con eso anda hoy, sin tocar
permisos. El costo: la lista del cockpit puede incluir algún contribuyente
dado de baja en la web.

Para recuperar el filtro, **una línea en el editor SQL de Supabase**:

```sql
GRANT SELECT (is_deleted) ON public.clients TO anon;
```

Es una decisión tuya: le da al rol público acceso de lectura a esa columna.

#### Y una columna que no existe

```
400  select=notification_count    {"code":"42703","message":"column ... does not exist"}
```

`notification_count` **no está ni en `clients` ni en `sri_declaraciones`**, y
`services/supabaseClientService.ts` lo manda en el upsert de cada declaración
(línea 75). PostgREST rechaza el payload entero cuando trae una columna
desconocida: eso puede estar tirando abajo el guardado completo desde la sala
de envío. Ver la propuesta en la §0c.

### 0b.2b · Lo que quedó anotado de aquella búsqueda

La declaración se hace bien y el comprobante se guarda — por eso el fallo pasa
desapercibido. Lo que se pierde son las métricas del panel web.

Lo que ya se sabe, para no volver a empezar de cero:

- La llave del código (`SC_SUPABASE_ANON_KEY` en `01_utilidades_y_pdf.js`)
  **devolvió HTTP 200** al probarla desde Node el 07-sep-2026.
- Una llave guardada en **Ajustes pisa a la del código**. Una llave de repuesto
  rota tapa a la buena en silencio: el arreglo suele ser **borrar la de
  Ajustes**, no salir a buscar una nueva. 🩺 prueba las dos y lo dice.
- `avisoLlaveWeb()` distingue tres casos: no hay ninguna llave cargada (la
  petición sale sin `apikey`), la rechazada es la de Ajustes, o es la del
  código.
- En la corrida del 07-sep también hubo **HTTP 500**, **HTTP 521** (Cloudflare:
  origen caído) y un error de **CORS**. Eso apunta al proyecto de Supabase, no
  a la llave. **Verificar el estado del proyecto antes de tocar credenciales.**

> Vale como regla general, y costó media tarde descubrirla: **una credencial
> de repuesto que no anda es peor que no tener repuesto.**

### 0b.3 · jsPDF no puede cargar, y no es un bug del código

```
⚠️ [jsPDF] No disponible; se usará el PDF de respaldo simple:
Evaluating a string as JavaScript violates … 'unsafe-eval' is not an allowed source
```

La CSP de MV3 prohíbe `unsafe-eval` y jsPDF lo usa. **No afecta al PDF oficial
del SRI**, que se captura por `fetch` y funciona (113.276 bytes medidos el
07-sep-2026). Sólo afecta al respaldo maquetado: `generateValidPdfBase64()`
arma igual un PDF válido a mano, así que nunca es fatal.

Cuidado con una consecuencia que sí importa: cuando la declaración **no se
envía** (queda en borrador), igual se sube un PDF de respaldo a R2 y se
registra. Es un marcador de posición donde va un comprobante. Antes de darlo
por bueno, revisar que el estado en Supabase diga `por_pagar` /
`inconsistencia` y no «declarado».

### 0b.3b · El atajo se perdía, y el PDF no llegaba — corregido el 07-sep-2026

Dos fallos encadenados en el camino que **cierra el objetivo de la §0**: traer
el comprobante de quien **ya declaró**.

#### 1 · La decisión tomada se pisaba sola

El perfil acertó a la primera:

```
📋 [PERFIL] Veredicto: ya_declarada
🧾 [RECUPERAR] Buscando el comprobante ... en Consulta de declaraciones...
```

Y ahí mismo se perdió. El bloque de auto-arranque de `03_ingreso_y_sesion.js`
corre en **cada carga con sesión abierta**, y terminaba siempre plantando
`pendingAction = 'turbo_step1_facturas'` sin mirar si ya había algo en curso.
Al cargar `lista-obligaciones.jsf`, `veredictoDelPerfil()` contestó
`no_concluyo` — correcto, no estamos en el perfil— y el final del bloque
borró la recuperación:

```
📋 [PERFIL] Veredicto: no_concluyo — no estamos en el perfil
🚀 Sesión activa detectada: Redirigiendo DIRECTO al Paso 1...
```

Extrajo 19 facturas, buscó retenciones, buscó notas de crédito y navegó el
wizard entero **para nada**, hasta que el paso 4 le dijo lo que el perfil ya le
había dicho al principio (`DECLARACIÓN PREVIA / SUSTITUTIVA DETECTADA`) y
volvió a arrancar la recuperación.

**No rompía nada** — el freno de la sustitutiva agarraba al final— así que
costaba un minuto largo por cliente sin que se notara. Con los que ya
declararon, eso es la mayor parte del lote.

`YA_DECIDIDAS = ['recuperar_comprobante', 'bajarTodos']`: esas acciones son
**decisiones ya tomadas**, no pasos de una secuencia. Quien las puso sabía más
que este bloque, que llega a esa línea justamente cuando **no supo concluir
nada**.

#### 2 · El PDF se iba a la carpeta de descargas

```
🧾 [RECUPERAR] Se pulsó la descarga pero no llegó ningún PDF.
```

El botón «Comprobante de declaración» es un `submit` de JSF
(`onclick="PrimeFaces.onPost()"`): manda el formulario entero y el portal
responde con el PDF y `Content-Disposition: attachment`. **El navegador se lo
lleva al disco** — ni `fetch` ni `URL.createObjectURL` lo ven, así que el
interceptor del módulo 01 no tenía forma de agarrarlo. Probablemente el
archivo sí bajaba, mientras el log decía que no había llegado.

Es el mismo caso de `lnkXml` (§11) y se resuelve igual:
`traerPdfDelComprobantePresentado()` **reproduce el POST** — todos los campos
del formulario más el `name` del botón, que es lo que le dice a JSF qué se
pulsó— y lee la respuesta.

Dos cuidados que el banco vigila:

- **Se comprueba que sea un PDF** (`%PDF` en los primeros bytes). Con la sesión
  caída el portal contesta HTML, y guardar eso como comprobante es peor que no
  tener ninguno: el panel diría que está y no estaría.
- **El botón queda como respaldo.** Si el POST no sale, se pulsa igual y el
  interceptor tiene su chance.

Banco: `tests/recuperar.html` (20 comprobaciones, verdes el 07-sep-2026).

### 0b.4 · Los 9 que declararon sin comprobante guardado

El propio lote los lista al terminar y dice qué hacer:

```
🧾 [BUCLE] 9 declararon pero su comprobante NO quedó guardado: …
   Se recuperan desde Consulta de declaraciones, sin volver a declarar.
```

Es exactamente el objetivo del §0. Se disparan con el botón **🧾** del cajón
🧰 (`bajarTodosLosComprobantes()`) o `sriTraerComprobantes()` en consola.
**No hay que volver a declarar nada.**

### 0b.5 · Los `id` que faltan — cómo se consiguen, y cómo NO

Faltan: **502 / 512** (sin derecho a crédito), **560** (IVA generado del 540) y
**203** (el decreto de la tarifa reducida).

**El único camino legítimo es el botón 📐** del cajón 🧰, con el formulario
abierto: lista todos los casilleros reales con su `id`, rótulo y si son
editables, resalta los del 5% y los del 502/512, y copia una tabla en Markdown
lista para pegar en la Biblia (`_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md`).
Desde consola es `sriMapaCasilleros({ desde, hasta })`.

> **Y desde el 07-sep-2026 también lee los DESPLEGABLES, con sus opciones.**
> Hasta ese día sólo miraba `input[type=text]` e `input[type=hidden]`. El 203
> es un `<select>`: la única herramienta que teníamos para encontrarlo **no lo
> podía ver**, y contestaba «no hay nada» donde sí había — que es peor que no
> contestar. Cubre el `<select>` nativo y el widget de PrimeFaces, que esconde
> el select real y pinta los items como `<li>` en un panel aparte.
>
> Para el 203, el dato que hace falta son **las opciones**: los decretos que
> el portal ofrece, con su `value`. Salen en la consola, en el panel y en el
> Markdown. **Cuál corresponde lo elige el contador**; cuáles existen lo
> averigua el bot.

Es un botón y no un comando a propósito: **Chrome bloquea el pegado en la
consola** (protección contra self-XSS, que pide escribir `allow pasting`), y un
dato que sólo se saca escribiendo a mano es un dato que no se saca.

> ⛔ **Prohibido suponer un `id` por patrón.** El 550 resultó ser
> `concepto1281` y el 540 `concepto1271` — el patrón existía, y aun así sólo
> se cablearon **después** de que el bot escribiera en ellos, en dos
> contribuyentes reales. Eso es lo que pide la §5b: evidencia, no simetría.

### 0b.6 · Notificar las declaraciones — dónde está y qué falta

> El detalle vive en **`santiagocordova-main/.agents/AGENTS.md` §5**. Acá va lo
> justo para saber que existe y no reconstruirlo.

**Hecho (07-sep-2026)**: `components/features/SalaDeEnvio.tsx`. El botón
«💬 Notificar WhatsApp» de la matriz la abre con los clientes seleccionados.
Una pestaña por vez, dos teclas por cliente (Enter abre, Enter confirma, S
saltea), y **el mensaje lleva el enlace al comprobante** firmado por 30 días
(`linkDelComprobante` en `services/fileService.ts`).

Nació porque el envío masivo llamaba a `window.open` una vez por cliente en el
mismo tick: el navegador dejaba pasar dos o tres y **bloqueaba el resto sin
avisar**, y el código marcaba a los 27 como notificados igual. Clientes
registrados como avisados sin haber recibido nada.

**Falta, en este orden:**

1. **Email automático con el PDF adjunto** — elegido por el usuario como lo
   siguiente. Lo caro ya está hecho: `telegram-bot/src/gmail.ts:100` envía por
   la API de Gmail y `telegram-bot/src/database_ops.ts` ya lee
   `sri_declaraciones`. Gmail da 500 envíos por día, de sobra para 500
   contribuyentes una vez al mes. Es el único canal donde el comprobante viaja
   **adjunto** y sin que nadie haga clic.
2. **WhatsApp Cloud API (Meta)** — el único camino oficial a «un botón y
   salieron los 500», y el único que adjunta el PDF por WhatsApp. Necesita
   cuenta de Meta Business, número dedicado y plantilla aprobada. Meta cobra
   por mensaje y sus condiciones se mueven seguido: **verificar el precio
   actual antes de comprometerse**, no confiar en lo que recuerde una IA.
3. **Verificar la sala en pantalla con datos reales** — nunca se hizo, porque
   llegar a la matriz necesita sesión.

> ⚠️ **`whatsapp-web.js` / Baileys están DESCARTADOS.** Son clientes no
> oficiales que se hacen pasar por WhatsApp Web. Funcionan, son gratis, y son
> lo que contesta cualquier tutorial. Pero violan los términos y el número que
> se banea es **el del estudio**, por donde escriben 500 contribuyentes. No
> construir esto salvo pedido explícito del usuario sabiendo el riesgo.

### 0b.7 · El XML: construido, no cableado

`parsearXmlComprobante()`, `repartirXmlEnResumen()`, `descargarXmlComprobante(N)`
y `traerXmlDeComprobantes([…])` funcionan y están probados (§11). Lo que falta
es **dispararlos solos** para los pocos casos que los necesitan:

- las facturas que quedaron **sin tarifa reconocible** (`resumen.ambiguas`),
- las que el cociente leyó como **5%**, para confirmar que no son mezcladas,
- las candidatas a **activo fijo**, donde además se quiere ver qué se compró.

Son unas pocas peticiones por cliente, no 27. `traerXmlDeComprobantes()` ya
pausa 700 ms entre una y otra y corta a las 40, para no despertar al WAF.

### 0b.8 · Cosas chicas anotadas, para que no se pierdan

- **`corsproxy.io` dejó de ser gratuito.** `fetchSRIPublicData()` en
  `services/sri.ts` lo sigue usando y devuelve **HTTP 403**
  (`keyless_legacy_url`). Autocompletar al crear un cliente y validar un RUC
  están fallando en producción.
- **El endpoint `movil-servicios/api/v1.0/contribuyente/{RUC}`** está detrás de
  un WAF. Falló desde curl con cabeceras completas y por proxy. Falta probarlo
  **desde el content script con la sesión del usuario** — el único contexto
  donde tiene chance de pasar.
- **R2**: rotar la clave (§10a: el token nuevo se crea en *R2 Object Storage →
  Manage R2 API Tokens*, **no** en *Mi Perfil → API Tokens*, y la rotación
  **termina al borrar el viejo**, no al crear el nuevo), sacar
  `R2_SECRET_ACCESS_KEY` de `shared_config.js`, y **deshabilitar el dominio
  público `pub-*.r2.dev`** — las rutas nuevas ya no se deducen del RUC, pero
  los comprobantes subidos antes del 07-sep-2026 sí.
- **A vigilar**: en la corrida del 07-sep apareció un `🔑 [VAULT] … para
  1103034052001` seguido en la línea siguiente de `⏭️ [OMITIDO] APOLO PALACIOS`
  (RUC `0704789205001`). Dos contribuyentes pegados. Puede ser coincidencia de
  dos flujos corriendo juntos; si vuelve a verse, es contaminación entre
  clientes y hay que buscarla igual que se buscó la que resolvió
  `accionDeQuien` (§2).

---

## 1. Arquitectura de la Extensión (Nueva Luz 3.0)

La extensión dejó de ser un solo archivo monolítico (`content.js`). Ahora utiliza **Vite** para concatenar ordenadamente múltiples archivos `.js` ubicados en `src/`.

### Reglas Estrictas de Modificación
- **YA NO HAY `content.js` EN LA RAÍZ**: el monolito histórico (433 KB) se archivó en `extenciones web/_ARCHIVADAS_Y_LEGACY/01_Nueva_Luz_3.0_cruft/content.js`. Es solo referencia: no lo edites ni lo devuelvas a la carpeta de la extensión. El único content script real es `build/content.js`, generado por Vite.
- **FLUJO DE TRABAJO**: Para modificar el comportamiento del SRI, debes editar el archivo semántico correspondiente dentro de `src/` (ej. `04_extraccion_datos.js`).
- **COMPILACIÓN REQUERIDA**: Tras modificar cualquier archivo en `src/`, debes obligatoriamente ejecutar el comando `npm run build` (o asegurar que el desarrollador lo haga) dentro de la carpeta de la extensión para que Vite ensamble los cambios en `build/content.js`.
- **jsPDF NO SE CONCATENA**: vive en `vendor/jspdf.umd.min.js` (355 KB), declarado en `web_accessible_resources` del manifest, y se trae bajo demanda con `ensureJsPdfLoaded()` (en `01_utilidades_y_pdf.js`) sólo cuando hay que maquetar un PDF de respaldo. No lo devuelvas al bundle: duplicaría el peso del content script en cada página del SRI. Si su carga falla, `generateValidPdfBase64()` arma igual un PDF válido a mano — nunca es un error fatal.
- **VARIABLE SCOPING (Modo Concatenación)**: Los 7 archivos de `src/` se concatenan en orden estricto (01 al 07). Esto significa que no usamos `import/export`. Las funciones declaradas en el archivo `01` están disponibles de manera global para el archivo `06`. Mantener el orden lógico es imperativo para evitar "Temporal Dead Zones" de variables constantes (`const`).
- **TIPO DE CHEQUEO**: `jsconfig.json` activa `checkJs` para `src/**`, pero **solo aplica dentro del editor**: `typescript` no está instalado y no hay paso de type-check en el build ni en CI (`npm test` falla a propósito). Ningún archivo lleva `// @ts-check`. Antes de dar un cambio por terminado, la verificación real es `node --check` sobre cada archivo de `src/` más `npm run build`.
- **CUIDADO CON LOS MÉTODOS DUPLICADOS**: `SriAssistantPanel` es una clase de ~3.500 líneas. Un método declarado dos veces **no da error**: el segundo pisa silenciosamente al primero y el primero queda muerto. Antes de añadir un método, verificá que el nombre no exista ya:
  ```bash
  grep -n "async nombreDelMetodo(" src/06_panel_interfaz.js
  ```
- **CLAVES FUERA DEL DOM**: nunca escribas contraseñas del SRI en el HTML que se inyecta en `srienlinea.sri.gob.ec` — ni en atributos `data-*`, ni en handlers `onclick` inline. Poné solo el RUC en el elemento y resolvé la credencial en el momento del click contra `sc_clients_cache`. Todo dato de cliente que vaya a `innerHTML` pasa por `escapeHtml()`.
- **`offsetParent` NO SIRVE PARA MODALES**: en Chrome todo elemento
  `position: fixed` tiene `offsetParent === null`, y los modales del SRI
  (PrimeFaces y Angular Material) son fixed. Usar el helper `esVisible(el)` de
  `02_servicios_y_memoria.js`, que combina `getComputedStyle` con
  `getBoundingClientRect`. Por esta trampa `dismissSridialogs()` nunca llegó a
  cerrar un solo modal.
- **NUNCA PULSAR UN BOTÓN DE MODAL POR SU TEXTO** cuando el modal no es un aviso
  conocido del SRI: el portal muestra una encuesta de satisfacción con un botón
  «Quiero responder» que enviaría una opinión en nombre del usuario.
  `cerrarModalesNoPrimeFaces()` solo usa controles de cierre explícitos
  (`aria-label`, `×`, `.mat-dialog-close`) y, si no encuentra ninguno, deja el
  modal quieto y avisa por consola.
- **NADA DE `onclick` INLINE QUE LLAME FUNCIONES DEL CONTENT SCRIPT**: los handlers inline se ejecutan en el *main world* de la página y no ven las funciones del content script (mundo aislado). Usá `addEventListener`.

### Los 7 Módulos Semánticos
1. `01_utilidades_y_pdf.js`: Helpers, conversiones, y lógica de captura (foto) del PDF final.
2. `02_servicios_y_memoria.js`: Estados persistentes (`GhostMemory`, `SafeStorage`).
3. `03_ingreso_y_sesion.js`: Navegación hacia `inicio/NAT` y auto-login (Keycloak).
4. `04_extraccion_datos.js`: Lógica profunda para raspar tablas del SRI (Facturas, Retenciones, Notas de crédito).
5. `05_llenado_formulario.js`: Cálculos matemáticos Elite y escritura del DOM en el formulario del SRI.
6. `06_panel_interfaz.js`: Todo lo relacionado al HUD visual flotante (`SriAssistantPanel`).
7. `07_navegacion_sri.js`: Secuenciadores "Wizards", `autoDismissSriWarnings` (saltador de modales) y el `SafeStorage.get()` inicial.

---

## 2. Memoria y Manejo de Estado (Anti-Reloads)

Dado que la plataforma del SRI es una Single Page Application (SPA) híbrida que frecuentemente fuerza recargas completas (Full Page Reloads) al cambiar de sección, la extensión utiliza una memoria fantasma para recordar en qué paso estaba.

- `GhostMemory`: Almacena el progreso lógico temporal.
- `SafeStorage`: Envuelve `chrome.storage.local`. La llave `pendingAction` dicta qué bloque de código debe ejecutarse cuando la página termine de cargar (ej. `pendingAction: 'startIvaNavigation'`).
- `actionTimestamp`: **NO previene bucles infinitos, aunque esta línea lo
  prometió durante mucho tiempo.** Se reescribe con `Date.now()` en 32 lugares,
  y la caducidad se medía contra ese valor renovado: el propio bucle renovaba
  su plazo, así que un bucle rápido no vencía nunca. Sigue sirviendo para saber
  cuándo se pidió algo; no como freno.
- `accionEnCurso` + `accionVueltas`: **el freno de verdad, desde el
  07-sep-2026.** Cuenta RECARGAS, no tiempo — una acción que trabaja dentro de
  una sola página no recarga; un bucle recarga siempre. A las 8 cargas con la
  misma acción pendiente se descarta todo y se avisa. Cambiar de paso reinicia
  la cuenta, así que un lote largo nunca se corta solo.

  > Lo destapó el usuario con una clienta: «se quedaba en bucle al querer
  > marcar declaraciones de IVA, y luego cerré y abrí y **siempre así** esa
  > ejecución con ese cliente». «Siempre así» era la acción pegada en el
  > almacén, sin forma de rendirse. Banco: `tests/bucles.html`.

**Regla**: Si necesitas crear un flujo que atraviese más de una URL del SRI, **debes** usar `SafeStorage` para guardar el estado siguiente antes de inyectar el redireccionamiento `window.location.href`.

---

## 2c. El período con el que se archiva — y el año que salía del RUC

> Corregido el **07-sep-2026**. Es el fallo más caro que encontró este
> proyecto, porque no perdía nada: **archivaba bien, en el lugar equivocado.**

`getCanonicalPeriodStr()` devuelve `AAAA-MM`, y de ahí salen **la ruta del
comprobante en R2** y **la clave de Supabase** (`on_conflict=client_id,type,period`).

En la corrida del 07-sep-2026, CHAVEZ CORDOVA GUIDO ERMEL declaró **agosto de
2026** y el comprobante quedó guardado así:

```
✅ [R2] .../Declaracion_IVA_0706482023001_2023-08.pdf
⚡ [SUPABASE] ... 0706482023001 2023-08
```

**Agosto de 2023.** `extractFormPeriod()` buscaba el año así:

```js
const yearMatch = headerText.match(/202[0-9]/);   // ← el culpable
```

El primer `202X` del texto de la cabecera. Y la cabecera del portal muestra el
RUC del contribuyente: **`07064820`⁠`2300`⁠`1`** lleva `2023` adentro.

### Por qué costó tanto verlo

**No fallaba siempre.** RODRIGUEZ GUTIERREZ (`1722764808001`) salía perfecto,
porque su RUC no contiene ningún `202X`. Un bug que muerde a unos clientes y a
otros no **parece que funciona**: se ve un caso bueno y se da por cerrado.

En el lote de 15 del 07-sep, 1 de 15 RUC tenía un `202X`. Sobre 500
contribuyentes son del orden de 30 o 40.

### El daño, que no es cosmético

1. El panel sigue diciendo que **ese mes no tiene comprobante** — o sea, la
   §0 sin cumplir para ese contribuyente.
2. Se **pisa la fila del período viejo**, que puede tener un comprobante real.
3. Nadie se entera, porque el log dice «subido exitosamente». Y lo está: al
   lugar equivocado.

### Cómo se lee ahora, en orden

| # | Fuente | Por qué |
| :-: | :--- | :--- |
| 1 | `frmFlujoDeclaracion:calPeriodo` (`mm/yyyy`) | el campo del wizard: el período que el portal aceptó, sin ambigüedad |
| 2 | La cabecera, **mes y año juntos** | `AGOSTO 2026`, `AGOSTO DE 2026`, `AGOSTO - 2026`, `AGOSTO/2026` |
| 3 | `workflowPeriod` del almacén | lo que el bot navegó |

Tres cosas cambiaron, y las tres importan:

- **El año nunca se busca solo.** Va pegado al nombre del mes, y se exige que
  no tenga otro dígito detrás (`(20\d{2})(?!\d)`), que es lo que impedía que
  `2023001` contara como `2023`.
- **Nunca se raspa `document.body`.** Sin cabecera identificable se devuelve
  `null`. Ése era el otro medio del mismo bug: sin cabecera se leía la página
  entera, el HUD de la extensión incluido. **Tercera vez** que este proyecto
  tropieza con el bot leyéndose a sí mismo — ver la propuesta de la §0c.
- **Se desapareció el «mes anterior» silencioso.** Había un tercer camino que
  devolvía el mes pasado con el año sacado del RUC. Inventar un período es
  peor que no saberlo: el comprobante se archiva igual, y en cualquier lado.

### Y si las dos fuentes no coinciden

No se resuelve a ojo. Manda **el período que el bot navegó** —que es el que
efectivamente se declaró— y **queda dicho en el log y en la bitácora**:

```
⚠️ [PERÍODO] La pantalla dice 2024-03 y el lote 2026-08.
   Se archiva como 2026-08, que es el período que se navegó.
```

Si ninguna de las dos sabe, se supone el mes anterior **y se avisa**. Un
período supuesto en silencio es un comprobante archivado donde nadie lo va a
buscar.

Banco: `tests/periodo.html` (22 comprobaciones, verdes el 07-sep-2026). Usa el
RUC real que lo destapó.

> **Lo ya archivado sigue mal.** El arreglo no repara el pasado: ver la
> propuesta de auditoría en la §0c.

---

## 3. Matemática "Elite" y Flujo de Sugeridos (SRI)

La extensión tiene la responsabilidad fiduciaria de calcular impuestos. No asumas ni adivines cálculos lógicos que puedan alterar la contabilidad del usuario.

### El Protocolo de Casilleros y "Refuerzo Técnico"
El SRI inyecta "Valores Sugeridos" oficiales en ciertos casilleros (ej. **615** y **617**).
- El sistema **prioriza** el sugerido oficial del SRI. 
- Si el SRI explícitamente sugiere `0.00` en el DOM, **DEBE SER RESPETADO Y MANTENIDO EN CERO**, devolviendo `true` en la función manejadora.
- Si no hay ningún sugerido (la caja está vacía o desaparecida), la función `calculateEliteFinancials()` asume el control ("Refuerzo Técnico") e inyecta cálculos basados en periodos previos o acumulados.
- **Regla**: Nunca permitas que el Refuerzo Técnico sobrescriba un `0.00` proporcionado deliberadamente por el sistema del SRI en las clases `.sugerido`.

---

## 3a. El bot NUNCA presenta una sustitutiva

La cabecera del wizard rotula el tipo en
`#frmFlujoDeclaracion:outMarcaDeclaracion`. Si dice **SUSTITUTIVA**, ese
período **ya fue declarado** y el portal está armando un reemplazo.

Una sustitutiva corrige una declaración que el SRI ya aceptó: es una decisión
del contador, no del software. `frenarSiEsSustitutiva()` se llama **antes de
llenar** y **antes de enviar**; al detectarla no se toca nada y se detiene el
lote entero.

Pasó de verdad el 04-sep-2026: el bot llenó el formulario y llegó a
«Confirmando envío en diálogo» sobre una sustitutiva. Solo no se envió porque
no encontró el botón.

---

## 3b. Nunca saltarse un contribuyente por un aviso

El endpoint `alertas/vencimiento` dice si una obligación figura como
presentada. **Esa señal NO alcanza para saltarse a un cliente.**

El aviso cambia alrededor del cierre de mes: la obligación puede dejar de
figurar sin que la declaración esté hecha. Saltar por ahí significa dejar a
alguien sin declarar, y eso termina en multa con la firma del usuario.

**Regla**: si el aviso dice que ya está presentada, el bot **va a comprobarlo**
a Consulta de declaraciones, que es el registro oficial de lo presentado:

- **Figura** → baja el comprobante y lo guarda. El cliente queda cerrado.
- **No figura** → vuelve al flujo normal y la declara.

Nunca se concluye «ya está hecha» sin haberla visto en la lista de
presentadas. Y si el aviso habla de un período distinto al que está declarando
el lote, de ahí no se deduce nada.

---

## 4. El "Cierre Mágico" (Cúspide de la Automatización)

La etapa final del llenado de una declaración automatizada involucra una secuencia delicada:
1. Verificación de Inconsistencias (cero errores permitidos).
2. `tryCaptureRealPdfFromDOM()`: Dibuja o captura un comprobante de que se completó.
3. `syncDeclarationToSupabase()`: Transfiere los metadatos (ventas, compras, retenciones) directamente a la base de datos de `SantiagoCordova.com`.
4. El lote automatizado salta automáticamente al **Siguiente Cliente** si el Auto-Batch está activado.

### Dos cierres distintos — no confundirlos
| Método (`06_panel_interfaz.js`) | Momento | Qué hace |
| :--- | :--- | :--- |
| `ejecutarCierreMagico()` | **PRE-envío** | Pulsa Siguiente, valida advertencias (`validarAdvertenciasSRI`), verifica que el saldo sea `$0.00` y que no haya inconsistencias, recién ahí envía. Si hay saldo a pagar guarda borrador y **se detiene**: nunca se paga automáticamente. |
| `finalizarPostEnvioSRI()` | **POST-envío** | Lo dispara `initDeclarationSuccessWatcher` al detectar la pantalla de confirmación. Solo respalda el comprobante, sincroniza y cierra sesión. No valida saldos porque ya es tarde. |

### Contrato de seguridad del envío (`ejecutarCierreMagico`)
El bot **sólo envía** si puede CONFIRMAR las cuatro cosas a la vez:

1. **`estaEnResumenDeclaracion()`** — estamos de verdad en el resumen de pago,
   no en el formulario.
2. `detectarSaldo()` devuelve un número y ese número es `0`.
3. `analizarMensajesResumen()` devuelve `'limpio'`.
4. `frenarSiEsSustitutiva()` devuelve `false`.
5. **`frenarSiHayIvaSinUbicar()` devuelve `false`** — no quedó plata de
   compras sin casillero (ver §9a).

Cualquier otro resultado guarda borrador y frena.
**Nunca trates la ausencia de mensajes como "todo bien"**: esa era justamente la
regresión que permitía enviar a ciegas si el selector fallaba.

El punto 1 se agregó el 04-sep-2026 por un caso real: el bot anunció «TODO
PERFECTO. Saldo $0.00» leyendo el casillero TOTALES (`concepto2610`) **mientras
seguía en el formulario**. El saldo del formulario no es el saldo a pagar: el
resumen es donde el SRI lo dice, y en una sustitutiva incluye la imputación al
pago. Se reconoce el resumen por `frmFlujoDeclaracion:pagValoresRemision`,
`outTotalPagarSinRemision` o `totalAPagar`.

Ambos selectores ya están calibrados contra tráfico real (04-sep-2026):
- `frmFlujoDeclaracion:totalAPagar` — confirmado, devuelve `USD 0.00`.
- **Inconsistencias: no se detectan por texto.** El portal enciende y apaga
  `#frmFlujoDeclaracion:erroresField` (`display:block` = hay errores,
  `display:none` = no hay) desde su propio `mostrarErrores()`. Ver la Biblia,
  sección «Errores y advertencias del formulario». `advertenciasField` es el
  equivalente para advertencias, que **no** impiden declarar.

Mientras no estén calibrados, `capturarDiagnosticoResumen()` guarda una
radiografía del DOM en `SafeStorage.sri_diagnostico_resumen` cada vez que el
cierre llega al resumen (RUCs enmascarados). Se lee con
`window.sriAssistant.verDiagnosticoResumen()`.

La bandera `declaration_synced_flag` en `SafeStorage` es el candado que evita que ambos corran sobre la misma declaración; `ejecutarCierreMagico()` la levanta antes de sincronizar. Se limpia al iniciar cada navegación y al pasar al siguiente cliente del lote.

`tryCaptureRealPdfFromDOM(shouldClickPrint)` **devuelve un boolean**, no los bytes: deja el base64 en la global `capturedPdfBase64`. Para sincronizar, pasale `null` a `syncDeclarationToSupabase` y dejá que ella corra su propio bucle de captura.

**Regla**: Cualquier alteración al Cierre Mágico debe probarse rigurosamente, ya que un fallo aquí impediría que las métricas visuales del dashboard web de SantiagoCordova reciban la información del mes.

---

## 5. El Repositorio Web (`santiagocordova-main`)

- Es una app moderna usando **Next.js / Vite**, React, TypeScript estricto, y Supabase.
- Asegúrate de exportar interfaces `.ts` (ej. `Client`, `TaxDeclaration`) de manera uniforme si creas nuevos componentes visuales de métricas.
- Todo diseño web debe verse "Premium", moderno y fluido (ver reglas base del prompt).

---

## 5b. Biblia de Pantallas y del Formulario de IVA (evidencia real del portal)

- `extenciones web/_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md`: catálogo de capturas reales del SRI que respalda la Matriz Tatuada de abajo.
- `extenciones web/_EVIDENCIA_SRI/BIBLIA_FORMULARIO_IVA_2011.md`: **especificación canónica del Formulario 2011** (todas las casillas de Ventas 401-499, Compras 500-565, Resumen 601-699, Retenciones 721-801, Totales 859-902, fórmulas oficiales, IDs DOM `conceptoNNN` y reglas de llenado).

**Regla**: si un selector de la §6 no tiene entrada en la Biblia, es una
suposición, no un hecho — trátalo como frágil y no construyas lógica de envío
sobre él. Cuando llegue evidencia nueva, agregá la entrada antes de tocar código.

Las capturas llevan datos de contribuyentes reales (RUC, nombre, email,
teléfono): están excluidas por `.gitignore`; solo se versiona el índice `.md`.
Los PDFs se convierten con `node _extraer_pdf.js <archivo.pdf> capturas/`.

---

## 6. Matriz Tatuada de Selectores, IDs y Rutas Inmutables del SRI

> **REGLA DE TATUAJE PERMANENTE:** Esta sección está fijada en la memoria permanente del sistema. NINGUNA IA debe borrar, ignorar o alterar estos identificadores y selectores oficiales del SRI.

### A. Rutas Canónicas Directas (URLs y Puentes Oficiales)
* **Puente SSO a Comprobantes Electrónicos Recibidos:**
  ```javascript
  const SRI_PUENTE_RECIBIDOS = 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=57&idGrupo=55';
  ```
  *(CONFIRMADO 03-sep-2026: Genera token automáticamente y transfiere la sesión de Angular a JSF).*
* **URL Directa de Comprobantes Recibidos:**
  ```javascript
  const SRI_RECIBIDOS_URL = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf?&contextoMPT=https://srienlinea.sri.gob.ec/tuportal-internet&pathMPT=Facturaci%F3n%20Electr%F3nica&actualMPT=Comprobantes%20electr%F3nicos%20recibidos%20&linkMPT=%2Fcomprobantes-electronicos-internet%2Fpages%2Fconsultas%2Frecibidos%2FcomprobantesRecibidos.jsf%3F&esFavorito=S';
  ```
* **Puente SSO a Wizard de Formulario IVA (2011):**
  ```javascript
  const SRI_PUENTE_FORMULARIO_IVA = 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=310&idGrupo=201';
  ```
  *(CONFIRMADO 03-sep-2026: Transfiere la sesión hacia el wizard de recepción de declaraciones).*
* **Menú de declaraciones (índice de tarjetas):**
  `https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones`
  *(CONFIRMADO 03-sep-2026 — Biblia entrada 06)*
* **Wizard de recepción (Formulario IVA 2011):**
  ```javascript
  const SRI_FORMULARIO_IVA_URL = 'https://srienlinea.sri.gob.ec/sri-declaraciones-web-internet/pages/recepcion/recibirDeclaracion.jsf?identificadorGrupoObligacion=IVA';
  ```
  *(CONFIRMADO 03-sep-2026 — Biblia entradas 07 a 12).*
  El wizard **no cambia de URL entre sus 4 pasos** (Período Fiscal → Preguntas → Formulario → Pago): no intentes distinguir el paso por la URL.
* **Perfil del Contribuyente (Auditoría de Obligaciones):**
  `https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/perfil`
* **Cierre de Sesión Limpio:**
  `https://srienlinea.sri.gob.ec/sri-declaraciones-web-internet/pages/salir.jsp`
  `https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/logout`

### B. IDs de Comprobantes Recibidos (`comprobantesRecibidos.jsf`)
| Campo | ID en el DOM | Selector / Estrategia |
| :--- | :--- | :--- |
| **Año** | `frmPrincipal:ano` | `document.getElementById('frmPrincipal:ano')` |
| **Mes** | `frmPrincipal:mes` | `document.getElementById('frmPrincipal:mes')` |
| **Día** | `frmPrincipal:dia` | `document.getElementById('frmPrincipal:dia')` (Valor '0' = TODOS) |
| **Tipo Comprobante** | `frmPrincipal:cmbTipoComprobante` | `option value="1"` = Factura, `value="6"` = Retención, `value="3"` = NC |
| **Botón Consultar** | `frmPrincipal:btnConsultarSinRe` | `document.getElementById('frmPrincipal:btnConsultarSinRe')` |
| **Tabla de Facturas** | `frmPrincipal:tablaCompRecibidos` | `document.getElementById('frmPrincipal:tablaCompRecibidos')` |
| **Paginador** | `frmPrincipal:tablaCompRecibidos_paginator_bottom` | Paginador PrimeFaces (`.ui-paginator-next`, selector `25, 50, 75`) |

### C. IDs del Wizard, Formulario y Cierre Mágico de IVA (`recibirDeclaracion.jsf`)
| Elemento | ID en el DOM | Selector / Estrategia |
| :--- | :--- | :--- |
| **Obligación IVA (Paso 1)** | `frmFlujoDeclaracion:somObligacion_1` | `data-label="2011 DECLARACION DE IVA"` |
| **Período (calendario Paso 1)** | `frmFlujoDeclaracion:calPeriodo` | `data-p-pattern="mm/yy"` (ej: `08/2026`) |
| **Siguiente (Paso 1 a 2)** | `frmFlujoDeclaracion:btnObligacionSiguiente` | Botón PrimeFaces AJAX |
| **Saltar Preguntas (Paso 2)** | `frmFlujoDeclaracion:clkFormularioCompleto` | `<a class="ui-commandlink">` "Ver formulario completo" |
| **Siguiente Formulario (Paso 3)** | `frmFlujoDeclaracion:btnFormularioSiguiente` | Botón "Siguiente" antes del resumen |
| **Casillero 401 (Ventas 15%)** | `concepto401` | Input casillero 401 |
| **Casillero 411 (Ventas Netas 15%)** | `concepto411` | Input casillero 411 |
| **Casillero 500 (Compras Brutas 15%)** | `concepto500` | Input casillero 500 |
| **Casillero 502 (sin derecho a crédito)** | *id sin confirmar — el casillero EXISTE* | Otras adquisiciones tarifa ≠ 0 SIN crédito tributario · ver §9 |
| **Casillero 512 (NC del 502)** | *id sin confirmar — EXISTE* | Menos notas de crédito del 502 |
| **Casillero 540 (compras 5%)** | `concepto1271` — **CONFIRMADO 07-sep-2026** (se escribió en él) | Adquisiciones locales gravadas 5% con crédito · ver §9 |
| **Casillero 508 (notas de venta)** | `concepto1735` — **CONFIRMADO 07-sep-2026** | Valor de las notas de venta recibidas |
| **Casillero 117 (cantidad NV)** | `concepto258` — **CONFIRMADO 07-sep-2026** | Cantidad de notas de venta |
| **Casillero 550 (NC del 540)** | `concepto1281` — **CONFIRMADO 07-sep-2026** (escrito en dos contribuyentes) | Menos notas de crédito del 540 |
| **Casillero 518 (NC de notas de venta)** | `concepto1740` — **CONFIRMADO 07-sep-2026** | Neto de notas de venta (508 menos NC) |
| **Casillero 203 (decreto de tarifa reducida)** | `concepto91` — **CONFIRMADO 07-sep-2026** (📐, único `<select>` del formulario) | 17 opciones, **todas del 8%** · ver §9d |
| **Casillero 560 (IVA generado del 540)** | *id sin confirmar — EXISTE* | Impuesto generado de las compras al 5% |
| **Casillero 510 (Compras Netas 15%)** | `concepto510` | Input casillero 510 |
| **Casillero 601 (Impuesto Causado)** | `concepto601` | Lectura de impuesto causado |
| **Casillero 609 (Retenciones IVA)** | `concepto609` | Input retenciones IVA del mes |
| **Casilleros Sugeridos** | `615`, `617`, `564`, `565` | Clases `.sugerido` (respetar `0.00` oficial) |
| **Total a pagar (TOTALES)** | `concepto2610` | Input readonly dentro del formulario |
| **Modal Advertencias** | `dlgConfirmacionEnvioFormulario` | Diálogo PrimeFaces "¿Desea continuar?" |
| **Aceptar Advertencias (Diálogo)** | `frmFlujoDeclaracion:j_idt947` | Botón verde "Aceptar" del diálogo |
| **Total a pagar (Resumen Paso 4)** | `frmFlujoDeclaracion:totalAPagar` | `<span>` con texto **`USD 0.00`** — CONFIRMADO 03-sep-2026 |
| **Botón Enviar Declaración (Resumen)** | `frmFlujoDeclaracion:divBotonContinuarConfirmacion` | Botón verde con texto **"Aceptar"** |
| **Contenedor Éxito / Confirmación** | `#panelSinValorAPagar` | Contenedor oficial de declaración procesada |
| **Botón Imprimir Comprobante** | `frmFlujoDeclaracion:btnDescargarComprobante` | Botón verde flat con texto **"Imprimir"** |
| **Botón Nueva Declaración** | `frmFlujoDeclaracion:btnSinValorPagarNuevaDeclaracion` | Botón con texto "Nueva declaración" |

> ⚠️ **El saldo viene como `USD 0.00`, no como `0.00`.** Nunca uses `parseDecimal()`
> para decidir un envío: devuelve `0` tanto para "cero" como para "no pude leer".
> Para eso está `parseImporteEstricto()`, que devuelve `null` cuando no hay número.


---

## 7. La base de proveedores — la pieza que falta

> **Estado (06-sep-2026)**: el cimiento está construido y probado. Falta el
> mapa CIIU → deducible, que es criterio contable, y el casillero donde va lo
> no deducible (§9a).

### Lo que ya funciona

`Proveedores` en `02_servicios_y_memoria.js`, con la marca `sc_proveedores`.

**Se aprende mirando, sin preguntarle nada a nadie.** Cada factura y cada nota
de crédito que pasa por el bot deja anotado a su proveedor, desde las tres
bocas por donde entran:

- el TXT de recibidos — la mejor fuente: da RUC y razón social **separados**;
- la tabla del portal — los da pegados en una celda, y se parten;
- las notas de crédito, que las emite el mismo proveedor.

Las **retenciones no entran**: las emite el cliente que te retuvo, no un
proveedor.

| Método | Qué hace |
| :--- | :--- |
| `registrarLote(lista, clienteRuc)` | anota o actualiza, una sola escritura |
| `saber(ruc)` | lo que se sabe, o `null` |
| `clasificar(ruc, {actividad, deducible, origen})` | ver la regla de abajo |
| `pendientes(tope)` | los que faltan, **los más frecuentes primero** |
| `resumen()` · `exportar()` | conteos · TSV para revisar afuera |

El orden de `pendientes()` no es cosmético: clasificar el proveedor que aparece
en 200 facturas rinde doscientas veces más que el que aparece en una. Con 500
contribuyentes, esa diferencia es la que hace que la base se llene sola en vez
de nunca.

**La regla del `origen`, probada:** una sugerencia —`catastro`, `sugerido`,
`ia`— **nunca pisa** una decisión con `origen: 'usuario'`. Sólo el contador
puede cambiar lo que decidió el contador. Es la misma regla de todo el
proyecto: nunca presentar como dato lo que es una suposición.

El botón **🏷️** del HUD muestra el resumen, los pendientes ordenados, y deja
marcar cada uno como deducible o no. En el DOM del SRI va **sólo el RUC del
proveedor** — ni el nombre del cliente, ni nada más. Los RUC de los clientes del
estudio tampoco salen en la exportación: es con quién opera cada uno.

Banco: `tests/proveedores.html` (31 comprobaciones, verdes el 06-sep-2026).

### La base es de tres proyectos, no de uno

> **Anotado el 06-sep-2026 a pedido del usuario.** La base de proveedores y el
> catastro **se guardan también para un proyecto aparte: la selección de IVA
> por tipo para la devolución de tercera edad.**

Es la misma pregunta hecha tres veces, y el dato es uno solo:

| Quién pregunta | Qué necesita saber del RUC |
| :--- | :--- |
| **Nueva Luz** (IVA) | ¿la compra es deducible o no? → 500/510 vs 502/512 |
| **Anexo de Gastos Personales** | ¿vivienda, salud, educación, alimentación, vestimenta o turismo? |
| **Devolución de IVA · tercera edad** | ¿esta compra califica para la devolución? |

Por eso `Proveedores` guarda `actividad` y `ciiu` **además** de `deducible`, y
por eso `exportar()` los saca en TSV: la base no es de la extensión de IVA, es
del estudio. Cuando se arme el proyecto de tercera edad, la parte cara —saber a
qué se dedica cada RUC— ya va a estar hecha y confirmada por el contador.

### La cascada, construida el 06-sep-2026

```
1. lo que decidió el contador   → MANDA      gratis, instantáneo
2. el catastro del SRI (CIIU)   → sugiere    gratis, en disco
3. la IA                        → sugiere    cuesta y sale de casa
```

`Proveedores.sugerirDesdeIA()` pregunta **sólo por los que llegaron hasta ahí
sin categoría**, los más frecuentes primero. Lo que confirme se guarda: al mes
siguiente ese proveedor no cuesta nada. Con 500 contribuyentes los proveedores
se repiten muchísimo, así que el gasto tiende a cero solo.

**Qué sale de la máquina, y nada más:** el nombre del proveedor y su actividad
pública del catastro. **No** sale el RUC del proveedor, **no** sale el RUC del
cliente, **no** salen importes. Quien responde no puede armar el mapa comercial
del estudio — que es exactamente por lo que se descartó la extensión de
terceros. Probado en `tests/proveedores.html`.

Sale por el **service worker**, no por el content script: la clave no tiene por
qué estar dentro de la página del SRI, y un fetch cross-origin del content
script está sujeto a CORS (la misma lección que la subida a R2).

Categorías: las seis del anexo de gastos personales más `ninguna`. **`ninguna`
es «no sé» y no se guarda** — una respuesta honesta no se convierte en dato.
Una categoría que no esté en la lista se normaliza a `ninguna`: la IA no puede
inventar categorías nuevas.

La IA **nunca dice si algo es deducible**. Igual que el catastro: dice a qué se
dedica el proveedor; si esa compra concreta da crédito tributario depende del
gasto y lo decide el contador.

### Lo que falta

- El **mapa CIIU → deducible**: criterio contable, lo pone el contador. Y no
  es sólo el CIIU del proveedor: son **tres** datos juntos (§9b).
- El **casillero** donde va lo no deducible (502/512) — sin confirmar (§9a).
- El interruptor **preguntar / seguir** para los desconocidos. Hoy rige el modo
  por defecto de hecho: un proveedor sin clasificar va donde va hoy y queda en
  la lista, **nunca al 502 por las dudas**.

> 🧭 Esto está resumido, con el estado de cada pieza, en el tablero de la
> **§0b.1**. Si vas a retomar el laboratorio de proveedores, empezá por ahí.

---

### El diseño original, para no perderlo

### El problema, dicho una vez

Hoy el bot toma **todas** las facturas de compras recibidas y las mete al
formulario como un solo bloque. Pero la declaración no las trata igual: separa
lo deducible de lo no deducible según **la actividad del proveedor**. Esa
distinción hoy no se hace, y el bot no tiene con qué hacerla.

Lo que falta no es lógica: es **saber a qué se dedica cada RUC**.

### La misma pregunta, tres veces

El dato es uno solo y hoy cada extensión lo resuelve por su cuenta:

| Quién pregunta | Qué necesita saber del RUC |
| :--- | :--- |
| **Nueva Luz** (IVA) | ¿la compra es deducible o no? |
| **Anexo de Gastos Personales** | ¿vivienda, salud, educación, alimentación, vestimenta o turismo? |
| **Devolución de IVA · tercera edad** | ¿esta compra califica? |

`03_Anexo_Gastos_Personales/content.js` ya tiene las seis categorías del SRI
(`vivienda`, `salud`, `educacionArteCultura`, `alimentacion`, `vestimenta`,
`turismo`). Lo que no tiene —ni él ni Nueva Luz— es memoria: cada corrida
vuelve a empezar de cero.

### Cómo debería funcionar

**Se aprende una vez y sirve para siempre.** Cada RUC que aparece en una
factura se guarda con su nombre. La primera vez que se lo ve, se pregunta a qué
se dedica. Desde ahí, todas las extensiones lo saben.

    proveedores: {
      "0990123456001": {
        nombre: "COMERCIAL XYZ S.A.",
        actividad: "alimentacion",      // categoría del anexo
        deducible: true,                // para el IVA
        vistoEn: ["0703891838001", …],  // qué clientes le compran
        cuando: 1788646356641,
        origen: "usuario" | "sugerido"  // quién lo decidió
      }
    }

**El `origen` no es decoración.** Es la misma regla que ya rige todo el
proyecto: nunca presentar como dato lo que es una suposición. Una clasificación
`sugerido` —adivinada por el nombre, por ejemplo «FARMACIA» → salud— se muestra
distinta de una que confirmó el contador, y nunca decide sola sobre plata.

**Los que no se conocen**: un interruptor decide qué pasa.

- **Preguntar** — el lote frena y muestra los RUC nuevos para clasificar.
- **Seguir** — se declaran como hasta ahora y quedan en una lista de pendientes
  para revisar después.

Lo segundo es el modo por defecto: un lote de 27 clientes no puede quedarse
esperando a que alguien conteste. Vale la misma lección del `confirm()` que
bloqueaba la automatización.

### Por qué vale la pena

Un proveedor clasificado una vez sirve para **todos** los clientes que le
compren. Un estudio con 27 contribuyentes comparte buena parte de sus
proveedores: la base se llena sola en los primeros meses y después casi no hay
que tocarla.

### Pendiente de tu lado

- El **número de casillero** donde van las compras no deducibles.
- El **casillero de cantidad** de comprobantes de esa categoría.

Sin esos dos, la clasificación se puede guardar pero no se puede declarar.

---

## 8. Pendientes anotados

### 8a. Los tipos de comprobante que faltan

`frmPrincipal:cmbTipoComprobante` solo tiene tres valores confirmados en la
Biblia: `1` (Factura), `3` (Nota de Crédito), `6` (Retención). Faltan **nota de
débito** y **liquidación de compra**, entre otros.

**No inventar los códigos.** Se leen del portal, estando en Comprobantes
Recibidos:

```js
[...document.getElementById('frmPrincipal:cmbTipoComprobante').options]
    .map(o => o.value + ' = ' + o.text).join('\n')
```

Con esa salida se agregan al barrido: el extractor de facturas ya sirve para
todos los tipos, solo hay que decirle cuáles pedir.

#### El criterio contable, dicho por el usuario (09-sep-2026) — pendiente de validar en pantalla

> Anotado como **propuesta**, no como hecho. El usuario describió el manejo de
> los tipos que faltan, pero la numeración que trajo **no coincide** con la
> Biblia del Formulario 2011 (ver la advertencia abajo). Hasta validar con el
> 📐 en el formulario real, esto es criterio anotado, **no** campo a cablear.

**Liquidaciones de compra** (bienes y servicios):
- Las emite el propio comprador para respaldar compras a personas que no pueden
  facturar (rusticidad, no residentes/extranjeros).
- Sustentan **crédito tributario** de IVA (personas obligadas a llevar
  contabilidad y sociedades) **solo si se retuvo y depositó el 100% del IVA**.
- Se registran en los casilleros de compras locales según tarifa e intención.
- La retención ejercida se reporta aparte (Formulario 103 / sección de
  retenciones) — y en el 2011, el contador de liquidaciones es el **casillero
  119** (la Biblia ya tiene su DOM: `concepto260`).

**Notas de crédito recibidas**:
- Reducen base imponible E IVA de compras en el período en que se reciben.
- Neto = Bruto − NC (el bot ya resta NC del 510/517/550).
- Hay casilleros para excedentes de NC por compensar en el mes siguiente
  (la Biblia: 543 NC 0% · 544/554 NC 15% — hoy el bot no los usa).

**Notas de débito recibidas**:
- Incrementan la base imponible y el IVA de las compras (intereses de mora,
  costos/gastos posteriores a la factura).
- Se suman al **valor bruto** del tipo de compra correspondiente del período en
  que se reciben. **Nunca se barrió una ND**: es el tipo que falta construir.

> ⚠️ **Advertencia de numeración (09-sep-2026).** El usuario describió la
> sección compras con **501/511/521 como corriente 15% con derecho**, **502 como
> activo fijo**, y **553/554 como proporcionalidad/crédito**. La Biblia del 2011
> —armada con capturas reales y escrituras exitosas— dice **500/510/520**
> corriente, **501/511/521** activo fijo, **502/512/522** sin derecho, y
> **563/564/565** proporcionalidad/crédito. Puede ser el Formulario 104
> histórico contra el 2011 del wizard, o un error de la Biblia. **No se resuelve
> discutiendo: se resuelve con el 📐 sobre la fila real** (ver §9d / §0b.5).

### 8b. Notas de venta — casilleros 508 y 117

Son comprobantes **físicos**: nunca aparecen en «comprobantes electrónicos
recibidos» y el bot no tiene de dónde sacarlos. El dato solo lo tiene el
contador.

| Casillero | Qué es |
| :--- | :--- |
| **508** | Adquisiciones a contribuyentes RISE (hasta dic-2021) / NEGOCIOS POPULARES (desde ene-2022) |
| **518** | El **neto** del 508: menos las notas de crédito |
| **117** | Total de notas de venta recibidas (cantidad) |

> **El 518 se agregó el 07-sep-2026**, avisado por el usuario: «508 son las
> notas de venta física pero 518 es menos las notas de crédito, y estamos
> poniendo 0». Quedaba **vacío con el 508 lleno** — el mismo error que el 550,
> y el que importa: el crédito tributario sale del neto, no del bruto.
>
> El panel pide las notas de crédito como un tercer campo, **vacío por
> defecto**: la mayoría de las veces no hay, y ahí el 518 vale lo mismo que el
> 508. Si no sale por número, se lo busca como vecino de fila del 508.

**Construido el 06-sep-2026.** `NotasDeVenta` en `02_servicios_y_memoria.js`,
interruptor **📒** en el cajón 🧰 — **encendido por defecto** desde esa misma
fecha, a pedido del usuario.

> Nació apagado por miedo a trabar un lote de 27. Ese miedo ya lo resuelven
> otras dos piezas: la pregunta **se resuelve sola por temporizador** (un
> silencio vale `null` y no escribe nada) y **tres períodos en cero** la apagan
> para ese contribuyente. Apagado, el 508 y el 117 no se declaraban nunca y
> nadie se enteraba. `NotasDeVenta.ARRANCA_ENCENDIDO` es el interruptor de
> fábrica; lo que el usuario elija con 📒 lo pisa.

Cuando está encendido, el **paso 1.2** de `llenarCompras()` —apenas se abre la
sección COMPRAS, no al final del llenado— pide los dos números en un panel del
HUD, con temporizador visible. Si nadie contesta, la promesa se resuelve sola
con `null` y el lote sigue. El paso 3.5 sólo **escribe** lo que se preguntó,
en el orden en que el formulario lista los casilleros.

> **Movido el 06-sep-2026 a pedido del usuario**: «tampoco vi la sugerencia a
> entrar valores y cantidades de doc físicos notas de venta, eso desde que
> formulario sección compras, no al último». Preguntar con todo ya lleno era
> preguntar tarde.
>
> Y cuando **no** se pregunta, ahora se dice por qué —el interruptor 📒 está
> apagado, o el cliente lleva tres períodos en cero—. Una ausencia callada es
> indistinguible de una falla, y fue exactamente lo que pasó.

> **Los campos arrancan vacíos para CADA contribuyente.** Sin
> `autocomplete="off"` el navegador ofrecía lo tecleado para el cliente
> anterior —el `id` es el mismo en todos— y un número de otro aceptado sin
> querer es una declaración mal hecha. Avisado por el usuario el 07-sep-2026:
> «la sugerencia es para cada cliente, si no pone nada por defecto vacío».

> **`null` no es cero.** Un silencio significa «no sé» y **no se escribe nada**
> en el 508 ni en el 117. Un cero inventado ahí es una declaración mal hecha.
> El botón «No tiene» sí es una respuesta: se guarda como 0/0.

Nunca un `confirm()`: un diálogo del navegador congela la página y el lote
entero se queda ahí. Vale la misma lección del cuadro que bloqueaba la
automatización.

**Tres períodos seguidos en cero y se deja de preguntarle a ese cliente**
(`noUsa`). Con 500 contribuyentes, seguir preguntándole al que nunca usa notas
de venta es justo lo que haría inservible el interruptor. Un período con datos
lo despierta solo, y `volverAPreguntar(ruc)` lo despierta a mano.

**Los tres `id` quedaron confirmados el 07-sep-2026** — el bot escribió en
ellos: `508 → concepto1735`, `518 → concepto1740`, `117 → concepto258`. Están
en el `fieldMap` y en la Matriz de la §6.

Igual se conserva la búsqueda por número de casillero como respaldo: si hay
dato y el casillero no aparece, la plata **no** se manda a otro lado — se
anota en `iva_sin_ubicar` y el cierre mágico frena (§9a).

Banco: `tests/notasventa.html` (35 comprobaciones, verdes el 07-sep-2026).

### 8c. Cambio de clave por lote

Hay una traza de Burp (`cambio_de_clave_obligatorio_ID`) y una extensión propia
(`02_Cambio_Claves_SRI`). La regla acordada: **no aplastar por aplastar**. Vale
lo mismo que en el importador de CSV de Chrome — proponer los cambios, mostrar
a quién le pisa una clave que ya funcionaba, y aplicar solo lo confirmado.

---

## 9. Los casilleros de compras que faltan — y un hueco de tarifa

### 9a. Lo que se declara y lo que no

| Casillero | Qué es | ¿Se llena? |
| :--- | :--- | :---: |
| **500 / 510** | Compras 15% con derecho a crédito · menos NC | ✅ |
| **507 / 517** | Compras 0% · menos NC | ✅ |
| **540 / 550** | Adquisiciones locales (excluye activos fijos) gravadas con **tarifa 5%**, con derecho a crédito · menos NC | ✅ desde 05-sep-2026 |
| **502 / 512** | Otras adquisiciones y pagos gravados **tarifa distinta de cero, SIN derecho a crédito tributario** · menos NC | ❌ |

**El 502 es el casillero que faltaba** para separar deducible de no deducible.
Es el destino de las compras que la base de proveedores marque como sin
derecho a crédito.

#### El agujero del 5%, y por qué costaba plata

Hasta el 05-sep-2026 el corte de tarifas era **binario**: «tiene IVA» → 15%,
«no tiene» → 0%. Una compra al 5% caía entera en el 500.

No era solo un casillero mal puesto. El SRI calcula el **520** (impuesto
generado en compras) a partir del **510**, y de ahí sale el crédito
tributario: $1.000 al 5% declarados como 15% le daban al contribuyente $150 de
crédito donde le correspondían $50. **Pagaba de menos, con la firma del
contador.**

#### Cómo se resuelve — y qué NO resuelve

`clasificarTarifaIva(base, iva)` en `04_extraccion_datos.js` deduce la tarifa
por el cociente **IVA / base**. Tarifas reconocidas: `[5, 12, 13, 14, 15]`
(12% hasta marzo de 2024, 13% ese marzo, 15% desde abril).

Devuelve **tres** respuestas, no dos, y la tercera es `null` = «no sé»:

| Cociente | Resultado | Destino |
| :--- | :--- | :--- |
| ≈ 0 | tarifa `0` | 507 / 517 |
| ≈ 5% | tarifa `5` | **540 / 550** |
| ≈ 12/13/14/15% | tarifa plena | 500 / 510 |
| cualquier otro | `null` | 500/510 **y anotada para frenar** |

#### Las mezcladas son la REGLA, no la excepción — corregido el 06-sep-2026

Corrida real: de **42 facturas, 15 eran de tarifas mezcladas**, todas de
Corporación Favorita (Supermaxi) y Farcomed (Fybeca). En un supermercado se
compra comida (0%) y limpieza (15%) en el mismo ticket. **Tratarlas como «no
sé» dejaba al bot sin poder declarar a nadie.**

Y el reparto **no hay que adivinarlo: es aritmética.** Si la factura sólo tiene
ítems al 15% y al 0%, el IVA cobrado sólo pudo salir de la parte gravada:

```
base al 15%  =  IVA / 0.15
base al 0%   =  base total − base al 15%
```

`repartirMezclada(base, iva, plena)` lo calcula y **acepta el reparto sólo si
cabe**: la parte gravada no puede ser negativa ni mayor que el total. Si no
cabe, hay una tercera tarifa de por medio y ahí **sí** se frena.

Ejemplo real: base $61,00 con IVA $1,83 → **$12,20 al 15% + $48,80 al 0%**.
Antes se declaraban los $61 enteros al 15%, inflando el crédito tributario.

`TARIFA_PLENA = 15` (desde abril de 2024). Para períodos anteriores hay que
pasarle 12, 13 o 14: el reparto depende de ella.

**El cociente sigue sin distinguir una factura al 5% de una mezclada.** Una de
$100 con un tercio al 15% da 4,95% y se lee como **5%**. Está medido en el
banco, no supuesto. Eso sólo lo resuelve el XML (§11).

#### El agujero gemelo: una mezclada que cabe de dos maneras

> Cerrado el 06-sep-2026, después de que el usuario avisara que **el 5% es del
> sector construcción**.

`repartirMezclada()` supone que la mezcla es «tarifa plena + 0%». Es cierto en
un supermercado. Pero si quien emitió también factura al 5%, la misma factura
admite dos cuentas, y las dos caben:

| base $61 · IVA $1,83 | gravado | al 0% |
| :--- | ---: | ---: |
| reparto 15% + 0% | **$12,20** | $48,80 |
| reparto 5% + 0% | **$36,60** | $24,40 |

El crédito tributario sale del 520, que se calcula sobre esa base: elegir mal
declara **tres veces más o tres veces menos**.

**El número no distingue los dos casos; quien emitió, sí.** Un supermercado no
puede facturar al 5%, y eso ya se sabe porque `registrarLote()` cuenta a qué
tarifa factura cada proveedor mirando sus comprobantes (§9b).

`calcularResumen(facturas, { rucsAl5 })` recibe el conjunto que da
`Proveedores.losQueFacturanAl5()` —pedido **después** de anotar, así un 5% que
aparezca en esta misma extracción ya cuenta para sus propias mezcladas—. Si el
emisor está en esa lista **y** el reparto al 5% también cabe, la factura queda
**ambigua** y el motivo dice las dos cuentas posibles. Si no está, se reparte
como siempre: el caso Supermaxi no puede volver a frenar un lote.

Banco: `tests/iva5.html`, sección Y.

No es un bug que haya que «arreglar»: rechazar todo lo que caiga en 5% frenaría
cada lote con compras legítimas al 5%. Es el límite del método, y la razón por
la que hace falta el XML (§11).

En plata el daño es chico —el crédito sale $5,00 donde correspondían $4,95—
pero las **bases** quedan mal repartidas, y eso sí se cruza contra el ATS. Por
eso:

- **El 8% de feriados queda AFUERA de la lista a propósito.** Existe, pero cae
  justo en la zona donde una mezclada produce ese cociente. Preferimos que una
  factura al 8% caiga en «no sé» y la mire el contador, antes que una mezclada
  se declare como si fuera de una sola tarifa.
- La holgura es en **plata**, no en puntos porcentuales:
  `max($0.02, base × 0.001)`. En una factura de $5 un centavo son 0,2 puntos.

Las notas de crédito son el caso fácil: el modal trae el `codigoPorcentaje`
del SRI, que es la tarifa **declarada por quien emitió**, no deducida
(`0`=0%, `2`=12%, `3`=14%, `4` y `10`=15%, **`5`=5%**, `6`=no objeto,
`7`=exento). Ahí no se adivina nada. Solo se deduce cuando el modal no abrió.

#### El freno

`anotarIvaSinUbicar()` / `frenarSiHayIvaSinUbicar()` en
`02_servicios_y_memoria.js`, con la marca `iva_sin_ubicar` en `SafeStorage`.
Se levanta cuando:

1. Hay plata al 5% y **no apareció el 540 o el 550** en el DOM, o
2. Alguna factura o NC quedó sin tarifa reconocible.

El cierre mágico no envía con la marca puesta: llena el formulario, lo deja en
pantalla y avisa cuáles son. **Y pasa al siguiente cliente**, anotando a éste
como `compras_sin_casillero`. Frenar el envío es lo correcto; frenar el lote
entero no — un cliente trabado no puede detener a los otros 499. **Repartir una factura mezclada es criterio
contable, no algo que el bot pueda deducir.** La marca se borra en los mismos
seis puntos donde ya se borraba `declaration_synced_flag` (arranque de
declaración, siguiente cliente, reset total) — si quedara pegada, el freno de
un cliente bloquearía al próximo.

> **CORREGIDO el 06-sep-2026: el 540 y el 550 SÍ están en el formulario.**
> Captura del usuario, con la fila resaltada:
>
> > «Adquisiciones y pagos locales (excluye activos fijos) gravados con tarifa
> > **5%** (con derecho a crédito tributario)» → **540** · **550** · **560**
>
> Y en la fila de abajo, también presentes: **502 · 512 · 522** («Otras
> adquisiciones y pagos gravados tarifa diferente de cero, **sin** derecho a
> crédito tributario»).
>
> Lo que decía esta nota antes —«NO aparecen»— salió de que el bot reportó
> `no se encontró el casillero 540` y se tomó ese reporte como si fuera la
> pantalla. **El formulario estaba bien; el buscador estaba mal.**
>
> Las cuatro XPath de `encontrarInputPorCasillero()` exigían que la casilla
> fuera el `<td>` **inmediatamente siguiente** al número, y el SRI mete una
> tabla dentro de cada celda: ahí se corta el parentesco. Desde el 06-sep-2026
> hay una quinta estrategia que **no mira el HTML sino la pantalla**: toma el
> primer input de texto que esté a la derecha del número y a su misma altura,
> abriendo el ámbito de a poco (fila anidada → fila real → tabla → documento).
> Probada contra la estructura anidada real en `tests/iva5.html`, sección Z.
>
> **Los `id` siguen sin confirmarse y no se cablean en el `fieldMap`.** La
> estrategia por altura los encuentra sin necesitarlos; cuando el 📐 devuelva
> los `id` reales, entran acá y al `fieldMap`, que es más rápido y más seguro.
> Si aun así no apareciera, la plata **no** se manda al 500 por las dudas: se
> anota y se frena.

### 9d. El casillero 203 — declarar al 5% obliga a decir con qué decreto

> Descubierto el 07-sep-2026, en la primera corrida en que el 540 y el 550 se
> llenaron de verdad. Sin el 550 nunca se había llegado tan lejos.

Llenar el 5% no alcanza. El portal **no deja pasar al resumen** y escribe en
`panelMensajes`:

> «Casillero 203. Seleccione el decreto que determina la tarifa reducida a
> aplicar.»
> «Casillero 203. El decreto seleccionado es incorrecto.»

#### ⚠️ CORRECCIÓN del 07-sep-2026: los decretos son del **8%**, no del 5%

Esta sección decía «el decreto que habilita el 5%». **Era una suposición mía, y
la evidencia dice otra cosa.** El 📐 leyó el desplegable real:

```
🔽 concepto91 · 17 opciones
   [0]  Seleccione el decreto que aplique   ← elegida
   [1]  Decreto ejecutivo 339 (8%)
   [2]  Decreto ejecutivo 644 (8%)
   [3]  Decreto ejecutivo 190 (8%)
   … y así las dieciséis, TODAS con (8%)
```

**Ninguna dice 5%.** El 8% es la tarifa reducida de los **feriados** (los
decretos de descuento de IVA por turismo). Así que el 203 no es «el decreto
del 5%»: es el decreto de una tarifa reducida distinta.

Queda **sin resolver** por qué el portal lo exigió al cargar el 540. Dos
hipótesis, ninguna comprobada:

- que el 540 sea «tarifa reducida» en general y el porcentaje lo fije el
  decreto — en cuyo caso el rótulo «5%» de la captura y estos decretos son la
  misma fila y falta entender cómo se relacionan;
- o que el portal valide el 203 apenas hay algo en esa fila, sea lo que sea.

**Hasta saberlo, el bot no elige ningún decreto.** Elegir el equivocado es
declarar mal, y acá ni siquiera está claro cuál correspondería.

#### Lo que SÍ quedó resuelto: por qué se disparó

**Por diez centavos.** De las 157 facturas de MIÑO GOMEZ, una decía
base $0.10 · IVA $0.02 — cociente 20%, que no es ninguna tarifa. El
clasificador la mandó al 540 y eso hizo que el portal exigiera el 203. Ver la
corrección de la holgura, abajo.

Sin ese centavo mal clasificado, MIÑO GOMEZ se declaraba normal.

#### El daño no era el campo que faltaba: era el motivo inventado

`ejecutarCierreMagico()` no llegaba al resumen, no encontraba el saldo, y
anotaba a los dos contribuyentes como **`saldo_a_pagar`** — con saldo $0.00.
Un motivo equivocado manda al contador a buscar plata que no existe, y el campo
que falta sigue faltando.

`loQuePideElFormulario()` en `02_servicios_y_memoria.js` lee `panelMensajes`,
descarta los informativos del 625 (que el flujo ya saltea) y devuelve los
reclamos con sus palabras más los números de casillero que nombran. El cierre
lo consulta **antes** que al saldo: si el formulario reclama algo, esa es la
causa y todo lo demás es ruido. El motivo de omisión pasó a ser
**`formulario_incompleto`**, que dice qué abrir y qué elegir.

#### El agujero de la holgura — al 5% no se llega por centavos

`clasificarTarifaIva()` tenía un `for` que devolvía **la primera tarifa dentro
de la holgura**, y `TARIFAS_IVA` empieza por el 5. La holgura es
`max($0.02, base × 0.001)`; con base $0.10 eso es el **20% de la base**, así
que las cinco tarifas caían dentro y ganaba siempre el 5%:

```
 5% -> IVA sería $0.0050  dif $0.0150  ✓ cae dentro
12% -> IVA sería $0.0120  dif $0.0080  ✓ cae dentro
13% -> IVA sería $0.0130  dif $0.0070  ✓ cae dentro
14% -> IVA sería $0.0140  dif $0.0060  ✓ cae dentro
15% -> IVA sería $0.0150  dif $0.0050  ✓ cae dentro
```

Tres reglas nuevas:

1. **La más cercana**, no la primera del array.
2. **Al 5% no se llega por holgura.** Es la tarifa con consecuencias —
   casillero propio, decreto obligatorio, freno del envío— así que se exige
   que el cociente esté a menos de un punto del 5%, no que quepa por centavos.
3. Cuando el monto es tan chico que el redondeo hace ambiguas varias tarifas
   (base < $1), va a la más cercana **y se dice que fue una aproximación**.
   Frenar un lote de 500 por diez centavos es desproporcionado: esa plata no
   mueve ninguna aguja. Con una base grande y un cociente imposible sigue
   siendo `null`, porque ahí sí hay que mirarlo.

Banco: `tests/iva5.html`, sección Q — con la factura real que lo destapó y con
los dos 5% legítimos de REYES MARQUEZ, para que el arreglo no rompa el caso que
hizo falta construir todo esto.

**Pendiente**: entender la relación entre el 540 y el 203. Hace falta ver la
pantalla del formulario con la fila del 540 y la del 203 juntas.

Banco: `tests/iva5.html`, sección Ñ.

#### Cómo se sale de la duda: el botón 📐

En el HUD, entre 📜 y 🗔. **Siempre visible.** Abre un panel con
**todos** los casilleros que el formulario tiene de verdad —número, `id` real,
rótulo y si es editable—, resalta los del 5% y los del 502/512, y tiene un
botón que copia la tabla en Markdown lista para pegar en la Biblia.

Es un botón y no un comando de consola a propósito: **Chrome bloquea el pegado
en la consola** (la protección contra self-XSS, que pide escribir `allow
pasting`), y un dato que sólo se saca escribiendo es un dato que no se saca.

> **No se esconde fuera del formulario.** Nació condicionado a
> `estaEnFormularioIva()` y el día que hizo falta no apareció — la detección es
> justo lo que puede fallar. Un botón que a veces no está es peor que uno que a
> veces abre un panel diciendo que no hay nada que leer. Misma lección que el
> `offsetParent` de los modales: no condicionar lo visible a una detección
> frágil. Si el portapapeles tampoco responde, el panel muestra el
texto ya seleccionado para un Ctrl+C.

Desde la consola sigue estando como `sriMapaCasilleros({ desde, hasta })`.

> ⚠️ **No envolver estas funciones en `window.<mismo nombre>`.** El bundle es
> una concatenación sin IIFE, así que toda función de nivel superior **ya es**
> `window.<nombre>`. Reasignarla con un envoltorio que la llama por su propio
> nombre se llama a sí mismo hasta reventar la pila. Pasó el 06-sep-2026 y lo
> cazó el banco, no la lectura. Un alias sólo vale si el nombre es distinto
> (`sriLeerXml`, `sriBajarXml`).

Con esa salida se cierran de una sola vez el 540/550, el 502/512 y el resto del
`fieldMap`. Es el único camino que no viola la §5b.

Banco de pruebas: `extenciones web/01_Nueva_Luz_3.0/tests/iva5.html`
(30 comprobaciones, todas en verde el 05-sep-2026). Se sirve con la
configuración `bancos-extension` de `.claude/launch.json`, que levanta la
carpeta de la extensión en `localhost:8791`; el banco queda en
`/tests/iva5.html`. Hace falta el servidor: los `file://` no ejecutan
scripts en el panel del navegador.

### 9b. Cómo decide qué va a cada uno

> **CORREGIDO el 06-sep-2026 por el usuario.** Lo que decía acá abajo estaba
> corto: hacía colgar el crédito tributario del proveedor solo, como si fuera
> una propiedad suya.

Sus palabras:

> «hay iva 5% que es de construcción y hay valores sin derecho tributario, o
> sea la herramienta tiene que saber de IVA porcentaje **y la actividad** para
> saber si es crédito tributario, además saber **la actividad del cliente**
> para que sea compatible»

El crédito tributario sale de **tres** cosas juntas, no de una:

| | Dato | De dónde sale |
| :--- | :--- | :--- |
| 1 | **La tarifa** de la compra | del cociente IVA/base, o del XML (§11) |
| 2 | **A qué se dedica el proveedor** | del catastro (§10a) |
| 3 | **A qué se dedica el cliente** | del catastro, por su propio RUC |

El tercero es el que faltaba, y es el que hace que la respuesta cambie: una
compra da crédito cuando **alimenta una actividad que a su vez está gravada**.
La misma factura da distinta respuesta para un constructor que para otro rubro.
Con `deducible` colgando sólo del RUC del proveedor, las dos daban lo mismo.

**El 5% es la tarifa del sector construcción** — dicho por el usuario, no leído
de la ley, y anotado como tal. Por eso una factura al 5% es justo la que hay
que mirar contra las actividades de los dos lados.

#### Lo que está construido (06-sep-2026)

- `Proveedores.registrarLote()` **cuenta a qué tarifa factura cada proveedor**,
  mirando cada comprobante. No hay que preguntárselo a nadie: está en la
  factura. Queda en `tarifas: { '15': n, '5': n, '0': n, '?': n }`.
- `Proveedores.porQueDecidir(rucProveedor, rucCliente)` junta los tres datos y
  devuelve los avisos que valen la pena. **No decide**: `credito` es `null`
  mientras nadie lo haya decidido, y `null` no es «no da crédito».
- El panel **🏷️** muestra arriba **a qué se dedica el cliente**, avisa cuando
  no se sabe, pone **los del 5% primero** y le cuelga a cada proveedor la chapa
  de las tarifas que se le vieron.

Banco: `tests/proveedores.html`, sección Z.

#### Lo que falta, y es criterio contable

El **mapa**: qué combinación de (tarifa · actividad del proveedor · actividad
del cliente) da crédito tributario y cuál no. Eso lo pone el contador; el bot
junta los datos y los muestra.

    factura recibida
        ├─ con derecho a crédito  → 500/510 (15%) · 540/550 (5%) · 507/517 (0%)
        └─ sin derecho a crédito  → 502/512

Y la misma regla de siempre: **si no se sabe, no se inventa.** Un proveedor sin
clasificar va donde va hoy, queda en la lista de pendientes, y no se lo manda
al 502 por las dudas — mandarlo ahí le quita al contribuyente un crédito que
quizá le corresponde.

---

## 10. Los datasets del SRI — https://www.sri.gob.ec/datasets

Consultada la página el 05-sep-2026. Hay más de lo que el proyecto está usando.

### Lo que sirve, en orden

**1 · Catastro RUC por provincia** — *ya se tiene el de El Oro*
ZIP con CSV, una descarga por provincia. Trae RUC, razón social y actividad
económica. Es la fuente de la base de proveedores de la §7. Viene con un
**Diccionario RUC** que documenta las columnas: leerlo antes de parsear.

**2 · Empresas fantasmas** — *pendiente, y NO está en el archivo que tenemos*

> ⚠️ **Corrección del 06-sep-2026.** Acá decía que el catastro provincial trae
> la clasificación de empresas fantasma. **No la trae.** Las 21 columnas del
> ZIP de El Oro están listadas abajo y ninguna es esa: la lista de fantasmas es
> un dataset aparte en sri.gob.ec. Queda pendiente bajarlo.

Cuando esté: si un cliente recibió una factura de una empresa marcada como
fantasma, esa compra no es deducible y el SRI la va a objetar. Un aviso **antes
de declarar** protege la firma del contador. Encaja con el resto de frenos del
proyecto: no impedir, avisar y dejar decidir.

Mientras tanto, el **estado del contribuyente** sí está y ya se usa: un
proveedor SUSPENDIDO o PASIVO que sigue emitiendo es la misma señal, más
débil pero real. Ver §10a.

**3 · Agentes de retención**
También en el catastro. Dice si un proveedor debía retener, lo que se cruza
con las retenciones que efectivamente aparecen.

**4 · Contribuyentes activos**
Un proveedor dado de baja que sigue emitiendo es una señal de alerta.

**5 · Ventas-compras (F104) por tarifa, provincia y actividad**
Datos agregados, no por RUC. No sirve para clasificar, pero sí para comparar:
un cliente cuyas compras se desvían mucho del promedio de su actividad y
provincia es un caso a revisar antes de presentar.

### 10a. El catastro, adentro de la extensión — hecho el 06-sep-2026

Las **21 columnas** del ZIP de El Oro:

```
NUMERO_RUC · RAZON_SOCIAL · CODIGO_JURISDICCION · ESTADO_CONTRIBUYENTE
CLASE_CONTRIBUYENTE · FECHA_INICIO_ACTIVIDADES · FECHA_ACTUALIZACION
FECHA_SUSPENSION_DEFINITIVA · FECHA_REINICIO_ACTIVIDADES · OBLIGADO
TIPO_CONTRIBUYENTE · NUMERO_ESTABLECIMIENTO · NOMBRE_FANTASIA_COMERCIAL
ESTADO_ESTABLECIMIENTO · DESCRIPCION_PROVINCIA_EST · DESCRIPCION_CANTON_EST
DESCRIPCION_PARROQUIA_EST · CODIGO_CIIU · ACTIVIDAD_ECONOMICA
AGENTE_RETENCION · ESPECIAL
```

`tools/construir_catastro.py` lo reduce a dos archivos en `vendor/`:

| Archivo | Qué es | Peso |
| :--- | :--- | ---: |
| `catastro_eloro.txt` | 283.879 RUC, **ancho fijo y ordenado**: RUC(13) + CIIU(7) + estado(1) + agente(1) | 6,2 MB |
| `ciiu.json` | los 1.302 códigos CIIU presentes → su descripción | 0,23 MB |

**No se guarda la razón social**: ya la da el portal en cada factura, y
duplicaría el archivo sin agregar nada. Una fila por RUC, la de la matriz
(establecimiento `001`).

`Catastro` en `02_servicios_y_memoria.js` lo trae **bajo demanda**, igual que
jsPDF — 166 ms medidos. Y **no arma un Map de 283.000 entradas**: el archivo
viene ordenado y de ancho fijo, así que busca por bisección sobre el texto,
~18 comparaciones por consulta y sin inflar el heap del content script.

`Proveedores.sugerirDesdeCatastro()` completa la **actividad** de cada
proveedor pendiente, con `origen: 'catastro'`.

> **Sólo la actividad.** El catastro dice a qué se dedica un RUC; **no** dice si
> esa compra es deducible — eso depende del gasto y lo decide el contador.
> Poner `deducible` desde acá sería inventar un dato. Y por la regla de la §7,
> nada de esto pisa lo que el contador ya haya decidido.

El **estado** sí se usa como aviso: un proveedor SUSPENDIDO o PASIVO que sigue
emitiendo aparece con bandera roja en el panel 🏷️. No impide nada; avisa.

Estados en El Oro: ACTIVO 161.808 · SUSPENDIDO 148.867 · PASIVO 31.343.

Banco: `tests/catastro.html` (31 comprobaciones, verdes el 06-sep-2026). Usa
RUC reales de los **bordes** de la lista, que es donde una bisección mal
escrita se equivoca.

### Cómo se usa un archivo de un GB

No entero. Para clasificar solo hacen falta **dos columnas**: RUC y actividad.

    catastro provincial      ~1 GB   (todas las columnas)
        ↓ reducir una vez, leyendo en streaming
    RUC + código de actividad  ~7 MB
        ↓ gzip
                              ~1-2 MB

Ese tamaño entra como recurso de la extensión cargado **bajo demanda**, el
mismo patrón que ya usa `jsPDF` (355 KB en `vendor/`, fuera del bundle, traído
por `ensureJsPdfLoaded()` solo cuando hace falta). Nunca dentro de
`build/content.js`, que se inyecta en cada página del SRI.

### Lo que el archivo no cubre

Los contribuyentes **nuevos**, y los de **otras provincias**. Para esos queda
el interruptor de la §7: preguntar, o seguir y dejarlos pendientes.

El endpoint `movil-servicios/api/v1.0/contribuyente/{RUC}` podría cubrirlos,
pero está detrás de un WAF: probado el 05-sep-2026 desde curl con cabeceras
completas de Chrome y por `corsproxy.io`, las dos veces rechazado. Falta
probarlo desde un content script en el portal, con la sesión del usuario —
que es el único contexto donde tiene chance de pasar.

> ⚠️ **`corsproxy.io` dejó de ser gratuito.** `fetchSRIPublicData()` en
> `services/sri.ts` lo sigue usando y hoy devuelve HTTP 403
> (`keyless_legacy_url`). Todo lo que dependa de esa función —autocompletar al
> crear un cliente, validar un RUC— está fallando en producción.

### Sobre extensiones de terceros

Se evaluó una extensión de terceros que ofrece consultas gratis. Consulta
contra el servidor de su autor, o sea que ese tercero vería los RUC de los
proveedores de todos los clientes del estudio — con quién opera cada
contribuyente. Teniendo el catastro en disco propio, no hay motivo para mandar
eso afuera. Descartada.

---

## 9c. La barra flotante: qué se ve y qué no

Llegó a **diecisiete controles**. Diecisiete íconos sueltos encima del portal
no se leen: se tropiezan, y el que hay que apretar cuando algo va mal queda
perdido entre los demás.

**A la vista quedan los del lote** — arrancar/pausar (▶), paso a paso (🏃), el
estado, declarar al que está logueado (🎯), omitidos (⚠️), saltar (⏭️), cerrar
(🏁), el cajón (🧰) y **🛑 Detener**, que es el único rotulado con palabras.

**El resto vive en el cajón 🧰**, en su propia línea y **con el rótulo escrito
debajo** de cada ícono: Comprobantes · Registro · La cola · Bitácora ·
Proveedores · Notas de venta · Casilleros · Ir a… · **Chequeo** · Probar
subida · Panel.

### Los bancos de prueba, en una sola página

`tests/index.html` corre **los quince** en iframes y da un veredicto solo:
**546 comprobaciones, verdes el 07-sep-2026**, en poco más de un minuto.

Se sirven con la configuración `bancos-extension` de `.claude/launch.json`, que
levanta la carpeta de la extensión en `localhost:8791`; el índice queda en
`/tests/index.html`. **Hace falta el servidor**: los `file://` no ejecutan
scripts.

De a uno, no en paralelo: quince bancos a la vez se pisan el almacenamiento
simulado y el resultado dejaría de significar nada. Lee el `<pre id="out">` de
cada uno, así que un banco nuevo no necesita saber que esta página existe —
alcanza con agregarlo a la lista `BANCOS`.

| Banco | Qué cuida | ✓ |
| :--- | :--- | --: |
| `iva5` | el 5%, el XML, el 203, los desplegables, la holgura de centavos | 173 |
| `catastro` | la bisección, sobre todo en los bordes | 31 |
| `proveedores` | que una sugerencia no pise al contador | 58 |
| `notasventa` | que un silencio no se convierta en un cero | 35 |
| `chequeo` | que avise de lo que va a morder, y que lea lo que Supabase contesta | 56 |
| `esperas` | que se siga apenas el portal contesta | 20 |
| `subidas` | que «Failed to fetch» diga algo accionable | 27 |
| `clavevencida` | que se detecte antes de navegar, sin cambiar la clave | 19 |
| `claves` | que la pantalla nunca muestre el valor guardado | 28 |
| `resumen` | que «Pendiente por cubrir» le gane al total en cero | 15 |
| `rutas` | que con una cédula ajena no se baje la declaración de nadie | 14 |
| `login` | que el bot no se lea a sí mismo y crea que lo rechazaron | 11 |
| `bucles` | que una acción que da vueltas se corte, y un lote sano no | 15 |
| `periodo` | que agosto de 2026 no se archive como agosto de 2023 | 22 |
| `recuperar` | que el comprobante de lo ya declarado llegue a la mano | 22 |

> **Un banco nuevo por cada cosa que se rompió de verdad.** Ninguno de estos
> quince se escribió por completitud: cada uno cuida un fallo que ya llegó a
> pantalla y costó un lote. Si arreglás algo que salió de un log real, dejale
> su comprobación antes de cerrar.

### 🩺 El chequeo

`Chequeo.correr()` en `02_servicios_y_memoria.js`. Contesta «¿está todo listo
para correr el lote?» **antes** de arrancar, en vez de descubrirlo en el cliente
número doce.

Mira, todo de fuentes que ya existían: la versión · el portal · la cola · **la
marca `iva_sin_ubicar`** · los omitidos · si hay claves guardadas (sin
mostrarlas) · el catastro · los proveedores sin clasificar · el interruptor de
notas de venta · la subida, contra la red · y **la llave anon de Supabase,
también contra la red**.

> Esa última se agregó el 06-sep-2026 por un caso real: la llave estaba puesta
> y **revocada del lado de Supabase** —no vencida, vence en 2036—, así que toda
> la corrida perdió las métricas del panel. El bot declaró bien y guardó los
> comprobantes, que es justo lo que hace que el fallo pase desapercibido: nadie
> se enteró hasta leer el log, catorce contribuyentes después. Que una llave
> esté puesta no quiere decir que sirva; hay que preguntarle a Supabase.
>
> Un **401/403 es `problema`**; un 5xx o no llegar es `aviso`, porque puede ser
> pasajero y la declaración igual se hace. Y el informe **nunca** trae el valor
> de la llave: sólo si funciona y de dónde salió.
>
> **Y prueba LAS DOS.** El 07-sep-2026 la llave del código estaba sana —HTTP
> 200 comprobado— y la que el usuario había pegado en Ajustes daba 401. Como
> lo guardado pisa a lo del código, una llave de repuesto rota **tapó a la
> buena en silencio** y la corrida entera perdió las métricas.
>
> El consejo obvio —«buscá una llave nueva en Supabase»— era el que hacía
> perder media hora. La solución eran treinta segundos: **borrar la de
> Ajustes**. Por eso el chequeo prueba también la del código y, si esa
> funciona, lo dice y manda a borrar la otra.
>
> Vale como regla general: **una credencial de repuesto que no anda es peor
> que no tener repuesto.**

Tres estados y ninguno más — `ok`, `aviso`, `problema` — y **cada uno dice qué
hacer**: un diagnóstico que no dice qué hacer no sirve de nada. En el panel, lo
que muerde va arriba: nadie lee veinte líneas buscando la roja.

El que más veces va a salvar una tarde es `iva_sin_ubicar`: si quedó pegada de
una corrida anterior, el cierre mágico **no envía nada** y no es obvio por qué.

Banco: `tests/chequeo.html` (26 comprobaciones, verdes el 06-sep-2026).

Los botones **no se recrean: se mueven** con `appendChild` después de armar el
`innerHTML`. Así los handlers, que se enganchan buscando por id, siguen
funcionando sin tocarlos — y no hay dos copias del mismo botón dando vueltas.

`pintar()` esconde la **celda** entera cuando una herramienta no corresponde
(🧾 sin nadie logueado), no sólo el botón: si no, quedaba el rótulo huérfano
flotando debajo de nada.

---

## 10a. Dónde viven las claves

**Nunca en `shared_config.js`.** Ese archivo viaja dentro de la extensión y
está en el repositorio: una clave ahí es una clave publicada, y el historial de
git no se deshace. La de R2 se coló así y hay que rotarla igual.

Van en `chrome.storage.local`, que no se versiona ni se distribuye. Se cargan
desde la **página de Ajustes** (`options.html`, declarada como `options_ui` en
el manifest): clic derecho en el ícono → *Opciones*, desde `chrome://extensions`
→ *Detalles*, o con el botón **⚙️ Ajustes y claves** del popup.

No están en el popup a propósito: el popup es chico y se cierra solo al perder
el foco. Pegar una clave ahí es incómodo y fácil de perder.

La página tiene además un botón **🔌 Probar ahora** que corre el diagnóstico de
subida y muestra por qué falla cada camino, sin subir ningún comprobante real.

Llaves:

| Llave | Qué guarda | Quién la lee |
| :--- | :--- | :--- |
| `sc_r2_credenciales` | `R2_SECRET_ACCESS_KEY` | `credencialesR2()` en `background.js`, por encima de `shared_config.js` |
| `sc_ia_credenciales` | `apiKey` | la clasificación de proveedores (§7), cuando exista |

Reglas de la ventana, probadas en `tests/claves.html`:

- Los campos son `type="password"` y `autocomplete="off"`.
- **Nunca se muestra el valor guardado**: solo si hay uno, cuántos caracteres
  tiene y sus últimos seis. Alcanza para saber cuál está puesta y no alcanza
  para nada más.
- Un campo vacío significa «no la toques», no «borrala». Para borrar hay un
  botón que lo dice.
- Al guardar, el campo se vacía: la clave no queda en el DOM.

> Una clave pegada en un chat, un correo o un ticket ya está comprometida:
> hay que anularla y generar otra, aunque nunca se haya escrito en un archivo.

### La marca de la clave del SRI — corregido el 07-sep-2026

`SriCredentialVault.getSignature()` sirve para una sola cosa: saber si la clave
guardada cambió desde el último rechazo. La armaba como
`largo_primeras2_últimas2` **y la imprimía en la consola**:

    🔑 [VAULT] Nueva clave detectada para … (firma anterior: NN_xx_yy, …)

Eso es el largo exacto, el principio y el final de una contraseña del SRI, en
el log que uno copia y pega en un chat cuando algo falla. Ahora la marca es un
resumen que no se puede desandar (FNV-1a de 32 bits) y **no se imprime nunca**:
el log dice que la clave cambió, y nada más.

Las marcas viejas no coinciden con las nuevas, así que la primera vez cada
contribuyente cuenta como «clave cambiada» y se le concede un intento. Es
exactamente lo que corresponde con una clave que no se sabe si sirve.

### Rotar la de R2 — el camino, que no es el obvio

Los tokens de R2 **no** se crean desde *Mi Perfil → API Tokens*. Esa pantalla
genera un **Bearer token** de la API de Cloudflare, y la subida usa **firma
S3**, que necesita otra cosa: un par *Access Key ID + Secret Access Key*.

El único lugar que devuelve credenciales S3 es
**R2 Object Storage → Manage R2 API Tokens → Create API Token**, con permiso
*Object Read & Write* y alcance limitado al bucket.

**Al rotar cambian los DOS.** Guardar sólo el secreto deja el Access Key ID
viejo en `shared_config.js` y la firma falla igual — por eso Ajustes tiene los
dos campos y el 🩺 avisa cuando quedó a medias.

Y la rotación **no termina al crear el token nuevo**: termina al **borrar el
viejo**. Mientras siga vivo, la clave del historial de git sigue sirviendo.

> **Pendiente**: cuando la subida funcione con la clave del almacén, sacar el
> valor de `R2_SECRET_ACCESS_KEY` de `shared_config.js`. Hoy sigue ahí porque
> es el único respaldo mientras la rotación no esté hecha.

---

## 10b. Esperar al portal, no contar hasta tres

Un `sleep(2500)` es una apuesta a dos puntas: **sobra** cuando el SRI responde
en 300 ms —y eso, multiplicado por 500 contribuyentes, son horas— y **falta** el
día que el portal está cargado, y entonces el paso falla por impaciencia y el
cliente queda sin declarar.

`esperarAjaxSri(condicion, label, tope)` en `02_servicios_y_memoria.js` hace las
dos cosas bien: sigue apenas la respuesta llega, y aguanta más que antes si
tarda. Tres tramos:

1. Se le da un momento (400 ms) al velo de PrimeFaces para aparecer. Que **no**
   aparezca es normal — se sondea a mano, no con `waitFor()`, que dejaría un
   aviso de timeout falso en cada llamada.
2. Se espera a que el velo se vaya.
3. Se espera a que esté en el DOM lo que se estaba esperando. Sin esto, «el velo
   se fue» no quiere decir que lo nuevo ya se haya pintado.

Hereda la pausa de `waitFor()`: si el contador aprieta ⏸, esperar se queda
quieto. Probado.

### Cuánto cuesta de verdad la espera fija

Medido el 06-sep-2026, y no es lo que parecía a simple vista:

| | sleeps | tiempo |
| :--- | ---: | ---: |
| Totales en `src/` | 135 | 128,2 s |
| **Tras `location.href`** | 5 | 19,5 s — **no cuestan**: la página se va y el script muere |
| **Cuestan de verdad** | 130 | **108,8 s** |

Ya convertidos: las cinco de Consulta de declaraciones (el bucle que más
vueltas da: una por período, por cliente) y las tres de paginación de tablas.

Las tres de paginación eran tiempo muerto puro: `irSiguientePagina()` **ya
espera** de forma reactiva a que la página cambie —número del paginador o
contenido de la primera celda—, hasta 8 s. El `sleep` de después no agregaba
ninguna garantía.

> **Las del Cierre Mágico (`06_panel_interfaz.js` 1398, 1421, 1433, 1502) NO se
> tocaron.** Son la secuencia de envío y la §4 pide probarlas rigurosamente.
> Cambiarlas sin el portal delante es exactamente donde no hay que ahorrar.

---

## 11. El XML del comprobante — la tarifa dicha, no deducida

> **Estado**: parser y descarga construidos y probados (05-sep-2026).

### Por qué

El cociente IVA/base deduce la tarifa cuando la factura es de una sola tarifa.
Cuando trae líneas mezcladas no puede: $100 con un tercio al 15% da 4,95% y se
lee como 5% (§9a). El XML no deduce nada — trae la base y el IVA **separados
por tarifa**, tal como los declaró quien emitió.

### Lo que ya está

`parsearXmlComprobante(xmlTexto)` en `04_extraccion_datos.js`. Acepta el
comprobante suelto (`<factura>`, `<notaCredito>`) y también la respuesta de
autorización, que lo trae envuelto en un CDATA. Devuelve:

```js
{ claveAcceso, rucEmisor, razonSocial, codDoc, esNotaCredito, fechaEmision,
  porTarifa: { '15': {base, iva}, '0': {base, iva}, '5': {…} },
  totalSinImpuestos, importeTotal, tarifasDesconocidas: [] }
```

`repartirXmlEnResumen(resumen, xml)` lo vuelca en los baldes 0 / 5 / plena y
devuelve `false` si el XML traía un `codigoPorcentaje` que no se reconoce —
que **no se reparte a ojo**, se anota.

Desde la consola: `sriLeerXml(texto)`.

**Códigos de `<codigoPorcentaje>`** (esquema de comprobantes electrónicos):

| Código | Tarifa | | Código | Tarifa |
| :---: | :--- | :--- | :---: | :--- |
| `0` | 0% | | `5` | **5%** |
| `2` | 12% | | `6` | no objeto de IVA |
| `3` | 14% | | `7` | exento |
| `4` | 15% | | `10` | 15% |

El `6` y el `7` **no son «tarifa cero»**: son transferencias que no gravan. Van
al 507/517 igual que el 0% porque el formulario no los separa, pero se cuentan
aparte por si hace falta. `<codigo>` `2` es IVA; `3` es ICE y no debe tocar
las bases de IVA (probado).

`<codDoc>`: `01` factura · `04` nota de crédito · `05` nota de débito ·
`03` liquidación de compra · `07` comprobante de retención.

### De dónde se baja — resuelto, y estaba a mano

El endpoint ya estaba en una traza que teníamos desde el 04-sep-2026 («flujo de
reportes de documentos electrónicos recibidos»). **No hizo falta traza nueva.**

Cada fila de `tablaCompRecibidos` trae dos enlaces, `lnkXml` y `lnkPdf`, y no
son AJAX: `mojarra.jsfcljs` manda el formulario entero con el id del enlace
como parámetro — el mismo mecanismo de `lnkTxtlistado`, que ya reproducíamos.
Ver la Biblia, «El XML de cada comprobante — `lnkXml`».

```js
descargarXmlComprobante(N)                 // una fila
traerXmlDeComprobantes([2, 7, 11])         // varias, de a una y con pausa
sriBajarXml(3)  ·  sriBajarXml([2, 7])     // desde la consola
```

Se reproduce el POST en vez de pulsar el enlace, así el archivo no baja al
disco del usuario. Si la sesión caducó el portal devuelve HTML en vez del
comprobante, y eso se detecta antes de parsear.

**No hay un enlace de «bajar todos»**: es una petición por comprobante. Por eso
`traerXmlDeComprobantes()` pausa 700 ms entre una y otra y corta a las 40. Una
ráfaga de 27 XML × 27 contribuyentes es la clase de cosa que termina en un
bloqueo del WAF.

> El servicio público de autorización (`AutorizacionComprobantesOffline`, SOAP
> sobre `cel.sri.gob.ec`) queda descartado: es otro origen, necesitaría
> `host_permissions` y salir por el service worker, y no aporta nada que el
> enlace de la propia página no dé con la sesión ya abierta.

### Cuándo conviene bajarlo — y cuándo no

No hace falta un XML por factura. El cociente resuelve la gran mayoría solo.
El XML se pide para las pocas que lo necesitan:

- las que quedaron **sin tarifa reconocible** (`resumen.ambiguas`),
- las que el cociente leyó como **5%**, para confirmar que no son mezcladas,
- y las candidatas a **activo fijo**, donde además se quiere ver *qué* se compró.

Con eso son unas pocas peticiones por cliente, no 27.

---

## 12. Sobre el informe técnico del 05-sep-2026

Llegó un documento externo («Especificación Técnica de Automatización:
Formulario 104 de IVA»). **Tiene partes correctas y partes equivocadas, y se
contradice a sí mismo.** Queda anotado para que nadie lo tome como fuente.

### Lo que sí sirve

- La estructura del XML: `totalConImpuestos/totalImpuesto` con `codigo`,
  `codigoPorcentaje`, `baseImponible` y `valor`. Coincide con lo que ya lee el
  modal de notas de crédito.
- `codDoc` `01` factura / `04` nota de crédito.
- La idea de tomar `<baseImponible>` y `<valor>` en vez de recalcular el
  impuesto, para no arrastrar redondeos.

### Lo que NO hay que copiar

| Dice el informe | Qué pasa |
| :--- | :--- |
| `411` = «Ventas Locales Tarifa 0%» (en el código Python) | **Se contradice con su propia tabla**, que pone 411 = ventas netas 15%. Lo confirmado en el DOM es `411 → concepto460`, ventas tarifa ≠ 0% neto. |
| `503 / 513 / 523` para compras sin derecho a crédito | Se contradice con su propia tabla, que dice `502 / 512 / 522`. |
| `553` factor de proporcionalidad · `554` crédito aplicable | Lo confirmado en el DOM es **`564`** (`concepto2130`, crédito según factor) y **`565`** (`concepto1276`, IVA no considerado como crédito). |
| `607` = arrastre de retenciones | Lo confirmado es **`606`** (`concepto2170`). El `605` sí coincide. |
| `429` = IVA de ventas 15% | Lo confirmado son `421` (`concepto470`), `422` activo fijo y `425` otros. |
| factor = `(411+412+415+416+417+418)/419` | Mete el `415`, que su propia tabla define como ventas 0% **sin** derecho a crédito. Por definición no va en el numerador. |
| «multa de USD 31.25» | Cifra suelta, sin respaldo. |

**Regla**: ese documento describe una versión del formulario que no es la que
tenemos delante. Ningún casillero de ahí entra al `fieldMap` sin pasar antes
por `sriMapaCasilleros()` y por la Biblia.


