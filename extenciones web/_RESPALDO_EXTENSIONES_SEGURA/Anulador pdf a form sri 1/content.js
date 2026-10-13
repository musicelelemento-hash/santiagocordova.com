/*
 * SRI Llenador - Anulación de Comprobantes
 * Desarrollado por: SOLUCIONES TRIBUTARIAS ESTRATÉGICAS
 */

// 🛡️ AISLAMIENTO DE CONTEXTO:
// Solo activar la extensión si estamos en rutas de anulación de comprobantes o en el menú del portal.
// Si el usuario está en Declaraciones Mensuales (recibirDeclaracion.jsf), Consulta (lista-obligaciones),
// Perfil o Login, silenciar el script para garantizar 100% de convivencia pacífica con la extensión de Declaraciones.
const _currentHref = (window.location.href || '').toLowerCase();
const _esRutaAnulacion = _currentHref.includes('/anulacion/') || 
                         _currentHref.includes('menuanulacion') || 
                         _currentHref.includes('solicitudanulacion') ||
                         _currentHref.includes('/tuportal-internet/');

if (_esRutaAnulacion) {
    console.log("SRI Asistente: Iniciado en módulo de anulación 🚀");
}

let pdfjsLib = null;

// ========== INICIALIZACIÓN ==========
(async () => {
    if (!_esRutaAnulacion) return;
    try {
        const src = chrome.runtime.getURL('libs/pdf.mjs');
        const module = await import(src);
        pdfjsLib = module;
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.mjs');
        console.log("SRI Asistente: Librería PDF cargada correctamente");
        initObserver();
    } catch (e) {
        console.error("SRI AsistenteError: No se pudo cargar pdf.mjs", e);
    }
})();

// ========== MOTOR DE AUDIO HÁPTICO SENSORIAL (WEB AUDIO API PURA) ==========
const SriAudioEngine = {
    ctx: null,
    enabled: true,

    init() {
        if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        chrome.storage.local.get(['sri_sound_enabled'], (res) => {
            this.enabled = res.sri_sound_enabled !== false;
        });
    },

    toggleSound() {
        this.enabled = !this.enabled;
        chrome.storage.local.set({ sri_sound_enabled: this.enabled });
        return this.enabled;
    },

    playTone(freq, duration = 0.15, type = 'sine', gainVal = 0.08) {
        if (!this.enabled) return;
        try {
            if (!this.ctx) this.init();
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
            if (!this.ctx) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

            gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) {}
    },

    playBatchStart() {
        if (!this.enabled) return;
        this.playTone(523.25, 0.10, 'sine', 0.07); // C5
        setTimeout(() => this.playTone(659.25, 0.18, 'sine', 0.09), 80); // E5
    },

    playInvoiceSuccess() {
        if (!this.enabled) return;
        this.playTone(880.00, 0.08, 'sine', 0.08); // A5
        setTimeout(() => this.playTone(1046.50, 0.12, 'sine', 0.10), 70); // C6
        setTimeout(() => this.playTone(1318.51, 0.22, 'sine', 0.12), 140); // E6
    },

    playInvoiceWarning() {
        if (!this.enabled) return;
        this.playTone(440.00, 0.12, 'triangle', 0.07);
        setTimeout(() => this.playTone(369.99, 0.20, 'triangle', 0.07), 100);
    },

    playBatchComplete() {
        if (!this.enabled) return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            setTimeout(() => this.playTone(freq, 0.28, 'sine', 0.10), idx * 110);
        });
    }
};
SriAudioEngine.init();
window.SriAudioEngine = SriAudioEngine;

// ========== MOTOR EXPORTADOR DE ACTAS CONTABLES (CSV UTF-8 BOM) ==========
const SriReportExporter = {
    downloadCSV(records) {
        if (!records || records.length === 0) return;
        let csv = '\uFEFF';
        csv += 'Fecha;Hora;Tipo Comprobante;No. Factura;Clave de Acceso (49 digitos);RUC Receptor;Total ($);Estado SRI;Diagnostico / Mensaje\r\n';

        records.forEach(row => {
            const item = row.item || {};
            const fechaHora = row.timestamp ? new Date(row.timestamp) : new Date();
            const fechaStr = fechaHora.toLocaleDateString('es-EC');
            const horaStr = fechaHora.toLocaleTimeString('es-EC');
            const tipo = (item.tipoComprobante || row.tipoComprobante || 'FACTURA').replace(/;/g, ' ');
            const numDoc = (item.facturaDisplay || row.facturaDisplay || '').replace(/;/g, ' ');
            const clave = (row.clave || item.claveAcceso || row.claveAcceso || '').replace(/;/g, ' ');
            const ruc = (item.idReceptor || row.idReceptor || '').replace(/;/g, ' ');
            const total = (item.total || row.total || '0.00').replace(/;/g, '.');
            const estado = (row.status === 'success' || row.estado === 'success' ? 'ANULADO_SRI' : 'OBSERVACION_SRI');
            const detalle = (row.message || row.mensaje || row.error || 'Procesado satisfactoriamente').replace(/;/g, ' ').replace(/\n/g, ' ');

            csv += `"${fechaStr}";"${horaStr}";"${tipo}";"${numDoc}";"${clave}";"${ruc}";"${total}";"${estado}";"${detalle}"\r\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const dateSlug = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
        a.href = url;
        a.download = `Acta_Anulaciones_SRI_${dateSlug}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// ========== MOTOR DE COMPLIANCE TRIBUTARIO Y CONTROL DE PLAZOS SRI ==========
const SriTaxCompliance = {
    // Detecta el RUC del contribuyente actualmente autenticado en el portal SRI
    obtenerRucSesionActiva() {
        try {
            // 1. Del token Keycloak en sessionStorage / localStorage
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const val = sessionStorage.getItem(key);
                if (val && (val.includes('"preferred_username"') || val.includes('"ruc"'))) {
                    const match = val.match(/"preferred_username"\s*:\s*"(\d{13})"/i) || val.match(/"ruc"\s*:\s*"(\d{13})"/i);
                    if (match) return match[1];
                }
            }
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const val = localStorage.getItem(key);
                if (val && (val.includes('"preferred_username"') || val.includes('"ruc"'))) {
                    const match = val.match(/"preferred_username"\s*:\s*"(\d{13})"/i) || val.match(/"ruc"\s*:\s*"(\d{13})"/i);
                    if (match) return match[1];
                }
            }
        } catch(e) {}

        // 2. Selectores del DOM de cabecera en el portal SRI
        const headerSelectors = [
            '#lblIdentificacion', '#lblUsuario', '#lblRuc',
            '.sri-identificacion', '.sri-texto-usuario', '.nombre-usuario',
            '#frmPrincipal\\:lblIdentificacion', '[id*="lblIdentificacion"]',
            '#lblContribuyente', '.user-info', '.menu-usuario'
        ];
        for (const sel of headerSelectors) {
            try {
                const el = document.querySelector(sel);
                if (el && el.innerText) {
                    const m = el.innerText.match(/\b\d{13}\b/);
                    if (m) return m[0];
                }
            } catch(e) {}
        }

        // 3. Fallback de texto en las primeras 1500 letras del portal
        try {
            const topText = (document.body ? document.body.innerText.substring(0, 1500) : '');
            const headerMatch = topText.match(/(?:RUC|Identificaci[óo]n|Usuario)[:\s]+(\d{13})/i);
            if (headerMatch) return headerMatch[1];
        } catch(e) {}

        return null;
    },

    // Valida si el RUC emisor de la clave de 49 dígitos coincide con la cuenta en sesión
    validarEmisorRuc(claveAcceso) {
        if (!claveAcceso || claveAcceso.length !== 49) return { coincide: true, rucEmisor: '', rucSesion: '' };
        const rucEmisor = claveAcceso.substring(10, 23);
        const rucSesion = this.obtenerRucSesionActiva();
        return {
            coincide: !rucSesion || rucSesion === rucEmisor,
            rucEmisor,
            rucSesion: rucSesion || 'No detectado en DOM'
        };
    },

    // Valida el plazo legal de anulación en línea (hasta el día 7 del mes siguiente)
    // y excepciones críticas (Consumidor Final, Nota de Crédito hasta 12 meses)
    validarPlazoLegalAnulacion(fechaEmisionStr, idReceptor = '') {
        const esConsumidorFinal = (idReceptor === '9999999999999' || idReceptor === '9999999999');

        if (!fechaEmisionStr || !fechaEmisionStr.includes('/')) {
            return { valido: true, plazoVencido: false, esConsumidorFinal, motivo: 'Fecha no analizable', fechaLimiteStr: '' };
        }

        const [d, m, y] = fechaEmisionStr.split('/').map(Number);
        if (!d || !m || !y || isNaN(d) || isNaN(m) || isNaN(y)) {
            return { valido: true, plazoVencido: false, esConsumidorFinal, motivo: 'Fecha inválida', fechaLimiteStr: '' };
        }

        // El mes de vencimiento es el mes siguiente
        let mesVencimiento = m + 1;
        let anioVencimiento = y;
        if (mesVencimiento > 12) {
            mesVencimiento = 1;
            anioVencimiento += 1;
        }

        // Fecha límite básica: Día 7 a las 23:59:59
        let fechaLimite = new Date(anioVencimiento, mesVencimiento - 1, 7, 23, 59, 59);

        // Regla legal tributaria de Ecuador (Art. 12 Código Tributario):
        // Si el día 7 cae en fin de semana, se traslada al siguiente día hábil
        const diaSemana = fechaLimite.getDay(); // 0 = Domingo, 6 = Sábado
        if (diaSemana === 6) { // Sábado -> pasa al lunes 9
            fechaLimite.setDate(fechaLimite.getDate() + 2);
        } else if (diaSemana === 0) { // Domingo -> pasa al lunes 8
            fechaLimite.setDate(fechaLimite.getDate() + 1);
        }

        const ahora = new Date();
        const plazoVencido = ahora > fechaLimite;

        // Plazo máximo para Nota de Crédito: 12 meses desde fecha de emisión
        const fechaLimiteNC = new Date(y + 1, m - 1, d, 23, 59, 59);
        const plazoNCVencido = ahora > fechaLimiteNC;

        const diaStr = fechaLimite.getDate().toString().padStart(2, '0');
        const mesStr = (fechaLimite.getMonth() + 1).toString().padStart(2, '0');
        const fechaLimiteStr = `${diaStr}/${mesStr}/${fechaLimite.getFullYear()}`;

        return {
            valido: !plazoVencido && !esConsumidorFinal,
            plazoVencido,
            esConsumidorFinal,
            plazoNCVencido,
            fechaLimiteStr,
            mensaje: esConsumidorFinal
                ? '⚠️ Factura emitida a Consumidor Final: No permite anulación ni Nota de Crédito una vez autorizada.'
                : (plazoVencido
                    ? `⚠️ Plazo de anulación en línea vencido (Venció el ${fechaLimiteStr}). Requiere emisión de NOTA DE CRÉDITO (plazo de 12 meses).`
                    : `✅ Dentro del plazo legal para anulación en línea (Límite: ${fechaLimiteStr}).`)
        };
    }
};

// ========== DYNAMIC ISLAND HUD DE ÉLITE (OBSIDIAN & LIQUID GOLD) ==========
const SriDynamicIsland = {
    element: null,

    render() {
        if (this.element && document.getElementById('sri-dynamic-island-root')) return this.element;

        let existing = document.getElementById('sri-dynamic-island-root');
        if (existing) existing.remove();

        const island = document.createElement('div');
        island.id = 'sri-dynamic-island-root';
        island.style.cssText = `
            position: fixed;
            top: 14px;
            right: 20px;
            z-index: 2147483647;
            background: rgba(9, 13, 22, 0.92);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(245, 158, 11, 0.35);
            border-radius: 40px;
            padding: 8px 18px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7), 0 0 25px rgba(245, 158, 11, 0.18);
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
            color: #f8fafc;
            font-size: 12px;
            font-weight: 700;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
        `;

        island.innerHTML = `
            <style>
                @keyframes pulse-island-radar {
                    0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
                    70% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
                    100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
                }
                .sri-island-dot {
                    width: 10px; height: 10px; border-radius: 50%;
                    background: #f59e0b;
                    box-shadow: 0 0 10px #f59e0b;
                    animation: pulse-island-radar 1.4s infinite ease-in-out;
                    flex-shrink: 0;
                }
                .sri-island-btn {
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #cbd5e1;
                    border-radius: 20px;
                    padding: 4px 8px;
                    font-size: 11px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .sri-island-btn:hover {
                    background: rgba(245, 158, 11, 0.2);
                    color: #fbbf24;
                    border-color: rgba(245, 158, 11, 0.4);
                }
            </style>
            <span class="sri-island-dot" id="sri-island-dot"></span>
            <span id="sri-island-text" style="white-space:nowrap; letter-spacing: 0.01em;">⚡ Anulador SRI · Conectado</span>
            <button id="sri-btn-mute" class="sri-island-btn" title="Silenciar / Activar sonido">🔊</button>
            <button id="sri-btn-emergency" class="sri-island-btn" title="Parada de Emergencia" style="color:#f87171;">🛑</button>
        `;

        document.body.appendChild(island);
        this.element = island;

        // Listeners interactivos del HUD
        document.getElementById('sri-btn-mute')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const soundOn = SriAudioEngine.toggleSound();
            const btn = document.getElementById('sri-btn-mute');
            if (btn) btn.textContent = soundOn ? '🔊' : '🔇';
        });

        document.getElementById('sri-btn-emergency')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.sriPoller) clearInterval(window.sriPoller);
            chrome.storage.local.set({ sri_active_batch: false, sri_batch_queue: [] }, () => {
                SriDynamicIsland.update("🛑 Parada de emergencia activada", "error");
                setTimeout(() => { if (island) island.remove(); }, 3500);
            });
        });

        return island;
    },

    update(text, type = 'working') {
        this.render();
        const textEl = document.getElementById('sri-island-text');
        if (textEl) textEl.textContent = text;

        const dot = document.getElementById('sri-island-dot');
        if (dot && this.element) {
            if (type === 'success') {
                dot.style.background = '#10b981';
                dot.style.boxShadow = '0 0 12px #10b981';
                this.element.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                this.element.style.boxShadow = '0 12px 40px rgba(0,0,0,0.7), 0 0 25px rgba(16, 185, 129, 0.25)';
            } else if (type === 'working') {
                dot.style.background = '#f59e0b';
                dot.style.boxShadow = '0 0 12px #f59e0b';
                this.element.style.borderColor = 'rgba(245, 158, 11, 0.45)';
                this.element.style.boxShadow = '0 12px 40px rgba(0,0,0,0.7), 0 0 25px rgba(245, 158, 11, 0.2)';
            } else {
                dot.style.background = '#ef4444';
                dot.style.boxShadow = '0 0 12px #ef4444';
                this.element.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                this.element.style.boxShadow = '0 12px 40px rgba(0,0,0,0.7), 0 0 25px rgba(239, 68, 68, 0.25)';
            }
        }
    }
};

