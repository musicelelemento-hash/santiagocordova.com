// NUEVA FUNCIÓN: Navegación Wizard Declaraciones (Angular/SPA) - VERSIÓN ZERO-LAG (ELITE)
// ═══════════════════════════════════════════════════════════════════════════
// CONTROL FLOTANTE DEL BUCLE
// Siempre visible, arrastrable, con el estado real del semáforo.
//   ▶  DETENIDO  → la extensión no toca nada; el SRI queda libre
//   ⏸  CORRIENDO → pausa suave: termina el cliente y ahí para
//   🛑 EMERGENCIA → corta en el acto
// ═══════════════════════════════════════════════════════════════════════════
const SriLoopHUD = {
    _el: null,
    _POS_KEY: 'sc_loop_hud_pos',

    /** Solo vivimos dentro del portal del SRI. Aislado para poder testearlo. */
    _enSri() {
        return location.hostname.includes('sri.gob.ec');
    },

    async montar() {
        if (this._el || !document.body) return;
        if (!this._enSri()) return;

        const el = document.createElement('div');
        el.id = 'sri-loop-hud';
        el.style.cssText = [
            'position:fixed', 'z-index:2147483646', 'right:18px', 'bottom:18px',
            'display:flex', 'align-items:center', 'gap:8px',
            'padding:8px 10px', 'border-radius:14px',
            'background:rgba(5,20,36,0.94)', 'backdrop-filter:blur(14px)',
            'border:1px solid rgba(255,255,255,0.14)',
            'box-shadow:0 10px 30px rgba(0,0,0,0.5)',
            "font-family:'Manrope','Inter',system-ui,sans-serif",
            'font-size:12px', 'color:#d5e4fa', 'user-select:none', 'cursor:grab'
        ].join(';');

        el.innerHTML = [
            '<span id="slh-drag" title="Arrastrar" style="opacity:0.45;padding:0 2px;cursor:grab">⠿</span>',
            '<button id="slh-play" style="border:none;border-radius:10px;padding:6px 11px;font-weight:800;font-size:12px;cursor:pointer">▶</button>',
            '<div style="display:flex;flex-direction:column;line-height:1.25;min-width:104px">',
            '  <span id="slh-estado" style="font-weight:800;font-size:11px">DETENIDO</span>',
            '  <span id="slh-detalle" style="font-size:10px;opacity:0.65;font-family:monospace">lote vacío</span>',
            '</div>',
            '<button id="slh-aqui" title="Declarar al contribuyente que está logueado ahora" style="border:none;border-radius:10px;padding:6px 9px;background:rgba(56,189,248,0.16);color:#7dd3fc;font-weight:800;font-size:12px;cursor:pointer">🎯</button>',
            '<button id="slh-stop" title="Parada de emergencia" style="border:none;border-radius:10px;padding:6px 9px;background:rgba(239,68,68,0.16);color:#fca5a5;font-size:12px;cursor:pointer">🛑</button>'
        ].join('');

        document.body.appendChild(el);
        this._el = el;

        try {
            const pos = (await SafeStorage.get([this._POS_KEY]))[this._POS_KEY];
            if (pos && typeof pos.left === 'number') {
                el.style.left = pos.left + 'px';
                el.style.top = pos.top + 'px';
                el.style.right = 'auto';
                el.style.bottom = 'auto';
            }
        } catch (e) { /* sin posición guardada */ }

        el.querySelector('#slh-play').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const e = await SriLoop.get();
            if (e.estado === 'CORRIENDO') await SriLoop.pausar();
            else if (e.estado === 'PAUSADO' || e.estado === 'PAUSANDO') await SriLoop.reanudar();
            else await this._arrancarTodo();
            this.pintar();
        });

        el.querySelector('#slh-aqui').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            await this._declararEsteCliente();
            this.pintar();
        });

        el.querySelector('#slh-stop').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            await SriLoop.emergencia();
            this.pintar();
        });

        this._hacerArrastrable(el);

        try {
            chrome.storage.onChanged.addListener((c) => { if (c.sc_loop) this.pintar(); });
        } catch (e) { /* sin listener */ }
        setInterval(() => this.pintar(), 2000);
        this.pintar();
    },

    _aviso(title, msg, duration = 5000) {
        if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
            window.sriAssistant.showEliteToast({ title, msg, duration });
        } else {
            console.log(`${title} — ${msg}`);
        }
    },

    /**
     * 🎯 Declarar AL QUE YA ESTÁ ADENTRO.
     *
     * El ▶ arma un lote desde la base de clientes; esto es lo contrario: leer
     * quién está logueado en esta pestaña y declararlo, sin depender de que la
     * caché esté sincronizada. Es el caso de "entré a mano y quiero que siga él".
     */
    async _declararEsteCliente() {
        const info = (window.sriAssistant && window.sriAssistant.extractClientInfo)
            ? window.sriAssistant.extractClientInfo() : { ruc: '', name: '' };

        if (!info.ruc) {
            this._aviso('🎯 No veo a nadie',
                'No detecto un RUC en esta pantalla. Entrá al SRI con el contribuyente y probá de nuevo.', 7000);
            return;
        }

        // La clave: primero la caché, y si no está se la pedimos al usuario.
        const r = await SafeStorage.get(['sc_clients_cache']);
        const lista = Array.isArray(r.sc_clients_cache) ? r.sc_clients_cache : [];
        const enCache = lista.find((c) => c && c.ruc === info.ruc);
        let clave = enCache && (enCache.password || enCache.sri_password || enCache.sriPassword);
        const nombre = (enCache && enCache.name) || info.name || info.ruc;

        if (!clave) {
            clave = prompt(
                `Clave del SRI de ${nombre} (${info.ruc}).\n\n` +
                'Hace falta para volver a entrar al pasar de pantalla.\n' +
                'Queda guardada solo en este navegador.'
            );
            if (!clave) { console.log('🎯 Cancelado: sin clave no se puede continuar.'); return; }
            if (typeof window.sriAgregarCliente === 'function') {
                await window.sriAgregarCliente(info.ruc, clave, nombre);
            }
        }

        const periodo = (await SafeStorage.get(['workflowPeriod'])).workflowPeriod || SriLoop.periodoPorDefecto();
        const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                       'agosto','septiembre','octubre','noviembre','diciembre'];

        if (!confirm(
            `Declarar a ${nombre} (${info.ruc})\n` +
            `Periodo: ${MESES[periodo.monthIndex]} ${periodo.year}\n\n` +
            'El bot va a extraer los comprobantes, llenar el formulario y frenar\n' +
            'antes de enviar si el saldo no es cero.\n\n¿Seguimos?'
        )) { console.log('🎯 Arranque cancelado por el usuario.'); return; }

        const cliente = { ruc: info.ruc, name: nombre, password: clave };
        await SriLoop.iniciar([cliente], periodo);
        await SriLoop.prepararCliente(cliente, periodo);

        // Ya hay sesión abierta: entramos directo a la extracción en vez de
        // pasar por el login como hace el arranque de lote.
        await SafeStorage.set({
            pendingAction: 'turbo_step1_facturas',
            checkFacturas: true,
            checkRetenciones: true,
            checkNC: true,
            actionTimestamp: Date.now(),
            skipSafetyCheck: true
        });

        this._aviso('🎯 En marcha', `Declarando a ${nombre} · ${MESES[periodo.monthIndex]} ${periodo.year}`, 5000);
        console.log(`🎯 [AQUÍ] Arrancando con ${nombre} (${info.ruc}).`);
        await sleep(700);

        if (typeof navegarAComprobantes === 'function') navegarAComprobantes();
        else window.location.href = SRI_RECIBIDOS_URL;
    },

    /**
     * ▶ desde DETENIDO = arrancar TODA la película:
     * arma la cola con los pendientes del periodo, prepara el primer cliente y
     * lanza la navegación que dispara el auto-login.
     *
     * Pide confirmación explícita: es una acción que toma el control del
     * navegador durante un buen rato.
     */
    async _arrancarTodo() {
        const guardado = (await SafeStorage.get(['workflowPeriod'])).workflowPeriod;
        const periodo = guardado || SriLoop.periodoPorDefecto();
        const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                       'agosto','septiembre','octubre','noviembre','diciembre'];
        const etiqueta = `${MESES[periodo.monthIndex]} ${periodo.year}`;

        const { cola, yaHechos, sinClave, total } = await SriLoop.armarCola(periodo);

        if (total === 0) {
            this._aviso('ℹ️ Sin clientes',
                'No hay clientes ni en la caché local ni en Supabase. Abrí SantiagoCordova.com estando logueado para sincronizar.', 8000);
            return;
        }
        if (cola.length === 0 && sinClave > 0) {
            // Caso típico tras una caché limpia: los clientes están, las claves no.
            this._aviso('🔑 Faltan las claves',
                `Hay ${sinClave} contribuyentes pendientes de ${etiqueta}, pero sin clave guardada. ` +
                'Las claves solo viven en este navegador: abrí SantiagoCordova.com para sincronizarlas, ' +
                'o cargalas a mano con el ✏️ de la lista.', 10000);
            return;
        }
        if (cola.length === 0) {
            this._aviso('🎉 Nada pendiente', `${yaHechos} ya tienen comprobante de ${etiqueta}.`);
            return;
        }

        const aviso = [
            `Se van a declarar ${cola.length} clientes de ${etiqueta}.`,
            '',
            `Primero: ${cola[0].name} (${cola[0].ruc})`,
            yaHechos ? `Se omiten ${yaHechos} que ya tienen comprobante.` : '',
            sinClave ? `Se omiten ${sinClave} sin clave guardada.` : '',
            '',
            'El bot va a tomar el control de esta pestaña: iniciará sesión,',
            'declarará, subirá el comprobante y pasará al siguiente.',
            'Podés pausarlo o cortarlo desde el botón flotante en cualquier momento.',
            '',
            '¿Arrancamos?'
        ].filter(Boolean).join('\n');

        if (!confirm(aviso)) {
            console.log('▶️ [BUCLE] Arranque cancelado por el usuario.');
            return;
        }

        const r = await SriLoop.arrancarLote(periodo);
        if (!r.ok) { this._aviso('⚠️ No se pudo arrancar', r.motivo); return; }

        this._aviso('🚀 Lote iniciado', `${r.total} clientes. Entrando con ${r.primero}…`, 4000);
        await sleep(900);

        // Si hay una sesión abierta del mismo cliente objetivo, ir directo a Comprobantes Recibidos
        const state = await SriLoop.get();
        const targetRuc = state.cola && state.cola[0] && state.cola[0].ruc;
        const currentBodyText = document.body ? (document.body.textContent || '') : '';
        const isCurrentTargetActive = targetRuc && currentBodyText.includes(targetRuc);

        if (isCurrentTargetActive) {
            console.log(`🎯 [BUCLE] Ya estamos dentro de la sesión de ${targetRuc}. Navegando directo a Comprobantes Recibidos...`);
            window.location.href = SRI_RECIBIDOS_URL;
            return;
        }

        const haySesion = !!(document.body && /\b\d{13}\b/.test(currentBodyText)) &&
                          !location.href.includes('/auth/realms/');
        if (haySesion && typeof cerrarSesionSRI === 'function') {
            console.log('🔒 [BUCLE] Cerrando la sesión actual para entrar con el primer cliente…');
            await cerrarSesionSRI();
        } else {
            window.location.href = 'https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=app-sri-claves-angular&redirect_uri=https%3A%2F%2Fsrienlinea.sri.gob.ec%2Fsri-en-linea%2F%2Fcontribuyente%2Fperfil&response_mode=fragment&response_type=code&scope=openid';
        }
    },

    async pintar() {
        if (!this._el) return;
        const e = await SriLoop.get();
        const play = this._el.querySelector('#slh-play');
        const est = this._el.querySelector('#slh-estado');
        const det = this._el.querySelector('#slh-detalle');
        const aqui = this._el.querySelector('#slh-aqui');
        if (aqui) {
            const corriendo = e.estado === 'CORRIENDO' || e.estado === 'PAUSANDO';
            aqui.style.display = corriendo ? 'none' : '';
        }
        const stop = this._el.querySelector('#slh-stop');
        if (!play || !est || !det) return;

        const total = (e.cola || []).length;
        const pos = total ? Math.min(e.indice + 1, total) : 0;

        const mapa = {
            CORRIENDO: { icono: '⏸', bg: 'rgba(34,197,94,0.2)', fg: '#4ade80', txt: 'CORRIENDO', tip: 'Pausar (termina el cliente actual)' },
            PAUSANDO:  { icono: '▶', bg: 'rgba(255,185,95,0.2)', fg: '#ffb95f', txt: 'PAUSANDO…', tip: 'Terminando el cliente actual' },
            PAUSADO:   { icono: '▶', bg: 'rgba(255,185,95,0.2)', fg: '#ffb95f', txt: 'PAUSADO',   tip: 'Reanudar' },
            DETENIDO:  { icono: '▶', bg: 'rgba(148,163,184,0.16)', fg: '#94a3b8', txt: 'DETENIDO', tip: 'Arrancar el lote de pendientes' }
        };
        const m = mapa[e.estado] || mapa.DETENIDO;

        play.textContent = m.icono;
        play.title = m.tip;
        play.style.background = m.bg;
        play.style.color = m.fg;
        est.textContent = m.txt;
        est.style.color = m.fg;
        det.textContent = total ? `cliente ${pos} de ${total}` : (e.motivo || 'lote vacío');
        stop.style.opacity = (e.estado === 'DETENIDO') ? '0.35' : '1';
    },

    _hacerArrastrable(el) {
        let x0 = 0, y0 = 0, l0 = 0, t0 = 0, arrastrando = false;
        const asa = el.querySelector('#slh-drag');
        const bajar = (ev) => {
            arrastrando = true;
            const r = el.getBoundingClientRect();
            x0 = ev.clientX; y0 = ev.clientY; l0 = r.left; t0 = r.top;
            el.style.cursor = 'grabbing';
            ev.preventDefault();
        };
        asa.addEventListener('mousedown', bajar);
        el.addEventListener('mousedown', (ev) => { if (ev.target === el) bajar(ev); });

        document.addEventListener('mousemove', (ev) => {
            if (!arrastrando) return;
            const left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, l0 + ev.clientX - x0));
            const top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, t0 + ev.clientY - y0));
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', async () => {
            if (!arrastrando) return;
            arrastrando = false;
            el.style.cursor = 'grab';
            const r = el.getBoundingClientRect();
            try { await SafeStorage.set({ [this._POS_KEY]: { left: r.left, top: r.top } }); } catch (e) { /* nada */ }
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SriLoopHUD.montar());
} else {
    SriLoopHUD.montar();
}

