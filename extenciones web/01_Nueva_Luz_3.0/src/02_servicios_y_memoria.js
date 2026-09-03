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

const SriLoop = {
    _KEY: 'sc_loop',
    _DEF: { estado: 'DETENIDO', cola: [], indice: 0, periodo: null, latido: 0, motivo: '' },
    TIMEOUT_LATIDO_MS: 15 * 60 * 1000,

    async get() {
        try {
            const r = await SafeStorage.get([this._KEY]);
            return Object.assign({}, this._DEF, r[this._KEY] || {});
        } catch (e) {
            return Object.assign({}, this._DEF);
        }
    },

    async _set(patch) {
        const previo = await this.get();
        const nuevo = Object.assign({}, previo, patch);

        // Traza de transiciones: si algo apaga el bucle sin que se lo pidan,
        // acá queda quién fue. Sin esto es imposible perseguir un apagón.
        if (patch.estado && patch.estado !== previo.estado) {
            let quien = '';
            try {
                const pila = (new Error().stack || '').split('\n').slice(2, 5)
                    .map((l) => l.trim().replace(/^at\s+/, '').split(' ')[0])
                    .filter((x) => x && x !== 'async').join(' ← ');
                quien = pila ? `  [${pila}]` : '';
            } catch (e) { /* sin pila */ }
            console.log(`🚦 [BUCLE] ${previo.estado} → ${nuevo.estado}${nuevo.motivo ? ' · ' + nuevo.motivo : ''}${quien}`);
        }

        await SafeStorage.set({ [this._KEY]: nuevo });
        return nuevo;
    },

    /**
     * ÚNICA AUTORIDAD. Todo paso automático pregunta acá primero.
     * Si devuelve false, no se toca nada del portal.
     */
    async puedeAvanzar() {
        const e = await this.get();
        if (e.estado !== 'CORRIENDO') return false;
        if (e.latido && Date.now() - e.latido > this.TIMEOUT_LATIDO_MS) {
            console.warn('🐕 [WATCHDOG] Sin avance en 15 min. Deteniendo el lote por seguridad.');
            await this.detener('Sin avance por más de 15 minutos');
            return false;
        }
        return true;
    },

    async latir() {
        const e = await this.get();
        if (e.estado === 'CORRIENDO') await this._set({ latido: Date.now() });
    },

    async iniciar(cola, periodo, indice = 0) {
        console.log(`▶️ [BUCLE] Iniciando lote: ${cola.length} clientes.`);
        await this._set({ estado: 'CORRIENDO', cola, indice, periodo, latido: Date.now(), motivo: '' });
        await this._sincronizarLegado(true);
    },

    async reanudar() {
        console.log('▶️ [BUCLE] Reanudando.');
        await this._set({ estado: 'CORRIENDO', latido: Date.now(), motivo: '' });
        await this._sincronizarLegado(true);
    },

    /** Pausa suave: termina el cliente en curso y NO salta al siguiente. */
    async pausar() {
        const e = await this.get();
        if (e.estado !== 'CORRIENDO') return;
        console.log('⏸️ [BUCLE] Pausa pedida: se terminará el cliente actual y ahí para.');
        await this._set({ estado: 'PAUSANDO', motivo: 'Pausa pedida por el usuario' });
    },

    /** Corte inmediato: no se da un paso más, aunque quede algo a medias. */
    async emergencia() {
        console.warn('🛑 [BUCLE] PARADA DE EMERGENCIA.');
        await this._set({ estado: 'DETENIDO', motivo: 'Parada de emergencia' });
        await this._sincronizarLegado(false);
    },

    async detener(motivo = '') {
        console.log('⏹️ [BUCLE] Detenido.', motivo);
        await this._set({ estado: 'DETENIDO', cola: [], indice: 0, motivo });
        await this._sincronizarLegado(false);
    },

    /** Marca que el cliente actual terminó. Devuelve true si hay que frenar. */
    async debeFrenarTrasCliente() {
        const e = await this.get();
        if (e.estado === 'PAUSANDO') {
            await this._set({ estado: 'PAUSADO' });
            await this._sincronizarLegado(false);
            console.log('⏸️ [BUCLE] Cliente terminado. Lote en pausa: no se salta al siguiente.');
            return true;
        }
        return e.estado !== 'CORRIENDO';
    },

    async avanzarA(indice) {
        await this._set({ indice, latido: Date.now() });
    },

    /**
     * Normaliza el estado la primera vez que corre la versión con semáforo.
     *
     * Antes del semáforo, las banderas sueltas quedaban encendidas en
     * chrome.storage para siempre. Al recargar cualquier página del SRI eso
     * disparaba un "lote fantasma" sin sesión, que chocaba contra el login y
     * moría. Si encontramos ese estado viejo, lo apagamos todo.
     */
    async normalizarEstadoInicial() {
        try {
            const r = await SafeStorage.get([
                this._KEY, 'auto_batch_enabled', 'sri_auto_mode',
                'autoDeclaration', 'sri_master_switch_on'
            ]);
            if (r[this._KEY]) return false;   // ya migrado

            const basura = !!(r.auto_batch_enabled || r.sri_auto_mode ||
                              r.autoDeclaration || r.sri_master_switch_on);
            if (basura) {
                console.warn('🧹 [BUCLE] Estado viejo encendido sin semáforo. Se apaga todo por seguridad; usá ▶ para arrancar.');
            }
            await this.detener(basura ? 'Estado viejo normalizado' : '');
            return basura;
        } catch (e) {
            console.warn('No se pudo normalizar el estado inicial:', e);
            return false;
        }
    },

    /**
     * Purga TODO el estado de automatización. Deja intactos los clientes
     * (sc_clients_cache) y el token. Pensado para el usuario:
     *     window.sriLimpiarEstado()
     */
    async limpiarEstado() {
        const CLAVES = [
            this._KEY, 'pendingAction', 'actionTimestamp', 'workflowPeriod',
            'pending_sri_autofill', 'auto_batch_enabled', 'auto_batch_queue',
            'auto_batch_index', 'auto_batch_period', 'auto_batch_mode',
            'sri_auto_mode', 'autoDeclaration', 'sriAutomationPaused',
            'sri_master_switch_on', 'ghost_manual_mode', 'declaration_synced_flag',
            'summary_page_clicked', 'turboMode', 'checkFacturas', 'checkRetenciones',
            'checkNC', 'skipSafetyCheck', 'sri_diagnostico_resumen'
        ];
        const antes = await SafeStorage.get(null);
        const habia = CLAVES.filter((k) => k in antes);
        await SafeStorage.remove(CLAVES);
        if (typeof GhostMemory !== 'undefined' && GhostMemory.clearCurrent) {
            await GhostMemory.clearCurrent().catch(() => {});
        }
        await this.detener('Estado limpiado a mano');
        console.log(`🧹 [BUCLE] Estado limpiado. Se borraron ${habia.length} claves:`, habia);
        console.log('   Los clientes y sus claves NO se tocaron.');
        return habia;
    },

    /** Periodo por defecto: el mes anterior (el que se declara). */
    periodoPorDefecto() {
        const h = new Date();
        let m = h.getMonth() - 1, a = h.getFullYear();
        if (m < 0) { m = 11; a--; }
        return { year: a, monthIndex: m };
    },

    /**
     * Arma la cola con los clientes que TODAVÍA no tienen comprobante del
     * periodo. Excluye los marcados con error y los que no tienen clave
     * guardada (sin clave el auto-login es imposible).
     */
    async armarCola(periodo) {
        const r = await SafeStorage.get(['sc_clients_cache', 'flagged_errors']);
        const lista = Array.isArray(r.sc_clients_cache) ? r.sc_clients_cache : [];
        const errs = r.flagged_errors || {};
        const pStr = `${periodo.year}-${String(periodo.monthIndex + 1).padStart(2, '0')}`;

        const cola = [];
        let sinClave = 0, yaHechos = 0;

        for (const c of lista) {
            if (!c || !c.ruc) continue;
            if (errs[c.ruc]) continue;

            const clave = c.password || c.sri_password || c.sriPassword || '';
            if (!clave) { sinClave++; continue; }

            const decs = Array.isArray(c.declarations) ? c.declarations
                       : (Array.isArray(c.declaration_history) ? c.declaration_history : []);
            const hecho = decs.some((d) => d &&
                (d.proof_file || d.pdfUrl || d.proofFile) &&
                String(d.period || '').includes(pStr));
            if (hecho) { yaHechos++; continue; }

            cola.push({ ruc: c.ruc, name: c.name || 'Cliente SRI', password: clave });
        }

        cola.sort((a, b) => {
            const d = (r2) => (!r2 || r2.length < 9) ? 99 : (parseInt(r2.charAt(8), 10) || 10);
            return d(a.ruc) - d(b.ruc);
        });

        console.log(`📋 [BUCLE] Cola para ${pStr}: ${cola.length} pendientes · ${yaHechos} ya con PDF · ${sinClave} sin clave.`);
        return { cola, yaHechos, sinClave, total: lista.length };
    },

    /** Deja listo el auto-login del cliente que toca. */
    async prepararCliente(cliente, periodo) {
        await SafeStorage.set({
            pending_sri_autofill: {
                ruc: cliente.ruc,
                password: cliente.password,
                name: cliente.name,
                timestamp: Date.now(),
                manual: true,
                isBatch: true
            },
            pendingAction: 'verifyProfile',
            workflowPeriod: periodo,
            actionTimestamp: Date.now(),
            ghost_manual_mode: false
        });
        await SafeStorage.remove(['declaration_synced_flag']);
    },

    /**
     * ▶ TODA LA PELÍCULA: arma la cola, enciende el semáforo, deja preparado
     * al primer cliente y devuelve qué hacer con la pestaña.
     */
    async arrancarLote(periodo) {
        const p = periodo || this.periodoPorDefecto();
        const { cola, yaHechos, sinClave, total } = await this.armarCola(p);

        if (total === 0) {
            return { ok: false, motivo: 'No hay clientes en la caché. Abrí SantiagoCordova.com para sincronizar.' };
        }
        if (cola.length === 0) {
            return { ok: false, motivo: `Nada pendiente: ${yaHechos} ya declarados${sinClave ? `, ${sinClave} sin clave` : ''}.` };
        }

        await this.iniciar(cola, p);
        await this.prepararCliente(cola[0], p);
        return { ok: true, total: cola.length, primero: cola[0].name, sinClave };
    },

    /**
     * Mantiene las 6 banderas viejas en sintonía. Se siguen escribiendo por
     * compatibilidad con el código que aún las lee, pero NINGUNA compuerta
     * decide por ellas: la autoridad es puedeAvanzar().
     */
    async _sincronizarLegado(encendido) {
        await SafeStorage.set({
            sri_master_switch_on: !!encendido,
            sriAutomationPaused: !encendido,
            auto_batch_enabled: !!encendido,
            sri_auto_mode: !!encendido,
            autoDeclaration: !!encendido
        });
    }
};

