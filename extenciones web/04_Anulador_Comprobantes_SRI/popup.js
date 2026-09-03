/*
 * SRI Llenador - Anulación de Comprobantes
 * 
 * Desarrollado por: SOLUCIONES TRIBUTARIAS ESTRATÉGICAS
 * Autor: Santiago Córdova - Asesor Tributario
 */

import * as pdfjsLib from './libs/pdf.mjs';

const SRI_DASHBOARD_URL = "https://srienlinea.sri.gob.ec/tuportal-internet/";

// ========== PREMIUM NAVIGATION HANDLER ==========
const btnNavegar = document.getElementById('btn-navegar');
if (btnNavegar) {
  btnNavegar.addEventListener('click', (e) => {
    e.preventDefault();

    // Comprobar si hay un proceso anterior
    chrome.storage.local.get(['sri_batch_queue'], (res) => {
      if (res.sri_batch_queue && res.sri_batch_queue.length > 0) {
        const confirmar = confirm(`⚠️ Tienes ${res.sri_batch_queue.length} documento(s) de un proceso anterior en memoria.\n\n¿Deseas BORRAR esa información para entrar limpio al portal?\n\n(Si deseas continuar el proceso anterior, dale click a Cancelar y usa el botón "Iniciar Automatización" arriba).`);
        if (!confirmar) {
          return;
        }
        // Limpiamos memoria si acepta
        chrome.storage.local.set({ sri_batch_queue: [], sri_active_batch: false, sri_batch_results: [] }, () => {
          doNavigation();
        });
        return;
      }
      
      // Si no hay proceso pendiente, navegar normal
      doNavigation();
    });
  });

  function doNavigation() {
    // 1. Set Flag to permit auto-navigation
    chrome.storage.local.set({
      'sri_auto_nav': {
        target: 'solicitud_anulacion',
        timestamp: Date.now()
      }
    }, () => {
      // 2. Open URL after flag is set
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { url: btnNavegar.href });
        } else {
          chrome.tabs.create({ url: btnNavegar.href });
        }
      });
    });
  }
}

// ========== DROP & GO BATCH PROCESSING ==========

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-upload');
const statusDiv = document.getElementById('status');

// Drag and drop cosmetics
if (dropZone) {
    // ELIMINADO el evento click que duplicaba la ventana del explorador
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#2563eb';
        dropZone.style.background = 'rgba(239, 246, 255, 0.9)';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(37,99,235,0.4)';
        dropZone.style.background = 'rgba(255,255,255,0.8)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(37,99,235,0.4)';
        dropZone.style.background = 'rgba(255,255,255,0.8)';
        if (e.dataTransfer.files.length) handleMultipleFiles(e.dataTransfer.files);
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleMultipleFiles(e.target.files);
    });
}

let localBatchQueue = [];

// Cargar estado anterior al iniciar el popup para avisar al usuario
chrome.storage.local.get(['sri_batch_queue', 'sri_active_batch'], (res) => {
    if (res.sri_batch_queue && res.sri_batch_queue.length > 0) {
        localBatchQueue = res.sri_batch_queue;
        renderQueue();
        
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = `⚠️ Atención: Tienes <b>${localBatchQueue.length} documento(s)</b> en memoria de un proceso anterior.`;
        statusDiv.className = 'processing';
        statusDiv.style.background = '#fef08a';
        statusDiv.style.color = '#854d0e';
    }
});

async function handleMultipleFiles(files) {
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '<div class="spinner"></div> Procesando PDF(s)...';
    statusDiv.className = 'processing';
    
    let parsedDataArray = [];

    // Initialize PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.mjs');

    // Parse each file
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
            
            // Extract the data
            const extracted = extractDataFromText(fullText);
            extracted.fileName = file.name;
            parsedDataArray.push(extracted);
        } catch (err) {
            console.error("Error al procesar PDF " + file.name, err);
        }
    }

    if (parsedDataArray.length > 0) {
        statusDiv.style.display = 'none'; // ocultar status de procesando
        
        // Agregar a la cola local
        localBatchQueue = localBatchQueue.concat(parsedDataArray);
        renderQueue();
    } else {
        statusDiv.innerHTML = '❌ No se encontraron PDFs válidos';
        statusDiv.className = 'error';
    }
}

