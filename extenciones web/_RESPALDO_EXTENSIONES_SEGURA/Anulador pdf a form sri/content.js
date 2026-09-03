/*
 * SRI Llenador - Anulación de Comprobantes
 * Desarrollado por: SOLUCIONES TRIBUTARIAS ESTRATÉGICAS
 * Autor: Santiago Córdova
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
        console.error("SRI Asistente Error: No se pudo cargar pdf.mjs", e);
    }
})();

// --- BYPASS SRI CONFIRMATION POPUPS (MAIN WORLD) ---
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

// ========== OBSERVER & INJECTION ==========
function initObserver() {
    const checkAndInject = () => {
        if (!window.location.href.includes('/anulacion/')) {
            const w = document.getElementById('sri-upload-widget');
            if (w) w.remove();
            return;
        }

        const menuLink = findMenuLink("Solicitud de anulación comprobantes");
        const hasFormFields = document.querySelector('input[type="text"]');

        // 1. MENU PAGE LOGIC (Auto-Nav)
        if (menuLink && !hasFormFields) {
            chrome.storage.local.get(['sri_auto_nav', 'sri_active_batch', 'sri_batch_queue'], (result) => {
                const auth = result.sri_auto_nav;
                const isAuth = auth && auth.target === 'solicitud_anulacion' && (Date.now() - auth.timestamp) < 60000;
                const isBatchActive = result.sri_active_batch && result.sri_batch_queue && result.sri_batch_queue.length > 0;

                if (isAuth || isBatchActive) {
                    if (isAuth) chrome.storage.local.remove('sri_auto_nav');

                    if (!document.getElementById('sri-nav-loader')) {
                        const loader = document.createElement('div');
                        loader.id = 'sri-nav-loader';
                        loader.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.92);z-index:999999;display:flex;justify-content:center;align-items:center;flex-direction:column;font-family:sans-serif;`;
                        loader.innerHTML = `<div style="font-size:45px;">🚀</div><div style="margin-top:15px;color:#2563eb;font-weight:bold;font-size:16px;">Entrando a Solicitud de Anulación...</div>`;
                        document.body.appendChild(loader);

                        setTimeout(() => { if (loader && loader.parentNode) loader.parentNode.removeChild(loader); }, 3000);
                    }

                    setTimeout(() => {
                        try { menuLink.click(); } catch(e){}
                    }, 400);
                }
            });
        }

        // 2. FORM / CONFIRM PAGE LOGIC
        const isAnulacionForm = hasFormFields || document.getElementById('frmPrincipal:btnEnviar') || document.querySelector('.ui-messages-error-summary');
        if (isAnulacionForm) {
            if (!document.getElementById('sri-upload-widget')) {
                createUploadWidget();
            } else {
                updateSRIUserInfo();
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

function updateSRIUserInfo() {
    const userDisplay = document.getElementById('sri-user-display');
    if (!userDisplay) return;

    const nameEl = document.getElementById('id_nombre_razon_social') || 
                   document.querySelector('.sri-nombre-usuario') || 
                   document.querySelector('span[id*="nombre_razon_social"]');
    
    if (nameEl && nameEl.innerText.trim()) {
        const clientName = nameEl.innerText.trim();
        userDisplay.innerHTML = `👤 <b>${clientName}</b>`;
        userDisplay.title = `Contribuyente SRI Activo: ${clientName}`;
    } else {
        userDisplay.innerHTML = `👤 SRI: Sesión Activa`;
    }
}

// ========== WIDGET ==========
function createUploadWidget() {
    if (document.getElementById('sri-upload-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'sri-upload-widget';
    widget.innerHTML = `
        <style>
            .sri-widget-container {
                position: fixed; bottom: 30px; right: 30px; width: 300px;
                background: rgba(255, 255, 255, 0.95); 
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.6);
                z-index: 999999; font-family: 'Segoe UI', system-ui, sans-serif;
                overflow: hidden; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                border: 1px solid rgba(255,255,255,0.4);
            }
            
            .widget-header {
                background: linear-gradient(135deg, rgba(37,99,235,0.95) 0%, rgba(29,78,216,0.95) 100%);
                padding: 14px 18px; color: white; display: flex; justify-content: space-between; align-items: center;
                box-shadow: 0 4px 12px rgba(37,99,235,0.2);
            }
            .widget-title { font-weight: 700; font-size: 14px; letter-spacing: 0.5px; }
            .widget-close { cursor: pointer; font-size: 20px; opacity: 0.8; transition: transform 0.2s; }
            .widget-close:hover { opacity: 1; transform: scale(1.1); }

            .drop-zone {
                padding: 18px 15px; text-align: center; border: 2px dashed rgba(203, 213, 225, 0.8);
                margin: 15px; border-radius: 16px; cursor: pointer; 
                background: rgba(248, 250, 252, 0.5);
                transition: all 0.3s;
            }
            .drop-zone:hover { border-color: #2563eb; background: rgba(239, 246, 255, 0.8); }
            .drop-icon { font-size: 32px; display: block; margin-bottom: 8px; }
            .drop-text { font-size: 13px; color: #475569; font-weight: 600; }
            
            .result-list { padding: 0 15px 15px; display: none; max-height: 280px; overflow-y: auto; }
            .status-msg { margin: 0 15px 15px; padding: 10px; border-radius: 10px; font-size: 12px; font-weight: 600; display: none; text-align: center; }
            .status-msg.success { background: rgba(220, 252, 231, 0.9); color: #14532d; border: 1px solid #bbf7d0; }
            .status-msg.error { background: rgba(254, 226, 226, 0.9); color: #7f1d1d; border: 1px solid #fecaca; }

            .action-bar { padding: 0 15px 15px; display: none; text-align: center; }
            .btn-process {
                width: 100%; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
                color: white; border: none; padding: 12px; border-radius: 12px;
                font-weight: 600; font-size: 13px; cursor: pointer;
                box-shadow: 0 4px 15px rgba(37,99,235,0.3); transition: all 0.2s;
                display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .btn-process:hover { transform: translateY(-1px); }
            .btn-cancel { 
                margin-top: 8px; font-size: 11px; color: #ef4444; font-weight: bold; background: none; border: none; cursor: pointer; text-decoration: underline; 
            }
        </style>
        
        <div class="sri-widget-container" id="sri-widget-box">
            <div class="widget-header">
                <div>
                    <div class="widget-title">SRI Asistente Premium</div>
                    <div id="sri-user-display" style="font-size:10px; opacity:0.95; margin-top:2px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:210px;">👤 SRI: Sesión Activa</div>
                </div>
                <div class="widget-close" id="widget-close">×</div>
            </div>
            
            <div id="drop-zone" class="drop-zone">
                <span class="drop-icon">📄</span>
                <span id="drop-text" class="drop-text">Suelta aquí tus PDFs (Lote)</span>
                <input type="file" id="widget-file-input" accept="application/pdf" style="display:none" multiple>
            </div>
            
            <div id="status-msg" class="status-msg"></div>
            <div id="result-list" class="result-list"></div>
            
            <div id="action-bar" class="action-bar">
                <button id="btn-process" class="btn-process" data-state="idle">
                    🚀 Procesar Archivo Extraído
                </button>
                <button id="btn-cancel" class="btn-cancel">Cancelar Lote</button>
            </div>
        </div>
    `;

    document.body.appendChild(widget);
    updateSRIUserInfo();

    const box = document.getElementById('sri-widget-box');
    const closeBtn = document.getElementById('widget-close');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('widget-file-input');
    const processBtn = document.getElementById('btn-process');
    const cancelBtn = document.getElementById('btn-cancel');

    closeBtn.addEventListener('click', () => box.remove());
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleMultipleFiles(e.target.files);
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#2563eb'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = '#cbd5e1'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#cbd5e1';
        if (e.dataTransfer.files.length) handleMultipleFiles(e.dataTransfer.files);
    });

    processBtn.addEventListener('click', () => {
        chrome.storage.local.get(['sri_batch_queue'], (res) => {
            const queue = res.sri_batch_queue || [];
            if (queue.length > 0) {
                chrome.storage.local.set({ sri_active_batch: true }, () => {
                    startProcessingItem(queue[0]);
                });
            }
        });
    });

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            chrome.storage.local.set({ sri_active_batch: false, sri_batch_queue: [], sri_batch_results: [] }, () => {
                setButtonState('idle', 'Lote Cancelado');
                resetWidgetUI();
            });
        });
    }
}

let isStepInProgress = false;
let lastHandledClave = '';

async function startProcessingItem(data) {
    if (!data || isStepInProgress) return;
    
    // --- PASO 2: Confirmación Final (Botón Enviar) ---
    const btnEnviar = document.getElementById('frmPrincipal:btnEnviar');
    if (btnEnviar) {
        isStepInProgress = true;
        console.log("SRI Asistente: Pantalla de confirmación detectada. Clic en Enviar...");
        setButtonState('verifying', '<span>🚀</span> Enviando solicitud...');
        
        const originalOnClick = btnEnviar.getAttribute('onclick') || '';
        if (originalOnClick.includes('confirm')) {
            const cleanOnClick = originalOnClick.replace(/if\(!confirm\(.*?\)\)return false;/, '/* bypassed */');
            btnEnviar.setAttribute('onclick', cleanOnClick);
        }
        setTimeout(() => {
            btnEnviar.click();
        }, 600);
        return;
    }

    // --- PASO 1: Llenado de Formulario Inicial ---
    const formInput = document.getElementById('frmPrincipal:itxtClaveAcceso');
    if (formInput) {
        const val = (formInput.value || '').trim();
        if (val !== data.claveAcceso) {
            isStepInProgress = true;
            setButtonState('processing', `<span>⚙️</span> Llenando campos...`);
            await fillForm(data);
            isStepInProgress = false;
        }
    }
}

