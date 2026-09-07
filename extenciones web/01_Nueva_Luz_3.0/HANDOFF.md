# 🤝 Handoff — Nueva Luz 3.0

Para quien siga el trabajo sobre la extensión de declaración automática de IVA
del SRI (Ecuador). Escrito el **06-sep-2026**, manifest `3.1.0`, bundle 509 KB,
`src/` 18.567 líneas.

**Leé primero, en este orden:**

1. [`.agents/AGENTS.md`](../../.agents/AGENTS.md) — las reglas. Es largo y hay
   que leerlo entero. Ahí está el objetivo, los frenos de seguridad, la Matriz
   Tatuada de selectores y por qué cada decisión es como es.
2. [`_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md`](../_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md)
   — evidencia real del portal. Un selector que no esté ahí **es una
   suposición**.
3. Este archivo — el mapa de qué hay hecho y qué falta.

---

## 0. Lo primero: cómo saber si algo se rompió

```bash
# desde la carpeta de la extensión
npm run build
```

Y para las pruebas, **una sola página**:

```
.claude/launch.json → configuración «bancos-extension» (localhost:8791)
→ http://localhost:8791/tests/   →  botón «Correr todos»
```

**319 comprobaciones, todas verdes al 06-sep-2026**, en ~20 segundos. Cada
banco carga el `build/content.js` de verdad, el mismo que se inyecta en el
portal. **Si algo sale en rojo, la extensión tiene un problema real.**

| Banco | Qué cuida | # |
| :--- | :--- | ---: |
| `iva5.html` | tarifas de IVA, el XML, la botonera | 104 |
| `proveedores.html` | la base y la cascada de sugerencias | 43 |
| `catastro.html` | la bisección sobre 283.879 RUC | 31 |
| `chequeo.html` | el diagnóstico previo | 32 |
| `subidas.html` | por qué falla la subida, el cortacircuitos | 27 |
| `notasventa.html` | el 508 y el 117 con temporizador | 23 |
| `esperas.html` | esperar al portal en vez de contar | 20 |
| `clavevencida.html` | la clave que el SRI pide cambiar | 19 |
| `claves.html` | las claves fuera del código | 20 |

Los `file://` **no ejecutan scripts** en el panel: hace falta el servidor.

Además, siempre: `node --check` sobre cada archivo de `src/`, más
`background.js`, `popup.js` y `options.js`. **No hay type-check** — `typescript`
no está instalado y `npm test` falla a propósito.

---

## 1. Arquitectura, no negociable

- **7 archivos en `src/`**, que Vite concatena en orden estricto 01→07 hacia
  `build/content.js`. **No hay `import`/`export`**: todo es global compartido.
  Una función declarada en el 01 la ve el 07.
- **Tras tocar `src/` hay que correr `npm run build`.** Si no, Chrome sigue con
  el bundle viejo y vas a depurar un fantasma.
- `vendor/` no se concatena y se carga bajo demanda:
  - `jspdf.umd.min.js` (355 KB) → `ensureJsPdfLoaded()`
  - `catastro_eloro.txt` (6,2 MB) + `ciiu.json` → `Catastro.cargar()`
- El **service worker** (`background.js`) hace todo lo cross-origin. Un `fetch`
  desde el content script está sujeto a CORS y `host_permissions` **no** lo
  exime. Esto tuvo la subida rota durante meses.
- La **página de Ajustes** (`options.html` / `options.js`) es donde viven las
  claves. Se abre con clic derecho en el ícono → Opciones.

### Los siete módulos

