let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(data); } catch { process.exit(0); }
  const f = (input.tool_input && input.tool_input.file_path) || '';
  const g = f.replace(/\\/g, '/');
  const blocked = /Contrase[^/]*Chrome\.csv$/.test(g)
    || /import_passwords\.js$/.test(g)
    || /\.env/.test(g);
  if (blocked) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Bloqueado por regla de seguridad del proyecto (CLAUDE.md): credenciales, exports de contraseñas y archivos .env nunca se leen ni editan desde la sesión.'
      }
    }));
  }
});
