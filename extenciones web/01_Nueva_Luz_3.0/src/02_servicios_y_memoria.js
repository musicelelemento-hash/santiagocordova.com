const SafeStorage = {
    async get(keys) {
        try {
            return await chrome.storage.local.get(keys);
        } catch (e) {
            if (e.message.includes('context invalidated')) {
                this.handleDisconnection();
            }
            throw e;
        }
    },
    async set(items) {
        try {
            return await chrome.storage.local.set(items);
        } catch (e) {
            if (e.message.includes('context invalidated')) {
                this.handleDisconnection();
            }
            throw e;
        }
    },
    async remove(keys) {
        try {
            return await chrome.storage.local.remove(keys);
        } catch (e) {
            if (e.message.includes('context invalidated')) {
                this.handleDisconnection();
            }
            throw e;
        }
    },
    handleDisconnection() {
        console.error('🛑 [CRITICO] La extensión se ha desconectado o actualizado.');
        const overlay = document.createElement('div');
        overlay.id = 'sri-disconnection-overlay';
        overlay.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999999; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; text-align: center; padding: 20px;">
                <div style="font-size: 50px; margin-bottom: 20px;">🛡️</div>
                <h1 style="margin: 0; font-size: 24px;">Extensión Actualizada</h1>
                <p style="margin: 15px 0; font-size: 16px; max-width: 400px; color: #cbd5e1;">La extensión se ha actualizado o reiniciado. Para continuar con el proceso de extracción o navegación sin errores:</p>
                <div style="display: flex; gap: 15px; margin-top: 10px;">
                    <button onclick="window.location.reload()" style="background: #4f46e5; color: white; border: none; padding: 12px 25px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 15px; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);">🔄 RECARGAR PÁGINA</button>
                    <button onclick="document.getElementById('sri-disconnection-overlay').remove()" style="background: #334155; color: white; border: none; padding: 12px 25px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 15px;">🔓 DESCONGELAR</button>
                </div>
            </div>
        `;
        if (!document.getElementById('sri-disconnection-overlay')) {
            document.body.appendChild(overlay);
        }
    }
};

const SriLoop = {
    _KEY: 'sc_loop',
    // paso: el lote frena solo al empezar cada fase, hasta que se pulse ▶.
    // ultimaFase: contra qué se compara para saber que la fase cambió.
    _DEF: { estado: 'DETENIDO', cola: [], indice: 0, periodo: null, latido: 0, motivo: '',
            paso: false, ultimaFase: '' },
    TIMEOUT_LATIDO_MS: 15 * 60 * 1000,

    async get() {
        try {
            const r = await SafeStorage.get([this._KEY]);
            return Object.assign({}, this._DEF, r[this._KEY] || {});
        } catch (e) {
            return Object.assign({}, this._DEF);
        }
    },

    async _set(patch) {
        const previo = await this.get();
        const nuevo = Object.assign({}, previo, patch);

        // Traza de transiciones: si algo apaga el bucle sin que se lo pidan,
        // acá queda quién fue. Sin esto es imposible perseguir un apagón.
        if (patch.estado && patch.estado !== previo.estado) {
            let quien = '';
            try {
                const pila = (new Error().stack || '').split('\n').slice(2, 5)
                    .map((l) => l.trim().replace(/^at\s+/, '').split(' ')[0])
                    .filter((x) => x && x !== 'async').join(' ← ');
                quien = pila ? `  [${pila}]` : '';
            } catch (e) { /* sin pila */ }
            console.log(`🚦 [BUCLE] ${previo.estado} → ${nuevo.estado}${nuevo.motivo ? ' · ' + nuevo.motivo : ''}${quien}`);
            anotarBitacora(`semáforo ${previo.estado}→${nuevo.estado}`, nuevo.motivo || '');
        }

        await SafeStorage.set({ [this._KEY]: nuevo });
        return nuevo;
    },

    /**
     * ÚNICA AUTORIDAD. Todo paso automático pregunta acá primero.
     * Si devuelve false, no se toca nada del portal.
     */
    async puedeAvanzar() {
        const e = await this.get();
        if (e.estado !== 'CORRIENDO') return false;
        if (e.latido && Date.now() - e.latido > this.TIMEOUT_LATIDO_MS) {
            console.warn('🐕 [WATCHDOG] Sin avance en 15 min. Deteniendo el lote por seguridad.');
            await this.detener('Sin avance por más de 15 minutos');
            return false;
        }
        return true;
    },

    async latir() {
        const e = await this.get();
        if (e.estado === 'CORRIENDO') await this._set({ latido: Date.now() });
    },

    async iniciar(cola, periodo, indice = 0) {
        console.log(`▶️ [BUCLE] Iniciando lote: ${cola.length} clientes.`);
        await this._set({ estado: 'CORRIENDO', cola, indice, periodo, latido: Date.now(), motivo: '' });
        await this._sincronizarLegado(true);
    },

    /**
     * @param {string} faseAhora fase en la que se reanuda. En modo paso hay que
     *   guardarla: si no, el primer repintado ve «cambió» contra una fase vieja
     *   y vuelve a frenar sin que el bot haya hecho nada.
     */
    async reanudar(faseAhora = null) {
        console.log('▶️ [BUCLE] Reanudando.');
        const patch = { estado: 'CORRIENDO', latido: Date.now(), motivo: '' };
        if (faseAhora) patch.ultimaFase = faseAhora;
        await this._set(patch);
        await this._sincronizarLegado(true);
    },

    /** Enciende o apaga el modo paso a paso. Devuelve cómo quedó. */
    async alternarPaso(faseAhora = null) {
        const e = await this.get();
        const paso = !e.paso;
        const patch = { paso };
        if (paso && faseAhora) patch.ultimaFase = faseAhora;
        await this._set(patch);
        console.log(paso
            ? '👣 [BUCLE] Modo paso a paso: el lote frena al empezar cada fase.'
            : '🏃 [BUCLE] Modo corrido: el lote avanza sin parar.');
        anotarBitacora(paso ? 'modo paso a paso' : 'modo corrido', '');
        return paso;
    },

    /**
     * En modo paso, frena cuando la fase cambió.
     *
     * Frenar es siempre seguro: puedeAvanzar() es la única autoridad y con el
     * semáforo en PAUSADO nada toca el portal. Lo peor que puede pasar es
     * parar en un momento poco elegante, nunca en uno peligroso.
     *
     * @returns {Promise<string|null>} la fase en la que frenó, o null.
     */
    async frenarSiCambioLaFase(faseAhora) {
        if (!faseAhora) return null;
        const e = await this.get();
        if (!e.paso || e.estado !== 'CORRIENDO') return null;
        if (faseAhora === e.ultimaFase) return null;

        await this._set({ estado: 'PAUSADO', ultimaFase: faseAhora,
                          motivo: 'Modo paso a paso' });
        await this._sincronizarLegado(false);
        console.log(`👣 [PASO] Llegó a «${faseAhora}». Freno acá: pulsá ▶ para dar el paso.`);
        return faseAhora;
    },

    /**
     * Mueve el puntero al cliente indicado. Lo llama handleBatchNextClient al
     * saltar, para que el contador del HUD (cliente N/M) siga la realidad.
     */
    async avanzarIndice(indice) {
        const e = await this.get();
        if (e.estado !== 'CORRIENDO') return;
        await this._set({ indice, latido: Date.now() });
        console.log(`🚦 [BUCLE] Avanzando a cliente ${indice + 1}/${(e.cola || []).length}.`);
    },

    /** Pausa suave: termina el cliente en curso y NO salta al siguiente. */
    async pausar() {
        const e = await this.get();
        if (e.estado !== 'CORRIENDO') return;
        console.log('⏸️ [BUCLE] Pausa pedida: se terminará el cliente actual y ahí para.');
        await this._set({ estado: 'PAUSANDO', motivo: 'Pausa pedida por el usuario' });
        if (typeof window !== 'undefined' && window.sriAssistant?.showEliteToast) {
            window.sriAssistant.showEliteToast({
                title: '⏸️ Pausa pedida',
                msg: 'Se termina el cliente actual y ahí para. Para cortar ya mismo usá 🛑.',
                duration: 7000
            });
        }
    },

    /**
     * Corte inmediato: no se da un paso más, aunque quede algo a medias.
     *
     * El único que llama acá es el botón 🛑 del HUD. Se dice en el log porque
     * leyendo una corrida larga, un «PARADA DE EMERGENCIA» suelto parece una
     * falla del bot cuando en realidad es alguien apretando el botón.
     */
    async emergencia(quien = 'el botón 🛑 del panel') {
        console.warn(`🛑 [BUCLE] PARADA DE EMERGENCIA, pedida por ${quien}. No es una falla: el lote se cortó a mano.`);
        if (typeof anotarBitacora === 'function') anotarBitacora('🛑 parada de emergencia', quien);
        await this._set({ estado: 'DETENIDO', motivo: `Parada de emergencia (${quien})` });
        await this._sincronizarLegado(false);
    },

    async detener(motivo = '') {
        console.log('⏹️ [BUCLE] Detenido.', motivo);
        await this._set({ estado: 'DETENIDO', cola: [], indice: 0, motivo });
        await this._sincronizarLegado(false);
    },

    /** Marca que el cliente actual terminó. Devuelve true si hay que frenar. */
    async debeFrenarTrasCliente() {
        const e = await this.get();
        if (e.estado === 'PAUSANDO') {
            await this._set({ estado: 'PAUSADO' });
            await this._sincronizarLegado(false);
            console.log('⏸️ [BUCLE] Cliente terminado. Lote en pausa: no se salta al siguiente.');
            return true;
        }
        return e.estado !== 'CORRIENDO';
    },

    async avanzarA(indice) {
        await this._set({ indice, latido: Date.now() });
    },

    /**
     * Normaliza el estado la primera vez que corre la versión con semáforo.
     *
     * Antes del semáforo, las banderas sueltas quedaban encendidas en
     * chrome.storage para siempre. Al recargar cualquier página del SRI eso
     * disparaba un "lote fantasma" sin sesión, que chocaba contra el login y
     * moría. Si encontramos ese estado viejo, lo apagamos todo.
     */
    async normalizarEstadoInicial() {
        try {
            const r = await SafeStorage.get([
                this._KEY, 'auto_batch_enabled', 'sri_auto_mode',
                'autoDeclaration', 'sri_master_switch_on'
            ]);
            if (r[this._KEY]) return false;   // ya migrado

            const basura = !!(r.auto_batch_enabled || r.sri_auto_mode ||
                              r.autoDeclaration || r.sri_master_switch_on);
            if (basura) {
                console.warn('🧹 [BUCLE] Estado viejo encendido sin semáforo. Se apaga todo por seguridad; usá ▶ para arrancar.');
            }
            await this.detener(basura ? 'Estado viejo normalizado' : '');
            return basura;
        } catch (e) {
            console.warn('No se pudo normalizar el estado inicial:', e);
            return false;
        }
    },

    /**
     * Purga TODO el estado de automatización. Deja intactos los clientes
     * (sc_clients_cache) y el token. Pensado para el usuario:
     *     window.sriLimpiarEstado()
     */
    async limpiarEstado() {
        const CLAVES = [
            this._KEY, 'pendingAction', 'actionTimestamp', 'workflowPeriod',
            'pending_sri_autofill', 'auto_batch_enabled', 'auto_batch_queue',
            'auto_batch_index', 'auto_batch_period', 'auto_batch_mode',
            'sri_auto_mode', 'autoDeclaration', 'sriAutomationPaused',
            'sri_master_switch_on', 'ghost_manual_mode', 'declaration_synced_flag',
            'iva_sin_ubicar',
            'summary_page_clicked', 'turboMode', 'checkFacturas', 'checkRetenciones',
            'checkNC', 'skipSafetyCheck', 'sri_diagnostico_resumen',
            'sri_verificacion_sello', 'sri_obligacion_actual'
        ];
        const antes = await SafeStorage.get(null);
        const habia = CLAVES.filter((k) => k in antes);
        await SafeStorage.remove(CLAVES);
        if (typeof GhostMemory !== 'undefined' && GhostMemory.clearCurrent) {
            await GhostMemory.clearCurrent().catch(() => {});
        }
        await this.detener('Estado limpiado a mano');
        console.log(`🧹 [BUCLE] Estado limpiado. Se borraron ${habia.length} claves:`, habia);
        console.log('   Los clientes y sus claves NO se tocaron.');
        return habia;
    },

    /** Clave del registro local para un contribuyente y periodo. */
    _claveDecl(ruc, periodo) {
        const p = `${periodo.year}-${String(periodo.monthIndex + 1).padStart(2, '0')}`;
        return `${ruc}|${p}`;
    },

    /**
     * Deja constancia de que ESTE contribuyente ya declaró ESTE periodo.
     * Se llama en cuanto el SRI confirma el envío, antes de intentar subir nada.
     */
    async marcarDeclarado(ruc, periodo, extra = {}) {
        if (!ruc || !periodo) return;
        const r = await SafeStorage.get(['sc_declaraciones_locales']);
        const reg = r.sc_declaraciones_locales || {};
        const clave = this._claveDecl(ruc, periodo);

        reg[clave] = {
            ruc,
            periodo: `${periodo.year}-${String(periodo.monthIndex + 1).padStart(2, '0')}`,
            cuando: Date.now(),
            nombre: extra.nombre || '',
            cep: extra.cep || '',
            pdfSubido: !!extra.pdfSubido
        };
        await SafeStorage.set({ sc_declaraciones_locales: reg });
        console.log(`🧾 [REGISTRO] ${extra.nombre || ruc} declaró ${reg[clave].periodo}. No se volverá a declarar.`);
        anotarBitacora('DECLARADA', `${extra.nombre || ruc} · ${reg[clave].periodo}`);
    },

    /** ¿Ya declaramos a este contribuyente en este periodo? */
    /** La entrada del registro local, con su estado de PDF. null si no declaró. */
    async declaracionLocal(ruc, periodo) {
        const r = await SafeStorage.get(['sc_declaraciones_locales']);
        return (r.sc_declaraciones_locales || {})[this._claveDecl(ruc, periodo)] || null;
    },

    async yaDeclaro(ruc, periodo) {
        const r = await SafeStorage.get(['sc_declaraciones_locales']);
        const reg = r.sc_declaraciones_locales || {};
        return !!reg[this._claveDecl(ruc, periodo)];
    },

    /** Marca que el comprobante finalmente sí llegó a la nube. */
    async marcarPdfSubido(ruc, periodo, extra = {}) {
        const r = await SafeStorage.get(['sc_declaraciones_locales']);
        const reg = r.sc_declaraciones_locales || {};
        const clave = this._claveDecl(ruc, periodo);
        if (reg[clave]) {
            reg[clave].pdfSubido = true;
            reg[clave].pdfUrl = extra.url || '';
            reg[clave].pdfDonde = extra.provider || '';
            await SafeStorage.set({ sc_declaraciones_locales: reg });
        }
    },

    /** Las declaraciones registradas localmente, para el panel y la consola. */
    async verDeclaraciones() {
        const r = await SafeStorage.get(['sc_declaraciones_locales']);
        const reg = r.sc_declaraciones_locales || {};
        const filas = Object.values(reg).sort((a, b) => b.cuando - a.cuando);
        if (!filas.length) { console.log('🧾 Todavía no hay declaraciones registradas.'); return []; }
        console.table(filas.map((d) => ({
            RUC: d.ruc,
            nombre: d.nombre,
            periodo: d.periodo,
            cuando: new Date(d.cuando).toLocaleString('es-EC'),
            PDF: d.pdfSubido ? `✅ ${d.pdfDonde || 'subido'}` : '⚠️ pendiente de subir'
        })));
        return filas;
    },

    /** Periodo por defecto: el mes anterior (el que se declara). */
    periodoPorDefecto() {
        const h = new Date();
        let m = h.getMonth() - 1, a = h.getFullYear();
        if (m < 0) { m = 11; a--; }
        return { year: a, monthIndex: m };
    },

    /**
     * Arma la cola con los clientes que TODAVÍA no tienen comprobante del
     * periodo. Excluye los marcados con error y los que no tienen clave
     * guardada (sin clave el auto-login es imposible).
     */
    async armarCola(periodo) {
        const r = await SafeStorage.get(['sc_clients_cache', 'flagged_errors', 'sri_tried_credentials']);
        let lista = Array.isArray(r.sc_clients_cache) ? r.sc_clients_cache : [];

        // La caché se llena al abrir SantiagoCordova.com (bridge_content.js).
        // Si está vacía —sesión nueva, otro perfil de Chrome, caché limpiada—
        // pedimos la lista a Supabase para al menos poder decir QUIÉNES faltan.
        // Las claves NO viajan desde la nube: viven solo en este navegador.
        if (lista.length === 0 && typeof fetchClientsDirectly === 'function') {
            console.log('📭 [BUCLE] Caché local vacía. Consultando la lista en Supabase...');
            try {
                const remotos = await fetchClientsDirectly();
                if (remotos.length) {
                    lista = remotos;
                    await SafeStorage.set({ sc_clients_cache: remotos });
                    console.log(`☁️ [BUCLE] ${remotos.length} clientes recuperados de la nube (sin claves).`);
                }
            } catch (e) {
                console.warn('No se pudo consultar la lista remota:', e);
            }
        }
        const errs = r.flagged_errors || {};
        const tried = r.sri_tried_credentials || {};
        const pStr = `${periodo.year}-${String(periodo.monthIndex + 1).padStart(2, '0')}`;

        const cola = [];
        let sinClave = 0, yaHechos = 0, excluidosSeguridad = 0;
        const sinPdf = [];   // declararon, pero su comprobante no quedó guardado

        for (const c of lista) {
            if (!c || !c.ruc) continue;
            if (errs[c.ruc] === 'cuenta_bloqueada' || tried[c.ruc]?.status === 'locked') {
                excluidosSeguridad++;
                await Omitidos.anotar(c.ruc, 'cuenta_bloqueada', {
                    nombre: c.name,
                    detalle: tried[c.ruc]?.reason || 'Cuenta bloqueada en el portal del SRI',
                    contar: false });
                continue;
            }

            const clave = c.password || c.sri_password || c.sriPassword || '';
            if (!clave) { sinClave++; await Omitidos.anotar(c.ruc, 'sin_clave', { nombre: c.name, contar: false }); continue; }

            // 🛡️ Filtro de seguridad: si la clave falló y no ha cambiado, omitir de la cola
            if (typeof SriCredentialVault !== 'undefined') {
                const check = await SriCredentialVault.canAttemptLogin(c.ruc, clave);
                if (!check.allowed) {
                    excluidosSeguridad++;
                    // Que quede en la lista de omitidos: si solo se lo cuenta,
                    // el cliente al que hay que arreglarle la clave es
                    // precisamente el que nadie vuelve a ver.
                    const bloqueada = /bloquead|inactiv/i.test(check.reason || '');
                    await Omitidos.anotar(c.ruc, bloqueada ? 'cuenta_bloqueada' : 'clave_incorrecta',
                        { nombre: c.name, detalle: check.reason || 'La bóveda no permite reintentar',
                          contar: false });
                    continue;
                }
            } else if (errs[c.ruc] || tried[c.ruc]?.status === 'failed') {
                excluidosSeguridad++;
                await Omitidos.anotar(c.ruc, 'clave_incorrecta',
                    { nombre: c.name, detalle: 'El SRI ya rechazó esta clave', contar: false });
                continue;
            }

            // El registro local manda: el portal tarda ~20 min en actualizarse
            // y la subida del PDF puede haber fallado.
            const yaDecl = await this.declaracionLocal(c.ruc, periodo);
            if (yaDecl) {
                if (yaDecl.pdfSubido) { yaHechos++; }
                else { sinPdf.push({ ruc: c.ruc, name: c.name || 'Cliente SRI', password: clave }); }
                continue;
            }

            const decs = Array.isArray(c.declarations) ? c.declarations
                       : (Array.isArray(c.declaration_history) ? c.declaration_history : []);
            const hecho = decs.some((d) => d &&
                (d.proof_file || d.pdfUrl || d.proofFile) &&
                String(d.period || '').includes(pStr));
            if (hecho) { yaHechos++; continue; }

            cola.push({ ruc: c.ruc, name: c.name || 'Cliente SRI', password: clave });
        }

        cola.sort((a, b) => {
            const d = (r2) => (!r2 || r2.length < 9) ? 99 : (parseInt(r2.charAt(8), 10) || 10);
            return d(a.ruc) - d(b.ruc);
        });

        console.log(`📋 [BUCLE] Cola para ${pStr}: ${cola.length} pendientes · ${yaHechos} ya con PDF · ${sinClave} sin clave${excluidosSeguridad ? ` · ${excluidosSeguridad} excluidos por seguridad/clave errónea` : ''}.`);
        if (excluidosSeguridad || sinClave) {
            console.log(`   Los ${excluidosSeguridad + sinClave} que quedaron fuera están en el botón ⚠ del HUD, con qué hacer en cada caso.`);
        }
        if (sinPdf.length) {
            console.warn(`🧾 [BUCLE] ${sinPdf.length} declararon pero su comprobante NO quedó guardado: ` +
                         sinPdf.map((c) => c.name).join(', '));
            console.log('   Se recuperan desde Consulta de declaraciones, sin volver a declarar.');
        }
        return { cola, yaHechos, sinClave, excluidosSeguridad, sinPdf, total: lista.length };
    },

    /** Deja listo el auto-login del cliente que toca. */
    async prepararCliente(cliente, periodo) {
        anotarBitacora('credenciales listas', cliente.name || cliente.ruc);

        // El contador de rebotes al login es de ESTE intento, no del cliente.
        // Si quedara pegado de una corrida vieja, el primer rebote de la
        // próxima lo mandaría derecho a `sesion_caida` sin darle su reintento.
        // Es la misma trampa que `iva_sin_ubicar` pegada entre clientes.
        try {
            const rb = (await SafeStorage.get(['sc_rebotes'])).sc_rebotes || {};
            if (rb[cliente.ruc] !== undefined) {
                delete rb[cliente.ruc];
                await SafeStorage.set({ sc_rebotes: rb });
            }
        } catch (e) { /* un contador no puede tumbar el arranque */ }

        if (cliente.soloRecuperar) {
            console.log(`🧾 [BUCLE] ${cliente.name || cliente.ruc} ya declaró: solo se recupera su comprobante.`);
            await SafeStorage.set({
                pending_sri_autofill: {
                    ruc: cliente.ruc, password: cliente.password, name: cliente.name,
                    timestamp: Date.now(), manual: true, isBatch: true
                },
                // Entra, y apenas haya sesión el flujo cruza a Consulta de
                // declaraciones. Nada de abrir el wizard de recepción.
                pendingAction: 'recuperar_comprobante',
                recuperarComprobante: {
                    ruc: cliente.ruc, nombre: cliente.name, periodo,
                    per: `${periodo.year}-${String(periodo.monthIndex + 1).padStart(2, '0')}`,
                    intentos: 0
                },
                workflowPeriod: periodo,
                actionTimestamp: Date.now(),
                autoDeclaration: false,
                sri_auto_mode: true,
                sri_master_switch_on: true,
                sriAutomationPaused: false,
                ghost_manual_mode: false
            });
            await SafeStorage.remove(['declaration_synced_flag', 'iva_sin_ubicar']);
            return;
        }
        await SafeStorage.set({
            pending_sri_autofill: {
                ruc: cliente.ruc,
                password: cliente.password,
                name: cliente.name,
                timestamp: Date.now(),
                manual: true,
                isBatch: true
            },
            pendingAction: 'turbo_step1_facturas',
            checkFacturas: true,
            checkRetenciones: true,
            checkNC: true,
            workflowPeriod: periodo,
            autoDeclaration: true,
            sri_auto_mode: true,
            sri_master_switch_on: true,
            sriAutomationPaused: false,
            actionTimestamp: Date.now(),
            skipSafetyCheck: true,
            ghost_manual_mode: false
        });
        await SafeStorage.remove(['declaration_synced_flag', 'iva_sin_ubicar']);
    },

    /**
     * ▶ TODA LA PELÍCULA: arma la cola, enciende el semáforo, deja preparado
     * al primer cliente y devuelve qué hacer con la pestaña.
     */
    async arrancarLote(periodo) {
        const p = periodo || this.periodoPorDefecto();
        const { cola, yaHechos, sinClave, sinPdf, total } = await this.armarCola(p);
        // Los que solo necesitan recuperar el comprobante van primero y marcados:
        // no se les vuelve a declarar nada.
        const colaFinal = [
            ...(sinPdf || []).map((c) => ({ ...c, soloRecuperar: true })),
            ...cola
        ];

        if (total === 0) {
            return { ok: false, motivo: 'No hay clientes en la caché. Abrí SantiagoCordova.com para sincronizar.' };
        }
        if (colaFinal.length === 0) {
            return { ok: false, motivo: `Nada pendiente: ${yaHechos} ya declarados${sinClave ? `, ${sinClave} sin clave` : ''}.` };
        }

        // Conecta el semáforo con el motor de avance N→N+1.
        // handleBatchNextClient() (01) lee la cola desde auto_batch_queue/auto_batch_index,
        // NO desde sc_loop. Antes arrancarLote solo escribía sc_loop, así que auto_batch_queue
        // quedaba vacío y el lote moría en silencio después del primer cliente.
        await this.iniciar(colaFinal, p);
        await SafeStorage.set({
            auto_batch_queue: colaFinal,
            auto_batch_index: 0,
            auto_batch_enabled: true,
            auto_batch_mode: 'turbo_step1_facturas'
        });
        await this.prepararCliente(cola[0], p);
        return { ok: true, total: cola.length, primero: cola[0].name, sinClave };
    },

    /**
     * Mantiene las 6 banderas viejas en sintonía. Se siguen escribiendo por
     * compatibilidad con el código que aún las lee, pero NINGUNA compuerta
     * decide por ellas: la autoridad es puedeAvanzar().
     */
    async _sincronizarLegado(encendido) {
        await SafeStorage.set({
            sri_master_switch_on: !!encendido,
            sriAutomationPaused: !encendido,
            auto_batch_enabled: !!encendido,
            sri_auto_mode: !!encendido,
            autoDeclaration: !!encendido
        });
    }
};

// Se ejecuta una sola vez: apaga cualquier lote fantasma heredado.
SriLoop.normalizarEstadoInicial();

// ── Atajos de consola para probar sin depender del puente web ──────────────
// La caché de clientes la llena bridge_content.js al abrir SantiagoCordova.com.
// Cuando eso no ocurre (perfil nuevo de Chrome, Burp interceptando, la web sin
// sincronizar) no hay forma de arrancar un lote. Estos helpers permiten cargar
// un contribuyente a mano para poder capturar una corrida.
if (typeof window !== 'undefined') {
    /**
     * Agrega o actualiza un contribuyente en la caché local.
     *   sriAgregarCliente('1102605118001', 'MiClave123', 'LABANDA ARMIJOS')
     * La clave queda SOLO en este navegador, igual que las que sincroniza la web.
     */
    window.sriAgregarCliente = async (ruc, clave, nombre) => {
        ruc = String(ruc || '').trim();
        if (!/^\d{10,13}$/.test(ruc)) {
            console.error('❌ RUC inválido. Esperaba 10 a 13 dígitos. Uso: sriAgregarCliente("1790000000001", "clave", "NOMBRE")');
            return null;
        }
        if (!clave) {
            console.error('❌ Falta la clave. Sin ella el auto-login no puede entrar.');
            return null;
        }

        const r = await SafeStorage.get(['sc_clients_cache']);
        const lista = Array.isArray(r.sc_clients_cache) ? r.sc_clients_cache : [];
        const entrada = {
            ruc,
            name: nombre || `Contribuyente ${ruc}`,
            password: clave,
            sri_password: clave,
            sriPassword: clave,
            regime: 'Régimen General',
            tax_profile: { ivaFrequency: 'Mensual' },
            taxProfile: { ivaFrequency: 'Mensual' },
            ivaFrequency: 'Mensual',
            declarations: []
        };

        const i = lista.findIndex((c) => c && c.ruc === ruc);
        if (i >= 0) lista[i] = { ...lista[i], ...entrada };
        else lista.push(entrada);

        await SafeStorage.set({ sc_clients_cache: lista });
        // Un cliente marcado con error quedaría fuera de la cola.
        const errs = (await SafeStorage.get(['flagged_errors'])).flagged_errors || {};
        if (errs[ruc]) { delete errs[ruc]; await SafeStorage.set({ flagged_errors: errs }); }

        console.log(`✅ ${entrada.name} (${ruc}) cargado. La caché tiene ${lista.length} cliente(s).`);
        console.log('   Ahora pulsá ▶ en el HUD, o corré: window.sriProbarCon("' + ruc + '")');
        return entrada.name;
    };

    /**
     * Carga el cliente (si hace falta) y arranca el lote con él, sin pasar por
     * el confirm. Pensado para capturar una corrida con Burp.
     *   sriProbarCon('1102605118001', 'MiClave123', 'LABANDA')
     *   sriProbarCon('1102605118001')            // si ya está en la caché
     */
    window.sriProbarCon = async (ruc, clave, nombre) => {
        if (clave) await window.sriAgregarCliente(ruc, clave, nombre);

        const r = await SafeStorage.get(['sc_clients_cache']);
        const c = (r.sc_clients_cache || []).find((x) => x && x.ruc === String(ruc).trim());
        if (!c) {
            console.error(`❌ ${ruc} no está en la caché. Cargalo primero: sriAgregarCliente("${ruc}", "clave", "NOMBRE")`);
            return false;
        }
        const pass = c.password || c.sri_password || c.sriPassword;
        if (!pass) {
            console.error(`❌ ${c.name} no tiene clave guardada. Pasala: sriProbarCon("${ruc}", "clave")`);
            return false;
        }

        const periodo = (await SafeStorage.get(['workflowPeriod'])).workflowPeriod || SriLoop.periodoPorDefecto();
        await SriLoop.iniciar([{ ruc: c.ruc, name: c.name, password: pass }], periodo);
        await SriLoop.prepararCliente({ ruc: c.ruc, name: c.name, password: pass }, periodo);

        const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        console.log(`🚀 Lote de prueba iniciado con ${c.name} · periodo ${MESES[periodo.monthIndex]} ${periodo.year}.`);
        console.log('   Redirigiendo al login del SRI; el auto-login sigue desde ahí.');
        await sleep(600);
        window.location.href = 'https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=app-sri-claves-angular&redirect_uri=https%3A%2F%2Fsrienlinea.sri.gob.ec%2Fsri-en-linea%2F%2Fcontribuyente%2Fperfil&response_mode=fragment&response_type=code&scope=openid';
        return true;
    };

    /** Lista lo que hay en la caché, sin mostrar las claves. */
    window.sriVerDeclaraciones = () => SriLoop.verDeclaraciones();
    window.sriVerClientes = async () => {
        const r = await SafeStorage.get(['sc_clients_cache', 'flagged_errors']);
        const lista = Array.isArray(r.sc_clients_cache) ? r.sc_clients_cache : [];
        const errs = r.flagged_errors || {};
        if (!lista.length) {
            console.log('📭 La caché está vacía. Cargá uno con sriAgregarCliente("RUC", "clave", "NOMBRE").');
            return [];
        }
        console.table(lista.map((c) => ({
            RUC: c.ruc,
            nombre: c.name,
            clave: (c.password || c.sri_password || c.sriPassword) ? '✅ guardada' : '❌ falta',
            marcado: errs[c.ruc] ? '⚠️ con error' : ''
        })));
        return lista.length;
    };

    window.sriLimpiarEstado = () => SriLoop.limpiarEstado();
    window.sriEstado = async () => {
        const e = await SriLoop.get();
        console.log('🚦 Semáforo:', e.estado,
                    '· cliente', (e.cola || []).length ? (e.indice + 1) + '/' + e.cola.length : '—',
                    e.motivo ? '· ' + e.motivo : '');
        return e;
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// BITÁCORA DE CORRIDA
//
// Una corrida atraviesa muchas navegaciones, y con cada una la consola se
// borra: para diagnosticar había que pegar fragmentos sueltos y adivinar el
// orden. Esto anota los hitos en chrome.storage, que sí sobrevive, y los
// devuelve como un texto comparable con una traza de Burp.
//
//   window.sriBitacora()        → la imprime
//   window.sriBitacoraTexto()   → la devuelve como texto para copiar
//   window.sriBitacoraLimpiar() → empieza de cero
// ═══════════════════════════════════════════════════════════════════════════
/**
 * ¿El lote debe continuar al siguiente cliente? La autoridad es el semáforo;
 * las banderas viejas solo valen como respaldo para corridas ya empezadas.
 */
async function loteDebeContinuar() {
    try {
        if (typeof SriLoop !== 'undefined') {
            const sem = await SriLoop.get();
            // Hay lote en el semáforo: manda él y no se consulta nada más.
            // Sin este corte, una pausa quedaba anulada por las banderas viejas,
            // que pausar() no apaga.
            if (Array.isArray(sem.cola) && sem.cola.length > 0) {
                return await SriLoop.puedeAvanzar();
            }
        }
    } catch (e) { /* seguimos al respaldo */ }
    // Sin semáforo: corrida vieja ya empezada, valen las banderas.
    const r = await SafeStorage.get(['auto_batch_enabled', 'sri_auto_mode']);
    return !!(r.auto_batch_enabled || r.sri_auto_mode);
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DE OMITIDOS
//
// Todo cliente que el lote saltó, con el motivo y la fecha. Es la lista para
// revisar al final de la corrida: qué quedó sin declarar y por qué, y qué se
// puede arreglar (una clave vencida se cambia; una cuenta bloqueada no).
//
//   window.sriOmitidos()          → tabla en consola
//   window.sriReintentar('RUC')   → lo saca de la lista para volver a intentarlo
//   window.sriOmitidosLimpiar()   → vacía la lista entera
// ═══════════════════════════════════════════════════════════════════════════
const Omitidos = {
    _KEY: 'sc_omitidos',

    // Motivo → si tiene arreglo por parte del usuario y cuál.
    ARREGLO: {
        sin_clave:          'Cargar la clave del SRI en la ficha del cliente.',
        clave_caducada:     'El SRI pide cambiar la clave. Cambiala a mano y reintentá.',
        clave_incorrecta:   'Revisar la clave guardada: el SRI la rechazó.',
        sesion_caida:       'Entró bien y el portal lo devolvió al login, sin decir por qué. La clave NO está marcada como mala: volvé a intentarlo.',
        cuenta_bloqueada:   'Cuenta bloqueada en el SRI. Hay que desbloquearla en el portal.',
        omitido_manual:     'Lo omitiste vos. Reintentá cuando quieras.',
        saldo_a_pagar:      'La declaración da saldo a pagar: se guardó borrador y no se envió. Requiere decisión tuya.',
        compras_sin_casillero: 'Quedaron compras sin casillero (5% sin 540, o facturas que no se pudieron repartir). El formulario quedó lleno y sin enviar.',
        identidad:          'La sesión abierta era de otro contribuyente. Suele resolverse reintentando.',
        sin_datos:          'No se pudieron extraer comprobantes.',
        no_declara_iva:     'Este contribuyente no tiene obligacion de IVA. Revisar su regimen en la ficha.',
        ya_declarada:       'El periodo ya estaba declarado: el portal abrio una sustitutiva. Si hay que corregirla, hacela vos.'
    },

    /**
     * Anota que un cliente quedó fuera.
     * @param {object} extra  nombre, detalle, periodo, y:
     *   · contar=false  → no suma a `veces` ni repite el aviso. Para cuando se
     *     re-anota algo ya sabido (armar la cola) sin haber intentado nada:
     *     `veces` cuenta intentos fallidos, no veces que se miró la lista.
     */
    async anotar(ruc, motivo, extra = {}) {
        if (!ruc) return;
        const contar = extra.contar !== false;
        try {
            const r = await SafeStorage.get([this._KEY]);
            const lista = r[this._KEY] || {};
            const previo = lista[ruc];
            const repetido = !contar && previo && previo.motivo === motivo;

            lista[ruc] = {
                ruc,
                nombre: extra.nombre || previo?.nombre || '',
                motivo,
                detalle: String(extra.detalle || '').slice(0, 200),
                periodo: extra.periodo || previo?.periodo || '',
                cuando: repetido ? previo.cuando : Date.now(),
                veces: (previo?.veces || 0) + (contar ? 1 : 0)
            };
            await SafeStorage.set({ [this._KEY]: lista });
            if (repetido) return;   // ya estaba dicho: no se repite el aviso
            console.log(`⏭️ [OMITIDO] ${extra.nombre || ruc}: ${motivo}`);
            anotarBitacora('omitido', `${extra.nombre || ruc} · ${motivo}`);
        } catch (e) { /* nunca romper el lote por registrar */ }
    },

    async lista() {
        const r = await SafeStorage.get([this._KEY]);
        return Object.values(r[this._KEY] || {}).sort((a, b) => b.cuando - a.cuando);
    },

    /** Lo saca de la lista Y le limpia las banderas, para que el lote lo vuelva a tomar. */
    async reintentar(ruc) {
        const r = await SafeStorage.get([this._KEY, 'flagged_errors', 'sri_tried_credentials']);
        const lista = r[this._KEY] || {};
        const errs = r.flagged_errors || {};
        const tried = r.sri_tried_credentials || {};
        const habia = !!lista[ruc];

        delete lista[ruc];
        delete errs[ruc];
        delete tried[ruc];
        await SafeStorage.set({ [this._KEY]: lista, flagged_errors: errs, sri_tried_credentials: tried });

        console.log(habia
            ? `♻️ ${ruc} vuelve a la cola: se borraron su marca de omitido y sus banderas de error.`
            : `♻️ ${ruc} no estaba omitido, pero igual se limpiaron sus banderas.`);
        return habia;
    },

    async limpiar() {
        await SafeStorage.remove([this._KEY]);
        console.log('🧹 Lista de omitidos vaciada. Las banderas de error NO se tocaron.');
    }
};

if (typeof window !== 'undefined') {
    window.sriOmitidos = async () => {
        const l = await Omitidos.lista();
        if (!l.length) { console.log('✅ No hay clientes omitidos.'); return []; }
        console.table(l.map(o => ({
            RUC: o.ruc,
            nombre: o.nombre,
            motivo: o.motivo,
            'qué hacer': Omitidos.ARREGLO[o.motivo] || o.detalle || '—',
            cuando: new Date(o.cuando).toLocaleString('es-EC')
        })));
        console.log('Para reintentar uno: sriReintentar("RUC")');
        return l;
    };
    window.sriReintentar = (ruc) => Omitidos.reintentar(String(ruc).trim());
    window.sriOmitidosLimpiar = () => Omitidos.limpiar();
}

const SriApi = {
    BASE: 'https://srienlinea.sri.gob.ec',

    /** ¿Tiene pinta de JWT? Tres partes separadas por punto, la primera "ey…". */
    _pareceJwt(v) {
        return typeof v === 'string' && v.length > 40 &&
               /^ey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(v);
    },

    /** ¿Sigue vigente? Un token vencido es peor que ninguno: da 401 en silencio. */
    _vigente(jwt) {
        try {
            const carga = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (!carga.exp) return true;               // sin caducidad declarada
            return carga.exp * 1000 > Date.now() + 5000;
        } catch (e) { return true; }                    // no se pudo leer: se prueba igual
    },

    /**
     * Busca un JWT del portal en todo lo que el content script puede ver.
     * @param {boolean} conDetalle si true, devuelve también DÓNDE lo encontró.
     */
    _buscarToken(conDetalle = false) {
        const hallazgos = [];

        // Recorre un objeto anidado buscando cadenas con pinta de JWT.
        const MAX_PROF = 8;
        const hurgar = (valor, ruta, prof = 0) => {
            if (!valor) return;
            if (typeof valor === 'string') {
                // Una cadena SIEMPRE se evalúa: es la hoja, y es donde está el
                // token. El tope solo limita cuánto se sigue descendiendo.
                if (this._pareceJwt(valor)) { hallazgos.push({ ruta, jwt: valor }); return; }
                if (prof < MAX_PROF && valor.length > 2 && (valor[0] === '{' || valor[0] === '[')) {
                    try { hurgar(JSON.parse(valor), ruta, prof + 1); } catch (e) { /* no era JSON */ }
                }
                return;
            }
            if (typeof valor === 'object' && prof < MAX_PROF) {
                for (const k of Object.keys(valor)) hurgar(valor[k], `${ruta}.${k}`, prof + 1);
            }
        };

        for (const [nombre, almacen] of [['sessionStorage', sessionStorage], ['localStorage', localStorage]]) {
            try {
                for (let i = 0; i < almacen.length; i++) {
                    const clave = almacen.key(i);
                    hurgar(almacen.getItem(clave), `${nombre}[${clave}]`);
                }
            } catch (e) { /* almacenamiento bloqueado */ }
        }

        // Cookies legibles (las HttpOnly no se ven desde JS, y está bien así).
        try {
            for (const par of String(document.cookie || '').split(';')) {
                const c = par.indexOf('=');
                if (c < 0) continue;
                const clave = par.slice(0, c).trim();
                const val = decodeURIComponent(par.slice(c + 1).trim());
                if (this._pareceJwt(val)) hallazgos.push({ ruta: `cookie[${clave}]`, jwt: val });
            }
        } catch (e) { /* sin cookies legibles */ }

        // Primero los vigentes, y entre ellos el más largo (el access_token
        // suele traer más claims que el id_token).
        hallazgos.sort((a, b) => (this._vigente(b.jwt) - this._vigente(a.jwt)) || (b.jwt.length - a.jwt.length));

        if (conDetalle) return hallazgos;
        const bueno = hallazgos.find((h) => this._vigente(h.jwt));
        return bueno ? bueno.jwt : null;
    },

    /** Un JWT del portal guardado por la SPA. Devuelve null si no hay sesión. */
    _token() {
        return this._buscarToken(false);
    },

    async _get(ruta) {
        const token = this._token();
        if (!token) { console.warn('🔌 [API SRI] No hay token de sesión todavía.'); return null; }
        try {
            const r = await fetch(this.BASE + ruta, {
                credentials: 'include',
                headers: { Accept: 'application/json', Authorization: 'bearer ' + token }
            });
            if (!r.ok) { console.warn(`🔌 [API SRI] ${ruta} devolvió HTTP ${r.status}.`); return null; }
            return await r.json();
        } catch (e) {
            console.warn(`🔌 [API SRI] Falló ${ruta}:`, e.message);
            return null;
        }
    },

    /**
     * ¿El SRI está exigiendo cambiar la clave de este contribuyente?
     *
     * CONFIRMADO el 06-sep-2026 con la traza `cambio_de_clave_obligatorio`:
     *
     *   GET /sri-claves-servicio-internet/rest/privado/Verificar/vigencia
     *   → {"objeto":"Su clave expiro, acceda a la opción cambiar clave y
     *      modifíquela.", "mensajeServidor":{"texto":"ok"}, "data":[]}
     *
     * Devuelve **tres** respuestas, y la tercera importa: `null` es «no pude
     * preguntar», que NO es «está vigente». Con un `null` no se declara ni se
     * omite por esto — se sigue mirando la pantalla.
     *
     * 🛑 En ese mismo servicio viven `Verificar/persona` y `Verificar/modificar`,
     * que son los que CAMBIAN la clave. **El bot no los llama nunca.**
     *
     * @returns {Promise<{vencida: boolean, mensaje: string}|null>}
     */
    async claveVencida() {
        const r = await this._get('/sri-claves-servicio-internet/rest/privado/Verificar/vigencia');
        if (!r) return null;

        const mensaje = String(r.objeto || '').trim();
        if (!mensaje) return { vencida: false, mensaje: '' };

        // En positivo a propósito: sólo un texto que HABLA de la clave vencida
        // cuenta como vencida. Cualquier otra cosa no se interpreta.
        const limpio = mensaje.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const vencida = /(clave|contrasena).{0,30}(expir|caduc|vencid)|cambiar (su )?clave|actualiz\w*.{0,15}clave/.test(limpio);
        return { vencida, mensaje };
    },

    /** Quién está realmente dentro de la sesión. Más fiable que leer la cabecera. */
    async perfil() {
        return this._get('/sri-catastro-sujeto-servicio-internet/rest/privado/contribuyente/perfil');
    },

    async obligacionesVigentes() {
        return this._get('/sri-obligacion-beneficio-servicio-internet/rest/privado/obligaciones/tributarias/vigentes');
    },

    async alertas() {
        return this._get('/sri-obligacion-beneficio-servicio-internet/rest/privado/alertas/vencimiento');
    },

    /**
     * Qué declaración de IVA le toca a quien está logueado, según el propio
     * portal: período, vencimiento y si ya la presentó. Reemplaza suponer
     * "el mes pasado" y esperar a que el perfil deje de pedirla.
     */
    async ivaPendiente() {
        const a = await this.alertas();
        if (!a) return null;

        const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO',
                       'AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
        const grupos = [
            ['vencida', a.obligacionesVencidas],
            ['hoy', a.obligacionesPorVencerDia],
            ['esta quincena', a.obligacionesPorVencerQuincena],
            ['este mes', a.obligacionesPorVencerMes]
        ];

        for (const [urgencia, lista] of grupos) {
            for (const o of (lista || [])) {
                if (!/IVA/i.test(o.descripcionObligacionTributaria || '')) continue;
                const partes = String(o.descripcionPeriodo || '').trim().toUpperCase().split(/\s+/);
                const mi = MESES.indexOf(partes[0]);
                const anio = parseInt(partes[1], 10);
                if (mi < 0 || !anio) continue;
                return {
                    periodo: { year: anio, monthIndex: mi },
                    periodoTexto: o.descripcionPeriodo,
                    vence: (o.fechaVencimiento || '').slice(0, 10),
                    dias: o.dias,
                    estado: o.estadoPresentacionDescripcion || '',
                    urgencia,
                    // El portal dice "Por cumplir" mientras siga pendiente.
                    pendiente: !/present|cumplid/i.test(o.estadoPresentacionDescripcion || '')
                };
            }
        }
        return null;   // nada de IVA a la vista
    }
};

if (typeof window !== 'undefined') {
    /**
     * ¿Dónde guarda el portal su token? Imprime SOLO la ubicación y la
     * caducidad; jamás el token, que es una credencial de sesión viva.
     */
    window.sriBuscarToken = () => {
        const h = SriApi._buscarToken(true);
        if (!h.length) {
            console.warn('🔌 No hay ningún JWT visible para el content script.');
            console.log('   Claves en sessionStorage:', Object.keys(sessionStorage));
            console.log('   Claves en localStorage:  ', Object.keys(localStorage));
            console.log('   Si están vacías, la SPA lo guarda solo en memoria y desde acá no se puede leer.');
            return [];
        }
        console.table(h.map((x) => {
            let exp = '?';
            try {
                const c = JSON.parse(atob(x.jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                exp = c.exp ? new Date(c.exp * 1000).toLocaleTimeString('es-EC') : 'sin caducidad';
            } catch (e) {}
            return { donde: x.ruta, largo: x.jwt.length, vence: exp, vigente: SriApi._vigente(x.jwt) ? 'sí' : 'NO' };
        }));
        console.log('(No se imprime el token: es una credencial de sesión.)');
        return h.map((x) => x.ruta);
    };

    window.sriApiPerfil = () => SriApi.perfil().then((r) => { console.log(r); return r; });
    window.sriApiPendiente = () => SriApi.ivaPendiente().then((r) => {
        if (!r) console.log('🔌 Sin IVA pendiente a la vista (o sin sesión).');
        else console.log(`🔌 IVA ${r.periodoTexto} · vence ${r.vence} (${r.dias} días) · ${r.estado}`);
        return r;
    });
}

/**
 * El RUC del contribuyente que está declarando ahora.
 *
 * Primero lo que dijo el lote —que es la verdad de a quién se está
 * declarando— y recién después la cabecera de la página, que en el SRI llega
 * cacheada de otra pantalla más seguido de lo que uno querría.
 */
async function rucDelClienteActual() {
    try {
        const af = (await SafeStorage.get(['pending_sri_autofill'])).pending_sri_autofill;
        if (af && af.ruc) return String(af.ruc).replace(/\D/g, '');
    } catch (e) { /* sigue por la cabecera */ }
    try {
        const info = window.sriAssistant && window.sriAssistant.extractClientInfo
            ? window.sriAssistant.extractClientInfo() : null;
        if (info && info.ruc) return String(info.ruc).replace(/\D/g, '');
    } catch (e) { /* nada */ }
    return '';
}

// ═══════════════════════════════════════════════════════════════════════════
// 🩺 CHEQUEO — ¿está todo listo para correr el lote?
// ═══════════════════════════════════════════════════════════════════════════
// Los problemas se descubren a mitad de camino: la subida no anda y uno se
// entera en el cliente 12; la marca de «IVA sin ubicar» quedó pegada de ayer y
// frena el envío sin que nadie entienda por qué.
//
// Todo eso ya está registrado en algún lado. Lo que faltaba era un lugar donde
// mirarlo junto, ANTES de arrancar.
//
// Tres estados y ninguno más: `ok` (anda), `aviso` (anda, pero mirá esto) y
// `problema` (esto te va a morder). Cada uno dice QUÉ HACER, porque un
// diagnóstico que no dice qué hacer no sirve de nada.
const Chequeo = {
    /**
     * Corre todas las comprobaciones.
     *
     * @param {{incluirSubida?: boolean}} opciones La subida se prueba contra la
     *        red, así que tarda; se puede pedir sin ella.
     * @returns {Promise<Array<{clave, titulo, estado, detalle, queHacer}>>}
     */
    async correr(opciones = {}) {
        const { incluirSubida = true } = opciones;
        const r = [];
        const anotar = (clave, titulo, estado, detalle, queHacer) =>
            r.push({ clave, titulo, estado, detalle, queHacer: queHacer || '' });

        // ── La extensión ────────────────────────────────────────────────
        let version = '?';
        try { version = chrome.runtime.getManifest().version; } catch (e) { /* nada */ }
        anotar('version', 'Extensión', 'ok', `Nueva Luz ${version}, viva en esta página.`);

        // ── ¿Estamos donde hay que estar? ───────────────────────────────
        const enSri = location.hostname.includes('sri.gob.ec');
        anotar('portal', 'Portal del SRI', enSri ? 'ok' : 'problema',
            enSri ? location.pathname : 'Esta página no es del SRI.',
            enSri ? '' : 'Abrí srienlinea.sri.gob.ec y volvé a chequear.');

        // ── El lote ─────────────────────────────────────────────────────
        try {
            const e = await SriLoop.get();
            const total = (e.cola || []).length;
            anotar('cola', 'La cola', total ? 'ok' : 'aviso',
                total ? `${total} contribuyente(s) · estado ${e.estado}`
                      : 'No hay nadie en la cola.',
                total ? '' : 'Cargá el lote desde el popup de la extensión.');
        } catch (e) {
            anotar('cola', 'La cola', 'aviso', 'No se pudo leer el semáforo.');
        }

        // ── La marca que frena el envío ─────────────────────────────────
        // Si quedó pegada de una corrida anterior, el cierre mágico no manda
        // NADA y no es obvio por qué. Es el chequeo que más veces va a salvar
        // una tarde.
        try {
            const p = (await SafeStorage.get(['iva_sin_ubicar'])).iva_sin_ubicar;
            const n = (p && p.motivos && p.motivos.length) || 0;
            anotar('sinUbicar', 'Compras sin casillero', n ? 'problema' : 'ok',
                n ? `${n} caso(s) sin ubicar: el cierre mágico NO va a enviar.`
                  : 'Nada pendiente de ubicar.',
                n ? 'Mirá el detalle en la consola o volvé a declarar el cliente. Si es de una corrida vieja, arrancar una declaración nueva la limpia.' : '');
        } catch (e) { /* nada */ }

        // ── Los clientes que quedaron afuera ────────────────────────────
        try {
            // Omitidos expone lista(), no contar().
            const om = typeof Omitidos !== 'undefined' && Omitidos.lista
                ? ((await Omitidos.lista()) || []).length : 0;
            anotar('omitidos', 'Quedaron sin declarar', om ? 'aviso' : 'ok',
                om ? `${om} contribuyente(s).` : 'Ninguno.',
                om ? 'Abrí ⚠️ en la barra para ver por qué quedó cada uno.' : '');
        } catch (e) { /* nada */ }

        // ── Las claves: no alcanza con que HAYA una, importa DE DÓNDE sale ──
        // La que está en `shared_config.js` viaja en el repositorio y en la
        // extensión: es una clave publicada. Que la subida funcione con ella no
        // es una buena noticia — es la señal de que todavía no se rotó.
        try {
            const g = await SafeStorage.get(['sc_r2_credenciales', 'sc_ia_credenciales']);
            const guardadas = g.sc_r2_credenciales || {};
            const cfg = (typeof window !== 'undefined' && window.SC_CONFIG) || {};

            const secretoGuardado = !!guardadas.R2_SECRET_ACCESS_KEY;
            const idGuardado = !!guardadas.R2_ACCESS_KEY_ID;
            const secretoEnCodigo = !!cfg.R2_SECRET_ACCESS_KEY;

            if (secretoGuardado && idGuardado) {
                anotar('clavesR2', 'Clave de R2', 'ok',
                    'Las dos vienen del almacén de la extensión, no del código.');
            } else if (secretoGuardado) {
                // Al rotar el token de Cloudflare cambian LOS DOS. Guardar sólo
                // el secreto deja la mitad vieja en el código y la firma falla.
                anotar('clavesR2', 'Clave de R2', 'aviso',
                    'Está el secreto pero falta el Access Key ID: se sigue usando el del código.',
                    'Al rotar el token cambian los dos. Cargá también el Access Key ID en Ajustes.');
            } else if (secretoEnCodigo) {
                anotar('clavesR2', 'Clave de R2', 'problema',
                    'Se está usando la clave que está escrita en shared_config.js.',
                    'Esa clave está en el historial de git: cualquiera con el repositorio la tiene. ' +
                    'Rotala en Cloudflare (R2 → Manage R2 API Tokens) y cargá la nueva en Ajustes.');
            } else {
                anotar('clavesR2', 'Clave de R2', 'aviso', 'No hay ninguna.',
                    'Cargala en Ajustes: clic derecho en el ícono de la extensión → Opciones.');
            }

            const ia = !!(g.sc_ia_credenciales && g.sc_ia_credenciales.apiKey);
            anotar('claveIa', 'Clave de IA', ia ? 'ok' : 'aviso',
                ia ? 'Guardada. El 🤖 del panel de proveedores puede trabajar.'
                   : 'No hay. El 🤖 no va a poder sugerir categorías.',
                ia ? '' : 'Es opcional: sin ella la cascada llega hasta el catastro y ahí para.');
        } catch (e) { /* nada */ }

        // ── El catastro ─────────────────────────────────────────────────
        try {
            const hay = typeof Catastro !== 'undefined' && await Catastro.cargar();
            anotar('catastro', 'Catastro del SRI', hay ? 'ok' : 'aviso',
                hay ? `${Catastro.cuantos().toLocaleString('es-EC')} RUC listos para consultar.`
                    : 'No está cargado.',
                hay ? '' : 'Se genera con tools/construir_catastro.py a partir del ZIP del SRI.');
        } catch (e) { /* nada */ }

        // ── Los proveedores ─────────────────────────────────────────────
        try {
            const p = typeof Proveedores !== 'undefined' ? await Proveedores.resumen() : null;
            if (p) {
                const faltan = p.total - p.clasificados;
                anotar('proveedores', 'Base de proveedores', faltan ? 'aviso' : 'ok',
                    `${p.total} proveedor(es) · ${faltan} sin clasificar`,
                    faltan ? 'Abrí 🏷️ y pulsá 🗂️ Catastro: completa la actividad de casi todos de una.' : '');
            }
        } catch (e) { /* nada */ }

        // ── Notas de venta ──────────────────────────────────────────────
        try {
            if (typeof NotasDeVenta !== 'undefined') {
                const on = await NotasDeVenta.estaEncendido();
                anotar('notas', 'Notas de venta', 'ok',
                    on ? 'Encendido: el lote va a preguntar el 508 y el 117.'
                       : 'Apagado: no se toca el 508 ni el 117.',
                    on ? 'Si no vas a estar mirando la pantalla, apagalo: cada cliente espera el temporizador.' : '');
            }
        } catch (e) { /* nada */ }

        // ── La subida, que es el objetivo §0 ────────────────────────────
        // ── La llave de la web ──────────────────────────────────────────
        // Se prueba contra la red porque una llave puede estar puesta y no
        // servir: el 06-sep-2026 la anon estaba revocada del lado de Supabase
        // —no vencida— y TODA la corrida perdió las métricas. Nadie se enteró
        // hasta leer el log, catorce contribuyentes después.
        if (incluirSubida) {
            if (!SC_SUPABASE_URL || !SC_SUPABASE_ANON_KEY) {
                anotar('web', 'Panel web', 'problema',
                    'No hay llave de Supabase configurada.',
                    'Pegá la llave anon en Ajustes de la extensión.');
            } else {
                try {
                    const rw = await fetch(`${SC_SUPABASE_URL}/rest/v1/clients?select=id&limit=1`, {
                        headers: {
                            apikey: SC_SUPABASE_ANON_KEY,
                            Authorization: `Bearer ${SC_SUPABASE_ANON_KEY}`
                        }
                    });
                    const origen = typeof SC_SUPABASE_ORIGEN === 'string' ? SC_SUPABASE_ORIGEN : 'del código';
                    if (rw.ok) {
                        anotar('web', 'Panel web', 'ok',
                            `La llave anon (${origen}) funciona: las declaraciones van a llegar al panel.`);
                    } else if (rw.status === 401 || rw.status === 403) {
                        anotar('web', 'Panel web', 'problema',
                            `Supabase rechaza la llave anon (${origen}): HTTP ${rw.status}.`,
                            'Copiá la llave nueva del panel de Supabase (Project Settings → API) y ' +
                            'pegala en Ajustes. Sin esto el bot declara, guarda el comprobante, y ' +
                            'el panel web no se entera de nada.');
                    } else {
                        anotar('web', 'Panel web', 'aviso',
                            `Supabase contestó HTTP ${rw.status}.`,
                            'Puede ser pasajero. Si sigue, mirá el panel de Supabase.');
                    }
                } catch (e) {
                    anotar('web', 'Panel web', 'aviso',
                        `No se pudo llegar a Supabase: ${e.message}`,
                        'Suele ser la red o un proxy. La declaración igual se hace; lo que se ' +
                        'pierde son las métricas del panel.');
                }
            }
        }

        if (incluirSubida) {
            try {
                const cfg = (typeof window !== 'undefined' && window.SC_CONFIG) || {};
                const d = await chrome.runtime.sendMessage({ tipo: 'SC_DIAGNOSTICO_SUBIDA', config: cfg });
                if (!d) {
                    anotar('subida', 'Subida de comprobantes', 'problema',
                        'El service worker no contestó.',
                        'Recargá la extensión en chrome://extensions.');
                } else if (d.ok) {
                    anotar('subida', 'Subida de comprobantes', 'ok', `Funciona por «${d.via}».`);
                } else {
                    const porQue = (d.intentos || [])
                        .map((i) => `${i.via}: ${i.error || i.omitido || ('HTTP ' + i.estado)}`)
                        .join(' · ');
                    // Sin esto, el bot declara y tira el comprobante — que es
                    // justo lo contrario del objetivo del proyecto.
                    anotar('subida', 'Subida de comprobantes', 'problema',
                        porQue || 'Ningún camino funcionó.',
                        'Sin esto el bot declara y el comprobante no queda guardado en ningún lado.');
                }
            } catch (e) {
                anotar('subida', 'Subida de comprobantes', 'problema', e.message,
                    'Recargá la extensión en chrome://extensions.');
            }
        }

        return r;
    },

    /** Un resumen de una línea, para el rótulo del botón. */
    resumir(filas) {
        const problemas = filas.filter((f) => f.estado === 'problema').length;
        const avisos = filas.filter((f) => f.estado === 'aviso').length;
        if (problemas) return { estado: 'problema', texto: `${problemas} problema(s)` };
        if (avisos) return { estado: 'aviso', texto: `${avisos} aviso(s)` };
        return { estado: 'ok', texto: 'todo en orden' };
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// NOTAS DE VENTA — casilleros 508 y 117
// ═══════════════════════════════════════════════════════════════════════════
// Son comprobantes FÍSICOS: nunca aparecen en «comprobantes electrónicos
// recibidos» y el bot no tiene de dónde sacarlos. El dato lo tiene el contador
// y nadie más.
//
//   508 · Adquisiciones a contribuyentes RISE (hasta dic-2021) /
//         NEGOCIOS POPULARES (desde ene-2022) — el importe
//   117 · Total de notas de venta recibidas — la cantidad
//
// **Si no hay dato, no se escribe nada.** Un cero inventado ahí es una
// declaración mal hecha, igual que una estimación presentada como dato.
//
// Y el lote NUNCA se queda esperando: la pregunta tiene temporizador. Vale la
// misma lección del `confirm()` que bloqueaba la automatización — un lote de
// 27 clientes no puede frenarse porque nadie está mirando la pantalla.
const NotasDeVenta = {
    _KEY: 'sc_notas_venta',
    SEGUNDOS_POR_DEFECTO: 40,
    // Tres períodos seguidos en cero y se deja de preguntar por ese cliente.
    // Con 500 contribuyentes, preguntar por los que nunca usan notas de venta
    // es lo que haría inservible al interruptor.
    CEROS_PARA_DEJAR_DE_PREGUNTAR: 3,

    // ENCENDIDO por defecto desde el 06-sep-2026, a pedido del usuario.
    //
    // Nació apagado por miedo a trabar un lote de 27, pero ese miedo ya está
    // resuelto por otras dos piezas: la pregunta se resuelve sola por
    // temporizador —un silencio vale `null`, que no escribe nada— y tres
    // períodos en cero apagan la pregunta para ese contribuyente. Apagado, el
    // 508 y el 117 no se declaraban nunca y nadie se enteraba.
    ARRANCA_ENCENDIDO: true,

    async _estado() {
        const porOmision = () => ({
            encendido: this.ARRANCA_ENCENDIDO,
            segundos: this.SEGUNDOS_POR_DEFECTO,
            porCliente: {}
        });
        try {
            return (await SafeStorage.get([this._KEY]))[this._KEY] || porOmision();
        } catch (e) {
            return porOmision();
        }
    },

    async _guardar(e) {
        try { await SafeStorage.set({ [this._KEY]: e }); return true; } catch (err) { return false; }
    },

    async estaEncendido() { return !!(await this._estado()).encendido; },

    async alternar() {
        const e = await this._estado();
        e.encendido = !e.encendido;
        await this._guardar(e);
        console.log(`📒 [NOTAS DE VENTA] Interruptor ${e.encendido ? 'ENCENDIDO' : 'apagado'}.`);
        return e.encendido;
    },

    /**
     * ¿Hay que preguntarle a este cliente?
     *
     * No, si el interruptor está apagado o si este contribuyente ya demostró
     * que no usa notas de venta.
     */
    async debePreguntar(ruc) {
        const e = await this._estado();
        if (!e.encendido) return false;
        const c = e.porCliente[String(ruc || '')];
        return !(c && c.noUsa);
    },

    /** Lo que se cargó para este cliente y período, o null. */
    async saber(ruc, periodo) {
        const e = await this._estado();
        const c = e.porCliente[String(ruc || '')];
        return (c && c.periodos && c.periodos[periodo]) || null;
    },

    /**
     * Guarda lo que dijo el contador para un período.
     *
     * Dos ceros seguidos no dicen nada; tres sí: este contribuyente no usa
     * notas de venta y no hace falta seguir preguntándole.
     *
     * @param {string} ruc
     * @param {string} periodo 'YYYY-MM'
     * @param {{monto: number, cantidad: number}} datos
     */
    async guardar(ruc, periodo, datos) {
        const r = String(ruc || '');
        if (!r || !periodo) return false;

        const e = await this._estado();
        const c = e.porCliente[r] || { noUsa: false, ceros: 0, periodos: {} };

        const monto = Number(datos && datos.monto) || 0;
        const cantidad = Math.round(Number(datos && datos.cantidad) || 0);
        c.periodos[periodo] = { monto, cantidad, cuando: Date.now() };

        if (monto === 0 && cantidad === 0) {
            c.ceros = (c.ceros || 0) + 1;
            if (c.ceros >= this.CEROS_PARA_DEJAR_DE_PREGUNTAR) {
                c.noUsa = true;
                console.log(`📒 [NOTAS DE VENTA] ${r}: ${c.ceros} períodos en cero. Dejo de preguntarle.`);
            }
        } else {
            c.ceros = 0;
            c.noUsa = false;
        }

        e.porCliente[r] = c;
        return this._guardar(e);
    },

    /** Vuelve a preguntarle a un cliente que se había marcado como que no usa. */
    async volverAPreguntar(ruc) {
        const e = await this._estado();
        const c = e.porCliente[String(ruc || '')];
        if (!c) return false;
        c.noUsa = false;
        c.ceros = 0;
        return this._guardar(e);
    },

    /**
     * Le pregunta al contador, con temporizador.
     *
     * Devuelve lo que haya cargado, o **null si nadie contestó**. Un null acá
     * significa «no sé», no «cero»: quien lo reciba no escribe nada.
     *
     * La pregunta se dibuja en el HUD, no con un `confirm()`: un diálogo del
     * navegador congela la página y el lote entero se queda ahí.
     *
     * @param {string} ruc
     * @param {string} nombre
     * @param {string} periodo
     * @returns {Promise<{monto, cantidad}|null>}
     */
    async preguntar(ruc, nombre, periodo) {
        const e = await this._estado();
        const segundos = Math.max(10, Number(e.segundos) || this.SEGUNDOS_POR_DEFECTO);

        if (typeof SriLoopHUD === 'undefined' || !SriLoopHUD.preguntarNotasDeVenta) {
            console.warn('📒 [NOTAS DE VENTA] No hay dónde preguntar: sigo sin tocar el 508 ni el 117.');
            return null;
        }

        const r = await SriLoopHUD.preguntarNotasDeVenta({ ruc, nombre, periodo, segundos });
        if (!r) {
            console.log(`📒 [NOTAS DE VENTA] Nadie contestó en ${segundos}s. ` +
                        'El 508 y el 117 quedan sin tocar, que es lo correcto: no se inventa un cero.');
            return null;
        }
        await this.guardar(ruc, periodo, r);
        return r;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// EL CATASTRO DEL SRI
// ═══════════════════════════════════════════════════════════════════════════
// El padrón público, reducido a lo único que hace falta para SUGERIR a qué se
// dedica un proveedor: RUC, código CIIU, estado y si es agente de retención.
//
// Se trae bajo demanda, igual que jsPDF: son 6 MB y no tienen por qué estar en
// cada página del SRI. Y no se arma un Map de 283.000 entradas — el archivo
// viene ordenado y de ancho fijo, así que se busca por bisección sobre el
// texto. Una consulta son ~18 comparaciones.
//
// **Acá no se decide nada.** Lo que sale entra a la base de proveedores con
// origen 'catastro', y por la regla de la §7 una sugerencia jamás pisa una
// decisión del contador.
const Catastro = {
    _ANCHO: 23,          // 13 RUC + 7 CIIU + 1 estado + 1 agente + salto
    _texto: null,
    _ciiu: null,
    _cargando: null,

    ESTADOS: { A: 'ACTIVO', S: 'SUSPENDIDO', P: 'PASIVO' },

    /** Trae los dos archivos una sola vez. Devuelve false si no están. */
    async cargar() {
        if (this._texto) return true;
        if (this._cargando) return this._cargando;

        this._cargando = (async () => {
            try {
                const url = (p) => chrome.runtime.getURL(p);
                const [t, c] = await Promise.all([
                    fetch(url('vendor/catastro_eloro.txt')).then((r) => r.ok ? r.text() : null),
                    fetch(url('vendor/ciiu.json')).then((r) => r.ok ? r.json() : null)
                ]);
                if (!t) {
                    console.warn('🗂️ [CATASTRO] No está vendor/catastro_eloro.txt. ' +
                                 'Se genera con el script del proyecto a partir del ZIP del SRI.');
                    return false;
                }
                this._texto = t;
                this._ciiu = c || {};
                const n = Math.floor(this._texto.length / this._ANCHO);
                console.log(`🗂️ [CATASTRO] ${n.toLocaleString('es-EC')} RUC cargados.`);
                return true;
            } catch (e) {
                console.warn('🗂️ [CATASTRO] No se pudo cargar:', e.message);
                return false;
            } finally {
                this._cargando = null;
            }
        })();
        return this._cargando;
    },

    /**
     * Busca un RUC por bisección sobre el texto de ancho fijo.
     *
     * @param {string} ruc
     * @returns {{ruc, ciiu, actividad, estado, activo, agenteRetencion}|null}
     */
    buscar(ruc) {
        const limpio = String(ruc || '').replace(/\D/g, '');
        if (limpio.length !== 13 || !this._texto) return null;

        const A = this._ANCHO;
        let lo = 0, hi = Math.floor(this._texto.length / A) - 1;
        while (lo <= hi) {
            const medio = (lo + hi) >> 1;
            const p = medio * A;
            const clave = this._texto.substr(p, 13);
            if (clave === limpio) {
                const ciiu = this._texto.substr(p + 13, 7).trim();
                const est = this._texto.charAt(p + 20);
                return {
                    ruc: limpio,
                    ciiu,
                    actividad: (this._ciiu && this._ciiu[ciiu]) || '',
                    estado: this.ESTADOS[est] || 'DESCONOCIDO',
                    activo: est === 'A',
                    agenteRetencion: this._texto.charAt(p + 21) === 'S'
                };
            }
            if (clave < limpio) lo = medio + 1; else hi = medio - 1;
        }
        return null;
    },

    /** Cuántos RUC tiene cargados. 0 si no se cargó. */
    cuantos() {
        return this._texto ? Math.floor(this._texto.length / this._ANCHO) : 0;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// LA BASE DE PROVEEDORES
// ═══════════════════════════════════════════════════════════════════════════
// El bot mete todas las compras en un solo bloque, pero la declaración separa
// lo deducible de lo no deducible según la ACTIVIDAD del proveedor. Lo que
// falta no es lógica: es saber a qué se dedica cada RUC.
//
// Se aprende una vez y sirve para siempre. Un proveedor clasificado sirve para
// todos los clientes que le compren, y en un estudio los proveedores se repiten
// muchísimo: la base se llena sola en los primeros meses.
//
// La misma pregunta la hacen tres extensiones —IVA, anexo de gastos personales
// y devolución de tercera edad— y hoy cada una la resuelve por su cuenta.
//
// **Acá NO se decide nada.** Esto guarda lo que se aprende; qué compra es
// deducible es criterio contable y lo pone el contador.
const Proveedores = {
    _KEY: 'sc_proveedores',
    // Guardar los 500 clientes de un proveedor no sirve para nada y ocupa.
    // Con saber que le compran muchos alcanza.
    _TOPE_CLIENTES: 40,

    async _todos() {
        try { return (await SafeStorage.get([this._KEY]))[this._KEY] || {}; }
        catch (e) { return {}; }
    },

    /**
     * Anota que este RUC emitió un comprobante. No clasifica: solo recuerda.
     *
     * @param {string} ruc RUC del emisor (13 dígitos).
     * @param {string} nombre Razón social, tal como la da el portal.
     * @param {string} clienteRuc A quién le facturó.
     */
    async registrar(ruc, nombre, clienteRuc) {
        const limpio = String(ruc || '').replace(/\D/g, '');
        if (limpio.length !== 13) return false;

        const base = await this._todos();
        const previo = base[limpio] || {
            nombre: '', actividad: null, deducible: null, origen: null,
            vistoEn: [], veces: 0, primero: Date.now()
        };

        // El nombre puede llegar vacío desde la tabla y completo desde el TXT:
        // se queda el más informativo, nunca se pisa uno bueno con uno vacío.
        const nom = String(nombre || '').trim();
        if (nom.length > (previo.nombre || '').length) previo.nombre = nom.slice(0, 120);

        previo.veces = (previo.veces || 0) + 1;
        previo.ultimo = Date.now();

        const cli = String(clienteRuc || '').replace(/\D/g, '');
        if (cli.length === 13 && !previo.vistoEn.includes(cli) &&
            previo.vistoEn.length < this._TOPE_CLIENTES) {
            previo.vistoEn.push(cli);
        }

        base[limpio] = previo;
        try { await SafeStorage.set({ [this._KEY]: base }); } catch (e) { return false; }
        return true;
    },

    /**
     * Registra varios de una. Una sola escritura, no una por comprobante.
     *
     * @param {Array<{rucEmisor?: string, ruc?: string, razonSocial?: string,
     *                rucRazon?: string, nombre?: string}>} lista
     * @param {string} clienteRuc
     * @returns {Promise<number>} cuántos RUC distintos quedaron anotados.
     */
    async registrarLote(lista, clienteRuc) {
        if (!Array.isArray(lista) || !lista.length) return 0;

        const base = await this._todos();
        const cli = String(clienteRuc || '').replace(/\D/g, '');
        const nuevos = new Set();

        lista.forEach((f) => {
            // La tabla del portal da "RUC Razón social" pegados; el TXT los da
            // separados. Se acepta cualquiera de las dos formas.
            let ruc = String(f.rucEmisor || f.ruc || '').replace(/\D/g, '');
            let nombre = String(f.razonSocial || f.nombre || '').trim();
            if (ruc.length !== 13 && f.rucRazon) {
                const m = String(f.rucRazon).match(/\b(\d{13})\b/);
                if (m) {
                    ruc = m[1];
                    if (!nombre) nombre = String(f.rucRazon).replace(m[1], '').trim();
                }
            }
            if (ruc.length !== 13) return;

            const previo = base[ruc] || {
                nombre: '', actividad: null, deducible: null, origen: null,
                vistoEn: [], veces: 0, primero: Date.now(),
                // A qué tarifa factura este proveedor, contado de lo que se ve.
                // No es un dato que haya que preguntar: está en cada factura.
                tarifas: {}
            };
            if (!base[ruc]) nuevos.add(ruc);

            const nom = nombre.replace(/^[\s\-·|]+/, '').trim();
            if (nom.length > (previo.nombre || '').length) previo.nombre = nom.slice(0, 120);

            previo.veces = (previo.veces || 0) + 1;
            previo.ultimo = Date.now();

            // La tarifa se deduce del cociente IVA/base, igual que en el
            // llenado. Se cuenta, no se promedia: un proveedor puede facturar
            // al 15% y al 5% —materiales y obra— y las dos cosas son ciertas.
            if (typeof clasificarTarifaIva === 'function' &&
                typeof f.valorSinImpuestos === 'number') {
                let t;
                try { t = clasificarTarifaIva(f.valorSinImpuestos, f.iva || 0).tarifa; }
                catch (e) { t = undefined; }
                const clave = (t === null || t === undefined) ? '?' : String(t);
                previo.tarifas = previo.tarifas || {};
                previo.tarifas[clave] = (previo.tarifas[clave] || 0) + 1;
            }
            if (cli.length === 13 && !previo.vistoEn.includes(cli) &&
                previo.vistoEn.length < this._TOPE_CLIENTES) {
                previo.vistoEn.push(cli);
            }
            base[ruc] = previo;
        });

        try { await SafeStorage.set({ [this._KEY]: base }); } catch (e) { return 0; }
        if (nuevos.size) console.log(`🏷️ [PROVEEDORES] ${nuevos.size} proveedor(es) nuevo(s) anotado(s).`);
        return nuevos.size;
    },

    /**
     * Junta los TRES datos que deciden si una compra da crédito tributario.
     *
     * **No decide.** Junta. El crédito tributario no es una propiedad del
     * proveedor: sale de la tarifa, de a qué se dedica el proveedor y de a qué
     * se dedica el cliente —porque una compra da crédito cuando alimenta una
     * actividad que a su vez está gravada—. Con `deducible` colgando sólo del
     * RUC del proveedor, la misma factura daba la misma respuesta para un
     * constructor y para una peluquería, y eso es falso.
     *
     * Lo dijo el usuario el 06-sep-2026 y por eso existe esto.
     *
     * @param {string} rucProveedor Quien emitió la factura.
     * @param {string} rucCliente El contribuyente que la recibió.
     * @returns {Promise<object>} Los tres datos, la decisión si alguien la tomó
     *   (o `null`), y los avisos que valga la pena mirar.
     */
    async porQueDecidir(rucProveedor, rucCliente) {
        const rp = String(rucProveedor || '').replace(/\D/g, '');
        const rc = String(rucCliente || '').replace(/\D/g, '');
        const p = (await this._todos())[rp] || null;

        // El catastro está en disco: preguntarle no cuesta una petición.
        let cat = null, catCliente = null;
        if (typeof Catastro !== 'undefined') {
            try {
                if (await Catastro.cargar()) {
                    cat = Catastro.buscar(rp);
                    catCliente = Catastro.buscar(rc);
                }
            } catch (e) { /* sin catastro se sigue, con menos datos */ }
        }

        const tarifas = (p && p.tarifas) || {};
        const avisos = [];

        // El 5%: el usuario avisó que esa tarifa es del sector construcción.
        // Queda anotado como lo que es —lo que dijo él, no una lectura de la
        // ley— y sirve para que salte a la vista, no para decidir por nadie.
        if (tarifas['5']) {
            avisos.push(
                `Facturó al 5% en ${tarifas['5']} comprobante(s). Según el usuario esa tarifa ` +
                'es del sector construcción: confirmá que la actividad del proveedor y la del ' +
                'cliente la justifiquen antes de darle crédito tributario.');
        }
        if (tarifas['?']) {
            avisos.push(`${tarifas['?']} comprobante(s) suyos quedaron sin tarifa reconocible.`);
        }
        if (cat && !cat.activo) {
            avisos.push(`El catastro lo da como ${cat.estado} y sigue emitiendo.`);
        }
        if (!catCliente) {
            avisos.push('No se sabe a qué se dedica el CLIENTE: sin eso no se puede juzgar ' +
                        'si la compra es compatible con su actividad.');
        }

        return {
            proveedor: {
                ruc: rp,
                nombre: (p && p.nombre) || '',
                actividad: (p && p.actividad) || (cat && cat.actividad) || null,
                ciiu: (cat && cat.ciiu) || null,
                estado: (cat && cat.estado) || null
            },
            cliente: {
                ruc: rc,
                actividad: (catCliente && catCliente.actividad) || null,
                ciiu: (catCliente && catCliente.ciiu) || null
            },
            tarifas,
            // `null` es «nadie lo decidió», y no se convierte en un sí ni en un
            // no. Es la misma regla de todo el proyecto.
            credito: p ? (p.deducible === undefined ? null : p.deducible) : null,
            origen: (p && p.origen) || null,
            avisos
        };
    },

    /** Lo que se sabe de un RUC, o null si nunca se lo vio. */
    async saber(ruc) {
        const limpio = String(ruc || '').replace(/\D/g, '');
        const base = await this._todos();
        return base[limpio] ? { ruc: limpio, ...base[limpio] } : null;
    },

    /**
     * Clasifica un proveedor.
     *
     * **Una suposición nunca pisa lo que confirmó el contador.** El `origen` no
     * es decoración: es la misma regla de todo el proyecto —nunca presentar
     * como dato lo que es una suposición—. Sólo otra decisión del usuario puede
     * cambiar una decisión del usuario.
     *
     * @param {string} ruc
     * @param {{actividad?: string, deducible?: boolean, origen: string}} datos
     *        origen: 'usuario' | 'catastro' | 'sugerido' | 'ia'
     * @returns {Promise<boolean>} false si se rechazó por no pisar al usuario.
     */
    async clasificar(ruc, datos = {}) {
        const limpio = String(ruc || '').replace(/\D/g, '');
        if (limpio.length !== 13) return false;

        const base = await this._todos();
        const previo = base[limpio];
        if (!previo) {
            console.warn(`🏷️ [PROVEEDORES] ${limpio} no está en la base: primero hay que verlo en una factura.`);
            return false;
        }

        const origen = datos.origen || 'sugerido';
        if (previo.origen === 'usuario' && origen !== 'usuario') {
            console.warn(`🏷️ [PROVEEDORES] ${limpio} ya lo clasificó el contador. ` +
                         `Una sugerencia (${origen}) no lo pisa.`);
            return false;
        }

        if (datos.actividad !== undefined) previo.actividad = datos.actividad;
        if (datos.deducible !== undefined) previo.deducible = datos.deducible;
        previo.origen = origen;
        previo.clasificado = Date.now();

        base[limpio] = previo;
        try { await SafeStorage.set({ [this._KEY]: base }); } catch (e) { return false; }
        return true;
    },

    /**
     * Los que faltan clasificar, los más frecuentes primero.
     *
     * El orden importa: clasificar el proveedor que aparece en 200 facturas
     * rinde doscientas veces más que el que aparece en una.
     */
    async pendientes(tope = 200) {
        const base = await this._todos();
        return Object.keys(base)
            .filter((r) => base[r].origen === null || base[r].deducible === null)
            .map((r) => ({ ruc: r, ...base[r] }))
            .sort((a, b) => (b.veces || 0) - (a.veces || 0))
            .slice(0, tope);
    },

    async resumen() {
        const base = await this._todos();
        const rucs = Object.keys(base);
        const porOrigen = {};
        rucs.forEach((r) => {
            const o = base[r].origen || 'sin clasificar';
            porOrigen[o] = (porOrigen[o] || 0) + 1;
        });
        return {
            total: rucs.length,
            clasificados: rucs.filter((r) => base[r].origen !== null).length,
            porOrigen,
            comprobantes: rucs.reduce((a, r) => a + (base[r].veces || 0), 0)
        };
    },

    /** Texto para copiar y revisar afuera. Sin datos de los clientes. */
    async exportar() {
        const base = await this._todos();
        const filas = Object.keys(base).sort((a, b) => (base[b].veces || 0) - (base[a].veces || 0));
        return ['RUC\tRAZON_SOCIAL\tACTIVIDAD\tDEDUCIBLE\tORIGEN\tCOMPROBANTES\tCLIENTES']
            .concat(filas.map((r) => {
                const p = base[r];
                return [r, p.nombre || '', p.actividad || '',
                        p.deducible === null || p.deducible === undefined ? '' : (p.deducible ? 'SI' : 'NO'),
                        p.origen || 'sin clasificar', p.veces || 0,
                        (p.vistoEn || []).length].join('\t');
            })).join('\n');
    },

    async olvidarTodo() {
        try { await SafeStorage.remove(this._KEY); return true; } catch (e) { return false; }
    },

    /**
     * Le pide a la IA la categoría de los proveedores que quedaron sin nada.
     *
     * **Es el último escalón de la cascada**, y a propósito:
     *
     *   1. lo que decidió el contador  → manda, gratis, instantáneo
     *   2. el catastro del SRI         → sugiere, gratis, en disco
     *   3. la IA                       → sugiere, cuesta y sale de casa
     *
     * Por eso sólo se le pregunta por los que llegaron hasta acá sin categoría.
     * Y lo que ella confirme se guarda: al mes siguiente ese proveedor ya no
     * cuesta nada. Con 500 contribuyentes los proveedores se repiten muchísimo,
     * así que el gasto tiende a cero solo.
     *
     * Sale por el service worker: la clave no tiene por qué estar dentro de la
     * página del SRI, y un fetch del content script está sujeto a CORS.
     *
     * @param {{tope?: number, modelo?: string}} opciones
     * @returns {Promise<{preguntados, sugeridos, error?: string}>}
     */
    async sugerirDesdeIA(opciones = {}) {
        const { tope = 40, modelo } = opciones;
        const informe = { preguntados: 0, sugeridos: 0 };

        const base = await this._todos();
        // Sólo los que nadie pudo resolver antes, y los más frecuentes
        // primero: si hay que gastar, que sea en los que más rinden.
        const candidatos = Object.keys(base)
            .filter((r) => base[r].origen !== 'usuario' && !base[r].categoria)
            .sort((a, b) => (base[b].veces || 0) - (base[a].veces || 0))
            .slice(0, tope);

        if (!candidatos.length) return informe;

        // Lo ÚNICO que sale: el nombre y la actividad pública del catastro.
        // Ni el RUC del proveedor, ni el del cliente, ni un importe.
        const nombres = candidatos.map((r) => base[r].nombre || '(sin nombre)');
        const actividades = candidatos.map((r) => base[r].actividad || '');
        informe.preguntados = candidatos.length;

        let r;
        try {
            r = await chrome.runtime.sendMessage({
                tipo: 'SC_CLASIFICAR_IA', nombres, actividades, modelo
            });
        } catch (e) {
            informe.error = 'No se pudo hablar con el service worker: ' + e.message;
            return informe;
        }

        if (!r || !r.ok) {
            informe.error = (r && r.error) || 'La IA no contestó.';
            console.warn('🤖 [IA] ' + informe.error);
            return informe;
        }

        let toco = false;
        candidatos.forEach((ruc, i) => {
            const cat = r.categorias[i];
            // «ninguna» es una respuesta honesta —«no sé»— y no se guarda como
            // si fuera una clasificación.
            if (!cat || cat === 'ninguna') return;
            base[ruc].categoria = cat;
            base[ruc].origen = 'ia';
            base[ruc].clasificado = Date.now();
            informe.sugeridos++;
            toco = true;
        });

        if (toco) { try { await SafeStorage.set({ [this._KEY]: base }); } catch (e) { /* nada */ } }
        console.log(`🤖 [IA] ${informe.sugeridos} de ${informe.preguntados} clasificados. ` +
                    'Son SUGERENCIAS: quedan marcadas como tales hasta que las confirmes.');
        return informe;
    },

    /**
     * Completa la actividad de los proveedores con lo que dice el catastro.
     *
     * **Sólo la actividad.** El catastro dice a qué se dedica un RUC; NO dice
     * si esa compra es deducible — eso depende del gasto y lo decide el
     * contador. Poner `deducible` desde acá sería exactamente inventar un dato.
     *
     * Queda con `origen: 'catastro'`, así que se ve que es una sugerencia y no
     * pisa nada que haya decidido el usuario.
     *
     * @returns {Promise<{mirados, sugeridos, sinDatos, inactivos: Array}>}
     */
    async sugerirDesdeCatastro() {
        const informe = { mirados: 0, sugeridos: 0, sinDatos: 0, inactivos: [] };
        if (typeof Catastro === 'undefined' || !(await Catastro.cargar())) return informe;

        const base = await this._todos();
        let toco = false;

        for (const ruc of Object.keys(base)) {
            const p = base[ruc];
            // Lo que decidió el contador no se toca, ni para completarlo.
            if (p.origen === 'usuario') continue;
            informe.mirados++;

            const c = Catastro.buscar(ruc);
            if (!c) { informe.sinDatos++; continue; }

            if (c.actividad && p.actividad !== c.actividad) {
                p.actividad = c.actividad;
                p.ciiu = c.ciiu;
                p.origen = 'catastro';
                p.clasificado = Date.now();
                informe.sugeridos++;
                toco = true;
            }

            // El aviso que protege la firma: un proveedor que figura suspendido
            // o pasivo y sigue emitiendo es una compra que el SRI puede objetar.
            if (!c.activo) {
                p.estadoSri = c.estado;
                toco = true;
                informe.inactivos.push({ ruc, nombre: p.nombre, estado: c.estado, veces: p.veces });
            } else if (p.estadoSri) {
                delete p.estadoSri;
                toco = true;
            }
        }

        if (toco) { try { await SafeStorage.set({ [this._KEY]: base }); } catch (e) { /* nada */ } }

        console.log(`🗂️ [CATASTRO] ${informe.sugeridos} actividad(es) sugerida(s) de ${informe.mirados} miradas · ` +
                    `${informe.sinDatos} sin datos · ${informe.inactivos.length} no activo(s).`);
        return informe;
    }
};

/**
 * Deja constancia de compras cuya tarifa no se pudo llevar a un casillero.
 *
 * Dos casos distintos caen acá:
 *  - Plata al 5% que no encontró el 540 o el 550 en el DOM.
 *  - Facturas cuyo cociente IVA/base no coincide con ninguna tarifa: casi
 *    siempre son de tarifa mezclada, y desde la tabla de recibidos no hay
 *    forma de partirlas. Eso lo decide el contador, no el bot.
 *
 * Se guarda en `iva_sin_ubicar` para que el cierre mágico lo lea antes de
 * enviar. Sin motivos, la llave se borra: una corrida limpia no puede quedar
 * frenada por la anterior.
 *
 * @param {string[]} problemas Casilleros que no aparecieron, ya redactados.
 * @param {Array<Object>} ambiguas Facturas sin tarifa reconocible.
 */
async function anotarIvaSinUbicar(problemas = [], ambiguas = []) {
    const motivos = [].concat(problemas || []).filter(Boolean);

    (ambiguas || []).forEach((f) => {
        motivos.push(`factura ${f.numero} (${f.rucRazon}): base $${f.base} con IVA $${f.iva} — ${f.motivo}`);
    });

    if (motivos.length === 0) {
        try { await SafeStorage.remove('iva_sin_ubicar'); } catch (e) { /* nada que borrar */ }
        return false;
    }

    console.error('🛑 [IVA SIN UBICAR] Hay compras que no se pudieron declarar en su casillero:');
    motivos.forEach((m) => console.error('   · ' + m));

    try {
        await SafeStorage.set({
            iva_sin_ubicar: { motivos, cuando: new Date().toISOString() }
        });
    } catch (e) { /* si no se puede guardar, igual quedó el error en consola */ }

    if (typeof anotarBitacora === 'function') {
        anotarBitacora('⚠ IVA sin ubicar', motivos.length + ' caso(s)');
    }
    return true;
}

/**
 * Corta el envío si quedó plata sin casillero. Mismo criterio que la
 * sustitutiva: ante la duda no se manda, se guarda borrador y decide el
 * contador. Una declaración mal repartida entre casilleros de IVA cambia el
 * crédito tributario, así que el silencio acá cuesta plata.
 *
 * @returns {Promise<boolean>} true si hay que frenar.
 */
async function frenarSiHayIvaSinUbicar(donde = '') {
    let pendiente = null;
    try {
        pendiente = (await SafeStorage.get(['iva_sin_ubicar'])).iva_sin_ubicar;
    } catch (e) { return false; }

    if (!pendiente || !Array.isArray(pendiente.motivos) || pendiente.motivos.length === 0) return false;

    console.error(`🛑 [IVA SIN UBICAR] No se envía${donde ? ' (' + donde + ')' : ''}: ` +
                  `${pendiente.motivos.length} caso(s) de compras sin casillero.`);
    pendiente.motivos.forEach((m) => console.error('   · ' + m));

    if (typeof anotarBitacora === 'function') {
        anotarBitacora('⛔ no se envió', 'compras sin casillero (IVA sin ubicar)');
    }

    if (window.sriAssistant && window.sriAssistant.showEliteToast) {
        window.sriAssistant.showEliteToast({
            title: '🛑 Compras sin casillero',
            msg: 'Hay compras cuya tarifa de IVA no se pudo ubicar:<br>· ' +
                 pendiente.motivos.map((m) => escapeHtml(String(m))).join('<br>· ') +
                 '<br><br>El formulario queda lleno y sin enviar. Repartirlas es decisión tuya.',
            duration: 20000
        });
    }
    return true;
}

function anotarBitacora(evento, detalle = '') {
    try { return Bitacora.anotar(evento, detalle); } catch (e) { /* aún no existe */ }
}

const Bitacora = {
    _KEY: 'sc_bitacora',
    MAX: 400,

    async anotar(evento, detalle = '') {
        try {
            const r = await SafeStorage.get([this._KEY, 'pending_sri_autofill']);
            const lista = Array.isArray(r[this._KEY]) ? r[this._KEY] : [];
            const af = r.pending_sri_autofill || {};

            let sem = {};
            try { sem = await SriLoop.get(); } catch (e) {}

            lista.push({
                t: Date.now(),
                evento,
                detalle: String(detalle).slice(0, 200),
                url: location.pathname.split('/').slice(-1)[0] || location.pathname,
                cliente: af.name || '',
                paso: (sem.cola && sem.cola.length) ? `${(sem.indice || 0) + 1}/${sem.cola.length}` : '',
                estado: sem.estado || ''
            });

            while (lista.length > this.MAX) lista.shift();
            await SafeStorage.set({ [this._KEY]: lista });
        } catch (e) { /* nunca romper el flujo por anotar */ }
    },

    async texto() {
        const r = await SafeStorage.get([this._KEY]);
        const lista = Array.isArray(r[this._KEY]) ? r[this._KEY] : [];
        if (!lista.length) return '(bitácora vacía)';

        const hora = (t) => new Date(t).toLocaleTimeString('es-EC', { hour12: false });
        const filas = lista.map((e, i) => {
            const dt = i === 0 ? 0 : Math.round((e.t - lista[i - 1].t) / 1000);
            const salto = dt >= 8 ? `  ⏱️+${dt}s` : '';
            const quien = e.cliente ? ` · ${e.cliente.split(' ').slice(0, 2).join(' ')}` : '';
            const paso = e.paso ? ` [${e.paso}]` : '';
            return `${hora(e.t)}${paso}  ${e.evento}${e.detalle ? ': ' + e.detalle : ''}${quien}${salto}`;
        });

        const dur = Math.round((lista[lista.length - 1].t - lista[0].t) / 1000);
        return [
            `BITÁCORA — ${lista.length} hitos en ${Math.floor(dur / 60)}m ${dur % 60}s`,
            `build ${typeof SC_BUILD !== 'undefined' ? SC_BUILD : '?'}`,
            '─'.repeat(70),
            ...filas
        ].join('\n');
    },

    async limpiar() {
        await SafeStorage.remove([this._KEY]);
        console.log('🧹 Bitácora vaciada.');
    }
};

if (typeof window !== 'undefined') {
    window.sriBitacora = async () => { console.log(await Bitacora.texto()); };
    window.sriBitacoraTexto = () => Bitacora.texto();
    window.sriBitacoraLimpiar = () => Bitacora.limpiar();
}

const findByText = (text, tag = '*') => {
    const upperText = text.toUpperCase();
    // ELITE 2.0: Buscamos el nodo más profundo que contenga el texto.
    // Usamos normalize-space para limpiar espacios extra y translate para insensibilidad a mayúsculas.
    const xpath = `//${tag}[not(ancestor::div[@id="sri-assistant-panel-root"])][contains(translate(normalize-space(.), 'abcdefghijklmnopqrstuvwxyzáéíóú', 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ'), '${upperText}')]`;
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

    let candidates = [];
    for (let i = 0; i < result.snapshotLength; i++) {
        const el = result.snapshotItem(i);
        // Filtramos contenedores base y elementos invisibles
        // El XPath excluye el panel, pero no alcanzaba: el HUD del bucle
        // también dibuja texto («⏭️ Pasar al siguiente» del plan de vuelo) y
        // el bot lo encontraba buscando el «Siguiente» del portal.
        if (esVisible(el)
            && !['SCRIPT', 'STYLE', 'HTML', 'BODY', 'SRI-ROOT'].includes(el.tagName)
            && !esDeLaExtension(el)) {
            candidates.push(el);
        }
    }

    if (candidates.length === 0) {
        // Silencioso a propósito: se llama en bucles de escaneo y llenaba la
        // consola. Para verlo: window.sriDebug = true
        if (typeof window !== 'undefined' && window.sriDebug) {
            console.log(`🔎 findByText("${text}"): 0 candidatos.`);
        }
        return null;
    }

    // El mejor es el nodo que tiene el texto más corto (el más específico)
    const bestMatch = candidates.sort((a, b) => {
        const textA = (a.innerText || a.textContent || '').trim();
        const textB = (b.innerText || b.textContent || '').trim();
        return textA.length - textB.length;
    })[0];

    console.log(`🎯 findByText("${text}") -> `, bestMatch);
    return bestMatch;
};

// esVisible(el) está declarada como función global en 01_utilidades_y_pdf.js

/** La versión del portal contra la que están calibrados los selectores. */
const SRI_VERSION_CALIBRADA = '4.5.0-20200210';

/**
 * El canario de la Biblia: <body id="sribody" version="…">.
 * Si el SRI cambia de versión, cada id fijo de la Matriz Tatuada pasa a ser
 * una suposición. Mejor enterarse el primer día.
 */
async function revisarVersionDelPortal() {
    const body = document.getElementById('sribody') || document.body;
    const v = body && body.getAttribute && body.getAttribute('version');
    if (!v || v === SRI_VERSION_CALIBRADA) return v || null;

    console.warn(`🐤 [CANARIO] El portal del SRI cambió de versión: ${SRI_VERSION_CALIBRADA} → ${v}. ` +
                 'Los selectores fijos están calibrados contra la anterior: revisá la Biblia antes de confiar en un lote largo.');
    try {
        const k = 'sc_version_portal_avisada';
        const previo = (await SafeStorage.get([k]))[k];
        if (previo !== v) {                       // una sola vez por versión
            await SafeStorage.set({ [k]: v });
            if (typeof anotarBitacora === 'function') {
                await anotarBitacora('🐤 versión del portal cambió', `${SRI_VERSION_CALIBRADA} → ${v}`);
            }
        }
    } catch (e) { /* avisar nunca puede frenar nada */ }
    return v;
}

/**
 * ¿Está arriba el velo que JSF/PrimeFaces levanta durante un AJAX?
 * Mientras esté, cualquier clic se lo come él.
 */
function veloAjaxArriba() {
    const velos = ['disablingDiv', 'noSoportado'];
    for (const id of velos) {
        const el = document.getElementById(id);
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') return true;
    }
    return false;
}

/**
 * Espera a que baje el velo de AJAX y recién entonces clickea.
 * Para los pasos donde perder el clic cuesta una recarga entera.
 *
 * @returns {Promise<boolean>} false si el velo no bajó y no se clickeó.
 */
async function clickCuandoSePueda(el, name, esperaMs = 8000) {
    const hasta = Date.now() + esperaMs;
    while (veloAjaxArriba() && Date.now() < hasta) await sleep(250);
    if (veloAjaxArriba()) {
        console.warn(`⚠️ [AJAX] El velo siguió arriba ${Math.round(esperaMs / 1000)}s. No clickeo "${name}".`);
        return false;
    }
    return clickElement(el, name);
}

const clickElement = (el, name) => {
    if (!el) {
        GhostBlackBox.add('CLICK_NULL', `Intento de clic fallido: ${name} (element null)`);
        console.warn(`❌ No se pudo clickear: ${name} (Elemento null)`);
        return false;
    }
    // El velo de AJAX se come el clic: pulsar debajo no hace nada. Antes se
    // avisaba y se clickeaba igual, devolviendo true; quien llamaba seguía
    // creyendo que el botón se pulsó. Ahora se dice que no se pudo.
    if (veloAjaxArriba()) {
        GhostBlackBox.add('CLICK_VELADO', `Clic no realizado por overlay AJAX: ${name}`);
        console.warn(`⚠️ [AJAX] El velo de PrimeFaces está arriba: NO clickeo "${name}" porque el clic se perdería. ` +
                     'Usá clickCuandoSePueda() si hay que esperarlo.');
        return false;
    }
    GhostBlackBox.add('CLICK', `Clic en: ${name}`, { tag: el.tagName, id: el.id || 'sin-id', text: (el.innerText || '').trim().substring(0, 30) });
    console.log(`✅ Clickeando: ${name}`, el);
    const events = ['mouseover', 'mousedown', 'mouseup', 'click'];
    events.forEach(evtType => {
        el.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window }));
    });
    if (el.parentElement && (el.parentElement.tagName === 'BUTTON' || el.parentElement.tagName === 'A' || el.parentElement.className.includes('card'))) {
        el.parentElement.click();
    }
    return true;
};

