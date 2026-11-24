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
    pintarEmisorDetectado();
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

/**
 * El PDF ya trae el RUC del emisor en la clave de acceso (posiciones 11-23).
 * Ese emisor ES el cliente: si está en la cartera, se ofrece entrar al SRI
 * con su clave y arrancar el lote sin tipear nada.
 */
function detectarEmisorRuc() {
    const item = localBatchQueue[0];
    const clave = (item && (item.clave || item.claveAcceso)) || '';
    return clave.length === 49 ? clave.substring(10, 23) : '';
}

function pintarEmisorDetectado() {
    const cont = document.getElementById('emisor-card');
    if (!cont) return;
    const ruc = detectarEmisorRuc();
    if (!ruc) { cont.style.display = 'none'; return; }

    chrome.storage.local.get(['sc_clients_cache'], (res) => {
        const cache = Array.isArray(res.sc_clients_cache) ? res.sc_clients_cache : [];
        const cliente = cache.find(c => String(c.ruc || '').trim() === ruc);
        const clave = cliente ? (cliente.password || cliente.sriPassword || cliente.sri_password || '') : '';
        const nombre = cliente ? (cliente.name || 'Cliente SRI') : '';

        cont.style.display = '';
        if (cliente) {
            cont.innerHTML = `
                <div class="emisor-info">
                    <span class="emisor-eyebrow">Emisor del PDF · tu cliente</span>
                    <strong class="emisor-name"></strong>
                    <span class="emisor-ruc"></span>
                </div>
                <button id="btnEntrarEmisor" class="emisor-btn"></button>
            `;
            cont.querySelector('.emisor-name').textContent = nombre;
            cont.querySelector('.emisor-ruc').textContent = ruc;
            const btn = cont.querySelector('#btnEntrarEmisor');
            if (clave) {
                btn.textContent = '🔑 Entrar y anular';
                btn.title = 'Entra al SRI con este cliente y arranca el lote de anulación';
                btn.addEventListener('click', () => {
                    // Credenciales para el autologin (en la suite las toma el 01).
                    // A propósito NO se tocan pendingAction ni sc_loop: eso es del
                    // flujo de declaración y pisaría el de anulación.
                    chrome.storage.local.set({
                        sri_active_credentials: { ruc, password: clave, name: nombre, timestamp: Date.now() },
                        pending_sri_autofill: {
                            ruc, password: clave, name: nombre,
                            timestamp: Date.now(), manual: true, loginAttempted: false
                        },
                        accionDeQuien: ruc,
                        sri_master_switch_on: true
                    }, () => {
                        try { navigator.clipboard.writeText(`${ruc}\t${clave}`); } catch (e) { /* sin portapapeles */ }
                        iniciarProcesoSRI();
                    });
                });
            } else {
                btn.textContent = '⚠ Sin clave cargada';
                btn.title = 'Este cliente no tiene clave SRI en la cartera';
                btn.disabled = true;
                btn.classList.add('emisor-btn-off');
            }
        } else {
            cont.innerHTML = `
                <div class="emisor-info">
                    <span class="emisor-eyebrow">Emisor del PDF</span>
                    <strong class="emisor-name">No está en tu cartera</strong>
                    <span class="emisor-ruc"></span>
                </div>
            `;
            cont.querySelector('.emisor-ruc').textContent = ruc;
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

// ── Versión: se lee del manifiesto ───────────────────────────────────────────
// Estaba escrita a mano ("v3.2") y no coincidía con la versión real (2.5.0).
// Pintarla desde el manifiesto evita el desfase que la auditoría encontró en
// las otras superficies.
try {
  const elVer = document.getElementById('sc-ver-popup');
  if (elVer && chrome.runtime && chrome.runtime.getManifest) {
    elVer.textContent = 'v' + chrome.runtime.getManifest().version;
  }
} catch (e) { /* sin manifiesto: queda el guion */ }

// ── Cobro de anulaciones ─────────────────────────────────────────────────────
// El registro lo escribe content.js al confirmar cada anulación (una sola vez
// por clave de acceso). Acá se muestra lo pendiente y se exporta para la web.
const SC_COBRO_LEDGER = 'sc_anulaciones';
const SC_COBRO_PRECIO = 'sc_anulacion_precio';

function fmtMoney(n) { return '$' + Number(n || 0).toFixed(2); }

function pintarCobro() {
  const totalEl = document.getElementById('sc-cobro-total');
  const resEl = document.getElementById('sc-cobro-resumen');
  const inp = document.getElementById('sc-cobro-precio');
  if (!totalEl || !resEl) return;
  chrome.storage.local.get([SC_COBRO_LEDGER, SC_COBRO_PRECIO], (r) => {
    const ledger = r[SC_COBRO_LEDGER] || [];
    const precio = Number(r[SC_COBRO_PRECIO]);
    if (inp && Number.isFinite(precio)) inp.value = precio;
    const pend = ledger.filter((x) => x && x.estado === 'pendiente');
    const total = pend.reduce((s, x) => s + Number(x.precio || 0), 0);
    const facturadas = ledger.filter((x) => x && (x.estado === 'facturado' || x.estado === 'pagado')).length;
    totalEl.textContent = fmtMoney(total);
    if (!ledger.length) {
      resEl.textContent = 'Sin anulaciones registradas todavía.';
      return;
    }
    const clientes = new Set(pend.map((x) => x.ruc)).size;
    const ult = pend.slice(-1)[0];
    resEl.innerHTML = `<b>${pend.length}</b> por cobrar` +
      (clientes ? ` · ${clientes} cliente(s)` : '') +
      (facturadas ? ` · ${facturadas} ya facturada(s)` : '') +
      (ult ? `<br><span style="opacity:.7">Última: ${ult.consecutivo} · ${ult.factura || (ult.clave || '').slice(-8)} · ${fmtMoney(ult.precio)}</span>` : '');
  });
}

pintarCobro();
chrome.storage.onChanged.addListener((cambios, area) => {
  if (area !== 'local' || !cambios) return;
  if (cambios[SC_COBRO_LEDGER] || cambios[SC_COBRO_PRECIO]) pintarCobro();
});

const btnCobroPrecio = document.getElementById('sc-cobro-guardar');
if (btnCobroPrecio) btnCobroPrecio.addEventListener('click', () => {
  const inp = document.getElementById('sc-cobro-precio');
  const valor = Number(inp && inp.value);
  if (!Number.isFinite(valor) || valor < 0) {
    if (typeof showStatus === 'function') showStatus('Precio inválido', 'error', 2500);
    return;
  }
  chrome.storage.local.set({ [SC_COBRO_PRECIO]: valor }, () => {
    pintarCobro();
    if (typeof showStatus === 'function') showStatus(`Precio guardado: ${fmtMoney(valor)} por anulación`, 'success', 3000);
  });
});

const btnCobrosCsv = document.getElementById('btn-export-cobros');
if (btnCobrosCsv) {
  btnCobrosCsv.addEventListener('click', () => {
    chrome.storage.local.get([SC_COBRO_LEDGER], (r) => {
      const ledger = r[SC_COBRO_LEDGER] || [];
      if (!ledger.length) {
        if (typeof showStatus === 'function') showStatus('Todavía no hay anulaciones registradas', 'error', 3000);
        return;
      }
      let csv = '\uFEFF';
      csv += 'Consecutivo;Fecha;Periodo;Lote;RUC Emisor;Cliente;Tipo;No. Factura;Clave de Acceso;Precio ($);Estado Cobro;Resultado SRI;Detalle\r\n';
      ledger.forEach((x) => {
        if (!x) return;
        const fecha = new Date(x.fecha || Date.now());
        const fechaStr = fecha.toLocaleDateString('es-EC');
        const fila = [
          x.consecutivo, fechaStr, x.periodo, x.lote, x.ruc, x.cliente, x.tipo,
          x.factura, x.clave, Number(x.precio || 0).toFixed(2),
          x.estado, x.resultado, (x.detalle || '').replace(/[\r\n;]+/g, ' ').slice(0, 120)
        ];
        csv += fila.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '"')}"`).join(';') + '\r\n';
      });
      const ahora = new Date().toISOString().slice(0, 10);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Cobro_Anulaciones_${ahora}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (typeof showStatus === 'function') showStatus(`📥 Cobros exportados (${ledger.length})`, 'success', 3000);
    });
  });
}

// ── Estado de la subida a la nube ────────────────────────────────────────────
// content.js anota el resultado de cada intento; acá se muestra para saber si
// la anulación quedó sólo en este navegador o llegó a Supabase.
function pintarNube() {
  const el = document.getElementById('sc-nube-estado');
  if (!el) return;
  chrome.storage.local.get(['sc_cobro_nube'], (r) => {
    const e = r.sc_cobro_nube;
    if (!e) { el.textContent = '☁ sin subidas todavía'; el.style.color = 'var(--text-muted)'; return; }
    const hora = new Date(e.cuando).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    if (e.ok) {
      const veces = Number(e.veces || 0);
      const bytes = Number(e.bytes || 0);
      const peso = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
      el.textContent = `☁ nube OK · ${hora}` + (veces ? ` · ${veces} envíos · ${peso}` : '');
      el.style.color = '#00A896';
      el.title = 'Última anulación subida a Supabase.';
    } else {
      el.textContent = `⚠ local · ${hora}`;
      el.style.color = '#C9A96E';
      el.title = `No subió: ${e.error || 'error'} (queda guardada en este navegador).`;
    }
  });
}

pintarNube();
chrome.storage.onChanged.addListener((cambios, area) => {
  if (area === 'local' && cambios.sc_cobro_nube) pintarNube();
});

const btnNube = document.getElementById('sc-nube-probar');
if (btnNube) {
  btnNube.addEventListener('click', async () => {
    const el = document.getElementById('sc-nube-estado');
    el.textContent = '⏳ probando…';
    el.style.color = 'var(--text-muted)';
    const cfg = window.SC_CONFIG || {};
    const url = String(cfg.SUPABASE_URL || '').trim();
    const key = String(cfg.SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) {
      el.textContent = '⚠ sin configuración de nube';
      el.style.color = '#C9A96E';
      return;
    }
    try {
      const res = await fetch(`${url}/rest/v1/annulments?select=clave&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${window.ScSesion ? await window.ScSesion.bearer(key) : key}` }
      });
      if (res.ok) {
        el.textContent = '☁ conexión OK';
        el.style.color = '#00A896';
      } else {
        el.textContent = (res.status === 401 || res.status === 403) ? '⚠ inicia sesión' : `⚠ HTTP ${res.status}`;
        el.style.color = '#C9A96E';
        el.title = (await res.text()).slice(0, 140);
      }
    } catch (e) {
      el.textContent = '⚠ sin red';
      el.style.color = '#C9A96E';
      el.title = String(e && e.message);
    }
  });
}

// 👤 Sesión del estudio: sin ella, el cobro de anulaciones deja de subir a la
// web cuando se cierre `annulments` para la llave pública.
if (window.ScSesion) window.ScSesion.montarFormulario(document.getElementById('sc-sesion-caja'));