// ── Detección del wizard de recepción de declaraciones ───────────────────
// (Las constantes SRI_FORMULARIO_IVA_URL y SRI_PUENTE_* viven en 01_utilidades_y_pdf.js)

// El wizard puede vivir en cualquiera de las dos rutas: para DETECTAR aceptamos ambas.
function estaEnFormularioIva(url = window.location.href) {
    return url.includes('recibirDeclaracion.jsf') || url.includes('declaracionImpuesto.jsf');
}

async function ejecutarNavegacionDeclaracion(periodData) {
    if (typeof SafeStorage !== 'undefined' && SafeStorage.remove) {
        await SafeStorage.remove(['declaration_synced_flag']);
    }
    const progress = (p) => { if (window.sriAssistant?.updateProgress) window.sriAssistant.updateProgress(p); };

    safeStatus('👻 Iniciando Wizard Ghost...');
    progress(5);

    console.group('🚀 Wizard SRI Ghost v9.0 (OPTIMIZED)');

    // Default to previous month if no periodData provided
    if (!periodData) {
        const now = new Date();
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        periodData = { year: prev.getFullYear(), monthIndex: prev.getMonth() };
    }

    const { year, monthIndex } = periodData;

    try {
        // PASO 0: ESPERA DEL PORTAL (OPTIMIZADO v10.0)
        console.log('🔍 Paso 0: Esperando al portal (Splash)...');
        safeStatus('⏳ Esperando al portal...');

        // Espera optimizada: Si el splash se va, arrancamos.
        await waitFor(() => {
            const splash = document.getElementById('id-sri-splash') || document.querySelector('.sri-splash');
            const splashHidden = !splash || !esVisible(splash);
            const headerUsuario = document.getElementById('nombreRuc') || document.querySelector('.nombre-comercial-header');
            return splashHidden && (!!headerUsuario || document.readyState === 'complete' || document.readyState === 'interactive');
        }, 5000, 'Portal Splash');

        await sleep(300);
        progress(15);

        // PASO 1: UBICACIÓN Y NAVEGACIÓN RESILIENTE AL WIZARD (ELITE v10.0)
        console.log('🔍 Paso 1: Verificando vista...');
        safeStatus('🔍 Verificando página...');
        await dismissSridialogs();

        // ¿Ya estamos en el Wizard de Formulario IVA?
        const checkWizardInDOM = () => {
            return document.getElementById('frmFlujoDeclaracion:somObligacion_label') ||
                document.getElementById('frmFlujoDeclaracion:somObligacion') ||
                document.querySelector('div[id*="somObligacion"]') ||
                document.querySelector('[id*="somObligacion"]') ||
                window.location.href.includes('recibirDeclaracion') ||
                window.location.href.includes('identificadorGrupoObligacion=IVA');
        };

        let enWizard = !!checkWizardInDOM();
        let intentosNavegacion = 0;

        while (!enWizard && intentosNavegacion < 3) {
            intentosNavegacion++;
            console.log(`🧭 [WIZARD NAV] Paso de navegación ${intentosNavegacion}/3. URL actual: ${window.location.href}`);
            safeStatus('📑 Navegando a Formulario IVA...');
            progress(20 + (intentosNavegacion * 5));

            await dismissSridialogs();
            await sleep(400);

            // CASO A: Estamos en el índice de declaraciones (/SriDeclaraciones/Publico/declaraciones)
            if (window.location.href.includes('declaraciones')) {
                console.log('📑 En índice de declaraciones. Buscando tarjeta o enlace a Formulario IVA...');
                safeStatus('🎯 Accediendo a Formulario IVA...');

                // Esperar a que las tarjetas del dashboard Angular se rendericen
                const cardIva = await waitFor(() => {
                    const direct = document.querySelector('a[href*="declaracionImpuesto"], a[href*="redireccion=310"]');
                    if (direct) return direct;

                    const items = Array.from(document.querySelectorAll('.card, .ui-panel, .dashboard-item, mat-card, .p-card, a, button, div[role="button"], span'));
                    return items.find(el => {
                        const txt = (el.innerText || el.textContent || '').toUpperCase();
                        const href = el.getAttribute('href') || '';
                        return href.includes('redireccion=310') ||
                               href.includes('declaracionImpuesto') ||
                               (txt.includes('DECLARACIÓN DE IMPUESTOS') && !txt.includes('CONSULTA') && esVisible(el)) ||
                               ((txt.includes('DECLARACIÓN') || txt.includes('FORMULARIO')) && txt.includes('IVA') && esVisible(el));
                    });
                }, 4000, 'Tarjeta IVA en Índice');

                if (cardIva) {
                    console.log('✅ Tarjeta/Enlace detectado en índice. Clickeando...', cardIva);
                    clickElement(cardIva, 'Tarjeta Declaración IVA');
                    await sleep(2500);
                } else {
                    console.warn('⚠️ No se detectó tarjeta en índice. Forzando navegación vía puente SSO al formulario IVA...');
                    window.location.href = SRI_PUENTE_FORMULARIO_IVA;
                    await sleep(4000);
                    return;
                }
            } else {
                // CASO B: Estamos en otra página (comprobantesRecibidos, perfil, inicio.jsf, etc.)
                console.log('🚀 [WIZARD NAV] Navegando inmediatamente vía puente SSO oficial al Formulario IVA...');
                safeStatus('⚡ Accediendo a Formulario IVA...');
                window.location.href = SRI_PUENTE_FORMULARIO_IVA;
                await sleep(4000);
                return;
            }

            // Verificar si entramos al Wizard tras este paso
            enWizard = !!checkWizardInDOM();
            if (enWizard) {
                console.log('✅ Wizard detectado exitosamente.');
                break;
            }
        }

        // Re-verificar Wizard con reintentos
        let lblObligacion = await waitFor(() => {
            return document.getElementById('frmFlujoDeclaracion:somObligacion_label') ||
                   document.querySelector('div[id*="somObligacion"]') ||
                   document.querySelector('[id*="somObligacion"]');
        }, 10000, 'Wizard Load');

        if (!lblObligacion) {
            // Último recurso: si todavía no estamos en el wizard, navegar directo.
            if (!estaEnFormularioIva()) {
                console.warn('⚠️ Wizard no visible en DOM tras navegación SPA. Forzando el formulario IVA vía puente SSO...');
                safeStatus('⚡ Abriendo Formulario IVA directo...');
                window.location.href = SRI_PUENTE_FORMULARIO_IVA;
                await sleep(5000);
                return;
            }
            console.error('❌ El Wizard no apareció tras espera.');
            safeStatus('❌ Error: Portal no responde.');
            return;
        }

        // PASO 2: OBLIGACIÓN (Selection 2011 - Robust v2)
        console.log('🔍 Paso 2: Selección 2011...');
        safeStatus('🎯 Seleccionando Obligación 2011...');

        await dismissSridialogs();

        const getLabelObligacion = () => document.getElementById('frmFlujoDeclaracion:somObligacion_label');
        let selectionOk = false;

        // Bucle de reintento para selección de obligación (SRI suele ignorar el 1er click)
        for (let attempt = 0; attempt < 3; attempt++) {
            await dismissSridialogs();
            let labelActual = getLabelObligacion();
            if (labelActual && labelActual.textContent.includes('2011')) {
                console.log('✅ Obligación 2011 ya seleccionada.');
                selectionOk = true;
                break;
            }

            console.log(`🎯 Intento ${attempt + 1}: Abriendo dropdown obligación...`);
            const trigger = document.querySelector('#frmFlujoDeclaracion\\:somObligacion .ui-selectonemenu-trigger') || labelActual;

            if (trigger) {
                clickElement(trigger, 'Dropdown Obligación');

                const opt = await waitFor(() => {
                    // ELITE v13.0: Búsqueda global del elemento LI (PrimeFaces inyecta al final del body)
                    const allItems = Array.from(document.querySelectorAll('.ui-selectonemenu-item, li'));
                    return allItems.find(li => 
                        li.textContent.includes('2011') && 
                        esVisible(li) // Solo elementos visibles
                    );
                }, 3000, `Opción 2011 (Intento ${attempt + 1})`);

                if (opt) {
                    console.log('✅ Opción 2011 encontrada. Clickeando...');
                    clickElement(opt, '2011');
                    await waitForPortal(); // Esperar Ajax del SRI que carga los periodos
                    await sleep(1000); // Pausa extra para estabilidad del DOM

                    // Verificar si pegó
                    labelActual = getLabelObligacion();
                    if (labelActual && labelActual.textContent.includes('2011')) {
                        selectionOk = true;
                        break;
                    }
                }
            }
            await sleep(1000);
        }

        if (selectionOk) {
            progress(50);
        } else {
            console.error('🚫 Fallo crítico: No se pudo seleccionar la obligación 2011.');
            throw new Error('No se pudo seleccionar la obligación 2011. Por favor selecciona manualmente y el asistente continuará.');
        }

        // PASO 3: SELECCIÓN DE PERIODO (Año/Mes)
        console.log('🔍 Paso 3: Selección de Periodo (Detección de Interfaz)...');
        safeStatus('📅 Configurando periodo...');

        await dismissSridialogs();

        const mesesAbreviados = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        const mesesCompletos = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const targetMonthName = mesesCompletos[monthIndex];
        let periodSelected = false;

        // 3.1: DETECCIÓN DEL NUEVO CALENDARIO (Picker Único v11.0)
        const calendarInput = await waitFor(() => {
            const el = document.getElementById('frmFlujoDeclaracion:calPeriodo') ||
                document.getElementById('frmFlujoDeclaracion:calPeriodo_input') ||
                document.querySelector('input[id*="calPeriodo"]') ||
                document.querySelector('.month-year-input');
            return (el && esVisible(el)) ? el : null;
        }, 8000, 'Calendar Input Periodo');

        if (calendarInput) {
            console.log('📅 Interfaz CALENDARIO detectada. Procediendo...');

            // ELITE INTERACTION: Asegurar que el calendario se abra sin cerrarlo si ya está abierto
            const openCalendar = async () => {
                const isCalendarVisible = () => {
                    const picker = document.querySelector('.ui-datepicker:not(.ui-helper-hidden)') || 
                                   document.querySelector('.ui-dialog[aria-hidden="false"] .button-3');
                    if (picker && esVisible(picker)) return true;
                    // Búsqueda profunda de cualquier contenedor con botones de mes
                    return !!Array.from(document.querySelectorAll('.button-3, .ui-datepicker-calendar'))
                                .find(el => esVisible(el));
                };

                if (isCalendarVisible()) return true;

                for (let i = 0; i < 3; i++) {
                    console.log(`🎯 Abriendo calendario (Intento ${i+1})...`);
                    calendarInput.focus();
                    await sleep(200);
                    
                    // Click coordinado
                    const rect = calendarInput.getBoundingClientRect();
                    const clickEvent = new MouseEvent('mousedown', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    });
                    calendarInput.dispatchEvent(clickEvent);
                    calendarInput.click();
                    
                    await sleep(1000); // Esperar animación de PrimeFaces
                    if (isCalendarVisible()) return true;
                }
                return false;
            };

            await openCalendar();

            // 3.2: AJUSTAR EL AÑO EN EL CALENDARIO
            const adjustYear = async (targetYear) => {
                const maxIntents = 20;
                for (let i = 0; i < maxIntents; i++) {
                    let datepickerDiv = document.getElementById('ui-datepicker-div') ||
                        document.querySelector('.ui-datepicker:not(.ui-helper-hidden)') ||
                        document.querySelector('.ui-datepicker-inline');
                    
                    if (!datepickerDiv) {
                        datepickerDiv = Array.from(document.querySelectorAll('.ui-datepicker, .ui-dialog, .ui-widget-content'))
                            .find(d => {
                                if (!esVisible(d)) return false;
                                // Si tiene el botón-3 que el usuario reportó, este es el contenedor
                                return !!d.querySelector('.button-3');
                            });
                    }

                    if (!datepickerDiv) {
                        console.log('⏳ Buscando visor de calendario...');
                        const opened = await openCalendar();
                        if (!opened) {
                            console.warn('⚠️ No se pudo abrir el calendario visualmente.');
                        }
                        await sleep(500);
                        continue;
                    }

                    // Extraer año actual del encabezado
                    const header = datepickerDiv.querySelector('.ui-datepicker-header, .ui-widget-header, .ui-datepicker-title') || datepickerDiv;
                    const headerText = (header.innerText || header.textContent || "").replace(/\s+/g, ' ').trim().toUpperCase();
                    const matchYear = headerText.match(/(20\d{2})/);

                    if (!matchYear) {
                        console.log('📅 No se halló año en cabecera text:', headerText);
                        // A veces el año está en un botón o span específico
                        const yearEl = datepickerDiv.querySelector('.ui-datepicker-year, .ui-button-text, .ui-datepicker-title');
                        const yearText = (yearEl ? yearEl.textContent : "").match(/20\d{2}/);
                        if (yearText && parseInt(yearText[0]) === targetYear) return datepickerDiv;
                        
                        await sleep(400);
                        continue;
                    }

                    const currentYear = parseInt(matchYear[0]);
                    console.log(`🔎 Año en UI: ${currentYear} | Objetivo: ${targetYear}`);

                    if (currentYear === targetYear) return datepickerDiv;

                    // Navegar al año correcto
                    const isNext = currentYear < targetYear;
                    const arrow = datepickerDiv.querySelector(isNext ? '.ui-datepicker-next' : '.ui-datepicker-prev') || 
                                  Array.from(datepickerDiv.querySelectorAll('a, button, span')).find(el => {
                                      const label = (el.getAttribute('aria-label') || '').toLowerCase();
                                      const icon = (el.className || '').toLowerCase();
                                      return isNext ? (label.includes('next') || icon.includes('right')) : (label.includes('prev') || icon.includes('left'));
                                  });

                    if (arrow) {
                        clickElement(arrow, 'Cambiar Año');
                        await sleep(1000); // Dar tiempo a la animación de cambio de año
                    } else {
                        break;
                    }
                }
                return null;
            };

            const yearGrid = await adjustYear(year);

            // 3.3: SELECCIONAR EL MES (Detección Ultra-Precisa)
            const selectMonthInCalendar = (grid) => {
                const root = grid || document.body;
                const targetText = targetMonthName; // "MARZO", "ABRIL", etc.
                const shortText = mesesAbreviados[monthIndex]; // "MAR", "ABR", etc.

                console.log(`🎯 Buscando botón para: ${targetText} (${shortText}) en el calendario...`);

                // Buscamos todos los elementos que parezcan botones de mes
                const candidates = Array.from(root.querySelectorAll('a.ui-button, button.ui-button, .button-3, td'))
                    .filter(el => {
                        if (!esVisible(el)) return false;
                        const txt = el.textContent.trim().toUpperCase();
                        // Filtrar para que sea EXACTO o contenga el mes pero no sea el año
                        return txt.length > 0 && (txt === targetText || txt === shortText || (txt.includes(targetText) && !txt.match(/20\d{2}/)));
                    });

                // Prioridad a .button-3 (el que el usuario confirmó)
                const bestMatch = candidates.find(el => el.classList.contains('button-3')) || 
                                 candidates.find(el => el.tagName === 'A') || 
                                 candidates[0];

                if (bestMatch) {
                    console.log(`✅ Mes ${targetText} localizado. Forzando click...`);
                    bestMatch.focus();
                    
                    // Doble evento para asegurar que PrimeFaces lo detecte
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    bestMatch.dispatchEvent(clickEvent);
                    
                    // Fallback si el MouseEvent no cierra el picker
                    if (typeof bestMatch.click === 'function') bestMatch.click();

                    return true;
                }
                return false;
            };

            const monthSelected = selectMonthInCalendar(yearGrid);

            if (monthSelected) {
                console.log('✨ Mes clickeado. Esperando que el portal procese la selección...');
                periodSelected = true;
                progress(75);
                
                // Esperar a que el calendario se cierre solo o el input gane el valor
                await waitFor(() => {
                    const picker = document.querySelector('.ui-datepicker:not(.ui-helper-hidden)') || 
                                   document.querySelector('.ui-dialog[aria-hidden="false"] .button-3');
                    return !picker || !esVisible(picker);
                }, 3000, 'Cierre de Calendario');

                await waitForPortal();
                await sleep(1500); // Pausa necesaria para que PrimeFaces habilite el botón 'Siguiente'
            } else {
                // 3.4: GHOST INJECTION (Fallback de emergencia)
                console.log('⚠️ No se pudo clickear el mes. Intentando inyección directa...');
                const dateString = `${(monthIndex + 1).toString().padStart(2, '0')}/${year}`;
                calendarInput.value = dateString;
                calendarInput.dispatchEvent(new Event('input', { bubbles: true }));
                calendarInput.dispatchEvent(new Event('change', { bubbles: true }));
                calendarInput.dispatchEvent(new Event('blur', { bubbles: true }));
                
                // Trigger adicional de PrimeFaces vía widget si está expuesto
                try {
                    const id = calendarInput.id.replace(/:/g, '\\:');
                    const widget = window.PF && window.PF(id);
                    if (widget && widget.setDate) {
                        widget.setDate(new Date(year, monthIndex, 1));
                    }
                } catch(e) {}
                
                await sleep(1500);
                periodSelected = true; 
            }
        }

        // FALLBACK: MODO CLÁSICO (Dropdowns) si falla el calendario O si el calendario falló en seleccionar
        if (!periodSelected) {
            console.log('🔍 Intentando Fallback: Interfaz Clásica (Dropdowns)...');

            const findClassicDropdown = async (labelMatch, idMatch) => {
                return await waitFor(() => {
                    const elId = document.getElementById(idMatch);
                    if (elId && esVisible(elId)) return elId;
                    const label = findByText(labelMatch, 'label');
                    if (label) {
                        const container = label.closest('.ui-selectonemenu') || label.parentElement.querySelector('.ui-selectonemenu');
                        if (container) return container.querySelector('.ui-selectonemenu-label') || container;
                    }
                    return null;
                }, 4000, `Dropdown ${labelMatch} `);
            };

            const labelAnio = await findClassicDropdown('AÑO', 'frmFlujoDeclaracion:somAnio_label');
            let yearClassicOk = false;
            if (labelAnio) {
                if (labelAnio.textContent.includes(year.toString())) {
                    console.log('✅ Año ya seleccionado en dropdown clásico.');
                    yearClassicOk = true;
                } else {
                    // RETRY LOOP para dropdown de año
                    for (let attempt = 0; attempt < 3; attempt++) {
                        console.log(`🎯 Intento ${attempt + 1}: Seleccionando año ${year} en dropdown clásico...`);
                        const trigger = labelAnio.closest('.ui-selectonemenu') || labelAnio;
                        clickElement(trigger, 'Dropdown Año');
                        await sleep(800);

                        const optAnio = Array.from(document.querySelectorAll('.ui-selectonemenu-items li, .ui-selectonemenu-panel li'))
                            .find(li => li.textContent.trim() === year.toString());

                        if (optAnio) {
                            clickElement(optAnio, year.toString());
                            await waitForPortal();
                            await sleep(500);

                            // Verificar si pegó
                            if (labelAnio.textContent.includes(year.toString())) {
                                console.log('✅ Año seleccionado correctamente.');
                                yearClassicOk = true;
                                break;
                            }
                        }
                        await sleep(500);
                    }
                }
            }

            const labelMes = await findClassicDropdown('MES', 'frmFlujoDeclaracion:somMes_label');
            if (yearClassicOk && labelMes) {
                if (labelMes.textContent.toUpperCase().includes(targetMonthName)) {
                    console.log('✅ Mes ya seleccionado en dropdown clásico.');
                    periodSelected = true;
                } else {
                    // RETRY LOOP para dropdown de mes
                    for (let attempt = 0; attempt < 3; attempt++) {
                        console.log(`🎯 Intento ${attempt + 1}: Seleccionando mes ${targetMonthName} en dropdown clásico...`);
                        const trigger = labelMes.closest('.ui-selectonemenu') || labelMes;
                        clickElement(trigger, 'Dropdown Mes');
                        await sleep(800);

                        const optMes = Array.from(document.querySelectorAll('.ui-selectonemenu-items li, .ui-selectonemenu-panel li'))
                            .find(li => li.textContent.trim().toUpperCase() === targetMonthName);

                        if (optMes) {
                            clickElement(optMes, targetMonthName);
                            await waitForPortal();
                            await sleep(500);

                            // Verificar si pegó
                            if (labelMes.textContent.toUpperCase().includes(targetMonthName)) {
                                console.log('✅ Mes seleccionado correctamente.');
                                periodSelected = true;
                                break;
                            }
                        }
                        await sleep(500);
                    }
                }
            } else if (!yearClassicOk) {
                console.warn('⚠️ No se pudo seleccionar el año, saltando selección de mes.');
            }
        }

        // VALIDACIÓN DE SEGURIDAD CON ASISTENCIA AL USUARIO
        if (!periodSelected) {
            console.error('🚫 El periodo no pudo ser configurado automáticamente.');
            safeStatus('🤝 Necesito tu ayuda: Selecciona el periodo manualmente');

            // ELITE: Mostrar tarjeta de asistencia al usuario
            if (window.sriAssistant) {
                window.sriAssistant.showContextCard({
                    title: '🤝 Asistencia Requerida',
                    subtitle: `${targetMonthName} ${year}`,
                    message: `No pude seleccionar el periodo automáticamente.<br><br>Por favor:<br>1. Selecciona <b>${targetMonthName} ${year}</b> manualmente<br>2. Haz click en <b>"Siguiente"</b><br><br>El asistente continuará automáticamente.`,
                    icon: '👆',
                    timeout: null,
                    actionText: '✅ ENTENDIDO',
                    onAction: () => { }
                });
            }

            // ESPERAR A QUE EL USUARIO SELECCIONE Y CONTINUAR AUTOMÁTICAMENTE
            console.log('⏳ Esperando selección manual del periodo...');
            const userSelectedPeriod = await waitFor(() => {
                // Verificar si el botón Siguiente está habilitado (indica que el periodo fue seleccionado)
                const btnSig = document.getElementById('frmFlujoDeclaracion:btnObligacionSiguiente');
                return (btnSig && !btnSig.disabled) ? btnSig : null;
            }, 120000, 'Selección Manual de Periodo'); // 2 minutos de espera

            if (userSelectedPeriod) {
                console.log('✅ Usuario seleccionó el periodo. Continuando...');
                periodSelected = true;
            } else {
                console.error('❌ Timeout esperando selección manual.');
                safeStatus('❌ Tiempo agotado. Reinicia el proceso.');
                return;
            }
        }

        // PASO 4: BOTÓN SIGUIENTE (Primer Step)
        console.log('🔍 Paso 4: Avanzar Siguiente...');
        const btnSiguiente = await waitFor(() => {
            const btn = document.getElementById('frmFlujoDeclaracion:btnObligacionSiguiente') ||
                        document.querySelector('button[id*="btnObligacionSiguiente"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.innerText.toUpperCase().includes('SIGUIENTE'));
            return (btn && !btn.disabled && esVisible(btn)) ? btn : null;
        }, 8000, 'Boton Siguiente Obligación');

        if (btnSiguiente) {
            safeStatus('🚀 Siguiente paso...');
            clickElement(btnSiguiente, 'Siguiente Obligación');
            await sleep(2000);
            // Si el portal no avanzó (sigue el botón ahí), intentar un segundo click forzado
            if (document.getElementById('frmFlujoDeclaracion:btnObligacionSiguiente')) {
                console.log('⚠️ El botón Siguiente sigue presente. Re-clickeando...');
                btnSiguiente.click();
            }
        } else {
            console.warn('⚠️ No se detectó botón Siguiente habilitado. Verifique selección manual.');
        }
        
        progress(85);
        await waitForPortal();

        // ELITE FIX: SMART DETECTOR DE DECLARACIÓN SUSTITUTIVA / PREVIA
        // Evita que el asistente intente declarar algo que ya fue declarado (evitando error 404 o wizard roto)
        console.log('🔍 Chequeando alertas de declaración previa/sustitutiva...');
        const errorMessages = Array.from(document.querySelectorAll('.ui-messages-error-detail, .ui-messages-warn-detail, .ui-messages-info-detail, .ui-dialog-content, .ui-messages-summary'));
        let isAlreadyDeclared = errorMessages.some(el => {
            // FIX: Ignorar modales o mensajes ocultos de PrimeFaces
            if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;

            const txt = (el.innerText || '').toUpperCase();
            return txt.includes('SUSTITUTIVA') || 
                   txt.includes('YA FUE PRESENTADA') || 
                   txt.includes('YA EXISTE') ||
                   txt.includes('YA SE ENCUENTRA REGISTRADA');
        });

        if (isAlreadyDeclared) {
            console.warn('⚠️ DECLARACIÓN PREVIA DETECTADA EN SRI.');
            safeStatus('⚠️ Declaración ya registrada');
            
            if (window.sriAssistant) {
                window.sriAssistant.showEliteToast({
                    title: '⚠️ Declaración Previa',
                    msg: 'El SRI indica que esta declaración ya fue presentada previamente.',
                    duration: 5000
                });
            }

            await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod']);

            const autoRes = await SafeStorage.get(['auto_batch_enabled', 'sri_auto_mode']);
            if (autoRes.auto_batch_enabled || autoRes.sri_auto_mode) {
                safeStatus('⏩ Avanzando al siguiente cliente del lote...');
                await sleep(1500);
                if (typeof handleBatchNextClient === 'function') {
                    const hasNext = await handleBatchNextClient();
                    if (!hasNext && typeof cerrarSesionSRI === 'function') await cerrarSesionSRI();
                } else if (typeof cerrarSesionSRI === 'function') {
                    await cerrarSesionSRI();
                }
            }
            return; // Detener flujo sin redirigir a consulta de documentos
        }

        // PASO 5: PREGUNTAS (Si aparecen - SMART SKIP)
        console.log('🔍 Paso 5: Preguntas...');
        const btnPreguntasSiguiente = await waitFor(async () => {
            const btn = document.getElementById('frmFlujoDeclaracion:btnPreguntasSiguiente');
            if (btn) return btn;

            // Si el botón final de paso 6 YA está visible, es que no hubo preguntas.
            const btnFinal = document.getElementById('frmFlujoDeclaracion:clkFormularioCompleto') ||
                document.getElementById('frmFlujoDeclaracion:btnVerFormularioCompleto') ||
                findByText('Ver formulario completo');
            if (btnFinal && esVisible(btnFinal)) {
                console.log('⏩ No hay preguntas. Saltando al Paso 6.');
                return 'SKIPPED';
            }
            return null;
        }, 5000, 'Botón Preguntas Siguiente');

        if (btnPreguntasSiguiente && btnPreguntasSiguiente !== 'SKIPPED') {
            safeStatus('📝 Saltando preguntas...');
            clickElement(btnPreguntasSiguiente, 'Siguiente Preguntas');
            progress(90);
            await waitForPortal();
        }

        // PASO 6: VER FORMULARIO COMPLETO (ELITE CLICK)
        console.log('🔍 Paso 6: Abrir Formulario...');
        // ID REAL confirmado: frmFlujoDeclaracion:clkFormularioCompleto (es un <a>
        // ui-commandlink, no un botón). Saltea el paso 2 "Preguntas": su propio
        // aria-label dice "No es necesario contestar las preguntas del perfilamiento".
        const btnVerFormulario = await waitFor(() =>
            document.getElementById('frmFlujoDeclaracion:clkFormularioCompleto') ||
            document.getElementById('frmFlujoDeclaracion:btnVerFormularioCompleto') ||
            findByText('Ver formulario completo'), 8000, 'Botón Ver Formulario');

        if (btnVerFormulario) {
            safeStatus('✨ Abriendo Formulario...');
            progress(95);
            const innerClickable = btnVerFormulario.querySelector('a, button, span.ui-button-text') || btnVerFormulario;
            clickElement(innerClickable, 'Ver Formulario Completo');
            await waitForPortal(); // ZERO-LAG Final
            progress(100);

            // Espera reactiva de los campos del formulario (hasta 15s)
            console.log('⏳ Esperando renderizado reactivo de casilleros IVA en DOM...');
            safeStatus('⏳ Cargando casilleros del formulario...');
            const formFieldsFound = await waitFor(() => {
                return document.getElementById('concepto401') ||
                       document.querySelector('input[id*="concepto"]') ||
                       document.querySelector('input[id*="casillero"]');
            }, 15000, 'Campos Formulario IVA');

            if (formFieldsFound) {
                console.log('✅ Casilleros de Formulario IVA detectados en DOM.');
                await sleep(500);
            } else {
                console.warn('⚠️ Casilleros no detectados inmediatamente tras 15s. Intentando detección de seguridad...');
            }

            // ELITE NOTIFICACIÓN: LLEGADA AL FORMULARIO
            if (window.sriAssistant) {
                window.sriAssistant.setWorking(false);
                window.sriAssistant.toggleMinimize(false); // EXPANDIR PANEL
                window.sriAssistant.render(); // MOSTRAR BOTONES DE LLENADO

                window.sriAssistant.showEliteToast({
                    title: '🚀 ¡Formulario Listo!',
                    msg: 'Analizando formulario para auto-llenado...',
                    duration: 4000
                });

                await window.sriAssistant.checkIfOnForm();
            }

            // ELITE FIX: Limpiar pendingAction para detener el ciclo
            await SafeStorage.remove(['pendingAction', 'actionTimestamp']);
            console.log('✅ Navegación completada. pendingAction limpiado.');
        }

        console.groupEnd();
        return;
    } catch (e) {
        console.error('❌ Error en Wizard:', e);
        safeStatus('❌ Error: ' + e.message);
    } finally {
        if (window.sriAssistant) {
            const onForm = document.getElementById('concepto401');
            if (onForm) window.sriAssistant.setWorking(false);
        }
    }
}

