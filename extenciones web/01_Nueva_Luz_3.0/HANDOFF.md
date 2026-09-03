# 🤝 Handoff — Nueva Luz 3.0

Contexto para continuar el trabajo sobre la extensión de declaración automática
de IVA del SRI (Ecuador). Escrito el **03-sep-2026**, build `3.1.0+20260903.1804`.

Leé también, en este orden: [`.agents/AGENTS.md`](../../.agents/AGENTS.md) (reglas
arquitectónicas) y
[`_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md`](../_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md)
(evidencia real del portal: URLs, IDs y flujos confirmados contra el DOM).

---

## 1. Qué es y dónde está

`extenciones web/01_Nueva_Luz_3.0` es **la extensión de producción**. Automatiza
el ciclo completo: entra al SRI con las credenciales de un cliente, extrae
facturas/retenciones/notas de crédito, llena el formulario de IVA, lo envía si
el saldo es cero, sube el comprobante a Cloudflare R2 + Supabase, cierra sesión
y pasa al siguiente cliente.

Las otras carpetas (`02_Cambio_Claves_SRI`, `03_Anexo_Gastos_Personales`,
`04_Anulador_Comprobantes_SRI`, `_ARCHIVADAS_Y_LEGACY`,
`_RESPALDO_EXTENSIONES_SEGURA`) son extensiones hermanas y código histórico.
**Sirven como fuente de selectores del SRI** — la 02 fue la que aportó los del
cambio de clave.

### Arquitectura (no negociable)

- 7 archivos en `src/` que **Vite concatena en orden 01→07** hacia
  `build/content.js`. **No hay `import`/`export`**: todo es global compartido.
- **Tras tocar `src/` hay que correr `npm run build`.** Si no, Chrome sigue con
  el bundle viejo.
- `vendor/jspdf.umd.min.js` (355 KB) **no se concatena**: se carga bajo demanda
  con `ensureJsPdfLoaded()`. No lo devuelvas al bundle.
- El bundle va a **353 KB**; `src/` son ~13.000 líneas.

---

## 2. Cómo verificar (hacelo siempre)

No hay type-check ni CI: `npm test` falla a propósito y `typescript` no está
instalado. La verificación real es:

```bash
cd "extenciones web/01_Nueva_Luz_3.0"
for f in src/0[1-7]*.js; do node --check "$f"; done   # sintaxis por archivo
cat src/0[1-7]*.js > /tmp/bc.js && node --check /tmp/bc.js   # la concatenación
npm run build
```

### Banco de pruebas headless

El bundle se puede cargar en una página normal con `chrome.*` simulado y
ejercitar sus funciones. Es como se validó todo lo de esta sesión (~120
aserciones). Patrón:

```html
<script>
  const store = { /* estado inicial de chrome.storage.local */ };
  window.chrome = { runtime:{getURL:p=>p, onMessage:{addListener(){}}, id:'s'},
    storage:{ local:{ get:k=>Promise.resolve(/*…*/), set:(o,cb)=>{Object.assign(store,o);cb&&cb();return Promise.resolve()}, remove:k=>{/*…*/} },
              onChanged:{addListener(){}} }, tabs:{create(){}} };
</script>
<script src="shared_config.js"></script>
<script src="content.js"></script>
<script>/* aserciones sobre las funciones globales */</script>
```

Servilo por HTTP (no `file://`) y abrilo en un navegador. Casi todas las
funciones son globales y se pueden llamar directo: `encontrarCamposLogin()`,
`SriLoop.get()`, `parseDecimal()`, `window.sriAssistant.detectarSaldo()`…

---

## 3. Diagnóstico en vivo

Estas herramientas existen porque perseguir bugs a ciegas en este código cuesta
carísimo. **Usalas antes de suponer nada.**

| Qué | Para qué |
| :--- | :--- |
| `👻 ... build 3.1.0+AAAAMMDD.HHMM` | Primera línea de consola. Dice **qué build cargó Chrome**. Si no coincide con el último `npm run build`, falta el ↻ en `chrome://extensions`. |
| `🚦 [ESTADO] semáforo=… · cliente 3/41 · autofill=NOMBRE [manual,lote] · acción=… · login=sí` | Sale en cada carga. Estado completo de un vistazo. |
| `🚦 [BUCLE] A → B · motivo [pila]` | Cada transición del semáforo, con quién la provocó. |
| `window.sriEstado()` | El semáforo, a pedido. |
| `window.sriLimpiarEstado()` | Purga el estado de automatización. **No toca clientes ni claves.** |
| `window.sriBuild()` | El sello del build cargado. |
| `window.sriDebug = true` | Reactiva los logs ruidosos de `findByText`. |
| `window.sriAssistant.verDiagnosticoResumen()` | Radiografía del DOM de la pantalla de resumen (se guarda sola al llegar; RUCs enmascarados). |

---

## 4. Trampas de este código (todas costaron horas)

**`offsetParent` no sirve para modales.** En Chrome todo `position: fixed` tiene
`offsetParent === null`. Por eso `dismissSridialogs()` **nunca cerró un solo
modal**. Usar `esVisible(el)` (`getComputedStyle` + `getBoundingClientRect`).
Quedan ~48 usos de `offsetParent` en el resto del código: para elementos en
flujo normal está bien, para overlays no.

