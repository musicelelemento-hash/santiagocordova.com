const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('content.js', 'utf8');
const lines = content.split('\n');

function findLine(str, startFrom = 0) {
  for (let i = startFrom; i < lines.length; i++) {
    if (lines[i].includes(str)) return i;
  }
  return -1;
}

const slices = [
  { file: 'src/01_core_utils.js', startStr: null, endStr: 'const SafeStorage = {' },
  { file: 'src/02_storage_services.js', startStr: 'const SafeStorage = {', endStr: 'SafeStorage.get(null).then(async (items) => {' },
  { file: 'src/03_init_and_auth.js', startStr: 'SafeStorage.get(null).then(async (items) => {', endStr: 'const SRI_RECIBIDOS_URL =' },
  { file: 'src/04_extractors.js', startStr: 'const SRI_RECIBIDOS_URL =', endStr: 'async function calculateEliteFinancials(targetField)' },
  { file: 'src/05_fillers.js', startStr: 'async function calculateEliteFinancials(targetField)', endStr: 'class SriAssistantPanel {' },
  { file: 'src/06_panel_ui.js', startStr: 'class SriAssistantPanel {', endStr: '// NUEVA FUNCIÓN: Navegación Wizard Declaraciones' },
  { file: 'src/07_wizards_and_toasts.js', startStr: '// NUEVA FUNCIÓN: Navegación Wizard Declaraciones', endStr: null }
];

let lastEnd = 0;
for (const slice of slices) {
  const startIdx = slice.startStr ? findLine(slice.startStr, lastEnd) : 0;
  let endIdx = slice.endStr ? findLine(slice.endStr, startIdx + 1) : lines.length;
  
  if (startIdx === -1) {
    console.error(`Could not find start for ${slice.file}`);
    continue;
  }
  if (endIdx === -1) endIdx = lines.length;
  
  // include everything from the beginning to the first slice in the first file
  const actualStart = lastEnd === 0 ? 0 : startIdx;
  const chunk = lines.slice(actualStart, endIdx).join('\n');
  
  const dir = path.dirname(slice.file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  fs.writeFileSync(slice.file, chunk);
  console.log(`Wrote ${slice.file} (${endIdx - actualStart} lines)`);
  
  lastEnd = endIdx;
}

console.log('Sequential split completed!');