function renderQueue() {
    const container = document.getElementById('queue-container');
    const list = document.getElementById('queue-list');
    const count = document.getElementById('queue-count');
    const dropTextLabel = document.getElementById('drop-text-label');
    const btn = document.getElementById('btn-process-batch');
    
    if (localBatchQueue.length > 0) {
        container.style.display = 'block';
        count.textContent = localBatchQueue.length;
        btn.innerHTML = `🚀 Iniciar Automatización (${localBatchQueue.length})`;
        
        if (dropTextLabel) {
            dropTextLabel.innerHTML = `Lote actual: <b>${localBatchQueue.length} PDFs</b><br><span style="font-size:11px; font-weight:normal;">Click para añadir más</span>`;
        }

        chrome.storage.local.get(['sri_active_profile'], (resProfile) => {
            const activeProf = resProfile.sri_active_profile || {};

            list.innerHTML = localBatchQueue.map((item, index) => {
                const rucEmisor = (item.claveAcceso && item.claveAcceso.length === 49) ? item.claveAcceso.substring(10, 23) : (item.rucEmisor || '');
                const isMismatch = activeProf.ruc && rucEmisor && activeProf.ruc !== rucEmisor;

                return `
                    <div class="file-item" style="flex-direction:column; align-items:flex-start; padding:8px 10px; margin-bottom:6px; background:${isMismatch ? 'rgba(254,226,226,0.9)' : 'rgba(255,255,255,0.9)'}; border:1px solid ${isMismatch ? '#fca5a5' : '#e2e8f0'}; border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; font-weight:700; font-size:12px; color:#1e293b;" title="${item.fileName}">📄 ${item.fileName}</span>
                            <span class="file-remove" data-index="${index}" title="Eliminar este PDF de la lista" style="cursor:pointer; font-size:13px; opacity:0.7; transition:0.2s;">🗑️</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-top:3px; font-size:10px;">
                            <span style="color:#2563eb; font-weight:600;">🏢 RUC Emisor: ${rucEmisor || 'N/A'}</span>
                            ${isMismatch ? `<span style="color:#dc2626; font-weight:800; background:#fee2e2; padding:1px 5px; border-radius:4px;">⚠️ RUC No Coincide (${activeProf.ruc.substring(0,10)}...)</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Attach remove events
            document.querySelectorAll('.file-remove').forEach(el => {
                el.addEventListener('click', (e) => {
                   const idx = e.target.getAttribute('data-index');
                   localBatchQueue.splice(idx, 1);
                   renderQueue();
                });
            });
        });
    } else {
        container.style.display = 'none';
        document.getElementById('status').style.display = 'none';
        if (dropTextLabel) {
            dropTextLabel.textContent = 'Suelta aquí tus PDFs (Lote)';
        }
    }
}

const btnProcessBatch = document.getElementById('btn-process-batch');
if (btnProcessBatch) {
    btnProcessBatch.addEventListener('click', () => {
        if (localBatchQueue.length > 0) {
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = `✅ Lote de ${localBatchQueue.length} PDFs listo. Navegando al SRI...`;
            statusDiv.className = 'success';
            
            chrome.storage.local.set({
                sri_active_batch: true,
                sri_batch_queue: localBatchQueue,
                sri_batch_total: localBatchQueue.length,
                sri_batch_results: [],
                sri_auto_nav: { target: 'solicitud_anulacion', timestamp: Date.now() }
            }, () => {
                const targetUrl = "https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=61&idGrupo=58";
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs.length > 0) {
                        chrome.tabs.update(tabs[0].id, { url: targetUrl });
                    } else {
                        chrome.tabs.create({ url: targetUrl });
                    }
                });
            });
        }
    });
}

const clearQueueBtn = document.getElementById('btn-clear-queue');
if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', () => {
        localBatchQueue = [];
        chrome.storage.local.set({ sri_batch_queue: [], sri_active_batch: false, sri_batch_results: [] }, () => {
            renderQueue();
            statusDiv.innerHTML = '🗑️ Lista vaciada';
            statusDiv.className = 'success';
            statusDiv.style.display = 'block';
            setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
        });
    });
}


