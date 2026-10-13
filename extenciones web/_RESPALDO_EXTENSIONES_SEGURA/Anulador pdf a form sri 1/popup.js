/*
 * SRI Asistente Pro - Suite de Anulación
 * Soluciones Tributarias Estratégicas · Ing. Santiago Córdova
 */

import * as pdfjsLib from './libs/pdf.mjs';

const TARGET_PORTAL_URL = "https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=61&idGrupo=58";

// Motor de Verificación de Plazos Tributarios en Cola
const SriTaxCompliance = {
    validarPlazoLegalAnulacion(fechaEmisionStr, idReceptor = '') {
        const esConsumidorFinal = (idReceptor === '9999999999999' || idReceptor === '9999999999');
        if (!fechaEmisionStr || !fechaEmisionStr.includes('/')) {
            return { valido: true, plazoVencido: false, esConsumidorFinal, fechaLimiteStr: '' };
        }
        const [d, m, y] = fechaEmisionStr.split('/').map(Number);
        if (!d || !m || !y || isNaN(d) || isNaN(m) || isNaN(y)) {
            return { valido: true, plazoVencido: false, esConsumidorFinal, fechaLimiteStr: '' };
        }
        let mesVencimiento = m + 1;
        let anioVencimiento = y;
        if (mesVencimiento > 12) {
            mesVencimiento = 1;
            anioVencimiento += 1;
        }
        let fechaLimite = new Date(anioVencimiento, mesVencimiento - 1, 7, 23, 59, 59);
        const diaSemana = fechaLimite.getDay();
        if (diaSemana === 6) fechaLimite.setDate(fechaLimite.getDate() + 2);
        else if (diaSemana === 0) fechaLimite.setDate(fechaLimite.getDate() + 1);

        const ahora = new Date();
        const plazoVencido = ahora > fechaLimite;
        const diaStr = fechaLimite.getDate().toString().padStart(2, '0');
        const mesStr = (fechaLimite.getMonth() + 1).toString().padStart(2, '0');
        const fechaLimiteStr = `${diaStr}/${mesStr}/${fechaLimite.getFullYear()}`;

        return {
            valido: !plazoVencido && !esConsumidorFinal,
            plazoVencido,
            esConsumidorFinal,
            fechaLimiteStr
        };
    }
};

// Elementos de la interfaz
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-upload');
const statusDiv = document.getElementById('status');
const resumeBanner = document.getElementById('resume-banner');
const resumeText = document.getElementById('resume-text');
const btnResumeContinue = document.getElementById('btn-resume-continue');
const btnResumeDiscard = document.getElementById('btn-resume-discard');
const toggleAutopilot = document.getElementById('toggle-autopilot');
const btnExportCsv = document.getElementById('btn-export-csv');
const btnNavegar = document.getElementById('btn-navegar');
const btnProcessBatch = document.getElementById('btn-process-batch');
const clearQueueBtn = document.getElementById('btn-clear-queue');

let localBatchQueue = [];

// 1. CARGA INICIAL DE CONFIGURACIÓN Y ESTADO
chrome.storage.local.get(['sri_batch_queue', 'sri_autopilot_enabled'], (res) => {
    // Sincronizar switch de Piloto Automático (por defecto true)
    if (toggleAutopilot) {
        toggleAutopilot.checked = res.sri_autopilot_enabled !== false;
    }

    // Comprobar lote previo pendiente
    if (res.sri_batch_queue && res.sri_batch_queue.length > 0) {
        localBatchQueue = res.sri_batch_queue;
        renderQueue();

        if (resumeBanner && resumeText) {
            resumeBanner.style.display = 'block';
            resumeText.textContent = `Tienes ${localBatchQueue.length} documento(s) listos de una sesión anterior. ¿Deseas continuarlo o iniciar un lote nuevo?`;
        }
    }
});

// Guardar preferencia de Piloto Automático al alternar
if (toggleAutopilot) {
    toggleAutopilot.addEventListener('change', () => {
        chrome.storage.local.set({ sri_autopilot_enabled: toggleAutopilot.checked }, () => {
            showStatus(toggleAutopilot.checked ? '⚡ Piloto Automático Activado' : 'ℹ️ Modo Paso a Paso Activado', 'success', 2000);
        });
    });
}