async function waitForRecaptchaReady(timeout = 4000) {
    // Si no existe ningún elemento o iframe de reCAPTCHA en la página, no perder tiempo
    const hasRecaptcha = document.querySelector('iframe[src*="recaptcha"], div.g-recaptcha, [data-sitekey]');
    if (!hasRecaptcha) {
        return true;
    }

    // ELITE v13.1: Detección ultra-rápida. Si ya hay una tabla o el SRI está validado, no esperamos.
    if (document.querySelector('.ui-datatable-data tr') || document.querySelector('.sri-verified')) {
        return true;
    }

    console.log('🤖 Verificando reCAPTCHA...');
    return await waitFor(() => {
        const recaptchaIframe = document.querySelector('iframe[src*="recaptcha"]');
        return recaptchaIframe !== null;
    }, timeout, 'reCAPTCHA Ready');
}

// ============================================================
// GHOST MEMORY ENGINE (v1.0) - MULTI-USER PROTECTION
// ============================================================
const GhostMemory = {
    async getRuc() {
        const info = window.sriAssistant ? window.sriAssistant.extractClientInfo() : { ruc: null };
        if (info.ruc) return info.ruc;
        try {
            const stored = await SafeStorage.get(['lastRuc']);
            return stored.lastRuc || 'GHOST_USER';
        } catch (e) { return 'GHOST_USER'; }
    },

    async getKeys() {
        const ruc = await this.getRuc();
        return {
            facturas: `data_${ruc}_facturas`,
            retenciones: `data_${ruc}_retenciones`,
            notasCredito: `data_${ruc}_notasCredito`,
            workflowPeriod: `data_${ruc}_period`,
            workflowState: `data_${ruc}_workflowState`
        };
    },

    async getData() {
        const keys = await this.getKeys();
        const storageKeys = Object.values(keys);
        const res = await SafeStorage.get(storageKeys);
        return {
            facturas: res[keys.facturas],
            retenciones: res[keys.retenciones],
            notasCredito: res[keys.notasCredito],
            workflowPeriod: res[keys.workflowPeriod],
            workflowState: res[keys.workflowState]
        };
    },

    async set(key, value) {
        const keys = await this.getKeys();
        const storageKey = keys[key] || key;
        await SafeStorage.set({ [storageKey]: value });
        // ELITE FIX: También guardamos en la clave global para sincronía con el panel
        if (key === 'workflowPeriod') {
            await SafeStorage.set({ 'workflowPeriod': value });
        }
    },

    async remove(key) {
        const keys = await this.getKeys();
        const storageKey = keys[key] || key;
        await SafeStorage.remove([storageKey]);
    },

    async clearCurrent() {
        const keys = await this.getKeys();
        await SafeStorage.remove(Object.values(keys));
    }
};

