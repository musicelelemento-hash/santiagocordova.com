// popup.js - Controla el popup de la extensión (v12.1 Elite)

const STATE = {
    IDLE: 'IDLE',
    WAITING_CAPTCHA: 'WAITING_CAPTCHA',
    EXTRACTING: 'EXTRACTING',
    COMPLETED_INVOICES: 'COMPLETED_INVOICES',
    SEARCHING_RET: 'SEARCHING_RET',
    WAITING_CAPTCHA_RET: 'WAITING_CAPTCHA_RET',
    EXTRACTING_RET: 'EXTRACTING_RET',
    COMPLETED_RET: 'COMPLETED_RET',
    SEARCHING_NC: 'SEARCHING_NC',
    WAITING_CAPTCHA_NC: 'WAITING_CAPTCHA_NC',
    EXTRACTING_NC: 'EXTRACTING_NC',
    COMPLETED_ALL: 'COMPLETED_ALL',
    // ELITE CLOSURE STATES
    FILLING_FORM: 'FILLING_FORM',
    CLOSING_SRI: 'CLOSING_SRI',
    STOPPED_BALANCE: 'STOPPED_BALANCE',
    STOPPED_WARNING: 'STOPPED_WARNING',
    DECLARATION_SUCCESS: 'DECLARATION_SUCCESS'
};

let currentWorkflowState = STATE.IDLE;
let workflowPeriod = null;

// ============================================
// INITIALIZATION
// ============================================

    // 1. Inicializar Selectores de Año (Desde 2020)
    const yearSelects = [document.getElementById('manualYearM'), document.getElementById('mainYearSelector')];
    const currentYear = new Date().getFullYear();
    yearSelects.forEach(select => {
        if (!select) return;
        select.innerHTML = '';
        for (let y = currentYear; y >= 2020; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            select.appendChild(opt);
        }
    });

    // 2. Determinar Mes Anterior por Defecto
    const ahora = new Date();
    let prevMonth = ahora.getMonth() - 1;
    let prevYear = ahora.getFullYear();
    if (prevMonth < 0) { prevMonth = 11; prevYear--; }

    // 3. Cargar datos y estado
    await cargarDatosGuardados();

    // 4. Si no hay periodo en memoria, poner el mes anterior por defecto
    if (!workflowPeriod) {
        workflowPeriod = { year: prevYear, monthIndex: prevMonth, type: 'monthly' };
        syncPeriodSelectors(workflowPeriod);
    }

    // 5. Vincular Eventos
    bindEvents();

    // 6. Inicializar Visibilidad Bulk
    const bulkType = document.getElementById('bulkType');
    if (bulkType) {
        toggleMonthSelector(bulkType.value);
    }
});

function syncPeriodSelectors(period) {
    const years = ['manualYearM', 'mainYearSelector'];
    const months = ['manualMonthM', 'mainMonthSelector'];
    
    years.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = period.year;
    });
    months.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = period.monthIndex;
    });

    // Actualizar subtexto visual
    const btnTurboSubtext = document.getElementById('btnTurboSubtext');
    if (btnTurboSubtext) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        btnTurboSubtext.innerHTML = `(Automatización de ${meses[period.monthIndex].toUpperCase()} ${period.year})`;
    }
}

// Sync from storage
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.facturas || changes.retenciones || changes.notasCredito || changes.workflowState || changes.workflowPeriod) {
            cargarDatosGuardados();
        }
    }
});

// ============================================
// UI & STATE MANAGEMENT
// ============================================