// 2. ACCIONES DEL BANNER DE REANUDACIÓN
if (btnResumeContinue) {
    btnResumeContinue.addEventListener('click', () => {
        resumeBanner.style.display = 'none';
        iniciarProcesoSRI();
    });
}

if (btnResumeDiscard) {
    btnResumeDiscard.addEventListener('click', () => {
        localBatchQueue = [];
        chrome.storage.local.set({ sri_batch_queue: [], sri_active_batch: false, sri_batch_results: [] }, () => {
            resumeBanner.style.display = 'none';
            renderQueue();
            showStatus('🗑️ Memoria previa limpiada', 'processing', 2000);
        });
    });
}

// 3. NAVEGACIÓN DIRECTA AL PORTAL
if (btnNavegar) {
    btnNavegar.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.storage.local.set({
            'sri_auto_nav': { target: 'solicitud_anulacion', timestamp: Date.now() }
        }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url: TARGET_PORTAL_URL });
                } else {
                    chrome.tabs.create({ url: TARGET_PORTAL_URL });
                }
            });
        });
    });
}

// 4. DRAG & DROP COSMETICS Y MANEJO DE ARCHIVOS
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleMultipleFiles(e.dataTransfer.files);
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleMultipleFiles(e.target.files);
    });
}

async function handleMultipleFiles(files) {
    showStatus('<div class="spinner"></div> Extrayendo datos de PDFs...', 'processing');
    
    let parsedDataArray = [];
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.mjs');

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type !== 'application/pdf') continue;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
            let fullText = '';
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                fullText += textContent.items.map(item => item.str).join(' ') + ' ';
            }
            
            const extracted = extractDataFromText(fullText);
            extracted.fileName = file.name;
            if (extracted.claveAcceso) {
                parsedDataArray.push(extracted);
            }
        } catch (err) {
            console.error("Error al procesar PDF " + file.name, err);
        }
    }

    if (parsedDataArray.length > 0) {
        statusDiv.style.display = 'none';
        localBatchQueue = localBatchQueue.concat(parsedDataArray);
        renderQueue();
        if (resumeBanner) resumeBanner.style.display = 'none';
    } else {
        showStatus('❌ No se detectaron facturas electrónicas válidas en los PDFs', 'error', 3500);
    }
}

function renderQueue() {
    const container = document.getElementById('queue-container');
    const list = document.getElementById('queue-list');
    const count = document.getElementById('queue-count');
    const dropTextLabel = document.getElementById('drop-text-label');

    if (localBatchQueue.length > 0) {
        container.style.display = 'block';
        count.textContent = localBatchQueue.length;
        if (btnProcessBatch) {
            btnProcessBatch.innerHTML = `🚀 Iniciar Automatización (${localBatchQueue.length})`;
        }
        
        if (dropTextLabel) {
            dropTextLabel.innerHTML = `Lote actual: <b>${localBatchQueue.length} facturas</b>`;
        }
        
        list.innerHTML = localBatchQueue.map((item, index) => {
            const comp = SriTaxCompliance.validarPlazoLegalAnulacion(item.fecha, item.idReceptor);
            let badge = '';
            if (comp.esConsumidorFinal) {
                badge = '<span style="background:rgba(239, 68, 68, 0.2); color:#f87171; border:1px solid rgba(239, 68, 68, 0.4); font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700;">Consumidor Final</span>';
            } else if (comp.plazoVencido) {
                badge = `<span style="background:rgba(245, 158, 11, 0.2); color:#fbbf24; border:1px solid rgba(245, 158, 11, 0.4); font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700;">Venció ${comp.fechaLimiteStr} · Nota Crédito</span>`;
            } else {
                badge = '<span style="background:rgba(16, 185, 129, 0.2); color:#34d399; border:1px solid rgba(16, 185, 129, 0.4); font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700;">En plazo</span>';
            }
            return `
            <div class="file-item" style="display:flex; flex-direction:column; gap:4px; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="file-item-name" style="font-weight:700; color:#f8fafc;" title="${item.fileName} | Clave: ${item.claveAcceso}">
                      📄 ${item.facturaDisplay || item.fileName} · $${item.total || '0.00'}
                    </span>
                    <span class="file-remove" data-index="${index}" title="Eliminar" style="cursor:pointer; color:#ef4444; font-weight:bold; padding:0 4px;">✕</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#94a3b8;">
                    <span style="max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.razonSocial || item.cliente || 'Cliente'}</span>
                    ${badge}
                </div>
            </div>
            `;
        }).join('');

        document.querySelectorAll('.file-remove').forEach(el => {
            el.addEventListener('click', (e) => {
               const idx = e.target.getAttribute('data-index');
               localBatchQueue.splice(idx, 1);
               renderQueue();
            });
        });
    } else {
        container.style.display = 'none';
        if (statusDiv) statusDiv.style.display = 'none';
        if (dropTextLabel) {
            dropTextLabel.textContent = 'Suelta aquí tus PDFs (Lote)';
        }
    }
}