const checkSessionAlive = async () => {
    const url = window.location.href.toLowerCase();
    const text = document.body.textContent.toLowerCase();

    // Detección de login / auth
    const isLoginPage = url.includes('login.jsf') ||
        url.includes('/auth/realms/') ||
        url.includes('protocol/openid-connect');

    return true;
};

// ELITE v9.6: Detector de Inconsistencia de Sesión (Cross-User Protection)
async function verifySessionConsistency() {
    const info = window.sriAssistant ? window.sriAssistant.extractClientInfo() : { ruc: null };
    if (!info.ruc || !info.highConfidence) return true;

    // Buscar RUC únicamente en la cabecera / barra de usuario autenticado (NUNCA en tablas de comprobantes)
    const headerContainers = Array.from(document.querySelectorAll('.area-usuario, .topbar, #nombreRuc, .nombre-contribuyente, label.titulo-perfil, #id_nombre_razon_social'));
    for (const container of headerContainers) {
        const text = container.textContent || '';
        const match = text.match(/\b\d{13}\b/);
        if (match && match[0] !== info.ruc) {
            console.warn(`🛑 Inconsistencia de cabecera: Header (${match[0]}) != Esperado (${info.ruc})`);
            return false;
        }
    }
    return true;
}

const waitFor = async (checkFn, timeoutMs = 8000, label = 'elemento') => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (!(await checkSessionAlive())) return null;

        if (await isPaused()) {
            await sleep(500);
            continue;
        }
        const res = await checkFn();
        if (res) return res;
        await sleep(100);
    }
    console.warn(`⏳ Timeout esperando: ${label}`);
    return null;
};

