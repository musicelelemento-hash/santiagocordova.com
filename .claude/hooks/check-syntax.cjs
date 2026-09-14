const { execFileSync } = require('child_process');

let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(data); } catch { process.exit(0); }
  const f = (input.tool_input && input.tool_input.file_path)
    || (input.tool_response && input.tool_response.filePath)
    || '';
  const g = f.replace(/\\/g, '/');
  if (!/extenciones web\/01_Nueva_Luz_3\.0\/src\/.*\.js$/.test(g)) process.exit(0);

  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : e.message).slice(0, 800);
    console.log(JSON.stringify({
      decision: 'block',
      reason: `node --check encontró un error de sintaxis en ${f}:\n${msg}`
    }));
  }
});