| | Qué vive ahí |
| :--- | :--- |
| `01_utilidades_y_pdf` | helpers, PDF, `esDeLaExtension()`, frenos de sustitutiva y de clave vencida |
| `02_servicios_y_memoria` | `SafeStorage`, `SriLoop`, `SriApi`, `Omitidos`, **`Proveedores`**, **`Catastro`**, **`NotasDeVenta`**, **`Chequeo`**, `esperarAjaxSri` |
| `03_ingreso_y_sesion` | login, sesión, identidad |
| `04_extraccion_datos` | raspar tablas, `clasificarTarifaIva`, `parsearXmlComprobante` |
| `05_llenado_formulario` | casilleros, `sriMapaCasilleros()` |
| `06_panel_interfaz` | `SriAssistantPanel`, **el cierre mágico** |
| `07_navegacion_sri` | wizards, el HUD flotante (`SriLoopHUD`) |

---

## 2. Las reglas que no se rompen

Están todas en AGENTS.md, pero éstas son las que cuestan plata o la firma del
contador si se rompen:

1. **El bot nunca presenta una sustitutiva.** `frenarSiEsSustitutiva()`.
2. **El bot nunca paga.** Si el saldo no es exactamente `0`, guarda borrador y
   frena.
3. **El bot nunca cambia contraseñas.** Detecta que el SRI las pide y **omite
   al cliente**. `Verificar/persona` y `Verificar/modificar` no se nombran
   siquiera — hay una prueba que lo verifica sobre el bundle compilado.
4. **El bot nunca contesta la encuesta del SRI** ni pulsa un botón de modal por
   su texto.
5. **Nunca se escriben claves en el DOM del portal.** Sólo el RUC en el
   elemento; la credencial se resuelve al hacer clic.
6. **`null` no es cero.** Un «no sé» jamás se guarda como si fuera un dato.
   Vale para el saldo (`parseImporteEstricto`), para las notas de venta, para
   la tarifa de IVA y para las sugerencias de la IA.
7. **Una sugerencia no pisa una decisión del contador.** El campo `origen`
   (`usuario` / `catastro` / `ia`) es lo que lo hace cumplir.
8. **Nunca se saltea un contribuyente por un aviso.** Se comprueba en Consulta
   de declaraciones antes de dar nada por hecho.

### El contrato de envío (`ejecutarCierreMagico`)

Sólo envía si puede confirmar **las cinco** a la vez:

1. `estaEnResumenDeclaracion()` — estamos en el resumen, no en el formulario
2. `detectarSaldo()` devuelve un número **y es `0`**
3. `analizarMensajesResumen()` devuelve `'limpio'`
4. `frenarSiEsSustitutiva()` devuelve `false`
5. `frenarSiHayIvaSinUbicar()` devuelve `false`

Cualquier otro resultado guarda borrador y frena. **La ausencia de mensajes no
es «todo bien»** — ésa fue una regresión real.

---

## 3. Lo que se construyó (y por qué)

### El agujero del 5% — el que costaba plata

El corte de tarifas era binario. Una compra al 5% caía en el casillero 500, que
es el de 15%. Como el SRI calcula el 520 desde el 510, eso **inflaba el crédito
tributario**: $1.000 al 5% daban $150 de crédito donde correspondían $50.

`clasificarTarifaIva(base, iva)` deduce la tarifa por el cociente. Devuelve
**tres** respuestas y la tercera es `null` = «no sé». El 8% de feriados queda
fuera a propósito: cae en la misma zona que una factura mezclada.

**Límite conocido y medido:** el cociente **no distingue** una factura al 5% de
una mezclada — $100 con un tercio al 15% da 4,95% y se lee como 5%. Eso sólo lo
resuelve el XML.

### El XML del comprobante

`parsearXmlComprobante()` da base e IVA **separados por tarifa**, dicho por
quien emitió. `descargarXmlComprobante(N)` lo baja reproduciendo el POST de
`lnkXml` — confirmado en traza. `traerXmlDeComprobantes()` pide de a una con
700 ms de pausa y corta a las 40: **no hay «bajar todos»**, es una petición por
comprobante.

### La base de proveedores + el catastro + la IA

La cascada, y el orden importa:

```
1. lo que decidió el contador   → MANDA      gratis, instantáneo
2. el catastro del SRI (CIIU)   → sugiere    gratis, en disco
3. la IA                        → sugiere    cuesta y sale de casa
```

**Qué sale de la máquina hacia la IA:** el nombre del proveedor y su actividad
pública. **No** el RUC del proveedor, **no** el del cliente, **no** importes.
Hay cuatro comprobaciones dedicadas a eso.

La base sirve para **tres proyectos**: IVA, anexo de gastos personales y la
futura **devolución de IVA de tercera edad**.

### El HUD

A la vista: `▶ 🏃 [estado] 🎯 ⚠️ ⏭️ 🏁 🧰 🛑 Detener`.
En el cajón 🧰, con rótulo escrito: Comprobantes · Registro · La cola ·
Bitácora · Proveedores · Notas de venta · Casilleros · Ir a… · **Chequeo** ·
Probar subida · Panel. Escape cierra todo.

**🩺 Chequeo** contesta «¿está todo listo?» antes de arrancar: la subida, las
claves y **de dónde salen**, el catastro, los proveedores, y la marca
`iva_sin_ubicar` — que si quedó pegada de ayer hace que el cierre **no envíe
nada** sin que sea obvio por qué.

---

## 4. 🔴 LO PENDIENTE, por orden de importancia

### 4.1 · Sacar el secreto de R2 de `shared_config.js` — SEGURIDAD

**Estado:** la subida ya funciona por el camino `s3`. Falta confirmar de dónde
sale la clave.

**Qué hacer:**

1. Ajustes → 🔌 **Probar ahora**. Mirá `claveSecreta` y `accessKeyId`.
2. Si **los dos** dicen `del almacén` → la rotación está completa. Entonces:
   - En `shared_config.js`, dejar `R2_SECRET_ACCESS_KEY: ""` con un comentario
     que diga que va en Ajustes.
   - Correr `tests/subidas.html` y probar 🔌 otra vez.
3. Si alguno dice `del CÓDIGO` → **no tocar nada**: está funcionando con la
   clave vieja. Hay que terminar de pegar esa credencial en Ajustes primero.

> La clave que está en `shared_config.js` está en el **historial de git**.
> Sacarla del archivo no la des-compromete: **hay que rotarla en Cloudflare**
> (R2 → *Manage R2 API Tokens*, no desde Mi Perfil → API Tokens, que da un
> Bearer token inútil para firma S3). Y la rotación **termina al borrar el
> token viejo**, no al crear el nuevo.

### 4.2 · Los `id` de los casilleros, sin confirmar — pero ya no bloquean

> **Corregido el 06-sep-2026.** Acá decía que el 540 y el 550 «no aparecen en
> el formulario». **Sí aparecen.** El usuario mandó la captura: la fila
> «Adquisiciones y pagos locales (excluye activos fijos) gravados con tarifa
> **5%** (con derecho a crédito tributario)» trae **540 · 550 · 560**, y la de
> abajo trae **502 · 512 · 522**.
>
> Lo que fallaba era `encontrarInputPorCasillero()`: sus cuatro XPath exigen
> que la casilla sea el `<td>` **inmediatamente siguiente** al número, y el SRI
> mete una tabla dentro de cada celda. La quinta estrategia mira la **pantalla**
> —el primer input de texto a la derecha del número y a su misma altura— y los
> encuentra sin necesitar el `id`.
>
> **Lección**: el reporte del bot no es la pantalla. «No se encontró X» quiere
> decir que el buscador no lo encontró, no que X no exista.

Los `id` reales **siguen sin confirmarse** y **no se cablean por suposición**
(§5b). Cuando alguien quiera cerrarlo del todo: estando en el formulario,
HUD → 🧰 → **📐** → *Copiar la tabla*, y con esa salida agregar la entrada a la
Biblia y cablear el `id` en el `fieldMap` de `05_llenado_formulario.js`. Es más
rápido y más seguro que buscar por altura, pero ya no es urgente.

