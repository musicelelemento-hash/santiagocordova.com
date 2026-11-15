// Genera el banco de prueba de 2000 clientes para el popup 01.
// Uso:  node "extenciones web/tools/bench/generar_bench.mjs"
//
// Crea `bench_2000.html`: una copia del popup real con `chrome.storage`
// simulado y 2000 clientes sintéticos. El popup corre su código de verdad, así
// que lo que mide es lo mismo que ve el usuario.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(AQUI, '..', '..', '01_Nueva_Luz_3.0');

function ruc(i) {
  const cuerpo = String(100000000 + i * 7).slice(-9);
  const d9 = i % 10;
  return `09${cuerpo.slice(0, 6)}${d9}001`;
}

const clientes = Array.from({ length: 2000 }, (_, i) => ({
  id: `c-${i}`,
  ruc: ruc(i),
  name: `CLIENTE PRUEBA ${String(i + 1).padStart(4, '0')}`,
  regime: i % 7 === 0 ? 'RIMPE Negocio Popular' : 'Régimen General',
  tax_profile: { ivaFrequency: 'Mensual' },
  declaration_history: i % 5 === 0 ? [{ period: '2026-09', status: 'Enviada' }] : [],
  password: i % 11 === 0 ? '' : 'clave-de-prueba',
  isActive: true,
  isDeleted: false,
}));

const popup = fs.readFileSync(path.join(EXT, 'popup.html'), 'utf8');

const stub = `
<script>
  window.__DATASET__ = ${JSON.stringify(clientes)};
  window.__ERRORES__ = [];
  window.addEventListener('error', (e) => window.__ERRORES__.push(String(e.message)));
  const st = {
    sc_clients_cache: window.__DATASET__,
    sc_clients_cache_ts: Date.now(),
    sc_lista_bendita: null,
    sc_clientes_baja: [],
    sc_declaraciones_locales: {},
    flagged_errors: {},
    sri_target_period: { year: 2026, monthIndex: 9 },
  };
  window.chrome = {
    storage: {
      local: {
        get: (claves, cb) => {
          const salida = {};
          (Array.isArray(claves) ? claves : [claves]).forEach((k) => { if (k in st) salida[k] = st[k]; });
          setTimeout(() => cb(salida), 0);
        },
        set: (obj, cb) => { Object.assign(st, obj); if (cb) setTimeout(cb, 0); },
        remove: (k, cb) => { if (cb) setTimeout(cb, 0); },
      },
      onChanged: { addListener: () => {} },
    },
    runtime: { getManifest: () => ({ version: '3.2.0' }), lastError: null, sendMessage: () => {}, onMessage: { addListener: () => {} } },
    tabs: { query: async () => [], sendMessage: () => {}, update: () => {} },
  };
</script>
`;

const medidor = `
<script>
  window.addEventListener('load', () => {
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const salida = {
        total: window.__DATASET__.length,
        tarjetas: document.querySelectorAll('.client-card').length,
        pendientes: (document.getElementById('countPendientes') || {}).textContent || '?',
        completados: (document.getElementById('countCompletados') || {}).textContent || '?',
        msRender: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
        errores: window.__ERRORES__.slice(0, 3),
      };
      const pre = document.createElement('pre');
      pre.id = 'bench-out';
      pre.textContent = 'BENCH ' + JSON.stringify(salida);
      document.body.appendChild(pre);
    }, 1200);
  });
</script>
`;

let html = popup.replace('<script src="shared_config.js"></script>', stub);
html = html.replace('<script src="popup.js"></script>', '<script src="../../01_Nueva_Luz_3.0/popup.js"></script>');
html = html.replace('</body>', medidor + '\n</body>');

fs.writeFileSync(path.join(AQUI, 'bench_2000.html'), html, 'utf8');
console.log(`banco: ${clientes.length} clientes · ${Math.round(html.length / 1024)} KB`);
