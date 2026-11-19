#!/usr/bin/env node
/* ============================================================
   construir_suite.mjs — arma `suite/` a partir de las extensiones
   individuales (01, 02, 03 y 04).

   POR QUÉ EXISTE
   Una extensión de Chrome no puede leer archivos fuera de su propia
   carpeta, así que la suite obliga a copiar los módulos. Copiar a mano
   es cómo nacen las suites que se desincronizan: se arregla la 01, se
   olvida la copia, y la suite queda con el bug viejo.

   Por eso la suite es un ARTEFACTO: las cuatro carpetas de arriba son
   la única fuente de verdad y este script las vuelve a empaquetar.
   `--check` dice si `suite/` quedó vieja respecto de sus fuentes.

   QUÉ HACE
   1. Copia los assets que los módulos buscan por ruta fija
      (vendor/, libs/) y los archivos de la 01 (popup, ajustes, worker).
   2. Envuelve cada content script en una IIFE. No es cosmético: los
      cuatro módulos se inyectan en el MISMO mundo aislado de la misma
      extensión, y ahí dos `const` con el mismo nombre son un error de
      sintaxis que mata el módulo entero. Cada IIFE les devuelve su
      ámbito privado.
   3. Fusiona los manifiestos en uno (permisos y hosts, unión).
   4. Engancha el riel de la suite en el popup de la 01 con UNA línea.
   5. Valida que el manifiesto no apunte a ningún archivo inexistente y
      que cada módulo generado compile (`node --check`).

   USO
     node "tools/construir_suite.mjs"           # regenera suite/
     node "tools/construir_suite.mjs" --check   # sólo verifica
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(TOOLS, '..');
const SUITE = path.join(RAIZ, 'suite');
const SOLO_VERIFICAR = process.argv.includes('--check');

const VERSION_SUITE = '4.7.12';
const NOMBRE_SUITE = '🧰 [SC PRO SUITE] - IVA · Claves · Gastos · Anulador';

const errores = [];
const avisos = [];
const SALIDA = new Map(); // ruta relativa dentro de suite/ → Buffer

// ── Utilidades de archivo ─────────────────────────────────────

function rutaFuente(rel) {
  return path.join(RAIZ, rel);
}

function existe(rel) {
  try { return fs.statSync(rutaFuente(rel)).isFile(); } catch (e) { return false; }
}

function leerTexto(rel) {
  return fs.readFileSync(rutaFuente(rel), 'utf8');
}

function emitir(rel, contenido) {
  if (SALIDA.has(rel)) errores.push(`ruta repetida en la suite: ${rel}`);
  SALIDA.set(rel, Buffer.isBuffer(contenido) ? contenido : Buffer.from(String(contenido), 'utf8'));
}

function copiar(relOrigen, relDestino = relOrigen) {
  if (!existe(relOrigen)) {
    errores.push(`falta el archivo fuente: ${relOrigen}`);
    return;
  }
  emitir(relDestino, fs.readFileSync(rutaFuente(relOrigen)));
}

// ── Módulos: cada content script, envuelto en su propio ámbito ──

const MODULOS = [
  {
    id: '01_iva',
    titulo: '01 · Declaración de IVA 2011 (Nueva Luz 3.0)',
    fuentes: ['01_Nueva_Luz_3.0/build/content.js'],
    marcadores: ['SRI ASISTENTE GHOST', 'sc_loop']
  },
  {
    id: '01_bridge',
    titulo: '01 · Puente con SantiagoCordova.com (Nueva Luz 3.0)',
    fuentes: ['01_Nueva_Luz_3.0/bridge_content.js'],
    marcadores: ['SC PRO Bridge']
  },
  {
    id: '01_zifact',
    titulo: '01 · Auto-login de Zifact',
    fuentes: ['01_Nueva_Luz_3.0/zifact_autologin.js'],
    marcadores: ['zifact']
  },
  {
    id: '02_claves',
    titulo: '02 · Asistente de claves SRI & Ecuafact',
    fuentes: [
      '02_Cambio_Claves_SRI/supabase_bridge.js',
      '02_Cambio_Claves_SRI/content.js'
    ],
    marcadores: ['updatePasswordInSupabase', 'handleSilentPasswordUpdatePage']
  },
  {
    id: '02_bridge',
    titulo: '02 · Puente con SantiagoCordova.com (claves)',
    fuentes: ['02_Cambio_Claves_SRI/bridge_content.js'],
    marcadores: ['pending_sri_change']
  },
  {
    id: '03_gastos',
    titulo: '03 · Anexo de gastos personales',
    fuentes: ['03_Anexo_Gastos_Personales/content.js'],
    marcadores: ['createAssistantUI', 'TOPES_GASTOS']
  },
  {
    id: '04_anulador',
    titulo: '04 · Anulador de comprobantes (página del SRI)',
    fuentes: ['04_Anulador_Comprobantes_SRI/content.js'],
    marcadores: ['createUploadWidget', 'menuAnulacion']
  }
];

/**
 * Comprueba que el módulo generado no salió vacío ni cortado.
 *
 * `node --check` dice que compila; esto dice que además está entero. Son
 * fallas distintas: un archivo truncado puede seguir compilando y la
 * extensión cargaría sin hacer nada.
 */
