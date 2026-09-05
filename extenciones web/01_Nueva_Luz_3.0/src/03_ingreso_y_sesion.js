SafeStorage.get(null).then(async (items) => {
    const isLoginPage = isSRILoginPage();

    // ── Radiografía de arranque ────────────────────────────────────────────
    try {
        const sem = await SriLoop.get();
        const af = items.pending_sri_autofill;
        const total = (sem.cola || []).length;
        console.log(
            `🚦 [ESTADO] semáforo=${sem.estado}` +
            `${total ? ` · cliente ${sem.indice + 1}/${total}` : ' · sin lote'}` +
            ` · autofill=${af ? `${af.name || af.ruc} [${[af.manual && 'manual', af.isBatch && 'lote', af.loginAttempted && 'login-hecho'].filter(Boolean).join(',') || 'sin banderas'}]` : 'no'}` +
            ` · acción=${items.pendingAction || '—'}` +
            ` · login=${isLoginPage ? 'sí' : 'no'}` +
            `${sem.motivo ? ' · ' + sem.motivo : ''}`
        );
        // Solo se anota si hay lote o credenciales en juego: en navegación
        // suelta del usuario la bitácora no tiene nada que explicar.
        if (sem.estado !== 'DETENIDO' || af) {
            await anotarBitacora('carga página',
                `${location.pathname.split('/').pop() || '/'} · login=${isLoginPage ? 'sí' : 'no'} · autofill=${af ? (af.name || af.ruc) : 'no'}`);
        }
    } catch (e) { /* no romper el arranque por un log */ }

    if (window.location.href.includes('pagina-no-encontrada')) {
        console.warn('⚠️ [404 SRI] Página no encontrada detectada en Angular. Redirigiendo limpiamente a inicio/NAT...');
        window.location.href = 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT';
        return;
    }

    if (isLoginPage) {
        renderLoginCockpit(items);
        initLoginCockpitWatcher();
    }

    const isAutoFlow = await SriLoop.puedeAvanzar();
    if (items.sri_master_switch_on === false && !isAutoFlow) {
        const autofill = items.pending_sri_autofill;
        // Un cliente de LOTE nunca puede despertar la extensión por su cuenta:
        // para eso está el semáforo. Solo un login manual suelto (el botón del
        // popup o del panel) tiene permiso, porque lo acaba de pedir el usuario.
        // Un lote en pausa NO es un lote sin permiso: sus datos se conservan.
        const semAhora = await SriLoop.get();
        const enPausa = semAhora.estado === 'PAUSADO' || semAhora.estado === 'PAUSANDO';
        const esLoteSinPermiso = !!(autofill && autofill.isBatch) && !enPausa && !(await SriLoop.puedeAvanzar());

        if (autofill && autofill.manual && !esLoteSinPermiso) {
            console.log('🔓 [SRI ELITE] Login manual solicitado. Despertando extensión...');
            await SafeStorage.set({ sri_master_switch_on: true, sriAutomationPaused: false });
            items.sri_master_switch_on = true;
        } else {
            if (esLoteSinPermiso) {
                console.log('🧹 [BUCLE] Resto de un lote detenido en storage. Se descarta.');
                await SafeStorage.remove(['pending_sri_autofill', 'pendingAction', 'actionTimestamp']);
            }
            console.log('💤 [SRI ELITE] Extensión en Modo Reposo (Apagada). Interacciones canceladas.');
            return;
        }
    }

    // Si el formulario de credenciales está en pantalla, estamos afuera.
    // Antes esto exigía un input llamado 'usuario'; como el de Keycloak no se
    // llama así, la extensión creía estar en la portada y nunca llenaba nada.
    const camposLogin = encontrarCamposLogin();
    const isExplicitlyOutside = !!camposLogin;

    const isAlreadyLoggedIn = !isExplicitlyOutside && (
        !window.location.href.toLowerCase().includes('/auth/realms/') &&
        (
            document.getElementById('id_nombre_razon_social') || 
            document.querySelector('.sri-icon-cerrar-sesion') || 
            document.querySelector('.area-usuario') ||
            document.querySelector('.nombre-contribuyente') ||
            document.querySelector('.sri-icon-perfil') ||
            window.location.href.includes('/perfil') ||
            window.location.href.includes('/declaraciones') ||
            window.location.href.includes('comprobantesRecibidos')
        )
    );

    // ── Blindaje Anti-Bloqueo de Cuenta (Límite 1 Intento por Cliente) ─────────
    // Si el SRI rechaza las credenciales o la página recarga y sigue en el login
    // tras haberlo intentado, NUNCA se reintenta: se detiene al PRIMER intento fallido,
    // se purga el storage, se registra en SriCredentialVault y el bucle ferrocarril continúa.
    const feedbackEl = document.querySelector('.alert-error, .alert-danger, .kc-feedback-text, .ui-messages-error, .alert');
    const feedbackText = feedbackEl ? (feedbackEl.innerText || feedbackEl.textContent || '').trim() : '';
    const yaIntentoLogin = isLoginPage && isExplicitlyOutside && !!(items.pending_sri_autofill && items.pending_sri_autofill.loginAttempted);
    const isAccountLocked = /(cuenta|usuario) (bloquead|suspendid|inactiv)/i.test(feedbackText || document.body.innerText) ||
        /(n[uú]mero m[aá]ximo|superado el n[uú]mero) de intentos/i.test(feedbackText || document.body.innerText);
    const hasLoginError = isLoginPage && (
        yaIntentoLogin ||
        isAccountLocked ||
        (feedbackText.length > 0 && /error|inv[aá]lid|incorrect|bloquead|no registrad|superado|fallid/i.test(feedbackText)) ||
        /usuario o contrase[ñn]a (inv[aá]lid|invalid|incorrect)/i.test(document.body.innerText) ||
        /credencial(es)? (inv[aá]lid|incorrect)/i.test(document.body.innerText) ||
        /identificaci[oó]n no registrada/i.test(document.body.innerText)
    );

    if (hasLoginError) {
        console.error('❌ [LOGIN BLINDAJE] Credenciales erróneas o reintento bloqueado. Deteniendo para blindar la cuenta contra bloqueos.');
        const clientRuc = items.pending_sri_autofill?.ruc;
        const clientPass = items.pending_sri_autofill?.password;
        const clientName = items.pending_sri_autofill?.name || clientRuc || 'este cliente';

        // 🛡️ PURGA INMEDIATA: Borrar credenciales de storage para que ninguna recarga vuelva a enviar la clave mala
        await SafeStorage.remove(['pending_sri_autofill', 'pendingAction', 'actionTimestamp']);

        if (clientRuc && typeof SriCredentialVault !== 'undefined') {
            if (isAccountLocked) {
                await SriCredentialVault.recordLocked(clientRuc, feedbackText || 'Cuenta bloqueada o intentos superados en el SRI');
                await Omitidos.anotar(clientRuc, 'cuenta_bloqueada', { nombre: clientName, detalle: feedbackText });
                await marcarCredencialEnLaWeb(clientRuc, 'bloqueada', feedbackText || 'Cuenta bloqueada en el SRI');
            } else {
                await SriCredentialVault.recordFailure(clientRuc, clientPass, feedbackText || 'Credenciales rechazadas en 1er intento');
                await Omitidos.anotar(clientRuc, 'clave_incorrecta', { nombre: clientName, detalle: feedbackText });
                await marcarCredencialEnLaWeb(clientRuc, 'incorrecta', feedbackText || 'El SRI rechazó la clave guardada');
            }
        } else if (clientRuc) {
            const resErr = await SafeStorage.get(['flagged_errors']);
            const errs = resErr.flagged_errors || {};
            errs[clientRuc] = isAccountLocked ? 'cuenta_bloqueada' : 'error_credenciales';
            await SafeStorage.set({ flagged_errors: errs });
        }

        if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
            window.sriAssistant.showEliteToast({
                title: isAccountLocked ? '🚨 Cuenta Bloqueada en SRI' : '🔒 Acceso Detenido (1er Intento)',
                msg: isAccountLocked
                    ? `El SRI reporta que la cuenta de ${clientName} está bloqueada/inactiva. Omitida para continuar el lote.`
                    : `No se pudo ingresar con las credenciales de ${clientName}. Proceso detenido en el 1er intento para proteger la cuenta.`,
                duration: 9000
            });
        }

        const isLoop = items.auto_batch_enabled || (items.pending_sri_autofill && items.pending_sri_autofill.isBatch) || (typeof SriLoop !== 'undefined' && await SriLoop.puedeAvanzar());
        if (isLoop) {
            console.log(`🚂 [FERROCARRIL] Cliente ${clientRuc || ''} omitido con seguridad. Continuando tren al siguiente cliente en 2s...`);
            setTimeout(async () => {
                if (typeof handleBatchNextClient === 'function') {
                    await handleBatchNextClient();
                }
            }, 2000);
        }
        return;
    }


    // Auto-login habilitado si tenemos el RUC del cliente cargado
    const autofillListo = !!(items.pending_sri_autofill && items.pending_sri_autofill.ruc);

    if (isLoginPage && !isAlreadyLoggedIn && autofillListo) {
        const clientRuc = items.pending_sri_autofill.ruc;
        let clientPass = items.pending_sri_autofill.password;
        if (!clientPass) {
            const cacheRes = await SafeStorage.get(['sc_clients_cache']);
            const found = (cacheRes.sc_clients_cache || []).find(c => c.ruc === clientRuc);
            if (found) clientPass = found.password || found.sri_password || found.sriPassword;
        }

        // 🛡️ VERIFICACIÓN PREVENTIVA DE BÓVEDA (ANTES DE TOCAR EL DOM)
        if (typeof SriCredentialVault !== 'undefined') {
            const checkVault = await SriCredentialVault.canAttemptLogin(clientRuc, clientPass);
            if (!checkVault.allowed) {
                console.warn(`🛑 [BLINDAJE SEGURIDAD PREVENTIVO] Omitiendo login de ${clientRuc}: ${checkVault.reason}`);
                await Omitidos.anotar(clientRuc, 'cuenta_bloqueada', {
                    nombre: items.pending_sri_autofill.name, detalle: checkVault.reason });
                await SafeStorage.remove(['pending_sri_autofill', 'pendingAction', 'actionTimestamp']);
                if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
                    window.sriAssistant.showEliteToast({
                        title: '🛡️ Bloqueo Preventivo',
                        msg: `Omitido ${items.pending_sri_autofill.name || clientRuc}: ${checkVault.reason}`,
                        duration: 6000
                    });
                }
                const isLoop = items.auto_batch_enabled || (items.pending_sri_autofill && items.pending_sri_autofill.isBatch) || (typeof SriLoop !== 'undefined' && await SriLoop.puedeAvanzar());
                if (isLoop && typeof handleBatchNextClient === 'function') {
                    setTimeout(() => handleBatchNextClient(), 1500);
                }
                return;
            }
        }

        console.log(`🚀 SRI Assistant: Auto-Login trigger detectado (${items.pending_sri_autofill.name || items.pending_sri_autofill.ruc})...`);
        anotarBitacora('auto-login', items.pending_sri_autofill.name || items.pending_sri_autofill.ruc);

        // Si estamos en la portada de inicio del SRI (ej. inicio/NAT), hacer clic en "Iniciar sesión" para ir a Keycloak
        if (!isExplicitlyOutside) {
            console.log('⏳ Esperando que cargue el botón de Iniciar Sesión en la portada...');
            let loginAttempts = 0;
            const loginInterval = setInterval(() => {
                const loginLink = document.querySelector('pre.sri-iniciar-sesion') ||
                                  document.querySelector('.sri-iniciar-sesion') ||
                                  document.querySelector('p.topbar-item-name') ||
                                  document.querySelector('a[href*="openid-connect"]') ||
                                  (typeof findByText === 'function' ? findByText('Iniciar sesión') : null);

                if (loginLink) {
                    clearInterval(loginInterval);
                    console.log('✅ Portada SRI detectada. Clickeando "Iniciar sesión" para ingresar...');
                    if (typeof clickElement === 'function') clickElement(loginLink, 'Iniciar Sesión Portada');
                    else loginLink.click();
                    const parentLink = loginLink.closest('a, button');
                    if (parentLink) parentLink.click();
                }
                
                loginAttempts++;
                if (loginAttempts > 30) {
                    clearInterval(loginInterval);
                    console.warn('⚠️ [LOGIN] No apareció el botón "Iniciar sesión" de la portada tras 6s. Si estabas en la pantalla de credenciales, avisá: el detector no la reconoció.');
                }
            }, 200);
            return;
        }

        let attempts = 0;
        const autoLoginInterval = setInterval(async () => {
            const campos = encontrarCamposLogin();
            const rucInput = campos && campos.ruc;
            const passInput = campos && campos.pass;
            const btn = campos && campos.btn;

            if (rucInput && passInput && btn) {
                console.log('🔑 [LOGIN] Formulario localizado:',
                    `ruc=#${rucInput.id || rucInput.name || '(sin id)'}`,
                    `clave=#${passInput.id || passInput.name || '(sin id)'}`,
                    `botón="${(btn.innerText || btn.value || '').trim()}"`);
                clearInterval(autoLoginInterval);
                let targetPass = items.pending_sri_autofill.password;
                if (!targetPass) {
                    const cacheRes = await SafeStorage.get(['sc_clients_cache']);
                    const found = (cacheRes.sc_clients_cache || []).find(c => c.ruc === items.pending_sri_autofill.ruc);
                    if (found && (found.password || found.sri_password)) {
                        targetPass = found.password || found.sri_password;
                    }
                }

                escribirCampo(rucInput, items.pending_sri_autofill.ruc);
                const hiddenUser = document.getElementById('username');
                if (hiddenUser && hiddenUser !== rucInput) {
                    hiddenUser.value = items.pending_sri_autofill.ruc;
                }
                if (targetPass) {
                    escribirCampo(passInput, targetPass);
                } else {
                    console.warn('⚠️ [LOGIN] Sin clave para este RUC: el formulario queda a medio llenar.');
                }

                // Desactivar overlays de bloqueo de navegador del SRI si estuvieran activos
                ['disablingDiv', 'advertenciaNavegador', 'noSoportado'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.style.display !== 'none') el.style.display = 'none';
                });

                // Guardar la clave en la caché local automáticamente si el usuario la escribe
                passInput.addEventListener('change', async () => {
                    if (passInput.value && rucInput.value) {
                        const cache = await SafeStorage.get(['sc_clients_cache']);
                        const list = cache.sc_clients_cache || [];
                        const idx = list.findIndex(c => c.ruc === rucInput.value);
                        if (idx !== -1) {
                            list[idx].password = passInput.value;
                            list[idx].sri_password = passInput.value;
                            await SafeStorage.set({ sc_clients_cache: list });
                            console.log('💾 Clave SRI guardada localmente para próximas sesiones.');
                        }
                    }
                });

                ['input', 'change', 'blur'].forEach(ev => {
                    rucInput.dispatchEvent(new Event(ev, { bubbles: true }));
                    if (targetPass) passInput.dispatchEvent(new Event(ev, { bubbles: true }));
                });

                await SafeStorage.set({
                    pending_sri_autofill: { ...items.pending_sri_autofill, loginAttempted: true }
                });

                if (!targetPass) {
                    console.log('⚠️ Falta contraseña para este cliente. Esperando ingreso manual...');
                    if (window.sriAssistant) {
                        window.sriAssistant.showEliteToast({
                            title: '🔑 Clave Requerida',
                            msg: 'Ingresa la clave de este cliente una sola vez y la recordaré automáticamente.',
                            duration: 5000
                        });
                    }
                    return;
                }

                console.log('✅ Credenciales inyectadas. Iniciando sesión...');
                setTimeout(() => {
                    if (typeof clickElement === 'function') clickElement(btn, 'Boton Login Keycloak');
                    else btn.click();
                }, 400);
            }
            attempts++;
            if (attempts > 25) clearInterval(autoLoginInterval);
        }, 200);
        return;
    }

    // ── El SRI exige cambiar la clave de este cliente ──────────────────────
    // No se puede declarar hasta resolverlo, y cambiar contraseñas no es algo
    // que este bot haga. Se marca al cliente y el lote sigue con el siguiente.
    if (esPantallaCambioClave()) {
        const ruc = items.pending_sri_autofill?.ruc;
        const nombre = items.pending_sri_autofill?.name || ruc || 'este contribuyente';
        console.warn(`🔑 [CLAVE] El SRI exige cambiar la clave de ${nombre}. El bot NO cambia contraseñas.`);

        if (ruc) {
            const resErr = await SafeStorage.get(['flagged_errors']);
            const errs = resErr.flagged_errors || {};
            errs[ruc] = true;
            await SafeStorage.set({ flagged_errors: errs });
            console.log(`   ${nombre} queda marcado: el lote lo va a omitir.`);
            await Omitidos.anotar(ruc, 'clave_caducada', { nombre });
            await marcarCredencialEnLaWeb(ruc, 'caducada', 'El SRI exige cambiar la clave antes de entrar');
        }

        if (window.sriAssistant?.showEliteToast) {
            window.sriAssistant.showEliteToast({
                title: '🔑 Clave caducada',
                msg: `El SRI pide cambiar la clave de ${nombre}. Cambiala a mano (extensión 02) y reintentá.`,
                duration: 9000
            });
        }

        if (await SriLoop.puedeAvanzar()) {
            console.log('⏭️ [BUCLE] Saltando al siguiente cliente...');
            anotarBitacora('salta cliente', 'clave caducada');
            await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'pending_sri_autofill']);
            if (typeof handleBatchNextClient === 'function') await handleBatchNextClient();
        }
        return;
    }

    // Antes leía las banderas sueltas: bastaba con basura en storage de una
    // corrida vieja para que arrancara un lote fantasma sin sesión iniciada.
    // isAutoFlow ya evaluado al inicio
    const hasActiveAction = !!(items.pendingAction && (!items.actionTimestamp || (Date.now() - items.actionTimestamp < 120000)));
    const isFreshLogin = !!(items.pending_sri_autofill && items.pending_sri_autofill.loginAttempted);

    if (isAutoFlow && !isAlreadyLoggedIn) {
        // 🚑 RESCATE: el lote está corriendo pero nadie dejó credenciales.
        // Antes se quedaba acá para siempre ("Lote activo pero sin sesión") hasta
        // que el watchdog lo mataba 15 minutos después. El semáforo sabe qué
        // cliente toca: se las preparamos y que el auto-login siga solo.
        if (!items.pending_sri_autofill) {
            const sem = await SriLoop.get();
            const cliente = (sem.cola || [])[sem.indice || 0];
            if (cliente && cliente.password) {
                // Tope de rescates por cliente: si reponer las credenciales no
                // alcanza, algo las borra en cada vuelta y recargar sin límite
                // sería un bucle cerrado. Al segundo intento se frena y avisa.
                const rr = await SafeStorage.get(['sc_rescates']);
                const cont = rr.sc_rescates || {};
                const veces = (cont[cliente.ruc] || 0) + 1;

                if (veces > 2) {
                    console.error(`🚑 [RESCATE] ${cliente.name || cliente.ruc} ya se rescató 2 veces y sigue sin credenciales. Se detiene el lote.`);
                    anotarBitacora('⛔ lote detenido', `rescate agotado en ${cliente.name || cliente.ruc}`);
                    await SriLoop.detener('Rescate agotado: algo borra las credenciales en cada vuelta');
                    return;
                }

                cont[cliente.ruc] = veces;
                await SafeStorage.set({ sc_rescates: cont });

                console.warn(`🚑 [RESCATE ${veces}/2] Lote sin credenciales en ${cliente.name || cliente.ruc}. Reponiéndolas desde el semáforo.`);
                anotarBitacora('🚑 rescate', `${veces}/2 · credenciales repuestas: ${cliente.name || cliente.ruc}`);
                await SriLoop.prepararCliente(cliente, sem.periodo || SriLoop.periodoPorDefecto());
                await sleep(400);
                window.location.reload();
                return;
            }
            console.warn('🚑 [RESCATE] El semáforo no tiene un cliente con clave en esta posición. Deteniendo el lote.');
            anotarBitacora('⛔ lote detenido', 'sin cliente con clave en el semáforo');
            await SriLoop.detener('Sin credenciales para el cliente en curso');
            return;
        }
        console.log('⏳ [BUCLE] Lote activo pero sin sesión todavía. Esperando el login.');
        anotarBitacora('esperando login', 'con credenciales');
    } else if (isAlreadyLoggedIn && (isFreshLogin || (!hasActiveAction && (isAutoFlow || (items.pending_sri_autofill && (items.pending_sri_autofill.isBatch || items.pending_sri_autofill.manual)))))) {
        if (typeof SriCredentialVault !== 'undefined' && items.pending_sri_autofill?.ruc) {
            await SriCredentialVault.recordSuccess(items.pending_sri_autofill.ruc, items.pending_sri_autofill.password);
        }
        // Entró bien: si había un aviso de clave en la web, ya no corresponde.
        if (items.pending_sri_autofill?.ruc) {
            marcarCredencialEnLaWeb(items.pending_sri_autofill.ruc, 'ok').catch(() => {});
        }
        // Entró: el rescate (si lo hubo) cumplió. Contador a cero.
        if (items.pending_sri_autofill?.ruc && items.sc_rescates?.[items.pending_sri_autofill.ruc]) {
            const cont = { ...items.sc_rescates };
            delete cont[items.pending_sri_autofill.ruc];
            await SafeStorage.set({ sc_rescates: cont });
        }
        // 🧾 Este cliente solo necesita su comprobante: no se le declara nada.
        if (items.pendingAction === 'recuperar_comprobante' && items.recuperarComprobante) {
            console.log('🧾 Sesión activa: este cliente ya declaró, vamos por su comprobante.');
            await SafeStorage.set({ actionTimestamp: Date.now() });
            window.location.href = SRI_PUENTE_CONSULTA_DECLARACIONES;
            return;
        }

        // 📋 Qué pide el SRI para este contribuyente, dicho por el portal.
        // Antes se asumía "el mes pasado" y se esperaba a que el perfil dejara
        // de mostrar la obligación, que tarda ~20 min en actualizarse.
        try {
            const pend = await SriApi.ivaPendiente();
            if (pend) {
                console.log(`📋 [SRI] IVA ${pend.periodoTexto} · vence ${pend.vence} ` +
                            `(${pend.dias} días, ${pend.urgencia}) · ${pend.estado}`);
                await anotarBitacora('el SRI pide', `IVA ${pend.periodoTexto} · ${pend.estado}`);

                if (!pend.pendiente) {
                    console.log('✅ [SRI] El portal ya la da por presentada. No se declara de nuevo.');
                } else if (!items.workflowPeriod) {
                    // Sin período fijado por el lote, el del portal es el bueno.
                    items.workflowPeriod = pend.periodo;
                    await SafeStorage.set({ workflowPeriod: pend.periodo });
                    console.log(`📋 [SRI] Período tomado del portal: ${pend.periodoTexto}.`);
                }
                await SafeStorage.set({ sri_obligacion_actual: pend });
            } else {
                console.log('📋 [SRI] El portal no muestra ninguna obligación de IVA a la vista.');
            }
        } catch (e) { /* la consulta nunca puede frenar el flujo */ }

        console.log('🚀 Sesión activa detectada: Redirigiendo DIRECTO al Paso 1: Comprobantes Recibidos...');
        items.pendingAction = 'turbo_step1_facturas';
        const now = new Date();
        let cMonth = now.getMonth() - 1;
        let cYear = now.getFullYear();
        if (cMonth < 0) { cMonth = 11; cYear--; }
        items.workflowPeriod = items.workflowPeriod || { year: cYear, monthIndex: cMonth };
        items.actionTimestamp = Date.now();
        
        await SafeStorage.set({
            pendingAction: 'turbo_step1_facturas',
            checkFacturas: true,
            checkRetenciones: true,
            checkNC: true,
            workflowPeriod: items.workflowPeriod,
            actionTimestamp: items.actionTimestamp,
            pending_sri_autofill: { ...(items.pending_sri_autofill || {}), loginAttempted: false },
            sriAutomationPaused: false,
            ghost_manual_mode: false,
            sri_auto_mode: true,
            autoDeclaration: true,
            skipSafetyCheck: true
        });

        // Si ya estamos adentro y no estamos en la página de comprobantes recibidos, redirigir ordenadamente
        if (!window.location.href.toLowerCase().includes('comprobantesrecibidos.jsf')) {
            console.log('✈️ [AUTO FLIGHT] Navegando a Comprobantes Recibidos (Paso 1)...');
            if (typeof navegarAComprobantes === 'function') {
                navegarAComprobantes();
            } else {
                window.location.href = SRI_PUENTE_RECIBIDOS;
            }
            return;
        }
    } else if (items.pending_sri_autofill && items.pending_sri_autofill.loginAttempted) {
        // En login manual suelto: Respetar navegación manual
        console.log('ℹ️ Login completado. Control manual respetado (sin auto-redirección).');
        await SafeStorage.set({
            pending_sri_autofill: { ...items.pending_sri_autofill, loginAttempted: false }
        });
    }

    if (items.pendingAction) {
        if (isLoginPage && !isAlreadyLoggedIn && (items.pendingAction === 'startIvaNavigation' || items.pendingAction === 'verifyProfile' || items.pendingAction.includes('turbo'))) {
            if (autofillListo) {
                console.log('🔑 SRI Assistant: En el login con credenciales cargadas. El auto-login se encarga.');
            } else {
                console.log('🛑 SRI Assistant: Detectado Login sin credenciales. Esperando a que el usuario ingrese...');
            }
            return;
        }

        console.log('🔄 Recuperando estado pendiente:', items);
        GhostMemory.getData().then(ghostData => {
            ejecutarAccionPendiente({ ...ghostData, ...items });
        });
    }
});

