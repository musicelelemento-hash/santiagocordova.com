#!/usr/bin/env node
/**
 * empaquetar_tienda.mjs — arma los ZIP listos para subir a la tienda
 * (Chrome Web Store / distribución directa) de las 4 extensiones y la suite.
 *
 * POR QUÉ EXISTE
 * La tienda pide un ZIP por extensión. Armarlos a mano es cómo se sube una
 * versión vieja: se compila, se olvida empaquetar, y la tienda queda atrás.
 * Este script toma SIEMPRE el estado actual de cada carpeta y lee la versión
 * del propio manifest.
 *
 * USO
 *   node "tools/empaquetar_tienda.mjs"
 *   node "tools/empaquetar_tienda.mjs" --solo 01
 *   node "tools/empaquetar_tienda.mjs" --check    (sólo lista versiones)
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(TOOLS, '..');
const SALIDA = path.join(RAIZ, 'entregables');

const OBJETIVOS = [
    { carpeta: '01_Nueva_Luz_3.0', prefijo: 'SC-PRO-01-NuevaLuz' },
    { carpeta: '02_Cambio_Claves_SRI', prefijo: 'SC-PRO-02-ClavesSRI' },
    { carpeta: '03_Anexo_Gastos_Personales', prefijo: 'SC-PRO-03-GastosPersonales' },
    { carpeta: '04_Anulador_Comprobantes_SRI', prefijo: 'SC-PRO-04-Anulador' },
    { carpeta: 'suite', prefijo: 'SC-PRO-SUITE' },
];

// Nunca dentro de un paquete de tienda: código de desarrollo, respaldos o
// builds intermedios que no se cargan en runtime.
const EXCLUIR_DIRS = new Set([
    'node_modules', '_respaldos', '_archivo', 'tests', '.git', '.claude',
    'src', 'tools', 'entregables', 'docs', 'dist', 'coverage',
    // Evidencia de Burp (recorridos) y respaldos: jamás van en la tienda.
    'recorridos', '_EVIDENCIA_SRI', 'evidencias',
]);
const EXCLUIR_ARCHIVOS = /(\.map$|\.ts$|\.md$|\.zip$|\.log$|^\.env|\.env\.)/i;

const args = process.argv.slice(2);
const soloCheck = args.includes('--check');
const soloIdx = args.indexOf('--solo');
const solo = soloIdx >= 0 ? args[soloIdx + 1] : null;

// ── ZIP mínimo multi-archivo (deflate) ───────────────────────────────────
const tablaCrc = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

const crc32 = (buf) => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = tablaCrc[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

function zipar(entradas) {
    const partes = [];
    const central = [];
    let offset = 0;
    const ahora = new Date();
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | Math.floor(ahora.getSeconds() / 2);
    const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();

    for (const e of entradas) {
        const nombre = Buffer.from(e.nombre.replace(/\\/g, '/'), 'utf8');
        const datos = e.datos;
        const comp = zlib.deflateRawSync(datos, { level: 9 });
        const crc = crc32(datos);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(hora, 10);
        local.writeUInt16LE(fecha, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(comp.length, 18);
        local.writeUInt32LE(datos.length, 22);
        local.writeUInt16LE(nombre.length, 26);
        partes.push(local, nombre, comp);

        const cab = Buffer.alloc(46);
        cab.writeUInt32LE(0x02014b50, 0);
        cab.writeUInt16LE(20, 4);
        cab.writeUInt16LE(20, 6);
        cab.writeUInt16LE(0x0800, 8);
        cab.writeUInt16LE(8, 10);
        cab.writeUInt16LE(hora, 12);
        cab.writeUInt16LE(fecha, 14);
        cab.writeUInt32LE(crc, 16);
        cab.writeUInt32LE(comp.length, 20);
        cab.writeUInt32LE(datos.length, 24);
        cab.writeUInt16LE(nombre.length, 28);
        cab.writeUInt32LE(offset, 42);
        central.push(cab, nombre);

        offset += local.length + nombre.length + comp.length;
    }

    const cb = Buffer.concat(central);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(entradas.length, 8);
    fin.writeUInt16LE(entradas.length, 10);
    fin.writeUInt32LE(cb.length, 12);
    fin.writeUInt32LE(offset, 16);
    return Buffer.concat([...partes, cb, fin]);
}

// ── Recolectar archivos ──────────────────────────────────────────────────
function recolectar(dir, prefijo) {
    const salida = [];
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(prefijo, entrada.name);
        const abs = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
            if (EXCLUIR_DIRS.has(entrada.name)) continue;
            salida.push(...recolectar(abs, rel));
        } else {
            if (EXCLUIR_ARCHIVOS.test(entrada.name)) continue;
            salida.push({ nombre: rel, datos: fs.readFileSync(abs) });
        }
    }
    return salida;
}

function versionDe(carpeta) {
    const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, carpeta, 'manifest.json'), 'utf8'));
    return { version: manifest.version, nombre: manifest.name, manifest_version: manifest.manifest_version };
}

// ── Main ─────────────────────────────────────────────────────────────────
fs.mkdirSync(SALIDA, { recursive: true });
const resumen = [];

for (const obj of OBJETIVOS) {
    if (solo && !obj.carpeta.startsWith(solo)) continue;
    const ruta = path.join(RAIZ, obj.carpeta);
    if (!fs.existsSync(ruta)) {
        console.log(`  ⚠️  falta ${obj.carpeta}`);
        continue;
    }
    const { version, nombre } = versionDe(obj.carpeta);
    if (soloCheck) {
        console.log(`  ${obj.carpeta} → v${version} · ${nombre}`);
        continue;
    }
    // Borrar paquetes viejos del mismo prefijo: la tienda debe ver UN zip por
    // extensión, no la historia completa (evita subir la versión equivocada).
    const limpiarViejos = () => {
        const sufijo = "-v" + version + ".zip";
        for (const f of fs.readdirSync(SALIDA)) {
            if (f.startsWith(obj.prefijo + "-") && f.endsWith(".zip") && !f.endsWith(sufijo)) {
                try { fs.unlinkSync(path.join(SALIDA, f)); } catch (e) {}
            }
        }
    };
    limpiarViejos();

    const archivos = recolectar(ruta, '');
    const zip = zipar(archivos);
    const nombreZip = `${obj.prefijo}-v${version}.zip`;
    const destino = path.join(SALIDA, nombreZip);
    fs.writeFileSync(destino, zip);
    const sha = crypto.createHash('sha256').update(zip).digest('hex').slice(0, 16);
    resumen.push({ archivo: nombreZip, version, archivos: archivos.length, kb: Math.round(zip.length / 1024), sha });
    console.log(`  ✅ ${nombreZip} · ${archivos.length} archivos · ${Math.round(zip.length / 1024)} KB · sha256 ${sha}`);
}

if (resumen.length) {
    fs.writeFileSync(path.join(SALIDA, 'MANIFEST_ENTREGABLES.json'), JSON.stringify({ cuando: new Date().toISOString(), paquetes: resumen }, null, 2), 'utf8');
    console.log(`\n📦 ${resumen.length} paquete(s) en ${SALIDA}`);
    console.log('   (subí cada ZIP a la tienda; MANIFEST_ENTREGABLES.json queda como registro)');
}
