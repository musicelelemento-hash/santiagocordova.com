#!/usr/bin/env node
/**
 * REBEFICS / APS — Reporte de Beneficiarios Finales y Composición Societaria.
 *
 * Genera el XML `<aps>` que el SRI recibe como anexo (ZIP), con la MISMA
 * estructura y orden de campos del formulario oficial. Validado contra el
 * archivo real `APS-20-2-2026.xml` de VIMARBO COMPANY S.A.S. (2025).
 *
 * Uso:
 *   node tools/anexo_aps.mjs --json "empresa.json" --salida "./anexos_aps"
 *   node tools/anexo_aps.mjs --json "empresa.json" --zip
 *
 * El JSON tiene esta forma (ver docs/REBEFICS_APS.md):
 * {
 *   "IdInformante": "0791844669001",
 *   "Anio": 2026, "Mes": 0, "TipoSociedad": "01", "Anticipada": "NO",
 *   "TipoDeclaracion": "01",
 *   "accionistas": [ { ...campos del esquema... } ],
 *   "beneficiarios": [ { ...campos del esquema... } ]
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const campo = (v, def = 'NA') => (v === undefined || v === null || v === '' ? def : String(v));

function construirAps(d) {
    const anio = String(d.Anio || new Date().getFullYear());
    const mes = String(d.Mes ?? 0).padStart(2, '0');
    const ruc = String(d.IdInformante || '').replace(/\D/g, '');
    const accionistas = Array.isArray(d.accionistas) ? d.accionistas : [];
    const beneficiarios = Array.isArray(d.beneficiarios) ? d.beneficiarios : [];

    const accionistaXml = accionistas.map((a) => '<accionista>'
        + `<tipoSujeto>${campo(a.tipoSujeto, '01')}</tipoSujeto>`
        + `<tipoIdentificacion>${campo(a.tipoIdentificacion, 'C')}</tipoIdentificacion>`
        + `<identificacionInformantePadre>${campo(a.identificacionInformantePadre, ruc)}</identificacionInformantePadre>`
        + `<numeroIdentificacion>${campo(a.numeroIdentificacion)}</numeroIdentificacion>`
        + `<primerNombre>${campo(a.primerNombre)}</primerNombre>`
        + `<segundoNombre>${campo(a.segundoNombre)}</segundoNombre>`
        + `<primerApellido>${campo(a.primerApellido)}</primerApellido>`
        + `<segundoApellido>${campo(a.segundoApellido)}</segundoApellido>`
        + `<nombresRazonSocial>${campo(a.nombresRazonSocial)}</nombresRazonSocial>`
        + `<tipoRegimenFiscal>${campo(a.tipoRegimenFiscal, '01')}</tipoRegimenFiscal>`
        + `<tipoSociedadExt>${campo(a.tipoSociedadExt)}</tipoSociedadExt>`
        + `<figuraJuridicaExt>${campo(a.figuraJuridicaExt)}</figuraJuridicaExt>`
        + `<figuraJuridicaOtroExt>${campo(a.figuraJuridicaOtroExt)}</figuraJuridicaOtroExt>`
        + `<esSociedadPublicaExt>${campo(a.esSociedadPublicaExt, 'NO')}</esSociedadPublicaExt>`
        + `<Menor10porc>${campo(a.Menor10porc)}</Menor10porc>`
        + `<porcentajeAccionarioNoBolsaExt>${campo(a.porcentajeAccionarioNoBolsaExt, '0.0')}</porcentajeAccionarioNoBolsaExt>`
        + `<porcentajeAccionarioBolsaExt>${campo(a.porcentajeAccionarioBolsaExt, '0.0')}</porcentajeAccionarioBolsaExt>`
        + `<esBeneficiarioFinal>${campo(a.esBeneficiarioFinal, 'SI')}</esBeneficiarioFinal>`
        + '<infoParticipacionAccionaria>'
        + `<codigoNivel>${campo(a.codigoNivel ?? a.infoParticipacionAccionaria?.codigoNivel, '1')}</codigoNivel>`
        + `<tipoRelacionadoSociedad>${campo(a.tipoRelacionadoSociedad ?? a.infoParticipacionAccionaria?.tipoRelacionadoSociedad, '10')}</tipoRelacionadoSociedad>`
        + `<porcentajeParticipacion>${campo(a.porcentajeParticipacion ?? a.infoParticipacionAccionaria?.porcentajeParticipacion, '0.0')}</porcentajeParticipacion>`
        + `<parteRelacionadaInformante>${campo(a.parteRelacionadaInformante ?? a.infoParticipacionAccionaria?.parteRelacionadaInformante, 'NO')}</parteRelacionadaInformante>`
        + '</infoParticipacionAccionaria>'
        + '<ubicacionResidenciaFiscal>'
        + `<paisResidenciaFiscal>${campo(a.paisResidenciaFiscal ?? a.ubicacionResidenciaFiscal?.paisResidenciaFiscal, '593')}</paisResidenciaFiscal>`
        + '</ubicacionResidenciaFiscal>'
        + '</accionista>').join('');

    const beneficiarioXml = beneficiarios.map((b) => '<beneficiario>'
        + `<tipoIdentificacion>${campo(b.tipoIdentificacion, 'C')}</tipoIdentificacion>`
        + `<numeroIdentificacion>${campo(b.numeroIdentificacion)}</numeroIdentificacion>`
        + `<primerNombre>${campo(b.primerNombre)}</primerNombre>`
        + `<segundoNombre>${campo(b.segundoNombre)}</segundoNombre>`
        + `<primerApellido>${campo(b.primerApellido)}</primerApellido>`
        + `<segundoApellido>${campo(b.segundoApellido)}</segundoApellido>`
        + `<fechaNacimiento>${campo(b.fechaNacimiento)}</fechaNacimiento>`
        + `<porPropiedad>${campo(b.porPropiedad, 'SI')}</porPropiedad>`
        + `<porcentajePropiedad>${campo(b.porcentajePropiedad, '0')}</porcentajePropiedad>`
        + `<porOtrosMotivos>${campo(b.porOtrosMotivos, '01')}</porOtrosMotivos>`
        + `<porOtrosRelacionados>${campo(b.porOtrosRelacionados)}</porOtrosRelacionados>`
        + `<porAdministracion>${campo(b.porAdministracion)}</porAdministracion>`
        + `<nacionalidadUno>${campo(b.nacionalidadUno, '593')}</nacionalidadUno>`
        + `<nacionalidadDos>${campo(b.nacionalidadDos)}</nacionalidadDos>`
        + `<nacionalidadTres>${campo(b.nacionalidadTres)}</nacionalidadTres>`
        + `<residenciaFiscal>${campo(b.residenciaFiscal, '593')}</residenciaFiscal>`
        + `<jurisdiccion>${campo(b.jurisdiccion)}</jurisdiccion>`
        + `<provincia>${campo(b.provincia)}</provincia>`
        + `<ciudad>${campo(b.ciudad)}</ciudad>`
        + `<canton>${campo(b.canton)}</canton>`
        + `<parroquia>${campo(b.parroquia)}</parroquia>`
        + `<calle>${campo(b.calle, 'SN')}</calle>`
        + `<numero>${campo(b.numero, 'SN')}</numero>`
        + `<interseccion>${campo(b.interseccion, 'SN')}</interseccion>`
        + `<codigoPostal>${campo(b.codigoPostal)}</codigoPostal>`
        + `<referencia>${campo(b.referencia, 'SN')}</referencia>`
        + '</beneficiario>').join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?><aps>'
        + `<TipoIDInformante>${campo(d.TipoIDInformante, 'R')}</TipoIDInformante>`
        + `<IdInformante>${ruc}</IdInformante>`
        + `<TipoSociedad>${campo(d.TipoSociedad, '01')}</TipoSociedad>`
        + `<Anio>${anio}</Anio>`
        + `<Mes>${mes}</Mes>`
        + `<PorcentajeAccionarioNoBolsa>${campo(d.PorcentajeAccionarioNoBolsa, '0.00')}</PorcentajeAccionarioNoBolsa>`
        + '<codigoOperativo>APS</codigoOperativo>'
        + `<PorcentajeAccionarioBolsa>${campo(d.PorcentajeAccionarioBolsa, '0.00')}</PorcentajeAccionarioBolsa>`
        + `<Anticipada>${campo(d.Anticipada, 'NO')}</Anticipada>`
        + `<TipoDeclaracion>${campo(d.TipoDeclaracion, '01')}</TipoDeclaracion>`
        + `<accionistas>${accionistaXml}</accionistas>`
        + `<beneficiarios>${beneficiarioXml}</beneficiarios>`
        + '</aps>';
}

// ── ZIP (deflate), igual que los anexos del SRI ───────────────────────────
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
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const ahora = new Date();
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | Math.floor(ahora.getSeconds() / 2);
    const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(hora, 10); local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12); central.writeUInt16LE(fecha, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBuf.length, 28);
    const inicioCentral = 30 + nombreBuf.length + comp.length;
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10);
    fin.writeUInt32LE(central.length + nombreBuf.length, 12); fin.writeUInt32LE(inicioCentral, 16);
    return Buffer.concat([local, nombreBuf, comp, central, nombreBuf, fin]);
}

// ── CLI ───────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = process.argv[i + 1];
    if (v && !v.startsWith('--')) { args[k] = v; i++; } else args[k] = true;
}

if (!args.json) {
    console.error('Falta --json <archivo> con los datos de la empresa.');
    process.exit(1);
}
const datos = JSON.parse(fs.readFileSync(path.resolve(String(args.json)), 'utf8').replace(/^\uFEFF/, ''));
const xml = construirAps(datos);
const salida = path.resolve(String(args.salida || path.join(process.cwd(), 'anexos_aps')));
fs.mkdirSync(salida, { recursive: true });
const anio = String(datos.Anio || new Date().getFullYear());
const mes = String(datos.Mes ?? 0).padStart(2, '0');
const ruc = String(datos.IdInformante || '').replace(/\D/g, '');
const nombreXml = `APS-${anio}-${mes}.xml`;
fs.writeFileSync(path.join(salida, nombreXml), xml, 'utf8');
console.log(`APS generado: ${nombreXml} (${xml.length} car.)`);
if (args.zip) {
    // El SRI nombra los ZIP con un número interno (ej. Anexo_APS_78194660.zip).
    // --nombre permite reproducir ese nombre exacto.
    const nombreZip = String(args.nombre || `Anexo_APS_${ruc}.zip`);
    fs.writeFileSync(path.join(salida, nombreZip), zipDeUnArchivo(nombreXml, xml));
    console.log(`ZIP: ${nombreZip}`);
}
console.log(`Carpeta: ${salida}`);