/**
 * Espera a que el SRI conteste un AJAX, en vez de contar hasta tres.
 *
 * Un `sleep(2500)` es una apuesta a dos puntas: sobra cuando el portal
 * responde en 300 ms —y eso, por 500 contribuyentes, son horas— y falta el día
 * que está cargado, y entonces el paso falla por impaciencia. Esto es al revés:
 * sigue apenas la respuesta llega, y aguanta más que antes si tarda.
 *
 * Tres tramos, en orden:
 *   1. Se le da un momento al velo de PrimeFaces para que aparezca. Si nunca
 *      aparece, no se pierde nada: son 400 ms.
 *   2. Se espera a que el velo se vaya.
 *   3. Se espera a que esté en el DOM lo que se estaba esperando. Sin esto,
 *      «el velo se fue» no quiere decir que lo nuevo ya se haya pintado.
 *
 * @param {Function} condicion Qué tiene que aparecer. Sin ella, solo el velo.
 * @param {string} label Para el registro.
 * @param {number} tope Techo total, en ms.
 * @returns {Promise<boolean>} true si llegó lo esperado.
 */
async function esperarAjaxSri(condicion, label = 'la respuesta del SRI', tope = 9000) {
    const t0 = Date.now();

    // PrimeFaces levanta el velo en el mismo tick del click, pero no siempre.
    // Que NO aparezca es normal, no un problema: se sondea a mano en vez de
    // con waitFor(), que dejaría un aviso de timeout en cada llamada.
    while (Date.now() - t0 < 400 && !veloAjaxArriba()) await sleep(50);
    await waitFor(() => !veloAjaxArriba(), tope, 'que baje el velo');

    let listo = true;
    if (typeof condicion === 'function') {
        const resta = Math.max(600, tope - (Date.now() - t0));
        listo = !!(await waitFor(condicion, resta, label));
    }

    const ms = Date.now() - t0;
    if (listo) console.log(`⏱️ [SRI] ${label}: ${ms} ms`);
    else console.warn(`⏱️ [SRI] ${label}: no apareció en ${ms} ms.`);
    return listo;
}