function revisarModulo(modulo, generado, bytesFuente) {
  const bytesGenerado = Buffer.byteLength(generado, 'utf8');
  if (bytesGenerado < bytesFuente) {
    errores.push(`módulo ${modulo.id}: generado (${bytesGenerado} B) es más chico que sus fuentes (${bytesFuente} B)`);
  }
  for (const marcador of modulo.marcadores) {
    if (!generado.includes(marcador)) {
      errores.push(`módulo ${modulo.id}: no contiene el marcador "${marcador}" — ¿fuente truncada o módulo equivocado?`);
    }
  }
}

function envolverModulo(modulo) {
  const partes = [];
  for (const fuente of modulo.fuentes) {
    if (!existe(fuente)) {
      errores.push(`módulo ${modulo.id}: falta la fuente ${fuente}`);
      continue;
    }
    // El comentario va después de un salto de línea: si el archivo anterior
    // terminó con `//` sin newline, el salto evita que se coma esta cabecera.
    partes.push(`\n/* ── fuente: ${fuente} ── */\n` + leerTexto(fuente));
  }

  const cabecera = [
    '/* ============================================================',
    `   SC PRO SUITE · ${modulo.titulo}`,
    '   ------------------------------------------------------------',
    '   ARCHIVO GENERADO — no editar a mano.',
    `   Fuente: ${modulo.fuentes.join(' + ')}`,
    '   Regenerar: node "tools/construir_suite.mjs"',
    '   El (function(){...})() no es decorativo: aísla los nombres de este',
    '   módulo del resto (los cuatro comparten el mismo mundo aislado).',
    '   ============================================================ */'
  ].join('\n');

  return `${cabecera}\n(function () {\n${partes.join('\n')}\n\n})();\n`;
}

// ── Archivos de apoyo que los módulos piden por ruta fija ─────

function copiarApoyo() {
  // 01: service worker, configuración, popup y ajustes.
  copiar('01_Nueva_Luz_3.0/background.js', 'background.js');
  copiar('01_Nueva_Luz_3.0/shared_config.js', 'shared_config.js');
  copiar('01_Nueva_Luz_3.0/popup.js', 'popup.js');
  copiar('01_Nueva_Luz_3.0/options.html', 'options.html');
  copiar('01_Nueva_Luz_3.0/options.js', 'options.js');
  for (const n of ['16', '32', '48', '128']) {
    copiar(`01_Nueva_Luz_3.0/icon${n}.png`, `icon${n}.png`);
  }

  // 01 los busca con chrome.runtime.getURL('vendor/...').
  for (const f of ['jspdf.umd.min.js', 'catastro_eloro.txt', 'ciiu.json']) {
    copiar(`01_Nueva_Luz_3.0/vendor/${f}`, `vendor/${f}`);
  }

  // 04 los busca con chrome.runtime.getURL('libs/...'). Los .map de pdf.js
  // se quedan afuera: son ~8 MB de mapas de depuración de una librería de
  // terceros y no aportan nada dentro de una extensión instalada.
  copiar('04_Anulador_Comprobantes_SRI/libs/pdf.mjs', 'libs/pdf.mjs');
  copiar('04_Anulador_Comprobantes_SRI/libs/pdf.worker.mjs', 'libs/pdf.worker.mjs');
  copiar('04_Anulador_Comprobantes_SRI/libs/injected_bypass.js', 'libs/injected_bypass.js');

  // 03 declara su hoja de estilos en el manifiesto.
  copiar('03_Anexo_Gastos_Personales/content.css', 'modules/03_gastos.css');

  // Riel del popup (fuente propia de la suite, no de un módulo).
  copiar('tools/suite_rail.js', 'suite_rail.js');
}

