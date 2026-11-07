const fs = require('fs');
const P = 'M34 67 L54 87 L95 43';
// Trazo optico por tamano (en unidades del lienzo de 128)
const STROKE = { 16: 17, 32: 11, 48: 8.5, 128: 13 };

function svg(size) {
  const sw = STROKE[size];
  const brillo = size >= 48
    ? '<rect x="6" y="3" width="116" height="60" rx="24" fill="url(#br)"/>'
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0F2438"/><stop offset="1" stop-color="#061320"/>
    </linearGradient>
    <linearGradient id="ck" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#10B981"/><stop offset="1" stop-color="#5EEAD4"/>
    </linearGradient>
    <linearGradient id="br" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <rect x="0.75" y="0.75" width="126.5" height="126.5" rx="27.25" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="1.5"/>
  ${brillo}
  <path d="${P}" fill="none" stroke="url(#ck)" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(`icono-propuesto-${size}.svg`, svg(size), 'utf8');
  fs.writeFileSync(`_r-${size}.html`,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}img{display:block}</style></head><body><img src="icono-propuesto-${size}.svg" width="${size}" height="${size}"></body></html>`, 'utf8');
}
fs.writeFileSync('icono-propuesto.svg', svg(128), 'utf8');
console.log('ok');
