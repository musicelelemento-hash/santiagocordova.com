// ============================================================
// HELPERS GLOBALES (v3.2)
console.log('%c👻 SRI ASISTENTE v8.18 GHOST - INICIADO', 'background: #f8fafc; color: #64748b; font-size: 16px; font-weight: bold; padding: 10px; border-radius: 5px; border: 2px solid #cbd5e1; box-shadow: 0 0 15px rgba(0,0,0,0.1);');
// ============================================================
// Helper global para estados y logs sin depender del contexto 'this'
const safeStatus = (msg) => { if (window.sriAssistant?.setStatus) window.sriAssistant.setStatus(msg); };
const safeLog = (msg) => { if (window.sriAssistant?.log) window.sriAssistant.log(msg); };

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
// SAFE STORAGE WRAPPER (Indestructible v10.5)
// ============================================================
const SafeStorage = {
    async get(keys) {
        try {
            return await chrome.storage.local.get(keys);
        } catch (e) {
            if (e.message.includes('context invalidated')) {
                this.handleDisconnection();
            }
            throw e;
        }
    },
    async set(items) {
        try {
            return await chrome.storage.local.set(items);
        } catch (e) {
            if (e.message.includes('context invalidated')) {
                this.handleDisconnection();
            }
            throw e;
        }
    },
    async remove(keys) {
        try {
            return await chrome.storage.local.remove(keys);
        } catch (e) {
            if (e.message.includes('context invalidated')) {
                this.handleDisconnection();
            }
            throw e;
        }
    },
    handleDisconnection() {
        console.error('🛑 [CRITICO] La extensión se ha desconectado o actualizado.');
        const overlay = document.createElement('div');
        overlay.id = 'sri-disconnection-overlay';
        overlay.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999999; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; text-align: center; padding: 20px;">
                <div style="font-size: 50px; margin-bottom: 20px;">🛡️</div>
                <h1 style="margin: 0; font-size: 24px;">Extensión Actualizada</h1>
                <p style="margin: 15px 0; font-size: 16px; max-width: 400px; color: #cbd5e1;">La extensión se ha actualizado o reiniciado. Para continuar con el proceso de extracción o navegación sin errores:</p>
                <div style="display: flex; gap: 15px; margin-top: 10px;">
                    <button onclick="window.location.reload()" style="background: #4f46e5; color: white; border: none; padding: 12px 25px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 15px; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);">🔄 RECARGAR PÁGINA</button>
                    <button onclick="document.getElementById('sri-disconnection-overlay').remove()" style="background: #334155; color: white; border: none; padding: 12px 25px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 15px;">🔓 DESCONGELAR</button>
                </div>
            </div>
        `;
        if (!document.getElementById('sri-disconnection-overlay')) {
            document.body.appendChild(overlay);
        }
    }
};

const findByText = (text, tag = '*') => {
    const upperText = text.toUpperCase();
    // ELITE 2.0: Buscamos el nodo más profundo que contenga el texto.
    // Usamos normalize-space para limpiar espacios extra y translate para insensibilidad a mayúsculas.
    const xpath = `//${tag}[not(ancestor::div[@id="sri-assistant-panel-root"])][contains(translate(normalize-space(.), 'abcdefghijklmnopqrstuvwxyzáéíóú', 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ'), '${upperText}')]`;
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

    let candidates = [];
    for (let i = 0; i < result.snapshotLength; i++) {
        const el = result.snapshotItem(i);
        // Filtramos contenedores base y elementos invisibles
        if (el.offsetParent !== null && !['SCRIPT', 'STYLE', 'HTML', 'BODY', 'SRI-ROOT'].includes(el.tagName)) {
            candidates.push(el);
        }
    }

    if (candidates.length === 0) {
        console.log(`🔎 findByText("${text}"): 0 candidatos.`);
        return null;
    }

    // El mejor es el nodo que tiene el texto más corto (el más específico)
    const bestMatch = candidates.sort((a, b) => {
        const textA = (a.innerText || a.textContent || '').trim();
        const textB = (b.innerText || b.textContent || '').trim();
        return textA.length - textB.length;
    })[0];

    console.log(`🎯 findByText("${text}") -> `, bestMatch);
    return bestMatch;
};

const clickElement = (el, name) => {
    if (!el) {
        console.warn(`❌ No se pudo clickear: ${name} (Elemento null)`);
        return false;
    }
    console.log(`✅ Clickeando: ${name}`, el);
    const events = ['mouseover', 'mousedown', 'mouseup', 'click'];
    events.forEach(evtType => {
        el.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window }));
    });
    if (el.parentElement && (el.parentElement.tagName === 'BUTTON' || el.parentElement.tagName === 'A' || el.parentElement.className.includes('card'))) {
        el.parentElement.click();
    }
    return true;
};

async function waitForRecaptchaReady(timeout = 4000) {
    // ELITE v13.1: Detección ultra-rápida. Si ya hay una tabla o el SRI está validado, no esperamos.
    if (document.querySelector('.ui-datatable-data tr') || document.querySelector('.sri-verified')) {
        return true;
    }

    console.log('🤖 Verificando reCAPTCHA...');
    return await waitFor(() => {
        const grecaptcha = window.grecaptcha || (window.grecaptcha && window.grecaptcha.enterprise);
        if (!grecaptcha) return false;

        const isClientReady = typeof grecaptcha.execute === 'function' ||
            (grecaptcha.enterprise && typeof grecaptcha.enterprise.execute === 'function');

        const recaptchaIframe = document.querySelector('iframe[src*="recaptcha"]');

        // Si hay iframe de error o ya expiró, procedemos igual para que el usuario actue
        return isClientReady || recaptchaIframe !== null;
    }, timeout, 'reCAPTCHA Ready');
}

// ============================================================
// GHOST MEMORY ENGINE (v1.0) - MULTI-USER PROTECTION
// ============================================================
const GhostMemory = {
    async getRuc() {
        const info = window.sriAssistant ? window.sriAssistant.extractClientInfo() : { ruc: null };
        if (info.ruc) return info.ruc;
        try {
            const stored = await SafeStorage.get(['lastRuc']);
            return stored.lastRuc || 'GHOST_USER';
        } catch (e) { return 'GHOST_USER'; }
    },

    async getKeys() {
        const ruc = await this.getRuc();
        return {
            facturas: `data_${ruc}_facturas`,
            retenciones: `data_${ruc}_retenciones`,
            notasCredito: `data_${ruc}_notasCredito`,
            workflowPeriod: `data_${ruc}_period`,
            workflowState: `data_${ruc}_workflowState`
        };
    },

    async getData() {
        const keys = await this.getKeys();
        const storageKeys = Object.values(keys);
        const res = await SafeStorage.get(storageKeys);
        return {
            facturas: res[keys.facturas],
            retenciones: res[keys.retenciones],
            notasCredito: res[keys.notasCredito],
            workflowPeriod: res[keys.workflowPeriod],
            workflowState: res[keys.workflowState]
        };
    },

    async set(key, value) {
        const keys = await this.getKeys();
        const storageKey = keys[key] || key;
        await SafeStorage.set({ [storageKey]: value });
        // ELITE FIX: También guardamos en la clave global para sincronía con el panel
        if (key === 'workflowPeriod') {
            await SafeStorage.set({ 'workflowPeriod': value });
        }
    },

    async remove(key) {
        const keys = await this.getKeys();
        const storageKey = keys[key] || key;
        await SafeStorage.remove([storageKey]);
    },

    async clearCurrent() {
        const keys = await this.getKeys();
        await SafeStorage.remove(Object.values(keys));
    }
};

const checkSessionAlive = async () => {
    const url = window.location.href.toLowerCase();
    const text = document.body.textContent.toLowerCase();

    // Detección de login / auth
    const isLoginPage = url.includes('login.jsf') ||
        url.includes('/auth/realms/') ||
        url.includes('protocol/openid-connect');

    return true;
};

// ELITE v9.6: Detector de Inconsistencia de Sesión (Cross-User Protection)
async function verifySessionConsistency() {
    const info = window.sriAssistant ? window.sriAssistant.extractClientInfo() : { ruc: null };
    if (!info.ruc || !info.highConfidence) return true;

    // Buscar RUC en elementos de identificación del formulario
    const idFields = Array.from(document.querySelectorAll('td, span, label, div'))
        .filter(el => {
            const t = el.textContent;
            return (t.includes('Identificación') || t.includes('RUC')) && /\d{13}/.test(t) && el.offsetParent !== null;
        });

    for (const field of idFields) {
        const match = field.textContent.match(/\d{13}/);
        if (match && match[0] !== info.ruc) {
            console.error(`🛑 INCONSISTENCIA CRÍTICA: Portal Login (${info.ruc}) != Formulario Data (${match[0]})`);
            alert(`🚀 BLOQUEO DE SEGURIDAD ELITE:\n\nSe ha detectado una inconsistencia de sesión en el portal del SRI.\n\nUsuario Logueado: ${info.ruc}\nUsuario en Vista: ${match[0]}\n\nPor favor, cierra sesión y vuelve a ingresar para evitar errores contables.`);
            // Guardar flag para que content.js sepa que debe iniciar al cargar
            await SafeStorage.set({
                pendingAction: 'fillSearch',
                actionTimestamp: Date.now()
            });
            window.location.reload();
            return false;
        }
    }
    return true;
}

const waitFor = async (checkFn, timeoutMs = 8000, label = 'elemento') => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (!(await checkSessionAlive())) return null;

        if (await isPaused()) {
            await sleep(500);
            continue;
        }
        const res = await checkFn();
        if (res) return res;
        await sleep(100);
    }
    console.warn(`⏳ Timeout esperando: ${label}`);
    return null;
};

/**
 * ELITE HELPER: Cierra diálogos obstructores del SRI (ej. Mensajes Personalizados)
 */
async function dismissSridialogs() {
    // ELITE v12.7: Respetar modo manual del asistente
    if (window.sriAssistant && window.sriAssistant.manualMode) return false;

    // Buscar CUALQUIER diálogo de PrimeFaces que esté visible
    const modals = Array.from(document.querySelectorAll('.ui-dialog[role="dialog"]'))
        .filter(m => m.offsetParent !== null && getComputedStyle(m).display !== 'none');

    for (const modal of modals) {
        console.log('🛡️ SRI Assistant: Diálogo obstructor detectado. Limpiando...');

        // Multi-estrategia para el botón Aceptar/OK
        const btnAceptar = modal.querySelector('[id*="j_idt195"]') ||
            modal.querySelector('button.green-btn') ||
            Array.from(modal.querySelectorAll('button')).find(b => {
                const t = b.textContent.toUpperCase();
                return t.includes('ACEPTAR') || t.includes('OK') || t.includes('CONTINUAR');
            });

        if (btnAceptar) {
            clickElement(btnAceptar, 'Cerrar Diálogo Obstructor');
            await sleep(1000); // Pausa de estabilidad
            return true;
        }
    }
    return false;
}

/**
 * ELITE HELPER: Espera a que el portal esté libre (sin overlay de carga)
 */
const waitForPortal = async (maxWait = 10000) => {
    await sleep(500);
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        // Detectar y cerrar diálogos obstructores sobre la marcha
        await dismissSridialogs();

        const overlay = document.querySelector('.ui-blockui') || document.querySelector('.ui-widget-overlay');
        const overlayHidden = !overlay || overlay.offsetParent === null;

        // 2. Verificar splash screen de Angular
        const splash = document.getElementById('id-sri-splash') || document.querySelector('.sri-splash');
        const splashHidden = !splash || splash.offsetParent === null || getComputedStyle(splash).display === 'none';

        // 3. Verificar overlay de validación de navegador
        const disablingDiv = document.getElementById('disablingDiv');
        const noDisabling = !disablingDiv || disablingDiv.style.display === 'none';

        // El portal está listo cuando todos los bloqueos están ocultos
        if (overlayHidden && splashHidden && noDisabling) {
            await sleep(300); // Margen de seguridad
            console.log('✅ waitForPortal: Portal listo');
            return true;
        }

        await sleep(400);
    }

    console.warn('⚠️ waitForPortal: Timeout alcanzado');
    return false;
};

