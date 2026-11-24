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
const CLAVE_DEBUG = 'sc_debug';

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
    const g = await chrome.storage.local.get([CLAVE_IA, CLAVE_R2, CLAVE_WEB, CLAVE_DEBUG]);
    const ia = (g[CLAVE_IA] || {}).apiKey;
    const r2 = (g[CLAVE_R2] || {}).R2_SECRET_ACCESS_KEY;

    $('estadoIa').textContent = comoTermina(ia);
    $('estadoIa').dataset.hay = ia ? 'si' : 'no';
    $('estadoR2').textContent = comoTermina(r2);
    $('estadoR2').dataset.hay = r2 ? 'si' : 'no';

    // El Access Key ID no es secreto —viaja en cada petición firmada—, así que
    // se muestra entero: sirve para comprobar de un vistazo que quedó el nuevo.
    const id = (g[CLAVE_R2] || {}).R2_ACCESS_KEY_ID;
    $('estadoIdR2').textContent = id || 'no hay ninguno guardado';
    $('estadoIdR2').dataset.hay = id ? 'si' : 'no';

    const debug = !!g[CLAVE_DEBUG];
    const chk = $('chkDebug');
    if (chk) chk.checked = debug;
    const estadoDebug = $('estadoDebug');
    if (estadoDebug) {
        estadoDebug.textContent = debug
            ? 'Encendido: la consola muestra el detalle de cada paso.'
            : 'Apagado: sólo salen los avisos importantes.';
        estadoDebug.dataset.hay = debug ? 'si' : 'no';
    }

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
    // Dos pasos, en el mismo botón. Antes «Borrar TODAS» estaba al lado de
    // «Guardar», con el mismo tamaño, y borraba las cuatro credenciales sin
    // preguntar. La clave secreta de R2 no se puede recuperar: Cloudflare la
    // muestra una sola vez.
    const btn = $('btnBorrarClaves');
    if (btn && btn.dataset.confirmando !== '1') {
        btn.dataset.confirmando = '1';
        btn.classList.add('confirmando');
        btn.textContent = '¿Seguro? Se borran las 4';
        clearTimeout(borrar._reloj);
        borrar._reloj = setTimeout(() => {
            btn.dataset.confirmando = '';
            btn.classList.remove('confirmando');
            btn.textContent = 'Borrar todas…';
        }, 6000);
        btn.focus();
        return;
    }
    if (btn) {
        clearTimeout(borrar._reloj);
        btn.dataset.confirmando = '';
        btn.classList.remove('confirmando');
        btn.textContent = 'Borrar todas…';
    }
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

/**
 * Chequeo previo al lote de clientes.
 *
 * No declara nada: solo lee el almacén local y hace dos PATCH contra un UUID
 * imposible para comprobar los permisos de Supabase sin tocar ninguna fila.
 * Así los 401 se descubren antes de arrancar, no después del cliente 30.
 */