function popupConRiel() {
  const original = leerTexto('01_Nueva_Luz_3.0/popup.html');
  const ancla = '<script src="popup.js"></script>';
  const veces = original.split(ancla).length - 1;

  if (veces !== 1) {
    errores.push(
      `popup.html: esperaba 1 "${ancla}" y encontré ${veces}. ` +
      'Sin ese anclaje el riel de la suite no se monta (el popup igual funciona).'
    );
    return original;
  }

  const reemplazo = ancla +
    '\n    <!-- Riel de la suite: acceso a los otros tres módulos desde este panel -->\n' +
    '    <script src="suite_rail.js"></script>';

  return original.replace(ancla, reemplazo);
}

// ── Manifiesto único ──────────────────────────────────────────

// Dominios de la web propia: 01 y 02 se conectan ahí.
const MATCHES_WEB = [
  'http://localhost/*',
  'http://127.0.0.1/*',
  'https://santiagocordova.com/*',
  'https://*.santiagocordova.com/*',
  'https://santiago-cordova.com/*',
  'https://*.santiago-cordova.com/*'
];

function manifiesto() {
  return {
    manifest_version: 3,
    name: NOMBRE_SUITE,
    version: VERSION_SUITE,
    description:
      'Suite única del estudio: declaración de IVA (Nueva Luz 3.0), claves SRI/Ecuafact, ' +
      'anexo de gastos personales y anulación de comprobantes, en una sola extensión. ' +
      'Generada desde las extensiones individuales.',
    permissions: ['storage', 'activeTab', 'cookies', 'downloads', 'scripting'],
    host_permissions: [
      'https://*.sri.gob.ec/*',
      'https://srienlinea.sri.gob.ec/*',
      'https://app.ecuafact.com/*',
      'https://*.ecuafact.com/*',
      'https://afssvsxlxiwqgtcgvqxp.supabase.co/*',
      'https://*.supabase.co/*',
      'https://santiagocordova-r2-vault.workers.dev/*',
      'https://5daf9742bb674b34c0a69fb60557c90b.r2.cloudflarestorage.com/*',
      'https://pub-0f0bf9175c8a41f1bb854a22ca33390d.r2.dev/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      'https://santiagocordova.com/*',
      'https://*.santiagocordova.com/*',
      'https://santiago-cordova.com/*',
      'https://*.santiago-cordova.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://zifact.com/*',
      'https://*.zifact.com/*'
    ],
    action: {
      default_popup: 'popup.html',
      default_icon: {
        16: 'icon16.png',
        32: 'icon32.png',
        48: 'icon48.png',
        128: 'icon128.png'
      }
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    },
    background: {
      service_worker: 'background.js'
    },
    icons: {
      16: 'icon16.png',
      32: 'icon32.png',
      48: 'icon48.png',
      128: 'icon128.png'
    },
    content_scripts: [
      {
        matches: ['https://srienlinea.sri.gob.ec/*'],
        js: ['shared_config.js', 'modules/01_iva.js'],
        run_at: 'document_idle'
      },
      {
        matches: MATCHES_WEB,
        js: ['shared_config.js', 'modules/01_bridge.js'],
        run_at: 'document_idle'
      },
      {
        matches: ['https://zifact.com/*', 'https://*.zifact.com/*'],
        js: ['modules/01_zifact.js'],
        run_at: 'document_idle'
      },
      {
        matches: [
          'https://srienlinea.sri.gob.ec/*',
          'https://app.ecuafact.com/*',
          'https://*.ecuafact.com/*'
        ],
        js: ['modules/02_claves.js'],
        run_at: 'document_end'
      },
      {
        matches: MATCHES_WEB,
        js: ['modules/02_bridge.js'],
        run_at: 'document_idle'
      },
      {
        matches: [
          'https://sriservicios.sri.gob.ec/anexo-gastos-personales/facturas-electronicas.jsf*'
        ],
        js: ['modules/03_gastos.js'],
        css: ['modules/03_gastos.css'],
        all_frames: true
      },
      {
        matches: ['https://srienlinea.sri.gob.ec/*'],
        js: ['modules/04_bypass.js'],
        world: 'MAIN',
        run_at: 'document_start'
      },
      {
        matches: ['https://srienlinea.sri.gob.ec/*'],
        js: ['modules/04_anulador.js'],
        run_at: 'document_end'
      }
    ],
    web_accessible_resources: [
      {
        resources: [
          'vendor/jspdf.umd.min.js',
          'vendor/catastro_eloro.txt',
          'vendor/ciiu.json',
          'libs/pdf.mjs',
          'libs/pdf.worker.mjs',
          'libs/injected_bypass.js'
        ],
        matches: ['https://*.sri.gob.ec/*']
      }
    ]
  };
}