// ============================================================
// MENSAJES ESCUCHA (v3.2)
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Mensaje recibido en Content:', request.action);

    if (request.action === 'autoFillSearch') {
        autoLlenarBusqueda()
            .then(resultado => sendResponse({ success: true, data: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'extractFacturas') {
        extraerTodasLasFacturas()
            .then(resultado => sendResponse({ success: true, data: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'extractRetenciones') {
        extraerTodasLasRetenciones()
            .then(resultado => sendResponse({ success: true, data: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillForm') {
        autoLlenarFormulario(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillVentas') {
        llenarVentas(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillCompras') {
        llenarCompras(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillRetenciones') {
        llenarRetenciones(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillResumen') {
        const fields = ['564', '615', '617', '619'];
        const runResumen = async () => {
            let n = 0;
            // Primero Retenciones (609)
            n += await llenarRetenciones(request.data);
            await sleep(600);
            // Luego Sugeridos (564, 615, 617, 619)
            for (const f of fields) {
                if (await procesarCampoConSugerido(f)) n++;
                await sleep(400);
            }
            return n;
        };
        runResumen()
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'triggerAssistantAction') {
        if (window.sriAssistant) {
            window.sriAssistant.runUnifiedWorkflow(request.type, request.context);
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Asistente no inyectado' });
        }
        return true;
    }

    if (request.action === 'autoFillPeriodo') {
        autoLlenarPeriodoFiscal(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'CLEAR_MEMORY') {
        GhostMemory.clearCurrent().then(() => {
            if (window.sriAssistant) {
                window.sriAssistant.updateSummary();
                window.sriAssistant.showEliteToast({ title: '🧹 Memoria', msg: 'Memoria temporal limpiada.' });
            }
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'STOP_ACTION') {
        if (window.sriAssistant) {
            window.sriAssistant.stopAutomation(false); // false = no confirm
        }
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'extractNotasCredito') {
        extraerTodasLasNotasCredito()
            .then(resultado => sendResponse({ success: true, data: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    // ELITE v12: TRIGGER TURBO MANUAL (Desde Popup)
    if (request.action === 'START_TURBO_MANUAL') {
        const { year, monthIndex, bulkType, checkFacturas, checkRetenciones, checkNC } = request.data;
        console.log('🚀 Iniciando MODO TURBO MANUAL SELECTIVO:', request.data);

        if (window.sriAssistant) {
            window.sriAssistant.log('🚀 Modo Turbo Manual solicitado...');
            window.sriAssistant.setWorking(true);
        }

        // Determinar primer paso activo
        let firstStep = 'turbo_step1_facturas';
        if (!checkFacturas) {
            if (checkRetenciones) firstStep = 'turbo_step3_retenciones';
            else if (checkNC) firstStep = 'turbo_step5_notas_credito';
            else firstStep = 'FIN_TURBO';
        }

        const storageData = {
            workflowPeriod: { year, monthIndex, source: 'MANUAL_TURBO' },
            bulkType: bulkType || 'monthly',
            checkFacturas: !!checkFacturas,
            checkRetenciones: !!checkRetenciones,
            checkNC: !!checkNC,
            pendingAction: firstStep,
            actionTimestamp: Date.now(),
            skipSafetyCheck: true,
            sriAutomationPaused: false
        };

        // Inicializar Flujo Masivo si aplica
        if (bulkType && bulkType !== 'monthly') {
            let monthsToProcess = [];
            if (bulkType === 'sem1') monthsToProcess = [0, 1, 2, 3, 4, 5];
            else if (bulkType === 'sem2') monthsToProcess = [6, 7, 8, 9, 10, 11];
            else if (bulkType === 'annual') monthsToProcess = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

            // ELITE FIX (v14.0): Protección de Fechas Futuras
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth(); // 0 = Enero, 1 = Feb...

            if (parseInt(year) === currentYear) {
                // Solo procesar hasta el mes ANTERIOR (meses cerrados)
                monthsToProcess = monthsToProcess.filter(m => m < currentMonth);
                if (monthsToProcess.length === 0) {
                    if (window.sriAssistant) window.sriAssistant.log('⚠️ Error: No hay meses cerrados disponibles en este año aún.');
                    return;
                }
            } else if (parseInt(year) > currentYear) {
                if (window.sriAssistant) window.sriAssistant.log('🚫 Error: No se permiten búsquedas de años futuros.');
                return;
            }

            storageData.bulkFlow = {
                active: true,
                months: monthsToProcess,
                currentIndex: 0,
                results: [] // Para guardar acumulados por cada mes
            };
            // Forzar el mes inicial del bulk
            storageData.workflowPeriod.monthIndex = monthsToProcess[0];
            // Actualizar mes objetivo en workflowPeriod para que coincida con el primero del bulk
            storageData.workflowPeriod.month = monthsToProcess[0] + 1;
        } else {
            storageData.bulkFlow = { active: false };
        }

        SafeStorage.set(storageData).then(async () => {
            if (firstStep === 'FIN_TURBO') {
                if (window.sriAssistant) window.sriAssistant.log('⚠️ No se seleccionaron tipos de documento.');
                return;
            }

            // VOLVER A NAVEGACIÓN ROBUSTA (Evitar cuelgues de redirección directa)
            await navegarAComprobantes();
        });

        sendResponse({ success: true });
        return true;
    }

    // ELITE v12.1: TRIGGER FLUJO MANUAL INDIVIDUAL
    if (request.action === 'START_MANUAL_FLOW') {
        console.log('🚀 Iniciando FLUJO MANUAL INDIVIDUAL:', request.data.tipo);

        let nextAction = 'turbo_step1_facturas';
        if (request.data.tipo === 'RETENCIONES') nextAction = 'turbo_step3_retenciones';
        if (request.data.tipo === 'NOTAS CRÉDITO') nextAction = 'turbo_step5_notas_credito';

        SafeStorage.set({
            workflowPeriod: {
                year: request.data.year,
                monthIndex: request.data.monthIndex,
                source: 'MANUAL_SINGLE'
            },
            pendingAction: nextAction,
            actionTimestamp: Date.now(),
            skipSafetyCheck: true,
            sriAutomationPaused: false
        }).then(async () => {
            // VOLVER A NAVEGACIÓN ROBUSTA
            await navegarAComprobantes();
        });

        sendResponse({ success: true });
        return true;
    }
});

// ============================================================
// ELITE UTILS: GESTIÓN DE FLUJO SELECTIVO Y MASIVO
// ============================================================

function getNextTurboStep(currentStep, settings) {
    const sequence = [
        { id: 'turbo_step1_facturas', check: settings.checkFacturas },
        { id: 'turbo_step2_extraer_facturas', check: settings.checkFacturas },
        { id: 'turbo_step3_retenciones', check: settings.checkRetenciones },
        { id: 'turbo_step4_extraer_retenciones', check: settings.checkRetenciones },
        { id: 'turbo_step5_notas_credito', check: settings.checkNC },
        { id: 'turbo_step6_extraer_notas_credito', check: settings.checkNC }
    ];

    const currentIndex = currentStep ? sequence.findIndex(s => s.id === currentStep) : -1;
    for (let i = currentIndex + 1; i < sequence.length; i++) {
        if (sequence[i].check) return sequence[i].id;
    }
    return 'FIN_TURBO';
}

// AL CARGAR EL SCRIPT (RECARGA DE PAGINA)
SafeStorage.get(null).then(async (items) => {
    if (items.pendingAction) {
        // SEGURIDAD ELITE: No ejecutar NADA si estamos en la página de login (evitar bucles antes de entrar)
        const isLoginPage = window.location.href.includes('auth/realms/Internet/protocol/openid-connect/auth') ||
            document.getElementById('kc-login') ||
            document.querySelector('form[action*="login"]');

        if (isLoginPage && (items.pendingAction === 'startIvaNavigation' || items.pendingAction.includes('turbo'))) {
            console.log('🛑 SRI Assistant: Detectado Login. Esperando a que el usuario ingrese...');
            return;
        }

        console.log('🔄 Recuperando estado pendiente:', items);
        const ghostData = await GhostMemory.getData();
        // ELITE FIX: El orden de spread importa. 'items' contiene la acción fresca
        // y el workflowPeriod actual; debe sobrescribir a ghostData (memoria histórica).
        await ejecutarAccionPendiente({ ...ghostData, ...items });
    }
});

async function ejecutarAccionPendiente(items) {
    if (!items || !items.pendingAction) return;

    // ELITE v10.5: TIMESTAMP CHECK (STALE ACTION PROTECTION)
    // Reducido de 15 min a 2 min por petición del usuario para evitar que se vuelva "loco"
    if (items.actionTimestamp) {
        const diff = Date.now() - items.actionTimestamp;
        if (diff > 120000) { // 2 minutos (120,000 ms)
            console.log(`💀 Acción Caducada detectada (${items.pendingAction}, ${Math.round(diff / 1000)}s old). Limpiando...`);
            await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod', 'sriAutomationPaused']);
            return;
        }
    } else {
        // Si no tiene timestamp, asumimos que es legacy o muy vieja, limpiamos por seguridad si estamos en una página "semilla"
        // como el inicio o login, para evitar sustos.
        if (window.location.href.includes('inicio.jsf') || window.location.href.includes('login')) {
            console.log('💀 Acción Legacy sin timestamp en Inicio. Limpiando...');
            await SafeStorage.remove(['pendingAction']);
            return;
        }
    }

    // ELITE v9.6: Verificar consistencia de sesión (Evitar fantasmas de usuarios anteriores)
    if (!(await verifySessionConsistency())) return;

    // Detector de Sesión Muerta / Login - CRITICO
    if (!(await checkSessionAlive())) {
        const url = window.location.href.toLowerCase();
        // ... (lógica existente de login/error)
        if (url.includes('/auth/realms/') || url.includes('login')) {
            console.log('🔒 Esperando login del usuario...');
            // Si estamos en login, es mejor limpiar acciones pendientes viejas para no asustar al entrar
            // await chrome.storage.local.remove(['pendingAction']); // Opcional: Limpiar si se prefiere
            return;
        }
        // ...
        return;
    }

    console.log(`🔎 Acción pendiente detectada: ${items.pendingAction}`);

    // Esperar a que el panel se inicialice COMPLETAMENTE
    let retries = 0;
    while ((!window.sriAssistant || !window.sriAssistant.container) && retries < 20) {
        await sleep(200);
        retries++;
    }

    // ELITE v10.3: SAFETY STOP BYPASS
    // Si la acción fue iniciada intencionalmente por el usuario (click en botón), saltamos la confirmación.
    const shouldVerify = !items.skipSafetyCheck;

    if (window.sriAssistant && shouldVerify) {
        // --- INTERCEPTOR DE RECUPERACIÓN (Safety Stop) ---
        // Preguntar si desea continuar antes de arrancar ciegamente
        const shouldContinue = await new Promise(resolve => {
            let countdown = 5;
            let autoStart = true;

            window.sriAssistant.showContextCard({
                title: '🔄 Tarea Pendiente',
                subtitle: 'Recuperando Sesión',
                message: `Tarea pausada: <b>${items.pendingAction}</b>.<br>Iniciando en <b id="elite-countdown">${countdown}</b>s...`,
                icon: '⏱️',
                actionText: '⛔ DETENER AHORA',
                onAction: async () => {
                    autoStart = false;
                    await SafeStorage.remove(['pendingAction', 'workflowPeriod']);
                    window.sriAssistant.showEliteToast({ title: '🛑 Detenido', msg: 'Tarea cancelada.' });
                    window.sriAssistant.setWorking(false);
                    resolve(false);
                }
            });

            // Timer
            const timer = setInterval(() => {
                if (!autoStart) { clearInterval(timer); return; }
                countdown--;
                const elCount = document.getElementById('elite-countdown');
                if (elCount) elCount.innerText = countdown;

                if (countdown <= 0) {
                    clearInterval(timer);
                    const card = document.getElementById('sri-context-card');
                    if (card) card.remove();
                    window.sriAssistant.contextCard = null;
                    resolve(true); // Auto-arranque
                }
            }, 1000);
        });

        if (!shouldContinue) return; // ABORTAR SI USUARIO CANCELÓ
    }

    if (window.sriAssistant && window.sriAssistant.container) {
        // --- ELITE SENSE: Verificar que el cliente no haya cambiado antes de automatizar ---
        if (window.sriAssistant.checkRucChange) {
            await window.sriAssistant.checkRucChange();
        }

        window.sriAssistant.setWorking(true);
        window.sriAssistant.toggleMinimize(true);
    }

    // detector de pausa persistente
    const paused = await isPaused();
    if (paused) {
        console.log('⏸️ El sistema está pausado. No se retomarán acciones pendientes.');
        if (window.sriAssistant) {
            window.sriAssistant.isPaused = true;
            window.sriAssistant.render();
        }
        return;
    }

    // --- WORKFLOW TURBO (CICLO COMPLETO) ---
    let currentAction = items.pendingAction;
    if (currentAction?.startsWith('turbo_')) {
        console.log(`🚀 MODO TURBO (Local State): ${currentAction}`);

        // Fase 1: Configurar Búsqueda Facturas
        if (currentAction === 'turbo_step1_facturas') {
            const searchRes = await autoLlenarBusqueda({
                ...items.workflowPeriod,
                tipoComprobante: 'Factura',
                autoClickConsultar: true,
                nextStep: 'turbo_step2_extraer_facturas'
            });

            if (searchRes.noData) {
                console.log('ℹ️ No hay Facturas para este periodo.');
                await GhostMemory.set('facturas', { totalFacturas: 0, iva15: { cantidad: 0 }, iva0: { cantidad: 0 } });
                const nextAction = getNextTurboStep('turbo_step2_extraer_facturas', items);
                if (nextAction === 'FIN_TURBO') {
                    currentAction = 'FIN_TURBO';
                } else {
                    await SafeStorage.set({ pendingAction: nextAction, actionTimestamp: Date.now() });
                    window.location.reload();
                    return;
                }
            } else {
                currentAction = 'turbo_step2_extraer_facturas';
            }
        }

        // Fase 2: Extraer Facturas
        if (currentAction === 'turbo_step2_extraer_facturas') {
            await waitFor(() => document.querySelectorAll('td').length > 5 && document.body.innerText.includes('RUC'), 20000, 'Tabla Facturas');
            if (window.sriAssistant) window.sriAssistant.log('📊 Extrayendo facturas automáticamente...');
            const res = await extraerTodasLasFacturas();
            await GhostMemory.set('facturas', res);

            const nextAction = getNextTurboStep('turbo_step2_extraer_facturas', items);
            await SafeStorage.set({
                pendingAction: nextAction,
                actionTimestamp: Date.now()
            });

            if (nextAction === 'FIN_TURBO') {
                currentAction = 'FIN_TURBO';
            } else {
                window.location.reload();
                return;
            }
        }

        // Fase 3: Configurar Búsqueda Retenciones
        if (currentAction === 'turbo_step3_retenciones') {
            const searchRes = await autoLlenarBusqueda({
                ...items.workflowPeriod,
                tipoComprobante: 'Retencion',
                autoClickConsultar: true,
                nextStep: 'turbo_step4_extraer_retenciones'
            });

            if (searchRes.noData) {
                console.log('ℹ️ No hay retenciones para este periodo.');
                await GhostMemory.set('retenciones', { totalRetenciones: 0, ivaRetenido: { total: 0 }, rentaRetenida: { total: 0 }, listaNumeros: [] });

                const nextAction = getNextTurboStep('turbo_step4_extraer_retenciones', items);
                if (nextAction === 'FIN_TURBO') {
                    currentAction = 'FIN_TURBO';
                } else {
                    await SafeStorage.set({ pendingAction: nextAction, actionTimestamp: Date.now() });
                    setTimeout(() => window.location.reload(), 2000);
                    return;
                }
            } else {
                currentAction = 'turbo_step4_extraer_retenciones';
            }
        }

        // Fase 4: Extraer Retenciones
        if (currentAction === 'turbo_step4_extraer_retenciones') {
            await waitFor(() => document.querySelectorAll('td').length > 5 && document.body.innerText.includes('Comprobante'), 10000, 'Tabla Retenciones');
            if (window.sriAssistant) window.sriAssistant.log('📊 Extrayendo retenciones automáticamente...');
            const res = await extraerTodasLasRetenciones();
            await GhostMemory.set('retenciones', res);

            const nextAction = getNextTurboStep('turbo_step4_extraer_retenciones', items);
            await SafeStorage.set({
                pendingAction: nextAction,
                actionTimestamp: Date.now()
            });

            if (nextAction === 'FIN_TURBO') {
                currentAction = 'FIN_TURBO';
            } else {
                window.location.reload();
                return;
            }
        }

        // Fase 5: Configurar Búsqueda Notas de Crédito
        if (currentAction === 'turbo_step5_notas_credito') {
            const searchRes = await autoLlenarBusqueda({
                ...items.workflowPeriod,
                tipoComprobante: 'Nota de Crédito',
                autoClickConsultar: true,
                nextStep: 'turbo_step6_extraer_notas_credito'
            });

            if (searchRes.noData) {
                console.log('ℹ️ No hay Notas de Crédito para este periodo.');
                await GhostMemory.set('notasCredito', { totalNotas: 0, iva: { total: 0 }, totalGeneral: 0 });
                currentAction = 'FIN_TURBO';
            } else {
                currentAction = 'turbo_step6_extraer_notas_credito';
            }
        }

        // Fase 6: Extraer Notas de Crédito (NUEVO)
        if (currentAction === 'turbo_step6_extraer_notas_credito') {
            await waitFor(() => document.querySelectorAll('td').length > 5 && document.body.innerText.includes('RUC'), 10000, 'Tabla Notas Crédito');
            if (window.sriAssistant) window.sriAssistant.log('📊 Extrayendo Notas de Crédito automáticamente...');
            const res = await extraerTodasLasNotasCredito();
            await GhostMemory.set('notasCredito', res);

            await SafeStorage.remove(['pendingAction']);
            currentAction = 'FIN_TURBO';
        }

        if (currentAction === 'FIN_TURBO') {
            // ELITE BULK: Manejar transición entre meses
            if (items.bulkFlow && items.bulkFlow.active) {
                const resultsStorage = await GhostMemory.getData();
                const currentMonthIndex = items.bulkFlow.currentIndex;

                // Guardar resultados del mes actual en el acumulador bulk
                const newResults = [...(items.bulkFlow.results || [])];
                newResults.push({
                    month: items.bulkFlow.months[currentMonthIndex],
                    data: resultsStorage
                });

                // ELITE FIX: Guardar el nuevo estado del bulkflow para usarlo en esta misma ejecución si es el fin
                items.bulkFlow.results = newResults;

                const nextIndex = currentMonthIndex + 1;
                if (nextIndex < items.bulkFlow.months.length) {
                    const nextMonth = items.bulkFlow.months[nextIndex];
                    const nextFirstStep = getNextTurboStep(null, { ...items, bulkFlow: { ...items.bulkFlow, results: newResults } });

                    if (window.sriAssistant) {
                        window.sriAssistant.log(`🌔 Mes ${items.bulkFlow.months[currentMonthIndex]} completado. Saltando a mes ${nextMonth}...`);
                    }

                    await SafeStorage.set({
                        workflowPeriod: { ...items.workflowPeriod, monthIndex: nextMonth },
                        bulkFlow: { ...items.bulkFlow, currentIndex: nextIndex, results: newResults },
                        pendingAction: nextFirstStep,
                        actionTimestamp: Date.now()
                    });

                    // Limpiar memoria temporal para el siguiente mes
                    await GhostMemory.clearCurrent();

                    setTimeout(() => window.location.reload(), 2000);
                    return;
                } else {
                    // FIN DEL BULK TOTAL
                    console.log('🏆 FIN DE EXTRACCIÓN MASIVA.');
                    if (window.sriAssistant) window.sriAssistant.log('🏆 FIN DE EXTRACCIÓN MASIVA.');

                    // Actualizar para el bloque de agregación mas adelante
                    items.pendingAction = 'FIN_TURBO_BULK';
                    items.bulkFlow.active = false;

                    await SafeStorage.set({
                        bulkFlow: { ...items.bulkFlow, results: newResults, active: false },
                        pendingAction: 'FIN_TURBO_BULK'
                    });
                    currentAction = 'FIN_TURBO_BULK';
                }
            }

            if (currentAction === 'FIN_TURBO') {
                await SafeStorage.remove(['pendingAction']);
                const storage = await SafeStorage.get(['autoDeclaration']);
                const isAuto = storage.autoDeclaration === true;

                if (window.sriAssistant) {
                    window.sriAssistant.setWorking(false);
                    window.sriAssistant.log(isAuto ? '🚀 DECLARACIÓN: Extracción Completada.' : '📊 REPORTE: Extracción Finalizada.');
                    window.sriAssistant.updateSummary();

                    if (!isAuto) {
                        // Si es reporte, mostrar un aviso de éxito sin sugerir navegación
                        window.sriAssistant.showEliteToast({
                            title: '📊 Reporte Generado',
                            msg: 'Los datos han sido extraídos. Puedes ver el resumen en el panel o exportar a Excel.',
                            duration: 5000
                        });
                    }
                }

                if (isAuto && window.sriAssistant) {
                    // --- TRANSICIÓN DIRECTA A FASE 2: NAVEGACIÓN (ELITE AUTOMATION) ---
                    // En lugar de solo sugerir, disparamos la navegación si es modo auto
                    window.sriAssistant.log('🚀 FASE 1 OK: Saltando a Navegación del Formulario...');
                    setTimeout(() => {
                        window.sriAssistant.runUnifiedWorkflow('NAVIGATE_AND_FILL', items.workflowPeriod);
                    }, 1000);
                }
                return;
            }
        }
    }

    if (currentAction === 'FIN_TURBO_BULK' || items.pendingAction === 'FIN_TURBO_BULK') {
        const bulkResults = items.bulkFlow?.results || [];

        // Agregación Maestra
        const totals = {
            facturasCount: 0,
            iva15: 0,
            iva0: 0,
            montoIva: 0, // NEW: Sum of IVA from invoices
            totalFacturas: 0, // NEW: Sum of (Base + IVA)
            retCount: 0,
            retIva: 0,
            retIvaBase: 0,
            retRenta: 0,
            retRentaBase: 0,
            ncCount: 0,
            ncIva15: 0,
            ncIva0: 0,
            ncIva: 0, // NEW: Sum of IVA from NC
            ncTotal: 0
        };

        bulkResults.forEach(res => {
            const d = res.data;
            if (d.facturas) {
                totals.facturasCount += d.facturas.totalFacturas || 0;
                totals.iva15 += parseDecimal(d.facturas.iva15?.baseImponible || 0);
                totals.iva0 += parseDecimal(d.facturas.iva0?.baseImponible || 0);
                totals.montoIva += parseDecimal(d.facturas.iva15?.montoIva || 0);
                totals.totalFacturas += parseDecimal(d.facturas.iva15?.total || 0) + parseDecimal(d.facturas.iva0?.total || 0);
            }
            if (d.retenciones) {
                totals.retCount += d.retenciones.totalRetenciones || 0;
                totals.retIva += parseDecimal(d.retenciones.ivaRetenido?.total || 0);
                totals.retIvaBase += parseDecimal(d.retenciones.ivaRetenido?.baseTotal || 0);
                totals.retRenta += parseDecimal(d.retenciones.rentaRetenida?.total || 0);
                totals.retRentaBase += parseDecimal(d.retenciones.rentaRetenida?.baseTotal || 0);
            }
            if (d.notasCredito) {
                totals.ncCount += d.notasCredito.totalNotas || 0;
                totals.ncIva15 += parseDecimal(d.notasCredito.iva15?.baseImponible || 0);
                totals.ncIva0 += parseDecimal(d.notasCredito.iva0?.baseImponible || 0);
                totals.ncIva += parseDecimal(d.notasCredito.iva?.total || 0);
                totals.ncTotal += parseDecimal(d.notasCredito.totalGeneral || 0);
            }
        });

        if (window.sriAssistant) {
            window.sriAssistant.setWorking(false);
            window.sriAssistant.log('🏆 EXTRACCIÓN MASIVA FINALIZADA.');
        }

        showBulkEliteToast(totals, items.bulkFlow, items.workflowPeriod);

        await SafeStorage.remove(['pendingAction', 'bulkFlow', 'sriAutomationPaused']);
        return;
    }

    // CASO 2: Navegación al Formulario IVA Wizard (INDESTRUCTIBLE v9.9)
    if (items.pendingAction === 'startIvaNavigation') {
        console.log(`🔎 Check Navegación: Periodo=${JSON.stringify(items.workflowPeriod)} Host=${window.location.hostname}`);

        // Auto-reparación: Si no hay periodo, usar mes anterior por defecto
        let targetPeriod = items.workflowPeriod;
        if (!targetPeriod) {
            console.warn('⚠️ No se encontró workflowPeriod. Usando Mes Anterior por defecto.');
            const today = new Date();
            // Mes anterior (handle January edge case automatically)
            const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            targetPeriod = {
                year: prevMonth.getFullYear(),
                monthIndex: prevMonth.getMonth() // 0-11
            };
        }

        if (window.location.hostname.includes('sri.gob.ec')) {
            console.log('🔄 Ejecutando: Navegación IVA 2011 hacia', targetPeriod);
            // Asegurar que la función existe antes de llamar
            if (typeof ejecutarNavegacionDeclaracion === 'function') {
                ejecutarNavegacionDeclaracion(targetPeriod);
            } else {
                console.error('❌ CRÍTICO: ejecutarNavegacionDeclaracion no está definida.');
                // Fallback: Recarga forzada para intentar cargar scripts de nuevo? No, mejor avisar.
                if (window.sriAssistant) window.sriAssistant.showEliteToast({ title: 'Error Crítico', msg: 'Falló la carga del motor de navegación.' });
            }
        } else {
            console.warn('⚠️ Hostname no coincide con SRI:', window.location.hostname);
        }
    }

    // Fase N: Cierre de ciclo individual o manual (Ajustado a secuencia standard)
    if (items.pendingAction === 'turbo_step3_retenciones' || items.pendingAction === 'turbo_step5_notas_credito') {
        const type = items.pendingAction === 'turbo_step3_retenciones' ? 'Retencion' : 'Nota de Crédito';
        console.log(`🔄 Iniciando búsqueda individual de ${type}...`);

        await autoLlenarBusqueda({
            ...items.workflowPeriod,
            tipoComprobante: type,
            autoClickConsultar: true
        });

        // Determinar siguiente paso o finalizar
        if (items.pendingAction === 'turbo_step3_retenciones') {
            await SafeStorage.set({ pendingAction: 'turbo_step4_extraer_retenciones', actionTimestamp: Date.now() });
        } else {
            await SafeStorage.set({ pendingAction: 'turbo_step6_extraer_notas_credito', actionTimestamp: Date.now() });
        }
    }

    // Otros casos de legado...
    if (items.pendingAction === 'fillSearchFacturas' || items.pendingAction === 'fillSearchRetenciones' || items.pendingAction === 'autoFillSearch') {
        const type = items.pendingAction.includes('Retencion') ? 'Retencion' : 'Factura';
        const period = items.workflowPeriod || { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 };

        console.log(`🔄 Ejecutando: Llenar Búsqueda ${type}`);
        await autoLlenarBusqueda({ ...period, tipoComprobante: type, autoClickConsultar: true });
        await SafeStorage.remove(['pendingAction']);
        if (window.sriAssistant) window.sriAssistant.setWorking(false);
    }
}


// Helper de pausa persistente
async function isPaused() {
    const data = await SafeStorage.get('sriAutomationPaused');
    return !!data.sriAutomationPaused;
}



// ============================================
// MODULO DE NAVEGACION Y BUSQUEDA
// ============================================

async function autoLlenarBusqueda(data) {
    // ELITE v14.1: Protección de Fechas Futuras (Global)
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();

    if (data && (parseInt(data.year) > currYear || (parseInt(data.year) === currYear && parseInt(data.monthIndex) >= currMonth))) {
        console.error('🚫 Bloqueo de Seguridad: Intento de búsqueda en periodo futuro/abierto.');
        if (window.sriAssistant) window.sriAssistant.log('🚫 Error: No se pueden extraer datos de periodos futuros o el mes en curso.');
        return { tableFound: false, error: 'Future date' };
    }

    console.log('🚀 Iniciando configuración de búsqueda con:', data);

    // 1. Verificar si estamos en la página correcta, si no, navegar
    const urlActual = window.location.href;
    if (!urlActual.includes('comprobantesRecibidos.jsf')) {
        console.log('🔄 No estamos en Comprobantes Recibidos, intentando navegar...');
        const navegado = await navegarAComprobantes();
        if (!navegado) {
            throw new Error('No se pudo navegar automáticamante. Por favor ve a "Comprobantes electrónicos recibidos" manualmente.');
        }
        await sleep(2000);
    }

    // Si solo queríamos navegar, terminamos aquí
    if (data && data.onlyNavigate) {
        console.log('✅ Navegación completada (modo solo navegación).');
        return { periodo: 'Navegación', tipo: '-' };
    }

    // 2. Extraer año y mes del payload o calcular (fallback)
    let anio, mesIndex;

    if (data && data.year) {
        anio = data.year;
        mesIndex = data.monthIndex;
    } else {
        // Fallback a lógica anterior (mes anterior)
        const ahora = new Date();
        const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
        anio = mesAnterior.getFullYear();
        mesIndex = mesAnterior.getMonth();
    }

    if (!anio) throw new Error('Año no definido para la búsqueda');

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesNombre = meses[mesIndex];
    console.log(`📅 Configurando para: ${mesNombre} ${anio}`);

    // 3. Interactuar con los Selects (ID-Based v12.0)
    console.log('🎯 Detectando selectores de búsqueda...');

    // Función helper para obtener selectores por ID (robusto con escaping de JSF)
    const getSelect = (id) => {
        return document.getElementById(id) ||
            document.querySelector(`select[id$="${id.split(':').pop()}"]`);
    };

    const selAnio = getSelect('frmPrincipal:ano') || document.querySelectorAll('select')[0];
    const selMes = getSelect('frmPrincipal:mes') || document.querySelectorAll('select')[1];
    const selDia = getSelect('frmPrincipal:dia') || document.querySelectorAll('select')[2];
    const selTipo = getSelect('frmPrincipal:tipoComprobante') || document.querySelectorAll('select')[3];

    if (!selAnio || !selMes) {
        throw new Error('No se encontraron los selectores de Año/Mes. Verifica que la página cargó bien.');
    }

    // A. Seleccionar AÑO
    console.log(`📅 Seleccionando año: ${anio}`);
    selAnio.value = anio.toString();
    selAnio.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800); // Esperar que JSF/Ajax refresque el mes

    // B. Seleccionar MES (con reintentos por Ajax)
    let mesSeleccionado = false;
    for (let attempt = 0; attempt < 10; attempt++) {
        const currentSelMes = getSelect('frmPrincipal:mes') || document.querySelectorAll('select')[1];
        if (!currentSelMes) { await sleep(300); continue; }

        const opciones = Array.from(currentSelMes.options);
        const opcionMes = opciones.find(opt => {
            const txt = opt.text.trim().toUpperCase();
            return txt === mesNombre.toUpperCase() || txt.includes(mesNombre.toUpperCase());
        });

        if (opcionMes) {
            console.log(`✅ Mes hallado en intento ${attempt + 1}: ${mesNombre}`);
            currentSelMes.value = opcionMes.value;
            currentSelMes.dispatchEvent(new Event('input', { bubbles: true }));
            currentSelMes.dispatchEvent(new Event('change', { bubbles: true }));

            // VERIFICACIÓN ELITE: Esperar y re-verificar que no se haya reseteado por Ajax tardío
            await sleep(600);
            if (currentSelMes.value !== opcionMes.value) {
                console.warn('⚠️ El mes se reseteó tras la selección. Reintentando...');
                currentSelMes.value = opcionMes.value;
                currentSelMes.dispatchEvent(new Event('change', { bubbles: true }));
            }

            mesSeleccionado = true;
            break;
        }
        await sleep(500);
    }
    if (!mesSeleccionado) console.warn(`⚠️ No se pudo seleccionar el mes ${mesNombre}.`);

    // C. Seleccionar DIA -> "Todos"
    if (selDia) {
        const opciones = Array.from(selDia.options);
        const opcionTodos = opciones.find(opt => opt.text.trim().toLowerCase().includes('todos'));
        if (opcionTodos) {
            selDia.value = opcionTodos.value;
        } else {
            selDia.selectedIndex = 0;
        }
        selDia.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);
    }

    // D. Tipo Comprobante
    let tipoDeseado = 'Factura';
    if (data.tipoComprobante === 'Retencion') tipoDeseado = 'Comprobante de Retención';
    if (data.tipoComprobante === 'Nota de Crédito') tipoDeseado = 'Notas de Crédito';

    if (selTipo) {
        const opciones = Array.from(selTipo.options);
        const opcion = opciones.find(opt =>
            opt.text.toLowerCase().includes(tipoDeseado.toLowerCase()) ||
            (tipoDeseado === 'Retencion' && opt.text.toLowerCase().includes('retencion')) ||
            (tipoDeseado === 'Notas de Crédito' && opt.text.toLowerCase().includes('nota'))
        );

        if (opcion) {
            console.log(`✅ Tipo documento: ${opcion.text}`);
            selTipo.value = opcion.value;
            selTipo.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    await sleep(600);

    // CLICK EN BOTÓN CONSULTAR (Opcional según autoClickConsultar)
    if (data.autoClickConsultar === false) {
        console.log('✅ Filtros configurados. Esperando click manual en Consultar.');
        return { tableFound: false };
    }

    console.log('🔎 Buscando botón Consultar...');
    const botones = Array.from(document.querySelectorAll('button, input[type="submit"], span.ui-button-text'));
    const btnConsultar = botones.find(b => {
        const txt = (b.innerText || b.value || b.textContent || "").toUpperCase();
        return txt.includes('CONSULTAR') && b.offsetParent !== null;
    });

    if (btnConsultar) {
        // En modo Turbo, guardamos el siguiente estado ANTES de clickear por si hay reload
        if (data.nextStep) {
            console.log(`💾 Guardando siguiente paso Turbo: ${data.nextStep}`);
            await SafeStorage.set({
                pendingAction: data.nextStep,
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });
        }

        console.log('✅ Click en Consultar', btnConsultar);

        // ELITE v12.6: Esperar reCAPTCHA antes de disparar el evento
        await waitForRecaptchaReady();
        await sleep(500); // Pequeño margen de seguridad extra

        // ELITE v12.7: Limpiar mensajes de growl previos para evitar falsos positivos de "no hay datos"
        const oldMessages = document.querySelectorAll('.ui-growl-item-container, .ui-messages-info, .ui-messages-warn');
        oldMessages.forEach(m => m.remove());

        btnConsultar.click();
        // Nota: El SRI a veces requiere el click en el span interno o en el botón padre, 
        // pero disparar ambos simultáneamente puede causar race conditions en reCAPTCHA.
        // Solo disparamos el padre si el actual no es el botón principal.
        if (btnConsultar.tagName !== 'BUTTON' && btnConsultar.parentElement && btnConsultar.parentElement.tagName === 'BUTTON') {
            btnConsultar.parentElement.click();
        }

        // ESPERAR Y VERIFICAR SI CARGA LA TABLA (SKIP CAPTCHA) - Lógica de Polling Mejora
        console.log('⏳ Esperando posible carga de tabla (Polling)...');
        let tableFound = false;

        // Intentar detectar durante 30 segundos (60 intentos x 500ms)
        for (let i = 0; i < 60; i++) {
            await sleep(500);

            // FAST-FAIL: Verificar si el SRI responde con "No hay datos"
            const msgError = document.querySelector('.ui-messages-warn-detail, .ui-growl-item, #idMensajeConsulta');
            const textoMensaje = (msgError?.textContent || document.body.innerText).toUpperCase();
            if (textoMensaje.includes('NO EXISTEN DATOS') || textoMensaje.includes('NO SE ENCONTRARON')) {
                console.warn('⚡ [Fast-Fail] El SRI reporta que no hay datos. Abortando polling.');
                // ELITE v12.9: NO removemos pendingAction aquí, dejamos que el flujo Turbo decida el siguiente paso.
                return { tableFound: false, noData: true };
            }

            // Estrategia 3: Heurística "Bruta" (Texto y celdas)
            const numeroCeldas = document.querySelectorAll('td').length;
            const textoBody = document.body.innerText;
            const tieneEncabezados = textoBody.includes('RUC') && (textoBody.includes('Razón social') || textoBody.includes('Clave de Acceso'));

            // Detección de Tabla Vacía (PrimeFaces empty message)
            const emptyTable = document.querySelector('.ui-datatable-empty-message');
            if (emptyTable && emptyTable.offsetParent !== null) {
                console.warn('⚡ [Fast-Fail] Tabla vacía encontrada.');
                return { tableFound: false, noData: true };
            }

            // Si hay muchas celdas (>10) y texto de encabezado, O filas específicas
            if ((numeroCeldas > 10 && tieneEncabezados) ||
                document.querySelector('.ui-datatable-data tr:not(.ui-datatable-empty-message)') ||
                document.querySelector('tr[role="row"]:not(.ui-datatable-empty-message)')) {

                console.log(`✅ Tabla detectada por heurística (Celdas: ${numeroCeldas}).`);

                // ELITE v13.0: Intentar maximizar tamaño de página para velocidad rayo
                await optimizarTamanoPagina();

                tableFound = true;
                break;
            }
        }

        if (tableFound) {
            console.log('✅ Tabla presente. Auto-Skipping Captcha.');
            return { periodo: `${mesNombre} ${anio}`, tipo: 'Documento', tableFound: true };
        }

    } else {
        console.warn('⚠️ No se encontró el botón Consultar');
    }

    // Si llegamos aquí después del polling, asumimos que no hubo resultados para no trabar el Turbo
    console.warn('⌛ Polling finalizado sin detectar tabla. Asumiendo que no hay datos para continuar.');
    return { periodo: `${mesNombre} ${anio}`, tipo: 'Documento', tableFound: false, noData: true };
}

// Nueva función de navegación
const SRI_RECIBIDOS_URL = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf?&contextoMPT=https://srienlinea.sri.gob.ec/tuportal-internet&pathMPT=Facturaci%F3n%20Electr%F3nca&actualMPT=Comprobantes%20electr%F3nicos%20recibidos%20&linkMPT=%2Fcomprobantes-electronicos-internet%2Fpages%2Fconsultas%2Frecibidos%2FcomprobantesRecibidos.jsf%3F&esFavorito=S';

async function navegarAComprobantes() {
    const url = window.location.href.toLowerCase();
    // Si estamos en login, ni lo intentamos
    if (url.includes('/auth/realms/') || url.includes('login')) {
        console.warn('🔒 Navegación abortada: Estamos en la página de login.');
        return false;
    }

    console.log('🔎 Buscando menú de navegación...');

    // DETECCIÓN ROBUSTA DE SESIÓN FRÍA
    const hasMenu = document.querySelector('.ui-menuitem, #cssmenu, .mostrarMenu');
    if (!hasMenu && !url.includes('tuportal-internet')) {
        console.log('❄️ Sesión fría (sin menú detectable). "Calentando" vía portal...');
        window.location.href = 'https://srienlinea.sri.gob.ec/tuportal-internet/inicio.jsf';
        return false;
    }

    const menuItems = [
        { text: 'Facturación Electrónica', matches: ['facturación electrónica', 'facturacion electronica', 'comprobantes electrónicos'] },
        { text: 'Comprobantes recibidos', matches: ['comprobantes electrónicos recibidos', 'comprobantes electronicos recibidos'] }
    ];

    // Intentar encontrar el submenu directo por texto (tolerancia a espacios/mayusculas)
    // Filtro importante: No debe ser el botón naranja de "Consultas Públicas"
    const allLinks = Array.from(document.querySelectorAll('a, span, .ui-menuitem-text, .mostrarMenu'));
    let targetLink = allLinks.find(el => {
        const txt = el.textContent.trim().toLowerCase();
        if (txt.includes('consultas públicas') || txt.includes('consultas publicas')) return false;
        return txt.includes('comprobantes electrónicos recibidos') ||
            txt.includes('comprobantes electronicos recibidos');
    });

    if (targetLink && targetLink.offsetParent !== null) {
        console.log('✅ Enlace directo visible, clickeando...');
        clickElement(targetLink, 'Enlace Comprobantes');
        return true;
    }

    // --- PASO 1: BUSCAR Y CLICK EN PADRE ("Facturación Electrónica") ---
    console.log('🔎 [Paso 1] Buscando menú PADRE: Facturación Electrónica...');
    let parentMenu = allLinks.find(el => {
        const txt = el.textContent.trim().toLowerCase();
        // Excluir Consultas Públicas y solo buscar el padre exacto
        if (txt.includes('consultas públicas') || txt.includes('consultas publicas')) return false;
        return txt === 'facturación electrónica' || txt === 'facturacion electronica';
    });

    if (parentMenu) {
        console.log('📂 Clickeando menú PADRE:', parentMenu.textContent);
        clickElement(parentMenu, 'Menú Facturación');

        // Esperamos un momento a que se despliegue el submenu (AJAX)
        await sleep(1000);

        // --- PASO 2: BUSCAR Y CLICK EN HIJO ("Comprobantes Recibidos") ---
        console.log('🔎 [Paso 2] Buscando menú HIJO: Comprobantes recibidos...');

        // Usamos waitFor para ser más robustos si el AJAX tarda
        const success = await waitFor(() => {
            // Buscamos en TODOS los elementos que tengan texto, por si acaso
            const currentLinks = Array.from(document.querySelectorAll('a, span, li, .ui-menuitem-text, .ui-panelmenu-header-link, .ui-menuitem-link'));

            // Log de depuración: ver qué opciones ve el bot
            console.log(`🔎 Analizando ${currentLinks.length} elementos de menú...`);

            const subLink = currentLinks.find(el => {
                const txt = el.textContent.toLowerCase().trim();
                // Búsqueda más flexible
                return (txt.includes('comprobantes') && txt.includes('recibidos')) ||
                    (txt.includes('electrónicos') && txt.includes('recibidos'));
            });

            if (subLink) {
                console.log('✅ Submenú encontrado:', subLink.textContent.trim());
                // Si es un LI, buscamos el link adentro
                const actualClickable = subLink.tagName === 'A' ? subLink : subLink.querySelector('a') || subLink;
                console.log('🎯 Clickeando submenú final...');
                clickElement(actualClickable, 'Enlace Comprobantes');
                return true;
            }
            return false;
        }, 10000, 'Submenú Recibidos');

        if (success) return true;
    }

    console.warn('❌ No se pudo navegar mediante el menú lateral.');

    // ULTIMO RECURSO: Navegación Directa Forzada
    console.log('🚀 Fallback Final: Ejecutando redirección directa segura...');
    window.location.href = SRI_RECIBIDOS_URL;
    return true;
}

async function autoLlenarPeriodoFiscal(data) {
    console.log('📅 Auto-llenando Periodo Fiscal...');

    let anio, mesIndex;
    if (data && data.year) {
        anio = data.year;
        mesIndex = data.monthIndex;
    } else {
        const fechaActual = new Date();
        const mesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 1, 1);
        anio = mesAnterior.getFullYear();
        mesIndex = mesAnterior.getMonth();
    }

    const valorPeriodo = `${(mesIndex + 1).toString().padStart(2, '0')}/${anio}`;
    console.log(`   🎯 Periodo objetivo: ${valorPeriodo}`);

    let camposLlenados = 0;

    // 2. Llenar Selección (Obligación)
    let obligacionSeleccionada = false;

    // Buscar select de Obligación
    const selects = document.querySelectorAll('select');
    for (const s of selects) {
        for (const opt of s.options) {
            if (opt.text.toUpperCase().includes('DECLARACION DE IVA') || opt.value.includes('2011')) {
                if (s.value !== opt.value) {
                    s.value = opt.value;
                    s.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('   ✅ Obligación seleccionada');
                    obligacionSeleccionada = true;
                } else {
                    console.log('   ℹ️ Obligación ya estaba seleccionada');
                    obligacionSeleccionada = true;
                }
                break;
            }
        }
        if (obligacionSeleccionada) break;
    }

    if (obligacionSeleccionada) {
        console.log('   ⏳ Esperando actualización de campos (2.5s)...');
        await sleep(2500); // Esperar reload de JSF
    }

    // 3. Llenar Periodo
    console.log('   🔍 Buscando campo Periodo...');
    let inputPeriodo = null;

    // Estrategia 1: XPath exacto (Label -> Input)
    const xpaths = [
        "//label[contains(text(), 'Período')]/following::input[1]",
        "//label[contains(text(), 'Periodo')]/following::input[1]",
        "//span[contains(text(), 'Período')]/following::input[1]"
    ];

    for (const xpath of xpaths) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue) {
                inputPeriodo = result.singleNodeValue;
                console.log(`   ✅ Encontrado por XPath: ${xpath}`);
                break;
            }
        } catch (e) { }
    }

    // Estrategia 2: Selectores de ID comunes en PrimeFaces (calendar inputs)
    if (!inputPeriodo) {
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const inp of inputs) {
            const id = inp.id.toLowerCase();
            const placeholder = inp.placeholder ? inp.placeholder.toLowerCase() : '';

            // "fecha", "periodo", "fiscal", o placeholder tipo fecha
            if ((id.includes('periodo') || id.includes('fecha') || id.includes('fiscal')) &&
                (placeholder.includes('/') || inp.classList.contains('hasDatepicker') || inp.className.includes('calendar'))) {
                inputPeriodo = inp;
                console.log(`   ✅ Encontrado por ID/Class: ${inp.id}`);
                break;
            }
        }
    }

    if (inputPeriodo) {
        // HACK PRIMEFACES: Simular interacción real
        inputPeriodo.focus();
        inputPeriodo.click();
        await sleep(100);

        // Intento 1: Escribir directo
        inputPeriodo.value = valorPeriodo;
        if (inputPeriodo.value !== valorPeriodo) {
            console.warn('   ⚠️ Input tiene máscara/bloqueo, intentando forzar...');
        }

        // Actualizar contadores parciales en UI
        await chrome.runtime.sendMessage({
            action: 'updateProgress',
            data: { processed: totalProcesados, total: totalFacturas }
        }).catch(() => { });
    }
}

async function extraerTodasLasFacturas() {
    console.log('Iniciando extracción de facturas...');

    const todasLasFacturas = [];
    let paginaActual = 1;

    while (true) {
        console.log('Procesando página ' + paginaActual);
        await esperarTabla();

        // ELITE v13.1: Feedback de progreso en tiempo real
        if (window.sriAssistant) {
            window.sriAssistant.log(`📄 Procesando página ${paginaActual}...`);
        }

        const facturasPagina = extraerFacturasPaginaActual();
        console.log('Extraídas ' + facturasPagina.length + ' facturas');

        if (facturasPagina.length === 0) break;

        todasLasFacturas.push(...facturasPagina);

        const hayMasPaginas = await irSiguientePagina();
        if (!hayMasPaginas) break;

        paginaActual++;
        // Reducido delay para modo Turbo
        await sleep(800);
    }

    console.log('Total: ' + todasLasFacturas.length + ' facturas');

    const resumen = calcularResumen(todasLasFacturas);
    return resumen;
}

function extraerFacturasPaginaActual() {
    console.log('🔍 DEBUG: Iniciando extraerFacturasPaginaActual');
    const facturas = [];

    // NUEVA ESTRATEGIA: Buscar tabla por encabezados de columna
    let tabla = null;
    const todasLasTablas = document.querySelectorAll('table');
    console.log(`🔍 DEBUG: Analizando ${todasLasTablas.length} tablas en la página...`);

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        // Buscar tabla que contenga los encabezados característicos de comprobantes
        if (textoEncabezados.includes('valor sin impuestos') &&
            textoEncabezados.includes('iva') &&
            textoEncabezados.includes('importe total')) {
            tabla = t;
            console.log(`✅ DEBUG: Encontrada tabla de comprobantes por encabezados: id="${t.id}", class="${t.className}"`);
            console.log(`   Encabezados: ${textoEncabezados.substring(0, 100)}...`);
            break;
        }
    }

    // Fallback: Intentar selectores tradicionales si no se encontró por encabezados
    if (!tabla) {
        console.log('🔍 DEBUG: No se encontró por encabezados, intentando selectores tradicionales...');
        tabla = document.querySelector('table[id*="dtComprobantes"]');
    }

    if (!tabla) {
        tabla = document.querySelector('table[id*="Comprobantes"]');
    }

    if (!tabla) {
        tabla = document.querySelector('.ui-datatable-tablewrapper table');
    }

    // Buscar tabla RichFaces con clase rf-dt que tenga datos de comprobantes
    if (!tabla) {
        const tablasRF = document.querySelectorAll('table.rf-dt');
        console.log(`🔍 DEBUG: Buscando entre ${tablasRF.length} tablas RichFaces...`);

        for (const t of tablasRF) {
            const primeraFila = t.querySelector('tbody tr');
            if (primeraFila) {
                const texto = primeraFila.textContent;
                // Verificar si contiene datos que parecen de comprobantes (números largos, RUC, etc)
                if (texto.match(/\d{13}/) || texto.toLowerCase().includes('factura') || texto.includes('$')) {
                    tabla = t;
                    console.log(`✅ DEBUG: Encontrada tabla RichFaces con datos de comprobantes: id="${t.id}"`);
                    break;
                }
            }
        }
    }

    console.log('🔍 DEBUG: Tabla encontrada:', tabla ? 'SÍ' : 'NO');

    if (!tabla) {
        console.error('❌ DEBUG: No se encontró tabla con ningún selector');
        console.error('⚠️ POSIBLES CAUSAS:');
        console.error('   1. No has hecho clic en el botón "Consultar" después de configurar la búsqueda');
        console.error('   2. El CAPTCHA no se resolvió correctamente');
        console.error('   3. No hay resultados para el período seleccionado');

        console.log('📊 DEBUG: Tablas encontradas en la página:');
        todasLasTablas.forEach((t, i) => {
            const headers = t.querySelectorAll('thead th, thead td');
            const headerText = Array.from(headers).map(h => h.textContent.trim()).join(', ');
            console.log(`   Tabla ${i}: id="${t.id}", class="${t.className}"`);
            if (headerText) {
                console.log(`      Headers: ${headerText.substring(0, 80)}`);
            }
        });
        return facturas;
    }

    // DETECCIÓN DINÁMICA DE COLUMNAS
    let idxValorSinImpuestos = -1;
    let idxIva = -1;
    let idxImporteTotal = -1;

    const thead = tabla.querySelector('thead');
    if (thead) {
        const headers = thead.querySelectorAll('th, td');
        headers.forEach((th, index) => {
            const texto = th.textContent.toLowerCase().trim();
            if (texto.includes('valor sin impuestos') || texto.includes('base imponible') || texto.includes('subtotal')) {
                idxValorSinImpuestos = index;
            } else if (texto.includes('iva') && !texto.includes('ret')) {
                idxIva = index;
            } else if (texto.includes('importe total') || texto.includes('total')) {
                idxImporteTotal = index;
            }
        });
        console.log(`   🎯 Columnas detectadas: SinImpuestos=${idxValorSinImpuestos}, IVA=${idxIva}, Total=${idxImporteTotal}`);
    }

    const filas = tabla.querySelectorAll('tbody tr');
    console.log('📋 DEBUG: Filas encontradas en tbody:', filas.length);

    filas.forEach((fila, idx) => {
        try {
            const celdas = fila.querySelectorAll('td');
            console.log(`   Fila ${idx}: ${celdas.length} columnas`);

            // Verificar que no sea mensaje de "no encontrado"
            const textoCompleto = fila.textContent.trim();
            if (textoCompleto.includes('No se encontraron')) {
                console.log(`   ⚠️ Fila ${idx} descartada: mensaje "No se encontraron"`);
                return;
            }

            // Necesitamos al menos 7 columnas para extraer datos básicos
            if (celdas.length < 7) {
                console.warn(`   ⚠️ Fila ${idx} descartada: solo tiene ${celdas.length} columnas (se requieren al menos 7)`);
                return;
            }

            // console.log(`   ✅ Fila ${idx} válida - Extrayendo datos...`);

            // Intentar detectar las columnas correctas
            let valorSinImpuestos, iva, importeTotal;

            // ESTRATEGIA 0: USAR INDICES DETECTADOS (Prioridad)
            if (idxValorSinImpuestos !== -1 && idxIva !== -1 && idxImporteTotal !== -1 &&
                celdas[idxValorSinImpuestos] && celdas[idxIva] && celdas[idxImporteTotal]) {

                valorSinImpuestos = parseDecimal(celdas[idxValorSinImpuestos].textContent);
                iva = parseDecimal(celdas[idxIva].textContent);
                importeTotal = parseDecimal(celdas[idxImporteTotal].textContent);

                // console.log(`      Usando índices dinámicos: SinImp=${valorSinImpuestos}, IVA=${iva}, Total=${importeTotal}`);
            }
            // Estrategia 1: Asumir estructura de 9+ columnas (fallback anterior)
            else if (celdas.length >= 9) {
                // console.log(`      Usando índices fijos (6,7,8)`);
                valorSinImpuestos = parseDecimal(celdas[6].textContent);
                iva = parseDecimal(celdas[7].textContent);
                importeTotal = parseDecimal(celdas[8].textContent);
            }
            // Estrategia 2: Buscar columnas con valores numéricos al final
            else {
                // console.log(`      Usando estrategia alternativa (últimas 3)`);
                // Las últimas 3 columnas suelen ser: Subtotal, IVA, Total
                const ultimas3 = [
                    celdas[celdas.length - 3],
                    celdas[celdas.length - 2],
                    celdas[celdas.length - 1]
                ];

                valorSinImpuestos = parseDecimal(ultimas3[0].textContent);
                iva = parseDecimal(ultimas3[1].textContent);
                importeTotal = parseDecimal(ultimas3[2].textContent);
            }

            // Validar que los valores sean razonables
            if ((!importeTotal && !valorSinImpuestos) || (importeTotal === 0 && valorSinImpuestos === 0)) {
                // console.warn(`   ⚠️ Fila ${idx} descartada: valores en 0`);
                return;
            }

            facturas.push({
                numero: idx + 1,
                rucRazon: celdas[1] ? celdas[1].textContent.trim() : 'S/N',
                valorSinImpuestos: valorSinImpuestos,
                iva: iva,
                importeTotal: importeTotal,
                tieneIva: iva > 0
            });

            console.log(`      Factura agregada: SinImp=${valorSinImpuestos}, IVA=${iva}, Total=${importeTotal}`);
        } catch (error) {
            console.error('❌ Error en fila ' + idx, error);
        }
    });

    console.log(`✅ DEBUG: Total facturas extraídas: ${facturas.length}`);
    return facturas;
}

async function extraerTodasLasRetenciones() {
    console.log("🚀 SRI Bot Content Script v4.0 - RETENCIONES FIX LOADED");
    console.log('🚀 Iniciando extracción de retenciones...');
    console.log('⚠️ MODO DEBUG ACTIVADO - Revisa la consola para detalles');

    // Usar la misma estrategia de detección por encabezados
    let tabla = null;
    const todasLasTablas = document.querySelectorAll('table');
    console.log(`🔍 DEBUG: Analizando ${todasLasTablas.length} tablas en la página...`);

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        // Buscar tabla de retenciones (tiene "clave de acceso" y "comprobante")
        if ((textoEncabezados.includes('clave de acceso') || textoEncabezados.includes('clave acceso')) &&
            (textoEncabezados.includes('comprobante') || textoEncabezados.includes('retención'))) {
            tabla = t;
            console.log(`✅ DEBUG: Encontrada tabla de retenciones por encabezados: id="${t.id}"`);
            break;
        }
    }

    // Fallback: selector tradicional
    if (!tabla) {
        console.log('🔍 DEBUG: Intentando selector tradicional...');
        tabla = document.querySelector('table[id*="dtComprobantes"]');
    }

    // FAST-FAIL: Verificar si hay mensaje de "No existen datos" antes de rendirse o esperar
    const msgWarn = document.querySelector('.ui-messages-warn-detail, .ui-messages-info-detail');
    if (msgWarn && (msgWarn.textContent.includes('No existen datos') || msgWarn.textContent.includes('No se encontraron'))) {
        console.warn('⚡ [Fast-Fail] Confirmado: No existen retenciones en este periodo.');
        return { totalRetenciones: 0, ivaRetenido: { cantidad: 0, total: 0 }, rentaRetenida: { cantidad: 0, total: 0 } };
    }

    if (!tabla) {
        console.error('❌ No se encontró tabla de retenciones');
        console.error('⚠️ Asegúrate de:');
        console.error('   1. Haber seleccionado "Comprobante de Retención" en el tipo');
        console.error('   2. Haber hecho clic en "Consultar"');
        console.error('   3. Que existan retenciones para el período');
        return { totalRetenciones: 0, ivaRetenido: { cantidad: 0, total: 0 }, rentaRetenida: { cantidad: 0, total: 0 } };
    }

    const filas = tabla.querySelectorAll('tbody tr');
    console.log('📋 Filas encontradas:', filas.length);

    if (filas.length > 0) {
        const primeraFila = filas[0];
        const celdas = primeraFila.querySelectorAll('td');
        console.log('📊 Columnas en primera fila:', celdas.length);

        if (celdas.length >= 4) {
            const celdaClaveAcceso = celdas[3];
            console.log('🔍 Contenido celda [3]:', celdaClaveAcceso.textContent.substring(0, 50));
            console.log('🔍 HTML celda [3]:', celdaClaveAcceso.innerHTML.substring(0, 200));

            const enlace = celdaClaveAcceso.querySelector('a');
            console.log('🔗 Enlace encontrado:', enlace ? 'SÍ' : 'NO');

            if (enlace) {
                console.log('✅ Href:', enlace.href);
                console.log('✅ Texto:', enlace.textContent.substring(0, 30));
            } else {
                console.warn('⚠️ NO HAY ENLACE - Buscando alternativas...');
                // Intentar buscar cualquier elemento clickeable
                const clickeable = celdaClaveAcceso.querySelector('span, div, button');
                console.log('🔍 Elemento clickeable alternativo:', clickeable ? clickeable.tagName : 'NINGUNO');
            }
        }
    }

    const todasLasRetenciones = [];
    let paginaActual = 1;

    while (true) {
        console.log(`📄 Procesando página ${paginaActual} de retenciones`);
        await esperarTabla();

        // ELITE v13.1: Feedback de progreso en tiempo real
        if (window.sriAssistant) {
            window.sriAssistant.log(`📄 Procesando página ${paginaActual} de retenciones...`);
        }

        const retencionesPagina = await extraerRetencionesPaginaActual();
        console.log(`   Extraídas ${retencionesPagina.length} retenciones`);

        if (retencionesPagina.length === 0) break;

        todasLasRetenciones.push(...retencionesPagina);

        const hayMasPaginas = await irSiguientePagina();
        if (!hayMasPaginas) break;

        paginaActual++;
        await sleep(2000);
    }

    console.log(`✅ Total: ${todasLasRetenciones.length} retenciones`);

    const resumen = calcularResumenRetenciones(todasLasRetenciones);
    console.log('📊 Resumen final:', resumen);

    // GUARDAR RESPALDO: Por si el mensaje falla
    try {
        await SafeStorage.set({ retenciones: resumen });
        console.log('💾 Backup de retenciones guardado en storage');
    } catch (e) {
        console.warn('No se pudo guardar backup', e);
    }

    return resumen;
}

async function extraerRetencionesPaginaActual() {
    const retenciones = [];

    // Usar detección por encabezados (igual que en extraerTodasLasRetenciones)
    let tabla = null;
    const todasLasTablas = document.querySelectorAll('table');

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        if ((textoEncabezados.includes('clave de acceso') || textoEncabezados.includes('clave acceso')) &&
            (textoEncabezados.includes('comprobante') || textoEncabezados.includes('retención'))) {
            tabla = t;
            break;
        }
    }

    if (!tabla) {
        console.warn('⚠️ No se encontró tabla en extraerRetencionesPaginaActual');
        return retenciones;
    }

    const filas = tabla.querySelectorAll('tbody tr');
    console.log(`   🔍 Procesando ${filas.length} filas...`);

    for (let idx = 0; idx < filas.length; idx++) {
        const fila = filas[idx];

        try {
            const celdas = fila.querySelectorAll('td');
            if (celdas.length < 9) {
                console.log(`   ⚠️ Fila ${idx} descartada: solo ${celdas.length} columnas`);
                continue;
            }

            const textoCompleto = fila.textContent.trim();
            if (textoCompleto.includes('No se encontraron')) continue;

            console.log(`   📋 Procesando retención ${idx + 1}`);

            const celdaClaveAcceso = celdas[3];
            const enlace = celdaClaveAcceso.querySelector('a');

            if (!enlace) {
                console.warn(`   ❌ No se encontró enlace en fila ${idx + 1}`);
                continue;
            }

            console.log(`   🔗 Abriendo modal...`);
            // Click robusto
            enlace.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            enlace.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            enlace.click();

            // Esperar más tiempo
            await sleep(2500);

            const datosRetencion = await extraerDatosModalRetencion();

            if (datosRetencion) {
                retenciones.push({
                    idx: idx + 1,
                    comprobanteNo: celdas[2].textContent.trim(),
                    rucRazon: celdas[1].textContent.trim(),
                    ivaRetenido: datosRetencion.ivaRetenido,
                    rentaRetenida: datosRetencion.rentaRetenida,
                    baseImponibleIva: datosRetencion.baseImponibleIva,
                    baseImponibleRenta: datosRetencion.baseImponibleRenta
                });

                console.log(`   ✅ IVA: ${datosRetencion.ivaRetenido} (Base: ${datosRetencion.baseImponibleIva}), Renta: ${datosRetencion.rentaRetenida} (Base: ${datosRetencion.baseImponibleRenta})`);
            } else {
                console.warn('   ⚠️ No se pudieron extraer datos (modal no abrió o vacío)');
            }

            await cerrarModal();
            await sleep(1000);

        } catch (error) {
            console.error(`   ❌ Error en fila ${idx}:`, error);
            await cerrarModal();
        }
    }

    // POR SI ACASO: Asegurar que el último modal se cierre (User request)
    console.log('   🧹 Limpieza final: Asegurando cierre de modales...');
    await cerrarModal();

    return retenciones;
}

async function extraerDatosModalRetencion() {
    console.log('      🔍 Buscando modal (Estrategia Headers de Tabla)...');

    // Esperar a que cargue
    await sleep(2000);

    // 1. Buscar dentro de Dialogs (Prioridad)
    const dialogs = document.querySelectorAll('.ui-dialog');

    // Iterar en reverso (último abierto)
    for (let i = dialogs.length - 1; i >= 0; i--) {
        const d = dialogs[i];

        // Buscar la tabla ESPECÍFICA dentro del diálogo
        const tablas = d.querySelectorAll('table');
        for (const t of tablas) {
            const headers = t.textContent.toLowerCase();
            // Headers clave que SIEMPRE aparecen en la tabla de retención
            if (headers.includes('base imponible') && headers.includes('valor retenido')) {
                console.log(`      ✅ Tabla encontrada en Dialog #${i} (por headers)`);
                console.log(`      👀 Estado visible: ${d.style.display !== 'none'}`);

                // FIX: Procesar SOLAMENTE esta tabla, no todas las del diálogo
                const datos = procesarTablaRetencion(t);
                return datos;
            }
        }
    }

    // 2. Fallback: Buscar cualquier tabla en el DOM con esos headers
    console.log('      ⚠️ No encontrado en Dialogs. Escaneando TODAS las tablas del DOM...');
    const todasLasTablas = document.querySelectorAll('table');

    for (const t of todasLasTablas) {
        const headers = t.textContent.toLowerCase();
        if (headers.includes('base imponible') && headers.includes('valor retenido')) {
            console.log('      ✅ Tabla "suelta" encontrada en DOM (por headers exactos)');
            // FIX: Procesar directamente la tabla encontrada
            return procesarTablaRetencion(t);
        }
    }

    console.warn('      ❌ Falló estrategia headers. No se encontraron datos.');
    return null;
}

function procesarTablaRetencion(tabla) {
    console.log(`      📊 Procesando tabla específica...`);

    let ivaRetenido = 0;
    let rentaRetenida = 0;
    let baseImponibleRenta = 0;
    let baseImponibleIva = 0;

    // INTENTO DE MAPEO DE COLUMNAS POR HEADER
    let indiceValorRetenido = -1;
    let indiceBaseImponible = -1;

    // Buscar en thead o en la primera fila de la tabla si no hay thead
    const headerSource = tabla.querySelector('thead') || tabla.querySelector('tbody tr');

    if (headerSource) {
        const potentialHeaders = headerSource.querySelectorAll('th, td');
        potentialHeaders.forEach((th, index) => {
            const texto = th.textContent.toLowerCase().trim();
            if (texto.includes('valor retenido') || texto.includes('valor ret')) {
                indiceValorRetenido = index;
                console.log(`      🎯 Columna 'Valor Retenido' detectada en índice: ${index}`);
            }
            if (texto.includes('base imponible') || texto.includes('base imp')) {
                indiceBaseImponible = index;
                console.log(`      🎯 Columna 'Base Imponible' detectada en índice: ${index}`);
            }
        });
    }

    // Si no encontramos header (o no detectó columnas clave), usamos heurística
    if (indiceValorRetenido === -1) {
        const filas = tabla.querySelectorAll('tbody tr');
        if (filas.length > 0) {
            const celdas = filas[0].querySelectorAll('td');
            if (celdas.length >= 5) {
                indiceValorRetenido = 4; // Estándar SRI
                indiceBaseImponible = 2; // Estándar SRI
                console.log(`      ⚠️ Headers no detectados mediante texto. Usando índices estándar: Ret=${indiceValorRetenido}, Base=${indiceBaseImponible}`);
            }
        }
    }

    const filas = tabla.querySelectorAll('tbody tr');
    filas.forEach(fila => {
        const textoFila = fila.textContent.toLowerCase();

        // ELITE FIX: Si esta fila fue usada como header, saltarla para no procesarla como datos
        if (headerSource && fila === headerSource && indiceValorRetenido !== -1) return;
        const celdas = fila.querySelectorAll('td, th');

        // Si tenemos índices confirmados
        if (indiceValorRetenido !== -1 && celdas[indiceValorRetenido]) {
            const textoCelda = celdas[indiceValorRetenido].textContent;
            const val = parseDecimal(textoCelda);

            let valBase = 0;
            if (indiceBaseImponible !== -1 && celdas[indiceBaseImponible]) {
                valBase = parseDecimal(celdas[indiceBaseImponible].textContent);
            }

            // RENTA
            if (textoFila.includes('renta')) {
                // Validar que no sea una fecha (sanity check)
                if (!textoCelda.includes('-') && !textoCelda.includes('/')) {
                    rentaRetenida += val;
                    baseImponibleRenta += valBase;
                    console.log(`      ✅ RENTA (idx ${indiceValorRetenido}): Val=${val}, Base=${valBase}`);
                }
            }

            // IVA
            if (textoFila.includes('iva')) {
                if (!textoCelda.includes('-') && !textoCelda.includes('/')) {
                    ivaRetenido += val;
                    baseImponibleIva += valBase;
                    console.log(`      ✅ IVA (idx ${indiceValorRetenido}): Val=${val}, Base=${valBase}`);
                }
            }
        }
        // FALLBACK ANTIGUO (Solo si falló detección de índice)
        else if (celdas.length >= 5) {
            // Buscar en últimas columnas descartando fechas
            for (let i = celdas.length - 1; i >= 2; i--) {
                const texto = celdas[i].textContent.trim();
                // Ignorar fechas largas o años
                if (texto.includes('-') || texto.includes('/') || (texto.length === 4 && parseInt(texto) > 1990)) continue;

                const val = parseDecimal(texto);
                if (val > 0) {
                    if (texto.includes('%')) continue;

                    if (textoFila.includes('renta')) {
                        rentaRetenida += val;
                        // En el fallback antiguo no tenemos el índice de base imponible fácilmente
                        // pero podríamos asumir que es i - 2 (si i es 4, base es 2)
                        if (celdas[i - 2]) baseImponibleRenta += parseDecimal(celdas[i - 2].textContent);

                        console.log(`      ✅ RENTA (Fallback col ${i}): ${val}`);
                        break;
                    } else if (textoFila.includes('iva')) {
                        ivaRetenido += val;
                        if (celdas[i - 2]) baseImponibleIva += parseDecimal(celdas[i - 2].textContent);
                        console.log(`      ✅ IVA (Fallback col ${i}): ${val}`);
                        break;
                    }
                }
            }
        }
    });

    return { ivaRetenido, rentaRetenida, baseImponibleRenta, baseImponibleIva };
}

async function cerrarModal() {
    try {
        const botonesCerrar = document.querySelectorAll('.ui-dialog-titlebar-close, .ui-dialog-close, [id*="close"], .ui-icon-closethick');
        if (botonesCerrar.length > 0) {
            botonesCerrar.forEach(btn => {
                if (btn.offsetParent !== null) btn.click();
            });
            await sleep(500);
        } else {
            // Click fuera o Escape
            document.body.click();
        }
    } catch (error) {
        console.warn('Error cerrando modal');
    }
}

async function esperarElemento(selector, timeout) {
    return await waitFor(() => document.querySelector(selector), timeout, selector);
}

async function irSiguientePagina() {
    const btnSiguiente = document.querySelector('.ui-paginator-next');
    if (!btnSiguiente) return false;

    const clases = btnSiguiente.className || '';
    if (clases.includes('ui-state-disabled')) return false;

    // Scroll al botón para asegurar visibilidad
    btnSiguiente.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    btnSiguiente.click();
    return true;
}

/**
 * ELITE v13.0: Maximiza el número de registros por página para acelerar la extracción.
 * Intenta configurar el dropdown de PrimeFaces a "100" o el valor más alto disponible.
 */
async function optimizarTamanoPagina() {
    try {
        const dropdownRPP = document.querySelector('.ui-paginator-rpp-options, select[name*="rpp"]');
        if (!dropdownRPP) return false;

        const options = Array.from(dropdownRPP.options);
        // Buscar la opción más alta o específicamente "100"
        let targetOption = options.find(opt => opt.value === "100" || opt.text.includes("100"));
        if (!targetOption && options.length > 0) {
            targetOption = options[options.length - 1]; // La última suele ser la mas grande
        }

        if (targetOption && dropdownRPP.value !== targetOption.value) {
            console.log(`🚀 Optimizando tamaño de página a: ${targetOption.text}`);
            dropdownRPP.value = targetOption.value;
            dropdownRPP.dispatchEvent(new Event('change', { bubbles: true }));

            // Esperar a que la tabla se recargue con los nuevos datos
            await sleep(1500);
            await esperarTabla();
            return true;
        }
    } catch (e) {
        console.warn('⚠️ No se pudo optimizar el tamaño de la página:', e);
    }
    return false;
}

async function esperarTabla() {
    let intentos = 0;
    while (intentos < 30) {
        const spinner = document.querySelector('.ui-blockui');
        if (!spinner || spinner.style.display === 'none') break;
        await sleep(200);
        intentos++;
    }
    await sleep(500);
}


function calcularResumen(facturas) {
    let periodo = "Desconocido";
    if (facturas.length > 0) {
        // Asumimos formato fecha dd/mm/yyyy o yyyy-mm-dd en propiedad algun lado?
        // En extraerFacturasPaginaActual no grabamos fecha explicita, agreguemosla si es posible o usemos la fecha actual - 1 mes
        // PERO: El usuario quiere el mes de los datos.
        // Simulamos obteniendo de la busqueda actual
        const fechaActual = new Date();
        const mesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 1, 1);
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        periodo = `${meses[mesAnterior.getMonth()]} ${mesAnterior.getFullYear()}`;
    }

    const resumen = {
        totalFacturas: facturas.length,
        iva0: { cantidad: 0, total: 0, baseImponible: 0, montoIva: 0 },
        iva15: { cantidad: 0, total: 0, baseImponible: 0, montoIva: 0 },
        periodo: periodo
    };

    facturas.forEach(factura => {
        if (factura.iva === 0 || factura.iva === 0.00) {
            resumen.iva0.cantidad++;
            resumen.iva0.total += factura.importeTotal;
            resumen.iva0.baseImponible += factura.valorSinImpuestos;
            resumen.iva0.montoIva += factura.iva;
        } else {
            resumen.iva15.cantidad++;
            resumen.iva15.total += factura.importeTotal;
            resumen.iva15.baseImponible += factura.valorSinImpuestos;
            resumen.iva15.montoIva += factura.iva;
        }
    });

    resumen.iva0.total = redondear(resumen.iva0.total);
    resumen.iva0.baseImponible = redondear(resumen.iva0.baseImponible);
    resumen.iva0.montoIva = redondear(resumen.iva0.montoIva); // Should be 0

    resumen.iva15.total = redondear(resumen.iva15.total);
    resumen.iva15.baseImponible = redondear(resumen.iva15.baseImponible);
    resumen.iva15.montoIva = redondear(resumen.iva15.montoIva);

    return resumen;
}

function calcularResumenRetenciones(retenciones) {
    let periodo = "Desconocido";
    if (retenciones.length > 0) {
        // Igual, usamos la logica de mes anterior por defecto ya que es lo que busca el bot
        const fechaActual = new Date();
        const mesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 1, 1);
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        periodo = `${meses[mesAnterior.getMonth()]} ${mesAnterior.getFullYear()}`;
    }

    const resumen = {
        totalRetenciones: retenciones.length,
        ivaRetenido: { cantidad: 0, total: 0, baseTotal: 0, valores: [] },
        rentaRetenida: { cantidad: 0, total: 0, baseTotal: 0, valores: [] },
        listaNumeros: [],
        periodo: periodo
    };

    retenciones.forEach(retencion => {
        if (retencion.comprobanteNo) {
            resumen.listaNumeros.push(retencion.comprobanteNo);
        }

        // Procesar IVA (si tiene valor o base)
        if (retencion.ivaRetenido > 0 || (retencion.baseImponibleIva && retencion.baseImponibleIva > 0)) {
            resumen.ivaRetenido.cantidad++;
            resumen.ivaRetenido.total += (retencion.ivaRetenido || 0);
            resumen.ivaRetenido.baseTotal += (retencion.baseImponibleIva || 0);
            resumen.ivaRetenido.valores.push((retencion.ivaRetenido || 0).toFixed(2));
        }

        // Procesar Renta (si tiene valor o base)
        if (retencion.rentaRetenida > 0 || (retencion.baseImponibleRenta && retencion.baseImponibleRenta > 0)) {
            resumen.rentaRetenida.cantidad++;
            resumen.rentaRetenida.total += (retencion.rentaRetenida || 0);
            resumen.rentaRetenida.baseTotal += (retencion.baseImponibleRenta || 0);
            resumen.rentaRetenida.valores.push((retencion.rentaRetenida || 0).toFixed(2));
        }
    });

    resumen.ivaRetenido.total = redondear(resumen.ivaRetenido.total);
    resumen.rentaRetenida.total = redondear(resumen.rentaRetenida.total);
    resumen.ivaRetenido.baseTotal = redondear(resumen.ivaRetenido.baseTotal);
    resumen.rentaRetenida.baseTotal = redondear(resumen.rentaRetenida.baseTotal);

    // Generar strings de detalle (ej: "10.00 + 5.00")
    resumen.ivaRetenido.detalleStr = resumen.ivaRetenido.valores.join(' + ');
    resumen.rentaRetenida.detalleStr = resumen.rentaRetenida.valores.join(' + ');

    return resumen;
}

// ============================================
// EXTRACCIÓN DE NOTAS DE CRÉDITO
// ============================================

async function extraerTodasLasNotasCredito() {
    console.log('🚀 Iniciando extracción de Notas de Crédito...');
    const todasLasNC = [];
    let paginaActual = 1;

    while (true) {
        console.log('Procesando página ' + paginaActual + ' de NC');
        await esperarTabla();

        // ELITE v13.1: Feedback de progreso en tiempo real
        if (window.sriAssistant) {
            window.sriAssistant.log(`📄 Procesando página ${paginaActual} de Notas de Crédito...`);
        }

        const ncPagina = await extraerNotasCreditoPaginaActualDeep();
        console.log('Extraídas ' + ncPagina.length + ' notas de crédito');

        if (ncPagina.length === 0 && paginaActual === 1) {
            // Check if "No existen datos" message is present
            const msgError = document.querySelector('.ui-messages-warn-detail, .ui-growl-item');
            if (msgError && msgError.textContent.includes('No existen datos')) {
                console.log('ℹ️ No hay notas de crédito.');
                break;
            }
        }

        if (ncPagina.length === 0 && paginaActual > 1) break; // Fin de paginación

        todasLasNC.push(...ncPagina);

        const hayMasPaginas = await irSiguientePagina();
        if (!hayMasPaginas) break;

        paginaActual++;
        await sleep(1500);
    }

    console.log('Total: ' + todasLasNC.length + ' notas de crédito');
    return calcularResumenNotasCredito(todasLasNC);
}

function extraerNotasCreditoPaginaActual() {
    console.log('🔍 DEBUG: Iniciando extraerNotasCreditoPaginaActual');
    const notas = [];

    // Reusar lógica de búsqueda de tabla de Facturas (misma estructura generalmente)
    let tabla = null;
    const todasLasTablas = document.querySelectorAll('table');

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        // Tablas de NC suelen tener 'Valor sin impuestos' y 'Importe Total' igual que facturas
        if ((textoEncabezados.includes('valor sin impuestos') || textoEncabezados.includes('base imponible')) &&
            textoEncabezados.includes('importe total') &&
            t.offsetParent !== null) { // Visible
            tabla = t;
            console.log(`✅ Tabla NC encontrada: ${t.id} (Headers: ${textoEncabezados})`);
            break;
        }
    }

    // Fallback selectors
    if (!tabla) tabla = document.querySelector('table[id*="dtComprobantes"]');
    if (!tabla) tabla = document.querySelector('table[id*="Comprobantes"]');

    if (!tabla) {
        console.warn('⚠️ No se encontró tabla de Notas de Crédito');
        return notas;
    }

    // Indices (Generalmente iguales a Facturas, pero recalculamos por seguridad)
    let idxValorSinImpuestos = -1;
    let idxIva = -1;
    let idxImporteTotal = -1;

    const thead = tabla.querySelector('thead');
    if (thead) {
        const headers = thead.querySelectorAll('th, td');
        headers.forEach((th, index) => {
            const texto = th.textContent.toLowerCase().trim();
            if (texto.includes('valor sin impuestos') || texto.includes('base imponible')) {
                idxValorSinImpuestos = index;
            } else if (texto.includes('iva') && !texto.includes('ret')) {
                idxIva = index;
            } else if (texto.includes('importe total') || texto.includes('total')) {
                idxImporteTotal = index;
            }
        });
    }

    const filas = tabla.querySelectorAll('tbody tr');
    filas.forEach((fila, idx) => {
        try {
            const celdas = fila.querySelectorAll('td');
            if (celdas.length < 7) return;

            // Verificar mensaje
            if (fila.textContent.includes('No se encontraron')) return;

            let valorSinImpuestos = 0, iva = 0, importeTotal = 0;

            // Estrategia Indices Dinámicos
            if (idxValorSinImpuestos !== -1 && idxImporteTotal !== -1) {
                valorSinImpuestos = parseDecimal(celdas[idxValorSinImpuestos].textContent);
                if (idxIva !== -1) iva = parseDecimal(celdas[idxIva].textContent);
                importeTotal = parseDecimal(celdas[idxImporteTotal].textContent);
            }
            // Estrategia  Falta (Últimas columnas)
            else if (celdas.length >= 9) {
                // Asumimos mismas posiciones que Facturas: 6=SinImp, 7=IVA, 8=Total
                valorSinImpuestos = parseDecimal(celdas[6].textContent);
                iva = parseDecimal(celdas[7].textContent);
                importeTotal = parseDecimal(celdas[8].textContent);
            }
            else {
                // Fallback últimas 3
                const ultimas3 = [
                    celdas[celdas.length - 3],
                    celdas[celdas.length - 2],
                    celdas[celdas.length - 1]
                ];
                valorSinImpuestos = parseDecimal(ultimas3[0].textContent);
                iva = parseDecimal(ultimas3[1].textContent);
                importeTotal = parseDecimal(ultimas3[2].textContent);
            }

            if (importeTotal === 0 && valorSinImpuestos === 0) return;

            notas.push({
                numero: idx + 1,
                valorSinImpuestos: valorSinImpuestos,
                iva: iva,
                importeTotal: importeTotal
            });

        } catch (e) {
            console.error('Error procesando fila NC ' + idx, e);
        }
    });

    return notas;
}

async function extraerNotasCreditoPaginaActualDeep() {
    const notas = [];
    const todasLasTablas = document.querySelectorAll('table');
    let tabla = null;

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        if ((textoEncabezados.includes('valor sin impuestos') || textoEncabezados.includes('base imponible')) &&
            textoEncabezados.includes('importe total') &&
            t.offsetParent !== null) {
            tabla = t;
            break;
        }
    }

    if (!tabla) tabla = document.querySelector('table[id*="dtComprobantes"]');

    if (!tabla) {
        console.warn('⚠️ No se encontró tabla de Notas de Crédito');
        return notas;
    }

    // DETECCIÓN DINÁMICA DE COLUMNAS PARA TABA EXTERNA
    let idxValSin = -1, idxValIva = -1, idxValTot = -1;
    const thead = tabla.querySelector('thead');
    if (thead) {
        const headers = thead.querySelectorAll('th, td');
        headers.forEach((th, idx) => {
            const h = th.textContent.toLowerCase().trim();
            if (h.includes('valor sin') || h.includes('base imponible')) idxValSin = idx;
            else if (h.includes('iva') && !h.includes('retención')) idxValIva = idx;
            else if (h.includes('total')) idxValTot = idx;
        });
    }

    const filas = tabla.querySelectorAll('tbody tr');
    console.log(`🔍 Deep NC: Procesando ${filas.length} filas en tabla [${tabla.id || 'sin id'}]...`);

    for (let idx = 0; idx < filas.length; idx++) {
        const fila = filas[idx];
        try {
            const celdas = fila.querySelectorAll('td');
            if (celdas.length < 8) continue;
            if (fila.textContent.includes('No se encontraron')) continue;

            const celdaEnlace = celdas[3]; // Clave de Acceso suele ser 3
            const enlace = celdaEnlace.querySelector('a');

            if (!enlace) {
                console.warn(`   ⚠️ No se encontró enlace en fila ${idx + 1}`);
                continue;
            }

            console.log(`📄 Deep NC [${idx + 1}]: Abriendo modal de detalle...`);
            enlace.click();

            // Esperar que el modal se abra (Checking for specific table presence)
            let datosModal = null;
            for (let t = 0; t < 6; t++) {
                await sleep(800);
                datosModal = await extraerDatosModalNC();
                if (datosModal) break;
            }

            if (datosModal) {
                notas.push({
                    numero: idx + 1,
                    valorSinImpuestos: datosModal.iva0 + datosModal.iva15,
                    iva: datosModal.valorIva,
                    importeTotal: datosModal.iva0 + datosModal.iva15 + datosModal.valorIva,
                    iva0: datosModal.iva0,
                    iva15: datosModal.iva15
                });
                console.log(`   ✅ Detalle NC [${idx + 1}]: Base0=$${datosModal.iva0}, Base15=$${datosModal.iva15}, IVA=$${datosModal.valorIva}`);
            } else {
                console.warn(`   ⚠️ Falló extracción en modal NC [${idx + 1}], usando datos de tabla externa.`);

                // Usar índices detectados o fallback fijo
                const cValSin = idxValSin !== -1 ? idxValSin : 6;
                const cValIva = idxValIva !== -1 ? idxValIva : 7;
                const cValTot = idxValTot !== -1 ? idxValTot : 8;

                const valSin = parseDecimal(celdas[cValSin]?.textContent || '0');
                const valIva = parseDecimal(celdas[cValIva]?.textContent || '0');
                const valTot = parseDecimal(celdas[cValTot]?.textContent || '0');

                notas.push({
                    numero: idx + 1,
                    valorSinImpuestos: valSin,
                    iva: valIva,
                    importeTotal: valTot,
                    iva0: valIva === 0 ? valSin : 0,
                    iva15: valIva > 0 ? valSin : 0
                });
                console.log(`   🔸 Fallback NC [${idx + 1}]: Sin=$${valSin}, IVA=$${valIva}`);
            }

            await cerrarModal();
            await sleep(500);

        } catch (e) {
            console.error(`   ❌ Error en Deep NC fila ${idx}`, e);
            await cerrarModal();
        }
    }

    return notas;
}

async function extraerDatosModalNC() {
    try {
        await sleep(500); // Pequeña pausa inicial

        // 1. ESTRATEGIA: ID Específico (según imagen del usuario)
        let tablaTotales = document.querySelector('table[id*="tabla-totales-impuesto-nota-credito"]');

        if (!tablaTotales) {
            // 2. ESTRATEGIA: Búsqueda por headers en tablas del diálogo
            const dialogTables = document.querySelectorAll('.ui-dialog table, [id*="form-detalle"] table');
            for (const t of dialogTables) {
                const hText = t.textContent.toLowerCase();
                // Verificamos que sea la tabla de TOTALES y no la de ítems
                if (hText.includes('totales por impuesto') ||
                    (hText.includes('impuesto') && hText.includes('base imponible') && hText.includes('valor') && !hText.includes('precio unitario'))) {
                    tablaTotales = t;
                    break;
                }
            }
        }

        if (!tablaTotales) return null;

        const filasTotales = Array.from(tablaTotales.querySelectorAll('tbody tr, .rf-dt-r'));
        // IMPORTANTE: Si la tabla existe pero no tiene filas de datos (vacia o cargando), seguimos esperando
        if (filasTotales.length === 0 || filasTotales[0].textContent.includes('No se encontraron')) {
            return null;
        }

        console.log(`      ✅ Tabla NC hallada con ${filasTotales.length} filas de impuestos.`);
        let iva0 = 0;
        let iva15 = 0;
        let valorIva = 0;

        filasTotales.forEach(fila => {
            const celdas = fila.querySelectorAll('td');
            if (celdas.length >= 4) {
                const impuesto = celdas[1].textContent.toLowerCase();
                const codigo = celdas[2].textContent.trim();
                const base = parseDecimal(celdas[3].textContent);
                const valor = celdas[4] ? parseDecimal(celdas[4].textContent) : 0;

                if (impuesto.includes('iva')) {
                    // CÓDIGOS SRI: 0=0%, 2=12%, 3=14%, 4 o 10=15%
                    if (codigo === '0.0' || codigo === '0') {
                        iva0 += base;
                    } else {
                        iva15 += base;
                        valorIva += valor;
                    }
                }
            }
        });

        // Solo retornamos si al menos capturamos algo o confirmamos que procesamos filas
        return { iva0, iva15, valorIva, processed: true };

    } catch (e) {
        console.error('❌ Error parseando modal NC:', e);
        return null;
    }
}

function calcularResumenNotasCredito(notas) {
    const resumen = {
        totalNotas: notas.length,
        valorSinImpuestos: 0,
        iva: { total: 0 },
        totalGeneral: 0,
        iva0: { baseImponible: 0, total: 0 },
        iva15: { baseImponible: 0, total: 0 }
    };

    notas.forEach(nc => {
        resumen.valorSinImpuestos += (nc.valorSinImpuestos || 0);
        resumen.iva.total += (nc.iva || 0);
        resumen.totalGeneral += (nc.importeTotal || 0);

        // Si tenemos datos del deep extraction (iva0, iva15 específicos), los usamos
        if (typeof nc.iva0 === 'number' && typeof nc.iva15 === 'number') {
            resumen.iva0.baseImponible += nc.iva0;
            resumen.iva0.total += nc.iva0; // Reflejar en el total de esa base
            resumen.iva15.baseImponible += nc.iva15;
            resumen.iva15.total += nc.iva15 + (nc.iva || 0);
        } else {
            // Fallback anterior
            if (nc.iva === 0 || nc.iva === 0.00) {
                resumen.iva0.baseImponible += nc.valorSinImpuestos;
                resumen.iva0.total += nc.importeTotal;
            } else {
                resumen.iva15.baseImponible += nc.valorSinImpuestos;
                resumen.iva15.total += nc.importeTotal;
            }
        }
    });

    resumen.valorSinImpuestos = redondear(resumen.valorSinImpuestos);
    resumen.iva.total = redondear(resumen.iva.total);
    resumen.totalGeneral = redondear(resumen.totalGeneral);
    resumen.iva0.baseImponible = redondear(resumen.iva0.baseImponible);
    resumen.iva0.total = redondear(resumen.iva0.total);
    resumen.iva15.baseImponible = redondear(resumen.iva15.baseImponible);
    resumen.iva15.total = redondear(resumen.iva15.total);

    return resumen;
}

/**
 * Motor de Cálculo Técnico Elite (Reinforcement Engine)
 * Calcula 615 y 617 siguiendo las reglas técnicas del SRI cuando el sugerido no es detectable.
 */
async function calculateEliteFinancials(targetField) {
    console.group(`🧮 Elite Tax Engine: Refuerzo para ${targetField}`);
    
    // Insumos desde el DOM
    const impCausado   = await leerCampo('601'); // Impuesto Causado
    const credAnterior = await leerCampo('605'); // Saldo mes anterior
    const credEsteMes  = await leerCampo('602'); // Crédito tributario período
    const retAnterior  = await leerCampo('606'); // Retenciones mes anterior
    const retEsteMes   = await leerCampo('609'); // Retenciones este mes

    let result = 0;
    const totalCredito = (credAnterior || 0) + (credEsteMes || 0);
    const totalRetenciones = (retAnterior || 0) + (retEsteMes || 0);

    if (targetField === '615') {
        // Crédito Tributario próximo mes: (Crédito Total) - (Lo usado para cubrir 601)
        result = Math.max(0, totalCredito - impCausado);
        console.log(`   💡 Cálculo 615: (${totalCredito}) - ${impCausado} = ${result}`);
    } else if (targetField === '617') {
        // Retenciones próximo mes: (Retenciones Total) - (Lo usado para cubrir el restante de 601 si el Crédito no alcanzó)
        const remanenteImpuesto = Math.max(0, impCausado - totalCredito);
        result = Math.max(0, totalRetenciones - remanenteImpuesto);
        console.log(`   💡 Cálculo 617: (${totalRetenciones}) - remanente(${remanenteImpuesto}) = ${result}`);
    }

    console.groupEnd();
    return result;
}

function parseDecimal(texto) {
    if (texto === null || texto === undefined) return 0;
    
    // Asegurar que sea string para evitar error .replace is not a function
    let limpio = String(texto).replace(/[$\s]/g, '');

    if (limpio.includes('.') && limpio.includes(',')) {
        if (limpio.lastIndexOf(',') > limpio.lastIndexOf('.')) {
            limpio = limpio.replace(/\./g, '').replace(',', '.');
        } else {
            limpio = limpio.replace(/,/g, '');
        }
    } else if (limpio.includes(',')) {
        limpio = limpio.replace(',', '.');
    }

    const numero = parseFloat(limpio);
    return isNaN(numero) ? 0 : numero;
}

function redondear(numero) {
    return Math.round(numero * 100) / 100;
}


// ============================================
// AUTO-LLENAR FORMULARIO
// ============================================
// HELPER: CÁLCULO ELITE DE CRÉDITOS Y RETENCIONES (v10.0)
// ============================================

async function calculateEliteFinancials() {
    console.group('🧮 Elite Tax Engine: Cálculo Secuencial 615/617');
    
    // 1. Obtener valores base del DOM (Sugeridos u otros llenados)
    const impCausado   = await leerCampo('601'); // Impuesto Causado (calculado por SRI)
    const credAnterior = await leerCampo('605'); // Saldo mes anterior (605)
    const credEsteMes  = await leerCampo('602'); // Crédito tributario período (520 -> 564 -> 602)
    const retAnterior  = await leerCampo('606'); // Retenciones mes anterior (606)
    const retEsteMes   = await leerCampo('609'); // Retenciones este mes (609)

    console.log(`   📊 Insumos: Impuesto=${impCausado}, CréditoTotal=${credAnterior + credEsteMes}, RetTotal=${retAnterior + retEsteMes}`);

    let impuestoRestante = impCausado;
    let saldo615 = 0;
    let saldo617 = 0;

    // FÓRMULA SECUENCIAL SRI:
    // PASO 1: Consumir Crédito Tributario (615)
    const creditoDisponible = credEsteMes + credAnterior;
    if (creditoDisponible >= impuestoRestante) {
        saldo615 = creditoDisponible - impuestoRestante;
        impuestoRestante = 0;
    } else {
        saldo615 = 0;
        impuestoRestante = impuestoRestante - creditoDisponible;
    }

    // PASO 2: Consumir Retenciones (617) si queda impuesto
    const retencionesDisponibles = retEsteMes + retAnterior;
    if (retencionesDisponibles >= impuestoRestante) {
        saldo617 = retencionesDisponibles - impuestoRestante;
        impuestoRestante = 0;
    } else {
        saldo617 = 0;
        impuestoRestante = impuestoRestante - retencionesDisponibles;
    }

    console.log(`   🎯 Resultado: 615=${saldo615.toFixed(2)}, 617=${saldo617.toFixed(2)}`);
    console.groupEnd();

    return { saldo615, saldo617 };
}

// ============================================

async function autoLlenarFormulario(data) {
    console.group('🔥 SRI Llenado Maestro v9.0 ELITE');
    let total = 0;

    try {
        if (window.sriAssistant) window.sriAssistant.log('🚀 Iniciando Ejecución Total (Orquestada)...');
        await GhostMemory.set('workflowState', 'FILLING_FORM'); // Sincronía Popup


        // 1. VENTAS
        console.log('--- FASE 1: VENTAS ---');
        safeStatus('📊 Llenando Ventas...');
        total += await llenarVentas(data);
        await sleep(800);

        // 2. COMPRAS
        console.log('--- FASE 2: COMPRAS ---');
        safeStatus('🛍️ Llenando Compras...');
        total += await llenarCompras(data);
        await sleep(800);

        // 3. RETENCIONES / RESUMEN
        console.group('📋 Resumen Impositivo (Elite Engine)');
        safeStatus('💎 Aplicando Sugeridos y Retenciones...');
        total += await llenarRetenciones(data);
        await sleep(600);

        // FASE 4: RESUMEN IMPOSITIVO (Sugeridos + Refuerzo Técnico)
        const eliteFields = ['564', '565', '615', '617', '619'];
        for (const f of eliteFields) {
            // Aseguramos sección abierta
            if (['615', '617', '619'].includes(f)) await toggleSriSection('RESUMEN', true);
            else if (['564', '565'].includes(f)) await toggleSriSection('COMPRAS', true);

            const exito = await procesarCampoConSugerido(f);
            if (exito) {
                total++;
                await sleep(400);
            } else if (['615', '617'].includes(f)) {
                console.log(`📡 Refuerzo Técnico para campo ${f}...`);
                const technicalVal = await calculateEliteFinancials(f);
                if (technicalVal > 0) {
                    if (await llenarCampo(f, technicalVal)) total++;
                }
            }
        }
        console.groupEnd();

        // Limpieza Visual Final
        await toggleSriSection('COMPRAS', false);
        await toggleSriSection('RESUMEN', true); // Mantener resumen a la vista para el usuario

        // FASE 5: REPORTE FINAL ELITE
        if (window.sriAssistant) {
            await window.sriAssistant.showFinalReport(data, total);
            window.sriAssistant.log(`✅ Operación total finalizada: ${total} campos.`);
        }

        console.log(`🚀 RESULTADO FINAL: ${total} campos exitosos.`);
        return total;

    } catch (e) {
        console.error('Error en llenado maestro:', e);
        if (window.sriAssistant) window.sriAssistant.log('❌ Error: ' + e.message);
    } finally {
        if (window.sriAssistant) {
            window.sriAssistant.setWorking(false);
            window.sriAssistant.toggleMinimize(false);
        }
    }

    console.groupEnd();
    return total;
}

async function llenarVentas(data) {
    console.log('📋 Procesando VENTAS (Espejo de Columnas: Bruto -> Neto) ...');
    let camposLlenados = 0;

    // Expandir Sección Ventas (Sequential Visual)
    await toggleSriSection('Ventas', true);

    // Definir pares de casilleros ESENCIALES (Origen: Bruto -> Destino: Neto)
    const pares = [
        ['401', '411'], // Ventas tarifa diferente de 0
        ['402', '412'],
        ['425', '435'],
        ['403', '413'], // Ventas tarifa 0%
        ['404', '414'],
        ['405', '415'],
        ['406', '416'],
        ['407', '417'],
        ['408', '418'],
        ['431', '441'],
        ['434', '444']
    ];

    for (const [idOrigen, idDestino] of pares) {
        try {
            const valor = await leerCampo(idOrigen);
            if (valor > 0) {
                console.log(`   ➤ [Ventas] Origen ${idOrigen} ($${valor}) -> Destino ${idDestino}`);
                const exito = await llenarCampo(idDestino, valor);
                if (exito) camposLlenados++;
            }
        } catch (e) {
            console.warn(`   ⚠️ Error procesando par ${idOrigen}->${idDestino}:`, e);
        }
    }

    console.log(`📊 FINALIZADO VENTAS: ${camposLlenados} campos procesados.`);
    
    // Colapsar Sección Ventas (Sequential Visual)
    await toggleSriSection('Ventas', false);

    if (window.sriAssistant?.showEliteToast && camposLlenados > 0) {
        window.sriAssistant.showEliteToast({
            title: '✅ Ventas Llenadas',
            msg: `Se han espejado ${camposLlenados} casilleros de ventas.`
        });
    }

    return camposLlenados;
}

async function llenarCompras(data) {
    console.group('🛍️ Llenado de COMPRAS v2.0 (Zero-Touch Elite)');
    let camposLlenados = 0;

    // Robusto: detectamos si nos pasan el objeto raíz o el de facturas
    const facturas = data.facturas || data;
    const notasCredito = data.notasCredito || null;

    if (!facturas || (!facturas.iva15 && !facturas.iva0)) {
        console.warn('⚠️ No hay datos de facturas válidos.');
        console.log('Datos recibidos:', JSON.stringify(data, null, 2));
        console.groupEnd();
        return 0;
    }

    console.log('📊 Datos de facturas detectados:');
    console.log('  - IVA 15%:', facturas.iva15);
    console.log('  - IVA 0%:', facturas.iva0);
    if (notasCredito) {
        console.log('📄 Notas de Crédito:');
        console.log('  - NC IVA 15%:', notasCredito.iva15);
        console.log('  - NC IVA 0%:', notasCredito.iva0);
    }

    // ─── PASO 1: Expandir Sección COMPRAS si está colapsada ───────────────────
    await toggleSriSection('COMPRAS', true);

    // ─── PASO 1.5: Número de Comprobantes (Casillero 115) ───────────────────
    const docsCount = facturas.totalFacturas || facturas.recibidosCount || 0;
    if (docsCount > 0) {
        console.log(`  📝 Casillero 115 (No. Comprobantes) = ${docsCount}`);
        // El usuario mencionó que el ID es concepto256 en su inspección, pero el casillero es 115
        if (await llenarCampo('115', docsCount)) {
            camposLlenados++;
            await sleep(600);
        }
    }


    // ─── PASO 2: Compras con IVA (casilleros 500 y 510) ──────────────────────
    console.log('\n🔍 Paso 2: Compras con IVA (15%)...');
    const base15 = parseDecimal(facturas.iva15?.baseImponible || 0);
    const nc15 = parseDecimal(notasCredito?.iva15?.baseImponible || 0);

    if (base15 > 0 || nc15 > 0) {
        console.log(`  Base Imponible 15%: $${base15.toFixed(2)} | NC: $${nc15.toFixed(2)}`);

        console.log('  📝 Casillero 500 (Compras 15% - Bruto)...');
        if (await llenarCampo('500', base15)) {
            camposLlenados++;
            console.log('  ⏳ Pausa para recálculo SRI tras 500...');
            await sleep(1500);
        }

        const valor510 = Math.max(0, base15 - nc15);
        console.log(`  📝 Casillero 510 = $${base15.toFixed(2)} - $${nc15.toFixed(2)} (NC) = $${valor510.toFixed(2)}`);
        if (await llenarCampo('510', valor510)) camposLlenados++;
        await sleep(800);

        // ─── ELITE v13.2: Notas de Crédito por compensar (15% -> 544) ─────────
        const valor544 = Math.max(0, nc15 - base15);
        if (valor544 > 0) {
            console.log(`  📝 [NC SURPLUS] Casillero 544 (Compensación 15%): $${valor544.toFixed(2)} (NC:$${nc15.toFixed(2)} > Base:$${base15.toFixed(2)})`);
            if (await llenarCampo('544', valor544)) camposLlenados++;
            await sleep(600);
        }
    } else {
        console.log('  ℹ️ Sin compras ni NC con IVA (15%).');
    }

    // ─── PASO 3: Compras sin IVA (casilleros 507 y 517) ──────────────────────
    console.log('\n🔍 Paso 3: Compras sin IVA (0%)...');
    const base0 = parseDecimal(facturas.iva0?.baseImponible || 0);
    const nc0 = parseDecimal(notasCredito?.iva0?.baseImponible || 0);

    if (base0 > 0 || nc0 > 0) {
        console.log(`  Base Imponible 0%: $${base0.toFixed(2)} | NC: $${nc0.toFixed(2)}`);

        console.log('  📝 Casillero 507 (Compras 0% - Bruto)...');
        if (await llenarCampo('507', base0)) camposLlenados++;
        await sleep(800);

        const valor517 = Math.max(0, base0 - nc0);
        console.log(`  📝 Casillero 517 = $${base0.toFixed(2)} - $${nc0.toFixed(2)} (NC) = $${valor517.toFixed(2)}`);
        if (await llenarCampo('517', valor517)) camposLlenados++;
        await sleep(800);

        // ─── ELITE v13.2: Notas de Crédito por compensar (0% -> 543) ──────────
        const valor543 = Math.max(0, nc0 - base0);
        if (valor543 > 0) {
            console.log(`  📝 [NC SURPLUS] Casillero 543 (Compensación 0%): $${valor543.toFixed(2)} (NC:$${nc0.toFixed(2)} > Base:$${base0.toFixed(2)})`);
            if (await llenarCampo('543', valor543)) camposLlenados++;
            await sleep(600);
        }
    } else {
        console.log('  ℹ️ Sin compras ni NC tarifa 0%.');
    }

    // ─── PASO 4: Valores Sugeridos (564 y 565) ───────────────────────────────
    console.log('\n🔍 Paso 4: Valores sugeridos (564 y 565)...');
    try {
        const sugeridos = await llenarValorSugerido();
        camposLlenados += sugeridos;
        console.log(`  ✅ ${sugeridos} valor(es) sugerido(s) llenados.`);
    } catch (e) {
        console.error('  ❌ Error capturando sugeridos:', e);
    }

    if (window.sriAssistant?.showEliteToast && camposLlenados > 0) {
        window.sriAssistant.showEliteToast({
            title: '✅ Compras Llenadas',
            msg: `Casilleros 500/510/507/517/564/565 procesados (${camposLlenados} campos).`
        });
    }

    console.group('\n📊 RESUMEN COMPRAS: ' + camposLlenados + ' campos llenados.');
    console.groupEnd();
    
    // Colapsar para que el usuario vea la siguiente sección
    await toggleSriSection('COMPRAS', false);
    
    return camposLlenados;
}

async function llenarRetenciones(data) {
    console.log('📋 Procesando RETENCIONES ...');
    let camposLlenados = 0;
    const { retenciones } = data;

    if (!retenciones) return 0;

    // Expandir Sección Resumen/Retenciones
    await toggleSriSection('RESUMEN', true);

    // 1. IVA Retenido (Casillero 609)
    if (retenciones.ivaRetenido && retenciones.ivaRetenido.total > 0) {
        console.log(`💎 IVA Retenido: ${retenciones.ivaRetenido.total}`);
        if (await llenarCampo('609', retenciones.ivaRetenido.total)) {
            camposLlenados++;
            console.log('   ✅ Campo 609 (Retenciones IVA) llenado.');
        }
    }

    // 2. RENTA Retenida (¡ELITE FIX: NO INYECTAR EN IVA!)
    if (retenciones.rentaRetenida && retenciones.rentaRetenida.total > 0) {
        console.log(`💡 Info: Retención de Renta ($${retenciones.rentaRetenida.total}) detectada. Ignorada para formulario de IVA mensual.`);
    }

    // No colapsamos aquí porque luego suelen venir los sugeridos en la misma sección (Resumen)
    // Pero actualizamos estado
    safeStatus('📋 Validando Sugeridos...');
    return camposLlenados;
}

async function llenarValorSugerido() {
    console.log('📋 Procesando Valores Sugeridos en COMPRAS (564, 565)...');

    // Paso clave: Forzar el recálculo del backend SRI (AJAX PrimeFaces).
    // Al hacer blur del foco activo y un click en body, PrimeFaces
    // dispara el onblur de los campos de compras y actualiza los campos .sugerido.
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT')) {
        activeElement.blur();
    }
    document.body.click();

    // Pausa de estabilidad: dar tiempo al SRI para calcular los sugeridos
    console.log('⏳ Esperando recálculo SRI para valores sugeridos (1.5s)...');
    await sleep(1500);

    let totalLlenados = 0;

    // Campo 564 (IVA en compras / Crédito Tributario del período)
    console.log('🔍 Procesando campo sugerido → 564...');
    if (await procesarCampoConSugerido('564')) {
        totalLlenados++;
        console.log('✅ Campo 564 llenado con valor sugerido.');
        await sleep(600);
    } else {
        console.log('ℹ️ Campo 564: sin valor sugerido (se deja en 0).');
    }

    // Campo 565 (Crédito Tributario para el período siguiente)
    console.log('🔍 Procesando campo sugerido → 565...');
    if (await procesarCampoConSugerido('565')) {
        totalLlenados++;
        console.log('✅ Campo 565 llenado con valor sugerido.');
    } else {
        console.log('ℹ️ Campo 565: sin valor sugerido (se deja en 0).');
    }

    return totalLlenados;
}

// Función robusta que encapsula la espera, detección y pegado de un valor sugerido.
// Estrategia 0: Mapa directo de IDs .sugerido confirmados por el usuario.
// Estrategia A: XPath por fila del casillero.
// Estrategia B: Detección por proximidad visual (original).
async function procesarCampoConSugerido(casillero) {
    console.log(`🔍 [Sugerido] Procesando casillero ${casillero}...`);
    await sleep(400);

    // ── ESTRATEGIA 0: Mapa directo de IDs .sugerido confirmados ───────────────────
    const sugeridoMap = {
        '564': 'concepto2130.sugerido', // IVA en compras (se intentará primero leer el 520)
        '565': 'concepto2140.sugerido', // Crédito tributario siguiente período
        '615': 'concepto2220.sugerido', // Resumen: sugerido 615
        '617': 'concepto2230.sugerido', // Resumen: sugerido 617
        '619': 'concepto2240.sugerido', // Resumen: sugerido 619
    };

    // --- FIX ESPCIAL 564: Solo si existe impuesto en ventas (421, 422, 425) ---
    if (casillero === '564') {
        const v421 = document.getElementById('concepto470');
        const v422 = document.getElementById('concepto480');
        const v425 = document.getElementById('concepto510');
        
        const salesTaxValue = (v421 ? parseDecimal(v421.value) : 0) + 
                             (v422 ? parseDecimal(v422.value) : 0) + 
                             (v425 ? parseDecimal(v425.value) : 0);

        if (salesTaxValue <= 0) {
            console.log(`  [564] ℹ️ Omitiendo sugerido: Impuesto en Ventas (421/422/425) es 0.`);
            return false;
        }

        const input520 = document.getElementById('concepto1290');
        if (input520) {
            const val520 = parseDecimal(input520.value);
            if (val520 > 0) {
                console.log(`  [564] 💎 USANDO VALOR DE 520 (IVA GENERADO): ${val520}`);
                const ok = await llenarCampo('564', val520);
                if (ok) return true;
            }
        }
    }

    const sugeridoId = sugeridoMap[casillero];
    if (sugeridoId) {
        const sugeridoInput = document.getElementById(sugeridoId);
        if (sugeridoInput) {
            // PrimeFaces actualiza la propiedad JS .value pero NO el atributo HTML
            const val = parseDecimal(sugeridoInput.value);
            console.log(`  [${casillero}] 📍 SugeridoMap: ${sugeridoId} = ${val}`);

            if (val !== 0) {
                // Buscar el input editable en la misma fila del .sugerido
                const row = sugeridoInput.closest('tr');
                const editableInput = row ? Array.from(
                    row.querySelectorAll('input[type="text"]')
                ).find(el => !el.readOnly && !el.disabled && el.offsetParent !== null) : null;

                if (editableInput) {
                    console.log(`  [${casillero}] ✏️ Escribiendo ${val} → ${editableInput.id || editableInput.name}`);
                    const ok = await llenarCampo(casillero, val);
                    if (ok) return true;
                    // Fallback: inyección directa
                    editableInput.focus();
                    editableInput.select();
                    const ins = document.execCommand('insertText', false, val.toFixed(2));
                    if (!ins) editableInput.value = val.toFixed(2);
                    ['input', 'change', 'blur'].forEach(ev =>
                        editableInput.dispatchEvent(new Event(ev, { bubbles: true }))
                    );
                    console.log(`  [${casillero}] ✅ Inyección directa: ${val}`);
                    return true;
                } else {
                    // No encontró editable en la fila, intentar llenarCampo con casillero
                    console.warn(`  [${casillero}] Sin editable en fila, intentando llenarCampo...`);
                    return await llenarCampo(casillero, val);
                }
            } else {
                console.log(`  [${casillero}] ℹ️ Sugerido es 0. Sin acción.`);
                return false;
            }
        } else {
            console.warn(`  [${casillero}] ⚠️ ID ${sugeridoId} no encontrado en el DOM. Continuando con XPath...`);
        }
    }

    // ── ESTRATEGIA A: XPath → fila → sugerido + editable ────────────────────────
    const xpaths = [
        `//td[contains(.,'${casillero}')]/ancestor::tr[1]`,
        `//span[contains(.,'${casillero}')]/ancestor::tr[1]`,
        `//label[contains(.,'${casillero}')]/ancestor::tr[1]`,
        `//*[normalize-space(text())='${casillero}']/ancestor::tr[1]`
    ];

    for (const xpath of xpaths) {
        try {
            const row = document.evaluate(
                xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            ).singleNodeValue;
            if (!row) continue;

            const sugeridoInput = row.querySelector(
                'input.sugerido, input[id*="sugerido"][readonly], input[readonly][style*="0000FF"]'
            );
            const editableInput = Array.from(
                row.querySelectorAll('input[type="text"]')
            ).find(el => !el.readOnly && !el.disabled && el.offsetParent !== null);

            if (sugeridoInput) {
                const val = parseDecimal(sugeridoInput.value);
                console.log(`  [${casillero}] XPath sugerido: ${sugeridoInput.id} = ${val}`);

                if (val !== 0 && editableInput) {
                    const ok = await llenarCampo(casillero, val);
                    if (ok) return true;
                    editableInput.focus();
                    editableInput.select();
                    const ins = document.execCommand('insertText', false, val.toFixed(2));
                    if (!ins) editableInput.value = val.toFixed(2);
                    ['input', 'change', 'blur'].forEach(ev =>
                        editableInput.dispatchEvent(new Event(ev, { bubbles: true }))
                    );
                    return true;
                } else if (val === 0) {
                    console.log(`  [${casillero}] ℹ️ Valor sugerido XPath es 0.`);
                    return false;
                }
            }
        } catch (e) {
            console.warn(`  XPath error para casillero ${casillero}:`, e.message);
        }
    }

    // ── ESTRATEGIA B: Fallback por proximidad visual (original) ────────────────────
    console.log(`  [${casillero}] Fallback: detección por proximidad visual...`);
    let resultado = { found: false, value: 0 };

    for (let i = 0; i < 10; i++) {
        const input = await encontrarInputPorCasillero(casillero);
        if (!input) { await sleep(300); continue; }

        resultado = await detectarValorSugeridoEnDOM(casillero, input);
        if (resultado.found) {
            console.log(`  ✨ [${casillero}] Detectado por proximidad: ${resultado.value}`);
            break;
        }
        if (i === 4) { document.body.click(); await sleep(300); }
        await sleep(400);
    }

    // --- FALLBACK EXTREMO PARA 615/617: Buscar texto en la fila si falló lo anterior ---
    if (!resultado.found && ['615', '617'].includes(casillero)) {
        const input = await encontrarInputPorCasillero(casillero);
        const row = input ? input.closest('tr') : null;
        if (row) {
            const textNodes = row.innerText.match(/\d+[\.,]\d{2}/g);
            if (textNodes && textNodes.length > 0) {
                // El sugerido suele ser el último número en la fila antes del input
                const numericVal = parseDecimal(textNodes[textNodes.length - 1]);
                if (numericVal > 0) {
                    console.log(`  [${casillero}] 🕵️ Detectado texto en fila (Fallback): ${numericVal}`);
                    resultado = { found: true, value: numericVal };
                }
            }
        }
    }

    if (resultado.found && resultado.value !== 0) {
        return await llenarCampo(casillero, resultado.value);
    }

    console.warn(`⚠️ Sin valor sugerido para ${casillero}`);
    return false;
}

// Eliminar definición duplicada (consolidada más abajo)

/**
 * Helper Elite: Expande o Colapsa una sección del formulario SRI con visibilidad secuencial.
 * @param {string} sectionName - 'VENTAS', 'COMPRAS', 'RESUMEN'
 * @param {boolean} expand - true para abrir, false para cerrar
 */
async function toggleSriSection(sectionName, expand = true) {
    const idMap = {
        'VENTAS': 'seccionVentas',
        'COMPRAS': 'seccionAdquisiciones',
        'RESUMEN': 'seccionResumenImpositivo'
    };
    
    const target = idMap[sectionName.toUpperCase()];
    const header = document.querySelector(`[id*="${target}"] .ui-accordion-header`) || 
                 Array.from(document.querySelectorAll('.ui-accordion-header')).find(el => {
                     const txt = el.textContent.toUpperCase();
                     return txt.includes(sectionName.toUpperCase()) || (sectionName === 'COMPRAS' && txt.includes('ADQUISICIONES'));
                 });

    if (!header) return console.warn(`⚠️ No se encontró la sección ${sectionName}`);

    // ELITE FIX: Verificar estado real de forma más robusta (Header + Contenedor)
    const container = document.querySelector(`[id*="${target}"]:not(.ui-accordion-header)`);
    const isExpanded = header.getAttribute('aria-expanded') === 'true' || 
                      header.classList.contains('ui-state-active') || 
                      (container && container.style.display !== 'none' && container.offsetHeight > 0);
    
    if (expand && !isExpanded) {
        console.log(`🔓 [ELITE] Expandiendo sección: ${sectionName}`);
        header.click();
        await sleep(1500); // Aumentado para estabilidad del DOM
    } else if (!expand && isExpanded) {
        console.log(`🔒 [ELITE] Colapsando sección: ${sectionName}`);
        header.click();
        await sleep(600);
    } else {
        console.log(`ℹ️ [ELITE] Sección ${sectionName} ya está en el estado deseado (${expand ? 'Expandido' : 'Colapsado'}).`);
    }
}

async function llenarCampo(casillero, valor) {
    let input = await encontrarInputPorCasillero(casillero);
    if (!input) {
        input = document.querySelector(`input[id$=":${casillero}"]`) ||
            document.querySelector(`input[name$=":${casillero}"]`) ||
            document.querySelector(`input[id*="concepto${casillero}"]`) ||
            document.querySelector(`input[id*="casillero${casillero}"]`);
    }

    if (!input) {
        console.warn(`🚫 Casillero ${casillero} NO ENCONTRADO en el DOM.`);
        return false;
    }

    // --- ELITE FIX: Auto-expandir si el elemento está oculto ---
    if (input.offsetParent === null) {
        console.log(`🔍 Casillero ${casillero} encontrado pero OCULTO. Intentando expandir sección...`);
        const parentSection = input.closest('.ui-accordion-content') || input.closest('fieldset') || input.closest('div[id*="seccion"]');
        if (parentSection) {
            const header = parentSection.previousElementSibling || document.querySelector(`a[aria-controls="${parentSection.id}"]`);
            if (header) {
                console.log('📂 Click en cabecera para mostrar campo...');
                header.click();
                await sleep(800);
            }
        }
    }

    if (input.disabled || input.readOnly) {
        console.warn(`🚫 Casillero ${casillero} está BLOQUEADO (disabled: ${input.disabled}, readOnly: ${input.readOnly}).`);
        return false;
    }

    const valorFormateado = parseFloat(valor).toFixed(2);

    try {
        input.focus();
        const rect = input.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
            input.scrollIntoView({ behavior: 'auto', block: 'center' });
        }

        input.select();
        const ok = document.execCommand('insertText', false, valorFormateado);
        if (!ok) {
            input.value = valorFormateado;
        }

        ['input', 'change', 'blur'].forEach(e => input.dispatchEvent(new Event(e, { bubbles: true })));

        // Verificación y re-intento si es necesario
        await sleep(300);
        if (parseDecimal(input.value) !== parseDecimal(valorFormateado)) {
            input.value = valorFormateado;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        console.log(`✅ ${casillero}: ${valorFormateado}`);
        return true;
    } catch (e) {
        console.error(`❌ Error en ${casillero}:`, e);
        return false;
    }
}

async function leerCampo(casillero) {
    console.log(`   🔍 Leyendo casillero ${casillero}...`);

    // 1. PRIORIDAD: Buscar en la tabla usando XPath EXACTO (para campos calculados como 401, 403)
    // IMPORTANTE: NO usar starts-with() — causa falsos positivos entre casilleros vecinos (ej. 401 vs 403)
    const xpaths = [
        `//td[normalize-space(text())='${casillero}']/following-sibling::td[1]`,          // Exacto en td
        `//span[normalize-space(text())='${casillero}']/ancestor::td/following-sibling::td[1]`, // Exacto en span
        `//label[normalize-space(text())='${casillero}']/ancestor::td/following-sibling::td[1]` // Exacto en label
    ];

    for (const xpath of xpaths) {
        try {
            const resultado = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const celda = resultado.singleNodeValue;

            if (celda) {
                // Buscar SOLO inputs visibles (type=text) — ignorar hidden de PrimeFaces
                const inputInterno = celda.querySelector('input[type="text"]') || celda.querySelector('input:not([type="hidden"])');

                if (inputInterno) {
                    // SIEMPRE usar el valor del input cuando existe — evita concatenación de textContent
                    const valorInput = parseDecimal(inputInterno.value);
                    console.log(`   📖 Casillero ${casillero} (XPath+Input[text]) = ${valorInput}`);
                    return valorInput;
                } else {
                    // Solo usar textContent si la celda NO tiene input (celda de solo lectura)
                    // Usamos el primer nodo de texto directo para evitar concatenación de hijos
                    let textoDirecto = '';
                    for (const nodo of celda.childNodes) {
                        if (nodo.nodeType === Node.TEXT_NODE && nodo.textContent.trim()) {
                            textoDirecto = nodo.textContent.trim();
                            break;
                        }
                    }
                    const valorTexto = textoDirecto ? parseDecimal(textoDirecto) : parseDecimal(celda.textContent.trim());
                    console.log(`   📖 Casillero ${casillero} (XPath Texto) = ${valorTexto}`);
                    return valorTexto;
                }
            }
        } catch (e) { }
    }

    // 2. FALLBACK: Intentar encontrar como Input directo
    let input = await encontrarInputPorCasillero(casillero);
    if (input) {
        const valorTexto = input.value || '0';
        const valorNumerico = parseDecimal(valorTexto);

        // Si el input tiene un valor válido > 0, usarlo
        if (valorNumerico > 0) {
            console.log(`   📖 Casillero ${casillero} (Input) = ${valorTexto}`);
            return valorNumerico;
        }

        // Si el input está en 0, buscar el valor en elementos de texto cercanos
        const parent = input.closest('td') || input.parentElement;
        if (parent) {
            const spans = parent.querySelectorAll('span, label, div');
            for (const span of spans) {
                const texto = span.textContent.trim();
                if (texto.match(/[\d\.,]+/) && !texto.includes(casillero)) {
                    const valorSpan = parseDecimal(texto);
                    if (valorSpan > 0) {
                        console.log(`   📖 Casillero ${casillero} (Span cerca de Input) = ${texto}`);
                        return valorSpan;
                    }
                }
            }
        }

        console.log(`   📖 Casillero ${casillero} (Input) = ${valorTexto}`);
        return valorNumerico;
    }

    console.warn(`   ⚠️ No se encontró campo ni valor para casillero ${casillero}`);
    return 0;
}

async function encontrarInputPorCasillero(casillero) {
    // 0. PRIMARY: Manual Map & Validated ID pattern
    // MAPA CONFIRMADO: casillero -> id real del DOM del SRI
    // ORIGEN (Bruto, solo lectura — se leen):
    //   401 -> concepto450   (Ventas tarifa != 0%, bruto)
    //   403 -> concepto570   (Ventas tarifa 0%, bruto)
    // DESTINO (Neto, editables — se llenan):
    //   411 -> concepto460   (Ventas tarifa != 0%, neto)
    //   413 -> concepto580   (Ventas tarifa 0%, neto)
    const fieldMap = {
        // ── VENTAS (Confirmado por DOM) ────────────────────────────────
        '401': 'concepto450',  // Ventas tarifa != 0% (Bruto)
        '411': 'concepto460',  // Ventas tarifa != 0% (Neto)
        '403': 'concepto570',  // Ventas tarifa 0% (Bruto)
        '413': 'concepto580',  // Ventas tarifa 0% (Neto)
        // ── COMPRAS (Adquisiciones) ──────────────────────────────────
        // Confirmados por el usuario desde el DOM del SRI
        '500': 'concepto1270', // Base imponible compras tarifa != 0% (Bruto)
        '510': 'concepto1280', // Base neta compras tarifa != 0% (Bruto - NC)
        '507': 'concepto1720', // Base imponible compras tarifa 0% (Bruto)
        '517': 'concepto1730', // Base neta compras tarifa 0% (Bruto - NC)
        // ── RESUMEN IMPOSITIVO ─────────────────────────────────
        // Confirmados por el usuario desde el DOM del SRI
        '601': 'concepto2140', // Impuesto causado (Derived)
        '602': 'concepto2150', // Crédito tributario periodo (si 499-564 < 0)
        '605': 'concepto2160', // Saldo crédito anterior (Comprobantes)
        '606': 'concepto2170', // Saldo retenciones anterior (Comprobantes)
        '609': 'concepto2200', // Retenciones IVA (solo IVA, NO renta)
        '520': 'concepto1290', // Impuesto Generado Compras (Fuente para 564)
        '564': 'concepto2130', // Crédito tributario periodo (Destino para 520)
        '615': 'concepto2220', // Saldo crédito próximo mes (Calculado)
        '617': 'concepto2230', // Saldo retenciones próximo mes (Calculado)
        '421': 'concepto470',  // Impuesto generado ventas diferente de 0%
        '422': 'concepto480',  // Impuesto generado ventas activo fijo
        '425': 'concepto510',  // Impuesto generado ventas otros
        '499': 'concepto1260', // Total impuesto a liquidar (Summary)
        '115': 'concepto256',  // Número de comprobantes (Compras) - ELITE MANUAL MAP
        '544': 'concepto1890', // NC por compensar 15% ( Assumption based on pattern )
        '543': 'concepto1900', // NC por compensar 0% ( Confirmado por el usuario )
    };

    if (fieldMap[casillero]) {
        const mappedInput = document.getElementById(fieldMap[casillero]);
        if (mappedInput) {
            console.log(`   ✅ Encontrado por FieldMap (${casillero} -> ${fieldMap[casillero]})`);
            return mappedInput;
        }
    }

    const inputByConcepto = document.getElementById(`concepto${casillero}`);
    if (inputByConcepto) return inputByConcepto;

    // 1. Regex ID Robust (All inputs) - Check this FIRST as it's most precise if ID exists
    const inputById = document.querySelector(`input[id$=":${casillero}"], input[name$=":${casillero}"]`);
    if (inputById) return inputById;

    // 2. XPath: Celda con numero EXACTO -> Siguiente Celda -> Input[type=text] ÚNICAMENTE
    // CRÍTICO: usar [@type='text'] para NO capturar inputs hidden que PrimeFaces inyecta
    const xpaths = [
        `//td[normalize-space(text())='${casillero}']/following-sibling::td[1]//input[@type='text']`, // Sibling cell text input
        `//span[normalize-space(text())='${casillero}']/ancestor::td/following-sibling::td[1]//input[@type='text']`, // Span label -> sibling
        `//label[normalize-space(text())='${casillero}']/ancestor::td/following-sibling::td[1]//input[@type='text']`, // Label -> sibling
        `//td[normalize-space(text())='${casillero}']//input[@type='text']` // Input dentro de la misma celda (último recurso)
    ];

    for (const xpath of xpaths) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const el = result.singleNodeValue;
            if (el && el.tagName === 'INPUT' && el.type === 'text') {
                console.log(`   ✅ Encontrado por XPath Strict [type=text] (${casillero}): id=${el.id}`);
                return el;
            }
        } catch (e) { }
    }

    // 3. Fallback Regex ID loop (solo inputs type=text — jamás hidden)
    const inputs = document.querySelectorAll('input[type="text"]');
    const regex = new RegExp(`(\\D|^)${casillero}$`);

    for (const input of inputs) {
        if (regex.test(input.id) || regex.test(input.name)) {
            console.log(`   ✅ Encontrado por Regex (${casillero}): ID=${input.id}`);
            return input;
        }
    }

    return null;
}

// ============================================
// FUNCIONES DE LLENADO DE FORMULARIO
// ============================================


// Helper: Check if a number looks like a field ID (casillero)
function isFieldId(num) {
    // SRI form fields are typically in ranges: 400-499, 500-599, 600-699, 700-899
    // We treat any integer in the 400-899 range as a potential ID to ignore as a value
    // EXCEPT if it's 0, which is never a field ID but is a common value.
    if (num === 0) return false;
    return Number.isInteger(num) && num >= 400 && num <= 899;
}

async function detectarValorSugeridoEnDOM(casillero, inputElement) {
    if (!inputElement) return { found: false, value: 0 };

    await sleep(150); // Reducido de 400 a 150
    const inputRect = inputElement.getBoundingClientRect();

    console.log(`      [*] [${casillero}] OJO DE HALCON Turbo V8.1...`);

    const parseRobust = (t) => {
        if (!t) return null;
        // Limpiar y capturar el primer numero (soporta decimales con punto o coma)
        const matches = t.match(/(\d+[.,]\d+|\b\d+\b)/);
        if (!matches) return null;
        return parseDecimal(matches[0]);
    };

    const esIdCasillero = (n, text) => {
        if (n === null) return false;
        // SRI: IDs de casilleros son usualmente 401, 500, etc.
        // Si el numero coincide con un casillero pero tiene etiquetas como "Base", "IVA", etc, dejar pasar.
        if (n >= 400 && n <= 700 && Number.isInteger(n)) {
            // Permitir explícitamente el 0 si es un valor sugerido real (muy común)
            if (n === 0) return false;
            // SI el texto alrededor dice "Casillero" o parece un ID, bloquearlo
            if (text && (text.includes('Casillero') || text.includes('Cod.'))) return true;

            // Si coincide con el propio casillero que estamos llenando, es definitivamente un label.
            if (n.toString() === casillero) return true;

            // Fallback: si es un numero redondo tipico de casillero (401, 411, 500, 510, 601, 615, 617, 619, 654, 655)
            const commonFields = [401, 411, 403, 413, 500, 510, 507, 517, 564, 565, 601, 602, 609, 615, 617, 619, 654, 655];
            if (commonFields.includes(n)) return true;
        }
        return false;
    };

    try {
        // 1. ESCANEO POR CLASE DIRECTA (The Oracle's Shortcut)
        const sugeridosInputs = Array.from(document.querySelectorAll('input.sugerido, .input-sugerido, input[id*="sugerido"]'))
            .filter(el => {
                const r = el.getBoundingClientRect();
                return Math.abs(r.top - inputRect.top) < 20;
            });

        if (sugeridosInputs.length > 0) {
            for (const sug of sugeridosInputs) {
                const val = parseRobust(sug.value || sug.getAttribute('value'));
                if (val !== null && val > 0) {
                    return { found: true, value: val };
                }
            }
        }

        // 2. ESCANEO DE FILA FISICA
        const rowElements = Array.from(document.querySelectorAll('span, b, label, td, input, div'))
            .filter(el => {
                const r = el.getBoundingClientRect();
                return Math.abs(r.top - inputRect.top) < 15;
            });

        const candidates = rowElements.map(el => {
            const textContent = el.tagName === 'INPUT' ? (el.value || el.getAttribute('value')) : el.textContent;
            const val = parseRobust(textContent);
            const r = el.getBoundingClientRect();

            return {
                val: val,
                distX: Math.abs(r.left - inputRect.left),
                isInput: el.tagName === 'INPUT',
                isSugeridoClass: el.classList.contains('sugerido'),
                text: textContent ? textContent.trim() : ""
            };
        }).filter(c => c.val !== null && !esIdCasillero(c.val, c.text));

        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                if (a.isSugeridoClass && !b.isSugeridoClass) return -1;
                if (!a.isSugeridoClass && b.isSugeridoClass) return 1;
                if (a.isInput && !b.isInput) return -1;
                if (!a.isInput && b.isInput) return 1;
                return a.distX - b.distX;
            });

            return { found: true, value: candidates[0].val };
        }

    } catch (e) {
        console.warn("Error en Ojo de Halcón:", e);
    }

    return { found: false, value: 0 };
}


