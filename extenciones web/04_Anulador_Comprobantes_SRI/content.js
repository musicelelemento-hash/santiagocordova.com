/*
 * SRI Llenador - Anulación de Comprobantes
 * Desarrollado por: SOLUCIONES TRIBUTARIAS ESTRATÉGICAS
 */

console.log("SRI Asistente: Iniciado 🚀");

let pdfjsLib = null;

// ========== INICIALIZACIÓN ==========
(async () => {
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

function injectOperatingIndicator(statusMsg) {
    if (document.getElementById('sri-operating-indicator-root')) {
        const textEl = document.getElementById('sri-operating-text');
        if (textEl) textEl.textContent = statusMsg;
        return;
    }

    const indicator = document.createElement('div');
    indicator.id = 'sri-operating-indicator-root';
    indicator.style.cssText = `
        position: fixed;
        top: 15px;
        right: 25px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(239, 68, 68, 0.6);
        border-radius: 30px;
        padding: 10px 20px;
        z-index: 9999999;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 35px rgba(0,0,0,0.6), 0 0 20px rgba(239, 68, 68, 0.35);
        font-family: 'Inter', sans-serif;
        color: white;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
    `;

    indicator.innerHTML = `
        <style>
            @keyframes pulse-red-dot-anulador {
                0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.8); }
                70% { transform: scale(1.15); box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
                100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
            }
            .sri-pulse-red-dot-anulador {
                width: 12px;
                height: 12px;
                background-color: #ef4444;
                border-radius: 50%;
                animation: pulse-red-dot-anulador 1.2s infinite ease-in-out;
                display: inline-block;
                flex-shrink: 0;
            }
        </style>
        <span class="sri-pulse-red-dot-anulador"></span>
        <span id="sri-operating-text">${statusMsg}</span>
        <button id="btnHideSriOperating" style="background: rgba(255,255,255,0.1); border: none; color: #94a3b8; border-radius: 50%; width: 20px; height: 20px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 5px;">✕</button>
    `;

    document.body.appendChild(indicator);

    document.getElementById('btnHideSriOperating')?.addEventListener('click', () => {
        indicator.remove();
    });
}

async function handleSriLoginAutoFillAndFocus() {
    const isLoginPage = window.location.href.includes('auth/realms/Internet/protocol/openid-connect/auth') ||
        document.getElementById('kc-login') ||
        document.querySelector('form[action*="login"]') ||
        document.querySelector('#usuario');

    if (!isLoginPage) return;

    injectOperatingIndicator("🔴 OPERANDO EN VIVO · Pantalla de Credenciales SRI");

    const userInput = document.querySelector('#usuario') || 
                      document.querySelector('input[name="usuario"]') || 
                      document.querySelector('#username') || 
                      document.querySelector('input[type="text"]');

    const passInput = document.querySelector('#password') || 
                      document.querySelector('input[name="password"]') || 
                      document.querySelector('input[type="password"]');

    const loginForm = document.querySelector('#kc-form-login') || 
                      document.querySelector('#kc-login') || 
                      document.querySelector('form[action*="login"]') || 
                      userInput;

    if (loginForm && loginForm.scrollIntoView) {
        loginForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (userInput && userInput.scrollIntoView) {
        userInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['pending_sri_autofill', 'activeClient', 'ruc', 'sriPassword'], (items) => {
            let rucToFill = items.ruc || (items.activeClient && items.activeClient.ruc) || (items.pending_sri_autofill && items.pending_sri_autofill.ruc) || '';
            let passToFill = items.sriPassword || (items.activeClient && items.activeClient.sriPassword) || (items.pending_sri_autofill && (items.pending_sri_autofill.password || items.pending_sri_autofill.sriPassword)) || '';

            if (passToFill && passToFill.endsWith('*')) {
                passToFill = passToFill.slice(0, -1) + '@';
            }

            if (userInput && rucToFill && !userInput.value) {
                userInput.value = rucToFill;
                userInput.dispatchEvent(new Event('input', { bubbles: true }));
                userInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (passInput && passToFill && !passInput.value) {
                passInput.value = passToFill;
                passInput.dispatchEvent(new Event('input', { bubbles: true }));
                passInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            setTimeout(() => {
                if (passInput && passInput.value) {
                    passInput.focus();
                } else if (userInput) {
                    userInput.focus();
                }
            }, 400);
        });
    }
}

// Ejecutar autodetección de login
handleSriLoginAutoFillAndFocus();

function initObserver() {
    const checkAndInject = () => {
        if (isNavigating) return;

        const hasFormInput = document.getElementById('frmPrincipal:itxtClaveAcceso') || document.querySelector('input[id*="ClaveAcceso"]');
        const hasBtnAceptar = document.getElementById('frmPrincipal:btnAceptar');
        const hasBtnEnviar = document.getElementById('frmPrincipal:btnEnviar');
        const hasFormFields = !!(hasFormInput || hasBtnAceptar || hasBtnEnviar || document.querySelector('input[type="text"]'));

        const menuLink = findMenuLink();

        // 1. DATA RESTORE (Drop & Go Result)
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
                        fillForm(data);

                        const drop = document.getElementById('drop-zone');
                        const msg = document.getElementById('status-msg');
                        const ab = document.getElementById('action-bar');

                        if (drop) drop.style.display = 'none';
                        if (msg) { msg.textContent = "Datos listos. Presiona ▶️ para continuar."; msg.style.display = 'block'; msg.className = 'status-msg success'; }
                        if (ab) ab.style.display = 'block';
                    } catch (err) { console.error("Restore failed", err); }
                }, 800);
            }
        }

        // 2. AUTO-NAVIGATION LOGIC (Runs on Dashboard or Menu pages when form fields are NOT present)
        if (menuLink && !hasFormFields && !window.sriMenuClicked) {
            chrome.storage.local.get(['sri_auto_nav', 'sri_active_batch', 'sri_batch_queue'], (result) => {
                const queue = result.sri_batch_queue || [];
                const activeBatch = result.sri_active_batch && queue.length > 0;
                const auth = result.sri_auto_nav;
                const isAuth = auth && (Date.now() - auth.timestamp) < 120000;

                if ((isAuth || activeBatch) && !window.sriMenuClicked) {
                    window.sriMenuClicked = true;
                    isNavigating = true;

                    let toast = document.getElementById('sri-auto-nav-toast');
                    if (!toast) {
                        toast = document.createElement('div');
                        toast.id = 'sri-auto-nav-toast';
                        toast.style.cssText = `
                            position: fixed; top: 20px; right: 20px; z-index: 999999;
                            background: rgba(15, 23, 42, 0.92); backdrop-filter: blur(10px);
                            border: 1px solid rgba(59, 130, 246, 0.5); border-radius: 14px;
                            padding: 12px 20px; color: white; display: flex; align-items: center; gap: 12px;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-family: system-ui, sans-serif;
                            font-size: 13px; font-weight: 600; transition: all 0.3s ease;
                        `;
                        toast.innerHTML = `<span style="font-size:20px; animation: pulse 1s infinite;">🚀</span> <span>Abriendo Formulario SRI (${queue.length || 1} pendientes)...</span>`;
                        document.body.appendChild(toast);
                        
                        setTimeout(() => { if (toast) toast.remove(); }, 4000);
                    }

                    chrome.storage.local.remove('sri_auto_nav');
                    setTimeout(() => {
                        console.log("SRI Asistente: Haciendo clic automático en ->", menuLink);
                        try { menuLink.click(); } catch(e){}
                        setTimeout(() => { 
                            window.sriMenuClicked = false;
                            isNavigating = false; 
                        }, 2500);
                    }, 400);
                }

                const w = document.getElementById('sri-upload-widget');
                if (w && !activeBatch && !hasFormFields) w.remove();
            });
        }

        // 3. FORM PAGE LOGIC (Standard Widget Injection)
        if (hasFormFields && window.location.href.includes('/anulacion/')) {
            if (!document.getElementById('sri-upload-widget')) {
                createUploadWidget();
            }
        }
    };

    function findMenuLink() {
        // Prioridad 1: Enlace directo en menuAnulacion.jsf para entrar al formulario ("Solicitud de anulación comprobantes")
        const directFormLink = document.querySelector('a[onclick*="consultaDocumentoForm"]') ||
                               Array.from(document.querySelectorAll('a')).find(el => (el.innerText || '').toLowerCase().includes('solicitud de anulación comprobantes'));
        if (directFormLink) return directFormLink;

        // Prioridad 2: Enlaces del portal general SRI (dashboard / inicio)
        const terms = [
            "solicitud de anulación", 
            "anulación", 
            "facturacion-electronica", 
            "facturación electrónica",
            "comprobantes electrónicos"
        ];
        const links = Array.from(document.querySelectorAll('a, span.ui-menuitem-text, span[class*="sri-menu-icon"], span[class*="facturacion"], p.topbar-item-name'));
        for (const term of terms) {
            const found = links.find(el => {
                const txt = ((el.innerText || '') + ' ' + (el.className || '')).toLowerCase();
                return txt.includes(term);
            });
            if (found) return found.closest('a') || found.closest('button') || found;
        }
        return null;
    }

    checkAndInject();
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(checkAndInject, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ========== WIDGET ==========
const UI_STATE = { injected: false };

// --- BYPASS SRI CONFIRMATION POPUPS ---
// Content scripts run in an isolated world. To override window.confirm for the main page,
// we must inject a standard script tag directly into the DOM so it runs in the page context.
/* 
// Bloque deshabilitado temporalmente para evitar errores de CSP en el portal del SRI
const bypassScript = document.createElement('script');
bypassScript.textContent = `
    window.originalConfirm = window.confirm;
    window.confirm = function(msg) {
        console.log("SRI Asistente Turbo: Auto-aceptando popup ->", msg);
        return true; 
    };
`;
(document.head || document.documentElement).appendChild(bypassScript);
bypassScript.remove(); 
*/

function playSuccessChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(523.25, now);       // C5
        osc1.frequency.setValueAtTime(659.25, now + 0.1);  // E5
        osc1.frequency.setValueAtTime(783.99, now + 0.2);  // G5

        osc2.frequency.setValueAtTime(1046.50, now + 0.2); // C6

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.5);
        osc2.stop(now + 0.5);
    } catch(e) {}
}