// Se ejecuta una sola vez: apaga cualquier lote fantasma heredado.
SriLoop.normalizarEstadoInicial();

// Helper para la consola del usuario.
if (typeof window !== 'undefined') {
    window.sriLimpiarEstado = () => SriLoop.limpiarEstado();
    window.sriEstado = async () => {
        const e = await SriLoop.get();
        console.log('🚦 Semáforo:', e.estado,
                    '· cliente', (e.cola || []).length ? (e.indice + 1) + '/' + e.cola.length : '—',
                    e.motivo ? '· ' + e.motivo : '');
        return e;
    };
}

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

/**
 * ¿El elemento está realmente renderizado?
 *
 * ⚠️ NO usar `offsetParent !== null` para esto: en Chrome un elemento
 * `position: fixed` SIEMPRE tiene `offsetParent === null`, y casi todos los
 * modales del SRI (PrimeFaces y Angular Material) son fixed. Ese test los
 * declaraba invisibles y los dejaba pasar.
 */
const esVisible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
};

const clickElement = (el, name) => {
    if (!el) {
        GhostBlackBox.add('CLICK_NULL', `Intento de clic fallido: ${name} (element null)`);
        console.warn(`❌ No se pudo clickear: ${name} (Elemento null)`);
        return false;
    }
    GhostBlackBox.add('CLICK', `Clic en: ${name}`, { tag: el.tagName, id: el.id || 'sin-id', text: (el.innerText || '').trim().substring(0, 30) });
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
    // Antes filtraba por offsetParent, que es null en los modales position:fixed
    // de PrimeFaces: esta función nunca llegaba a cerrarlos.
    const modals = Array.from(document.querySelectorAll('.ui-dialog[role="dialog"]'))
        .filter(esVisible);

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

    // Segunda pasada: modales que NO son de PrimeFaces (Angular/Material).
    return await cerrarModalesNoPrimeFaces();
}

