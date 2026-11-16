const SC_CONFIG = window.SC_CONFIG || {};
const SUPABASE_URL = SC_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = SC_CONFIG.SUPABASE_ANON_KEY;

const SC_BENDITA_KEY = 'sc_lista_bendita';      // null = inactiva (corre todo, como siempre)
const SC_CACHE_TS_KEY = 'sc_clients_cache_ts';  // cuándo se sincronizó la caché por última vez
const SC_BAJAS_KEY = 'sc_clientes_baja';        // dados de baja (clave aparte: la caché común
                                                // alimenta el lote y NO debe llevar bajas)

let allRawClients = [];
let allClients = [];
let otrosClients = [];
let clientesBaja = [];        // is_deleted === true (solo legible con el GRANT de Supabase)
let declaracionesLocales = {}; // registro local del lote: "ruc|YYYY-MM" -> {pdfSubido, ...}
let currentMonth = 0;
let currentYear = 2026;
let visiblePasswords = {}; // Mapa para recordar qué claves están visibles
let flaggedErrors = {}; // Mapa de contribuyentes con error
let listaBendita = null;   // null = Bendita inactiva · array de RUC = activa
let syncBajasBloqueado = false; // true si Supabase rechazó leer is_deleted (falta el GRANT)
let syncUltimoTs = null;   // timestamp de la última sincronización exitosa
let ordenMeses = {};       // 🗓️ RUC → Set de 'AAAA-MM' que se declaran en orden (popup)
let ordenMesesAbierto = {}; // 🗓️ RUC → true si el acordeón de "Orden de meses" está expandido.
                             // Solo de la sesión del popup: no necesita persistir en storage.
document.addEventListener('DOMContentLoaded', () => {
    initSelectors();
    bindEvents();
    loadClientsFromCacheOrFetch();
    pintarVersionReal();
    pintarEstadoNube();
});

// El pie del popup traía "v3.2.0" escrito a mano en el HTML, congelado desde
// hace tiempo — nunca se tocó aunque el manifest y el content script sí
// avanzaron. Mostrar un número de versión que no corresponde al código real
// es peor que no mostrar ninguno: alguien podía creer que seguía en una
// versión vieja (o viceversa) sin forma de saberlo. chrome.runtime.getManifest()
// es la única fuente que SIEMPRE coincide con lo que Chrome tiene cargado en
// este momento, sin pasar por el pipeline de build de content.js.
/**
 * Estado real de la nube en el pie. Si falta SC_CONFIG, la declaración corre
 * igual pero NO se sube — y eso hay que verlo antes de arrancar el lote.
 */