function injectOperatingIndicator(statusMsg, type = 'running') {
    SriDynamicIsland.update(statusMsg, type);
}

// ========== MODAL DE RESUMEN EJECUTIVO FINAL (OBSIDIAN & LIQUID GOLD) ==========
function showFinalReport(results = []) {
    chrome.storage.local.get(['sri_batch_results', 'sri_anulaciones_historial'], (res) => {
        const batchResults = results.length > 0 ? results : (res.sri_batch_results || []);
        const totalDocs = batchResults.length;
        const exitosos = batchResults.filter(r => r.status === 'success' || r.estado === 'success').length;
        const fallidos = totalDocs - exitosos;

        // Calcular monto total acumulado
        let montoAcumulado = 0;
        batchResults.forEach(r => {
            const item = r.item || {};
            const val = parseFloat(item.total || r.total || '0');
            if (!isNaN(val)) montoAcumulado += val;
        });

        // Eliminar modal previo si existiera
        const prevModal = document.getElementById('sri-executive-modal-root');
        if (prevModal) prevModal.remove();

        const modalRoot = document.createElement('div');
        modalRoot.id = 'sri-executive-modal-root';
        modalRoot.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(3, 7, 18, 0.85);
            backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
            z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
            animation: fadeInModal 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        modalRoot.innerHTML = `
            <style>
                @keyframes fadeInModal { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
                .sri-modal-card {
                    background: linear-gradient(180deg, #0d1322 0%, #060911 100%);
                    border: 1px solid rgba(245, 158, 11, 0.45);
                    box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 40px rgba(245, 158, 11, 0.2);
                    border-radius: 24px;
                    width: 440px;
                    max-width: 90vw;
                    padding: 28px 24px;
                    text-align: center;
                    color: white;
                }
                .sri-badge-kpi {
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 12px;
                    padding: 12px 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
            </style>
            <div class="sri-modal-card">
                <div style="font-size: 38px; margin-bottom: 8px;">${fallidos > 0 && exitosos === 0 ? '⚠️' : (fallidos > 0 ? '📊' : '🏆')}</div>
                <h2 style="font-size: 20px; font-weight: 800; background: linear-gradient(135deg, #ffffff 0%, #fbbf24 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 6px;">
                    ${fallidos > 0 && exitosos === 0 ? 'Solicitudes con Observación del SRI' : (fallidos > 0 ? 'Lote Procesado con Observaciones' : '¡Lote Anulado con Éxito!')}
                </h2>
                <p style="font-size: 12px; color: #94a3b8; margin-bottom: 20px;">
                    ${fallidos > 0 && exitosos === 0 ? 'El SRI notificó observaciones reglamentarias en los comprobantes' : 'Resumen ejecutivo oficial de las solicitudes de anulación ante el SRI'}
                </p>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
                    <div class="sri-badge-kpi">
                        <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Total Facturas</span>
                        <span style="font-size: 22px; font-weight: 800; color: #f8fafc;">${totalDocs}</span>
                    </div>
                    <div class="sri-badge-kpi">
                        <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Total Anulado</span>
                        <span style="font-size: 22px; font-weight: 800; color: #10b981;">$ ${montoAcumulado.toFixed(2)}</span>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px;">
                    <div class="sri-badge-kpi">
                        <span style="font-size: 10px; color: #34d399; text-transform: uppercase; font-weight: 700;">✅ Confirmadas</span>
                        <span style="font-size: 16px; font-weight: 700; color: #34d399;">${exitosos}</span>
                    </div>
                    <div class="sri-badge-kpi">
                        <span style="font-size: 10px; color: #f87171; text-transform: uppercase; font-weight: 700;">⚠️ Con Observación</span>
                        <span style="font-size: 16px; font-weight: 700; color: #f87171;">${fallidos}</span>
                    </div>
                </div>

                ${(() => {
                    const plazoObs = batchResults.filter(r => {
                        const m = (r.message || r.mensaje || '').toLowerCase();
                        return m.includes('plazo') || m.includes('nota de crédito');
                    });
                    if (plazoObs.length === 0) return '';
                    return `
                        <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 14px; padding: 12px 14px; margin-bottom: 14px; text-align: left; font-size: 11px; line-height: 1.45; color: #fde68a;">
                            <div style="font-weight: 800; font-size: 12px; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                                <span>⚖️</span> Dictamen SRI: Plazo Legal Superado
                            </div>
                            ${plazoObs.length === 1 ? 'Esta factura superó' : `${plazoObs.length} facturas superaron`} el día 7 del mes posterior a la emisión. El SRI prohíbe anulación directa en línea.
                            <br><br>
                            <b>Acción Requerida:</b> Emitir <b>Nota de Crédito electrónica</b> por el total de la factura (vigente hasta 12 meses desde la fecha de emisión).
                        </div>
                        <button id="sri-btn-modal-copy-nc" style="width: 100%; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.45); color: #fbbf24; border-radius: 12px; padding: 10px; font-weight: 700; font-size: 11px; cursor: pointer; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            📋 Copiar Clave(s) para emitir Nota de Crédito
                        </button>
                    `;
                })()}

                <button id="sri-btn-modal-csv" style="width: 100%; background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%); color: #000; border: none; border-radius: 12px; padding: 13px; font-weight: 800; font-size: 13px; cursor: pointer; box-shadow: 0 4px 20px rgba(245, 158, 11, 0.35); margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    📥 Descargar Acta de Anulaciones (.CSV)
                </button>

                <button id="sri-btn-modal-close" style="width: 100%; background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 11px; font-weight: 600; font-size: 12px; cursor: pointer;">
                    ✨ Finalizar y Limpiar
                </button>
            </div>
        `;

        document.body.appendChild(modalRoot);

        document.getElementById('sri-btn-modal-copy-nc')?.addEventListener('click', function() {
            const plazoObs = batchResults.filter(r => {
                const m = (r.message || r.mensaje || '').toLowerCase();
                return m.includes('plazo') || m.includes('nota de crédito');
            });
            const claves = plazoObs.map(r => r.clave || (r.item ? r.item.claveAcceso : '')).filter(Boolean).join('\n');
            if (claves) {
                navigator.clipboard.writeText(claves).then(() => {
                    this.innerHTML = '✅ ¡Claves Copiadas al Portapapeles!';
                    setTimeout(() => {
                        this.innerHTML = '📋 Copiar Clave(s) para emitir Nota de Crédito';
                    }, 3000);
                });
            }
        });

        document.getElementById('sri-btn-modal-csv')?.addEventListener('click', () => {
            SriReportExporter.downloadCSV(batchResults);
        });

        document.getElementById('sri-btn-modal-close')?.addEventListener('click', () => {
            modalRoot.remove();
        });
    });
}


