#!/usr/bin/env node
/**
 * ATS — Anexo Transaccional Simplificado (mensual).
 *
 * Genera el XML `<iva>` que el SRI recibe como ZIP, con la MISMA estructura y
 * formato del archivo que presentó el contador anterior de VIMARBO.
 * Validado byte a byte contra los 7 ATS reales (enero–julio 2026).
 *
 * Uso:
 *   node tools/anexo_ats.mjs --json "ats.json" --zip
 *
 * JSON:
 * {
 *   "cabecera": { "IdInformante": "...", "razonSocial": "...", "Anio": 2026, "Mes": 5, "numEstabRuc": "001", "totalVentas": "0.00" },
 *   "compras": [ { codSustento, tpIdProv, idProv, tipoComprobante, parteRel, fechaRegistro,
 *                  establecimiento, puntoEmision, secuencial, fechaEmision, autorizacion,
 *                  baseNoGraIva, baseImponible, baseImpGrav, baseImpExe, montoIce, montoIva,
 *                  valRetBien10, valRetServ20, valorRetBienes, valRetServ50,
 *                  valorRetServicios, valRetServ100, totbasesImpReemb,
 *                  pagoExterior: { pagoLocExt, paisEfecPago, aplicConvDobTrib, pagExtSujRetNorLeg, pagoRegFis },
 *                  formasDePago?: ["20"], docModificado?, estabModificado?, ptoEmiModificado?, secModificado?, autModificado? } ],
 *   "ventasEstablecimiento": [ { codEstab: "001", ventasEstab: "0", ivaComp: "0" } ]
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const v = (x, def = '') => (x === undefined || x === null ? def : String(x));

function construirAts(d) {
    const c = d.cabecera || {};
    const compras = Array.isArray(d.compras) ? d.compras : [];
    const ventasEst = Array.isArray(d.ventasEstablecimiento) ? d.ventasEstablecimiento : [];

    const detalle = compras.map((x) => {
        const pe = x.pagoExterior || {};
        return [
            '    <detalleCompras>',
            `      <codSustento>${v(x.codSustento)}</codSustento>`,
            `      <tpIdProv>${v(x.tpIdProv)}</tpIdProv>`,
            `      <idProv>${v(x.idProv)}</idProv>`,
            `      <tipoComprobante>${v(x.tipoComprobante)}</tipoComprobante>`,
            `      <parteRel>${v(x.parteRel)}</parteRel>`,
            `      <fechaRegistro>${v(x.fechaRegistro)}</fechaRegistro>`,
            `      <establecimiento>${v(x.establecimiento)}</establecimiento>`,
            `      <puntoEmision>${v(x.puntoEmision)}</puntoEmision>`,
            `      <secuencial>${v(x.secuencial)}</secuencial>`,
            `      <fechaEmision>${v(x.fechaEmision)}</fechaEmision>`,
            `      <autorizacion>${v(x.autorizacion)}</autorizacion>`,
            `      <baseNoGraIva>${v(x.baseNoGraIva, '0')}</baseNoGraIva>`,
            `      <baseImponible>${v(x.baseImponible, '0')}</baseImponible>`,
            `      <baseImpGrav>${v(x.baseImpGrav, '0')}</baseImpGrav>`,
            `      <baseImpExe>${v(x.baseImpExe, '0')}</baseImpExe>`,
            `      <montoIce>${v(x.montoIce, '0')}</montoIce>`,
            `      <montoIva>${v(x.montoIva, '0')}</montoIva>`,
            `      <valRetBien10>${v(x.valRetBien10, '0')}</valRetBien10>`,
            `      <valRetServ20>${v(x.valRetServ20, '0')}</valRetServ20>`,
            `      <valorRetBienes>${v(x.valorRetBienes, '0')}</valorRetBienes>`,
            `      <valRetServ50>${v(x.valRetServ50, '0')}</valRetServ50>`,
            `      <valorRetServicios>${v(x.valorRetServicios, '0')}</valorRetServicios>`,
            `      <valRetServ100>${v(x.valRetServ100, '0')}</valRetServ100>`,
            `      <totbasesImpReemb>${v(x.totbasesImpReemb, '           0.00')}</totbasesImpReemb>`,
            '      <pagoExterior>',
            `        <pagoLocExt>${v(pe.pagoLocExt, '01')}</pagoLocExt>`,
            `        <paisEfecPago>${v(pe.paisEfecPago, 'NA')}</paisEfecPago>`,
            `        <aplicConvDobTrib>${v(pe.aplicConvDobTrib, 'NA')}</aplicConvDobTrib>`,
            `        <pagExtSujRetNorLeg>${v(pe.pagExtSujRetNorLeg, 'NA')}</pagExtSujRetNorLeg>`,
            `        <pagoRegFis>${v(pe.pagoRegFis, 'NA')}</pagoRegFis>`,
            '      </pagoExterior>',
            ...(Array.isArray(x.formasDePago) && x.formasDePago.length
                ? ['      <formasDePago>', ...x.formasDePago.map((f) => `        <formaPago>${v(f)}</formaPago>`), '      </formasDePago>']
                : []),
            ...(x.docModificado ? [`      <docModificado>${v(x.docModificado)}</docModificado>`] : []),
            ...(x.estabModificado ? [`      <estabModificado>${v(x.estabModificado)}</estabModificado>`] : []),
            ...(x.ptoEmiModificado ? [`      <ptoEmiModificado>${v(x.ptoEmiModificado)}</ptoEmiModificado>`] : []),
            ...(x.secModificado ? [`      <secModificado>${v(x.secModificado)}</secModificado>`] : []),
            ...(x.autModificado ? [`      <autModificado>${v(x.autModificado)}</autModificado>`] : []),
            '    </detalleCompras>',
        ].join('\n');
    }).join('\n');

    const ventaEst = ventasEst.map((x) => [
        '    <ventaEst>',
        `      <codEstab>${v(x.codEstab, '001')}</codEstab>`,
        `      <ventasEstab>${v(x.ventasEstab, '0')}</ventasEstab>`,
        `      <ivaComp>${v(x.ivaComp, '0')}</ivaComp>`,
        '    </ventaEst>',
    ].join('\n')).join('\n');

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<iva>',
        `  <TipoIDInformante>${v(c.TipoIDInformante, 'R')}</TipoIDInformante>`,
        `  <IdInformante>${v(c.IdInformante)}</IdInformante>`,
        `  <razonSocial>${v(c.razonSocial)}</razonSocial>`,
        `  <Anio>${v(c.Anio)}</Anio>`,
        `  <Mes>${String(v(c.Mes)).padStart(2, '0')}</Mes>`,
        `  <numEstabRuc>${v(c.numEstabRuc, '001')}</numEstabRuc>`,
        `  <totalVentas>${v(c.totalVentas, '0.00')}</totalVentas>`,
        `  <codigoOperativo>${v(c.codigoOperativo, 'IVA')}</codigoOperativo>`,
        '  <compras>',
        detalle,
        '  </compras>',
        '  <ventasEstablecimiento>',
        ventaEst,
        '  </ventasEstablecimiento>',
        '</iva>',
        '',
    ].join('\n');
}

// ── ZIP (deflate) ─────────────────────────────────────────────────────────
function crc32(buf) {
    let c;
    const t = crc32._t || (crc32._t = (() => {
        const x = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; x[n] = c >>> 0; }
        return x;
    })());
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function zipDeUnArchivo(nombre, contenido) {
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    const comp = zlib.deflateRawSync(datos, { level: 9 });
    const nb = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const ahora = new Date();
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | Math.floor(ahora.getSeconds() / 2);
    const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(hora, 10); local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nb.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12); central.writeUInt16LE(fecha, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nb.length, 28);
    const inicioCentral = 30 + nb.length + comp.length;
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10);
    fin.writeUInt32LE(central.length + nb.length, 12); fin.writeUInt32LE(inicioCentral, 16);
    return Buffer.concat([local, nb, comp, central, nb, fin]);
}

// ── CLI ───────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const nxt = process.argv[i + 1];
    if (nxt && !nxt.startsWith('--')) { args[k] = nxt; i++; } else args[k] = true;
}

if (!args.json) {
    console.error('Falta --json <archivo> con los datos del ATS.');
    process.exit(1);
}
const datos = JSON.parse(fs.readFileSync(path.resolve(String(args.json)), 'utf8').replace(/^\uFEFF/, ''));
const xml = construirAts(datos);
const salida = path.resolve(String(args.salida || path.join(process.cwd(), 'anexos_ats')));
fs.mkdirSync(salida, { recursive: true });
const anio = v((datos.cabecera || {}).Anio, new Date().getFullYear());
const mes = String(v((datos.cabecera || {}).Mes, 0)).padStart(2, '0');
const ruc = v((datos.cabecera || {}).IdInformante).replace(/\D/g, '');
const nombreXml = `ATS-${anio}-${mes}.xml`;
fs.writeFileSync(path.join(salida, nombreXml), xml, 'utf8');
console.log(`ATS generado: ${nombreXml} (${xml.length} car.)`);
if (args.zip) {
    // El SRI nombra los ZIP con un número interno (ej. Anexo_APS_78194660.zip).
    // --nombre permite reproducir ese nombre exacto.
    const nombreZip = String(args.nombre || `Anexo_IVA_${ruc}.zip`);
    fs.writeFileSync(path.join(salida, nombreZip), zipDeUnArchivo(nombreXml, xml));
    console.log(`ZIP: ${nombreZip}`);
}
console.log(`Carpeta: ${salida}`);