// --- AUTO-PILOT LOGIC (Bucle de Lote Autónomo) ---
async function runAutoPilot() {
    chrome.storage.local.get(['sri_active_batch', 'sri_batch_queue', 'sri_batch_results', 'sri_batch_total'], async (res) => {
        if (!res.sri_active_batch) return;
        const queue = res.sri_batch_queue || [];
        const results = res.sri_batch_results || [];
        const total = res.sri_batch_total || (queue.length + results.length);

        if (queue.length === 0) {
            chrome.storage.local.set({ sri_active_batch: false }, () => {
                setButtonState('success', '<span>✅</span> Lote completado');
                showFinalReport();
            });
            return;
        }

        const currentItem = queue[0];
        const bodyText = document.body.innerText || '';

        // 1. DETECTAR ÉXITO DE ANULACIÓN EN PÁGINA
        const isSuccess = bodyText.includes('enviada con éxito') || bodyText.includes('estado ANULADO');
        if (isSuccess && lastHandledClave !== currentItem.claveAcceso) {
            console.log("SRI Asistente: Éxito detectado para la factura!", currentItem.fileName || currentItem.claveAcceso);
            lastHandledClave = currentItem.claveAcceso;
            isStepInProgress = false;

            results.push({
                item: currentItem,
                status: 'success',
                message: 'Anulado con éxito',
                clave: currentItem.claveAcceso
            });

            const nextQueue = queue.slice(1);
            chrome.storage.local.set({
                sri_batch_queue: nextQueue,
                sri_batch_results: results
            }, () => {
                if (nextQueue.length > 0) {
                    setButtonState('processing', `<span>⏳</span> Avanzando (${nextQueue.length} restantes)...`);
                    renderBatchProgress(nextQueue[0], total - nextQueue.length + 1, total);
                    setTimeout(() => {
                        startProcessingItem(nextQueue[0]);
                    }, 800);
                } else {
                    chrome.storage.local.set({ sri_active_batch: false }, () => {
                        setButtonState('success', '<span>✨</span> ¡Lote Completado!');
                        showFinalReport();
                    });
                }
            });
            return;
        }

        // 2. DETECTAR ERROR O NO AUTORIZADO EN PÁGINA
        const errorElem = document.querySelector('.ui-messages-error-summary, .ui-messages-fatal-summary');
        const isError = !isSuccess && (
            bodyText.includes('no corresponde a un Comprobante Electrónico AUTORIZADO') ||
            bodyText.includes('vuelva a ingresar su solicitud') ||
            !!(errorElem && errorElem.innerText.trim())
        );

        if (isError && lastHandledClave !== currentItem.claveAcceso) {
            const errorMsg = errorElem ? errorElem.innerText.trim() : 'Comprobante no autorizado o error de anulación';
            console.warn("SRI Asistente: Error detectado:", currentItem.fileName || currentItem.claveAcceso, errorMsg);
            
            lastHandledClave = currentItem.claveAcceso;
            isStepInProgress = false;

            results.push({
                item: currentItem,
                status: 'error',
                message: errorMsg,
                clave: currentItem.claveAcceso
            });

            const nextQueue = queue.slice(1);
            chrome.storage.local.set({
                sri_batch_queue: nextQueue,
                sri_batch_results: results
            }, () => {
                if (nextQueue.length > 0) {
                    setButtonState('error', `<span>⚠️</span> Error. Avanzando (${nextQueue.length} restantes)...`);
                    setTimeout(() => {
                        const btnAnterior = findButtonByText('Anterior') || document.querySelector('input[value="Anterior"]');
                        if (btnAnterior) {
                            btnAnterior.click();
                        } else {
                            window.location.href = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/solicitud/anulacion/menuAnulacion.jsf';
                        }
                    }, 1000);
                } else {
                    chrome.storage.local.set({ sri_active_batch: false }, () => {
                        setButtonState('success', '<span>✨</span> ¡Lote Completado!');
                        showFinalReport();
                    });
                }
            });
            return;
        }

        if (isStepInProgress) return;

        // 3. PASO 2: BOTÓN ENVIAR PRESENTES
        const btnEnviar = document.getElementById('frmPrincipal:btnEnviar');
        if (btnEnviar) {
            startProcessingItem(currentItem);
            return;
        }

        // 4. PASO 1: FORMULARIO INICIAL
        const btnSolicitar = document.getElementById('frmPrincipal:btnAceptar');
        const inputClave = document.getElementById('frmPrincipal:itxtClaveAcceso');

        if (btnSolicitar && inputClave && !btnEnviar) {
            renderBatchProgress(currentItem, total - queue.length + 1, total);
            startProcessingItem(currentItem);
        }
    });
}