async function detectarValorSugerido() {
    const input564 = await encontrarInputPorCasillero('564');
    const res = await detectarValorSugeridoEnDOM('564', input564);
    return res.found ? res.value : 0;
}

// Función genérica para detectar y llenar valor sugerido de cualquier campo
async function llenarValorSugeridoCampo(casillero) {
    return await procesarCampoConSugerido(casillero);
}



// ============================================
// ASISTENTE FLOTANTE (PANEL EN PAGINA)
// ============================================

class SriAssistantPanel {
    constructor() {
        this.container = null;
        this.isPaused = false;
        this.isOnForm = false;
        this.manualMode = false; // ELITE v12.7: Modo Manual para interacción
        this.proactiveObligation = null;
        this.contextCard = null; // ELITE: Nueva Tarjeta de Contexto
        this.isExpanded = true; // Default, will be overwritten by storage
        this.state = {
            isProcessing: false,
            isProcessingFinal: false
        };
        this.suggestionShownOnThisPage = false; 
        this.lastUrl = window.location.href; // Track URL for SPA changes
        this.scanInterval = null;
        this.init();

        // Verificar si estamos en el formulario de declaración
        if (window.location.href.includes('declaracionImpuesto.jsf') || window.location.href.includes('recibirDeclaracion.jsf')) {
            this.isOnForm = true;
            this.renderPill(); // Re-renderizar para mostrar el HUD de Formulario

            // Auto-verificación de datos al cargar formulario
            setTimeout(() => {
                if (typeof verifySessionConsistency === 'function') {
                    verifySessionConsistency();
                }
            }, 1000);
        }

        // Detección Proactiva de Obligaciones (Solo si no estamos en formulario)
        if (!this.isOnForm) {
            this.scanObligacionesSRI();
        }
    }