**Y si algún día no apareciera, no se inventa nada:** la plata se anota en
`iva_sin_ubicar` y **el cierre mágico no envía** — pero el lote sigue con el
próximo contribuyente.

### 4.3 · El mapa del crédito tributario — CRITERIO CONTABLE

> **Ampliado el 06-sep-2026 por el usuario.** No es «CIIU → deducible». Son
> **tres** datos, no uno:
>
> «hay iva 5% que es de construcción y hay valores sin derecho tributario, o
> sea la herramienta tiene que saber de IVA porcentaje **y la actividad** para
> saber si es crédito tributario, además saber **la actividad del cliente**
> para que sea compatible»

| | Dato | Ya está |
| :--- | :--- | :---: |
| 1 | la **tarifa** de la compra | ✅ del cociente, o del XML |
| 2 | a qué se dedica el **proveedor** | ✅ del catastro |
| 3 | a qué se dedica el **cliente** | ✅ del catastro, por su RUC |
| 4 | **el mapa** que los traduce a sí/no | ❌ **esto falta** |

El tercero es el que cambia la respuesta: una compra da crédito cuando alimenta
una actividad que a su vez está gravada, así que la misma factura da distinto
resultado para un constructor que para otro rubro.

`Proveedores.porQueDecidir(rucProveedor, rucCliente)` junta los tres y devuelve
los avisos; **no decide** — `credito` es `null` mientras nadie lo haya decidido.
El panel 🏷️ muestra arriba la actividad del cliente, pone los del 5% primero y
le cuelga a cada proveedor las tarifas que se le vieron.

**El mapa lo pone el contador. No lo decide una IA ni un programador.**

> El dato de que **el 5% es del sector construcción** lo dio el usuario, no
> salió de leer la ley. Está anotado con esas palabras en el código y hay una
> prueba que lo exige (`tests/proveedores.html`, sección Z). No lo conviertas
> en doctrina ni lo cites como si fuera una fuente legal.

### 4.4 · El endpoint del XML, conectado al flujo

El parser y la descarga están; **falta usarlos automáticamente** para las
facturas que quedaron ambiguas o leídas como 5%. Hoy hay que llamar
`sriBajarXml(n)` a mano.

### 4.5 · Los tipos de comprobante que faltan

Nota de débito y liquidación de compra no se barren. **No inventar los
códigos**: se leen del portal, estando en Comprobantes Recibidos:

```js
[...document.getElementById('frmPrincipal:cmbTipoComprobante').options]
    .map(o => o.value + ' = ' + o.text).join('\n')
```

### 4.6 · Empresas fantasma

**Corrección importante:** el catastro provincial **NO trae** esa marca — sus
21 columnas están listadas en AGENTS.md §10 y ninguna es ésa. Es un dataset
aparte en sri.gob.ec. Mientras tanto se usa el **estado del contribuyente**
(suspendido/pasivo), que sí está y ya sale con bandera roja en el panel 🏷️.

### 4.7 · Las esperas del cierre mágico

Quedan cuatro `sleep()` fijos en `06_panel_interfaz.js` (líneas ~1398, 1421,
1433, 1502). **No se tocaron a propósito**: son la secuencia de envío y AGENTS
§4 pide probarlas rigurosamente. Sin el portal delante, ahí no se ahorra.

### 4.8 · El Worker de R2

`santiagocordova-r2-vault.workers.dev` no responde. **No es urgente**: el `s3`
directo cubre todo, y ahora hay un cortacircuitos que lo saltea tras tres
fallos. Si se quiere de vuelta, hay que redesplegarlo en Cloudflare Workers.

### 4.9 · `fetchSRIPublicData` en la app web

En `santiagocordova-main/services/sri.ts`. Sigue rota: `corsproxy.io` devuelve
403. Ahora hay una alternativa mejor — el **catastro local** de la extensión.

