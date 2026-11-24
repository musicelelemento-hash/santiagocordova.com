// SessionStart: en la nube (claude.ai/code) deja el workspace como en la PC.
// En local no hace nada: CLAUDE_CODE_REMOTE solo existe en la nube.
const { spawnSync } = require('child_process');
const path = require('path');

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);

const raiz = path.resolve(__dirname, '..', '..');
const r = spawnSync('bash', [path.join(raiz, 'tools', 'preparar_nube.sh')], {
  cwd: raiz, encoding: 'utf8', timeout: 9 * 60 * 1000,
});
const salida = ((r.stdout || '') + (r.stderr || '')).trim().slice(-2500);

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext:
      'Sesion en la nube: se corrio tools/preparar_nube.sh. Resultado:\n' + salida +
      '\nSi algo dice FALTA o FALLO, decirselo al usuario antes de trabajar en eso.',
  },
}));