    clearCards() {
        if (this.contextCard) {
            this.contextCard.remove();
            this.contextCard = null;
        }
        const existing = document.querySelectorAll('.elite-context-card');
        existing.forEach(e => e.remove());
    }

    // Persistencia de Estado (Minimized/Expanded)
    async saveState() {
        await SafeStorage.set({ assistantExpanded: this.isExpanded });
    }

    async runUnifiedWorkflow(actionType, data) {
        console.log('💎 ELITE WORKFLOW INITIATED:', actionType, data);

        // ELITE v12.5: Cargar periodo de memoria si no viene en data
        let period = null;
        if (data) {
            period = {
                year: data.year,
                monthIndex: (data.month || 1) - 1
            };
        } else {
            const stored = await SafeStorage.get(['workflowPeriod']);
            if (stored.workflowPeriod) {
                console.log('📦 Recuperando periodo de memoria:', stored.workflowPeriod);
                period = stored.workflowPeriod;
            }
        }

        if (actionType === 'NAVIGATE_AND_FILL') {
            const periodToUse = period || { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 };
            await GhostMemory.set('workflowState', {
                step: 'NAVIGATING',
                targetPeriod: periodToUse,
                autoFill: true
            });

            if (typeof ejecutarNavegacionDeclaracion === 'function') {
                ejecutarNavegacionDeclaracion(periodToUse);
            } else {
                window.location.href = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones';
            }
        }
        else if (actionType === 'EXTRACT_DATA') {
            const periodToUse = period || { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 };
            await SafeStorage.set({
                pendingAction: 'autoFillSearch',
                workflowPeriod: periodToUse,
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });

            this.showEliteToast({
                title: "💎 Paso 1: Extracción",
                msg: `Configurando para ${periodToUse.year}...`
            });

            if (typeof navegarAComprobantes === 'function') {
                navegarAComprobantes();
            } else {
                window.location.href = SRI_RECIBIDOS_URL;
            }
        }
        else if (actionType === 'TURBO_FULL') {
            const periodToUse = period || { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 };
            await SafeStorage.set({
                pendingAction: 'autoFillSearch',
                workflowPeriod: periodToUse,
                turboMode: true,
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });

            this.showEliteToast({
                title: "🚀 MODO TURBO",
                msg: `Ciclo completo para ${periodToUse.year}`
            });

            if (typeof navegarAComprobantes === 'function') {
                navegarAComprobantes();
            } else {
                window.location.href = SRI_RECIBIDOS_URL;
            }
        }
        else if (actionType === 'NAVIGATE_ONLY') {
            const periodToUse = period || { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 };
            console.log('🌍 NAVIGATE_ONLY triggered with period:', periodToUse);

            await SafeStorage.set({
                pendingAction: 'startIvaNavigation',
                workflowPeriod: periodToUse,
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });

            const currentUrl = window.location.href;
            const targetUrl = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones';

            if (currentUrl.includes('/SriDeclaraciones/Publico/declaraciones')) {
                this.showEliteToast({ title: "🚀 Iniciando", msg: "Buscando formulario..." });
                await sleep(500);
                ejecutarNavegacionDeclaracion(periodToUse);
            } else {
                await sleep(500);
                window.location.href = targetUrl;
            }
        }
    }