// ── README de la suite ────────────────────────────────────────

function leerme() {
  return `# 🧰 Suite SC PRO v${VERSION_SUITE}

Un solo ícono con los cuatro módulos del estudio. **Archivo generado**:
no se edita acá, se edita en las extensiones individuales y se vuelve a
compilar con \`node "tools/construir_suite.mjs"\`.

## Qué trae

| # | Módulo | Dónde actúa | Qué hace |
| :-: | :--- | :--- | :--- |
| 01 | ⚡ IVA & Robot SRI (Nueva Luz 3.0) | \`srienlinea.sri.gob.ec\` | Declaración mensual 2011, lote de clientes, extracción y 16 herramientas |
| 02 | 🔑 Claves SRI & Ecuafact | \`srienlinea\`, \`ecuafact.com\` | Sugiere la clave nueva (\`*\` → \`@\`), la completa y la sincroniza |
| 03 | 📑 Anexo Gastos Personales | \`sriservicios.sri.gob.ec/.../anexo-gastos-personales\` | Clasifica por rubro, respeta topes y montos por carga familiar |
| 04 | 💎 Anulador de Comprobantes | \`srienlinea\` → anulación | Lee los PDFs y llena la solicitud de anulación en bloque |

## Instalar

1. \`chrome://extensions/\` → **Modo de desarrollador**.
2. **Cargar descomprimida** → esta carpeta (\`suite\`).
3. Recargá las pestañas del SRI que ya estuvieran abiertas: los content
   scripts sólo entran al cargar la página.

## El popup

El popup es el panel de la 01 (lote de clientes, período, herramientas,
ajustes). Arriba a la derecha, al lado del menú ☰, hay un botón 🧰 con los
cuatro módulos y el estado de cada uno en la pestaña que estás mirando:

- **● en esta pestaña** → el módulo ya está activo; el botón te lleva a esa pestaña.
- **○ en el portal, falta entrar** → estás en el dominio pero no en la página del módulo; el botón te deja donde tiene que estar.
- **○ en otra pestaña** → abre el portal en una pestaña nueva.

## Primera prueba (antes de usarla para declarar en serio)

El empaquetado está validado automáticamente (manifiesto + sintaxis de los
cuatro módulos), pero **eso no prueba que los scripts se comporten en el portal**.
Esta es la lista mínima, en orden, con la consola abierta (F12):

1. Cargar la suite: en \`chrome://extensions/\` no debe aparecer ningún error en
   rojo y el nombre tiene que ser **SC PRO SUITE**.
2. Abrir el popup: panel de clientes + botón 🧰. El riel debe listar los cuatro
   módulos con su estado.
3. Una pestaña de \`srienlinea.sri.gob.ec\`: aparece el panel flotante de la 01.
4. \`…/solicitud/anulacion/menuAnulacion.jsf\`: aparece el widget de carga de
   PDFs de la 04.
5. \`sriservicios.sri.gob.ec/…/anexo-gastos-personales/…\`: aparece el asistente
   de la 03.
6. Pantalla de cambio de clave con una clave que **ya termina en @**: la 02 no
   tiene que hacer nada (esa es su regla).
7. Si un módulo no aparece, revisar en este orden: consola del SRI → que el
   standalone del mismo módulo **no** esté instalado → ↻ en la suite.

## Límites conocidos (a propósito)

- **No reutiliza los popups de 02, 03 y 04.** Esos popups les hablan a “la
  pestaña activa” y dentro de otro popup ese destinatario sería el propio
  popup. Los cuatro módulos ya montan su interfaz dentro de la página del
  SRI, así que la suite cubre el trabajo sin ellos.
- **Los mapeos de 03/04 viven en \`chrome.storage.local\`**, que es por
  extensión: la suite y la extensión individual del mismo módulo **no
  comparten** lo aprendido ni las claves guardadas en Ajustes.
- **No conviene tener instalado el standalone del mismo módulo que ya trae
  la suite**: se inyectan dos veces en la misma página (dos paneles, dos
  burbujas). Elegí uno por módulo.

## Regenerar

\`\`\`powershell
node "extenciones web/tools/construir_suite.mjs"           # escribe suite/
node "extenciones web/tools/construir_suite.mjs" --check   # sólo avisa si quedó vieja
\`\`\`

Después de regenerar, \`chrome://extensions/\` → ↻ en la Suite.

### Probarla

\`\`\`powershell
# Puerta de calidad completa (sintaxis + build + 909 bancos + suite + navegador)
powershell -ExecutionPolicy Bypass -File "extenciones web/tools/verificar.ps1" -ConNavegador -Python "C:\\ruta\\python.exe"
\`\`\`

Las pruebas de navegador corren en una instancia aparte de Edge (Chrome
estable ya ignora \`--load-extension\`), con perfil temporal y ventana fuera de
pantalla: \`prueba_suite.ps1\` (manifiesto + service worker + riel),
\`prueba_experiencia.ps1\` (HUD, modos, cronómetro, resumen) y
\`prueba_inyeccion.ps1\` (módulo 02 empaquetado, de punta a punta).
`;
}