/**
 * ELITE HELPER: Cierra diálogos obstructores del SRI (ej. Mensajes Personalizados)
 */
async function dismissSridialogs() {
    // ELITE v12.7: Respetar modo manual del asistente
    if (window.sriAssistant && window.sriAssistant.manualMode) return false;

    // Buscar CUALQUIER diálogo de PrimeFaces que esté visible
    // Antes filtraba por offsetParent, que es null en los modales position:fixed
    // de PrimeFaces: esta función nunca llegaba a cerrarlos.
    const modals = Array.from(document.querySelectorAll('.ui-dialog[role="dialog"]'))
        .filter(esVisible);

    for (const modal of modals) {
        console.log('🛡️ SRI Assistant: Diálogo obstructor detectado. Limpiando...');

        // Multi-estrategia para el botón Aceptar/OK
        // j_idt195 no aparece en ninguna traza real de Burp: era una suposición.
        const btnAceptar = modal.querySelector('button[id*="btnAceptar"], button[id*="btnContinuar"]') ||
            modal.querySelector('button.green-btn') ||
            Array.from(modal.querySelectorAll('button')).find(b => {
                const t = b.textContent.toUpperCase();
                return t.includes('ACEPTAR') || t.includes('OK') || t.includes('CONTINUAR');
            });

        if (btnAceptar) {
            clickElement(btnAceptar, 'Cerrar Diálogo Obstructor');
            await sleep(1000); // Pausa de estabilidad
            return true;
        }
    }

    // Segunda pasada: modales que NO son de PrimeFaces (Angular/Material).
    return await cerrarModalesNoPrimeFaces();
}

