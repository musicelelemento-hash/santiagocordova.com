import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, readFileSync } from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
const libsUrl = pathToFileURL(join(here, '..', 'libs', 'pdf.mjs')).href;
const fixturesDir = join(here, 'fixtures');

class DOMMatrixStub {
    constructor(init) { this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0; if (init && typeof init === 'string') { const p = init.replace(/matrix\(/,'').split(/[,)]/).map(Number); if(p.length>=6){[this.a,this.b,this.c,this.d,this.e,this.f]=p;} } }
    multiply(m){ return this; }
    translate(x,y){ return this; }
    scale(x,y){ return this; }
    rotate(r){ return this; }
    inverse(){ return this; }
    transformPoint(p){ return { x:(p.x||0), y:(p.y||0), z:(p.z||0), w:(p.w||1) }; }
    get is2D(){ return true; }
    get isIdentity(){ return true; }
    new(){ return this; }
}
class ImageDataStub { constructor(w,h){ this.width=w; this.height=h; this.data=new Uint8ClampedArray(w*h*4);} }
class Path2DStub { constructor(){ this.commands=[]; } moveTo(){} lineTo(){} closePath(){} rect(){} arc(){} bezierCurveTo(){} quadraticCurveTo(){} ellipse(){} }
const getContext = () => ({});

const stubs = {
    DOMMatrix: DOMMatrixStub,
    DOMPoint: class { constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;} },
    ImageData: ImageDataStub,
    Path2D: Path2DStub,
    CanvasRenderingContext2D: function(){},
    HTMLCanvasElement: class { getContext(){ return getContext(); } width=0; height=0; },
    OffscreenCanvas: class { getContext(){ return getContext(); } width=0; height=0; },
    Node: class {},
    HTMLImageElement: class { get src(){} set src(v){} },
    Image: class {},
    DOMParser: class { parseFromString(){ return { documentElement: { childNodes: [] } }; } },
    document: { createElement: () => ({ getContext(){return getContext();}, style:{}, appendChild(){}, addEventListener(){} }), },
};
for (const [k, v] of Object.entries(stubs)) {
    if (!(k in globalThis)) globalThis[k] = v;
}

const pdfjs = await import(libsUrl);

const pdfs = readdirSync(fixturesDir).filter(f => f.toLowerCase().endsWith('.pdf'));
let total = 0, ok = 0;
for (const f of pdfs) {
    const bytes = readFileSync(join(fixturesDir, f));
    try {
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false }).promise;
        let fullText = '';
        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const tc = await page.getTextContent();
            fullText += tc.items.map(i => i.str).join(' ');
        }
        total++;
        const hasSpanish = /FACTURA|RUC|CLAVE|AUTORIZACI|SUBTOTAL|EMISI|CONTRIBUYENTE|IDENTIFICACI/i.test(fullText);
        if (hasSpanish) ok++;
        console.log('PDF:', f);
        console.log('  texto:', JSON.stringify(fullText.slice(0, 200)));
        console.log('  ¿texto legible?:', hasSpanish ? 'SÍ' : 'NO (ofuscado)');
    } catch (e) {
        total++;
        console.log('ERROR en', f, '->', e.message?.slice(0, 200));
    }
}
console.log(`\n📊 RESULTADO: ${ok}/${total} PDFs con texto legible.`);
process.exit(ok === total ? 0 : 1);