function triggerConfetti() {
    try {
        let canvas = document.getElementById('sri-confetti-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'sri-confetti-canvas';
            canvas.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:99;';
            const box = document.getElementById('sri-widget-box');
            if (box) box.appendChild(canvas);
        }
        canvas.width = 330;
        canvas.height = 380;
        const ctx = canvas.getContext('2d');
        const particles = [];
        const colors = ['#38bdf8', '#4ade80', '#fbbf24', '#f472b6', '#a78bfa', '#60a5fa'];
        for (let i = 0; i < 45; i++) {
            particles.push({
                x: canvas.width / 2,
                y: 80,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.8) * 7,
                size: Math.random() * 5 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1
            });
        }
        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let alive = false;
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.22;
                p.alpha -= 0.02;
                if (p.alpha > 0) {
                    alive = true;
                    ctx.globalAlpha = p.alpha;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            if (alive) requestAnimationFrame(render);
            else ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        render();
    } catch(e){}
}

function updateProgressBar(step) {
    const s1 = document.getElementById('step-1');
    const s2 = document.getElementById('step-2');
    const s3 = document.getElementById('step-3');
    if (!s1 || !s2 || !s3) return;

    s1.className = 'timeline-step ' + (step === 1 ? 'active' : (step > 1 ? 'done' : ''));
    s2.className = 'timeline-step ' + (step === 2 ? 'active' : (step > 2 ? 'done' : ''));
    s3.className = 'timeline-step ' + (step === 3 ? 'active done' : '');
}

