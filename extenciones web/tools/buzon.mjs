// Lector del buzón de sugerencias — pensado para gastar el mínimo de contexto.
//
//   node "extenciones web/tools/buzon.mjs"            → pendientes, una línea c/u
//   node "extenciones web/tools/buzon.mjs" --todo     → incluye aplicadas/descartadas
//   node "extenciones web/tools/buzon.mjs" --json     → JSON crudo (para scripts)
//
// Toma la URL y la clave anon de 01_Nueva_Luz_3.0/shared_config.js (son públicas).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(AQUI, '..', '01_Nueva_Luz_3.0', 'shared_config.js');

const args = process.argv.slice(2);
const TODO = args.includes('--todo');
const JSON_SALIDA = args.includes('--json');
const LIMITE = 40;

function leerConfig() {
  try {
    const txt = fs.readFileSync(CONFIG, 'utf8');
    const url = (txt.match(/SUPABASE_URL\s*:\s*['"]([^'"]+)['"]/) || [])[1] || '';
    const key = (txt.match(/SUPABASE_ANON_KEY\s*:\s*['"]([^'"]+)['"]/) || [])[1] || '';
    return { url, key };
  } catch (e) {
    return { url: '', key: '' };
  }
}

const { url, key } = leerConfig();
if (!url || !key) {
  console.log('No encontré la configuración de Supabase en shared_config.js.');
  process.exit(1);
}

const filtro = TODO ? '' : '&status=eq.pendiente';
const endpoint = `${url}/rest/v1/suggestions?select=level,area,texto,status,created_at&order=created_at.desc&limit=${LIMITE}${filtro}`;

try {
  const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.log(`No pude leer el buzón (HTTP ${res.status}). ¿Corriste database/suggestions.sql?`);
    process.exit(1);
  }
  const filas = await res.json();
  if (JSON_SALIDA) {
    console.log(JSON.stringify(filas, null, 2));
    process.exit(0);
  }
  if (!filas.length) {
    console.log(TODO ? 'Buzón vacío.' : 'Sin sugerencias pendientes.');
    process.exit(0);
  }

  const corto = (t, n = 110) => String(t || '').replace(/\s+/g, ' ').slice(0, n);
  const fecha = (iso) => String(iso || '').slice(0, 10);
  for (const f of filas) {
    console.log(`[${String(f.level).toUpperCase()}] ${f.area} · ${corto(f.texto)} (${fecha(f.created_at)}${f.status !== 'pendiente' ? ' · ' + f.status : ''})`);
  }
  console.log(`\n${filas.length} entrada(s).`);
} catch (e) {
  console.log('Error leyendo el buzón:', e && e.message);
  process.exit(1);
}