async function pintarEstadoNube() {
    const el = document.getElementById('nubeEstado');
    if (!el) return;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        el.textContent = '⚠ sin nube';
        el.className = 'nube-chip off';
        el.title = 'Falta la configuración de Supabase. Las declaraciones NO se van a subir.';
        return;
    }

    el.textContent = '☁ …';
    el.className = 'nube-chip';
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=id&limit=1`, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
        });
        if (res.ok) {
            el.textContent = '☁ nube OK';
            el.className = 'nube-chip ok';
            el.title = 'Supabase responde: las declaraciones se guardan en la nube.';
        } else {
            el.textContent = `⚠ HTTP ${res.status}`;
            el.className = 'nube-chip off';
            el.title = (await res.text().catch(() => '')).slice(0, 160);
        }
    } catch (e) {
        el.textContent = '⚠ sin red';
        el.className = 'nube-chip off';
        el.title = String((e && e.message) || e);
    }
}

function pintarVersionReal() {
    const el = document.getElementById('popupFootVersion');
    if (!el) return;
    try {
        el.textContent = 'v' + chrome.runtime.getManifest().version;
    } catch (e) { /* si no se puede leer, se deja el texto que ya había */ }
}

function initSelectors() {
    const now = new Date();
    // Período objetivo por defecto: el mes anterior. Pero si hay una preferencia
    // guardada (sri_target_period, elegida a mano o con "🎯 Mes que falta"), esa manda.
    chrome.storage.local.get(['sri_target_period', 'workflowPeriod', 'selected_period_updated_at'], (res) => {
        const t = res.sri_target_period;
        let y = now.getFullYear(), m = now.getMonth() - 1;
        if (m < 0) { m = 11; y--; }
        const isRecent = res.selected_period_updated_at && (Date.now() - res.selected_period_updated_at < 3600000);
        if (res.workflowPeriod && typeof res.workflowPeriod.monthIndex === 'number' && res.workflowPeriod.year) {
            currentYear = res.workflowPeriod.year;
            currentMonth = res.workflowPeriod.monthIndex;
        } else if (isRecent && t && t.year && typeof t.monthIndex === 'number') {
            currentYear = t.year;
            currentMonth = t.monthIndex;
        } else {
            currentYear = y;
            currentMonth = m;
        }

        const monthSel = document.getElementById('periodMonth');
        const yearSel = document.getElementById('periodYear');
        if (!monthSel || !yearSel) return;

        // 🎯 Límite estricto: máximo 2 años (2025 y 2026), no incluir 2024 ni anteriores
        const anioTope = Math.max(now.getFullYear(), 2026);
        for (let yy = anioTope; yy >= 2025; yy--) {
            const opt = document.createElement('option');
            opt.value = yy;
            opt.textContent = yy;
            yearSel.appendChild(opt);
        }

        monthSel.value = currentMonth;
        if (currentYear > anioTope) currentYear = anioTope;
        if (currentYear < 2025) currentYear = 2025;
        yearSel.value = currentYear;
    });
}

function bindEvents() {
    document.getElementById('periodMonth').addEventListener('change', (e) => {
        currentMonth = parseInt(e.target.value);
        persistirMesSeleccionado();
        renderClients();
    });

    document.getElementById('periodYear').addEventListener('change', (e) => {
        currentYear = parseInt(e.target.value);
        persistirMesSeleccionado();
        renderClients();
    });

    // Menú "⋮" de la Lista Bendita (Quitar todos / Modo clásico). Se cierra
    // con el overlay (ver popup.html): el menú se superpone a la fila de
    // pestañas de abajo, y un cierre "al clic afuera" sin overlay dejaba que
    // ESE mismo clic le llegara a lo que tapaba — disparando "Quitar todos"
    // en vez de cambiar de pestaña. El overlay absorbe ese primer clic.
    const cerrarBenditaMenu = () => {
        document.getElementById('benditaMenu').style.display = 'none';
        document.getElementById('benditaMenuOverlay').style.display = 'none';
    };
    // 🎛 Mostrar la barra flotante en el SRI: la despierta y la monta en la pestaña activa.
// 🧭 Mapear la pantalla de Anexos (sin depender de la barra flotante).
// 🔑 Diagnóstico de login: copia la foto de la pantalla del SRI.
document.getElementById('btnVentas104')?.addEventListener('click', async () => {
    const estado = document.getElementById('anexosEstado');
    const pintar = (txt, ok) => { if (estado) { estado.style.display = "block"; estado.style.color = ok ? "#34d399" : "#f87171"; estado.textContent = txt; } };
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !/sri\.gob\.ec/.test(tab.url || '')) { pintar('Abrí el formulario 104 del SRI y volvé a intentar.', false); return; }
        chrome.tabs.sendMessage(tab.id, { action: "capturarVentas" }, (resp) => {
            if (chrome.runtime.lastError || !resp) { pintar("Sin respuesta: " + (chrome.runtime.lastError?.message || ""), false); return; }
            const r = resp.resultado || {};
            if (!resp.ok || !r.ok) { pintar('No se pudo capturar: ' + (resp.error || r.error || 'formulario no encontrado'), false); return; }
            const conIva = Number(r.conIva || 0).toFixed(2);
            const sinIva = Number(r.sinIva || 0).toFixed(2);
            const total = Number(r.total || 0).toFixed(2);
            pintar('💵 ' + (r.periodo || '') + ' · con IVA ' + conIva + ' · sin IVA ' + sinIva + ' · total ' + total + (r.nube && r.nube.ok ? ' · guardado en la web' : ' · solo local'), true);
        });
    } catch (e) { pintar("Error: " + e.message, false); }
});

document.getElementById('btnDiagLogin')?.addEventListener('click', async () => {
    const estado = document.getElementById('anexosEstado');
    const pintar = (txt, ok) => { if (estado) { estado.style.display = "block"; estado.style.color = ok ? "#34d399" : "#f87171"; estado.textContent = txt; } };
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !/sri\.gob\.ec/.test(tab.url || '')) { pintar('Abrí la pantalla de login del SRI y volvé a intentar.', false); return; }
        chrome.tabs.sendMessage(tab.id, { action: "diagnosticoLogin" }, async (resp) => {
            if (chrome.runtime.lastError || !resp || !resp.ok) {
                pintar('Sin respuesta: ' + (chrome.runtime.lastError?.message || resp?.error || ''), false);
                return;
            }
            const d = resp.diagnostico || {};
            const texto = JSON.stringify(d, null, 2);
            try { await navigator.clipboard.writeText(texto); pintar("🔑 Diagnóstico copiado\n" + (d.url || "") + "\nCampos: " + (d.campos ? "sí" : "no") + " · Error: " + (d.errorVisible || "ninguno"), true); }
            catch (e) { pintar("Diagnóstico listo (no se pudo copiar)\n" + (d.url || ""), true); }
        });
    } catch (e) { pintar('Error: ' + e.message, false); }
});

document.getElementById('btnMapearAnexos')?.addEventListener('click', async () => {
    const estado = document.getElementById('anexosEstado');
    const pintar = (txt, ok) => { if (estado) { estado.style.display = "block"; estado.style.color = ok ? "#34d399" : "#f87171"; estado.textContent = txt; } };
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !/sri\.gob\.ec/.test(tab.url || '')) { pintar('Abrí primero una pestaña del SRI (Anexos).', false); return; }
        chrome.tabs.sendMessage(tab.id, { action: "mapearAnexos" }, async (resp) => {
            if (chrome.runtime.lastError || !resp || !resp.ok) {
                pintar('No pude mapear: ' + (chrome.runtime.lastError?.message || resp?.error || 'sin respuesta'), false);
                return;
            }
            const texto = JSON.stringify(resp.mapa, null, 2);
            try { await navigator.clipboard.writeText(texto); pintar("🧭 Mapa copiado al portapapeles\n" + (resp.mapa.resumen || ""), true); }
            catch (e) { pintar("Mapa listo (no se pudo copiar): " + (resp.mapa.resumen || ""), true); }
            try { chrome.storage.local.set({ sc_mapa_anexos: resp.mapa }); } catch (e) {}
        });
    } catch (e) { pintar('Error: ' + e.message, false); }
});

// 📤 Subir un ZIP ya generado al anexo (adjunta + Cargar + Aceptar).
document.getElementById('btnSubirAnexoZip')?.addEventListener('click', () => {
    document.getElementById('inputAnexoZip')?.click();
});
document.getElementById('inputAnexoZip')?.addEventListener('change', (ev) => {
    const estado = document.getElementById('anexosEstado');
    const pintar = (txt, ok) => { if (estado) { estado.style.display = "block"; estado.style.color = ok ? "#34d399" : "#f87171"; estado.textContent = txt; } };
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) { pintar("Elegí un archivo .zip", false); return; }
    const lector = new FileReader();
    lector.onload = async () => {
        try {
            const b64 = String(lector.result || "").replace(/^data:[^;]+;base64,/, "");
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !/sri\.gob\.ec/.test(tab.url || '')) { pintar('Abrí Anexos → Envío y consulta del anexo y volvé a intentar.', false); return; }
            pintar("Subiendo " + file.name + "…", true);
            // El RUC de la sesión va en el mensaje: con eso la extensión marca
            // el anexo como presentado en Supabase.
            chrome.storage.local.get(['pending_sri_autofill'], (stPend) => {
                const rucActual = String((stPend && stPend.pending_sri_autofill && stPend.pending_sri_autofill.ruc) || '').replace(/\D/g, '');
            chrome.tabs.sendMessage(tab.id, { action: "subirAnexoZip", data: { nombre: file.name, b64, ruc: rucActual } }, (resp) => {
                if (chrome.runtime.lastError || !resp) { pintar("Sin respuesta del portal: " + (chrome.runtime.lastError?.message || ""), false); return; }
                const r = resp.resultado || {};
                pintar((r.ok ? "✅ " : "⚠️ ") + (r.mensaje || resp.error || "") + (r.acuse ? "\nAcuse: " + r.acuse : ""), !!r.ok);
                // 📌 Si el ATS quedó subido, se cierra el pendiente de esa sociedad.
                if (r.ok) limpiarPendienteTrasSubida(file.name);
            });
            }); // cierre del storage.get
        } catch (e) { pintar('Error: ' + e.message, false); }
    };
    lector.readAsDataURL(file);
});

// ============================================================
// 📌 ATS PENDIENTES — lo que falta subir de las sociedades
// ============================================================
function limpiarPendienteTrasSubida(nombreArchivo) {
    try {
        const esAnexo = /^(ATS|Anexo_IVA|APS|Anexo_APS|ADI|Anexo_ADI)/i.test(String(nombreArchivo || ''));
        if (!esAnexo) return;
        chrome.storage.local.get(['sc_ats_pendientes', 'pending_sri_autofill'], (st) => {
            const mapa = st.sc_ats_pendientes || {};
            const ruc = (st.pending_sri_autofill && st.pending_sri_autofill.ruc) ? String(st.pending_sri_autofill.ruc) : '';
            const mm = String(nombreArchivo || '').match(/(20\d{2})[-_](0[1-9]|1[0-2])/);
            const periodo = mm ? (mm[1] + '-' + mm[2]) : '';
            let cambio = false;
            for (const k of Object.keys(mapa)) {
                const coincideRuc = ruc && k === ruc;
                const coincidePeriodo = periodo && mapa[k] && String(mapa[k].periodo) === periodo;
                if (coincideRuc || coincidePeriodo) { delete mapa[k]; cambio = true; }
            }
            if (cambio) chrome.storage.local.set({ sc_ats_pendientes: mapa }, () => renderAtsPendientes());
        });
    } catch (e) { /* limpiar es cosmético: no rompe la subida */ }
}

// 🪪 Quién está logueado en el SRI (para no confundir clientes).
function renderSesionSri() {
    const caja = document.getElementById('sesionSri');
    const nombreEl = document.getElementById('sesionSriNombre');
    if (!caja || !nombreEl) return;
    chrome.storage.local.get(['sc_sesion_confirmada', 'sri_ultimo_cliente', 'pending_sri_autofill', 'sc_clients_cache'], (st) => {
        const ses = st.sc_sesion_confirmada || st.sri_ultimo_cliente || st.pending_sri_autofill || {};
        const ruc = String(ses.ruc || '');
        if (!ruc) { caja.style.display = 'none'; return; }
        const cache = Array.isArray(st.sc_clients_cache) ? st.sc_clients_cache : [];
        const c = cache.find((x) => x && String(x.ruc) === ruc);
        nombreEl.textContent = ((c && (c.name || c.nombre)) || ses.name || ruc) + ' · ' + ruc;
        caja.style.display = 'flex';
    });
}
document.getElementById('btnCerrarSesionSri')?.addEventListener('click', async () => {
    const estado = document.getElementById('anexosEstado');
    const pintar = (txt, ok) => { if (estado) { estado.style.display = "block"; estado.style.color = ok ? "#34d399" : "#f87171"; estado.textContent = txt; } };
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !/sri\.gob\.ec/.test(tab.url || '')) { pintar('Abrí una pestaña del SRI para cerrar esa sesión.', false); return; }
        chrome.tabs.sendMessage(tab.id, { action: "cerrarSesionSRI" }, (resp) => {
            pintar((resp && resp.ok) ? '🪪 Sesión cerrada (purga completa).' : 'No se pudo cerrar la sesión.', !!(resp && resp.ok));
        });
    } catch (e) { pintar("Error: " + e.message, false); }
});

try {
    const chip = document.getElementById('buildChip');
    if (chip) chip.textContent = 'v' + chrome.runtime.getManifest().version;
} catch (e) { /* sin chip no pasa nada */ }

// 📅 Estado del mes en una sola línea: período · pendientes · comprobantes · errores · ATS.
let mesLineaDatos = { periodo: '', pend: 0, comp: 0, err: 0, ats: 0 };
function pintarMesLinea() {
    const per = document.getElementById('mesLineaPeriodo');
    const dat = document.getElementById('mesLineaDatos');
    if (!per || !dat) return;
    // Si la web publicó el resumen de ESTE período, mandan sus números.
    const claveLocal = `${currentYear}-${String(Number(currentMonth) + 1).padStart(2, '0')}`;
    const remoto = mesLineaDatos.web;
    let desdeWeb = false;
    if (remoto && remoto.periodo === claveLocal) {
        desdeWeb = true;
        mesLineaDatos.pend = Number(remoto.pendientes) || 0;
        mesLineaDatos.comp = Number(remoto.conComprobante) || 0;
        mesLineaDatos.err = Number(remoto.errores) || 0;
    }
    const partes = [];
    if (mesLineaDatos.pend) partes.push(mesLineaDatos.pend + ' sin declarar');
    if (mesLineaDatos.comp) partes.push(mesLineaDatos.comp + ' con comprobante');
    if (mesLineaDatos.err) partes.push(mesLineaDatos.err + ' con error');
    if (mesLineaDatos.ats) partes.push(mesLineaDatos.ats + ' ATS pendiente' + (mesLineaDatos.ats === 1 ? '' : 's'));
    per.textContent = mesLineaDatos.periodo || '—';
    dat.textContent = (partes.length ? partes.join(' · ') : 'todo al día') + (desdeWeb ? ' · web' : '');
}

// 📅 Resumen que publica la web (matriz) — se refresca cada vez que cambia.
chrome.storage.local.get(['sc_estado_mes'], (st) => {
    const r = st && st.sc_estado_mes;
    if (r && r.periodo) { mesLineaDatos.web = r; pintarMesLinea(); }
});
chrome.storage.onChanged.addListener((c) => {
    if (c.sc_estado_mes && c.sc_estado_mes.newValue) { mesLineaDatos.web = c.sc_estado_mes.newValue; pintarMesLinea(); }
});

renderSesionSri();
chrome.storage.onChanged.addListener((c) => { if (c.sc_sesion_confirmada || c.pending_sri_autofill) renderSesionSri(); });

function renderAtsPendientes() {
    const caja = document.getElementById('atsPendientes');
    const lista = document.getElementById('atsPendLista');
    const cuenta = document.getElementById('atsPendCount');
    if (!caja || !lista || !cuenta) return;
    chrome.storage.local.get(['sc_ats_pendientes', 'sc_clients_cache'], (st) => {
        const mapa = st.sc_ats_pendientes || {};
        const cache = Array.isArray(st.sc_clients_cache) ? st.sc_clients_cache : [];
        const entradas = Object.values(mapa).filter((x) => x && x.ruc);
        entradas.sort((a, b) => (b.cuando || 0) - (a.cuando || 0));
        cuenta.textContent = String(entradas.length);
        mesLineaDatos.ats = entradas.length;
        pintarMesLinea();
        caja.style.display = entradas.length ? 'block' : 'none';
        lista.innerHTML = entradas.map((e) => {
            const c = cache.find((x) => x && String(x.ruc) === String(e.ruc));
            const nombre = (c && (c.name || c.nombre)) || e.ruc;
            const hace = Math.round((Date.now() - (e.cuando || Date.now())) / 86400000);
            const dias = hace <= 0 ? 'hoy' : hace + 'd';
            return '<div style="display:flex; align-items:center; gap:6px; font-size:11px;">'
                + '<span style=\"min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\">' + nombre + '</span>'
                + '<span style=\"font-family:JetBrains Mono,monospace; font-size:9px; color:#94a3b8;\">' + (e.periodo || '') + (e.compras ? ' · compras ✓' : ' · faltan compras') + ' · ' + dias + '</span>'
                + '<button data-ats-abrir="' + e.ruc + '" title="Abrir Anexos del SRI" style="margin-left:auto; border:none; background:rgba(201,169,110,.18); color:#e6d3ab; border-radius:6px; padding:2px 6px; font-size:10px; cursor:pointer;">Abrir</button>'
                + '<button data-ats-listo="' + e.ruc + '" title="Marcar subido" style="border:none; background:rgba(52,211,153,.15); color:#34d399; border-radius:6px; padding:2px 6px; font-size:10px; cursor:pointer;">Listo</button>'
                + '</div>';
        }).join('');
    });
}

document.addEventListener('click', (ev) => {
    const abrir = ev.target.closest && ev.target.closest('[data-ats-abrir]');
    if (abrir) {
        ev.stopPropagation();
        const ruc = abrir.getAttribute('data-ats-abrir');
        chrome.storage.local.get(['sc_clients_cache'], (st) => {
            const cache = Array.isArray(st.sc_clients_cache) ? st.sc_clients_cache : [];
            const c = cache.find((x) => x && String(x.ruc) === String(ruc));
            const url = 'https://srienlinea.sri.gob.ec/rig/pages/menuInicial.xhtml?codOperativo=IVA&contextoMPT=https://srienlinea.sri.gob.ec/tuportal-internet&pathMPT=&actualMPT=' + encodeURIComponent('Anexo Transaccional Simplificado');
            const claveCli = c && (c.password || c.sriPassword);
            if (c && claveCli) {
                chrome.storage.local.set({
                    pending_sri_autofill: { ruc: String(ruc), password: claveCli, name: c.name || c.nombre || '', timestamp: Date.now(), manual: true, isBatch: false, soloEstarAdentro: true },
                    pendingAction: 'solo_perfil', autoDeclaration: false, sri_auto_mode: false,
                    sri_master_switch_on: true, sriAutomationPaused: false, actionTimestamp: Date.now(),
                }, () => { chrome.tabs.create({ url }); window.close(); });
            } else {
                chrome.tabs.create({ url }); window.close();
            }
        });
        return;
    }
    const listo = ev.target.closest && ev.target.closest('[data-ats-listo]');
    if (listo) {
        ev.stopPropagation();
        const ruc = listo.getAttribute('data-ats-listo');
        chrome.storage.local.get(['sc_ats_pendientes'], (st) => {
            const mapa = st.sc_ats_pendientes || {};
            delete mapa[ruc];
            chrome.storage.local.set({ sc_ats_pendientes: mapa }, () => renderAtsPendientes());
        });
    }
});

renderAtsPendientes();
chrome.storage.onChanged.addListener((c) => { if (c.sc_ats_pendientes) renderAtsPendientes(); });

document.getElementById('btnMostrarHud')?.addEventListener('click', async () => {
    try {
        await chrome.storage.local.set({ sri_master_switch_on: true, sriAutomationPaused: false });
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const esSri = !!tab && /sri\.gob\.ec/.test(tab.url || '');
        if (esSri && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'mostrarHud' }, () => {
                if (chrome.runtime.lastError) chrome.tabs.reload(tab.id);
            });
            window.close();
        } else {
            await chrome.tabs.create({ url: 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT' });
            window.close();
        }
    } catch (e) { console.warn('🎛 no se pudo mostrar la barra:', e); }
});

document.getElementById('btnBenditaMenu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('benditaMenu');
        const abrir = menu.style.display !== 'block';
        menu.style.display = abrir ? 'block' : 'none';
        document.getElementById('benditaMenuOverlay').style.display = abrir ? 'block' : 'none';
    });
    document.getElementById('benditaMenu')?.addEventListener('click', cerrarBenditaMenu);
    document.getElementById('benditaMenuOverlay')?.addEventListener('click', cerrarBenditaMenu);

    // El formulario nace oculto (ver popup.html): un clic lo muestra y pone
    // el foco en el RUC, sin tener que buscar la tarjeta del cliente primero.
    document.getElementById('btnToggleClaveManual')?.addEventListener('click', () => {
        const form = document.getElementById('formClaveManual');
        const abierto = form.style.display === 'flex';
        form.style.display = abierto ? 'none' : 'flex';
        if (!abierto) document.getElementById('rucClaveInput')?.focus();
    });

    // 🔑 Clave SRI de un solo cliente, escrita a mano (el hermano chico de la
    // importación CSV). Se guarda SOLO en la caché local y desbloquea al cliente.
    document.getElementById('btnGuardarClave')?.addEventListener('click', async () => {
        const ruc = document.getElementById('rucClaveInput').value;
        const clave = document.getElementById('claveInput').value;
        const ok = await guardarClaveManual(ruc, clave);
        if (ok) {
            document.getElementById('rucClaveInput').value = '';
            document.getElementById('claveInput').value = '';
            document.getElementById('claveInput').focus();
        }
    });
    document.getElementById('claveInput')?.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        document.getElementById('btnGuardarClave')?.click();
    });

    // 🎯 Prende el primer período (hacia atrás) con clientes sin declarar.
    document.getElementById('btnMesQueFalta')?.addEventListener('click', () => {
        detectarMesQueFalta();
    });

    document.getElementById('searchInput').addEventListener('input', () => {
        renderClients();
    });

    const syncHandler = () => {
        chrome.storage.local.get(['last_sync_time'], async (res) => {
            const lastSync = res.last_sync_time || 0;
            const now = Date.now();
            const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);

            if (hoursSinceLastSync < 4) {
                const proceed = await pedirConfirmacion({ titulo: "Ahorro de datos", mensaje: "⚠️ AHORRO DE DATOS (EGRESS EXCEEDED)\n\n" +
                    "Sincronizaste hace menos de 4 horas.\n" +
                    "Hacer múltiples descargas al día agota la cuota mensual de Supabase.\n\n" +
                    "¿Deseas forzar una sincronización nueva en este momento?", aceptar: "Sincronizar igual", cancelar: "No" });
                if (!proceed) return;
            }

            chrome.storage.local.set({ last_sync_time: now });
            const btn = document.getElementById('btnSyncCloud');
            if (btn) {
                const orig = btn.innerText;
                btn.innerText = "⏳ Sincronizando...";
                setTimeout(() => { if (btn) btn.innerText = orig; }, 1200);
            }
            
            fetchClients(true);
        });
    };

    document.getElementById('btnSyncCloud')?.addEventListener('click', syncHandler);

    // 📥 Importador masivo de contraseñas desde CSV (Chrome o formato RUC,Clave)
    document.getElementById('btnImportarCsv')?.addEventListener('click', () => {
        document.getElementById('inputCsvClaves')?.click();
    });

    document.getElementById('inputCsvClaves')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            if (typeof text === 'string') {
                await importarClavesDesdeCsv(text);
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    });

    // Restaurar estado de Modo Auto Bucle
    chrome.storage.local.get(['auto_batch_enabled', 'sc_loop'], (res) => {
        const chk = document.getElementById('chkAutoBatch');
        if (!chk) return;
        const loop = res.sc_loop || {};
        const hayLote = Array.isArray(loop.cola) && loop.cola.length > 0;
        // Con un lote vivo manda el semáforo; sin lote, la preferencia guardada.
        chk.checked = hayLote ? loop.estado === 'CORRIENDO' : !!res.auto_batch_enabled;
        pintarPanelModoAuto();
    });

    document.getElementById('chkAutoBatch')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        chrome.storage.local.get(['sc_loop'], (r) => {
            const loop = r.sc_loop || {};
            const hayLote = Array.isArray(loop.cola) && loop.cola.length > 0;
            const cambios = { auto_batch_enabled: isChecked };

            if (hayLote) {
                // Con un lote en marcha la casilla lo pausa o lo reanuda; antes
                // solo tocaba una bandera vieja y el lote moría a mitad de camino
                // sin preparar al siguiente cliente.
                cambios.sc_loop = isChecked
                    ? { ...loop, estado: 'CORRIENDO', latido: Date.now(), motivo: '' }
                    : { ...loop, estado: 'PAUSANDO', motivo: 'Pausa desde el popup' };
            }

            chrome.storage.local.set(cambios);
            // Antes solo se repintaba en "sin lote y se activó" — pausar o
            // reanudar un lote YA corriendo (los dos casos donde más importa
            // que el cartel de abajo refleje la realidad) dejaban el panel
            // con el texto de un estado anterior.
            pintarPanelModoAuto();
            showToast(
                !hayLote ? (isChecked ? '⚡ Bucle ACTIVADO para el próximo lote' : '⏸️ Bucle DESACTIVADO')
                : isChecked ? '▶️ Bucle REANUDADO'
                : '⏸️ Pausa: termina el cliente actual y para ahí'
            );
        });
    });

    // â”€â”€ Parada de emergencia desde el popup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // El ðŸ›‘ del HUD existe pero vive en la pestaña del SRI: si estás en otra
    // pestaña no lo ves. Este botón escribe el semáforo (la única autoridad
    // del bucle) y deja el lote listo para reanudar, sin perder la cola.
    // Siguiente tanda: la cola que quedó guardada por el corte de 50.
    function pintarSiguienteTanda() {
        const btn = document.getElementById('btnSiguienteTanda');
        if (!btn) return;
        chrome.storage.local.get(['sc_lote_resto', 'sc_loop'], (r) => {
            const resto = Array.isArray(r.sc_lote_resto) ? r.sc_lote_resto : [];
            const loop = r.sc_loop || {};
            const corriendo = loop.estado === 'CORRIENDO' || loop.estado === 'PAUSANDO';
            const mostrar = resto.length > 0 && !corriendo;
            btn.style.display = mostrar ? '' : 'none';
            if (mostrar) btn.textContent = `▶ Siguiente tanda · ${resto.length} en cola`;
        });
    }

    document.getElementById('btnSiguienteTanda')?.addEventListener('click', () => {
        chrome.storage.local.get(['sc_lote_resto'], (r) => {
            const resto = Array.isArray(r.sc_lote_resto) ? r.sc_lote_resto : [];
            if (!resto.length) { showToast('No hay una tanda pendiente.'); return; }
            ejecutarLoteCompleto(false, resto);
        });
    });

    chrome.storage.onChanged.addListener((cambios, area) => {
        if (area === 'local' && (cambios.sc_lote_resto || cambios.sc_loop)) pintarSiguienteTanda();
    });

    pintarSiguienteTanda();

    // Una sola acción primaria por estado (§4): al correr, sólo Detener.
    function ocultarCtasSecundarias(corriendo) {
        // Al correr, sólo Detener. Al parar, cada botón decide su visibilidad
        // (segunda vuelta y siguiente tanda dependen de que haya trabajo).
        ["btnCorrerTodos", "btnSegundaVuelta", "btnSiguienteTanda"].forEach((id) => {
            const b = document.getElementById(id);
            if (b && corriendo) b.style.display = "none";
        });
        const run = document.getElementById("btnEjecutarLote");
        if (run) run.style.display = corriendo ? "none" : "";
    }

    function pintarDetener() {
        const btn = document.getElementById('btnDetener');
        if (!btn) return;
        chrome.storage.local.get(['sc_loop'], (r) => {
            const loop = r.sc_loop || {};
            const cola = Array.isArray(loop.cola) ? loop.cola : [];
            const vivo = cola.length > 0 && (loop.estado === 'CORRIENDO' || loop.estado === 'PAUSANDO');
            btn.style.display = vivo ? '' : 'none';
            // Mientras corre, Detener es la única acción: el resto se esconde.
            ocultarCtasSecundarias(vivo);
            if (vivo) {
                const idx = Math.min(Number(loop.indice || 0) + 1, cola.length);
                btn.textContent = `🛑 Detener bucle · ${idx}/${cola.length}`;
            }
        });
    }

    // Vacíos con salida (§8): el estado vacío ofrece la siguiente acción.
    document.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-accion]');
        if (!b) return;
        if (b.dataset.accion === 'periodo') {
            const sel = document.getElementById('periodMonth');
            if (sel) { sel.focus(); sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        }
        if (b.dataset.accion === 'ajustes') {
            chrome.runtime.openOptionsPage();
        }
    });

    document.getElementById('btnDetener')?.addEventListener('click', () => {
        chrome.storage.local.get(['sc_loop'], (r) => {
            const loop = r.sc_loop || {};
            const cambios = {
                sc_loop: {
                    ...loop,
                    estado: 'DETENIDO',
                    latido: Date.now(),
                    motivo: 'Detenido desde el popup'
                },
                sriAutomationPaused: true,
                auto_batch_enabled: false,
                sri_master_switch_on: false,
                ghost_manual_mode: true
            };
            chrome.storage.local.set(cambios, () => {
                chrome.storage.local.remove(['pendingAction', 'actionTimestamp']);
                showToast('🛑 Bucle detenido. El cliente en curso termina su paso.');
                pintarDetener();
                pintarPanelModoAuto();
            });
        });
    });

    chrome.storage.onChanged.addListener((cambios, area) => {
        if (area === 'local' && cambios.sc_loop) pintarDetener();
    });

    pintarDetener();

    // Pesta    // Pestañas. El clic puede caer en el número (un <span>) y no en el
    // botón: con e.target la pestaña no se activaba.
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            e.currentTarget.classList.add('active');
            const targetEl = document.getElementById(e.currentTarget.dataset.target);
            if (targetEl) targetEl.classList.add('active');
        });
    });

    // ── La acción principal y las dos superficies nuevas ────────────────
    document.getElementById('btnEjecutarLote')?.addEventListener('click', async (evento) => {
        const btn = evento.currentTarget;
        if (btn.disabled) return;
        const previo = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="mini-spin"></span> Preparando…';
        try {
            await ejecutarLoteCompleto();
        } finally {
            btn.disabled = false;
            btn.innerHTML = previo;
        }
    });

    document.getElementById('btnCorrerTodos')?.addEventListener('click', () => {
        ejecutarLoteCompleto(true);
    });

    const menu = document.getElementById('menuPanel');
    const btnMenu = document.getElementById('btnMenu');
    const ponerMenu = (abrir) => {
        if (!menu || !btnMenu) return;
        menu.classList.toggle('open', abrir);
        btnMenu.setAttribute('aria-expanded', String(abrir));
    };
    btnMenu?.addEventListener('click', (e) => {
        e.stopPropagation();
        ponerMenu(!menu.classList.contains('open'));
    });
    // Cualquier clic fuera cierra. Los clics dentro no, para que el formulario
    // de clave manual y el menú de selección puedan usarse.
    document.addEventListener('click', (e) => {
        if (!menu || !menu.classList.contains('open')) return;
        if (menu.contains(e.target) || (btnMenu && btnMenu.contains(e.target))) return;
        ponerMenu(false);
    });
    document.getElementById('btnMesQueFalta')?.addEventListener('click', () => ponerMenu(false));
    document.getElementById('btnSyncCloud')?.addEventListener('click', () => ponerMenu(false));
    document.getElementById('btnImportarCsv')?.addEventListener('click', () => ponerMenu(false));

    const grid = document.getElementById('toolsGrid');
    const btnTools = document.getElementById('btnTools');
    btnTools?.addEventListener('click', () => {
        if (!grid) return;
        const abierto = grid.classList.toggle('open');
        btnTools.setAttribute('aria-expanded', String(abierto));
    });
    document.querySelectorAll('[data-herramienta]').forEach(b => {
        b.addEventListener('click', () => abrirHerramienta(b.dataset.herramienta));
    });
}

/**
 * Evalúa el perfil tributario y régimen del cliente para saber si aplica IVA Mensual
 * y explica el motivo transparente si no aplica (Popular, Semestral, Inactivo, etc.).
 */
/**
 * Deduce mensual vs semestral por su HISTORIA de declaraciones (el último
 * comprobante manda). Sólo se usa cuando la web no trae la frecuencia:
 *  - periodos "2026-05"  → declaró un mes  → Mensual
 *  - periodos "2026-S1"  → declaró semestre → Semestral
 *  - 3 o más meses en el historial → Mensual (aunque el último sea raro)
 */
function frecuenciaPorHistorial(c) {
    const h = Array.isArray(c && c.declaration_history) ? c.declaration_history : [];
    const iva = h.filter((e) => String((e && e.type) || '').toUpperCase().includes('IVA'));
    if (!iva.length) return null;
    const periodos = iva.map((e) => String((e && e.period) || '').trim()).filter(Boolean);
    const mensuales = periodos.filter((x) => /^\d{4}-\d{2}$/.test(x));
    const semestres = periodos.filter((x) => /^\d{4}-S[12]$/.test(x));
    const ultimo = periodos.slice().sort((a, b) => String(b).localeCompare(String(a)))[0] || '';
    if (/^\d{4}-\d{2}$/.test(ultimo)) return { esMensual: true, label: 'IVA Mensual (por historial)', motivo: 'historial_mensual' };
    if (/^\d{4}-S[12]$/.test(ultimo)) return { esMensual: false, label: 'IVA Semestral (por historial)', motivo: 'historial_semestral' };
    if (mensuales.length >= 3) return { esMensual: true, label: 'IVA Mensual (por historial)', motivo: 'historial_mensual' };
    if (semestres.length) return { esMensual: false, label: 'IVA Semestral (por historial)', motivo: 'historial_semestral' };
    return null;
}

/** ¿El RUC es de una sociedad? 3.er dígito = 9 (persona jurídica). */
function esRucSociedad(ruc) {
    const limpio = String(ruc || '').replace(/\D/g, '');
    return limpio.length === 13 && limpio[2] === '9';
}

function evaluarRegimenCliente(c) {
    if (!c || !c.ruc) return { esMensual: false, label: 'Sin RUC', motivo: 'invalido' };
    if (c.force_mensual === true) return { esMensual: true, label: 'IVA Mensual (Forzado)', motivo: 'forzado' };
    if (c.isDeleted || c.is_deleted) return { esMensual: false, label: 'Eliminado', motivo: 'eliminado' };
    if (c.isActive === false || c.is_active === false) return { esMensual: false, label: 'Inactivo en BD', motivo: 'inactivo' };

    const tp = c.tax_profile || c.taxProfile || {};
    const freq = (tp.ivaFrequency || c.iva_frequency || c.ivaFrequency || '').toLowerCase();
    const reg = (c.regime || '').toLowerCase();
    const type = (c.client_type || c.clientType || tp.clientType || '').toLowerCase();

    // 🛡️ Credencial rechazada o cuenta bloqueada por el SRI: no entra al lote.
  // El SRI bloquea a los 5 intentos; reintentar solo empeora el caso.
  const cred = tp.sriCredencial || {};
  if (cred.estado && cred.estado !== 'ok') {
    const etiqueta = cred.estado === 'bloqueada' ? 'SRI bloqueado (recuperar clave)'
      : cred.estado === 'caducada' ? 'Clave vencida (cambiar en el SRI)'
      : 'Clave rechazada por el SRI';
    return { esMensual: false, label: etiqueta, motivo: 'credencial_mala' };
  }

  if (type === 'solo_plan' || c.requires_declarations === false || tp.requiresDeclarations === false) {
        return { esMensual: false, label: 'Solo Plan (Sin Declaraciones)', motivo: 'solo_plan' };
    }

    // Aún no empieza a declarar: el primer período de obligación (clientStartPeriod,
    // marcado en la web como "Al día desde"/"Inicio de Obligaciones") es posterior
    // al período objetivo del bucle (el mes calendario anterior).
    const startPeriod = tp.clientStartPeriod || c.client_start_period || c.clientStartPeriod || '';
    if (startPeriod) {
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const targetKey = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
        if (String(startPeriod) > targetKey) {
            return { esMensual: false, label: `Empieza a declarar desde ${startPeriod}`, motivo: 'aun_no_empieza' };
        }
    }

    if (freq === 'mensual') {
        return { esMensual: true, label: 'IVA Mensual', motivo: 'frecuencia_mensual' };
    }

    if (reg.includes('popular')) {
        return { esMensual: false, label: 'RIMPE Negocio Popular (No declara IVA)', motivo: 'rimpe_popular' };
    }

    if (reg.includes('emprendedor')) {
        const mensual = freq === 'mensual';
        return {
            esMensual: mensual,
            label: mensual ? 'RIMPE Emprendedor (Mensual)' : 'RIMPE Emprendedor (Semestral)',
            motivo: 'rimpe_emprendedor'
        };
    }

    if (freq === 'semestral') {
        return { esMensual: false, label: 'IVA Semestral', motivo: 'semestral' };
    }
    if (freq === 'ninguno' || freq === 'anual') {
        return { esMensual: false, label: `Frecuencia: ${freq || 'Ninguna'}`, motivo: 'no_mensual' };
    }

    // 💤 Sin frecuencia marcada, NO se incluye por defecto — mismo criterio que
    // isClientMensual() en src/01_utilidades_y_pdf.js (corregido ahí el
    // 10-sep-2026 porque este mismo "sin dato, asumo mensual" era como
    // aparecían clientes viejos y de prueba). El popup no puede compartir esa
    // función tal cual porque corre en un contexto de extensión aparte del
    // content script, pero la DECISIÓN tiene que ser la misma: un cliente de
    // verdad trae la frecuencia marcada desde la web.
    // Sin frecuencia marcada: que decida su historia (último comprobante).
const porHistorial = frecuenciaPorHistorial(c);
if (porHistorial) return porHistorial;
return { esMensual: false, label: 'Sin frecuencia marcada', motivo: 'sin_frecuencia' };
}

function isMensual(c) {
    return evaluarRegimenCliente(c).esMensual;
}

/**
 * Parsea un CSV de contraseñas de Chrome (name,url,username,password) o un archivo RUC,Clave
 */
function parsearCsvClaves(texto) {
    const lineas = texto.split(/\r?\n/);
    const entradas = [];
    for (const linea of lineas) {
        const l = linea.trim();
        if (!l) continue;

        let ruc = '';
        let pass = '';

        if (l.includes('\t')) {
            const parts = l.split('\t');
            ruc = parts[0]?.trim();
            pass = parts[1]?.trim();
        } else if (l.includes(';')) {
            const parts = l.split(';');
            ruc = parts[0]?.trim();
            pass = parts[1]?.trim();
        } else {
            const parts = l.split(',');
            // Si es export de Google Chrome: name,url,username,password,note
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

async function importarClavesDesdeCsv(texto) {
    const entradas = parsearCsvClaves(texto);
    if (!entradas.length) {
        alert("⚠️ No se encontraron credenciales válidas con RUC de 13 dígitos en el archivo CSV.");
        return;
    }

    const cacheRes = await chrome.storage.local.get(['sc_clients_cache', 'flagged_errors', 'sri_tried_credentials', 'sc_omitidos']);
    const cacheList = Array.isArray(cacheRes.sc_clients_cache) ? cacheRes.sc_clients_cache : [];
    const errs = cacheRes.flagged_errors || {};
    const tried = cacheRes.sri_tried_credentials || {};
    const omit = cacheRes.sc_omitidos || {};

    const mapNuevas = new Map(entradas.map(e => [e.ruc, e.password]));
    let actualizadas = 0;

    cacheList.forEach(c => {
        if (mapNuevas.has(c.ruc)) {
            const newPass = mapNuevas.get(c.ruc);
            if (c.password !== newPass) {
                c.password = newPass;
                c.sri_password = newPass;
                actualizadas++;
            }
            // Limpiar bloqueos de error si se actualizó la clave
            delete errs[c.ruc];
            delete tried[c.ruc];
            delete omit[c.ruc];
        }
    });

    allRawClients.forEach(c => {
        if (mapNuevas.has(c.ruc)) {
            const newPass = mapNuevas.get(c.ruc);
            c.password = newPass;
            c.sri_password = newPass;
        }
    });

    await chrome.storage.local.set({
        sc_clients_cache: cacheList,
        flagged_errors: errs,
        sri_tried_credentials: tried,
        sc_omitidos: omit
    });

    flaggedErrors = errs;
    renderClients();
    showToast(`✅ ${actualizadas} claves actualizadas de ${entradas.length} encontradas en CSV`);
}

async function fetchClients(forceSync = false) {
    const FIELDS = 'id,ruc,name,regime,tax_profile,declaration_history,updated_at';
    try {
        // Intento 1: filtrar bajas en el servidor. Requiere que el rol `anon`
        // pueda leer `is_deleted` (GRANT SELECT (is_deleted) ON clients TO anon;
        // ver grant_is_deleted_anon.sql). Sin ese permiso el SRI de la web marca
        // la baja y acá no nos enteramos: HTTP 401 / 42501.
        let res = await fetch(`${SUPABASE_URL}/rest/v1/clients?is_deleted=eq.false&select=${FIELDS}`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });

        // Intento 2 (degradado): el GRANT no se corrió todavía. Traemos todo lo
        // legible y avisamos: la lista puede incluir bajas hasta que corra el
        // GRANT. NO machacamos la caché con esto si ya hay una sana, pero sí
        // dejamos que la lista se refresque para que no quede congelada.
        if (!res.ok) {
            syncBajasBloqueado = true;
            const degradado = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=${FIELDS}`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            if (!degradado.ok) throw new Error("Error fetching clients (" + degradado.status + ")");
            const dataDegradada = await degradado.json();
            await fusionarClientes(dataDegradada, /*conFiltroBajas*/ false);
        } else {
            syncBajasBloqueado = false;
            const data = await res.json();
            await fusionarClientes(data, /*conFiltroBajas*/ true);
            // La consulta con is_deleted=eq.false EXCLUYE a las bajas del
            // servidor: sin una consulta aparte, la pestaña 🚫 Bajas quedaría
            // siempre vacía aunque existan. Se pide solo si el GRANT funciona
            // (si no, no hay forma de leer la columna).
            try {
                const bajasRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?is_deleted=eq.true&select=id,ruc,name,regime,tax_profile,declaration_history`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                if (bajasRes.ok) {
                    const bajas = await bajasRes.json();
                    if (Array.isArray(bajas)) {
                        clientesBaja = bajas.map(c => ({ ...c, is_deleted: true }));
                        // SC_BAJAS_KEY estaba declarada pero nunca se escribía:
                        // la pestaña 🚫 Bajas se veía bien recién sincronizada y
                        // quedaba vacía de nuevo en cuanto se reabría el popup
                        // (loadClientsFromCacheOrFetch la lee de acá).
                        await chrome.storage.local.set({ [SC_BAJAS_KEY]: clientesBaja });
                    }
                }
            } catch (e) { /* la pestaña de bajas es secundaria; no tumbar el sync */ }
        }
    } catch (err) {
        console.error(err);
        if (allClients.length === 0) {
            document.getElementById('pendientesList').innerHTML = `
                <div class="empty-state">
                    ⚠️ Error de conexión a la base de datos.
                    <br>
                    <button id="btnRetry" style="margin-top:12px; padding:8px 16px; background:linear-gradient(135deg, #6366f1, #4f46e5); border:none; border-radius:8px; color:white; cursor:pointer; font-weight:700; font-size:12px;">
                        🔄 Reintentar Conexión
                    </button>
                </div>
            `;
            document.getElementById('btnRetry')?.addEventListener('click', () => {
                document.getElementById('pendientesList').innerHTML = `
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <div>Conectando a Supabase...</div>
                    </div>
                `;
                fetchClients(true);
            });
        }
    }
    renderClients();
}

/**
 * Une los datos frescos de Supabase con lo local (claves, force_mensual) y
 * reemplaza la lista: los que ya no vienen (baja real) desaparecen. Con
 * conFiltroBajas=false no podemos distinguir bajas, así que la caché previa se
 * conserva y solo se actualizan nombres/datos de RUC que siguen viniendo.
 */
async function fusionarClientes(data, conFiltroBajas) {
    let prevList = [];
    if (chrome && chrome.storage && chrome.storage.local) {
        const pc = await chrome.storage.local.get(['sc_clients_cache']);
        prevList = Array.isArray(pc.sc_clients_cache) ? pc.sc_clients_cache : [];
    }
    const prevMap = new Map(prevList.map((p) => [p.ruc, p]));

    const frescos = data.map(c => {
        const cached = prevMap.get(c.ruc) || {};
        // conFiltroBajas=true: la consulta ya excluyó bajas en el servidor,
        // así que todo lo que llega acá es is_deleted=false de verdad.
        // conFiltroBajas=false (degradado): el SELECT ni pidió esa columna
        // (falta el GRANT), así que `c.isDeleted`/`c.is_deleted` vienen
        // undefined — NO se asume "activo" con eso: se conserva lo último que
        // se supo de este RUC en la caché. Mismo defecto que ya se corrigió
        // en la web (useAppStore.loadFromDB): un `undefined` convertido en
        // `false` es cómo una baja resucitaba.
        const rawIsDeleted = conFiltroBajas
            ? false
            : (typeof c.isDeleted === 'boolean' ? c.isDeleted
               : typeof c.is_deleted === 'boolean' ? c.is_deleted
               : !!cached.isDeleted);
        const rawIsActive = typeof c.isActive === 'boolean' ? c.isActive
            : typeof c.is_active === 'boolean' ? c.is_active
            : (cached.isActive !== false);

        return {
            id: c.id,
            ruc: c.ruc,
            name: c.name || 'Cliente SRI',
            regime: c.regime,
            tax_profile: c.tax_profile,
            force_mensual: cached.force_mensual || false,
            password: cached.password || cached.sri_password || "",
            declarations: Array.isArray(c.declaration_history) ? c.declaration_history : [],
            isDeleted: rawIsDeleted,
            isActive: rawIsActive
        };
    });

    if (conFiltroBajas) {
        // La nube ya filtró: esto ES la verdad. Podar lo que ya no vino.
        allRawClients = frescos;
        const ts = Date.now();
        syncUltimoTs = ts;
        await chrome.storage.local.set({
            sc_clients_cache: frescos,
            [SC_CACHE_TS_KEY]: ts
        });
    } else {
        // Degradado (sin GRANT): actualizamos los que siguen viniendo pero
        // conservamos los RUC locales que la nube ya no manda — no sabemos
        // si son bajas o un corte de permisos. El banner lo explica.
        const frescosMap = new Map(frescos.map(c => [c.ruc, c]));
        const conservados = prevList
            .filter(p => p && p.ruc && !frescosMap.has(p.ruc))
            .map(p => ({ ...p, declarations: Array.isArray(p.declarations) ? p.declarations : [] }));
        allRawClients = [...frescos, ...conservados];
        await chrome.storage.local.set({ sc_clients_cache: allRawClients });
    }

    separarPorRegimen();
}

function getNinthDigit(ruc) {
    if (!ruc || ruc.length < 9) return 99;
    const char = ruc.charAt(8);
    const digit = parseInt(char, 10);
    if (isNaN(digit)) return 99;
    return digit === 0 ? 10 : digit;
}

function hasPdfForPeriod(client, year, monthIndex) {
    const decs = client.declarations || client.sri_declaraciones;
    if (!Array.isArray(decs) || decs.length === 0) return false;
    
    const targetPeriodStr = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
    
    return decs.some(d => {
        if (!d) return false;
        const p = (d.period || '').split(':')[0].trim();
        const matchesPeriod = p.includes(targetPeriodStr) || p === targetPeriodStr;
        if (!matchesPeriod) return false;
        const hasProof = !!(d.proof_file || d.pdfUrl || d.proofFile);
        const isDoneStatus = d.status === 'Completado' || d.status === 'Enviada' || d.status === 'Pagada';
        return hasProof || isDoneStatus;
    });
}

function loadClientsFromCacheOrFetch() {
    chrome.storage.local.get(['sc_clients_cache', 'flagged_errors', SC_BENDITA_KEY, SC_CACHE_TS_KEY, SC_BAJAS_KEY, 'sc_declaraciones_locales', 'sri_target_period', 'sc_orden_meses_popup'], (res) => {
        flaggedErrors = res.flagged_errors || {};
        listaBendita = Array.isArray(res[SC_BENDITA_KEY]) ? res[SC_BENDITA_KEY] : null;
        syncUltimoTs = res[SC_CACHE_TS_KEY] || null;
        clientesBaja = Array.isArray(res[SC_BAJAS_KEY]) ? res[SC_BAJAS_KEY] : [];
        declaracionesLocales = res.sc_declaraciones_locales || {};
        // 🗓️ Restaurar la orden de meses que quedó marcada (RUC → Set de 'AAAA-MM').
        try {
            const guardada = res.sc_orden_meses_popup || {};
            ordenMeses = {};
            for (const [k, v] of Object.entries(guardada)) {
                if (Array.isArray(v) && v.length) ordenMeses[k] = new Set(v);
            }
        } catch (e) { ordenMeses = {}; }
        // Si hay una preferencia de período guardada, la caché va a pisar los
        // selects que initSelectors ya prefijó al mes anterior: aplicarla de nuevo.
        const t = res.sri_target_period;
        if (t && t.year && typeof t.monthIndex === 'number') {
            currentYear = t.year;
            currentMonth = t.monthIndex;
            const ms = document.getElementById('periodMonth');
            const ys = document.getElementById('periodYear');
            if (ms) ms.value = currentMonth;
            if (ys) ys.value = currentYear;
        }
        if (Array.isArray(res.sc_clients_cache) && res.sc_clients_cache.length > 0) {
            console.log("⚡ [Nueva Luz 3.0] Carga instantánea desde caché local:", res.sc_clients_cache.length, "clientes");
            allRawClients = res.sc_clients_cache;
            separarPorRegimen();
            renderClients();
            // Caché vieja: refrescar en segundo plano (30 min). El dato de la
            // web manda; si falla, se sigue usando lo que hay en pantalla.
            {
                const edad = Date.now() - Number(res[SC_CACHE_TS_KEY] || 0);
                const VENCIDA = 30 * 60 * 1000;
                if (!res[SC_CACHE_TS_KEY] || edad > VENCIDA) {
                    console.log('[Sync] Caché con', Math.round(edad / 60000), 'min: refrescando…');
                    fetchClients();
                }
            }
        } else {
            fetchClients();
        }
    });
}

/** Persiste el mes elegido en los selects como preferencia del período objetivo. */
function persistirMesSeleccionado() {
    return chrome.storage.local.set({
        sri_target_period: { year: currentYear, monthIndex: currentMonth },
        selected_period_month: currentMonth,
        selected_period_year: currentYear,
        selected_period_updated_at: Date.now(),
        workflowPeriod: { year: currentYear, monthIndex: currentMonth }
    });
}

/** Equivalente local a SriLoop.declaracionLocal(): ¿declaramos a este RUC este período? */
function declaracionLocalPopup(ruc, year, monthIndex) {
    const clave = `${ruc}|${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    return declaracionesLocales[clave] || null;
}

/** Mensuales que faltan declarar un período dado (mismo criterio que los Pendientes del popup). */
function faltantesParaPeriodo(year, monthIndex) {
    return allClients.filter(c =>
        !flaggedErrors[c.ruc] &&
        !hasPdfForPeriod(c, year, monthIndex) &&
        !declaracionLocalPopup(c.ruc, year, monthIndex));
}

/** 🗓️ Los meses PENDIENTES de UN cliente, en orden cronológico ascendente.
 *  Barre los meses pendientes hacia atrás respetando el tope estricto de
 *  máximo 2 años (2025 y 2026), nunca 2024 ni anteriores. */
function mesesPendientesDeCliente(cliente) {
    if (!cliente || !cliente.ruc) return [];
    const baseY = currentYear, baseM = currentMonth;
    const meses = [];
    const MIN_YEAR = 2025; // 🎯 Límite estricto: máximo 2 años (2025 y 2026)

    for (let back = 0; back < 24; back++) {
        const d = new Date(baseY, baseM - back, 1);
        const y = d.getFullYear(), m = d.getMonth();
        if (y < MIN_YEAR) break; // 🛑 Frenar en 2025: nunca 2024 ni antes

        const ya = hasPdfForPeriod(cliente, y, m) || !!declaracionLocalPopup(cliente.ruc, y, m);
        if (!ya) {
            const periodo = `${y}-${String(m + 1).padStart(2, '0')}`;
            meses.push({ year: y, monthIndex: m, periodo, label: periodoLabelLocal(y, m) });
        }
    }
    return meses.reverse();   // ascendente: el más antiguo (de 2025) primero
}

/** Etiqueta «mes año» a partir de year + monthIndex (sin tocar selects). */
function periodoLabelLocal(year, monthIndex) {
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                   'agosto','septiembre','octubre','noviembre','diciembre'];
    return `${MESES[monthIndex]} ${year}`;
}

/** 🎯 Detecta el primer período (empezando por el seleccionado, hacia atrás hasta 2025)
 *  con clientes sin declarar y lo deja elegido. null si todo está al día. */
async function detectarMesQueFalta() {
    const base = { year: currentYear, monthIndex: currentMonth };
    const MIN_YEAR = 2025; // 🎯 Límite estricto: solo 2025 y 2026

    for (let back = 0; back < 24; back++) {
        const d = new Date(base.year, base.monthIndex - back, 1);
        const y = d.getFullYear(), m = d.getMonth();
        if (y < MIN_YEAR) break; // 🛑 No bajar a 2024

        const faltan = faltantesParaPeriodo(y, m);
        if (faltan.length > 0) {
            currentYear = y;
            currentMonth = m;
            const ms = document.getElementById('periodMonth');
            const ys = document.getElementById('periodYear');
            if (ms) ms.value = m;
            if (ys) ys.value = y;
            await persistirMesSeleccionado();
            renderClients();
            showToast(`🎯 Mes que falta: ${periodoLabel()} (${faltan.length} pendientes)`);
            return { found: true, year: y, monthIndex: m, pendientes: faltan.length };
        }
    }
    showToast('🎉 Todo al día: no hay períodos pendientes en 2025-2026.');
    return { found: false };
}

/** 🔑 Guarda la clave SRI de UN cliente a mano (sin CSV), lo desbloquea y lo
 *  agrega a la caché si todavía no estaba. Solo queda en este navegador. */
async function guardarClaveManual(ruc, clave) {
    ruc = String(ruc || '').trim();
    clave = String(clave || '').trim();
    if (!/^\d{10,13}$/.test(ruc)) { showToast('⚠️ RUC inválido: 10 a 13 dígitos.'); return false; }
    if (!clave) { showToast('⚠️ Escribí la clave SRI del cliente.'); return false; }

    const cacheRes = await chrome.storage.local.get([
        'sc_clients_cache', 'flagged_errors', 'sri_tried_credentials', 'sc_omitidos', 'sc_declaraciones_locales'
    ]);
    let cacheList = Array.isArray(cacheRes.sc_clients_cache) ? cacheRes.sc_clients_cache : [];
    let cliente = cacheList.find(c => c.ruc === ruc);

    if (cliente) {
        cliente.password = clave;
        cliente.sri_password = clave;
    } else {
        // ¿Estaba en la caché como baja? Se revive (escrito a mano manda) en
        // vez de duplicar el RUC. Si no estaba del todo: cliente del contador.
        const previo = allRawClients.find(c => c.ruc === ruc);
        if (previo) {
            cliente = { ...previo, is_deleted: false, isDeleted: false, force_mensual: true,
                        password: clave, sri_password: clave };
        } else {
            // Cliente nuevo que el contador escribe a mano: entra como mensual
            // forzado (es quien quiere declararlo) para que aparezca en Pendientes.
            cliente = { ruc, name: 'Cliente manual', password: clave, sri_password: clave, force_mensual: true, regime: 'mensual', tax_profile: {} };
        }
        cacheList = cacheList.filter(c => c.ruc !== ruc);   // si estaba, el previo marcado como baja ya no
        cacheList.push(cliente);
    }

    // Actualizar la clave libera bloqueos previos (clave rechazada, omitido).
    const errs = cacheRes.flagged_errors || {};
    delete errs[ruc];
    const tried = cacheRes.sri_tried_credentials || {};
    delete tried[ruc];
    const omit = cacheRes.sc_omitidos || {};
    delete omit[ruc];
    declaracionesLocales = cacheRes.sc_declaraciones_locales || {};
    await chrome.storage.local.set({
        sc_clients_cache: cacheList,
        flagged_errors: errs,
        sri_tried_credentials: tried,
        sc_omitidos: omit
    });

    // Reflejar también en memoria para que el popup pinte al instante.
    const enRaw = allRawClients.find(c => c.ruc === ruc);
    if (enRaw) {
        enRaw.password = clave;
        enRaw.sri_password = clave;
    } else {
        allRawClients.push(cliente);
    }
    flaggedErrors = errs;
    separarPorRegimen();
    renderClients();
    showToast(`🔑 Clave guardada para ${cliente.name === 'Cliente manual' ? ruc : cliente.name} (solo en este navegador).`);
    return true;
}

/** Parte allRawClients en mensuales / otros / bajas según régimen y estado. */
function separarPorRegimen() {
    allClients = allRawClients.filter(c => evaluarRegimenCliente(c).esMensual);
    // «Otros» = clientes de verdad con otra frecuencia (semestral, emprendedor…).
    // Los restos sin frecuencia (imprenta, consultas, claves sueltas) NO se
    // muestran nunca: sólo quedan en allRawClients para buscar su clave al
    // crear un cliente nuevo o consultar un RUC.
    otrosClients = allRawClients.filter(c => {
        if (c.isDeleted || c.is_deleted) return false;
        const ev = evaluarRegimenCliente(c);
        return !ev.esMensual && ev.motivo !== 'sin_frecuencia';
    });
    clientesBaja = allRawClients.filter(c => c.isDeleted || c.is_deleted);
}

/** true si la Lista Bendita está activa (se creó alguna vez). null/ausente = corre todo. */
function benditaActiva() {
    return Array.isArray(listaBendita);
}

/**
 * Dado de baja en la web. La caché ya excluye a los borrados del último sync,
 * pero si la baja es más nueva que la caché el cliente seguía entrando al
 * lote. Esta lista (sc_clientes_baja) es la que manda para no declarar a
 * alguien que ya no es cliente.
 */
function esBajaWeb(ruc) {
    const r = String(ruc || '').trim();
    if (!r) return false;
    return Array.isArray(clientesBaja) && clientesBaja.some(b => String((b && b.ruc) || '').trim() === r);
}

function esBendito(ruc) {
    return !benditaActiva() || listaBendita.includes(ruc);
}

/** Persiste la lista y repinta. Activar por primera vez enciende el modo Bendita. */
async function guardarBendita() {
    await chrome.storage.local.set({ [SC_BENDITA_KEY]: listaBendita });
    renderClients();
    actualizarCabeceraBendita();
}

async function toggleBendito(ruc) {
    if (!benditaActiva()) listaBendita = [];   // primer bendito: enciende la Bendita
    const i = listaBendita.indexOf(ruc);
    if (i === -1) listaBendita.push(ruc);
    else listaBendita.splice(i, 1);
    await guardarBendita();
}

/** Bendice a todos los pendientes del período actual (los que van a correr). */
async function bendecirTodosPendientes() {
    // OJO: acá NO se filtra por esBendito — la lista puede estar vacía y el
    // propósito es justamente llenarla con todos los que faltan declarar.
    const pendientes = pendientesSinBenditaFilter();
    if (!benditaActiva()) listaBendita = [];
    const set = new Set(listaBendita);
    pendientes.forEach(c => set.add(c.ruc));
    listaBendita = [...set];
    await guardarBendita();
    showToast(`✅ ${pendientes.length} cliente(s) sumado(s) al lote.`);
}

/** Deja la Bendita vacía pero activa: nadie corre hasta bendecir. */
async function quitarTodosBenditos() {
    listaBendita = [];
    await guardarBendita();
    showToast('Selección vacía: no correrá nadie hasta sumar clientes.');
}

/** Desactiva la Bendita por completo: vuelve el comportamiento de siempre (corre todo). */
async function desactivarBendita() {
    listaBendita = null;
    await chrome.storage.local.set({ [SC_BENDITA_KEY]: null });
    renderClients();
    actualizarCabeceraBendita();
    showToast('Sin selección: vuelve a correr todo pendiente.');
}

/** Los clientes mensuales que faltan declarar el período elegido (sin errores). */
function clientesPendientesDelPeriodo() {
    return allClients.filter(c =>
        !flaggedErrors[c.ruc] && !hasPdfForPeriod(c, currentYear, currentMonth) && esBendito(c.ruc) && !esBajaWeb(c.ruc));
}

/** Ídem sin el filtro de la Bendita: para saber si hay pendientes aunque ninguno sea bendito. */
function pendientesSinBenditaFilter() {
    return allClients.filter(c =>
        !flaggedErrors[c.ruc] && !hasPdfForPeriod(c, currentYear, currentMonth) && !esBajaWeb(c.ruc));
}

/** Cantidad de benditos que además faltan declarar el período (los que va a correr el lote). */
function benditosPendientesCount() {
    return clientesPendientesDelPeriodo().length;
}

/** Entre los benditos pendientes, cuántos no tienen clave cargada. */
function benditosPendientesSinClave() {
    return clientesPendientesDelPeriodo().filter(c => !c.password).length;
}

/** Actualiza la barra-resumen de la Bendita y el aviso de sync. */
function actualizarCabeceraBendita() {
    const el = document.getElementById('benditaResumen');
    if (!el) return;
    const sinClave = benditosPendientesSinClave();
    const aCorrer = benditosPendientesCount();
    const html = [];
    if (benditaActiva()) {
        html.push(`<span class="chip bendita-chip on">En el lote: <b>${listaBendita.length}</b></span>`);
        html.push(`<span class="chip" title="Clientes que faltan declarar ${periodoLabel()}">Correrán: <b>${aCorrer}</b></span>`);
        if (sinClave > 0) {
            html.push(`<span class="chip chip-warn" title="Estos clientes del lote no tienen clave SRI cargada">${sinClave} sin clave</span>`);
        }
    } else {
        html.push(`<span class="chip chip-off">Sin selección: corre todo pendiente</span>`);
    }
    el.innerHTML = html.join(' ');
}

function periodoLabel() {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${meses[currentMonth]} ${currentYear}`;
}

/**
 * El botón «Ejecutar lote» dice cuántos van a correr y con qué período.
 * Es el único dato que hay que mirar antes de apretar: si el número no es el
 * que esperabas, el período está mal elegido y conviene arreglarlo ahora, no
 * a mitad de la cola.
 */
function pintarBotonLote() {
    const cuenta = document.getElementById('loteCuenta');
    const sub = document.getElementById('loteSub');
    const btn = document.getElementById('btnEjecutarLote');
    const enBoton = document.getElementById('loteBotonCuenta');
    if (!cuenta) return;

    const aCorrer = clientesPendientesDelPeriodo();
    const todosP = pendientesSinBenditaFilter();
    const conComprobante = allClients.filter(c => hasPdfForPeriod(c, currentYear, currentMonth)).length;
    const sinClave = aCorrer.filter(c => !c.password).length;
    const fueraDeLista = Math.max(0, todosP.length - aCorrer.length);

    // Si La Bendita está activa, el lote corre sólo esa lista: hay que decirlo,
    // si no el número no cierra con la pestaña "Pendientes".
    cuenta.textContent = todosP.length === 0
        ? 'Nada pendiente en este período'
        : (fueraDeLista === 0
            ? `${todosP.length} cliente${todosP.length === 1 ? '' : 's'} para declarar`
            : `${aCorrer.length} de ${todosP.length} listos para declarar`);
    if (sub) {
        sub.textContent = `${periodoLabel()} · ${todosP.length} sin declarar · ${conComprobante} con comprobante`
            + (benditaActiva() ? ` · ${aCorrer.length} en la selección` : '')
            + (sinClave ? ` · ${sinClave} sin clave` : '')
            + (Array.isArray(clientesBaja) && clientesBaja.length ? ` · ${clientesBaja.length} de baja` : '');
    }

    const statP = document.getElementById('statPendientes');
    const statC = document.getElementById('statComprobante');
    const statB = document.getElementById('statBendita');
    if (statP) statP.textContent = String(todosP.length);
    if (statC) statC.textContent = String(conComprobante);
    if (statB) statB.textContent = benditaActiva() ? String(aCorrer.length) : '—';

    // Salida rápida cuando la lista curada deja gente afuera.
    const btnTodos = document.getElementById('btnCorrerTodos');
    if (btnTodos) {
        const mostrar = benditaActiva() && fueraDeLista > 0;
        btnTodos.style.display = mostrar ? '' : 'none';
        if (mostrar) {
            btnTodos.textContent = `Correr los ${todosP.length} · ${fueraDeLista} fuera de la selección`;
        }
    }
    // El botón dice QUÉ va a correr. Si hay selección y deja gente afuera,
    // no puede decir «Ejecutar lote»: dice «Ejecutar selección» y el número.
    const rotulo = document.getElementById('loteBotonTexto');
    if (rotulo) {
        rotulo.textContent = fueraDeLista > 0 ? 'Ejecutar selección' : 'Ejecutar lote';
    }
    if (btn) {
        btn.disabled = false;
        btn.classList.toggle('btn-vacio', aCorrer.length === 0);
        btn.classList.toggle('btn-seleccion', fueraDeLista > 0);
        btn.title = aCorrer.length
            ? `Arma la cola con ${aCorrer.length} cliente(s) de ${periodoLabel()} y abre el SRI`
            : `No hay clientes pendientes en ${periodoLabel()}. Hacé clic para más detalles o cambiá de mes.`;
    }
    if (enBoton) {
        const n = aCorrer.length;
        enBoton.textContent = todosP.length === 0
            ? ''
            : (fueraDeLista > 0 ? `${n}/${todosP.length}` : String(n));
    }
    const marca = document.getElementById('marcaPeriodo');
    if (marca) marca.textContent = `SRI · ${periodoLabel()}`;
}

/** Panel del Modo Auto: cuántos van a correr y desde dónde. */
function pintarPanelModoAuto() {
    const el = document.getElementById('modoAutoPanel');
    if (!el) return;
    const on = document.getElementById('chkAutoBatch')?.checked || false;

    const pendientes = clientesPendientesDelPeriodo();
    const pendTotal = pendientes.length;
    const pendBenditos = pendientesSinBenditaFilter().length;
    const conClave = pendientes.filter((c) => c.password).length;
    const primera = pendientes.slice().sort((a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc))[0];
    const fuera = otrosClients.length;

    const frag = [];
    const estado = on ? '<b style="color:#4edea3">ACTIVO</b>' : '<b style="color:#94a3b8">INACTIVO</b>';
    frag.push(`<div style="display:flex;gap:6px;align-items:baseline;flex-wrap:wrap">
        <span style="color:#e6d3ab;font-weight:800">🔁 Bucle mensual</span>
        <span style="font-size:9px;letter-spacing:.08em">${estado}</span>
        <span style="color:#64748b;font-size:10px">${periodoLabel()}</span>
    </div>`);

    if (pendTotal === 0) {
        frag.push('<div style="color:#64748b;">No hay mensuales pendientes en este período: el bucle no tiene a quién entrar.</div>');
    } else {
        frag.push(`<div><b>${pendTotal}</b> mensual(es) entrarán al bucle${conClave < pendTotal ? ` · <span style="color:#ffb95f">${pendTotal - conClave} sin clave</span>` : ''}.</div>`);
        if (primera) frag.push(`<div style="color:#94a3b8;font-size:10px;">▶ Empieza por ${primera.name} (día ${getSriDueDateDay(getNinthDigit(primera.ruc))}).</div>`);
    }
    if (fuera > 0) frag.push(`<div style="color:#64748b;font-size:10px;">${fuera} fuera del bucle: semestrales, RIMPE popular y claves de consulta.</div>`);

    if (benditaActiva()) {
        if (pendBenditos === 0) {
            frag.push('<div style="color:#ffb95f;margin-top:4px;">La selección no tiene pendientes este período: sumá los pendientes o vaciala.</div>');
        } else {
            frag.push(`<div style="margin-top:4px;">En la selección: <b>${pendBenditos}</b>.</div>`);
        }
    } else if (on) {
        frag.push('<div style="color:#94a3b8;font-size:10px;">Sin selección: corre todo lo pendiente del período.</div>');
    }

    el.style.display = 'block';
    el.innerHTML = frag.join('');
}

/** Aviso honesto de sincronización: si el GRANT de is_deleted falta, se dice. */
function pintarAvisoSync() {
    const el = document.getElementById('syncAviso');
    if (!el) return;
    if (syncBajasBloqueado) {
        el.style.display = 'flex';
        el.innerHTML = '⚠️ <span>Supabase sin permiso para ocultar bajas (falta el GRANT de <code>is_deleted</code>). La lista puede incluir clientes viejos. Corré en Supabase: <code>GRANT SELECT (is_deleted) ON public.clients TO anon;</code> y sincronizá de nuevo.</span>';
    } else {
        el.style.display = 'none';
    }
}

// ── Render por tandas: con 2000 clientes no se pueden pintar todos ────────
const TANDA = 60;
let limitePorLista = { pending: TANDA, done: TANDA, error: TANDA, otro: TANDA, baja: TANDA };
let ultimaBusqueda = '';
let ultimoPeriodo = '';

function reiniciarPaginas() {
    limitePorLista = { pending: TANDA, done: TANDA, error: TANDA, otro: TANDA, baja: TANDA };
}

/** Pinta la lista por tandas y deja un botón para traer la siguiente. */
function pintarLista(contenedor, clientes, tipo) {
    if (!contenedor) return;
    const limite = limitePorLista[tipo] || TANDA;
    const visibles = clientes.slice(0, limite);
    visibles.forEach(c => contenedor.appendChild(createClientCard(c, tipo)));

    const resto = clientes.length - visibles.length;
    if (resto > 0) {
        const btn = document.createElement('button');
        btn.className = 'ver-mas';
        btn.textContent = `Mostrar ${Math.min(TANDA, resto)} más · quedan ${resto} de ${clientes.length}`;
        btn.addEventListener('click', () => {
            limitePorLista[tipo] = (limitePorLista[tipo] || TANDA) + TANDA;
            renderClients();
        });
        contenedor.appendChild(btn);
    }
}

function renderClients() {
    const searchVal = document.getElementById('searchInput').value.toLowerCase().trim();
    // Cambiar la búsqueda o el período vuelve a la primera tanda.
    if (searchVal !== ultimaBusqueda) { ultimaBusqueda = searchVal; reiniciarPaginas(); }
    const clavePeriodo = `${currentYear}-${currentMonth}`;
    if (clavePeriodo !== ultimoPeriodo) { ultimoPeriodo = clavePeriodo; reiniciarPaginas(); }
    
    const filteredMensuales = allClients.filter(c => {
        if (esBajaWeb(c.ruc)) return false;
        const matchesName = (c.name || '').toLowerCase().includes(searchVal);
        const matchesRuc = (c.ruc || '').includes(searchVal);
        return matchesName || matchesRuc;
    });

    const filteredOtros = otrosClients.filter(c => {
        const matchesName = (c.name || '').toLowerCase().includes(searchVal);
        const matchesRuc = (c.ruc || '').includes(searchVal);
        return matchesName || matchesRuc;
    });

    const filteredBaja = clientesBaja.filter(c => {
        const matchesName = (c.name || '').toLowerCase().includes(searchVal);
        const matchesRuc = (c.ruc || '').includes(searchVal);
        return matchesName || matchesRuc;
    });

    const sortBy9th = (a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc);

    const pendientes = [];
    const completados = [];
    const errores = [];

    filteredMensuales.forEach(client => {
        if (flaggedErrors[client.ruc]) {
            errores.push(client);
        } else if (hasPdfForPeriod(client, currentYear, currentMonth)) {
            completados.push(client);
        } else {
            pendientes.push(client);
        }
    });

    pendientes.sort(sortBy9th);
    completados.sort(sortBy9th);
    errores.sort(sortBy9th);
    filteredOtros.sort(sortBy9th);
    filteredBaja.sort(sortBy9th);

    document.getElementById('countPendientes').innerText = pendientes.length;
    document.getElementById('countCompletados').innerText = completados.length;
    document.getElementById('countErrores').innerText = errores.length;
    const badgeOtros = document.getElementById('countOtros');
    if (badgeOtros) badgeOtros.innerText = filteredOtros.length;
    const badgeBaja = document.getElementById('countBaja');
    if (badgeBaja) badgeBaja.innerText = filteredBaja.length;

    const pendientesList = document.getElementById('pendientesList');
    const completadosList = document.getElementById('completadosList');
    const erroresList = document.getElementById('erroresList');
    const otrosList = document.getElementById('otrosList');
    const bajaList = document.getElementById('bajaList');

    pendientesList.innerHTML = '';
    completadosList.innerHTML = '';
    erroresList.innerHTML = '';
    if (otrosList) otrosList.innerHTML = '';
    if (bajaList) bajaList.innerHTML = '';

    if (pendientes.length === 0) {
        pendientesList.innerHTML = `<div class="empty-state">🎉 ¡Todos los clientes al día! No hay pendientes.
            <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap">
                <button type="button" class="btn-todos" data-accion="periodo" style="margin:0">Cambiar de mes</button>
                <button type="button" class="btn-todos" data-accion="ajustes" style="margin:0">Ver Ajustes</button>
            </div>
        </div>`;
    } else {
        pintarLista(pendientesList, pendientes, 'pending');
    }

    if (completados.length === 0) {
        completadosList.innerHTML = `<div class="empty-state">No hay clientes completados para este mes aún.</div>`;
    } else {
        pintarLista(completadosList, completados, 'done');
    }

    if (errores.length === 0) {
        erroresList.innerHTML = `<div class="empty-state">No hay clientes marcados con error.</div>`;
    } else {
        pintarLista(erroresList, errores, 'error');
    }

    if (otrosList) {
        if (filteredOtros.length === 0) {
            otrosList.innerHTML = `<div class="empty-state">No hay clientes en otros regímenes.</div>`;
        } else {
            pintarLista(otrosList, filteredOtros, 'otro');
        }
    }

    if (bajaList) {
        if (filteredBaja.length === 0) {
            bajaList.innerHTML = `<div class="empty-state">No hay clientes dados de baja.</div>`;
        } else {
            pintarLista(bajaList, filteredBaja, 'baja');
        }
    }

    actualizarCabeceraBendita();
    pintarAvisoSync();
    pintarPanelModoAuto();
    pintarBotonLote();
    pintarSegundaVuelta();
}

function getSriDueDateDay(digit) {
    const map = { 1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 22, 8: 24, 9: 26, 0: 28, 10: 28 };
    return map[digit] || 28;
}

function createClientCard(client, statusType) {
    const card = document.createElement('div');
    card.className = 'client-card';
    
    const isPassVisible = !!visiblePasswords[client.ruc];
    const hasPassword = !!client.password;
    const ninth = getNinthDigit(client.ruc);
    const dueDay = getSriDueDateDay(ninth);
    
    // UI Elite para Clave Faltante (Con data-action para cumplir con CSP de Chrome MV3)
    const passUi = hasPassword 
        ? `<span class="client-password" style="font-family:'JetBrains Mono',monospace; background:rgba(0,0,0,0.4); padding:3px 8px; border-radius:6px; font-size:11px; display:inline-flex; align-items:center; gap:4px; border:1px solid rgba(255,255,255,0.08);">
                <span data-action="toggle-pass" data-ruc="${client.ruc}" style="cursor:pointer;" title="${isPassVisible ? 'Ocultar clave' : 'Mostrar clave'}">
                    ${isPassVisible ? '👁️' : '🙈'} ${isPassVisible ? client.password : '••••••'}
                </span>
                <span data-action="copiar-pass" data-pass="${client.password}" style="cursor:pointer; margin-left:6px; opacity:0.8; transition:0.2s;" title="Copiar clave">📋</span>
                <span data-action="editar-clave" data-ruc="${client.ruc}" style="cursor:pointer; margin-left:4px; opacity:0.8;" title="Editar clave">✏️</span>
           </span>`
        : `<span class="client-password" style="font-family:'JetBrains Mono',monospace; background:rgba(239, 68, 68, 0.15); padding:3px 8px; border-radius:6px; font-size:11px; display:inline-flex; align-items:center; gap:4px; border:1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;">
                ⚠️ SIN CLAVE
                <span data-action="editar-clave" data-ruc="${client.ruc}" style="cursor:pointer; margin-left:6px; opacity:0.9; color:white;" title="Agregar clave">✏️ AGREGAR</span>
           </span>`;

    const isDone = statusType === 'done';
    const isError = statusType === 'error';
    const isOtro = statusType === 'otro';
    const isBaja = statusType === 'baja';
    const esBend = esBendito(client.ruc);

    // Estado en un solo lugar: clase + etiqueta (el HTML lo pinta la tarjeta).
    const badge = (() => {
        if (isError) {
            const errType = flaggedErrors[client.ruc];
            if (errType === 'clave_incorrecta' || errType === 'error_credenciales') return { kind: 'err', label: 'Clave rechazada' };
            if (errType === 'clave_caducada') return { kind: 'warn', label: 'Clave caducada' };
            if (errType === 'cuenta_bloqueada') return { kind: 'err', label: 'Cuenta bloqueada' };
            if (errType === 'sesion_caida') return { kind: 'warn', label: 'Sesión caída' };
            return { kind: 'err', label: 'Error / omitido' };
        }
        if (isDone) return { kind: 'ok', label: 'Completado' };
        if (isBaja) return { kind: 'baja', label: 'Dado de baja' };
        if (isOtro) return { kind: 'otro', label: evaluarRegimenCliente(client).label };
        return { kind: 'pend', label: 'Pendiente' };
    })();

    // Semáforo del 9.º dígito: qué tan cerca está el vencimiento.
    const hoyDia = new Date().getDate();
    const restan = dueDay - hoyDia;
    const semaforo = restan < 0 ? 'vencido' : restan <= 3 ? 'pronto' : 'ok';
    let actionBtnHtml = `
        <button class="btn-start" data-action="iniciar" data-ruc="${client.ruc}" style="white-space:nowrap;">
            ▶ Ingresar
        </button>
        <span data-action="marcar-error" data-ruc="${client.ruc}" style="font-size:10px; color:#f87171; cursor:pointer; font-weight:700; opacity:0.8; transition:0.2s;" title="Mover a pestaña de Errores para omitir del bucle">
            ⚠️ Omitir
        </span>
    `;

    if (isDone) {
        actionBtnHtml = `
            <button class="btn-start" data-action="iniciar" data-ruc="${client.ruc}" style="opacity:0.6; filter:grayscale(0.5); white-space:nowrap;">
                ▶ Ingresar
            </button>
        `;
    } else if (isError) {
        actionBtnHtml = `
            <button class="btn-start" data-action="desbloquear-clave" data-ruc="${client.ruc}" style="background:linear-gradient(135deg, #6366f1, #4f46e5); color:white; font-size:10px; padding:4px 8px; white-space:nowrap;" title="Actualizar clave y desbloquear cliente">
                ✏️ Nueva Clave
            </button>
            <button class="btn-start" data-action="reintentar" data-ruc="${client.ruc}" style="background:linear-gradient(135deg, #ffb95f, #d97706); color:#2a1700; font-size:10px; padding:4px 8px; white-space:nowrap;">
                🔄 Reintentar
            </button>
        `;
    } else if (isOtro) {
        actionBtnHtml = `
            <button class="btn-start" data-action="forzar-mensual" data-ruc="${client.ruc}" style="background:rgba(99,102,241,0.2); border:1px solid #6366f1; color:#c7d2fe; font-size:10px; padding:5px 8px; white-space:nowrap;" title="Incluir en el lote de IVA Mensual para esta corrida">
                ⚡ Forzar Mensual
            </button>
            <button class="btn-start" data-action="iniciar" data-ruc="${client.ruc}" style="font-size:10px; padding:4px 8px; opacity:0.8; white-space:nowrap;">
                ▶ Ingresar
            </button>
        `;
    } else if (isBaja) {
        // Sin botones de acción: un dado de baja no tiene ningún lote ni
        // sesión que iniciar. Sin esta rama caía en el default de arriba
        // («▶ Ingresar» + «⚠️ Omitir»), totalmente funcional — un clic
        // arrancaba una sesión real del SRI para declarar a alguien que ya
        // no es cliente.
        actionBtnHtml = '';
    }

    const periodo = periodoLabel();
    const sello = isDone
        ? `<span class="cc-seal" title="Comprobante del período ${periodo}">✓ comprobante ${periodo}</span>`
        : '';

    card.innerHTML = `
        <div class="cc-head">
            <div class="cc-name" title="${client.name}">${client.name}${esRucSociedad(client.ruc) ? ' <span class="cc-sociedad" title="RUC de sociedad: lleva 1021 Renta, REBEFICS, ADI y ATS">S.A.S.</span>' : ''}</div>
            <span class="cc-badge ${badge.kind}"><i></i>${badge.label}</span>
        </div>
        <div class="cc-meta">
            <span class="cc-ruc" data-action="copiar-ruc" data-ruc="${client.ruc}" title="Copiar RUC">${client.ruc}</span>
            <span class="cc-d9 ${semaforo}" title="9.º dígito ${ninth} · vence el día ${dueDay}">
                <i class="cc-d9-dot"></i>D9 ${ninth} · vence ${dueDay}
            </span>
            <span class="cc-bend ${esBend ? 'on' : ''}" data-action="toggle-bendito" data-ruc="${client.ruc}"
                  title="${esBend ? 'Quitar del lote' : 'Sumar al lote'}">${esBend ? '✓ en lote' : '+ al lote'}</span>
        </div>
        <div class="cc-row">
            ${passUi}
            ${sello}
            <div class="cc-actions">${actionBtnHtml}</div>
        </div>
        ${isDone || isError || isBaja ? '' : buildOrdenMesesBlock(client)}
    `;
    return card;
}

/** 🗓️ Bloque «Orden de meses»: checkboxes con los meses pendientes del
 *  cliente + botón para marcarlos todos. La selección vive en `ordenMeses`
 *  (RUC → Set de 'AAAA-MM') y no se pierde al re-render. */
/** Guarda la orden de meses en storage (RUC → array de 'AAAA-MM') para que
 *  sobreviva al cierre del popup. */
function persistirOrdenMeses() {
    const obj = {};
    for (const [k, v] of Object.entries(ordenMeses)) {
        if (v && v.size) obj[k] = [...v].sort();
    }
    return chrome.storage.local.set({ sc_orden_meses_popup: obj });
}

/** 🔄 Alterna la selección de un mes en la orden del cliente y repinta. */
function toggleMesOrden(ruc, periodo) {
    if (!ruc || !periodo) return;
    const set = new Set(ordenMeses[ruc] || []);
    if (set.has(periodo)) set.delete(periodo);
    else set.add(periodo);
    if (set.size === 0) delete ordenMeses[ruc];
    else ordenMeses[ruc] = set;
    persistirOrdenMeses();
    renderClients();
    const n = set.size;
    showToast(n > 0 ? `🗓️ ${n} mes(es) en la orden de ${ruc}.` : '🗓️ Orden vacía: se declara solo el mes del selector.');
}

/** 🎯 Marca TODOS los meses pendientes del cliente en la orden. */
function marcarTodosPendientes(ruc) {
    const client = allClients.find(c => c.ruc === ruc);
    if (!client) return;
    const pendientes = mesesPendientesDeCliente(client);
    if (pendientes.length === 0) {
        showToast('🎉 Este cliente ya declaró todos los meses pendientes.');
        return;
    }
    ordenMeses[ruc] = new Set(pendientes.map(p => p.periodo));
    persistirOrdenMeses();
    renderClients();
    showToast(`🎯 ${pendientes.length} mes(es) marcados: ${pendientes.map(p => p.label).join(', ')}`);
}

function buildOrdenMesesBlock(client) {
    const ruc = client.ruc;
    const pendientes = mesesPendientesDeCliente(client);
    const sel = ordenMeses[ruc] || new Set();
    if (pendientes.length === 0) return '';
    const count = sel.size;
    const abierto = !!ordenMesesAbierto[ruc];

    // Cerrado por defecto: es una función avanzada (declarar varios meses en
    // secuencia) que competía visualmente con la acción principal de la
    // tarjeta (▶ Ingresar), abierta en cada tarjeta pendiente con atraso.
    // El resumen ya dice si hay algo elegido, sin necesitar abrirlo.
    const resumen = count > 0
        ? `${count} de ${pendientes.length} mes(es) elegidos`
        : `${pendientes.length} mes(es) pendientes`;

    if (!abierto) {
        return `
            <div class="orden-meses" data-action="toggle-orden-meses" data-ruc="${ruc}"
                 style="width:100%; margin-top:4px; padding:5px 10px; border:1px solid rgba(99,102,241,0.2); border-radius:9px; background:rgba(99,102,241,0.04); cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:6px;"
                 title="Ver los meses pendientes y elegir en cuáles declarar en secuencia">
                <span style="font-size:10px; font-weight:800; color:#a5b4fc;">🗓️ ${resumen}</span>
                <span style="font-size:10px; color:#a5b4fc;">▾</span>
            </div>`;
    }

    const chips = pendientes.map(p => {
        const on = sel.has(p.periodo);
        return `
            <label class="mes-orden-chip" data-action="toggle-mes-orden" data-ruc="${ruc}" data-periodo="${p.periodo}"
                   style="display:inline-flex; align-items:center; gap:4px; margin:2px 4px 2px 0; padding:4px 8px; border-radius:6px; font-size:10px; cursor:pointer; user-select:none; border:1px solid ${on ? 'rgba(78,222,163,0.7)' : 'rgba(255,255,255,0.12)'}; background:${on ? 'rgba(78,222,163,0.2)' : 'rgba(255,255,255,0.04)'}; color:${on ? '#4edea3' : '#94a3b8'}; font-weight:700; transition:0.15s;" title="Incluir ${p.label} en la orden">
                <span style="font-size:11px;">${on ? '☑️' : '⬜'}</span> ${p.label}
            </label>`;
    }).join('');
    return `
        <div class="orden-meses" style="width:100%; margin-top:4px; padding:7px 10px; border:1px solid rgba(99,102,241,0.25); border-radius:9px; background:rgba(99,102,241,0.06);">
            <div data-action="toggle-orden-meses" data-ruc="${ruc}" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px;">
                <span style="font-size:10px; font-weight:800; color:#a5b4fc; letter-spacing:0.4px;">🗓️ ${resumen}</span>
                <span style="font-size:10px; color:#a5b4fc;">▴</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:flex-end; margin-bottom:4px;">
                <span data-action="marcar-todos-pendientes" data-ruc="${ruc}" style="cursor:pointer; font-size:10px; font-weight:800; color:#4edea3; background:rgba(78,222,163,0.12); border:1px solid rgba(78,222,163,0.35); padding:2px 8px; border-radius:6px;" title="Marcar todos los meses pendientes de este cliente">🎯 Todos los pendientes</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:3px;">${chips}</div>
            <div style="font-size:9.5px; color:#94a3b8; margin-top:4px; line-height:1.4;">
                ${count > 0
                    ? `<b id="orden-count-${ruc}" style="color:#a5b4fc;">${count} mes(es)</b> se declararán en bucle con ▶. Hacé clic en un mes para quitarlo.`
                    : `Sin selección: ▶ declara solo el mes del selector. Tocá un mes para armar la secuencia.`}
            </div>
        </div>`;
}

// 🛡️ DELEGACIÓN GLOBAL DE EVENTOS (Compatible 100% con CSP de Chrome MV3 sin onclick inline)
document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const ruc = el.dataset.ruc;

    if (action === 'iniciar') {
        iniciarCliente(ruc);
    } else if (action === 'toggle-mes-orden') {
        toggleMesOrden(ruc, el.dataset.periodo);
    } else if (action === 'toggle-orden-meses') {
        ordenMesesAbierto[ruc] = !ordenMesesAbierto[ruc];
        renderClients();
    } else if (action === 'marcar-todos-pendientes') {
        marcarTodosPendientes(ruc);
    } else if (action === 'toggle-bendito') {
        toggleBendito(ruc);
    } else if (action === 'bendecir-pendientes') {
        bendecirTodosPendientes();
    } else if (action === 'quitar-benditos') {
        quitarTodosBenditos();
    } else if (action === 'desactivar-bendita') {
        desactivarBendita();
    } else if (action === 'copiar-ruc') {
        copiarAlPortapapeles(ruc, el);
    } else if (action === 'toggle-pass') {
        // Revelado TEMPORAL: la clave se oculta sola a los 5s. Que quede
        // visible para siempre en un popup que se cierra al perder el foco
        // es cómo se filtra una clave mirando por encima del hombro.
        visiblePasswords[ruc] = !visiblePasswords[ruc];
        renderClients();
        if (visiblePasswords[ruc]) {
            setTimeout(() => {
                if (visiblePasswords[ruc]) {
                    visiblePasswords[ruc] = false;
                    renderClients();
                }
            }, 5000);
        }
    } else if (action === 'copiar-pass') {
        copiarAlPortapapeles(el.dataset.pass || '', el);
    } else if (action === 'editar-clave') {
        editarClave(ruc);
    } else if (action === 'marcar-error') {
        marcarErrorCliente(ruc);
    } else if (action === 'reintentar') {
        reintentarCliente(ruc);
    } else if (action === 'desbloquear-clave') {
        const client = allRawClients.find(c => c.ruc === ruc) || allClients.find(c => c.ruc === ruc);
        const newPass = prompt(`Ingresa la nueva clave del SRI para ${client ? client.name : ruc}:`, client ? (client.password || '') : '');
        if (newPass !== null && newPass.trim() !== '') {
            await actualizarClaveSupabase(client, newPass.trim());
            const res = await chrome.storage.local.get(['flagged_errors', 'sri_tried_credentials', 'sc_omitidos']);
            const errs = res.flagged_errors || {};
            delete errs[ruc];
            const tried = res.sri_tried_credentials || {};
            delete tried[ruc];
            const omit = res.sc_omitidos || {};
            delete omit[ruc];
            await chrome.storage.local.set({
                flagged_errors: errs,
                sri_tried_credentials: tried,
                sc_omitidos: omit
            });
            flaggedErrors = errs;
            renderClients();
            showToast(`✅ Clave actualizada y cliente ${ruc} devuelto a Pendientes`);
        }
    } else if (action === 'forzar-mensual') {
        const client = allRawClients.find(c => c.ruc === ruc) || otrosClients.find(c => c.ruc === ruc);
        if (client) {
            client.force_mensual = true;
            const cacheRes = await chrome.storage.local.get(['sc_clients_cache']);
            const list = cacheRes.sc_clients_cache || [];
            const idx = list.findIndex(c => c.ruc === ruc);
            if (idx !== -1) list[idx].force_mensual = true;
            await chrome.storage.local.set({ sc_clients_cache: list });

            separarPorRegimen();
            renderClients();
            showToast(`⚡ ${client.name || ruc} ahora está habilitado como IVA Mensual`);
        }
    }
});

async function copiarAlPortapapeles(texto, element) {
    if (!texto) return;
    try {
        await navigator.clipboard.writeText(texto);
        if (element) {
            const originalHtml = element.innerHTML;
            element.innerHTML = '✅ Copiado';
            element.style.background = 'rgba(16, 185, 129, 0.2)';
            element.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            element.style.color = '#a7f3d0';
            setTimeout(() => {
                element.innerHTML = originalHtml;
                element.style.background = '';
                element.style.borderColor = '';
                element.style.color = '';
            }, 1400);
        }
        showToast(`📋 Copiado al portapapeles: ${texto}`);
    } catch (err) {
        console.warn('Error al copiar:', err);
    }
}

function marcarErrorCliente(ruc) {
    chrome.storage.local.get(['flagged_errors', 'auto_batch_queue'], (res) => {
        const errs = res.flagged_errors || {};
        errs[ruc] = true;
        flaggedErrors = errs;

        let queue = Array.isArray(res.auto_batch_queue) ? res.auto_batch_queue : [];
        queue = queue.filter(q => q.ruc !== ruc);

        chrome.storage.local.set({ 
            flagged_errors: errs,
            auto_batch_queue: queue
        }, () => {
            renderClients();
            showToast(`⚠️ Cliente ${ruc} movido a "Con Error" y excluido del bucle`);
        });
    });
}

function reintentarCliente(ruc) {
    chrome.storage.local.get(['flagged_errors'], (res) => {
        const errs = res.flagged_errors || {};
        delete errs[ruc];
        flaggedErrors = errs;
        chrome.storage.local.set({ flagged_errors: errs }, () => {
            renderClients();
            showToast(`🔄 Cliente ${ruc} devuelto a "Pendientes"`);
        });
    });
}

async function editarClave(ruc) {
    // `allClients` sólo trae a los mensuales. El botón ✏️ se pinta en TODAS
    // las tarjetas (incluidas "Otros" y "Bajas", que viven en otros arrays),
    // así que buscar sólo ahí hacía que el botón no hiciera nada —sin aviso—
    // en esas dos pestañas. `allRawClients` tiene a todos.
    const client = allRawClients.find(c => c.ruc === ruc) || allClients.find(c => c.ruc === ruc);
    if (!client) return;

    const newPass = prompt(`Ingresa la nueva clave del SRI para ${client.name}`, client.password || '');
    if (newPass === null || newPass === client.password) return;

    await actualizarClaveSupabase(client, newPass);
}

async function actualizarClaveSupabase(client, newPass) {
    try {
        // 🔒 La clave ya no se sube a la nube (anon no puede escribir sri_password):
        // se guarda SOLO en la caché local de Chrome.
        const cacheRes = await chrome.storage.local.get(['sc_clients_cache']);
        const updatedCache = (Array.isArray(cacheRes.sc_clients_cache) ? cacheRes.sc_clients_cache : []).map((c) =>
            c.ruc === client.ruc ? { ...c, password: newPass, sri_password: newPass } : c
        );
        client.password = newPass;
        await chrome.storage.local.set({ sc_clients_cache: updatedCache });
        allRawClients = updatedCache;
        separarPorRegimen();
        renderClients();
        showToast("✅ Clave guardada localmente.");
        return true;
    } catch (e) {
        alert("No se pudo guardar la clave: " + e.message);
        return false;
    }
}

async function iniciarCliente(ruc) {
    const client = allRawClients.find(c => c.ruc === ruc) || allClients.find(c => c.ruc === ruc);
    if (!client) return;

    if (!client.password) {
        const newPass = prompt(`La clave está vacía. Ingresa la clave para ${client.name} antes de iniciar:`);
        if (!newPass) return;
        const ok = await actualizarClaveSupabase(client, newPass);
        if (!ok) return;
    }

    // 🧹 PURGA PREVENTIVA DE COOKIES:
    // Destruye cualquier cookie residual de sesiones anteriores para que Keycloak entre limpio
    try {
        await new Promise((resolve) => {
            chrome.runtime.sendMessage({ tipo: "SC_LIMPIAR_SESION_SRI" }, () => resolve());
            setTimeout(resolve, 500);
        });
    } catch (e) {}

    // 🗓️ ORDEN DE MESES: si este cliente tiene meses marcados en el bloque
    // «Orden de meses», se arma una cola de UN ítem por mes (el mismo RUC
    // repetido con `period` distinto). El motor ya respeta `item.period` al
    // saltar, y acá queda la clave que lo activa: habrá bucle multi-mes.
    // La orden es una decisión explícita de una persona sobre un cliente:
    // va ANTES de la Bendita y del modo lote, y no pregunta nada.
    const ordenSel = ordenMeses[ruc];
    if (ordenSel && ordenSel.size > 0) {
        const periodos = [...ordenSel].sort();   // cronológico ascendente
        const queueOrden = periodos.map(p0 => ({
            ruc: client.ruc,
            name: client.name || 'Cliente SRI',
            password: client.password,
            period: p0
        }));
        const [py, pm] = periodos[0].split('-').map(Number);
        const perPrimero = { year: py, monthIndex: pm - 1 };
        const targetStrOrden = periodos[0];
        chrome.storage.local.remove(['declaration_synced_flag'], () => {
            chrome.storage.local.set({
                pending_sri_autofill: {
                    ruc: client.ruc,
                    password: client.password,
                    name: client.name,
                    timestamp: Date.now(),
                    manual: true,
                    isBatch: true
                },
                auto_batch_enabled: true,
                auto_batch_queue: queueOrden,
                auto_batch_index: 0,
                auto_batch_period: perPrimero,
                sri_target_period: perPrimero,
                sri_period_order: { ruc: client.ruc, periodos },
                sc_loop: {
                    estado: 'CORRIENDO', cola: queueOrden, indice: 0,
                    periodo: perPrimero,
                    latido: Date.now(), motivo: ''
                },
                pendingAction: 'verifyProfile',
                workflowPeriod: perPrimero,
                actionTimestamp: Date.now(),
                sri_master_switch_on: true,
                sriAutomationPaused: false,
                ghost_manual_mode: false,
                autoDeclaration: true,
                sri_auto_mode: true
            }, () => {
                chrome.tabs.create({ url: 'https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=app-sri-claves-angular&redirect_uri=https%3A%2F%2Fsrienlinea.sri.gob.ec%2Fsri-en-linea%2F%2Fcontribuyente%2Fperfil&state=956332a7-6de0-48d7-8f53-a635625c30a5&nonce=4c3d7ddb-c8f7-4227-8186-babb562e36b3&response_mode=fragment&response_type=code&scope=openid' });
            });
        });
        showToast(`🗓️ Orden armada: ${periodos.length} mes(es) de ${client.name} (${targetStrOrden} → último).`);
        return;
    }

    const isBatchActive = document.getElementById('chkAutoBatch')?.checked || false;

    // 🕯️ LA LISTA BENDITA. En modo lote sólo corren los benditos.
    //   - Bendita inactiva (null): nadie la creó → corre todo, como siempre.
    //   - Bendita activa (array): corre SOLO lo que esté en la lista.
    //   El arranque manual de un cliente suelto (sin lote) sigue intacto:
    //   es una decisión explícita de una persona, no del bucle.
    if (isBatchActive && benditaActiva()) {
        // ▶ en un cliente puntual que no está bendito: con la Bendita activa el
        // lote sólo corre benditos. Ofrecer bendecirlo, no arrancar a medias.
        if (!esBendito(ruc)) {
            const cliente = allRawClients.find(c => c.ruc === ruc);
    const agregar = await pedirConfirmacion({ titulo: "Selección", mensaje: `🤍 ${cliente ? cliente.name : ruc} NO está en la Lista Bendita.\n\n` +                 'El lote corre sólo a los benditos. ¿Bendecirlo y arrancar el lote desde él?', aceptar: "Sumar y arrancar", cancelar: "No" });
            if (!agregar) {
                showToast('💔 No se bendijo: el lote sigue sin incluirlo.');
                return;
            }
            await toggleBendito(ruc);
        }
        const benditosPendientes = clientesPendientesDelPeriodo();
        if (benditosPendientes.length === 0) {
            const hayPendientesSinBendecir = pendientesSinBenditaFilter().length > 0;
            if (!hayPendientesSinBendecir) {
                showToast('🎉 No hay benditos pendientes para este período.');
                return;
            }
            // Hay pendientes, pero ninguno bendito: no arrancar a ciegas.
    const bendecir = await pedirConfirmacion({ titulo: "Selección vacía", mensaje: '🤍 Ninguno de los pendientes del período está en la Lista Bendita.\n\n' +                 '¿Bendecir a todos los pendientes ahora?', aceptar: "Sumar todos", cancelar: "No" });
            if (!bendecir) {
                showToast('💔 Sin benditos no corre nadie. Marcá con 🙏 a los que corren.');
                return;
            }
            await bendecirTodosPendientes();
        }
    }

    // Obtener clientes pendientes actuales ordenados por 9no dígito.
    // En modo lote = benditos pendientes. En modo manual = todos (decisión de persona).
    const sortBy9th = (a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc);
    const pendBase = isBatchActive
        ? clientesPendientesDelPeriodo()
        : allClients.filter(c => !hasPdfForPeriod(c, currentYear, currentMonth) && !flaggedErrors[c.ruc]);
    let pendingClients = pendBase.sort(sortBy9th);

    // Si el cliente seleccionado está en la lista de pendientes, reordenar la cola comenzando por él
    let queue = pendingClients.map(c => ({ ruc: c.ruc, password: c.password, name: c.name }));
    const startIndex = queue.findIndex(q => q.ruc === ruc);
    if (startIndex > 0) {
        queue = queue.slice(startIndex).concat(queue.slice(0, startIndex));
    } else if (startIndex === -1 && !isBatchActive) {
        queue = [{ ruc: client.ruc, password: client.password, name: client.name }];
    } else if (startIndex === -1 && isBatchActive) {
        // En modo lote pero clickeó un cliente puntual (ej. en Completados u Otros):
        // entra con él primero
        queue = [{ ruc: client.ruc, password: client.password, name: client.name }, ...queue];
    }

    if (isBatchActive && queue.length === 0) {
        showToast('No quedan clientes seleccionados pendientes para este período.');
        return;
    }

    arrancarMotor(client, queue, isBatchActive);
};

/** La URL de login del SRI. Una sola copia: estaba repetida en tres lugares. */
const SRI_LOGIN_URL = 'https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=app-sri-claves-angular&redirect_uri=https%3A%2F%2Fsrienlinea.sri.gob.ec%2Fsri-en-linea%2F%2Fcontribuyente%2Fperfil&state=956332a7-6de0-48d7-8f53-a635625c30a5&nonce=4c3d7ddb-c8f7-4227-8186-babb562e36b3&response_mode=fragment&response_type=code&scope=openid';

/**
 * Deja el motor armado y abre el SRI. Es el único lugar que escribe el
 * contrato con el content script: si mañana cambia una bandera, se cambia
 * acá y no en dos caminos que se desincronizan.
 */
function arrancarMotor(primerCliente, queue, isBatch) {
    const periodo = { year: currentYear, monthIndex: currentMonth };
    chrome.storage.local.remove(['declaration_synced_flag'], () => {
        chrome.storage.local.set({
            pending_sri_autofill: {
                ruc: primerCliente.ruc,
                password: primerCliente.password,
                name: primerCliente.name,
                timestamp: Date.now(),
                manual: true,
                isBatch: isBatch
            },
            auto_batch_enabled: isBatch,
            auto_batch_queue: isBatch ? queue : [],
            auto_batch_index: 0,
            auto_batch_period: periodo,
            sri_target_period: periodo,
            sri_period_order: null,
            // 🚦 El semáforo es la autoridad del bucle. Sin esto el content
            // script descarta el lote apenas carga la pantalla de login.
            sc_loop: isBatch
                ? { estado: 'CORRIENDO', cola: queue, indice: 0,
                    periodo, latido: Date.now(), motivo: '' }
                : { estado: 'DETENIDO', cola: [], indice: 0, motivo: 'Cliente suelto desde el popup' },
            pendingAction: 'verifyProfile',
            workflowPeriod: periodo,
            actionTimestamp: Date.now(),
            sri_master_switch_on: true,
            sriAutomationPaused: false,
            ghost_manual_mode: false,
            autoDeclaration: true,
            sri_auto_mode: true
        }, () => {
            chrome.tabs.create({ url: SRI_LOGIN_URL });
        });
    });
}

/**
 * ▶ Ejecutar lote: arranca la cola completa del período sin elegir un cliente.
 *
 * Reusa el mismo motor que el ▶ de cada tarjeta. La diferencia es de dónde
 * sale la cola: acá son todos los pendientes ordenados por día de vencimiento
 * (9.º dígito del RUC) y no hay «empezar por éste».
 *
 * Salta el bloque de «Orden de meses» a propósito: ese bloque es una decisión
 * sobre UN cliente (declarar tres meses suyos seguidos) y acá lo que se pide
 * es el lote del período, no una excepción.
 */
async function ejecutarLoteCompleto(todos = false, colaForzada = null) {
    const enCurso = await new Promise(resolve => {
        chrome.storage.local.get(['sc_loop'], (r) => {
            const l = r.sc_loop || {};
            resolve(l.estado === 'CORRIENDO' && Array.isArray(l.cola) && l.cola.length > 0);
        });
    });
    if (enCurso) {
    const reiniciar = await pedirConfirmacion({ titulo: "Lote en curso", mensaje: '⚠️ Hay un lote registrado como «en curso» en el sistema.\n\n' +             '¿Deseas cancelarlo y arrancar un nuevo lote limpio para ' + periodoLabel() + '?', aceptar: "Reiniciar lote", cancelar: "Conservar", peligro: true });
        if (!reiniciar) {
            showToast('Lote actual conservado. Enfocando pestaña del SRI...');
            try {
                const [tab] = await chrome.tabs.query({ url: 'https://srienlinea.sri.gob.ec/*' });
                if (tab) { await chrome.tabs.update(tab.id, { active: true }); window.close(); }
            } catch (e) { /* sin pestaña no hay nada que enfocar */ }
            return;
        }
        // Limpiar estado colgado de corrida previa
        await new Promise(resolve => {
            chrome.storage.local.set({
                sc_loop: { estado: 'DETENIDO', cola: [], indice: 0, motivo: 'Reiniciado por el usuario desde el popup' },
                auto_batch_enabled: false,
                sriAutomationPaused: false
            }, resolve);
        });
    }

    // Si hay una selección activa que deja gente afuera, que lo decida el usuario:
    // correr 1 de 37 sin avisar es exactamente cómo parece que "no corre".
    if (!todos && !colaForzada && benditaActiva()) {
        const enLista = clientesPendientesDelPeriodo().length;
        const todosP = pendientesSinBenditaFilter().length;
        if (todosP > enLista) {
    const correrTodos = await pedirConfirmacion({ titulo: "Hay una selección activa", mensaje: 'Hay una selección activa: solo correrían ' + enLista + ' de ' + todosP + ' pendientes.\n\n' +                 'Aceptar → correr TODOS los ' + todosP + '.\n' +                 'Cancelar → correr solo la selección (' + enLista + ').', aceptar: "Correr todos", cancelar: "Solo la selección" });
            if (correrTodos) todos = true;
        }
    }
    const base = colaForzada ? colaForzada : (todos ? pendientesSinBenditaFilter() : clientesPendientesDelPeriodo());
    const pendientes = Array.isArray(base) ? base.slice() : [];
    if (!colaForzada) pendientes.sort((a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc));
    if (!pendientes.length) {
        showToast(`No hay clientes pendientes en ${periodoLabel()}. Podés cambiar de mes con el selector superior.`);
        return;
    }

    // Tandas de 50: con 2000 clientes una sola cola no se puede sostener.
    const TANDA_LOTE = 50;
    const tanda = pendientes.slice(0, TANDA_LOTE);
    const resto = pendientes.slice(TANDA_LOTE);
    await new Promise(r => chrome.storage.local.set({
        sc_lote_resto: resto.map(c => ({ ruc: c.ruc, password: c.password, name: c.name })),
        sc_lote_total: pendientes.length
    }, r));

    const sinClave = tanda.filter(c => !c.password).length;
    const primero = tanda.find(c => c.password);
    if (!primero) {
        showToast('Ningún pendiente tiene clave SRI. Cargá las claves antes de arrancar.');
        return;
    }

    // Misma purga preventiva que el arranque por cliente: Keycloak entra limpio.
    try {
        await new Promise((resolve) => {
            chrome.runtime.sendMessage({ tipo: 'SC_LIMPIAR_SESION_SRI' }, () => resolve());
            setTimeout(resolve, 500);
        });
    } catch (e) { /* si el background no contesta, el login igual limpia */ }

    const queue = tanda.map(c => ({ ruc: c.ruc, password: c.password, name: c.name }));
    const chk = document.getElementById('chkAutoBatch');
    if (chk) chk.checked = true;
    await new Promise(r => chrome.storage.local.set({ auto_batch_enabled: true }, r));

    arrancarMotor(primero, queue, true);
    showToast(`▶ Lote de ${queue.length} · ${periodoLabel()}`
        + (resto.length ? ` · tanda ${queue.length}/${pendientes.length} (siguen ${resto.length})` : '')
        + (sinClave ? ` · ${sinClave} sin clave` : ''));
}

/**
 * Abre una herramienta del cajón 🧰 en la pestaña del SRI.
 *
 * El popup no puede ejecutar nada del portal por su cuenta: las herramientas
 * viven en el content script, que es el que ve el DOM del SRI. Así que se le
 * pide al content script que pulse el botón real. Si la pestaña o el panel no
 * están, se dice — nunca se finge que funcionó.
 */
async function abrirHerramienta(id) {
    try {
        const tabs = await chrome.tabs.query({ url: 'https://srienlinea.sri.gob.ec/*' });
        const tab = tabs.find(t => t.active) || tabs[0];
        if (!tab) {
            showToast('Abrí el SRI primero: las herramientas trabajan sobre esa pestaña.');
            return;
        }
        chrome.tabs.sendMessage(tab.id, { action: 'SC_ABRIR_HERRAMIENTA', id }, (res) => {
            if (chrome.runtime.lastError || !res || !res.ok) {
                showToast('Esa pestaña no tiene el panel listo. Recargala (F5) y probá de nuevo.');
                return;
            }
            chrome.tabs.update(tab.id, { active: true });
            window.close();
        });
    } catch (e) {
        showToast('No se pudo hablar con la pestaña del SRI.');
    }
};

function showToast(msg) {
    let toast = document.getElementById('popup-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'popup-toast';
        toast.style.cssText = 'position:fixed; bottom:12px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.95); border:1px solid #6366f1; color:white; padding:6px 14px; border-radius:20px; font-size:11px; font-weight:700; z-index:999; box-shadow:0 10px 25px rgba(0,0,0,0.5); pointer-events:none; transition:all 0.3s;';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}


// ============================================================
// AJUSTES
// ============================================================
// Las claves no viven acá. El popup es chico y se cierra solo al perder el
// foco: pegar una clave ahí es incómodo y fácil de perder. Van a options.html,
// que es una pestaña entera y es donde cualquiera busca los ajustes de una
// extensión (clic derecho en el ícono → Opciones).

document.addEventListener('DOMContentLoaded', () => {
    const abrirAjustes = () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    };
    ['btnAjustes', 'btnAjustesPie'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', abrirAjustes);
    });
});

// ── Buzón de sugerencias ────────────────────────────────────────────────────
// Mismo buzón que la web, para lo que ves MIENTRAS declarás. Nivel + texto.
(function () {
    const panel = document.getElementById('buzonPanel');
    const btn = document.getElementById('btnBuzon');
    const cerrar = document.getElementById('buzonCerrar');
    const niveles = document.getElementById('buzonNiveles');
    const texto = document.getElementById('buzonTexto');
    const enviar = document.getElementById('buzonEnviar');
    if (!panel || !btn) return;

    let nivel = 'sugerencia';
    const abrir = (v) => { panel.style.display = v ? 'block' : 'none'; };
    btn.addEventListener('click', () => abrir(panel.style.display !== 'block'));
    if (cerrar) cerrar.addEventListener('click', () => abrir(false));
    if (niveles) niveles.addEventListener('click', (e) => {
        const b = e.target.closest('[data-nivel]');
        if (!b) return;
        nivel = b.dataset.nivel;
        niveles.querySelectorAll('[data-nivel]').forEach((x) => x.classList.toggle('on', x === b));
    });

    if (enviar) enviar.addEventListener('click', async () => {
        const t = String(texto.value || '').trim();
        if (t.length < 5) { showToast('Escribí al menos una frase.'); return; }
        if (!SUPABASE_URL || !SUPABASE_KEY) { showToast('Sin nube configurada: no se puede enviar.'); return; }
        enviar.disabled = true;
        try {
            const res = await fetch(SUPABASE_URL + '/rest/v1/suggestions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: SUPABASE_KEY,
                    Authorization: 'Bearer ' + SUPABASE_KEY,
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify([{ level: nivel, area: 'extension', texto: t, source: 'extension-01' }])
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            texto.value = '';
            abrir(false);
            showToast('💡 Sugerencia enviada. La próxima versión la lee.');
        } catch (e) {
            showToast('No se pudo enviar: ' + (e && e.message));
        } finally {
            enviar.disabled = false;
        }
    });
})();

// ── Último lote: que el final tenga cierre visible ─────────────────────────
function pintarUltimoLote() {
    const el = document.getElementById('ultimoLote');
    if (!el) return;
    chrome.storage.local.get(['sc_ultimo_lote'], (r) => {
        const l = r.sc_ultimo_lote;
        if (!l || !l.cuando) { el.style.display = 'none'; return; }
        const d = new Date(l.cuando);
        const dos = (n) => String(n).padStart(2, '0');
        const cuando = dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
        el.textContent = '🎉 ' + (l.conPdf || 0) + '/' + (l.total || 0) + ' · ' + cuando;
        el.title = 'Último lote terminado: ' + (l.conPdf || 0) + ' de ' + (l.total || 0) + ' con comprobante' + (l.sinPdf ? ' · ' + l.sinPdf + ' sin PDF' : '');
        el.style.display = '';
    });
}
pintarUltimoLote();
chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.sc_ultimo_lote) pintarUltimoLote();
});

        // El filtro es opcional: si está apagado, la tarjeta no tiene nada que decir.
        const cajaLista = document.getElementById('statListaCaja');
        if (cajaLista) cajaLista.style.display = benditaActiva() ? '' : 'none';

// ── Segunda vuelta: los que declararon pero quedaron sin comprobante ───────
// El motor ya sabe entrar en modo "solo recuperar" (soloRecuperar). Acá se
// arma esa cola y se muestran sólo si hay algo que recuperar.
// ── Segunda vuelta: recuperar comprobantes ────────────────────────────────
// Sólo entra a los que YA declararon y les falta el PDF. Lleva intentos por
// cliente (no reintenta en bucle), ordena por 9.º dígito y muestra el
// resultado cuando termina: cuántos recuperó de cuántos.
const RECUP_KEY = 'sc_recuperaciones';
const RECUP_LOTE_KEY = 'sc_recuperacion_lote';
const RECUP_MAX_INTENTOS = 3;

function periodoActualStr() {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
}

/** Declarados en el período a los que les falta el PDF. */
function clientesSinComprobante(intentos = {}) {
    const sufijo = '|' + periodoActualStr();
    const pendientes = [];
    const agotados = [];
    let sinClave = 0;
    Object.entries(declaracionesLocales || {}).forEach(([clave, valor]) => {
        if (!String(clave).endsWith(sufijo)) return;
        if (valor && valor.pdfSubido) return;
        const ruc = String(clave).split('|')[0];
        const cli = (allRawClients || []).find((c) => String(c.ruc) === ruc);
        if (!cli) return;
        const intentosPrevios = Number((intentos[ruc] || {}).intentos || 0);
        if (intentosPrevios >= RECUP_MAX_INTENTOS) { agotados.push(ruc); return; }
        if (!cli.password) sinClave += 1;
        pendientes.push({ ruc, password: cli.password || '', name: cli.name, soloRecuperar: true });
    });
    pendientes.sort((a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc));
    return { lista: pendientes, agotados, sinClave };
}

function pintarSegundaVuelta() {
    const btn = document.getElementById('btnSegundaVuelta');
    if (!btn) return;
    chrome.storage.local.get(['sc_loop', RECUP_KEY, RECUP_LOTE_KEY, 'sc_declaraciones_locales'], (r) => {
        const loop = r.sc_loop || {};
        const corriendo = loop.estado === 'CORRIENDO' || loop.estado === 'PAUSANDO';
        if (corriendo) {
            const esRecuperacion = String(loop.motivo || '').toLowerCase().includes('segunda vuelta');
            if (esRecuperacion) {
                const n = Number(loop.indice || 0) + 1;
                const tot = (loop.cola || []).length;
                btn.style.display = '';
                btn.classList.add('btn-recuperar');
                btn.dataset.modo = 'progreso';
                btn.textContent = `⏳ Recuperando comprobantes · ${n}/${tot}`;
                btn.title = 'La segunda vuelta está corriendo. Abrí la pestaña del SRI para verla.';
            } else {
                btn.style.display = 'none';
            }
            return;
        }
        const intentos = r[RECUP_KEY] || {};
        const lote = r[RECUP_LOTE_KEY] || null;
        const reg = r.sc_declaraciones_locales || {};
        const { lista, sinClave } = clientesSinComprobante(intentos);

        // Resultado del último intento: cuántos de los que se pidieron ya tienen PDF.
        let recuperados = 0;
        if (lote && Array.isArray(lote.rucs)) {
            recuperados = lote.rucs.filter((ruc) => Boolean((reg[ruc + '|' + lote.periodo] || {}).pdfSubido)).length;
        }
        const totalLote = lote && Array.isArray(lote.rucs) ? lote.rucs.length : 0;

        if (totalLote > 0 && recuperados === totalLote) {
            btn.style.display = '';
            btn.textContent = `✅ ${recuperados}/${totalLote} recuperados`;
            btn.title = 'Todos los comprobantes de la última vuelta están guardados. Clic para limpiar el registro.';
            btn.dataset.modo = 'limpiar';
            return;
        }
        if (!lista.length) { btn.style.display = 'none'; btn.classList.remove('btn-recuperar'); return; }
        btn.classList.add('btn-recuperar');

        btn.style.display = '';
        btn.dataset.modo = 'correr';
        if (totalLote > 0) {
            btn.textContent = `🔁 Reintentar · ${lista.length} sin comprobante · ${recuperados}/${totalLote} recuperados`;
        } else {
            btn.textContent = `🔁 Recuperar ${lista.length} comprobante${lista.length === 1 ? '' : 's'}`;
        }
        btn.title = sinonimo(sinClave ? ` · ${sinClave} sin clave` : '');
    });
}

/** Título del botón (función aparte para no anidar plantillas). */
function sinonimo(extra) {
    return 'Entra SÓLO a los que ya declararon y les falta el PDF. No vuelve a declarar.' + extra;
}

function arrancarSegundaVuelta() {
    const btn = document.getElementById('btnSegundaVuelta');
    if (btn && btn.dataset.modo === 'limpiar') {
        chrome.storage.local.remove([RECUP_LOTE_KEY, RECUP_KEY], () => showToast('Registro de recuperación limpiado.'));
        pintarSegundaVuelta();
        return;
    }
    // Si quedó un lote "CORRIENDO" colgado (por un corte), la segunda vuelta
    // no puede arrancar: se limpia antes, con confirmación.
    const limpiarLoteColgado = () => new Promise((resolve) => {
        chrome.storage.local.get(['sc_loop'], async (r) => {
            const loop = r.sc_loop || {};
            const corriendo = loop.estado === 'CORRIENDO' || loop.estado === 'PAUSANDO';
            if (!corriendo) { resolve(true); return; }
            const seguir = await pedirConfirmacion({
                titulo: 'Lote anterior colgado',
                mensaje: `El semáforo quedó en ${loop.estado} (${Number(loop.indice || 0) + 1}/${(loop.cola || []).length}).\n\n¿Cancelarlo y arrancar la recuperación?`,
                aceptar: 'Cancelarlo y seguir',
                cancelar: 'Dejarlo',
                peligro: true
            });
            if (!seguir) { resolve(false); return; }
            chrome.storage.local.set({ sc_loop: { estado: 'DETENIDO', cola: [], indice: 0, motivo: 'Reiniciado para recuperar comprobantes' }, auto_batch_enabled: false, sriAutomationPaused: false, pendingAction: null }, () => resolve(true));
        });
    });

    chrome.storage.local.get([RECUP_KEY], async (r) => {
        if (!(await limpiarLoteColgado())) return;
        const intentos = r[RECUP_KEY] || {};
        const { lista, sinClave, agotados } = clientesSinComprobante(intentos);
        if (!lista.length) { showToast('No hay comprobantes pendientes de recuperar.'); return; }
        const conClave = lista.filter((c) => c.password);
        if (!conClave.length) { showToast('Ninguno de los pendientes tiene clave SRI cargada.'); return; }

        const minutos = Math.max(1, Math.ceil((conClave.length * 40) / 60));
        const detalle = [
            `Se van a recuperar ${conClave.length} comprobante(s) del período ${periodoLabel()}.`
                + (sinClave ? `\n\n${sinClave} no tienen clave SRI: quedan afuera.` : '')
                + (agotados.length ? `\n${agotados.length} ya fallaron ${RECUP_MAX_INTENTOS} veces: quedan afuera.` : '')
                + `\n\nDuración estimada: ~${minutos} min.`
        ].join('');
        const seguir = await pedirConfirmacion({
            titulo: 'Segunda vuelta',
            mensaje: detalle,
            aceptar: `Recuperar ${conClave.length}`,
            cancelar: 'Cancelar'
        });
        if (!seguir) return;

        const periodo = { year: currentYear, monthIndex: currentMonth };
        const per = periodoActualStr();
        const ahora = Date.now();
        const nuevosIntentos = { ...intentos };
        conClave.forEach((c) => {
            const prev = nuevosIntentos[c.ruc] || {};
            nuevosIntentos[c.ruc] = { intentos: Number(prev.intentos || 0) + 1, ultimo: ahora };
        });
        const primero = conClave[0];
        chrome.storage.local.set({
            pending_sri_autofill: {
                ruc: primero.ruc, password: primero.password, name: primero.name,
                timestamp: Date.now(), manual: true, isBatch: true, loginAttempted: false
            },
            pendingAction: 'recuperar_comprobante',
            recuperarComprobante: { ruc: primero.ruc, nombre: primero.name, periodo, per, intentos: 0 },
            auto_batch_enabled: true,
            auto_batch_queue: conClave,
            auto_batch_index: 0,
            auto_batch_period: periodo,
            sri_target_period: periodo,
            workflowPeriod: periodo,
            sc_loop: { estado: 'CORRIENDO', cola: conClave, indice: 0, periodo, latido: Date.now(), motivo: 'Segunda vuelta: comprobantes' },
            sri_master_switch_on: true,
            sriAutomationPaused: false,
            ghost_manual_mode: false,
            autoDeclaration: false,
            sri_auto_mode: true,
            actionTimestamp: Date.now(),
            [RECUP_KEY]: nuevosIntentos,
            [RECUP_LOTE_KEY]: { cuando: ahora, periodo: per, rucs: conClave.map((c) => c.ruc) }
        }, () => {
            showToast(`🔁 Recuperando ${conClave.length} comprobante(s) · ~${minutos} min`);
            chrome.tabs.create({ url: SRI_LOGIN_URL });
        });
    });
}

document.getElementById('btnSegundaVuelta')?.addEventListener('click', arrancarSegundaVuelta);
chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && (c.sc_declaraciones_locales || c.sc_loop || c[RECUP_LOTE_KEY])) pintarSegundaVuelta();
});
pintarSegundaVuelta();

// ── Diálogo de confirmación interno ────────────────────────────────────
// Reemplaza window.confirm: se puede estilar, no queda detrás del popup
// y el botón dice la consecuencia (UI/UX Pro Max §8 y §1).
function pedirConfirmacion({ titulo = "Confirmar", mensaje = "", aceptar = "Aceptar", cancelar = "Cancelar", peligro = false } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "confirm-overlay";
        overlay.innerHTML = `
            <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirmTitulo">
                <p class="confirm-title" id="confirmTitulo"></p>
                <p class="confirm-msg"></p>
                <div class="confirm-btns">
                    <button type="button" class="cancelar"></button>
                    <button type="button" class="aceptar"></button>
                </div>
            </div>`;
        overlay.querySelector(".confirm-title").textContent = titulo;
        overlay.querySelector(".confirm-msg").textContent = mensaje;
        const btnNo = overlay.querySelector(".cancelar");
        const btnSi = overlay.querySelector(".aceptar");
        btnNo.textContent = cancelar;
        btnSi.textContent = aceptar;
        if (peligro) { btnSi.classList.remove("aceptar"); btnSi.classList.add("peligro"); }
        const cerrar = (valor) => { overlay.remove(); document.removeEventListener("keydown", tecla); resolve(valor); };
        const tecla = (ev) => { if (ev.key === "Escape") cerrar(false); };
        btnNo.addEventListener("click", () => cerrar(false));
        btnSi.addEventListener("click", () => cerrar(true));
        overlay.addEventListener("click", (ev) => { if (ev.target === overlay) cerrar(false); });
        document.addEventListener("keydown", tecla);
        document.body.appendChild(overlay);
        btnSi.focus();
    });
}