/**
 * Cierra overlays genéricos (encuesta de satisfacción, avisos Angular) usando
 * EXCLUSIVAMENTE su control de cierre — la "×", el aria-label o .mat-dialog-close.
 *
 * 🛑 REGLA DE ORO: nunca se pulsa un botón por su texto en esta función.
 * El modal de la encuesta trae "Quiero responder", y pulsarlo enviaría una
 * opinión en nombre del usuario. Solo cerramos, jamás respondemos ni aceptamos.
 */
async function cerrarModalesNoPrimeFaces() {
    if (window.sriAssistant && window.sriAssistant.manualMode) return false;

    const CONTENEDORES = [
        'mat-dialog-container',
        '.mat-dialog-container',
        '.cdk-overlay-pane',
        '[role="dialog"]:not(.ui-dialog)',
        '[class*="modal"][class*="show"]',
        '.modal.in'
    ].join(', ');

    const modales = Array.from(document.querySelectorAll(CONTENEDORES)).filter(esVisible);

    for (const modal of modales) {
        // No tocar nuestro propio HUD
        if (modal.closest('#sri-assistant-panel, #sri-anticipacion-sidebar')) continue;

        const CIERRES = [
            '[aria-label*="cerrar" i]',
            '[aria-label*="close" i]',
            '[mat-dialog-close]',
            '.mat-dialog-close',
            'button.close',
            '.close-button',
            '[class*="cerrar"]',
            '[class*="btn-close"]'
        ].join(', ');

        let btnCerrar = modal.querySelector(CIERRES);

        // Respaldo: un control cuyo texto sea SOLO el símbolo de cerrar.
        if (!btnCerrar) {
            btnCerrar = Array.from(modal.querySelectorAll('button, a, span, i, div')).find((el) => {
                if (!esVisible(el)) return false;
                const t = (el.textContent || '').trim();
                return t === '\u00d7' || t === 'x' || t === 'X' || t === '\u2715' || t === '\u2716' || t === '\u2573';
            });
        }

        if (btnCerrar) {
            const resumen = (modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
            console.log('🛡️ SRI Assistant: cerrando modal no-PrimeFaces:', resumen);
            clickElement(btnCerrar, 'Cerrar Modal Angular');
            await sleep(800);
            return true;
        }

        console.warn('⚠️ Modal visible sin control de cierre reconocible. NO se pulsa nada por texto:',
            (modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80));
    }

    return false;
}

/**
 * ELITE HELPER: Espera a que el portal esté libre (sin overlay de carga)
 */
const waitForPortal = async (maxWait = 10000) => {
    await sleep(500);
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        // Detectar y cerrar diálogos obstructores sobre la marcha
        await dismissSridialogs();

        const overlay = document.querySelector('.ui-blockui') || document.querySelector('.ui-widget-overlay');
        const overlayHidden = !overlay || !esVisible(overlay);

        // 2. Verificar splash screen de Angular
        const splash = document.getElementById('id-sri-splash') || document.querySelector('.sri-splash');
        const splashHidden = !splash || !esVisible(splash) || getComputedStyle(splash).display === 'none';

        // 3. Verificar overlay de validación de navegador
        const disablingDiv = document.getElementById('disablingDiv');
        const noDisabling = !disablingDiv || disablingDiv.style.display === 'none';

        // El portal está listo cuando todos los bloqueos están ocultos
        if (overlayHidden && splashHidden && noDisabling) {
            await sleep(300); // Margen de seguridad
            console.log('✅ waitForPortal: Portal listo');
            return true;
        }

        await sleep(400);
    }

    console.warn('⚠️ waitForPortal: Timeout alcanzado');
    return false;
};