    async init() {
        try {
            if (document.getElementById('sri-assistant-panel-root')) return;
            if (!document.body) {
                setTimeout(() => this.init(), 500);
                return;
            }

            // Manejo de Contenedor: Crear o Recuperar lo antes posible
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'sri-assistant-panel-root';
            }
            this.container.style.cssText = `
                position: fixed;
                bottom: 25px;
                left: 25px;
                width: 320px;
                background: rgba(15, 23, 42, 0.7);
                backdrop-filter: blur(25px) saturate(200%);
                -webkit-backdrop-filter: blur(25px) saturate(200%);
                box-shadow: 0 20px 50px rgba(0,0,0,0.3), 0 0 1px rgba(255,255,255,0.3);
                border-radius: 20px;
                z-index: 999999;
                font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                border: 1px solid rgba(255, 255, 255, 0.15);
                overflow: hidden;
                color: white;
            `;
            
            // Render basic UI first before any async operations
            this.render();
            document.body.appendChild(this.container);

            // Recuperar Estado de Persistencia de forma no bloqueante
            SafeStorage.get(['assistantExpanded']).then(stored => {
                const isExp = stored.assistantExpanded !== undefined ? stored.assistantExpanded : true;
                if (this.isExpanded !== isExp) {
                    this.isExpanded = isExp;
                    this.render(); // Re-render with right state if changed
                }
            }).catch(e => console.warn('No se pudo recuperar assistantExpanded', e));

            // Operaciones asincronas retrasadas para no bloquear UI
            this.checkRucChange().catch(e => console.warn('checkRucChange error', e));

            this.syncPauseState();
            this.startStorageListener();
            this.startHeartbeat(); // ELITE: Mantener sesión viva

            // Inicializar scanner si corresponde
            this.checkScanRequirement();
        } catch (e) {
            console.error('❌ [SRI ELITE] Error Crítico en Initialization:', e);
            // Intento de recuperación mínima: Re-intentar render
            if (this.container && document.body) {
                document.body.appendChild(this.container);
                this.render();
            }
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(async () => {
            try {
                // --- VISIBILITY GUARD ---
            if (this.container && !document.getElementById('sri-assistant-panel-root')) {
                console.log('🛡️ [VISIBILITY GUARD] Re-inyectando panel removido por SPA...');
                document.body.appendChild(this.container);
            }

            // --- URL CHANGE DETECTION (SPA) ---
            if (window.location.href !== this.lastUrl) {
                console.log('🌍 [SPA NAVIGATION] URL detectada:', window.location.href);
                this.lastUrl = window.location.href;
                this.suggestionShownOnThisPage = false;
                this.checkScanRequirement();
            }

            if (await checkSessionAlive()) {
                console.log('💓 Ghost Heartbeat: Sesión activa y protegida.');
            }
            // --- SMART FORM DETECTION ---
            await this.checkIfOnForm();
            // --- SUCCESS DETECTION ---
            await this.checkMissionAccomplished();
            } catch (e) {
                console.warn('💓 [HEARTBEAT] Error controlado:', e);
            }
        }, 3000); // Frecuencia aumentada para detección reactiva (3s)
    }

    // ELITE v14.5: Centraliza el inicio/fin del scanner de obligaciones
    checkScanRequirement() {
        const isScanArea = window.location.href.includes('/perfil') || 
                          window.location.href.includes('inicio.jsf') || 
                          window.location.href.includes('general/inicio');
        
        if (isScanArea) {
            if (!this.scanInterval) {
                console.log('📡 [SCANNER] Iniciando escáner de obligaciones en esta área...');
                setTimeout(() => this.scanObligacionesSRI(), 800);
                this.scanInterval = setInterval(() => this.scanObligacionesSRI(), 5000);
            }
        } else {
            if (this.scanInterval) {
                console.log('🔕 [SCANNER] Saliendo de área de escaneo. Intervalo detenido.');
                clearInterval(this.scanInterval);
                this.scanInterval = null;
            }
        }
    }

    // ELITE v9.5: Detector de Éxito de Declaración
    async checkMissionAccomplished() {
        const successSelectors = [
            '.confirmacion-envio',
            '.ui-messages-info-summary',
            '#frmFlujoDeclaracion\\:msjGeneral_container'
        ];

        const successText = [
            'LA DECLARACIÓN HA SIDO PROCESADA E ENVIADA',
            'COMPROBANTE ELECTRÓNICO PROCESADO CON ÉXITO',
            'TRANSACCIÓN EXITOSA',
            'DECLARACIÓN ENVIADA'
        ];

        let found = false;
        for (const sel of successSelectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) {
                const text = el.innerText.toUpperCase();
                if (successText.some(t => text.includes(t))) {
                    found = true;
                    break;
                }
            }
        }

        // Fallback: buscar por texto
        if (!found) {
            const bodyText = document.body.innerText.toUpperCase();
            if (bodyText.includes('HA SIDO PROCESADA') && bodyText.includes('CONFIRMACIÓN')) {
                found = true;
            }
        }

