// Genera REGLAMENTO_SRI.md (copia legible) desde reglas_sri.js.
// Uso: node tools/generar_reglamento.js
// La copia vive en _EVIDENCIA_SRI/REGLAMENTO_SRI.md. Se regenera, no se edita a mano.
const fs = require('fs');
const path = require('path');

const aqui = __dirname;
const ext = path.resolve(aqui, '..');
const raiz = path.resolve(ext, '..', '..'); // SantiagoCordova.com
const src = path.join(ext, 'reglas_sri.js');
const out = path.join(raiz, 'extenciones web', '_EVIDENCIA_SRI', 'REGLAMENTO_SRI.md');

// Cargar reglas_sri.js sin ejecutarlo en un navegador: se lee y se evalúa en un
// sandbox mínimo con window/globalThis simulados.
const codigo = fs.readFileSync(src, 'utf8');
const sandbox = { window: {}, globalThis: {} };
const fn = new Function('window', 'globalThis', codigo + '\nreturn (globalThis.REGLAMENTO_SRI || window.REGLAMENTO_SRI);');
const R = fn(sandbox.window, sandbox.globalThis);

const TIPO = { ley: '⚖️ Ley (criterio contable)', portal: '🏛️ Portal (evidencia)', bot: '🤖 Bot (seguridad)' };
const SEV = { critica: '🔴 crítica', aviso: '🟠 aviso' };
const ESTADO = {
  vigente: '✅ vigente',
  requiere_contador: '👤 espera al contador',
  pendiente_evidencia: '🔎 pendiente de evidencia (📐)'
};

const lineas = [];
lineas.push('# 📜 REGLAMENTO SRI — Nueva Luz 3.0');
lineas.push('');
lineas.push(`> Generado automáticamente desde \`reglas_sri.js\` (versión ${R.version}, ${R.actualizado}).`);
lineas.push('> **No se edita a mano**: se regenera con `node tools/generar_reglamento.js`.');
lineas.push('> La fuente ejecutable y verificable es el archivo de código; esta copia es para leer.');
lineas.push('');
lineas.push('Cada regla tiene un `id` **inmutable**: si se borra o cambia, el banco');
lineas.push('`tests/reglas.html` falla. Ninguna regla se rompe en silencio.');
lineas.push('');
lineas.push(`**${R.reglas.length} reglas** · ${R.criticas().length} críticas · ` +
  `${R.porEstado('requiere_contador').length} esperan al contador · ` +
  `${R.porEstado('pendiente_evidencia').length} pendientes de evidencia.`);
lineas.push('');
lineas.push('---');
lineas.push('');

const grupos = { ley: [], portal: [], bot: [] };
R.reglas.forEach(r => (grupos[r.tipo] = grupos[r.tipo] || []).push(r));

for (const tipo of ['ley', 'portal', 'bot']) {
  const lista = grupos[tipo] || [];
  if (!lista.length) continue;
  lineas.push(`## ${TIPO[tipo]} (${lista.length})`);
  lineas.push('');
  for (const r of lista) {
    lineas.push(`### ${r.id} — ${SEV[r.severidad]} · ${ESTADO[r.estado] || r.estado}`);
    lineas.push('');
    lineas.push(`**Regla:** ${r.regla}`);
    lineas.push('');
    lineas.push(`**Por qué:** ${r.porque}`);
    lineas.push('');
    if (r.fuente) {
      const fs2 = [];
      if (r.fuente.doc) fs2.push(r.fuente.doc);
      if (r.fuente.biblia) fs2.push(r.fuente.biblia);
      if (r.fuente.evidencia) fs2.push(r.fuente.evidencia);
      if (fs2.length) lineas.push(`**Fuente:** ${fs2.join(' · ')}`);
    }
    if (r.accion) lineas.push(`**Acción:** ${r.accion}`);
    if (Array.isArray(r.cobertura) && r.cobertura.length) {
      lineas.push(`**Cobertura (bancos):** ${r.cobertura.map(b => '`' + b + '`').join(' ')}`);
    }
    lineas.push('');
    lineas.push('---');
    lineas.push('');
  }
}

lineas.push('## 🔎 Evidencia primaria sin transcribir');
lineas.push('');
lineas.push('- `_EVIDENCIA_SRI/codigo_fuente_decl_iva_mes.pdf` (view-source del portal, 09-sep-2026)');
lineas.push('- `_EVIDENCIA_SRI/formulario_iva_mensual_sep_2026.pdf` (formulario real sep-2026)');
lineas.push('');
lineas.push('Ningún id de este reglamento se tomó de esos PDFs sin pasar por el 📐.');
lineas.push('Cuando se transcriban, se citan en `fuente.evidencia` de la regla correspondiente.');

fs.writeFileSync(out, lineas.join('\n'), 'utf8');
console.log(`✅ REGLAMENTO_SRI.md generado: ${out} (${R.reglas.length} reglas)`);