async function ejecutarAccionPendiente(items) {
    if (!items || !items.pendingAction) return;

    // ELITE v10.5: TIMESTAMP CHECK (STALE ACTION PROTECTION)
    if (items.actionTimestamp) {
        const diff = Date.now() - items.actionTimestamp;
        if (diff > 120000) { // 2 minutos (120,000 ms)
            console.log(`💀 Acción Caducada detectada (${items.pendingAction}, ${Math.round(diff / 1000)}s old). Limpiando...`);
            await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod', 'sriAutomationPaused']);
            return;
        }
    } else {
        if (window.location.href.includes('inicio.jsf') || window.location.href.includes('login')) {
            console.log('💀 Acción Legacy sin timestamp en Inicio. Limpiando...');
            await SafeStorage.remove(['pendingAction']);
            return;
        }
    }

    // 🚦 Si la acción pertenece a un lote, la autoridad es el semáforo.
    // Sin esto, un pendingAction heredado revivía el lote solo, chocaba contra
    // la pantalla de login y moría ("entra un segundo y sale").
    const esDeLote = !!(items.pending_sri_autofill && items.pending_sri_autofill.isBatch);
    if (esDeLote && typeof SriLoop !== 'undefined' && !(await SriLoop.puedeAvanzar())) {
        const sem = await SriLoop.get();
        if (sem.estado === 'PAUSADO' || sem.estado === 'PAUSANDO') {
            // En pausa NO se toca nada: el cliente y su acción quedan esperando.
            console.log(`⏸️ [BUCLE] En pausa en ${items.pending_sri_autofill.name || items.pending_sri_autofill.ruc}. Todo queda guardado; pulsá ▶ para seguir.`);
            anotarBitacora('en pausa', items.pending_sri_autofill.name || items.pending_sri_autofill.ruc);
            return;
        }
        console.log('🧹 Acción de lote descartada: el semáforo está DETENIDO. Usá ▶ para arrancar.');
        await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod', 'pending_sri_autofill']);
        return;
    }

    // 🪪 La sesión abierta debe ser la del cliente que el lote está declarando.
    if (esDeLote && items.pending_sri_autofill?.ruc) {
        const esperado = items.pending_sri_autofill.ruc;

        // Prueba dura: el propio portal dice quién está adentro.
        let enPantalla = {};
        try {
            const p = await SriApi.perfil();
            if (p && p.identificacion) {
                enPantalla = { ruc: String(p.identificacion), highConfidence: true };
                if (enPantalla.ruc !== esperado) {
                    console.error(`🪪 [IDENTIDAD] El portal dice que la sesión es de ${enPantalla.ruc}, ` +
                                  `y el lote espera a ${esperado}.`);
                }
            }
        } catch (e) { /* sin API, seguimos con la cabecera */ }

        if (!enPantalla.ruc && window.sriAssistant && window.sriAssistant.extractClientInfo) {
            enPantalla = window.sriAssistant.extractClientInfo() || {};
        }

        if (enPantalla.ruc && enPantalla.highConfidence && enPantalla.ruc !== esperado) {
            console.error(`🪪 [IDENTIDAD] La sesión abierta es de ${enPantalla.ruc} pero el lote espera a ${esperado}. ` +
                          'No se toca nada: se cierra sesión para que entre el cliente correcto.');
            anotarBitacora('⛔ identidad no coincide', `sesión=${enPantalla.ruc} · esperado=${esperado}`);
            await Omitidos.anotar(esperado, 'identidad', {
                nombre: items.pending_sri_autofill.name,
                detalle: `la sesión abierta era de ${enPantalla.ruc}` });
            await SafeStorage.remove(['pendingAction', 'actionTimestamp']);
            if (typeof cerrarSesionSRI === 'function') await cerrarSesionSRI(true);
            return;
        }
    }

    if (!(await verifySessionConsistency())) return;

    if (!(await checkSessionAlive())) {
        const url = window.location.href.toLowerCase();
        if (url.includes('/auth/realms/') || url.includes('login')) {
            console.log('🔒 Esperando login del usuario...');
            return;
        }
        return;
    }

    console.log(`🔎 Acción pendiente detectada: ${items.pendingAction}`);

    let retries = 0;
    while ((!window.sriAssistant || !window.sriAssistant.container) && retries < 20) {
        await sleep(200);
        retries++;
    }

    // ELITE v10.3: SAFETY STOP BYPASS
    // Si la acción fue iniciada intencionalmente (ej. Turbo), skipSafetyCheck suele ser true.
    const shouldVerify = !items.skipSafetyCheck;

    if (window.sriAssistant && shouldVerify) {
        // --- INTERCEPTOR DE RECUPERACIÓN ESTRICTO (Manual Confirm) ---
        const shouldContinue = await new Promise(resolve => {
            window.sriAssistant.showContextCard({
                title: '🔄 Tarea Pendiente',
                subtitle: 'Recuperando Sesión',
                message: `Se ha detectado una tarea pausada:<br><b>${items.pendingAction}</b>.<br><br>¿Deseas continuar o cancelar?`,
                icon: '⏱️',
                // 🛑 timeout:null = sin cuenta regresiva. Esta tarjeta pregunta,
                // no informa: no puede auto-confirmarse sola a los 4 segundos.
                timeout: null,
                actionText: '▶ CONTINUAR',
                onAction: () => {
                    const card = document.getElementById('sri-context-card');
                    if (card) card.remove();
                    window.sriAssistant.contextCard = null;
                    resolve(true);
                }
            });

            // Agregamos botón secundario de cancelar manualmente a la tarjeta
            setTimeout(() => {
                const card = document.getElementById('sri-context-card');
                if (card) {
                    const btnContainer = card.querySelector('.sri-cc-actions') || card;
                    const cancelBtn = document.createElement('button');
                    cancelBtn.style.cssText = "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); padding: 8px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; margin-top: 8px; width: 100%;";
                    cancelBtn.innerText = '⛔ CANCELAR TAREA';
                    cancelBtn.onclick = async () => {
                        await SafeStorage.remove(['pendingAction', 'workflowPeriod']);
                        window.sriAssistant.showEliteToast({ title: '🛑 Detenido', msg: 'Tarea cancelada y limpiada por el usuario.' });
                        window.sriAssistant.setWorking(false);
                        card.remove();
                        window.sriAssistant.contextCard = null;
                        resolve(false);
                    };
                    btnContainer.appendChild(cancelBtn);
                }
            }, 500);
        });

        if (!shouldContinue) return;
    }

    if (window.sriAssistant && window.sriAssistant.container) {
        // --- ELITE SENSE: Verificar que el cliente no haya cambiado antes de automatizar ---
        if (window.sriAssistant.checkRucChange) {
            await window.sriAssistant.checkRucChange();
        }

        window.sriAssistant.setWorking(true);
        window.sriAssistant.toggleMinimize(true);
    }

    // detector de pausa persistente
    const paused = await isPaused();
    if (paused) {
        // ELITE FIX: Si hay un flujo automático explícito activo ordenado recientemente (<120s),
        // despausar automáticamente para evitar quedar bloqueado por un estado pausado previo
        if (isAutoFlow && items.actionTimestamp && (Date.now() - items.actionTimestamp < 120000)) {
            console.log('🔓 [AUTORUN] Flujo automático activo detectado (<120s). Reactivando sistema previamente pausado...');
            await SafeStorage.set({ sriAutomationPaused: false, ghost_manual_mode: false });
            if (window.sriAssistant) {
                window.sriAssistant.isPaused = false;
                window.sriAssistant.manualMode = false;
                window.sriAssistant.updatePauseUI();
            }
        } else {
            console.log('⏸️ El sistema está pausado. No se retomarán acciones pendientes.');
            if (window.sriAssistant) {
                window.sriAssistant.isPaused = true;
                window.sriAssistant.render();
            }
            return;
        }
    }

    // --- WORKFLOW TURBO (CICLO COMPLETO) ---
    let currentAction = items.pendingAction;
    if (currentAction?.startsWith('turbo_')) {
        console.log(`🚀 MODO TURBO (Local State): ${currentAction}`);

        // Si no estamos en la página de comprobantes recibidos, redirigir directamente
        if (!window.location.href.toLowerCase().includes('comprobantesrecibidos.jsf')) {
            console.log('🚀 [MODO TURBO] Redirigiendo vía puente a Comprobantes Recibidos...');
            if (typeof renderEmergencyStopBar === 'function') renderEmergencyStopBar();
            window.location.href = SRI_PUENTE_RECIBIDOS;
            return;
        }

        if (typeof renderEmergencyStopBar === 'function') renderEmergencyStopBar();

        // Fase 1: Configurar Búsqueda Facturas
        if (currentAction === 'turbo_step1_facturas') {
            const searchRes = await autoLlenarBusqueda({
                ...items.workflowPeriod,
                tipoComprobante: 'Factura',
                autoClickConsultar: true,
                nextStep: 'turbo_step2_extraer_facturas'
            });

            if (searchRes.noData) {
                console.log('ℹ️ No hay Facturas para este periodo.');
                await GhostMemory.set('facturas', { totalFacturas: 0, iva15: { cantidad: 0 }, iva0: { cantidad: 0 } });
                const nextAction = getNextTurboStep('turbo_step2_extraer_facturas', items);
                if (nextAction === 'FIN_TURBO') {
                    currentAction = 'FIN_TURBO';
                } else {
                    await SafeStorage.set({ pendingAction: nextAction, actionTimestamp: Date.now() });
                    window.location.reload();
                    return;
                }
            } else {
                currentAction = 'turbo_step2_extraer_facturas';
            }
        }

        // Fase 2: Extraer Facturas
        if (currentAction === 'turbo_step2_extraer_facturas') {
            await waitFor(() => document.querySelectorAll('td').length > 5 && document.body.innerText.includes('RUC'), 20000, 'Tabla Facturas');
            if (window.sriAssistant) window.sriAssistant.log('📊 Extrayendo facturas automáticamente...');
            const res = await extraerTodasLasFacturas();
            await GhostMemory.set('facturas', res);

            const nextAction = getNextTurboStep('turbo_step2_extraer_facturas', items);
            await SafeStorage.set({
                pendingAction: nextAction,
                actionTimestamp: Date.now()
            });

            if (nextAction === 'FIN_TURBO') {
                currentAction = 'FIN_TURBO';
            } else {
                window.location.reload();
                return;
            }
        }

        // Fase 3: Configurar Búsqueda Retenciones
        if (currentAction === 'turbo_step3_retenciones') {
            const searchRes = await autoLlenarBusqueda({
                ...items.workflowPeriod,
                tipoComprobante: 'Retencion',
                autoClickConsultar: true,
                nextStep: 'turbo_step4_extraer_retenciones'
            });

            if (searchRes.noData) {
                console.log('ℹ️ No hay retenciones para este periodo.');
                await GhostMemory.set('retenciones', { totalRetenciones: 0, ivaRetenido: { total: 0 }, rentaRetenida: { total: 0 }, listaNumeros: [] });

                const nextAction = getNextTurboStep('turbo_step4_extraer_retenciones', items);
                if (nextAction === 'FIN_TURBO') {
                    currentAction = 'FIN_TURBO';
                } else {
                    await SafeStorage.set({ pendingAction: nextAction, actionTimestamp: Date.now() });
                    await sleep(1000);
                    window.location.reload();
                    return;
                }
            } else {
                currentAction = 'turbo_step4_extraer_retenciones';
            }
        }

        // Fase 4: Extraer Retenciones
        if (currentAction === 'turbo_step4_extraer_retenciones') {
            await waitFor(() => document.querySelectorAll('td').length > 5 && document.body.innerText.includes('Comprobante'), 10000, 'Tabla Retenciones');
            if (window.sriAssistant) window.sriAssistant.log('📊 Extrayendo retenciones automáticamente...');
            const res = await extraerTodasLasRetenciones();
            await GhostMemory.set('retenciones', res);

            const nextAction = getNextTurboStep('turbo_step4_extraer_retenciones', items);
            await SafeStorage.set({
                pendingAction: nextAction,
                actionTimestamp: Date.now()
            });

            if (nextAction === 'FIN_TURBO') {
                currentAction = 'FIN_TURBO';
            } else {
                window.location.reload();
                return;
            }
        }

        // Fase 5: Configurar Búsqueda Notas de Crédito
        if (currentAction === 'turbo_step5_notas_credito') {
            const searchRes = await autoLlenarBusqueda({
                ...items.workflowPeriod,
                tipoComprobante: 'Nota de Crédito',
                autoClickConsultar: true,
                nextStep: 'turbo_step6_extraer_notas_credito'
            });

            if (searchRes.noData) {
                console.log('ℹ️ No hay Notas de Crédito para este periodo.');
                await GhostMemory.set('notasCredito', { totalNotas: 0, iva: { total: 0 }, totalGeneral: 0 });
                currentAction = 'FIN_TURBO';
            } else {
                currentAction = 'turbo_step6_extraer_notas_credito';
            }
        }

        // Fase 6: Extraer Notas de Crédito (NUEVO)
        if (currentAction === 'turbo_step6_extraer_notas_credito') {
            await waitFor(() => document.querySelectorAll('td').length > 5 && document.body.innerText.includes('RUC'), 10000, 'Tabla Notas Crédito');
            if (window.sriAssistant) window.sriAssistant.log('📊 Extrayendo Notas de Crédito automáticamente...');
            const res = await extraerTodasLasNotasCredito();
            await GhostMemory.set('notasCredito', res);

            await SafeStorage.remove(['pendingAction']);
            currentAction = 'FIN_TURBO';
        }

        if (currentAction === 'FIN_TURBO') {
            // ELITE BULK: Manejar transición entre meses
            if (items.bulkFlow && items.bulkFlow.active) {
                const resultsStorage = await GhostMemory.getData();
                const currentMonthIndex = items.bulkFlow.currentIndex;

                // Guardar resultados del mes actual en el acumulador bulk
                const newResults = [...(items.bulkFlow.results || [])];
                newResults.push({
                    month: items.bulkFlow.months[currentMonthIndex],
                    data: resultsStorage
                });

                // ELITE FIX: Guardar el nuevo estado del bulkflow para usarlo en esta misma ejecución si es el fin
                items.bulkFlow.results = newResults;

                const nextIndex = currentMonthIndex + 1;
                if (nextIndex < items.bulkFlow.months.length) {
                    const nextMonth = items.bulkFlow.months[nextIndex];
                    const nextFirstStep = getNextTurboStep(null, { ...items, bulkFlow: { ...items.bulkFlow, results: newResults } });

                    if (window.sriAssistant) {
                        window.sriAssistant.log(`🌔 Mes ${items.bulkFlow.months[currentMonthIndex]} completado. Saltando a mes ${nextMonth}...`);
                    }

                    await SafeStorage.set({
                        workflowPeriod: { ...items.workflowPeriod, monthIndex: nextMonth },
                        bulkFlow: { ...items.bulkFlow, currentIndex: nextIndex, results: newResults },
                        pendingAction: nextFirstStep,
                        actionTimestamp: Date.now()
                    });

                    // Limpiar memoria temporal para el siguiente mes
                    await GhostMemory.clearCurrent();

                    await sleep(1000);
                    window.location.reload();
                    return;
                } else {
                    // FIN DEL BULK TOTAL
                    console.log('🏆 FIN DE EXTRACCIÓN MASIVA.');
                    if (window.sriAssistant) window.sriAssistant.log('🏆 FIN DE EXTRACCIÓN MASIVA.');

                    // Actualizar para el bloque de agregación mas adelante
                    items.pendingAction = 'FIN_TURBO_BULK';
                    items.bulkFlow.active = false;

                    await SafeStorage.set({
                        bulkFlow: { ...items.bulkFlow, results: newResults, active: false },
                        pendingAction: 'FIN_TURBO_BULK'
                    });
                    currentAction = 'FIN_TURBO_BULK';
                }
            }

            if (currentAction === 'FIN_TURBO') {
                await SafeStorage.remove(['pendingAction']);
                const storage = await SafeStorage.get(['autoDeclaration']);
                const porSemaforo = await SriLoop.puedeAvanzar();
                const porBandera = storage.autoDeclaration === true;
                const isAuto = porSemaforo || porBandera;
                console.log(`🔀 [FASE 1→2] Extracción lista. ¿Pasar a declarar? ${isAuto ? 'SÍ' : 'NO'} ` +
                            `(semáforo=${porSemaforo}, autoDeclaration=${porBandera})`);
                anotarBitacora('extracción lista',
                    isAuto ? 'pasa a declarar' : `⚠️ NO pasa (semáforo=${porSemaforo}, bandera=${porBandera})`);

                if (window.sriAssistant) {
                    window.sriAssistant.setWorking(false);
                    window.sriAssistant.log(isAuto ? '🚀 DECLARACIÓN: Extracción Completada.' : '📊 REPORTE: Extracción Finalizada.');
                    window.sriAssistant.updateSummary();

                    if (!isAuto) {
                        // Si es reporte, mostrar un aviso de éxito sin sugerir navegación
                        window.sriAssistant.showEliteToast({
                            title: '📊 Reporte Generado',
                            msg: 'Los datos han sido extraídos. Puedes ver el resumen en el panel o exportar a Excel.',
                            duration: 5000
                        });
                    }
                }
                if (isAuto && window.sriAssistant) {
                    // --- TRANSICIÓN DIRECTA A FASE 2: NAVEGACIÓN (ELITE AUTOMATION) ---
                    // En lugar de solo sugerir, disparamos la navegación si es modo auto
                    window.sriAssistant.log('🚀 FASE 1 OK: Saltando a Navegación del Formulario...');
                    setTimeout(() => {
                        window.sriAssistant.runUnifiedWorkflow('NAVIGATE_AND_FILL', items.workflowPeriod);
                    }, 1000);
                }
                return;
            }
        }
    }

    if (currentAction === 'FIN_TURBO_BULK' || items.pendingAction === 'FIN_TURBO_BULK') {
        const bulkResults = items.bulkFlow?.results || [];

        // Agregación Maestra
        const totals = {
            facturasCount: 0,
            iva15: 0,
            iva0: 0,
            montoIva: 0, // NEW: Sum of IVA from invoices
            totalFacturas: 0, // NEW: Sum of (Base + IVA)
            retCount: 0,
            retIva: 0,
            retIvaBase: 0,
            retRenta: 0,
            retRentaBase: 0,
            ncCount: 0,
            ncIva15: 0,
            ncIva0: 0,
            ncIva: 0, // NEW: Sum of IVA from NC
            ncTotal: 0
        };

        bulkResults.forEach(res => {
            const d = res.data;
            if (d.facturas) {
                totals.facturasCount += d.facturas.totalFacturas || 0;
                totals.iva15 += parseDecimal(d.facturas.iva15?.baseImponible || 0);
                totals.iva0 += parseDecimal(d.facturas.iva0?.baseImponible || 0);
                totals.montoIva += parseDecimal(d.facturas.iva15?.montoIva || 0);
                totals.totalFacturas += parseDecimal(d.facturas.iva15?.total || 0) + parseDecimal(d.facturas.iva0?.total || 0);
            }
            if (d.retenciones) {
                totals.retCount += d.retenciones.totalRetenciones || 0;
                totals.retIva += parseDecimal(d.retenciones.ivaRetenido?.total || 0);
                totals.retIvaBase += parseDecimal(d.retenciones.ivaRetenido?.baseTotal || 0);
                totals.retRenta += parseDecimal(d.retenciones.rentaRetenida?.total || 0);
                totals.retRentaBase += parseDecimal(d.retenciones.rentaRetenida?.baseTotal || 0);
            }
            if (d.notasCredito) {
                totals.ncCount += d.notasCredito.totalNotas || 0;
                totals.ncIva15 += parseDecimal(d.notasCredito.iva15?.baseImponible || 0);
                totals.ncIva0 += parseDecimal(d.notasCredito.iva0?.baseImponible || 0);
                totals.ncIva += parseDecimal(d.notasCredito.iva?.total || 0);
                totals.ncTotal += parseDecimal(d.notasCredito.totalGeneral || 0);
            }
        });

        if (window.sriAssistant) {
            window.sriAssistant.setWorking(false);
            window.sriAssistant.log('🏆 EXTRACCIÓN MASIVA FINALIZADA.');
        }

        showBulkEliteToast(totals, items.bulkFlow, items.workflowPeriod);

        const storage = await SafeStorage.get(['autoDeclaration']);
        const isAuto = (await SriLoop.puedeAvanzar()) || storage.autoDeclaration === true;

        await SafeStorage.remove(['pendingAction', 'bulkFlow', 'sriAutomationPaused']);
        
        if (isAuto) {
            console.log('🔄 Modo Auto activado. Continuando con el lote o cerrando sesión...');
            if (typeof handleBatchNextClient === 'function') {
                const batchNext = await handleBatchNextClient();
                if (!batchNext && typeof cerrarSesionSRI === 'function') {
                    await cerrarSesionSRI();
                }
            } else if (typeof cerrarSesionSRI === 'function') {
                await cerrarSesionSRI();
            }
        }
        
        return;
    }

    // CASO REDIRIGIDO: Directo a Comprobantes Recibidos
    if (items.pendingAction === 'verifyProfile') {
        let targetPeriod = items.workflowPeriod;
        console.log('🔄 verifyProfile redirigiendo directamente a Comprobantes Recibidos (turbo_step1_facturas)...', targetPeriod);
        await SafeStorage.set({
            pendingAction: 'turbo_step1_facturas',
            checkFacturas: true,
            checkRetenciones: true,
            checkNC: true,
            workflowPeriod: targetPeriod,
            autoDeclaration: true,
            sri_auto_mode: true,
            sri_master_switch_on: true,
            sriAutomationPaused: false,
            actionTimestamp: Date.now(),
            skipSafetyCheck: true
        });
        window.location.href = SRI_PUENTE_RECIBIDOS;
        return;
    }

    // CASO 2: Navegación al Formulario IVA Wizard (INDESTRUCTIBLE v9.9)
    if (items.pendingAction === 'startIvaNavigation') {
        console.log(`🔎 Check Navegación: Periodo=${JSON.stringify(items.workflowPeriod)} Host=${window.location.hostname}`);

        // Auto-reparación: Si no hay periodo, usar mes anterior por defecto
        let targetPeriod = items.workflowPeriod;
        if (!targetPeriod) {
            console.warn('⚠️ No se encontró workflowPeriod. Usando Mes Anterior por defecto.');
            const today = new Date();
            const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            targetPeriod = {
                year: prevMonth.getFullYear(),
                monthIndex: prevMonth.getMonth() // 0-11
            };
        }

        if (window.location.hostname.includes('sri.gob.ec')) {
            console.log('🔄 Ejecutando: Navegación IVA 2011 hacia', targetPeriod);
            if (window.__sriNavRunning) {
                console.log('⏩ Navegación ya está en ejecución en esta vista.');
                return;
            }
            window.__sriNavRunning = true;

            if (typeof ejecutarNavegacionDeclaracion === 'function') {
                ejecutarNavegacionDeclaracion(targetPeriod);
            } else {
                console.error('❌ CRÍTICO: ejecutarNavegacionDeclaracion no está definida.');
                if (window.sriAssistant) window.sriAssistant.showEliteToast({ title: 'Error Crítico', msg: 'Falló la carga del motor de navegación.' });
            }
        } else {
            console.warn('⚠️ Hostname no coincide con SRI:', window.location.hostname);
        }
        return;
    }

    // CASO ANULADO: Recuperación de PDF Faltante en Consulta de Documentos
    // 🧾 Recuperar el comprobante de una declaración ya presentada, sin volver
    // a declararla. Cruza a otra aplicación del portal, así que puede tardar
    // varias cargas: refrescamos el reloj para que no la mate la guarda de
    // acciones caducadas mientras el puente SSO hace lo suyo.
    if (items.pendingAction === 'recuperar_comprobante') {
        const listo = await ejecutarRecuperacionComprobante();
        if (!listo) await SafeStorage.set({ actionTimestamp: Date.now() });
        return;
    }

    if (items.pendingAction === 'recoverPDF') {
        console.log('🛑 [SRI ASSISTANT] recoverPDF anulado por el usuario. Limpiando acción pendiente...');
        await SafeStorage.remove(['pendingAction', 'actionTimestamp']);
        return;
    }

    // Otros casos de legado...
    if (items.pendingAction === 'fillSearch' || items.pendingAction === 'fillSearchFacturas' || items.pendingAction === 'fillSearchRetenciones' || items.pendingAction === 'autoFillSearch') {
        const type = items.pendingAction.includes('Retencion') ? 'Retencion' : 'Factura';
        const period = items.workflowPeriod || { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 };

        console.log(`🔄 Ejecutando: Llenar Búsqueda ${type}`);
        await autoLlenarBusqueda({ ...period, tipoComprobante: type, autoClickConsultar: true });
        await SafeStorage.remove(['pendingAction']);
        if (window.sriAssistant) window.sriAssistant.setWorking(false);
    }
}