function actualizarUI() {
    const management = document.getElementById('managementContainer');
    const extractorManual = document.getElementById('extractorManualContainer');
    const report = document.getElementById('reportContainer');
    const step1 = document.getElementById('step1Container');
    const statusPanel = document.getElementById('workflowStatus');
    const activePeriodValue = document.getElementById('activePeriodValue');
    const statusText = document.getElementById('statusText');
    const btnContinuar = document.getElementById('btnContinuar');

    const recordingBadge = document.getElementById('recordingBadge');
    const recordingTitle = document.getElementById('recordingTitle');
    const recordingSubtext = document.getElementById('recordingSubtext');

    // ACTUALIZAR BADGE ROJO OPERANDO / GRABANDO EN VIVO
    if (recordingBadge && recordingTitle && recordingSubtext) {
        if (currentWorkflowState !== STATE.IDLE && currentWorkflowState !== STATE.COMPLETED_ALL) {
            recordingBadge.classList.remove('idle');
            recordingTitle.textContent = '🔴 EXTENSIÓN OPERANDO EN VIVO';
            recordingSubtext.textContent = 'Proceso activo: Automático en Portal SRI';
        } else {
            recordingBadge.classList.add('idle');
            recordingTitle.textContent = '🟢 EXTENSIÓN LISTA';
            recordingSubtext.textContent = 'Sistema preparado para operar en SRI';
        }
    }

    // MODO SELECTOR vs MODO PROGRESO
    if (currentWorkflowState === STATE.IDLE || currentWorkflowState === STATE.COMPLETED_ALL) {
        // En reposo: mostrar los contenedores de pestañas
        if (statusPanel) statusPanel.classList.add('hidden');
    } else {
        // En progreso: ocultar los selectores y mostrar el panel de estado
        if (management) management.classList.add('hidden');
        if (extractorManual) extractorManual.classList.add('hidden');
        if (report) report.classList.add('hidden');
        if (statusPanel) statusPanel.classList.remove('hidden');
    }

    // Actualizar etiqueta del periodo global
    if (workflowPeriod && activePeriodValue) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const bulkVal = document.getElementById('bulkType')?.value || 'monthly';

        let label = `${meses[workflowPeriod.monthIndex]} ${workflowPeriod.year}`;
        if (bulkVal === 'sem1') label = `1er Semestre ${workflowPeriod.year}`;
        if (bulkVal === 'sem2') label = `2do Semestre ${workflowPeriod.year}`;
        if (bulkVal === 'annual') label = `Año ${workflowPeriod.year}`;

        activePeriodValue.textContent = label;
    }

    if (!statusText) return;

    // STATE HANDLING
    switch (currentWorkflowState) {
        case STATE.SEARCHING:
            statusText.textContent = '⏳ MOTORES LISTOS: Navegando y configurando filtros...';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.WAITING_CAPTCHA:
            statusText.innerHTML = '⚡ <b>ACCIÓN REQUERIDA</b><br>1. Resuelva Captcha.<br>2. Click en Consultar.<br>3. Pulse Procesar abajo.';
            if (btnContinuar) {
                btnContinuar.textContent = '💎 PROCESAR FACTURAS';
                btnContinuar.classList.remove('hidden');
            }
            break;
        case STATE.EXTRACTING:
            statusText.textContent = '📊 ESCANEANDO: Extrayendo facturas...';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.COMPLETED_INVOICES:
            statusText.innerHTML = '✨ <b>FACTURAS LISTAS</b>.<br>¿Continuar con Retenciones?';
            if (btnContinuar) {
                btnContinuar.textContent = '📋 IR A RETENCIONES';
                btnContinuar.classList.remove('hidden');
            }
            break;
        case STATE.SEARCHING_RET:
            statusText.textContent = '⏳ CORTINA DE HUMO: Cambiando filtros...';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.WAITING_CAPTCHA_RET:
            statusText.innerHTML = '⚡ <b>ACCIÓN REQUERIDA</b><br>1. Click Consultar.<br>2. Verifique tabla.<br>3. Pulse Procesar abajo.';
            if (btnContinuar) {
                btnContinuar.textContent = '💎 PROCESAR RETENCIONES';
                btnContinuar.classList.remove('hidden');
            }
            break;
        case STATE.EXTRACTING_RET:
            statusText.textContent = '📊 ESCANEANDO: Extrayendo retenciones...';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.COMPLETED_RET:
            statusText.innerHTML = '✨ <b>RETENCIONES LISTAS</b>.<br>¿Continuar con Notas de Crédito?';
            if (btnContinuar) {
                btnContinuar.textContent = '📋 IR A NOTAS CRÉDITO';
                btnContinuar.classList.remove('hidden');
            }
            break;
        case STATE.SEARCHING_NC:
            statusText.textContent = '⏳ AJUSTANDO MIRILLA: Buscando Notas de Crédito...';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.WAITING_CAPTCHA_NC:
            statusText.innerHTML = '⚡ <b>ACCIÓN REQUERIDA</b><br>1. Click Consultar.<br>2. Verifique tabla (N.C.).<br>3. Pulse Procesar abajo.';
            if (btnContinuar) {
                btnContinuar.textContent = '💎 PROCESAR N.C.';
                btnContinuar.classList.remove('hidden');
            }
            break;
        case STATE.EXTRACTING_NC:
            statusText.textContent = '📊 ESCANEANDO: Extrayendo Notas de Crédito...';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.COMPLETED_ALL:
            statusText.textContent = '🏆 EXTRACCIÓN COMPLETADA. Listo para llenar.';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.FILLING_FORM:
            statusText.innerHTML = '📝 <b>LLENANDO FORMULARIO</b><br>Auto-completando casilleros del SRI...';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.CLOSING_SRI:
            statusText.innerHTML = '🔄 <b>CIERRE MÁGICO</b><br>Validando y procesando declaración...';
            if (btnContinuar) btnContinuar.classList.add('hidden');
            break;
        case STATE.STOPPED_BALANCE:
            statusText.innerHTML = '⚠️ <b>DETENIDO: SALDO A PAGAR</b><br>Se detectó valor a pagar. Borrador guardado.';
            if (btnContinuar) {
                btnContinuar.innerHTML = '🔍 REVISAR EN SRI';
                btnContinuar.classList.remove('hidden');
                btnContinuar.onclick = () => window.close();
            }
            break;
        case STATE.STOPPED_WARNING:
            statusText.innerHTML = '🛑 <b>DETENIDO: ADVERTENCIA</b><br>Alerta desconocida detectada. Borrador guardado.';
            if (btnContinuar) {
                btnContinuar.innerHTML = '🔍 REVISAR ALERTAS';
                btnContinuar.classList.remove('hidden');
                btnContinuar.onclick = () => window.close();
            }
            break;
        case STATE.DECLARATION_SUCCESS:
            statusText.innerHTML = '✅ <b>ÉXITO TOTAL</b><br>Declaración finalizada y guardada.';
            if (btnContinuar) {
                btnContinuar.innerHTML = '🎊 CERRAR';
                btnContinuar.classList.remove('hidden');
                btnContinuar.onclick = () => {
                    chrome.storage.local.set({ workflowState: 'IDLE' });
                    window.close();
                };
            }
            break;
    }
}

