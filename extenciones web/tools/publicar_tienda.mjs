#!/usr/bin/env node
/**
 * publicar_tienda.mjs — sube a la Chrome Web Store el ZIP ya armado.
 *
 * POR QUÉ EXISTE
 * `empaquetar_tienda.mjs` arma los ZIP; subirlos era a mano y por eso la tienda
 * quedaba una versión atrás. Este script toma el ZIP de `entregables/`, lo sube
 * con la API oficial y, si se pide, lo publica.
 *
 * AUTENTICACIÓN (no hay service accounts para esta API)
 *  1. Crear un OAuth Client ID de tipo "Desktop app" en Google Cloud Console.
 *  2. Obtener un refresh token con scope https://www.googleapis.com/auth/chromewebstore
 *     (OAuth Playground o `gcloud auth application-default login` no sirven: hace falta
 *     el refresh token de un cliente Desktop).
 *  3. Definir las variables de entorno (ver `docs/PUBLICAR_TIENDA.md`).
 *     Los IDs de ítem son los que aparecen en la URL del panel de desarrollador.
 *
 * USO
 *   node "tools/publicar_tienda.mjs" --check          # valida entorno y ZIP (sin red)
 *   node "tools/publicar_tienda.mjs" --upload         # sube, no publica
 *   node "tools/publicar_tienda.mjs" --publish        # sube y publica
 *   node "tools/publicar_tienda.mjs" --status         # estado en la tienda
 *   node "tools/publicar_tienda.mjs" --upload --solo 01
 *   node "tools/publicar_tienda.mjs" --upload --solo suite
 *
 * SEGURIDAD
 *  - No imprime secretos (refresh token/token de acceso quedan enmascarados).
 *  - No escribe credenciales en disco.
 *  - Deja un registro en `entregables/PUBLICACION.json` (sin secretos).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(TOOLS, '..');
const ENTREGABLES = path.join(RAIZ, 'entregables');
const REGISTRO = path.join(ENTREGABLES, 'PUBLICACION.json');

const ITEMS = {
    '01': { env: 'CWS_ITEM_01', prefijo: 'SC-PRO-01-NuevaLuz', nombre: '01 · Nueva Luz' },
    suite: { env: 'CWS_ITEM_SUITE', prefijo: 'SC-PRO-SUITE', nombre: 'SUITE' },
};

const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const valor = (f) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
};

const MODO = tiene('--publish') ? 'publicar'
    : tiene('--upload') ? 'subir'
    : tiene('--status') ? 'estado'
    : tiene('--check') ? 'check'
    : 'check';

const SOLO = valor('--solo');
const ZIP_MANUAL = valor('--zip');

function salir(msg, codigo = 1) {
    console.error(msg);
    process.exit(codigo);
}

function enmascarar(s) {
    if (!s) return '(vacío)';
    return s.length <= 8 ? '****' : s.slice(0, 4) + '…' + s.slice(-4);
}

/** Último ZIP de la carpeta que coincide con el prefijo (los viejos se borran al empaquetar). */
function zipDe(prefijo) {
    if (ZIP_MANUAL) {
        const abs = path.resolve(process.cwd(), ZIP_MANUAL);
        if (!fs.existsSync(abs)) salir(`No existe el ZIP: ${abs}`);
        return abs;
    }
    if (!fs.existsSync(ENTREGABLES)) salir(`No existe ${ENTREGABLES}. Corré primero empaquetar_tienda.mjs.`);
    const zips = fs.readdirSync(ENTREGABLES)
        .filter((f) => f.startsWith(prefijo) && f.endsWith('.zip'))
        .map((f) => ({ f, t: fs.statSync(path.join(ENTREGABLES, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    if (!zips.length) salir(`No hay ZIP ${prefijo}*.zip en entregables/.`);
    return path.join(ENTREGABLES, zips[0].f);
}

function versionDelZip(nombre) {
    const m = /v(\d+\.\d+\.\d+)/.exec(nombre);
    return m ? m[1] : '(sin versión en el nombre)';
}

function leerEntorno() {
    const cfg = {
        clientId: process.env.CWS_CLIENT_ID || '',
        clientSecret: process.env.CWS_CLIENT_SECRET || '',
        refreshToken: process.env.CWS_REFRESH_TOKEN || '',
        publisherId: process.env.CWS_PUBLISHER_ID || '',
        items: {},
    };
    for (const [clave, def] of Object.entries(ITEMS)) {
        cfg.items[clave] = { ...def, itemId: (process.env[def.env] || '').trim() };
    }
    return cfg;
}

function problemaDeEntorno(cfg, claves) {
    const faltan = [];
    if (!cfg.clientId) faltan.push('CWS_CLIENT_ID');
    if (!cfg.clientSecret) faltan.push('CWS_CLIENT_SECRET');
    if (!cfg.refreshToken) faltan.push('CWS_REFRESH_TOKEN');
    for (const k of claves) if (!cfg.items[k].itemId) faltan.push(ITEMS[k].env);
    return faltan;
}

async function tokenDeAcceso(cfg) {
    const cuerpo = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: cfg.refreshToken,
        grant_type: 'refresh_token',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cuerpo,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
        salir(`No se pudo obtener el access token (HTTP ${res.status}): ${json.error_description || json.error || 'sin detalle'}`);
    }
    return json.access_token;
}

async function subir(token, itemId, zip, etiqueta) {
    const datos = fs.readFileSync(zip);
    const res = await fetch(
        `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${encodeURIComponent(itemId)}?uploadType=media`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'x-goog-api-version': '2',
                'Content-Type': 'application/zip',
            },
            body: datos,
        },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        salir(`⚠️ ${etiqueta}: la tienda rechazó la subida (HTTP ${res.status}): ${json.error?.message || JSON.stringify(json).slice(0, 300)}`);
    }
    const estado = json.uploadState || json.status || 'DESCONOCIDO';
    if (estado !== 'SUCCESS' && estado !== 'SUCCEEDED') {
        salir(`⚠️ ${etiqueta}: subida en estado ${estado}. ${JSON.stringify(json).slice(0, 400)}`);
    }
    console.log(`   ✅ ${etiqueta}: subido (${(datos.length / 1024).toFixed(0)} KB) · estado ${estado}`);
    return json;
}

async function publicar(token, itemId, etiqueta) {
    const res = await fetch(
        `https://www.googleapis.com/chromewebstore/v1.1/items/${encodeURIComponent(itemId)}/publish`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'x-goog-api-version': '2',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ publishTarget: 'DEFAULT_PUBLISH' }),
        },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) salir(`⚠️ ${etiqueta}: no se pudo publicar (HTTP ${res.status}): ${json.error?.message || ''}`);
    const estado = json.status?.[0] || json.status || 'PUBLICADO';
    console.log(`   📢 ${etiqueta}: publicado · estado ${estado}`);
    return json;
}

