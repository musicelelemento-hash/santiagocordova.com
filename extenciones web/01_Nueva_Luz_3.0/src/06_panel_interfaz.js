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
            isProcessingFinal: false,
            isPostSubmitClosing: false
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

    async init() {
        try {
            // ELITE v13.0: XML Trap Escape (Bugs de PrimeFaces SRI)
            if (document instanceof XMLDocument || document.contentType?.includes('xml') || document.querySelector('partial-response')) {
                console.error('❌ [SRI ELITE] Trampa XML detectada. El SRI colapsó el ViewState. Escapando vía puente SSO...');
                window.location.href = SRI_PUENTE_FORMULARIO_IVA;
                return;
            }

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
            
            // Seguridad extra por si el contenedor no soporta estilos
            if (!this.container.style) {
                console.warn('⚠️ [SRI ELITE] El documento no soporta HTML styling. Abortando HUD.');
                return;
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
            SafeStorage.get(['assistantExpanded', 'ghost_manual_mode', 'auto_batch_enabled', 'pendingAction']).then(stored => {
                const isExp = stored.assistantExpanded !== undefined ? stored.assistantExpanded : true;
                if (this.isExpanded !== isExp) {
                    this.isExpanded = isExp;
                    this.render(); // Re-render with right state if changed
                }
                // Restaurar modo manual solo si NO hay un flujo automático activo
                const hasActiveAutoFlow = !!(stored.auto_batch_enabled || stored.pendingAction);
                if (stored.ghost_manual_mode === true && !hasActiveAutoFlow && !this.manualMode) {
                    this.manualMode = true;
                    this.render();
                    console.log('🛠️ [INIT] Modo Manual restaurado desde storage persistente.');
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
                if (!this._heartbeatLogged) {
                    this._heartbeatLogged = true;
                    console.log('💓 Ghost Heartbeat: Sesión activa y protegida.');
                }
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
        const url = window.location.href;
        const enAreaDeEscaneo = url.includes('inicio.jsf') ||
                                url.includes('general/inicio') ||
                                url.includes('inicio/NAT') ||
                                url.includes('/contribuyente/perfil');

        // Con el formulario de credenciales en pantalla no hay sesión, y sin
        // sesión no hay obligaciones que escanear.
        const enLogin = typeof encontrarCamposLogin === 'function' && !!encontrarCamposLogin();

        if (enAreaDeEscaneo && !enLogin) {
            if (!this.scanInterval) {
                console.log('📡 [SCANNER] Iniciando escáner de obligaciones en esta área...');
                this._escaneosVacios = 0;
                setTimeout(() => this.scanObligacionesSRI(), 800);
                this.scanInterval = setInterval(() => this.scanObligacionesSRI(), 5000);
            }
        } else {
            this.detenerEscaner(enLogin ? 'pantalla de login' : 'fuera del área');
        }
    }

    detenerEscaner(motivo) {
        if (!this.scanInterval) return;
        console.log(`🔕 [SCANNER] Escáner detenido (${motivo}).`);
        clearInterval(this.scanInterval);
        this.scanInterval = null;
    }

    /**
     * Corta el escaneo tras varios intentos sin encontrar el bloque de
     * obligaciones. Antes seguía cada 5 segundos indefinidamente, llenando la
     * consola en páginas donde ese bloque simplemente no existe (inicio/NAT).
     */
    registrarEscaneoVacio() {
        this._escaneosVacios = (this._escaneosVacios || 0) + 1;
        if (this._escaneosVacios >= 5) {
            this.detenerEscaner('no hay bloque de obligaciones en esta página');
        }
    }

    // ELITE v9.5: Detector de Éxito de Declaración
    async checkMissionAccomplished() {
        const currentUrl = window.location.href.toLowerCase();
        if (!currentUrl.includes('declaraciones') && !currentUrl.includes('recibirdeclaracion')) return;

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
            if (el && (typeof esVisible === 'function' ? esVisible(el) : el.offsetParent !== null)) {
                const text = el.innerText.toUpperCase();
                if (successText.some(t => text.includes(t))) {
                    found = true;
                    break;
                }
            }
        }

        if (found && !this.missionReportShown) {
            this.missionReportShown = true;
            console.log('🏆 ¡MISIÓN CUMPLIDA! Declaración detectada con éxito.');
            const info = this.extractClientInfo();

            // ELITE FIX: Limpiar estado pendiente de inmediato ANTES de capturar el PDF,
            // así si el usuario se desespera y cierra sesión, o la página se rompe, no entramos en un loop de auto-login fantasma.
            let preFetchedGhostData = {};
            if (typeof GhostMemory !== 'undefined') {
                preFetchedGhostData = await GhostMemory.getData().catch(() => ({}));
                GhostMemory.clearCurrent().catch(() => {});
            }
            SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod', 'sriAutomationPaused', 'pending_sri_autofill']).catch(() => {});
            

            // 1. Clic automático en botón IMPRIMIR PDF ubicado AL FINAL de la página
            setTimeout(async () => {
                const printSpans = Array.from(document.querySelectorAll('span.ui-button-text.ui-c, span.ui-button-text, button, a'))
                    .filter(el => {
                        const txt = (el.innerText || el.textContent || '').trim().toUpperCase();
                        return txt === 'IMPRIMIR' || txt.includes('IMPRIMIR');
                    });

                // El botón de imprimir está al final de la página (último de la lista)
                const printBtn = printSpans.length > 0 ? printSpans[printSpans.length - 1] : null;

                if (!printBtn) {
                    console.warn('⚠️ No se encontró el botón de Imprimir al final de la página, pero continuaremos con la sincronización...');
                }

                // Esperar a que se capture el PDF (si se abre stream) y sincronizar a Supabase
                await sleep(1500);

                if (info.ruc) {
                    const now = new Date();
                    const periodStr = `${now.getFullYear()}-${(now.getMonth()).toString().padStart(2, '0')}`;
                    try {
                        const cacheRes = await chrome.storage.local.get(['sc_clients_cache']);
                        let cacheList = cacheRes.sc_clients_cache || [];
                        let updated = false;
                        cacheList = cacheList.map(c => {
                            if (c.ruc === info.ruc) {
                                updated = true;
                                const decs = Array.isArray(c.declarations) ? c.declarations : [];
                                decs.push({
                                    period: periodStr,
                                    proof_file: {
                                        name: `Declaracion_IVA_${info.ruc}_${periodStr}.pdf`,
                                        type: 'pdf',
                                        size: capturedPdfBase64 ? Math.round(capturedPdfBase64.length * 0.75) : 2048,
                                        lastModified: Date.now(),
                                        content: capturedPdfBase64 || '',
                                        metadata: { period: periodStr, uploadedAt: new Date().toISOString() }
                                    },
                                    date: Date.now()
                                });
                                return { ...c, declarations: decs };
                            }
                            return c;
                        });
                        if (updated) {
                            await chrome.storage.local.set({ sc_clients_cache: cacheList });
                        }
                        // Sincronizar en la nube con Supabase incluyendo el objeto de PDF de respaldo
                        await syncDeclarationToSupabase(info.ruc, periodStr, capturedPdfBase64, info.name, preFetchedGhostData);
                    } catch(e) { console.warn('Error al actualizar historial:', e); }
                }

                // Cleanup ya realizado arriba por seguridad inmediata.

                // Modo Auto Bucle Check (Poderes Auto Admin)
                const sigueElLote = await loteDebeContinuar();
                if (sigueElLote) {
                    console.log('🔄 [MODO AUTO BUCLE] Declaración exitosa. Avanzando al siguiente cliente en 3 segundos...');
                    setTimeout(async () => {
                        const batchNext = await handleBatchNextClient();
                        if (!batchNext) {
                            console.log('🏁 [SESIÓN] No hay más clientes en lote. Cerrando sesión para el siguiente manual...');
                            await SafeStorage.set({ sri_auto_mode: false });
                            await cerrarSesionSRI();
                        }
                    }, 3000);
                } else {
                    console.log('🏁 [SESIÓN] Declaración única finalizada. Cerrando sesión en 3 segundos...');
                    setTimeout(async () => {
                        this.showEliteToast({
                            title: "✅ Libre",
                            msg: "Proceso terminado. Cerrando sesión...",
                            duration: 3000
                        });
                        await cerrarSesionSRI();
                    }, 3000);
                }

            }, 500);

            this.showEliteToast({
                title: "🏆 MISIÓN CUMPLIDA",
                msg: `La declaración de ${info.name || info.ruc} fue enviada con éxito. PDF descargado.`,
                duration: 10000
            });

            this.log('🏆 Declaración Exitosa.');
            this.renderMissionSuccessHUD();
        }
    }

    renderMissionSuccessHUD() {
        const status = this.container.querySelector('#sri-panel-status');
        if (status) {
            SafeStorage.get(['sc_clients_cache', 'workflowPeriod', 'auto_batch_queue']).then(res => {
                const now = new Date();
                let cMonth = now.getMonth() - 1;
                let cYear = now.getFullYear();
                if (cMonth < 0) { cMonth = 11; cYear--; }
                const targetPeriodStr = `${cYear}-${(cMonth + 1).toString().padStart(2, '0')}`;
                
                const cacheList = Array.isArray(res.sc_clients_cache) ? res.sc_clients_cache : [];
                
                // Find next pending client
                let nextClient = null;
                for (let c of cacheList) {
                    const decs = Array.isArray(c.declarations) ? c.declarations : (Array.isArray(c.declaration_history) ? c.declaration_history : []);
                    const hasPdf = decs.some(d => d.proof_file && (d.period || '').includes(targetPeriodStr));
                    if (!hasPdf) {
                        nextClient = c;
                        break;
                    }
                }

                let nextBtnHtml = '';
                if (nextClient) {
                    nextBtnHtml = `
                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(16, 185, 129, 0.3);">
                            <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px; color: #065f46;">Siguiente Pendiente:</div>
                            <div style="font-size: 11px; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nextClient.name}</div>
                            <button id="btn-success-next" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 800; width: 100%; margin-bottom: 4px;">▶ INGRESAR AL SIGUIENTE</button>
                        </div>
                    `;
                }

                status.innerHTML = `
                    <div style="background: rgba(16, 185, 129, 0.1); padding: 5px; border-radius: 8px; border: 1px solid #10b981;">
                        <div style="color: #10b981; font-weight: 800; font-size: 11px;">🏆 ÉXITO DETECTADO</div>
                        <div style="font-size: 10px; margin-top: 4px;">¡Felicidades! PDF descargado y cliente registrado en la base.</div>
                        <button id="btn-success-cleanup" style="margin-top: 8px; background: #10b981; color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-weight: 800; width: 100%;">🚪 CERRAR SESIÓN</button>
                        ${nextBtnHtml}
                    </div>
                `;
                
                const btnCleanup = status.querySelector('#btn-success-cleanup');
                if (btnCleanup) {
                    btnCleanup.onclick = async () => {
                        await GhostMemory.clearCurrent();
                        cerrarSesionSRI();
                    };
                }

                const btnNext = status.querySelector('#btn-success-next');
                if (btnNext && nextClient) {
                    btnNext.onclick = async () => {
                        btnNext.innerText = '⏳ Cargando...';
                        await SafeStorage.set({
                            auto_batch_enabled: false,
                            pending_sri_autofill: {
                                ruc: nextClient.ruc,
                                password: nextClient.sri_password || nextClient.password,
                                name: nextClient.name,
                                timestamp: Date.now(),
                                manual: true,
                                isBatch: false
                            }
                        });
                        await GhostMemory.clearCurrent();
                        console.log('🔒 Cerrando sesión SRI para iniciar con el siguiente cliente...');
                        cerrarSesionSRI();
                    };
                }
            });
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

            if (!this.suggestionShownOnThisPage) {
                this.suggestionShownOnThisPage = true;

                // Obtener el periodo activo para construir una clave única por periodo
                const stored = await SafeStorage.get(['workflowPeriod', 'autoDeclaration', 'sri_auto_mode']);
                const isAutoActive = !!(stored.autoDeclaration || stored.sri_auto_mode);
                const period = stored.workflowPeriod;

                if (isAutoActive) {
                    // En modo AUTO: disparar siempre, sin caché de storage
                    console.log('🚀 [Detection] Modo auto activo – iniciando llenado en 1.5s...');
                    setTimeout(() => this.suggestWorkflowStartOnForm(), 1500);
                } else {
                    // En modo MANUAL: usar clave por RUC+periodo para no molestar de nuevo
                    const info = this.extractClientInfo();
                    const periodStr = period ? `${period.monthIndex}_${period.year}` : 'default';
                    const cacheKey = `suggestion_shown_${info.ruc || 'default'}_${periodStr}`;
                    const res = await SafeStorage.get(cacheKey);
                    if (!res[cacheKey]) {
                        await SafeStorage.set({ [cacheKey]: true });
                        setTimeout(() => this.suggestWorkflowStartOnForm(), 1500);
                    } else {
                        console.log('🛑 [Detection] Sugerencia ya mostrada para este periodo (modo manual).');
                    }
                }
            }
        } else if (!this.isOnForm && wasOnForm) {
            this.render(); // Re-renderizar para quitar el card si salimos
        }
    }

    // ELITE v12.7+: Toggle Modo Manual (persiste en storage)
    async toggleManualMode(val) {
        this.manualMode = val !== undefined ? val : !this.manualMode;
        console.log(`🛠️ Modo Manual: ${this.manualMode ? 'ACTIVADO' : 'DESACTIVADO'}`);

        if (this.manualMode) {
            // DESACTIVAR auto-mode en storage persistente
            await SafeStorage.set({
                autoDeclaration: false,
                sri_auto_mode: false,
                ghost_manual_mode: true
            });
            this.showEliteToast({
                title: '🛠️ MODO MANUAL ACTIVADO',
                msg: 'El asistente NO ejecutará acciones automáticas. Solo responderá a tus clics.',
                duration: 5000
            });
        } else {
            // RESTAURAR auto-mode al salir del modo manual
            await SafeStorage.set({
                autoDeclaration: true,
                sri_auto_mode: true,
                ghost_manual_mode: false
            });
            this.showEliteToast({
                title: '🤖 MODO AUTO REACTIVADO',
                msg: 'El asistente vuelve a ejecutarse automáticamente.',
                duration: 4000
            });
        }

        this.render();
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

            const autoModeRes = await chrome.storage.local.get(['sri_auto_mode']);
            const isAutoActive = !!(storage.autoDeclaration || autoModeRes.sri_auto_mode);

            if (period) {
                console.log(`🚀 [ELITE] Lanzando sugerencia de llenado fase 3 (Auto: ${isAutoActive})...`);
                this.suggestStep3(isAutoActive);
                return;
            }
        }

        // 2. SEGUNDO: Si NO hay datos en GhostMemory, verificar el estado del formulario
        const isEmpty = await this.isFormEmpty();
        if (!isEmpty) {
            console.log('💎 Formulario con valores o sugeridos detectados en pantalla.');
            const storage = await SafeStorage.get(['workflowPeriod', 'autoDeclaration', 'sri_auto_mode', 'auto_batch_enabled']);
            const isAutoActive = !!(storage.autoDeclaration || storage.sri_auto_mode || storage.auto_batch_enabled);

            console.log(`💎 Formulario con valores detectados. Mostrando resumen y temporizador (Auto: ${isAutoActive})...`);
            this.suggestStep3(isAutoActive);
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
            timeout: null,
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

    /**
     * El período fiscal que está declarando esta pantalla.
     *
     * **El 07-sep-2026 esto guardó una declaración de agosto de 2026 como si
     * fuera de agosto de 2023.** Buscaba el año así:
     *
     *     headerText.match(/202[0-9]/)
     *
     * El primer `202X` del texto de la cabecera — y la cabecera muestra el RUC
     * del contribuyente. `0706482023001` lleva `2023` adentro.
     *
     * Lo peor es que no fallaba siempre: RODRIGUEZ GUTIERREZ (1722764808001)
     * salió bien porque su RUC no contiene ningún `202X`. Un bug que muerde a
     * unos clientes y a otros no parece que funciona.
     *
     * Y el daño no es cosmético: la ruta de R2 y la clave de Supabase se arman
     * con este período. El panel sigue diciendo que el mes no tiene
     * comprobante, y encima se pisa la fila de un período viejo que sí puede
     * tener uno. Es lo contrario del objetivo de la §0.
     *
     * Ahora se pregunta en orden de confiabilidad, y **ninguna de las fuentes
     * adivina**:
     *
     *   1. `frmFlujoDeclaracion:calPeriodo` — el campo del wizard, `mm/yyyy`.
     *      Es el período que el portal aceptó. Está en la Matriz de la §6.
     *   2. La cabecera, pero leyendo «MES AÑO» **juntos** y exigiendo que el
     *      año no venga pegado a otros dígitos.
     *
     * Devuelve `null` cuando no puede saberlo. `null` es una respuesta
     * honesta; un año sacado de un RUC no lo es.
     */
    extractFormPeriod() {
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
                       'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        try {
            // ── 1 · El campo del wizard. Sin ambigüedad posible ──────────────
            const cal = document.getElementById('frmFlujoDeclaracion:calPeriodo') ||
                        document.querySelector('[id$="calPeriodo"]');
            if (cal) {
                const crudo = (cal.value || cal.getAttribute('value') || '').trim();
                const mm = crudo.match(/^(\d{1,2})\s*\/\s*(20\d{2})$/);
                if (mm) {
                    const mes = parseInt(mm[1], 10);
                    if (mes >= 1 && mes <= 12) {
                        return { month: mes, year: parseInt(mm[2], 10),
                                 monthName: meses[mes - 1], via: 'calPeriodo' };
                    }
                }
            }

            // ── 2 · La cabecera, leyendo el mes y el año COMO UNA UNIDAD ─────
            // Nunca un año suelto: eso es lo que agarraba el RUC. Y sin el HUD
            // de la extensión, que también tiene texto y números propios.
            // **Nunca `document.body`.** Ese era el otro medio del mismo bug:
            // sin cabecera identificable, se raspaba la página entera —el HUD
            // de la extensión incluido, que tiene meses y años propios— y
            // salía cualquier período. Es la tercera vez que este proyecto
            // tropieza con el bot leyéndose a sí mismo (los modales, el login,
            // y ahora esto). Si no hay cabecera, no hay período que leer: se
            // contesta `null` y decide `workflowPeriod`, que es lo que el bot
            // efectivamente navegó.
            const zona = document.querySelector('.contenido-cabecera') ||
                         document.querySelector('#j_idt15_content');
            if (!zona) return null;
            const limpio = zona.cloneNode(true);
            limpio.querySelectorAll('[id^="sri-"], [id^="slh-"], [class*="sri-assistant"], [class*="ghost-"]')
                  .forEach((n) => n.remove());
            const texto = (limpio.innerText || '').toUpperCase();

            // «AGOSTO 2026», «AGOSTO DE 2026», «AGOSTO - 2026». El año tiene que
            // terminar ahí: `(?!\d)` impide que `2023001` cuente como 2023.
            for (let i = 0; i < meses.length; i++) {
                const re = new RegExp(meses[i] + '\\s*(?:DE\\s*|[-/]\\s*)?(20\\d{2})(?!\\d)');
                const m = texto.match(re);
                if (m) {
                    return { month: i + 1, year: parseInt(m[1], 10),
                             monthName: meses[i], via: 'cabecera' };
                }
            }

            // Antes había acá un tercer camino que devolvía «el mes pasado» con
            // el año sacado del RUC. Se fue: inventar un período es peor que no
            // saberlo, porque el comprobante se archiva igual y en el lugar
            // equivocado. Quien llama sabe qué hacer con un null.
            return null;
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
            console.log(`👤 Cambio de contexto de cliente detectado: ${stored.lastRuc} -> ${info.ruc}. Limpiando memoria previa...`);
            await GhostMemory.clearCurrent();
            await SafeStorage.set({ lastRuc: info.ruc, sriAutomationPaused: false });
            this.updateSummary();
            this.showEliteToast({
                title: "👤 CLIENTE ACTIVADO",
                msg: `<b>${info.name || info.ruc}</b>`,
                duration: 3500
            });
        }

        // Actualizar siempre el RUC actual como el "activo"
        await SafeStorage.set({ lastRuc: info.ruc, lastClientName: info.name });

        // Refrescar UI Pill con el nombre
        if (info.name) this.renderPill();
    }

    extractClientInfo() {
        let res = { name: '', ruc: '', highConfidence: false };

        try {
            // ELITE v14.7: Soporte Encabezado Contribuyente en inicio/NAT
            const natHeaderEl = document.querySelector('div.nombre-contribuyente, .nombre-contribuyente, div.alinear-derecha');
            if (natHeaderEl) {
                const text = natHeaderEl.innerText || natHeaderEl.textContent || '';
                const rMatch = text.match(/\d{13}/);
                if (rMatch) {
                    res.ruc = rMatch[0];
                    const cleanLines = text.split('\n').map(l => l.trim()).filter(l => l && !l.includes(res.ruc));
                    res.name = cleanLines.join(' ') || 'Cliente SRI';
                    res.highConfidence = true;
                    console.log('💎 [ELITE] Cliente detectado via NAT Header Div:', res);
                    return res;
                }
            }

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
            '#topbar',
            '.area-usuario',
            '.nombre-contribuyente',
            '.nombreContribuyente',
            '.ui-panel-title',
            '.ui-topbar',
            '.topbar-item-name',
            '#nombre_razon_social',
            '.persona',
            'div[id*="razonSocial"]',
            'span[id*="razonSocial"]',
            '.layout-topbar .ui-topbar-group-right'
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
                    if (rect.top < 340 && rect.top > -40 && rect.height > 0) { // Header ampliado (topbar/nav variables)
                        const rucMatch = text.match(/\d{13}/);
                        if (rucMatch && !BLACKLIST_RUCS.includes(rucMatch[0])) {
                            // Verificar contexto semántico cercano
                            const context = (node.parentElement.innerText || "").toUpperCase();
                            if (context.includes('RUC') || context.includes('CONTRIBUYENTE') || context.includes('BIENVENIDO') || context.includes('DATOS') || context.includes('IDENTIFICACION') || context.includes('USUARIO') || context.includes('PERFIL') || context.includes('CUENTA')) {
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
        const st = await SafeStorage.get(['sri_master_switch_on', 'ghost_manual_mode', 'auto_batch_enabled']);
        if (st.ghost_manual_mode === true || this.manualMode) return;

        // ELITE v14.8: Escáner Proactivo (En Portada o en Perfil del Contribuyente)
        const isPerfil = window.location.href.includes('perfil');
        const isHome = window.location.href.includes('inicio.jsf') || window.location.href.includes('general/inicio') || window.location.href.includes('inicio/NAT');

        if (!isHome && !isPerfil) return;
        if (this.suggestionDismissed) return; // Respetar decisión del usuario
        if (this.contextCard) return; // No acosar si ya se está mostrando el mensaje

        // Si el formulario de credenciales está en pantalla, no hay sesión y no
        // hay obligaciones que escanear. (Antes se buscaba un input llamado
        // 'usuario', que en el login del SRI no existe.)
        if (typeof encontrarCamposLogin === 'function' && encontrarCamposLogin()) {
            console.log('🔒 [ELITE SCANNER] Pantalla de login detectada. Escáner silenciado.');
            return;
        }

        const tryScan = async (retryCounter = 0) => {
            const bodyText = document.body.innerText;
            const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

            // 🚀 ELITE: Si estamos en perfil y no hay rastro de obligaciones, intentar expandir
            const panelProximas = findByText('Próximas Obligaciones', 'span') || findByText('próximas obligaciones', 'div');
            if (isPerfil && panelProximas && retryCounter === 0) {
                console.log('📬 [ELITE SCANNER] Forzando expansión de panel de obligaciones...');
                const expandBtn = panelProximas.closest('.ui-panel-header') || panelProximas;
                expandBtn.click();
                await sleep(600); // Espera mínima optimizada
                return tryScan(1); 
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

                    // El temporizador automático solo puede arrancar si el
                    // semáforo está en CORRIENDO.
                    const isAuto = await SriLoop.puedeAvanzar();

                    if (isAuto) {
                        console.log('⚡ [ELITE SCANNER] Modo automático activo: iniciando TURBO_FULL de inmediato hacia Comprobantes Recibidos...');
                        this.runUnifiedWorkflow('TURBO_FULL', { monthIndex, year: detectedYear });
                        return;
                    }

                    // MODO MANUAL: Mostrar tarjeta interactiva
                    this.showContextCard({
                        title: `📅 Declaración ${isExpired ? '⚠️ VENCIDA' : 'Detectada'}`,
                        subtitle: `${detectedMonth} ${detectedYear} ${isExpired ? '(Con Multas)' : ''}`,
                        message: `
                            Se detectó la obligación <b>2011 (IVA)</b> de ${detectedMonth} ${detectedYear}.
                            <br>Haz click para iniciar la declaración automatizada.
                        `,
                        icon: '🚀',
                        actionText: '🪄 INICIAR MÁGIA (ELITE)',
                        timeout: null,
                        magicMode: true,
                        onAction: () => {
                            this.runUnifiedWorkflow('TURBO_FULL', { monthIndex, year: detectedYear });
                        },
                        secondaryActions: [
                            {
                                text: '❌ Omitir / Cancelar',
                                action: () => {
                                    this.suggestionDismissed = true;
                                    if (this.contextCard) {
                                        this.contextCard.remove();
                                        this.contextCard = null;
                                    }
                                    if (this.contextOverlay) {
                                        this.contextOverlay.remove();
                                        this.contextOverlay = null;
                                    }
                                    this.showEliteToast({ title: '⏸️ Cancelado', msg: 'Declaración omitida.' });
                                }
                            }
                        ]
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
     * ELITE FIX: Temporizador de 3s con resumen explícito de lo que se va a declarar y botón de DETENER.
     */
    async suggestStep3(isAuto = false) {
        if (this.state.isProcessing) return;
        this.clearCards();

        const storage = (await GhostMemory.getData()) || {};
        const clientInfo = this.extractClientInfo();
        const periodObj = this.extractFormPeriod() || (await SafeStorage.get(['workflowPeriod'])).workflowPeriod || { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 };

        const monthNames = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
        const pMonthName = periodObj.monthIndex !== undefined ? (monthNames[periodObj.monthIndex] || 'AGOSTO') : (periodObj.monthName || 'AGOSTO');
        const pYear = periodObj.year || new Date().getFullYear();

        // Leer valores de inputs en el DOM si ya están presentes
        const getDomVal = (idNum) => {
            const inp = document.querySelector(`input[id*="concepto${idNum}"], input[id*="casillero${idNum}"]`);
            return inp && inp.value ? parseDecimal(inp.value) : 0;
        };

        const vIva = (storage.facturas?.ventasIva !== undefined && storage.facturas?.ventasIva > 0) 
            ? storage.facturas.ventasIva 
            : (getDomVal('401') || getDomVal('411'));
        const v0 = (storage.facturas?.ventas0 !== undefined && storage.facturas?.ventas0 > 0) 
            ? storage.facturas.ventas0 
            : (getDomVal('403') || getDomVal('413') || getDomVal('405') || getDomVal('415'));
        const cAnt = (storage.creditoAnterior !== undefined && storage.creditoAnterior > 0) 
            ? storage.creditoAnterior 
            : (getDomVal('605') || getDomVal('615'));
        const ret = (storage.retenciones?.ivaRetenido?.total !== undefined && storage.retenciones?.ivaRetenido?.total > 0) 
            ? storage.retenciones.ivaRetenido.total 
            : getDomVal('609');
        const totalPagar = getDomVal('902') || getDomVal('999');

        const analysis = {
            ventasIva: Number(vIva || 0).toFixed(2),
            ventas0: Number(v0 || 0).toFixed(2),
            creditoAnt: Number(cAnt || 0).toFixed(2),
            retenciones: Number(ret || 0).toFixed(2),
            totalPagar: Number(totalPagar || 0).toFixed(2)
        };

        let secondsLeft = 3;
        let cancelled = false;
        let countdownInterval = null;

        const doFullFill = () => {
            if (cancelled) return;
            if (countdownInterval) clearInterval(countdownInterval);
            this.handleFillForm('TODO');
        };

        const autoTimerHtml = isAuto
            ? `<div style="text-align:center; margin:12px 0 8px; font-size:13px; color:#38bdf8; background:rgba(56,189,248,0.12); padding:10px; border-radius:10px; border:1px solid rgba(56,189,248,0.3); font-weight:700;">
                ⏳ Declarando automáticamente en: <b id="sri-fill-countdown" style="color:#ef4444; font-size:22px; font-weight:900; margin-left:6px;">${secondsLeft}s</b>
               </div>`
            : `<div style="text-align:center; margin-top:10px; font-size:12px; color:#94a3b8;">Verifica los valores antes de presionar Declarar.</div>`;

        // 🛑 En modo automático NO se abre la tarjeta modal: showContextCard
        // dibuja un overlay negro con blur sobre toda la página, así que el bot
        // quedaba llenando el formulario detrás de un velo, y la tarjeta —que
        // trae botón— parecía pedir permiso cuando en realidad ya había
        // arrancado. El avance se sigue por el HUD y por un aviso no bloqueante.
        if (isAuto) {
            this.showEliteToast({
                title: `💎 Declarando ${pMonthName} ${pYear}`,
                msg: `${clientInfo.name || 'Cliente'} · Ventas $${analysis.ventasIva} · Retenciones $${analysis.retenciones}`,
                duration: 4000
            });
            doFullFill();
            return;
        }

        this.showContextCard({
            title: `💎 Declaración SRI: ${pMonthName} ${pYear}`,
            subtitle: `${clientInfo.name || 'Cliente'} (${clientInfo.ruc || 'SRI'})`,
            message: `
                <div style="background:rgba(0,0,0,0.25); padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.08); margin-bottom:8px;">
                    <div style="font-size:11px; font-weight:800; color:#cbd5e1; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em; display:flex; justify-content:space-between;">
                        <span>📋 Resumen Fiscal a Declarar</span>
                        <span style="color:#10b981;">IVA 2011</span>
                    </div>
                    <div class="analysis-elite-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
                        <div class="analysis-item" style="background:rgba(255,255,255,0.03); padding:8px; border-radius:8px;">
                            <span style="display:block; font-size:9px; color:#94a3b8; text-transform:uppercase;">Ventas IVA</span>
                            <b style="font-size:13px; color:#10b981;">$${analysis.ventasIva}</b>
                        </div>
                        <div class="analysis-item" style="background:rgba(255,255,255,0.03); padding:8px; border-radius:8px;">
                            <span style="display:block; font-size:9px; color:#94a3b8; text-transform:uppercase;">Ventas 0%</span>
                            <b style="font-size:13px; color:#f59e0b;">$${analysis.ventas0}</b>
                        </div>
                        <div class="analysis-item" style="background:rgba(255,255,255,0.03); padding:8px; border-radius:8px;">
                            <span style="display:block; font-size:9px; color:#94a3b8; text-transform:uppercase;">Crédito 605</span>
                            <b style="font-size:13px; color:#60a5fa;">$${analysis.creditoAnt}</b>
                        </div>
                        <div class="analysis-item" style="background:rgba(255,255,255,0.03); padding:8px; border-radius:8px;">
                            <span style="display:block; font-size:9px; color:#94a3b8; text-transform:uppercase;">Reten. 609</span>
                            <b style="font-size:13px; color:#a78bfa;">$${analysis.retenciones}</b>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid rgba(255,255,255,0.1);">
                        <span style="font-size:11px; font-weight:700; color:#e2e8f0;">Total Impuesto a Pagar:</span>
                        <b style="font-size:14px; color:${Number(analysis.totalPagar) > 0 ? '#ef4444' : '#10b981'};">$${analysis.totalPagar}</b>
                    </div>
                </div>
                ${autoTimerHtml}
            `,
            icon: '📊',
            actionText: '⚡ DECLARAR AHORA (SIN ESPERAR)',
            onAction: () => {
                cancelled = false;
                if (countdownInterval) clearInterval(countdownInterval);
                doFullFill();
            },
            secondaryActions: [
                {
                    text: '🛑 DETENER (PASAR A MANUAL)',
                    onAction: async () => {
                        cancelled = true;
                        if (countdownInterval) clearInterval(countdownInterval);
                        await this.stopAutomation(false);
                    }
                }
            ]
        });

        if (isAuto) {
            countdownInterval = setInterval(() => {
                if (cancelled) {
                    clearInterval(countdownInterval);
                    return;
                }
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

        const SAFE_PATTERNS = [
            'CASILLERO 625',
            'FACULTAD DETERMINADORA',
            'CODIGO TRIBUTARIO',
            'CREDITO TRIBUTARIO NO HAYA SUPERADO LOS 5 ANOS',
            'ARTICULO 68',
            'ART. 68',
            'NO PRESENTA INCONSISTENCIAS',
            'INFORMATIVO'
        ];

        // Función para limpiar texto y comparar de forma robusta
        const cleanText = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim().toUpperCase();

        for (const msg of mensajes) {
            const normalizedMsg = cleanText(msg);
            const esPermitida = SAFE_PATTERNS.some(pat => normalizedMsg.includes(pat));
            
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
            // Paso 1: Siguiente Principal (solo si TODAVÍA no estamos en el resumen)
            const yaEnResumen = typeof findAceptarBtnOnSummary === 'function'
                ? !!(findAceptarBtnOnSummary())
                : false;

            if (yaEnResumen) {
                this.log('📄 Ya estamos en el resumen; se omite "Siguiente".');
            } else {
                let btnSiguiente = findByText('Siguiente', 'span');
                if (btnSiguiente && (typeof esVisible === 'function' ? esVisible(btnSiguiente) : btnSiguiente.offsetParent !== null)) {
                    this.log('➡️ Pulsando Siguiente...');
                    btnSiguiente.click();
                    await sleep(3000);
                }
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

            const totalValor = this.detectarSaldo();
            const saldoConocido = typeof totalValor === 'number' && Number.isFinite(totalValor);

            // Estado de los mensajes del SRI: 'limpio' | 'con_inconsistencias' | 'desconocido'.
            // OJO: antes un mensaje vacío contaba como "sin inconsistencias", así que
            // si el selector fallaba el bot asumía que todo estaba bien y enviaba.
            const estadoMensajes = this.analizarMensajesResumen();

            // 🔎 Radiografía de la pantalla: única forma de calibrar los selectores
            // sin tener que llegar hasta acá a mano.
            await this.capturarDiagnosticoResumen({ totalValor, saldoConocido, estadoMensajes });

            // Para enviar hacen falta TRES cosas:
            //  · estar de verdad en el resumen de pago, no en el formulario
            //  · el saldo se LEYÓ (no se asumió) y vale exactamente 0
            //  · no hay ningún mensaje de inconsistencia
            // Si el saldo no se pudo leer, se frena: null nunca equivale a cero.
            //
            // Lo del resumen no es formalidad: el 04-sep el bot dijo "TODO
            // PERFECTO" leyendo el casillero TOTALES del formulario mientras
            // seguía en él. El saldo del formulario no es el saldo a pagar.
            const enResumen = typeof estaEnResumenDeclaracion === 'function'
                ? estaEnResumenDeclaracion() : true;
            if (!enResumen) {
                console.warn('🛑 [CIERRE] Todavía no estamos en el resumen de pago. No se concluye ningún saldo.');
                await anotarBitacora('⛔ no se envió', 'no estábamos en el resumen de pago');
            }

            // En POSITIVO a propósito: solo 'limpio' abre. Preguntar
            // «!== con_inconsistencias» dejaba pasar cualquier otro estado,
            // 'desconocido' incluido, que es justo lo que NO se puede asumir.
            const puedeEnviar = enResumen && saldoConocido && totalValor === 0 &&
                                estadoMensajes === 'limpio';

            // Última barrera: aunque todo lo demás dé bien, una sustitutiva no
            // se envía nunca. El rótulo puede aparecer recién en el resumen.
            if (typeof frenarSiEsSustitutiva === 'function' && await frenarSiEsSustitutiva('en el resumen')) {
                this.log('🛑 Sustitutiva detectada en el resumen. NO se envía.');
                return;
            }

            // Y tampoco se envía si quedó plata de compras sin casillero: una
            // factura al 5% declarada como 15%, o una de tarifas mezcladas
            // metida entera en un solo casillero, cambia el crédito tributario.
            // Repartirla es criterio contable, no algo que el bot pueda deducir.
            if (typeof frenarSiHayIvaSinUbicar === 'function' && await frenarSiHayIvaSinUbicar('en el resumen')) {
                this.log('🛑 Hay compras sin casillero. NO se envía: el formulario queda lleno.');

                // Y el lote SIGUE. Un cliente trabado no puede detener a los
                // otros 499: se anota por qué quedó afuera y se pasa al
                // siguiente, igual que con la sustitutiva. Frenar el envío es
                // lo correcto; frenar el lote entero no.
                try {
                    const quien = this.extractClientInfo ? this.extractClientInfo() : {};
                    if (quien && quien.ruc && typeof Omitidos !== 'undefined') {
                        await Omitidos.anotar(quien.ruc, 'compras_sin_casillero', {
                            nombre: quien.name,
                            detalle: 'El formulario quedó lleno en pantalla, sin enviar.'
                        });
                    }
                    await SafeStorage.remove(['pendingAction', 'actionTimestamp']);
                    if (typeof handleBatchNextClient === 'function') await handleBatchNextClient();
                } catch (e) {
                    console.warn('⏭️ No se pudo pasar al siguiente cliente:', e.message);
                }
                return;
            }

            if (puedeEnviar) {
                this.log('💎 TODO PERFECTO. Saldo $0.00 y Sin Inconsistencias.');
                this.setStatus('💎 Misión Cumplida - Enviando...');
                
                const btnAceptarFinal = typeof findAceptarBtnOnSummary === 'function' ? findAceptarBtnOnSummary() : Array.from(document.querySelectorAll('button span')).find(el => el.textContent.trim() === 'Aceptar');
                if (btnAceptarFinal) {
                    this.showEliteToast({ title: '🚀 LANZAMIENTO', msg: 'Enviando...', duration: 3000 });
                    const clickableTarget = btnAceptarFinal.closest('button, a, div[class*="button"]') || btnAceptarFinal;
                    if (typeof clickElement === 'function') clickElement(clickableTarget, 'Aceptar Resumen Final (Cierre)');
                    else clickableTarget.click();
                    await sleep(4000); // 4s en vez de 8s
                    
                    // Paso 5: Impresión Final
                    // DELEGADO: Ya no hacemos clic bruto, syncDeclarationToSupabase hará un fetch silencioso del formulario
                    this.log('🖨️ Generando PDF (Silencioso)...');
                    this.showEliteToast({ title: '🖨️ IMPRIMIENDO', msg: 'Documento generado', duration: 2500 });

                    // 💎 ELITE FIX: Sincronizar el éxito con Supabase (y capturar el PDF real)
                    const info = this.extractClientInfo();
                    let targetPeriodStr = "";
                    if (info.ruc && typeof syncDeclarationToSupabase === 'function') {
                        this.log('✨ Subiendo PDF original y métricas de éxito a Supabase...');
                        targetPeriodStr = await this.getCanonicalPeriodStr();

                        // 🛡️ ANTI-CARRERA: reservamos el cierre antes de sincronizar para que
                        // initDeclarationSuccessWatcher (poll de 2s) no dispare finalizarPostEnvioSRI
                        // en paralelo y termine sincronizando/cerrando sesión por duplicado.
                        await SafeStorage.set({ declaration_synced_flag: true });

                        // 🧾 Dejar constancia ANTES de intentar subir nada: el portal
                        // tarda ~20 min en quitar la obligación y la subida puede
                        // fallar. Sin esto, el bot volvía a declarar (sustitutiva).
                        // El periodo sale del lote, no de recalcular la fecha: es el que se está
                        // declarando de verdad. (Antes usaba cYear/cMonth, que en este punto
                        // todavía no existen: ReferenceError que abortaba el cierre entero.)
                        const perDecl = (await SafeStorage.get(['workflowPeriod'])).workflowPeriod || SriLoop.periodoPorDefecto();
                        await SriLoop.marcarDeclarado(info.ruc, perDecl, { nombre: info.name });

                        let preFetchedGhostData = {};
                        if (typeof GhostMemory !== 'undefined') {
                            preFetchedGhostData = await GhostMemory.getData().catch(() => ({}));
                        }
                        // syncDeclarationToSupabase internamente buscará y capturará el PDF oficial si le pasamos null
                        await syncDeclarationToSupabase(info.ruc, targetPeriodStr, null, info.name, preFetchedGhostData, "completado");
                    }
                    
                    this.showFinalReportSuccess();
                    await GhostMemory.set('workflowState', 'DECLARATION_SUCCESS'); // Sincronía Popup

                    // MODO AUTO BUCLE / 1-CLIC CHECK: Si estamos en modo automático, cerramos sesión y avanzamos
                    // Esta compuerta ignoraba el interruptor maestro: seguía en
                    // automático aunque el usuario lo hubiera puesto en REPOSO.
                    const isAutoFlow = await SriLoop.puedeAvanzar();
                    if (isAutoFlow) {
                        // Se pregunta al registro si el PDF llegó de verdad,
                        // en vez de darlo por hecho.
                        let respaldado = false;
                        try {
                            const guardadas = (await SafeStorage.get(['sc_declaraciones_locales']))
                                .sc_declaraciones_locales || {};
                            const reg = guardadas[`${info.ruc}|${targetPeriodStr}`];
                            respaldado = !!(reg && reg.pdfSubido);
                        } catch (e) { /* si no se puede saber, no se afirma */ }
                        this.log(respaldado
                            ? '🔄 [1-CLIC / AUTO BUCLE] Declaración finalizada. Comprobante guardado en la nube.'
                            : '🔄 [1-CLIC / AUTO BUCLE] Declaración finalizada, pero el comprobante NO llegó a la nube. Queda pendiente de respaldo: mirá el botón 📊.');
                        this.showEliteToast({ title: '⏩ Misión Cumplida', msg: 'Declaración OK. Finalizando sesión...', duration: 3000 });
                        
                        setTimeout(async () => {
                            await GhostMemory.clearCurrent(); // Limpiar el fantasma
                            // autoRes estaba roto (referencia a una const del bloque else,
                            // fuera de scope acá) que cortaba el avance con un ReferenceError.
                            // Ya estamos en el camino de éxito con el semáforo CORRIENDO
                            // (isAutoFlow arriba), así que el avance es legítimo.
                            if (typeof handleBatchNextClient === 'function') {
                                const batchNext = await handleBatchNextClient();
                                if (!batchNext) {
                                    await SafeStorage.set({ sri_auto_mode: false, auto_batch_enabled: false, autoDeclaration: false, sri_master_switch_on: false });
                                    await cerrarSesionSRI();
                                }
                            } else {
                                await SafeStorage.set({ sri_auto_mode: false, auto_batch_enabled: false, autoDeclaration: false, sri_master_switch_on: false });
                                await cerrarSesionSRI();
                            }
                        }, 3500);
                        return;
                    }

                } else {
                    this.log('⚠️ No se encontró el botón Finalizar/Aceptar. Por favor finalice manualmente.');
                }
            } else {
                // Lo primero es preguntarle al formulario qué le falta. Si el
                // portal está reclamando un campo, NO llegamos al resumen por
                // eso — y todo lo demás (saldo, selectores) es ruido.
                //
                // El 07-sep-2026 dos contribuyentes al 5% quedaron anotados
                // como `saldo_a_pagar` con saldo $0.00. No había saldo: el SRI
                // pedía el casillero 203, el decreto de la tarifa reducida.
                // Un motivo equivocado manda al contador a buscar plata que no
                // existe, y el campo que falta sigue faltando.
                const pide = (typeof loQuePideElFormulario === 'function')
                    ? loQuePideElFormulario() : { textos: [], casilleros: [], resumen: '' };

                let motivo;
                if (pide.textos.length > 0) {
                    motivo = 'El SRI ' + pide.resumen;
                } else if (saldoConocido && totalValor > 0) {
                    motivo = `Saldo a pagar: ${totalValor.toFixed(2)}`;
                } else if (estadoMensajes === 'con_inconsistencias') {
                    motivo = 'El SRI reporta inconsistencias';
                } else if (!saldoConocido) {
                    motivo = 'No pude leer el saldo en pantalla (selector sin calibrar)';
                } else {
                    motivo = 'No pude confirmar que la declaración esté limpia (selector sin calibrar)';
                }
                this.log(`🛑 Bloqueo Seguro: ${motivo}. NUNCA se intenta pagar automáticamente.`);
                anotarBitacora('⛔ NO se envió', motivo);

                if (pide.textos.length > 0) {
                    console.warn('📋 [FORMULARIO] Lo que el SRI reclama, con sus palabras:');
                    pide.textos.forEach((t) => console.warn('   · ' + t));
                    if (pide.casilleros.indexOf('203') !== -1) {
                        console.warn('   → El 203 es el DECRETO que habilita la tarifa reducida del 5%. ' +
                                     'Es una elección legal: la hace el contador, el bot no la adivina.');
                    }
                    this.showEliteToast({
                        title: '🛑 Falta un campo del formulario',
                        msg: pide.textos.map((t) => escapeHtml(String(t))).join('<br>· ') +
                             '<br><br>El borrador queda guardado. Elegí ese campo y enviá a mano.',
                        duration: 20000
                    });
                } else if (!saldoConocido || estadoMensajes === 'desconocido') {
                    this.log('🔎 Corré window.sriAssistant.verDiagnosticoResumen() y pasá la salida para calibrar los selectores.');
                }
                
                // Intentar guardar borrador antes de salir
                const btnGuardar = findByText('Guardar borrador', 'span');
                if (btnGuardar) {
                    btnGuardar.click();
                    this.log('💾 Borrador guardado por seguridad.');
                }
                
                // 💎 ELITE FIX: Sincronizar estado y métricas a Supabase ANTES de detenerse
                const info = this.extractClientInfo();
                if (info.ruc && typeof syncDeclarationToSupabase === 'function') {
                    this.log('✨ Subiendo estado PENDIENTE DE PAGO a Supabase...');
                    const targetPeriodStr = await this.getCanonicalPeriodStr();
                    
                    let preFetchedGhostData = {};
                    if (typeof GhostMemory !== 'undefined') {
                        preFetchedGhostData = await GhostMemory.getData().catch(() => ({}));
                    }
                    const customStatus = totalValor > 0 ? "por_pagar" : "inconsistencia";
                    await syncDeclarationToSupabase(info.ruc, targetPeriodStr, null, info.name, preFetchedGhostData, customStatus);
                }
                
                await GhostMemory.set('workflowState', totalValor > 0 ? 'STOPPED_BALANCE' : 'STOPPED_WARNING'); // Sincronía Popup

                // MODO AUTO BUCLE CHECK: Si hay saldo a pagar pero estamos automático, SALTAMOS al siguiente
                const sigueElLote = await loteDebeContinuar();
                if (sigueElLote) {
                    // El motivo que se anota tiene que ser el de verdad: es lo
                    // único que el contador va a leer en el botón ⚠, y de ahí
                    // sale qué hacer con este contribuyente.
                    const faltaCampo = pide.textos.length > 0;
                    const motivoOmision = faltaCampo ? 'formulario_incompleto' : 'saldo_a_pagar';
                    const detalleOmision = faltaCampo
                        ? (pide.casilleros.length ? 'casillero ' + pide.casilleros.join(', ') : 'campos sin completar')
                        : `saldo $${totalValor}`;

                    this.log(`🔄 [MODO AUTO BUCLE] ${info.name || info.ruc}: ${motivo}. Borrador guardado. Avanzando al siguiente...`);
                    await Omitidos.anotar(info.ruc, motivoOmision, {
                        nombre: info.name, detalle: detalleOmision });
                    this.showEliteToast({
                        title: faltaCampo ? '⏩ Omitiendo (falta un campo)' : '⏩ Omitiendo (Por Pagar)',
                        msg: faltaCampo ? escapeHtml(detalleOmision) + ' — se guardó borrador. Cerrando sesión...'
                                        : 'Impuestos detectados. Cerrando sesión...',
                        duration: 3500 });
                    
                    setTimeout(async () => {
                        await GhostMemory.clearCurrent();
                        if (typeof handleBatchNextClient === 'function') {
                            const batchNext = await handleBatchNextClient();
                            if (!batchNext) {
                                await SafeStorage.set({ sri_auto_mode: false });
                                await cerrarSesionSRI();
                            }
                        } else {
                            await cerrarSesionSRI();
                        }
                    }, 4000);
                    return;
                }

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
                    timeout: null,
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

                await cerrarSesionSRI();
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
                    <p style="margin:0; font-size:12px">Cliente: <b>${escapeHtml(data.lastClientName || 'Detectado')}</b></p>
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

    updateContainerStyles() {
        if (!this.container) return;
        const url = window.location.href.toLowerCase();
        const isLoginPage = url.includes('auth/realms/') || url.includes('login');
        
        const baseStyle = `
            position: fixed;
            bottom: 25px;
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

        if (isLoginPage) {
            this.container.style.cssText = baseStyle + `
                left: 20px;
                right: 420px;
                width: auto;
                height: 90vh;
                top: 5vh;
                bottom: auto;
            `;
        } else {
            // 88px deja libre la cabecera del portal, que es donde se lee de
            // quién es la sesión abierta. Antes con top:5vh la tapábamos.
            this.container.style.cssText = baseStyle + `
                left: 50%;
                transform: translateX(-50%);
                width: 320px;
                max-width: calc(100vw - 32px);
                max-height: 80vh;
                top: 88px;
                bottom: auto;
            `;
        }
    }

    render() {
        if (!this.container) return;
        this.updateContainerStyles();

        // Inyectar Estilos Globales Elite
        if (!document.getElementById('sri-elite-styles')) {
            const style = document.createElement('style');
            style.id = 'sri-elite-styles';
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                
                /* Scrollbar Premium */
                #elite-clients-list::-webkit-scrollbar { width: 6px; }
                #elite-clients-list::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 10px; }
                #elite-clients-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
                #elite-clients-list::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.5); }
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

        const isLoginPage = window.location.href.includes('auth/realms/') || 
                            window.location.href.includes('login') || 
                            !!document.getElementById('kc-login');
        const isInicio = window.location.href.includes('inicio/NAT') || 
                         window.location.href.includes('inicio.jsf') || 
                         window.location.href.includes('general/inicio');
        const info = this.extractClientInfo();
        const isOutside = isLoginPage || isInicio || !info.ruc;

        if (isOutside) {
            // Regla UX de Aislamiento Contextual: En la pantalla de login/inicio, ocultar 100% el panel de GHOST
            // para que cada interfaz aparezca estrictamente en su campo sin provocar conflictos visuales.
            this.container.style.display = 'none';
            return;
        } else {
            this.container.style.display = 'block';
        }

        if (this.isExpanded) {
            this.renderPanel();
        } else {
            this.renderPill();
        }
    }

    /**
     * El panel plegado ya no dibuja nada.
     *
     * Antes acá vivía una segunda barra flotante —la píldora— con sus propios
     * botones. Eran dos superficies de control para la misma máquina, en dos
     * estilos distintos, con acciones repartidas sin criterio; de ahí salió el
     * lío de los dos 🛑 que no hacían lo mismo.
     *
     * Ahora la única barra es el HUD del bucle, y este panel se abre desde su
     * botón 🗔. Sus tres acciones propias (omitir, escanear, cerrar) se
     * mudaron al HUD.
     */
    renderPill() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.style.cssText = 'display:none';
    }

    renderPillLegacy() {
        if (!this.container) return; // ELITE FIX: Safety check
        const info = this.extractClientInfo();
        const clientName = info.name ? info.name.split(' ')[0] : 'SRI';

        this.container.style.width = 'auto'; // Ajuste dinámico
        this.container.innerHTML = `
            <div id="sri-smart-hub" class="sri-elite-pill" role="toolbar" aria-label="Controles del asistente SRI" style="opacity: 0.95; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: 100%;">
                <div style="font-size: 16px;">💎</div>
                <div style="font-size: 10px; font-weight: 700;">Panel ${escapeHtml(clientName)}</div>
                <div id="btn-pill-skip" role="button" tabindex="0" aria-label="Omitir este cliente y pasar al siguiente" style="font-size: 12px; cursor: pointer; padding: 8px 12px; min-height: 32px; display: flex; align-items: center; background: rgba(245, 158, 11, 0.25); border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 8px; font-weight: 800; color: #fbbf24;" title="Omitir este cliente y pasar al siguiente">⏭️ Omitir</div>
                <div id="btn-force-scan" role="button" tabindex="0" aria-label="Forzar escaneo de obligaciones" style="font-size: 14px; cursor: pointer; padding: 8px 10px; min-width: 32px; min-height: 32px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); border-radius: 8px;" title="Forzar Escaneo de Obligaciones">🔍</div>
                <div id="btn-force-sync" role="button" tabindex="0" aria-label="Sincronizar manualmente" style="font-size: 12px; cursor: pointer; padding: 8px 12px; min-height: 32px; display: flex; align-items: center; background: rgba(16,185,129,0.2); border: 1px solid rgba(16,185,129,0.4); border-radius: 8px; font-weight: 800; color: #10b981;" title="Sincronizar Manualmente (Si terminaste por fuera)">✨ Sync</div>
            </div>
        `;

        const hub = this.container.querySelector('#sri-smart-hub');
        hub.onclick = (e) => {
            if (e.target.id === 'btn-pill-skip') {
                e.stopPropagation();
                this.omitirClienteActual();
                return;
            }
            if (e.target.id === 'btn-force-scan') {
                e.stopPropagation();
                console.log('🔍 [FORCE SCAN] Ejecutando escaneo manual...');
                this.scanObligacionesSRI();
                return;
            }
            if (e.target.id === 'btn-force-sync') {
                e.stopPropagation();
                console.log('✨ [FORCE SYNC] Ejecutando cierre mágico manual...');
                this.ejecutarCierreMagico();
                return;
            }
            this.toggleMinimize(false);
        };
    }

    async omitirClienteActual() {
        const info = this.extractClientInfo();
        const ruc = info.ruc;
        const name = info.name || ruc || 'este cliente';

        if (!confirm(`¿Omitir a ${name}?\nSe guardará en la lista de omitidos y se avanzará al siguiente cliente.`)) {
            return;
        }

        this.log(`⏭️ Omitiendo cliente ${name}...`);
        this.showEliteToast({
            title: '⏭️ Omitiendo Cliente',
            msg: `Omitiendo a ${name}. Avanzando...`,
            duration: 3000
        });

        if (ruc) {
            const resErr = await SafeStorage.get(['flagged_errors']);
            const errs = resErr.flagged_errors || {};
            errs[ruc] = 'omitido_manual';
            await SafeStorage.set({ flagged_errors: errs });
            await Omitidos.anotar(ruc, 'omitido_manual', { nombre: name });
        }

        await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod']);
        await GhostMemory.clearCurrent();

        if (typeof handleBatchNextClient === 'function') {
            const hasNext = await handleBatchNextClient();
            if (!hasNext) {
                await cerrarSesionSRI();
            }
        } else {
            await cerrarSesionSRI();
        }
    }

    renderPanel() {
        const info = this.extractClientInfo();
        const clientName = info.name ? info.name.split(' ')[0] : 'SRI';

        // Determinar si estamos fuera de sesión (Login o Inicio)
        const isLoginPage = window.location.href.includes('auth/realms/') || window.location.href.includes('login');
        const isInicio = window.location.href.includes('inicio/NAT') || window.location.href.includes('inicio.jsf') || window.location.href.includes('general/inicio');
        const isOutside = isLoginPage || isInicio || !info.ruc;

        // Determinar estado de página para el HUD
        const isForm = window.location.href.includes('declaracionImpuesto.jsf') || window.location.href.includes('recibirDeclaracion.jsf');
        const isRecibidos = window.location.href.includes('recibidos/comprobantesRecibidos.jsf');

        this.container.style.width = '330px';

        if (isOutside) {
            // Ocultar el panel grande de la izquierda en el login para evitar ventanas flotantes duplicadas.
            this.container.style.display = 'none';
            return;
        }

        this.container.innerHTML = `
            <div id="sri-elite-panel" style="background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(20px); border-radius: 20px; padding: 20px; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.3); font-family: 'Inter', sans-serif; color: white; border: 1px solid rgba(255,255,255,0.08);">
                
                <!-- HEADER -->
                <div id="sri-panel-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div id="sri-ghost-icon" class="${this.working ? 'is-working-ghost' : ''}" style="font-size: 24px;">👻</div>
                        <div>
                            <div style="font-size: 14px; font-weight: 800; letter-spacing: 0.02em;">GHOST ASISTENTE</div>
                            <div id="sri-client-name" style="font-size: 10px; opacity: 0.7; font-weight: 500;">${escapeHtml(clientName)}</div>
                            <div id="sri-client-ruc" style="font-size: 9px; opacity: 0.5; font-weight: 600; color: #818cf8;">RUC: ${escapeHtml(info.ruc || 'N/A')}</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div id="btn-force-skip-panel" style="font-size: 10px; cursor: pointer; padding: 4px 8px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 6px; font-weight: 800;" title="Omitir este cliente y avanzar al siguiente">⏭️ Omitir</div>
                        <div id="btn-force-sync-panel" style="font-size: 10px; cursor: pointer; padding: 4px 8px; background: rgba(16,185,129,0.2); color: #10b981; border: 1px solid rgba(16,185,129,0.4); border-radius: 6px; font-weight: 800;" title="Marcar como COMPLETADO en Supabase">✨ Sync</div>
                        <div id="btn-minimize-pill" style="cursor: pointer; opacity: 0.5; font-size: 20px; padding: 5px; line-height: 20px;">×</div>
                    </div>
                </div>

                <!-- STATUS HUB -->
                <div id="sri-panel-status" style="background: ${this.manualMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.05)'}; padding: 12px; border-radius: 12px; border-left: 4px solid ${this.manualMode ? '#f59e0b' : '#6366f1'}; font-size: 11px; color: #e2e8f0; margin-bottom: 20px; position: relative;">
                    ${this.manualMode ? '🛠️ MODO MANUAL: Protección Pausada' : (isForm ? '📝 Estás en el Formulario IVA' : isRecibidos ? '📥 Analizando Comprobantes...' : '✨ Listo para operar')}
                    
                    ${this.manualMode ? `
                        <button id="btn-exit-manual" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: #f59e0b; color: white; border: none; padding: 4px 8px; border-radius: 6px; font-size: 9px; cursor: pointer; font-weight: 800;">SALIR</button>
                    ` : `
                        <button id="btn-enter-manual" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); color: #94a3b8; border: none; padding: 4px 8px; border-radius: 6px; font-size: 9px; cursor: pointer;">MODO MANUAL</button>
                    `}
                    <div id="sri-panel-phase" style="margin-top: 10px; display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; color: #94a3b8;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${this.isPaused ? '#f59e0b' : (this.working ? '#10b981' : '#64748b')}; display: inline-block;"></span>
                        ${this.working ? '⚙️ Ejecutando automatización…' : (this.isPaused ? '⏸️ Pausado — pulsa REANUDAR' : (isForm ? '📝 En Formulario IVA' : (isRecibidos ? '📥 En Comprobantes' : '● En espera')))}
                    </div>
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
                    ${!isForm ? '<div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; font-weight: 800; margin: 4px 0 2px;">🚀 ACCIÓN PRINCIPAL</div>' : ''}
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

                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; font-weight: 800; margin: 14px 0 2px;">⛔ CONTROL</div>
                    <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
                        <!-- ⛔ Pausa y parada viven SOLO en el HUD flotante.
                             Había tres botones de detener y dos de pausar repartidos
                             en dos widgets, sin nada que indicara cuál mandaba. -->
                        <div class="sc-rotulo" style="flex:1.5;align-self:center;text-align:center;opacity:.75">
                            Pausa y parada: en el HUD ↘
                        </div>
                        <button id="btn-panel-force-next" class="sc-btn " style="flex: 0.8">⏭️ Next</button>
                        <button id="btn-panel-refresh" class="sc-btn sc-btn--fantasma" style="flex: 0.8">🔄 Recargar</button>
                    </div>

                    <!-- MICRO TERMINAL -->
                    <div style="margin-top: 12px; background: rgba(0,0,0,0.5); border-radius: 8px; padding: 8px; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="font-size: 9px; opacity: 0.7; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; color: #a5b4fc;">💻 Terminal en vivo</div>
                        <div id="sri-micro-terminal" style="height: 60px; overflow-y: auto; font-family: monospace; font-size: 9px; color: #10b981; display: flex; flex-direction: column; gap: 2px;">
                            <div><span style="color: #64748b;">[SYS]</span> Sistema GHOST UI cargado...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.querySelector('#btn-minimize-pill').onclick = () => {
            this.toggleMinimize(true);
        };
        const syncPanelBtn = this.container.querySelector('#btn-force-sync-panel');
        if (syncPanelBtn) {
            syncPanelBtn.onclick = () => {
                console.log('✨ [FORCE SYNC] Ejecutando cierre mágico manual desde panel grande...');
                this.ejecutarCierreMagico();
            };
        }
        const skipPanelBtn = this.container.querySelector('#btn-force-skip-panel');
        if (skipPanelBtn) {
            skipPanelBtn.onclick = () => {
                this.omitirClienteActual();
            };
        }

        this.bindEvents();
        this.updateSummary(); // Cargar datos inmediatamente
    }

    async loadAndRenderClients() {
        const container = this.container.querySelector('#sri-panel-clients-view');
        if (!container) return;

        const now = new Date();
        if (this.currentMonth === undefined) {
            this.currentMonth = now.getMonth() - 1;
            this.currentYear = now.getFullYear();
            if (this.currentMonth < 0) {
                this.currentMonth = 11;
                this.currentYear--;
            }
        }

        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        let monthOpts = monthNames.map((m, idx) => `<option value="${idx}" ${idx === this.currentMonth ? 'selected' : ''}>${m}</option>`).join('');
        let yearOpts = '';
        for (let y = now.getFullYear(); y >= 2020; y--) {
            yearOpts += `<option value="${y}" ${y === this.currentYear ? 'selected' : ''}>${y}</option>`;
        }

        const url = window.location.href.toLowerCase();
        const isLoginPage = url.includes('auth/realms/') || url.includes('login');
        
        const listContainerStyle = isLoginPage 
            ? 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; overflow-y: auto; max-height: calc(90vh - 180px); padding-right: 5px;'
            : 'display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: calc(80vh - 180px);';

        let html = `
            <div style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 8px;">
                <!-- Subtitle & Sync -->
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9px; opacity: 0.7;">
                    <span style="font-weight: 700; text-transform: uppercase; color: #a5b4fc;">MENSUALES • EJECUCIÓN MANUAL</span>
                    <button id="btn-sync-supabase" style="background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); color: #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 9px; cursor: pointer;">🔄 Sincronizar</button>
                </div>

                <!-- Selectores Periodo -->
                <div style="display: flex; gap: 6px;">
                    <select id="elite-period-month" style="flex: 1; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 4px 6px; border-radius: 6px; font-size: 10px; outline: none;">
                        ${monthOpts}
                    </select>
                    <select id="elite-period-year" style="width: 70px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 4px 6px; border-radius: 6px; font-size: 10px; outline: none;">
                        ${yearOpts}
                    </select>
                </div>

                <!-- Buscador + Checkbox Auto -->
                <div style="display: flex; gap: 6px; align-items: center;">
                    <input type="text" id="elite-client-search" placeholder="🔍 Buscar RUC o Nombre..." style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); padding: 6px 10px; border-radius: 6px; color: white; font-size: 10px; outline: none; box-sizing: border-box;">
                    <label style="display: flex; align-items: center; gap: 4px; font-size: 9px; cursor: pointer; color: #a5b4fc; font-weight: 700; white-space: nowrap;">
                        <input type="checkbox" id="chk-auto-mode" style="cursor: pointer;">
                        Modo Auto
                    </label>
                </div>

                <!-- Tabs Pendientes / Completados -->
                <div style="display: flex; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 2px; border: 1px solid rgba(255,255,255,0.05);">
                    <button id="tab-pendientes" style="flex: 1; background: rgba(99,102,241,0.3); border: none; color: white; padding: 6px; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer; transition: all 0.2s;">
                        PENDIENTES (<span id="cnt-pend">0</span>)
                    </button>
                    <button id="tab-completados" style="flex: 1; background: transparent; border: none; color: #94a3b8; padding: 6px; border-radius: 6px; font-size: 10px; font-weight: 700; cursor: pointer; transition: all 0.2s;">
                        COMPLETADOS (<span id="cnt-comp">0</span>)
                    </button>
                </div>

                <!-- PROGRESS BAR -->
                <div style="margin-top: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 9px; color: #cbd5e1; margin-bottom: 3px; font-weight: 700;">
                        <span>Progreso del Lote</span>
                        <span id="elite-progress-text">0%</span>
                    </div>
                    <div style="height: 4px; background: rgba(0,0,0,0.5); border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                        <div id="elite-progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(16,185,129,0.5);"></div>
                    </div>
                </div>
            </div>

            <!-- List Containers -->
            <div id="elite-clients-list" style="${listContainerStyle}">
                <div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 20px;">⏳ Cargando lista...</div>
            </div>
        `;
        container.innerHTML = html;

        const listContainer = container.querySelector('#elite-clients-list');
        const searchInput = container.querySelector('#elite-client-search');
        const chkAutoMode = container.querySelector('#chk-auto-mode');
        const selMonth = container.querySelector('#elite-period-month');
        const selYear = container.querySelector('#elite-period-year');
        const tabPend = container.querySelector('#tab-pendientes');
        const tabComp = container.querySelector('#tab-completados');
        const btnSync = container.querySelector('#btn-sync-supabase');

        let activeTab = 'pendientes';

        const stateRes = await chrome.storage.local.get(['sri_auto_mode']);
        if (stateRes.sri_auto_mode) chkAutoMode.checked = true;
        chkAutoMode.onchange = async (e) => {
            const on = e.target.checked;
            
            if (on) {
                this.log('🚀 MODO PILOTO AUTOMÁTICO ACTIVADO.');
                
                const sortBy9th = (a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc);
                const pendientes = clients.filter(c => !hasPdfForPeriod(c, this.currentYear, this.currentMonth));
                pendientes.sort(sortBy9th);
                
                if (pendientes.length === 0) {
                    this.showEliteToast({ title: 'Atención', msg: 'No hay clientes pendientes en este periodo' });
                    e.target.checked = false;
                    await SafeStorage.set({ sri_auto_mode: false, auto_batch_enabled: false });
                    return;
                }
                
                const queue = pendientes.map(c => ({ ruc: c.ruc, password: c.password, name: c.name }));

                // El piloto del panel escribía auto_batch_queue pero no encendía el semáforo:
                // sin SriLoop.iniciar(), sc_loop quedaba en DETENIDO y puedeAvanzar() frenaba
                // el lote. Mismo bug que el botón maestro del login (03).
                if (typeof SriLoop !== 'undefined' && typeof SriLoop.iniciar === 'function') {
                    await SriLoop.iniciar(queue, { year: this.currentYear, monthIndex: this.currentMonth });
                }

                await SafeStorage.set({ 
                    auto_batch_enabled: true, 
                    sri_auto_mode: true, 
                    sri_master_switch_on: true,
                    sriAutomationPaused: false,
                    ghost_manual_mode: false,
                    autoDeclaration: true,
                    auto_batch_queue: queue,
                    auto_batch_index: 0,
                    auto_batch_period: { year: this.currentYear, monthIndex: this.currentMonth }
                });
                await SafeStorage.remove(['declaration_synced_flag', 'iva_sin_ubicar']);
                this.manualMode = false;
                this.isPaused = false;
                
                this.showEliteToast({ title: '🚀 Iniciando', msg: `Iniciando lote de ${queue.length} clientes...`, duration: 3000 });
                
                if (typeof handleBatchNextClient === 'function') {
                    setTimeout(() => handleBatchNextClient(), 1500);
                }
            } else {
                await SafeStorage.set({ auto_batch_enabled: false, sri_auto_mode: false });
                await SafeStorage.remove(['auto_batch_queue', 'auto_batch_index', 'auto_batch_period']);
                this.log('🛑 Piloto Automático Desactivado. Entrando en Modo Monitoreo.');
            }
        };

        tabPend.onclick = () => {
            activeTab = 'pendientes';
            tabPend.style.background = 'rgba(99,102,241,0.3)';
            tabPend.style.color = 'white';
            tabComp.style.background = 'transparent';
            tabComp.style.color = '#94a3b8';
            renderActiveList();
        };

        tabComp.onclick = () => {
            activeTab = 'completados';
            tabComp.style.background = 'rgba(16,185,129,0.3)';
            tabComp.style.color = 'white';
            tabPend.style.background = 'transparent';
            tabPend.style.color = '#94a3b8';
            renderActiveList();
        };

        selMonth.onchange = (e) => { this.currentMonth = parseInt(e.target.value); renderActiveList(); };
        selYear.onchange = (e) => { this.currentYear = parseInt(e.target.value); renderActiveList(); };

        let clients = [];

        const fetchClientsFromSupabase = async () => {
            listContainer.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 15px;">⏳ Sincronizando datos con la nube...</div>';
            try {
                // Delegado al módulo 01 (fetchClientsDirectly): query con columnas seguras
                // + inclusión de sri_declaraciones + fusión con caché local
                const merged = await fetchClientsDirectly();
                if (Array.isArray(merged) && merged.length > 0) {
                    clients = merged.map(c => ({ ...c, sri_declaraciones: c.declarations }));
                    await chrome.storage.local.set({ sc_clients_cache: clients, sc_clients_cache_ts: Date.now() });
                } else {
                    console.warn("fetchClientsFromSupabase: Sin clientes nuevos, manteniendo caché actual.");
                }
            } catch (e) {
                console.error("Error fetching clients from Supabase in panel:", e);
            }
        };

        btnSync.onclick = async () => {
            btnSync.innerText = '⏳ ...';
            await fetchClientsFromSupabase();
            btnSync.innerText = '✅Listo';
            setTimeout(() => { btnSync.innerText = '🔄 Sincronizar'; }, 1500);
            renderActiveList();
        };

        const isClientMensual = (c) => {
            if (!c) return false;
            const tp = c.tax_profile || c.taxProfile || {};
            const freq = (tp.ivaFrequency || c.iva_frequency || c.ivaFrequency || '').toLowerCase();
            const reg = (c.regime || '').toLowerCase();
            const type = (c.client_type || c.clientType || tp.clientType || '').toLowerCase();

            if (type === 'solo_plan' || c.requires_declarations === false || tp.requiresDeclarations === false) return false;
            if (freq.includes('ninguno') || freq.includes('anual') || reg.includes('popular')) return false;
            if (freq.includes('semestral') || reg.includes('emprendedor')) {
                return freq === 'mensual';
            }
            return true;
        };

        try {
            let res = await chrome.storage.local.get(['sc_clients_cache']);
            clients = (res.sc_clients_cache || []).filter(isClientMensual);
            if (clients.length === 0) {
                await fetchClientsFromSupabase();
            }
        } catch (e) { console.error(e); }

        const monthNamesUpper = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

        const hasPdfForPeriod = (client, year, monthIndex) => {
            const decls = Array.isArray(client.declarations) ? client.declarations : (Array.isArray(client.declaration_history) ? client.declaration_history : []);
            if (decls.length === 0) return false;

            const monthNumStr = (monthIndex + 1).toString().padStart(2, '0');
            const targetPadded = `${year}-${monthNumStr}`;
            const targetUnpadded = `${year}-${monthIndex + 1}`;
            const targetMonthName = monthNamesUpper[monthIndex] || '';

            return decls.some(d => {
                if (!d || !d.period) return false;
                const p = d.period.toString().toUpperCase().trim();
                const pClean = p.split(':')[0].trim();

                const matchesPeriod = 
                    pClean === targetPadded || 
                    pClean === targetUnpadded || 
                    p.includes(targetPadded) || 
                    p.includes(targetUnpadded) ||
                    (p.includes(targetMonthName) && p.includes(String(year)));

                if (!matchesPeriod) return false;

                const st = (d.status || '').toLowerCase();
                const isDeclaredStatus = st === 'enviada' || st === 'pagada' || st === 'completada' || st === 'realizada';
                const hasProof = !!(d.proof_file || d.pdfUrl || d.proofFile || d.pdf_url);
                return isDeclaredStatus || hasProof;
            });
        };

        const getPdfUrlForPeriod = (client, year, monthIndex) => {
            const decls = Array.isArray(client.declarations) ? client.declarations : (Array.isArray(client.declaration_history) ? client.declaration_history : []);
            if (decls.length === 0) return null;

            const monthNumStr = (monthIndex + 1).toString().padStart(2, '0');
            const targetPadded = `${year}-${monthNumStr}`;
            const targetUnpadded = `${year}-${monthIndex + 1}`;
            const targetMonthName = monthNamesUpper[monthIndex] || '';

            const dec = decls.find(d => {
                if (!d || !d.period) return false;
                const p = d.period.toString().toUpperCase().trim();
                const pClean = p.split(':')[0].trim();
                return pClean === targetPadded || pClean === targetUnpadded || p.includes(targetPadded) || p.includes(targetUnpadded) || (p.includes(targetMonthName) && p.includes(String(year)));
            });

            if (!dec) return null;
            if (typeof dec.pdfUrl === 'string' && dec.pdfUrl.length > 5) return dec.pdfUrl;
            if (dec.proof_file) {
                if (typeof dec.proof_file === 'string' && dec.proof_file.startsWith('http')) return dec.proof_file;
                if (typeof dec.proof_file.url === 'string' && dec.proof_file.url.length > 5) return dec.proof_file.url;
            }
            if (dec.proofFile) {
                if (typeof dec.proofFile === 'string' && dec.proofFile.startsWith('http')) return dec.proofFile;
                if (typeof dec.proofFile.url === 'string' && dec.proofFile.url.length > 5) return dec.proofFile.url;
            }
            if (typeof dec.pdf_url === 'string' && dec.pdf_url.length > 5) return dec.pdf_url;
            return null;
        };

        const renderActiveList = () => {
            const filterText = searchInput.value.toLowerCase().trim();

            const filtered = clients.filter(c => {
                return (c.name || '').toLowerCase().includes(filterText) || (c.ruc || '').includes(filterText);
            });

            const sortBy9th = (a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc);

            const pendientes = [];
            const completados = [];

            filtered.forEach(client => {
                if (hasPdfForPeriod(client, this.currentYear, this.currentMonth)) {
                    completados.push(client);
                } else {
                    pendientes.push(client);
                }
            });

            pendientes.sort(sortBy9th);
            completados.sort(sortBy9th);

            const total = pendientes.length + completados.length;
            const pct = total === 0 ? 0 : Math.round((completados.length / total) * 100);

            container.querySelector('#cnt-pend').innerText = pendientes.length;
            container.querySelector('#cnt-comp').innerText = completados.length;
            
            const progText = container.querySelector('#elite-progress-text');
            const progFill = container.querySelector('#elite-progress-fill');
            if (progText) progText.innerText = `${pct}%`;
            if (progFill) progFill.style.width = `${pct}%`;

            const targetList = activeTab === 'pendientes' ? pendientes : completados;
            listContainer.innerHTML = '';

            if (targetList.length === 0) {
                listContainer.innerHTML = `<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 20px;">No hay clientes en ${activeTab.toUpperCase()}.</div>`;
                return;
            }

            targetList.forEach(client => {
                const passVisible = client.ruc === this.visiblePasswordRuc;
                const hasPassword = !!client.password;
                const displayPass = hasPassword ? (passVisible ? client.password : '••••••') : 'Sin Clave';
                const isDone = activeTab === 'completados';
                const statusBadge = isDone 
                    ? `<span style="font-size: 8px; background: rgba(16,185,129,0.2); color: #34d399; padding: 1px 5px; border-radius: 4px; font-weight: 700;">🟢 COMPLETADO</span>` 
                    : `<span style="font-size: 8px; background: rgba(245,158,11,0.2); color: #fbbf24; padding: 1px 5px; border-radius: 4px; font-weight: 700;">🟡 PENDIENTE</span>`;
                
                const card = document.createElement('div');
                card.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 10px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;';
                card.onmouseover = () => { card.style.background = 'rgba(255,255,255,0.06)'; };
                card.onmouseout = () => { card.style.background = 'rgba(255,255,255,0.03)'; };
                
                const safeName = typeof escapeHtml === 'function' ? escapeHtml(client.name || 'Cliente') : (client.name || 'Cliente');
                const safeRuc = typeof escapeHtml === 'function' ? escapeHtml(client.ruc || '') : (client.ruc || '');
                const safeDisplayPass = typeof escapeHtml === 'function' ? escapeHtml(displayPass) : displayPass;

                const passUi = hasPassword 
                    ? `<span style="font-family: monospace; font-size: 9px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; display: inline-flex; gap: 4px; color: #cbd5e1;">
                            <span class="elite-toggle-pass" data-ruc="${safeRuc}" style="cursor:pointer;" title="Mostrar/Ocultar">${passVisible ? '👁️' : '🙈'} ${safeDisplayPass}</span>
                            <span class="elite-copy-pass" data-ruc="${safeRuc}" style="cursor:pointer;" title="Copiar">📋</span>
                       </span>`
                    : `<span style="font-family: monospace; font-size: 9px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); padding: 2px 5px; border-radius: 4px; display: inline-flex; gap: 4px; color: #fca5a5; animation: elite-pulse 2s infinite;">
                            ⚠️ SIN CLAVE
                       </span>`;

                const pdfUrl = isDone ? getPdfUrlForPeriod(client, this.currentYear, this.currentMonth) : null;
                const pdfBtn = pdfUrl ? `<a href="${pdfUrl}" target="_blank" style="text-decoration: none; font-size: 8px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.4); color: #34d399; padding: 1px 5px; border-radius: 4px; font-weight: 700; cursor: pointer;">📄 VER PDF</a>` : '';

                card.innerHTML = `
                    <div style="flex: 1; min-width: 0; padding-right: 8px;">
                        <div style="font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; color: #f8fafc;">${safeName}</div>
                        <div style="display: flex; gap: 5px; align-items: center; flex-wrap: wrap;">
                            <span class="elite-copy-ruc" data-ruc="${safeRuc}" style="font-size: 9px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); padding: 2px 5px; border-radius: 4px; cursor: pointer; color: #c7d2fe; transition: 0.2s;" title="Copiar RUC">📋 ${safeRuc}</span>
                            ${passUi}
                            ${statusBadge}
                            ${pdfBtn}
                        </div>
                    </div>
                    <button class="elite-btn-iniciar" data-ruc="${safeRuc}" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); border: none; color: white; padding: 6px 10px; border-radius: 8px; font-size: 10px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); ${isDone ? 'opacity: 0.6;' : ''}">▶ Iniciar</button>
                `;
                
                listContainer.appendChild(card);
            });
            
            // Events
            listContainer.querySelectorAll('.elite-copy-ruc').forEach(el => {
                el.onclick = () => { 
                    navigator.clipboard.writeText(el.dataset.ruc); 
                    this.showEliteToast({title: 'Copiado', msg: 'RUC copiado al portapapeles'});
                    const originalHtml = el.innerHTML;
                    el.innerHTML = '✅ Copiado';
                    el.style.background = 'rgba(16, 185, 129, 0.2)';
                    el.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                    el.style.color = '#a7f3d0';
                    setTimeout(() => {
                        el.innerHTML = originalHtml;
                        el.style.background = 'rgba(99,102,241,0.15)';
                        el.style.borderColor = 'rgba(99,102,241,0.3)';
                        el.style.color = '#c7d2fe';
                    }, 1500);
                };
            });
            listContainer.querySelectorAll('.elite-copy-pass').forEach(el => {
                el.onclick = () => {
                    // 🔒 La clave se resuelve al hacer click, nunca vive en el DOM del SRI.
                    const c = clients.find(x => x.ruc === el.dataset.ruc);
                    const pass = c && (c.password || c.sri_password || c.sriPassword);
                    if (!pass) return this.showEliteToast({ title: '⚠️ Sin clave', msg: 'Este contribuyente no tiene clave guardada' });
                    navigator.clipboard.writeText(pass);
                    this.showEliteToast({ title: 'Copiado', msg: 'Clave copiada al portapapeles' });
                };
            });
            listContainer.querySelectorAll('.elite-toggle-pass').forEach(el => {
                el.onclick = () => { 
                    this.visiblePasswordRuc = this.visiblePasswordRuc === el.dataset.ruc ? null : el.dataset.ruc;
                    renderActiveList();
                };
            });
            listContainer.querySelectorAll('.elite-btn-iniciar').forEach(el => {
                el.onclick = () => {
                    const c = clients.find(x => x.ruc === el.dataset.ruc);
                    if (c) this.iniciarClienteManual(c);
                };
            });
        };

        searchInput.addEventListener('input', () => renderActiveList());
        renderActiveList();
    }

    async iniciarClienteManual(client) {
        if (!client.password) {
            this.showContextCard({
                title: 'Falta Contraseña',
                subtitle: 'Error de ingreso',
                message: 'Este cliente no tiene clave SRI guardada. Edite la clave desde el popup de la extensión primero.',
                icon: '🔑',
                timeout: null,
                actionText: 'ENTENDIDO'
            });
            return;
        }

        const now = new Date();
        let month = this.currentMonth !== undefined ? this.currentMonth : (now.getMonth() - 1);
        let year = this.currentYear || now.getFullYear();
        if (month < 0) { month = 11; year--; }

        if (typeof SriLoop !== 'undefined' && typeof SriLoop.iniciar === 'function') {
            await SriLoop.iniciar([client], { year, monthIndex: month }, 0);
        }

        await SafeStorage.set({
            pending_sri_autofill: {
                ruc: client.ruc,
                password: client.password,
                name: client.name,
                timestamp: Date.now(),
                manual: true
            },
            pendingAction: 'turbo_step1_facturas',
            checkFacturas: true,
            checkRetenciones: true,
            checkNC: true,
            workflowPeriod: { year: year, monthIndex: month },
            actionTimestamp: Date.now(),
            skipSafetyCheck: true,
            sriAutomationPaused: false,
            sri_master_switch_on: true,
            autoDeclaration: true
        });

        window.location.href = 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT';
    }

    showContextCard(data) {
        return new Promise((resolve) => {
            if (this.contextCard) this.contextCard.remove();
            if (this.contextOverlay) this.contextOverlay.remove();
            
            let secondsLeft = (typeof data.timeout === 'number' && data.timeout > 0) ? Math.floor(data.timeout / 1000) : null;
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
                        this.suggestionDismissed = true;
                        cleanup();
                        if (typeof act.action === 'function') act.action();
                        if (typeof act.onAction === 'function') act.onAction();
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
                const confirmEl = document.getElementById('elite-confirm-text');
                if (confirmEl) confirmEl.appendChild(countdownSpan);

                countdownInterval = setInterval(() => {
                    secondsLeft--;
                    const span = document.getElementById('elite-timeout-countdown');
                    if (span) span.textContent = `(${secondsLeft}s)`;
                    const autoTimerEl = document.getElementById('elite-autotimer');
                    if (autoTimerEl) autoTimerEl.textContent = `${secondsLeft}s`;
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

        // Ya no existe en el panel: el control vive en el HUD.
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
        this.bindBtn('#btn-panel-recover-pdf', () => this.runUnifiedWorkflow('RECOVER_PDF_ONLY'));

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
        this.bindBtn('#btn-panel-magic-final', async () => {
            await this.ejecutarCierreMagico();
        });

        this.bindBtn('#btn-panel-borrar', async () => {
            if (confirm('¿Limpiar memoria temporal y cerrar sesión en el SRI?')) {
                await GhostMemory.clearCurrent();
                await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod', 'sriAutomationPaused', 'pending_sri_autofill']);
                this.updateSummary();
                this.showEliteToast({ title: '🔒 Cerrando Sesión', msg: 'Memoria limpiada. Redirigiendo...', duration: 3000 });
                await sleep(1000);
                await cerrarSesionSRI();
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

        this.bindBtn('#btn-panel-force-next', async () => {
            this.log('⏭️ Forzando paso manual...');
            let dismissed = false;
            const dialogs = Array.from(document.querySelectorAll('div.ui-dialog, div.ui-confirm-dialog')).filter(d => (typeof esVisible === 'function' ? esVisible(d) : d.offsetParent !== null) && getComputedStyle(d).display !== 'none');
            for (const dlg of dialogs) {
                const candidates = Array.from(dlg.querySelectorAll('button, span.ui-button-text'));
                for (const el of candidates) {
                    const txt = (el.innerText || '').trim().toLowerCase();
                    if (txt === 'aceptar' || txt === 'continuar' || txt === 'si' || txt === 'sí') {
                        const btn = el.closest('button, a') || el;
                        if (typeof esVisible === 'function' ? esVisible(btn) : btn.offsetParent !== null) {
                            btn.click();
                            dismissed = true;
                            this.log('✅ Diálogo forzado a Aceptar.');
                        }
                    }
                }
            }
            if (!dismissed) {
                await this.avanzarSiguienteFormulario();
            }
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

    async avanzarSiguienteFormulario() {
        if (typeof tipoDeDeclaracionEnPantalla === 'function') {
            const { esSustitutiva, marca } = tipoDeDeclaracionEnPantalla();
            if (esSustitutiva) {
                console.error(`🛑 [BLOQUEO ESTRICTO] Prohibido avanzar al resumen: la declaración es "${marca}".`);
                this.log(`🛑 Bloqueo estricto: es una ${marca}. No se avanza al resumen.`);
                return false;
            }
        }
        console.log('🚀 [FORMULARIO] Buscando botón "Siguiente" para avanzar al resumen...');
        await SafeStorage.remove('summary_page_clicked');
        await sleep(1500);
        const btnSiguiente = document.getElementById('frmFlujoDeclaracion:btnFormularioSiguiente') ||
                             document.querySelector('button[id*="btnFormularioSiguiente"]') ||
                             document.querySelector('button[id*="btnSiguiente"]') ||
                             document.querySelector('button[id*="Siguiente"]') ||
                             soloDelPortal(document.querySelectorAll('button, a, span.ui-button-text')).find(el => (el.innerText || '').trim() === 'Siguiente')?.closest('button, a');

        if (btnSiguiente) {
            console.log('✅ Botón "Siguiente" localizado. Clickeando para avanzar al resumen SRI...');
            if (typeof clickElement === 'function') clickElement(btnSiguiente, 'Siguiente Formulario');
            else btnSiguiente.click();

            // Leer y aprobar automáticamente cualquier cuadro de advertencias o validaciones normales del SRI
            console.log('🛡️ Verificando y desmisseando advertencias normales de validación SRI (Bucle extendido para conexiones lentas)...');
            let reachedSummary = false;
            for (let i = 0; i < 25; i++) {
                await sleep(800);
                await autoDismissSriWarnings();

                // Salida temprana si el resumen ya cargó (verificación robusta)
                const btnAceptarRes = typeof findAceptarBtnOnSummary === 'function' ? findAceptarBtnOnSummary() : null;
                if (btnAceptarRes && (typeof esVisible === 'function' ? esVisible(btnAceptarRes) : true)) {
                    console.log('✅ Resumen real detectado (Botón Aceptar visible). Saliendo del bucle de advertencias temprano.');
                    reachedSummary = true;
                    break;
                }
            }

            // ── ELITE: Detectar advertencias inline del panelMensajes (casillero 625 u otras conocidas) ──
            if (!reachedSummary) await sleep(1200);
            
            const panelMsg = document.getElementById('frmFlujoDeclaracion:panelMensajes') ||
                             document.querySelector('[id*="panelMensajes"]');

            if (panelMsg && (typeof esVisible === 'function' ? esVisible(panelMsg) : true)) {
                const msgItems = Array.from(panelMsg.querySelectorAll('li.estiloItemsMensajes, li[class*="Mensajes"], .ui-messages-warn li, .ui-messages-info li'));
                const msgTexts = msgItems.map(li => (li.innerText || '').trim().toLowerCase());

                // Mensajes conocidos SEGUROS del casillero 625 (solo informativos, no errores)
                const SAFE_PATTERNS = [
                    'casillero 625',
                    'facultad determinadora',
                    'código tributario',
                    'crédito tributario no haya superado los 5 años',
                    'artículo 68'
                ];

                const allSafe = msgTexts.length > 0 && msgTexts.every(txt =>
                    SAFE_PATTERNS.some(pat => txt.includes(pat.toLowerCase()))
                );

                if (allSafe) {
                    console.log(`✅ [ELITE] Solo advertencias informativas del casillero 625 detectadas (${msgTexts.length}). Re-clickeando "Siguiente" para continuar...`);
                    if (window.sriAssistant) {
                        window.sriAssistant.showEliteToast({
                            title: '⚠️ Advertencias 625 Ignoradas',
                            msg: 'Advertencias informativas conocidas. Avanzando automáticamente...',
                            duration: 3000
                        });
                    }
                    await sleep(800);
                    // Volver a buscar y clickear Siguiente (puede haberse recargado el botón)
                    const btnSig2 = document.getElementById('frmFlujoDeclaracion:btnFormularioSiguiente') ||
                                    document.querySelector('button[id*="btnFormularioSiguiente"]');
                    if (btnSig2) {
                        if (typeof clickElement === 'function') clickElement(btnSig2, 'Siguiente Formulario (Tras Advertencias 625)');
                        else btnSig2.click();

                        // Bucle activo para esperar resumen o dismissar diálogo Aceptar
                        for (let k = 0; k < 15; k++) {
                            await sleep(1000);
                            await autoDismissSriWarnings();
                            
                            // Verificar robustamente si llegamos al resumen
                            const btnAceptarRes = typeof findAceptarBtnOnSummary === 'function' ? findAceptarBtnOnSummary() : null;
                            if (btnAceptarRes && (typeof esVisible === 'function' ? esVisible(btnAceptarRes) : true)) {
                                console.log('✅ [ELITE] Resumen real detectado tras advertencias 625 (Botón Aceptar visible). Bucle terminado.');
                                break;
                            }
                        }
                    }
                } else if (msgTexts.length > 0) {
                    console.warn('⚠️ [ELITE] Hay mensajes en panelMensajes que NO son seguros para ignorar:', msgTexts);
                    this.log('⚠️ [MENSAJES SRI] Mensajes impiden continuar: ' + msgTexts.slice(0, 2).join(' | '));
                    return false;
                }
            }

            // ── ELITE: Lanzamiento de Cierre Mágico Automático tras pasar advertencias ──
            await sleep(1500);
            const autoItems = await SafeStorage.get(['autoDeclaration', 'sri_auto_mode']);
            if (autoItems.autoDeclaration || autoItems.sri_auto_mode) {
                console.log('🚀 [FORMULARIO] Invocando Cierre Mágico Automático de forma segura (verificando saldos)...');
                if (typeof this.ejecutarCierreMagico === 'function') {
                    await this.ejecutarCierreMagico();
                } else {
                    console.error('❌ [ELITE] no se encontró ejecutarCierreMagico');
                }
            }

            return true;
        } else {
            console.warn('⚠️ No se encontró automáticamente el botón "Siguiente".');
            return false;
        }
    }

    async handleFillForm(type) {
        this.log('⏳ Ejecutando acción...');
        try {
            const storage = (await GhostMemory.getData()) || {};
            if (!storage.facturas && !storage.retenciones) {
                console.log('ℹ️ Sin facturas previas en memoria. Procediendo con sugeridos y valores del formulario...');
                storage.facturas = { totalFacturas: 0, iva15: { cantidad: 0, baseImponible: 0, montoIva: 0 }, iva0: { cantidad: 0, baseImponible: 0 } };
                storage.retenciones = { totalRetenciones: 0, retIva: 0, retRenta: 0, baseImponible: 0 };
            }
            if (type === 'TODO') {
                const okLlenado = await autoLlenarFormulario(storage);
                if (!okLlenado) {
                    this.log('🛑 Llenado cancelado o frenado (sustitutiva o error). No se avanzará.');
                    this.setStatus('🛑 Llenado cancelado');
                    return false;
                }
                this.log('✅ Formulario Llenado Exitosamente.');
                this.setStatus('✅ Avanzando a Siguiente...');
                this.showEliteToast({
                    title: '⚡ Formulario Llenado',
                    msg: 'Valores ingresados con éxito. Presionando "Siguiente" automáticamente...',
                    duration: 3000
                });
                await this.avanzarSiguienteFormulario();
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
                sri_master_switch_on: true, // 💎 BYPASS MODO REPOSO SI ES ORDEN MANUAL
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

            if (!window.location.href.toLowerCase().includes('comprobantesrecibidos.jsf')) {
                console.log('🚀 [TURBO_FULL] Navegando vía puente SSO a Comprobantes Recibidos...');
                window.location.href = SRI_PUENTE_RECIBIDOS;
            } else {
                window.location.reload(); // Recargar para iniciar el flujo limpio
            }
        } else if (workType === 'EXTRACT_DATA') {
            await SafeStorage.set({
                pendingAction: 'autoFillSearch',
                workflowPeriod: period,
                autoDeclaration: false,
                sriAutomationPaused: false,
                sri_master_switch_on: true, // 💎 BYPASS MODO REPOSO SI ES ORDEN MANUAL
                actionTimestamp: Date.now()
            });

            this.showEliteToast({
                title: "💎 Extracción Manual",
                msg: `Extrayendo datos de ${period.year}...`
            });

            if (typeof navegarAComprobantes === 'function') {
                navegarAComprobantes();
            } else {
                window.location.reload();
            }
        } else if (workType === 'NAVIGATE_AND_FILL') {
            await SafeStorage.set({
                pendingAction: 'startIvaNavigation',
                workflowPeriod: period,
                autoDeclaration: true,
                sriAutomationPaused: false,
                sri_master_switch_on: true, // 💎 BYPASS MODO REPOSO SI ES ORDEN MANUAL
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });
            console.log('🚀 [NAVIGATE_AND_FILL] Navegando vía puente SSO oficial al Formulario IVA...');
            if (window.location.href.includes('recibirDeclaracion')) {
                if (typeof ejecutarNavegacionDeclaracion === 'function') {
                    ejecutarNavegacionDeclaracion(period);
                } else {
                    window.location.reload();
                }
            } else {
                window.location.href = SRI_PUENTE_FORMULARIO_IVA;
            }
        } else if (workType === 'NAVIGATE_ONLY') {
            safeStatus('🚀 Iniciando Navegación Inteligente...');
            const p = this.getDefaultPeriod(); // {year, monthIndex}
            await SafeStorage.set({
                pendingAction: 'startIvaNavigation',
                workflowPeriod: p,
                autoDeclaration: false, // 🛑 MODO MANUAL (Solo Navegación)
                sriAutomationPaused: false,
                sri_master_switch_on: true, // 💎 BYPASS MODO REPOSO SI ES ORDEN MANUAL
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });
            console.log('🚀 [NAVIGATE_ONLY] Navegando vía puente SSO oficial al Formulario IVA...');
            if (window.location.href.includes('recibirDeclaracion')) {
                if (typeof ejecutarNavegacionDeclaracion === 'function') {
                    ejecutarNavegacionDeclaracion(p);
                } else {
                    window.location.reload();
                }
            } else {
                window.location.href = SRI_PUENTE_FORMULARIO_IVA;
            }
        } else {
            // Sin esta rama, un workType no soportado dejaba el panel bloqueado
            // en estado "trabajando" sin ninguna señal para el usuario.
            console.warn('⚠️ [WORKFLOW] Tipo de flujo no soportado:', workType);
            this.log(`⚠️ Flujo "${workType}" no disponible.`);
            this.setWorking(false);
        }
    }

    /**
     * Cierre POST-ENVÍO: se ejecuta cuando el SRI ya mostró la pantalla de
     * confirmación (botón IMPRIMIR / "declaración procesada"). Solo respalda el
     * comprobante, sincroniza y cierra sesión — NO valida saldos porque a esta
     * altura la declaración ya fue enviada.
     * No confundir con ejecutarCierreMagico(), que es el cierre PRE-ENVÍO.
     */
    async finalizarPostEnvioSRI() {
        if (this.state.isPostSubmitClosing) return;
        // Si el Cierre Mágico pre-envío está en vuelo, él se encarga del sync.
        if (this.state.isProcessingFinal) return;
        this.state.isPostSubmitClosing = true;
        this.log('✨ Ejecutando cierre post-envío...');
        safeStatus('✨ Guardando declaración y cerrando sesión...');

        const info = this.extractClientInfo();
        const targetPeriodStr = await this.getCanonicalPeriodStr();

        // 💎 ELITE FIX: Capturar la memoria ANTES de limpiarla para que el Sync manual recoja las métricas (ventas, compras, etc)
        let preFetchedGhostData = {};
        if (typeof GhostMemory !== 'undefined') {
            preFetchedGhostData = await GhostMemory.getData().catch(() => ({}));
        }

        if (info.ruc) {
            // 🧾 Constancia primero: si la subida falla, igual quedó registrado
            // que este contribuyente ya declaró este periodo.
            // El periodo sale del lote, no de recalcular la fecha: es el que se está
                        // declarando de verdad. (Antes usaba cYear/cMonth, que en este punto
                        // todavía no existen: ReferenceError que abortaba el cierre entero.)
                        const perDecl = (await SafeStorage.get(['workflowPeriod'])).workflowPeriod || SriLoop.periodoPorDefecto();
                        await SriLoop.marcarDeclarado(info.ruc, perDecl, { nombre: info.name });
            await syncDeclarationToSupabase(info.ruc, targetPeriodStr, null, info.name, preFetchedGhostData, "completado");
        }

        this.showEliteToast({
            title: '🎉 ¡Declaración Completada!',
            msg: 'Comprobante respaldado en Supabase. Cerrando sesión...',
            duration: 3000
        });

        await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod', 'sriAutomationPaused', 'pending_sri_autofill']);
        await GhostMemory.clearCurrent();

        if (await loteDebeContinuar()) {
            await sleep(2000);
            const batchNext = await handleBatchNextClient();
            if (!batchNext) {
                if (typeof cerrarSesionSRI === 'function') await cerrarSesionSRI();
                else window.location.href = 'https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/logout';
            }
        } else {
            await sleep(2500);
            await SafeStorage.set({ sri_master_switch_on: false });
            await cerrarSesionSRI();
        }
        this.state.isPostSubmitClosing = false;
    }

    /**
     * El período con el que se archiva el comprobante: `AAAA-MM`.
     *
     * De acá salen la ruta en R2 y la clave de Supabase
     * (`on_conflict=client_id,type,period`). Equivocarlo no pierde el archivo:
     * lo guarda con el nombre de otro mes y **pisa lo que hubiera ahí**.
     *
     * Se cruzan las dos fuentes que existen y, si no coinciden, **se avisa**.
     * Antes una tapaba a la otra en silencio.
     */
    async getCanonicalPeriodStr() {
        const comoTexto = (y, m) => `${y}-${m.toString().padStart(2, '0')}`;
        let dePantalla = null;
        let deLote = null;

        try {
            const fp = this.extractFormPeriod();
            if (fp && fp.year && fp.month) dePantalla = comoTexto(fp.year, fp.month);
        } catch (e) { /* extractFormPeriod ya devuelve null si no sabe */ }

        try {
            const wp = (await SafeStorage.get(['workflowPeriod'])).workflowPeriod;
            if (wp && wp.year) {
                const m = typeof wp.monthIndex === 'number' ? wp.monthIndex + 1 : (wp.month || 0);
                if (m >= 1 && m <= 12) deLote = comoTexto(wp.year, m);
            }
        } catch (e) { /* ídem */ }

        // Las dos hablan y dicen cosas distintas: eso es una señal, no un
        // empate a resolver a ojo. Manda lo que el bot le PIDIÓ al portal
        // —que es lo que efectivamente se declaró— y queda dicho en el log.
        if (dePantalla && deLote && dePantalla !== deLote) {
            console.warn(`⚠️ [PERÍODO] La pantalla dice ${dePantalla} y el lote ${deLote}. ` +
                         `Se archiva como ${deLote}, que es el período que se navegó. ` +
                         'Si esto se repite, hay que mirarlo: el comprobante se guarda con esta fecha.');
            if (typeof anotarBitacora === 'function') {
                anotarBitacora('⚠️ período discrepante', `pantalla ${dePantalla} · lote ${deLote}`);
            }
            return deLote;
        }

        if (deLote) return deLote;
        if (dePantalla) return dePantalla;

        // Ninguna de las dos supo. El mes anterior es una suposición, y como
        // tal se dice en voz alta: de este número depende dónde se archiva.
        const now = new Date();
        let cMonth = now.getMonth() - 1;
        let cYear = now.getFullYear();
        if (cMonth < 0) { cMonth = 11; cYear--; }
        const supuesto = comoTexto(cYear, cMonth + 1);
        console.warn(`⚠️ [PERÍODO] Ni la pantalla ni el lote dijeron el período. ` +
                     `Se supone ${supuesto} (el mes anterior). Revisá dónde quedó el comprobante.`);
        return supuesto;
    }

    /**
     * Lee el saldo a pagar de la pantalla actual.
     * Devuelve un número, o **null** si no se pudo leer.
     * null NO es 0: de esa distinción depende que el bot envíe o frene.
     */
    detectarSaldo() {
            // 0a) LO QUE FALTA CUBRIR. Manda sobre todo lo demás.
            //
            //     CONFIRMADO 06-sep-2026 en una corrida real: el mismo resumen
            //     mostraba `totalAPagar` en "USD 0.00" mientras este panel decía
            //     "Pendiente por cubrir: USD 9.60". No se contradicen: el total
            //     ya está cubierto por notas de crédito o retenciones EXCEPTO
            //     esos $9.60, que siguen debiéndose.
            //
            //     Quedarse con el cero de arriba es declarar que no hay nada que
            //     pagar cuando sí lo hay. Si este panel dice un número mayor a
            //     cero, ése ES el saldo y no se mira nada más.
            const panelMedios = document.getElementById('frmFlujoDeclaracion:divSaldosMediosPago');
            if (panelMedios && (typeof esVisible !== 'function' || esVisible(panelMedios))) {
                const texto = (panelMedios.innerText || panelMedios.textContent || '');
                const m = texto.match(/pendiente\s+por\s+cubrir\s*:?\s*(?:USD)?\s*([\d.,]+)/i);
                const pendiente = m ? parseImporteEstricto(m[1]) : null;
                if (pendiente !== null && pendiente > 0) {
                    console.warn(`💰 [SALDO] "Pendiente por cubrir" = ${pendiente}. ` +
                                 'Manda sobre el total a pagar: hay plata sin cubrir.');
                    return pendiente;
                }
            }

            // 0b) Resumen de pago. IDs CONFIRMADOS en el diagnóstico del
            //    04-sep-2026. Vienen como "USD 0.00" y son DOS columnas: sin
            //    remisión y con remisión. Se toma la mayor, que es la lectura
            //    prudente: si cualquiera de las dos tiene saldo, hay saldo.
            const remision = ['frmFlujoDeclaracion:outTotalPagarSinRemision',
                              'frmFlujoDeclaracion:outTotalPagarConRemision']
                .map((id) => {
                    const el = document.getElementById(id);
                    return el ? parseImporteEstricto(el.innerText || el.textContent) : null;
                })
                .filter((v) => v !== null);

            if (remision.length) {
                const v = Math.max(...remision);
                console.log(`💰 [SALDO] resumen de pago (${remision.join(' / ')}) → ${v}`);
                return v;
            }

            // 1) Resumen final. ID CONFIRMADO contra el portal real (03-sep-2026):
            //    <span id="frmFlujoDeclaracion:totalAPagar">USD 0.00</span>
            const spanResumen = document.getElementById('frmFlujoDeclaracion:totalAPagar');
            if (spanResumen) {
                const v = parseImporteEstricto(spanResumen.innerText || spanResumen.textContent);
                if (v !== null) {
                    console.log('💰 [SALDO] frmFlujoDeclaracion:totalAPagar =', v);
                    return v;
                }
            }

            // 2) Dentro del formulario, sección TOTALES, casillero 2610:
            //    <input id="concepto2610" readonly value="0.00">
            const inputTotales = document.getElementById('concepto2610');
            if (inputTotales) {
                const v = parseImporteEstricto(inputTotales.value || inputTotales.getAttribute('value'));
                if (v !== null) {
                    console.log('💰 [SALDO] concepto2610 (TOTALES) =', v);
                    return v;
                }
            }

            // 3) Último recurso: por texto.
            const labels = Array.from(document.querySelectorAll('label, span, td'))
                .filter((el) => /a pagar/i.test(el.textContent || ''));
            for (const label of labels) {
                const container = label.closest('tr') || label.parentElement;
                if (!container) continue;
                const valueEl = container.querySelector('.ui-outputtext, b, td:last-child');
                const v = parseImporteEstricto(valueEl ? (valueEl.innerText || valueEl.textContent) : null);
                if (v !== null) {
                    console.log('💰 [SALDO] leído por texto =', v);
                    return v;
                }
            }

            console.warn('⚠️ [SALDO] No se pudo leer el saldo en esta pantalla.');
            return null;
    }
    /**
     * Clasifica los mensajes de la pantalla de resumen del SRI.
     * Devuelve 'limpio' | 'con_inconsistencias' | 'desconocido'.
     * 'desconocido' NO significa "todo bien": el llamador DEBE frenar.
     */
    analizarMensajesResumen() {
        // ── Señal oficial del portal, la que manda ────────────────────────
        // Ver el JS del SRI citado arriba de esta función en el commit.
        const panelErrores = document.getElementById('frmFlujoDeclaracion:erroresField');
        if (panelErrores) {
            const visible = typeof esVisible === 'function'
                ? esVisible(panelErrores)
                : getComputedStyle(panelErrores).display !== 'none';
            if (visible) {
                const detalle = (panelErrores.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200);
                console.warn('🛑 [MENSAJES SRI] El portal muestra su panel de ERRORES:', detalle);
                return 'con_inconsistencias';
            }
            // Oculto = el portal dice que no hay errores. Es prueba positiva,
            // no ausencia de evidencia: la escribe su propio mostrarErrores().
            const principal = document.getElementById('mensajePrincipal');
            const txtPrincipal = principal ? (principal.innerText || '') : '';
            if (/errores en su declaraci/i.test(txtPrincipal)) {
                console.warn('🛑 [MENSAJES SRI] mensajePrincipal anuncia errores:', txtPrincipal.trim().slice(0, 160));
                return 'con_inconsistencias';
            }

            const panelAdv = document.getElementById('frmFlujoDeclaracion:advertenciasField');
            if (panelAdv && (typeof esVisible === 'function' ? esVisible(panelAdv) : getComputedStyle(panelAdv).display !== 'none')) {
                // Las advertencias NO impiden declarar -el casillero 625 sale
                // siempre-, pero quedan anotadas por si hay que revisarlas.
                console.log('ℹ️ [MENSAJES SRI] Advertencias del portal:',
                    (panelAdv.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200));
            }
            console.log('✅ [MENSAJES SRI] El portal tiene su panel de errores oculto: sin inconsistencias.');
            return 'limpio';
        }

        // ── Sin el panel oficial, la red de texto de siempre ──────────────
        const nodos = Array.from(
            document.querySelectorAll('[class*="ui-messages"], [class*="Mensajes"], .ui-growl-item, li.estiloItemsMensajes')
        ).filter((el) => (typeof esVisible === 'function' ? esVisible(el) : el.offsetParent !== null));

        // Sin mensajes = pantalla limpia. La prueba positiva la aporta el saldo,
        // que ahora se lee de un ID confirmado; acá solo buscamos señales NEGATIVAS.
        if (nodos.length === 0) return 'limpio';

        const norm = (s) => String(s || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ').toLowerCase();

        // Advertencias informativas del casillero 625, verificadas contra el
        // portal real (03-sep-2026). Salen SIEMPRE y no impiden declarar:
        //   <li class="estiloItemsMensajes">Casillero 625. Verifique que su
        //   crédito tributario no haya superado los 5 años.</li>
        const INFORMATIVAS = [
            'casillero 625',
            'facultad determinadora',
            'articulo 68 del codigo tributario',
            'credito tributario no haya superado los 5 anos'
        ];

        const LIMPIAS = ['no presenta inconsistencias', 'sin inconsistencias', 'declaracion valida'];
        const MALAS = ['inconsistencia', 'no puede continuar', 'debe corregir', 'valor incorrecto', 'error en la declaraci'];

        let hayMalo = false;

        for (const el of nodos) {
            const t = norm(el.innerText || el.textContent);
            if (!t) continue;
            if (LIMPIAS.some((x) => t.includes(x))) continue;
            if (INFORMATIVAS.some((x) => t.includes(x))) continue;   // ruido conocido
            if (MALAS.some((x) => t.includes(x))) { hayMalo = true; continue; }
            if (/ui-messages-(error|fatal)/.test(el.className)) { hayMalo = true; continue; }
            console.warn('⚠️ [MENSAJES SRI] Mensaje no catalogado, se trata como inconsistencia:', t.slice(0, 140));
            hayMalo = true;
        }

        return hayMalo ? 'con_inconsistencias' : 'limpio';
    }

    /**
     * Radiografía de la pantalla de resumen/pago: IDs y textos candidatos para
     * calibrar los selectores de saldo e inconsistencias. Se guarda en
     * SafeStorage para que sobreviva a la recarga del SRI.
     * Los números de 10-13 dígitos (RUC) se enmascaran antes de guardar.
     */
    async capturarDiagnosticoResumen(contexto = {}) {
        try {
            const anon = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 140).replace(/\d{10,13}/g, '«RUC»');
            const txt = (el) => anon(el.innerText || el.textContent || '');
            const L = [];

            L.push('URL: ' + location.pathname);
            L.push('Lectura del bot -> saldo=' + JSON.stringify(contexto.totalValor) +
                   ' saldoConocido=' + contexto.saldoConocido +
                   ' mensajes=' + contexto.estadoMensajes);

            L.push('--- 1. IDs QUE SUENAN A SALDO ---');
            document.querySelectorAll('[id*="otal"],[id*="agar"],[id*="aldo"],[id*="alor"]').forEach((el) => {
                if (el.children.length < 3) L.push('  id="' + el.id + '" <' + el.tagName.toLowerCase() + '> -> "' + txt(el) + '"');
            });

            L.push('--- 2. FILAS CON "a pagar" ---');
            document.querySelectorAll('label,span,td,div').forEach((el) => {
                if (el.children.length === 0 && /a pagar/i.test(el.textContent || '')) {
                    const fila = el.closest('tr') || el.parentElement;
                    L.push('  "' + txt(el) + '" -> fila: ' + (fila ? txt(fila) : '(sin fila)'));
                }
            });

            L.push('--- 3. MENSAJES DEL SRI ---');
            document.querySelectorAll('[class*="ui-messages"],[class*="Mensajes"],.ui-growl-item').forEach((el) => {
                if (typeof esVisible === 'function' ? esVisible(el) : el.offsetParent) L.push('  class="' + el.className + '" -> "' + txt(el) + '"');
            });

            L.push('--- 4. BOTONES VISIBLES ---');
            document.querySelectorAll('button,a.ui-button,div.ui-button').forEach((el) => {
                if ((typeof esVisible === 'function' ? esVisible(el) : el.offsetParent) && !el.closest('.ui-dialog')) L.push('  id="' + el.id + '" -> "' + txt(el) + '"');
            });

            const reporte = L.join('\n');
            await SafeStorage.set({ sri_diagnostico_resumen: { at: Date.now(), reporte } });
            console.log('🔎 [DIAGNÓSTICO RESUMEN SRI]\n' + reporte);
            return reporte;
        } catch (e) {
            console.warn('No se pudo capturar el diagnóstico del resumen:', e);
            return '';
        }
    }

    /** Imprime el último diagnóstico guardado, listo para copiar y pegar. */
    async verDiagnosticoResumen() {
        const r = await SafeStorage.get(['sri_diagnostico_resumen']);
        const d = r.sri_diagnostico_resumen;
        if (!d) {
            console.log('ℹ️ Todavía no hay diagnóstico: se captura al llegar a la pantalla de resumen/pago.');
            return null;
        }
        console.log('🔎 Diagnóstico del ' + new Date(d.at).toLocaleString('es-EC') + ':\n\n' + d.reporte);
        return d.reporte;
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

        const terminalEl = document.getElementById('sri-micro-terminal');
        if (terminalEl) {
            const time = new Date().toLocaleTimeString([], {hour12: false});
            const line = document.createElement('div');
            line.innerHTML = `<span style="color: #64748b;">[${time}]</span> ${msg}`;
            terminalEl.appendChild(line);
            terminalEl.scrollTop = terminalEl.scrollHeight;
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
        const btnDetener = document.getElementById('btn-panel-detener');
        if (isActive) {
            this.container.classList.add('sri-working');
            if (ghost) ghost.classList.add('is-working-ghost');
            if (btnDetener) btnDetener.style.animation = 'sri-pulse 1.5s infinite';
        } else {
            this.container.classList.remove('sri-working');
            if (ghost) ghost.classList.remove('is-working-ghost');
            if (btnDetener) btnDetener.style.animation = 'none';
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

    async stopAutomation(requireConfirm = false) {
        if (requireConfirm && !confirm('¿Desea detener la automatización?')) {
            return;
        }

        await SafeStorage.set({
            sriAutomationPaused: true,
            autoDeclaration: false,
            sri_auto_mode: false,
            auto_batch_enabled: false,
            ghost_manual_mode: true
        });
        await SafeStorage.remove(['pendingAction', 'actionTimestamp']);

        this.setWorking(false);
        this.manualMode = true;
        this.clearCards();
        this.log('🛑 Automatización detenida. Modo Manual Activado.');
        this.showEliteToast({
            title: '🛑 AUTOMATIZACIÓN DETENIDA',
            msg: 'Has tomado el control manual. El formulario no se enviará automáticamente.',
            duration: 5000
        });
        this.render();
    }
}

// Inicializar panel automáticamente
window.sriAssistant = new SriAssistantPanel();