**Métodos duplicados en `SriAssistantPanel`** (clase de ~3.500 líneas). Declarar
uno dos veces **no da error**: el segundo pisa al primero en silencio. Así
estuvo muerta toda la validación de saldo del cierre. Antes de agregar un
método:
```bash
grep -oE '^    (async )?[a-zA-Z_$][A-Za-z0-9_$]*\(' src/06_panel_interfaz.js | sort | uniq -d
```
Hoy da 0. Que siga así.

**`parseDecimal()` nunca decide un envío.** Devuelve `0` tanto para "cero" como
para "no pude leer". El SRI muestra el saldo como `USD 0.00`; antes las letras
no se limpiaban y `parseFloat("USD45.30")` daba `NaN` → `0`. **Una declaración
con saldo a pagar se leía como saldo cero.** Para decidir, usar
`parseImporteEstricto()`, que devuelve `null` cuando no hay número.

**Selectores adivinados.** El código estaba lleno de IDs que en el SRI no
existen (`frmPrincipal:tipoComprobante`, `btnVerFormularioCompleto`, e `input
[name="usuario"]` en **seis** lugares distintos). Antes de confiar en un
selector, buscalo en la Biblia. Si no está, es una suposición.

**Cuidado con `String.replace(a, b)` en scripts de parcheo.** Un `` $` `` en el
texto de reemplazo inyecta todo el contenido previo del archivo dentro de sí
mismo (me pasó, corrompí la Biblia). Usar siempre `replace(a, () => b)`.

**Finales de línea mezclados**: `01` y `03` son LF; `02`, `04`, `05`, `06`, `07`
son CRLF. Y varias líneas "en blanco" tienen espacios al final, así que los
reemplazos textuales multilínea fallan. Cuando falle un ancla, reemplazá por
rango de líneas.

---

## 5. El semáforo: única autoridad del bucle

Había **seis banderas** (`sri_master_switch_on`, `sriAutomationPaused`,
`auto_batch_enabled`, `sri_auto_mode`, `autoDeclaration`, `ghost_manual_mode`)
escritas 115 veces, y las compuertas se contradecían — una usaba el interruptor
maestro con `||`, convirtiéndolo en un **encendedor**.

Ahora manda `SriLoop` (en `02_servicios_y_memoria.js`), estado en
`chrome.storage.local.sc_loop`:

```
DETENIDO ──▶(play)──▶ CORRIENDO ──(pausa)──▶ PAUSANDO ──(fin cliente)──▶ PAUSADO
    ▲                     │                                                 │
    └──────(🛑 / watchdog 15 min)◀───────────────────────────────────────────┘