function createUploadWidget() {
    const widget = document.createElement('div');
    widget.id = 'sri-upload-widget';
    widget.innerHTML = `
        <style>
            .sri-widget-container {
                position: fixed; bottom: 25px; right: 25px; width: 330px;
                background: rgba(15, 23, 42, 0.94); 
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                border-radius: 20px;
                box-shadow: 0 30px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.1);
                z-index: 999999; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                overflow: hidden; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
                color: #f8fafc;
            }
            @keyframes slideUp { from { transform: translateY(120%) scale(0.9); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
            @keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7); } 70% { box-shadow: 0 0 0 8px rgba(56, 189, 248, 0); } 100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); } }
            @keyframes scanLine { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
            
            .widget-header {
                background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%);
                padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            .widget-title-box { display: flex; align-items: center; gap: 8px; }
            .widget-logo-badge {
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
                padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
                box-shadow: 0 2px 8px rgba(37,99,235,0.4); color: white;
            }
            .widget-title { font-weight: 700; font-size: 13px; color: #f8fafc; letter-spacing: 0.3px; }
            .widget-close { cursor: pointer; font-size: 18px; opacity: 0.6; transition: transform 0.2s, opacity 0.2s; color: #94a3b8; }
            .widget-close:hover { opacity: 1; transform: scale(1.1); color: #ef4444; }

            /* Step Timeline Bar */
            .sri-timeline {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 18px; background: rgba(30, 41, 59, 0.5);
                border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 10px; font-weight: 700;
            }
            .timeline-step { display: flex; align-items: center; gap: 4px; color: #64748b; transition: all 0.3s; }
            .timeline-step.active { color: #38bdf8; text-shadow: 0 0 10px rgba(56, 189, 248, 0.5); }
            .timeline-step.done { color: #4ade80; }
            .step-num {
                width: 16px; height: 16px; border-radius: 50%; background: rgba(255,255,255,0.1);
                display: flex; align-items: center; justify-content: center; font-size: 9px;
            }
            .timeline-step.active .step-num { background: #0284c7; color: white; animation: pulseGlow 1.5s infinite; }
            .timeline-step.done .step-num { background: #16a34a; color: white; }

            .drop-zone {
                padding: 22px 15px; text-align: center; border: 2px dashed rgba(59, 130, 246, 0.3);
                margin: 16px 18px; border-radius: 14px; cursor: pointer; 
                background: rgba(30, 41, 59, 0.4); transition: all 0.3s;
            }
            .drop-zone:hover { 
                border-color: #3b82f6; background: rgba(37, 99, 235, 0.12); transform: translateY(-2px);
            }
            .drop-icon { font-size: 32px; display: block; margin-bottom: 8px; filter: drop-shadow(0 4px 10px rgba(59,130,246,0.3)); }
            .drop-text { font-size: 13px; color: #cbd5e1; font-weight: 600; }
            
            .result-list { padding: 0 18px 16px; display: none; max-height: 280px; overflow-y: auto; }
            .result-list::-webkit-scrollbar { width: 5px; }
            .result-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
            
            .status-msg { margin: 0 18px 16px; padding: 10px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; display: none; text-align: center; }
            .status-msg.success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }
            .status-msg.error { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(252, 165, 165, 0.3); }

            .action-bar { padding: 0 18px 18px; display: none; text-align: center; }
            .btn-process {
                width: 100%; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                color: white; border: none; padding: 11px; border-radius: 10px;
                font-weight: 700; font-size: 13px; cursor: pointer;
                box-shadow: 0 4px 15px rgba(37,99,235,0.4); transition: all 0.25s ease;
                display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .btn-process:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(37,99,235,0.5); }
            .btn-process.disabled { opacity: 0.6; cursor: wait; transform: none; }
            .btn-cancel { 
                margin-top: 8px; font-size: 11px; color: #94a3b8; font-weight: bold; background: none; border: none; cursor: pointer; text-decoration: underline; display: none;
            }
            .btn-cancel:hover { color: #f87171; }
            .current-file { font-size: 11px; color: #94a3b8; font-weight: bold; margin-bottom: 8px; display: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 10px; }
        </style>
        
        <div class="sri-widget-container" id="sri-widget-box">
            <div class="widget-header">
                <div class="widget-title-box">
                    <span class="widget-logo-badge">SC PRO</span>
                    <span class="widget-title">SRI Anulador HUD</span>
                </div>
                <div class="widget-close" id="widget-close">×</div>
            </div>

            <!-- Visual 3-Step Timeline -->
            <div class="sri-timeline">
                <div class="timeline-step" id="step-1"><span class="step-num">1</span> Llenado</div>
                <div style="color:rgba(255,255,255,0.2);">➔</div>
                <div class="timeline-step" id="step-2"><span class="step-num">2</span> Enviar</div>
                <div style="color:rgba(255,255,255,0.2);">➔</div>
                <div class="timeline-step" id="step-3"><span class="step-num">3</span> Anulado</div>
            </div>
            
            <div id="drop-zone" class="drop-zone">
                <span class="drop-icon">📄</span>
                <span id="drop-text" class="drop-text">Suelta aquí tus PDFs (Lote)</span>
                <input type="file" id="widget-file-input" accept="application/pdf" style="display:none" multiple>
            </div>
            
            <div id="status-msg" class="status-msg"></div>
            <div id="current-file" class="current-file"></div>
            <div id="result-list" class="result-list"></div>
            
            <div id="action-bar" class="action-bar">
                <button id="btn-process" class="btn-process" data-state="idle">
                    🚀 Procesar Archivo Extraído
                </button>
                <button id="btn-cancel" class="btn-cancel">Cancelar Lote</button>
                <button id="btn-skip" style="display:none; width:100%; margin-top:8px; background:transparent; border:1px dashed rgba(255,255,255,0.2); color:#94a3b8; padding:7px; border-radius:8px; cursor:pointer; font-weight:600; font-size:11px; transition:all 0.2s;">
                    ⏭️ Saltar Factura (Test Mode)
                </button>
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

    // Auto-Process Logic
    // Batch Logic Execution
    processBtn.addEventListener('click', async () => {
        const currentState = processBtn.getAttribute('data-state');

        // IF IN BATCH MODE: Handle progression
        chrome.storage.local.get(['sri_batch_queue'], async (res) => {
            const queue = res.sri_batch_queue || [];
            if (queue.length > 0) {
                startProcessingItem(queue[0]);
                return;
            }
            
            // Legacy/Single mode fallback
            if (currentState === 'error' || currentState === 'success') {
                resetWidgetUI();
                return;
            }
        });
    });

    // New Batch Helper
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
                if (data.isValid) batch.push(data);
            } catch (err) { console.error("Error batch extracting", err); }
        }

        if (batch.length > 0) {
            const activeProfile = getActiveSriProfile();
            let mismatchItem = null;

            for (const item of batch) {
                const rucEmisor = extractRucEmisor(item);
                if (activeProfile.ruc && rucEmisor && activeProfile.ruc !== rucEmisor) {
                    mismatchItem = { rucEmisor, profileRuc: activeProfile.ruc, profileName: activeProfile.name };
                    break;
                }
            }

            if (mismatchItem) {
                const statusMsg = document.getElementById('status-msg');
                if (statusMsg) {
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'status-msg error';
                    statusMsg.innerHTML = `
                        <div style="font-weight:800; font-size:11px; color:#fca5a5; margin-bottom:2px;">⚠️ ALERTA: RUC DIVERGENTE DETECTADO</div>
                        <div style="font-size:10px; color:#cbd5e1;">
                            Factura del RUC <strong>${mismatchItem.rucEmisor}</strong> no coincide con la cuenta SRI activa (<strong>${mismatchItem.profileName}</strong>).
                        </div>
                    `;
                }
            }

            chrome.storage.local.set({ 
                sri_batch_queue: batch,
                sri_batch_total: batch.length,
                sri_batch_results: [],
                sri_active_batch: true 
            }, () => {
                renderBatchProgress(batch[0], 1, batch.length);
                fillForm(batch[0]);
            });
        } else {
            setButtonState('error', '❌ No se detectaron facturas válidas');
        }
    }

    function saveResultAndContinue(status, message) {
        setButtonState('verifying', '<span>💾</span> Guardando resultado...');
        chrome.storage.local.get(['sri_batch_queue', 'sri_batch_results'], (res) => {
            const queue = res.sri_batch_queue || [];
            const results = res.sri_batch_results || [];
            
            if (queue.length > 0) {
                const currentItem = queue[0];
                results.push({
                    item: currentItem,
                    status: status,
                    message: message
                });
                
                const nextQueue = queue.slice(1);
                if (nextQueue.length > 0) {
                    chrome.storage.local.set({ sri_batch_queue: nextQueue, sri_batch_results: results }, () => {
                        setButtonState(status === 'success' ? 'success' : 'error', status === 'success' ? '✅ Avanzando...' : '⚠️ Avanzando...');
                        setTimeout(() => window.location.href = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/solicitud/anulacion/menuAnulacion.jsf', 1500);
                    });
                } else {
                    chrome.storage.local.set({ sri_batch_queue: [], sri_batch_results: results }, () => {
                        setButtonState('success', '✨ Lote Completado');
                        setTimeout(showFinalReport, 1000);
                    });
                }
            }
        });
    }

function bypassConfirmDialog() {
    try {
        const script = document.createElement('script');
        script.textContent = `
            try {
                window.originalConfirm = window.confirm;
                window.confirm = function(msg) {
                    console.log("SRI Asistente: Auto-aceptando confirmación SRI ->", msg);
                    return true;
                };
            } catch(e){}
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    } catch (e) { console.warn("Confirm bypass warning:", e); }
}

    let lastFilledClaveAcceso = '';
    let isSubmittingStep1 = false;
    let isSubmittingStep2 = false;

    function syncRecordToWebApp(record) {
        try {
            window.postMessage({
                type: 'SRI_CANCELLATION_SYNC',
                source: 'SRI_EXTENSION_PRO',
                data: record
            }, '*');
            console.log("SRI Asistente: Registro enviado a SantiagoCordova.com ->", record);
        } catch(e){}
    }

    function handleBatchItemError(doneItem, errorMsg) {
        chrome.storage.local.get(['sri_batch_queue', 'sri_batch_results', 'sri_cancellation_history'], (resRes) => {
            const queue = resRes.sri_batch_queue || [];
            const results = resRes.sri_batch_results || [];
            const history = resRes.sri_cancellation_history || [];

            const current = queue.shift() || doneItem;
            const cleanErrorMsg = (errorMsg && (errorMsg.includes('PERFIL DIVERGENTE') || errorMsg.includes('RUC NO COINCIDE')))
                ? errorMsg
                : ((errorMsg && errorMsg.includes('no corresponde')) 
                    ? 'NO ENVIADO: La información no corresponde a un comprobante AUTORIZADO (ya fue anulado previamente o es inválido en el SRI).'
                    : (errorMsg || 'El comprobante no es válido o ya fue anulado previamente.'));

            const record = {
                claveAcceso: current.claveAcceso,
                facturaDisplay: current.facturaDisplay || (current.claveAcceso ? current.claveAcceso.substring(24, 39) : 'N/A'),
                receptorRuc: current.idReceptor,
                receptorNombre: current.razonSocial || 'Cliente',
                receptorEmail: current.email,
                fecha: current.fecha,
                monto: current.importeTotal || '0.00',
                status: 'error',
                message: cleanErrorMsg,
                timestamp: new Date().toISOString()
            };

            results.push(record);
            history.push(record);

            syncRecordToWebApp(record);

            chrome.storage.local.set({ 
                sri_batch_queue: queue,
                sri_batch_results: results,
                sri_cancellation_history: history,
                sri_active_batch: queue.length > 0
            }, () => {
                isSubmittingStep1 = false;
                isSubmittingStep2 = false;
                if (queue.length > 0) {
                    setButtonState('error', `⚠️ Factura no autorizada. Avanzando...`);
                    setTimeout(() => {
                        window.location.href = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/solicitud/anulacion/menuAnulacion.jsf';
                    }, 1800);
                } else {
                    chrome.storage.local.set({ sri_active_batch: false });
                    showFinalReport();
                }
            });
        });
    }