// 5. INICIAR PROCESO DE LOTE
if (btnProcessBatch) {
    btnProcessBatch.addEventListener('click', () => {
        if (localBatchQueue.length > 0) {
            iniciarProcesoSRI();
        }
    });
}

function iniciarProcesoSRI() {
    const autopilot = toggleAutopilot ? toggleAutopilot.checked : true;
    showStatus(`⚡ Lote listo (${localBatchQueue.length} facturas). Entrando al portal SRI...`, 'processing');

    chrome.storage.local.set({
        sri_active_batch: true,
        sri_batch_queue: localBatchQueue,
        sri_batch_total: localBatchQueue.length,
        sri_autopilot_enabled: autopilot,
        sri_auto_nav: { target: 'solicitud_anulacion', timestamp: Date.now() }
    }, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { url: TARGET_PORTAL_URL });
            } else {
                chrome.tabs.create({ url: TARGET_PORTAL_URL });
            }
        });
    });
}

if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', () => {
        localBatchQueue = [];
        chrome.storage.local.set({ sri_batch_queue: [], sri_active_batch: false, sri_batch_results: [] }, () => {
            renderQueue();
            showStatus('🗑️ Lista de facturas vaciada', 'processing', 2000);
        });
    });
}

// 6. EXPORTACIÓN PROFESIONAL A CSV (EXCEL COMPATIBLE UTF-8 BOM)
if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
        chrome.storage.local.get(['sri_anulaciones_historial', 'sri_batch_results'], (res) => {
            const historial = res.sri_anulaciones_historial || [];
            const results = res.sri_batch_results || [];
            const combined = [...historial, ...results];

            if (combined.length === 0) {
                showStatus('⚠️ No hay registros de anulaciones todavía para exportar', 'error', 3000);
                return;
            }

            // Deduplicar por clave de acceso
            const seen = new Set();
            const unique = [];
            for (const item of combined) {
                const clave = item.clave || item.claveAcceso;
                if (clave && !seen.has(clave)) {
                    seen.add(clave);
                    unique.push(item);
                }
            }

            // Generar contenido CSV con BOM UTF-8 (\uFEFF) para apertura nativa en Microsoft Excel
            let csv = '\uFEFF';
            csv += 'Fecha;Hora;Tipo Comprobante;No. Factura;Clave de Acceso (49 digitos);RUC Receptor;Total ($);Estado SRI;Detalle / Mensaje\r\n';

            unique.forEach(row => {
                const fechaHora = row.timestamp ? new Date(row.timestamp) : new Date();
                const fechaStr = fechaHora.toLocaleDateString('es-EC');
                const horaStr = fechaHora.toLocaleTimeString('es-EC');
                const tipo = (row.tipoComprobante || 'FACTURA').replace(/;/g, ' ');
                const numDoc = (row.facturaDisplay || row.numeroComprobante || '').replace(/;/g, ' ');
                const clave = (row.clave || row.claveAcceso || '').replace(/;/g, ' ');
                const ruc = (row.idReceptor || row.ruc || '').replace(/;/g, ' ');
                const total = (row.total || '0.00').replace(/;/g, '.');
                const estado = (row.status === 'success' || row.estado === 'success' ? 'ANULADO_SRI' : 'OBSERVACION_SRI');
                const detalle = (row.mensaje || row.error || 'Procesado satisfactoriamente').replace(/;/g, ' ').replace(/\n/g, ' ');

                csv += `"${fechaStr}";"${horaStr}";"${tipo}";"${numDoc}";"${clave}";"${ruc}";"${total}";"${estado}";"${detalle}"\r\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const dateSlug = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
            a.href = url;
            a.download = `Acta_Anulaciones_SRI_${dateSlug}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showStatus(`📥 Acta descargada (${unique.length} registros)`, 'success', 3000);
        });
    });
}

