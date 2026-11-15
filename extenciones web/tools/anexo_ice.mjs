#!/usr/bin/env node
/**
 * Anexo ICE mensual — CHAVEZ CORDOVA GUIDO ERMEL (y cualquier cliente ICE).
 *
 * Genera el XML que se sube al SRI cada mes y su ZIP, idénticos al que ya se
 * presentó: los mismos parámetros (producto, tipo de venta, sin ventas) y sólo
 * cambian el año y el mes.
 *
 * Uso:
 *   node tools/anexo_ice.mjs                      → el mes anterior (el que toca declarar)
 *   node tools/anexo_ice.mjs --mes 2026-10        → un mes concreto
 *   node tools/anexo_ice.mjs --mes 2026-10 --todos → octubre y los 11 siguientes
 *   node tools/anexo_ice.mjs --ruc 0706482023001 --nombre "CHAVEZ CORDOVA GUIDO ERMEL"
 *   node tools/anexo_ice.mjs --salida "C:/Users/Usuario/Downloads/Anexo_PVP_80310525"
 *
 * Sale:  ICE-<año>-<ruc> <MES>.xml  y  ICE-<año>-<ruc> <MES>.zip
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

const DEFAULTS = {
    ruc: '0706482023001',
    nombre: 'CHAVEZ CORDOVA GUIDO ERMEL',
    codProdICE: '3031-053-049147-013-000750-66-593-000012',
    gramoAzucar: '0.00',
    tipoIdCliente: 'F',
    idCliente: '9999999999999',
    tipoVentaICE: '1',
    actImport: '02',
    salida: path.resolve(process.cwd(), 'anexos_ice'),
};

/**
 * XML del anexo. Sin ventas va una sola línea en cero (como el presentado);
 * con ventas, una línea por producto con sus importes.
 */
function construirXml(cfg, anio, mes) {
    const dos = String(mes).padStart(2, '0');
    const productos = Array.isArray(cfg.productos) && cfg.productos.length
        ? cfg.productos
        : [{
            codProdICE: cfg.codProdICE,
            gramoAzucar: cfg.gramoAzucar,
            tipoIdCliente: cfg.tipoIdCliente,
            idCliente: cfg.idCliente,
            tipoVentaICE: cfg.tipoVentaICE,
            ventaICE: 0,
            devICE: 0,
            cantProdBajaICE: 0,
        }];
    // Formatos EXACTOS del anexo presentado: gramos con 2 decimales,
    // importes en cero como "0" y con decimales como "123.45".
    const gramos = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(2) : '0.00';
    };
    const importe = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n === 0) return '0';
        return n.toFixed(2);
    };
    const lineas = productos.map((pr) => '<vta>'
        + `<codProdICE>${pr.codProdICE}</codProdICE>`
        + `<gramoAzucar>${gramos(pr.gramoAzucar)}</gramoAzucar>`
        + `<tipoIdCliente>${pr.tipoIdCliente || cfg.tipoIdCliente}</tipoIdCliente>`
        + `<idCliente>${pr.idCliente || cfg.idCliente}</idCliente>`
        + `<tipoVentaICE>${pr.tipoVentaICE || cfg.tipoVentaICE}</tipoVentaICE>`
        + `<ventaICE>${importe(pr.ventaICE)}</ventaICE>`
        + `<devICE>${importe(pr.devICE)}</devICE>`
        + `<cantProdBajaICE>${Number(pr.cantProdBajaICE) || 0}</cantProdBajaICE>`
        + '</vta>').join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
        + '<ice>'
        + `<TipoIDInformante>${cfg.tipoIDInformante || 'R'}</TipoIDInformante>`
        + `<IdInformante>${cfg.ruc}</IdInformante>`
        + `<razonSocial>${cfg.nombre}</razonSocial>`
        + `<Anio>${anio}</Anio>`
        + `<Mes>${dos}</Mes>`
        + `<actImport>${cfg.actImport}</actImport>`
        + '<codigoOperativo>ICE</codigoOperativo>'
        + `<ventas>${lineas}</ventas>`
        + '</ice>';
}
// ── ZIP mínimo (un archivo, sin comprimir): lo que pide el portal ──────────
function crc32(buf) {
    let c;
    const tabla = crc32.tabla || (crc32.tabla = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })());
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = tabla[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function zipDeUnArchivo(nombre, contenido) {
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    const comprimido = zlib.deflateRawSync(datos, { level: 9 });
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const ahora = new Date();
    const hora = ((ahora.getHours() << 11) | (ahora.getMinutes() << 5) | Math.floor(ahora.getSeconds() / 2)) & 0xffff;
    const fecha = (((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate()) & 0xffff;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);          // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(fecha, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(0, 42);

    const inicioCentral = 30 + nombreBuf.length + comprimido.length;
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(1, 8);
    fin.writeUInt16LE(1, 10);
    fin.writeUInt32LE(central.length + nombreBuf.length, 12);
    fin.writeUInt32LE(inicioCentral, 16);

    return Buffer.concat([local, nombreBuf, comprimido, central, nombreBuf, fin]);
}

// ── CLI ────────────────────────────────────────────────────────────────────
function leerArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const clave = a.slice(2);
        if (clave === 'todos') { args.todos = true; continue; }
        const valor = argv[i + 1];
        if (valor && !valor.startsWith('--')) { args[clave] = valor; i++; }
        else args[clave] = true;
    }
    return args;
}