// ── Ensamblado ────────────────────────────────────────────────

for (const modulo of MODULOS) {
  const generado = envolverModulo(modulo);
  const bytesFuente = modulo.fuentes.reduce((total, f) => {
    try { return total + fs.statSync(rutaFuente(f)).size; } catch (e) { return total; }
  }, 0);
  revisarModulo(modulo, generado, bytesFuente);
  emitir(`modules/${modulo.id}.js`, generado);
}

// El bypass de la 04 ya es una IIFE propia y va al mundo MAIN: se copia tal cual.
copiar('04_Anulador_Comprobantes_SRI/libs/injected_bypass.js', 'modules/04_bypass.js');

copiarApoyo();
emitir('popup.html', popupConRiel());

const manifiestoFinal = manifiesto();
validarManifiesto(manifiestoFinal);
emitir('manifest.json', JSON.stringify(manifiestoFinal, null, 2) + '\n');
emitir('README.md', leerme());

function validarManifiesto(man) {
  const referencias = [];
  if (man.background && man.background.service_worker) referencias.push(man.background.service_worker);
  if (man.action && man.action.default_popup) referencias.push(man.action.default_popup);
  if (man.options_ui && man.options_ui.page) referencias.push(man.options_ui.page);
  for (const ruta of Object.values(man.icons || {})) referencias.push(ruta);
  for (const ruta of Object.values((man.action && man.action.default_icon) || {})) referencias.push(ruta);

  for (const cs of man.content_scripts || []) {
    for (const f of [...(cs.js || []), ...(cs.css || [])]) referencias.push(f);
  }
  for (const war of man.web_accessible_resources || []) {
    for (const f of war.resources || []) if (!f.includes('*')) referencias.push(f);
  }

  for (const f of referencias) {
    if (!SALIDA.has(f)) errores.push(`el manifiesto apunta a un archivo que la suite no trae: ${f}`);
  }
}

// ── Verificaciones de frescura ────────────────────────────────

function revisarFrescura() {
  const build = rutaFuente('01_Nueva_Luz_3.0/build/content.js');
  if (!existe('01_Nueva_Luz_3.0/build/content.js')) return;

  const mtimeBuild = fs.statSync(build).mtimeMs;
  const dirSrc = rutaFuente('01_Nueva_Luz_3.0/src');
  if (!fs.existsSync(dirSrc)) return;

  const fuentes = fs.readdirSync(dirSrc)
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.statSync(path.join(dirSrc, f)).mtimeMs);

  const masNueva = Math.max(...fuentes, 0);
  if (masNueva > mtimeBuild) {
    avisos.push(
      '01: `src/` es más nuevo que `build/content.js`. Corré `npm run build` dentro de ' +
      '01_Nueva_Luz_3.0 antes de compilar la suite, o la suite se lleva el bundle viejo.'
    );
  }
}

// ── Escritura / verificación ──────────────────────────────────