async function chequeoPrevio() {
    const salida = $('resultadoChequeo');
    const boton = $('btnChequeoPrevio');
    if (!salida || !boton) return;
    salida.style.display = 'block';
    salida.textContent = 'Revisando…';
    boton.disabled = true;

    const lineas = [];
    const ok = (t) => lineas.push('✅ ' + t);
    const atencion = (t) => lineas.push('⚠️ ' + t);
    const bloqueo = (t) => lineas.push('⛔ ' + t);

    try {
        const cfg = (typeof window !== 'undefined' && window.SC_CONFIG) || {};
        const g = await chrome.storage.local.get([
            CLAVE_WEB, CLAVE_R2, 'sc_clients_cache', 'flagged_errors',
            'workflowPeriod', 'sc_declaraciones_locales'
        ]);
        const web = g[CLAVE_WEB] || {};
        const url = String(web.SUPABASE_URL || cfg.SUPABASE_URL || '').replace(/\/+$/, '');
        const key = web.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY || '';

        if (key && key.split('.').length === 3 && key.length > 100) {
            ok('Llave de Supabase con forma válida.');
        } else {
            bloqueo('Falta la llave de Supabase o no tiene forma de JWT.');
        }

        const r2 = g[CLAVE_R2] || {};
        if (r2.R2_ACCESS_KEY_ID && r2.R2_SECRET_ACCESS_KEY) {
            ok('Access Key y Secret de R2 cargados en Ajustes.');
        } else {
            atencion('R2 sin Access Key/Secret: la subida por Worker puede andar igual. ' +
                     'Usá «Probar ahora» para confirmar los tres caminos.');
        }

        const lista = Array.isArray(g.sc_clients_cache) ? g.sc_clients_cache : [];
        if (!lista.length) {
            bloqueo('No hay clientes en caché. Abrí la web, sincronizá Declaraciones o importá el CSV.');
        } else {
            const conClave = lista.filter(c => !!(c.password || c.sri_password || c.sriPassword));
            ok(`${lista.length} clientes en caché; ${conClave.length} con contraseña.`);
            const sinClave = lista.filter(c => !(c.password || c.sri_password || c.sriPassword));
            if (sinClave.length) {
                const muestra = sinClave.slice(0, 8).map(c => c.ruc || c.name || '?').join(', ');
                atencion(`${sinClave.length} sin contraseña: ${muestra}${sinClave.length > 8 ? '…' : ''}`);
            }
        }

        const flagged = Object.keys(g.flagged_errors || {});
        if (flagged.length) {
            atencion(`${flagged.length} cliente(s) marcados por el SRI y omitidos: ` +
                     flagged.slice(0, 8).join(', ') + (flagged.length > 8 ? '…' : ''));
        } else {
            ok('Ningún cliente marcado por credencial rechazada.');
        }

        const wp = g.workflowPeriod;
        if (wp && typeof wp.monthIndex === 'number' && wp.year) {
            ok(`Período elegido: ${String(wp.monthIndex + 1).padStart(2, '0')}/${wp.year}.`);
        } else {
            atencion('No hay período elegido; se usará el mes anterior por defecto.');
        }

        if (url && key) {
            const cab = {
                apikey: key,
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            };
            const imposible = '00000000-0000-0000-0000-000000000000';

            try {
                const r = await fetch(`${url}/rest/v1/clients?select=id&limit=1`, {
                    headers: { apikey: key, Authorization: 'Bearer ' + key }
                });
                if (r.ok) ok('Supabase responde y deja leer clients.');
                else bloqueo(`Supabase no deja leer clients: HTTP ${r.status}.`);
            } catch (e) {
                bloqueo('No se pudo llegar a Supabase: ' + e.message);
            }

            const probarPatch = async (tabla, cuerpo, etiqueta) => {
                try {
                    const r = await fetch(`${url}/rest/v1/${tabla}?id=eq.${imposible}`, {
                        method: 'PATCH', headers: cab, body: JSON.stringify(cuerpo)
                    });
                    if (r.status === 204 || r.status === 200) ok(etiqueta);
                    else if (r.status === 401 || r.status === 403) {
                        bloqueo(`${etiqueta}: HTTP ${r.status} (falta política o permiso).`);
                    } else {
                        atencion(`${etiqueta}: HTTP ${r.status}.`);
                    }
                } catch (e) {
                    atencion(`${etiqueta}: no se pudo probar (${e.message}).`);
                }
            };

            await probarPatch('sri_declaraciones', { updated_at: new Date().toISOString() },
                'sri_declaraciones acepta UPDATE (upsert).');
            await probarPatch('clients', { tax_profile: {} },
                'clients acepta actualizar tax_profile.');
        }

        const locales = g.sc_declaraciones_locales || {};
        const nLocales = Object.keys(locales).length;
        if (nLocales) ok(`${nLocales} declaración(es) en el respaldo local.`);
    } catch (e) {
        bloqueo('El chequeo se cortó: ' + e.message);
    } finally {
        const bloqueantes = lineas.filter(l => l.startsWith('⛔')).length;
        lineas.unshift(bloqueantes
            ? `RESULTADO: ${bloqueantes} bloqueo(s). No arranques el lote hasta resolverlos.`
            : 'RESULTADO: sin bloqueos. Podés arrancar el lote.');
        salida.textContent = lineas.join('\n');
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
    $('btnChequeoPrevio')?.addEventListener('click', chequeoPrevio);

    // El modo depuración se guarda al instante: es un interruptor, no una
    // credencial, y quien lo prende suele estar mirando la consola del SRI.
    $('chkDebug')?.addEventListener('change', async (e) => {
        if (e.target.checked) await chrome.storage.local.set({ [CLAVE_DEBUG]: true });
        else await chrome.storage.local.remove([CLAVE_DEBUG]);
        await pintarEstado();
        avisar(e.target.checked ? '🐞 Depuración encendida' : '🐞 Depuración apagada');
    });

    // Enter en cualquiera de los dos campos guarda: es lo que espera cualquiera
    // que acaba de pegar una clave.
    ['claveIa', 'claveR2', 'idR2'].forEach((id) => {
        $(id).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') guardar(); });
    });

    try { $('version').textContent = 'v' + chrome.runtime.getManifest().version; } catch (e) { /* da igual */ }

    pintarEstado();
    pintarEstadoBovedaClientes();
});