async function cargarDatosGuardados() {
    try {
        const datos = await chrome.storage.local.get(['facturas', 'retenciones', 'notasCredito', 'workflowState', 'workflowPeriod']);

        workflowPeriod = datos.workflowPeriod || null;
        currentWorkflowState = datos.workflowState || STATE.IDLE;

        // Sync inputs with saved state if available
        if (workflowPeriod) {
            const inputYear = document.getElementById('manualYearM');
            const inputMonth = document.getElementById('manualMonthM');
            if (inputYear) inputYear.value = workflowPeriod.year;
            if (inputMonth) inputMonth.value = workflowPeriod.monthIndex;
        }

        const settings = await chrome.storage.local.get(['bulkType', 'checkFacturas', 'checkRetenciones', 'checkNC']);
        if (settings.bulkType) {
            const bulkType = document.getElementById('bulkType');
            if (bulkType) bulkType.value = settings.bulkType;
            toggleMonthSelector(settings.bulkType);
        }
        if (settings.hasOwnProperty('checkFacturas')) document.getElementById('checkFacturas').checked = settings.checkFacturas;
        if (settings.hasOwnProperty('checkRetenciones')) document.getElementById('checkRetenciones').checked = settings.checkRetenciones;
        if (settings.hasOwnProperty('checkNC')) document.getElementById('checkNC').checked = settings.checkNC;

        if (datos.facturas) {
            mostrarResultados(datos.facturas);
            mostrarPeriodo(datos.facturas.periodo);
        } else {
            const resDiv = document.getElementById('results');
            if (resDiv) resDiv.classList.add('hidden');
        }

        if (datos.retenciones) {
            mostrarResultadosRetenciones(datos.retenciones);
            mostrarPeriodo(datos.retenciones.periodo);
        } else {
            const resRetDiv = document.getElementById('resultsRetenciones');
            if (resRetDiv) resRetDiv.classList.add('hidden');
        }

        if (datos.notasCredito) {
            mostrarResultadosNC(datos.notasCredito);
        } else {
            const divNC = document.getElementById('resultsNotasCredito');
            if (divNC) divNC.classList.add('hidden');
        }

        if (!datos.facturas && !datos.retenciones && !datos.notasCredito) {
            const periodCont = document.getElementById('periodContainer');
            if (periodCont) periodCont.classList.add('hidden');
        }

        actualizarUI();
    } catch (e) {
        console.error('Error cargando datos:', e);
    }
}

// ============================================
// TURBO WORKFLOW TRIGGER
// ============================================

/**
 * Dispara el flujo Turbo completo (Fase 1+2+3) enviando un mensaje
 * al content script para que el SriAssistant lo ejecute.
 */
async function startTurboWorkflow(period) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                mostrarNotificacion('Error', 'No se encontró una pestaña activa.', 'error');
                return reject('No active tab');
            }
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'triggerAssistantAction',
                type: 'TURBO_FULL',
                context: period
            }, (response) => {
                if (chrome.runtime.lastError) {
                    mostrarNotificacion('Error', 'No se pudo conectar con la página del SRI. Asegúrate de estar en el portal.', 'error');
                    return reject(chrome.runtime.lastError.message);
                }
                if (response && response.success) {
                    resolve();
                    window.close(); // Cierra el popup — el asistente toma el control
                } else {
                    const msg = response?.error || 'Error desconocido al iniciar turbo.';
                    mostrarNotificacion('Error Turbo', msg, 'error');
                    reject(msg);
                }
            });
        });
    });
}

// ============================================
// EVENT BINDING
// ============================================