// ============================================================
// MENSAJES ESCUCHA (v3.2)
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Mensaje recibido en Content:', request.action);

    if (request.action === 'autoFillSearch') {
        autoLlenarBusqueda()
            .then(resultado => sendResponse({ success: true, data: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'extractFacturas') {
        extraerTodasLasFacturas()
            .then(resultado => sendResponse({ success: true, data: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'extractRetenciones') {
        extraerTodasLasRetenciones()
            .then(resultado => sendResponse({ success: true, data: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillForm') {
        autoLlenarFormulario(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillVentas') {
        llenarVentas(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillCompras') {
        llenarCompras(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillRetenciones') {
        llenarRetenciones(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'autoFillResumen') {
        const fields = ['564', '615', '617', '619'];
        const runResumen = async () => {
            let n = 0;
            // Primero Retenciones (609)
            n += await llenarRetenciones(request.data);
            await sleep(600);
            // Luego Sugeridos (564, 615, 617, 619)
            for (const f of fields) {
                if (await procesarCampoConSugerido(f)) n++;
                await sleep(400);
            }
            return n;
        };
        runResumen()
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'triggerAssistantAction') {
        if (window.sriAssistant) {
            window.sriAssistant.runUnifiedWorkflow(request.type, request.context);
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Asistente no inyectado' });
        }
        return true;
    }

    if (request.action === 'autoFillPeriodo') {
        autoLlenarPeriodoFiscal(request.data)
            .then(resultado => sendResponse({ success: true, camposLlenados: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'CLEAR_MEMORY') {
        GhostMemory.clearCurrent().then(() => {
            if (window.sriAssistant) {
                window.sriAssistant.updateSummary();
                window.sriAssistant.showEliteToast({ title: '🧹 Memoria', msg: 'Memoria temporal limpiada.' });
            }
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'STOP_ACTION') {
        if (window.sriAssistant) {
            window.sriAssistant.stopAutomation(false); // false = no confirm
        }
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'extractNotasCredito') {
        extraerTodasLasNotasCredito()
            .then(resultado => sendResponse({ success: true, data: resultado }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    // ELITE v12: TRIGGER TURBO MANUAL (Desde Popup)
    if (request.action === 'START_TURBO_MANUAL') {
        const { year, monthIndex, bulkType, checkFacturas, checkRetenciones, checkNC } = request.data;
        console.log('🚀 Iniciando MODO TURBO MANUAL SELECTIVO:', request.data);

        if (window.sriAssistant) {
            window.sriAssistant.log('🚀 Modo Turbo Manual solicitado...');
            window.sriAssistant.setWorking(true);
        }

        // Determinar primer paso activo
        let firstStep = 'turbo_step1_facturas';
        if (!checkFacturas) {
            if (checkRetenciones) firstStep = 'turbo_step3_retenciones';
            else if (checkNC) firstStep = 'turbo_step5_notas_credito';
            else firstStep = 'FIN_TURBO';
        }

        const storageData = {
            workflowPeriod: { year, monthIndex, source: 'MANUAL_TURBO' },
            bulkType: bulkType || 'monthly',
            checkFacturas: !!checkFacturas,
            checkRetenciones: !!checkRetenciones,
            checkNC: !!checkNC,
            pendingAction: firstStep,
            actionTimestamp: Date.now(),
            skipSafetyCheck: true,
            sriAutomationPaused: false
        };

        // Inicializar Flujo Masivo si aplica
        if (bulkType && bulkType !== 'monthly') {
            let monthsToProcess = [];
            if (bulkType === 'sem1') monthsToProcess = [0, 1, 2, 3, 4, 5];
            else if (bulkType === 'sem2') monthsToProcess = [6, 7, 8, 9, 10, 11];
            else if (bulkType === 'annual') monthsToProcess = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

            // ELITE FIX (v14.0): Protección de Fechas Futuras
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth(); // 0 = Enero, 1 = Feb...

            if (parseInt(year) === currentYear) {
                // Solo procesar hasta el mes ANTERIOR (meses cerrados)
                monthsToProcess = monthsToProcess.filter(m => m < currentMonth);
                if (monthsToProcess.length === 0) {
                    if (window.sriAssistant) window.sriAssistant.log('⚠️ Error: No hay meses cerrados disponibles en este año aún.');
                    return;
                }
            } else if (parseInt(year) > currentYear) {
                if (window.sriAssistant) window.sriAssistant.log('🚫 Error: No se permiten búsquedas de años futuros.');
                return;
            }

            storageData.bulkFlow = {
                active: true,
                months: monthsToProcess,
                currentIndex: 0,
                results: [] // Para guardar acumulados por cada mes
            };
            // Forzar el mes inicial del bulk
            storageData.workflowPeriod.monthIndex = monthsToProcess[0];
            // Actualizar mes objetivo en workflowPeriod para que coincida con el primero del bulk
            storageData.workflowPeriod.month = monthsToProcess[0] + 1;
        } else {
            storageData.bulkFlow = { active: false };
        }

        SafeStorage.set(storageData).then(async () => {
            if (firstStep === 'FIN_TURBO') {
                if (window.sriAssistant) window.sriAssistant.log('⚠️ No se seleccionaron tipos de documento.');
                return;
            }

            // VOLVER A NAVEGACIÓN ROBUSTA (Evitar cuelgues de redirección directa)
            await navegarAComprobantes();
        });

        sendResponse({ success: true });
        return true;
    }

    // ELITE v12.1: TRIGGER FLUJO MANUAL INDIVIDUAL
    if (request.action === 'START_MANUAL_FLOW') {
        console.log('🚀 Iniciando FLUJO MANUAL INDIVIDUAL:', request.data.tipo);

        let nextAction = 'turbo_step1_facturas';
        if (request.data.tipo === 'RETENCIONES') nextAction = 'turbo_step3_retenciones';
        if (request.data.tipo === 'NOTAS CRÉDITO') nextAction = 'turbo_step5_notas_credito';

        SafeStorage.set({
            workflowPeriod: {
                year: request.data.year,
                monthIndex: request.data.monthIndex,
                source: 'MANUAL_SINGLE'
            },
            pendingAction: nextAction,
            actionTimestamp: Date.now(),
            skipSafetyCheck: true,
            sriAutomationPaused: false
        }).then(async () => {
            // VOLVER A NAVEGACIÓN ROBUSTA
            await navegarAComprobantes();
        });

        sendResponse({ success: true });
        return true;
    }
});

// ============================================================
// ELITE UTILS: GESTIÓN DE FLUJO SELECTIVO Y MASIVO
// ============================================================

function getNextTurboStep(currentStep, settings) {
    const sequence = [
        { id: 'turbo_step1_facturas', check: settings.checkFacturas },
        { id: 'turbo_step2_extraer_facturas', check: settings.checkFacturas },
        { id: 'turbo_step3_retenciones', check: settings.checkRetenciones },
        { id: 'turbo_step4_extraer_retenciones', check: settings.checkRetenciones },
        { id: 'turbo_step5_notas_credito', check: settings.checkNC },
        { id: 'turbo_step6_extraer_notas_credito', check: settings.checkNC }
    ];

    const currentIndex = currentStep ? sequence.findIndex(s => s.id === currentStep) : -1;
    for (let i = currentIndex + 1; i < sequence.length; i++) {
        if (sequence[i].check) return sequence[i].id;
    }
    return 'FIN_TURBO';
}

// ESCUCHADOR DE MENSAJES DE LA WEB (SantiagoCordova.com Bridge)
window.addEventListener('message', async (event) => {
    if (!event.data || event.data.source !== 'SC_PRO_DASHBOARD') return;
    console.log('⚡ [SC PRO Bridge] Mensaje de la web recibido en Content Script:', event.data.type);

    if (event.data.type === 'SRI_AUTOFILL_DATA' && event.data.data) {
        const d = event.data.data;
        const autofillObj = {
            ruc: d.ruc,
            password: d.password,
            name: d.name,
            timestamp: Date.now(),
            manual: true
        };
        
        const now = new Date();
        let cMonth = now.getMonth() - 1;
        let cYear = now.getFullYear();
        if (cMonth < 0) { cMonth = 11; cYear--; }

        await SafeStorage.set({ 
            pending_sri_autofill: autofillObj,
            pendingAction: 'turbo_step1_facturas',
            checkFacturas: true,
            checkRetenciones: true,
            checkNC: true,
            workflowPeriod: { year: cYear, monthIndex: cMonth },
            autoDeclaration: true,
            sri_auto_mode: true,
            sri_master_switch_on: true,
            sriAutomationPaused: false,
            actionTimestamp: Date.now(),
            skipSafetyCheck: true
        });

        if (isSRILoginPage()) {
            const items = await SafeStorage.get(null);
            renderAnticipationWidget(items);
            executeLogin(d.ruc, d.password);
        }
    }

    if (event.data.type === 'SRI_START_BATCH_DECLARATION' && event.data.data) {
        const d = event.data.data;
        const queue = (d.clients || []).map(c => ({ ruc: c.ruc, password: c.sriPassword || c.password, name: c.name }));
        const actionType = d.mode === 'recover_pdf_only' ? 'recoverPDF' : 'turbo_step1_facturas';
        await SafeStorage.set({
            auto_batch_enabled: true,
            auto_batch_queue: queue,
            auto_batch_index: 0,
            auto_batch_mode: actionType
        });
        if (isSRILoginPage()) {
            const items = await SafeStorage.get(null);
            renderAnticipationWidget(items);
        }
    }
});

// WATCHER DE ÉXITO DE DECLARACIÓN (CAPTURA DE COMPROBANTE OFICIAL)
function initDeclarationSuccessWatcher() {
    if (window.__sriDeclarationSuccessWatcherActive) return;
    window.__sriDeclarationSuccessWatcherActive = true;

    setInterval(async () => {
        // 🛑 Blindaje absoluto: Solo actuar si estamos dentro del wizard oficial de Formulario IVA
        if (typeof estaEnFormularioIva === 'function' && !estaEnFormularioIva()) return;

        // Si todavía estamos editando casilleros o en selección de periodo, no es pantalla de éxito
        if (document.getElementById('concepto401') || document.getElementById('concepto500') || document.getElementById('frmFlujoDeclaracion:calPeriodo')) {
            return;
        }

        // ⚡ PERF: textContent en vez de innerText
        // ⚡ PERF: textContent en vez de innerText
        const bodyText = (document.body?.textContent || '').toLowerCase();
        const successPanel = document.getElementById('panelSinValorAPagar');
        const printBtn = document.getElementById('frmFlujoDeclaracion:btnDescargarComprobante');
        const hasImprimirBtn = (printBtn && esVisible(printBtn)) || Array.from(document.querySelectorAll('span.ui-button-text, button')).some(span => {
            const txt = (span.textContent || '').trim().toUpperCase();
            return txt === 'IMPRIMIR' || txt.includes('IMPRIMIR COMPROBANTE');
        });

        const isSuccessPage = !!successPanel || (hasImprimirBtn && (
            bodyText.includes('declaración procesada') ||
            bodyText.includes('su declaración ha sido procesada') ||
            bodyText.includes('declaracion enviada con exito') ||
            bodyText.includes('comprobante de declaracion') ||
            bodyText.includes('imprimir comprobante') ||
            bodyText.includes('declaración enviada') ||
            bodyText.includes('cep #')
        ));

        if (isSuccessPage) {
            const state = await SafeStorage.get(['declaration_synced_flag']);
            if (!state.declaration_synced_flag) {
                await SafeStorage.set({ declaration_synced_flag: true });
                console.log('🎉 [SRI WATCHER] ¡Pantalla de confirmación de declaración detectada!');
                // Cierre POST-ENVÍO (la declaración ya fue aceptada por el SRI).
                if (window.sriAssistant && typeof window.sriAssistant.finalizarPostEnvioSRI === 'function') {
                    await window.sriAssistant.finalizarPostEnvioSRI();
                }
            }
        }
    }, 2000);
}
initDeclarationSuccessWatcher();

// HELPER: ENCONTRAR BOTÓN ACEPTAR/ENVIAR PRINCIPAL EN EL RESUMEN (NO DIÁLOGOS OCULTOS)
function findAceptarBtnOnSummary() {
    // Solo relevante dentro del formulario IVA
    if (typeof estaEnFormularioIva === 'function' && !estaEnFormularioIva()) return null;

    // 1. CONFIRMADO DOM REAL (03-sep-2026): id="frmFlujoDeclaracion:divBotonContinuarConfirmacion"
    const confirmedBtn = document.getElementById('frmFlujoDeclaracion:divBotonContinuarConfirmacion');
    if (confirmedBtn && esVisible(confirmedBtn) && !confirmedBtn.closest('.ui-dialog, .ui-helper-hidden')) {
        console.log('🎯 [SUMMARY SEARCH] Botón oficial Aceptar/Enviar localizado por ID confirmado:', confirmedBtn);
        return confirmedBtn;
    }

    // 2. Buscar botón verde principal 'green-btn' en la página de resumen
    const greenBtn = document.getElementById('frmFlujoDeclaracion:btnAceptar') ||
                     document.getElementById('frmFlujoDeclaracion:btnEnviar') ||
                     document.querySelector('button[id*="btnAceptar"]') ||
                     document.querySelector('button[id*="btnEnviar"]');

    if (greenBtn && esVisible(greenBtn) && !greenBtn.closest('.ui-dialog, .ui-helper-hidden')) {
        const btnTxt = (greenBtn.innerText || greenBtn.textContent || '').toLowerCase();
        if (!btnTxt.includes('borrador')) {
            console.log('🎯 [SUMMARY SEARCH] Botón principal Aceptar localizado por ID secundario:', greenBtn);
            return greenBtn;
        }
    }

    // 2. Búsqueda por texto "Aceptar" / "Enviar" en botones o spans, ignorando modales/diálogos ocultos
    // soloDelPortal: si no, el «Aceptar» que encuentra puede ser un botón
    // nuestro y el cierre se dispara contra la propia interfaz.
    const elements = soloDelPortal(document.querySelectorAll('button, a.ui-button, div.ui-button, span.ui-button-text, span[class*="ui-button"]'));
    for (const el of elements) {
        if (!esVisible(el)) continue;
        const txtRaw = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (txtRaw.includes('borrador')) continue;
        const btn = el.closest('button, a, div[class*="button"]') || el;

        // Ignorar botones dentro de modales o diálogos ocultos
        if (btn.closest('.ui-dialog, .ui-helper-hidden, [style*="display: none"]')) continue;

        // Ignorar botones cuyo onclick sea esconder un diálogo (ej: PF('...').hide())
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes('.hide()')) continue;

        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (txt === 'aceptar' || txt === 'enviar' || txt === 'aceptar y enviar' || txt === 'firmar y enviar') {
            if (btn && esVisible(btn)) return btn;
        }
    }
    return null;
}

// El watcher automático del resumen se eliminó el 05-sep-2026.
//
// Era un setInterval que buscaba «Aceptar»/«Enviar» —incluso por texto— y
// lo pulsaba tras 3 segundos, sin mirar saldo, mensajes, ni si la
// declaración era SUSTITUTIVA. Nunca se llegó a llamar, pero el envío tiene
// UN solo camino y es ejecutarCierreMagico(), que sí cumple el contrato de
// la §4: resumen de verdad + saldo leído en cero + mensajes limpios + no
// sustitutiva. Ver .agents/AGENTS.md.

// AUTO-DESMISSER DE DIÁLOGOS DE ADVERTENCIA Y VALIDACIONES NORMALES DEL SRI (SOLO BAJO DEMANDA)
async function autoDismissSriWarnings() {
    // Helper: encuentra el botón Aceptar/Continuar dentro de un contenedor de diálogo
    function findAceptarInContainer(container) {
        // ⚠️ Nada de getElementById global acá: buscaba en TODO el documento e
        // ignoraba el diálogo actual, así que podía devolver el botón de otro
        // modal. Se busca SIEMPRE dentro del contenedor recibido.
        //
        // Y primero los ids semánticos: los j_idt* son autogenerados por JSF y
        // cambian entre corridas (947 en una traza de Burp, 946 en otra), así
        // que valen como pista, nunca como ancla.
        const porIdSemantico = container.querySelector(
            'button[id*="btnAceptar"], button[id*="btnContinuar"], button[id*="btnSi"], button[id*="btnConfirmar"], button[id*="confirm"]'
        );
        if (esVisible(porIdSemantico)) return porIdSemantico;

        // Segundo: buscar por texto en botones y spans (incluye ui-c, ui-button-text)
        const candidates = Array.from(container.querySelectorAll('button, a[class*="ui-button"], span.ui-button-text, span[class*="ui-button-text"]'));
        for (const el of candidates) {
            const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (txt === 'aceptar' || txt === 'continuar' || txt === 'sí' || txt === 'si' || txt === 'aceptar y continuar') {
                const btn = el.closest('button, a, div[class*="button"]') || el;
                if (btn && getComputedStyle(btn).display !== 'none') return btn;
            }
        }
        return null;
    }

    // Buscar SOLO en diálogos modales verdaderamente visibles (NO panelDialogos que es persistente)
    const dialogs = Array.from(document.querySelectorAll(
        'div#dlgConfirmacionEnvioFormulario, div.ui-dialog, div.ui-confirm-dialog, div[id*="dlgAdvertencia"], div[id*="dlgValidacion"]'
    )).filter(d =>
        // ELITE FIX: No usar offsetParent para dialogos, ya que en Chrome position:fixed => offsetParent null
        getComputedStyle(d).display !== 'none' &&
        getComputedStyle(d).visibility !== 'hidden' &&
        !d.classList.contains('ui-helper-hidden')
    );

    for (const dlg of dialogs) {
        // ELITE v13.0: Análisis Inteligente de Advertencias
        const textContent = (dlg.textContent || '').toUpperCase();
        
        // Si hay una lista de mensajes, analizarlos
        const mensajes = Array.from(dlg.querySelectorAll('li.estiloItemsMensajes, .ui-messages-warn-detail, .ui-messages-error-detail'));
        let esSeguro = true;

        if (mensajes.length > 0) {
            // Verificar si todos los mensajes son inofensivos (ej. Casillero 625)
            const todosInofensivos = mensajes.every(m => {
                const txt = m.textContent.toUpperCase();
                return txt.includes('CASILLERO 625') || txt.includes('FACULTAD DETERMINADORA') || txt.includes('CRÉDITO TRIBUTARIO NO HAYA SUPERADO LOS 5 AÑOS');
            });
            if (!todosInofensivos) {
                console.warn('⚠️ [SRI ELITE] Advertencia crítica detectada. Requiere revisión humana:', mensajes.map(m => m.textContent));
                esSeguro = false;
            }
        } else if (textContent.includes('ERROR') || textContent.includes('INCONSISTENCIA')) {
            esSeguro = false;
        }

        if (esSeguro) {
            const confirmBtn = findAceptarInContainer(dlg);
            if (confirmBtn) {
                console.log('✅ [SRI DISMISS] Clickeando "Aceptar" en diálogo SRI seguro:', confirmBtn);
                if (typeof clickElement === 'function') clickElement(confirmBtn, 'Aceptar Advertencia Modal SRI');
                else confirmBtn.click();
                await sleep(500);
            }
        }
    }
}

// AL CARGAR EL SCRIPT (RECARGA DE PAGINA)