// ============================================
// UI GHOST - NOTIFICACIONES ELEGANTES
// ============================================

function showEliteToast(data, workflowPeriod) {
    if (document.getElementById('sri-elite-toast')) {
        document.getElementById('sri-elite-toast').remove();
    }

    const toast = document.createElement('div');
    toast.id = 'sri-elite-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: -250px;
        left: 50%;
        transform: translateX(-50%);
        width: 360px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 28px;
        padding: 24px;
        color: white;
        z-index: 1000000;
        box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.3);
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
        opacity: 0;
    `;

    // Formatear valores con 2 decimales
    const retIvaFormateado = typeof data.retIva === 'number' ? data.retIva.toFixed(2) : (data.retIva || '0.00');
    const retRentaFormateado = typeof data.retRenta === 'number' ? data.retRenta.toFixed(2) : (data.retRenta || '0.00');

    toast.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 18px;">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3);">✅</div>
                <div>
                    <div style="color: #10b981; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.2;">Extracción Exitosa</div>
                    <div style="font-size: 10px; opacity: 0.6; font-weight: 600;">OPERACIÓN TURBO COMPLETADA</div>
                </div>
            </div>
            
            <div style="height: 1px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent);"></div>
            
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 13px; font-weight: 800; color: #818cf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">👤 ${escapeHtml(data.clientName || 'Cliente Detectado')}</div>
                <div style="font-size: 11px; opacity: 0.8; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <span style="opacity: 0.5;">📅</span> ${data.periodo || 'Mes Anterior'}
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-size: 9px; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Facturas</div>
                    <div style="font-size: 18px; font-weight: 900; letter-spacing: -0.02em;">${data.facturasCount || 0}</div>
                    <div style="font-size: 9px; font-weight: 700;">
                        <span style="color: #10b981;">${data.facturasIva || 0}</span> IVA | 
                        <span style="color: #6366f1;">${data.facturas0 || 0}</span> 0%
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-size: 9px; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Retenciones</div>
                    <div style="font-size: 18px; font-weight: 900; letter-spacing: -0.02em;">${data.retCount || 0}</div>
                    <div style="font-size: 9px; font-weight: 800; display: flex; flex-direction: column; gap: 2px;">
                        <span style="color: #a855f7;">IVA: $${retIvaFormateado}</span>
                        <span style="color: #ec4899;">RENTA: $${retRentaFormateado}</span>
                    </div>
                </div>
            </div>

            <!-- NOTAS DE CRÉDITO (SINGLE MONTH REPORT) -->
            <div style="background: rgba(244, 63, 94, 0.08); padding: 14px; border-radius: 20px; border: 1px solid rgba(244, 63, 94, 0.2); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 9px; color: #f43f5e; font-weight: 800; text-transform: uppercase; margin-bottom: 2px;">Notas de Crédito</div>
                    <div style="font-size: 16px; font-weight: 900; color: #f43f5e;">$${parseFloat(data.ncTotal || 0).toFixed(2)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 10px; font-weight: 800; opacity: 0.6;">${data.ncCount || 0} DOCUMENTOS</div>
                </div>
            </div>

            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 12px; font-size: 9px; color: #cbd5e1; font-weight: 600; line-height: 1.4;">
                <div style="color: #94a3b8; font-size: 8px; text-transform: uppercase; margin-bottom: 4px;">Documentos Extraídos:</div>
                <div style="word-break: break-all;">${data.retList || '-'}</div>
            </div>
            
            <button id="sri-toast-nav-btn" style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: white; border: none; border-radius: 16px; padding: 12px; font-size: 13px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px;">
                🚀 IR A DECLARACIÓN ✨
            </button>
            <div style="font-size: 9px; text-align: center; opacity: 0.4; font-weight: 600;">LOS DATOS YA ESTÁN EN LA EXTENSIÓN 💎</div>
        </div>
    `;

    document.body.appendChild(toast);

    const navBtn = toast.querySelector('#sri-toast-nav-btn');
    if (navBtn) {
        navBtn.onclick = async () => {
            navBtn.innerText = '🔄 CARGANDO...';
            navBtn.style.opacity = '0.7';

            let periodToUse = workflowPeriod;
            if (!periodToUse) {
                const ahora = new Date();
                const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
                periodToUse = {
                    year: mesAnterior.getFullYear(),
                    monthIndex: mesAnterior.getMonth()
                };
            }

            await SafeStorage.set({
                pendingAction: 'startIvaNavigation',
                workflowPeriod: periodToUse,
                autoDeclaration: true,
                sri_master_switch_on: true,
                actionTimestamp: Date.now()
            });

            window.location.href = SRI_PUENTE_FORMULARIO_IVA;
        };
    }

    setTimeout(() => {
        toast.style.bottom = '30px';
        toast.style.opacity = '1';
    }, 100);

    const autoCloseTime = (data && data.duration) ? data.duration : 3000;
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.bottom = '-500px';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 600);
        }
    }, autoCloseTime);
}