// ── Copia por correo: URL, token, chat y firma ─────────────────────────────
(function () {
    const CLAVE = 'sc_email_config';
    const $ = (id) => document.getElementById(id);

    async function pintar() {
        const cfg = (await chrome.storage.local.get([CLAVE]))[CLAVE] || {};
        if ($('emailUrl')) $('emailUrl').value = cfg.url || '';
        if ($('emailToken')) $('emailToken').value = cfg.token || '';
        if ($('emailChatId')) $('emailChatId').value = cfg.chatId || '';
        if ($('emailFirma')) $('emailFirma').value = cfg.firma || '';
        if ($('emailTo')) $('emailTo').value = cfg.to || '';
        if ($('emailResendKey')) $('emailResendKey').value = cfg.resendKey || '';
        if ($('emailResendFrom')) $('emailResendFrom').value = cfg.resendFrom || '';
        const est = $('estadoEmail');
        if (est) {
            est.textContent = cfg.url
                ? 'Configurado: ' + cfg.url
                : 'Sin configurar. El correo no se envía.';
            est.dataset.hay = cfg.url ? 'si' : 'no';
        }
    }

    function init() {
        pintar();
        $('btnGuardarEmail')?.addEventListener('click', async () => {
            const cfg = {
                url: String($('emailUrl')?.value || '').trim(),
                token: String($('emailToken')?.value || '').trim(),
                chatId: String($('emailChatId')?.value || '').trim(),
                firma: String($('emailFirma')?.value || '').trim(),
                to: String($('emailTo')?.value || '').trim(),
                resendKey: String($('emailResendKey')?.value || '').trim(),
                resendFrom: String($('emailResendFrom')?.value || '').trim(),
            };
            await chrome.storage.local.set({ [CLAVE]: cfg });
            const est = $('estadoEmail');
            if (est) {
                est.textContent = cfg.url ? 'Guardado. Se enviará a cada cliente con correo.' : 'Guardado sin URL: no se envía.';
                est.dataset.hay = cfg.url ? 'si' : 'no';
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

// ── Descargar la última bitácora (sobrevive a que se cierre la pestaña) ─────
(function () {
    const btn = document.getElementById('btnDescargarLog');
    const est = document.getElementById('estadoLog');
    if (!btn) return;

    const dos = (n) => String(n).padStart(2, '0');
    btn.addEventListener('click', async () => {
        const r = await chrome.storage.local.get(['sc_log_ultimo']);
        const data = r.sc_log_ultimo;
        if (!data || !Array.isArray(data.lineas) || !data.lineas.length) {
            if (est) est.textContent = 'Todavía no hay bitácora guardada.';
            return;
        }
        const cuerpo = data.lineas.map((l) => {
            const d = new Date(l.t);
            return dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds()) + ' [' + l.nivel + '] ' + l.texto;
        }).join('\n');
        const cabecera = 'Bitácora SC TaxPilot\nGuardada: ' + new Date(data.t).toLocaleString() + '\nURL: ' + (data.url || '-') + '\n' + '─'.repeat(60) + '\n';
        const blob = new Blob([cabecera + cuerpo], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        const d = new Date(data.t);
        a.href = URL.createObjectURL(blob);
        a.download = 'bitacora_' + d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + '_' + dos(d.getHours()) + dos(d.getMinutes()) + '.txt';
        a.click();
        URL.revokeObjectURL(a.href);
        if (est) est.textContent = 'Descargada: ' + data.lineas.length + ' líneas.';
    });
})();

// ── Auditoría rápida (caja negra) ──────────────────────────────────────────
// Junta hechos del almacén y da veredictos ✅/⚠. No llama a la red.
(function () {
    const CLAVES = [
        'sc_loop', 'sc_ultimo_lote', 'sc_clients_cache', 'sc_clientes_baja',
        'sc_declaraciones_locales', 'flagged_errors', 'sc_omitidos',
        'sc_declaraciones_por_pagar_aviso', 'sc_email_config',
        'sc_supabase_credenciales', 'sc_lista_bendita', 'sri_target_period',
        'sc_log_ultimo', 'pendingAction', 'pending_sri_autofill', 'sc_buzon'
    ];

    const dinero = (v) => '$' + Number(v || 0).toFixed(2);
    const fecha = (ts) => ts ? new Date(ts).toLocaleString() : '—';

    async function construir() {
        const d = await chrome.storage.local.get(CLAVES);
        const l = [];
        let avisos = 0;
        const add = (txt) => l.push(txt);
        const veredicto = (ok, txt) => { if (!ok) avisos += 1; add((ok ? '✅ ' : '⚠️ ') + txt); };

        const manifest = chrome.runtime.getManifest();
        add('AUDITORÍA · v' + manifest.version + ' · ' + new Date().toLocaleString());
        add('─'.repeat(52));

        // Lote
        const loop = d.sc_loop || {};
        const ultimo = d.sc_ultimo_lote;
        add('LOTE');
        add('  semáforo: ' + (loop.estado || 'sin datos') +
            ' · cola: ' + (Array.isArray(loop.cola) ? loop.cola.length : 0) +
            ' · índice: ' + (loop.indice != null ? loop.indice : '—'));
        if (ultimo) {
            add('  último: ' + fecha(ultimo.cuando) + ' · ' + (ultimo.periodo || '—') +
                ' · ' + (ultimo.conPdf || 0) + '/' + (ultimo.total || 0) + ' con comprobante' +
                (ultimo.sinPdf ? ' · ' + ultimo.sinPdf + ' sin PDF' : ''));
            veredicto((ultimo.total || 0) === 0 || (ultimo.sinPdf || 0) === 0,
                (ultimo.sinPdf ? ultimo.sinPdf + ' sin comprobante en el último lote' : 'todas con comprobante'));
        } else {
            add('  último: sin registro');
        }

        // Clientes
        const cache = Array.isArray(d.sc_clients_cache) ? d.sc_clients_cache : [];
        const bajas = Array.isArray(d.sc_clientes_baja) ? d.sc_clientes_baja : [];
        add('');
        add('CARTERA');
        // Mensual = frecuencia marcada, o (si no está) la historia manda:
        // "2026-05" → mensual · "2026-S1" → semestral · 3+ meses → mensual.
        const esMensualPorDatos = (c) => {
            const tp = (c && c.tax_profile) || {};
            const freq = String(tp.ivaFrequency || c.iva_frequency || c.ivaFrequency || '').toLowerCase();
            const tipo = String(tp.clientType || (c && c.client_type) || '').toLowerCase();
            if (tipo === 'solo_plan' || c.requires_declarations === false || tp.requiresDeclarations === false) return false;
            if (freq === 'mensual') return true;
            if (freq === 'semestral' || freq === 'ninguno' || freq === 'anual') return false;
            if (String((c && c.regime) || '').toLowerCase().includes('popular')) return false;
            const h = Array.isArray(c && c.declaration_history) ? c.declaration_history : [];
            const iva = h.filter((e) => String((e && e.type) || '').toUpperCase().includes('IVA'));
            if (!iva.length) return false;
            const per = iva.map((e) => String((e && e.period) || '').trim()).filter(Boolean);
            const ult = per.slice().sort((a, b) => String(b).localeCompare(String(a)))[0] || '';
            if (/^\d{4}-\d{2}$/.test(ult)) return true;
            if (/^\d{4}-S[12]$/.test(ult)) return false;
            return per.filter((x) => /^\d{4}-\d{2}$/.test(x)).length >= 3;
        };
        const mensuales = cache.filter(esMensualPorDatos).length;
        add('  clientes mensuales (los que declaran): ' + mensuales);
        add('  el resto de la caché son claves/contactos: no se muestran ni entran.');
        veredicto(true, mensuales + ' cliente(s) mensual(es) reales');

        add('');
        add('CLIENTES');
        add('  bajas: ' + bajas.length);
        const rucs = new Set(cache.map((c) => c.ruc));
        veredicto(cache.length > 0, cache.length > 0 ? 'caché cargada' : 'caché vacía (no hay con qué armar el lote)');
        veredicto(rucs.size === cache.length, 'RUC duplicados en caché: ' + (cache.length - rucs.size));
        const pendienteAction = d.pendingAction;
        veredicto(!pendienteAction, pendienteAction ? 'hay una acción colgada: ' + pendienteAction : 'sin acciones colgadas');

        // Declaraciones del período
        const reg = d.sc_declaraciones_locales || {};
        const tp = d.sri_target_period || {};
        const periodo = (tp.year && typeof tp.monthIndex === 'number')
            ? tp.year + '-' + String(tp.monthIndex + 1).padStart(2, '0') : '';
        if (periodo) {
            let total = 0, conPdf = 0;
            Object.entries(reg).forEach(([k, v]) => {
                if (!String(k).endsWith('|' + periodo)) return;
                total += 1;
                if (v && v.pdfSubido) conPdf += 1;
            });
            add('');
            add('PERÍODO ' + periodo);
            add('  declaradas: ' + total + ' · con comprobante: ' + conPdf + ' · sin PDF: ' + (total - conPdf));
            veredicto(total === conPdf, total > conPdf ? (total - conPdf) + ' sin comprobante' : 'todas con comprobante');
        }

        // Errores y avisos
        const flag = d.flagged_errors || {};
        const omit = d.sc_omitidos || {};
        const porPagar = d.sc_declaraciones_por_pagar_aviso || {};
        // Por qué quedaron afuera (para actuar sin abrir el popup).
        add('');
        add('OMITIDOS POR MOTIVO');
        const motivos = {};
        Object.values(omit).forEach((o) => {
            const m = String((o && o.motivo) || 'sin motivo').trim();
            motivos[m] = (motivos[m] || 0) + 1;
        });
        const topMotivos = Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 6);
        if (!topMotivos.length) add('  (ninguno)');
        topMotivos.forEach(([m, n]) => add('  ' + n + ' × ' + m));
        add('');
        add('ERRORES Y AVISOS');
        add('  con error: ' + Object.keys(flag).length +
            ' · omitidos: ' + Object.keys(omit).length +
            ' · por pagar: ' + Object.keys(porPagar).length);
        if (Object.keys(flag).length) {
            add('  errores: ' + Object.keys(flag).slice(0, 5).join(', '));
        }

        // Servicios
        add('');
        add('SERVICIOS');
        const cred = d.sc_supabase_credenciales || {};
        veredicto(!!(typeof cred === 'string' ? cred : (cred && (cred.SUPABASE_ANON_KEY || cred.key || cred.anonKey || cred.clave))), 'llave de Supabase en Ajustes');
        const email = d.sc_email_config || {};
        veredicto(!!(email.url || email.resendKey), (email.resendKey ? 'correo por Resend' : (email.url ? 'correo por el bot' : 'correo sin configurar (no se envía copia)')));

        // Bitácora: sólo lo que importa
        const logUlt = d.sc_log_ultimo;
        const avisosLog = Array.isArray(d.sc_log_avisos) ? d.sc_log_avisos : [];
        if (logUlt && Array.isArray(logUlt.lineas)) {
            const graves = (avisosLog.length ? avisosLog : logUlt.lineas.filter((x) => x.nivel === 'warn' || x.nivel === 'error')).slice(-8);
            add('');
            add(graves.length ? 'BITÁCORA: últimas advertencias (' + graves.length + ')' : 'BITÁCORA: sin avisos registrados (arranca de nuevo al recargar)');
            graves.forEach((x) => {
                const h = new Date(x.t);
                add('  ' + String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0') +
                    ' [' + x.nivel + '] ' + String(x.texto).slice(0, 90));
            });
        }

        add('');
        add('─'.repeat(52));
        add(avisos === 0 ? 'VEREDICTO: todo en orden.' : 'VEREDICTO: ' + avisos + ' punto(s) a revisar.');
        return l.join('\n');
    }

    const btn = document.getElementById('btnAuditoria');
    const salida = document.getElementById('auditoriaSalida');
    if (!btn || !salida) return;

    btn.addEventListener('click', async () => {
        salida.textContent = 'Auditando…';
        try {
            salida.textContent = await construir();
        } catch (e) {
            salida.textContent = 'No se pudo auditar: ' + (e && e.message);
        }
    });

    document.getElementById('btnAuditoriaGuardar')?.addEventListener('click', () => {
        const txt = salida.textContent || '';
        if (!txt || txt === '—') return;
        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const d = new Date();
        a.download = 'auditoria_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.txt';
        a.click();
        URL.revokeObjectURL(a.href);
    });
})();

// ── Probar Resend: manda un correo de prueba y dice qué respondió ─────────
(function () {
    const btn = document.getElementById('btnProbarResend');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const est = document.getElementById('estadoResend');
        const clave = String(document.getElementById('emailResendKey')?.value || '').trim();
        const desde = String(document.getElementById('emailResendFrom')?.value || '').trim()
            || 'Soluciones Contables Pro <onboarding@resend.dev>';
        const destino = String(document.getElementById('emailTo')?.value || '').trim();
        if (!clave) { if (est) { est.textContent = 'Falta la clave de Resend.'; est.dataset.hay = 'no'; } return; }
        if (!destino) { if (est) { est.textContent = 'Poné un destinatario fijo para la prueba.'; est.dataset.hay = 'no'; } return; }
        btn.disabled = true;
        if (est) { est.textContent = 'Enviando…'; est.dataset.hay = ''; }
        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + clave, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: desde,
                    to: [destino],
                    subject: 'Prueba de Resend · SC TaxPilot',
                    text: 'Si ves este correo, la clave de Resend está funcionando.\n\n— Nueva Luz',
                }),
            });
            const cuerpo = await res.text();
            if (res.ok) {
                if (est) { est.textContent = 'Enviado a ' + destino; est.dataset.hay = 'si'; }
            } else {
                if (est) { est.textContent = 'HTTP ' + res.status + ': ' + cuerpo.slice(0, 140); est.dataset.hay = 'no'; }
            }
        } catch (e) {
            if (est) { est.textContent = 'Error: ' + (e && e.message); est.dataset.hay = 'no'; }
        } finally {
            btn.disabled = false;
        }
    });
})();