if (window.sriBatchPoller) clearInterval(window.sriBatchPoller);
window.sriBatchPoller = setInterval(runAutoPilot, 1200);

function showFinalReport() {
    if (!document.getElementById('sri-upload-widget')) {
        createUploadWidget();
    }
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
            <h3 style="margin:0 0 10px 0; color:#1e293b; font-size: 15px;">📊 Resumen del Proceso</h3>
            <div style="display:flex; justify-content:space-around; margin-bottom:15px; font-size:12px;">
                <div style="background:#dcfce7; color:#166534; padding:5px 10px; border-radius:6px; font-weight:bold;">${successCount} ✅</div>
                <div style="background:#fee2e2; color:#991b1b; padding:5px 10px; border-radius:6px; font-weight:bold;">${errorCount} ❌</div>
                <div style="background:#f1f5f9; color:#475569; padding:5px 10px; border-radius:6px; font-weight:bold;">${skipCount} ⏭️</div>
            </div>
            <div style="text-align:left; max-height:200px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; padding:5px; margin-bottom:10px;">`;
            
        results.forEach(r => {
            const icon = r.status === 'success' ? '✅' : (r.status === 'error' ? '❌' : '⏭️');
            const name = (r.item && r.item.fileName) ? r.item.fileName : ((r.item && r.item.claveAcceso) ? r.item.claveAcceso.substring(24,39) : 'Comprobante');
            html += `<div style="padding:6px; border-bottom:1px solid #f1f5f9; font-size:11px; display:flex; gap:6px;">
                <div style="flex-shrink:0;">${icon}</div>
                <div>
                    <strong style="color:#0f172a;">${name}</strong><br/>
                    <span style="color:${r.status === 'error' ? '#991b1b' : '#64748b'}; font-weight:${r.status === 'error' ? '600' : 'normal'}">${r.message}</span>
                </div>
            </div>`;
        });
        
        const btnAnterior = findButtonByText('Anterior') || document.querySelector('input[value="Anterior"]');
        html += `</div>`;
        if (btnAnterior) {
            html += `<button id="btn-back-form" style="width:100%; margin-bottom:8px; padding:8px; background:#2563eb; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:12px;">◀️ Volver al Formulario (Anterior)</button>`;
        }
        html += `<button id="btn-close-report" style="width:100%; padding:10px; background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size: 13px; transition: 0.2s;">✨ Finalizar y Limpiar Tablero</button>
        </div>`;
        
        resultList.innerHTML = html;
        resultList.style.display = 'block';

        const btnBack = document.getElementById('btn-back-form');
        if (btnBack) {
            btnBack.addEventListener('click', () => {
                const btnAnt = findButtonByText('Anterior') || document.querySelector('input[value="Anterior"]');
                if (btnAnt) btnAnt.click();
                else window.location.href = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/solicitud/anulacion/menuAnulacion.jsf';
            });
        }
        
        document.getElementById('btn-close-report').addEventListener('click', () => {
            chrome.storage.local.set({ sri_active_batch: false, sri_batch_queue: [], sri_batch_results: [] }, resetWidgetUI);
        });
    });
}

function setButtonState(state, text, bgColor = null) {
    const btn = document.getElementById('btn-process');
    if (!btn) return;

    btn.setAttribute('data-state', state);
    btn.innerHTML = text;
    btn.classList.remove('disabled');
    btn.style.background = '';

    if (bgColor) {
        btn.style.background = bgColor;
    } else if (state === 'error') {
        btn.style.background = '#64748b';
    } else if (state === 'idle') {
        btn.style.background = 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)';
    }
}

function resetWidgetUI() {
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) dropZone.style.display = 'block';
    const resultList = document.getElementById('result-list');
    if (resultList) resultList.style.display = 'none';
    const actionBar = document.getElementById('action-bar');
    if (actionBar) actionBar.style.display = 'none';
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) statusMsg.style.display = 'none';

    setButtonState('idle', '<span>▶️</span> Iniciar Proceso de Solicitud');
}

function findButtonByText(text) {
    const term = text.toLowerCase();
    const widget = document.getElementById('sri-upload-widget');

    const elements = Array.from(document.querySelectorAll('button, a, span.ui-button-text'));
    const validElements = elements.filter(el => !widget || !widget.contains(el));
    let target = validElements.find(el => el.innerText && el.innerText.toLowerCase().includes(term));

    if (!target) {
        const inputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]'));
        const validInputs = inputs.filter(el => !widget || !widget.contains(el));
        target = validInputs.find(i => i.value && i.value.toLowerCase().includes(term));
    }

    if (target) {
        return target.closest('button') || target.closest('a') || target;
    }
    return null;
}

function renderBatchProgress(data, currentIdx, totalCount) {
    const drop = document.getElementById('drop-zone');
    const msg = document.getElementById('status-msg');
    const actionBar = document.getElementById('action-bar');
    
    if (drop) drop.style.display = 'none';
    if (msg) {
        msg.innerHTML = `<span style="background:#2563eb; color:white; padding:2px 8px; border-radius:50px; font-size:11px; margin-right:8px;">Lote ${currentIdx}/${totalCount}</span>Procesando comprobante...`;
        msg.style.display = 'block';
        msg.className = 'status-msg success';
    }
    if (actionBar) actionBar.style.display = 'block';
    
    renderResults(data);
}

// ========== PDF & EXTRACTION ==========
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

function extractData(text) {
    const get = (re) => (text.match(re) || [])[1] || '';

    // --- CLAVE DE ACCESO ---
    let clave = get(/CLAVE\s*(?:DE\s+)?ACCESO[\s\S]*?(\d{49})/i);
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

    if (!tipo) {
        if (text.match(/FACTURA/i)) tipo = 'FACTURA';
        else if (text.match(/NOTA\s*DE\s*CR[ÉE]DITO/i)) tipo = 'NOTA DE CRÉDITO';
        else if (text.match(/COMPROBANTE\s*DE\s*RETENCI[ÓO]N/i)) tipo = 'COMPROBANTE DE RETENCIÓN';
    }

    // --- FECHAS ---
    let fecha = '';
    const fechaAutMatch = text.match(/(?:Fecha\s*(?:y\s*hora)?\s*(?:de)?\s*autorizaci[óo]n)[\s\S]*?(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    if (fechaAutMatch) fecha = fechaAutMatch[1];

    if (!fecha) {
        const fechaEmisionMatch = text.match(/Fecha\s*(?:de)?\s*Emisi[óo]n.*?(?:(\d{2})[\/\-](\d{2})[\/\-](\d{4})|(\d{4})[\/\-](\d{2})[\/\-](\d{2}))/i);
        if (fechaEmisionMatch) {
            if (fechaEmisionMatch[1]) fecha = `${fechaEmisionMatch[1]}/${fechaEmisionMatch[2]}/${fechaEmisionMatch[3]}`;
            else if (fechaEmisionMatch[4]) fecha = `${fechaEmisionMatch[6]}/${fechaEmisionMatch[5]}/${fechaEmisionMatch[4]}`;
        }
    }

    if (!fecha && clave.length === 49) {
        fecha = `${clave.substring(0, 2)}/${clave.substring(2, 4)}/${clave.substring(4, 8)}`;
    }

    let email = get(/(?:DIR\.\s*EMAIL|Correo\s*electr[óo]nico|Email).*?[:\s]+([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
    if (!email) email = get(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);

    const rucEmisor = clave.length === 49 ? clave.substring(10, 23) : '';
    let ruc = rucEmisor;

    let auth = get(/(?:N[ÚU]MERO\s*(?:DE)?\s*AUTORIZACI[ÓO]N)[\s\S]*?(\d{10,50})/i);
    if (auth && auth.length <= 13) auth = '';
    if (!auth) {
        const anyLongNum = text.match(/\b\d{37,49}\b/);
        if (anyLongNum) auth = anyLongNum[0];
    }
    if (!auth && clave) auth = clave;

    let facturaDisplay = '';
    if (clave.length === 49) {
        const estab = clave.substring(24, 27);
        const pto = clave.substring(27, 30);
        const seq = clave.substring(30, 39);
        facturaDisplay = `${estab}-${pto}-${seq}`;
    }

    let cliente = '';
    const patterns = [
        /(?:Razón Social|Nombres y Apellidos|Cliente|Señor\(es\)).*?:\s*(.*?)\s*(?:RUC|Identificaci|Fecha|Direcci|Dir\.|Obligado|Guía)/i,
        /(?:Razón Social|Nombres y Apellidos).*?\s+(.*?)\s+(?:RUC|Identificaci|Fecha|Direcci)/i
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m && m[1] && m[1].length > 3) { cliente = m[1].trim(); break; }
    }
    if (cliente) cliente = cliente.replace(/^[:\-\.]+\s*/, '').trim();

    let total = '0.00';
    try {
        const specificMatch = text.match(/(?:VALOR TOTAL|IMPORTE TOTAL|TOTAL(?: A PAGAR)?|Total)[\s\S]{0,50}?(\d{1,5}[\.,]\d{2})/i);
        if (specificMatch) total = specificMatch[1].replace(',', '.');
    } catch (e) {}

    return {
        isValid: !!(clave && clave.length === 49),
        tipoComprobante: tipo,
        fecha,
        claveAcceso: clave,
        numAutorizacion: clave,
        idReceptor: ruc,
        razonSocial: cliente || 'Nombre no detectado',
        email,
        facturaDisplay,
        importeTotal: total
    };
}

function renderResults(data) {
    const list = document.getElementById('result-list');
    if (!list) return;
    list.innerHTML = '';
    list.style.display = 'block';

    let invoiceHtml = data.facturaDisplay || data.claveAcceso.substring(24,39);
    const card = document.createElement('div');
    card.style.cssText = `
        background: white; border-radius: 12px; padding: 14px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.05);
        display: flex; flex-direction: column; gap: 8px;
    `;

    card.innerHTML = `
        <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Comprobante</div>
            <div style="font-size:18px; font-weight:800; color:#1e293b; font-family:'Consolas', monospace;">${invoiceHtml}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Cliente</div>
                <div style="font-size:11px; font-weight:600; color:#334155; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${data.razonSocial}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Total</div>
                <div style="font-size:12px; font-weight:700; color:#059669;">$ ${data.importeTotal}</div>
            </div>
        </div>
    `;
    list.appendChild(card);
}

// ========== AUTO FILL ==========
function fillForm(data) {
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
        let input = null;

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

        if (!input) {
            const labels = Array.from(document.querySelectorAll('label'));
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

        if (input) {
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
                    return;
                }
            }

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            if (input.tagName !== 'SELECT') input.value = v.trim();
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            await new Promise(r => setTimeout(r, 500));
        }
    };

    (async () => {
        await set('tipoComprobante', data.tipoComprobante);
        await set('fechaAutorizacion', data.fecha);
        await set('claveAcceso', data.claveAcceso);
        await set('noAutorizacion', data.numAutorizacion);
        await set('Identificacion', data.idReceptor);
        await set('CorreoElectronico', data.email);
        
        console.log("SRI Asistente: Llenado completo. Presionando Solicitar...");
        await new Promise(r => setTimeout(r, 800));
        await set('btnAceptar', 'click');
    })();
}

function highlight(el) {
    if (!el) return;
    el.style.backgroundColor = '#dcfce7';
    setTimeout(() => el.style.backgroundColor = '', 1500);
}
