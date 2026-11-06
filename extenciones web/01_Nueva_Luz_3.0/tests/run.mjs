#!/usr/bin/env node
// ============================================================
// Runner headless de los bancos — Nueva Luz 3.0
// ============================================================
// Corre `tests/index.html?auto=1` en Chrome headless, sin dependencias: usa
// el Chrome ya instalado y el WebSocket nativo de Node (>= 22).
//
//   npm test              → los 24 bancos, sale 0 si están todos verdes
//   npm test -- --headed  → muestra el navegador (para mirar cuando falla)
//   PORT=8899 npm test    → otro puerto
//
// Por qué existe: los 888 checks sólo corrían si alguien abría la página y
// hacía clic. Un banco roto podía pasar días sin que nadie lo viera. Esto lo
// convierte en un comando que puede correr en CI o antes de cada build.
// ============================================================

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADED = process.argv.includes('--headed');
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT || 600000);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un puerto libre a partir de `inicio`, para no chocar con un server abierto. */
async function puertoLibre(inicio) {
  for (let p = inicio; p < inicio + 40; p++) {
    const libre = await new Promise((resolve) => {
      const s = net.createServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(p, '127.0.0.1');
    });
    if (libre) return p;
  }
  throw new Error('No hay puerto libre entre ' + inicio + ' y ' + (inicio + 40));
}

/** Sirve la carpeta de la extensión tal cual: /tests/… y /build/… */
function crearServidor(puerto) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/tests/index.html';
      const archivo = path.resolve(RAIZ, '.' + rel);
      if (!archivo.startsWith(RAIZ)) { res.writeHead(403); res.end('fuera de la carpeta'); return; }

      const datos = await fsp.readFile(archivo);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(datos);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('no existe: ' + req.url);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(puerto, '127.0.0.1', () => resolve(server));
  });
}

function rutaDeChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidatos.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } }) || '';
}

/** Cliente CDP mínimo sobre el WebSocket nativo. */
function conectarCDP(url, alEvento) {
  const ws = new WebSocket(url);
  let id = 0;
  const pendientes = new Map();

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (!msg.id) { if (alEvento) alEvento(msg); return; }
    if (!pendientes.has(msg.id)) return;
    const { resolve, reject } = pendientes.get(msg.id);
    pendientes.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
    else resolve(msg.result);
  });

  const abierto = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('No se pudo conectar al DevTools de Chrome')), { once: true });
  });

  return {
    abierto,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const n = ++id;
        pendientes.set(n, { resolve, reject });
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    },
    cerrar() { try { ws.close(); } catch (e) { /* da igual */ } }
  };
}

async function evaluar(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false });
  if (r && r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || ''));
  }
  return r && r.result ? r.result.value : undefined;
}