function huella(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function escribir() {
  // Cinturón: sólo se borra la carpeta si es exactamente <este proyecto>/suite.
  const esperado = path.join(RAIZ, 'suite');
  if (path.resolve(SUITE) !== esperado || path.basename(SUITE) !== 'suite') {
    throw new Error(`ruta de salida inesperada: ${SUITE}`);
  }

  fs.rmSync(SUITE, { recursive: true, force: true });
  for (const [rel, buf] of SALIDA) {
    const destino = path.join(SUITE, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, buf);
  }

  // node --check sobre cada módulo: un error de sintaxis acá es una extensión
  // que carga y no hace nada, sin mensaje. Mejor que falle el build.
  for (const [rel] of SALIDA) {
    if (!rel.endsWith('.js')) continue;
    const archivo = path.join(SUITE, rel);
    const res = spawnSync(process.execPath, ['--check', archivo], { encoding: 'utf8' });
    if (res.status !== 0) {
      errores.push(`sintaxis inválida en suite/${rel}:\n${(res.stderr || '').trim()}`);
    }
  }
}

function verificar() {
  const enDisco = new Map();
  if (fs.existsSync(SUITE)) {
    const recorrer = (dir) => {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(completo);
        else enDisco.set(path.relative(SUITE, completo).split(path.sep).join('/'), completo);
      }
    };
    recorrer(SUITE);
  }

  const faltan = [];
  const distintos = [];
  for (const [rel, buf] of SALIDA) {
    const destino = enDisco.get(rel);
    if (!destino) { faltan.push(rel); continue; }
    if (huella(fs.readFileSync(destino)) !== huella(buf)) distintos.push(rel);
  }
  const sobrantes = [...enDisco.keys()].filter((rel) => !SALIDA.has(rel));

  if (faltan.length) errores.push(`suite/ no tiene: ${faltan.join(', ')}`);
  if (distintos.length) errores.push(`suite/ quedó viejo en: ${distintos.join(', ')}`);
  if (sobrantes.length) avisos.push(`suite/ tiene archivos que ya no se generan: ${sobrantes.join(', ')}`);
}

// ── Informe ───────────────────────────────────────────────────

revisarFrescura();
revisarNombresReservados();


if (SOLO_VERIFICAR) verificar();
else escribir();

let total = 0;
for (const buf of SALIDA.values()) total += buf.length;

console.log(`\n🧰 Suite SC PRO v${VERSION_SUITE} — ${SOLO_VERIFICAR ? 'verificación' : 'generación'}\n`);
console.log(`  Módulos empaquetados: ${MODULOS.length + 1} (incluye el bypass de la 04)`);
console.log(`  Archivos en la suite: ${SALIDA.size}`);
console.log(`  Peso total: ${(total / 1024 / 1024).toFixed(2)} MB`);
console.log(`  Destino: ${SUITE}`);

for (const modulo of MODULOS) {
  const buf = SALIDA.get(`modules/${modulo.id}.js`);
  if (buf) console.log(`   · modules/${modulo.id}.js — ${(buf.length / 1024).toFixed(0)} KB`);
}

if (avisos.length) {
  console.log('');
  for (const a of avisos) console.log(`  ⚠  ${a}`);
}

if (errores.length) {
  console.log('');
  for (const e of errores) console.log(`  ✖  ${e}`);
  console.log(`\n${errores.length} problema(s): la suite NO queda como artefacto válido.\n`);
  process.exit(1);
}

console.log(`\n  ✅ ${SOLO_VERIFICAR ? 'suite/ está al día con las fuentes' : 'suite/ generada y validada'}\n`);
// ── Nombres reservados por Chrome ────────────────────────────────────────────
// Chrome NO ignora las carpetas ni archivos que empiezan con `_` en la raíz de
// una extensión: la rechaza entera ("Filenames starting with _ are reserved").
// Pasó con `_recorridos` y dejó cuatro extensiones sin cargar. El constructor
// corre también en CI, así que esta comprobación cierra el paso en los dos
// lados.
function revisarNombresReservados() {
  for (const carpeta of ['01_Nueva_Luz_3.0', '02_Cambio_Claves_SRI',
                         '03_Anexo_Gastos_Personales', '04_Anulador_Comprobantes_SRI', 'suite']) {
    const dir = path.join(RAIZ, carpeta);
    if (!fs.existsSync(dir)) continue;
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name.startsWith('_')) {
        errores.push(`${carpeta}/${entrada.name}: Chrome rechaza los nombres que empiezan con _ en la raíz`);
      }
    }
  }
}

