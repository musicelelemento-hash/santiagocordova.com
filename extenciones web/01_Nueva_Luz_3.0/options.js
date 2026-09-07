// ============================================================
// AJUSTES — Nueva Luz 3.0
// ============================================================
// Página de opciones de la extensión. Se abre con clic derecho en el ícono →
// «Opciones», desde chrome://extensions → Detalles, o con el ⚙️ del popup.
//
// Existe por una razón concreta: las claves NO pueden vivir en
// `shared_config.js`. Ese archivo está en el repositorio —lo que se escribe ahí
// queda en el historial de git para siempre— y además viaja dentro de la
// extensión, que se inyecta en cada página del SRI.
//
// Acá van a `chrome.storage.local`: solo en esta computadora, sin versionar y
// sin distribuir. Y la página NUNCA muestra el valor guardado.
// ============================================================

const CLAVE_IA = 'sc_ia_credenciales';
const CLAVE_R2 = 'sc_r2_credenciales';
const CLAVE_WEB = 'sc_supabase_credenciales';

const $ = (id) => document.getElementById(id);

/**
 * «guardada · termina en …4KbAQ (39 caracteres)», nunca el valor entero.
 *
 * Seis caracteres alcanzan para saber cuál de dos claves está puesta y no
 * alcanzan para nada más.
 */
function comoTermina(valor) {
    if (!valor) return 'no hay ninguna guardada';
    const v = String(valor);
    return `guardada · termina en …${v.slice(-6)} (${v.length} caracteres)`;
}

async function pintarEstado() {
    const g = await chrome.storage.local.get([CLAVE_IA, CLAVE_R2, CLAVE_WEB]);
    const ia = (g[CLAVE_IA] || {}).apiKey;
    const r2 = (g[CLAVE_R2] || {}).R2_SECRET_ACCESS_KEY;

    $('estadoIa').textContent = comoTermina(ia);
    $('estadoIa').dataset.hay = ia ? 'si' : 'no';
    $('estadoR2').textContent = comoTermina(r2);
    $('estadoR2').dataset.hay = r2 ? 'si' : 'no';

    // El Access Key ID no es secreto —viaja en cada petición firmada—, así que
    // se muestra entero: sirve para comprobar de un vistazo que quedó el nuevo.
    const id = (g[CLAVE_R2] || {}).R2_ACCESS_KEY_ID;
    $('estadoIdR2').textContent = id || 'no hay ninguno guardado (se usa el del código)';
    $('estadoIdR2').dataset.hay = id ? 'si' : 'no';

    const web = (g[CLAVE_WEB] || {}).SUPABASE_ANON_KEY;
    $('estadoWeb').textContent = web ? comoTermina(web) : 'no hay ninguna guardada (se usa la del código)';
    $('estadoWeb').dataset.hay = web ? 'si' : 'no';
}

function avisar(texto) {
    const el = $('aviso-flotante');
    // El aviso es cortesía, no parte del guardado: si no está, no puede tumbar
    // la operación que ya se hizo.
    if (!el) { console.log('[Ajustes] ' + texto); return; }
    el.textContent = texto;
    el.style.opacity = '1';
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}

async function guardar() {
    const campoIa = $('claveIa');
    const campoR2 = $('claveR2');
    const cambios = {};

    // Un campo vacío significa «no la toques», no «borrala»: para borrar está
    // el botón de al lado, que lo dice con todas las letras.
    if (campoIa.value.trim()) {
        cambios[CLAVE_IA] = { apiKey: campoIa.value.trim(), cuando: Date.now() };
    }
    // Los dos de R2 van juntos en la misma llave: rotar cambia ambos.
    const campoIdR2 = $('idR2');
    if (campoR2.value.trim() || campoIdR2.value.trim()) {
        const previo = (await chrome.storage.local.get([CLAVE_R2]))[CLAVE_R2] || {};
        const nuevo = { ...previo, cuando: Date.now() };
        if (campoR2.value.trim()) nuevo.R2_SECRET_ACCESS_KEY = campoR2.value.trim();
        if (campoIdR2.value.trim()) nuevo.R2_ACCESS_KEY_ID = campoIdR2.value.trim();
        cambios[CLAVE_R2] = nuevo;
    }

    const campoWeb = $('claveWeb');
    if (campoWeb.value.trim()) {
        cambios[CLAVE_WEB] = { SUPABASE_ANON_KEY: campoWeb.value.trim(), cuando: Date.now() };
    }

    if (!Object.keys(cambios).length) { avisar('No escribiste ninguna clave'); return; }

    await chrome.storage.local.set(cambios);
    // Que no quede en pantalla ni en el DOM más de lo necesario.
    campoIa.value = '';
    campoR2.value = '';
    campoIdR2.value = '';
    campoWeb.value = '';
    await pintarEstado();
    avisar('🔑 Guardada fuera del código');
}

/**
 * Borra UNA credencial y deja las demás en paz.
 *
 * @param {'ia'|'r2'|'idR2'|'web'} cual
 */