function getActiveSriProfile() {
    let ruc = '';
    let name = '';

    const areaBlue = document.querySelector('.area-usuario-blue');
    if (areaBlue) {
        const spans = areaBlue.querySelectorAll('span');
        if (spans.length >= 1) {
            const possibleRuc = spans[0].innerText.trim();
            if (/^\d{13}$/.test(possibleRuc)) ruc = possibleRuc;
        }
        const nameElem = document.getElementById('id_nombre_razon_social') || (spans.length >= 2 ? spans[1] : null);
        if (nameElem) name = nameElem.innerText.trim();
    }

    if (!name) {
        const nameElem = document.getElementById('id_nombre_razon_social');
        if (nameElem) name = nameElem.innerText.trim();
    }

    if (!ruc) {
        const topbarUl = document.getElementById('topbar-menu_ul') || document.querySelector('.topbar');
        if (topbarUl) {
            const text = topbarUl.innerText || '';
            const match = text.match(/\b\d{13}\b/);
            if (match) ruc = match[0];
        }
    }

    const profile = { ruc: ruc ? ruc.replace(/\D/g, '') : '', name: name || 'Contribuyente' };
    if (profile.ruc) {
        chrome.storage.local.set({ sri_active_profile: profile });
    }
    return profile;
}

function extractRucEmisor(data) {
    if (!data) return null;
    if (data.claveAcceso && data.claveAcceso.length === 49) {
        return data.claveAcceso.substring(10, 23);
    }
    if (data.rucEmisor && data.rucEmisor.length === 13) {
        return data.rucEmisor;
    }
    return null;
}

function showProfileMismatchModal(emisorName, emisorRuc, profileName, profileRuc) {
    let modal = document.getElementById('sri-mismatch-modal-overlay');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sri-mismatch-modal-overlay';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(12px);
            z-index: 9999999; display: flex; align-items: center; justify-content: center;
            font-family: 'Segoe UI', system-ui, sans-serif; animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    modal.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.96); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 20px; width: 420px; padding: 24px; color: white; box-shadow: 0 25px 60px rgba(0,0,0,0.6); text-align: center;">
            <div style="font-size: 42px; margin-bottom: 8px;">🛑</div>
            <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 800; color: #fca5a5;">¡Alerta de Cuenta SRI Incorrecta!</h2>
            <p style="font-size: 13px; color: #cbd5e1; margin: 0 0 16px 0;">No se puede anular este comprobante porque no pertenece a la cuenta activa en el SRI.</p>
            
            <div style="background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; text-align: left; font-size: 12px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px;">
                <div>📄 Factura emitida por: <strong style="color: #38bdf8;">${emisorName || 'RUC ' + emisorRuc}</strong> <span style="font-size:11px; color:#94a3b8;">(${emisorRuc})</span></div>
                <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">👤 Perfil activo en el SRI: <strong style="color: #f43f5e;">${profileName}</strong> <span style="font-size:11px; color:#94a3b8;">(${profileRuc})</span></div>
            </div>

            <div style="font-size: 11px; color: #fca5a5; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px; border-radius: 10px; margin-bottom: 20px; font-weight: 600; line-height: 1.4;">
                ⚠️ Para anular esta factura, debes cambiar de cuenta e ingresar al portal del SRI con el RUC de <strong>${emisorName || emisorRuc}</strong>.
            </div>

            <div style="display: flex; gap: 10px;">
                <button id="btn-switch-sri-account" style="flex: 1; padding: 11px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; box-shadow: 0 4px 12px rgba(239,68,68,0.4);">
                    🚪 Cerrar Sesión SRI
                </button>
                <button id="btn-close-mismatch-modal" style="flex: 1; padding: 11px; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; border-radius: 10px; font-weight: 600; font-size: 12px; cursor: pointer;">
                    Entendido / Ocultar
                </button>
            </div>
        </div>
    `;

    document.getElementById('btn-switch-sri-account').onclick = () => {
        window.location.href = "https://srienlinea.sri.gob.ec/tuportal-internet/salir.jspa";
    };

    document.getElementById('btn-close-mismatch-modal').onclick = () => {
        modal.style.display = 'none';
    };
}

    async function startProcessingItem(data) {
        if (!data || !data.claveAcceso) return;

        // --- VALIDAR RUC EMISOR CONTRA PERFIL ACTIVO DEL SRI ---
        const activeProfile = getActiveSriProfile();
        const rucEmisor = extractRucEmisor(data);

        if (activeProfile.ruc && rucEmisor && activeProfile.ruc !== rucEmisor) {
            console.warn(`SRI Asistente: RUC Emisor (${rucEmisor}) no coincide con perfil activo SRI (${activeProfile.ruc} - ${activeProfile.name})`);
            const emisorName = data.razonSocialEmisor || data.emisorNombre || ('RUC ' + rucEmisor);
            showProfileMismatchModal(emisorName, rucEmisor, activeProfile.name, activeProfile.ruc);

            const msg = `⚠️ PERFIL DIVERGENTE: Factura emitida por ${emisorName} (${rucEmisor}), pero el portal SRI está en la cuenta de ${activeProfile.name} (${activeProfile.ruc}).`;
            if (!data._handledError) {
                data._handledError = true;
                handleBatchItemError(data, msg);
            }
            return;
        }

        const bodyText = document.body.innerText || '';
        const fatalSummary = document.querySelector('.ui-messages-fatal-summary');
        const infoSummary = document.querySelector('.ui-messages-info-summary');
        const errorSummary = document.querySelector('.ui-messages-error-summary');
        const summaryText = (fatalSummary ? fatalSummary.innerText : '') + ' ' + 
                            (infoSummary ? infoSummary.innerText : '') + ' ' + 
                            (errorSummary ? errorSummary.innerText : '');

        // --- DETECTAR ERROR DEL SRI (ej: No autorizado o Ya anulado) ---
        const isError = errorSummary || 
                        bodyText.includes('no corresponde a un Comprobante Electrónico AUTORIZADO') || 
                        bodyText.includes('vuelva a ingresar su solicitud') ||
                        bodyText.includes('no se encuentra autorizado');

        if (isError) {
            const msgText = errorSummary ? errorSummary.innerText : 'La información ingresada no corresponde a un Comprobante Electrónico AUTORIZADO';
            console.log("SRI Asistente: Error detectado en portal SRI ->", msgText);
            if (!data._handledError) {
                data._handledError = true;
                handleBatchItemError(data, msgText);
            }
            return;
        }

        // --- PASO 3: Detectar Éxito ---
        const isSuccess = bodyText.includes('enviada con éxito') || 
                          bodyText.includes('estado ANULADO') || 
                          summaryText.includes('éxito') || 
                          summaryText.includes('ANULADO');

        if (isSuccess) {
            console.log("SRI Asistente: Éxito detectado en pantalla.");
            return;
        }

        // --- PASO 2: Confirmación Final (Bypass Modal Popup + Clic ÚNICO Enviar) ---
        const btnEnviar = document.getElementById('frmPrincipal:btnEnviar') || document.querySelector('input[value="Enviar"]');
        if (btnEnviar) {
            if (isSubmittingStep2) return;

            console.log("SRI Asistente: Pantalla de confirmación detectada. Auto-enviando...");
            isSubmittingStep2 = true;
            bypassConfirmDialog();
            
            btnEnviar.setAttribute('onclick', 'RichFaces.ajax("frmPrincipal:btnEnviar",event,{"incId":"1"});return false;');
            setButtonState('verifying', '<span>🚀</span> Enviando solicitud final...');
            
            setTimeout(() => {
                try { btnEnviar.click(); } catch(e){}
                setTimeout(() => { isSubmittingStep2 = false; }, 4000);
            }, 300);
            return;
        }

        // --- PASO 1: Llenado de Formulario y Solicitud ---
        const formInput = document.getElementById('frmPrincipal:itxtClaveAcceso') || document.querySelector('input[id*="ClaveAcceso"]');
        const btnSolicitar = document.getElementById('frmPrincipal:btnAceptar') || document.querySelector('input[value="Solicitar"]');

        if (formInput) {
            if (isSubmittingStep1) return;

            if (formInput.value !== data.claveAcceso && lastFilledClaveAcceso !== data.claveAcceso) {
                setButtonState('processing', '<span>⚙️</span> Llenando campos...');
                await fillForm(data);
                lastFilledClaveAcceso = data.claveAcceso;
            }
            
            if (btnSolicitar) {
                isSubmittingStep1 = true;
                console.log("SRI Asistente: Formulario completo. Haciendo clic en 'Solicitar'...");
                setButtonState('verifying', '<span>⏳</span> Solicitando anulación...');
                
                setTimeout(() => {
                    try { btnSolicitar.click(); } catch(e){}
                    setTimeout(() => { isSubmittingStep1 = false; }, 4000);
                }, 500);
            }
        }
    }

    // --- AUTO-PILOT LOGIC ---
    async function runAutoPilot() {
        chrome.storage.local.get(['sri_active_batch', 'sri_batch_queue'], async (res) => {
            if (!res.sri_active_batch) return;
            const queue = res.sri_batch_queue || [];
            if (queue.length === 0) {
                chrome.storage.local.set({ sri_active_batch: false });
                setButtonState('success', '<span>✅</span> Lote completado');
                return;
            }

            const bodyText = document.body.innerText || '';
            const fatalSummary = document.querySelector('.ui-messages-fatal-summary');
            const infoSummary = document.querySelector('.ui-messages-info-summary');
            const errorSummary = document.querySelector('.ui-messages-error-summary');
            const summaryText = (fatalSummary ? fatalSummary.innerText : '') + ' ' + 
                                (infoSummary ? infoSummary.innerText : '') + ' ' +
                                (errorSummary ? errorSummary.innerText : '');

            // 0. Validar si RUC Emisor coincide con sesión activa SRI
            const activeProfile = getActiveSriProfile();
            const rucEmisor = extractRucEmisor(queue[0]);

            if (activeProfile.ruc && rucEmisor && activeProfile.ruc !== rucEmisor) {
                const msg = `⚠️ PERFIL DIVERGENTE: Factura emitida por RUC ${rucEmisor}, pero la cuenta SRI activa pertenece a ${activeProfile.name} (${activeProfile.ruc}). Inicia sesión con la cuenta del emisor para anular.`;
                handleBatchItemError(queue[0], msg);
                return;
            }

            // 1. Detectar Error de comprobante
            if (errorSummary || bodyText.includes('no corresponde a un Comprobante Electrónico AUTORIZADO')) {
                const msgText = errorSummary ? errorSummary.innerText : 'Comprobante no autorizado o ya procesado';
                handleBatchItemError(queue[0], msgText);
                return;
            }

            // 2. Detectar Éxito
            const isSuccess = bodyText.includes('enviada con éxito') || 
                              bodyText.includes('estado ANULADO') || 
                              summaryText.includes('éxito') || 
                              summaryText.includes('ANULADO');

            if (isSuccess) {
                console.log("SRI Asistente: ¡Éxito detectado! Guardando datos de la anulación para registro...");
                const doneItem = queue.shift(); 
                
                chrome.storage.local.get(['sri_batch_results', 'sri_cancellation_history'], (resRes) => {
                    const results = resRes.sri_batch_results || [];
                    const history = resRes.sri_cancellation_history || [];

                    const record = {
                        claveAcceso: doneItem.claveAcceso,
                        facturaDisplay: doneItem.facturaDisplay || (doneItem.claveAcceso ? doneItem.claveAcceso.substring(24, 39) : 'N/A'),
                        receptorRuc: doneItem.idReceptor,
                        receptorNombre: doneItem.razonSocial || 'Cliente',
                        receptorEmail: doneItem.email,
                        fecha: doneItem.fecha,
                        monto: doneItem.importeTotal || '0.00',
                        status: 'SUCCESS',
                        message: 'Anulada con éxito en portal SRI',
                        timestamp: new Date().toISOString()
                    };

                    results.push(record);
                    history.push(record);

                    syncRecordToWebApp(record);

                    chrome.storage.local.set({ 
                        sri_batch_queue: queue,
                        sri_batch_results: results,
                        sri_cancellation_history: history
                    }, () => {
                        isSubmittingStep1 = false;
                        isSubmittingStep2 = false;
                        if (queue.length > 0) {
                            setButtonState('success', `✅ Factura ${results.length} lista. Siguiente...`);
                            setTimeout(() => {
                                window.location.href = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/solicitud/anulacion/menuAnulacion.jsf';
                            }, 1200);
                        } else {
                            chrome.storage.local.set({ sri_active_batch: false });
                            showFinalReport();
                        }
                    });
                });
                return;
            }

            // 3. Ejecutar acción según página actual
            startProcessingItem(queue[0]);
        });
    }

    // Llamar al piloto automático e iniciar temporizador
    if (window.sriPoller) clearInterval(window.sriPoller);
    window.sriPoller = setInterval(runAutoPilot, 1500);
    setTimeout(runAutoPilot, 800);

    // 2. Click Solicitar
    processBtn.addEventListener('click', async () => {
        const state = processBtn.getAttribute('data-state');
        if (state === 'error' || state === 'success') {
            chrome.storage.local.set({ sri_active_batch: false, sri_batch_queue: [], sri_batch_results: [] }, resetWidgetUI);
            return;
        }

        chrome.storage.local.get(['sri_batch_queue'], (res) => {
            const queue = res.sri_batch_queue || [];
            if (queue.length > 0) startProcessingItem(queue[0]);
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

    // Handle Skip Logic
    const skipBtn = document.getElementById('btn-skip');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            saveResultAndContinue('skipped', 'Saltada manualmente por Test/Usuario');
        });
    }

    // Run status check immediately
    checkBatchStatus();
}

function exportResultsCSV(results) {
    let csv = "Clave de Acceso,Comprobante,RUC Cliente,Cliente,Fecha,Monto,Estado,Mensaje\n";
    results.forEach(r => {
        const item = r.item || {};
        csv += `"${item.claveAcceso || ''}","${item.facturaDisplay || ''}","${item.idReceptor || ''}","${item.razonSocial || ''}","${item.fecha || ''}","${item.importeTotal || '0.00'}","${r.status || ''}","${(r.message || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Acta_Anulaciones_SRI_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
}

