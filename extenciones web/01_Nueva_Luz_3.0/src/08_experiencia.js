/* ============================================================================
   08 · CAPA DE EXPERIENCIA — modo de vista, cronómetro del lote y resumen
   ----------------------------------------------------------------------------
   Tres cosas que el usuario pidió y que hasta ahora no existían:

   1. DOS MODOS. `limpio` deja sólo lo esencial (estado, cliente, cronómetro,
      ▶, 🏁, 🛑 y el ojo para volver). `cockpit` es todo lo de siempre más lo
      nuevo. Se cambia con el ojo del HUD o con Alt+Shift+M, y se recuerda.

   2. CRONÓMETRO. Cuánto lleva la corrida, cuánto tarda cada cliente y una
      estimación de lo que falta. Sale de `sc_loop` (el semáforo ya guarda
      `latido` en cada avance), así que no hay que tocar el motor del bucle.

   3. RESUMEN. Al terminar, qué pasó: tiempo total, por cliente, promedio y
      por qué se detuvo. Se puede volver a abrir desde 📋.

   Además:
   - El nombre del cliente en curso, que era el dato que faltaba para saber
     dónde está parado el bot sin abrir el panel.
   - Estado "dormido" cuando el perfil no declara IVA o ya está declarado
     (se pregunta a SriLoopHUD.veredictoDelPerfil, que ya sabe leer el portal).
   - Lanzador de clientes (🧑): buscar por nombre o RUC y entrar a uno solo,
     sin pasar por el popup. Sólo cuando el lote está detenido.

   POR QUÉ ES UN ARCHIVO NUEVO
   Todo se engancha desde afuera (documento, storage, DOM del HUD). No se
   edita ni el motor del bucle ni los otros paneles: si algo de acá falla, se
   cae esta capa y el resto sigue declarando igual. Y si mañana no gusta, se
   saca del build y no queda rastro.

   REGLA DE ORO: nunca inventar lo que no se sabe. Si no hay corrida medida,
   se dice "sin datos" en vez de mostrar un 00:00 que parece real.
   ============================================================================ */