function showStatus(msg, type = 'success', duration = 0) {
    if (!statusDiv) return;
    statusDiv.innerHTML = msg;
    statusDiv.className = type;
    statusDiv.style.display = 'block';

    if (duration > 0) {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, duration);
    }
}

// 7. MOTOR DE EXTRACCIÓN DE DATOS DE COMPROBANTES
function extractDataFromText(text) {
    text = text.replace(/\s+/g, ' ');
    const get = (re) => (text.match(re) || [])[1] || '';

    // Clave de Acceso (49 dígitos)
    let clave = get(/CLAVE\s*(?:DE\s+)?ACCESO[\s\S]*?(\d{49})/i);
    if (!clave) {
        const any49 = text.match(/\b\d{49}\b/);
        if (any49) clave = any49[0];
    }

    let tipoComprobante = 'FACTURA';
    if (clave && clave.length === 49) {
        const map = { 
            '01': 'FACTURA', 
            '03': 'LIQUIDACIÓN DE COMPRA', 
            '04': 'NOTA DE CRÉDITO', 
            '05': 'NOTA DE DÉBITO', 
            '06': 'GUÍA DE REMISIÓN', 
            '07': 'COMPROBANTE DE RETENCIÓN' 
        };
        tipoComprobante = map[clave.substring(8, 10)] || 'FACTURA';
    }

    let fecha = '';
    const fechaAutMatch = text.match(/(?:Fecha\s*(?:y\s*hora)?\s*(?:de)?\s*autorizaci[óo]n)[\s\S]*?(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    if (fechaAutMatch) {
        fecha = fechaAutMatch[1];
    }

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

    let idReceptor = '';
    const rucEmisor = clave.length === 49 ? clave.substring(10, 23) : '';
    const rucMatches = text.match(/\b\d{10,13}\b/g) || [];
    const candidates = rucMatches.filter(r => r !== rucEmisor);
    if (candidates.length > 0) {
        idReceptor = candidates[0]; 
    } else {
        idReceptor = (text.match(/(?:RUC|Identificaci[óo]n|CI|R\.U\.C).*?(\d{10,13})/) || [])[1] || '';
    }

    let razonSocial = '';
    if (idReceptor === '9999999999999' || idReceptor === '9999999999') {
        razonSocial = 'CONSUMIDOR FINAL';
    } else {
        const patterns = [
            /(?:Razón Social|Nombres y Apellidos|Cliente|Señor\(es\))[\s\:\.\-]+([^\n\r:;]+?)(?=\s+(?:RUC|Identificaci|Fecha|Direcci|Dir\.|Obligado|Guía|$))/i,
            /(?:Razón Social|Nombres y Apellidos)[\s\:\.\-]+([^\n\r:;]+)/i
        ];
        for (const p of patterns) {
            const m = text.match(p);
            if (m && m[1] && m[1].trim().length > 2) {
                razonSocial = m[1].trim().replace(/^[:\-\.]+\s*/, '');
                break;
            }
        }
    }
    if (!razonSocial) razonSocial = 'Consumidor / Cliente';

    let numAutorizacion = (clave && clave.length === 49) ? clave : '';

    let facturaDisplay = '';
    if (clave.length === 49) {
        const estab = clave.substring(24, 27);
        const pto = clave.substring(27, 30);
        const seq = clave.substring(30, 39);
        facturaDisplay = `${estab}-${pto}-${seq}`;
    }

    let total = '0.00';
    try {
        const specificMatch = text.match(/(?:VALOR TOTAL|IMPORTE TOTAL|TOTAL(?: A PAGAR)?|Total)[\s\S]{0,50}?(\d{1,5}[\.,]\d{2})/i);
        if (specificMatch) {
            total = specificMatch[1].replace(',', '.');
        } else {
            const valMatch = text.match(/Total.*?\$?\s*([\d,]+\.\d{2})/i);
            if (valMatch) total = valMatch[1].replace(',', '.');
        }
    } catch(e) {}

    return {
        claveAcceso: clave,
        numAutorizacion,
        fecha,
        idReceptor,
        email,
        tipoComprobante,
        facturaDisplay,
        total: total || '0.00',
        importeTotal: total || '0.00',
        razonSocial,
        cliente: razonSocial
    };
}