function printOfficialActa(results) {
    const win = window.open('', '_blank');
    let rowsHtml = '';
    results.forEach((r, idx) => {
        const item = r.item || {};
        rowsHtml += `
            <tr style="border-bottom:1px solid #e2e8f0; font-size:12px;">
                <td style="padding:8px;">${idx + 1}</td>
                <td style="padding:8px; font-family:monospace;">${item.facturaDisplay || 'N/A'}</td>
                <td style="padding:8px;">${item.idReceptor || 'N/A'}</td>
                <td style="padding:8px;">${item.razonSocial || 'Cliente'}</td>
                <td style="padding:8px; font-family:monospace; font-size:10px;">${item.claveAcceso || 'N/A'}</td>
                <td style="padding:8px; font-weight:bold;">$ ${item.importeTotal || '0.00'}</td>
                <td style="padding:8px; font-weight:bold; color:${r.status === 'success' ? '#16a34a' : '#dc2626'};">${r.status === 'success' ? 'ANULADO' : 'ERROR'}</td>
            </tr>
        `;
    });

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Acta Oficial de Anulaciones SRI - Santiago Córdova PRO</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 30px; color: #0f172a; }
                .header { border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .title { font-size: 20px; font-weight: 800; color: #1e293b; }
                .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th { background: #f8fafc; text-align: left; padding: 10px 8px; font-size: 11px; color: #475569; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
                .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="title">SOLUCIONES TRIBUTARIAS ESTRATÉGICAS</div>
                    <div class="subtitle">Santiago Córdova - Acta Oficial de Registro de Anulaciones SRI</div>
                </div>
                <div style="text-align:right; font-size:12px; color:#64748b;">
                    Fecha: <strong>${new Date().toLocaleDateString()}</strong><br/>
                    Hora: <strong>${new Date().toLocaleTimeString()}</strong>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Comprobante</th>
                        <th>RUC / CI</th>
                        <th>Cliente</th>
                        <th>Clave de Acceso (49 Dítigos)</th>
                        <th>Total</th>
                        <th>Estado SRI</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="footer">
                Documento generado automáticamente por la Suite <strong>Santiago Córdova PRO</strong> - Portal SRI Ecuador
            </div>
            <script>window.onload = function() { window.print(); };</script>
        </body>
        </html>
    `);
    win.document.close();
}

function showFinalReport() {
    updateProgressBar(3);
    playSuccessChime();
    triggerConfetti();

    chrome.storage.local.get(['sri_batch_results'], (res) => {
        const rawResults = res.sri_batch_results || [];
        
        // Deduplicar resultados por Clave de Acceso para evitar duplicados acumulados
        const uniqueMap = new Map();
        rawResults.forEach(r => {
            const key = (r.item && r.item.claveAcceso) ? r.item.claveAcceso : (r.claveAcceso || JSON.stringify(r));
            uniqueMap.set(key, r);
        });
        const results = Array.from(uniqueMap.values());

        const dropZone = document.getElementById('drop-zone');
        const statusBar = document.getElementById('status-msg');
        const actionBar = document.getElementById('action-bar');
        const resultList = document.getElementById('result-list');
        
        if (dropZone) dropZone.style.display = 'none';
        if (statusBar) statusBar.style.display = 'none';
        if (actionBar) actionBar.style.display = 'none';
        
        const successCount = results.filter(r => (r.status || '').toLowerCase() === 'success').length;
        const errorCount = results.filter(r => (r.status || '').toLowerCase() === 'error').length;
        const skipCount = results.filter(r => (r.status || '').toLowerCase() === 'skipped').length;
        
        let html = `<div style="text-align:center; padding: 10px;">
            <h3 style="margin:0 0 10px 0; color:#f8fafc; font-size: 14px; font-weight:800;">✨ Resumen de Anulación Finalizado</h3>
            <div style="display:flex; justify-content:space-around; margin-bottom:15px; font-size:11px;">
                <div style="background:rgba(34, 197, 94, 0.2); color:#4ade80; border:1px solid rgba(74,222,128,0.3); padding:5px 10px; border-radius:8px; font-weight:bold;">${successCount} ✅ Anuladas</div>
                <div style="background:rgba(239, 68, 68, 0.2); color:#fca5a5; border:1px solid rgba(252,165,165,0.3); padding:5px 10px; border-radius:8px; font-weight:bold;">${errorCount} ❌ No Enviadas</div>
                <div style="background:rgba(255,255,255,0.08); color:#94a3b8; border:1px solid rgba(255,255,255,0.1); padding:5px 10px; border-radius:8px; font-weight:bold;">${skipCount} ⏭️ Saltadas</div>
            </div>
            <div style="text-align:left; max-height:180px; overflow-y:auto; border:1px solid rgba(255,255,255,0.1); background:rgba(15,23,42,0.6); border-radius:10px; padding:6px; margin-bottom:12px;">`;
            
        results.forEach(r => {
            const st = (r.status || '').toLowerCase();
            const icon = st === 'success' ? '✅' : (st === 'error' ? '❌' : '⏭️');
            const item = r.item || {};
            html += `<div style="padding:6px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:11px; display:flex; gap:8px; align-items:center;">
                <div style="flex-shrink:0; font-size:14px;">${icon}</div>
                <div style="overflow:hidden;">
                    <strong style="color:#f8fafc; font-size:12px;">${item.facturaDisplay || item.fileName || (item.claveAcceso ? item.claveAcceso.substring(24,39) : 'Comprobante')}</strong><br/>
                    <span style="color:${st === 'error' ? '#fca5a5' : '#94a3b8'}; font-size:10px; font-weight:${st === 'error' ? 'bold' : 'normal'};">${r.message}</span>
                </div>
            </div>`;
        });
        
        html += `</div>
            <div style="display:flex; gap:8px; margin-bottom:10px;">
                <button id="btn-export-csv" style="flex:1; padding:8px; background:rgba(30, 41, 59, 0.8); border:1px solid rgba(59,130,246,0.4); color:#60a5fa; border-radius:8px; cursor:pointer; font-weight:700; font-size:11px; transition:0.2s;">📊 Exportación CSV</button>
                <button id="btn-print-acta" style="flex:1; padding:8px; background:rgba(30, 41, 59, 0.8); border:1px solid rgba(74,222,128,0.4); color:#4ade80; border-radius:8px; cursor:pointer; font-weight:700; font-size:11px; transition:0.2s;">🖨️ Imprimir Acta</button>
            </div>
            <button id="btn-close-report" style="width:100%; padding:10px; background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size: 12px; box-shadow:0 4px 12px rgba(37,99,235,0.4); transition: 0.2s;">✨ Finalizar y Limpiar Tablero</button>
        </div>`;
        
        resultList.innerHTML = html;
        resultList.style.display = 'block';
        
        document.getElementById('btn-export-csv').addEventListener('click', () => exportResultsCSV(results));
        document.getElementById('btn-print-acta').addEventListener('click', () => printOfficialActa(results));

        document.getElementById('btn-close-report').addEventListener('click', () => {
            chrome.storage.local.set({ sri_active_batch: false, sri_batch_queue: [], sri_batch_results: [] }, resetWidgetUI);
        });
    });
}

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

function checkPendingPrompt() {
    chrome.storage.local.get(['sri_active_batch', 'sri_batch_queue'], (res) => {
        const queue = res.sri_batch_queue || [];
        const active = res.sri_active_batch;

        let noticeBox = document.getElementById('sri-pending-notice');

        if (!active && queue.length > 0) {
            const item = queue[0];
            const clientName = item.razonSocial || item.receptorNombre || item.cliente || 'Cliente';
            const facturaNum = item.facturaDisplay || item.fileName || (item.claveAcceso ? item.claveAcceso.substring(24, 39) : 'Comprobante');

            if (!noticeBox) {
                noticeBox = document.createElement('div');
                noticeBox.id = 'sri-pending-notice';
                noticeBox.style.cssText = `
                    background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(15px);
                    border: 1px solid rgba(59, 130, 246, 0.5); border-radius: 14px;
                    padding: 14px; margin: 15px 20px; color: white; text-align: left;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-family: system-ui, sans-serif;
                    animation: slideUp 0.4s ease;
                `;
                const drop = document.getElementById('drop-zone');
                if (drop && drop.parentNode) drop.parentNode.insertBefore(noticeBox, drop.nextSibling);
            }

            noticeBox.style.display = 'block';
            noticeBox.innerHTML = `
                <div style="font-size:10px; font-weight:800; color:#60a5fa; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">⚠️ Anulación Pendiente Detectada</div>
                <div style="font-size:13px; font-weight:700; color:#f8fafc; margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">👤 Cliente: <span style="color:#38bdf8;">${clientName}</span></div>
                <div style="font-size:11px; color:#cbd5e1; margin-bottom:12px;">📄 Comprobante: ${facturaNum}</div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button id="btn-resume-pending-action" style="width:100%; background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color:white; border:none; padding:10px; border-radius:10px; font-weight:700; font-size:12px; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.3); transition:all 0.2s;">
                        ▶️ Continuar Anulación (${clientName.length > 18 ? clientName.substring(0,18) + '...' : clientName})
                    </button>
                    <button id="btn-discard-pending-action" style="width:100%; background:transparent; border:1px solid rgba(255,255,255,0.2); color:#94a3b8; padding:7px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s;">
                        🗑️ Descartar Pendiente y Empezar Limpio
                    </button>
                </div>
            `;

            document.getElementById('btn-resume-pending-action').onclick = () => {
                noticeBox.style.display = 'none';
                chrome.storage.local.set({ sri_active_batch: true }, () => {
                    startProcessingItem(queue[0]);
                });
            };

            document.getElementById('btn-discard-pending-action').onclick = () => {
                noticeBox.style.display = 'none';
                chrome.storage.local.set({ sri_batch_queue: [], sri_active_batch: false, sri_batch_results: [] }, resetWidgetUI);
            };
        } else if (noticeBox) {
            noticeBox.style.display = 'none';
        }
    });
}

function highlight(elem) {
    if (!elem) return;
    try {
        const oldTransition = elem.style.transition;
        const oldBoxShadow = elem.style.boxShadow;
        const oldBorder = elem.style.borderColor;

        elem.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        elem.style.borderColor = '#38bdf8';
        elem.style.boxShadow = '0 0 18px rgba(56, 189, 248, 0.9), inset 0 0 10px rgba(56, 189, 248, 0.3)';
        elem.style.background = 'linear-gradient(90deg, #f0f9ff 0%, #e0f2fe 50%, #f0f9ff 100%)';

        setTimeout(() => {
            elem.style.borderColor = oldBorder || '';
            elem.style.boxShadow = oldBoxShadow || '';
            elem.style.background = '';
            elem.style.transition = oldTransition || '';
        }, 1200);
    } catch(e){}
}

// Batch Status Multi-Step logic
function checkBatchStatus() {
    checkPendingPrompt();

    chrome.storage.local.get(['sri_active_batch', 'sri_batch_queue', 'sri_batch_total'], (res) => {
        if (!res.sri_active_batch || !res.sri_batch_queue || res.sri_batch_queue.length === 0) return;

        const queue = res.sri_batch_queue;
        const total = res.sri_batch_total;
        const current = queue[0];
        const index = total - queue.length + 1;

        console.log(`SRI Asistente: Batch Status ${index}/${total}`);

        // 1. Detect Confirmation Page Step 2
        const btnEnviar = document.getElementById('frmPrincipal:btnEnviar');
        const bodyText = document.body.innerText;

        if (btnEnviar) {
            updateProgressBar(2);
            setButtonState('confirming', `🚀 Confirmar ${index}/${total}`);
            fillForm(current);
            setTimeout(() => {
                const processBtn = document.getElementById('btn-process');
                if (processBtn) processBtn.click();
            }, 1000); // Auto-fire!
            return;
        }

        // 2. Detect AJAX Success explicitly if page was reloaded by chance
        if (bodyText.includes('enviada con éxito')) {
            // Usually handled by poller, but just in case
        }

        // 3. Standard Form Start
        const btnSolicitar = document.getElementById('frmPrincipal:btnAceptar');
        if (btnSolicitar) {
            updateProgressBar(1);
            renderBatchProgress(current, index, total);
            fillForm(current);
            setButtonState('idle', `▶️ Lote en Progreso ${index}/${total}`);
            setTimeout(() => {
                const processBtn = document.getElementById('btn-process');
                if (processBtn) processBtn.click();
            }, 1000); // Auto-fire!
        }
    });
}

function renderBatchProgress(data, currentIdx, totalCount) {
    const drop = document.getElementById('drop-zone');
    const msg = document.getElementById('status-msg');
    const actionBar = document.getElementById('action-bar');
    
    if (drop) drop.style.display = 'none';
    if (msg) {
        msg.innerHTML = `<span style="background:#2563eb; color:white; padding:2px 8px; border-radius:50px; font-size:11px; margin-right:8px;">Lote ${currentIdx}/${totalCount}</span>Datos listos para procesar.`;
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
            fillForm(data);

            ui.drop.style.display = 'none';
            ui.msg.textContent = "Datos listos. Presiona ▶️ para continuar.";
            ui.msg.className = 'status-msg success';
            ui.msg.style.display = 'block';

            const actionBar = document.getElementById('action-bar');
            if (actionBar) actionBar.style.display = 'block';

            // Allow Auto-Run if configured (optional, not requested yet but good practice)
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

    // --- RUC / CI (IDENTIFICACIÓN RECEPTOR / COMPRADOR) ---
    const rucEmisor = clave.length === 49 ? clave.substring(10, 23) : '';
    let ruc = '';

    // 1. Prioridad 1: Buscar etiqueta directa de Identificación del Comprador/Receptor
    const directMatch = text.match(/(?:Identificaci[óo]n|RUC\s*\/\s*CI|RUC\s+Receptor|Identificaci[óo]n\s+Receptor|Comprador.*?Identificaci[óo]n)[:\s]+(\d{10,13})/i);
    if (directMatch && directMatch[1] && directMatch[1] !== rucEmisor && !directMatch[1].startsWith('001001') && !directMatch[1].startsWith('001002')) {
        ruc = directMatch[1];
    }

    // 2. Prioridad 2: Buscar dentro de la sección Razón Social / Nombres del Comprador
    if (!ruc) {
        const compradorSec = text.match(/(?:Raz[óo]n\s*Social|Nombres\s*y\s*Apellidos|Se[ñn]or\(es\)|Comprador)[\s\S]*?(?:RUC|Identificaci[óo]n|CI)[:\s]+(\d{10,13})/i);
        if (compradorSec && compradorSec[1] && compradorSec[1] !== rucEmisor) {
            ruc = compradorSec[1];
        }
    }

    // 3. Fallback inteligente: Filtrar todos los números de 10 u 13 dígitos excluyendo Emisor, secuencias 001-001 y claves
    if (!ruc) {
        const rucMatches = text.match(/\b\d{10,13}\b/g) || [];
        const candidates = rucMatches.filter(r => {
            if (r === rucEmisor) return false;
            if (clave && clave.includes(r)) return false;
            if (/^00[1-9]00[1-9]/.test(r)) return false; // Excluir 001001... (número de serie)
            if (r.length === 13 && !r.endsWith('001')) return false; // RUCs en Ecuador deben terminar en 001
            if (r.length === 10 && !/^(0[1-9]|1[0-9]|2[0-4]|30)/.test(r)) return false; // CIs ecuatorianas válidas
            return true;
        });
        if (candidates.length > 0) ruc = candidates[0];
    }

    // Fallback final si nada funcionó
    if (!ruc) {
        ruc = (text.match(/(?:RUC|Identificaci[óo]n|CI|R\.U\.C).*?(\d{10,13})/) || [])[1] || '';
    }

    // --- CORREO ELECTRÓNICO (RECEPTOR / INFORMACIÓN ADICIONAL) ---
    let email = '';

    // 1. Extraer cualquier email dentro del bloque "Información Adicional" (donde está el email del cliente/receptor)
    const infoAdicPos = text.search(/Informaci[óo]n\s*Adicional/i);
    if (infoAdicPos !== -1) {
        const sub = text.substring(infoAdicPos);
        const emailMatch = sub.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) email = emailMatch[1];
    }

    // 2. Si no hay bloque de Información Adicional, buscar después de Razón Social / Comprador
    if (!email) {
        const razonPos = text.search(/Raz[óo]n\s*Social|Comprador|Cliente/i);
        if (razonPos !== -1) {
            const sub = text.substring(razonPos);
            const emailMatch = sub.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch) email = emailMatch[1];
        }
    }

    // 3. Fallback: Si hay varios correos, el último del documento corresponde al Receptor
    if (!email) {
        const allEmails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        if (allEmails.length > 0) {
            email = allEmails[allEmails.length - 1];
        }
    }

    // --- NÚMERO DE AUTORIZACIÓN ---
    // Para comprobantes electrónicos en Ecuador, el Número de Autorización es SIEMPRE la Clave de Acceso de 49 dígitos
    let auth = '';
    if (clave && clave.length === 49) {
        auth = clave;
    } else {
        auth = get(/(?:N[ÚU]MERO\s*(?:DE)?\s*AUTORIZACI[ÓO]N)[\s\S]*?(\d{37,49})/i);
        if (!auth) {
            const anyLongNum = text.match(/\b\d{37,49}\b/);
            if (anyLongNum) auth = anyLongNum[0];
        }
    }

    // Extract Sequential (Invoice Number)
    let facturaDisplay = '';
    if (clave.length === 49) {
        const estab = clave.substring(24, 27);
        const pto = clave.substring(27, 30);
        const seq = clave.substring(30, 39);
        facturaDisplay = `${estab}-${pto}-${seq}`;
    }

    // Extract Client Name (Razon Social)
    // Algorithm:
    // 1. Look for explicit label "Razón Social / Nombres y Apellidos"
    // 2. Stop at common next field labels (RUC, Fecha, Dir, etc)
    let cliente = '';
    const patterns = [
        /(?:Razón Social|Nombres y Apellidos|Cliente|Señor\(es\)).*?:\s*(.*?)\s*(?:RUC|Identificaci|Fecha|Direcci|Dir\.|Obligado|Guía)/i,
        /(?:Razón Social|Nombres y Apellidos).*?\s+(.*?)\s+(?:RUC|Identificaci|Fecha|Direcci)/i
    ];

    for (const p of patterns) {
        const m = text.match(p);
        if (m && m[1] && m[1].length > 3) {
            cliente = m[1].trim();
            break;
        }
    }

    // Clean up client name (remove leading punctuations sometimes captured)
    if (cliente) {
        cliente = cliente.replace(/^[:\-\.]+\s*/, '').trim();
        // Fallback: if it captured too much (newlines converted to spaces), maybe truncate?
        // For now, trust the stop words.
    }

    // Extract Total Amount (Valor Final)
    let total = '0.00';
    try {
        const specificMatch = text.match(/(?:VALOR TOTAL|IMPORTE TOTAL|TOTAL(?: A PAGAR)?|Total)[\s\S]{0,50}?(\d{1,5}[\.,]\d{2})/i);
        if (specificMatch) {
            total = specificMatch[1].replace(',', '.');
        } else {
            const valMatch = text.match(/Total.*?\$?\s*([\d,]+\.\d{2})/i);
            if (valMatch) total = valMatch[1];
        }
    } catch (e) { console.warn("Extraction error total", e); }


    return {
        isValid: !!(clave && clave.length === 49),
        tipoComprobante: tipo,
        fecha,
        claveAcceso: clave,
        numAutorizacion: auth,
        idReceptor: ruc,
        razonSocial: cliente || 'Nombre no detectado',
        email,
        facturaDisplay,
        importeTotal: total
    };
}

function renderResults(data) {
    const list = document.getElementById('result-list');
    list.innerHTML = '';
    list.style.display = 'block';

    // PREMIUM MINIMALIST CARD (Refined)

    // 1. Format Invoice Number (Highlight Last 4)
    let invoiceHtml = data.facturaDisplay;
    if (data.facturaDisplay && data.facturaDisplay.includes('-')) {
        const parts = data.facturaDisplay.split('-'); // 001-001-123456789
        if (parts.length === 3) {
            const seq = parts[2];
            const prefix = `${parts[0]}-${parts[1]}-`;
            const mainSeq = seq.substring(0, seq.length - 4);
            const last4 = seq.substring(seq.length - 4);

            invoiceHtml = `
                <span style="opacity:0.7">${prefix}${mainSeq}</span><span style="color:#2563eb; font-size:1.2em; font-weight:900;">${last4}</span>
            `;
        }
    }

    const card = document.createElement('div');
    card.style.cssText = `
        background: white; border-radius: 12px; padding: 16px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.05);
        display: flex; flex-direction: column; gap: 12px;
    `;

    const rowInvoice = `
        <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Comprobante</div>
            <div style="font-size:20px; font-weight:800; color:#1e293b; font-family:'Consolas', monospace;">${invoiceHtml}</div>
        </div>
    `;

    // Only show Client Name and Amount.
    const isClientMissing = !data.razonSocial || data.razonSocial.includes('no detectado');
    const clientColor = isClientMissing ? '#f59e0b' : '#334155';
    const clientText = isClientMissing ? (data.receptorNombre || 'Verificar PDF') : data.razonSocial;
    const montoDisplay = (data.importeTotal && data.importeTotal !== 'undefined') ? data.importeTotal : (data.monto || '0.00');

    const rowDetails = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1;">
                <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Cliente</div>
                <div style="font-size:12px; font-weight:600; color:${clientColor}; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:180px;">${clientText}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Total</div>
                <div style="font-size:13px; font-weight:700; color:#059669;">$ ${montoDisplay}</div>
            </div>
        </div>
    `;

    card.innerHTML = rowInvoice + rowDetails;
    list.appendChild(card);
}

let isFillingForm = false;

// ========== AUTO FILL DE CAMPOS SRI ANULACIÓN ==========
async function fillForm(data) {
    if (!data) return;
    console.log("SRI Asistente: Llenando formulario de anulación para clave:", data.claveAcceso);

    const sriSelectMap = {
        'FACTURA': '1',
        'LIQUIDACIÓN DE COMPRA': '2',
        'LIQUIDACION DE COMPRA': '2',
        'NOTA DE CRÉDITO': '3',
        'NOTA DE CREDITO': '3',
        'NOTA DE DÉBITO': '4',
        'NOTA DE DEBITO': '4',
        'GUÍA DE REMISIÓN': '5',
        'GUIA DE REMISION': '5',
        'COMPROBANTE DE RETENCIÓN': '6',
        'COMPROBANTE DE RETENCION': '6'
    };

    // Helper para asignar valor y disparar eventos JSF de forma robusta
    const fillInput = async (elem, value) => {
        if (!elem || !value) return;
        highlight(elem);
        elem.focus();
        if (elem.tagName === 'SELECT') {
            const valToSet = sriSelectMap[value.toUpperCase()] || value;
            elem.value = valToSet;
            const options = Array.from(elem.options || []);
            const matchedOpt = options.find(o => o.value === valToSet || o.text.toUpperCase().includes(value.toUpperCase()));
            if (matchedOpt) elem.value = matchedOpt.value;
        } else {
            elem.value = value.trim();
        }
        elem.dispatchEvent(new Event('input', { bubbles: true }));
        elem.dispatchEvent(new Event('change', { bubbles: true }));
        elem.dispatchEvent(new Event('blur', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
    };

    try {
        // 1. TIPO DE COMPROBANTE (Select PrimeFaces)
        const selectTipo = document.getElementById('frmPrincipal:cmbTipoComprobante_input') ||
                           document.getElementById('frmPrincipal:cmbTipoComprobante') ||
                           document.querySelector('select[id*="TipoComprobante"]') ||
                           document.querySelector('select');
        await fillInput(selectTipo, data.tipoComprobante || 'FACTURA');

        // 2. FECHA DE AUTORIZACIÓN
        const inputFecha = document.getElementById('frmPrincipal:calendarFechaAutorizacion_input') ||
                            document.getElementById('frmPrincipal:calendarFechaAutorizacion') ||
                            document.querySelector('input[id*="FechaAutorizacion"]');
        await fillInput(inputFecha, data.fecha);

        // 3. CLAVE DE ACCESO
        const inputClave = document.getElementById('frmPrincipal:itxtClaveAcceso') ||
                            document.querySelector('input[id*="ClaveAcceso"]');
        await fillInput(inputClave, data.claveAcceso);

        // 4. NO. AUTORIZACIÓN
        const validAuthKey = (data.numAutorizacion && data.numAutorizacion.length >= 37) ? data.numAutorizacion : data.claveAcceso;
        const inputAuth = document.getElementById('frmPrincipal:itxtNoAutorizacion') ||
                           document.querySelector('input[id*="NoAutorizacion"]');
        await fillInput(inputAuth, validAuthKey);

        // 5. IDENTIFICACIÓN RECEPTOR
        const inputRuc = document.getElementById('frmPrincipal:itxtIdentificacion') ||
                          document.querySelector('input[id*="Identificacion"]');
        await fillInput(inputRuc, data.idReceptor);

        // 6. CORREO ELECTRÓNICO RECEPTOR
        const inputEmail = document.getElementById('frmPrincipal:itxtCorreoElectronico') ||
                           document.querySelector('input[id*="CorreoElectronico"]') ||
                           document.querySelector('input[id*="Correo"]');
        await fillInput(inputEmail, data.email);

        console.log("SRI Asistente: Llenado completo de campos del formulario SRI.");
    } catch (e) {
        console.error("SRI Asistente: Error al llenar formulario:", e);
    }
}

function highlight(el) {
    if (!el) return;
    el.style.backgroundColor = '#dcfce7'; // faint green
    setTimeout(() => el.style.backgroundColor = '', 2000);
}
