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
document.addEventListener('DOMContentLoaded', () => {
    initSelectors();
    bindEvents();
    loadClientsFromCacheOrFetch();
});

function initSelectors() {
    const now = new Date();
    // Período objetivo por defecto: el mes anterior. Pero si hay una preferencia
    // guardada (sri_target_period, elegida a mano o con "🎯 Mes que falta"), esa manda.
    chrome.storage.local.get(['sri_target_period'], (res) => {
        const t = res.sri_target_period;
        let y = now.getFullYear(), m = now.getMonth() - 1;
        if (m < 0) { m = 11; y--; }
        if (t && t.year && typeof t.monthIndex === 'number') {
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
        chrome.storage.local.get(['last_sync_time'], (res) => {
            const lastSync = res.last_sync_time || 0;
            const now = Date.now();
            const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);

            if (hoursSinceLastSync < 4) {
                const proceed = window.confirm(
                    "⚠️ AHORRO DE DATOS (EGRESS EXCEEDED)\n\n" +
                    "Sincronizaste hace menos de 4 horas.\n" +
                    "Hacer múltiples descargas al día agota la cuota mensual de Supabase.\n\n" +
                    "¿Deseas forzar una sincronización nueva en este momento?"
                );
                if (!proceed) return;
            }

            chrome.storage.local.set({ last_sync_time: now });
            const btn = document.getElementById('btnSyncCloud') || document.getElementById('syncBtn');
            if (btn) {
                const orig = btn.innerText;
                btn.innerText = "⏳ Sincronizando...";
                setTimeout(() => { if (btn) btn.innerText = orig; }, 1200);
            }
            
            fetchClients(true);
        });
    };

    document.getElementById('btnSyncCloud')?.addEventListener('click', syncHandler);
    document.getElementById('syncBtn')?.addEventListener('click', syncHandler);

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
            if (!hayLote && isChecked) pintarPanelModoAuto();
            showToast(
                !hayLote ? (isChecked ? '⚡ Bucle ACTIVADO para el próximo lote' : '⏸️ Bucle DESACTIVADO')
                : isChecked ? '▶️ Bucle REANUDADO'
                : '⏸️ Pausa: termina el cliente actual y para ahí'
            );
        });
    });

    // Pestañas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            e.target.classList.add('active');
            const targetEl = document.getElementById(e.target.dataset.target);
            if (targetEl) targetEl.classList.add('active');
        });
    });
}

/**
 * Evalúa el perfil tributario y régimen del cliente para saber si aplica IVA Mensual
 * y explica el motivo transparente si no aplica (Popular, Semestral, Inactivo, etc.).
 */
function evaluarRegimenCliente(c) {
    if (!c || !c.ruc) return { esMensual: false, label: 'Sin RUC', motivo: 'invalido' };
    if (c.force_mensual === true) return { esMensual: true, label: 'IVA Mensual (Forzado)', motivo: 'forzado' };
    if (c.isDeleted || c.is_deleted) return { esMensual: false, label: 'Eliminado', motivo: 'eliminado' };
    if (c.isActive === false || c.is_active === false) return { esMensual: false, label: 'Inactivo en BD', motivo: 'inactivo' };

    const tp = c.tax_profile || c.taxProfile || {};
    const freq = (tp.ivaFrequency || c.iva_frequency || c.ivaFrequency || '').toLowerCase();
    const reg = (c.regime || '').toLowerCase();
    const type = (c.client_type || c.clientType || tp.clientType || '').toLowerCase();

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
    const FIELDS = 'id,ruc,name,regime,tax_profile,declaration_history';
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
        } else {
            fetchClients();
        }
    });
}

/** Persiste el mes elegido en los selects como preferencia del período objetivo. */
function persistirMesSeleccionado() {
    return chrome.storage.local.set({ sri_target_period: { year: currentYear, monthIndex: currentMonth } });
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
    otrosClients = allRawClients.filter(c => !evaluarRegimenCliente(c).esMensual && !(c.isDeleted || c.is_deleted));
    clientesBaja = allRawClients.filter(c => c.isDeleted || c.is_deleted);
}

/** true si la Lista Bendita está activa (se creó alguna vez). null/ausente = corre todo. */
function benditaActiva() {
    return Array.isArray(listaBendita);
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
    showToast(`🙏 ${pendientes.length} cliente(s) bendecido(s). El lote correrá sólo a los benditos.`);
}

/** Deja la Bendita vacía pero activa: nadie corre hasta bendecir. */
async function quitarTodosBenditos() {
    listaBendita = [];
    await guardarBendita();
    showToast('💔 Lista Bendita vacía: no correrá nadie hasta bendecir.');
}