const SriExperiencia = {
    _MODO: 'sc_modo_vista',
    _CORRIDA: 'sc_corrida',
    _HISTORIAL: 'sc_corridas',

    _modo: 'cockpit',
    _caja: null,        // bloque nuevo dentro del HUD
    _pop: null,         // popover abierto (resumen o clientes)
    _corrida: null,     // { inicio, fin, pausaMs, pausaDesde, clientes:[], motivo }
    _tick: null,
    _ultimoIndice: 0,
    _ultimoNombre: '',
    _resumenNuevo: false,
    _dormido: false,

    /** El login del SRI. Copia literal de popup.js: es el mismo contrato. */
    _URL_LOGIN: 'https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth'
        + '?client_id=app-sri-claves-angular'
        + '&redirect_uri=https%3A%2F%2Fsrienlinea.sri.gob.ec%2Fsri-en-linea%2F%2Fcontribuyente%2Fperfil'
        + '&state=956332a7-6de0-48d7-8f53-a635625c30a5'
        + '&nonce=4c3d7ddb-c8f7-4227-8186-babb562e36b3'
        + '&response_mode=fragment&response_type=code&scope=openid',

    _enSri() {
        return typeof location !== 'undefined' && location.hostname.includes('sri.gob.ec');
    },

    _aviso(titulo, msg, duracion) {
        try {
            if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
                window.sriAssistant.showEliteToast({ title: titulo, msg: msg, duration: duracion || 4200 });
                return;
            }
        } catch (e) { /* sin toast: el log alcanza */ }
        if (typeof log !== 'undefined') log.debug('[EXPERIENCIA]', titulo, msg || '');
    },

    // ────────────────────────────────────────────────────────────────────────
    // Arranque
    // ────────────────────────────────────────────────────────────────────────

    async iniciar() {
        if (!this._enSri() || typeof document === 'undefined') return;
        if (this._tick) return;                       // idempotente
        try { if (typeof instalarEstilosSC === 'function') instalarEstilosSC(); } catch (e) {}

        this._inyectarEstilos();
        await this._cargarModo();
        await this._restaurarCorrida();

        // El HUD lo monta 07 cuando la extensión está despierta. Se espera sin
        // bloquear: el resto de la página sigue su curso.
        this._esperarHUD();
        this._escucharStorage();
        this._atajos();

        // Un tick por segundo sólo con la pestaña visible: un cronómetro que
        // corre en segundo plano gasta CPU para algo que nadie mira.
        this._tick = setInterval(() => {
            if (document.visibilityState === 'visible') this.pintar();
        }, 1000);

        this._quizasDormir();
    },

    _esperarHUD() {
        const intentar = () => {
            const hud = document.getElementById('sri-loop-hud');
            if (hud) { this._montarEnHUD(hud); return true; }
            return false;
        };
        if (intentar()) return;

        let vueltas = 0;
        const obs = new MutationObserver(() => {
            if (intentar() || ++vueltas > 120) {
                obs.disconnect();
                // Si el HUD nunca apareció, igual se puede ver el resumen: el
                // cronómetro no depende de él.
            }
        });
        try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    },

    // ────────────────────────────────────────────────────────────────────────
    // Estilos: modos + piezas nuevas
    // ────────────────────────────────────────────────────────────────────────

    _inyectarEstilos() {
        if (document.getElementById('sc-experiencia-css')) return;
        const st = document.createElement('style');
        st.id = 'sc-experiencia-css';
        st.textContent = `
      /* ── MODO LIMPIO ──────────────────────────────────────────────────────
         No es "esconder la extensión": es dejar a la vista sólo lo que se toca
         mientras se declara. El panel, la isla del login, la pestaña y el
         saludo vuelven solos al pasar a cockpit (o con el ojo). */
      html[data-sc-modo="limpio"] #sri-assistant-panel-root,
      html[data-sc-modo="limpio"] .sc-pestana,
      html[data-sc-modo="limpio"] #sri-dynamic-island,
      html[data-sc-modo="limpio"] #sri-island-minibar,
      html[data-sc-modo="limpio"] #sc-saludo,
      html[data-sc-modo="limpio"] #slh-cajon{
        display:none !important;
      }
      /* Todo lo secundario del HUD. Quedan: ▶ · estado · cliente/cronómetro ·
         🏁 · 🛑 · 👁 · 📋. */
      html[data-sc-modo="limpio"] #slh-paso,
      html[data-sc-modo="limpio"] #slh-aqui,
      html[data-sc-modo="limpio"] #slh-pdfs,
      html[data-sc-modo="limpio"] #slh-omitidos,
      html[data-sc-modo="limpio"] #slh-omitir,
      html[data-sc-modo="limpio"] #slh-cajon-btn,
      html[data-sc-modo="limpio"] #slh-registro,
      html[data-sc-modo="limpio"] #slh-migrar,
      html[data-sc-modo="limpio"] #slh-subida,
      html[data-sc-modo="limpio"] #slh-cola,
      html[data-sc-modo="limpio"] #slh-bitacora,
      html[data-sc-modo="limpio"] #slh-notas,
      html[data-sc-modo="limpio"] #slh-proveedores,
      html[data-sc-modo="limpio"] #slh-ir,
      html[data-sc-modo="limpio"] #slh-casilleros,
      html[data-sc-modo="limpio"] #slh-chequeo,
      html[data-sc-modo="limpio"] #slh-sincronizar,
      html[data-sc-modo="limpio"] #slh-probarclaves,
      html[data-sc-modo="limpio"] #slh-extractor,
      html[data-sc-modo="limpio"] #slh-auditoria,
      html[data-sc-modo="limpio"] #slh-panel,
      html[data-sc-modo="limpio"] #slh-periodo,
      html[data-sc-modo="limpio"] #slh-drag,
      html[data-sc-modo="limpio"] #sc-clientes{
        display:none !important;
      }
      /* Una sola fila, sólo en modo limpio: en cockpit el HUD tiene 20+
         botones y necesita envolver o se sale de la pantalla. */
      html[data-sc-modo="limpio"] #sri-loop-hud{
        flex-wrap:nowrap; max-width:calc(100vw - 36px); overflow-x:auto;
      }
      html[data-sc-modo="limpio"] #sri-loop-hud::-webkit-scrollbar{height:0}

      /* ── Piezas nuevas ─────────────────────────────────────────────────── */
      #sc-hud-caja{
        display:flex; align-items:center; gap:7px; min-width:0; max-width:250px;
        padding-left:2px;
      }
      #sc-avatar{
        width:26px;height:26px;flex:0 0 26px;border-radius:50%;
        display:grid;place-items:center;font-size:10px;font-weight:900;
        background:rgba(125,211,252,.14);border:1px solid rgba(125,211,252,.4);
        color:#7dd3fc;font-family:var(--sc-fuente,system-ui);letter-spacing:-.02em;
      }
      #sc-hud-txt{display:flex;flex-direction:column;line-height:1.2;min-width:0}
      #sc-nombre{
        font-size:11px;font-weight:800;color:var(--sc-txt,#d5e4fa);
        max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      }
      #sc-crono{
        font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--sc-suave,#94a3b8);
        white-space:nowrap;letter-spacing:.02em;
      }
      #sc-crono b{color:#7dd3fc;font-weight:800}
      #sc-dormido{
        display:none;font-size:9.5px;font-weight:900;letter-spacing:.04em;
        padding:2px 7px;border-radius:999px;white-space:nowrap;
        background:rgba(148,163,184,.14);color:#94a3b8;border:1px solid rgba(148,163,184,.3);
      }
      html[data-sc-dormido="si"] #sc-dormido{display:inline-flex}
      html[data-sc-dormido="si"] #sri-loop-hud{opacity:.72}
      #sc-modo[aria-pressed="true"],
      #sc-modo.sc-limpio{background:rgba(78,222,163,.18);color:#4edea3}
      #sc-resumen .sc-punto-nuevo{
        position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;
        background:#ffb95f;box-shadow:0 0 0 2px rgba(5,20,36,.9);
      }

      /* Popover: por encima del HUD, nunca empuja el layout. */
      .sc-pop{
        position:absolute;right:0;bottom:calc(100% + 8px);width:364px;
        max-height:min(62vh,420px);overflow:auto;
        padding:12px 13px;z-index:5;
      }
      .sc-pop::-webkit-scrollbar{width:7px}
      .sc-pop::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:8px}
      .sc-pop-cab{
        display:flex;align-items:center;justify-content:space-between;gap:8px;
        margin-bottom:9px;
      }
      .sc-fila-cli{
        display:flex;align-items:center;gap:8px;padding:6px 5px;
        border-radius:9px;cursor:pointer;border:1px solid transparent;
      }
      .sc-fila-cli:hover{background:rgba(125,211,252,.09);border-color:rgba(125,211,252,.25)}
      .sc-fila-cli .sc-nom{flex:1;min-width:0;font-size:11.5px;font-weight:700;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .sc-fila-cli .sc-sub{font-size:10px;color:var(--sc-tenue,#64748b);font-family:monospace}
      .sc-fila-cli .sc-min{font-size:10px;color:var(--sc-suave,#94a3b8);font-family:monospace;white-space:nowrap}
      .sc-barra-t{
        height:5px;border-radius:5px;overflow:hidden;background:rgba(148,163,184,.18);
      }
      .sc-barra-t>i{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#7dd3fc);transition:width .6s cubic-bezier(.22,1,.36,1)}
      .sc-buscador{
        width:100%;box-sizing:border-box;margin-bottom:7px;
        background:rgba(255,255,255,.05);border:1px solid var(--sc-borde,rgba(255,255,255,.14));
        border-radius:10px;padding:8px 10px;color:var(--sc-txt,#d5e4fa);
        font-family:var(--sc-fuente,system-ui);font-size:12px;outline:none;
      }
      .sc-buscador:focus{border-color:var(--sc-activo,#7dd3fc)}
      @media (prefers-reduced-motion: reduce){
        .sc-pop, .sc-barra-t>i{animation:none !important;transition:none !important}
      }
    `;
        (document.head || document.documentElement).appendChild(st);
    },

    // ────────────────────────────────────────────────────────────────────────
    // Modo de vista
    // ────────────────────────────────────────────────────────────────────────

    async _cargarModo() {
        let guardado = null;
        try {
            if (typeof SafeStorage !== 'undefined') guardado = (await SafeStorage.get([this._MODO]))[this._MODO];
        } catch (e) { /* sin almacén */ }
        this.aplicarModo(guardado === 'limpio' ? 'limpio' : 'cockpit', { persistir: false, avisar: false });
    },

    aplicarModo(modo, { persistir = true, avisar = true } = {}) {
        this._modo = (modo === 'limpio') ? 'limpio' : 'cockpit';
        try { document.documentElement.dataset.scModo = this._modo; } catch (e) { return; }

        const btn = document.getElementById('sc-modo');
        if (btn) {
            const limpio = this._modo === 'limpio';
            btn.textContent = limpio ? '👁' : '👁‍🗨';
            btn.classList.toggle('sc-limpio', limpio);
            btn.setAttribute('aria-pressed', limpio ? 'true' : 'false');
            btn.title = limpio
                ? 'Modo limpio: sólo lo esencial en pantalla. Clic para ver todo (Alt+Shift+M).'
                : 'Modo cockpit: todos los controles a la vista. Clic para dejar la pantalla limpia (Alt+Shift+M).';
            btn.style.background = limpio ? 'rgba(78,222,163,.18)' : 'rgba(148,163,184,.16)';
            btn.style.color = limpio ? '#4edea3' : '#cbd5e1';
        }

        if (persistir && typeof SafeStorage !== 'undefined') {
            SafeStorage.set({ [this._MODO]: this._modo }).catch(() => {});
        }
        if (avisar) {
            this._aviso(
                this._modo === 'limpio' ? '👁 Modo limpio' : '👁‍🗨 Modo cockpit',
                this._modo === 'limpio'
                    ? 'Quedan sólo estado, cliente, cronómetro, ▶ 🏁 🛑. El ojo te devuelve todo.'
                    : 'Todo a la vista: herramientas, período, omitidos y el resto.',
                4200
            );
        }
    },

    alternarModo() {
        this.aplicarModo(this._modo === 'limpio' ? 'cockpit' : 'limpio');
    },

    _atajos() {
        if (this._atajosListos) return;
        this._atajosListos = true;
        document.addEventListener('keydown', (ev) => {
            if (!ev.altKey || !ev.shiftKey) return;
            const k = String(ev.key || '').toLowerCase();
            if (k === 'm') { ev.preventDefault(); this.alternarModo(); }
            if (k === 't') { ev.preventDefault(); this.abrirResumen(); }
        });
    },

    // ────────────────────────────────────────────────────────────────────────
    // Montaje dentro del HUD
    // ────────────────────────────────────────────────────────────────────────

    _montarEnHUD(hud) {
        if (this._caja && document.body.contains(this._caja)) return;
        if (hud.querySelector('#sc-hud-caja')) { this._caja = hud.querySelector('#sc-hud-caja'); return; }

        const caja = document.createElement('span');
        caja.id = 'sc-hud-caja';
        caja.innerHTML = `
          <span id="sc-avatar" aria-hidden="true">··</span>
          <span id="sc-hud-txt">
            <b id="sc-nombre" title="Cliente en curso">Sin cliente</b>
            <span id="sc-crono" title="Tiempo de la corrida y estimación">⏱ sin datos</span>
          </span>
          <span id="sc-dormido" title=""></span>
        `;

        // Va justo después del bloque de estado: es el dato que se mira
        // mientras corre, y ahí queda al lado de «cliente 3 de 7».
        const detalle = hud.querySelector('#slh-detalle');
        const bloqueEstado = detalle ? detalle.closest('div') : null;

        const bModo = this._boton('sc-modo', '👁‍🗨', 'Modo de vista (Alt+Shift+M)', () => this.alternarModo());
        const bResumen = this._boton('sc-resumen', '📋', 'Resumen de la última corrida (Alt+Shift+T)', () => this.abrirResumen());
        const bClientes = this._boton('sc-clientes', '🧑', 'Buscar un cliente y entrar con uno solo', () => this.abrirClientes());

        if (bloqueEstado && bloqueEstado.parentElement === hud) {
            bloqueEstado.insertAdjacentElement('afterend', caja);
            let ancla = caja;
            [bClientes, bResumen, bModo].forEach((b) => {
                ancla.insertAdjacentElement('afterend', b);
                ancla = b;
            });
        } else {
            hud.appendChild(caja);
            hud.appendChild(bClientes);
            hud.appendChild(bModo);
            hud.appendChild(bResumen);
        }

        this._caja = caja;
        this.pintar();
    },

    _boton(id, texto, titulo, alClic) {
        const b = document.createElement('button');
        b.id = id;
        b.type = 'button';
        b.textContent = texto;
        b.title = titulo;
        b.setAttribute('aria-label', titulo);
        b.style.cssText = 'position:relative;border:none;border-radius:10px;padding:8px 10px;'
            + 'min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;'
            + 'font-weight:800;font-size:13px;cursor:pointer;background:rgba(148,163,184,0.16);color:#cbd5e1';
        b.addEventListener('click', (ev) => { ev.stopPropagation(); alClic(); });
        return b;
    },

    // ────────────────────────────────────────────────────────────────────────
    // Cronómetro
    // ────────────────────────────────────────────────────────────────────────

    _escucharStorage() {
        if (this._storageListo) return;
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
        this._storageListo = true;
        chrome.storage.onChanged.addListener((cambios, area) => {
            if (area !== 'local' || !cambios || !cambios.sc_loop) return;
            const nuevo = cambios.sc_loop.newValue || {};
            const viejo = cambios.sc_loop.oldValue || {};
            this._alCambiarLoop(nuevo, viejo).catch(() => {});
        });
    },

    /**
     * El semáforo (`sc_loop`) es la única fuente de verdad del avance, y ya
     * escribe `latido` en cada movimiento. De ahí sale todo el tiempo.
     */
    async _alCambiarLoop(nuevo, viejo) {
        const estaba = viejo.estado || 'DETENIDO';
        const esta = nuevo.estado || 'DETENIDO';
        const corriendo = esta === 'CORRIENDO';
        const enPausa = esta === 'PAUSADO' || esta === 'PAUSANDO';

        // ── arranque (o reanudación tras una recarga) ──
        if (corriendo && !this._corrida) {
            const marca = Number(nuevo.latido || Date.now());
            this._corrida = {
                inicio: marca, fin: null, pausaMs: 0, pausaDesde: null,
                clientes: [], motivo: '', _tCliente: Date.now()
            };
            this._ultimoIndice = Number(nuevo.indice || 0);
            // Se persiste para sobrevivir a una recarga en medio del lote.
            await this._persistir();
        } else if (corriendo && this._corrida && this._corrida.pausaDesde) {
            this._corrida.pausaMs += Date.now() - this._corrida.pausaDesde;
            this._corrida.pausaDesde = null;
            // El cliente en curso no paga el tiempo que estuvo en pausa.
            this._corrida._tCliente = Date.now();
        }

        // ── pausa ──
        if (enPausa && this._corrida && !this._corrida.pausaDesde) {
            this._corrida.pausaDesde = Date.now();
        }

        // ── avance de cliente ──
        const idx = Number(nuevo.indice || 0);
        if (this._corrida && corriendo && idx !== this._ultimoIndice) {
            const cola = nuevo.cola || [];
            const anterior = cola[this._ultimoIndice] || null;
            const ahora = Date.now();
            if (anterior) {
                // Reloj de pared, no `latido`: el latido lo escriben otros
                // caminos y puede venir corrido. Dos relojes distintos en la
                // misma tarjeta dan una cuenta que no cierra.
                this._corrida.clientes.push({
                    ruc: anterior.ruc || '',
                    nombre: anterior.name || anterior.nombre || anterior.ruc || 'Cliente',
                    ms: Math.max(0, ahora - Number(this._corrida._tCliente || this._corrida.inicio))
                });
            }
            this._corrida._tCliente = ahora;
            this._ultimoIndice = idx;
            await this._persistir();
        }

        // ── fin ──
        if (!corriendo && !enPausa && (estaba === 'CORRIENDO' || estaba === 'PAUSANDO' || estaba === 'PAUSADO')) {
            await this._finalizar(nuevo.motivo || '');
        }

        this.pintar();
    },

    async _finalizar(motivo) {
        const c = this._corrida;
        if (!c || !c.inicio) return;
        const fin = Date.now();
        const pausa = (c.pausaMs || 0) + (c.pausaDesde ? fin - c.pausaDesde : 0);
        const resumen = {
            inicio: c.inicio,
            fin: fin,
            pausaMs: pausa,
            clientes: c.clientes || [],
            motivo: motivo || '',
            totalMs: Math.max(0, fin - c.inicio - pausa),
            hechos: (c.clientes || []).length
        };

        this._corrida = null;
        this._ultimoIndice = 0;
        this._ultima = resumen;
        await this._persistir(resumen);

        // Un resumen que aparece solo es útil si no molesta: se abre el panel
        // y queda ahí hasta que se cierre. No es un modal ni bloquea el portal.
        this._resumenNuevo = true;
        const b = document.getElementById('sc-resumen');
        if (b && !b.querySelector('.sc-punto-nuevo')) {
            const p = document.createElement('span');
            p.className = 'sc-punto-nuevo';
            b.appendChild(p);
        }
        if (resumen.hechos > 0) {
            this._aviso('📋 Corrida terminada',
                `${resumen.hechos} cliente(s) · ${this.formato(resumen.totalMs)}${motivo ? ' · ' + motivo : ''}`, 7000);
            this.abrirResumen();
        }
    },

    /**
     * Guarda lo que hay que guardar: la corrida viva para poder retomarla, o el
     * resumen cerrado para poder leerlo después. Nunca lanza: un cronómetro no
     * puede tumbar un lote que está declarando.
     */
    async _persistir(resumen) {
        if (typeof SafeStorage === 'undefined') return;
        try {
            if (resumen) {
                await SafeStorage.set({ [this._CORRIDA]: resumen });
                const hist = ((await SafeStorage.get([this._HISTORIAL]))[this._HISTORIAL] || []).slice(-9);
                // Dos pestañas del SRI mirando el mismo lote cierran a la vez:
                // se guarda una sola vez el mismo arranque.
                const repetido = hist.some((h) => h && h.inicio === resumen.inicio
                    && Math.abs((h.fin || 0) - resumen.fin) < 5000);
                if (!repetido) hist.push(resumen);
                await SafeStorage.set({ [this._HISTORIAL]: hist });
                return;
            }
            const c = this._corrida;
            if (!c) return;
            await SafeStorage.set({ [this._CORRIDA]: {
                inicio: c.inicio, pausaMs: c.pausaMs, pausaDesde: c.pausaDesde,
                clientes: c.clientes, _tCliente: c._tCliente || null, motivo: ''
            } });
        } catch (e) { /* sin cronómetro, pero el lote sigue */ }
    },

    async _restaurarCorrida() {
        if (typeof SafeStorage === 'undefined') return;
        try {
            const st = await SafeStorage.get([this._CORRIDA, this._HISTORIAL]);
            const c = st[this._CORRIDA];
            const hist = st[this._HISTORIAL] || [];

            if (c && c.inicio && c.fin) this._ultima = c;
            else if (!c && hist.length) this._ultima = hist[hist.length - 1];

            if (!c || !c.inicio || c.fin) return;

            // Corrida viva: si el semáforo sigue en CORRIENDO, se retoma con el
            // tiempo ya transcurrido (una recarga no reinicia el reloj).
            const loop = (typeof SriLoop !== 'undefined') ? await SriLoop.get() : null;
            if (loop && loop.estado === 'CORRIENDO') {
                this._corrida = {
                    inicio: c.inicio, fin: null, pausaMs: c.pausaMs || 0,
                    pausaDesde: c.pausaDesde || null, clientes: c.clientes || [],
                    _tCliente: Date.now(), motivo: ''
                };
                this._ultimoIndice = Number(loop.indice || 0);
            }
        } catch (e) { /* sin historial */ }
    },

    /** mm:ss · h:mm:ss. Nunca "00:00" cuando no hay dato: se dice sin datos. */
    formato(ms) {
        if (ms === null || ms === undefined || !isFinite(ms) || ms < 0) return '—';
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const seg = s % 60;
        const dos = (n) => String(n).padStart(2, '0');
        return h ? `${h}:${dos(m)}:${dos(seg)}` : `${m}:${dos(seg)}`;
    },

    _transcurrido() {
        if (!this._corrida || !this._corrida.inicio) return null;
        const ahora = Date.now();
        const pausa = (this._corrida.pausaMs || 0)
            + (this._corrida.pausaDesde ? ahora - this._corrida.pausaDesde : 0);
        return Math.max(0, ahora - this._corrida.inicio - pausa);
    },

    // ────────────────────────────────────────────────────────────────────────
    // Pintado
    // ────────────────────────────────────────────────────────────────────────

    async pintar() {
        const nombreEl = document.getElementById('sc-nombre');
        const cronoEl = document.getElementById('sc-crono');
        if (!nombreEl || !cronoEl) return;

        let loop = null;
        try { loop = (typeof SriLoop !== 'undefined') ? await SriLoop.get() : null; } catch (e) { loop = null; }

        const total = loop ? (loop.cola || []).length : 0;
        const idx = loop ? Math.min(Number(loop.indice || 0), Math.max(0, total - 1)) : 0;
        const actual = (loop && loop.cola && loop.cola[idx]) ? loop.cola[idx] : null;
        const nombre = actual ? (actual.name || actual.nombre || actual.rcu || actual.ruc || '') : '';

        if (nombre && nombre !== this._ultimoNombre) {
            this._ultimoNombre = nombre;
            nombreEl.textContent = this._corto(nombre, 26);
            nombreEl.title = nombre;
            const av = document.getElementById('sc-avatar');
            if (av) av.textContent = this._iniciales(nombre);
            nombreEl.classList.remove('slh-salta');
            void nombreEl.offsetWidth;
            nombreEl.classList.add('slh-salta');
        } else if (!nombre && this._ultimoNombre) {
            this._ultimoNombre = '';
            nombreEl.textContent = 'Sin cliente';
            nombreEl.title = '';
            const av = document.getElementById('sc-avatar');
            if (av) av.textContent = '··';
        }

        const corriendo = loop && (loop.estado === 'CORRIENDO' || loop.estado === 'PAUSANDO' || loop.estado === 'PAUSADO');
        const transcurrido = this._transcurrido();

        // El lanzador de clientes es para *entrar* a un cliente, no para
        // estarlo declarando. En el formulario de IVA sobra: ahí ya se está
        // adentro de uno. Vuelve solo al salir del formulario.
        const bCli = document.getElementById('sc-clientes');
        if (bCli) {
            const enFormulario = (typeof estaEnFormularioIva === 'function') && estaEnFormularioIva();
            bCli.style.display = enFormulario ? 'none' : '';
        }

        if (corriendo && transcurrido !== null) {
            const pausado = loop.estado === 'PAUSADO' || loop.estado === 'PAUSANDO';
            const hechos = (this._corrida && this._corrida.clientes) ? this._corrida.clientes.length : Number(loop.indice || 0);
            const prom = hechos > 0 ? (transcurrido / hechos) : 0;
            const faltan = Math.max(0, total - Number(loop.indice || 0) - 1);
            const eta = prom > 0 ? prom * faltan : 0;
            cronoEl.innerHTML = pausado
                ? `⏸ <b>${this.formato(transcurrido)}</b> en pausa`
                : `⏱ <b>${this.formato(transcurrido)}</b>${prom ? ` · ≈${this.formato(eta)}` : ''}`;
            cronoEl.title = `Corrida en curso desde ${this._hora(this._corrida ? this._corrida.inicio : null)}.`
                + (prom ? ` ${this.formato(prom)} por cliente en promedio; quedarían ≈${this.formato(eta)}.` : '');
        } else if (this._ultima) {
            const u = this._ultima;
            cronoEl.innerHTML = `⏱ última <b>${this.formato(u.totalMs)}</b> · ${u.hechos || 0} cli`;
            cronoEl.title = `Última corrida: ${this._hora(u.inicio)} → ${this._hora(u.fin)}${u.motivo ? ' · ' + u.motivo : ''}`;
        } else {
            cronoEl.textContent = '⏱ sin datos';
            cronoEl.title = 'Todavía no hay una corrida medida en este navegador.';
        }
    },

    _corto(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; },

    _iniciales(nombre) {
        const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
        if (!partes.length) return '··';
        const a = partes[0][0] || '';
        const b = partes.length > 1 ? partes[partes.length - 1][0] : '';
        return (a + b).toUpperCase();
    },

    _hora(ts) {
        if (!ts) return '—';
        try { return new Date(ts).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return '—'; }
    },

    // ────────────────────────────────────────────────────────────────────────
    // Popovers
    // ────────────────────────────────────────────────────────────────────────

    _cerrarPop() {
        if (this._pop) { this._pop.remove(); this._pop = null; }
        if (this._clicFuera) {
            document.removeEventListener('click', this._clicFuera, true);
            this._clicFuera = null;
        }
    },

    _abrirPop(html, { ancho } = {}) {
        const hud = document.getElementById('sri-loop-hud');
        if (!hud) return null;
        this._cerrarPop();
        const pop = document.createElement('div');
        pop.className = 'sc-pop sc-panel';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Panel de la suite: resumen y clientes');
        if (ancho) pop.style.width = ancho + 'px';
        pop.innerHTML = html;
        hud.appendChild(pop);
        this._pop = pop;

        // Cerrar al hacer clic afuera, sin robar el clic del portal.
        this._clicFuera = (ev) => { if (!pop.contains(ev.target) && !hud.contains(ev.target)) this._cerrarPop(); };
        setTimeout(() => document.addEventListener('click', this._clicFuera, true), 0);
        return pop;
    },

    async abrirResumen() {
        if (this._pop) { this._cerrarPop(); return; }

        const b = document.getElementById('sc-resumen');
        if (b) { const p = b.querySelector('.sc-punto-nuevo'); if (p) p.remove(); }
        this._resumenNuevo = false;

        let ultima = this._ultima;
        if (!ultima && typeof SafeStorage !== 'undefined') {
            try { ultima = (await SafeStorage.get([this._CORRIDA]))[this._CORRIDA]; } catch (e) {}
        }

        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t == null ? '' : t)) : String(t == null ? '' : t));

        if (!ultima || !ultima.inicio) {
            this._abrirPop(`
              <div class="sc-pop-cab">
                <b style="font-size:12px;letter-spacing:.04em">RESUMEN DE LA CORRIDA</b>
                <button class="sc-btn sc-btn--sm sc-btn--fantasma" data-cerrar>Cerrar ✕</button>
              </div>
              <div style="font-size:11.5px;color:var(--sc-suave);line-height:1.5">
                Todavía no hay ninguna corrida medida. El cronómetro arranca cuando el
                semáforo pasa a <b>CORRIENDO</b> y cierra cuando vuelve a <b>DETENIDO</b>.
                Si una corrida ya estaba en marcha cuando se abrió esta pestaña, el
                tiempo se cuenta desde el último latido guardado.
              </div>`);
            this._engancharCierre();
            return;
        }

        const totalMs = ultima.totalMs || (ultima.fin ? (ultima.fin - ultima.inicio - (ultima.pausaMs || 0)) : 0);
        const hechos = (ultima.clientes || []).length;
        const prom = hechos ? totalMs / hechos : 0;
        const filas = (ultima.clientes || []).map((c) => `
            <div class="sc-fila-cli" style="cursor:default">
              <span style="width:6px;height:6px;border-radius:50%;background:#4ade80;flex:0 0 6px"></span>
              <span class="sc-nom" title="${esc(c.nombre || c.ruc)}">${esc(c.nombre || c.ruc)}</span>
              <span class="sc-min">${this.formato(c.ms)}</span>
            </div>`).join('') || '<div style="font-size:11px;color:var(--sc-tenue)">No se registró ningún cliente terminado.</div>';

        this._abrirPop(`
          <div class="sc-pop-cab">
            <div>
              <b style="font-size:12px;letter-spacing:.04em">ÚLTIMA CORRIDA</b>
              <div style="font-size:10px;color:var(--sc-tenue);font-family:monospace">
                ${this._fechaHora(ultima.inicio)} → ${this._fechaHora(ultima.fin)}
              </div>
            </div>
            <button class="sc-btn sc-btn--sm sc-btn--fantasma" data-cerrar>Cerrar ✕</button>
          </div>

          <div style="display:flex;align-items:baseline;gap:10px;margin:2px 0 10px">
            <div style="font-size:26px;font-weight:900;letter-spacing:-.02em">${this.formato(totalMs)}</div>
            <div style="font-size:10.5px;color:var(--sc-suave);line-height:1.35">
              <div><b>${hechos}</b> cliente(s) · promedio <b>${this.formato(prom)}</b></div>
              <div style="color:var(--sc-tenue)">${ultima.motivo ? esc(ultima.motivo) : 'Terminó sin motivo registrado'}</div>
            </div>
          </div>

          <div class="${ultima.fin ? 'sc-barra-t' : 'sc-barra-t'}" style="margin-bottom:10px">
            <i style="width:${ultima.fin ? '100%' : '62%'}"></i>
          </div>

          <div class="sc-rotulo" style="margin:2px 0 4px">Por cliente</div>
          ${filas}
        `);
        this._engancharCierre();
    },

    _fechaHora(ts) {
        if (!ts) return '—';
        try {
            return new Date(ts).toLocaleString('es-EC', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            });
        } catch (e) { return this._hora(ts); }
    },

    _engancharCierre() {
        if (!this._pop) return;
        this._pop.querySelectorAll('[data-cerrar]').forEach((b) =>
            b.addEventListener('click', (ev) => { ev.stopPropagation(); this._cerrarPop(); }));
    },

    // ────────────────────────────────────────────────────────────────────────
    // Lanzador de clientes (entrar a uno solo)
    // ────────────────────────────────────────────────────────────────────────

    async abrirClientes() {
        if (this._pop) { this._cerrarPop(); return; }

        const loop = (typeof SriLoop !== 'undefined') ? await SriLoop.get() : { estado: 'DETENIDO' };
        if (loop.estado === 'CORRIENDO' || loop.estado === 'PAUSANDO') {
            this._aviso('▶ El lote está corriendo', 'Para entrar a un cliente suelto primero pausá o detené el lote.', 5000);
            return;
        }

        let cache = [];
        try { cache = (await SafeStorage.get(['sc_clients_cache'])).sc_clients_cache || []; } catch (e) { cache = []; }
        cache = cache.filter((c) => c && c.ruc && !(c.isDeleted || c.is_deleted));

        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));
        const filas = cache.map((c) => `
            <div class="sc-fila-cli" data-ruc="${esc(c.ruc)}" role="button" tabindex="0"
                 title="Entrar al SRI con ${esc(c.name || c.ruc)} y declararlo">
              <span class="sc-nom">${esc(c.name || 'Cliente sin nombre')}</span>
              <span class="sc-sub">${esc(c.ruc)}</span>
              <span class="sc-min" style="color:${c.password ? '#4ade80' : '#f87171'}">${c.password ? '▶' : 'sin clave'}</span>
            </div>`).join('') || '<div style="font-size:11px;color:var(--sc-tenue);padding:6px 2px">No hay clientes en la caché local. Sincronizá desde la web o el popup.</div>';

        this._abrirPop(`
          <div class="sc-pop-cab">
            <div>
              <b style="font-size:12px;letter-spacing:.04em">ENTRAR A UN CLIENTE</b>
              <div style="font-size:10px;color:var(--sc-tenue)">Arranca una corrida de uno solo · ${cache.length} en la cartera</div>
            </div>
            <button class="sc-btn sc-btn--sm sc-btn--fantasma" data-cerrar>Cerrar ✕</button>
          </div>
          <input id="sc-buscar-cli" class="sc-buscador" type="search" placeholder="Buscar por nombre o RUC…" autocomplete="off">
          <div id="sc-lista-cli" style="max-height:260px;overflow:auto">${filas}</div>
        `);
        this._engancharCierre();

        const input = this._pop.querySelector('#sc-buscar-cli');
        const lista = this._pop.querySelector('#sc-lista-cli');
        if (input && lista) {
            input.addEventListener('input', () => {
                const q = input.value.trim().toLowerCase();
                lista.querySelectorAll('.sc-fila-cli').forEach((f) => {
                    const txt = (f.textContent || '').toLowerCase();
                    f.style.display = (!q || txt.includes(q)) ? '' : 'none';
                });
            });
            input.focus();
        }
        if (lista) {
            lista.addEventListener('click', (ev) => {
                const fila = ev.target.closest('.sc-fila-cli');
                if (!fila) return;
                this._arrancarCliente(fila.getAttribute('data-ruc'));
            });
            lista.addEventListener('keydown', (ev) => {
                if (ev.key !== 'Enter') return;
                const fila = ev.target.closest('.sc-fila-cli');
                if (fila) this._arrancarCliente(fila.getAttribute('data-ruc'));
            });
        }
    },

    /**
     * Un solo cliente, mismo contrato que el popup (`arrancarMotor` sin lote).
     * Se escribe exactamente lo que el content script espera al llegar al
     * login: pending_sri_autofill + pendingAction + el semáforo en DETENIDO.
     */
    async _arrancarCliente(ruc) {
        ruc = String(ruc || '').trim();
        if (!ruc) return;
        let cache = [];
        try { cache = (await SafeStorage.get(['sc_clients_cache'])).sc_clients_cache || []; } catch (e) {}
        const c = cache.find((x) => x && String(x.ruc) === ruc);
        if (!c) { this._aviso('⚠️ No encontré ese cliente', 'Sincronizá la cartera y volvé a intentar.', 5000); return; }
        if (!c.password) { this._aviso('🔑 Sin clave SRI', `${c.name || ruc} no tiene clave cargada. Cargala en el popup (menú ⋯).`, 6000); return; }

        let periodo = null;
        try { periodo = (typeof SriLoop !== 'undefined' && SriLoop.resolverPeriodoObjetivo) ? await SriLoop.resolverPeriodoObjetivo() : null; } catch (e) {}
        if (!periodo) {
            const hoy = new Date();
            periodo = { year: hoy.getFullYear(), monthIndex: (hoy.getMonth() + 11) % 12 };
        }

        this._cerrarPop();
        try {
            await SafeStorage.set({
                pending_sri_autofill: {
                    ruc: c.ruc, password: c.password, name: c.name || c.ruc,
                    timestamp: Date.now(), manual: true, isBatch: false
                },
                auto_batch_enabled: false,
                auto_batch_queue: [],
                auto_batch_index: 0,
                auto_batch_period: periodo,
                sri_target_period: periodo,
                sri_period_order: null,
                sc_loop: { estado: 'DETENIDO', cola: [], indice: 0, motivo: 'Cliente suelto desde el lanzador del HUD' },
                pendingAction: 'verifyProfile',
                workflowPeriod: periodo,
                actionTimestamp: Date.now(),
                sri_master_switch_on: true,
                sriAutomationPaused: false,
                ghost_manual_mode: false,
                autoDeclaration: true,
                sri_auto_mode: true
            });
        } catch (e) {
            this._aviso('⚠️ No se pudo preparar la corrida', String(e && e.message ? e.message : e), 6000);
            return;
        }

        this._aviso('🚀 Entrando', `${c.name || c.ruc} · ${periodo.year}-${String(periodo.monthIndex + 1).padStart(2, '0')}`, 3000);
        location.href = this._URL_LOGIN;
    },

    // ────────────────────────────────────────────────────────────────────────
    // Dormido: perfil sin IVA o ya declarado
    // ────────────────────────────────────────────────────────────────────────

    async _quizasDormir() {
        if (!location.href.includes('/contribuyente/perfil')) return;
        if (typeof SriLoopHUD === 'undefined' || !SriLoopHUD.veredictoDelPerfil) return;
        await new Promise((r) => setTimeout(r, 2500));
        let v = null;
        try { v = await SriLoopHUD.veredictoDelPerfil({ esperarMs: 6000 }); } catch (e) { return; }
        if (!v) return;

        if (v.veredicto === 'no_declara_iva' || v.veredicto === 'ya_declarada') {
            this._dormido = true;
            try { document.documentElement.dataset.scDormido = 'si'; } catch (e) {}
            const chip = document.getElementById('sc-dormido');
            if (chip) {
                chip.textContent = v.veredicto === 'no_declara_iva' ? '💤 SIN IVA' : '💤 YA DECLARADA';
                chip.title = v.motivo || '';
            }
            if (typeof log !== 'undefined') {
                log.debug(`💤 [EXPERIENCIA] Perfil dormido: ${v.veredicto} — ${v.motivo || ''}`);
            }
        }
    }
};

if (typeof window !== 'undefined') {
    window.SriExperiencia = SriExperiencia;
}

// Arranca solo en el SRI. En cualquier otro sitio (o en los bancos de prueba,
// que corren en 127.0.0.1) no hace absolutamente nada.
if (typeof document !== 'undefined' && typeof location !== 'undefined' && location.hostname.includes('sri.gob.ec')) {
    const arrancarExperiencia = () => {
        SriExperiencia.iniciar().catch((e) => {
            if (typeof log !== 'undefined') log.warn('⚠️ [EXPERIENCIA] No arrancó:', e && e.message);
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancarExperiencia);
    else arrancarExperiencia();
}