/** Publica las ventas del anexo en la nube: clients.tax_profile.ice_ventas[periodo]. */
async function publicarVentas(cfg, anio, mes, productos, salida) {
    const rutaConf = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../01_Nueva_Luz_3.0/shared_config.js');
    if (!fs.existsSync(rutaConf)) { console.warn('  [publicar] no encontré shared_config.js'); return; }
    const conf = fs.readFileSync(rutaConf, 'utf8');
    const url = (conf.match(/SUPABASE_URL\s*:\s*['\"]([^'\"]+)['\"]/) || [])[1];
    const clave = (conf.match(/SUPABASE_ANON_KEY\s*:\s*['\"]+([^'\"]+)['\"]/) || [])[1];
    if (!url || !clave) { console.warn('  [publicar] sin URL o clave'); return; }
    const cab = { apikey: clave, Authorization: 'Bearer ' + clave, 'Content-Type': 'application/json' };
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const suma = (campo) => productos.reduce((s, pr) => s + (Number(pr[campo]) || 0), 0);
    const datos = {
        periodo,
        productos,
        ventaTotal: Number(suma('ventaICE').toFixed(2)),
        devolucionTotal: Number(suma('devICE').toFixed(2)),
        gramosAzucar: Number(suma('gramoAzucar').toFixed(2)),
        actualizado: new Date().toISOString(),
    };
    try {
        const r = await fetch(`${url}/rest/v1/clients?ruc=eq.${cfg.ruc}&select=id,tax_profile`, { headers: cab });
        const filas = await r.json();
        if (!Array.isArray(filas) || !filas.length) { console.warn(`  [publicar] no hay cliente con RUC ${cfg.ruc}`); return; }
        const cli = filas[0];
        const tp = cli.tax_profile || {};
        const ice = { ...(tp.ice_ventas || {}) };
        ice[periodo] = datos;
        const patch = await fetch(`${url}/rest/v1/clients?id=eq.${cli.id}`, {
            method: 'PATCH', headers: cab,
            body: JSON.stringify({ tax_profile: { ...tp, ice_ventas: ice } }),
        });
        if (patch.ok) console.log(`  [publicar] ventas de ${periodo} guardadas en la nube: ${datos.ventaTotal}`);
        else console.warn(`  [publicar] la nube respondió ${patch.status}: ${(await patch.text()).slice(0, 120)}`);
    } catch (e) {
        console.warn(`  [publicar] no se pudo publicar: ${e && e.message}`);
    }
}
async function main() {
    const args = leerArgs(process.argv);
    const cfg = { ...DEFAULTS };
    for (const k of ['ruc', 'nombre', 'codProdICE', 'idCliente', 'tipoVentaICE', 'actImport', 'salida']) {
        if (typeof args[k] === 'string') cfg[k] = args[k];
    }

    // Ventas del mes: o por JSON (varias líneas de producto) o por parámetros.
    if (typeof args.json === 'string') {
        const rutaJson = path.resolve(args.json);
        const crudo = fs.readFileSync(rutaJson, 'utf8').replace(/^\uFEFF/, '');
        const datos = JSON.parse(crudo);
        if (Array.isArray(datos)) cfg.productos = datos;
        else if (Array.isArray(datos.productos)) cfg.productos = datos.productos;
        else throw new Error('El JSON debe tener { "productos": [ ... ] }');
        if (datos.ruc) cfg.ruc = String(datos.ruc);
        if (datos.nombre) cfg.nombre = String(datos.nombre);
        console.log(`Ventas leídas de ${path.basename(rutaJson)}: ${cfg.productos.length} producto(s)`);
    } else if (args.ventas !== undefined || args.devoluciones !== undefined || args.gramos !== undefined || args.bajas !== undefined) {
        cfg.productos = [{
            codProdICE: cfg.codProdICE,
            gramoAzucar: Number(args.gramos || 0),
            tipoIdCliente: cfg.tipoIdCliente,
            idCliente: cfg.idCliente,
            tipoVentaICE: cfg.tipoVentaICE,
            ventaICE: Number(args.ventas || 0),
            devICE: Number(args.devoluciones || 0),
            cantProdBajaICE: Number(args.bajas || 0),
        }];
        console.log(`Ventas del mes: venta ${Number(args.ventas || 0).toFixed(2)} · devolución ${Number(args.devoluciones || 0).toFixed(2)} · bajas ${Number(args.bajas || 0)}`);
    }

    const conVentas = Array.isArray(cfg.productos);
    if (conVentas && args.todos) {
        console.error('Con ventas se genera un solo mes: quitá --todos.');
        process.exit(1);
    }

    let base;
    if (typeof args.mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(args.mes)) {
        const [y, m] = args.mes.split('-').map(Number);
        base = new Date(y, m - 1, 1);
    } else {
        const hoy = new Date();
        base = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    }

    fs.mkdirSync(cfg.salida, { recursive: true });
    const cantidad = args.todos ? 12 : 1;
    const hechos = [];

    for (let i = 0; i < cantidad; i++) {
        const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const anio = d.getFullYear();
        const mes = d.getMonth() + 1;
        const xml = construirXml(cfg, anio, mes);
        const nombre = `ICE-${anio}-${cfg.ruc} ${MESES[mes - 1]}`;
        const rutaXml = path.join(cfg.salida, `${nombre}.xml`);
        const rutaZip = path.join(cfg.salida, `${nombre}.zip`);
        // El DIMM pide el ZIP como AICEmmaaaa.zip (ej. AICE102026.zip).
        const nombreAice = `AICE${String(mes).padStart(2, '0')}${anio}`;
        const rutaAice = path.join(cfg.salida, `${nombreAice}.zip`);
        fs.writeFileSync(rutaXml, xml, 'utf8');
        const contenidoZip = zipDeUnArchivo(`${nombre}.xml`, xml);
        fs.writeFileSync(rutaZip, contenidoZip);
        fs.writeFileSync(rutaAice, contenidoZip);
        hechos.push({ mes: `${MESES_LARGO[mes - 1]} ${anio}`, xml: rutaXml, zip: rutaZip, aice: rutaAice });
        if (args.publicar) {
            await publicarVentas(cfg, anio, mes, cfg.productos || [{ codProdICE: cfg.codProdICE, gramoAzucar: 0, ventaICE: 0, devICE: 0, cantProdBajaICE: 0 }], cfg.salida);
        }
    }

    console.log(`Anexo ICE · ${cfg.nombre} · RUC ${cfg.ruc}${conVentas ? ' · CON VENTAS' : ' · sin ventas'}`);
    for (const h of hechos) {
        console.log(`  ${h.mes.padEnd(20)} → ${path.basename(h.xml)} · ${path.basename(h.aice)} (para el SRI)`);
    }
    console.log(`\nCarpeta: ${cfg.salida}`);
}
main().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
