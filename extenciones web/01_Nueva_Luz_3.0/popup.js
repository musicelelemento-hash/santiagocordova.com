const SC_CONFIG = window.SC_CONFIG || {};
const SUPABASE_URL = SC_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = SC_CONFIG.SUPABASE_ANON_KEY;

let allClients = [];
let currentMonth = 0;
let currentYear = 2026;
let visiblePasswords = {}; // Mapa para recordar qué claves están visibles
let flaggedErrors = {}; // Mapa de contribuyentes con error
document.addEventListener('DOMContentLoaded', () => {
    initSelectors();
    bindEvents();
    loadClientsFromCacheOrFetch();
});

function initSelectors() {
    const now = new Date();
    currentMonth = now.getMonth() - 1;
    currentYear = now.getFullYear();
    
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }

    const monthSel = document.getElementById('periodMonth');
    const yearSel = document.getElementById('periodYear');

    for (let y = now.getFullYear(); y >= 2020; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSel.appendChild(opt);
    }

    monthSel.value = currentMonth;
    yearSel.value = currentYear;
}

function bindEvents() {
    document.getElementById('periodMonth').addEventListener('change', (e) => {
        currentMonth = parseInt(e.target.value);
        renderClients();
    });

    document.getElementById('periodYear').addEventListener('change', (e) => {
        currentYear = parseInt(e.target.value);
        renderClients();
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

    // Restaurar estado de Modo Auto Bucle
    chrome.storage.local.get(['auto_batch_enabled'], (res) => {
        const chk = document.getElementById('chkAutoBatch');
        if (chk) chk.checked = !!res.auto_batch_enabled;
    });

    document.getElementById('chkAutoBatch')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        chrome.storage.local.set({ auto_batch_enabled: isChecked });
        showToast(isChecked ? '⚡ Modo Auto Bucle ACTIVADO' : '⏸️ Modo Auto Bucle DESACTIVADO');
    });

    // Pestañas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.target).classList.add('active');
        });
    });
}

function isMensual(c) {
    if (!c || !c.ruc) return false;
    if (c.isDeleted || c.is_deleted) return false;
    if (c.isActive === false || c.is_active === false) return false;

    const tp = c.tax_profile || c.taxProfile || {};
    const freq = (tp.ivaFrequency || c.iva_frequency || c.ivaFrequency || '').toLowerCase();
    const reg = (c.regime || '').toLowerCase();
    const type = (c.client_type || c.clientType || tp.clientType || '').toLowerCase();

    // Excluir clientes de solo plan o que no requieren declaraciones
    if (type === 'solo_plan' || c.requires_declarations === false || tp.requiresDeclarations === false) return false;

    // Frecuencia mensual explícita
    if (freq === 'mensual') return true;

    // Excluir frecuencias no mensuales
    if (freq === 'semestral' || freq === 'ninguno' || freq === 'anual') return false;

    // Excluir RIMPE Negocio Popular (no declara IVA)
    if (reg.includes('popular')) return false;

    // RIMPE Emprendedor es semestral salvo si expresamente declara mensual
    if (reg.includes('emprendedor')) {
        return freq === 'mensual';
    }

    return true;
}