### 4.10 · Unificar las extensiones

Evaluado: **sí conviene, pero extrayendo un núcleo, no fusionando**. Nueva Luz
son 18.567 líneas contra 6.900 de las otras tres juntas, y tiene 319 pruebas
mientras las otras no tienen ninguna. El orden: sacar `core/` de Nueva Luz,
portar la más chica (`02_Cambio_Claves`, 600 líneas) como prueba, y recién ahí
seguir. **`02_Cambio_Claves` conviene dejarla separada**: mete código que
cambia contraseñas en la misma extensión que el bot de IVA.

---

## 5. ⚠️ Trampas que ya costaron tiempo

| Trampa | Qué pasa |
| :--- | :--- |
| **Finales de línea** | `src/02`, `04` y `05` están en **CRLF** en el índice de git; los demás en LF. Un script de Python que escriba con `newline='\n'` produce un diff de 2.000 líneas. Escribir con `newline=''` y, si hace falta, `git -c core.autocrlf=false add`. |
| **Heredocs de bash** | Mastican los backslashes: `'\\b'` se convierte en un backspace. Escribir los scripts con un archivo, no con heredoc. |
| **Envolver funciones en `window.<mismo nombre>`** | El bundle no tiene IIFE: toda función de nivel superior **ya es** `window.<nombre>`. `window.f = () => f()` es recursión infinita. Un alias sólo vale con nombre distinto. |
| **`offsetParent` en modales** | Siempre `null` en `position: fixed`. Usar `esVisible()`. |
| **El bot leyéndose a sí mismo** | Pulsaba sus propios botones y leía sus propios textos. `esDeLaExtension()` / `soloDelPortal()`. La detección de clave vencida cayó en esto. |
| **Métodos duplicados en una clase** | No dan error: el segundo pisa al primero en silencio. `grep -n "async nombre(" src/06_panel_interfaz.js` antes de agregar. |
| **`parseDecimal` devuelve `0`** | Tanto para «cero» como para «no pude leer». Para decidir plata: `parseImporteEstricto`, que devuelve `null`. |
| **Medir milisegundos en una prueba** | El navegador frena los temporizadores en pestañas de fondo y todavía más dentro de un iframe. `esperas.html` se recalibra en cada tramo por eso. |
| **Scripts de Python que escriben al final** | Si revientan a mitad, se pierde todo. Escribir sólo cuando todos los reemplazos salieron. |

---

## 6. Dónde está cada cosa

```
extenciones web/01_Nueva_Luz_3.0/
├── manifest.json          host_permissions: SRI, R2, workers.dev, Supabase,
│                          generativelanguage (IA)
├── background.js          service worker: subidas, IA, cookies, cortacircuitos
├── options.html/.js       ⚙️ Ajustes — las claves viven acá
├── popup.js               la cola de clientes
├── shared_config.js       ⚠️ tiene el secreto de R2 — ver §4.1
├── src/01..07             el content script
├── vendor/                jspdf · catastro_eloro.txt · ciiu.json
├── tools/
│   └── construir_catastro.py   ZIP del SRI → los dos archivos de vendor/
└── tests/index.html       🧪 correr todos los bancos
```

---

## 7. Cómo trabajar acá

1. **Nunca inventes un selector.** Si no está en la Biblia, es una suposición.
   Buscá por número de casillero y, si no aparece, **anotá y frená**.
2. **Todo cambio va con banco de prueba.** Tres bugs de esta sesión los cazó el
   banco y no la lectura del código.
3. **Medí antes de afirmar.** «138 esperas, 128 s» salió de contarlas; la
   primera vez que di el número estaba mal.
4. **Si algo es criterio contable, no lo decidas.** Guardalo, marcalo con su
   `origen`, y que lo confirme el contador.
5. **Los comentarios explican el porqué, no el qué.** Casi todos los de este
   código cuentan un bug real que pasó.
