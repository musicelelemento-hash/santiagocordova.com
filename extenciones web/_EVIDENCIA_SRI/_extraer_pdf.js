// Extractor mínimo de PDF: texto de los content streams + imágenes embebidas.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const file = process.argv[2];
const outDir = process.argv[3] || '.';
fs.mkdirSync(outDir, { recursive: true });
const buf = fs.readFileSync(file);
const raw = buf.toString('latin1');

// ── 1) Localizar todos los objetos "N 0 obj ... endobj" ─────────────────────
const objs = [];
const re = /(\d+)\s+0\s+obj\b/g;
let m;
while ((m = re.exec(raw)) !== null) {
  const start = m.index;
  const end = raw.indexOf('endobj', start);
  if (end === -1) continue;
  objs.push({ num: +m[1], start, end, body: raw.slice(start, end) });
}
console.log(`Objetos encontrados: ${objs.length}`);

// ── 2) Sacar el stream crudo de un objeto ───────────────────────────────────
function streamOf(o) {
  const i = o.body.indexOf('stream');
  if (i === -1) return null;
  let s = i + 6;
  if (raw[o.start + s] === '\r') s++;
  if (raw[o.start + s] === '\n') s++;
  const abs = o.start + s;
  const endRel = o.body.lastIndexOf('endstream');
  if (endRel === -1) return null;
  return buf.subarray(abs, o.start + endRel);
}

function inflate(b) {
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync, zlib.gunzipSync]) {
    try { return fn(b); } catch (e) { /* siguiente */ }
  }
  return null;
}

// ── 3) Texto ────────────────────────────────────────────────────────────────
const textos = [];
for (const o of objs) {
  const isImage = /\/Subtype\s*\/Image/.test(o.body);
  if (isImage) continue;
  const st = streamOf(o);
  if (!st) continue;
  const data = /\/FlateDecode/.test(o.body) ? inflate(st) : st;
  if (!data) continue;
  const txt = data.toString('latin1');
  if (!/\bTj\b|\bTJ\b/.test(txt)) continue;
  // (cadena) Tj   y   [(a) -10 (b)] TJ
  const partes = [];
  const rTj = /\((?:\\.|[^\\()])*\)\s*Tj/g;
  const rTJ = /\[((?:\((?:\\.|[^\\()])*\)|[^\][])*)\]\s*TJ/g;
  let x;
  while ((x = rTj.exec(txt)) !== null) partes.push(x[0].replace(/\s*Tj$/, ''));
  while ((x = rTJ.exec(txt)) !== null) {
    const inner = x[1].match(/\((?:\\.|[^\\()])*\)/g) || [];
    partes.push(inner.join(''));
  }
  const limpio = partes
    .map((p) => p.replace(/^\(|\)$/g, '').replace(/\\([()\\])/g, '$1'))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (limpio) textos.push(`[obj ${o.num}] ${limpio}`);
}

console.log('\n════════ TEXTO EXTRAÍDO ════════');
console.log(textos.length ? textos.join('\n\n') : '(sin texto: el PDF es puro imagen)');

// ── 4) Imágenes ─────────────────────────────────────────────────────────────
console.log('\n════════ IMÁGENES ════════');
let n = 0;
for (const o of objs) {
  if (!/\/Subtype\s*\/Image/.test(o.body)) continue;
  n++;
  const st = streamOf(o);
  if (!st) { console.log(`  img${n}: sin stream`); continue; }
  const w = (o.body.match(/\/Width\s+(\d+)/) || [])[1];
  const h = (o.body.match(/\/Height\s+(\d+)/) || [])[1];
  const filt = (o.body.match(/\/Filter\s*\/?(\w+)/) || [])[1] || '?';
  let ext = 'bin', data = st;
  if (/DCTDecode/.test(o.body)) ext = 'jpg';
  else if (/JPXDecode/.test(o.body)) ext = 'jp2';
  else if (/FlateDecode/.test(o.body)) {
    const inf = inflate(st);
    if (inf) {
      // Bitmap crudo -> lo envolvemos en PNG sin comprimir por scanline
      const bpc = +((o.body.match(/\/BitsPerComponent\s+(\d+)/) || [])[1] || 8);
      const dev = /DeviceRGB/.test(o.body) ? 3 : (/DeviceGray/.test(o.body) ? 1 : 3);
      data = toPng(inf, +w, +h, dev, bpc);
      ext = data ? 'png' : 'bin';
      if (!data) data = inf;
    }
  }
  const out = path.join(outDir, `img${n}.${ext}`);
  fs.writeFileSync(out, data);
  console.log(`  img${n}: ${w}x${h} filtro=${filt} -> ${out} (${data.length} bytes)`);
}
if (n === 0) console.log('  (ninguna)');

// PNG mínimo desde bitmap crudo
function toPng(rgb, w, h, channels, bpc) {
  if (!w || !h || bpc !== 8) return null;
  const colorType = channels === 1 ? 0 : 2;
  const stride = w * channels;
  if (rgb.length < stride * h) return null;
  const rawPng = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    rawPng[y * (stride + 1)] = 0;
    rgb.copy(rawPng, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const crcTable = (() => {
    const t = [];
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
    return t;
  })();
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rawPng)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