// Helper de pausa persistente
async function isPaused() {
    const data = await SafeStorage.get('sriAutomationPaused');
    return !!data.sriAutomationPaused;
}



// ============================================
// MODULO DE NAVEGACION Y BUSQUEDA
// ============================================

async function autoLlenarBusqueda(data) {
    // ELITE v14.1: Protección de Fechas Futuras (Global)
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();

    if (data && (parseInt(data.year) > currYear || (parseInt(data.year) === currYear && parseInt(data.monthIndex) >= currMonth))) {
        console.error('🚫 Bloqueo de Seguridad: Intento de búsqueda en periodo futuro/abierto.');
        if (window.sriAssistant) window.sriAssistant.log('🚫 Error: No se pueden extraer datos de periodos futuros o el mes en curso.');
        return { tableFound: false, error: 'Future date' };
    }

    console.log('🚀 Iniciando configuración de búsqueda con:', data);

    // 1. Verificar si estamos en la página correcta, si no, navegar
    const urlActual = window.location.href;
    if (!urlActual.includes('comprobantesRecibidos.jsf')) {
        console.log('🔄 No estamos en Comprobantes Recibidos, intentando navegar...');
        const navegado = await navegarAComprobantes();
        if (!navegado) {
            throw new Error('No se pudo navegar automáticamante. Por favor ve a "Comprobantes electrónicos recibidos" manualmente.');
        }
        await sleep(2000);
    }

    // Si solo queríamos navegar, terminamos aquí
    if (data && data.onlyNavigate) {
        console.log('✅ Navegación completada (modo solo navegación).');
        return { periodo: 'Navegación', tipo: '-' };
    }

    // 2. Extraer año y mes del payload o calcular (fallback)
    let anio, mesIndex;

    if (data && data.year) {
        anio = data.year;
        mesIndex = data.monthIndex;
    } else {
        // Fallback a lógica anterior (mes anterior)
        const ahora = new Date();
        const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
        anio = mesAnterior.getFullYear();
        mesIndex = mesAnterior.getMonth();
    }

    if (!anio) throw new Error('Año no definido para la búsqueda');

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesNombre = meses[mesIndex];
    console.log(`📅 Configurando para: ${mesNombre} ${anio}`);

    // 3. Interactuar con los Selects (ID-Based v12.0)
    console.log('🎯 Detectando selectores de búsqueda...');

    // Función helper para obtener selectores por ID (robusto con escaping de JSF)
    const getSelect = (id) => {
        return document.getElementById(id) ||
            document.querySelector(`select[id$="${id.split(':').pop()}"]`);
    };

    const selAnio = getSelect('frmPrincipal:ano') || document.querySelectorAll('select')[0];
    const selMes = getSelect('frmPrincipal:mes') || document.querySelectorAll('select')[1];
    const selDia = getSelect('frmPrincipal:dia') || document.querySelectorAll('select')[2];
    // ID REAL confirmado: frmPrincipal:cmbTipoComprobante (option value="1" = Factura).
    // 'frmPrincipal:tipoComprobante' era una suposición y nunca existió en el DOM.
    const selTipo = getSelect('frmPrincipal:cmbTipoComprobante') ||
                    getSelect('frmPrincipal:tipoComprobante') ||
                    document.querySelector('select.sri-input-combo-tipo-comprobante') ||
                    document.querySelectorAll('select')[3];

    if (!selAnio || !selMes) {
        throw new Error('No se encontraron los selectores de Año/Mes. Verifica que la página cargó bien.');
    }

    // A. Seleccionar AÑO
    console.log(`📅 Seleccionando año: ${anio}`);
    selAnio.value = anio.toString();
    selAnio.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800); // Esperar que JSF/Ajax refresque el mes

    // B. Seleccionar MES (con reintentos por Ajax)
    let mesSeleccionado = false;
    for (let attempt = 0; attempt < 10; attempt++) {
        const currentSelMes = getSelect('frmPrincipal:mes') || document.querySelectorAll('select')[1];
        if (!currentSelMes) { await sleep(300); continue; }

        const opciones = Array.from(currentSelMes.options);
        const opcionMes = opciones.find(opt => {
            const txt = opt.text.trim().toUpperCase();
            return txt === mesNombre.toUpperCase() || txt.includes(mesNombre.toUpperCase());
        });

        if (opcionMes) {
            console.log(`✅ Mes hallado en intento ${attempt + 1}: ${mesNombre}`);
            currentSelMes.value = opcionMes.value;
            currentSelMes.dispatchEvent(new Event('input', { bubbles: true }));
            currentSelMes.dispatchEvent(new Event('change', { bubbles: true }));

            // VERIFICACIÓN ELITE: Esperar y re-verificar que no se haya reseteado por Ajax tardío
            await sleep(600);
            if (currentSelMes.value !== opcionMes.value) {
                console.warn('⚠️ El mes se reseteó tras la selección. Reintentando...');
                currentSelMes.value = opcionMes.value;
                currentSelMes.dispatchEvent(new Event('change', { bubbles: true }));
            }

            mesSeleccionado = true;
            break;
        }
        await sleep(500);
    }
    if (!mesSeleccionado) console.warn(`⚠️ No se pudo seleccionar el mes ${mesNombre}.`);

    // C. Seleccionar DIA -> "Todos"
    if (selDia) {
        const opciones = Array.from(selDia.options);
        const opcionTodos = opciones.find(opt => opt.text.trim().toLowerCase().includes('todos'));
        if (opcionTodos) {
            selDia.value = opcionTodos.value;
        } else {
            selDia.selectedIndex = 0;
        }
        selDia.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);
    }

    // D. Tipo Comprobante
    let tipoDeseado = 'Factura';
    if (data.tipoComprobante === 'Retencion') tipoDeseado = 'Comprobante de Retención';
    if (data.tipoComprobante === 'Nota de Crédito') tipoDeseado = 'Notas de Crédito';

    if (selTipo) {
        const opciones = Array.from(selTipo.options);
        const opcion = opciones.find(opt =>
            opt.text.toLowerCase().includes(tipoDeseado.toLowerCase()) ||
            (tipoDeseado === 'Retencion' && opt.text.toLowerCase().includes('retencion')) ||
            (tipoDeseado === 'Notas de Crédito' && opt.text.toLowerCase().includes('nota'))
        );

        if (opcion) {
            console.log(`✅ Tipo documento: ${opcion.text}`);
            selTipo.value = opcion.value;
            selTipo.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    await sleep(600);

    // CLICK EN BOTÓN CONSULTAR (Opcional según autoClickConsultar)
    if (data.autoClickConsultar === false) {
        console.log('✅ Filtros configurados. Esperando click manual en Consultar.');
        return { tableFound: false };
    }

    console.log('🔎 Buscando botón Consultar...');
    // ID TATUADO OFICIAL CONFIRMADO: frmPrincipal:btnConsultarSinRe (o fallback frmPrincipal:btnConsultar)
    const directBtn = document.getElementById('frmPrincipal:btnConsultarSinRe') || document.getElementById('frmPrincipal:btnConsultar');
    let btnConsultar = (directBtn && esVisible(directBtn)) ? directBtn : null;

    if (!btnConsultar) {
        const botones = Array.from(document.querySelectorAll('button, input[type="submit"], span.ui-button-text'));
        btnConsultar = botones.find(b => {
            const txt = (b.innerText || b.value || b.textContent || "").toUpperCase();
            return txt.includes('CONSULTAR') && esVisible(b);
        });
    }

    if (btnConsultar) {
        // En modo Turbo, guardamos el siguiente estado ANTES de clickear por si hay reload
        if (data.nextStep) {
            console.log(`💾 Guardando siguiente paso Turbo: ${data.nextStep}`);
            await SafeStorage.set({
                pendingAction: data.nextStep,
                actionTimestamp: Date.now(),
                skipSafetyCheck: true
            });
        }

        // ELITE v12.6: Esperar reCAPTCHA antes de disparar el evento si existe widget
        await waitForRecaptchaReady();
        await sleep(300); // Margen de seguridad extra

        // ELITE v12.7: Limpiar mensajes de growl previos para evitar falsos positivos de "no hay datos"
        const oldMessages = document.querySelectorAll('.ui-growl-item-container, .ui-messages-info, .ui-messages-warn');
        oldMessages.forEach(m => m.remove());

        console.log('✅ Click en Consultar', btnConsultar);
        btnConsultar.click();
        // Nota: El SRI a veces requiere el click en el span interno o en el botón padre, 
        // pero disparar ambos simultáneamente puede causar race conditions en reCAPTCHA.
        // Solo disparamos el padre si el actual no es el botón principal.
        if (btnConsultar.tagName !== 'BUTTON' && btnConsultar.parentElement && btnConsultar.parentElement.tagName === 'BUTTON') {
            btnConsultar.parentElement.click();
        }

        // ESPERAR Y VERIFICAR SI CARGA LA TABLA (SKIP CAPTCHA) - Lógica de Polling Mejora
        console.log('⏳ Esperando posible carga de tabla (Polling)...');
        let tableFound = false;

        // Intentar detectar durante 30 segundos (60 intentos x 500ms)
        for (let i = 0; i < 60; i++) {
            await sleep(500);

            // FAST-FAIL: Verificar si el SRI responde con "No hay datos"
            const msgError = document.querySelector('.ui-messages-warn-detail, .ui-growl-item, #idMensajeConsulta');
            const textoMensaje = (msgError?.textContent || document.body.innerText).toUpperCase();
            if (textoMensaje.includes('NO EXISTEN DATOS') || textoMensaje.includes('NO SE ENCONTRARON')) {
                console.warn('⚡ [Fast-Fail] El SRI reporta que no hay datos. Abortando polling.');
                // ELITE v12.9: NO removemos pendingAction aquí, dejamos que el flujo Turbo decida el siguiente paso.
                return { tableFound: false, noData: true };
            }

            // Estrategia 3: Heurística "Bruta" (Texto y celdas)
            const numeroCeldas = document.querySelectorAll('td').length;
            const textoBody = document.body.innerText;
            const tieneEncabezados = textoBody.includes('RUC') && (textoBody.includes('Razón social') || textoBody.includes('Clave de Acceso'));

            // Detección de Tabla Vacía (PrimeFaces empty message)
            const emptyTable = document.querySelector('.ui-datatable-empty-message');
            if (emptyTable && esVisible(emptyTable)) {
                console.warn('⚡ [Fast-Fail] Tabla vacía encontrada.');
                return { tableFound: false, noData: true };
            }

            // Si hay muchas celdas (>10) y texto de encabezado, O filas específicas
            if ((numeroCeldas > 10 && tieneEncabezados) ||
                document.querySelector('.ui-datatable-data tr:not(.ui-datatable-empty-message)') ||
                document.querySelector('tr[role="row"]:not(.ui-datatable-empty-message)')) {

                console.log(`✅ Tabla detectada por heurística (Celdas: ${numeroCeldas}).`);

                // ELITE v13.0: Intentar maximizar tamaño de página para velocidad rayo
                await optimizarTamanoPagina();

                tableFound = true;
                break;
            }
        }

        if (tableFound) {
            console.log('✅ Tabla presente. Auto-Skipping Captcha.');
            return { periodo: `${mesNombre} ${anio}`, tipo: 'Documento', tableFound: true };
        }

    } else {
        console.warn('⚠️ No se encontró el botón Consultar');
    }

    // Si llegamos aquí después del polling, asumimos que no hubo resultados para no trabar el Turbo
    console.warn('⌛ Polling finalizado sin detectar tabla. Asumiendo que no hay datos para continuar.');
    return { periodo: `${mesNombre} ${anio}`, tipo: 'Documento', tableFound: false, noData: true };
}

// ============================================================
// ============================================================
// 💎 DYNAMIC ISLAND SUPERIOR (FLUJO 1-CLIC MAESTRO)
// ============================================================
async function renderLoginCockpit(items) {
    if (!isSRILoginPage()) return;

    const oldCockpit = document.getElementById('sri-login-cockpit');
    if (oldCockpit) oldCockpit.remove();
    const existingIsland = document.getElementById('sri-dynamic-island');
    if (existingIsland) existingIsland.remove();

    // Sin esto el cockpit no se dibujaba nunca en el login real: buscaba un
    // input 'usuario' que el SRI no tiene y salía por el return.
    const campos = encontrarCamposLogin();
    const rucInput = campos && campos.ruc;
    const passInput = campos && campos.pass;
    const loginBtn = campos && campos.btn;
    if (!rucInput || !loginBtn) return;

    // Obtener clientes de la memoria local
    const cacheRes = await SafeStorage.get(['sc_clients_cache', 'workflowPeriod', 'flagged_errors', 'selected_period_month', 'selected_period_year']);
    let rawClients = Array.isArray(cacheRes.sc_clients_cache) ? cacheRes.sc_clients_cache : [];
    if (rawClients.length === 0 && typeof fetchClientsDirectly === 'function') {
        rawClients = await fetchClientsDirectly();
    }
    const flaggedErrs = cacheRes.flagged_errors || {};

    const now = new Date();
    let defaultMonth = now.getMonth() - 1;
    let defaultYear = now.getFullYear();
    if (defaultMonth < 0) { defaultMonth = 11; defaultYear--; }
    let targetMonth = cacheRes.selected_period_month !== undefined ? parseInt(cacheRes.selected_period_month) : (cacheRes.workflowPeriod?.monthIndex ?? defaultMonth);
    let targetYear = cacheRes.selected_period_year !== undefined ? parseInt(cacheRes.selected_period_year) : (cacheRes.workflowPeriod?.year ?? defaultYear);

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const isClientDone = (c, y, m) => {
        if (!c || !c.ruc) return true;
        const targetPeriodStr = `${y}-${(m + 1).toString().padStart(2, '0')}`;
        const decs = Array.isArray(c.declarations || c.sri_declaraciones) ? (c.declarations || c.sri_declaraciones) : [];
        return decs.some(d => {
            if (!d) return false;
            const p = (d.period || '').split(':')[0].trim();
            const matchesPeriod = p.includes(targetPeriodStr) || p === targetPeriodStr;
            if (!matchesPeriod) return false;
            const hasProof = !!(d.proof_file || d.pdfUrl || d.proofFile);
            const isDoneStatus = d.status === 'Completado' || d.status === 'Enviada' || d.status === 'Pagada';
            return hasProof || isDoneStatus;
        });
    };

    const isClientMensualLocal = (c) => {
        if (!c || !c.ruc) return false;
        if (c.isDeleted || c.is_deleted) return false;
        if (c.isActive === false || c.is_active === false) return false;
        const tp = c.tax_profile || c.taxProfile || {};
        const freq = (tp.ivaFrequency || c.iva_frequency || c.ivaFrequency || '').toLowerCase();
        const reg = (c.regime || '').toLowerCase();
        const type = (c.client_type || c.clientType || tp.clientType || '').toLowerCase();
        if (type === 'solo_plan' || c.requires_declarations === false || tp.requiresDeclarations === false) return false;
        if (freq === 'mensual') return true;
        if (freq === 'semestral' || freq === 'ninguno' || freq === 'anual') return false;
        if (reg.includes('popular')) return false;
        if (reg.includes('emprendedor')) return false;
        return true;
    };

    const get9th = (ruc) => (!ruc || ruc.length < 9) ? 99 : (parseInt(ruc.charAt(8), 10) === 0 ? 10 : parseInt(ruc.charAt(8), 10));
    const getDue = (d) => ({ 1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 22, 8: 24, 9: 26, 0: 28, 10: 28 }[d] || 28);
    const sortBy9th = (a, b) => get9th(a.ruc) - get9th(b.ruc);

    const validClients = rawClients.filter(isClientMensualLocal);
    let pendientes = validClients.filter(c => !isClientDone(c, targetYear, targetMonth) && !flaggedErrs[c.ruc]).sort(sortBy9th);

    // Determinar cliente inicial activo: siempre uno de los pendientes por declarar
    let currentClient = null;
    if (items?.pending_sri_autofill?.ruc && pendientes.some(p => p.ruc === items.pending_sri_autofill.ruc)) {
        currentClient = pendientes.find(p => p.ruc === items.pending_sri_autofill.ruc);
    } else if (pendientes.length > 0) {
        currentClient = pendientes[0];
    }

    const island = document.createElement('div');
    island.id = 'sri-dynamic-island';
    island.style.cssText = 'position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647; display: flex; align-items: center; gap: 8px; background: rgba(7, 15, 29, 0.94); backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px); border: 1px solid rgba(255, 255, 255, 0.12); border-top: 1px solid rgba(0, 168, 150, 0.65); border-radius: 40px; padding: 6px 14px; box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.8), 0 0 25px rgba(0, 168, 150, 0.15); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f8fafc; white-space: nowrap; max-width: 98vw; overflow-x: auto; scrollbar-width: none; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);';

    let minibar = document.getElementById('sri-island-minibar');
    if (!minibar) {
        minibar = document.createElement('div');
        minibar.id = 'sri-island-minibar';
        minibar.style.cssText = 'position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647; display: none; align-items: center; gap: 8px; background: rgba(7, 15, 29, 0.94); backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px); border: 1px solid rgba(255, 255, 255, 0.14); border-top: 1px solid rgba(0, 168, 150, 0.65); border-radius: 40px; padding: 5px 14px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 168, 150, 0.15); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f8fafc; font-size: 11px; cursor: pointer; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); user-select: none;';
        document.body.appendChild(minibar);
    }

    // Rellenar credenciales si hay cliente
    if (currentClient && rucInput) {
        rucInput.value = currentClient.ruc;
        if (passInput && currentClient.password) passInput.value = currentClient.password;
    }

    const renderIslandInner = () => {
        const isHidden = sessionStorage.getItem('sri_island_hidden') === '1';
        if (isHidden) {
            island.style.display = 'none';
            minibar.style.display = 'flex';
        } else {
            island.style.display = 'flex';
            minibar.style.display = 'none';
        }

        minibar.innerHTML = `
            <div style="display: flex; align-items: center; gap: 7px;">
                <span style="font-size: 13px; filter: drop-shadow(0 0 6px rgba(0,168,150,0.6));">💎</span>
                <span style="font-weight: 900; font-size: 11px; letter-spacing: 0.05em; background: linear-gradient(135deg, #34d399 0%, #00A896 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">NUEVA LUZ 3.0</span>
                <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; font-size: 10px; font-family: monospace; font-weight: 800; padding: 2px 7px; border-radius: 10px;">${pendientes.length} pend.</span>
                <span style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #ffffff; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 800; margin-left: 2px;">Mostrar ▾</span>
            </div>
        `;

        island.innerHTML = `
            <div style="display: flex; align-items: center; gap: 7px; font-weight: 900; font-size: 11px; letter-spacing: 0.06em; color: #00A896; padding: 2px 4px;">
                <span style="font-size: 13px; filter: drop-shadow(0 0 6px rgba(0,168,150,0.6));">💎</span>
                <span style="background: linear-gradient(135deg, #34d399 0%, #00A896 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">NUEVA LUZ 3.0</span>
            </div>

            <div style="width: 1px; height: 18px; background: rgba(255,255,255,0.12); margin: 0 1px;"></div>

            <!-- Selector de Periodo -->
            <div style="display: flex; align-items: center; gap: 3px;">
                <select id="sri-cockpit-month" style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.14); color: #fbbf24; padding: 4px 7px; border-radius: 8px; font-size: 11px; font-weight: 800; font-family: monospace; outline: none; cursor: pointer;">
                    ${monthNames.map((m, idx) => `<option value="${idx}" ${idx === targetMonth ? 'selected' : ''}>${m.substring(0, 3).toUpperCase()}</option>`).join('')}
                </select>
                <select id="sri-cockpit-year" style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.14); color: #fbbf24; padding: 4px 7px; border-radius: 8px; font-size: 11px; font-weight: 800; font-family: monospace; outline: none; cursor: pointer;">
                    ${[2026, 2025, 2024].map(y => `<option value="${y}" ${y === targetYear ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
            </div>

            <div style="width: 1px; height: 18px; background: rgba(255,255,255,0.12); margin: 0 1px;"></div>

            <!-- Selector de Cliente -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 12px; opacity: 0.8;">👤</span>
                <select id="sri-cockpit-select" style="max-width: 250px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.16); color: #ffffff; padding: 5px 10px; border-radius: 10px; font-size: 11.5px; font-weight: 700; outline: none; cursor: pointer; text-overflow: ellipsis;">
                    ${pendientes.map(c => {
                        const isSel = (currentClient && c.ruc === currentClient.ruc) ? 'selected' : '';
                        const d9 = get9th(c.ruc);
                        return `<option value="${c.ruc}" ${isSel}>${c.name || 'Cliente'} (Día ${getDue(d9)})</option>`;
                    }).join('')}
                    ${pendientes.length === 0 ? '<option value="">🎉 Todos al día en este periodo</option>' : ''}
                </select>
                <span id="sri-cockpit-due-badge" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; font-size: 10px; font-family: monospace; font-weight: 800; padding: 3px 6px; border-radius: 6px; white-space: nowrap;">
                    ${currentClient ? `Día ${getDue(get9th(currentClient.ruc))}` : ''}
                </span>
                <span id="sri-cockpit-count-badge" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; font-size: 10px; font-family: monospace; font-weight: 800; padding: 3px 7px; border-radius: 6px; white-space: nowrap;">
                    ${pendientes.length} pend.
                </span>
            </div>

            <div style="width: 1px; height: 18px; background: rgba(255,255,255,0.12); margin: 0 1px;"></div>

            <!-- Cápsula Clave -->
            <div style="display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.45); padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); font-size: 11px;">
                <span id="sri-cockpit-pass-text" style="font-family: monospace; font-size: 11px; color:${currentClient?.password ? '#34d399' : '#f87171'}; font-weight: 700;">
                    ${currentClient?.password ? '••••••••' : 'SIN CLAVE'}
                </span>
                <span id="sri-cockpit-view-pass" style="cursor: pointer; opacity: 0.8; font-size: 12px;" title="Ver/Ocultar clave">👁️</span>
                <span id="sri-cockpit-edit-pass" style="cursor: pointer; opacity: 0.8; font-size: 12px;" title="Editar clave">✏️</span>
            </div>

            <div style="width: 1px; height: 18px; background: rgba(255,255,255,0.12); margin: 0 1px;"></div>

            <!-- ⚡ UN SOLO BOTÓN PRINCIPAL PARA INICIAR EL BUCLE -->
            <button id="sri-cockpit-btn-master-loop" style="background: linear-gradient(135deg, #00A896 0%, #059669 100%); color: #ffffff; border: none; border-radius: 22px; padding: 7px 18px; font-size: 11.5px; font-weight: 900; letter-spacing: 0.04em; cursor: pointer; display: flex; align-items: center; gap: 7px; box-shadow: 0 4px 18px rgba(0, 168, 150, 0.45); white-space: nowrap; transition: all 0.2s;" title="Iniciar el bucle de auto-declaración para todos los pendientes">
                <span style="font-size: 13px;">⚡</span>
                <span>INICIAR BUCLE</span>
                <span style="background: rgba(255,255,255,0.25); color: #ffffff; font-size: 10px; font-family: monospace; font-weight: 900; padding: 1px 6px; border-radius: 10px;">${pendientes.length}</span>
            </button>

            <!-- Botón Omitir Cliente (Saltar cuenta) -->
            <button id="sri-cockpit-btn-skip" style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; border-radius: 20px; padding: 6px 11px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 4px; transition: 0.2s;" title="Omitir este cliente si la cuenta está bloqueada o tiene problemas de clave">
                <span>⏭️</span>
                <span>Omitir</span>
            </button>

            <!-- Botón Solo Login (Secundario) -->
            <button id="sri-cockpit-btn-onlylogin" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); color: #cbd5e1; border-radius: 20px; padding: 6px 10px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 4px; transition: 0.2s;" title="Solo iniciar sesión en el SRI sin declarar automáticamente">
                <span>🔑</span>
                <span>Login</span>
            </button>

            <!-- Botón Lista Completa -->
            <button id="sri-island-toggle-sidebar" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; border-radius: 20px; padding: 6px 10px; font-size: 10.5px; font-weight: 700; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 4px; transition: 0.2s;" title="Ver/Ocultar lista completa de clientes">
                <span>📋</span>
                <span>Lista</span>
            </button>

            <div style="width: 1px; height: 18px; background: rgba(255,255,255,0.12); margin: 0 1px;"></div>

            <!-- BOTÓN OCULTAR / MINIMIZAR -->
            <button id="sri-island-btn-hide" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); color: #fca5a5; border-radius: 20px; padding: 5px 11px; font-size: 10.5px; font-weight: 700; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" title="Ocultar barra por si vas a hacer otra cosa (Alt + H)">
                <span style="font-size: 10px;">✕</span>
                <span>Ocultar</span>
            </button>
        `;

        // Minimizar / Mostrar
        const hideBtn = island.querySelector('#sri-island-btn-hide');
        hideBtn?.addEventListener('click', () => {
            island.style.display = 'none';
            minibar.style.display = 'flex';
            sessionStorage.setItem('sri_island_hidden', '1');
        });

        minibar.onclick = () => {
            minibar.style.display = 'none';
            island.style.display = 'flex';
            sessionStorage.removeItem('sri_island_hidden');
        };

        // Wire Island Events
        const clientSel = island.querySelector('#sri-cockpit-select');
        const monthSel = island.querySelector('#sri-cockpit-month');
        const yearSel = island.querySelector('#sri-cockpit-year');

        const updateCredentialsInForm = (ruc) => {
            const cl = validClients.find(c => c.ruc === ruc);
            if (cl) {
                currentClient = cl;
                if (rucInput) {
                    rucInput.value = cl.ruc;
                    rucInput.dispatchEvent(new Event('input', { bubbles: true }));
                    rucInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (passInput && cl.password) {
                    passInput.value = cl.password;
                    passInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const passText = island.querySelector('#sri-cockpit-pass-text');
                if (passText) {
                    passText.textContent = cl.password ? '••••••••' : 'SIN CLAVE';
                    passText.style.color = cl.password ? '#34d399' : '#f87171';
                }
                const dueBadge = island.querySelector('#sri-cockpit-due-badge');
                if (dueBadge) dueBadge.textContent = `Día ${getDue(get9th(cl.ruc))}`;
            }
        };

        clientSel?.addEventListener('change', (e) => {
            updateCredentialsInForm(e.target.value);
        });

        const onCockpitPeriodChange = async () => {
            targetMonth = parseInt(monthSel.value);
            targetYear = parseInt(yearSel.value);
            await SafeStorage.set({
                selected_period_month: targetMonth,
                selected_period_year: targetYear,
                workflowPeriod: { year: targetYear, monthIndex: targetMonth }
            });
            pendientes = validClients.filter(c => !isClientDone(c, targetYear, targetMonth) && !flaggedErrs[c.ruc]).sort(sortBy9th);
            if (pendientes.length > 0) currentClient = pendientes[0];
            renderIslandInner();
            if (currentClient) updateCredentialsInForm(currentClient.ruc);
        };

        monthSel?.addEventListener('change', onCockpitPeriodChange);
        yearSel?.addEventListener('change', onCockpitPeriodChange);

        // Ver clave
        island.querySelector('#sri-cockpit-view-pass')?.addEventListener('click', () => {
            const passText = island.querySelector('#sri-cockpit-pass-text');
            if (passText && currentClient) {
                if (passText.textContent === '••••••••') passText.textContent = currentClient.password || 'Sin clave';
                else passText.textContent = '••••••••';
            }
        });

        // Editar clave
        island.querySelector('#sri-cockpit-edit-pass')?.addEventListener('click', async () => {
            if (!currentClient) return;
            const newP = prompt(`Ingresa la nueva clave del SRI para ${currentClient.name}:`, currentClient.password || '');
            if (newP === null || newP === currentClient.password) return;
            currentClient.password = newP;
            const cache = await SafeStorage.get(['sc_clients_cache']);
            const list = (cache.sc_clients_cache || []).map(c => c.ruc === currentClient.ruc ? { ...c, password: newP, sri_password: newP } : c);
            await SafeStorage.set({ sc_clients_cache: list });
            updateCredentialsInForm(currentClient.ruc);
            alert('✅ Clave guardada localmente.');
        });

        // ⏭️ OMITIR CLIENTE
        island.querySelector('#sri-cockpit-btn-skip')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!currentClient) return;
            const rucToSkip = currentClient.ruc;
            const nameToSkip = currentClient.name || rucToSkip;

            if (confirm(`¿Omitir a ${nameToSkip} (${rucToSkip})?\nSe marcará para no procesarlo en este lote.`)) {
                const resErr = await SafeStorage.get(['flagged_errors']);
                const errs = resErr.flagged_errors || {};
                errs[rucToSkip] = 'omitido_manual';
                await SafeStorage.set({ flagged_errors: errs });
                await SafeStorage.remove(['pending_sri_autofill', 'pendingAction', 'actionTimestamp']);

                // Recargar lista de pendientes
                flaggedErrs[rucToSkip] = 'omitido_manual';
                pendientes = validClients.filter(c => !isClientDone(c, targetYear, targetMonth) && !flaggedErrs[c.ruc]).sort(sortBy9th);
                currentClient = pendientes.length > 0 ? pendientes[0] : null;
                renderIslandInner();
                if (currentClient) updateCredentialsInForm(currentClient.ruc);
                else {
                    if (rucInput) rucInput.value = '';
                    if (passInput) passInput.value = '';
                }

                if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
                    window.sriAssistant.showEliteToast({
                        title: '⏭️ Cliente Omitido',
                        msg: `${nameToSkip} omitido. Cambiando al siguiente...`,
                        duration: 4000
                    });
                }
            }
        });

        // Toggle Sidebar
        island.querySelector('#sri-island-toggle-sidebar')?.addEventListener('click', () => {
            let sb = document.getElementById('sri-anticipacion-sidebar');
            if (!sb && typeof renderAnticipationWidget === 'function') {
                renderAnticipationWidget(items);
                sb = document.getElementById('sri-anticipacion-sidebar');
            }
            if (sb) {
                sb.classList.toggle('collapsed');
            }
        });

        // ⚡ BOTÓN MAESTRO: INICIAR BUCLE AUTOMÁTICO
        island.querySelector('#sri-cockpit-btn-master-loop')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (pendientes.length === 0) {
                alert('¡🎉 No hay clientes pendientes por declarar en este periodo!');
                return;
            }

            const selectedRuc = clientSel?.value || (currentClient ? currentClient.ruc : '');
            let queue = pendientes.map(c => ({ ruc: c.ruc, password: c.password, name: c.name }));

            const selIdx = queue.findIndex(c => c.ruc === selectedRuc);
            if (selIdx > 0) {
                queue = [queue[selIdx], ...queue.slice(0, selIdx), ...queue.slice(selIdx + 1)];
            }

            // 🛡️ Filtro de seguridad: excluir cuentas bloqueadas o con credenciales fallidas sin actualizar
            if (typeof SriCredentialVault !== 'undefined') {
                const safeQueue = [];
                for (const q of queue) {
                    const check = await SriCredentialVault.canAttemptLogin(q.ruc, q.password);
                    if (check.allowed) safeQueue.push(q);
                    else console.log(`🛡️ [COCKPIT] Excluyendo ${q.ruc} (${q.name}) del bucle: ${check.reason}`);
                }
                queue = safeQueue;
            }

            if (queue.length === 0) {
                alert('⚠️ Todos los clientes pendientes tienen problemas de credenciales o cuentas bloqueadas en el SRI. Corrige sus claves antes de iniciar.');
                return;
            }

            const first = queue[0];
            if (!first.password) {
                alert(`⚠️ El cliente ${first.name} (${first.ruc}) no tiene clave SRI guardada. Ingrésala usando el icono ✏️ antes de iniciar el bucle.`);
                return;
            }

            updateCredentialsInForm(first.ruc);

            // Encendemos el semáforo y configuramos la cola
            if (typeof SriLoop !== 'undefined' && typeof SriLoop.iniciar === 'function') {
                await SriLoop.iniciar(queue, { year: targetYear, monthIndex: targetMonth });
            }

            await SafeStorage.set({
                sri_master_switch_on: true,
                auto_batch_enabled: true,
                sri_auto_mode: true,
                autoDeclaration: true,
                auto_batch_queue: queue,
                auto_batch_index: 0,
                workflowPeriod: { year: targetYear, monthIndex: targetMonth },
                pending_sri_autofill: {
                    ruc: first.ruc,
                    password: first.password,
                    name: first.name,
                    timestamp: Date.now(),
                    manual: true,
                    isBatch: true,
                    loginAttempted: true
                },
                pendingAction: 'turbo_step1_facturas',
                actionTimestamp: Date.now()
            });

            setTimeout(() => {
                if (loginBtn) loginBtn.click();
                else {
                    const campos = encontrarCamposLogin();
                    if (campos && campos.btn) campos.btn.click();
                }
            }, 300);
        });

        // 🔑 SOLO LOGIN
        island.querySelector('#sri-cockpit-btn-onlylogin')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const selRuc = clientSel?.value || rucInput.value;
            const cl = validClients.find(c => c.ruc === selRuc) || currentClient || { ruc: selRuc, password: passInput?.value || '', name: 'Cliente SRI' };

            // 🛡️ Filtro de seguridad preventivo
            if (typeof SriCredentialVault !== 'undefined') {
                const check = await SriCredentialVault.canAttemptLogin(cl.ruc, cl.password);
                if (!check.allowed) {
                    alert(`🛑 [BLOQUEO PREVENTIVO] ${check.reason}\n\nActualiza la contraseña del cliente usando el icono ✏️ antes de intentar.`);
                    return;
                }
            }

            updateCredentialsInForm(cl.ruc);

            await SafeStorage.set({
                sri_master_switch_on: false,
                auto_batch_enabled: false,
                sri_auto_mode: false,
                autoDeclaration: false,
                pending_sri_autofill: {
                    ruc: cl.ruc,
                    password: cl.password,
                    name: cl.name || 'Cliente SRI',
                    timestamp: Date.now(),
                    manual: true,
                    isBatch: false,
                    loginAttempted: false
                }
            });
            await SafeStorage.remove(['pendingAction']);

            setTimeout(() => loginBtn.click(), 300);
        });
    };

    // Registrar atajo de teclado global Alt+H para ocultar/mostrar
    if (!window.__sri_cockpit_hotkey_registered) {
        window.__sri_cockpit_hotkey_registered = true;
        window.addEventListener('keydown', (e) => {
            if (e.altKey && (e.key === 'h' || e.key === 'H')) {
                e.preventDefault();
                const isl = document.getElementById('sri-dynamic-island');
                const mb = document.getElementById('sri-island-minibar');
                if (isl && mb) {
                    if (isl.style.display === 'none') {
                        isl.style.display = 'flex';
                        mb.style.display = 'none';
                        sessionStorage.removeItem('sri_island_hidden');
                    } else {
                        isl.style.display = 'none';
                        mb.style.display = 'flex';
                        sessionStorage.setItem('sri_island_hidden', '1');
                    }
                }
            }
        });
    }

    renderIslandInner();
    document.body.appendChild(island);
}

function initLoginCockpitWatcher() {
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        if (isSRILoginPage()) {
            if (!document.getElementById('sri-dynamic-island')) {
                const items = await SafeStorage.get(null);
                await renderLoginCockpit(items);
            }
        }
        if (attempts > 25) clearInterval(interval);
    }, 400);

    try {
        const observer = new MutationObserver(async () => {
            if (isSRILoginPage() && !document.getElementById('sri-dynamic-island')) {
                const items = await SafeStorage.get(null);
                await renderLoginCockpit(items);
            }
        });
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });

        // 🔄 SINCRONIZACIÓN EN TIEMPO REAL: Si se registra o actualiza un cliente en la web
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace === 'local' && (changes.sc_clients_cache || changes.selected_period_month || changes.selected_period_year)) {
                    console.log('🔄 [SRI ELITE] Sincronización en tiempo real: Clientes actualizados desde la web.');
                    if (isSRILoginPage()) {
                        SafeStorage.get(null).then(items => {
                            renderLoginCockpit(items);
                            if (typeof renderAnticipationWidget === 'function') {
                                renderAnticipationWidget(items);
                            }
                        });
                    }
                }
            });
        }
    } catch(e) {}
}