        if (found && !this.missionReportShown) {
            this.missionReportShown = true;
            console.log('🏆 ¡MISIÓN CUMPLIDA! Declaración detectada con éxito.');
            const info = this.extractClientInfo();

            if (info.ruc) {
                const historyKey = `history_elite_${info.ruc}`;
                const historyData = await SafeStorage.get([historyKey]) || {};
                const history = historyData[historyKey] || { records: [] };
                history.records.push({
                    date: Date.now(),
                    action: "Declaración detectada como enviada",
                    status: "Éxito"
                });
                await SafeStorage.set({ [historyKey]: history });
            }

            this.showEliteToast({
                title: "🏆 MISIÓN CUMPLIDA",
                msg: `La declaración de ${info.name || info.ruc} fue enviada con éxito.`,
                duration: 10000
            });

            this.log('🏆 Declaración Exitosa. ¿Limpiar memoria?');
            this.renderMissionSuccessHUD();
        }
    }

    renderMissionSuccessHUD() {
        const status = this.container.querySelector('#sri-panel-status');
        if (status) {
            status.innerHTML = `
                <div style="background: rgba(16, 185, 129, 0.1); padding: 5px; border-radius: 8px; border: 1px solid #10b981;">
                    <div style="color: #10b981; font-weight: 800; font-size: 11px;">🏆 ÉXITO DETECTADO</div>
                    <div style="font-size: 10px; margin-top: 4px;">¡Felicidades! ¿Deseas liberar la memoria de este cliente?</div>
                    <button id="btn-success-cleanup" style="margin-top: 8px; background: #10b981; color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-weight: 800; width: 100%;">🧹 SÍ, LIMPIAR TODO</button>
                </div>
            `;
            const btn = status.querySelector('#btn-success-cleanup');
            if (btn) {
                btn.onclick = async () => {
                    await GhostMemory.clearCurrent();
                    this.missionReportShown = false;
                    this.log('✅ Memoria liberada. ¡Buen trabajo!');
                    setTimeout(() => this.render(), 2000);
                };
            }
        }
    }

    // ELITE v9.0: Detector de Formulario Maestro
    async checkIfOnForm() {
        // ELITE FIX: Removido el check de URL (recibirDeclaracion.jsf) porque el wizard comparte la misma URL
        // y causaba que se detectara el formulario antes de que los campos existieran, bloqueando el auto-llenado.
        const hasFormFields = document.getElementById('concepto401') ||
            document.querySelector('input[id*="concepto"]') ||
            document.querySelector('input[id*="casillero"]');

        const wasOnForm = this.isOnForm;
        this.isOnForm = !!hasFormFields;

        if (this.isOnForm && !wasOnForm) {
            console.log('✨ [Detection] ¡Formulario IVA Detectado! Mostrando HUD Elite.');
            this.toggleMinimize(false); // Expandir si aterrizamos en el form
            this.render();

            // ELITE FEATURE: Sugerir Step 1 si el formulario es nuevo - Evitar duplicados
            if (!this.suggestionShownOnThisPage) {
                this.suggestionShownOnThisPage = true;
                setTimeout(() => this.suggestWorkflowStartOnForm(), 1500);
            }
        } else if (!this.isOnForm && wasOnForm) {
            this.render(); // Re-renderizar para quitar el card si salimos
        }
    }

    // ELITE v12.7: Toggle Modo Manual
    toggleManualMode(val) {
        this.manualMode = val !== undefined ? val : !this.manualMode;
        console.log(`🛠️ Modo Manual: ${this.manualMode ? 'ACTIVADO' : 'DESACTIVADO'}`);
        this.render();

        if (this.manualMode) {
            this.showEliteToast({
                title: '🛠️ MODO MANUAL',
                msg: 'Protección de cuadros de diálogo pausada. Puedes interactuar libremente.',
                duration: 4000
            });
        }
    }

    // ELITE v11: Proactive Workflow Suggestion on Form
    async suggestWorkflowStartOnForm() {
        if (this.suggestionDismissed) return; // ELITE FIX: No molestar si ya se ignoró
        console.log('🔎 Analizando formulario para sugerencias proactivas...');

        // 1. PRIMERO: Verificar si ya tenemos datos en memoria (GhostMemory)
        const data = await GhostMemory.getData();
        const hasData = data && (data.facturas || data.retenciones);

        if (hasData) {
            console.log('✅ Datos en memoria detectados.');

            // ELITE v11: Sugerir llenado SOLO si fue extracción mensual (no bulk)
            const storage = await SafeStorage.get(['workflowPeriod', 'bulkFlow', 'autoDeclaration']);
            const period = storage.workflowPeriod;
            const isBulk = storage.bulkFlow && storage.bulkFlow.results && storage.bulkFlow.results.length > 1;

            // 1. Hay periodo definido (indica extracción intencial)
            // 2. NO es bulk (o es autoDeclaration forzado por el usuario)
            if (period && (!isBulk || storage.autoDeclaration)) {
                console.log('🚀 [ELITE] Lanzando sugerencia de llenado fase 3...');
                this.suggestStep3(storage.autoDeclaration);
                return;
            }

            // Si es bulk o no hay periodo, no sugerimos nada (usuario usa botones manuales)
            console.log('ℹ️ Datos disponibles pero no se sugiere llenado automático (bulk o sin periodo).');
            return;
        }

        // 2. SEGUNDO: Si NO hay datos, verificar si el formulario está limpio para sugerir extracción
        const isEmpty = await this.isFormEmpty();
        if (!isEmpty) {
            console.log('⚠️ Formulario con datos detectados. No se sugiere inicio.');
            return;
        }

        // Caso: Formulario Vacio + Sin Datos -> Sugerir Paso 1 (Extracción)
        // Intentar deducir el periodo del formulario para la extracción
        const period = this.extractFormPeriod();
        const periodText = period ? `${period.monthName} ${period.year}` : 'el periodo correspondiente';

        // Si encontramos periodo, lo usamos para configurar la extracción
        const actionData = period ? { month: period.month, year: period.year } : null;

        this.showContextCard({
            title: '🚀 Nueva Declaración Detectada',
            subtitle: 'PASO 1: EXTRACCIÓN DE DATOS',
            message: `El formulario está listo pero <b>falta importar los datos</b> de ${periodText}.<br>¿Deseas ir a Comprobantes Recibidos para extraerlos?`,
            icon: '🦅',
            actionText: 'SÍ, EXTRAER FACTURAS',
            onAction: () => {
                this.runUnifiedWorkflow('EXTRACT_DATA', actionData);
            }
        });
    }

    async isFormEmpty() {
        // Verificar casilleros clave de llenado (Ventas 401, Compras 500)
        // Usamos la función global leerCampo
        /* Nota: leerCampo puede demorar un poco, usamos selectores directos rápidos para check inicial */
        try {
            // Check rápido de inputs visibles
            const inputs = document.querySelectorAll('input[id*="concepto"], input[id*="casillero"]');
            let hasValue = false;
            for (const inp of inputs) {
                if (inp.value && parseDecimal(inp.value) > 0) {
                    hasValue = true;
                    break;
                }
            }
            if (hasValue) return false;

            // Check profundo con leerCampo para campos clave
            const val401 = await leerCampo('401');
            const val500 = await leerCampo('500');

            // Si hay algún valor > 0, no está vacío
            return (val401 === 0 && val500 === 0);
        } catch (e) {
            console.warn('Error checking isFormEmpty', e);
            return false; // Ante la duda, no sugerimos
        }
    }

    extractFormPeriod() {
        try {
            const text = document.body.innerText.toUpperCase();
            const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

            // Buscar en selectores específicos de cabecera primero
            const headerInfo = document.querySelector('.contenido-cabecera') || document.querySelector('#j_idt15_content') || document.body;
            const headerText = headerInfo.innerText.toUpperCase();

            // Buscar año reciente (2020-2030)
            const yearMatch = headerText.match(/202[0-9]/);
            if (!yearMatch) return null;
            const year = parseInt(yearMatch[0]);

            // Buscar mes cerca del año
            for (let i = 0; i < meses.length; i++) {
                if (headerText.includes(meses[i])) {
                    return { month: i + 1, year: year, monthName: meses[i] };
                }
            }

            // Fallback (Mes Anterior al actual si solo hay año)
            const today = new Date();
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            return {
                month: lastMonth.getMonth() + 1,
                year: lastMonth.getFullYear(),
                monthName: meses[lastMonth.getMonth()]
            };

        } catch (e) { return null; }
    }

    updateProgress(percent, color = '#22c55e') {
        const bar = this.container?.querySelector('#sri-progress-bar');
        if (bar) {
            bar.style.width = `${percent}%`;
            bar.style.background = color;
        }
    }

    async syncPauseState() {
        const paused = await isPaused();
        this.isPaused = paused;
        this.updatePauseUI();
    }

    startStorageListener() {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.facturas || changes.retenciones || changes.lastRuc) {
                    this.updateSummary();
                    if (changes.lastRuc) this.checkRucChange();
                }
                if (changes.sriAutomationPaused) {
                    this.isPaused = !!changes.sriAutomationPaused.newValue;
                    this.updatePauseUI();
                }
            }
        });
    }

    async checkRucChange() {
        const info = this.extractClientInfo();
        // Solo actuar si tenemos un RUC de ALTA CONFIANZA (extraído del header)
        if (!info.ruc || !info.highConfidence) {
            console.log('🔎 RUC Detection: No hay RUC de alta confianza en el header.');
            return;
        }

        const stored = await SafeStorage.get(['lastRuc']);

        // CAMBIO DE CONTEXTO ELITE (SMART CONFLICT RESOLUTION)
        if (stored.lastRuc && stored.lastRuc !== info.ruc) {
            console.warn(`🚨 CAMBIO DE CONTEXTO: ${stored.lastRuc} -> ${info.ruc}`);

            // Verificar si hay datos "vivos" del usuario anterior
            const ghostData = await GhostMemory.getData();
            const hasZombieData = ghostData && (ghostData.facturas || ghostData.retenciones);

            if (hasZombieData) {
                // Conflicto Real: Datos activos de otro usuario
                await SafeStorage.set({ sriAutomationPaused: true }); // Pausar todo
                
                this.showContextCard({
                    title: '🚨 ¡ALERTA DE SEGURIDAD!',
                    subtitle: 'CAMBIO DE CLIENTE DETECTADO',
                    message: `Has ingresado con <b>${info.name || info.ruc}</b>, pero tienes datos cargados de un cliente anterior.<br><br><b>¡PELIGRO DE INYECCIÓN CRUZADA!</b><br>La automatización ha sido pausada.`,
                    icon: '🚨',
                    actionText: '🚪 LIMPIAR Y CERRAR SESIÓN',
                    onAction: async () => {
                        await GhostMemory.clearCurrent();
                        await SafeStorage.set({ lastRuc: info.ruc, sriAutomationPaused: false });
                        this.updateSummary();
                        this.showEliteToast({ title: '🧹 Limpio', msg: 'Memoria borrada. Cerrando sesión...' });
                        
                        const btnIcon = document.querySelector('.sri-icon-cerrar-sesion');
                        if (btnIcon) {
                            btnIcon.click();
                            const parentA = btnIcon.closest('a');
                            if (parentA) parentA.click();
                        } else {
                            const spanCerrar = Array.from(document.querySelectorAll('.topbar-item-name, span')).find(el => el.innerText.includes('Cerrar Sesión'));
                            if (spanCerrar) {
                                spanCerrar.click();
                                const parentA = spanCerrar.closest('a');
                                if (parentA) parentA.click();
                            } else {
                                window.location.href = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/logout';
                            }
                        }
                    },
                    secondaryActions: [
                        {
                            text: '⚠️ SOLO LIMPIAR Y CONTINUAR AQUÍ',
                            onAction: async () => {
                                await GhostMemory.clearCurrent();
                                await SafeStorage.set({ lastRuc: info.ruc, sriAutomationPaused: false });
                                this.showEliteToast({ title: '✨ Limpieza Completa', msg: `Listo para trabajar con nuevo cliente.` });
                                window.location.reload();
                            }
                        }
                    ]
                });
            } else {
                // Cambio limpio (sin datos activos): Solo notificar y actualizar contexto
                
                let novedadStr = "Sin novedades previas.";
                if (info.ruc) {
                    const historyKey = `history_elite_${info.ruc}`;
                    const historyData = await SafeStorage.get([historyKey]) || {};
                    const history = historyData[historyKey] || { records: [] };
                    if (history.records && history.records.length > 0) {
                        const lastRec = history.records[history.records.length - 1];
                        novedadStr = `Última gestión: ${new Date(lastRec.date).toLocaleString()} - ${lastRec.status}`;
                    }
                }

                this.showEliteToast({
                    title: "👤 CLIENTE ACTIVADO",
                    msg: `<b>${info.name || info.ruc}</b><br><span style="font-size:10px; color:#818cf8">${novedadStr}</span>`,
                    duration: 5000
                });
            }
        }

        // Actualizar siempre el RUC actual como el "activo"
        await SafeStorage.set({ lastRuc: info.ruc, lastClientName: info.name });

        // Refrescar UI Pill con el nombre
        if (info.name) this.renderPill();
    }

    extractClientInfo() {
        let res = { name: '', ruc: '', highConfidence: false };

        try {
            // ELITE v14.6: Soporte Angular Perfil (Alta Fidelidad)
            const angNameEl = document.querySelector('label.nombre-contribuyente');
            const angRucEl = document.querySelector('label.titulo-perfil');
            
            if (angNameEl && angRucEl) {
                const rText = angRucEl.innerText.trim();
                const nText = angNameEl.innerText.trim();
                if (rText.length >= 13) {
                    res.ruc = rText.match(/\d{13}/)[0];
                    res.name = nText;
                    res.highConfidence = true;
                    console.log('💎 [ELITE] Cliente detectado via Angular Profile:', res);
                    return res;
                }
            }

            // ELITE: Soporte Nuevo Menu SRI Topbar
            const nuevoNameEl = document.getElementById('id_nombre_razon_social');
            if (nuevoNameEl) {
                const parent = nuevoNameEl.parentElement;
                if (parent) {
                    const text = parent.innerText || '';
                    const rMatch = text.match(/\d{13}/);
                    if (rMatch) {
                        res.ruc = rMatch[0];
                        res.name = nuevoNameEl.innerText.trim();
                        res.highConfidence = true;
                        console.log('💎 [ELITE] Cliente detectado via Topbar ID:', res);
                        return res;
                    }
                }
            }

            // 1. ESTRATEGIA: Variables Globales del SRI
            if (typeof window.PERFIL !== 'undefined' && window.PERFIL.ruc) {
                res.ruc = window.PERFIL.ruc;
                res.name = window.PERFIL.razonSocial || window.PERFIL.nombreComercial;
                res.highConfidence = true;
                return res;
            }
        } catch (e) { console.warn('Error en detección Angular:', e); }

        const BLACKLIST_RUCS = ['1791321453001', '1768152560001']; // SRI default or restricted RUCs

        // 1. ESTRATEGIA: Header del SRI (Selectores Específicos Ampliados)
        const headerSelectors = [
            '#nombreRuc',
            '.ruc-header',
            'span[id*="nombreUsuario"]',
            '.user-info',
            'div.ui-outputtext[id*="ruc"]',
            '#formCabecera\\:j_idt31',
            'label[id*="razonSocial"]',
            '.ui-topbar-group-right', // Nuevo SRI PrimeFaces
            '.layout-topbar',
            '#topbar'
        ];

        for (const sel of headerSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const text = el.innerText || el.textContent;
                const rucMatch = text.match(/\d{13}/);
                if (rucMatch && !BLACKLIST_RUCS.includes(rucMatch[0])) {
                    res.ruc = rucMatch[0];
                    res.highConfidence = true;

                    // Limpieza de nombre
                    let rawName = text
                        .replace(res.ruc, '')
                        .replace(/RUC/gi, '')
                        .replace(/[^a-zA-ZÁÉÍÓÚáéíóúÑñ\s.]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();

                    if (rawName.length > 3) res.name = rawName;

                    console.log(`🔎 RUC detectado por selector [${sel}]:`, res);
                    return res;
                }
            }
        }

        // 2. ESTRATEGIA: Escaneo Espacial del Header (Top 180px)
        // Busca cualquier nodo de texto visible en la parte superior
        try {
            const range = document.createRange();
            range.selectNode(document.body);

            // Iterar sobre nodos de texto es más eficiente y preciso para encontrar el RUC "flotando"
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        // Filtrar nodos ocultos o muy abajo
                        if (!node.parentElement) return NodeFilter.FILTER_REJECT;
                        // Verificar posición aproximada (sin getBoundingClientRect excesivo)
                        // Optimización: Solo verificamos padres directos
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            let node;
            while (node = walker.nextNode()) {
                const text = node.nodeValue.trim();
                if (text.length >= 13 && /\d{13}/.test(text)) {
                    // Texto candidato, ahora verificar geometría costosa
                    const rect = node.parentElement.getBoundingClientRect();
                    if (rect.top < 180 && rect.height > 0) { // Solo HEADER
                        const rucMatch = text.match(/\d{13}/);
                        if (rucMatch && !BLACKLIST_RUCS.includes(rucMatch[0])) {
                            // Verificar contexto semántico cercano
                            const context = (node.parentElement.innerText || "").toUpperCase();
                            if (context.includes('RUC') || context.includes('CONTRIBUYENTE') || context.includes('BIENVENIDO') || context.includes('DATOS')) {
                                res.ruc = rucMatch[0];
                                res.highConfidence = true;

                                // Intentar sacar nombre del contexto
                                res.name = context
                                    .replace(res.ruc, '')
                                    .replace(/RUC/gi, '')
                                    .replace(/[^A-ZÁÉÍÓÚÑ\s]/g, '')
                                    .replace(/\s+/g, ' ')
                                    .trim();

                                console.log('🔎 RUC detectado por Escaneo Espacial:', res);
                                return res;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Error en Escaneo Espacial de RUC:", e);
        }

        // 3. ESTRATEGIA: Perfil (Fallback)
        const profileBox = document.querySelector('.ui-panel-content');
        if (profileBox) {
            const text = profileBox.innerText || "";
            const rucMatch = text.match(/\d{13}/);
            if (rucMatch && !BLACKLIST_RUCS.includes(rucMatch[0])) {
                res.ruc = rucMatch[0];
                res.highConfidence = true;
                const nameMatch = text.match(/[A-ZÁÉÍÓÚÑñ\s]{10,}/);
                if (nameMatch) res.name = nameMatch[0].trim();
                return res;
            }
        }

        return res;
    }

    /**
     * ELITE v9.0: Notificaciones Premium (Toast)
     */
    showEliteToast({ title, msg, duration = 5000, progress = null }) {
        let toast = document.getElementById('sri-main-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'sri-main-toast';
            document.body.appendChild(toast);
        }

        toast.style.cssText = `
            position: fixed;
            top: 25px;
            right: 25px;
            width: 320px;
            background: rgba(15, 23, 42, 0.9);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(99, 102, 241, 0.4);
            border-radius: 20px;
            padding: 20px;
            z-index: 2000000;
            color: white;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            font-family: 'Inter', sans-serif;
            animation: sri-slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        const progressHtml = progress !== null ? `
            <div style="margin-top: 12px; background: rgba(255,255,255,0.1); border-radius: 10px; height: 6px; overflow: hidden;">
                <div style="width: ${progress}%; height: 100%; background: linear-gradient(90deg, #6366f1, #10b981); transition: width 0.3s ease;"></div>
            </div>
            <div style="font-size: 9px; opacity: 0.5; margin-top: 5px; text-align: right; font-weight: 700;">${Math.round(progress)}% COMPLETADO</div>
        ` : '';

        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="font-size: 20px;">⚡</div>
                <div style="flex: 1;">
                    <div style="font-weight: 800; color: #818cf8; font-size: 11px; text-transform: uppercase;">${title}</div>
                    <div style="font-size: 14px; color: #f8fafc; font-weight: 600;">${msg}</div>
                </div>
            </div>
            ${progressHtml}
        `;

        if (progress === null) {
            setTimeout(() => {
                if (toast) {
                    toast.style.animation = 'sri-slide-out 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';
                    setTimeout(() => toast.remove(), 500);
                }
            }, duration);
        }
    }

    /**
     * Sugiere saltar al Paso 2 tras éxito en extracción usando Smart Card
     */
    async scanObligacionesSRI() {
        // ELITE v12.5: Escáner Proactivo con Auto-Expansión (Alta Velocidad)
        const isPerfil = window.location.href.includes('perfil');
        const isHome = window.location.href.includes('inicio.jsf') || window.location.href.includes('general/inicio');

        if (!isHome && !isPerfil) return;
        if (this.suggestionDismissed) return; // Respetar decisión del usuario
        if (this.contextCard) return; // No acosar si ya se está mostrando el mensaje

        const tryScan = async (retryCounter = 0) => {
            const bodyText = document.body.innerText;
            const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

            // 🚀 ELITE: Si estamos en perfil y no hay rastro de obligaciones, intentar expandir
            const panelPróximas = findByText('Próximas Obligaciones', 'span');
            if (isPerfil && !document.querySelector('.contenedor-texto') && panelPróximas) {
                const expandBtn = panelPróximas.closest('.ui-panel-header') || panelPróximas;
                
                if (expandBtn && retryCounter === 0) {
                    console.log('📬 [ELITE SCANNER] Forzando expansión de panel de obligaciones...');
                    expandBtn.click();
                    await sleep(600); // Espera mínima optimizada
                    return tryScan(1); 
                }
            }

            // Soporte Angular: Expandir paneles colapsados
            if (isPerfil && retryCounter === 0) {
                const matPanels = Array.from(document.querySelectorAll('mat-expansion-panel-header[aria-expanded="false"]')).filter(p => {
                    const t = (p.innerText || '').toLowerCase();
                    return t.includes('obligacion') || t.includes('declaracion');
                });
                if (matPanels.length > 0) {
                    console.log(`📬 [ELITE SCANNER] Auto-expandiendo ${matPanels.length} paneles Angular (Solo Obligaciones)...`);
                    matPanels.forEach(p => p.click());
                    await sleep(800);
                    return tryScan(1);
                }
            }

            // 🔍 Regex Ultra-Omnisciente para Código 2011 (IVA) - RELAXED V12.0
            // 🔍 Regex Ultra-Omnisciente para Código 2011 (IVA) - RELAXED V14.5
            const patterns = [
                /2011\s+DECLARACI[ÓO]N[\s\w]*-\s*([A-ZÁÉÍÓÚÑ]+)\s+(\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i,
                /2011\s+DECLARACI[ÓO]N\s+DE\s+IVA\s*-\s*([A-ZÁÉÍÓÚÑ]+)\s+(\d{4})/i,
                /DECLARACI[ÓO]N\s+DE\s+IVA\s*-\s*([A-ZÁÉÍÓÚÑ]+)\s+(\d{4})/i,
                /2011\s+[A-Z\sÓ]+-\s*([A-ZÁÉÍÓÚÑ]+)\s+(\d{4})/i
            ];

            let detectedMonth = null;
            let detectedYear = null;
            let expirationDateStr = null;

            for (const p of patterns) {
                const match = bodyText.match(p);
                if (match) {
                    detectedMonth = match[1].toUpperCase();
                    detectedYear = parseInt(match[2]);
                    expirationDateStr = match[3] || null;
                    break;
                }
            }

            // Fallback: Buscar en los LIs directamente si el bodyText falló (Angular Shadow DOM/Encapsulation)
            if (!detectedMonth) {
                const items = Array.from(document.querySelectorAll('li, div.mat-expansion-panel-body')).map(el => el.innerText);
                for (const text of items) {
                    for (const p of patterns) {
                        const match = text.match(p);
                        if (match) {
                            detectedMonth = match[1].toUpperCase();
                            detectedYear = parseInt(match[2]);
                            expirationDateStr = match[3] || null;
                            break;
                        }
                    }
                    if (detectedMonth) break;
                }
            }

            if (detectedMonth && detectedYear) {
                const monthIndex = monthNames.indexOf(detectedMonth);
                if (monthIndex !== -1) {
                    let ruc = await GhostMemory.getRuc();
                    if (!ruc) ruc = this.extractClientInfo().ruc;
                    
                    // 🛡️ Filtro "Smart Silence" (5 Días - Registro Local)
                    const cacheKey = `filed_${ruc}_2011_${monthIndex}_${detectedYear}`;
                    const lastSuccess = await SafeStorage.get([cacheKey]);
                    if (lastSuccess[cacheKey] && (Date.now() - lastSuccess[cacheKey] < 5 * 24 * 60 * 60 * 1000)) {
                        console.log(`🔕 [SMART SILENCE] Obligación ${detectedMonth} ya procesada localmente y registrada.`);
                        return;
                    }

                    let isExpired = false;
                    if (expirationDateStr) {
                        const [day, month, year] = expirationDateStr.split('/').map(Number);
                        const expirationDate = new Date(year, month - 1, day);
                        isExpired = new Date() > expirationDate;
                    }

                    console.log(`🎯 [ELITE SCANNER] Detectada: ${detectedMonth} ${detectedYear} (Vencido: ${isExpired})`);

                    this.showContextCard({
                        title: `📅 Declaración ${isExpired ? '⚠️ VENCIDA' : 'Detectada'}`,
                        subtitle: `${detectedMonth} ${detectedYear} ${isExpired ? '(Con Multas)' : ''}`,
                        message: `
                            Se detectó la obligación <b>2011 (IVA)</b> de ${detectedMonth}. 
                            <br>${isExpired ? '<span style="color:#f87171">⚠️ Se detectaron multas/intereses. He preparado el llenado automático.</span>' : '¿Deseas realizar la declaración <b>Zero-Touch</b> ahora?'}
                        `,
                        icon: '🚀',
                        actionText: '🪄 INICIAR MÁGIA (ELITE)',
                        magicMode: true,
                        onAction: () => {
                            this.runUnifiedWorkflow('TURBO_FULL', { monthIndex, year: detectedYear });
                        }
                    });
                }
            }
        };

        await tryScan();
    }

    /**
     * Sugiere saltar a la Fase 2 tras éxito en extracción usando Smart Card
     */
    async suggestStep2() {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const data = await GhostMemory.getData();
        const period = data.workflowPeriod;
        const periodLabel = period ? `${months[period.monthIndex].toUpperCase()} ${period.year}` : 'MES ANTERIOR';

        let autoNavTimer = null;
        let countdownInterval = null;
        let secondsLeft = 3;
        let cancelled = false;

        const doNavigate = () => {
            if (cancelled) return;
            clearInterval(countdownInterval);
            GhostMemory.getData().then(d => {
                this.runUnifiedWorkflow('NAVIGATE_AND_FILL', d.workflowPeriod);
            });
        };

        this.showContextCard({
            title: '✅ Extracción Completada',
            subtitle: 'FASE 1 FINALIZADA',
            message: `Se han procesado los documentos de <b>${periodLabel}</b>. <br>Navegando al Formulario de IVA en <b id="sri-countdown">${secondsLeft}s</b>...`,
            icon: '🚀',
            actionText: `🌍 IR AL FORMULARIO (ahora)`,
            onAction: () => {
                cancelled = false;
                doNavigate();
            },
            secondaryActions: [
                {
                    text: '❌ Cancelar',
                    onAction: () => {
                        cancelled = true;
                        clearInterval(countdownInterval);
                        clearTimeout(autoNavTimer);
                        this.showEliteToast({
                            title: '⏸️ Navegación cancelada',
                            msg: 'Puedes ir manualmente cuando quieras.',
                            duration: 4000
                        });
                    }
                }
            ]
        });

        // Countdown de 3 segundos con auto-navegación
        countdownInterval = setInterval(() => {
            if (cancelled) { clearInterval(countdownInterval); return; }
            secondsLeft--;
            const el = document.getElementById('sri-countdown');
            if (el) el.textContent = `${secondsLeft}s`;
            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                doNavigate();
            }
        }, 1000);
    }

    /**
     * Sugiere opciones de llenado al detectar el formulario del SRI (Fase 3)
     * ELITE FIX: Añadido countdown de 3s para llenado total automático si isAuto=true.
     */
    async suggestStep3(isAuto = false) {
        if (this.state.isProcessing) return;
        this.clearCards();

        if (isAuto) {
            console.log('🚀 [TURBO] Ejecución automática detectada, llenando formulario directamente sin ventanas intermedias...');
            this.handleFillForm('TODO');
            return;
        }

        const storage = await GhostMemory.getData();
        const analysis = {
            ventasIva: (storage.facturas?.ventasIva || 0).toFixed(2),
            ventas0: (storage.facturas?.ventas0 || 0).toFixed(2),
            creditoAnt: (storage.creditoAnterior || 0).toFixed(2),
            retenciones: (storage.retenciones?.ivaRetenido?.total || 0).toFixed(2)
        };

        let secondsLeft = 3;
        let cancelled = false;
        let countdownInterval = null;

        const doFullFill = () => {
            if (cancelled) return;
            clearInterval(countdownInterval);
            this.handleFillForm('TODO');
        };

        const autoText = isAuto
            ? `<div style="text-align:center; margin-top:10px; font-size:12px">Llenado automático Elite en <b id="sri-fill-countdown" style="color:#ef4444; font-size:16px">${secondsLeft}s</b></div>`
            : `<div style="text-align:center; margin-top:10px; font-size:12px; color:#aaa;">Selecciona cómo deseas llenar el formulario.</div>`;

        this.showContextCard({
            title: '💎 Análisis Elite',
            subtitle: 'PRE-LLENADO DETECTADO',
            message: `
                <div class="analysis-elite-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:10px 0; background:rgba(0,0,0,0.15); padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.05)">
                    <div class="analysis-item">
                        <span style="display:block; font-size:10px; color:#aaa; text-transform:uppercase">Ventas IVA</span>
                        <b style="font-size:14px; color:#10b981">$${analysis.ventasIva}</b>
                    </div>
                    <div class="analysis-item">
                        <span style="display:block; font-size:10px; color:#aaa; text-transform:uppercase">Ventas 0%</span>
                        <b style="font-size:14px; color:#f59e0b">$${analysis.ventas0}</b>
                    </div>
                    <div class="analysis-item">
                        <span style="display:block; font-size:10px; color:#aaa; text-transform:uppercase">Créd. 605</span>
                        <b style="font-size:14px; color:#60a5fa">$${analysis.creditoAnt}</b>
                    </div>
                    <div class="analysis-item">
                        <span style="display:block; font-size:10px; color:#aaa; text-transform:uppercase">Reten. 609</span>
                        <b style="font-size:14px; color:#8b5cf6">$${analysis.retenciones}</b>
                    </div>
                </div>
                ${autoText}
            `,
            icon: '⚡',
            actionText: isAuto ? '🔥 TURBO (OMITIR ESPERA)' : '⚡ LLENAR TODO (AUTO)',
            onAction: () => { cancelled = false; doFullFill(); },
            secondaryActions: [
                { 
                    text: '📍 CANCELAR Y MANUAL', 
                    onAction: () => {
                        cancelled = true;
                        clearInterval(countdownInterval);
                        this.showEliteToast({ title: 'Modo Manual', msg: 'Revisa los campos. Operación automática cancelada.' });
                        if (this.contextCard) this.contextCard.remove();
                    }
                }
            ]
        });

        if (isAuto) {
            countdownInterval = setInterval(() => {
                if (cancelled) { clearInterval(countdownInterval); return; }
                secondsLeft--;
                const el = document.getElementById('sri-fill-countdown');
                if (el) el.textContent = `${secondsLeft}s`;
                if (secondsLeft <= 0) {
                    clearInterval(countdownInterval);
                    if (!cancelled) doFullFill();
                }
            }, 1000);
        }
    }

    /**
     * Valida las advertencias del SRI buscando específicamente las del Casillero 625.
     * Si detecta algo desconocido, retorna false para detener el bot.
     */
    async validarAdvertenciasSRI() {
        console.log('🛡️ [ELITE] Validando advertencias del SRI...');
        this.setStatus('🛡️ Validando advertencias...');
        
        let todasPermitidas = true;

        // 1. Expandir el panel de advertencias si existe el toggler (+)
        const toggler = document.querySelector('.ui-fieldset-toggler.ui-icon-plusthick');
        if (toggler) {
            toggler.click();
            await sleep(800);
        }

        // 2. Analizar los mensajes
        const mensajeEls = Array.from(document.querySelectorAll('li.estiloItemsMensajes, .ui-messages-info-detail, .ui-messages-warn-detail, .ui-messages-info-summary'));
        const mensajes = mensajeEls.map(li => li.innerText.trim()).filter(t => t.length > 0);
        
        if (mensajes.length === 0) {
            console.log('✅ No hay advertencias presentes en pantalla.');
            return true;
        }

        const advertenciasPermitidas = [
            "Casillero 625. La Administración Tributaria se reserva el derecho de ejercer su Facultad Determinadora de conformidad con lo establecido por el artículo 68 del Código Tributario.",
            "Casillero 625. Verifique que su crédito tributario no haya superado los 5 años."
        ];

        // Función para limpiar texto y comparar de forma robusta
        const cleanText = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim().toUpperCase();

        for (const msg of mensajes) {
            const normalizedMsg = cleanText(msg);
            const esPermitida = advertenciasPermitidas.some(p => {
                const normalizedP = cleanText(p);
                return normalizedMsg.includes(normalizedP) || normalizedP.includes(normalizedMsg);
            });
            
            if (!esPermitida) {
                console.error(`🚨 ADVERTENCIA NO PERMITIDA DETECTADA: "${msg}"`);
                todasPermitidas = false;
                break;
            } else {
                console.log(`✅ Advertencia Permitida Verificada: "${msg}"`);
            }
        }

        if (!todasPermitidas) {
            this.showEliteToast({ 
                title: '🛑 SEGURIDAD ACTIVADA', 
                msg: `Se detectó una advertencia NO autorizada. Proceso detenido por seguridad.`,
                duration: 10000 
            });
            await GhostMemory.set('workflowState', 'STOPPED_WARNING'); // Sincronía Popup
            return false;
        }

        this.showEliteToast({
            title: '🛡️ Seguridad Aprobada',
            msg: `Se verificaron y aprobaron ${mensajes.length} advertencias estándar.`,
            duration: 3500
        });

        console.log('✅ Advertencias validadas: Todas corresponden a reglas permitidas (Casillero 625).');
        return true;
    }

    /**
     * Orquestador de la fase de salida (Fase 4 - Zero Touch)
     */
    /**
     * 🪄 CIERRE MÁGICO (Elite Edition)
     * Proceso automatizado de finalización, validación de advertencias y envío.
     */
    async ejecutarCierreMagico() {
        if (this.state.isProcessingFinal) return;
        this.state.isProcessingFinal = true;
        this.setStatus('✨ Iniciando Cierre Mágico...');
        await GhostMemory.set('workflowState', 'CLOSING_SRI'); // Sincronía Popup
        this.log('🚀 [CIERRE MÁGICO] Comenzando flujo de finalización...');

        try {
            // Paso 1: Siguiente Principal
            let btnSiguiente = findByText('Siguiente', 'span');
            if (btnSiguiente) {
                this.log('➡️ Pulsando Siguiente...');
                btnSiguiente.click();
                await sleep(3000);
            }

            // Paso 2: Manejo de Advertencias (Si aparecen)
            let btnVerAds = findByText('Ver advertencias', 'span');
            if (btnVerAds) {
                this.log('🔎 Detectadas advertencias. Analizando...');
                const ok = await this.validarAdvertenciasSRI();
                
                if (!ok) {
                    this.log('⚠️ Advertencias desconocidas o no permitidas. Guardando borrador...');
                    const btnGuardar = findByText('Guardar borrador', 'span');
                    if (btnGuardar) btnGuardar.click();
                    await GhostMemory.set('workflowState', 'STOPPED_WARNING'); // Sincronía Popup
                    return;
                }

                // Si son permitidas, Aceptar (o Siguiente nuevamente)
                this.log('✅ Advertencias permitidas. Continuando...');
                const btnAceptarAds = findByText('Aceptar', 'span') || findByText('Siguiente', 'span');
                if (btnAceptarAds) {
                    btnAceptarAds.click();
                    await sleep(2500);
                }
            }

            // Paso 3: Confirmación de Envío (Dialog "Aceptar")
            // A veces el SRI pide confirmar antes de pasar al resumen final
            const modalConfirm = Array.from(document.querySelectorAll('.ui-dialog-title')).find(t => t.textContent.includes('Confirmación'));
            if (modalConfirm) {
                const btnOk = modalConfirm.closest('.ui-dialog').querySelector('button .ui-button-text.ui-c');
                if (btnOk && btnOk.textContent.includes('Aceptar')) {
                    this.log('🤝 Confirmando envío en diálogo...');
                    btnOk.click();
                    await sleep(4000);
                }
            }

            // Paso 4: Pantalla de Pago y Verificación de Inconsistencias
            this.setStatus('⚖️ Verificando Saldo Final...');
            
            // Detección robusta de saldo
            const detectBalance = () => {
                const directEl = document.getElementById('frmFlujoDeclaracion:totalAPagar');
                if (directEl) return parseDecimal(directEl.innerText);
                
                // Fallback por texto
                const labels = Array.from(document.querySelectorAll('label, span, td')).filter(el => el.innerText.includes('Total a pagar'));
                for (const label of labels) {
                    const container = label.closest('tr') || label.parentElement;
                    const valueEl = container.querySelector('.ui-outputtext, b, td:last-child');
                    if (valueEl) {
                        const val = parseDecimal(valueEl.innerText);
                        if (!isNaN(val)) return val;
                    }
                }
                return null;
            };

            const totalValor = detectBalance();
            const elSummary = document.querySelector('.ui-messages-info-summary, .ui-messages-fatal-summary');
            const summaryText = elSummary ? elSummary.innerText.trim().toLowerCase() : '';
            const sinInconsistencias = summaryText.includes('no presenta inconsistencias') || summaryText === '';

            if (totalValor === 0 && sinInconsistencias) {
                this.log('💎 TODO PERFECTO. Saldo $0.00 y Sin Inconsistencias.');
                this.setStatus('💎 Misión Cumplida - Enviando...');
                
                const btnAceptarFinal = Array.from(document.querySelectorAll('button span')).find(el => el.textContent.trim() === 'Aceptar');
                if (btnAceptarFinal) {
                    this.showEliteToast({ title: '🚀 LANZAMIENTO', msg: 'Enviando...', duration: 3000 });
                    btnAceptarFinal.click();
                    await sleep(4000); // 4s en vez de 8s
                    
                    // Paso 5: Impresión Final
                    const btnImprimir = findByText('Imprimir', 'span');
                    if (btnImprimir) {
                        this.log('🖨️ Generando PDF (Extra rápido)...');
                        this.showEliteToast({ title: '🖨️ IMPRIMIENDO', msg: 'Documento generado', duration: 2500 });
                        btnImprimir.click();
                        await sleep(1000); // 1s en vez de 3s
                    }
                    
                    this.showFinalReportSuccess();
                    await GhostMemory.set('workflowState', 'DECLARATION_SUCCESS'); // Sincronía Popup
                } else {
                    this.log('⚠️ No se encontró el botón Finalizar/Aceptar. Por favor finalice manualmente.');
                }
            } else {
                const motivo = totalValor > 0 ? `Saldo a pagar: $${totalValor.toFixed(2)}` : 'Inconsistencias detectadas';
                this.log(`🛑 Bloqueo Seguro: ${motivo}. NUNCA se intenta pagar automáticamente.`);
                
                // Intentar guardar borrador antes de salir
                const btnGuardar = findByText('Guardar borrador', 'span');
                if (btnGuardar) {
                    btnGuardar.click();
                    this.log('💾 Borrador guardado por seguridad.');
                }
                
                await GhostMemory.set('workflowState', totalValor > 0 ? 'STOPPED_BALANCE' : 'STOPPED_WARNING'); // Sincronía Popup
                this.setStatus(`🛑 Detenido: ${motivo}`);
                this.setWorking(false);
                
                this.showContextCard({
                    title: '⚠️ Revisión Requerida',
                    subtitle: 'FLUJO MÁGICO DETENIDO',
                    message: `
                        El bot se ha detenido por seguridad:
                        <br>• ${motivo}
                        <br><br><b>NUNCA intentamos pagar automáticamente.</b> <br>He guardado el borrador. Revisa y envía manualmente si es correcto.
                    `,
                    icon: '🛡️',
                    actionText: '🔄 REINTENTAR CIERRE',
                    onAction: () => this.ejecutarCierreMagico()
                });
            }

        } catch (e) {
            this.log('❌ Error en Cierre Mágico: ' + e.message);
            console.error(e);
        } finally {
            this.state.isProcessingFinal = false;
        }
    }

    async showFinalReportSuccess() {
        const analysis = this.state.lastAnalysis || { ventasIva: '0', ventas0: '0', retenciones: '0', creditoAnt: '0' };
        
        // 💎 EXTRAER DATOS DEL DOM PARA REGISTRO HISTÓRICO PERFECTO
        let extraRuc = null;
        let extraMonthIndex = null;
        let extraYear = null;
        try {
            const outPeriodo = document.getElementById('frmFlujoDeclaracion:outPeriodoFiscal');
            if (outPeriodo) {
                const parts = outPeriodo.innerText.trim().toUpperCase().split(' ');
                const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
                if (parts.length >= 2) {
                    extraMonthIndex = monthNames.indexOf(parts[0]);
                    extraYear = parseInt(parts[1]);
                }
            }
            extraRuc = await GhostMemory.getRuc();
            if (!extraRuc) extraRuc = this.extractClientInfo().ruc;
            
            // Guardado automático INMEDIATO en caso de que cierre la pestaña
            if (extraRuc && extraMonthIndex !== null && extraYear) {
                const key = `filed_${extraRuc}_2011_${extraMonthIndex}_${extraYear}`;
                await SafeStorage.set({ [key]: Date.now() });
                console.log(`✅ Registro de Declaración guardado en memoria persistente: ${key}`);
            }
        } catch (e) { console.warn('Error extrayendo datos finales', e); }

        this.clearCards();
        this.showContextCard({
            title: '🎉 ¡MISIÓN CUMPLIDA!',
            subtitle: 'DECLARACIÓN FINALIZADA',
            message: `
                <div style="text-align:center; padding:5px;">
                    <div style="font-size:32px; margin-bottom:10px;">🏆</div>
                    <p style="margin-bottom:15px; font-weight:bold;">Declaración enviada exitosamente ($0.00).</p>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:11px; text-align:left;">
                        <div><span style="color:#aaa">Ventas IVA:</span> <br><b>$${analysis.ventasIva}</b></div>
                        <div><span style="color:#aaa">Ventas 0%:</span> <br><b>$${analysis.ventas0}</b></div>
                        <div><span style="color:#aaa">Reten. 609:</span> <br><b>$${analysis.retenciones}</b></div>
                        <div><span style="color:#aaa">Créd. 605:</span> <br><b>$${analysis.creditoAnt}</b></div>
                    </div>
                </div>
            `,
            icon: '✅',
            actionText: '🚪 LIMPIAR Y CERRAR SESIÓN',
            onAction: async () => {
                await GhostMemory.clearCurrent();
                this.updateSummary();
                this.showEliteToast({ title: '🧹 Limpio', msg: 'Memoria borrada. Cerrando sesión...' });

                const btnIcon = document.querySelector('.sri-icon-cerrar-sesion');
                if (btnIcon) {
                    btnIcon.click();
                    const parentA = btnIcon.closest('a');
                    if (parentA) parentA.click();
                } else {
                    const spanCerrar = Array.from(document.querySelectorAll('.topbar-item-name, span')).find(el => el.innerText.includes('Cerrar Sesión'));
                    if (spanCerrar) {
                        spanCerrar.click();
                        const parentA = spanCerrar.closest('a');
                        if (parentA) parentA.click();
                    } else {
                        window.location.href = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/logout';
                    }
                }
            },
            secondaryActions: [
                {
                    text: '⏭️ IGNORAR',
                    onAction: async () => {
                        await GhostMemory.clearCurrent();
                        this.updateSummary();
                        this.showEliteToast({ title: '🧹 Limpio', msg: 'Memoria borrada. Puedes continuar.' });
                        this.clearCards();
                    }
                }
            ]
        });
        
        // Efecto confeti visual simple
        const canvas = document.createElement('div');
        canvas.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:999999;';
        document.body.appendChild(canvas);
        for(let i=0; i<50; i++) {
            const p = document.createElement('div');
            p.style.cssText = `position:absolute; left:${Math.random()*100}%; top:-10px; width:10px; height:10px; background:hsl(${Math.random()*360}, 70%, 50%); border-radius:50%;`;
            canvas.appendChild(p);
            p.animate([
                { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
                { transform: `translateY(${window.innerHeight}px) rotate(${Math.random()*360}deg)`, opacity: 0 }
            ], { duration: 2000 + Math.random()*3000, easing: 'cubic-bezier(0,0,0.2,1)' });
        }
    }

    async showFinalReport(data, totalFields) {
        this.clearCards();
        const card = document.createElement('div');
        card.className = 'elite-context-card final-report animate-pop-in';
        card.style.cssText = 'position:fixed; top:20px; right:20px; z-index:999999; border-left:4px solid #f59e0b; width:320px;';
        card.innerHTML = `
            <div class="card-header">
                <span class="icon">🏆</span>
                <div class="title-group"><span class="main-title">Reporte Final Elite</span></div>
            </div>
            <div class="card-body">
                <p>✅ Se han llenado <b>${totalFields}</b> campos exitosamente.</p>
                <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px">
                    <p style="margin:0; font-size:12px">Cliente: <b>${data.lastClientName || 'Detectado'}</b></p>
                    <p style="margin:5px 0 0 0; font-size:11px; color:#aaa">Renta a favor ($${data.retenciones?.rentaRetenida?.total || '0.00'}) no inyectada en IVA.</p>
                </div>
            </div>
            <div class="card-footer">
                <button class="btn-confirm" onclick="this.closest('.elite-context-card').remove()">CERRAR Y REVISAR</button>
            </div>
        `;
        document.body.appendChild(card);
    }

    // Antiguo scanner de tabla preservado para compatibilidad si se requiere llamar
    scanProfilePageTable() {
        const table = document.querySelector('.ui-datatable-tablewrapper table') || document.querySelector('table');
        if (!table) return false;
        const rows = Array.from(table.querySelectorAll('tr'));
        return rows.some(row => {
            const text = row.textContent.toUpperCase();
            return text.includes('IVA') && (text.includes('MENSUAL') || text.includes('PENDIENTE'));
        });
    }

    // ============================================
    // ELITE UI: SMART HUB & CONTEXT CARDS
    // ============================================

    render() {
        if (!this.container) return;

        // Inyectar Estilos Globales Elite
        if (!document.getElementById('sri-elite-styles')) {
            const style = document.createElement('style');
            style.id = 'sri-elite-styles';
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                
                .sri-elite-pill {
                    background: rgba(15, 23, 42, 0.85);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 50px;
                    padding: 8px 16px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    color: white;
                    font-family: 'Inter', sans-serif;
                    user-select: none;
                    z-index: 1000000;
                }
                .sri-elite-pill:hover {
                    background: rgba(15, 23, 42, 0.95);
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
                    border-color: rgba(99, 102, 241, 0.5);
                }
                .sri-elite-context-card {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 420px;
                    max-width: 90vw;
                    background: rgba(15, 23, 42, 0.98);
                    backdrop-filter: blur(25px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 28px;
                    padding: 30px;
                    box-shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.5);
                    z-index: 2147483647;
                    animation: slideInElite 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes slideInElite {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes turbo-pulse {
                    0% { transform: scale(1); filter: drop-shadow(0 0 0px #6366f1); }
                    50% { transform: scale(1.2) rotate(10deg); filter: drop-shadow(0 0 15px #6366f1); }
                    100% { transform: scale(1); filter: drop-shadow(0 0 0px #6366f1); }
                }
                .is-working-ghost {
                    animation: turbo-pulse 1.5s infinite ease-in-out;
                }
                .elite-btn-primary {
                    background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
                    color: white;
                    border: none;
                    padding: 12px 20px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 13px;
                    width: 100%;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }
                .elite-btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 15px rgba(79, 70, 229, 0.4);
                }
                .elite-text-muted { color: #64748b; font-size: 12px; }
                .elite-text-title { color: #1e293b; font-weight: 700; font-size: 15px; margin-bottom: 4px; }

                /* 🪄 MAGIC BUTTON PREMIUM (User Request) */
                .magic-btn-premium {
                    background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #4f46e5 100%) !important;
                    background-size: 200% auto !important;
                    animation: magic-gradient 3s infinite alternate, magic-glow 2s infinite ease-in-out !important;
                    border: 1px solid rgba(255,255,255,0.3) !important;
                    box-shadow: 0 0 20px rgba(99, 102, 241, 0.4) !important;
                    filter: brightness(1.1);
                }
                @keyframes magic-gradient {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 100% 50%; }
                }
                @keyframes magic-glow {
                    0%, 100% { box-shadow: 0 0 15px rgba(99, 102, 241, 0.4); }
                    50% { box-shadow: 0 0 30px rgba(168, 85, 247, 0.6); }
                }
            `;
            document.head.appendChild(style);
        }

        if (this.isExpanded) {
            this.renderPanel();
        } else {
            this.renderPill();
        }
    }

    renderPill() {
        if (!this.container) return; // ELITE FIX: Safety check
        const info = this.extractClientInfo();
        const clientName = info.name ? info.name.split(' ')[0] : 'SRI';

        this.container.style.width = 'auto'; // Ajuste dinámico
        this.container.innerHTML = `
            <div id="sri-smart-hub" class="sri-elite-pill" style="opacity: 0.9; display: flex; align-items: center; gap: 8px;">
                <div style="font-size: 16px;">💎</div>
                <div style="font-size: 10px; font-weight: 700;">Panel ${clientName}</div>
                <div id="btn-force-scan" style="font-size: 12px; cursor: pointer; padding: 2px 4px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-left: 4px;" title="Forzar Escaneo de Obligaciones">🔍</div>
            </div>
        `;

        const hub = this.container.querySelector('#sri-smart-hub');
        hub.onclick = (e) => {
            // Si hacen click en el icono de lupa, no expandir, solo escanear
            if (e.target.id === 'btn-force-scan') {
                e.stopPropagation();
                console.log('🔍 [FORCE SCAN] Ejecutando escaneo manual...');
                this.scanObligacionesSRI();
                return;
            }
            this.toggleMinimize(false);
        };
    }

    renderPanel() {
        const info = this.extractClientInfo();
        const clientName = info.name ? info.name.split(' ')[0] : 'SRI';

        // Determinar estado de página para el HUD
        const isForm = window.location.href.includes('declaracionImpuesto.jsf') || window.location.href.includes('recibirDeclaracion.jsf');
        const isRecibidos = window.location.href.includes('recibidos/comprobantesRecibidos.jsf');

        this.container.style.width = '320px';
        this.container.innerHTML = `
            <div id="sri-elite-panel" style="background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(20px); border-radius: 20px; padding: 20px; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.3); font-family: 'Inter', sans-serif; color: white; border: 1px solid rgba(255,255,255,0.08);">
                
                <!-- HEADER -->
                <div id="sri-panel-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div id="sri-ghost-icon" class="${this.working ? 'is-working-ghost' : ''}" style="font-size: 24px;">👻</div>
                        <div>
                            <div style="font-size: 14px; font-weight: 800; letter-spacing: 0.02em;">GHOST ASISTENTE</div>
                            <div id="sri-client-name" style="font-size: 10px; opacity: 0.7; font-weight: 500;">${clientName}</div>
                            <div id="sri-client-ruc" style="font-size: 9px; opacity: 0.5; font-weight: 600; color: #818cf8;">RUC: ${info.ruc || 'N/A'}</div>
                        </div>
                    </div>
                    <div id="btn-minimize-pill" style="cursor: pointer; opacity: 0.5; font-size: 20px; padding: 5px;">×</div>
                </div>

                <!-- STATUS HUB -->
                <div id="sri-panel-status" style="background: ${this.manualMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.05)'}; padding: 12px; border-radius: 12px; border-left: 4px solid ${this.manualMode ? '#f59e0b' : '#6366f1'}; font-size: 11px; color: #e2e8f0; margin-bottom: 20px; position: relative;">
                    ${this.manualMode ? '🛠️ MODO MANUAL: Protección Pausada' : (isForm ? '📝 Estás en el Formulario IVA' : isRecibidos ? '📥 Analizando Comprobantes...' : '✨ Listo para operar')}
                    
                    ${this.manualMode ? `
                        <button id="btn-exit-manual" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: #f59e0b; color: white; border: none; padding: 4px 8px; border-radius: 6px; font-size: 9px; cursor: pointer; font-weight: 800;">SALIR</button>
                    ` : `
                        <button id="btn-enter-manual" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); color: #94a3b8; border: none; padding: 4px 8px; border-radius: 6px; font-size: 9px; cursor: pointer;">MODO MANUAL</button>
                    `}
                </div>

                <!-- DATA SUMMARY HUB (ENHANCED) -->
                <div style="background: rgba(0,0,0,0.2); border-radius: 16px; padding: 14px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; font-size: 9px; opacity: 0.5; text-transform: uppercase; margin-bottom: 12px;">
                        <span id="summary-label">📊 Memoria Temporal</span>
                        <span id="summary-period" style="font-weight: 700; color: #818cf8;">-</span>
                    </div>

                    <!-- BOTÓN REPORTE MAESTRO (Visible solo si hay datos bulk) -->
                    <div id="btn-reopen-report" style="display: none; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 8px; border-radius: 10px; margin-bottom: 12px; cursor: pointer; text-align: center; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); border: 1px solid rgba(255,255,255,0.2);">
                        <div style="font-size: 11px; font-weight: 800; color: white; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            🏆 VER REPORTE MAESTRO
                        </div>
                    </div>
                    
                    <!-- FACTURAS (COMPRAS RECIBIDAS) -->
                    <div style="background: rgba(16, 185, 129, 0.1); border-radius: 10px; padding: 10px; margin-bottom: 10px; border-left: 3px solid #10b981;">
                        <div style="font-size: 9px; opacity: 0.7; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; color: #10b981;">🛍️ Compras (Facturas Recibidas)</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div class="copyable-value" data-value="" title="Click para copiar">
                                <span style="font-size: 8px; opacity: 0.6;">Base 15%</span>
                                <span id="summary-iva15" style="font-size: 12px; font-weight: 700; color: #10b981; display: block;">$0.00</span>
                            </div>
                            <div class="copyable-value" data-value="" title="Click para copiar">
                                <span style="font-size: 8px; opacity: 0.6;">Base 0%</span>
                                <span id="summary-iva0" style="font-size: 12px; font-weight: 700; color: #10b981; display: block;">$0.00</span>
                            </div>
                        </div>
                        <div class="copyable-value" data-value="" title="Click para copiar" style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-size: 8px; opacity: 0.6;">Total Valor (con IVA)</span>
                                <span id="summary-total-compra" style="font-size: 11px; font-weight: 800; color: white; display: block;">$0.00</span>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-size: 8px; opacity: 0.6;">Documentos</span>
                                <span id="summary-facturas-count" style="font-size: 11px; font-weight: 700; color: #34d399; display: block;">0 docs</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- RETENCIONES -->
                    <div style="background: rgba(99, 102, 241, 0.1); border-radius: 10px; padding: 10px; border-left: 3px solid #6366f1;">
                        <div style="font-size: 9px; opacity: 0.7; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; color: #818cf8;">💸 Retenciones</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
                            <div class="copyable-value" data-value="" title="Click para copiar">
                                <span style="font-size: 8px; opacity: 0.6;">Base Imp.</span>
                                <span id="summary-ret-base" style="font-size: 11px; font-weight: 800; color: #a5b4fc; display: block;">$0.00</span>
                            </div>
                            <div class="copyable-value" data-value="" title="Click para copiar">
                                <span style="font-size: 8px; opacity: 0.6;">IVA Ret.</span>
                                <span id="summary-ret-iva" style="font-size: 11px; font-weight: 700; color: #818cf8; display: block;">$0.00</span>
                            </div>
                            <div class="copyable-value" data-value="" title="Click para copiar">
                                <span style="font-size: 8px; opacity: 0.6;">Renta Ret.</span>
                                <span id="summary-ret-renta" style="font-size: 11px; font-weight: 700; color: #818cf8; display: block;">$0.00</span>
                            </div>
                        </div>
                        <div class="copyable-value" data-value="" title="Click para copiar" style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <span style="font-size: 8px; opacity: 0.6;">Total Retenciones</span>
                            <span id="summary-ret-count" style="font-size: 11px; font-weight: 700; color: #a5b4fc; display: block;">0 docs</span>
                        </div>
                    </div>

                    <!-- NOTAS CRÉDITO -->
                    <div style="background: rgba(244, 63, 94, 0.1); border-radius: 10px; padding: 10px; border-left: 3px solid #f43f5e; margin-top: 10px;">
                        <div style="font-size: 9px; opacity: 0.7; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; color: #f43f5e;">📄 Notas de Crédito</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div class="copyable-value" data-value="" title="Click para copiar">
                                <span style="font-size: 8px; opacity: 0.6;">Base 15%</span>
                                <span id="summary-nc-iva15" style="font-size: 12px; font-weight: 700; color: #f43f5e; display: block;">$0.00</span>
                            </div>
                            <div class="copyable-value" data-value="" title="Click para copiar">
                                <span style="font-size: 8px; opacity: 0.6;">Base 0%</span>
                                <span id="summary-nc-iva0" style="font-size: 12px; font-weight: 700; color: #f43f5e; display: block;">$0.00</span>
                            </div>
                        </div>
                        <div class="copyable-value" data-value="" title="Click para copiar" style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-size: 8px; opacity: 0.6;">Total Notas (Valor)</span>
                                <span id="summary-nc-total" style="font-size: 11px; font-weight: 800; color: white; display: block;">$0.00</span>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-size: 8px; opacity: 0.6;">Documentos</span>
                                <span id="summary-nc-count" style="font-size: 11px; font-weight: 700; color: #fb7185; display: block;">0 docs</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MAIN ACTIONS -->
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${!isForm ? `
                        <button id="btn-panel-turbo" class="elite-btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 12px; height: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);">
                            <div style="font-size: 12px; font-weight: 800; margin-bottom: 2px;">🔥 EJECUCIÓN MAESTRA (TURBO)</div>
                            <div style="font-size: 9px; font-weight: normal; opacity: 0.9;">(Automatización Completa)</div>
                            <div style="font-size: 8px; margin-top: 4px; font-weight: 700; color: #d1fae5;">EXTRACCIÓN → NAVEGACIÓN → LLENADO</div>
                        </button>
                        <button id="btn-panel-nav-iva" class="elite-btn-primary" style="margin-top: 8px;">🌍 IR A FORMULARIO IVA</button>
                    ` : ''}
                    
                    ${isRecibidos ? `
                         <button id="btn-panel-extract" class="elite-btn-primary" style="background: #818cf8;">📥 EXTRAER DATOS AHORA</button>
                    ` : ''}

                    ${isForm ? `
                        <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 8px; font-weight: 700;">Acciones de Formulario</div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 8px;">
                                <button id="btn-hud-ventas" class="elite-btn-primary" style="background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); color: #60a5fa; font-size: 10px; padding: 8px 4px;">💰 VENTAS</button>
                                <button id="btn-hud-compras" class="elite-btn-primary" style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5); color: #34d399; font-size: 10px; padding: 8px 4px;">🛒 COMPRAS</button>
                                <button id="btn-hud-resumen" class="elite-btn-primary" style="background: rgba(139, 92, 246, 0.2); border: 1px solid rgba(139, 92, 246, 0.5); color: #a78bfa; font-size: 10px; padding: 8px 4px;">💎 RESUMEN IMP.</button>
                            </div>
                            
                            <button id="btn-panel-fill-all" class="elite-btn-primary" style="width: 100%; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); font-weight: 800; padding: 12px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);">
                                ⚡ LLENAR TODO AUTOMÁTICO
                            </button>

                            <button id="btn-panel-magic-final" class="elite-btn-primary" style="width: 100%; margin-top: 8px; background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); font-weight: 800; padding: 12px; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4); position: relative; overflow: hidden;">
                                <div style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); animation: elite-shine 3s infinite;"></div>
                                ✨ EFECTUAR CIERRE MÁGICO
                            </button>
                        </div>
                    ` : ''}

                    <div style="display: flex; gap: 5px; margin-top: 10px;">
                        <button id="btn-panel-detener" style="display: none; flex: 1; background: #ef4444; border: none; color: white; padding: 6px; border-radius: 8px; font-size: 10px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);">⛔ Detener</button>
                        <button id="btn-panel-unfreeze" style="flex: 1; background: #334155; border: none; color: white; padding: 6px; border-radius: 8px; font-size: 10px; cursor: pointer; font-weight: 800;">🔓 Unfreeze</button>
                        <button id="btn-panel-borrar" style="flex: 1; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 6px; border-radius: 8px; font-size: 10px; cursor: pointer;">🧹 Limpiar</button>
                         <button id="btn-panel-refresh" style="flex: 1; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 6px; border-radius: 8px; font-size: 10px; cursor: pointer;">🔄 Recargar</button>
                    </div>
                </div>
            </div>
        `;

        this.container.querySelector('#btn-minimize-pill').onclick = () => {
            this.toggleMinimize(true);
        };

        this.bindEvents();
        this.updateSummary(); // Cargar datos inmediatamente
    }

    showContextCard(data) {
        return new Promise((resolve) => {
            if (this.contextCard) this.contextCard.remove();
            if (this.contextOverlay) this.contextOverlay.remove();
            
            let secondsLeft = data.timeout ? Math.floor(data.timeout / 1000) : null;
            let countdownInterval = null;

            // Crear overlay oscuro
            this.contextOverlay = document.createElement('div');
            this.contextOverlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(12px);
                z-index: 2147483646; animation: fadeIn 0.3s ease-out;
            `;
            document.body.appendChild(this.contextOverlay);

            this.contextCard = document.createElement('div');
            this.contextCard.className = 'sri-elite-context-card';
            const actionBtnId = 'btn-elite-action-' + Math.floor(Math.random() * 1000);

            let secondaryBtnsHtml = '';
            if (data.secondaryActions && data.secondaryActions.length > 0) {
                secondaryBtnsHtml = `
                    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 12px;">
                        ${data.secondaryActions.map((act, i) => `
                            <button id="btn-elite-sec-${i}" style="background: rgba(255,255,255,0.05); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;">${act.text}</button>
                        `).join('')}
                    </div>
                `;
            } else if (data.cancelText) {
                secondaryBtnsHtml = `
                    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 12px;">
                        <button id="btn-elite-cancel" style="background: rgba(255,255,255,0.05); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;">${data.cancelText}</button>
                    </div>
                `;
            }

            const confirmText = data.confirmText || data.actionText || 'CONTINUAR';

            this.contextCard.innerHTML = `
                <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 24px; padding: 24px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
                    <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px;">
                        <div style="width: 50px; height: 50px; background: rgba(99, 102, 241, 0.2); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px;">${data.icon || '🚀'}</div>
                        <div style="flex: 1;">
                            <div style="color: white; font-weight: 800; font-size: 18px; letter-spacing: -0.01em; margin-bottom: 2px;">${data.title}</div>
                            ${data.subtitle ? `<div style="font-weight: 700; color: #818cf8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">${data.subtitle}</div>` : ''}
                            <div style="font-size: 14px; line-height: 1.5; color: #cbd5e1; font-weight: 500;">${data.msg || data.message}</div>
                        </div>
                    </div>
                    </div>
                    <button id="${actionBtnId}" class="elite-btn-primary ${data.magicMode ? 'magic-btn-premium' : ''}" style="height: 52px; font-size: 15px; font-weight: 800; ${!data.magicMode ? 'background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);' : ''} border-radius: 16px;">
                        <span id="elite-confirm-text">${confirmText}</span>
                    </button>
                    ${secondaryBtnsHtml}
                    <div style="text-align: center; margin-top: 14px;">
                        <span id="btn-elite-dismiss" style="font-size: 11px; color: #64748b; cursor: pointer; text-decoration: underline; font-weight: 600;">Omitir</span>
                    </div>
                </div>
            `;

            document.body.appendChild(this.contextCard);

            const cleanup = () => {
                if (countdownInterval) clearInterval(countdownInterval);
                this.closeContextCard();
            };

            const handleAction = () => {
                cleanup();
                if (data.onAction) data.onAction();
                resolve('CONFIRM');
            };

            const handleCancel = () => {
                cleanup();
                resolve('CANCEL');
            };

            document.getElementById(actionBtnId).onclick = handleAction;

            if (data.cancelText) {
                const btnCancel = document.getElementById('btn-elite-cancel');
                if (btnCancel) btnCancel.onclick = handleCancel;
            }

            const btnDismiss = document.getElementById('btn-elite-dismiss');
            if (btnDismiss) {
                btnDismiss.onclick = () => {
                    this.suggestionDismissed = true; // Previene que sea ruidoso/invasivo durante esta sesión
                    handleCancel();
                };
            }

            if (data.secondaryActions) {
                data.secondaryActions.forEach((act, i) => {
                    const btn = document.getElementById(`btn-elite-sec-${i}`);
                    if (btn) btn.onclick = () => {
                        cleanup();
                        act.onAction();
                        resolve(`SEC_${i}`);
                    };
                });
            }

            document.getElementById('btn-elite-dismiss').onclick = handleCancel;

            // AUTO-TIMEOUT LOGIC (3s Elite)
            if (secondsLeft !== null) {
                const countdownSpan = document.createElement('span');
                countdownSpan.style.marginLeft = '8px';
                countdownSpan.id = 'elite-timeout-countdown';
                countdownSpan.textContent = `(${secondsLeft}s)`;
                document.getElementById('elite-confirm-text').appendChild(countdownSpan);

                countdownInterval = setInterval(() => {
                    secondsLeft--;
                    const span = document.getElementById('elite-timeout-countdown');
                    if (span) span.textContent = `(${secondsLeft}s)`;
                    if (secondsLeft <= 0) {
                        handleAction();
                    }
                }, 1000);
            }
        });
    }

    closeContextCard() {
        if (this.contextCard) {
            this.contextCard.style.pointerEvents = 'none';
            this.contextCard.style.opacity = '0';
            this.contextCard.style.transform = 'translate(-50%, -50%) scale(0.95)';
            setTimeout(() => { if (this.contextCard) this.contextCard.remove(); }, 300);
            this.contextCard = null;
        }
        if (this.contextOverlay) {
            this.contextOverlay.style.pointerEvents = 'none';
            this.contextOverlay.style.opacity = '0';
            setTimeout(() => { if (this.contextOverlay) this.contextOverlay.remove(); }, 300);
            this.contextOverlay = null;
        }
        // Fix: Remove this.suggestionDismissed = true; to allow multi-step workflows like Turbo to continue
    }

    async updateSummary() {
        if (!this.container) return;

        try {
            const info = this.extractClientInfo();
            const nameEl = this.container.querySelector('#sri-client-name');
            if (nameEl) {
                nameEl.textContent = info.name || info.ruc || 'No detectado';
                if (nameEl.textContent.length > 25) nameEl.style.fontSize = '8px';
            }

            // Update RUC
            const rucEl = this.container.querySelector('#sri-client-ruc');
            if (rucEl) {
                rucEl.textContent = `RUC: ${info.ruc || 'N/A'}`;
            }

            // Cargar datos (GhostMemory + BulkFlow)
            const ghostData = await GhostMemory.getData();
            const items = await SafeStorage.get(['bulkFlow', 'workflowPeriod', 'lastBulkReport']);

            let displayData = ghostData;
            let isBulkDisplay = false;

            // ELITE v14.0: Si hay un flujo masivo activo o un reporte masivo guardado, mostrar acumulados
            const activeBulk = items.bulkFlow && items.bulkFlow.results && items.bulkFlow.results.length > 0;
            const savedBulk = items.lastBulkReport && items.lastBulkReport.breakdown && items.lastBulkReport.breakdown.length > 0;

            if (activeBulk || savedBulk) {
                isBulkDisplay = true;
                const source = activeBulk ? items.bulkFlow.results : items.lastBulkReport.breakdown;

                const aggregated = {
                    facturas: { totalFacturas: 0, iva15: { baseImponible: 0, montoIva: 0, total: 0 }, iva0: { baseImponible: 0, total: 0 } },
                    retenciones: { totalRetenciones: 0, ivaRetenido: { total: 0, baseTotal: 0 }, rentaRetenida: { total: 0, baseTotal: 0 } },
                    notasCredito: { totalNotas: 0, iva15: { baseImponible: 0 }, iva0: { baseImponible: 0 }, iva: { total: 0 }, totalGeneral: 0 }
                };

                source.forEach(res => {
                    const d = res.data;
                    if (d.facturas) {
                        aggregated.facturas.totalFacturas += d.facturas.totalFacturas || 0;
                        aggregated.facturas.iva15.baseImponible += parseFloat(d.facturas.iva15?.baseImponible || 0);
                        aggregated.facturas.iva15.montoIva += parseFloat(d.facturas.iva15?.montoIva || 0);
                        aggregated.facturas.iva15.total += parseFloat(d.facturas.iva15?.total || 0);
                        aggregated.facturas.iva0.baseImponible += parseFloat(d.facturas.iva0?.baseImponible || 0);
                        aggregated.facturas.iva0.total += parseFloat(d.facturas.iva0?.total || 0);
                    }
                    if (d.retenciones) {
                        aggregated.retenciones.totalRetenciones += d.retenciones.totalRetenciones || 0;
                        aggregated.retenciones.ivaRetenido.total += parseFloat(d.retenciones.ivaRetenido?.total || 0);
                        aggregated.retenciones.ivaRetenido.baseTotal += parseFloat(d.retenciones.ivaRetenido?.baseTotal || 0);
                        aggregated.retenciones.rentaRetenida.total += parseFloat(d.retenciones.rentaRetenida?.total || 0);
                        aggregated.retenciones.rentaRetenida.baseTotal += parseFloat(d.retenciones.rentaRetenida?.baseTotal || 0);
                    }
                    if (d.notasCredito) {
                        aggregated.notasCredito.totalNotas += d.notasCredito.totalNotas || 0;
                        aggregated.notasCredito.iva15.baseImponible += parseFloat(d.notasCredito.iva15?.baseImponible || 0);
                        aggregated.notasCredito.iva0.baseImponible += parseFloat(d.notasCredito.iva0?.baseImponible || 0);
                        aggregated.notasCredito.iva.total += parseFloat(d.notasCredito.iva?.total || 0);
                        aggregated.notasCredito.iva15.baseImponible += parseDecimal(d.notasCredito.iva15?.baseImponible || 0);
                        aggregated.notasCredito.iva0.baseImponible += parseDecimal(d.notasCredito.iva0?.baseImponible || 0);
                        aggregated.notasCredito.iva.total += parseDecimal(d.notasCredito.iva?.total || 0);
                        aggregated.notasCredito.totalGeneral += parseDecimal(d.notasCredito.totalGeneral || 0);
                    }
                });

                // Sumar también el progreso actual del mes si no está en results pero si hay datos frescos
                // (Para que se vea el progreso real mientras extrae)
                if (ghostData.facturas || ghostData.retenciones) {
                    aggregated.facturas.totalFacturas += ghostData.facturas?.totalFacturas || 0;
                    aggregated.facturas.iva15.baseImponible += parseDecimal(ghostData.facturas?.iva15?.baseImponible || 0);
                    aggregated.facturas.iva0.baseImponible += parseDecimal(ghostData.facturas?.iva0?.baseImponible || 0);
                    // ... retenciones también ...
                    aggregated.retenciones.totalRetenciones += ghostData.retenciones?.totalRetenciones || 0;
                    aggregated.retenciones.rentaRetenida.baseTotal += parseFloat(ghostData.retenciones?.rentaRetenida?.baseTotal || 0);
                }

                displayData = aggregated;
            }

            // Mostrar botón de reporte si hay datos históricos guardados
            const btnReport = this.container.querySelector('#btn-reopen-report');
            if (btnReport) {
                btnReport.style.display = (items.lastBulkReport || isBulkDisplay) ? 'block' : 'none';
            }

            const labelEl = this.container.querySelector('#summary-label');
            if (labelEl) labelEl.textContent = isBulkDisplay ? '📈 Totales Acumulados' : '📊 Memoria Temporal';

            const periodEl = this.container.querySelector('#summary-period');
            if (periodEl) {
                if (isBulkDisplay) {
                    const monthCount = activeBulk ? items.bulkFlow.results.length : items.lastBulkReport.breakdown.length;
                    periodEl.textContent = `${monthCount} meses`;
                } else {
                    periodEl.textContent = ghostData?.facturas?.periodo || ghostData?.retenciones?.periodo || '-';
                }
            }

            // Facturas - Base Imponible
            const iva15Val = parseFloat(displayData?.facturas?.iva15?.baseImponible || 0).toFixed(2);
            const iva0Val = parseFloat(displayData?.facturas?.iva0?.baseImponible || 0).toFixed(2);
            const totalCompraVal = (parseFloat(displayData?.facturas?.iva15?.total || 0) + parseFloat(displayData?.facturas?.iva0?.total || 0)).toFixed(2);
            const facturasCount = displayData?.facturas?.totalFacturas || 0;

            this.setElText('#summary-iva15', `$${iva15Val}`);
            this.setElText('#summary-iva0', `$${iva0Val}`);
            this.setElText('#summary-total-compra', `$${totalCompraVal}`);
            this.setElText('#summary-facturas-count', `${facturasCount} docs`);

            // Retenciones
            const retIvaVal = (displayData?.retenciones?.ivaRetenido?.total || 0).toFixed(2);
            const retRentaVal = (displayData?.retenciones?.rentaRetenida?.total || 0).toFixed(2);
            const retBaseVal = (parseFloat(displayData?.retenciones?.ivaRetenido?.baseTotal || 0) + parseFloat(displayData?.retenciones?.rentaRetenida?.baseTotal || 0)).toFixed(2);
            const retCount = displayData?.retenciones?.totalRetenciones || 0;

            this.setElText('#summary-ret-iva', `$${retIvaVal}`);
            this.setElText('#summary-ret-renta', `$${retRentaVal}`);
            this.setElText('#summary-ret-base', `$${retBaseVal}`);
            this.setElText('#summary-ret-count', `${retCount} docs`);

            // Setup click-to-copy
            this.setupCopyableValues({
                iva15: iva15Val,
                iva0: iva0Val,
                totalCompra: totalCompraVal,
                facturasCount: facturasCount,
                retBase: retBaseVal, // NEW
                retIva: retIvaVal,
                retRenta: retRentaVal,
                retCount: retCount,
                ncIva15: (displayData?.notasCredito?.iva15?.baseImponible || 0).toFixed(2),
                ncIva0: (displayData?.notasCredito?.iva0?.baseImponible || 0).toFixed(2),
                ncTotal: (displayData?.notasCredito?.totalGeneral || 0).toFixed(2),
                ncCount: displayData?.notasCredito?.totalNotas || 0
            });

            // Actualizar textos de NC
            this.setElText('#summary-nc-iva15', `$${(displayData?.notasCredito?.iva15?.baseImponible || 0).toFixed(2)}`);
            this.setElText('#summary-nc-iva0', `$${(displayData?.notasCredito?.iva0?.baseImponible || 0).toFixed(2)}`);
            this.setElText('#summary-nc-total', `$${(displayData?.notasCredito?.totalGeneral || 0).toFixed(2)}`);
            this.setElText('#summary-nc-count', `${displayData?.notasCredito?.totalNotas || 0} docs`);
        } catch (error) {
            console.warn('⚠️ Error updating summary:', error);
        }
    }

    setupCopyableValues(values) {
        if (!this.container) return;

        const copyables = this.container.querySelectorAll('.copyable-value');
        copyables.forEach((el, idx) => {
            // Map index to value
            const valueMap = [
                values.iva15,      // Base 15%
                values.iva0,       // Base 0%
                values.totalCompra, // Total Compra (NEW)
                values.facturasCount, // Facturas count
                values.retBase,    // Base Imp.
                values.retIva,     // IVA Ret.
                values.retRenta,   // Renta Ret.
                values.retCount,    // Retenciones count
                values.ncIva15,    // NC Base 15%
                values.ncIva0,     // NC Base 0%
                values.ncTotal,    // NC Total (NEW)
                values.ncCount     // NC count
            ];

            const value = valueMap[idx];
            if (value !== undefined) {
                el.setAttribute('data-value', value);
                el.style.cursor = 'pointer';
                el.style.transition = 'all 0.2s';

                el.onclick = async (e) => {
                    if (this.isOnForm && !e.shiftKey) {
                        // SMART CLICK-TO-FILL
                        const targetMap = {
                            '558.02': '500', // Example logic placeholder
                            // Dynamic mapping based on idx
                        };

                        // Use the idx to determine target field
                        // Use the idx to determine target field
                        const fieldMap = [
                            '500', // iva15 -> Base 15% (500)
                            '507', // iva0 -> Base 0% (507)
                            'total', // totalCompra
                            'count', // facturasCount
                            'none',  // retBase
                            '609', // retIva -> IVA Ret (609)
                            '610', // retRenta -> Renta Ret (610)
                            'count',
                            '510', // ncIva15 (NC Base 15) -> 510 ? Or 500-NC logic?
                            '517', // ncIva0 (NC Base 0)
                            'total',
                            'count'
                        ];

                        const targetId = fieldMap[idx];

                        if (targetId && isFieldId(parseInt(targetId))) {
                            this.showEliteToast({
                                title: '✏️ Llenando...',
                                msg: `Aplicando ${value} en Casillero ${targetId}...`,
                                duration: 1500
                            });
                            await llenarCampo(targetId, value);
                            return;
                        }
                    }

                    // Fallback to Clipboard Copy
                    navigator.clipboard.writeText(value.toString()).then(() => {
                        // Visual feedback
                        const originalBg = el.style.background;
                        el.style.background = 'rgba(16, 185, 129, 0.3)';

                        // Show toast
                        this.showEliteToast({
                            title: '📋 Copiado',
                            msg: `Valor ${value} copiado al portapapeles`,
                            duration: 2000
                        });

                        setTimeout(() => {
                            el.style.background = originalBg;
                        }, 300);
                    });
                };

                // Hover effect
                el.onmouseenter = () => {
                    el.style.transform = 'scale(1.05)';
                    el.style.background = 'rgba(255, 255, 255, 0.05)';
                    if (this.isOnForm) el.title = "Click para LLENAR en formulario";
                };
                el.onmouseleave = () => {
                    el.style.transform = 'scale(1)';
                    el.style.background = '';
                    el.title = "Click para copiar";
                };
            }
        });
    }

    setElText(sel, text) {
        const el = this.container.querySelector(sel);
        if (el) el.textContent = text;
    }

    bindEvents() {
        if (!this.container) return;

        const header = this.container.querySelector('#sri-panel-header');
        if (header) {
            header.onclick = (e) => {
                if (e.target.closest('#sri-panel-pause')) return;
                this.isExpanded = false;
                this.render();
            };
        }

        const pauseBtn = this.container.querySelector('#sri-panel-pause');
        if (pauseBtn) {
            pauseBtn.onclick = (e) => {
                e.stopPropagation();
                this.togglePause();
            };
        }

        this.bindBtn('#btn-panel-turbo', () => this.runUnifiedWorkflow('TURBO_FULL'));
        this.bindBtn('#btn-panel-nav-iva', () => this.runUnifiedWorkflow('NAVIGATE_ONLY'));
        this.bindBtn('#btn-panel-extract', () => this.runUnifiedWorkflow('EXTRACT_DATA'));

        // Acciones de Formulario (Nuevos IDs)
        this.bindBtn('#btn-panel-fill-all', () => this.handleFillForm('TODO')); // Botón Grande
        this.bindBtn('#btn-hud-ventas', () => this.handleFillForm('ventas'));
        this.bindBtn('#btn-hud-compras', () => this.handleFillForm('compras'));
        this.bindBtn('#btn-hud-retenciones', () => this.handleFillForm('retenciones'));
        this.bindBtn('#btn-hud-resumen', () => this.handleFillForm('resumen'));
        this.bindBtn('#btn-hud-nc', () => this.handleFillForm('NC'));

        // ELITE v12.7: Modo Manual
        const btnEnterManual = this.container.querySelector('#btn-enter-manual');
        if (btnEnterManual) btnEnterManual.onclick = () => this.toggleManualMode(true);

        const btnExitManual = this.container.querySelector('#btn-exit-manual');
        if (btnExitManual) btnExitManual.onclick = () => this.toggleManualMode(false);

        // Acciones de Utilidad
        this.bindBtn('#btn-panel-borrar', async () => {
            if (confirm('¿Borrar memoria temporal?')) {
                await GhostMemory.clearCurrent();
                this.updateSummary();
                this.showEliteToast({ title: '🧹 Limpio', msg: 'Memoria borrada.' });
            }
        });

        this.bindBtn('#btn-panel-detener', async () => {
            await this.stopAutomation();
        });

        this.bindBtn('#btn-panel-refresh', () => {
            this.updateSummary();
            this.checkIfOnForm();
            this.showEliteToast({ msg: 'Estado del panel actualizado', title: '🔄 Refresh' });
        });

        this.bindBtn('#btn-reopen-report', async () => {
            const items = await SafeStorage.get(['lastBulkReport', 'bulkFlow']);
            if (items.lastBulkReport) {
                showBulkEliteToast(items.lastBulkReport.totals, items.lastBulkReport, items.lastBulkReport.period);
            } else if (items.bulkFlow && items.bulkFlow.results.length > 0) {
                // Si no hay reporte final pero hay resultados parciales, intentar mostrar lo que hay
                this.log('⏳ Generando vista previa del reporte...');
                // Reutilizar lógica de agregación de updateSummary... (pero por simplicidad avisamos si no hay reporte guardado)
                this.showEliteToast({ title: 'Reporte Maestro', msg: 'El reporte final aparecerá al terminar la extracción.' });
            }
        });

        this.bindBtn('#btn-panel-unfreeze', () => {
            this.closeContextCard();
            // Limpieza agresiva de capas de bloqueo
            const blockers = document.querySelectorAll('.sri-elite-context-card, #sri-disconnection-overlay');
            blockers.forEach(b => b.remove());
            const overlays = Array.from(document.querySelectorAll('div')).filter(el => {
                const style = getComputedStyle(el);
                return style.position === 'fixed' && style.zIndex >= '999999' && el !== this.container;
            });
            overlays.forEach(o => o.remove());
            this.showEliteToast({ title: '🔓 Descongelado', msg: 'Capas de bloqueo eliminadas.' });
        });
    }

    bindBtn(sel, fn) {
        const btn = this.container.querySelector(sel);
        if (btn) {
            btn.onclick = async () => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                await fn();
                btn.disabled = false;
                btn.style.opacity = '1';
            };
        }
    }

    async handleFillForm(type) {
        this.log('⏳ Ejecutando acción...');
        try {
            const storage = await GhostMemory.getData();
            if (!storage.facturas && !storage.retenciones) {
                this.log('❌ No hay datos en memoria');
                return;
            }
            if (type === 'TODO') {
                await autoLlenarFormulario(storage);
                // --- INICIO FLUJO FINALIZACIÓN CERO TOQUES ---
                const safeStorage = await SafeStorage.get('autoDeclaration');
                if (safeStorage.autoDeclaration) {
                    this.log('🚀 [TURBO] Formulario lleno. Iniciando CIERRE MÁGICO automático...');
                    await sleep(1500);
                    await this.ejecutarCierreMagico();
                } else {
                    this.log('✅ Formulario lleno. Puedes revisarlo o usar el CIERRE MÁGICO.');
                    this.setStatus('✅ Llenado Completado');
                }
            } else if (type === 'ventas') {
                const n = await llenarVentas(storage);
                this.showEliteToast({
                    title: '📊 Ventas completadas',
                    msg: `${n} campo(s) llenado(s) en la sección Ventas.`,
                    duration: 5000
                });
            } else if (type === 'compras') {
                // Primero ventas (origen → destino), luego compras
                const nV = await llenarVentas(storage);
                await sleep(600);
                const nC = await llenarCompras(storage);
                this.showEliteToast({
                    title: '🧾 Formulario Actualizado',
                    msg: `✅ Ventas: ${nV} campo(s) | 🛍️ Compras: ${nC} campo(s)`,
                    duration: 7000
                });
            } else if (type === 'retenciones') {
                const n = await llenarRetenciones(storage);
                this.showEliteToast({
                    title: '💎 Retenciones OK',
                    msg: `Se han mapeado ${n} campos de retenciones.`,
                    duration: 5000
                });
            } else if (type === 'resumen') {
                // El resumen impositivo centralizado: Retenciones (609) + Sugeridos (564, 615, 617, 619)
                this.log('🔍 Procesando resumen impositivo completo...');
                let total = 0;
                // 1. Retenciones
                total += await llenarRetenciones(storage);
                await sleep(1000);
                // 2. Sugeridos
                const fields = ['564', '615', '617', '619'];
                for (const f of fields) {
                    if (['615', '617', '619'].includes(f)) await toggleSriSection('RESUMEN', true);
                    if (await procesarCampoConSugerido(f)) total++;
                    await sleep(400);
                }
                this.showEliteToast({
                    title: '📋 Resumen Finalizado',
                    msg: `Se han procesado ${total} campos en el resumen impositivo.`,
                    duration: 5000
                });
            }
            this.log('✅ Operación completada');
        } catch (e) {
            this.log('❌ Error: ' + e.message);
        }
    }

    async runUnifiedWorkflow(workType, context = {}) {
        this.setWorking(true);
        this.isExpanded = false;
        this.render();

        let period;
        if (context && context.monthIndex !== undefined) {
            period = { year: context.year, monthIndex: context.monthIndex };
        } else if (context && context.month) {
            period = { year: context.year, monthIndex: context.month - 1 };
        } else {
            period = this.getDefaultPeriod();
        }

        // 💎 ELITE v13: Limpieza Inmediata antes de empezar
        if (workType === 'TURBO_FULL') {
            const ruc = await GhostMemory.getRuc();
            this.log(`🧹 Limpiando memoria para RUC: ${ruc}...`);
            await GhostMemory.clearCurrent();
            
            await SafeStorage.set({
                pendingAction: 'turbo_step1_facturas',
                checkFacturas: true,
                checkRetenciones: true,
                checkNC: true,
                workflowPeriod: period,
                autoDeclaration: true, // 🚀 MODO AUTOMATICO ACTIVADO
                sriAutomationPaused: false,
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });

            // NAVEGACIÓN UNIVERSAL (Solo si estamos en el SRI)
            const isSri = window.location.hostname.includes('sri.gob.ec');
            if (!isSri) {
                this.log('⚠️ Por favor, logueate en el SRI para continuar.');
                this.setWorking(false);
                return;
            }

            // Si no estamos en el buscador de comprobantes, vamos allá
            if (!window.location.href.includes('comprobantes-electronicos-recibidos')) {
                await navegarAComprobantes();
            } else {
                window.location.reload(); // Recargar para iniciar el flujo limpio
            }
        } else if (workType === 'NAVIGATE_AND_FILL') {
            await SafeStorage.set({
                pendingAction: 'startIvaNavigation',
                workflowPeriod: period,
                autoDeclaration: true,
                sriAutomationPaused: false,
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });
            window.location.href = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones';
        } else if (workType === 'NAVIGATE_ONLY') {
            safeStatus('🚀 Iniciando Navegación Inteligente...');
            const period = this.getDefaultPeriod(); // {year, monthIndex}
            await SafeStorage.set({
                pendingAction: 'startIvaNavigation',
                workflowPeriod: period,
                autoDeclaration: false, // 🛑 MODO MANUAL (Solo Navegación)
                sriAutomationPaused: false,
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });
            window.location.href = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones';
        }
    }

    getDefaultPeriod() {
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return { year: prev.getFullYear(), monthIndex: prev.getMonth() };
    }

    btnStyle(isPrimary = false, bg, color) {
        const base = "padding: 10px; border-radius: 12px; cursor: pointer; font-weight: 700; width: 100%; border: none; font-family: 'Inter';";
        if (isPrimary) {
            return base + `background: ${bg || '#4f46e5'}; color: ${color || 'white'};`;
        }
        return base + "background: rgba(255,255,255,0.05); color: white;";
    }

    smallBtnStyle() { return "padding: 6px; font-size: 10px; border-radius: 8px; cursor: pointer;"; }

    setStatus(msg) {
        if (!this.container) return;
        const el = this.container.querySelector('#sri-panel-status');
        if (el) {
            el.innerHTML = msg;
            el.style.borderLeftColor = '#6366f1';
        } else {
            this.showEliteToast({ title: "💎 Estado", msg: msg });
        }
    }

    log(msg) {
        console.log(`🤖 SRI LOG: ${msg}`);
        const statusEl = document.getElementById('sri-panel-status');
        if (statusEl) {
            statusEl.innerHTML = `📡 ${msg}`;
            statusEl.style.borderColor = '#10b981';
        }

        // Mantener el toast actualizado si es un progreso numérico
        if (msg.includes('%')) {
            const p = parseInt(msg.match(/\d+/)[0]);
            this.showEliteToast({ title: 'Procesando', msg: 'Extrayendo datos SRI...', progress: p });
        }
    }

    async togglePause() {
        this.isPaused = !this.isPaused;
        await SafeStorage.set({ sriAutomationPaused: this.isPaused });
        this.updatePauseUI();
    }

    updatePauseUI() {
        const btn = this.container.querySelector('#sri-panel-pause');
        const status = this.container.querySelector('#sri-panel-status');
        if (!btn || !status) return;

        if (this.isPaused) {
            btn.innerHTML = '▶️'; // Invertido para que el botón muestre qué hará al clicar
            status.innerHTML = '⏸️ **SISTEMA PAUSADO.**';
            status.style.borderLeftColor = '#f59e0b';
        } else {
            btn.innerHTML = '⏸️';
            status.innerHTML = '✨ **SISTEMA ACTIVO.**';
            status.style.borderLeftColor = '#6366f1';
        }
    }

    setWorking(isActive) {
        if (!this.container) return;
        this.working = isActive; // ELITE v13.1: Sincronizar estado interno

        const ghost = document.getElementById('sri-ghost-icon');
        if (isActive) {
            this.container.classList.add('sri-working');
            if (ghost) ghost.classList.add('is-working-ghost');
            const btnDetener = document.getElementById('btn-panel-detener');
            if (btnDetener) btnDetener.style.display = 'block';
        } else {
            this.container.classList.remove('sri-working');
            if (ghost) ghost.classList.remove('is-working-ghost');
            const btnDetener = document.getElementById('btn-panel-detener');
            if (btnDetener) btnDetener.style.display = 'none';
        }
    }

    smartHighlightFill() {
        const btn = document.getElementById('btn-panel-fill-all');
        if (btn) {
            btn.style.animation = 'sri-pulse 1.5s infinite';
            btn.style.boxShadow = '0 0 20px rgba(37, 99, 235, 0.5)';
            this.log('🔥 ¡Formulario alcanzado! Haz clic en LLENAR TODO.');
        }
    }

    toggleMinimize(forceMinimize = null) {
        if (forceMinimize === true) this.isExpanded = false;
        else if (forceMinimize === false) this.isExpanded = true;
        else this.isExpanded = !this.isExpanded;

        this.saveState(); // Persist new state
        this.render();
    }

    async stopAutomation(requireConfirm = true) {
        if (!requireConfirm || confirm('¿Desea detener el proceso de élite?')) {
            await SafeStorage.set({ sriAutomationPaused: true });
            await SafeStorage.remove(['pendingAction']);

            this.setWorking(false);
            this.log('🛑 Proceso detenido por el usuario.');
            this.showEliteToast({ title: '🛑 Detenido', msg: 'La automatización se ha detenido.' });

            // Si no estamos en un flujo crítico que requiere refresco, solo update UI
            window.location.reload(); // ELITE FIX: Restaurado para matar todos los ciclos (ej. waitFor, scan) pendientes

        }
    }
}

// Inicializar panel automáticamente
window.sriAssistant = new SriAssistantPanel();

// NUEVA FUNCIÓN: Navegación Wizard Declaraciones (Angular/SPA) - VERSIÓN ZERO-LAG (ELITE)
async function ejecutarNavegacionDeclaracion(periodData) {
    const progress = (p) => { if (window.sriAssistant?.updateProgress) window.sriAssistant.updateProgress(p); };

    safeStatus('👻 Iniciando Wizard Ghost...');
    progress(5);

    console.group('🚀 Wizard SRI Ghost v9.0 (OPTIMIZED)');

    // Default to previous month if no periodData provided
    if (!periodData) {
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        periodData = { year: prev.getFullYear(), monthIndex: prev.getMonth() };
    }

    const { year, monthIndex } = periodData;

    try {
        // PASO 0: ESPERA DEL PORTAL (OPTIMIZADO v10.0)
        console.log('🔍 Paso 0: Esperando al portal (Splash)...');
        safeStatus('⏳ Esperando al portal...');

        // Espera optimizada: Si el splash se va, arrancamos.
        await waitFor(() => {
            const splash = document.getElementById('id-sri-splash') || document.querySelector('.sri-splash');
            const splashHidden = !splash || splash.offsetParent === null || getComputedStyle(splash).display === 'none';
            // Verificación secundaria simplificada (Header de usuario presente)
            const headerUsuario = document.getElementById('nombreRuc') || document.querySelector('.nombre-comercial-header');
            // Menos estricto con document.readyState para ganar velocidad
            return splashHidden && (!!headerUsuario || document.readyState === 'complete' || document.readyState === 'interactive');
        }, 5000, 'Portal Splash'); // Reducido timeout a 5s

        await sleep(300); // Pequeña pausa de estabilidad
        progress(15);

        // PASO 1: UBICACIÓN (Optimization SONIC)
        console.log('🔍 Paso 1: Verificando vista...');
        safeStatus('🔍 Verificando página...');
        await dismissSridialogs();

        // ¿Ya estamos en el Wizard?
        const checkWizardInDOM = () => {
            return document.getElementById('frmFlujoDeclaracion:somObligacion_label') ||
                document.querySelector('div[id*="somObligacion"]') ||
                window.location.href.includes('somObligacion');
        };

        if (!checkWizardInDOM()) {
            safeStatus('📑 Buscando Formulario IVA...');
            progress(20);

            console.log('🔍 Buscando enlace de Formulario IVA en la página...');

            // Búsqueda Robusta: ID-First + Text-Fallback
            const target = await waitFor(() => {
                // 1. Selector directo del botón "Declaraciones" o "IVA" en el menú
                const directBtn = document.querySelector('a[href*="declaracionImpuesto"]');
                if (directBtn) return directBtn;

                // 2. Buscar Tarjetas (Cards) típicas del Dashboard o enlaces específicos
                const cards = Array.from(document.querySelectorAll('.card, .ui-panel, .dashboard-item, a[href*="redireccion=310"]'));
                const ivaCard = cards.find(c => {
                    const txt = (c.innerText || "").toUpperCase();
                    const href = (c.getAttribute('href') || "");
                    return (txt.includes('IVA') && (txt.includes('DECLARACIÓN') || txt.includes('MENSUAL'))) || href.includes('redireccion=310');
                });
                if (ivaCard) return ivaCard;

                // 2.5 Buscar el ítem de menú "Elaboración y envío de declaraciones"
                const menuItems = Array.from(document.querySelectorAll('.ui-menuitem-text, span[role="menuitem"]'));
                const elaboracionMenu = menuItems.find(el => el.textContent.includes('Elaboración y envío de declaraciones'));
                if (elaboracionMenu) return elaboracionMenu;

                // 3. Fallback a texto en general
                const allLinks = Array.from(document.querySelectorAll('a, button'));
                return allLinks.find(el => {
                    const txt = (el.innerText || "").toUpperCase().trim();
                    return txt === 'IVA' || txt === 'DECLARACIÓN DE IVA' || txt.includes('FORMULARIO IVA');
                });
            }, 3000, 'Acceso a Formulario IVA'); // Timeout MUY CORTO (3s) para fallar rápido a URL directa

            if (target) {
                console.log('✅ Botón Formulario IVA detectado. Clickeando...');
                safeStatus('⚡ Ingresando a IVA...');
                progress(25);
                clickElement(target, 'Formulario IVA');

                // Dar tiempo a la navegación SPA o recarga
                await sleep(2000);
            } else {
                console.warn('⚠️ No se encontró botón IVA, navegando a la página índice de declaraciones...');
                safeStatus('🔄 Abriendo Gestor de Declaraciones...');
                // Vamos a la página índice que el usuario confirmó que funciona
                const URL_INDICE_DECLARACIONES = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones';
                window.location.href = URL_INDICE_DECLARACIONES;
                await sleep(5000); 
                return;
            }
        } else {
            console.log('✅ Ya estamos en el Wizard.');
            progress(30);
        }

        // Re-verificar Wizard con reintentos
        let lblObligacion = await waitFor(checkWizardInDOM, 10000, 'Wizard Load');

        if (!lblObligacion) {
            console.error('❌ El Wizard no apareció tras espera.');
            safeStatus('❌ Error: Portal no responde.');
            return;
        }

        // PASO 2: OBLIGACIÓN (Selection 2011 - Robust v2)
        console.log('🔍 Paso 2: Selección 2011...');
        safeStatus('🎯 Seleccionando Obligación 2011...');

        await dismissSridialogs();

        const getLabelObligacion = () => document.getElementById('frmFlujoDeclaracion:somObligacion_label');
        let selectionOk = false;

        // Bucle de reintento para selección de obligación (SRI suele ignorar el 1er click)
        for (let attempt = 0; attempt < 3; attempt++) {
            await dismissSridialogs();
            let labelActual = getLabelObligacion();
            if (labelActual && labelActual.textContent.includes('2011')) {
                console.log('✅ Obligación 2011 ya seleccionada.');
                selectionOk = true;
                break;
            }

            console.log(`🎯 Intento ${attempt + 1}: Abriendo dropdown obligación...`);
            const trigger = document.querySelector('#frmFlujoDeclaracion\\:somObligacion .ui-selectonemenu-trigger') || labelActual;

            if (trigger) {
                clickElement(trigger, 'Dropdown Obligación');

                const opt = await waitFor(() => {
                    // Buscar el panel VISIBLE (pueden haber varios en el DOM)
                    const panels = Array.from(document.querySelectorAll('.ui-selectonemenu-panel'));
                    const activePanel = panels.find(p => p.style.display !== 'none' && p.offsetParent !== null);
                    if (!activePanel) return null;

                    return Array.from(activePanel.querySelectorAll('li'))
                        .find(li => li.textContent.includes('2011'));
                }, 3000, `Opción 2011 (Intento ${attempt + 1})`);

                if (opt) {
                    console.log('✅ Opción 2011 encontrada. Clickeando...');
                    clickElement(opt, '2011');
                    await waitForPortal(); // Esperar Ajax del SRI que carga los periodos
                    await sleep(1000); // Pausa extra para estabilidad del DOM

                    // Verificar si pegó
                    labelActual = getLabelObligacion();
                    if (labelActual && labelActual.textContent.includes('2011')) {
                        selectionOk = true;
                        break;
                    }
                }
            }
            await sleep(1000);
        }

        if (selectionOk) {
            progress(50);
        } else {
            console.error('🚫 Fallo crítico: No se pudo seleccionar la obligación 2011.');
            throw new Error('No se pudo seleccionar la obligación 2011. Por favor selecciona manualmente y el asistente continuará.');
        }

        // PASO 3: SELECCIÓN DE PERIODO (Año/Mes)
        console.log('🔍 Paso 3: Selección de Periodo (Detección de Interfaz)...');
        safeStatus('📅 Configurando periodo...');

        await dismissSridialogs();

        const mesesAbreviados = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        const mesesCompletos = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const targetMonthName = mesesCompletos[monthIndex];
        let periodSelected = false;

        // 3.1: DETECCIÓN DEL NUEVO CALENDARIO (Picker Único v11.0)
        const calendarInput = await waitFor(() => {
            const el = document.getElementById('frmFlujoDeclaracion:calPeriodo') ||
                document.getElementById('frmFlujoDeclaracion:calPeriodo_input') ||
                document.querySelector('input[id*="calPeriodo"]') ||
                document.querySelector('.month-year-input');
            return (el && el.offsetParent !== null) ? el : null;
        }, 8000, 'Calendar Input Periodo');

        if (calendarInput) {
            console.log('📅 Interfaz CALENDARIO detectada. Procediendo...');

            // ELITE INTERACTION: Asegurar que el calendario se abra sin cerrarlo si ya está abierto
            const openCalendar = async () => {
                const isCalendarVisible = () => {
                    const picker = document.querySelector('.ui-datepicker:not(.ui-helper-hidden)') || 
                                   document.querySelector('.ui-dialog[aria-hidden="false"] .button-3');
                    if (picker && picker.offsetParent !== null) return true;
                    // Búsqueda profunda de cualquier contenedor con botones de mes
                    return !!Array.from(document.querySelectorAll('.button-3, .ui-datepicker-calendar'))
                                .find(el => el.offsetParent !== null);
                };

                if (isCalendarVisible()) return true;

                for (let i = 0; i < 3; i++) {
                    console.log(`🎯 Abriendo calendario (Intento ${i+1})...`);
                    calendarInput.focus();
                    await sleep(200);
                    
                    // Click coordinado
                    const rect = calendarInput.getBoundingClientRect();
                    const clickEvent = new MouseEvent('mousedown', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    });
                    calendarInput.dispatchEvent(clickEvent);
                    calendarInput.click();
                    
                    await sleep(1000); // Esperar animación de PrimeFaces
                    if (isCalendarVisible()) return true;
                }
                return false;
            };

            await openCalendar();

            // 3.2: AJUSTAR EL AÑO EN EL CALENDARIO
            const adjustYear = async (targetYear) => {
                const maxIntents = 20;
                for (let i = 0; i < maxIntents; i++) {
                    let datepickerDiv = document.getElementById('ui-datepicker-div') ||
                        document.querySelector('.ui-datepicker:not(.ui-helper-hidden)') ||
                        document.querySelector('.ui-datepicker-inline');
                    
                    if (!datepickerDiv) {
                        datepickerDiv = Array.from(document.querySelectorAll('.ui-datepicker, .ui-dialog, .ui-widget-content'))
                            .find(d => {
                                if (d.offsetParent === null) return false;
                                // Si tiene el botón-3 que el usuario reportó, este es el contenedor
                                return !!d.querySelector('.button-3');
                            });
                    }

                    if (!datepickerDiv) {
                        console.log('⏳ Buscando visor de calendario...');
                        const opened = await openCalendar();
                        if (!opened) {
                            console.warn('⚠️ No se pudo abrir el calendario visualmente.');
                        }
                        await sleep(500);
                        continue;
                    }

                    // Extraer año actual del encabezado
                    const header = datepickerDiv.querySelector('.ui-datepicker-header, .ui-widget-header, .ui-datepicker-title') || datepickerDiv;
                    const headerText = (header.innerText || header.textContent || "").replace(/\s+/g, ' ').trim().toUpperCase();
                    const matchYear = headerText.match(/(20\d{2})/);

                    if (!matchYear) {
                        console.log('📅 No se halló año en cabecera text:', headerText);
                        // A veces el año está en un botón o span específico
                        const yearEl = datepickerDiv.querySelector('.ui-datepicker-year, .ui-button-text, .ui-datepicker-title');
                        const yearText = (yearEl ? yearEl.textContent : "").match(/20\d{2}/);
                        if (yearText && parseInt(yearText[0]) === targetYear) return datepickerDiv;
                        
                        await sleep(400);
                        continue;
                    }

                    const currentYear = parseInt(matchYear[0]);
                    console.log(`🔎 Año en UI: ${currentYear} | Objetivo: ${targetYear}`);

                    if (currentYear === targetYear) return datepickerDiv;

                    // Navegar al año correcto
                    const isNext = currentYear < targetYear;
                    const arrow = datepickerDiv.querySelector(isNext ? '.ui-datepicker-next' : '.ui-datepicker-prev') || 
                                  Array.from(datepickerDiv.querySelectorAll('a, button, span')).find(el => {
                                      const label = (el.getAttribute('aria-label') || '').toLowerCase();
                                      const icon = (el.className || '').toLowerCase();
                                      return isNext ? (label.includes('next') || icon.includes('right')) : (label.includes('prev') || icon.includes('left'));
                                  });

                    if (arrow) {
                        clickElement(arrow, 'Cambiar Año');
                        await sleep(1000); // Dar tiempo a la animación de cambio de año
                    } else {
                        break;
                    }
                }
                return null;
            };

            const yearGrid = await adjustYear(year);

            // 3.3: SELECCIONAR EL MES (Detección Ultra-Precisa)
            const selectMonthInCalendar = (grid) => {
                const root = grid || document.body;
                const targetText = targetMonthName; // "MARZO", "ABRIL", etc.
                const shortText = mesesAbreviados[monthIndex]; // "MAR", "ABR", etc.

                console.log(`🎯 Buscando botón para: ${targetText} (${shortText}) en el calendario...`);

                // Buscamos todos los elementos que parezcan botones de mes
                const candidates = Array.from(root.querySelectorAll('a.ui-button, button.ui-button, .button-3, td'))
                    .filter(el => {
                        if (el.offsetParent === null) return false;
                        const txt = el.textContent.trim().toUpperCase();
                        // Filtrar para que sea EXACTO o contenga el mes pero no sea el año
                        return txt.length > 0 && (txt === targetText || txt === shortText || (txt.includes(targetText) && !txt.match(/20\d{2}/)));
                    });

                // Prioridad a .button-3 (el que el usuario confirmó)
                const bestMatch = candidates.find(el => el.classList.contains('button-3')) || 
                                 candidates.find(el => el.tagName === 'A') || 
                                 candidates[0];

                if (bestMatch) {
                    console.log(`✅ Mes ${targetText} localizado. Forzando click...`);
                    bestMatch.focus();
                    
                    // Doble evento para asegurar que PrimeFaces lo detecte
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    bestMatch.dispatchEvent(clickEvent);
                    
                    // Fallback si el MouseEvent no cierra el picker
                    if (typeof bestMatch.click === 'function') bestMatch.click();

                    return true;
                }
                return false;
            };

            const monthSelected = selectMonthInCalendar(yearGrid);

            if (monthSelected) {
                console.log('✨ Mes clickeado. Esperando que el portal procese la selección...');
                periodSelected = true;
                progress(75);
                
                // Esperar a que el calendario se cierre solo o el input gane el valor
                await waitFor(() => {
                    const picker = document.querySelector('.ui-datepicker:not(.ui-helper-hidden)') || 
                                   document.querySelector('.ui-dialog[aria-hidden="false"] .button-3');
                    return !picker || picker.offsetParent === null;
                }, 3000, 'Cierre de Calendario');

                await waitForPortal();
                await sleep(1500); // Pausa necesaria para que PrimeFaces habilite el botón 'Siguiente'
            } else {
                // 3.4: GHOST INJECTION (Fallback de emergencia)
                console.log('⚠️ No se pudo clickear el mes. Intentando inyección directa...');
                const dateString = `${(monthIndex + 1).toString().padStart(2, '0')}/${year}`;
                calendarInput.value = dateString;
                calendarInput.dispatchEvent(new Event('input', { bubbles: true }));
                calendarInput.dispatchEvent(new Event('change', { bubbles: true }));
                calendarInput.dispatchEvent(new Event('blur', { bubbles: true }));
                
                // Trigger adicional de PrimeFaces vía widget si está expuesto
                try {
                    const id = calendarInput.id.replace(/:/g, '\\:');
                    const widget = window.PF && window.PF(id);
                    if (widget && widget.setDate) {
                        widget.setDate(new Date(year, monthIndex, 1));
                    }
                } catch(e) {}
                
                await sleep(1500);
                periodSelected = true; 
            }
        }

        // FALLBACK: MODO CLÁSICO (Dropdowns) si falla el calendario O si el calendario falló en seleccionar
        if (!periodSelected) {
            console.log('🔍 Intentando Fallback: Interfaz Clásica (Dropdowns)...');

            const findClassicDropdown = async (labelMatch, idMatch) => {
                return await waitFor(() => {
                    const elId = document.getElementById(idMatch);
                    if (elId && elId.offsetParent !== null) return elId;
                    const label = findByText(labelMatch, 'label');
                    if (label) {
                        const container = label.closest('.ui-selectonemenu') || label.parentElement.querySelector('.ui-selectonemenu');
                        if (container) return container.querySelector('.ui-selectonemenu-label') || container;
                    }
                    return null;
                }, 4000, `Dropdown ${labelMatch} `);
            };

            const labelAnio = await findClassicDropdown('AÑO', 'frmFlujoDeclaracion:somAnio_label');
            let yearClassicOk = false;
            if (labelAnio) {
                if (labelAnio.textContent.includes(year.toString())) {
                    console.log('✅ Año ya seleccionado en dropdown clásico.');
                    yearClassicOk = true;
                } else {
                    // RETRY LOOP para dropdown de año
                    for (let attempt = 0; attempt < 3; attempt++) {
                        console.log(`🎯 Intento ${attempt + 1}: Seleccionando año ${year} en dropdown clásico...`);
                        const trigger = labelAnio.closest('.ui-selectonemenu') || labelAnio;
                        clickElement(trigger, 'Dropdown Año');
                        await sleep(800);

                        const optAnio = Array.from(document.querySelectorAll('.ui-selectonemenu-items li, .ui-selectonemenu-panel li'))
                            .find(li => li.textContent.trim() === year.toString());

                        if (optAnio) {
                            clickElement(optAnio, year.toString());
                            await waitForPortal();
                            await sleep(500);

                            // Verificar si pegó
                            if (labelAnio.textContent.includes(year.toString())) {
                                console.log('✅ Año seleccionado correctamente.');
                                yearClassicOk = true;
                                break;
                            }
                        }
                        await sleep(500);
                    }
                }
            }

            const labelMes = await findClassicDropdown('MES', 'frmFlujoDeclaracion:somMes_label');
            if (yearClassicOk && labelMes) {
                if (labelMes.textContent.toUpperCase().includes(targetMonthName)) {
                    console.log('✅ Mes ya seleccionado en dropdown clásico.');
                    periodSelected = true;
                } else {
                    // RETRY LOOP para dropdown de mes
                    for (let attempt = 0; attempt < 3; attempt++) {
                        console.log(`🎯 Intento ${attempt + 1}: Seleccionando mes ${targetMonthName} en dropdown clásico...`);
                        const trigger = labelMes.closest('.ui-selectonemenu') || labelMes;
                        clickElement(trigger, 'Dropdown Mes');
                        await sleep(800);

                        const optMes = Array.from(document.querySelectorAll('.ui-selectonemenu-items li, .ui-selectonemenu-panel li'))
                            .find(li => li.textContent.trim().toUpperCase() === targetMonthName);

                        if (optMes) {
                            clickElement(optMes, targetMonthName);
                            await waitForPortal();
                            await sleep(500);

                            // Verificar si pegó
                            if (labelMes.textContent.toUpperCase().includes(targetMonthName)) {
                                console.log('✅ Mes seleccionado correctamente.');
                                periodSelected = true;
                                break;
                            }
                        }
                        await sleep(500);
                    }
                }
            } else if (!yearClassicOk) {
                console.warn('⚠️ No se pudo seleccionar el año, saltando selección de mes.');
            }
        }

        // VALIDACIÓN DE SEGURIDAD CON ASISTENCIA AL USUARIO
        if (!periodSelected) {
            console.error('🚫 El periodo no pudo ser configurado automáticamente.');
            safeStatus('🤝 Necesito tu ayuda: Selecciona el periodo manualmente');

            // ELITE: Mostrar tarjeta de asistencia al usuario
            if (window.sriAssistant) {
                window.sriAssistant.showContextCard({
                    title: '🤝 Asistencia Requerida',
                    subtitle: `${targetMonthName} ${year}`,
                    message: `No pude seleccionar el periodo automáticamente.<br><br>Por favor:<br>1. Selecciona <b>${targetMonthName} ${year}</b> manualmente<br>2. Haz click en <b>"Siguiente"</b><br><br>El asistente continuará automáticamente.`,
                    icon: '👆',
                    actionText: '✅ ENTENDIDO',
                    onAction: () => { }
                });
            }

            // ESPERAR A QUE EL USUARIO SELECCIONE Y CONTINUAR AUTOMÁTICAMENTE
            console.log('⏳ Esperando selección manual del periodo...');
            const userSelectedPeriod = await waitFor(() => {
                // Verificar si el botón Siguiente está habilitado (indica que el periodo fue seleccionado)
                const btnSig = document.getElementById('frmFlujoDeclaracion:btnObligacionSiguiente');
                return (btnSig && !btnSig.disabled) ? btnSig : null;
            }, 120000, 'Selección Manual de Periodo'); // 2 minutos de espera

            if (userSelectedPeriod) {
                console.log('✅ Usuario seleccionó el periodo. Continuando...');
                periodSelected = true;
            } else {
                console.error('❌ Timeout esperando selección manual.');
                safeStatus('❌ Tiempo agotado. Reinicia el proceso.');
                return;
            }
        }

        // PASO 4: BOTÓN SIGUIENTE (Primer Step)
        console.log('🔍 Paso 4: Avanzar Siguiente...');
        const btnSiguiente = await waitFor(() => {
            const btn = document.getElementById('frmFlujoDeclaracion:btnObligacionSiguiente') ||
                        document.querySelector('button[id*="btnObligacionSiguiente"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.innerText.toUpperCase().includes('SIGUIENTE'));
            return (btn && !btn.disabled && btn.offsetParent !== null) ? btn : null;
        }, 8000, 'Boton Siguiente Obligación');

        if (btnSiguiente) {
            safeStatus('🚀 Siguiente paso...');
            clickElement(btnSiguiente, 'Siguiente Obligación');
            await sleep(2000);
            // Si el portal no avanzó (sigue el botón ahí), intentar un segundo click forzado
            if (document.getElementById('frmFlujoDeclaracion:btnObligacionSiguiente')) {
                console.log('⚠️ El botón Siguiente sigue presente. Re-clickeando...');
                btnSiguiente.click();
            }
        } else {
            console.warn('⚠️ No se detectó botón Siguiente habilitado. Verifique selección manual.');
        }
        
        progress(85);
        await waitForPortal();

        // PASO 5: PREGUNTAS (Si aparecen - SMART SKIP)
        console.log('🔍 Paso 5: Preguntas...');
        const btnPreguntasSiguiente = await waitFor(async () => {
            const btn = document.getElementById('frmFlujoDeclaracion:btnPreguntasSiguiente');
            if (btn) return btn;

            // Si el botón final de paso 6 YA está visible, es que no hubo preguntas.
            const btnFinal = document.getElementById('frmFlujoDeclaracion:btnVerFormularioCompleto') ||
                findByText('Ver formulario completo');
            if (btnFinal && btnFinal.offsetParent !== null) {
                console.log('⏩ No hay preguntas. Saltando al Paso 6.');
                return 'SKIPPED';
            }
            return null;
        }, 5000, 'Botón Preguntas Siguiente');

        if (btnPreguntasSiguiente && btnPreguntasSiguiente !== 'SKIPPED') {
            safeStatus('📝 Saltando preguntas...');
            clickElement(btnPreguntasSiguiente, 'Siguiente Preguntas');
            progress(90);
            await waitForPortal();
        }

        // PASO 6: VER FORMULARIO COMPLETO (ELITE CLICK)
        console.log('🔍 Paso 6: Abrir Formulario...');
        const btnVerFormulario = await waitFor(() =>
            document.getElementById('frmFlujoDeclaracion:btnVerFormularioCompleto') ||
            findByText('Ver formulario completo'), 8000, 'Botón Ver Formulario');

        if (btnVerFormulario) {
            safeStatus('✨ Abriendo Formulario...');
            progress(95);
            const innerClickable = btnVerFormulario.querySelector('a, button, span.ui-button-text') || btnVerFormulario;
            clickElement(innerClickable, 'Ver Formulario Completo');
            await waitForPortal(); // ZERO-LAG Final
            progress(100);

            // ELITE NOTIFICACIÓN: LLEGADA AL FORMULARIO
            if (window.sriAssistant) {
                window.sriAssistant.setWorking(false);
                // Fix: Removed isOnForm = true to allow edge detection in checkIfOnForm
                window.sriAssistant.toggleMinimize(false); // EXPANDIR PANEL
                window.sriAssistant.render(); // MOSTRAR BOTONES DE LLENADO

                window.sriAssistant.showEliteToast({
                    title: '🚀 ¡Formulario Listo!',
                    msg: 'Analizando formulario para auto-llenado...',
                    duration: 4000
                });

                // ELITE FIX: Esperar a que el formulario cargue completamente antes de sugerir
                setTimeout(() => {
                    window.sriAssistant.checkIfOnForm();
                }, 2000); // 2 segundos para que el formulario se estabilice
            }

            // ELITE FIX: Limpiar pendingAction para detener el ciclo
            await SafeStorage.remove(['pendingAction', 'actionTimestamp']);
            console.log('✅ Navegación completada. pendingAction limpiado.');
        }

        console.groupEnd();
        return;
    } catch (e) {
        console.error('❌ Error en Wizard:', e);
        safeStatus('❌ Error: ' + e.message);
    } finally {
        if (window.sriAssistant) {
            const onForm = document.getElementById('concepto401');
            if (onForm) window.sriAssistant.setWorking(false);
        }
    }
}

// ============================================
// UI GHOST - NOTIFICACIONES ELEGANTES
// ============================================

function showEliteToast(data, workflowPeriod) {
    if (document.getElementById('sri-elite-toast')) {
        document.getElementById('sri-elite-toast').remove();
    }

    const toast = document.createElement('div');
    toast.id = 'sri-elite-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: -250px;
        left: 50%;
        transform: translateX(-50%);
        width: 360px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 28px;
        padding: 24px;
        color: white;
        z-index: 1000000;
        box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.3);
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
        opacity: 0;
    `;

    // Formatear valores con 2 decimales
    const retIvaFormateado = typeof data.retIva === 'number' ? data.retIva.toFixed(2) : (data.retIva || '0.00');
    const retRentaFormateado = typeof data.retRenta === 'number' ? data.retRenta.toFixed(2) : (data.retRenta || '0.00');

    toast.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 18px;">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3);">✅</div>
                <div>
                    <div style="color: #10b981; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.2;">Extracción Exitosa</div>
                    <div style="font-size: 10px; opacity: 0.6; font-weight: 600;">OPERACIÓN TURBO COMPLETADA</div>
                </div>
            </div>
            
            <div style="height: 1px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent);"></div>
            
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 13px; font-weight: 800; color: #818cf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">👤 ${data.clientName || 'Cliente Detectado'}</div>
                <div style="font-size: 11px; opacity: 0.8; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <span style="opacity: 0.5;">📅</span> ${data.periodo || 'Mes Anterior'}
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-size: 9px; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Facturas</div>
                    <div style="font-size: 18px; font-weight: 900; letter-spacing: -0.02em;">${data.facturasCount || 0}</div>
                    <div style="font-size: 9px; font-weight: 700;">
                        <span style="color: #10b981;">${data.facturasIva || 0}</span> IVA | 
                        <span style="color: #6366f1;">${data.facturas0 || 0}</span> 0%
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-size: 9px; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Retenciones</div>
                    <div style="font-size: 18px; font-weight: 900; letter-spacing: -0.02em;">${data.retCount || 0}</div>
                    <div style="font-size: 9px; font-weight: 800; display: flex; flex-direction: column; gap: 2px;">
                        <span style="color: #a855f7;">IVA: $${retIvaFormateado}</span>
                        <span style="color: #ec4899;">RENTA: $${retRentaFormateado}</span>
                    </div>
                </div>
            </div>

            <!-- NOTAS DE CRÉDITO (SINGLE MONTH REPORT) -->
            <div style="background: rgba(244, 63, 94, 0.08); padding: 14px; border-radius: 20px; border: 1px solid rgba(244, 63, 94, 0.2); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 9px; color: #f43f5e; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">Notas de Crédito</div>
                    <div style="font-size: 16px; font-weight: 900; color: #f43f5e;">$${parseFloat(data.ncTotal || 0).toFixed(2)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 10px; font-weight: 800; opacity: 0.6;">${data.ncCount || 0} DOCUMENTOS</div>
                </div>
            </div>

            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 12px; font-size: 9px; color: #cbd5e1; font-weight: 600; line-height: 1.4;">
                <div style="color: #94a3b8; font-size: 8px; text-transform: uppercase; margin-bottom: 4px;">Documentos Extraídos:</div>
                <div style="word-break: break-all;">${data.retList || '-'}</div>
            </div>
            
            <button id="sri-toast-nav-btn" style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: white; border: none; border-radius: 16px; padding: 12px; font-size: 13px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px;">
                🚀 IR A DECLARACIÓN ✨
            </button>
            <div style="font-size: 9px; text-align: center; opacity: 0.4; font-weight: 600;">LOS DATOS YA ESTÁN EN LA EXTENSIÓN 💎</div>
        </div>
    `;

    document.body.appendChild(toast);

    const navBtn = toast.querySelector('#sri-toast-nav-btn');
    if (navBtn) {
        navBtn.onclick = async () => {
            navBtn.innerText = '🔄 CARGANDO...';
            navBtn.style.opacity = '0.7';

            let periodToUse = workflowPeriod;
            if (!periodToUse) {
                const ahora = new Date();
                const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
                periodToUse = {
                    year: mesAnterior.getFullYear(),
                    monthIndex: mesAnterior.getMonth()
                };
            }

            await SafeStorage.set({
                pendingAction: 'startIvaNavigation',
                workflowPeriod: periodToUse,
                actionTimestamp: Date.now()
            });

            window.location.reload();
        };
    }

    setTimeout(() => {
        toast.style.bottom = '30px';
        toast.style.opacity = '1';
    }, 100);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.bottom = '-500px';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 1000);
        }
    }, 15000);
}

function showBulkEliteToast(totals, bulkFlow, workflowPeriod) {
    if (document.getElementById('sri-bulk-toast')) {
        document.getElementById('sri-bulk-toast').remove();
    }

    // ELITE: Guardar reporte para la extensión (Persistencia)
    const clientName = document.getElementById('sri-client-name')?.textContent || 'Cliente SRI';
    const reportData = {
        totals: totals,
        breakdown: bulkFlow.results || [],
        months: bulkFlow.months || [], // FIXED: include months
        period: workflowPeriod,
        timestamp: Date.now(),
        clientName: clientName
    };
    SafeStorage.set({ lastBulkReport: reportData });

    const toast = document.createElement('div');
    toast.id = 'sri-bulk-toast';
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 95%;
        max-width: 900px;
        max-height: 90vh;
        overflow-y: auto;
        background: rgba(15, 23, 42, 0.98);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 28px;
        padding: 30px;
        color: white;
        z-index: 1000001;
        box-shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.5);
        font-family: 'Inter', sans-serif;
    `;

    let periodLabel = `AÑO ${workflowPeriod.year}`;
    if (bulkFlow.months && bulkFlow.months.length === 6) {
        periodLabel = bulkFlow.months[0] === 0 ? `1ER SEMESTRE ${workflowPeriod.year}` : `2DO SEMESTRE ${workflowPeriod.year}`;
    } else if (bulkFlow.months && bulkFlow.months.length === 1) {
        const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        periodLabel = `${monthNames[bulkFlow.months[0]]} ${workflowPeriod.year}`;
    }

    const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

    // Generate monthly breakdown table
    let monthlyTableHTML = '';
    const resultsTable = bulkFlow.results || bulkFlow.breakdown || []; // Handle both formats
    if (resultsTable.length > 0) {
        // Sort results by month index to ensure order (Dec at end)
        const sortedResults = [...resultsTable].sort((a, b) => a.month - b.month);

        monthlyTableHTML = `
            <div style="margin-top: 25px;">
                <div style="font-size: 13px; font-weight: 800; color: #818cf8; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
                    <span>📊 DESGLOSE MENSUAL</span>
                    <span style="font-size: 10px; opacity: 0.5; font-weight: 400;">(Click en valor para copiar)</span>
                </div>
                <div style="background: rgba(0,0,0,0.3); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="background: rgba(99, 102, 241, 0.2);">
                                <th style="padding: 12px; text-align: left; font-weight: 800; color: #818cf8; text-transform: uppercase;">Mes</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #10b981;">Base 15%</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #10b981;">IVA 15%</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #10b981;">Base 0%</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #6366f1;">Ret IVA</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #a855f7;">Ret Renta</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #f43f5e;">NC 15%</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #fb7185;">NC 0%</th>
                            </tr>
                        </thead>
                        <tbody>`;

        sortedResults.forEach((m, idx) => {
            const mName = monthNames[m.month] || `MES ${m.month + 1}`;
            const f15 = parseDecimal(m.data.facturas?.iva15?.baseImponible || 0);
            const fIva = parseDecimal(m.data.facturas?.iva15?.montoIva || 0);
            const f0 = parseDecimal(m.data.facturas?.iva0?.baseImponible || 0);
            const rIva = parseDecimal(m.data.retenciones?.ivaRetenido?.total || 0);
            const rIvaBase = parseDecimal(m.data.retenciones?.ivaRetenido?.baseTotal || 0);
            const rRenta = parseDecimal(m.data.retenciones?.rentaRetenida?.total || 0);
            const rRentaBase = parseDecimal(m.data.retenciones?.rentaRetenida?.baseTotal || 0);
            const nc15 = parseDecimal(m.data.notasCredito?.iva15?.baseImponible || 0);
            const nc0 = parseDecimal(m.data.notasCredito?.iva0?.baseImponible || 0);

            monthlyTableHTML += `
                <tr style="border-top: 1px solid rgba(255,255,255,0.05); ${idx % 2 === 0 ? 'background: rgba(255,255,255,0.02);' : ''}">
                    <td style="padding: 12px; font-weight: 700; color: #cbd5e1;">${mName}</td>
                    <td class="sri-copy-val" data-val="${f15.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #10b981; cursor: pointer;">$${f15.toFixed(2)}</td>
                    <td class="sri-copy-val" data-val="${fIva.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #10b981; cursor: pointer;">$${fIva.toFixed(2)}</td>
                    <td class="sri-copy-val" data-val="${f0.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #10b981; cursor: pointer;">$${f0.toFixed(2)}</td>
                    <td style="padding: 12px; text-align: right;">
                        <div class="sri-copy-val" data-val="${rIva.toFixed(2)}" style="font-weight: 600; color: #818cf8; cursor: pointer;">$${rIva.toFixed(2)}</div>
                        <div class="sri-copy-val" data-val="${rIvaBase.toFixed(2)}" style="font-size: 8px; opacity: 0.5; cursor: pointer;">B: $${rIvaBase.toFixed(2)}</div>
                    </td>
                    <td style="padding: 12px; text-align: right;">
                        <div class="sri-copy-val" data-val="${rRenta.toFixed(2)}" style="font-weight: 600; color: #a855f7; cursor: pointer;">$${rRenta.toFixed(2)}</div>
                        <div class="sri-copy-val" data-val="${rRentaBase.toFixed(2)}" style="font-size: 8px; opacity: 0.5; cursor: pointer;">B: $${rRentaBase.toFixed(2)}</div>
                    </td>
                    <td class="sri-copy-val" data-val="${nc15.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #f43f5e; cursor: pointer;">$${nc15.toFixed(2)}</td>
                    <td class="sri-copy-val" data-val="${nc0.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #fb7185; cursor: pointer;">$${nc0.toFixed(2)}</td>
                </tr>`;
        });

        monthlyTableHTML += `
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    toast.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Header -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 54px; height: 54px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 18px; display: flex; align-items: center; justify-content: center; font-size: 28px; box-shadow: 0 10px 25px rgba(245, 158, 11, 0.4);">🏆</div>
                    <div>
                        <div style="color: #f59e0b; font-weight: 900; font-size: 18px; text-transform: uppercase; letter-spacing: 0.12em; line-height: 1.1;">Reporte Maestro Elite</div>
                        <div style="font-size: 11px; opacity: 0.7; font-weight: 700; color: #94a3b8;">${(bulkFlow.months || []).length} MESES PROCESADOS • ${clientName}</div>
                    </div>
                </div>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: rgba(255,255,255,0.1); color: white; border: none; border-radius: 14px; padding: 10px 16px; font-size: 20px; cursor: pointer; transition: 0.3s; font-weight: 800;">×</button>
            </div>

            <!-- Period Box -->
            <div style="background: rgba(255,255,255,0.05); padding: 16px 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 10px; font-weight: 800; color: #818cf8; text-transform: uppercase; margin-bottom: 4px;">📍 PERIODO DE CONSULTA</div>
                    <div style="font-size: 16px; font-weight: 800; color: white;">${periodLabel}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">FECHA REPORTE</div>
                    <div style="font-size: 13px; font-weight: 600; opacity: 0.8;">${new Date().toLocaleDateString()}</div>
                </div>
            </div>

            <!-- Main Totals Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
                <!-- FACTURAS -->
                <div style="background: rgba(16, 185, 129, 0.08); padding: 20px; border-radius: 24px; border: 1px solid rgba(16, 185, 129, 0.2); position: relative; overflow: hidden;">
                    <div style="font-size: 11px; color: #10b981; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">🛍️ COMPRAS</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="sri-copy-val" data-val="${totals.iva15.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">BASE 15%</div>
                            <div style="font-size: 18px; font-weight: 900; color: #10b981;">$${totals.iva15.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.montoIva.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">IVA GENERADO (15%)</div>
                            <div style="font-size: 18px; font-weight: 900; color: #10b981;">$${totals.montoIva.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.iva0.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">BASE 0%</div>
                            <div style="font-size: 18px; font-weight: 900; color: #10b981;">$${totals.iva0.toFixed(2)}</div>
                        </div>
                        <div style="margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(16, 185, 129, 0.2);" class="sri-copy-val" data-val="${(totals.iva15 + totals.iva0 + totals.montoIva).toFixed(2)}">
                            <div style="font-size: 9px; opacity: 0.8; font-weight: 800; color: white;">TOTAL CON IVA</div>
                            <div style="font-size: 20px; font-weight: 900; color: white;">$${(totals.iva15 + totals.iva0 + totals.montoIva).toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                <!-- RETENCIONES -->
                <div style="background: rgba(99, 102, 241, 0.08); padding: 20px; border-radius: 24px; border: 1px solid rgba(99, 102, 241, 0.2);">
                    <div style="font-size: 11px; color: #818cf8; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">💸 RETENCIONES</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="sri-copy-val" data-val="${(totals.retIvaBase + totals.retRentaBase).toFixed(2)}" style="cursor:pointer; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="font-size: 9px; opacity: 0.8; font-weight: 700; color: #a5b4fc; text-transform: uppercase;">💰 Base Imponible</div>
                            <div style="font-size: 18px; font-weight: 900; color: white;">$${(totals.retIvaBase + totals.retRentaBase).toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.retIva.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">IVA RETENIDO</div>
                            <div style="font-size: 18px; font-weight: 900; color: #818cf8;">$${totals.retIva.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.retRenta.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">RENTA RETENIDA</div>
                            <div style="font-size: 18px; font-weight: 900; color: #a855f7;">$${totals.retRenta.toFixed(2)}</div>
                        </div>
                        <div style="margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(99, 102, 241, 0.2);" class="sri-copy-val" data-val="${(totals.retIva + totals.retRenta).toFixed(2)}">
                            <div style="font-size: 9px; opacity: 0.8; font-weight: 800; color: white;">TOTAL RETENCIONES</div>
                            <div style="font-size: 20px; font-weight: 900; color: white;">$${(totals.retIva + totals.retRenta).toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                <!-- NOTAS DE CRÉDITO -->
                <div style="background: rgba(244, 63, 94, 0.08); padding: 20px; border-radius: 24px; border: 1px solid rgba(244, 63, 94, 0.2);">
                    <div style="font-size: 11px; color: #f43f5e; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">📄 NOTAS CRÉDITO</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="sri-copy-val" data-val="${totals.ncIva15.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">BASE 15%</div>
                            <div style="font-size: 18px; font-weight: 900; color: #f43f5e;">$${totals.ncIva15.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.ncIva.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">IVA NC (15%)</div>
                            <div style="font-size: 18px; font-weight: 900; color: #f43f5e;">$${totals.ncIva.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.ncIva0.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">BASE 0%</div>
                            <div style="font-size: 18px; font-weight: 900; color: #fb7185;">$${totals.ncIva0.toFixed(2)}</div>
                        </div>
                        <div style="margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(244, 63, 94, 0.2);" class="sri-copy-val" data-val="${totals.ncTotal.toFixed(2)}">
                            <div style="font-size: 9px; opacity: 0.8; font-weight: 800; color: white;">TOTAL NOTAS</div>
                            <div style="font-size: 20px; font-weight: 900; color: white;">$${totals.ncTotal.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom Highlights -->
            <div style="background: linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.15)); padding: 20px; border-radius: 24px; border: 1px solid rgba(59, 130, 246, 0.2); text-align: center; cursor: pointer;" class="sri-copy-val" data-val="${(totals.iva15 + totals.iva0).toFixed(2)}">
                <div style="font-size: 11px; color: #60a5fa; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.1em;">💰 TOTAL BASES IMPONIBLES (RENTA)</div>
                <div style="font-size: 32px; font-weight: 900; color: white; letter-spacing: -0.02em;">$${(totals.iva15 + totals.iva0).toFixed(2)}</div>
                <div style="font-size: 10px; opacity: 0.5; margin-top: 4px;">Suma total de bases imponibles (Excluye IVA)</div>
            </div>

            ${monthlyTableHTML}

            <!-- Secondary Info -->
            <div style="display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.2); padding: 12px 18px; border-radius: 16px; font-size: 10px; color: #94a3b8; font-weight: 600;">
                <span style="font-size: 14px;">ℹ️</span>
                <span>Los valores mostrados corresponden a las bases imponibles y totales extraídos directamente del portal del SRI.</span>
            </div>

            <!-- Footer Actions -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <button id="btn-copy-bulk-toast" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 18px; padding: 16px; font-size: 14px; font-weight: 800; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 20px rgba(79, 70, 229, 0.4); display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <span>📋</span> COPIAR REPORTE COMPLETO
                </button>
                <button id="btn-export-excel" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 18px; padding: 16px; font-size: 14px; font-weight: 800; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <span>📊</span> EXPORTAR A EXCEL (CSV)
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(toast);

    // Copy button functionality
    const btnCopy = document.getElementById('btn-copy-bulk-toast');
    if (btnCopy) {
        btnCopy.onclick = () => {
            let clipboardText = `REPORTE MAESTRO SRI - ${clientName}\nPERIODO: ${periodLabel}\n\n`;
            clipboardText += `TOTALES GENERALES:\n`;
            clipboardText += `----------------------------------\n`;
            clipboardText += `🛍️ COMPRAS:\n`;
            clipboardText += `  Base 15%:      $${totals.iva15.toFixed(2)}\n`;
            clipboardText += `  IVA 15%:       $${totals.montoIva.toFixed(2)}\n`;
            clipboardText += `  Base 0%:       $${totals.iva0.toFixed(2)}\n`;
            clipboardText += `  TOTAL COMPRAS: $${(totals.iva15 + totals.iva0 + totals.montoIva).toFixed(2)}\n\n`;

            clipboardText += `💸 RETENCIONES:\n`;
            clipboardText += `  IVA Retenido:  $${totals.retIva.toFixed(2)}\n`;
            clipboardText += `  Renta Retenida: $${totals.retRenta.toFixed(2)}\n`;
            clipboardText += `  TOTAL RET.:    $${(totals.retIva + totals.retRenta).toFixed(2)}\n\n`;

            clipboardText += `📄 NOTAS CRÉDITO:\n`;
            clipboardText += `  Base 15%:      $${totals.ncIva15.toFixed(2)}\n`;
            clipboardText += `  IVA NC:        $${totals.ncIva.toFixed(2)}\n`;
            clipboardText += `  Base 0%:       $${totals.ncIva0.toFixed(2)}\n`;
            clipboardText += `  TOTAL NC:      $${totals.ncTotal.toFixed(2)}\n\n`;

            clipboardText += `💰 TOTAL BASES (RENTA): $${(totals.iva15 + totals.iva0).toFixed(2)}\n`;
            clipboardText += `----------------------------------\n\n`;

            clipboardText += `DETALLE MENSUAL:\nMES\tBASE 15%\tIVA 15%\tBASE 0%\tRET IVA\tRET RENTA\tNC 15%\tNC 0%\n`;

            if (resultsTable) {
                const sorted = [...resultsTable].sort((a, b) => a.month - b.month);
                sorted.forEach(m => {
                    const mName = monthNames[m.month] || `MES-${m.month}`;
                    const f15 = parseFloat(m.data.facturas?.iva15?.baseImponible || 0).toFixed(2);
                    const fIva = parseFloat(m.data.facturas?.iva15?.montoIva || 0).toFixed(2);
                    const f0 = parseFloat(m.data.facturas?.iva0?.baseImponible || 0).toFixed(2);
                    const rIva = parseFloat(m.data.retenciones?.ivaRetenido?.total || 0).toFixed(2);
                    const rRenta = parseFloat(m.data.retenciones?.rentaRetenida?.total || 0).toFixed(2);
                    const nc15 = parseFloat(m.data.notasCredito?.iva15?.baseImponible || 0).toFixed(2);
                    const nc0 = parseFloat(m.data.notasCredito?.iva0?.baseImponible || 0).toFixed(2);
                    clipboardText += `${mName}\t${f15}\t${fIva}\t${f0}\t${rIva}\t${rRenta}\t${nc15}\t${nc0}\n`;
                });
            }

            navigator.clipboard.writeText(clipboardText).then(() => {
                btnCopy.innerHTML = '<span>✅</span> ¡REPORTE COPIADO!';
                setTimeout(() => btnCopy.innerHTML = '<span>📋</span> COPIAR REPORTE COMPLETO', 2000);
            }).catch(err => console.error('Error al copiar:', err));
        };
    }

    // Export button functionality
    const btnExport = document.getElementById('btn-export-excel');
    if (btnExport) {
        btnExport.onclick = () => {
            // Create CSV content (UTF-8 with BOM for Excel compatibility)
            let csvContent = "\uFEFF";
            csvContent += `REPORTE MAESTRO SRI - ${clientName}\n`;
            csvContent += `PERIODO,${periodLabel}\n\n`;
            csvContent += `MES,BASE 15%,IVA 15%,BASE 0%,RETENCION IVA,RETENCION RENTA,NC 15%,NC 0%\n`;

            if (resultsTable) {
                const sorted = [...resultsTable].sort((a, b) => a.month - b.month);
                sorted.forEach(m => {
                    const mName = monthNames[m.month] || `MES-${m.month}`;
                    const f15 = parseFloat(m.data.facturas?.iva15?.baseImponible || 0).toFixed(2);
                    const fIva = parseFloat(m.data.facturas?.iva15?.montoIva || 0).toFixed(2);
                    const f0 = parseFloat(m.data.facturas?.iva0?.baseImponible || 0).toFixed(2);
                    const rIva = parseFloat(m.data.retenciones?.ivaRetenido?.total || 0).toFixed(2);
                    const rRenta = parseFloat(m.data.retenciones?.rentaRetenida?.total || 0).toFixed(2);
                    const nc15 = parseFloat(m.data.notasCredito?.iva15?.baseImponible || 0).toFixed(2);
                    const nc0 = parseFloat(m.data.notasCredito?.iva0?.baseImponible || 0).toFixed(2);
                    csvContent += `${mName},${f15},${fIva},${f0},${rIva},${rRenta},${nc15},${nc0}\n`;
                });
            }

            csvContent += `\nTOTALES,${totals.iva15.toFixed(2)},${totals.montoIva.toFixed(2)},${totals.iva0.toFixed(2)},${totals.retIva.toFixed(2)},${totals.retRenta.toFixed(2)},${totals.ncIva15.toFixed(2)},${totals.ncIva0.toFixed(2)}\n`;

            // Download CSV
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Reporte_SRI_Elite_${periodLabel.replace(/ /g, '_')}.csv`;
            link.click();

            btnExport.innerHTML = '<span>✅</span> EXPORTADO!';
            setTimeout(() => btnExport.innerHTML = '<span>📊</span> EXPORTAR A EXCEL (CSV)', 2000);
        };
    }

    // Enable click-to-copy for individual values
    toast.querySelectorAll('.sri-copy-val').forEach(el => {
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        el.title = 'Click para copiar valor individual';

        el.onclick = (e) => {
            e.stopPropagation();
            const val = el.getAttribute('data-val');
            if (val) {
                navigator.clipboard.writeText(val);

                // Visual feedback (Pulse & Color)
                const originalScale = el.style.transform;
                const originalOpacity = el.style.opacity;
                const originalColor = el.style.color;

                el.style.transform = 'scale(1.05)';
                el.style.color = '#fff';
                el.style.background = 'rgba(255,255,255,0.1)';
                el.style.borderRadius = '8px';

                // Mostrar mini-toast flotante cerca del cursor o elemento
                const tip = document.createElement('div');
                tip.textContent = 'Copiado';
                tip.style.cssText = `
                    position: fixed;
                    background: #10b981;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 800;
                    z-index: 1000002;
                    pointer-events: none;
                    top: ${e.clientY - 30}px;
                    left: ${e.clientX}px;
                    animation: tipFadeUp 0.6s forwards;
                `;

                if (!document.getElementById('sri-tip-style')) {
                    const s = document.createElement('style');
                    s.id = 'sri-tip-style';
                    s.textContent = `@keyframes tipFadeUp { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-20px); } }`;
                    document.head.appendChild(s);
                }

                document.body.appendChild(tip);
                setTimeout(() => tip.remove(), 600);

                setTimeout(() => {
                    el.style.transform = originalScale || 'scale(1)';
                    el.style.color = originalColor;
                    el.style.background = 'transparent';
                }, 200);
            }
        };

        // Hover effect
        el.onmouseenter = () => {
            el.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            el.style.borderRadius = '8px';
        };
        el.onmouseleave = () => {
            el.style.backgroundColor = 'transparent';
        };
    });
}