```

- **`SriLoop.puedeAvanzar()` es la ÚNICA autoridad.** Cualquier paso automático
  la consulta. Las 6 banderas se siguen escribiendo por compatibilidad, pero
  **ninguna compuerta decide por ellas**.
- `PAUSANDO` = termina el cliente en curso y para (no salta al siguiente).
- HUD flotante arrastrable: ▶ / ⏸ / 🛑, con contador `cliente 3/41`.
- Desde DETENIDO, ▶ arma la cola de pendientes y arranca **previa confirmación**.

> ⚠️ **Todo punto de entrada a un lote debe llamar a `SriLoop.iniciar()`.**
> Escribir las banderas viejas a mano deja `sc_loop` en DETENIDO y el flujo
> muere en silencio. Fue exactamente el bug de "1-Clic Declarar".

---

## 6. Contrato de seguridad del envío

**Nunca lo relajes.** El bot solo envía si CONFIRMA las dos cosas:

1. `detectarSaldo()` devuelve un número y ese número es `0`.
2. `analizarMensajesResumen()` no devuelve `'con_inconsistencias'`.

`detectarSaldo()` devuelve `null` cuando no pudo leer, y **`null` nunca equivale
a cero**: ante la duda guarda borrador y frena. Las advertencias del casillero
625 son informativas y no bloquean.

IDs confirmados: `frmFlujoDeclaracion:totalAPagar` (resumen, texto `USD 0.00`) y
`concepto2610` (formulario, sección TOTALES).

**Lo que el bot NO hace, por diseño:** pagar, cambiar contraseñas, responder la
encuesta de satisfacción del SRI, ni pulsar un botón de modal por su texto.
`cerrarModalesNoPrimeFaces()` solo usa controles de cierre explícitos.

---

## 7. Estado actual

### Funciona y está probado
Login automático (detección estructural del formulario), semáforo y HUD, pausa
que sobrevive al salto de cliente, parada de emergencia, watchdog, armado de
cola desde la base de clientes, cierre de la encuesta del SRI, detección del
cambio de clave obligatorio, freno de envío calibrado, jsPDF perezoso, subida
del comprobante a R2 + Supabase.

### Última corrida real del usuario
▶ arrancó bien: semáforo CORRIENDO, **41 clientes en cola**, credenciales
cargadas. El primer cliente (`LABANDA ARMIJOS`) quedó bloqueado porque **el SRI
le exige cambiar la clave** — ya se detecta, se marca y se salta.

### 🔴 Lo que falta verificar contra el portal real
1. **Que el bucle encadene de verdad.** Nunca se vio un `cliente N → N+1`
   completo. Es lo primero a comprobar.
2. **El salto a Comprobantes Recibidos después del login.** Esa pantalla vive en
   otro subsistema y pide su propio token (`GeneraToken.jsp`). Si el salto va
   demasiado pronto, Keycloak rebota al login. Si se ve entrar y salir en bucle:
   o esperar a que la sesión se asiente, o navegar por el menú
   (`FACTURACIÓN ELECTRÓNICA → Comprobantes electrónicos recibidos`, ver Biblia
   entrada 10).
3. **La pantalla de confirmación final** (botón IMPRIMIR): sin evidencia. Falta
   para blindar `initDeclarationSuccessWatcher()` y la captura del comprobante.
4. **Que `new Function` funcione** para cargar jsPDF dentro del mundo aislado en
   el SRI. Si falla sale `⚠️ [jsPDF] No disponible` — no es fatal (hay un PDF de
   respaldo simple), pero habría que pasarlo a service worker.
5. **Wizard paso 2 "Preguntas"**: nunca se documentó.

### 🧹 Dónde buscar más basura
- **Rutas que arrancan solas.** Se encontraron cuatro (lote fantasma por
  banderas viejas, `ejecutarAccionPendiente` sin semáforo, la tarjeta "Tarea
  Pendiente" que se auto-confirmaba a los 4 s, y la puerta trasera del Modo
  Reposo). Puede quedar alguna: cualquier `SafeStorage.set` con `pendingAction`
  es sospechoso.
- **`showContextCard` auto-confirma a los 4 segundos** salvo que reciba
  `timeout: null`. Toda tarjeta que *pregunte* algo debe pasarlo.
- **`runUnifiedWorkflow('RECOVER_PDF_ONLY')`** no tiene rama: cae en el `else`.
  Y `ejecutarRecuperacionPDF()` (07, ~250 líneas) **no la llama nadie**; su
  `pendingAction: 'recoverPDF'` está desactivado a propósito por el usuario.
- **La cola se arma en 6 lugares distintos.** Convendría uno solo
  (`SriLoop.armarCola`).
- **43 usos de `innerHTML`**; los de datos de cliente ya pasan por
  `escapeHtml()`, pero conviene revisar los nuevos.

---

## 8. Seguridad — leer antes de tocar nada

- **Las claves del SRI nunca van al DOM del portal** (ni `data-*` ni handlers
  inline). Se resuelven al hacer click contra `sc_clients_cache`.
- Todo dato de cliente que entre a `innerHTML` pasa por `escapeHtml()`.
- En la raíz del workspace hay `Contraseñas de Chrome.csv` (export en texto
  plano) y `cert-*.p12` (firma electrónica). **Nunca leerlos, commitearlos ni
  citarlos.** Están en `.gitignore`, verificado.
- `.gitignore` excluye `*.pdf` de todo el repo: las carpetas de respaldo tienen
  facturas, retenciones y un poder notarial de contribuyentes reales.
- Las capturas de `_EVIDENCIA_SRI/capturas/` llevan RUC, nombre, email y
  teléfono. Solo se versiona el índice `.md`.
- La `SUPABASE_ANON_KEY` de `shared_config.js` es pública por diseño (RLS
  endurecido). No es un hallazgo.

---

## 9. Git

Rama `extension/nueva-luz-control-bucle`, sin remoto. Historia limpia, un
commit por tema, working tree limpio.

`santiagocordova-main/` es un repo propio y está ignorado desde afuera.

---

## 10. Prompt sugerido para continuar

> Trabajo en `extenciones web/01_Nueva_Luz_3.0`, la extensión de Chrome que
> automatiza la declaración de IVA del SRI (Ecuador). Leé primero
> `HANDOFF.md`, `.agents/AGENTS.md` y
> `_EVIDENCIA_SRI/BIBLIA_PANTALLAS_SRI.md`.
>
> Reglas: los 7 archivos de `src/` se concatenan (sin imports) y **hay que
> correr `npm run build` tras cada cambio**; verificá con `node --check` por
> archivo y sobre la concatenación. No hay type-check ni CI.
>
> Antes de confiar en cualquier selector del SRI, buscalo en la Biblia: si no
> está, es una suposición. Ojo con `offsetParent` (null en `position:fixed`),
> con los métodos duplicados en `SriAssistantPanel`, y con `parseDecimal()`,
> que devuelve 0 tanto para "cero" como para "no pude leer".
>
> El bucle lo manda `SriLoop.puedeAvanzar()` — cualquier arranque de lote debe
> pasar por `SriLoop.iniciar()`. El bot **no paga, no cambia contraseñas y no
> envía si no confirma que el saldo es 0**.
>
> Lo que sigue: [tu tarea]. Si necesitás IDs del portal, pedímelos y te paso
> capturas con DevTools abierto o la salida del snippet de consola de la Biblia.