// ── 👤 Sesión del estudio (sc_sesion.js) ─────────────────────────────
// La contraseña sólo vive en el campo hasta que Supabase contesta; después
// se borra del DOM. Lo que queda guardado son los tokens de la sesión.
(function () {
    const $ = (id) => document.getElementById(id);

    async function pintarSesion() {
        if (typeof ScSesion === 'undefined') return;
        const e = await ScSesion.estado();
        const est = $('estadoSesion');
        if (e.conectado) {
            est.textContent = `✅ Conectado como ${e.email}` + (e.aviso ? ` · ⚠️ ${e.aviso}` : '');
            est.dataset.hay = 'si';
        } else {
            est.textContent = e.aviso ? `⚠️ ${e.aviso}` : 'Sin sesión: la extensión usa la llave pública, que se va a cerrar.';
            est.dataset.hay = 'no';
        }
        $('formSesion').hidden = e.conectado;
        $('btnIniciarSesion').hidden = e.conectado;
        $('btnCerrarSesion').hidden = !e.conectado;
    }

    async function iniciar() {
        const btn = $('btnIniciarSesion');
        const pass = $('sesionPass');
        btn.disabled = true;
        try {
            await ScSesion.iniciar($('sesionEmail').value, pass.value);
            avisar('Sesión iniciada.');
        } catch (err) {
            avisar('No se pudo iniciar sesión: ' + err.message);
        } finally {
            pass.value = '';
            btn.disabled = false;
            pintarSesion();
        }
    }

    function init() {
        if (!$('tarjetaSesion')) return;
        $('btnIniciarSesion').addEventListener('click', iniciar);
        $('sesionPass').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') iniciar(); });
        $('btnCerrarSesion').addEventListener('click', async () => { await ScSesion.cerrar(); avisar('Sesión cerrada.'); pintarSesion(); });
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area === 'local' && (ch.sc_sesion_web || ch.sc_sesion_web_aviso)) pintarSesion();
        });
        pintarSesion();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