function extractDataFromText(text) {
    text = text.replace(/\s+/g, ' ');
    const get = (re) => (text.match(re) || [])[1] || '';

    // --- CLAVE DE ACCESO ---
    let clave = get(/CLAVE\s*(?:DE\s+)?ACCESO[\s\S]*?(\d{49})/i);
    
    // Fallback: Buscar cualquier número de 49 dígitos si no se encontró con la etiqueta
    if (!clave) {
        const any49 = text.match(/\b\d{49}\b/);
        if (any49) clave = any49[0];
    }
    
    let tipoComprobante = '';
    if (clave && clave.length === 49) {
        // Mapeo en MAYÚSCULAS para coincidir con los selects del SRI
        const map = { 
            '01': 'FACTURA', 
            '03': 'LIQUIDACIÓN DE COMPRA', 
            '04': 'NOTA DE CRÉDITO', 
            '05': 'NOTA DE DEBITO', 
            '06': 'GUÍA DE REMISIÓN', 
            '07': 'COMPROBANTE DE RETENCIÓN' 
        };
        tipoComprobante = map[clave.substring(8, 10)] || '';
    }

    // Fallback para tipo si la clave falló
    if (!tipoComprobante) {
        if (text.match(/FACTURA/i)) tipoComprobante = 'FACTURA';
        else if (text.match(/NOTA\s*DE\s*CR[ÉE]DITO/i)) tipoComprobante = 'NOTA DE CRÉDITO';
        else if (text.match(/COMPROBANTE\s*DE\s*RETENCI[ÓO]N/i)) tipoComprobante = 'COMPROBANTE DE RETENCIÓN';
        else if (text.match(/LIQUIDACI[ÓO]N\s*DE\s*COMPRA/i)) tipoComprobante = 'LIQUIDACIÓN DE COMPRA';
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
        fecha = `${clave.substring(0, 2)}/${clave.substring(2, 4)}/${clave.substring(4, 8)}`;
    }

    // --- RUC / CI (IDENTIFICACIÓN RECEPTOR / COMPRADOR) ---
    const rucEmisor = clave.length === 49 ? clave.substring(10, 23) : '';
    let idReceptor = '';

    // 1. Prioridad 1: Buscar etiqueta directa de Identificación del Comprador/Receptor
    const directMatch = text.match(/(?:Identificaci[óo]n|RUC\s*\/\s*CI|RUC\s+Receptor|Identificaci[óo]n\s+Receptor|Comprador.*?Identificaci[óo]n)[:\s]+(\d{10,13})/i);
    if (directMatch && directMatch[1] && directMatch[1] !== rucEmisor && !directMatch[1].startsWith('001001') && !directMatch[1].startsWith('001002')) {
        idReceptor = directMatch[1];
    }

    // 2. Prioridad 2: Buscar dentro de la sección Razón Social / Nombres del Comprador
    if (!idReceptor) {
        const compradorSec = text.match(/(?:Raz[óo]n\s*Social|Nombres\s*y\s*Apellidos|Se[ñn]or\(es\)|Comprador)[\s\S]*?(?:RUC|Identificaci[óo]n|CI)[:\s]+(\d{10,13})/i);
        if (compradorSec && compradorSec[1] && compradorSec[1] !== rucEmisor) {
            idReceptor = compradorSec[1];
        }
    }

    // 3. Fallback inteligente: Filtrar números de 10 u 13 dígitos excluyendo Emisor y secuencias 001-001
    if (!idReceptor) {
        const rucMatches = text.match(/\b\d{10,13}\b/g) || [];
        const candidates = rucMatches.filter(r => {
            if (r === rucEmisor) return false;
            if (clave && clave.includes(r)) return false;
            if (/^00[1-9]00[1-9]/.test(r)) return false;
            if (r.length === 13 && !r.endsWith('001')) return false;
            if (r.length === 10 && !/^(0[1-9]|1[0-9]|2[0-4]|30)/.test(r)) return false;
            return true;
        });
        if (candidates.length > 0) idReceptor = candidates[0];
    }

    if (!idReceptor) {
        idReceptor = (text.match(/(?:RUC|Identificaci[óo]n|CI|R\.U\.C).*?(\d{10,13})/) || [])[1] || '';
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
    let numAutorizacion = '';
    if (clave && clave.length === 49) {
        numAutorizacion = clave;
    } else {
        numAutorizacion = get(/(?:N[ÚU]MERO\s*(?:DE)?\s*AUTORIZACI[ÓO]N)[\s\S]*?(\d{37,49})/i);
        if (!numAutorizacion) {
            const anyLongNum = text.match(/\b\d{37,49}\b/);
            if (anyLongNum) numAutorizacion = anyLongNum[0];
        }
    }

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
        claveAcceso: clave,
        numAutorizacion,
        fecha,
        idReceptor,
        email,
        tipoComprobante,
        facturaDisplay,
        cliente,
        total,
        fullTextDebug: text
    };
}