async function fetchClients(forceSync = false) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?is_deleted=eq.false&select=id,ruc,name,regime,tax_profile,declaration_history`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!res.ok) throw new Error("Error fetching clients");
        const data = await res.json();

        // 🔒 Las claves SRI ya no viajan desde la nube: fusionar con la caché local
        const prevCache = await chrome.storage.local.get(['sc_clients_cache']);
        const prevPasswords = new Map((Array.isArray(prevCache.sc_clients_cache) ? prevCache.sc_clients_cache : []).map((p) => [p.ruc, p.password || p.sri_password || ""]));

        allClients = data
            .filter(isMensual)
            .map(c => ({
                id: c.id,
                ruc: c.ruc,
                name: c.name || 'Cliente SRI',
                password: prevPasswords.get(c.ruc) || "",
                declarations: Array.isArray(c.declaration_history) ? c.declaration_history : []
            }));

        // Guardar en Caché Local para evitar peticiones innecesarias
        chrome.storage.local.set({ sc_clients_cache: allClients });
            
        renderClients();
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
    chrome.storage.local.get(['sc_clients_cache', 'flagged_errors'], (res) => {
        flaggedErrors = res.flagged_errors || {};
        if (Array.isArray(res.sc_clients_cache) && res.sc_clients_cache.length > 0) {
            console.log("⚡ [Nueva Luz 3.0] Carga instantánea desde caché local:", res.sc_clients_cache.length, "clientes");
            allClients = res.sc_clients_cache.filter(isMensual);
            renderClients();
        } else {
            fetchClients();
        }
    });
}

function renderClients() {
    const searchVal = document.getElementById('searchInput').value.toLowerCase().trim();
    
    const filtered = allClients.filter(c => {
        const matchesName = (c.name || '').toLowerCase().includes(searchVal);
        const matchesRuc = (c.ruc || '').includes(searchVal);
        return matchesName || matchesRuc;
    });

    const sortBy9th = (a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc);

    const pendientes = [];
    const completados = [];
    const errores = [];

    filtered.forEach(client => {
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

    document.getElementById('countPendientes').innerText = pendientes.length;
    document.getElementById('countCompletados').innerText = completados.length;
    document.getElementById('countErrores').innerText = errores.length;

    const pendientesList = document.getElementById('pendientesList');
    const completadosList = document.getElementById('completadosList');
    const erroresList = document.getElementById('erroresList');

    pendientesList.innerHTML = '';
    completadosList.innerHTML = '';
    erroresList.innerHTML = '';

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

    let badgeHtml = '<div class="status-badge status-pending" style="margin-top:4px; font-size:10px; font-weight:700; color:#ffb95f; background:rgba(255,185,95,0.1); border:1px solid rgba(255,185,95,0.25); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🟡 PENDIENTE</div>';
    if (isDone) badgeHtml = '<div class="status-badge status-done" style="margin-top:4px; font-size:10px; font-weight:700; color:#4edea3; background:rgba(78,222,163,0.1); border:1px solid rgba(78,222,163,0.25); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🟢 COMPLETADO</div>';
    if (isError) badgeHtml = '<div class="status-badge" style="margin-top:4px; font-size:10px; font-weight:700; background:rgba(239,68,68,0.12); color:#ff8585; border:1px solid rgba(239,68,68,0.25); border-radius:5px; padding:2px 6px; display:inline-flex; align-items:center; gap:4px;">🔴 ERROR / OMITIDO</div>';

    let actionBtnHtml = `
        <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
            <button class="btn-start" data-action="iniciar" data-ruc="${client.ruc}">
                ▶ Ingresar
            </button>
            <span data-action="marcar-error" data-ruc="${client.ruc}" style="font-size:10px; color:#f87171; cursor:pointer; font-weight:700; opacity:0.8; transition:0.2s;" title="Mover a pestaña de Errores para omitir del bucle">
                ⚠️ Omitir
            </span>
        </div>
    `;

    if (isDone) {
        actionBtnHtml = `
            <button class="btn-start" data-action="iniciar" data-ruc="${client.ruc}" style="opacity:0.6; filter:grayscale(0.5);">
                ▶ Ingresar
            </button>
        `;
    } else if (isError) {
        actionBtnHtml = `
            <button class="btn-start" data-action="reintentar" data-ruc="${client.ruc}" style="background:linear-gradient(135deg, #ffb95f, #d97706); color:#2a1700;">
                🔄 Reintentar
            </button>
        `;
    }

    card.innerHTML = `
        <div class="client-info">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:3px;">
                <div class="client-name" title="${client.name}">${client.name}</div>
                <span class="due-badge" title="Vence el día ${dueDay} del mes">Día ${dueDay}</span>
            </div>
            <div class="client-meta" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px;">
                <span class="client-ruc-badge" data-action="copiar-ruc" data-ruc="${client.ruc}" style="cursor:pointer; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:2px 7px; border-radius:5px; font-weight:700; font-size:11px; color:#94a3b8; transition:0.2s; font-family:'JetBrains Mono',monospace;" title="Copiar RUC">
                    📋 ${client.ruc}
                </span>
                ${passUi}
            </div>
            ${badgeHtml}
        </div>
        ${actionBtnHtml}
    `;
    return card;
}

// 🛡️ DELEGACIÓN GLOBAL DE EVENTOS (Compatible 100% con CSP de Chrome MV3 sin onclick inline)
document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const ruc = el.dataset.ruc;

    if (action === 'iniciar') {
        iniciarCliente(ruc);
    } else if (action === 'copiar-ruc') {
        copiarAlPortapapeles(ruc, el);
    } else if (action === 'toggle-pass') {
        visiblePasswords[ruc] = !visiblePasswords[ruc];
        renderClients();
    } else if (action === 'copiar-pass') {
        copiarAlPortapapeles(el.dataset.pass || '', el);
    } else if (action === 'editar-clave') {
        editarClave(ruc);
    } else if (action === 'marcar-error') {
        marcarErrorCliente(ruc);
    } else if (action === 'reintentar') {
        reintentarCliente(ruc);
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
        allClients = updatedCache.filter(isMensual);
        await chrome.storage.local.set({ sc_clients_cache: updatedCache });
        renderClients();
        showToast("✅ Clave guardada localmente.");
        return true;
    } catch (e) {
        alert("No se pudo guardar la clave: " + e.message);
        return false;
    }
}

async function iniciarCliente(ruc) {
    const client = allClients.find(c => c.ruc === ruc);
    if (!client) return;

    if (!client.password) {
        const newPass = prompt(`La clave está vacía. Ingresa la clave para ${client.name} antes de iniciar:`);
        if (!newPass) return;
        const ok = await actualizarClaveSupabase(client, newPass);
        if (!ok) return;
    }

    const isBatchActive = document.getElementById('chkAutoBatch')?.checked || false;
    
    // Obtener clientes pendientes actuales ordenados por 9no dígito
    const sortBy9th = (a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc);
    const pendingClients = allClients
        .filter(c => !hasPdfForPeriod(c, currentYear, currentMonth) && !flaggedErrors[c.ruc])
        .sort(sortBy9th);

    // Si el cliente seleccionado está en la lista de pendientes, reordenar la cola comenzando por él
    let queue = pendingClients.map(c => ({ ruc: c.ruc, password: c.password, name: c.name }));
    const startIndex = queue.findIndex(q => q.ruc === ruc);
    if (startIndex > 0) {
        queue = queue.slice(startIndex).concat(queue.slice(0, startIndex));
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
