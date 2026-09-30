import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, readFileSync } from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
const libsUrl = pathToFileURL(join(here, '..', 'libs', 'pdf.mjs')).href;
const fixturesDir = join(here, 'fixtures');

const stubs = {
    DOMMatrix: class { constructor(i){this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;} multiply(){return this;} translate(){return this;} scale(){return this;} rotate(){return this;} inverse(){return this;} transformPoint(p){return {x:p?.x||0,y:p?.y||0,z:0,w:1};} },
    DOMPoint: class { constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;} },
    ImageData: class { constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);} },
    Path2D: class {},
    HTMLCanvasElement: class { getContext(){return {};} },
    OffscreenCanvas: class { getContext(){return {};} },
};
for (const [k, v] of Object.entries(stubs)) if (!(k in globalThis)) globalThis[k] = v;

const pdfjs = await import(libsUrl);
const { readdirSync: rds, readFileSync: rfs } = await import('fs');
const { join: jn } = await import('path');

function extractDataFromText(text) {
    text = text.replace(/\s+/g, ' ');
    const get = (re) => (text.match(re) || [])[1] || '';
    let clave = get(/CLAVE\s*(?:DE\s+)?ACCESO[\s\S]*?(\d{49})/i);
    if (!clave) { const any49 = text.match(/\b\d{49}\b/); if (any49) clave = any49[0]; }
    let tipoComprobante = '';
    if (clave && clave.length === 49) {
        const map = { '01': 'FACTURA', '03': 'LIQUIDACION DE COMPRA', '04': 'NOTA DE CREDITO', '05': 'NOTA DE DEBITO', '06': 'GUIA DE REMISION', '07': 'COMPROBANTE DE RETENCION' };
        tipoComprobante = map[clave.substring(8, 10)] || '';
    }
    if (!tipoComprobante) {
        if (text.match(/FACTURA/i)) tipoComprobante = 'FACTURA';
        else if (text.match(/NOTA\s*DE\s*CR[ÉE]DITO/i)) tipoComprobante = 'NOTA DE CREDITO';
        else if (text.match(/COMPROBANTE\s*DE\s*RETENCI[ÓO]N/i)) tipoComprobante = 'COMPROBANTE DE RETENCION';
        else if (text.match(/LIQUIDACI[ÓO]N\s*DE\s*COMPRA/i)) tipoComprobante = 'LIQUIDACION DE COMPRA';
    }
    let fecha = '';
    const fechaAutMatch = text.match(/(?:Fecha\s*(?:y\s*hora)?\s*(?:de)?\s*autorizaci[óo]n)[\s\S]*?(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    if (fechaAutMatch) fecha = fechaAutMatch[1];
    if (!fecha) {
        const fechaEmisionMatch = text.match(/Fecha\s*(?:de)?\s*Emisi[óo]n.*?(?:(\d{2})[\/\-](\d{2})[\/\-](\d{4})|(\d{4})[\/\-](\d{2})[\/\-](\d{2}))/i);
        if (fechaEmisionMatch) { if (fechaEmisionMatch[1]) fecha = `${fechaEmisionMatch[1]}/${fechaEmisionMatch[2]}/${fechaEmisionMatch[3]}`; else if (fechaEmisionMatch[4]) fecha = `${fechaEmisionMatch[6]}/${fechaEmisionMatch[5]}/${fechaEmisionMatch[4]}`; }
    }
    if (!fecha) {
        const meses = { 'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06', 'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
            'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12' };
        const fechaTextoMatch = text.match(/(\d{1,2})\s+([a-z]{3,12})\s*[\/ \.]+\s*(\d{4})/i);
        if (fechaTextoMatch) {
            const d = fechaTextoMatch[1].padStart(2, '0');
            const m = meses[fechaTextoMatch[2].toLowerCase().substring(0, 3)];
            const y = fechaTextoMatch[3];
            if (m) fecha = `${d}/${m}/${y}`;
        }
    }
    if (!fecha) {
        const dMatch = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/) || text.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
        if (dMatch) fecha = dMatch[1].length === 4 ? `${dMatch[3]}/${dMatch[2]}/${dMatch[1]}` : `${dMatch[1]}/${dMatch[2]}/${dMatch[3]}`;
    }
    if (!fecha && clave.length === 49) fecha = `${clave.substring(0, 2)}/${clave.substring(2, 4)}/${clave.substring(4, 8)}`;

    const rucEmisor = clave.length === 49 ? clave.substring(10, 23) : '';
    let idReceptor = '';

    const directMatch = text.match(/(?:Identificaci[óo]n|RUC\s*\/\s*CI|RUC\s+Receptor|Identificaci[óo]n\s+Receptor|Comprador.*?Identificaci[óo]n)[:\s]+(\d{10,13})/i);
    if (directMatch && directMatch[1] && directMatch[1] !== rucEmisor && !directMatch[1].startsWith('001001') && !directMatch[1].startsWith('001002')) idReceptor = directMatch[1];

    if (!idReceptor) {
        const compradorSec = text.match(/(?:Raz[óo]n\s*Social|Nombres\s*y\s*Apellidos|Se[ñn]or\(es\)|Comprador)[\s\S]*?(?:RUC|Identificaci[óo]n|CI)[:\s]+(\d{10,13})/i);
        if (compradorSec && compradorSec[1] && compradorSec[1] !== rucEmisor) idReceptor = compradorSec[1];
    }
    if (!idReceptor) {
        const rucMatches = text.match(/\b\d{10,13}\b/g) || [];
        const candidates = rucMatches.filter(r => {
            if (r === rucEmisor) return false;
            if (clave && clave.includes(r)) return false;
            if (/^00[1-9]00[1-9]/.test(r)) return false;
            if (r.length === 13 && !r.endsWith('001')) return false;
            if (r.length === 10 && !/^(0[1-9]|1[0-9]|2[0-4]|30)/.test(r)) return false;
            return true;
        });
        if (candidates.length > 0) idReceptor = candidates[0];
    }
    if (!idReceptor) idReceptor = (text.match(/(?:RUC|Identificaci[óo]n|CI|R\.U\.C).*?(\d{10,13})/) || [])[1] || '';

    let email = '';
    const infoAdicPos = text.search(/Informaci[óo]n\s*Adicional/i);
    if (infoAdicPos !== -1) {
        const sub = text.substring(infoAdicPos);
        const emailMatch = sub.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) email = emailMatch[1];
    }
    if (!email) {
        const razonPos = text.search(/Raz[óo]n\s*Social|Comprador|Cliente/i);
        if (razonPos !== -1) {
            const sub = text.substring(razonPos);
            const emailMatch = sub.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch) email = emailMatch[1];
        }
    }
    if (!email) {
        const allEmails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        if (allEmails.length > 0) email = allEmails[allEmails.length - 1];
    }

    return { claveAcceso: clave, fecha, idReceptor, email, tipoComprobante };
}

const pdfs = rds(fixturesDir).filter(f => f.toLowerCase().endsWith('.pdf'));
let total = 0, ok = 0;
for (const f of pdfs) {
    const bytes = rfs(jn(fixturesDir, f));
    try {
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
        let fullText = '';
        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const tc = await page.getTextContent();
            fullText += tc.items.map(i => i.str).join(' ');
        }
        const r = extractDataFromText(fullText);
        total++;
        if (r.tipoComprobante && r.claveAcceso && r.fecha && r.idReceptor) ok++; else console.log('⚠️  Pendientes en', f);
        console.log('PDF:', f, '=>', r.tipoComprobante, '| clave OK:', !!r.claveAcceso, '| RUC:', r.idReceptor, '| fecha:', r.fecha);
    } catch (e) {
        total++;
        console.log('ERROR en', f, '->', e.message?.slice(0, 120));
    }
}
console.log(`\n📊 RESULTADO: ${ok}/${total} PDFs con campos esenciales extraídos.`);
process.exit(ok === total ? 0 : 1);