function bindEvents() {
    const safeBind = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
        else console.warn(`⚠️ Elemento no encontrado para bind: ${id}`);
    };

    // 1. Navegación & Turbo
    safeBind('navComprobantesBtn', 'click', async () => {
        const URL_RECIBIDOS = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/publico/comprobantesRecibidos.jsf';
        chrome.tabs.update({ url: URL_RECIBIDOS });
    });

    // Síncronización cruzada de selectores (Main <-> Extractor)
    const syncOnChange = (id, targetYear, targetMonth) => {
        document.getElementById(id).addEventListener('change', () => {
            const year = document.getElementById(targetYear).value;
            const month = document.getElementById(targetMonth).value;
            const newPeriod = { year: parseInt(year), monthIndex: parseInt(month), type: 'monthly' };
            workflowPeriod = newPeriod;
            syncPeriodSelectors(newPeriod);
            chrome.storage.local.set({ workflowPeriod: newPeriod });
        });
    };

    syncOnChange('mainYearSelector', 'mainYearSelector', 'mainMonthSelector');
    syncOnChange('mainMonthSelector', 'mainYearSelector', 'mainMonthSelector');
    syncOnChange('manualYearM', 'manualYearM', 'manualMonthM');
    syncOnChange('manualMonthM', 'manualYearM', 'manualMonthM');

    // 1. BOTÓN: EJECUCIÓN MAESTRA (TURBO)
    safeBind('btnStartMonthlyDeclaration', 'click', async () => {
        const year = parseInt(document.getElementById('mainYearSelector').value);
        const monthIndex = parseInt(document.getElementById('mainMonthSelector').value);

        const period = {
            year,
            monthIndex,
            type: 'monthly'
        };

        // Guardar flag de automatización y periodo
        await chrome.storage.local.set({ 
            autoDeclaration: true,
            workflowPeriod: period 
        });
        
        // Iniciar flujo
        startTurboWorkflow(period);
    });

    // 2. BOTÓN: GENERAR REPORTE (CUSTOM)
    safeBind('btnGenerateReport', 'click', async () => {
        const period = await getSelectedPeriod();
        if (!period) return;

        // Guardar flag de automatización (desactivado para reportes)
        await chrome.storage.local.set({ autoDeclaration: false });

        // Iniciar flujo
        startTurboWorkflow(period);
    });

    // 3. BOTÓN: EMPEZAR PROCESO SELECCIONADO (EXTRACTOR MASA)
    safeBind('btnEmpezar', 'click', async () => {
        const year = parseInt(document.getElementById('manualYearM').value);
        const monthIndex = parseInt(document.getElementById('manualMonthM').value);
        const bulkType = document.getElementById('bulkType').value;
        const checkFacturas = document.getElementById('checkFacturas').checked;
        const checkRetenciones = document.getElementById('checkRetenciones').checked;
        const checkNC = document.getElementById('checkNC').checked;

        // PERSISTIR CONFIGURACIÓN ELITE
        await chrome.storage.local.set({
            workflowPeriod: { year, monthIndex },
            bulkType,
            checkFacturas,
            checkRetenciones,
            checkNC
        });

        const status = document.getElementById('status');
        if (status) {
            status.classList.remove('hidden', 'error');
            status.innerHTML = '🚀 Iniciando MODO TURBO SELECTIVO...';
        }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, {
                action: 'START_TURBO_MANUAL',
                data: { year, monthIndex, bulkType, checkFacturas, checkRetenciones, checkNC }
            });
            setTimeout(() => window.close(), 1500);
        } catch (e) { showStatusError(e.message); }
    });

    safeBind('bulkType', 'change', (e) => {
        const val = e.target.value;
        toggleMonthSelector(val);
        chrome.storage.local.set({ bulkType: val });
        actualizarUI();
    });

    // Eventos de persistencia inmediata para los toggles
    ['checkFacturas', 'checkRetenciones', 'checkNC'].forEach(id => {
        safeBind(id, 'change', (e) => {
            chrome.storage.local.set({ [id]: e.target.checked });
        });
    });

    // 2. Form Navigation
    safeBind('openFormBtn', 'click', async () => {
        const year = parseInt(document.getElementById('manualYearM').value);
        const monthIndex = parseInt(document.getElementById('manualMonthM').value);

        await chrome.storage.local.set({
            pendingAction: 'startIvaNavigation',
            workflowPeriod: { year, monthIndex },
            actionTimestamp: Date.now(),
            skipSafetyCheck: true
        });

        const URL_DECLARACIONES_INDEX = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaraciones/Publico/declaraciones';
        setTimeout(() => {
            chrome.tabs.update({ url: URL_DECLARACIONES_INDEX });
        }, 100);
    });

    // 3. Form Filling
    safeBind('fillVentasBtn', 'click', () => handleFormFilling('autoFillVentas', 'fillVentasBtn', 'Ventas'));
    safeBind('fillComprasBtn', 'click', () => handleFormFilling('autoFillCompras', 'fillComprasBtn', 'Compras'));
    safeBind('fillRetencionesBtn', 'click', () => handleFormFilling('autoFillResumen', 'fillRetencionesBtn', 'Resumen Impositivo'));
    safeBind('autoFillFormBtn', 'click', () => handleFormFilling('autoFillForm', 'autoFillFormBtn', 'Todo el Formulario'));

    // 4. Utils
    safeBind('borrarBtn', 'click', async () => {
        if (confirm('¿Borrar memoria?')) {
            await chrome.storage.local.clear();
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_MEMORY' }).catch(() => { });
            }
            actualizarUI();
        }
    });

    safeBind('stopAutoBtn', 'click', async () => {
        await chrome.storage.local.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod', 'sriAutomationPaused']);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { action: 'STOP_ACTION' }).catch(() => { });
        }
        const status = document.getElementById('status');
        if (status) {
            status.innerHTML = '🛑 <b>Automatización Detenida</b>';
            status.classList.remove('hidden');
            status.classList.add('error');
        }
    });

    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Activar visualmente la tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Ocultar todos los contenedores
            const containers = ['clientsContainer', 'managementContainer', 'extractorManualContainer', 'reportContainer'];
            containers.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });

            // Ocultar resultados flotantes
            document.getElementById('results')?.classList.add('hidden');
            document.getElementById('resultsRetenciones')?.classList.add('hidden');
            document.getElementById('resultsNotasCredito')?.classList.add('hidden');
            document.getElementById('periodContainer')?.classList.add('hidden');

            const target = tab.dataset.tab;
            if (target === 'clients') {
                document.getElementById('clientsContainer')?.classList.remove('hidden');
                renderClientsTab();
            } else if (target === 'management') {
                document.getElementById('managementContainer')?.classList.remove('hidden');
                cargarDatosGuardados();
            } else if (target === 'extractor') {
                document.getElementById('extractorManualContainer')?.classList.remove('hidden');
            } else if (target === 'report') {
                document.getElementById('reportContainer')?.classList.remove('hidden');
                renderReportTab();
            }
        });
    });

    safeBind('clientSearchInput', 'input', renderClientsTab);
    safeBind('btnRefreshClients', 'click', renderClientsTab);
    renderClientsTab();

    // 6. COPY REPORT BUTTON
    safeBind('btnCopyReport', 'click', async () => {
        const reportData = await chrome.storage.local.get(['lastBulkReport']);
        if (!reportData.lastBulkReport) return;

        const r = reportData.lastBulkReport;
        const btn = document.getElementById('btnCopyReport');

        let clipboardText = `REPORTE MAESTRO SRI - ${r.clientName}\n`;
        clipboardText += `Generado: ${new Date(r.timestamp).toLocaleString()}\n\n`;

        clipboardText += `TOTALES:\n`;
        clipboardText += `Facturas: ${r.totals.facturasCount} | Base 15%: $${r.totals.iva15.toFixed(2)} | Base 0%: $${r.totals.iva0.toFixed(2)}\n`;
        clipboardText += `Retenciones: ${r.totals.retCount} | IVA Ret: $${r.totals.retIva.toFixed(2)} | Renta Ret: $${r.totals.retRenta.toFixed(2)}\n`;
        clipboardText += `Notas Crédito: ${r.totals.ncCount} | Total: $${r.totals.ncTotal.toFixed(2)}\n\n`;

        clipboardText += `DETALLE MENSUAL:\nMES\tBASE 15\tBASE 0\tRET. IVA\tBASE RET. IVA\tRET. RENTA\tBASE RET. RENTA\n`;
        const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

        if (r.breakdown) {
            r.breakdown.forEach(m => {
                const mName = monthNames[m.month];
                const f15 = parseFloat(m.data.facturas?.iva15?.baseImponible || 0).toFixed(2);
                const f0 = parseFloat(m.data.facturas?.iva0?.baseImponible || 0).toFixed(2);
                const rIva = parseFloat(m.data.retenciones?.ivaRetenido?.total || 0).toFixed(2);
                const rIvaBase = parseFloat(m.data.retenciones?.ivaRetenido?.baseTotal || 0).toFixed(2);
                const rRenta = parseFloat(m.data.retenciones?.rentaRetenida?.total || 0).toFixed(2);
                const rRentaBase = parseFloat(m.data.retenciones?.rentaRetenida?.baseTotal || 0).toFixed(2);
                clipboardText += `${mName}\t${f15}\t${f0}\t${rIva}\t${rIvaBase}\t${rRenta}\t${rRentaBase}\n`;
            });
        }

        try {
            await navigator.clipboard.writeText(clipboardText);
            const originalText = btn.textContent;
            btn.textContent = '✅ ¡COPIADO AL PORTAPAPELES!';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = ''; // Revertir al gradiente CSS
            }, 2000);
        } catch (err) {
            console.error('Copy failed', err);
            showStatusError('No se pudo copiar al portapapeles');
        }
    });
}