async function borrarUna(cual) {
    if (cual === 'ia') {
        await chrome.storage.local.remove([CLAVE_IA]);
        $('claveIa').value = '';
        avisar('🗑️ Borrada la clave de IA. Las demás quedan como estaban.');
    } else if (cual === 'web') {
        await chrome.storage.local.remove([CLAVE_WEB]);
        $('claveWeb').value = '';
        avisar('🗑️ Borrada la llave de Supabase. Vuelve a usarse la del código.');
    } else {
        // Las dos de R2 viven en la misma llave del almacén, así que se saca
        // sólo el campo pedido y se conserva el otro: rotar el secreto sin
        // perder el Access Key ID es un caso normal.
        const previo = (await chrome.storage.local.get([CLAVE_R2]))[CLAVE_R2] || {};
        const campo = cual === 'idR2' ? 'R2_ACCESS_KEY_ID' : 'R2_SECRET_ACCESS_KEY';
        delete previo[campo];
        const quedaAlgo = previo.R2_ACCESS_KEY_ID || previo.R2_SECRET_ACCESS_KEY;
        if (quedaAlgo) await chrome.storage.local.set({ [CLAVE_R2]: previo });
        else await chrome.storage.local.remove([CLAVE_R2]);
        $(cual === 'idR2' ? 'idR2' : 'claveR2').value = '';
        avisar(cual === 'idR2'
            ? '🗑️ Borrado el Access Key ID de R2. La clave secreta queda.'
            : '🗑️ Borrada la clave secreta de R2. El Access Key ID queda.');
    }
    await pintarEstado();
}

async function borrar() {
    await chrome.storage.local.remove([CLAVE_IA, CLAVE_R2, CLAVE_WEB]);
    $('claveIa').value = '';
    $('claveR2').value = '';
    $('idR2').value = '';
    $('claveWeb').value = '';
    await pintarEstado();
    avisar('🗑️ Borradas del almacén');
}

/**
 * Prueba los tres caminos de subida y muestra por qué falla cada uno.
 *
 * El trabajo lo hace el service worker: un `fetch` desde acá estaría sujeto a
 * CORS, que es exactamente lo que tuvo rota la subida durante meses.
 */
async function probarSubida() {
    const salida = $('resultadoPrueba');
    const boton = $('btnProbarSubida');
    salida.style.display = 'block';
    salida.textContent = 'Probando…';
    boton.disabled = true;

    try {
        const cfg = (typeof window !== 'undefined' && window.SC_CONFIG) || {};
        const r = await chrome.runtime.sendMessage({ tipo: 'SC_DIAGNOSTICO_SUBIDA', config: cfg });

        if (!r) { salida.textContent = 'El service worker no contestó. Recargá la extensión.'; return; }

        const lineas = [r.ok ? '✅ La subida funciona.' : '❌ Ningún camino funcionó.'];
        if (r.via) lineas.push(`   camino que sirvió: ${r.via}`);
        lineas.push('');
        (r.intentos || []).forEach((i) => {
            if (i.omitido) lineas.push(`· ${i.via}: ${i.omitido}`);
            else if (i.error) lineas.push(`· ${i.via}: ${i.error}`);
            else lineas.push(`· ${i.via}: ${i.ok ? 'bien' : 'no'}${i.estado ? ' (HTTP ' + i.estado + ')' : ''}`);
        });
        if (r.configurado) {
            lineas.push('', 'Configurado:');
            Object.keys(r.configurado).forEach((k) => {
                lineas.push(`   ${k}: ${r.configurado[k] ? 'sí' : 'no'}`);
            });
        }
        salida.textContent = lineas.join('\n');
    } catch (e) {
        salida.textContent = 'No se pudo hablar con el service worker: ' + e.message +
            '\nSi la extensión se acaba de actualizar, recargala en chrome://extensions.';
    } finally {
        boton.disabled = false;
    }
}

async function pintarEstadoBovedaClientes() {
    const el = $('estadoBovedaClientes');
    if (!el) return;
    try {
        const res = await chrome.storage.local.get(['sc_clients_cache']);
        const list = Array.isArray(res.sc_clients_cache) ? res.sc_clients_cache : [];
        if (!list.length) {
            el.textContent = '0 contribuyentes en caché local. Sincroniza desde el Popup o importa un CSV.';
            el.dataset.hay = 'no';
            return;
        }
        const conClave = list.filter(c => !!(c.password || c.sri_password || c.sriPassword)).length;
        const sinClave = list.length - conClave;
        const pct = Math.round((conClave / list.length) * 100);
        el.textContent = `👥 ${list.length} contribuyentes en caché: ${conClave} con clave (${pct}%), ${sinClave} sin clave`;
        el.dataset.hay = sinClave === 0 ? 'si' : 'no';
    } catch (e) {
        el.textContent = 'Error leyendo caché de clientes: ' + e.message;
    }
}