function showBulkEliteToast(totals, bulkFlow, workflowPeriod) {
    if (document.getElementById('sri-bulk-toast')) {
        document.getElementById('sri-bulk-toast').remove();
    }

    // ELITE: Guardar reporte para la extensión (Persistencia)
    const clientName = document.getElementById('sri-client-name')?.textContent || 'Cliente SRI';
    const reportData = {
        totals: totals,
        breakdown: bulkFlow.results || [],
        months: bulkFlow.months || [], // FIXED: include months
        period: workflowPeriod,
        timestamp: Date.now(),
        clientName: clientName
    };
    SafeStorage.set({ lastBulkReport: reportData });

    const toast = document.createElement('div');
    toast.id = 'sri-bulk-toast';
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 95%;
        max-width: 900px;
        max-height: 90vh;
        overflow-y: auto;
        background: rgba(15, 23, 42, 0.98);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 28px;
        padding: 30px;
        color: white;
        z-index: 1000001;
        box-shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.5);
        font-family: 'Inter', sans-serif;
    `;

    let periodLabel = `AÑO ${workflowPeriod.year}`;
    if (bulkFlow.months && bulkFlow.months.length === 6) {
        periodLabel = bulkFlow.months[0] === 0 ? `1ER SEMESTRE ${workflowPeriod.year}` : `2DO SEMESTRE ${workflowPeriod.year}`;
    } else if (bulkFlow.months && bulkFlow.months.length === 1) {
        const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        periodLabel = `${monthNames[bulkFlow.months[0]]} ${workflowPeriod.year}`;
    }

    const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

    // Generate monthly breakdown table
    let monthlyTableHTML = '';
    const resultsTable = bulkFlow.results || bulkFlow.breakdown || []; // Handle both formats
    if (resultsTable.length > 0) {
        // Sort results by month index to ensure order (Dec at end)
        const sortedResults = [...resultsTable].sort((a, b) => a.month - b.month);

        monthlyTableHTML = `
            <div style="margin-top: 25px;">
                <div style="font-size: 13px; font-weight: 800; color: #818cf8; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
                    <span>📊 DESGLOSE MENSUAL</span>
                    <span style="font-size: 10px; opacity: 0.5; font-weight: 400;">(Click en valor para copiar)</span>
                </div>
                <div style="background: rgba(0,0,0,0.3); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="background: rgba(99, 102, 241, 0.2);">
                                <th style="padding: 12px; text-align: left; font-weight: 800; color: #818cf8; text-transform: uppercase;">Mes</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #10b981;">Base 15%</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #10b981;">IVA 15%</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #10b981;">Base 0%</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #6366f1;">Ret IVA</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #a855f7;">Ret Renta</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #f43f5e;">NC 15%</th>
                                <th style="padding: 12px; text-align: right; font-weight: 800; color: #fb7185;">NC 0%</th>
                            </tr>
                        </thead>
                        <tbody>`;

        sortedResults.forEach((m, idx) => {
            const mName = monthNames[m.month] || `MES ${m.month + 1}`;
            const f15 = parseDecimal(m.data.facturas?.iva15?.baseImponible || 0);
            const fIva = parseDecimal(m.data.facturas?.iva15?.montoIva || 0);
            const f0 = parseDecimal(m.data.facturas?.iva0?.baseImponible || 0);
            const rIva = parseDecimal(m.data.retenciones?.ivaRetenido?.total || 0);
            const rIvaBase = parseDecimal(m.data.retenciones?.ivaRetenido?.baseTotal || 0);
            const rRenta = parseDecimal(m.data.retenciones?.rentaRetenida?.total || 0);
            const rRentaBase = parseDecimal(m.data.retenciones?.rentaRetenida?.baseTotal || 0);
            const nc15 = parseDecimal(m.data.notasCredito?.iva15?.baseImponible || 0);
            const nc0 = parseDecimal(m.data.notasCredito?.iva0?.baseImponible || 0);

            monthlyTableHTML += `
                <tr style="border-top: 1px solid rgba(255,255,255,0.05); ${idx % 2 === 0 ? 'background: rgba(255,255,255,0.02);' : ''}">
                    <td style="padding: 12px; font-weight: 700; color: #cbd5e1;">${mName}</td>
                    <td class="sri-copy-val" data-val="${f15.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #10b981; cursor: pointer;">$${f15.toFixed(2)}</td>
                    <td class="sri-copy-val" data-val="${fIva.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #10b981; cursor: pointer;">$${fIva.toFixed(2)}</td>
                    <td class="sri-copy-val" data-val="${f0.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #10b981; cursor: pointer;">$${f0.toFixed(2)}</td>
                    <td style="padding: 12px; text-align: right;">
                        <div class="sri-copy-val" data-val="${rIva.toFixed(2)}" style="font-weight: 600; color: #818cf8; cursor: pointer;">$${rIva.toFixed(2)}</div>
                        <div class="sri-copy-val" data-val="${rIvaBase.toFixed(2)}" style="font-size: 8px; opacity: 0.5; cursor: pointer;">B: $${rIvaBase.toFixed(2)}</div>
                    </td>
                    <td style="padding: 12px; text-align: right;">
                        <div class="sri-copy-val" data-val="${rRenta.toFixed(2)}" style="font-weight: 600; color: #a855f7; cursor: pointer;">$${rRenta.toFixed(2)}</div>
                        <div class="sri-copy-val" data-val="${rRentaBase.toFixed(2)}" style="font-size: 8px; opacity: 0.5; cursor: pointer;">B: $${rRentaBase.toFixed(2)}</div>
                    </td>
                    <td class="sri-copy-val" data-val="${nc15.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #f43f5e; cursor: pointer;">$${nc15.toFixed(2)}</td>
                    <td class="sri-copy-val" data-val="${nc0.toFixed(2)}" style="padding: 12px; text-align: right; font-weight: 600; color: #fb7185; cursor: pointer;">$${nc0.toFixed(2)}</td>
                </tr>`;
        });

        monthlyTableHTML += `
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    toast.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Header -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 54px; height: 54px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 18px; display: flex; align-items: center; justify-content: center; font-size: 28px; box-shadow: 0 10px 25px rgba(245, 158, 11, 0.4);">🏆</div>
                    <div>
                        <div style="color: #f59e0b; font-weight: 900; font-size: 18px; text-transform: uppercase; letter-spacing: 0.12em; line-height: 1.1;">Reporte Maestro Elite</div>
                        <div style="font-size: 11px; opacity: 0.7; font-weight: 700; color: #94a3b8;">${(bulkFlow.months || []).length} MESES PROCESADOS • ${escapeHtml(clientName)}</div>
                    </div>
                </div>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: rgba(255,255,255,0.1); color: white; border: none; border-radius: 14px; padding: 10px 16px; font-size: 20px; cursor: pointer; transition: 0.3s; font-weight: 800;">×</button>
            </div>

            <!-- Period Box -->
            <div style="background: rgba(255,255,255,0.05); padding: 16px 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 10px; font-weight: 800; color: #818cf8; text-transform: uppercase; margin-bottom: 4px;">📍 PERIODO DE CONSULTA</div>
                    <div style="font-size: 16px; font-weight: 800; color: white;">${periodLabel}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">FECHA REPORTE</div>
                    <div style="font-size: 13px; font-weight: 600; opacity: 0.8;">${new Date().toLocaleDateString()}</div>
                </div>
            </div>

            <!-- Main Totals Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
                <!-- FACTURAS -->
                <div style="background: rgba(16, 185, 129, 0.08); padding: 20px; border-radius: 24px; border: 1px solid rgba(16, 185, 129, 0.2); position: relative; overflow: hidden;">
                    <div style="font-size: 11px; color: #10b981; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">🛍️ COMPRAS</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="sri-copy-val" data-val="${totals.iva15.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">BASE 15%</div>
                            <div style="font-size: 18px; font-weight: 900; color: #10b981;">$${totals.iva15.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.montoIva.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">IVA GENERADO (15%)</div>
                            <div style="font-size: 18px; font-weight: 900; color: #10b981;">$${totals.montoIva.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.iva0.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">BASE 0%</div>
                            <div style="font-size: 18px; font-weight: 900; color: #10b981;">$${totals.iva0.toFixed(2)}</div>
                        </div>
                        <div style="margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(16, 185, 129, 0.2);" class="sri-copy-val" data-val="${(totals.iva15 + totals.iva0 + totals.montoIva).toFixed(2)}">
                            <div style="font-size: 9px; opacity: 0.8; font-weight: 800; color: white;">TOTAL CON IVA</div>
                            <div style="font-size: 20px; font-weight: 900; color: white;">$${(totals.iva15 + totals.iva0 + totals.montoIva).toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                <!-- RETENCIONES -->
                <div style="background: rgba(99, 102, 241, 0.08); padding: 20px; border-radius: 24px; border: 1px solid rgba(99, 102, 241, 0.2);">
                    <div style="font-size: 11px; color: #818cf8; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">💸 RETENCIONES</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="sri-copy-val" data-val="${(totals.retIvaBase + totals.retRentaBase).toFixed(2)}" style="cursor:pointer; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="font-size: 9px; opacity: 0.8; font-weight: 700; color: #a5b4fc; text-transform: uppercase;">💰 Base Imponible</div>
                            <div style="font-size: 18px; font-weight: 900; color: white;">$${(totals.retIvaBase + totals.retRentaBase).toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.retIva.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">IVA RETENIDO</div>
                            <div style="font-size: 18px; font-weight: 900; color: #818cf8;">$${totals.retIva.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.retRenta.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">RENTA RETENIDA</div>
                            <div style="font-size: 18px; font-weight: 900; color: #a855f7;">$${totals.retRenta.toFixed(2)}</div>
                        </div>
                        <div style="margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(99, 102, 241, 0.2);" class="sri-copy-val" data-val="${(totals.retIva + totals.retRenta).toFixed(2)}">
                            <div style="font-size: 9px; opacity: 0.8; font-weight: 800; color: white;">TOTAL RETENCIONES</div>
                            <div style="font-size: 20px; font-weight: 900; color: white;">$${(totals.retIva + totals.retRenta).toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                <!-- NOTAS DE CRÉDITO -->
                <div style="background: rgba(244, 63, 94, 0.08); padding: 20px; border-radius: 24px; border: 1px solid rgba(244, 63, 94, 0.2);">
                    <div style="font-size: 11px; color: #f43f5e; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">📄 NOTAS CRÉDITO</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="sri-copy-val" data-val="${totals.ncIva15.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">BASE 15%</div>
                            <div style="font-size: 18px; font-weight: 900; color: #f43f5e;">$${totals.ncIva15.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.ncIva.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">IVA NC (15%)</div>
                            <div style="font-size: 18px; font-weight: 900; color: #f43f5e;">$${totals.ncIva.toFixed(2)}</div>
                        </div>
                        <div class="sri-copy-val" data-val="${totals.ncIva0.toFixed(2)}" style="cursor:pointer;">
                            <div style="font-size: 9px; opacity: 0.6; font-weight: 700;">BASE 0%</div>
                            <div style="font-size: 18px; font-weight: 900; color: #fb7185;">$${totals.ncIva0.toFixed(2)}</div>
                        </div>
                        <div style="margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(244, 63, 94, 0.2);" class="sri-copy-val" data-val="${totals.ncTotal.toFixed(2)}">
                            <div style="font-size: 9px; opacity: 0.8; font-weight: 800; color: white;">TOTAL NOTAS</div>
                            <div style="font-size: 20px; font-weight: 900; color: white;">$${totals.ncTotal.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom Highlights -->
            <div style="background: linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.15)); padding: 20px; border-radius: 24px; border: 1px solid rgba(59, 130, 246, 0.2); text-align: center; cursor: pointer;" class="sri-copy-val" data-val="${(totals.iva15 + totals.iva0).toFixed(2)}">
                <div style="font-size: 11px; color: #60a5fa; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.1em;">💰 TOTAL BASES IMPONIBLES (RENTA)</div>
                <div style="font-size: 32px; font-weight: 900; color: white; letter-spacing: -0.02em;">$${(totals.iva15 + totals.iva0).toFixed(2)}</div>
                <div style="font-size: 10px; opacity: 0.5; margin-top: 4px;">Suma total de bases imponibles (Excluye IVA)</div>
            </div>

            ${monthlyTableHTML}

            <!-- Secondary Info -->
            <div style="display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.2); padding: 12px 18px; border-radius: 16px; font-size: 10px; color: #94a3b8; font-weight: 600;">
                <span style="font-size: 14px;">ℹ️</span>
                <span>Los valores mostrados corresponden a las bases imponibles y totales extraídos directamente del portal del SRI.</span>
            </div>

            <!-- Footer Actions -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <button id="btn-copy-bulk-toast" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 18px; padding: 16px; font-size: 14px; font-weight: 800; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 20px rgba(79, 70, 229, 0.4); display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <span>📋</span> COPIAR REPORTE COMPLETO
                </button>
                <button id="btn-export-excel" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 18px; padding: 16px; font-size: 14px; font-weight: 800; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <span>📊</span> EXPORTAR A EXCEL (CSV)
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(toast);

    // Copy button functionality
    const btnCopy = document.getElementById('btn-copy-bulk-toast');
    if (btnCopy) {
        btnCopy.onclick = () => {
            let clipboardText = `REPORTE MAESTRO SRI - ${clientName}\nPERIODO: ${periodLabel}\n\n`;
            clipboardText += `TOTALES GENERALES:\n`;
            clipboardText += `----------------------------------\n`;
            clipboardText += `🛍️ COMPRAS:\n`;
            clipboardText += `  Base 15%:      $${totals.iva15.toFixed(2)}\n`;
            clipboardText += `  IVA 15%:       $${totals.montoIva.toFixed(2)}\n`;
            clipboardText += `  Base 0%:       $${totals.iva0.toFixed(2)}\n`;
            clipboardText += `  TOTAL COMPRAS: $${(totals.iva15 + totals.iva0 + totals.montoIva).toFixed(2)}\n\n`;

            clipboardText += `💸 RETENCIONES:\n`;
            clipboardText += `  IVA Retenido:  $${totals.retIva.toFixed(2)}\n`;
            clipboardText += `  Renta Retenida: $${totals.retRenta.toFixed(2)}\n`;
            clipboardText += `  TOTAL RET.:    $${(totals.retIva + totals.retRenta).toFixed(2)}\n\n`;

            clipboardText += `📄 NOTAS CRÉDITO:\n`;
            clipboardText += `  Base 15%:      $${totals.ncIva15.toFixed(2)}\n`;
            clipboardText += `  IVA NC:        $${totals.ncIva.toFixed(2)}\n`;
            clipboardText += `  Base 0%:       $${totals.ncIva0.toFixed(2)}\n`;
            clipboardText += `  TOTAL NC:      $${totals.ncTotal.toFixed(2)}\n\n`;

            clipboardText += `💰 TOTAL BASES (RENTA): $${(totals.iva15 + totals.iva0).toFixed(2)}\n`;
            clipboardText += `----------------------------------\n\n`;

            clipboardText += `DETALLE MENSUAL:\nMES\tBASE 15%\tIVA 15%\tBASE 0%\tRET IVA\tRET RENTA\tNC 15%\tNC 0%\n`;

            if (resultsTable) {
                const sorted = [...resultsTable].sort((a, b) => a.month - b.month);
                sorted.forEach(m => {
                    const mName = monthNames[m.month] || `MES-${m.month}`;
                    const f15 = parseFloat(m.data.facturas?.iva15?.baseImponible || 0).toFixed(2);
                    const fIva = parseFloat(m.data.facturas?.iva15?.montoIva || 0).toFixed(2);
                    const f0 = parseFloat(m.data.facturas?.iva0?.baseImponible || 0).toFixed(2);
                    const rIva = parseFloat(m.data.retenciones?.ivaRetenido?.total || 0).toFixed(2);
                    const rRenta = parseFloat(m.data.retenciones?.rentaRetenida?.total || 0).toFixed(2);
                    const nc15 = parseFloat(m.data.notasCredito?.iva15?.baseImponible || 0).toFixed(2);
                    const nc0 = parseFloat(m.data.notasCredito?.iva0?.baseImponible || 0).toFixed(2);
                    clipboardText += `${mName}\t${f15}\t${fIva}\t${f0}\t${rIva}\t${rRenta}\t${nc15}\t${nc0}\n`;
                });
            }

            navigator.clipboard.writeText(clipboardText).then(() => {
                btnCopy.innerHTML = '<span>✅</span> ¡REPORTE COPIADO!';
                setTimeout(() => btnCopy.innerHTML = '<span>📋</span> COPIAR REPORTE COMPLETO', 2000);
            }).catch(err => console.error('Error al copiar:', err));
        };
    }

    // Export button functionality
    const btnExport = document.getElementById('btn-export-excel');
    if (btnExport) {
        btnExport.onclick = () => {
            // Create CSV content (UTF-8 with BOM for Excel compatibility)
            let csvContent = "\uFEFF";
            csvContent += `REPORTE MAESTRO SRI - ${clientName}\n`;
            csvContent += `PERIODO,${periodLabel}\n\n`;
            csvContent += `MES,BASE 15%,IVA 15%,BASE 0%,RETENCION IVA,RETENCION RENTA,NC 15%,NC 0%\n`;

            if (resultsTable) {
                const sorted = [...resultsTable].sort((a, b) => a.month - b.month);
                sorted.forEach(m => {
                    const mName = monthNames[m.month] || `MES-${m.month}`;
                    const f15 = parseFloat(m.data.facturas?.iva15?.baseImponible || 0).toFixed(2);
                    const fIva = parseFloat(m.data.facturas?.iva15?.montoIva || 0).toFixed(2);
                    const f0 = parseFloat(m.data.facturas?.iva0?.baseImponible || 0).toFixed(2);
                    const rIva = parseFloat(m.data.retenciones?.ivaRetenido?.total || 0).toFixed(2);
                    const rRenta = parseFloat(m.data.retenciones?.rentaRetenida?.total || 0).toFixed(2);
                    const nc15 = parseFloat(m.data.notasCredito?.iva15?.baseImponible || 0).toFixed(2);
                    const nc0 = parseFloat(m.data.notasCredito?.iva0?.baseImponible || 0).toFixed(2);
                    csvContent += `${mName},${f15},${fIva},${f0},${rIva},${rRenta},${nc15},${nc0}\n`;
                });
            }

            csvContent += `\nTOTALES,${totals.iva15.toFixed(2)},${totals.montoIva.toFixed(2)},${totals.iva0.toFixed(2)},${totals.retIva.toFixed(2)},${totals.retRenta.toFixed(2)},${totals.ncIva15.toFixed(2)},${totals.ncIva0.toFixed(2)}\n`;

            // Download CSV
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Reporte_SRI_Elite_${periodLabel.replace(/ /g, '_')}.csv`;
            link.click();

            btnExport.innerHTML = '<span>✅</span> EXPORTADO!';
            setTimeout(() => btnExport.innerHTML = '<span>📊</span> EXPORTAR A EXCEL (CSV)', 2000);
        };
    }

    // Enable click-to-copy for individual values
    toast.querySelectorAll('.sri-copy-val').forEach(el => {
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        el.title = 'Click para copiar valor individual';

        el.onclick = (e) => {
            e.stopPropagation();
            const val = el.getAttribute('data-val');
            if (val) {
                navigator.clipboard.writeText(val);

                // Visual feedback (Pulse & Color)
                const originalScale = el.style.transform;
                const originalOpacity = el.style.opacity;
                const originalColor = el.style.color;

                el.style.transform = 'scale(1.05)';
                el.style.color = '#fff';
                el.style.background = 'rgba(255,255,255,0.1)';
                el.style.borderRadius = '8px';

                // Mostrar mini-toast flotante cerca del cursor o elemento
                const tip = document.createElement('div');
                tip.textContent = 'Copiado';
                tip.style.cssText = `
                    position: fixed;
                    background: #10b981;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 800;
                    z-index: 1000002;
                    pointer-events: none;
                    top: ${e.clientY - 30}px;
                    left: ${e.clientX}px;
                    animation: tipFadeUp 0.6s forwards;
                `;

                if (!document.getElementById('sri-tip-style')) {
                    const s = document.createElement('style');
                    s.id = 'sri-tip-style';
                    s.textContent = `@keyframes tipFadeUp { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-20px); } }`;
                    document.head.appendChild(s);
                }

                document.body.appendChild(tip);
                setTimeout(() => tip.remove(), 600);

                setTimeout(() => {
                    el.style.transform = originalScale || 'scale(1)';
                    el.style.color = originalColor;
                    el.style.background = 'transparent';
                }, 200);
            }
        };

        // Hover effect
        el.onmouseenter = () => {
            el.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            el.style.borderRadius = '8px';
        };
        el.onmouseleave = () => {
            el.style.backgroundColor = 'transparent';
        };
    });
}

// ==========================================
// FIN DE NAVEGACIÓN SRI
// ==========================================