/** Desactiva la Bendita por completo: vuelve el comportamiento de siempre (corre todo). */
async function desactivarBendita() {
    listaBendita = null;
    await chrome.storage.local.set({ [SC_BENDITA_KEY]: null });
    renderClients();
    actualizarCabeceraBendita();
    showToast('⚡ Lista Bendita desactivada: vuelve a correr todo pendiente.');
}

/** Los clientes mensuales que faltan declarar el período elegido (sin errores). */
function clientesPendientesDelPeriodo() {
    return allClients.filter(c =>
        !flaggedErrors[c.ruc] && !hasPdfForPeriod(c, currentYear, currentMonth) && esBendito(c.ruc));
}

/** Ídem sin el filtro de la Bendita: para saber si hay pendientes aunque ninguno sea bendito. */
function pendientesSinBenditaFilter() {
    return allClients.filter(c =>
        !flaggedErrors[c.ruc] && !hasPdfForPeriod(c, currentYear, currentMonth));
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
        html.push(`<span class="chip bendita-chip on">🙏 Benditos: <b>${listaBendita.length}</b></span>`);
        html.push(`<span class="chip" title="Benditos que faltan declarar ${periodoLabel()}">🎯 Correrán: <b>${aCorrer}</b></span>`);
        if (sinClave > 0) {
            html.push(`<span class="chip chip-warn" title="Estos benditos no tienen clave SRI cargada">🔑 ${sinClave} sin clave</span>`);
        }
    } else {
        html.push(`<span class="chip chip-off">🙏 Lista Bendita: inactiva — corre todo pendiente</span>`);
    }
    el.innerHTML = html.join(' ');
}