// ============================================
// REPORT RENDERER
// ============================================

async function renderReportTab() {
    const data = await chrome.storage.local.get(['lastBulkReport']);
    const r = data.lastBulkReport;

    const emptyState = document.getElementById('reportEmptyState');
    const content = document.getElementById('reportContent');

    if (!r) {
        emptyState.classList.remove('hidden');
        content.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    content.classList.remove('hidden');

    // Header Info
    document.getElementById('reportClientName').textContent = r.clientName || 'Cliente No Identificado';

    // Calcular Periodo Label
    let periodLabel = `AÑO ${r.period.year}`;
    if (r.breakdown && r.breakdown.length === 6) {
        periodLabel = r.breakdown[0].month === 0 ? `1ER SEMESTRE ${r.period.year}` : `2DO SEMESTRE ${r.period.year}`;
    }
    document.getElementById('reportPeriodLabel').textContent = periodLabel;

    // Totals
    const totalFacturasEl = document.getElementById('reportTotalFacturas');
    totalFacturasEl.textContent = r.totals.facturasCount;
    totalFacturasEl.style.cursor = 'pointer';
    totalFacturasEl.title = 'Copiar';
    totalFacturasEl.onclick = () => {
        navigator.clipboard.writeText(r.totals.facturasCount);
        totalFacturasEl.style.color = 'white';
        setTimeout(() => totalFacturasEl.style.color = '#10b981', 300);
    };

    // Total Retenciones summary
    const existingRetSummary = document.getElementById('reportTotalRetSummary');
    if (existingRetSummary) existingRetSummary.remove();

    const retSummaryDiv = document.createElement('div');
    retSummaryDiv.id = 'reportTotalRetSummary';
    retSummaryDiv.className = 'result-card';
    retSummaryDiv.style.borderLeftColor = '#f59e0b';
    retSummaryDiv.style.marginBottom = '16px';
    const totalBaseRet = (r.totals.retIvaBase || 0) + (r.totals.retRentaBase || 0);
    retSummaryDiv.innerHTML = `
        <div class="result-label">💰 Base Imponible Retenciones</div>
        <div class="result-val" style="color: #f59e0b;">$${totalBaseRet.toFixed(2)}</div>
        <div style="font-size: 9px; opacity: 0.5;">Suma de bases imponibles de Renta e IVA extraídas</div>
    `;

    // Insert after the second card or first one
    const insertPoint = document.getElementById('reportTotalRenta') || content.querySelector('.result-card');
    if (insertPoint) insertPoint.after(retSummaryDiv);

    // Total Renta (Annual Only)
    const existingRenta = document.getElementById('reportTotalRentaCard'); // Changed ID to avoid conflict
    if (existingRenta) existingRenta.remove();

    if (r.breakdown && r.breakdown.length === 12) {
        const totalSinIva = (r.totals.iva15 || 0) + (r.totals.iva0 || 0);
        const rentaDiv = document.createElement('div');
        rentaDiv.id = 'reportTotalRentaCard';
        rentaDiv.className = 'result-card';
        rentaDiv.style.borderLeftColor = '#60a5fa';
        rentaDiv.style.marginBottom = '16px';
        rentaDiv.style.cursor = 'pointer';
        rentaDiv.innerHTML = `
            <div class="result-label">TOTAL IMPUESTO A LA RENTA</div>
            <div class="result-val" style="color: #60a5fa;">$${totalSinIva.toFixed(2)}</div>
            <div style="font-size: 9px; opacity: 0.6;">Base 15% + Base 0%</div>
        `;
        rentaDiv.onclick = () => {
            navigator.clipboard.writeText(totalSinIva.toFixed(2));
            rentaDiv.style.background = 'rgba(255,255,255,0.1)';
            setTimeout(() => rentaDiv.style.background = '', 200);
        };

        // Insert after the retSummaryDiv
        retSummaryDiv.after(rentaDiv);
    }

    // Table
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';

    const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

    if (r.breakdown) {
        r.breakdown.forEach(m => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            const mName = monthNames[m.month];
            const f15 = parseFloat(m.data.facturas?.iva15?.baseImponible || 0).toFixed(2);
            const f0 = parseFloat(m.data.facturas?.iva0?.baseImponible || 0).toFixed(2);
            // Retenciones Total (IVA + Renta for space?) Or just separate? User asked for simplicity but detail.
            // Let's show Ret Count or Ret Value. The headers said "RET.". Let's assume Ret Total Amount (Iva+Renta) or just count?
            // "RET." usually implies Retentions Value. Let's sum Iva+Renta for the table column to save space, or just Ret IVA.
            // User requested "detalle de cada mes y el total".
            // Let's stick to the clipboard format: Base15, Base0, RetIVA, RetRenta is too wide for 400px popup.
            // Let's put Base15, Base0, and "Retenciones" (Sum of Iva+Renta) in the table.

            const retIva = parseFloat(m.data.retenciones?.ivaRetenido?.total || 0).toFixed(2);
            const retIvaBase = parseFloat(m.data.retenciones?.ivaRetenido?.baseTotal || 0).toFixed(2);
            const retRenta = parseFloat(m.data.retenciones?.rentaRetenida?.total || 0).toFixed(2);
            const retRentaBase = parseFloat(m.data.retenciones?.rentaRetenida?.baseTotal || 0).toFixed(2);

            tr.innerHTML = `
                <td style="padding: 10px 8px; color: #a5b4fc; font-weight: 700;">${mName}</td>
                <td style="padding: 10px 8px; text-align: right; font-family: monospace;">$${f15}</td>
                <td style="padding: 10px 8px; text-align: right; font-family: monospace; opacity: 0.7;">$${f0}</td>
                <td style="padding: 10px 8px; text-align: right; font-family: monospace; color: #d8b4fe;">$${retIva}<br><span style="font-size: 8px; opacity: 0.4;">B: $${retIvaBase}</span></td>
                <td style="padding: 10px 8px; text-align: right; font-family: monospace; color: #f472b6;">$${retRenta}<br><span style="font-size: 8px; opacity: 0.4;">B: $${retRentaBase}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// ============================================
// HELPERS
// ============================================

async function handleFormFilling(action, btnId, label) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = true;
    showStatus(`⏳ Llenando ${label}...`);

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const storage = await chrome.storage.local.get(['facturas', 'retenciones', 'workflowPeriod']);

        const response = await chrome.tabs.sendMessage(tab.id, {
            action,
            data: {
                facturas: storage.facturas || null,
                retenciones: storage.retenciones || null,
                year: storage.workflowPeriod?.year,
                monthIndex: storage.workflowPeriod?.monthIndex
            }
        });

        if (response.success) showStatus(`✅ ${label} completado.`);
        else throw new Error(response.error);
    } catch (e) { showStatusError(e.message); }
    finally { btn.disabled = false; }
}

async function ejecutarAccionSimple(msg, loadingText) {
    showStatus(loadingText);
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, msg);
    } catch (e) { showStatusError(e.message); }
}

function showStatus(text) {
    const status = document.getElementById('status');
    if (status) {
        status.classList.remove('hidden', 'error');
        status.textContent = text;
    }
}

function showStatusError(text) {
    const status = document.getElementById('status');
    if (status) {
        status.classList.remove('hidden');
        status.classList.add('error');
        status.textContent = `Error: ${text}`;
    }
}

// Formatter Utils (Legacy support)
function mostrarResultadosRetenciones(data) {
    const results = document.getElementById('resultsRetenciones');
    if (results) results.classList.remove('hidden');
    document.getElementById('ivaRetenidoValue').textContent = formatMoney(data.ivaRetenido.total);
    document.getElementById('rentaRetenidaValue').textContent = formatMoney(data.rentaRetenida.total);
    document.getElementById('ivaRetenidoCount').textContent = data.ivaRetenido.cantidad;
    document.getElementById('rentaRetenidaCount').textContent = data.rentaRetenida.cantidad;

    // Mostrar base total acumulada
    if (document.getElementById('retBaseValue')) {
        const totalBase = (data.ivaRetenido.baseTotal || 0) + (data.rentaRetenida.baseTotal || 0);
        document.getElementById('retBaseValue').textContent = formatMoney(totalBase);
    }
}

function mostrarResultadosNC(data) {
    const results = document.getElementById('resultsNotasCredito');
    if (results) results.classList.remove('hidden');
    document.getElementById('ncSinImpuestos').textContent = formatMoney(data.valorSinImpuestos || 0);
    document.getElementById('ncCount').textContent = data.totalNotas || 0;
}

function mostrarResultados(data) {
    const results = document.getElementById('results');
    if (results) results.classList.remove('hidden');
    document.getElementById('iva0Value').textContent = formatMoney(data.iva0.baseImponible);
    document.getElementById('iva15Value').textContent = formatMoney(data.iva15.baseImponible);
    document.getElementById('iva0Count').textContent = data.iva0.cantidad;
    document.getElementById('iva15Count').textContent = data.iva15.cantidad;
}

function mostrarPeriodo(periodo) {
    const container = document.getElementById('periodContainer');
    const value = document.getElementById('activePeriodValue');
    if (container) container.classList.remove('hidden');
    if (value) value.textContent = periodo;
}

function formatMoney(value) {
    return '$' + parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function toggleMonthSelector(bulkVal) {
    const monthContainer = document.getElementById('monthSelectorContainer');
    if (!monthContainer) return;

    if (bulkVal === 'monthly') {
        monthContainer.style.opacity = '1';
        monthContainer.style.pointerEvents = 'auto';
        monthContainer.querySelector('select').disabled = false;
    } else {
        monthContainer.style.opacity = '0.3';
        monthContainer.style.pointerEvents = 'none';
        monthContainer.querySelector('select').disabled = true;
    }
}

function getNinthDigit(ruc) {
    if (!ruc || ruc.length < 9) return 99;
    const char = ruc.charAt(8);
    const digit = parseInt(char, 10);
    if (isNaN(digit)) return 99;
    return digit === 0 ? 10 : digit;
}

async function renderClientsTab() {
    const listContainer = document.getElementById('clientsListContent');
    const searchVal = (document.getElementById('clientSearchInput')?.value || '').toLowerCase().trim();
    if (!listContainer) return;

    const data = await chrome.storage.local.get([
        'sc_ordered_matrix', 
        'sc_clients_matrix', 
        'sc_completed_rucs', 
        'last_declaration_completed'
    ]);

    let clients = data.sc_ordered_matrix || Object.values(data.sc_clients_matrix || {});

    // Live Database Sync: If local storage is empty, query Supabase cloud directly
    if (typeof fetchClientsFromSupabase === 'function') {
        const freshClients = await fetchClientsFromSupabase();
        if (freshClients && freshClients.length > 0) {
            clients = freshClients;
            const matrixMap = {};
            freshClients.forEach(c => { if (c.ruc) matrixMap[c.ruc.trim()] = c; });
            await chrome.storage.local.set({
                sc_ordered_matrix: freshClients,
                sc_clients_matrix: matrixMap
            });
        }
    }

    const completedRucs = data.sc_completed_rucs || [];
    if (data.last_declaration_completed?.ruc) {
        completedRucs.push(data.last_declaration_completed.ruc.replace(/\D/g, ''));
    }

    // Filter by search text
    let filtered = clients.filter(c => {
        if (!searchVal) return true;
        return (c.name || '').toLowerCase().includes(searchVal) || (c.ruc || '').includes(searchVal);
    });

    // Classify into PENDIENTES vs DECLARADOS
    const pendientes = [];
    const declarados = [];

    filtered.forEach(c => {
        const cleanRuc = (c.ruc || '').replace(/\D/g, '');
        const hasDoneDeclaration = Array.isArray(c.declarations) && c.declarations.some(d => {
            if (!d) return false;
            const p = String(d.period || '').toLowerCase().trim();
            const isPeriodMatch = p.includes('2026-07') || p.includes('2026-7') || p.includes('julio') || p.includes('07/2026');
            const st = String(d.status || '').toLowerCase().trim();
            const isStatusDone = st === 'pagada' || st === 'enviada' || st === 'declarado' || st === 'finalizado' || st === 'completado' || st.includes('declarad') || st.includes('pagad');
            const hasProof = !!d.proof_file && (typeof d.proof_file === 'object' ? Object.keys(d.proof_file).length > 0 : String(d.proof_file).length > 3);
            return isPeriodMatch && (isStatusDone || hasProof);
        });

        const isDone = completedRucs.includes(cleanRuc) || c.hasReceipt || hasDoneDeclaration;

        if (isDone) {
            declarados.push(c);
        } else {
            pendientes.push(c);
        }
    });

    // Sort pendientes by 9th digit
    pendientes.sort((a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc));
    declarados.sort((a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc));

    listContainer.innerHTML = '';

    // Render Pendientes Section
    if (pendientes.length > 0) {
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = 'font-size: 10px; font-weight: 800; color: #10b981; text-transform: uppercase; margin: 8px 0 6px 0; display: flex; align-items: center; gap: 4px;';
        titleDiv.innerHTML = `<span>⏳ PENDIENTES DE DECLARACIÓN (${pendientes.length})</span>`;
        listContainer.appendChild(titleDiv);

        pendientes.forEach(c => {
            const digit = getNinthDigit(c.ruc);
            const card = document.createElement('div');
            card.style.cssText = 'background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 10px; margin-bottom: 8px; font-size: 11px;';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                    <div>
                        <div style="font-weight: 800; color: white;">${c.name}</div>
                        <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">RUC: ${c.ruc} · <span style="color: #fbbf24;">Dígito ${digit === 10 ? 0 : digit}</span></div>
                    </div>
                    <span style="font-size: 9px; padding: 2px 6px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border-radius: 6px; font-weight: 700;">⏳ JULIO PENDIENTE</span>
                </div>
                <button class="btn btn-declare-client" data-ruc="${c.ruc}" data-name="${c.name}" data-pass="${c.sriPassword || ''}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 8px; font-size: 10px; font-weight: 800; border: none; border-radius: 8px; width: 100%; cursor: pointer;">
                    🟢 LUZ VERDE · DECLARAR EN SRI
                </button>
            `;
            listContainer.appendChild(card);
        });
    }

    // Render Declarados Section
    if (declarados.length > 0) {
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = 'font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin: 16px 0 6px 0; opacity: 0.8;';
        titleDiv.innerHTML = `<span>✅ DECLARACIONES COMPLETADAS (${declarados.length})</span>`;
        listContainer.appendChild(titleDiv);

        declarados.forEach(c => {
            const digit = getNinthDigit(c.ruc);
            const card = document.createElement('div');
            card.style.cssText = 'background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 10px; margin-bottom: 8px; font-size: 11px; opacity: 0.75;';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                    <div>
                        <div style="font-weight: 700; color: #cbd5e1;">${c.name}</div>
                        <div style="font-size: 10px; color: #64748b; font-family: monospace;">RUC: ${c.ruc} · Dígito ${digit === 10 ? 0 : digit}</div>
                    </div>
                    <span style="font-size: 9px; padding: 2px 6px; background: rgba(16, 185, 129, 0.15); color: #34d399; border-radius: 6px; font-weight: 700;">✅ COMPLETADO</span>
                </div>
                <button class="btn btn-declare-client" data-ruc="${c.ruc}" data-name="${c.name}" data-pass="${c.sriPassword || ''}" style="background: rgba(255,255,255,0.05); color: #cbd5e1; padding: 6px; font-size: 9px; font-weight: 700; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; width: 100%; cursor: pointer; margin-top: 4px;">
                    🔄 RE-ABRIR EN SRI
                </button>
            `;
            listContainer.appendChild(card);
        });
    }

    if (pendientes.length === 0 && declarados.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 11px;">No se encontraron clientes.</div>';
    }

    // Attach click events for declare buttons
    const buttons = listContainer.querySelectorAll('.btn-declare-client');
    buttons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const ruc = e.target.dataset.ruc;
            const name = e.target.dataset.name;
            const pass = e.target.dataset.pass;

            await chrome.storage.local.set({
                pending_sri_autofill: { ruc, password: pass, name },
                activeClient: { ruc, sriPassword: pass, name },
                ruc: ruc,
                sriPassword: pass,
                pendingAction: 'startIvaNavigation',
                actionTimestamp: Date.now(),
                workflowPeriod: { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 }
            });

            chrome.tabs.create({ url: 'https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=tuportal-internet&redirect_uri=https%3A%2F%2Fsrienlinea.sri.gob.ec%2Ftuportal-internet%2FaccederAplicacion.jspa%3Fredireccion%3D60%26idGrupo%3D55&response_type=code&scope=openid' });
        });
    });
}