let isNavigating = false;
let debounceTimer = null;

// ========== OBSERVER & INJECTION ==========
function initObserver() {
    function findMenuLink() {
        // 1. Prioridad: Enlace directo en menuAnulacion.jsf para entrar al formulario
        const directLink = document.querySelector('a[onclick*="consultaDocumentoForm"]') ||
                           document.querySelector('a[id*="consultaDocumentoForm"]');
        if (directLink) return directLink;

        // 2. Búsqueda por texto en todos los enlaces y botones
        const elements = Array.from(document.querySelectorAll('a, button, span.ui-menuitem-text, td.rich-menu-item-label, div[class*="menu"]'));
        const terms = [
            "solicitud de anulación",
            "solicitud de anulacion",
            "anulación de comprobantes",
            "anulacion de comprobantes",
            "anulación",
            "anulacion"
        ];

        for (const term of terms) {
            const found = elements.find(el => {
                const txt = (el.innerText || el.textContent || '').toLowerCase().trim();
                return txt.includes(term);
            });
            if (found) {
                return found.closest('a') || found.closest('button') || found;
            }
        }
        return null;
    }

    const checkAndInject = () => {
        // 1. SAFETY: Only allow widget on Anulacion workflow pages
        if (!window.location.href.includes('/anulacion/')) {
            const w = document.getElementById('sri-upload-widget');
            if (w) w.remove();
            return;
        }

        // Si ya estamos en medio de una navegación activa al formulario, evitar re-ejecución
        if (isNavigating) return;

        const hasFormInput = document.getElementById('frmPrincipal:itxtClaveAcceso') || document.querySelector('input[id*="ClaveAcceso"]');
        const hasBtnAceptar = document.getElementById('frmPrincipal:btnAceptar');
        const hasBtnEnviar = document.getElementById('frmPrincipal:btnEnviar');
        const hasFormFields = !!(hasFormInput || hasBtnAceptar || hasBtnEnviar || document.querySelector('input[type="text"]'));

        const menuLink = findMenuLink();

        // 2. DATA RESTORE (Drop & Go Result)
        if (hasFormFields) {
            const pending = sessionStorage.getItem('sri_pending_data');
            if (pending) {
                sessionStorage.removeItem('sri_pending_data');
                console.log("SRI Asistente: Restaurando datos pendientes...");

                if (!document.getElementById('sri-upload-widget')) createUploadWidget();

                setTimeout(() => {
                    try {
                        const data = JSON.parse(pending);
                        renderResults(data);
                        window.__sriLastProcessedItem = data;

                        const drop = document.getElementById('drop-zone');
                        const msg = document.getElementById('status-msg');
                        const ab = document.getElementById('action-bar');

                        if (drop) drop.style.display = 'none';
                        if (ab) ab.style.display = 'block';

                        chrome.storage.local.get(['sri_autopilot_enabled'], (cfg) => {
                            const auto = cfg.sri_autopilot_enabled !== false;
                            if (auto) {
                                if (msg) { msg.textContent = "⚡ Piloto Automático: Procesando..."; msg.style.display = 'block'; msg.className = 'status-msg success'; }
                                if (window.SriAudioEngine) window.SriAudioEngine.playBatchStart();
                                startProcessingItem(data);
                            } else {
                                fillForm(data);
                                if (msg) { msg.textContent = "Datos listos. Presiona ▶️ para continuar."; msg.style.display = 'block'; msg.className = 'status-msg success'; }
                            }
                        });
                    } catch (err) { console.error("Restore failed", err); }
                }, 800);
            }
        }

        // 3. MENU PAGE LOGIC (Auto-Nav - Authorized Only)
        if (menuLink && !hasFormFields && !isNavigating) {
            chrome.storage.local.get(['sri_auto_nav', 'sri_active_batch', 'sri_batch_queue'], (result) => {
                if (isNavigating) return;
                const auth = result.sri_auto_nav;
                const queue = result.sri_batch_queue || [];
                const isBatchActive = result.sri_active_batch && queue.length > 0;
                const isAuth = (auth && auth.target === 'solicitud_anulacion' && (Date.now() - auth.timestamp) < 60000) || isBatchActive;

                if (isAuth) {
                    isNavigating = true;

                    // ÚNICO LOADER BLINDADO (Anti-duplicación, ID único)
                    let loader = document.getElementById('sri-nav-loader');
                    if (!loader) {
                        loader = document.createElement('div');
                        loader.id = 'sri-nav-loader';
                        loader.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(3,7,18,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);z-index:2147483647;display:flex;justify-content:center;align-items:center;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;`;
                        loader.innerHTML = `
                            <div style="font-size:52px; animation:pulse 1s infinite; filter: drop-shadow(0 0 20px rgba(245,158,11,0.5));">🚀</div>
                            <div style="margin-top:20px;color:#fbbf24;font-weight:800;font-size:16px;letter-spacing:0.02em;">
                                ${isBatchActive ? `Procesando lote · Siguiente factura (${queue.length} restantes)...` : 'Entrando a Solicitud de Anulación...'}
                            </div>
                            <div style="margin-top:8px;color:#94a3b8;font-size:12px;font-weight:500;">
                                Soluciones Tributarias Estratégicas · Santiago Córdova
                            </div>
                        `;
                        document.body.appendChild(loader);
                    }

                    if (auth) chrome.storage.local.remove('sri_auto_nav');

                    setTimeout(() => {
                        console.log("⚡ [ANULADOR SRI] Clic automático en opción de menú ->", menuLink);
                        try {
                            const targetToClick = menuLink.closest('a') || menuLink.closest('button') || menuLink;
                            targetToClick.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
                            targetToClick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                            targetToClick.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                            targetToClick.click();
                            targetToClick.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        } catch(e) {
                            try { menuLink.click(); } catch(err){}
                        }

                        // Temporizador de seguridad: si no navega en 5s, permitir reintento
                        setTimeout(() => {
                            isNavigating = false;
                        }, 5000);
                    }, 500);
                }

                const w = document.getElementById('sri-upload-widget');
                if (w) w.remove();
            });
        }

        // 4. FORM PAGE LOGIC (Standard Fill)
        if (hasFormFields) {
            // Si llegamos al formulario, retirar loader si aún existe
            const oldLoader = document.getElementById('sri-nav-loader');
            if (oldLoader) oldLoader.remove();
            isNavigating = false;

            if (!document.getElementById('sri-upload-widget')) {
                createUploadWidget();
            } else {
                checkBatchStatus();
            }
        }
    };

    checkAndInject();
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(checkAndInject, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ========== WIDGET ==========
const UI_STATE = { injected: false };

// --- BYPASS SRI CONFIRMATION POPUPS (MAIN WORLD) ---
// El bypass NO se inyecta como texto inline (lo bloquea la CSP del portal).
// Se carga como <script src> externo vía web_accessible_resources, que sí pasa
// la CSP, y sobreescribe window.confirm en el contexto de la página.
function injectMainWorldBypass() {
    const _href = (window.location.href || '').toLowerCase();
    if (!_href.includes('/anulacion/') && !_href.includes('menuanulacion') && !_href.includes('solicitudanulacion')) {
        return;
    }
    if (document.getElementById('sri-bypass-script')) return;
    try {
        const script = document.createElement('script');
        script.id = 'sri-bypass-script';
        script.src = chrome.runtime.getURL('libs/injected_bypass.js');
        (document.head || document.documentElement).appendChild(script);
        console.log("SRI Asistente: Main World Bypass inyectado correctamente");
    } catch (e) {
        console.error("SRI Asistente: Error inyectando script bypass", e);
    }
}
injectMainWorldBypass();

function createUploadWidget() {
    const widget = document.createElement('div');
    widget.id = 'sri-upload-widget';
    widget.innerHTML = `
        <style>
            .sri-widget-container {
                position: fixed; bottom: 25px; right: 25px; width: 330px;
                background: rgba(9, 13, 22, 0.94); 
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                border-radius: 20px;
                box-shadow: 0 25px 65px rgba(0,0,0,0.7), 0 0 30px rgba(245, 158, 11, 0.15);
                z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
                overflow: hidden; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                animation: slideUpObsidian 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                border: 1px solid rgba(245, 158, 11, 0.4);
                color: #f8fafc;
            }
            @keyframes slideUpObsidian { from { transform: translateY(110%) scale(0.92); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
            
            .widget-header {
                background: linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.95) 100%);
                padding: 14px 18px; color: white; display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid rgba(245, 158, 11, 0.3);
            }
            .widget-title { 
                font-weight: 800; font-size: 13px; letter-spacing: 0.02em;
                background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #fbbf24 100%);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            }
            .widget-controls { display: flex; align-items: center; gap: 8px; }
            .widget-auto-badge {
                font-size: 10px; font-weight: 700; color: #fbbf24; background: rgba(245, 158, 11, 0.15);
                border: 1px solid rgba(245, 158, 11, 0.35); padding: 2px 7px; border-radius: 10px;
                display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;
            }
            .widget-close { cursor: pointer; font-size: 18px; opacity: 0.7; transition: transform 0.2s, opacity 0.2s; color: #94a3b8; }
            .widget-close:hover { opacity: 1; transform: scale(1.15); color: #ef4444; }

            .drop-zone {
                padding: 20px 14px; text-align: center; border: 2px dashed rgba(245, 158, 11, 0.35);
                margin: 16px; border-radius: 14px; cursor: pointer; 
                background: rgba(255, 255, 255, 0.02);
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .drop-zone:hover { 
                border-color: #fbbf24; background: rgba(245, 158, 11, 0.08);
                box-shadow: 0 8px 25px rgba(245, 158, 11, 0.2); transform: translateY(-2px);
            }
            .drop-icon { font-size: 30px; display: block; margin-bottom: 8px; filter: drop-shadow(0 4px 8px rgba(245, 158, 11, 0.3)); }
            .drop-text { font-size: 12px; color: #f8fafc; font-weight: 700; }
            
            .result-list { padding: 0 16px 16px; display: none; max-height: 280px; overflow-y: auto; }
            .result-list::-webkit-scrollbar { width: 4px; }
            .result-list::-webkit-scrollbar-thumb { background: rgba(245, 158, 11, 0.3); border-radius: 2px; }
            
            .result-item { 
                display: flex; flex-direction: column; 
                padding: 10px; border: 1px solid rgba(255, 255, 255, 0.06);
                background: rgba(255, 255, 255, 0.03); border-radius: 10px; margin-bottom: 8px;
            }
            .result-label { font-size: 9px; color: #94a3b8; font-weight: 700; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
            .result-row { display: flex; align-items: center; gap: 8px; }
            .result-value { 
                font-size: 11px; color: #f8fafc; font-family: monospace; 
                flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                background: rgba(0, 0, 0, 0.3); padding: 5px 8px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px;
            }
            .copy-btn {
                background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); padding: 5px 10px; border-radius: 6px;
                cursor: pointer; font-size: 10px; color: #cbd5e1; font-weight: 700;
                transition: all 0.2s;
            }
            .copy-btn:hover { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border-color: rgba(245, 158, 11, 0.4); }
            .copy-btn.copied { background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.4); }

            .status-msg { margin: 0 16px 14px; padding: 10px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; display: none; text-align: center; }
            .status-msg.success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
            .status-msg.error { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

            .action-bar { padding: 0 16px 16px; display: none; text-align: center; }
            .btn-process {
                width: 100%; background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);
                color: #000; border: none; padding: 12px; border-radius: 10px;
                font-weight: 800; font-size: 13px; cursor: pointer;
                box-shadow: 0 4px 18px rgba(245, 158, 11, 0.35); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .btn-process:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(245, 158, 11, 0.45); }
            .btn-process.disabled { opacity: 0.6; cursor: wait; transform: none; }
            .btn-cancel { 
                margin-top: 8px; font-size: 11px; color: #94a3b8; font-weight: 600; background: none; border: none; cursor: pointer;
                display: none; transition: color 0.2s;
            }
            .btn-cancel:hover { color: #f87171; text-decoration: underline; }
            .current-file { font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 6px; display: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 8px; }
        </style>
        
        <div class="sri-widget-container" id="sri-widget-box">
            <div class="widget-header">
                <div class="widget-title">⚡ ANULADOR SRI PRO</div>
                <div class="widget-controls">
                    <span id="widget-toggle-auto" class="widget-auto-badge" title="Alternar Piloto Automático">
                        <span style="font-size:8px;">●</span> AUTO ON
                    </span>
                    <div class="widget-close" id="widget-close" title="Cerrar Widget">×</div>
                </div>
            </div>
            
            <div id="drop-zone" class="drop-zone">
                <span class="drop-icon">📑</span>
                <span id="drop-text" class="drop-text">Suelta aquí tus PDFs (Lote)</span>
                <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">Zero-Click: procesa y anula en automático</div>
                <input type="file" id="widget-file-input" accept="application/pdf" style="display:none" multiple>
            </div>
            
            <div id="status-msg" class="status-msg"></div>
            <div id="current-file" class="current-file"></div>
            <div id="result-list" class="result-list"></div>
            
            <div id="action-bar" class="action-bar">
                <button id="btn-process" class="btn-process" data-state="idle">
                    🚀 Iniciar Solicitud
                </button>
                <button id="btn-cancel" class="btn-cancel">Detener Proceso</button>
            </div>
        </div>
    `;

    document.body.appendChild(widget);

    const box = document.getElementById('sri-widget-box');
    const closeBtn = document.getElementById('widget-close');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('widget-file-input');
    const processBtn = document.getElementById('btn-process');

    closeBtn.addEventListener('click', () => box.remove());
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleMultipleFiles(e.target.files);
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#2563eb'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = '#e2e8f0'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#e2e8f0';
        if (e.dataTransfer.files.length) handleMultipleFiles(e.dataTransfer.files);
    });

    // Unificado: Control de Procesamiento de Lote y Manual
    processBtn.addEventListener('click', async () => {
        const state = processBtn.getAttribute('data-state');
        if (state === 'error' || state === 'success') {
            chrome.storage.local.set({ sri_active_batch: false, sri_batch_queue: [], sri_batch_results: [] }, resetWidgetUI);
            return;
        }

        chrome.storage.local.get(['sri_batch_queue'], (res) => {
            const queue = res.sri_batch_queue || [];
            if (queue.length > 0) {
                checkBatchStatus();
            } else if (window.__sriLastProcessedItem) {
                startProcessingItem(window.__sriLastProcessedItem);
            } else {
                const btnSolicitar = document.getElementById('frmPrincipal:btnAceptar') || document.querySelector('[id*="btnAceptar"]') || findButtonByText('Solicitar');
                if (btnSolicitar) btnSolicitar.click();
            }
        });
    });

    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (window.sriPoller) clearInterval(window.sriPoller);
            chrome.storage.local.set({ sri_active_batch: false, sri_batch_queue: [], sri_batch_results: [] }, () => {
                setButtonState('idle', 'Lote Cancelado');
                setTimeout(resetWidgetUI, 1000);
            });
        });
    }

    const skipBtn = document.getElementById('btn-skip');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            saveResultAndContinue('skipped', 'Saltada manualmente por Test/Usuario');
        });
    }

    // Ejecutar verificación de estado de lote
    checkBatchStatus();
}

// ========== ESTADO Y CONTROL OPERATIVO DE PROCESAMIENTO (ÁMBITO GLOBAL) ==========
let isSubmittingStep1 = false;
let isSubmittingStep2 = false;
let lastFilledClave = '';

async function handleMultipleFiles(files) {
    const fileList = Array.from(files);
    setButtonState('processing', `<span>⏳</span> Analizando ${fileList.length} archivo(s)...`);
    
    const batch = [];
    for (const file of fileList) {
        try {
            const ab = await file.arrayBuffer();
            const doc = await pdfjsLib.getDocument(new Uint8Array(ab)).promise;
            let text = '';
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(it => it.str).join(' ') + ' ';
            }
            const data = extractData(text.replace(/\s+/g, ' '));
            data.fileName = file.name;
            if (data.isValid) batch.push(data);
        } catch (err) { console.error("Error batch extracting", err); }
    }

    if (batch.length > 0) {
        if (window.SriAudioEngine) window.SriAudioEngine.playBatchStart();
        chrome.storage.local.set({ 
            sri_batch_queue: batch,
            sri_batch_total: batch.length,
            sri_active_batch: true 
        }, () => {
            renderBatchProgress(batch[0], 1, batch.length);
            startProcessingItem(batch[0]);
        });
    } else {
        setButtonState('error', '❌ No se detectaron facturas válidas');
    }
}

function saveResultAndContinue(status, message, claveConfirmada = '') {
    setButtonState('verifying', '<span>💾</span> Guardando resultado...');
    chrome.storage.local.get(['sri_batch_queue', 'sri_batch_results', 'sri_anulaciones_historial'], (res) => {
        const queue = res.sri_batch_queue || [];
        const results = res.sri_batch_results || [];
        const historial = res.sri_anulaciones_historial || [];
        
        const currentItem = queue.length > 0 ? queue[0] : (window.__sriLastProcessedItem || null);
        const claveFinal = claveConfirmada || (currentItem ? currentItem.claveAcceso : '');
        
        const resultadoItem = {
            item: currentItem,
            clave: claveFinal,
            status: status,
            message: message,
            fecha: new Date().toISOString(),
            timestamp: Date.now()
        };
        
        results.push(resultadoItem);
        historial.push(resultadoItem);
        
        // Resetear banderas de control
        isSubmittingStep1 = false;
        isSubmittingStep2 = false;
        isNavigating = false;
        lastFilledClave = '';

        if (status === 'success') {
            if (window.SriAudioEngine) window.SriAudioEngine.playInvoiceSuccess();
        } else {
            if (window.SriAudioEngine) window.SriAudioEngine.playInvoiceWarning();
        }

        if (queue.length > 0) {
            const nextQueue = queue.slice(1);
            if (nextQueue.length > 0) {
                chrome.storage.local.set({ 
                    sri_batch_queue: nextQueue, 
                    sri_batch_results: results,
                    sri_anulaciones_historial: historial,
                    sri_active_batch: true
                }, () => {
                    setButtonState(status === 'success' ? 'success' : 'error', status === 'success' ? '✅ Avanzando al siguiente...' : '⚠️ Avanzando...');
                    if (typeof injectOperatingIndicator === 'function') {
                        injectOperatingIndicator(`⏳ Avanzando a siguiente factura (${nextQueue.length} restantes)...`, 'working');
                    }
                    setTimeout(() => {
                        window.location.href = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/solicitud/anulacion/menuAnulacion.jsf';
                    }, 1200);
                });
            } else {
                chrome.storage.local.set({ 
                    sri_batch_queue: [], 
                    sri_batch_results: results,
                    sri_anulaciones_historial: historial,
                    sri_active_batch: false 
                }, () => {
                    const exitosos = results.filter(r => r.status === 'success' || r.estado === 'success').length;
                    const fallidos = results.length - exitosos;
                    if (fallidos > 0 && exitosos === 0) {
                        setButtonState('error', '⚠️ Lote con Observaciones');
                        if (typeof injectOperatingIndicator === 'function') {
                            injectOperatingIndicator(`⚠️ ${fallidos} comprobante(s) con observación del SRI`, 'error');
                        }
                    } else if (fallidos > 0) {
                        setButtonState('idle', '📊 Lote Completado');
                        if (typeof injectOperatingIndicator === 'function') {
                            injectOperatingIndicator(`📊 Lote completado: ${exitosos} confirmados, ${fallidos} observaciones`, 'working');
                        }
                    } else {
                        setButtonState('success', '✨ Lote Completado');
                        if (typeof injectOperatingIndicator === 'function') {
                            injectOperatingIndicator('🎉 ¡Todas las solicitudes fueron anuladas con éxito!', 'success');
                        }
                    }
                    if (window.SriAudioEngine) window.SriAudioEngine.playBatchComplete();
                    setTimeout(() => showFinalReport(results), 1000);
                });
            }
        } else {
            // Caso documento individual
            chrome.storage.local.set({ 
                sri_batch_results: results,
                sri_anulaciones_historial: historial
            }, () => {
                setButtonState(status === 'success' ? 'success' : 'error', status === 'success' ? '✨ Anulado con éxito' : '⚠️ Observación SRI');
                setTimeout(() => showFinalReport(results), 1200);
            });
        }
    });
}

// Receptor de alertas y diálogos interceptados desde Main World
window.__sriCapturedPortalMessage = '';
window.addEventListener('SRI_PORTAL_ALERT', (e) => {
    if (e.detail && e.detail.message) {
        window.__sriCapturedPortalMessage = e.detail.message;
        console.log("📢 [ANULADOR SRI] Mensaje alert del portal capturado:", e.detail.message);
    }
});
window.addEventListener('SRI_PORTAL_DIALOG', (e) => {
    if (e.detail && e.detail.text) {
        window.__sriCapturedPortalMessage = e.detail.text;
        console.log("📢 [ANULADOR SRI] Mensaje diálogo del portal capturado:", e.detail.text);
    }
});

// Poller activo para capturar la respuesta AJAX de RichFaces tras pulsar btnEnviar
function iniciarPollerResultadoAnulacion() {
    if (window.sriPoller) clearInterval(window.sriPoller);
    
    let intentos = 0;
    const maxIntentos = 50; // ~30 segundos
    console.log("👀 [ANULADOR SRI] Poller iniciado: esperando confirmación AJAX del SRI...");
    
    window.sriPoller = setInterval(() => {
        intentos++;
        
        // 1. Selector prioritario: mensajes JSF / RichFaces
        const msgSummary = document.querySelector('.ui-messages-fatal-summary, .ui-messages-info-summary, .ui-messages-error-summary, [id*="messages"], .sri-mensaje, .rf-msgs-sum');
        const capturedMsg = window.__sriCapturedPortalMessage || '';
        const fullBodyText = ((msgSummary ? msgSummary.innerText : '') + ' ' + capturedMsg + ' ' + (document.body ? document.body.innerText : '')).trim();
        
        // Detección de ÉXITO
        if (fullBodyText.includes('enviada con éxito') || fullBodyText.includes('estado ANULADO') || fullBodyText.includes('solicitud de anulación fue registrada') || fullBodyText.includes('anulación ha sido registrada')) {
            clearInterval(window.sriPoller);
            window.sriPoller = null;
            
            console.log("🎉 [ANULADOR SRI] ¡Confirmación de ÉXITO recibida del SRI!");
            const claveMatch = fullBodyText.match(/\b\d{49}\b/);
            const claveAnulada = claveMatch ? claveMatch[0] : '';
            
            setButtonState('success', '<span>✅</span> ¡ANULADO CON ÉXITO!');
            if (typeof injectOperatingIndicator === 'function') {
                injectOperatingIndicator(`🟢 Comprobante ANULADO con éxito${claveAnulada ? ': ' + claveAnulada.slice(-8) : ''}`, 'success');
            }
            
            saveResultAndContinue('success', 'Comprobante ANULADO con éxito', claveAnulada);
            return;
        }
        
        // Detección de ERROR
        const hasPlazoError = fullBodyText.includes('supera el plazo') || fullBodyText.includes('plazo permitido') || fullBodyText.includes('plazo máximo') || fullBodyText.includes('tiempo límite');

        if (fullBodyText.includes('ha ocurrido un error') || fullBodyText.includes('no se encuentra autorizado') || fullBodyText.includes('ya se encuentra anulado') || fullBodyText.includes('no corresponde al emisor') || fullBodyText.includes('no corresponde a un Comprobante') || fullBodyText.includes('vuelva a ingresar su solicitud') || fullBodyText.includes('Error al procesar') || fullBodyText.includes('no pertenece') || hasPlazoError) {
            clearInterval(window.sriPoller);
            window.sriPoller = null;
            
            let errDetalle = '';
            if (hasPlazoError) {
                errDetalle = 'Supera el plazo máximo permitido en línea (Día 7 superado). Emitir NOTA DE CRÉDITO electrónica (vigente 12 meses)';
            } else if (msgSummary && msgSummary.innerText) {
                errDetalle = msgSummary.innerText.trim();
            } else if (capturedMsg) {
                errDetalle = capturedMsg.trim();
            } else {
                if (fullBodyText.includes('no corresponde al emisor') || fullBodyText.includes('no pertenece')) {
                    errDetalle = 'El comprobante no corresponde al emisor autenticado';
                } else if (fullBodyText.includes('ya se encuentra anulado')) {
                    errDetalle = 'El comprobante ya se encuentra anulado';
                } else {
                    errDetalle = 'Error reportado por el SRI';
                }
            }

            console.warn("⚠️ [ANULADOR SRI] Error en respuesta del SRI:", errDetalle);
            setButtonState('error', '<span>⚠️</span> Observación SRI');
            if (typeof injectOperatingIndicator === 'function') {
                injectOperatingIndicator(`⚠️ ${errDetalle.slice(0, 36)}...`, 'error');
            }
            saveResultAndContinue('error', errDetalle);
            return;
        }
        
        if (intentos >= maxIntentos) {
            clearInterval(window.sriPoller);
            window.sriPoller = null;
            console.warn("⏱️ [ANULADOR SRI] Timeout esperando respuesta de anulación.");
            setButtonState('error', '<span>⚠️</span> Tiempo agotado');
        }
    }, 600);
}

async function startProcessingItem(data) {
    if (!data || !data.claveAcceso) return;
    window.__sriLastProcessedItem = data;

    // --- PRE-FLIGHT 1: Validación de Consumidor Final y Plazo Legal ---
    const receptorId = data.idReceptor || '';
    const plazoValidacion = SriTaxCompliance.validarPlazoLegalAnulacion(data.fecha, receptorId);
    
    // Si es Consumidor Final
    if (plazoValidacion.esConsumidorFinal) {
        console.warn("⚠️ [ANULADOR SRI] Comprobante emitido a Consumidor Final:", data.facturaDisplay);
        if (typeof injectOperatingIndicator === 'function') {
            injectOperatingIndicator(`⚠️ Factura Consumidor Final: No anulable`, 'error');
        }
    }

    // Si el plazo está vencido (pasó el día 7 del mes siguiente)
    if (plazoValidacion.plazoVencido) {
        console.warn(`⚠️ [ANULADOR SRI] Plazo legal vencido (venció el ${plazoValidacion.fechaLimiteStr}):`, data.facturaDisplay);
        if (typeof injectOperatingIndicator === 'function') {
            injectOperatingIndicator(`⚠️ Plazo vencido (Día 7 superado). Requiere Nota de Crédito`, 'error');
        }
    }

    // --- PRE-FLIGHT 2: Validación de RUC Emisor vs Sesión Activa ---
    const emisorCheck = SriTaxCompliance.validarEmisorRuc(data.claveAcceso);
    if (!emisorCheck.coincide) {
        console.warn(`⚠️ [ANULADOR SRI] RUC Emisor (${emisorCheck.rucEmisor}) no coincide con RUC en sesión (${emisorCheck.rucSesion})`);
        if (typeof injectOperatingIndicator === 'function') {
            injectOperatingIndicator(`⚠️ RUC no coincide: Factura de ${emisorCheck.rucEmisor} vs Sesión ${emisorCheck.rucSesion}`, 'error');
        }
    }

    setButtonState('processing', '<span>⚙️</span> Vinculando datos...');
    
    const errorSummary = document.querySelector('.ui-messages-error-summary, .ui-messages-fatal-summary');
    const bodyText = document.body ? document.body.innerText : '';

    // Detección temprana de comprobante inválido / ya anulado en Step 1
    if (errorSummary || bodyText.includes('no corresponde a un Comprobante') || bodyText.includes('no se encuentra autorizado') || bodyText.includes('ya se encuentra anulado') || bodyText.includes('no corresponde al emisor') || bodyText.includes('tiempo límite') || bodyText.includes('plazo permitido')) {
        let errDetalle = errorSummary ? errorSummary.innerText : '';
        if (!errDetalle) {
            if (bodyText.includes('no corresponde al emisor')) errDetalle = 'El comprobante no corresponde al emisor autenticado';
            else if (bodyText.includes('tiempo límite') || bodyText.includes('plazo permitido')) errDetalle = 'Plazo legal en línea vencido (Día 7 superado). Emitir Nota de Crédito';
            else if (bodyText.includes('ya se encuentra anulado')) errDetalle = 'El comprobante ya se encuentra anulado';
            else errDetalle = 'Comprobante no autorizado o rechazado por el SRI';
        }
        console.warn("⚠️ [ANULADOR SRI] Error temprano detectado en Step 1:", errDetalle);
        saveResultAndContinue('error', errDetalle);
        return;
    }

    // --- PASO 2: Pantalla de Confirmación con Botón Enviar ---
    const btnEnviar = document.getElementById('frmPrincipal:btnEnviar') || document.querySelector('[id*="btnEnviar"]') || findButtonByText('Enviar');
    if (btnEnviar) {
        if (isSubmittingStep2) return;
        isSubmittingStep2 = true;

        console.log("⚡ [ANULADOR SRI] Pantalla de confirmación con btnEnviar detectada.");
        setButtonState('confirming', '<span>🚀</span> Confirmando anulación...');
        if (typeof injectOperatingIndicator === 'function') {
            injectOperatingIndicator("🚀 Confirmando anulación en el SRI...", "working");
        }
        
        // Habilitar botón y remover restricciones
        try {
            btnEnviar.removeAttribute('disabled');
            btnEnviar.disabled = false;
        } catch(e){}

        // Bypass confirm en el onclick de RichFaces
        const originalOnClick = btnEnviar.getAttribute('onclick') || '';
        if (originalOnClick.includes('confirm')) {
            const cleanOnClick = originalOnClick.replace(/if\s*\(!confirm\([^)]*\)\)\s*return\s*false;?/gi, '');
            btnEnviar.setAttribute('onclick', cleanOnClick);
        }
        
        setTimeout(() => {
            console.log("⚡ [ANULADOR SRI] Haciendo clic en btnEnviar...");
            try {
                window.dispatchEvent(new CustomEvent('SRI_DISPARAR_ENVIAR'));
            } catch(e){}

            try {
                btnEnviar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
                btnEnviar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                btnEnviar.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                btnEnviar.click();
                btnEnviar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            } catch(e) {
                try { btnEnviar.click(); } catch(err){}
            }
            setButtonState('verifying', '<span>👁️</span> Enviando solicitud al SRI...');
            iniciarPollerResultadoAnulacion();
            setTimeout(() => { isSubmittingStep2 = false; }, 4000);
        }, 600);
        return;
    }

    // --- PASO 1: Llenado de Formulario y Clic en Solicitar ---
    const formInput = document.getElementById('frmPrincipal:itxtClaveAcceso') || document.querySelector('input[id*="ClaveAcceso"]');
    const btnSolicitar = document.getElementById('frmPrincipal:btnAceptar') || document.querySelector('[id*="btnAceptar"]') || findButtonByText('Solicitar') || findButtonByText('Aceptar');

    if (formInput) {
        if (isSubmittingStep1) return;

        if (formInput.value !== data.claveAcceso && lastFilledClave !== data.claveAcceso) {
            isSubmittingStep1 = true;
            if (typeof injectOperatingIndicator === 'function') {
                injectOperatingIndicator(`📝 Llenando solicitud de anulación...`, 'working');
            }
            setButtonState('processing', '<span>⚙️</span> Llenando campos...');
            await fillForm(data);
            lastFilledClave = data.claveAcceso;
            isSubmittingStep1 = false;
        }

        // Una vez confirmados los datos en el campo, clic determinístico en Solicitar
        if (btnSolicitar && formInput.value === data.claveAcceso) {
            if (isSubmittingStep1) return;
            isSubmittingStep1 = true;
            console.log("⚡ [ANULADOR SRI] Formulario listo. Clic en btnAceptar (Solicitar)...");
            setButtonState('verifying', '<span>⏳</span> Solicitando anulación...');
            setTimeout(() => {
                try {
                    btnSolicitar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
                    btnSolicitar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    btnSolicitar.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    btnSolicitar.click();
                    btnSolicitar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                } catch(e) {
                    try { btnSolicitar.click(); } catch(err){}
                }

                // Iniciar vigilante activo de transición a Paso 2 (btnEnviar)
                esperarTransicionAPaso2(data);
                setTimeout(() => { isSubmittingStep1 = false; }, 4000);
            }, 600);
        }
    } else {
        // Reintentar si el DOM de JSF aún se está hidratando
        setTimeout(() => {
            const retryInput = document.getElementById('frmPrincipal:itxtClaveAcceso') || document.querySelector('input[id*="ClaveAcceso"]');
            const retryBtnEnviar = document.getElementById('frmPrincipal:btnEnviar') || document.querySelector('[id*="btnEnviar"]') || findButtonByText('Enviar');
            if (retryInput || retryBtnEnviar) {
                startProcessingItem(data);
            }
        }, 500);
    }
}

// Vigilante activo de transición hacia la pantalla de confirmación (Paso 2)
function esperarTransicionAPaso2(data) {
    console.log("👀 [ANULADOR SRI] Vigilante activo: esperando pantalla de confirmación (Paso 2)...");
    let intentos = 0;
    const maxIntentos = 40; // 20 segundos máximo (cada 500ms)
    
    const poller = setInterval(() => {
        intentos++;
        
        const btnEnviar = document.getElementById('frmPrincipal:btnEnviar') || document.querySelector('[id*="btnEnviar"]') || document.querySelector('input[value="Enviar"]');
        const errorSummary = document.querySelector('.ui-messages-error-summary, .ui-messages-fatal-summary');
        const bodyText = document.body ? document.body.innerText : '';

        // 1. Detectar si apareció la pantalla de confirmación con btnEnviar
        if (btnEnviar) {
            clearInterval(poller);
            console.log("🎯 [ANULADOR SRI] ¡Pantalla de confirmación detectada con éxito!");
            isSubmittingStep1 = false;
            startProcessingItem(data);
            return;
        }

        // 2. Detectar si el SRI arrojó un error tras dar clic en Solicitar
        if (errorSummary || bodyText.includes('no corresponde a un Comprobante') || bodyText.includes('no se encuentra autorizado') || bodyText.includes('ya se encuentra anulado') || bodyText.includes('no corresponde al emisor') || bodyText.includes('tiempo límite') || bodyText.includes('plazo permitido') || bodyText.includes('no pertenece')) {
            clearInterval(poller);
            let errDetalle = errorSummary ? errorSummary.innerText : '';
            if (!errDetalle) {
                if (bodyText.includes('no corresponde al emisor') || bodyText.includes('no pertenece')) {
                    errDetalle = 'El comprobante no corresponde al emisor autenticado';
                } else if (bodyText.includes('tiempo límite') || bodyText.includes('plazo permitido')) {
                    errDetalle = 'Plazo legal en línea vencido (Día 7 superado. Requiere Nota de Crédito)';
                } else if (bodyText.includes('ya se encuentra anulado')) {
                    errDetalle = 'El comprobante ya se encuentra anulado';
                } else {
                    errDetalle = 'Error reportado por el SRI al solicitar';
                }
            }
            console.warn("⚠️ [ANULADOR SRI] Error del SRI tras solicitar:", errDetalle);
            isSubmittingStep1 = false;
            saveResultAndContinue('error', errDetalle);
            return;
        }

        if (intentos >= maxIntentos) {
            clearInterval(poller);
            console.warn("⏱️ [ANULADOR SRI] Tiempo de espera agotado para transición a Paso 2.");
            isSubmittingStep1 = false;
            setButtonState('error', '<span>⚠️</span> Tiempo agotado');
        }
    }, 500);
}

// --- PILOTO AUTOMÁTICO GLOBAL ---
async function runAutoPilot() {
    const _href = (window.location.href || '').toLowerCase();
    if (!_href.includes('/anulacion/') && !_href.includes('menuanulacion') && !_href.includes('solicitudanulacion')) return;
    checkBatchStatus();
}
setTimeout(runAutoPilot, 1200);

function setButtonState(state, text, bgColor = null) {
    const btn = document.getElementById('btn-process');
    if (!btn) return;

    // Show skip and cancel btn if inside batch mode
    chrome.storage.local.get(['sri_active_batch', 'sri_batch_queue'], (res) => {
        const skip = document.getElementById('btn-skip');
        const cancel = document.getElementById('btn-cancel');
        const fileLbl = document.getElementById('current-file');
        
        if (res.sri_active_batch && res.sri_batch_queue && res.sri_batch_queue.length > 0) {
            if (skip) skip.style.display = 'block';
            if (cancel) cancel.style.display = 'inline-block';
            if (fileLbl) {
                fileLbl.style.display = 'block';
                fileLbl.innerText = '📄 Procesando: ' + (res.sri_batch_queue[0].fileName || 'Factura sin nombre');
            }
        }
    });

    btn.setAttribute('data-state', state);
    btn.innerHTML = text;

    // Remove old state classes/styles
    btn.classList.remove('disabled');
    btn.style.background = '';

    if (state === 'processing' || state === 'confirming' || state === 'verifying') {
        btn.classList.add('disabled');
        // Keep default gradient or set specific
    }

    if (bgColor) {
        btn.style.background = bgColor;
    } else if (state === 'error') {
        btn.style.background = '#64748b'; // Neutral/Gray for reset
    } else if (state === 'idle') {
        btn.style.background = 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)';
    }
}

function resetWidgetUI() {
    const dropZone = document.getElementById('drop-zone');
    const processBtn = document.getElementById('btn-process');

    dropZone.style.display = 'block';
    document.getElementById('result-list').style.display = 'none';
    document.getElementById('action-bar').style.display = 'none';
    document.getElementById('status-msg').style.display = 'none';

    setButtonState('idle', '<span>▶️</span> Iniciar Proceso de Solicitud');
}

function findButtonByText(text) {
    const term = text.toLowerCase();
    const widget = document.getElementById('sri-upload-widget');

    // 1. Search text in standard buttons and links
    const elements = Array.from(document.querySelectorAll('button, a, span.ui-button-text'));

    // Filter out our own widget elements!
    const validElements = elements.filter(el => !widget || !widget.contains(el));

    let target = validElements.find(el => el.innerText && el.innerText.toLowerCase().includes(term));

    // 2. Search exact value in inputs
    if (!target) {
        const inputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]'));
        const validInputs = inputs.filter(el => !widget || !widget.contains(el));
        target = validInputs.find(i => i.value && i.value.toLowerCase().includes(term));
    }

    if (target) {
        // Return the clickable ancestor if it's a span or icon
        return target.closest('button') || target.closest('a') || target;
    }
    return null;
}

// Batch Status Multi-Step logic
function checkBatchStatus() {
    chrome.storage.local.get(['sri_active_batch', 'sri_batch_queue', 'sri_batch_total', 'sri_autopilot_enabled'], (res) => {
        if (!res.sri_active_batch || !res.sri_batch_queue || res.sri_batch_queue.length === 0) return;

        const queue = res.sri_batch_queue;
        const total = res.sri_batch_total || queue.length;
        const current = queue[0];
        const index = total - queue.length + 1;
        const auto = res.sri_autopilot_enabled !== false;

        console.log(`⚡ [ANULADOR SRI] Estado de Lote: ${index}/${total} (Piloto Auto: ${auto ? 'ON' : 'OFF'})`);

        // 1. Detectar Pantalla de Confirmación (Paso 2 con btnEnviar)
        const btnEnviar = document.getElementById('frmPrincipal:btnEnviar') || document.querySelector('[id*="btnEnviar"]') || findButtonByText('Enviar');
        const bodyText = document.body ? document.body.innerText : '';

        if (btnEnviar) {
            renderBatchProgress(current, index, total);
            if (auto) {
                startProcessingItem(current);
            } else {
                setButtonState('idle', '<span>🚀</span> Confirmar y Enviar al SRI');
            }
            return;
        }

        // 2. Detectar Éxito si la página ya lo cargó
        if (bodyText.includes('enviada con éxito') || bodyText.includes('estado ANULADO') || bodyText.includes('solicitud de anulación fue registrada')) {
            console.log("🎉 [ANULADOR SRI] Éxito detectado en pantalla en checkBatchStatus.");
            const claveMatch = bodyText.match(/\b\d{49}\b/);
            saveResultAndContinue('success', 'Comprobante ANULADO con éxito', claveMatch ? claveMatch[0] : (current ? current.claveAcceso : ''));
            return;
        }

        // 3. Formulario Paso 1 (Llenado y solicitud)
        const btnSolicitar = document.getElementById('frmPrincipal:btnAceptar') || document.querySelector('[id*="btnAceptar"]') || findButtonByText('Solicitar') || findButtonByText('Aceptar');
        const formInput = document.getElementById('frmPrincipal:itxtClaveAcceso') || document.querySelector('input[id*="ClaveAcceso"]');
        if (btnSolicitar || formInput) {
            renderBatchProgress(current, index, total);
            if (auto) {
                startProcessingItem(current);
            } else {
                fillForm(current);
                setButtonState('idle', '<span>🚀</span> Solicitar Anulación');
            }
        }
    });
}

function renderBatchProgress(data, currentIdx, totalCount) {
    const drop = document.getElementById('drop-zone');
    const msg = document.getElementById('status-msg');
    const actionBar = document.getElementById('action-bar');
    
    if (drop) drop.style.display = 'none';
    if (msg) {
        msg.innerHTML = `<span style="background:linear-gradient(135deg, #fbbf24 0%, #d97706 100%); color:#000; padding:2px 8px; border-radius:50px; font-size:11px; font-weight:800; margin-right:8px;">Lote ${currentIdx}/${totalCount}</span>Datos listos para procesar.`;
        msg.style.display = 'block';
        msg.className = 'status-msg success';
    }
    if (actionBar) actionBar.style.display = 'block';
    
    renderResults(data);
}

// End of widget logic


// ========== PDF & EXTRACTION ==========
async function processPdfFile(file) {
    if (!pdfjsLib) return alert("Cargando librería PDF...");

    const ui = {
        drop: document.getElementById('drop-zone'),
        list: document.getElementById('result-list'),
        msg: document.getElementById('status-msg')
    };

    ui.drop.innerHTML = 'Scan...';
    ui.list.style.display = 'none';
    ui.msg.style.display = 'none';

    try {
        const ab = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument(new Uint8Array(ab)).promise;
        let text = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(it => it.str).join(' ') + ' ';
        }
        text = text.replace(/\s+/g, ' ');

        const data = extractData(text);

        // --- 1. VALIDATION CHECK ---
        if (!data.isValid || !data.facturaDisplay) {
            ui.drop.innerHTML = '<div style="color:#ef4444; font-weight:bold;">❌ PDF Inválido</div><div style="font-size:12px">No se detectó una factura electrónica</div>';
            ui.drop.style.display = 'block';
            ui.msg.style.display = 'none';
            if (document.getElementById('action-bar')) document.getElementById('action-bar').style.display = 'none';
            return;
        }

        // --- 2. MODE DETECTION (Form vs Menu) ---
        const hasInputs = document.querySelector('input[type="text"]');

        if (hasInputs) {
            // == FORM MODE (Standard) ==
            renderResults(data);
            window.__sriLastProcessedItem = data;

            ui.drop.style.display = 'none';
            const actionBar = document.getElementById('action-bar');
            if (actionBar) actionBar.style.display = 'block';

            chrome.storage.local.get(['sri_autopilot_enabled'], (cfg) => {
                const auto = cfg.sri_autopilot_enabled !== false;
                if (auto) {
                    ui.msg.textContent = "⚡ Piloto Automático: Procesando y solicitando anulación...";
                    ui.msg.className = 'status-msg success';
                    ui.msg.style.display = 'block';
                    if (window.SriAudioEngine) window.SriAudioEngine.playBatchStart();
                    startProcessingItem(data);
                } else {
                    fillForm(data);
                    ui.msg.textContent = "Datos listos. Presiona ▶️ para continuar.";
                    ui.msg.className = 'status-msg success';
                    ui.msg.style.display = 'block';
                }
            });
        } else {
            // == MENU MODE (Drop & Go) ==
            console.log("Drop & Go: Menu detected. Saving state and navigating...");

            // 1. Save Data
            sessionStorage.setItem('sri_pending_data', JSON.stringify(data));

            // 2. Find Link and Click
            const links = Array.from(document.querySelectorAll('a, span.ui-menuitem-text'));
            // Prioritize labels like 'Anulación' as requested by the user
            const menuLink = links.find(el => {
                const txt = (el.innerText || "").toLowerCase();
                return txt.includes("solicitud de anulación") || txt.includes("anulación");
            });

            if (menuLink) {
                ui.drop.innerHTML = '<div style="font-size:30px;">🚀</div><div style="font-size:14px; margin-top:10px;">Navegando al formulario...</div>';
                setTimeout(() => menuLink.click(), 500);
            } else {
                ui.drop.innerHTML = '⚠️ Error: No se encontró el botón del menú.';
            }
        }

        // Auto-Process if in "Auto Mode" (initiated from popup)
        if (sessionStorage.getItem('sri_auto_active')) {
            console.log("SRI Asistente: Modo Auto-Flow Activo. Iniciando secuencia...");

            // Show Overlay (Processing State)
            const overlay = document.getElementById('play-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                // Use a Spinner for "Processing" state instead of Play icon
                overlay.innerHTML = `
                   <div style="font-size:40px; animation:pulse 1s infinite;">⏳</div>
                   <div class="play-text" style="opacity:1; animation:none;">Procesando Solicitud...</div>
                `;
            }

            // ui.msg.textContent = "🚀 Modo Auto: Iniciando..."; // Overlay covers this anyway

            setTimeout(() => {
                const btn = document.getElementById('btn-process');
                if (btn) btn.click();

                // Hide overlay when the 'heavy lifting' starts or finishes?
                // User said: "luego de eso ya se puede ocultar" (after it's executing).
                // Let's keep it for a sec to show "Working" then hide so user sees the form filling steps if they want,
                // OR keep it until the end. "Transparent play button... when executing... after that hide".
                // Let's hide it after the click initiates the process logic.

                setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 2000);

            }, 1000);
        }


    } catch (e) {
        console.error(e);
        ui.drop.innerHTML = 'Error';
    }
}

function extractData(text) {
    const get = (re) => (text.match(re) || [])[1] || '';

    // --- CLAVE DE ACCESO ---
    let clave = get(/CLAVE\s*(?:DE\s+)?ACCESO[\s\S]*?(\d{49})/i);
    
    // Fallback: Buscar cualquier número de 49 dígitos
    if (!clave) {
        const any49 = text.match(/\b\d{49}\b/);
        if (any49) clave = any49[0];
    }
    
    let tipo = '';
    if (clave && clave.length === 49) {
        const cod = clave.substring(8, 10);
        if (cod === '01') tipo = 'FACTURA';
        else if (cod === '04') tipo = 'NOTA DE CRÉDITO';
        else if (cod === '05') tipo = 'NOTA DE DÉBITO';
        else if (cod === '06') tipo = 'GUÍA DE REMISIÓN';
        else if (cod === '07') tipo = 'COMPROBANTE DE RETENCIÓN';
    }

    // Fallback para tipo si la clave falló
    if (!tipo) {
        if (text.match(/FACTURA/i)) tipo = 'FACTURA';
        else if (text.match(/NOTA\s*DE\s*CR[ÉE]DITO/i)) tipo = 'NOTA DE CRÉDITO';
        else if (text.match(/COMPROBANTE\s*DE\s*RETENCI[ÓO]N/i)) tipo = 'COMPROBANTE DE RETENCIÓN';
    }


    // --- FECHAS ---
    let fecha = '';
    
    // 1. Intentar buscar Fecha de Autorización
    const fechaAutMatch = text.match(/(?:Fecha\s*(?:y\s*hora)?\s*(?:de)?\s*autorizaci[óo]n)[\s\S]*?(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    if (fechaAutMatch) {
        fecha = fechaAutMatch[1];
    }

    // 2. Intentar buscar Fecha de Emisión si no hay de Autorización
    if (!fecha) {
        const fechaEmisionMatch = text.match(/Fecha\s*(?:de)?\s*Emisi[óo]n.*?(?:(\d{2})[\/\-](\d{2})[\/\-](\d{4})|(\d{4})[\/\-](\d{2})[\/\-](\d{2}))/i);
        if (fechaEmisionMatch) {
            if (fechaEmisionMatch[1]) fecha = `${fechaEmisionMatch[1]}/${fechaEmisionMatch[2]}/${fechaEmisionMatch[3]}`;
            else if (fechaEmisionMatch[4]) fecha = `${fechaEmisionMatch[6]}/${fechaEmisionMatch[5]}/${fechaEmisionMatch[4]}`;
        }
    }

    // 3. Soporte para fechas con nombres de mes (ej: 25 mar 2026 o 25 marzo 2026)
    if (!fecha) {
        const meses = { 
            'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06', 
            'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
            'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
            'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
        };
        const fechaTextoMatch = text.match(/(\d{1,2})\s+([a-z]{3,12})\s*[\/ \.]+\s*(\d{4})/i);
        if (fechaTextoMatch) {
            const d = fechaTextoMatch[1].padStart(2, '0');
            const m = meses[fechaTextoMatch[2].toLowerCase().substring(0, 3)];
            const y = fechaTextoMatch[3];
            if (m) fecha = `${d}/${m}/${y}`;
        }
    }

    // Fallback: Generic Date Search
    if (!fecha) {
        const dMatch = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/) || text.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
        if (dMatch) {
            fecha = dMatch[1].length === 4 ? `${dMatch[3]}/${dMatch[2]}/${dMatch[1]}` : `${dMatch[1]}/${dMatch[2]}/${dMatch[3]}`;
        }
    }

    // Fallback Final: De la Clave de Acceso
    if (!fecha && clave.length === 49) {
        console.log("SRI Asistente: Extrayendo fecha de la clave de acceso...");
        const d = clave.substring(0, 2);
        const m = clave.substring(2, 4);
        const y = clave.substring(4, 8);
        fecha = `${d}/${m}/${y}`;
    }

    // Try to find email
    // Búsqueda de email más precisa
    let email = get(/(?:DIR\.\s*EMAIL|Correo\s*electr[óo]nico|Email).*?[:\s]+([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
    if (!email) email = get(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);

    // RUC/CI (Identificación Receptor)
    let ruc = '';
    const rucEmisor = clave.length === 49 ? clave.substring(10, 23) : '';
    const rucMatches = text.match(/\b\d{10,13}\b/g) || [];
    
    // Filter out the emisor's RUC and duplicates
    const candidates = rucMatches.filter(r => r !== rucEmisor);
    
    if (candidates.length > 0) {
        // Usually the first non-emisor RUC that appears later in the document is the receiver
        ruc = candidates[0]; 
    } else {
        // Fallback to original regex if no filtered candidates
        ruc = (text.match(/(?:RUC|Identificaci[óo]n|CI|R\.U\.C).*?(\d{10,13})/) || [])[1] || '';
    }

    // --- NÚMERO DE AUTORIZACIÓN ---
    // En comprobantes electrónicos SRI, el número de autorización es exactamente la clave de acceso de 49 dígitos.
    // Jamás debe asignarse el RUC del emisor (13 dígitos).
    let auth = (clave && clave.length === 49) ? clave : '';
    if (!auth) {
        const authMatch = text.match(/(?:N[ÚU]MERO\s*(?:DE)?\s*AUTORIZACI[ÓO]N)[\s\S]*?(\d{37,49})/i);
        if (authMatch) auth = authMatch[1];
    }
    if (!auth && clave) auth = clave;


    // Extract Sequential (Invoice Number)
    let facturaDisplay = '';
    if (clave.length === 49) {
        const estab = clave.substring(24, 27);
        const pto = clave.substring(27, 30);
        const seq = clave.substring(30, 39);
        facturaDisplay = `${estab}-${pto}-${seq}`;
    }

    // Extract Client Name (Razon Social)
    let cliente = '';
    if (ruc === '9999999999999' || ruc === '9999999999') {
        cliente = 'CONSUMIDOR FINAL';
    } else {
        const patterns = [
            /(?:Razón Social|Nombres y Apellidos|Cliente|Señor\(es\))[\s\:\.\-]+([^\n\r:;]+?)(?=\s+(?:RUC|Identificaci|Fecha|Direcci|Dir\.|Obligado|Guía|$))/i,
            /(?:Razón Social|Nombres y Apellidos)[\s\:\.\-]+([^\n\r:;]+)/i
        ];
        for (const p of patterns) {
            const m = text.match(p);
            if (m && m[1] && m[1].trim().length > 2) {
                cliente = m[1].trim().replace(/^[:\-\.]+\s*/, '');
                break;
            }
        }
    }
    if (!cliente) cliente = 'Nombre no detectado';

    // Extract Total Amount (Valor Final)
    let total = '0.00';
    try {
        const specificMatch = text.match(/(?:VALOR TOTAL|IMPORTE TOTAL|TOTAL(?: A PAGAR)?|Total)[\s\S]{0,50}?(\d{1,5}[\.,]\d{2})/i);
        if (specificMatch) {
            total = specificMatch[1].replace(',', '.');
        } else {
            const valMatch = text.match(/Total.*?\$?\s*([\d,]+\.\d{2})/i);
            if (valMatch) total = valMatch[1].replace(',', '.');
        }
    } catch (e) { console.warn("Extraction error total", e); }

    return {
        isValid: !!(clave && clave.length === 49),
        tipoComprobante: tipo,
        fecha,
        claveAcceso: clave,
        numAutorizacion: auth,
        idReceptor: ruc,
        razonSocial: cliente,
        cliente: cliente,
        email,
        facturaDisplay,
        total: total || '0.00',
        importeTotal: total || '0.00'
    };
}

function renderResults(data) {
    const list = document.getElementById('result-list');
    if (!list) return;
    list.innerHTML = '';
    list.style.display = 'block';

    let invoiceHtml = data.facturaDisplay || 'Comprobante';
    if (data.facturaDisplay && data.facturaDisplay.includes('-')) {
        const parts = data.facturaDisplay.split('-');
        if (parts.length === 3) {
            const seq = parts[2];
            const prefix = `${parts[0]}-${parts[1]}-`;
            const mainSeq = seq.substring(0, Math.max(0, seq.length - 4));
            const last4 = seq.substring(Math.max(0, seq.length - 4));

            invoiceHtml = `
                <span style="opacity:0.75">${prefix}${mainSeq}</span><span style="color:#fbbf24; font-size:1.15em; font-weight:900;">${last4}</span>
            `;
        }
    }

    const card = document.createElement('div');
    card.style.cssText = `
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(245, 158, 11, 0.25);
        border-radius: 14px; padding: 14px 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        display: flex; flex-direction: column; gap: 10px;
        color: #f8fafc; text-align: left;
    `;

    const rowInvoice = `
        <div style="border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px;">
            <div style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:2px;">Comprobante</div>
            <div style="font-size:18px; font-weight:800; color:#f8fafc; font-family:'Consolas', monospace;">${invoiceHtml}</div>
        </div>
    `;

    const clientName = data.razonSocial || data.cliente || (data.idReceptor === '9999999999999' ? 'CONSUMIDOR FINAL' : 'Nombre no detectado');
    const isClientMissing = !clientName || clientName.includes('no detectado');
    const clientColor = isClientMissing ? '#f59e0b' : '#f8fafc';
    const clientText = isClientMissing ? 'Nombre no detectado (Verificar PDF)' : clientName;
    const finalTotal = data.total || data.importeTotal || '0.00';

    const rowDetails = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1; overflow:hidden; padding-right:8px;">
                <div style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Cliente</div>
                <div style="font-size:11px; font-weight:600; color:${clientColor}; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${clientText}">${clientText}</div>
            </div>
            <div style="text-align:right; flex-shrink:0;">
                <div style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Total</div>
                <div style="font-size:14px; font-weight:800; color:#34d399;">$ ${finalTotal}</div>
            </div>
        </div>
    `;

    // Análisis Tributario de Plazos y Emisor
    const compliance = SriTaxCompliance.validarPlazoLegalAnulacion(data.fecha, data.idReceptor);
    const emisorCheck = SriTaxCompliance.validarEmisorRuc(data.claveAcceso);

    let statusAlertHtml = '';
    if (!emisorCheck.coincide) {
        statusAlertHtml = `
            <div style="background:rgba(239, 68, 68, 0.15); border:1px solid rgba(239, 68, 68, 0.35); border-radius:8px; padding:6px 10px; font-size:10px; color:#fca5a5; line-height:1.3;">
                ⚠️ <b>Emisor difiere:</b> Factura de <code>${emisorCheck.rucEmisor}</code> vs Cuenta SRI <code>${emisorCheck.rucSesion}</code>. El SRI la rechazará si no coincide.
            </div>
        `;
    } else if (compliance.esConsumidorFinal) {
        statusAlertHtml = `
            <div style="background:rgba(245, 158, 11, 0.15); border:1px solid rgba(245, 158, 11, 0.35); border-radius:8px; padding:6px 10px; font-size:10px; color:#fde68a; line-height:1.3;">
                ⚠️ <b>Consumidor Final:</b> El SRI prohíbe anulación de comprobantes a Consumidor Final autorizados.
            </div>
        `;
    } else if (compliance.plazoVencido) {
        statusAlertHtml = `
            <div style="background:rgba(245, 158, 11, 0.15); border:1px solid rgba(245, 158, 11, 0.35); border-radius:8px; padding:6px 10px; font-size:10px; color:#fde68a; line-height:1.3;">
                ⚠️ <b>Plazo vencido:</b> Excedió el día 7 (${compliance.fechaLimiteStr}). Requiere <b>Nota de Crédito</b> electrónica (plazo 12 meses).
            </div>
        `;
    }

    card.innerHTML = rowInvoice + rowDetails + statusAlertHtml;
    list.appendChild(card);
}

// ========== AUTO FILL (Inject Script for Date) ==========
async function fillForm(data) {
    if (!data) return;

    // Mapeo específico de valores para el select del SRI (según inspección del usuario)
    const sriSelectMap = {
        'FACTURA': '1',
        'LIQUIDACIÓN DE COMPRA': '2',
        'NOTA DE CRÉDITO': '3',
        'NOTA DE DÉBITO': '4',
        'GUÍA DE REMISIÓN': '5',
        'COMPROBANTE DE RETENCIÓN': '6'
    };

    const set = async (k, v) => {
        if (!v || v === 'click') return;
        const kSearch = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const labels = Array.from(document.querySelectorAll('label'));
        let input = null;

        // 1. Prioridad: Buscar por ID exacto si el usuario nos lo dio o por patrones conocidos
        const knownIds = [
            'frmPrincipal:cmbTipoComprobante',
            'frmPrincipal:calendarFechaAutorizacion_input',
            'frmPrincipal:itxtClaveAcceso',
            'frmPrincipal:itxtNoAutorizacion',
            'frmPrincipal:itxtIdentificacion',
            'frmPrincipal:itxtCorreoElectronico'
        ];
        
        for (const id of knownIds) {
            if (id.toLowerCase().includes(kSearch)) {
                input = document.getElementById(id);
                if (input) break;
            }
        }

        // 2. Buscar por etiquetas (Label matching)
        if (!input) {
            for (const lbl of labels) {
                const txt = lbl.innerText.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (txt === kSearch || txt.includes(kSearch)) {
                    const forId = lbl.getAttribute('for');
                    if (forId) input = document.getElementById(forId);
                    if (!input || !['INPUT', 'SELECT', 'TEXTAREA'].includes(input.tagName)) {
                        input = lbl.querySelector('input, select, textarea') || 
                                lbl.parentElement.querySelector('input, select, textarea');
                    }
                    if (input) break;
                }
            }
        }

        // 3. Fallback definitivo: Buscar por ID o Name que contenga la clave
        if (!input) {
            input = Array.from(document.querySelectorAll('input, select, textarea')).find(el => {
                const id = (el.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const name = (el.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                return id.includes(kSearch) || name.includes(kSearch);
            });
        }

        if (input) {
            // Protección: nunca tocar ni sobrescribir botones
            if (input.type === 'submit' || input.type === 'button') return;

            console.log(`SRI Asistente: Llenando ${k} con [${v}] en ID: ${input.id}`);
            highlight(input);
            
            input.focus();
            await new Promise(r => setTimeout(r, 60));

            if (input.tagName === 'SELECT') {
                const options = Array.from(input.options);
                const mappedValue = sriSelectMap[v.toUpperCase()] || v;
                const opt = options.find(o => 
                    o.value === mappedValue || 
                    o.text.toUpperCase().includes(v.toUpperCase())
                );
                if (opt) input.value = opt.value;
            } else {
                input.value = v.trim();
            }

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Re-asegurar el valor antes de perder el foco
            if (input.tagName !== 'SELECT') input.value = v.trim();
            
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            await new Promise(r => setTimeout(r, 200));
        }
    };

    // Llenar campos en secuencia usando los IDs mapeados
    await set('tipoComprobante', data.tipoComprobante);
    await set('fechaAutorizacion', data.fecha);
    await set('claveAcceso', data.claveAcceso);
    // REGLA OBLIGATORIA: En No. Autorización va exactamente la misma Clave de Acceso de 49 dígitos
    const authAsegurada = (data.claveAcceso && data.claveAcceso.length === 49) ? data.claveAcceso : (data.numAutorizacion || data.claveAcceso);
    await set('noAutorizacion', authAsegurada);
    await set('Identificacion', data.idReceptor);
    await set('CorreoElectronico', data.email);
    
    console.log("SRI Asistente: Llenado de campos completado.");
    await new Promise(r => setTimeout(r, 400));
}

function highlight(el) {
    if (!el) return;
    el.style.backgroundColor = '#dcfce7'; // faint green
    setTimeout(() => el.style.backgroundColor = '', 2000);
}