function periodoLabel() {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${meses[currentMonth]} ${currentYear}`;
}

/** Panel del Modo Auto: cuántos van a correr y desde dónde. */
function pintarPanelModoAuto() {
    const el = document.getElementById('modoAutoPanel');
    if (!el) return;
    const on = document.getElementById('chkAutoBatch')?.checked || false;
    if (!on) { el.style.display = 'none'; return; }

    const pendTotal = pendientesSinBenditaFilter().length;
    const pendBenditos = clientesPendientesDelPeriodo().length;
    const conClave = clientesPendientesDelPeriodo().filter(c => c.password).length;
    const primera = clientesPendientesDelPeriodo().sort((a,b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc))[0];

    const frag = [];
    if (!benditaActiva()) {
        frag.push(`<div style="color:#94a3b8;">🙏 La Lista Bendita está <b>inactiva</b>: al arrancar se te va a ofrecer crearla.</div>`);
    } else if (pendBenditos === 0) {
        frag.push(`<div style="color:#ffb95f;">🤍 No hay benditos pendientes para ${periodoLabel()}. Marcá con 🙏 a quienes corren o pulsá «Bendecir pendientes».</div>`);
    } else {
        frag.push(`<div>🎯 <b>${pendBenditos}</b> bendito(s) van a correr en ${periodoLabel()}${conClave < pendBenditos ? ` · 🔑 ${pendBenditos - conClave} sin clave (frenarán pidiendo clave)` : ''}.</div>`);
        if (primera) frag.push(`<div style="color:#94a3b8;font-size:10px;">▶ Empieza por ${primera.name} (día ${getSriDueDateDay(getNinthDigit(primera.ruc))}).</div>`);
    }
    if (pendTotal > pendBenditos) {
        frag.push(`<div style="color:#64748b;font-size:10px;">Hay ${pendTotal} pendiente(s) en total; ${pendTotal - pendBenditos} no bendito(s) NO correrán.</div>`);
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

function renderClients() {
    const searchVal = document.getElementById('searchInput').value.toLowerCase().trim();
    
    const filteredMensuales = allClients.filter(c => {
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
        pendientesList.innerHTML = `<div class="empty-state">🎉 ¡Todos los clientes al día! No hay pendientes.</div>`;
    } else {
        pendientes.forEach(client => pendientesList.appendChild(createClientCard(client, 'pending')));
    }

    if (completados.length === 0) {
        completadosList.innerHTML = `<div class="empty-state">No hay clientes completados para este mes aún.</div>`;
    } else {
        completados.forEach(client => completadosList.appendChild(createClientCard(client, 'done')));
    }

    if (errores.length === 0) {
        erroresList.innerHTML = `<div class="empty-state">No hay clientes marcados con error.</div>`;
    } else {
        errores.forEach(client => erroresList.appendChild(createClientCard(client, 'error')));
    }

    if (otrosList) {
        if (filteredOtros.length === 0) {
            otrosList.innerHTML = `<div class="empty-state">No hay clientes en otros regímenes.</div>`;
        } else {
            filteredOtros.forEach(client => otrosList.appendChild(createClientCard(client, 'otro')));
        }
    }

    if (bajaList) {
        if (filteredBaja.length === 0) {
            bajaList.innerHTML = `<div class="empty-state">No hay clientes dados de baja.</div>`;
        } else {
            filteredBaja.forEach(client => bajaList.appendChild(createClientCard(client, 'baja')));
        }
    }

    actualizarCabeceraBendita();
    pintarAvisoSync();
    pintarPanelModoAuto();
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

    let badgeHtml = '<div class="status-badge status-pending" style="margin-top:4px; font-size:10px; font-weight:700; color:#ffb95f; background:rgba(255,185,95,0.1); border:1px solid rgba(255,185,95,0.25); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🟡 PENDIENTE</div>';
    if (isDone) badgeHtml = '<div class="status-badge status-done" style="margin-top:4px; font-size:10px; font-weight:700; color:#4edea3; background:rgba(78,222,163,0.1); border:1px solid rgba(78,222,163,0.25); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🟢 COMPLETADO</div>';
    if (isBaja) badgeHtml = '<div class="status-badge" style="margin-top:4px; font-size:10px; font-weight:700; color:#94a3b8; background:rgba(100,116,139,0.12); border:1px solid rgba(100,116,139,0.3); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🚫 DADO DE BAJA</div>';
    if (isError) {
        const errType = flaggedErrors[client.ruc];
        if (errType === 'clave_incorrecta' || errType === 'error_credenciales') {
            badgeHtml = '<div class="status-badge" style="margin-top:4px; font-size:10px; font-weight:700; background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.35); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🔴 CLAVE RECHAZADA (SRI)</div>';
        } else if (errType === 'clave_caducada') {
            badgeHtml = '<div class="status-badge" style="margin-top:4px; font-size:10px; font-weight:700; background:rgba(245,158,11,0.18); color:#fcd34d; border:1px solid rgba(245,158,11,0.35); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🔑 CLAVE CADUCADA (SRI)</div>';
        } else if (errType === 'cuenta_bloqueada') {
            badgeHtml = '<div class="status-badge" style="margin-top:4px; font-size:10px; font-weight:700; background:rgba(220,38,38,0.25); color:#f87171; border:1px solid rgba(220,38,38,0.45); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🚨 CUENTA BLOQUEADA</div>';
        } else if (errType === 'sesion_caida') {
            badgeHtml = '<div class="status-badge" style="margin-top:4px; font-size:10px; font-weight:700; background:rgba(147,51,234,0.18); color:#d8b4fe; border:1px solid rgba(147,51,234,0.35); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🔌 SESIÓN CAÍDA (SRI)</div>';
        } else {
            badgeHtml = '<div class="status-badge" style="margin-top:4px; font-size:10px; font-weight:700; background:rgba(239,68,68,0.12); color:#ff8585; border:1px solid rgba(239,68,68,0.25); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🔴 ERROR / OMITIDO</div>';
        }
    } else if (isOtro) {
        const infoR = evaluarRegimenCliente(client);
        badgeHtml = `<div class="status-badge" style="margin-top:4px; font-size:10px; font-weight:700; background:rgba(148,163,184,0.15); color:#94a3b8; border:1px solid rgba(148,163,184,0.25); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">📋 ${infoR.label}</div>`;
    }

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
    }

    card.innerHTML = `
        <div class="client-card-main">
            <div class="client-info">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px;">
                    <div class="client-name" title="${client.name}">${client.name}</div>
                    <span class="due-badge" title="Vence el día ${dueDay} del mes">Día ${dueDay}</span>
                </div>
                <div class="client-meta" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px;">
                    <span class="client-ruc-badge" data-action="copiar-ruc" data-ruc="${client.ruc}" style="cursor:pointer; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); padding:2px 7px; border-radius:5px; font-weight:700; font-size:11px; color:#cbd5e1; font-family:'JetBrains Mono',monospace; transition:0.2s;" title="Copiar RUC">
                        📋 ${client.ruc}
                    </span>
                    ${passUi}
                    <span data-action="toggle-bendito" data-ruc="${client.ruc}"
                          style="cursor:pointer; font-size:13px; line-height:1; padding:3px 6px; border-radius:6px; border:1px solid ${esBend ? 'rgba(78,222,163,0.45)' : 'rgba(255,255,255,0.12)'}; background:${esBend ? 'rgba(78,222,163,0.15)' : 'rgba(255,255,255,0.03)'}; transition:0.2s;"
                          title="${esBend ? 'En lista bendita para el lote' : 'Agregar al lote'}">
                        ${esBend ? '🙏' : '🤍'}
                    </span>
                    ${badgeHtml}
                </div>
            </div>
            <div class="client-actions" style="display:flex; flex-direction:column; align-items:flex-end; gap:5px; flex-shrink:0;">
                ${actionBtnHtml}
            </div>
        </div>
        ${isDone || isError ? '' : buildOrdenMesesBlock(client)}
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
    const chips = pendientes.map(p => {
        const on = sel.has(p.periodo);
        return `
            <label class="mes-orden-chip" data-action="toggle-mes-orden" data-ruc="${ruc}" data-periodo="${p.periodo}"
                   style="display:inline-flex; align-items:center; gap:4px; margin:2px 4px 2px 0; padding:4px 8px; border-radius:6px; font-size:10px; cursor:pointer; user-select:none; border:1px solid ${on ? 'rgba(78,222,163,0.7)' : 'rgba(255,255,255,0.12)'}; background:${on ? 'rgba(78,222,163,0.2)' : 'rgba(255,255,255,0.04)'}; color:${on ? '#4edea3' : '#94a3b8'}; font-weight:700; transition:0.15s;" title="Incluir ${p.label} en la orden">
                <span style="font-size:11px;">${on ? '☑️' : '⬜'}</span> ${p.label}
            </label>`;
    }).join('');
    const count = sel.size;
    return `
        <div class="orden-meses" style="width:100%; margin-top:4px; padding:7px 10px; border:1px solid rgba(99,102,241,0.25); border-radius:9px; background:rgba(99,102,241,0.06);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px;">
                <span style="font-size:10px; font-weight:800; color:#a5b4fc; letter-spacing:0.4px;">🗓️ ORDEN DE MESES (2025 - 2026)</span>
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

function togglePasswordVisibility(ruc) {
    visiblePasswords[ruc] = !visiblePasswords[ruc];
    renderClients();
}

async function editarClave(ruc) {
    const client = allClients.find(c => c.ruc === ruc);
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
            const agregar = window.confirm(
                `🤍 ${cliente ? cliente.name : ruc} NO está en la Lista Bendita.\n\n` +
                'El lote corre sólo a los benditos. ¿Bendecirlo y arrancar el lote desde él?'
            );
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
            const bendecir = window.confirm(
                '🤍 Ninguno de los pendientes del período está en la Lista Bendita.\n\n' +
                '¿Bendecir a todos los pendientes ahora?'
            );
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
    const pendingClients = pendBase.sort(sortBy9th);

    // Si el cliente seleccionado está en la lista de pendientes, reordenar la cola comenzando por él
    let queue = pendingClients.map(c => ({ ruc: c.ruc, password: c.password, name: c.name }));
    const startIndex = queue.findIndex(q => q.ruc === ruc);
    if (startIndex > 0) {
        queue = queue.slice(startIndex).concat(queue.slice(0, startIndex));
    }

    if (isBatchActive && queue.length === 0) {
        showToast('🎉 No quedan benditos pendientes para este período.');
        return;
    }

    const targetPeriodStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}`;

    chrome.storage.local.remove(['declaration_synced_flag'], () => {
        chrome.storage.local.set({
            pending_sri_autofill: {
                ruc: client.ruc,
                password: client.password,
                name: client.name,
                timestamp: Date.now(),
                manual: true,
                isBatch: isBatchActive
            },
            auto_batch_enabled: isBatchActive,
            auto_batch_queue: isBatchActive ? queue : [],
            auto_batch_index: 0,
            auto_batch_period: { year: currentYear, monthIndex: currentMonth },
            sri_target_period: { year: currentYear, monthIndex: currentMonth },
            sri_period_order: null,
            // 🚦 El semáforo es la autoridad del bucle. Sin esto el content
            // script descarta el lote apenas carga la pantalla de login.
            sc_loop: isBatchActive
                ? { estado: 'CORRIENDO', cola: queue, indice: 0,
                    periodo: { year: currentYear, monthIndex: currentMonth },
                    latido: Date.now(), motivo: '' }
                : { estado: 'DETENIDO', cola: [], indice: 0, motivo: 'Cliente suelto desde el popup' },
            pendingAction: 'verifyProfile',
            workflowPeriod: { year: currentYear, monthIndex: currentMonth },
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
    const btn = document.getElementById('btnAjustes');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    });
});