async function estado(token, itemId, etiqueta) {
    const res = await fetch(
        `https://www.googleapis.com/chromewebstore/v1.1/items/${encodeURIComponent(itemId)}?projection=DRAFT`,
        { headers: { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2' } },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) salir(`⚠️ ${etiqueta}: no se pudo leer el estado (HTTP ${res.status})`);
    const v = json.crxVersion || json.version || '(sin versión)';
    const estadoRevision = json.status || '(sin estado)';
    console.log(`   ℹ️ ${etiqueta}: tienda v${v} · estado ${estadoRevision}`);
    return json;
}

function registrar(resultado) {
    try {
        if (!fs.existsSync(ENTREGABLES)) return;
        let previo = [];
        if (fs.existsSync(REGISTRO)) {
            try { previo = JSON.parse(fs.readFileSync(REGISTRO, 'utf8')); } catch { previo = []; }
        }
        if (!Array.isArray(previo)) previo = [];
        previo.unshift(resultado);
        fs.writeFileSync(REGISTRO, JSON.stringify(previo.slice(0, 50), null, 2), 'utf8');
    } catch { /* el registro es complementario */ }
}

async function main() {
    const claves = SOLO ? [SOLO] : Object.keys(ITEMS);
    for (const k of claves) if (!ITEMS[k]) salir(`--solo inválido: ${k}. Usá 01 o suite.`);

    const cfg = leerEntorno();
    const zips = claves.map((k) => {
        const ruta = zipDe(ITEMS[k].prefijo);
        return { clave: k, ...ITEMS[k], ruta, archivo: path.basename(ruta), version: versionDelZip(path.basename(ruta)) };
    });

    console.log('📦 Paquetes a trabajar:');
    for (const z of zips) console.log(`   · ${z.nombre}: ${z.archivo} (v${z.version})`);

    if (MODO === 'check') {
        const faltan = problemaDeEntorno(cfg, claves);
        if (faltan.length) {
            console.log('\n⚠️ Faltan variables de entorno para subir:');
            console.log('   ' + faltan.join(', '));
            console.log('\n   Definilas en la sesión (nunca en un archivo commiteado):');
            console.log('   $env:CWS_CLIENT_ID = "..."');
            console.log('   $env:CWS_CLIENT_SECRET = "..."');
            console.log('   $env:CWS_REFRESH_TOKEN = "..."');
            console.log('   $env:CWS_ITEM_01 = "<id del ítem en la tienda>"');
            console.log('   $env:CWS_ITEM_SUITE = "<id del ítem en la tienda>"');
            console.log('\n   Guía completa: docs/PUBLICAR_TIENDA.md');
            console.log('\n✅ Entorno no configurado: no se tocó la tienda.');
            process.exit(2);
        }
        console.log('\n🔑 Entorno OK:');
        console.log(`   client_id ${enmascarar(cfg.clientId)} · refresh ${enmascarar(cfg.refreshToken)} · publisher ${cfg.publisherId || '(no usado)'}`);
        for (const k of claves) console.log(`   ${ITEMS[k].nombre}: item ${enmascarar(cfg.items[k].itemId)}`);
        console.log('\n✅ Listo para --upload / --publish.');
        return;
    }

    const faltan = problemaDeEntorno(cfg, claves);
    if (faltan.length) salir(`Faltan variables de entorno: ${faltan.join(', ')}. Corré --check para la guía.`, 2);

    const token = await tokenDeAcceso(cfg);
    console.log(`\n🔑 Access token obtenido (${enmascarar(token)}).`);

    for (const z of zips) {
        const itemId = cfg.items[z.clave].itemId;
        try {
            if (MODO === 'status') {
                await estado(token, itemId, z.nombre);
                continue;
            }
            await subir(token, itemId, z.ruta, z.nombre);
            if (MODO === 'publicar') await publicar(token, itemId, z.nombre);
            else console.log('   ℹ️ Subido sin publicar: se puede revisar en el panel y publicar después.');
        } catch (e) {
            salir(`⚠️ ${z.nombre}: ${e?.message || e}`);
        }
    }

    if (MODO !== 'status') {
        registrar({
            cuando: new Date().toISOString(),
            modo: MODO,
            paquetes: zips.map((z) => ({ nombre: z.nombre, archivo: z.archivo, version: z.version })),
        });
    }
    console.log('\n🎉 Terminado.');
}

main().catch((e) => salir(`Error inesperado: ${e?.message || e}`));