/**
 * Cierra overlays genéricos (encuesta de satisfacción, avisos Angular) usando
 * EXCLUSIVAMENTE su control de cierre — la "×", el aria-label o .mat-dialog-close.
 *
 * 🛑 REGLA DE ORO: nunca se pulsa un botón por su texto en esta función.
 * El modal de la encuesta trae "Quiero responder", y pulsarlo enviaría una
 * opinión en nombre del usuario. Solo cerramos, jamás respondemos ni aceptamos.
 */
async function cerrarModalesNoPrimeFaces() {
    if (window.sriAssistant && window.sriAssistant.manualMode) return false;

    const CONTENEDORES = [
        'mat-dialog-container',
        '.mat-dialog-container',
        '.cdk-overlay-pane',
        '[role="dialog"]:not(.ui-dialog)',
        '[class*="modal"][class*="show"]',
        '.modal.in'
    ].join(', ');

    const modales = Array.from(document.querySelectorAll(CONTENEDORES)).filter(esVisible);

    for (const modal of modales) {
        // No tocar nuestro propio HUD
        if (modal.closest('#sri-assistant-panel, #sri-anticipacion-sidebar')) continue;

        const CIERRES = [
            '[aria-label*="cerrar" i]',
            '[aria-label*="close" i]',
            '[mat-dialog-close]',
            '.mat-dialog-close',
            'button.close',
            '.close-button',
            '[class*="cerrar"]',
            '[class*="btn-close"]'
        ].join(', ');

        let btnCerrar = modal.querySelector(CIERRES);

        // Respaldo: un control cuyo texto sea SOLO el símbolo de cerrar.
        if (!btnCerrar) {
            btnCerrar = Array.from(modal.querySelectorAll('button, a, span, i, div')).find((el) => {
                if (!esVisible(el)) return false;
                const t = (el.textContent || '').trim();
                return t === '\u00d7' || t === 'x' || t === 'X' || t === '\u2715' || t === '\u2716' || t === '\u2573';
            });
        }

        if (btnCerrar) {
            const resumen = (modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
            console.log('🛡️ SRI Assistant: cerrando modal no-PrimeFaces:', resumen);
            clickElement(btnCerrar, 'Cerrar Modal Angular');
            await sleep(800);
            return true;
        }

        console.warn('⚠️ Modal visible sin control de cierre reconocible. NO se pulsa nada por texto:',
            (modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80));
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

// ESCUCHADOR DE MENSAJES DE LA WEB (SantiagoCordova.com Bridge)
window.addEventListener('message', async (event) => {
    if (!event.data || event.data.source !== 'SC_PRO_DASHBOARD') return;
    console.log('⚡ [SC PRO Bridge] Mensaje de la web recibido en Content Script:', event.data.type);

    if (event.data.type === 'SRI_AUTOFILL_DATA' && event.data.data) {
        const d = event.data.data;
        const autofillObj = {
            ruc: d.ruc,
            password: d.password,
            name: d.name,
            timestamp: Date.now(),
            manual: true
        };
        
        const now = new Date();
        let cMonth = now.getMonth() - 1;
        let cYear = now.getFullYear();
        if (cMonth < 0) { cMonth = 11; cYear--; }

        await SafeStorage.set({ 
            pending_sri_autofill: autofillObj,
            pendingAction: 'verifyProfile',
            workflowPeriod: { year: cYear, monthIndex: cMonth },
            actionTimestamp: Date.now(),
            sri_master_switch_on: true
        });

        if (isSRILoginPage()) {
            const items = await SafeStorage.get(null);
            renderAnticipationWidget(items);
            executeLogin(d.ruc, d.password);
        }
    }

    if (event.data.type === 'SRI_START_BATCH_DECLARATION' && event.data.data) {
        const d = event.data.data;
        const queue = (d.clients || []).map(c => ({ ruc: c.ruc, password: c.sriPassword || c.password, name: c.name }));
        const actionType = d.mode === 'recover_pdf_only' ? 'recoverPDF' : 'verifyProfile';
        await SafeStorage.set({
            auto_batch_enabled: true,
            auto_batch_queue: queue,
            auto_batch_index: 0,
            auto_batch_mode: actionType
        });
        if (isSRILoginPage()) {
            const items = await SafeStorage.get(null);
            renderAnticipationWidget(items);
        }
    }
});

// WATCHER RECURRENTE INFALIBLE PARA PÁGINAS DE LOGIN SRI
function initAnticipationWidgetWatcher() {
    let attempts = 0;
    const watcher = setInterval(async () => {
        attempts++;
        if (isSRILoginPage()) {
            if (!document.getElementById('sri-anticipacion-sidebar')) {
                const items = await SafeStorage.get(null);
                await renderAnticipationWidget(items);
            }
        }
        if (attempts > 30) clearInterval(watcher);
    }, 500);

    try {
        const observer = new MutationObserver(async () => {
            if (isSRILoginPage() && !document.getElementById('sri-anticipacion-sidebar')) {
                const items = await SafeStorage.get(null);
                await renderAnticipationWidget(items);
            }
        });
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    } catch(e) {}
}

// WATCHER DE ÉXITO DE DECLARACIÓN (CAPTURA DE COMPROBANTE OFICIAL)
function initDeclarationSuccessWatcher() {
    if (window.__sriDeclarationSuccessWatcherActive) return;
    window.__sriDeclarationSuccessWatcherActive = true;

    setInterval(async () => {
        // ⚡ PERF: textContent en vez de innerText — innerText fuerza un reflow
        // completo del documento en cada tick (2s) sobre tablas JSF pesadas.
        const bodyText = (document.body?.textContent || '').toLowerCase();
        const hasImprimirBtn = Array.from(document.querySelectorAll('span.ui-button-text')).some(span => (span.textContent || '').trim().toUpperCase() === 'IMPRIMIR');
        const isSuccessPage = hasImprimirBtn ||
                              bodyText.includes('declaración procesada') ||
                              bodyText.includes('declaracion enviada con exito') ||
                              bodyText.includes('comprobante de declaracion') ||
                              bodyText.includes('imprimir comprobante');

        if (isSuccessPage) {
            const state = await SafeStorage.get(['declaration_synced_flag']);
            if (!state.declaration_synced_flag) {
                await SafeStorage.set({ declaration_synced_flag: true });
                console.log('🎉 [SRI WATCHER] ¡Pantalla de confirmación de declaración detectada!');
                // Cierre POST-ENVÍO (la declaración ya fue aceptada por el SRI).
                // NO usar ejecutarCierreMagico(), que es el cierre PRE-ENVÍO y
                // volvería a pulsar Siguiente/Aceptar sobre una declaración enviada.
                if (window.sriAssistant && typeof window.sriAssistant.finalizarPostEnvioSRI === 'function') {
                    await window.sriAssistant.finalizarPostEnvioSRI();
                }
            }
        }
    }, 2000);
}
initDeclarationSuccessWatcher();

// HELPER: ENCONTRAR BOTÓN ACEPTAR/ENVIAR PRINCIPAL EN EL RESUMEN (NO DIÁLOGOS OCULTOS)
function findAceptarBtnOnSummary() {
    // 1. Buscar botón verde principal 'green-btn' en la página de resumen
    const greenBtn = document.getElementById('frmFlujoDeclaracion:btnAceptar') ||
                     document.getElementById('frmFlujoDeclaracion:btnEnviar') ||
                     document.querySelector('button[id*="btnAceptar"]') ||
                     document.querySelector('button[id*="btnEnviar"]');

    if (greenBtn && greenBtn.offsetParent !== null && !greenBtn.closest('.ui-dialog, .ui-helper-hidden')) {
        const btnTxt = (greenBtn.innerText || greenBtn.textContent || '').toLowerCase();
        if (!btnTxt.includes('borrador')) {
            console.log('🎯 [SUMMARY SEARCH] Botón principal Aceptar localizado por ID:', greenBtn);
            return greenBtn;
        }
    }

    // 2. Búsqueda por texto "Aceptar" / "Enviar" en botones o spans, ignorando modales/diálogos ocultos
    const elements = Array.from(document.querySelectorAll('button, a.ui-button, div.ui-button, span.ui-button-text, span[class*="ui-button"]'));
    for (const el of elements) {
        if (el.offsetParent === null) continue;
        const txtRaw = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (txtRaw.includes('borrador')) continue;
        const btn = el.closest('button, a, div[class*="button"]') || el;

        // Ignorar botones dentro de modales o diálogos ocultos
        if (btn.closest('.ui-dialog, .ui-helper-hidden, [style*="display: none"]')) continue;

        // Ignorar botones cuyo onclick sea esconder un diálogo (ej: PF('...').hide())
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes('.hide()')) continue;

        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (txt === 'aceptar' || txt === 'enviar' || txt === 'aceptar y enviar' || txt === 'firmar y enviar') {
            if (btn && btn.offsetParent !== null) return btn;
        }
    }
    return null;
}

// WATCHER AUTOMÁTICO PARA LA PANTALLA DE RESUMEN/ACEPTAR/ENVIAR (POST SIGUIENTE)
function initSummaryPageWatcher() {
    if (window.__sriSummaryPageWatcherActive) return;
    window.__sriSummaryPageWatcherActive = true;

    setInterval(async () => {
        // 🛑 PROTECCIÓN DE NAVEGACIÓN: Si todavía estamos editando casilleros (concepto401 visible) o navegando en el wizard, NO actuar.
        const casilleroForm = document.getElementById('concepto401') || document.getElementById('concepto500');
        if (casilleroForm && casilleroForm.offsetParent !== null) return;

        // ⚡ PERF: ver nota en initDeclarationSuccessWatcher.
        const bodyText = (document.body?.textContent || '').toLowerCase();
        const hasImprimirBtn = Array.from(document.querySelectorAll('span.ui-button-text')).some(span => (span.textContent || '').trim().toUpperCase() === 'IMPRIMIR');
        const isSuccess = hasImprimirBtn || bodyText.includes('declaración procesada') || bodyText.includes('imprimir comprobante');
        if (isSuccess) return;

        const btnRaw = findAceptarBtnOnSummary();
        // Antes: "... || items.sri_master_switch_on", o sea que el interruptor
        // maestro ENCENDÍA la automatización en vez de frenarla. Ahora manda el semáforo.
        const isAuto = await SriLoop.puedeAvanzar();

        if (btnRaw && isAuto && esVisible(btnRaw)) {

            const state = await SafeStorage.get(['summary_page_clicked']);
            // Solo prevenir clics repetidos en los últimos 10 segundos
            if (!state.summary_page_clicked || (Date.now() - state.summary_page_clicked > 10000)) {
                await SafeStorage.set({ summary_page_clicked: Date.now() });
                console.log('🚀 [SRI SUMMARY] Pantalla de resumen confirmada. Cuenta de 3s antes de confirmar envío...');
                
                if (window.sriAssistant) {
                    window.sriAssistant.showEliteToast({ 
                        title: '⚠️ Confirmación Final', 
                        msg: 'Enviando declaración en 3s... (Presiona DETENER para revisar)', 
                        duration: 3500 
                    });
                }

                // 3 segundos con verificación en cada segundo
                for (let c = 0; c < 3; c++) {
                    await sleep(1000);
                    const check = await SafeStorage.get(['sriAutomationPaused', 'sri_auto_mode', 'autoDeclaration']);
                    if (check.sriAutomationPaused || (!check.sri_auto_mode && !check.autoDeclaration)) {
                        console.log('🛑 [SRI SUMMARY] Envío final abortado por el usuario.');
                        return;
                    }
                }

                console.log('🚀 [SRI SUMMARY] Confirmando envío en el resumen final...');
                const clickableTarget = btnRaw.closest('button, a, div[class*="button"]') || btnRaw;
                if (typeof clickElement === 'function') clickElement(clickableTarget, 'Aceptar Formulario Resumen');
                else clickableTarget.click();
            }
        }
    }, 1500);
}

// AUTO-DESMISSER DE DIÁLOGOS DE ADVERTENCIA Y VALIDACIONES NORMALES DEL SRI (SOLO BAJO DEMANDA)
async function autoDismissSriWarnings() {
    // Helper: encuentra el botón Aceptar/Continuar dentro de un contenedor de diálogo
    function findAceptarInContainer(container) {
        // Primero: buscar por ID directo
        const byId = container.querySelector('button[id*="btnAceptar"], button[id*="btnContinuar"], button[id*="btnSi"], button[id*="confirm"]');
        // No usamos offsetParent aquí porque en Chrome los modales position:fixed tienen offsetParent === null
        if (byId && getComputedStyle(byId).display !== 'none') return byId;

        // Segundo: buscar por texto en botones y spans (incluye ui-c, ui-button-text)
        const candidates = Array.from(container.querySelectorAll('button, a[class*="ui-button"], span.ui-button-text, span[class*="ui-button-text"]'));
        for (const el of candidates) {
            const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (txt === 'aceptar' || txt === 'continuar' || txt === 'sí' || txt === 'si' || txt === 'aceptar y continuar') {
                const btn = el.closest('button, a, div[class*="button"]') || el;
                if (btn && getComputedStyle(btn).display !== 'none') return btn;
            }
        }
        return null;
    }

    // Buscar SOLO en diálogos modales verdaderamente visibles (NO panelDialogos que es persistente)
    const dialogs = Array.from(document.querySelectorAll(
        'div.ui-dialog, div.ui-confirm-dialog, div[id*="dlgAdvertencia"], div[id*="dlgValidacion"]'
    )).filter(d =>
        // ELITE FIX: No usar offsetParent para dialogos, ya que en Chrome position:fixed => offsetParent null
        getComputedStyle(d).display !== 'none' &&
        getComputedStyle(d).visibility !== 'hidden' &&
        !d.classList.contains('ui-helper-hidden')
    );

    for (const dlg of dialogs) {
        // ELITE v13.0: Análisis Inteligente de Advertencias
        const textContent = (dlg.textContent || '').toUpperCase();
        
        // Si hay una lista de mensajes, analizarlos
        const mensajes = Array.from(dlg.querySelectorAll('li.estiloItemsMensajes, .ui-messages-warn-detail, .ui-messages-error-detail'));
        let esSeguro = true;

        if (mensajes.length > 0) {
            // Verificar si todos los mensajes son inofensivos (ej. Casillero 625)
            const todosInofensivos = mensajes.every(m => {
                const txt = m.textContent.toUpperCase();
                return txt.includes('CASILLERO 625') || txt.includes('FACULTAD DETERMINADORA') || txt.includes('CRÉDITO TRIBUTARIO NO HAYA SUPERADO LOS 5 AÑOS');
            });
            if (!todosInofensivos) {
                console.warn('⚠️ [SRI ELITE] Advertencia crítica detectada. Requiere revisión humana:', mensajes.map(m => m.textContent));
                esSeguro = false;
            }
        } else if (textContent.includes('ERROR') || textContent.includes('INCONSISTENCIA')) {
            esSeguro = false;
        }

        if (esSeguro) {
            const confirmBtn = findAceptarInContainer(dlg);
            if (confirmBtn) {
                console.log('✅ [SRI DISMISS] Clickeando "Aceptar" en diálogo SRI seguro:', confirmBtn);
                if (typeof clickElement === 'function') clickElement(confirmBtn, 'Aceptar Advertencia Modal SRI');
                else confirmBtn.click();
                await sleep(500);
            }
        }
    }
}

// AL CARGAR EL SCRIPT (RECARGA DE PAGINA)