function parsearCsvClavesOpciones(texto) {
    const lineas = texto.split(/\r?\n/);
    const entradas = [];
    for (const linea of lineas) {
        const l = linea.trim();
        if (!l) continue;
        let ruc = '';
        let pass = '';
        if (l.includes('\t')) {
            const parts = l.split('\t');
            ruc = parts[0]?.trim(); pass = parts[1]?.trim();
        } else if (l.includes(';')) {
            const parts = l.split(';');
            ruc = parts[0]?.trim(); pass = parts[1]?.trim();
        } else {
            const parts = l.split(',');
            if (parts.length >= 4 && parts[1].includes('sri.gob.ec')) {
                ruc = parts[2]?.trim().replace(/^["']|["']$/g, '');
                pass = parts[3]?.trim().replace(/^["']|["']$/g, '');
            } else if (parts.length >= 2) {
                ruc = parts[0]?.trim().replace(/^["']|["']$/g, '');
                pass = parts[1]?.trim().replace(/^["']|["']$/g, '');
            }
        }
        if (ruc && ruc.length === 13 && /^\d+$/.test(ruc) && pass) {
            entradas.push({ ruc, password: pass });
        }
    }
    return entradas;
}

async function procesarCsvOpciones(texto) {
    const salida = $('resultadoCsvOpciones');
    if (salida) salida.style.display = 'block';
    const entradas = parsearCsvClavesOpciones(texto);
    if (!entradas.length) {
        if (salida) salida.textContent = '⚠️ No se encontraron filas válidas con RUC de 13 dígitos y clave en el archivo.';
        return;
    }

    const res = await chrome.storage.local.get(['sc_clients_cache', 'flagged_errors', 'sri_tried_credentials', 'sc_omitidos']);
    const list = Array.isArray(res.sc_clients_cache) ? res.sc_clients_cache : [];
    const errs = res.flagged_errors || {};
    const tried = res.sri_tried_credentials || {};
    const omit = res.sc_omitidos || {};

    const mapNuevas = new Map(entradas.map(e => [e.ruc, e.password]));
    let actualizadas = 0;
    let agregadasNuevas = 0;

    const rucsExistentes = new Set(list.map(c => c.ruc));

    list.forEach(c => {
        if (mapNuevas.has(c.ruc)) {
            const p = mapNuevas.get(c.ruc);
            if (c.password !== p) {
                c.password = p;
                c.sri_password = p;
                actualizadas++;
            }
            delete errs[c.ruc];
            delete tried[c.ruc];
            delete omit[c.ruc];
        }
    });

    for (const entry of entradas) {
        if (!rucsExistentes.has(entry.ruc)) {
            list.push({
                ruc: entry.ruc,
                name: 'Cliente SRI (' + entry.ruc + ')',
                password: entry.password,
                sri_password: entry.password,
                declarations: []
            });
            agregadasNuevas++;
        }
    }

    await chrome.storage.local.set({
        sc_clients_cache: list,
        flagged_errors: errs,
        sri_tried_credentials: tried,
        sc_omitidos: omit
    });

    if (salida) {
        salida.textContent = `✅ Importación completada:\n` +
            `· ${entradas.length} credenciales detectadas en el CSV\n` +
            `· ${actualizadas} clientes existentes actualizados con nueva clave\n` +
            (agregadasNuevas ? `· ${agregadasNuevas} clientes nuevos incorporados a la caché local\n` : '') +
            `· Errores y bloqueos previos limpiados para estos RUCs.`;
    }
    await pintarEstadoBovedaClientes();
    avisar('📥 Claves locales actualizadas');
}

async function exportarClavesCsv() {
    const res = await chrome.storage.local.get(['sc_clients_cache']);
    const list = Array.isArray(res.sc_clients_cache) ? res.sc_clients_cache : [];
    if (!list.length) {
        alert('No hay clientes en caché local para exportar.');
        return;
    }
    const lineas = ['RUC,Nombre,Clave'];
    list.forEach(c => {
        const pass = c.password || c.sri_password || c.sriPassword || '';
        const name = (c.name || '').replace(/,/g, ' ');
        lineas.push(`${c.ruc},"${name}","${pass}"`);
    });
    const blob = new Blob([lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claves_sri_respaldo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    avisar('📤 Respaldo CSV exportado');
}

document.addEventListener('DOMContentLoaded', () => {
    $('btnGuardarClaves').addEventListener('click', guardar);
    $('btnBorrarClaves').addEventListener('click', borrar);

    // Bóveda de contribuyentes
    $('btnImportarCsvOpciones')?.addEventListener('click', () => {
        $('inputCsvOpciones')?.click();
    });

    $('inputCsvOpciones')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            if (typeof text === 'string') {
                await procesarCsvOpciones(text);
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    });

    $('btnExportarClavesOpciones')?.addEventListener('click', exportarClavesCsv);

    // Cada credencial se borra sola.
    document.querySelectorAll('.b-borrar-uno').forEach((b) => {
        b.addEventListener('click', () => borrarUna(b.getAttribute('data-borra')));
    });
    $('btnProbarSubida').addEventListener('click', probarSubida);

    // Enter en cualquiera de los dos campos guarda: es lo que espera cualquiera
    // que acaba de pegar una clave.
    ['claveIa', 'claveR2', 'idR2'].forEach((id) => {
        $(id).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') guardar(); });
    });

    try { $('version').textContent = 'v' + chrome.runtime.getManifest().version; } catch (e) { /* da igual */ }

    pintarEstado();
    pintarEstadoBovedaClientes();
});
