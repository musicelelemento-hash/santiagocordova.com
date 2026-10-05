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

// ========== OBSERVER & INJECTION ==========
function initObserver() {
    if (document.getElementById('sri-upload-widget')) return;

    const TARGET_PATH = "solicitud/anulacion/menuAnulacion.jsf";

    const checkAndInject = () => {
        // 1. SAFETY: Only allow widget on Anulacion workflow pages
        if (!window.location.href.includes('/anulacion/')) {
            const w = document.getElementById('sri-upload-widget');
            if (w) w.remove();
            return;
        }

        const menuLink = findMenuLink("Solicitud de anulación comprobantes");
        const hasFormFields = document.querySelector('input[type="text"]');

        // 2. DATA RESTORE (Drop & Go Result)
        if (hasFormFields) {
            const pending = sessionStorage.getItem('sri_pending_data');
            if (pending) {
                sessionStorage.removeItem('sri_pending_data');
                console.log("SRI Asistente: Restaurando datos pendientes...");

                // Ensure widget is ready before filling
                if (!document.getElementById('sri-upload-widget')) createUploadWidget();

                setTimeout(() => {
                    try {
                        const data = JSON.parse(pending);
                        renderResults(data);
                        fillForm(data);

                        // Update UI to "Ready" state
                        const drop = document.getElementById('drop-zone');
                        const msg = document.getElementById('status-msg');
                        const ab = document.getElementById('action-bar');

                        if (drop) drop.style.display = 'none';
                        if (msg) { msg.textContent = "Datos listos. Presiona ▶️ para continuar."; msg.style.display = 'block'; msg.className = 'status-msg success'; }
                        if (ab) ab.style.display = 'block';
                    } catch (err) { console.error("Restore failed", err); }
                }, 800); // Small delay to ensure DOM is interactive
            }
        }

        // 3. MENU PAGE LOGIC (Auto-Nav - Authorized Only)
        // User Request: "Enter the first option... and THERE ask for the pdf"
        if (menuLink && !hasFormFields) {
            chrome.storage.local.get(['sri_auto_nav'], (result) => {
                const auth = result.sri_auto_nav;
                const isAuth = auth && auth.target === 'solicitud_anulacion' && (Date.now() - auth.timestamp) < 60000;

                if (isAuth) {
                    // AUTHORIZED: Auto-Navigate
                    const loader = document.createElement('div');
                    loader.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);z-index:999999;display:flex;justify-content:center;align-items:center;flex-direction:column;`;
                    loader.innerHTML = `<div style="font-size:40px;">🚀</div><div style="margin-top:20px;font-family:sans-serif;color:#2563eb;font-weight:bold;">Entrando a Solicitud...</div>`;
                    document.body.appendChild(loader);

                    chrome.storage.local.remove('sri_auto_nav');
                    setTimeout(() => menuLink.click(), 500);
                }

                // Always ensure no widget on menu (unless we support Drop & Go, but user disabled it)
                const w = document.getElementById('sri-upload-widget');
                if (w) w.remove();
            });
        }

        // 4. FORM PAGE LOGIC (Standard Fill)
        if (hasFormFields) {
            if (!document.getElementById('sri-upload-widget')) {
                createUploadWidget();
            }
        }
    };

    function findMenuLink(text) {
        const links = Array.from(document.querySelectorAll('a, span.ui-menuitem-text'));
        return links.find(el => el.innerText && el.innerText.toLowerCase().includes(text.toLowerCase()));
    }

    checkAndInject();
    const observer = new MutationObserver(checkAndInject);
    observer.observe(document.body, { childList: true, subtree: true });
}

// ========== WIDGET ==========
const UI_STATE = { injected: false };

// --- BYPASS SRI CONFIRMATION POPUPS (MAIN WORLD) ---
// El bypass NO se inyecta como texto inline (lo bloquea la CSP del portal).
// Se carga como <script src> externo vía web_accessible_resources, que sí pasa
// la CSP, y sobreescribe window.confirm en el contexto de la página.
function injectMainWorldBypass() {
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
                position: fixed; bottom: 30px; right: 30px; width: 300px;
                background: rgba(255, 255, 255, 0.90); 
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.6);
                z-index: 999999; font-family: 'Segoe UI', system-ui, sans-serif;
                overflow: hidden; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1);
                border: 1px solid rgba(255,255,255,0.4);
            }
            @keyframes slideUp { from { transform: translateY(120%) scale(0.9); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
            
            .widget-header {
                background: linear-gradient(135deg, rgba(37,99,235,0.95) 0%, rgba(29,78,216,0.95) 100%);
                padding: 16px 20px; color: white; display: flex; justify-content: space-between; align-items: center;
                box-shadow: 0 4px 12px rgba(37,99,235,0.2);
            }
            .widget-title { font-weight: 700; font-size: 14px; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
            .widget-close { cursor: pointer; font-size: 20px; opacity: 0.8; transition: transform 0.2s; }
            .widget-close:hover { opacity: 1; transform: scale(1.1); }

            .drop-zone {
                padding: 20px 15px; text-align: center; border: 2px dashed rgba(203, 213, 225, 0.8);
                margin: 20px; border-radius: 16px; cursor: pointer; 
                background: rgba(248, 250, 252, 0.5);
                transition: all 0.3s;
            }
            .drop-zone:hover { 
                border-color: #2563eb; background: rgba(239, 246, 255, 0.8); transform: translateY(-2px);
            }
            .drop-icon { font-size: 36px; display: block; margin-bottom: 12px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
            .drop-text { font-size: 14px; color: #475569; font-weight: 600; }
            
            .result-list { padding: 0 20px 20px; display: none; max-height: 320px; overflow-y: auto; }
            /* Custom Scrollbar */
            .result-list::-webkit-scrollbar { width: 6px; }
            .result-list::-webkit-scrollbar-track { background: transparent; }
            .result-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
            
            .result-item { 
                display: flex; flex-direction: column; 
                padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.05);
                background: rgba(255,255,255,0.6); border-radius: 10px; margin-bottom: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            }
            .result-label { font-size: 10px; color: #64748b; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
            .result-row { display: flex; align-items: center; gap: 10px; }
            .result-value { 
                font-size: 13px; color: #1e293b; font-family: 'Consolas', monospace; 
                flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                background: rgba(255,255,255,0.8); padding: 6px 10px; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px;
            }
            .copy-btn {
                background: white; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px;
                cursor: pointer; font-size: 11px; color: #475569; font-weight: 700;
                transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            .copy-btn:hover { background: #f1f5f9; color: #0f172a; transform: translateY(-1px); }
            .copy-btn.copied { background: #dcfce7; color: #166534; border-color: #86efac; }

            .status-msg { margin: 0 20px 20px; padding: 12px; border-radius: 10px; font-size: 13px; font-weight: 500; display: none; text-align: center; }
            .status-msg.success { background: rgba(220, 252, 231, 0.9); color: #14532d; border: 1px solid #bbf7d0; }
            .status-msg.error { background: rgba(254, 226, 226, 0.9); color: #7f1d1d; border: 1px solid #fecaca; }

            /* Action Bar for Semi-Auto */
            .action-bar { padding: 0 20px 20px; display: none; text-align: center; }
            .btn-process {
                width: 100%; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
                color: white; border: none; padding: 12px; border-radius: 12px;
                font-weight: 600; font-size: 14px; cursor: pointer;
                box-shadow: 0 4px 15px rgba(37,99,235,0.3); transition: all 0.3s;
                display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .btn-process:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(37,99,235,0.4); }
            .btn-process.disabled { opacity: 0.6; cursor: wait; transform: none; }
            .btn-cancel { 
                margin-top: 10px; font-size: 11px; color: #94a3b8; font-weight: bold; background: none; border: none; cursor: pointer; text-decoration: underline; 
                display: none;
            }
            .btn-cancel:hover { color: #ef4444; }
            .current-file { font-size: 11px; color: #64748b; font-weight: bold; margin-bottom: 8px; display: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 10px; }

            /* Play Overlay */
            .play-overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(255, 255, 255, 0.6);
                backdrop-filter: blur(2px);
                z-index: 10;
                display: none;
                align-items: center; justify-content: center;
                flex-direction: column;
            }
            /* Minimalist Success Animation */
            .success-circle {
                width: 80px; height: 80px; border-radius: 50%; border: 4px solid #10b981;
                position: relative; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                display:flex; align-items:center; justify-content:center; background:white;
            }
            .checkmark {
                width: 40px; height: 20px; border-bottom: 5px solid #10b981; border-left: 5px solid #10b981;
                transform: rotate(-45deg) translate(2px, -2px); opacity: 0;
                animation: check 0.4s 0.4s ease forwards;
            }
            .play-overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(255, 255, 255, 0.85); /* Whiter, cleaner */
                backdrop-filter: blur(5px);
                z-index: 20; display: none;
                align-items: center; justify-content: center; flex-direction: column;
            }
            .play-text {
                margin-top: 20px; font-weight: 600; color: #0f172a; font-size: 16px; letter-spacing: -0.5px;
                animation: fadeIn 0.5s 0.2s forwards; opacity: 0;
            }
            
            @keyframes popIn { from { transform: scale(0); opacity:0; } to { transform: scale(1); opacity:1; } }
            @keyframes check { from { transform: rotate(-45deg) scale(0); opacity:0; } to { transform: rotate(-45deg) scale(1); opacity:1; } }
            @keyframes fadeIn { to { opacity: 1; } }
            @keyframes pulse { 0% { opacity:0.6; } 50% { opacity:1; } 100% { opacity:0.6; } }

            /* Highlight Class for Success Message Analysis */
            .sri-success-highlight { font-weight: bold; background-color: #dcfce7; padding: 0 4px; border-radius: 4px; border: 1px solid #10b981; }
        </style>
        
        <div class="sri-widget-container" id="sri-widget-box">
            <!-- Play Overlay -->
            <div class="play-overlay" id="play-overlay">
                <div class="play-icon">▶️</div>
                <div class="play-text">Procesando...</div>
            </div>

            <div class="widget-header">
                <div class="widget-title">SRI Asistente Premium</div>
                <div class="widget-close" id="widget-close">×</div>
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
                <button id="btn-skip" style="display:none; width:100%; margin-top:8px; background:transparent; border:1px dashed #cbd5e1; color:#475569; padding:8px; border-radius:8px; cursor:pointer; font-weight:600; font-size:12px; transition:all 0.2s;">
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
            chrome.storage.local.set({ 
                sri_batch_queue: batch,
                sri_batch_total: batch.length,
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

    async function startProcessingItem(data) {
        if (!data) return;
        setButtonState('processing', '<span>⚙️</span> Vinculando datos...');
        
        // --- PASO 2: Confirmación Final ---
        const btnEnviar = document.getElementById('frmPrincipal:btnEnviar');
        if (btnEnviar) {
            console.log("SRI Asistente: Pantalla de confirmación detectada.");
            // Hack para saltar el confirm() de RichFaces/JSF
            const originalOnClick = btnEnviar.getAttribute('onclick') || '';
            if (originalOnClick.includes('confirm')) {
                const cleanOnClick = originalOnClick.replace(/if\(!confirm\(.*?\)\)return false;/, '/* confirm bypassed */');
                btnEnviar.setAttribute('onclick', cleanOnClick);
            }
            setTimeout(() => {
                btnEnviar.click();
                setButtonState('verifying', '<span>👁️</span> Enviando solicitud...');
            }, 1000);
            return;
        }

        // --- PASO 1: Llenado de Formulario ---
        const formInput = document.getElementById('frmPrincipal:itxtClaveAcceso');
        if (formInput) {
            // Si el campo está vacío, llenamos. Si ya tiene datos, esperamos.
            if (!formInput.value) {
                await fillForm(data);
            } else {
                console.log("SRI Asistente: El formulario ya parece estar lleno.");
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

            const bodyText = document.body.innerText;
            
            // 1. Detectar Éxito
            if (bodyText.includes('enviada con éxito') || bodyText.includes('estado ANULADO')) {
                console.log("SRI Asistente: Éxito detectado. Pasando al siguiente...");
                const doneItem = queue.shift(); 
                
                chrome.storage.local.get(['sri_batch_results'], (resRes) => {
                    const results = resRes.sri_batch_results || [];
                    results.push({
                        clave: doneItem.claveAcceso,
                        status: 'SUCCESS',
                        msg: 'Anulado con éxito'
                    });
                    
                    chrome.storage.local.set({ 
                        sri_batch_queue: queue,
                        sri_batch_results: results
                    }, () => {
                        window.location.href = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/solicitud/anulacion/menuAnulacion.jsf';
                    });
                });
                return;
            }

            // 2. Ejecutar acción según página actual
            startProcessingItem(queue[0]);
        });
    }

    // Llamar al piloto automático al iniciar el widget
    setTimeout(runAutoPilot, 1500);

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

function showFinalReport() {
    chrome.storage.local.get(['sri_batch_results'], (res) => {
        const results = res.sri_batch_results || [];
        const dropZone = document.getElementById('drop-zone');
        const statusBar = document.getElementById('status-msg');
        const actionBar = document.getElementById('action-bar');
        const resultList = document.getElementById('result-list');
        
        if (dropZone) dropZone.style.display = 'none';
        if (statusBar) statusBar.style.display = 'none';
        if (actionBar) actionBar.style.display = 'none';
        
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        const skipCount = results.filter(r => r.status === 'skipped').length;
        
        let html = `<div style="text-align:center; padding: 10px;">
            <h3 style="margin:0 0 10px 0; color:#1e293b; font-size: 15px;">📊 Resumen del Lote</h3>
            <div style="display:flex; justify-content:space-around; margin-bottom:15px; font-size:12px;">
                <div style="background:#dcfce7; color:#166534; padding:5px 10px; border-radius:6px; font-weight:bold;">${successCount} ✅</div>
                <div style="background:#fee2e2; color:#991b1b; padding:5px 10px; border-radius:6px; font-weight:bold;">${errorCount} ❌</div>
                <div style="background:#f1f5f9; color:#475569; padding:5px 10px; border-radius:6px; font-weight:bold;">${skipCount} ⏭️</div>
            </div>
            <div style="text-align:left; max-height:220px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; padding:5px; margin-bottom:10px;">`;
            
        results.forEach(r => {
            const icon = r.status === 'success' ? '✅' : (r.status === 'error' ? '❌' : '⏭️');
            html += `<div style="padding:6px; border-bottom:1px solid #f1f5f9; font-size:11px; display:flex; gap:6px;">
                <div style="flex-shrink:0;">${icon}</div>
                <div>
                    <strong style="color:#0f172a;">${r.item.fileName || r.item.claveAcceso.substring(24,39)}</strong><br/>
                    <span style="color:${r.status === 'error' ? '#991b1b' : '#64748b'}; font-weight:${r.status === 'error' ? '600' : 'normal'}">${r.message}</span>
                </div>
            </div>`;
        });
        
        html += `</div>
            <button id="btn-close-report" style="width:100%; padding:10px; background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size: 13px; transition: 0.2s;">✨ Finalizar y Limpiar Tablero</button>
        </div>`;
        
        resultList.innerHTML = html;
        resultList.style.display = 'block';
        
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

// Batch Status Multi-Step logic
function checkBatchStatus() {
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
    let auth = get(/(?:N[ÚU]MERO\s*(?:DE)?\s*AUTORIZACI[ÓO]N)[\s\S]*?(\d{10,50})/i);
    
    // Fallback: Si no hay etiqueta, buscar el número más largo que parezca una autorización (37 o 49 dígitos)
    if (!auth) {
        const anyLongNum = text.match(/\b\d{37,49}\b/);
        if (anyLongNum) auth = anyLongNum[0];
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
    const clientText = isClientMissing ? 'Nombre no detectado (Verificar PDF)' : data.razonSocial;

    const rowDetails = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1;">
                <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Cliente</div>
                <div style="font-size:12px; font-weight:600; color:${clientColor}; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:180px;">${clientText}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Total</div>
                <div style="font-size:13px; font-weight:700; color:#059669;">$ ${data.importeTotal}</div>
            </div>
        </div>
    `;

    card.innerHTML = rowInvoice + rowDetails;
    list.appendChild(card);
}

// ========== AUTO FILL (Inject Script for Date) ==========
function fillForm(data) {
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
        if (!v) return;
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
            'frmPrincipal:itxtCorreoElectronico',
            'frmPrincipal:btnAceptar'
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
            console.log(`SRI Asistente: Llenando ${k} con [${v}] en ID: ${input.id}`);
            highlight(input);
            
            input.focus();
            await new Promise(r => setTimeout(r, 50));

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
                if (input.type === 'submit' || input.type === 'button') {
                    input.click();
                    return; // No disparar más eventos si es clic
                }
            }

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Re-asegurar el valor antes de perder el foco
            if (input.tagName !== 'SELECT') input.value = v.trim();
            
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            await new Promise(r => setTimeout(r, 600));
        }
    };

    // Llenar campos en secuencia usando los IDs mapeados
    (async () => {
        await set('tipoComprobante', data.tipoComprobante);
        await set('fechaAutorizacion', data.fecha);
        await set('claveAcceso', data.claveAcceso);
        await set('noAutorizacion', data.numAutorizacion);
        await set('Identificacion', data.idReceptor);
        await set('CorreoElectronico', data.email);
        
        // Finalizar: Clic en el botón Solicitar con pausa extra
        console.log("SRI Asistente: Llenado completo. Esperando estabilidad antes de Solicitar...");
        await new Promise(r => setTimeout(r, 1000));
        await set('btnAceptar', 'click');
    })();
}

function highlight(el) {
    if (!el) return;
    el.style.backgroundColor = '#dcfce7'; // faint green
    setTimeout(() => el.style.backgroundColor = '', 2000);
}