async function main() {
  const chrome = rutaDeChrome();
  if (!chrome) {
    console.error('❌ No encontré Chrome ni Edge. Definí CHROME_PATH con la ruta al ejecutable.');
    process.exit(2);
  }

  const puertoWeb = await puertoLibre(8791);
  const puertoDev = await puertoLibre(9333);
  const perfil = await fsp.mkdtemp(path.join(os.tmpdir(), 'nueva-luz-tests-'));

  const server = await crearServidor(puertoWeb);
  const url = `http://127.0.0.1:${puertoWeb}/tests/index.html?auto=1`;
  console.log(`\n🧪 Bancos de Nueva Luz 3.0`);
  console.log(`   ${url}\n`);

  const args = [
    HEADED ? '--new-window' : '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // Los bancos usan timers reales (hasta 30 s en crédito). Sin esto, Chrome
    // frena los iframes ocultos y un banco sano parece un timeout.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `--remote-debugging-port=${puertoDev}`,
    `--user-data-dir=${perfil}`,
    'about:blank'
  ];

  const proc = spawn(chrome, args, { stdio: 'ignore' });
  let cdp = null;
  const eventos = [];

  try {
    // Esperar a que DevTools conteste.
    let version = null;
    for (let i = 0; i < 60 && !version; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${puertoDev}/json/version`);
        if (r.ok) version = await r.json();
      } catch (e) { /* todavía arrancando */ }
      if (!version) await dormir(250);
    }
    if (!version) throw new Error('Chrome no abrió el puerto de DevTools');

    const lista = await (await fetch(`http://127.0.0.1:${puertoDev}/json/list`)).json();
    const pagina = lista.find((t) => t.type === 'page');
    if (!pagina) throw new Error('Chrome no tiene ninguna pestaña');

    cdp = conectarCDP(pagina.webSocketDebuggerUrl, (msg) => {
      if (msg.method === 'Page.frameNavigated' && !msg.params.frame.parentId) {
        eventos.push('nav: ' + msg.params.frame.url);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        eventos.push('exc: ' + (msg.params.exceptionDetails.text || '') +
          ' ' + ((msg.params.exceptionDetails.exception || {}).description || ''));
      }
    });
    await cdp.abierto;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url });

    // Esperar el veredicto. `?auto=1` lo deja en body.dataset.
    const arranque = Date.now();
    let estado = '';
    let estadoPrevio = null;
    while (Date.now() - arranque < TIMEOUT_MS) {
      try {
        estado = await evaluar(cdp, "document.body ? (document.body.dataset.testEstado || '') : ''");
      } catch (e) { estado = ''; }
      if (estado !== estadoPrevio) {
        if (process.env.DEBUG_RUNNER) console.log(`   · ${((Date.now() - arranque) / 1000).toFixed(1)}s estado=${estado || '(vacío)'}`);
        estadoPrevio = estado;
      }
      if (estado === 'ok' || estado === 'mal' || estado === 'error') break;
      await dormir(1000);
    }

    if (!estado) throw new Error(`Los bancos no terminaron en ${Math.round(TIMEOUT_MS / 1000)} s`);

    // El estado y el objeto se escriben casi juntos, pero no exactamente:
    // reintentar unos segundos evita un falso negativo si el runner llega en
    // el hueco entre uno y otro (o si la página se está re-renderizando).
    let crudo = null;
    for (let i = 0; i < 20 && !crudo; i++) {
      crudo = await evaluar(cdp, "JSON.stringify(window.__testResultado || null)");
      if (!crudo) await dormir(250);
    }
    const res = crudo ? JSON.parse(crudo) : null;
    if (!res) {
      const diag = await evaluar(cdp, "JSON.stringify({estado:document.body&&document.body.dataset.testEstado,resumen:document.body&&document.body.dataset.testResumen,titulo:document.title,tipo:typeof window.__testResultado})");
      throw new Error('La página no dejó el resultado en window.__testResultado · ' + diag +
        (eventos.length ? '\n   eventos:\n   ' + eventos.join('\n   ') : ''));
    }

    if (res.error) {
      console.error('\n❌ El runner de bancos explotó:\n' + res.error);
      process.exitCode = 1;
      return;
    }

    for (const b of res.bancos) {
      const seg = (b.ms / 1000).toFixed(1) + 's';
      if (b.estado === 'ok') console.log(`   ✓ ${String(b.total).padStart(3)}  ${b.archivo.padEnd(22)} ${seg}`);
      else if (b.estado === 'mal') {
        console.log(`   ✗ ${String(b.fallaron).padStart(3)}  ${b.archivo.padEnd(22)} ${seg}`);
        if (b.detalle) console.log(b.detalle.split('\n').map((l) => '        ' + l).join('\n'));
      } else {
        console.log(`   ⏱      ${b.archivo.padEnd(22)} ${seg}  (no terminó)`);
      }
    }

    console.log('');
    if (res.ok) {
      console.log(`✅ ${res.totales} comprobaciones, todas bien (${Math.round((Date.now() - arranque) / 1000)} s).`);
    } else {
      console.log(`❌ ${res.fallos} fallaron de ${res.totales || 0}` +
                  (res.rotos ? ` · ${res.rotos} banco(s) no terminaron` : '') + '.');
      process.exitCode = 1;
    }
  } finally {
    if (cdp) cdp.cerrar();
    try { proc.kill(); } catch (e) { /* da igual */ }
    server.close();
    await dormir(300);
    try { await fsp.rm(perfil, { recursive: true, force: true }); } catch (e) { /* puede estar en uso */ }
  }
}

main().catch((e) => {
  console.error('\n❌ ' + ((e && e.stack) || e));
  process.exit(1);
});
