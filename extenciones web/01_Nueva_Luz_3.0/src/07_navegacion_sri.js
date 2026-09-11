// NUEVA FUNCIÓN: Navegación Wizard Declaraciones (Angular/SPA) - VERSIÓN ZERO-LAG (ELITE)
// ═══════════════════════════════════════════════════════════════════════════
// CONTROL FLOTANTE DEL BUCLE
// Siempre visible, arrastrable, con el estado real del semáforo.
//   ▶  DETENIDO  → la extensión no toca nada; el SRI queda libre
//   ⏸  CORRIENDO → pausa suave: termina el cliente y ahí para
//   🛑 EMERGENCIA → corta en el acto
// ═══════════════════════════════════════════════════════════════════════════
const SRI_PUENTE_CONSULTA_DECLARACIONES =
    'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=1292&idGrupo=73';

const SRI_CONSULTA_DECLARACIONES_PATH = 'sri-eyr-consulta-web-internet';

// Las tres pantallas del asistente de Consulta de declaraciones, que viven
// todas en la MISMA URL. Sirven para saber que un AJAX terminó de verdad, en
// vez de contar segundos.
const CONSULTA_PANTALLAS = {
    grupoObligacion: () => document.getElementById('formPresentada:tblGrupoObligacionSeleccion'),
    periodoFiscal: () => document.getElementById('formPresentada:btnAceptarPeriodoSeleccion'),
    tabla: () => document.getElementById('formPresentada:tblConsultaDeclaracion')
};

/** ¿Estamos dentro de Consulta de declaraciones? */
function enConsultaDeclaraciones() {
    return window.location.href.includes(SRI_CONSULTA_DECLARACIONES_PATH);
}

/**
 * Arranca la recuperación: guarda a quién y qué periodo, y cruza el puente SSO.
 * El resto sigue del otro lado, cuando la página cargue.
 */
async function irARecuperarComprobante(ruc, periodo, nombre = '') {
    if (!ruc || !periodo) { console.warn('🧾 [RECUPERAR] Falta el RUC o el periodo.'); return false; }
    const per = `${periodo.year}-${String(periodo.monthIndex + 1).padStart(2, '0')}`;
    console.log(`🧾 [RECUPERAR] Buscando el comprobante de ${nombre || ruc} · ${per} en Consulta de declaraciones...`);
    await anotarBitacora('recuperar comprobante', `${nombre || ruc} · ${per}`);

    await SafeStorage.set({
        pendingAction: 'recuperar_comprobante',
        actionTimestamp: Date.now(),
        recuperarComprobante: { ruc, nombre, periodo, per, intentos: 0 }
    });
    window.location.href = SRI_PUENTE_CONSULTA_DECLARACIONES;
    return true;
}

/**
 * Del otro lado del puente: elegir obligación y periodo, encontrar la fila del
 * periodo pedido y pulsar su descarga. El PDF lo levanta el interceptor de
 * URL.createObjectURL que ya vive en el módulo 01.
 */
/**
 * Consulta de declaraciones es un asistente de tres pantallas sobre la MISMA
 * URL, así que no se puede seguir una secuencia fija: se mira qué hay en
 * pantalla y se da el paso que corresponda. Cada carga avanza un paso.
 *
 * Marcado confirmado en la traza flujo_de_consuta_de_declaraciones_iva_renta
 * (Burp, 04-sep-2026). Ver BIBLIA_PANTALLAS_SRI.md.
 */
const MESES_SRI = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO',
                   'AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

/**
 * Lee la tabla de declaraciones presentadas y devuelve una entrada por cada
 * declaración de IVA, con su período y su número de comprobante.
 */
function listarDeclaracionesPresentadas() {
    const tabla = document.getElementById('formPresentada:tblConsultaDeclaracion');
    if (!tabla) return [];

    return Array.from(tabla.querySelectorAll('tbody tr[data-ri]')).map((tr) => {
        const desc = tr.querySelector('[id*="txtDescripcionObligacion"]');
        const texto = (desc && desc.textContent) || tr.textContent || '';
        if (!/IVA/i.test(texto)) return null;

        const celdas = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim());
        const perTxt = celdas.find((c) => /^[A-ZÁÉÍÓÚÑ]+\s+\d{4}$/i.test(c)) || '';
        const partes = perTxt.toUpperCase().split(/\s+/);
        const mi = MESES_SRI.indexOf(partes[0]);
        const anio = parseInt(partes[1], 10);
        if (mi < 0 || !anio) return null;

        return {
            periodo: { year: anio, monthIndex: mi },
            per: `${anio}-${String(mi + 1).padStart(2, '0')}`,
            periodoTexto: perTxt,
            cep: celdas.find((c) => /^\d{10,}$/.test(c)) || '',
            tipo: celdas.find((c) => /^(Original|Sustitutiva)/i.test(c)) || '',
            estado: celdas.find((c) => /CUMPLIDA|PENDIENTE/i.test(c)) || '',
            indiceFila: tr.getAttribute('data-ri')
        };
    }).filter(Boolean);
}

/** El botón «Comprobante de declaración» de una fila, nunca por su j_idt. */
function botonComprobanteDeFila(tr) {
    const botones = Array.from(tr.querySelectorAll('button, a'));
    return botones.find((b) => /comprobante/i.test(b.getAttribute('title') || ''))
        || botones.find((b) => b.querySelector('.ui-icon-file-download'))
        || botones.find((b) => /comprobante/i.test(b.textContent || ''))
        || null;
}

/**
 * Baja TODOS los comprobantes que falten de quien está logueado.
 * @param {{ruc, nombre, soloFaltantes}} opts
 * @returns {Promise<{bajados:number, yaEstaban:number, fallaron:number, total:number}>}
 */
async function bajarTodosLosComprobantes({ ruc, nombre = '', soloFaltantes = true } = {}) {
    const lista = listarDeclaracionesPresentadas();
    const resumen = { bajados: 0, yaEstaban: 0, fallaron: 0, total: lista.length };

    if (!lista.length) {
        console.warn('🧾 [TODOS] La tabla de declaraciones presentadas está vacía o no cargó.');
        return resumen;
    }

    console.log(`🧾 [TODOS] ${lista.length} declaraciones de IVA presentadas: ` +
                lista.map((d) => d.periodoTexto).join(', '));
    await anotarBitacora('comprobantes a bajar', `${lista.length} periodos de ${nombre || ruc}`);

    for (const d of lista) {
        // ¿Ya tenemos este? El registro local lo sabe.
        if (soloFaltantes && typeof SriLoop !== 'undefined') {
            const reg = await SriLoop.declaracionLocal(ruc, d.periodo);
            if (reg && reg.pdfSubido) {
                console.log(`   ✓ ${d.periodoTexto} ya está guardado.`);
                resumen.yaEstaban++;
                continue;
            }
        }

        // La tabla se vuelve a renderizar con cada descarga: hay que buscar la
        // fila de nuevo, por su período, no por una referencia vieja.
        const tabla = document.getElementById('formPresentada:tblConsultaDeclaracion');
        const fila = tabla && Array.from(tabla.querySelectorAll('tbody tr[data-ri]'))
            .find((tr) => (tr.textContent || '').toUpperCase().includes(d.periodoTexto.toUpperCase()));
        if (!fila) {
            console.warn(`   ✗ ${d.periodoTexto}: ya no encuentro su fila.`);
            resumen.fallaron++;
            continue;
        }

        const boton = botonComprobanteDeFila(fila);
        if (!boton) {
            console.warn(`   ✗ ${d.periodoTexto}: la fila no tiene botón de comprobante.`);
            resumen.fallaron++;
            continue;
        }

        console.log(`   ⬇️ ${d.periodoTexto}${d.cep ? ' · CEP ' + d.cep : ''}...`);
        capturedPdfBase64 = null;
        clickElement(boton, `Comprobante ${d.periodoTexto}`);

        for (let i = 0; i < 25 && !capturedPdfBase64; i++) await sleep(700);

        if (!capturedPdfBase64) {
            console.warn(`   ✗ ${d.periodoTexto}: no llegó el PDF.`);
            await anotarBitacora('comprobante sin bajar', `${d.periodoTexto} · ${nombre || ruc}`);
            resumen.fallaron++;
            continue;
        }

        // Constancia primero: si la subida falla, igual sabemos que existe.
        if (typeof SriLoop !== 'undefined') {
            await SriLoop.marcarDeclarado(ruc, d.periodo, { nombre, cep: d.cep });
        }
        await syncDeclarationToSupabase(ruc, d.per, null, nombre, null, 'completado');
        await anotarBitacora('comprobante bajado', `${d.periodoTexto} · ${nombre || ruc}`);
        resumen.bajados++;

        // Aire para que el portal termine de re-renderizar la tabla.
        await sleep(1500);
    }

    console.log(`🧾 [TODOS] ${resumen.bajados} bajados · ${resumen.yaEstaban} ya estaban · ${resumen.fallaron} fallaron.`);
    await anotarBitacora('comprobantes: resumen',
        `${resumen.bajados} bajados · ${resumen.yaEstaban} ya estaban · ${resumen.fallaron} fallaron`);
    return resumen;
}

if (typeof window !== 'undefined') {
    /** Baja todos los comprobantes del contribuyente logueado. */
    window.sriTraerComprobantes = async (soloFaltantes = true) => {
        const info = (window.sriAssistant && window.sriAssistant.extractClientInfo)
            ? window.sriAssistant.extractClientInfo() : {};
        const af = (await SafeStorage.get(['pending_sri_autofill'])).pending_sri_autofill || {};
        const ruc = info.ruc || af.ruc;
        if (!ruc) { console.error('🧾 No sé de quién es esta sesión.'); return null; }
        if (!enConsultaDeclaraciones()) {
            console.log('🧾 Primero hay que estar en Consulta de declaraciones. Yendo...');
            await SafeStorage.set({ pendingAction: 'bajar_todos_comprobantes', actionTimestamp: Date.now(),
                                    bajarTodos: { ruc, nombre: info.name || af.name || '', soloFaltantes } });
            window.location.href = SRI_PUENTE_CONSULTA_DECLARACIONES;
            return null;
        }
        return barrerTodosLosAnios({ ruc, nombre: info.name || af.name || '', soloFaltantes });
    };
}

/** Años que el portal ofreció en el desplegable, del más nuevo al más viejo. */
let ANIOS_OFRECIDOS = [];

/** Nadie declara desde hace veinte años: un tope para que esto no se desboque. */
const MAX_ANIOS_BARRIDO = 6;

/**
 * Baja los comprobantes de TODOS los años que el portal ofrece, no solo del
 * actual. Ese —y no el mes en curso— es el objetivo del proyecto.
 *
 * @param {{ruc, nombre, soloFaltantes}} opts
 * @returns {Promise<{bajados:number, yaEstaban:number, fallaron:number, total:number, anios:number[]}>}
 */
async function barrerTodosLosAnios({ ruc, nombre = '', soloFaltantes = true } = {}) {
    const total = { bajados: 0, yaEstaban: 0, fallaron: 0, total: 0, anios: [] };

    // El primer año ya está en pantalla: se barre y de paso queda anotada la
    // lista de años que ofreció el desplegable.
    const anioEnPantalla = anioDeLaConsultaEnPantalla();
    let r = await bajarTodosLosComprobantes({ ruc, nombre, soloFaltantes });
    sumarResumen(total, r, anioEnPantalla);

    const pendientes = ANIOS_OFRECIDOS
        .filter((a) => a !== anioEnPantalla)
        .slice(0, MAX_ANIOS_BARRIDO - 1);

    if (!pendientes.length) {
        console.log('🧾 [AÑOS] El portal no ofrece más años que el que ya barrí.');
        return total;
    }
    console.log(`🧾 [AÑOS] Faltan por revisar: ${pendientes.join(', ')}.`);

    for (const anio of pendientes) {
        const nueva = document.getElementById('formPresentada:btnGenerarNuevaConsulta');
        if (!nueva) {
            console.warn(`🧾 [AÑOS] No encuentro «Nueva consulta»: ${anio} y los anteriores quedan sin revisar.`);
            break;
        }
        clickElement(nueva, `Consulta · volver para el año ${anio}`);
        await esperarAjaxSri(CONSULTA_PANTALLAS.grupoObligacion,
                             `pantalla de obligaciones (${anio})`);

        const listo = await prepararTablaDeclaraciones(anio);
        if (!listo) {
            console.warn(`🧾 [AÑOS] ${anio}: no llegué a la tabla. Sigo con el resto.`);
            continue;
        }
        console.log(`🧾 [AÑOS] ── ${anio} ──`);
        r = await bajarTodosLosComprobantes({ ruc, nombre, soloFaltantes });
        sumarResumen(total, r, anio);
    }

    console.log(`🧾 [AÑOS] Barrido completo (${total.anios.join(', ')}): ` +
                `${total.bajados} bajados · ${total.yaEstaban} ya estaban · ${total.fallaron} fallaron.`);
    await anotarBitacora('barrido de años',
        `${total.anios.join(', ')} · ${total.bajados} bajados · ${total.fallaron} fallaron`);
    return total;
}

function sumarResumen(acc, r, anio) {
    if (!r) return;
    acc.bajados += r.bajados; acc.yaEstaban += r.yaEstaban;
    acc.fallaron += r.fallaron; acc.total += r.total;
    if (anio && !acc.anios.includes(anio)) acc.anios.push(anio);
}

/** Qué año está mostrando la consulta ahora mismo. */
function anioDeLaConsultaEnPantalla() {
    const et = document.getElementById('formPresentada:somAnioFiscal_label');
    const a = parseInt((et && et.textContent || '').trim(), 10);
    return (a >= 2000 && a <= 2100) ? a : new Date().getFullYear();
}

/**
 * Deja la tabla de declaraciones presentadas a la vista.
 * Es un asistente de tres pantallas sobre la MISMA URL, así que se mira qué
 * hay delante y se da el paso que toca; cada carga avanza uno.
 *
 * @param {number} anio año fiscal a consultar.
 * @returns {Promise<boolean>} true si la tabla ya está.
 */
async function prepararTablaDeclaraciones(anio) {
    if (!enConsultaDeclaraciones()) return false;
    if (document.getElementById('formPresentada:tblConsultaDeclaracion')) return true;

    // ── Pantalla 1 · elegir el grupo de obligación ──
    const tablaGrupo = document.getElementById('formPresentada:tblGrupoObligacionSeleccion');
    const btnBuscar = document.getElementById('formPresentada:btnBuscarGrupoObligacion');
    if (tablaGrupo && btnBuscar && esVisible(btnBuscar)) {
        const filaIva = Array.from(tablaGrupo.querySelectorAll('tbody tr[data-rk]'))
            .find((tr) => /\bIVA\b/i.test(tr.textContent || ''));
        if (!filaIva) {
            console.warn('🧾 No hay un grupo de obligación de IVA para este contribuyente.');
            return false;
        }
        const casilla = filaIva.querySelector('.ui-chkbox-box');
        if (casilla && !/ui-state-active/.test(casilla.className)) {
            clickElement(casilla, 'Consulta · marcar obligación IVA');
            await sleep(700);
        }
        clickElement(btnBuscar, 'Consulta · buscar grupo de obligación');
        // Puede saltar directo a la tabla si el período ya venía elegido.
        await esperarAjaxSri(() => CONSULTA_PANTALLAS.periodoFiscal() || CONSULTA_PANTALLAS.tabla(),
                             'pantalla de período fiscal');
    }

    // ── Pantalla 2 · período fiscal ──
    // somAnioFiscal es un ui-selectonemenu: su <select> real viene vacío y se
    // llena por JS, así que hay que abrir el panel y pulsar el <li>.
    const btnAceptar = document.getElementById('formPresentada:btnAceptarPeriodoSeleccion');
    if (btnAceptar && esVisible(btnAceptar)) {
        const anioTxt = String(anio || new Date().getFullYear());
        const etiqueta = document.getElementById('formPresentada:somAnioFiscal_label');
        if (etiqueta && !(etiqueta.textContent || '').includes(anioTxt)) {
            const disparador = document.querySelector('#formPresentada\\:somAnioFiscal .ui-selectonemenu-trigger');
            if (disparador) { clickElement(disparador, 'Consulta · abrir años'); await sleep(500); }
            const opciones = Array.from(document.querySelectorAll('#formPresentada\\:somAnioFiscal_items li'));
            // El portal solo lista los años en que ESTE contribuyente tuvo
            // obligación: es la definición exacta de «a la fecha».
            const ofrecidos = opciones.map((li) => parseInt((li.textContent || '').trim(), 10))
                .filter((a) => a >= 2000 && a <= 2100);
            if (ofrecidos.length) ANIOS_OFRECIDOS = Array.from(new Set(ofrecidos)).sort((a, b) => b - a);
            const item = opciones.find((li) => (li.textContent || '').trim() === anioTxt);
            if (item) { clickElement(item, `Consulta · año ${anioTxt}`); await sleep(700); }
            else console.warn(`🧾 El año ${anioTxt} no está entre las opciones.`);
        }
        // Elegir el año repinta el diálogo: el botón de recién ya no existe.
        const aceptarVivo = document.getElementById('formPresentada:btnAceptarPeriodoSeleccion') || btnAceptar;
        clickElement(aceptarVivo, 'Consulta · aceptar período');
        await esperarAjaxSri(CONSULTA_PANTALLAS.tabla, 'tabla de declaraciones presentadas');
    }

    return !!document.getElementById('formPresentada:tblConsultaDeclaracion');
}

/**
 * Trae el PDF del botón «Comprobante de declaración» sin pulsarlo.
 *
 * **Por qué no se pulsa.** Ese botón es un `submit` de JSF
 * (`onclick="PrimeFaces.onPost()"`): manda el formulario entero y el portal
 * responde con el PDF y `Content-Disposition: attachment`. El navegador se lo
 * lleva a la carpeta de descargas del usuario, y ni `fetch` ni
 * `URL.createObjectURL` lo ven — o sea que el interceptor del módulo 01 no
 * tiene forma de agarrarlo. El 07-sep-2026 el log decía «se pulsó la descarga
 * pero no llegó ningún PDF» mientras el archivo, probablemente, bajaba.
 *
 * Es el mismo caso de `lnkXml` (§11) y se resuelve igual: se arma el POST a
 * mano con todos los campos del formulario más el nombre del botón, y se lee
 * la respuesta. Así el comprobante llega a la mano, listo para subirlo.
 *
 * @param {HTMLElement} boton El botón de la fila que corresponde.
 * @returns {Promise<string|null>} El PDF en base64, o `null`.
 */
async function traerPdfDelComprobantePresentado(boton) {
    if (!boton) return null;
    const form = boton.closest('form');
    if (!form) {
        console.warn('🧾 [RECUPERAR] El botón no está dentro de un formulario.');
        return null;
    }

    // El nombre del botón ES el parámetro que le dice a JSF qué se pulsó. Sin
    // eso el POST llega pero el portal no sabe qué hacer con él.
    const nombre = boton.getAttribute('name') || boton.id;
    if (!nombre) {
        console.warn('🧾 [RECUPERAR] El botón no tiene name ni id: no se puede reproducir el POST.');
        return null;
    }

    const cuerpo = new URLSearchParams();
    // Todos los campos del formulario, tal como los mandaría el navegador.
    Array.from(form.elements).forEach((el) => {
        if (!el.name || el.disabled) return;
        if (el.type === 'submit' || el.type === 'button') return;
        if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
        cuerpo.append(el.name, el.value);
    });
    cuerpo.append(nombre, boton.value || nombre);

    const destino = form.getAttribute('action') || window.location.href.split('#')[0];

    try {
        const r = await fetch(new URL(destino, window.location.href).href, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: cuerpo.toString()
        });
        if (!r.ok) {
            console.warn(`🧾 [RECUPERAR] El portal devolvió HTTP ${r.status} al pedir el comprobante.`);
            return null;
        }

        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // Un PDF empieza con «%PDF». Si vino HTML, la sesión caducó o el
        // portal contestó otra cosa: no se guarda basura como comprobante.
        if (bytes.length < 5 ||
            !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
            console.warn('🧾 [RECUPERAR] La respuesta no es un PDF ' +
                         `(${bytes.length} bytes, empieza con «${String.fromCharCode(...bytes.slice(0, 12))}»). ` +
                         '¿Sesión caducada?');
            return null;
        }

        // A base64 de a pedazos: `String.fromCharCode(...)` con un PDF entero
        // revienta la pila de argumentos.
        let bin = '';
        for (let i = 0; i < bytes.length; i += 8192) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        }
        const b64 = btoa(bin);
        console.log(`🧾 [RECUPERAR] PDF traído por POST. Tamaño: ${bytes.length} bytes.`);
        return b64;
    } catch (err) {
        console.warn('🧾 [RECUPERAR] Falló el POST del comprobante:', err.message);
        return null;
    }
}

async function ejecutarRecuperacionComprobante() {
    const st = (await SafeStorage.get(['recuperarComprobante'])).recuperarComprobante;
    if (!st) { console.warn('🧾 [RECUPERAR] No hay nada pendiente de recuperar.'); return false; }

    // Tope duro: una pantalla que no carga no puede volverse un bucle de
    // recargas contra el portal del SRI.
    if ((st.intentos || 0) >= 6) {
        console.error('🧾 [RECUPERAR] Demasiados intentos sin llegar al comprobante. Se abandona.');
        await anotarBitacora('⛔ recuperación fallida', `${st.nombre || st.ruc} · ${st.per}`);
        await Omitidos.anotar(st.ruc, 'sin_datos', {
            nombre: st.nombre, detalle: 'No se pudo recuperar el comprobante ya presentado' });
        await SafeStorage.remove(['recuperarComprobante', 'pendingAction', 'actionTimestamp']);
        return false;
    }
    await SafeStorage.set({ recuperarComprobante: { ...st, intentos: (st.intentos || 0) + 1 } });

    if (!enConsultaDeclaraciones()) {
        console.log('🧾 [RECUPERAR] Todavía no llegamos a Consulta de declaraciones. Esperando el puente SSO...');
        return false;
    }

    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO',
                   'AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const mes = MESES[st.periodo.monthIndex];
    const anio = String(st.periodo.year);

    // ── Pantalla 1 · Elegir el grupo de obligación ────────────────────────
    // Es un datatable seleccionable de PrimeFaces: la casilla real está oculta
    // y lo que responde al click es el .ui-chkbox-box de la fila.
    const tablaGrupo = document.getElementById('formPresentada:tblGrupoObligacionSeleccion');
    const btnBuscar = document.getElementById('formPresentada:btnBuscarGrupoObligacion');
    if (tablaGrupo && btnBuscar && esVisible(btnBuscar)) {
        const filasG = Array.from(tablaGrupo.querySelectorAll('tbody tr[data-rk]'));
        const filaIva = filasG.find((tr) => /\bIVA\b/i.test(tr.textContent || ''));
        if (!filaIva) {
            console.warn(`🧾 [RECUPERAR] No hay un grupo de obligación de IVA (${filasG.length} opciones).`);
            return false;
        }
        const casilla = filaIva.querySelector('.ui-chkbox-box');
        if (casilla && !/ui-state-active/.test(casilla.className)) {
            clickElement(casilla, 'Consulta · marcar obligación IVA');
            await sleep(700);
        }
        console.log('🧾 [RECUPERAR] Obligación IVA marcada. Buscando...');
        clickElement(btnBuscar, 'Consulta · buscar grupo de obligación');
        await esperarAjaxSri(() => CONSULTA_PANTALLAS.periodoFiscal() || CONSULTA_PANTALLAS.tabla(),
                             'pantalla de período fiscal');
    }

    // ── Pantalla 2 · Período fiscal ──────────────────────────────────────
    // somAnioFiscal es un ui-selectonemenu: el <select> real está vacío en el
    // HTML y se llena por JS, así que hay que abrir el panel y pulsar el <li>.
    const btnAceptar = document.getElementById('formPresentada:btnAceptarPeriodoSeleccion');
    if (btnAceptar && esVisible(btnAceptar)) {
        const etiqueta = document.getElementById('formPresentada:somAnioFiscal_label');
        if (etiqueta && !(etiqueta.textContent || '').includes(anio)) {
            const disparador = document.querySelector('#formPresentada\\:somAnioFiscal .ui-selectonemenu-trigger');
            if (disparador) { clickElement(disparador, 'Consulta · abrir años'); await sleep(500); }

            const items = Array.from(document.querySelectorAll('#formPresentada\\:somAnioFiscal_items li'));
            const item = items.find((li) => (li.textContent || '').trim() === anio);
            if (item) {
                clickElement(item, `Consulta · año ${anio}`);
                await sleep(700);
            } else {
                console.warn(`🧾 [RECUPERAR] El año ${anio} no está entre las opciones (${items.length}).`);
            }
        }
        console.log(`🧾 [RECUPERAR] Período fiscal ${anio}. Aceptando...`);
        clickElement(btnAceptar, 'Consulta · aceptar período');
        await esperarAjaxSri(CONSULTA_PANTALLAS.tabla, 'tabla de declaraciones presentadas');
    }

    // ── Pantalla 3 · La tabla de declaraciones presentadas ───────────────
    const tabla = document.getElementById('formPresentada:tblConsultaDeclaracion');
    if (!tabla) {
        console.log('🧾 [RECUPERAR] La tabla todavía no está. Se reintenta en la próxima carga.');
        return false;
    }

    // La fila correcta: obligación de IVA (columna con id txtDescripcionObligacion)
    // Y el período pedido, que el portal escribe como "ENERO 2026".
    const filas = Array.from(tabla.querySelectorAll('tbody tr[data-ri]'));
    const candidatas = filas.filter((tr) => {
        const desc = tr.querySelector('[id*="txtDescripcionObligacion"]');
        const esIva = /IVA/i.test((desc && desc.textContent) || tr.textContent || '');
        const txt = (tr.textContent || '').toUpperCase();
        return esIva && txt.includes(mes) && txt.includes(anio);
    });

    if (!candidatas.length) {
        if (!filas.length) {
            // Tabla vacía: puede que todavía no haya terminado de cargar.
            console.log('🧾 [RECUPERAR] La tabla está vacía todavía. Se reintenta en la próxima carga.');
            return false;
        }

        // La tabla trae filas y ninguna es la nuestra: el portal está diciendo
        // que ese período NO se presentó. Es una respuesta clara, y lo que
        // corresponde es declararlo, no abandonar al cliente.
        console.warn(`🧾 [COMPROBADO] ${mes} ${anio} NO figura entre las ${filas.length} declaraciones presentadas. ` +
                     'Hay que declararla.');
        await anotarBitacora('no estaba declarada', `${st.nombre || st.ruc} · ${mes} ${anio} · hay que hacerla`);

        await SafeStorage.remove(['recuperarComprobante']);

        if (typeof SriLoop !== 'undefined' && await SriLoop.puedeAvanzar()) {
            // Volver al flujo normal: extraer y declarar, desde el principio.
            await SafeStorage.set({
                pendingAction: 'turbo_step1_facturas',
                actionTimestamp: Date.now(),
                workflowPeriod: st.periodo,
                autoDeclaration: true,
                checkFacturas: true, checkRetenciones: true, checkNC: true
            });
            if (window.sriAssistant?.showEliteToast) {
                window.sriAssistant.showEliteToast({
                    title: '📝 No estaba declarada',
                    msg: `${mes} ${anio} no figura como presentada. Se declara ahora.`,
                    duration: 6000
                });
            }
            if (typeof navegarAComprobantes === 'function') await navegarAComprobantes();
            else window.location.href = SRI_PUENTE_RECIBIDOS;
        } else {
            await SafeStorage.remove(['pendingAction', 'actionTimestamp']);
        }
        return false;
    }

    // Si hay sustitutivas, la última presentada es la que vale.
    const fila = candidatas[candidatas.length - 1];
    // (la función que reproduce el POST vive más abajo, junto a las utilidades)
    const celdas = Array.from(fila.querySelectorAll('td')).map((td) => (td.textContent || '').trim());
    const cep = celdas.find((c) => /^\d{10,}$/.test(c)) || '';
    const tipo = celdas.find((c) => /^(Original|Sustitutiva)/i.test(c)) || '';

    // El botón correcto. La fila trae TRES: "Declaración completa" (imprime el
    // formulario), "Declaración perfilada" y "Comprobante de declaración", que
    // es el que queremos. Sus ids son j_idt62/64/66 y esos números cambian
    // entre versiones del portal: se elige por título o por el icono, nunca
    // por el id. Tomar el primero traía el PDF equivocado.
    const botones = Array.from(fila.querySelectorAll('button, a'));
    const disparador =
        botones.find((b) => /comprobante/i.test(b.getAttribute('title') || '')) ||
        botones.find((b) => b.querySelector('.ui-icon-file-download')) ||
        botones.find((b) => /comprobante/i.test(b.textContent || ''));

    if (!disparador) {
        console.warn(`🧾 [RECUPERAR] La fila no tiene el botón "Comprobante de declaración" (${botones.length} botones).`);
        return false;
    }

    console.log(`🧾 [RECUPERAR] ${mes} ${anio} · ${tipo || 'declaración'}${cep ? ` · CEP ${cep}` : ''}. Descargando el comprobante...`);
    capturedPdfBase64 = null;

    // Primero se REPRODUCE el POST del botón. Pulsarlo hace que el navegador
    // se lleve el PDF a la carpeta de descargas, donde el bot no lo ve: por
    // eso el 07-sep-2026 decía «se pulsó la descarga pero no llegó ningún
    // PDF» aunque el archivo hubiera bajado.
    capturedPdfBase64 = await traerPdfDelComprobantePresentado(disparador);

    // Y si el POST no salió, se pulsa igual: el interceptor del módulo 01
    // levanta el PDF cuando el portal lo entrega por `createObjectURL`.
    if (!capturedPdfBase64) {
        console.log('🧾 [RECUPERAR] El POST no trajo el PDF. Pulsando el botón como respaldo...');
        clickElement(disparador, 'Consulta · comprobante de declaración');
        for (let i = 0; i < 25; i++) {
            await sleep(700);
            if (capturedPdfBase64) break;
        }
    }

    if (!capturedPdfBase64) {
        console.warn('🧾 [RECUPERAR] Ni el POST ni el botón trajeron el comprobante. ' +
                     'Puede que haya bajado a la carpeta de descargas del navegador: ' +
                     'si está ahí, el portal contestó bien y lo que falla es la captura.');
        return false;
    }

    console.log('🧾 [RECUPERAR] Comprobante capturado. Subiéndolo...');
    await anotarBitacora('comprobante recuperado', `${st.nombre || st.ruc} · ${st.per}${cep ? ' · CEP ' + cep : ''}`);

    await syncDeclarationToSupabase(st.ruc, st.per, null, st.nombre, null, 'completado');
    await SafeStorage.remove(['recuperarComprobante', 'pendingAction', 'actionTimestamp']);

    if (typeof SriLoop !== 'undefined') {
        await SriLoop.marcarDeclarado(st.ruc, st.periodo, { nombre: st.nombre, cep, pdfSubido: true });
    }

    if (window.sriAssistant?.showEliteToast) {
        window.sriAssistant.showEliteToast({
            title: '🧾 Comprobante recuperado y guardado',
            msg: `${st.nombre || st.ruc} · ${st.per}. Subido a Supabase exitosamente.`,
            duration: 7000
        });
    }

    // Si el lote o auto-batch está activo, pasar al siguiente cliente
    const autoRes = await SafeStorage.get(['auto_batch_enabled', 'sri_auto_mode']);
    const enLote = autoRes.auto_batch_enabled || autoRes.sri_auto_mode || (typeof SriLoop !== 'undefined' && await SriLoop.puedeAvanzar());
    if (enLote && typeof handleBatchNextClient === 'function') {
        console.log('⏩ [RECUPERAR] Comprobante subido a Supabase. Pasando al siguiente cliente del lote...');
        await sleep(2000);
        const hasNext = await handleBatchNextClient();
        if (!hasNext && typeof cerrarSesionSRI === 'function') await cerrarSesionSRI();
    }
    return true;
}

if (typeof window !== 'undefined') {
    /** Uso a mano: sriRecuperarComprobante('RUC') para el periodo del lote. */
    window.sriRecuperarComprobante = async (ruc, year, month) => {
        const per = (year && month)
            ? { year: Number(year), monthIndex: Number(month) - 1 }
            : ((await SafeStorage.get(['workflowPeriod'])).workflowPeriod || SriLoop.periodoPorDefecto());
        const cache = (await SafeStorage.get(['sc_clients_cache'])).sc_clients_cache || [];
        const c = cache.find((x) => x && x.ruc === String(ruc).trim());
        return irARecuperarComprobante(String(ruc).trim(), per, c ? c.name : '');
    };
}

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
        // Guarda por DOM, no sólo por memoria (10-sep-2026): si la extensión
        // se recarga con una pestaña del SRI ya abierta, Chrome inyecta el
        // content script NUEVO sin retirar el viejo — dos SriLoopHUD
        // separados, cada uno con su propio `this._el` en null, montaban DOS
        // barras «#sri-loop-hud» superpuestas. SriAssistantPanel y el sidebar
        // de anticipación ya se cuidaban de esto por id; a éste le faltaba.
        const yaHay = document.getElementById('sri-loop-hud');
        if (yaHay) { this._el = yaHay; return; }

        const el = document.createElement('div');
        el.id = 'sri-loop-hud';
        // La marca que usan esDeLaExtension() y soloDelPortal() para no
        // confundir nuestros botones con los del portal.
        el.setAttribute('data-sc-ui', 'hud');
        el.style.cssText = [
            'position:fixed', 'z-index:2147483646', 'right:18px', 'bottom:18px',
            'display:flex', 'align-items:center', 'gap:8px',
            // Sin esto el HUD se salía de la pantalla en una ventana angosta,
            // y con él se iban los botones que frenan el lote.
            'flex-wrap:wrap', 'max-width:calc(100vw - 36px)',
            'padding:8px 10px', 'border-radius:14px',
            'background:rgba(5,20,36,0.94)', 'backdrop-filter:blur(14px)',
            'border:1px solid rgba(255,255,255,0.14)',
            'box-shadow:0 10px 30px rgba(0,0,0,0.5)',
            "font-family:'Manrope','Inter',system-ui,sans-serif",
            'font-size:12px', 'color:#d5e4fa', 'user-select:none', 'cursor:grab'
        ].join(';');

        el.innerHTML = [
            '<span id="slh-drag" title="Arrastrar" style="opacity:0.45;padding:0 2px;cursor:grab">⠿</span>',
            '<button id="slh-play" aria-label="Reanudar o pausar el lote" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer">▶</button>',
            '<button id="slh-paso" aria-label="Modo paso a paso: frenar al empezar cada fase" title="Modo paso a paso: el lote frena al empezar cada fase y ▶ da un paso" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(148,163,184,0.16);color:#cbd5e1">👣</button>',
            '<div style="display:flex;flex-direction:column;line-height:1.25;min-width:104px">',
            '  <span id="slh-estado" style="font-weight:800;font-size:11px">DETENIDO</span>',
            '  <span id="slh-detalle" style="font-size:10px;opacity:0.65;font-family:monospace">lote vacío</span>',
            '</div>',
            '<button id="slh-aqui" aria-label="Declarar al contribuyente que está logueado ahora" title="Declarar al contribuyente que está logueado ahora" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(56,189,248,0.16);color:#7dd3fc">🎯</button>',
            '<button id="slh-pdfs" aria-label="Traer todos los comprobantes de este contribuyente" title="Traer TODOS los comprobantes de declaraciones de este contribuyente" style="display:none;border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(74,222,128,0.16);color:#4ade80">🧾</button>',
            '<button id="slh-omitidos" aria-label="Ver los clientes que quedaron sin declarar y por qué" title="Clientes que quedaron sin declarar y por qué" style="display:none;border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(245,158,11,0.18);color:#fbbf24">⚠️ 0</button>',
            // Omitir y cerrar vienen de la píldora que se retiró: son acciones
            // del lote y su sitio es acá, junto al estado.
            '<button id="slh-omitir" aria-label="Omitir este cliente y pasar al siguiente" title="Omitir este cliente y pasar al siguiente" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(245,158,11,0.18);color:#fbbf24">⏭️</button>',
            // Se llamaba «✨ Sync» y no sincroniza: valida el resumen y, si el
            // saldo es $0 y no hay inconsistencias, ENVÍA. El rótulo lo dice.
            '<button id="slh-cerrar" aria-label="Cerrar la declaración: valida y, si está limpia, la envía" title="Cerrar la declaración: valida el resumen y, si el saldo es $0 y no hay inconsistencias, la ENVÍA" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(16,185,129,0.18);color:#5eead4">🏁</button>',
            '<span style="width:1px;align-self:stretch;background:rgba(255,255,255,0.12);margin:0 2px"></span>',
            '<button id="slh-cajon-btn" aria-label="Herramientas" aria-expanded="false" title="Herramientas: comprobantes, registro, cola, bitácora, proveedores, casilleros…" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(148,163,184,0.16);color:#cbd5e1">🧰</button>',
            '<button id="slh-registro" aria-label="Ver qué declaraciones tienen su comprobante guardado" title="Registro: qué se declaró y de cuáles está guardado el comprobante" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(167,139,250,0.18);color:#c4b5fd">📊</button>',
            '<button id="slh-migrar" aria-label="Migrar a la nube los comprobantes que quedaron dentro de la base" title="Migrar comprobantes que están guardados dentro de la base de datos" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(251,191,36,0.16);color:#fcd34d">\U0001f4e6</button>',
            '<button id="slh-subida" aria-label="Probar si la subida de comprobantes a la nube funciona" title="Probar la subida a la nube (dice por qué falla cada camino)" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(94,234,212,0.16);color:#5eead4">🔌</button>',
            '<button id="slh-cola" aria-label="Ver la cola: quién ya pasó, quién viene y quién quedó afuera" title="La cola del lote: quién ya pasó, quién viene y quién quedó afuera" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(56,189,248,0.16);color:#7dd3fc">👥</button>',
            '<button id="slh-bitacora" aria-label="Leer la bitácora de la corrida" title="Leer la bitácora de la corrida (y copiarla si hace falta)" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(148,163,184,0.16);color:#cbd5e1">📜</button>',
            '<button id="slh-notas" aria-label="Notas de venta: preguntar el 508 y el 117 en cada cliente" title="Notas de venta (comprobantes físicos). Con esto encendido, el lote pregunta el importe y la cantidad antes de llenar." style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;cursor:pointer;background:rgba(148,163,184,0.16);color:#cbd5e1" aria-pressed="false">📒</button>',
            '<button id="slh-proveedores" aria-label="Ver la base de proveedores" title="La base de proveedores: qué se aprendió y qué falta clasificar" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;cursor:pointer;background:rgba(192,132,252,0.16);color:#d8b4fe">🏷️</button>',
            '<button id="slh-ir" aria-label="Ir a una pantalla del SRI" title="Ir a: comprobantes recibidos · formulario de IVA · consulta de declaraciones · perfil" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;cursor:pointer;background:transparent;color:#cbd5e1;opacity:0.5">🧭</button>',
            '<button id="slh-casilleros" aria-label="Ver los casilleros que tiene este formulario" title="Ver TODOS los casilleros de este formulario con su id real (para confirmar el 540, el 502 y los que falten)" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(251,191,36,0.16);color:#fcd34d">📐</button>',
            '<button id="slh-chequeo" aria-label="Chequeo: ver si está todo listo para correr el lote" title="Chequeo: la subida, las claves, el catastro, los proveedores y las marcas que frenan el envío" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(94,234,212,0.16);color:#5eead4">🩺</button>',
            '<button id="slh-panel" aria-label="Abrir el panel detallado" title="Abrir el panel detallado (clientes, progreso, registro de la corrida)" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(148,163,184,0.16);color:#cbd5e1">🗔</button>',
            // El único botón que frena el semáforo de verdad. Antes había otro
            // igual de rojo en la barra de arriba que NO lo frenaba; se quitó.
            // Éste va rotulado: si es el que hay que apretar cuando algo va
            // mal, tiene que decir lo que hace sin pasar el mouse por encima.
            '<button id="slh-stop" aria-label="Parada de emergencia: detiene el lote" title="Parada de emergencia: detiene el lote" style="border:none;border-radius:10px;padding:8px 10px;min-width:34px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-weight:800;font-size:13px;cursor:pointer;background:rgba(239,68,68,0.2);color:#fca5a5;padding:8px 12px">🛑 Detener</button>',
            '</div>',
            // El cajón de herramientas: en su propia línea, para no empujar la
            // botonera del lote fuera de la pantalla.
            '<div id="slh-cajon" style="display:none;flex-basis:100%;flex-wrap:wrap;gap:6px;padding-top:8px;margin-top:2px;border-top:1px solid rgba(255,255,255,0.10)"></div>',
            // Plan de vuelo: qué pide el SRI y en qué paso va el bot.
            '<div id="slh-barra" style="display:none;position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(148,163,184,0.16);border-radius:0 0 14px 14px;overflow:hidden">',
            '  <div id="slh-barra-fill" style="position:relative;overflow:hidden;height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#7dd3fc);transition:width .7s cubic-bezier(.22,1,.36,1)"></div>',
            '</div>',
            '<div id="slh-plan" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px"></div>',
            '<div id="slh-omitidos-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:230px;overflow:auto"></div>',
            '<div id="slh-registro-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:230px;overflow:auto"></div>',
            '<div id="slh-subida-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:230px;overflow:auto"></div>',
            '<div id="slh-migrar-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:280px;overflow:auto"></div>',
            '<div id="slh-cola-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:260px;overflow:auto"></div>',
            '<div id="slh-bitacora-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:260px;overflow:auto"></div>',
            '<div id="slh-casilleros-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:340px;overflow:auto"></div>',
            '<div id="slh-ir-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px"></div>',
            '<div id="slh-proveedores-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:340px;overflow:auto"></div>',
            '<div id="slh-notas-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px"></div>',
            '<div id="slh-chequeo-panel" style="display:none;border-top:1px solid rgba(255,255,255,0.10);padding-top:8px;max-height:340px;overflow:auto"></div>'
        ].join('');

        if (!document.getElementById('slh-anim')) {
            const st = document.createElement('style');
            st.id = 'slh-anim';
            st.textContent = [
                '@keyframes slh-latido{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.82)}}',
                '@keyframes slh-avance{from{background-position:0 0}to{background-position:22px 0}}',
                '@keyframes slh-entra{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}',
                '.slh-p{display:flex;align-items:center;gap:7px;padding:2px 0;animation:slh-entra .25s ease-out}',
                '.slh-punto{width:8px;height:8px;border-radius:50%;flex:0 0 8px}',
                '.slh-activo .slh-punto{animation:slh-latido 1.1s ease-in-out infinite}',
                '.slh-linea{height:2px;flex:1;border-radius:2px;background-image:repeating-linear-gradient(90deg,rgba(125,211,252,.55) 0 7px,transparent 7px 14px);background-size:22px 2px;animation:slh-avance .8s linear infinite}',
                // Cambio de cliente: un destello corto, lo justo para que el ojo lo registre.
                '@keyframes slh-salta{0%{transform:translateY(6px);opacity:0}55%{transform:translateY(-2px)}100%{transform:none;opacity:1}}',
                '.slh-salta{animation:slh-salta .45s cubic-bezier(.22,1,.36,1)}',
                // Mientras corre, el rótulo de estado respira.
                '@keyframes slh-respira{0%,100%{opacity:1}50%{opacity:.62}}',
                '.slh-respira{animation:slh-respira 1.9s ease-in-out infinite}',
                // Brillo que recorre la barra: dice "esto sigue vivo" aunque el
                // porcentaje no se mueva en varios minutos.
                '@keyframes slh-brillo{from{transform:translateX(-100%)}to{transform:translateX(320%)}}',
                '.slh-brillo::after{content:"";position:absolute;inset:0;width:30%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);animation:slh-brillo 2.2s ease-in-out infinite}'
            ].join('');
            document.head.appendChild(st);
        }

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
            else if (e.estado === 'PAUSADO' || e.estado === 'PAUSANDO') {
                await SriLoop.reanudar(await this._faseActual());
            }
            else await this._arrancarTodo();
            this.pintar();
        });

        el.querySelector('#slh-paso').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const paso = await SriLoop.alternarPaso(await this._faseActual());
            this._aviso(paso ? '👣 Paso a paso' : '🏃 De corrido',
                paso ? 'El lote frena al empezar cada fase. ▶ da un paso.'
                     : 'El lote vuelve a avanzar sin parar.', 4500);
            this.pintar();
        });

        el.querySelector('#slh-aqui').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            await this._declararEsteCliente();
            this.pintar();
        });

        el.querySelector('#slh-pdfs').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const btn = ev.currentTarget;
            const previo = btn.textContent;
            btn.textContent = '⏳';
            try {
                if (!enConsultaDeclaraciones()) {
                    this._aviso('🧾 Voy por los comprobantes',
                        'Abro Consulta de declaraciones y bajo todos los que falten.', 6000);
                }
                await window.sriTraerComprobantes(true);
            } catch (e) {
                console.error('🧾 No se pudieron traer los comprobantes:', e);
                this._aviso('🧾 No pude', e.message, 7000);
            }
            btn.textContent = previo;
        });

        el.querySelector('#slh-omitidos').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-omitidos-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            await this.pintarOmitidos();
            panel.style.display = 'block';
        });

        // Delegación: los botones de cada fila se crean y se destruyen al
        // repintar, así que el listener vive en el contenedor, no en la fila.
        // Un solo panel abierto a la vez: si no, el HUD crece hasta tapar la
        // pantalla justo cuando hay que mirar el portal.
        const soloUno = (cual) => this.soloUnPanel(cual);

        // Las tres que venían de la píldora delegan en el panel, que es quien
        // sabe hacerlas. Acá solo viven los botones.
        el.querySelector('#slh-omitir').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (window.sriAssistant && window.sriAssistant.omitirClienteActual) {
                await window.sriAssistant.omitirClienteActual();
            } else {
                console.warn('⏭️ El panel todavía no está listo.');
            }
        });

        el.querySelector('#slh-cerrar').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (!window.sriAssistant || !window.sriAssistant.ejecutarCierreMagico) {
                console.warn('🏁 El panel todavía no está listo.');
                return;
            }
            // Sin confirm(). Un diálogo modal en medio de un lote desatendido
            // lo frena hasta que alguien lo conteste, y el 05-sep pasó
            // exactamente eso: algo pulsaba este botón solo y el cuadro
            // aparecía una y otra vez, bloqueando la corrida.
            //
            // La protección real son las cuatro comprobaciones del cierre
            // —resumen de verdad, saldo leído en cero, mensajes limpios, no
            // sustitutiva—, no una pregunta que hay que contestar a mano.
            this._aviso('🏁 Cerrando la declaración',
                'Se valida el resumen y, si el saldo es $0 y no hay inconsistencias, se envía.', 5000);
            await window.sriAssistant.ejecutarCierreMagico();
        });

        el.querySelector('#slh-panel').addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (window.sriAssistant && window.sriAssistant.toggleMinimize) {
                window.sriAssistant.toggleMinimize(false);
            }
        });

        el.querySelector('#slh-cola').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-cola-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            soloUno('slh-cola-panel');
            panel.style.display = 'block';
            await this.pintarCola();
        });

        el.querySelector('#slh-bitacora').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-bitacora-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            soloUno('slh-bitacora-panel');
            panel.style.display = 'block';
            await this.pintarBitacora();
        });

        // Copiar vive DENTRO del panel de la bitácora: primero se mira, después
        // se copia si sirve. Antes era un botón suelto que copiaba a ciegas.
        el.querySelector('#slh-bitacora-panel').addEventListener('click', async (ev) => {
            const btn = ev.target.closest('#slh-bitacora-copiar');
            if (!btn) return;
            ev.stopPropagation();
            try {
                const txt = await Bitacora.texto();
                await navigator.clipboard.writeText(txt);
                btn.textContent = '✅ copiada';
                setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
            } catch (e) {
                console.log(await Bitacora.texto());
                btn.textContent = '⚠️ mirá la consola';
            }
        });

        el.querySelector('#slh-chequeo').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-chequeo-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            this.soloUnPanel('slh-chequeo-panel');
            panel.style.display = 'block';
            await this.pintarChequeo();
        });

        el.querySelector('#slh-chequeo-panel').addEventListener('click', async (ev) => {
            if (!ev.target.closest('#slh-chequeo-otra')) return;
            ev.stopPropagation();
            await this.pintarChequeo();
        });

        el.querySelector('#slh-notas').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            // Si hay una pregunta en curso, el botón no la alterna: la muestra.
            if (this._notasPendiente) {
                const p = el.querySelector('#slh-notas-panel');
                soloUno('slh-notas-panel');
                p.style.display = 'block';
                return;
            }
            await NotasDeVenta.alternar();
            await this.pintarInterruptorNotas();
        });

        el.querySelector('#slh-proveedores').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-proveedores-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            soloUno('slh-proveedores-panel');
            panel.style.display = 'block';
            await this.pintarProveedores();
        });

        el.querySelector('#slh-proveedores-panel').addEventListener('click', async (ev) => {
            ev.stopPropagation();

            const ia = ev.target.closest('#slh-prov-ia');
            if (ia) {
                const antes = ia.textContent;
                ia.textContent = '⏳ preguntando…';
                const r = await Proveedores.sugerirDesdeIA();
                await this.pintarProveedores();
                const nuevo = document.getElementById('slh-prov-ia');
                if (nuevo) {
                    // El error del proveedor se muestra tal cual: si el modelo
                    // no existe o se acabó la cuota, hay que poder leerlo.
                    nuevo.textContent = r.error ? '⚠️ falló'
                                      : (r.sugeridos ? `✅ ${r.sugeridos}` : '🤖 sin datos');
                    nuevo.title = r.error || antes;
                    if (r.error) this._aviso('🤖 La IA no pudo', r.error, 9000);
                    setTimeout(() => { nuevo.textContent = antes; }, 3500);
                }
                return;
            }

            const cat = ev.target.closest('#slh-prov-catastro');
            if (cat) {
                const antes = cat.textContent;
                cat.textContent = '⏳ leyendo…';
                const r = await Proveedores.sugerirDesdeCatastro();
                await this.pintarProveedores();
                const nuevo = document.getElementById('slh-prov-catastro');
                if (nuevo) {
                    nuevo.textContent = r.sugeridos ? `✅ ${r.sugeridos}` : '🗂️ sin datos';
                    setTimeout(() => { nuevo.textContent = antes; }, 3000);
                }
                return;
            }

            const copiar = ev.target.closest('#slh-prov-copiar');
            if (copiar) {
                const txt = await Proveedores.exportar();
                try {
                    await navigator.clipboard.writeText(txt);
                    copiar.textContent = '✅ copiado';
                    setTimeout(() => { copiar.textContent = '📋 Copiar la base'; }, 2500);
                } catch (e) { console.log(txt); copiar.textContent = '⚠️ mirá la consola'; }
                return;
            }

            // Clasificar a mano. El RUC va en el elemento; nada más — la misma
            // regla que con las claves del SRI: nunca datos de más en el DOM.
            const marca = ev.target.closest('[data-sc-prov]');
            if (!marca) return;
            const ruc = marca.getAttribute('data-sc-prov');
            const deducible = marca.getAttribute('data-sc-ded') === 'si';
            // origen 'usuario': lo decidió el contador, y a partir de acá
            // ninguna sugerencia lo pisa.
            await Proveedores.clasificar(ruc, { deducible, origen: 'usuario' });
            await this.pintarProveedores();
        });

        // Discreto de verdad: medio transparente hasta que lo mirás.
        const brujula = el.querySelector('#slh-ir');
        brujula.addEventListener('mouseenter', () => { brujula.style.opacity = '1'; });
        brujula.addEventListener('mouseleave', () => { brujula.style.opacity = '0.5'; });
        brujula.addEventListener('focus', () => { brujula.style.opacity = '1'; });
        brujula.addEventListener('blur', () => { brujula.style.opacity = '0.5'; });

        brujula.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-ir-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            soloUno('slh-ir-panel');
            panel.style.display = 'block';
            await this.pintarIr();
        });

        el.querySelector('#slh-ir-panel').addEventListener('click', async (ev) => {
            const btn = ev.target.closest('[data-sc-ir]');
            if (!btn) return;
            ev.stopPropagation();
            const destino = btn.getAttribute('data-sc-ir');
            if (!destino || !destino.startsWith('https://srienlinea.sri.gob.ec/')) return;
            // Queda constancia: si el lote estaba a mitad de camino, después se
            // entiende por qué la página cambió sola.
            if (typeof anotarBitacora === 'function') anotarBitacora('ir a', btn.textContent.trim());
            window.location.href = destino;
        });

        el.querySelector('#slh-casilleros').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-casilleros-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            soloUno('slh-casilleros-panel');
            panel.style.display = 'block';
            this.pintarCasilleros();
        });

        // Copiar vive DENTRO del panel, igual que en la bitácora: primero se
        // mira lo que hay, después se copia. Y el click es el gesto del usuario
        // que el navegador exige para dejar tocar el portapapeles.
        el.querySelector('#slh-casilleros-panel').addEventListener('click', async (ev) => {
            const btn = ev.target.closest('#slh-casilleros-copiar');
            if (!btn) return;
            ev.stopPropagation();
            const md = (window.__mapaCasilleros && window.__mapaCasilleros.markdown) || '';
            try {
                await navigator.clipboard.writeText(md);
                btn.textContent = '✅ copiado';
                setTimeout(() => { btn.textContent = '📋 Copiar la tabla'; }, 2500);
            } catch (e) {
                // Si el portapapeles no deja, queda seleccionable a mano.
                const pre = el.querySelector('#slh-casilleros-texto');
                if (pre) {
                    pre.style.display = 'block';
                    const r = document.createRange();
                    r.selectNodeContents(pre);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(r);
                    btn.textContent = '👆 seleccionado: Ctrl+C';
                } else {
                    btn.textContent = '⚠️ mirá la consola';
                    console.log(md);
                }
            }
        });

        el.querySelector('#slh-registro').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-registro-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            soloUno('slh-registro-panel');
            panel.innerHTML = '<div style="font-size:11px;opacity:0.6;padding:4px 2px">Leyendo el registro…</div>';
            panel.style.display = 'block';
            await this.pintarRegistro();
        });

        el.querySelector('#slh-subida').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-subida-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            soloUno('slh-subida-panel');
            panel.innerHTML = '<div style="font-size:11px;opacity:0.6;padding:4px 2px">Probando la subida…</div>';
            panel.style.display = 'block';
            await this.pintarSubida();
        });

        el.querySelector('#slh-migrar').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const panel = el.querySelector('#slh-migrar-panel');
            if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
            soloUno('slh-migrar-panel');
            panel.innerHTML = '<div style="font-size:11px;opacity:0.6;padding:4px 2px">Mirando qué quedó dentro de la base…</div>';
            panel.style.display = 'block';
            await this.pintarMigracion();
        });

        // Migrar es de a un período y SIEMPRE después de haber listado. El
        // botón lo pinta `pintarMigracion()` con el período ya adentro.
        el.querySelector('#slh-migrar-panel').addEventListener('click', async (ev) => {
            const btn = ev.target.closest('[data-migrar]');
            if (!btn) return;
            ev.stopPropagation();
            await this.migrarPeriodo(btn.getAttribute('data-migrar'));
        });

        el.querySelector('#slh-omitidos-panel').addEventListener('click', async (ev) => {
            const btn = ev.target.closest('[data-reintentar]');
            if (!btn) return;
            ev.stopPropagation();
            const ruc = btn.getAttribute('data-reintentar');
            await Omitidos.reintentar(ruc);
            this._aviso('♻️ Vuelve a la cola',
                `${ruc} se reintentará en el próximo lote. Si la causa era la clave, cambiala antes.`, 6000);
            await this.pintarOmitidos();
            this.pintar();
        });

        // El 📋 suelto se retiró: copiar ahora vive dentro del panel de la
        // bitácora, donde primero se lee y después se copia si sirve.

        el.querySelector('#slh-stop').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            await SriLoop.emergencia();
            this.pintar();
        });

        // ── La botonera, ordenada ───────────────────────────────────────
        // Los botones no se recrean: se MUEVEN al cajón. Así los handlers, que
        // se enganchan más abajo buscando por id, siguen encontrándolos.
        const HERRAMIENTAS = [
            ['slh-pdfs',        'Comprobantes'],
            ['slh-registro',    'Registro'],
            ['slh-cola',        'La cola'],
            ['slh-bitacora',    'Bitácora'],
            ['slh-proveedores', 'Proveedores'],
            ['slh-notas',       'Notas de venta'],
            ['slh-casilleros',  'Casilleros'],
            ['slh-ir',          'Ir a…'],
            ['slh-chequeo',     'Chequeo'],
            ['slh-subida',      'Probar subida'],
            ['slh-migrar',      'Migrar a la nube'],
            ['slh-panel',       'Panel']
        ];
        const cajon = el.querySelector('#slh-cajon');
        HERRAMIENTAS.forEach(([id, rotulo]) => {
            const b = el.querySelector('#' + id);
            if (!b || !cajon) return;
            const celda = document.createElement('div');
            celda.setAttribute('data-celda', id);
            celda.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;width:70px';
            // Dentro del cajón todos se ven; quien decide si una herramienta
            // corresponde es pintar(), y lo hace sobre la celda entera para no
            // dejar un rótulo huérfano.
            b.style.display = 'inline-flex';
            celda.appendChild(b);
            const t = document.createElement('span');
            t.textContent = rotulo;
            t.style.cssText = 'font-size:9px;opacity:0.7;text-align:center;line-height:1.2';
            celda.appendChild(t);
            cajon.appendChild(celda);
        });

        el.querySelector('#slh-cajon-btn').addEventListener('click', (ev) => {
            ev.stopPropagation();
            const abierto = cajon.style.display === 'flex';
            cajon.style.display = abierto ? 'none' : 'flex';
            ev.currentTarget.setAttribute('aria-expanded', abierto ? 'false' : 'true');
            ev.currentTarget.style.background = abierto ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.30)';
            if (abierto) this.soloUnPanel(null);   // al cerrar, no queda nada abierto
        });

        // Escape cierra lo que esté abierto. Es lo que espera cualquiera, y
        // acá importa más que en otro lado: el HUD flota ENCIMA del portal y un
        // panel abierto tapa lo que el usuario está tratando de mirar.
        //
        // La pregunta de las notas de venta se respeta: tiene su propio reloj y
        // sus botones, y un Escape de más borraría lo que se acaba de teclear.
        document.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Escape' || this._notasPendiente) return;
            const cajonAbierto = cajon && cajon.style.display === 'flex';
            this.soloUnPanel(null);
            if (cajonAbierto) {
                cajon.style.display = 'none';
                const b = el.querySelector('#slh-cajon-btn');
                if (b) {
                    b.setAttribute('aria-expanded', 'false');
                    b.style.background = 'rgba(148,163,184,0.16)';
                }
            }
        });

        this._hacerArrastrable(el);

        try {
            chrome.storage.onChanged.addListener(async (c) => {
                if (!c.sc_loop) return;
                this.pintar();

                const antes = c.sc_loop.oldValue || {};
                const ahora = c.sc_loop.newValue || {};
                const seReanudo = antes.estado !== 'CORRIENDO' && ahora.estado === 'CORRIENDO';
                if (!seReanudo) return;

                // Solo si hay algo concreto que retomar, y una sola vez.
                const r = await SafeStorage.get(['pendingAction', 'pending_sri_autofill']);
                if (!r.pendingAction || !r.pending_sri_autofill) return;
                if (this._reanudando) return;
                this._reanudando = true;

                console.log(`▶️ [BUCLE] Reanudado con "${r.pendingAction}" pendiente. Recargando para retomarlo...`);
                anotarBitacora('reanudado', r.pendingAction);
                // Refrescamos el timestamp: si no, la acción puede llegar caducada.
                await SafeStorage.set({ actionTimestamp: Date.now() });
                await sleep(600);
                window.location.reload();
            });
        } catch (e) { /* sin listener */ }
        this.pintarInterruptorNotas().catch(() => {});
        setInterval(() => this.pintar(), 2000);
        setInterval(() => this.refrescarContadorOmitidos(), 5000);
        this.refrescarContadorOmitidos();
        this.pintar();
    },

    _aviso(title, msg, duration = 5000) {
        if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
            window.sriAssistant.showEliteToast({ title, msg, duration });
        } else {
            console.log(`${title} — ${msg}`);
        }
    },

    /** Las fases del ciclo, en orden, con la señal que las identifica. */
    FASES: [
        { id: 'login',     icono: '🔑', txt: 'Entrar al SRI' },
        { id: 'comprobar', icono: '🔍', txt: '¿Le toca declarar?' },
        { id: 'extraer',   icono: '📥', txt: 'Traer comprobantes recibidos' },
        { id: 'formulario',icono: '📝', txt: 'Llenar el formulario' },
        { id: 'verificar', icono: '⚖️', txt: 'Verificar que el saldo sea $0' },
        { id: 'enviar',    icono: '🚀', txt: 'Enviar la declaración' },
        { id: 'respaldo',  icono: '🧾', txt: 'Guardar el comprobante' },
        { id: 'siguiente', icono: '⏭️', txt: 'Pasar al siguiente' }
    ],

    /**
     * Anuncia en el perfil qué encontró y qué va a hacer, ANTES de irse a
     * comprobantes recibidos.
     *
     * Sin esto el bot entraba al perfil y desaparecía hacia otra pantalla sin
     * decir nada: desde afuera parecía que se había ido por su cuenta.
     * Se muestra una sola vez por carga de página.
     */
    /**
     * Despliega el panel de próximas obligaciones y lee lo que dice.
     * @returns {Promise<Array<{obligacion,periodo,vence,texto}>>}
     */
    async leerObligacionesDelPerfil() {
        const cabecera = Array.from(document.querySelectorAll('mat-expansion-panel-header, .mat-expansion-panel-header'))
            .find((h) => /obligacion/i.test(h.textContent || ''));

        // Abrirlo si está cerrado. Es un panel informativo del propio
        // contribuyente: desplegarlo no envía nada ni acepta nada.
        if (cabecera && cabecera.getAttribute('aria-expanded') !== 'true') {
            cabecera.click();
            await sleep(700);
        }

        const cuerpos = Array.from(document.querySelectorAll('.mat-expansion-panel-body'));
        const items = [];
        for (const c of cuerpos) {
            for (const li of Array.from(c.querySelectorAll('li'))) {
                const t = (li.textContent || '').replace(/\s+/g, ' ').trim();
                if (!t) continue;
                // «2011  DECLARACION DE IVA - AGOSTO 2026 - 16/09/2026»
                const m = t.match(/^(.+?)\s*-\s*([A-ZÁÉÍÓÚÑ]+\s+\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*$/i);
                if (m) {
                    items.push({ obligacion: m[1].trim(), periodo: m[2].trim(), vence: m[3], texto: t });
                } else {
                    items.push({ obligacion: t, periodo: '', vence: '', texto: t });
                }
            }
        }
        return items;
    },

    /**
     * Las obligaciones vigentes que lista el perfil.
     * @returns {Array<{texto: string, esIva: boolean}>}
     */
    obligacionesVigentesDelPerfil() {
        const nodos = Array.from(document.querySelectorAll('.alinear-texto-izq, [class*="alinear-texto"]'));
        const vistas = new Map();
        for (const el of nodos) {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            // Los códigos de obligación del SRI son de cuatro dígitos: 2011 IVA,
            // 1011 retenciones, 1021 renta…
            if (!/^\d{4}\s+[A-ZÁÉÍÓÚÑ]/i.test(t)) continue;
            if (!vistas.has(t)) vistas.set(t, { texto: t, esIva: /\bIVA\b/i.test(t) });
        }
        return [...vistas.values()];
    },

    /**
     * Qué corresponde hacer con quien está logueado, mirando solo el perfil.
     * @returns {Promise<{veredicto: string, motivo: string, iva?: object}>}
     *   'declarar'      → tiene IVA pendiente
     *   'ya_declarada'  → tiene la obligación pero no figura pendiente
     *   'no_declara_iva'→ no tiene obligación de IVA
     *   'no_concluyo'   → el perfil no dio información suficiente
     */
    async veredictoDelPerfil({ esperarMs = 12000 } = {}) {
        if (!location.href.includes('/contribuyente/perfil')) {
            return { veredicto: 'no_concluyo', motivo: 'no estamos en el perfil' };
        }

        // Angular pinta el perfil cuando vuelven sus llamadas REST. Se espera a
        // que aparezca CUALQUIERA de las dos señales antes de concluir nada.
        const inicio = Date.now();
        let avisado = false;
        while (Date.now() - inicio < esperarMs) {
            if (this.obligacionesVigentesDelPerfil().length) break;
            const acordeon = Array.from(document.querySelectorAll('mat-expansion-panel-header, .mat-expansion-panel-header'))
                .some((h) => /obligacion/i.test(h.textContent || ''));
            if (acordeon) break;
            if (!avisado) {
                console.log('⏳ [PERFIL] Esperando a que el portal pinte las obligaciones...');
                avisado = true;
            }
            await sleep(500);
        }

        const pendiente = await this.ivaDelPerfil();
        if (pendiente) {
            return { veredicto: 'declarar', motivo: `el perfil pide ${pendiente.periodoTexto}`, iva: pendiente };
        }

        const vigentes = this.obligacionesVigentesDelPerfil();
        if (!vigentes.length) {
            // Ni pendientes ni lista de obligaciones: la pantalla no terminó de
            // cargar, o este perfil no las muestra. No se concluye nada.
            return {
                veredicto: 'no_concluyo',
                motivo: `el perfil no listó obligaciones tras esperar ${Math.round(esperarMs / 1000)}s`
            };
        }

        const tieneIva = vigentes.some((o) => o.esIva);
        if (!tieneIva) {
            return {
                veredicto: 'no_declara_iva',
                motivo: `sus obligaciones son: ${vigentes.map((o) => o.texto).join(' · ')}`
            };
        }

        return {
            veredicto: 'ya_declarada',
            motivo: 'tiene la obligación de IVA y no figura ninguna pendiente'
        };
    },

    /** La obligación de IVA del panel, traducida al periodo interno. */
    async ivaDelPerfil() {
        const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO',
                       'AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
        for (const o of await this.leerObligacionesDelPerfil()) {
            if (!/IVA/i.test(o.obligacion)) continue;
            const p = o.periodo.toUpperCase().split(/\s+/);
            const mi = MESES.indexOf(p[0]);
            const anio = parseInt(p[1], 10);
            if (mi < 0 || !anio) continue;
            return { periodo: { year: anio, monthIndex: mi }, periodoTexto: o.periodo, vence: o.vence, texto: o.texto };
        }
        return null;
    },

    /**
     * Tarjeta de saludo. Se cierra sola, o con un click, o con Escape.
     * @param {{titulo,nombre,veredicto,detalle,pasos,paso,total,color}} d
     */
    mostrarSaludo(d) {
        document.getElementById('sc-saludo')?.remove();
        if (typeof instalarEstilosSC === 'function') instalarEstilosSC();

        if (!document.getElementById('sc-saludo-anim')) {
            const st = document.createElement('style');
            st.id = 'sc-saludo-anim';
            st.textContent = [
                '@keyframes sc-sube{from{opacity:0;transform:translate(-50%,-42%) scale(.94)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}',
                '@keyframes sc-baja{to{opacity:0;transform:translate(-50%,-56%) scale(.97)}}',
                '@keyframes sc-fila{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}',
                '@keyframes sc-halo{0%,100%{box-shadow:0 0 0 0 rgba(125,211,252,.35)}50%{box-shadow:0 0 0 12px rgba(125,211,252,0)}}',
                '#sc-saludo{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);',
                '  z-index:2147483647;width:min(420px,86vw);max-height:86vh;overflow:auto;',
                '  padding:22px 24px}',
                '#sc-saludo.sc-entra{animation:sc-sube .42s cubic-bezier(.22,1,.36,1)}',
                '#sc-saludo.sc-entra .sc-fila{animation:sc-fila .35s ease-out}',
                // Con las animaciones reducidas, aparece sin más: nunca invisible.
                '@media (prefers-reduced-motion:reduce){#sc-saludo.sc-entra,#sc-saludo.sc-entra .sc-fila{animation:none}}',
                '#sc-saludo.sc-yendose{animation:sc-baja .3s ease-in forwards}',
                '#sc-saludo .sc-fila{opacity:1}',
                '#sc-saludo .sc-avatar{animation:sc-halo 2.4s ease-in-out infinite}'
            ].join('');
            document.head.appendChild(st);
        }

        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));
        const color = d.color || 'var(--sc-activo)';
        const el = document.createElement('div');
        el.id = 'sc-saludo';
        el.className = 'sc-panel';

        const pasos = (d.pasos || []).map((p, i) => `
            <div class="sc-fila" style="display:flex;gap:9px;align-items:center;padding:3px 0;
                 font-size:11.5px;color:var(--sc-suave);animation-delay:${0.35 + i * 0.09}s">
              <span style="width:6px;height:6px;border-radius:50%;background:${color};flex:0 0 6px;opacity:.75"></span>
              <span>${esc(p)}</span>
            </div>`).join('');

        const contador = (d.total > 1)
            ? `<div style="font-size:10px;color:var(--sc-tenue);font-weight:800;letter-spacing:.08em">
                 CLIENTE ${d.paso} DE ${d.total}</div>`
            : '';

        el.innerHTML = `
          <div style="display:flex;gap:14px;align-items:flex-start">
            <div class="sc-avatar" style="width:42px;height:42px;border-radius:50%;flex:0 0 42px;
                 display:grid;place-items:center;font-size:20px;
                 background:rgba(125,211,252,.14);border:1px solid ${color}">${d.titulo || '👋'}</div>
            <div style="flex:1;min-width:0">
              ${contador}
              <div style="font-size:15px;font-weight:900;margin:2px 0 1px;line-height:1.25">${esc(d.nombre)}</div>
              <div style="font-size:11.5px;color:${color};font-weight:800">${esc(d.veredicto)}</div>
              ${d.detalle ? `<div style="font-size:11px;color:var(--sc-suave);margin-top:5px;line-height:1.45">${esc(d.detalle)}</div>` : ''}
            </div>
          </div>
          ${pasos ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--sc-borde)">${pasos}</div>` : ''}
          <div style="margin-top:12px;font-size:9.5px;color:var(--sc-tenue);text-align:right">
            click para cerrar
          </div>`;

        document.body.appendChild(el);
        // Solo se anima si hay alguien mirando. En una pestaña oculta el
        // navegador congela la animación en su primer fotograma y la tarjeta
        // quedaría invisible.
        if (typeof document.visibilityState === 'undefined' || document.visibilityState === 'visible') {
            el.classList.add('sc-entra');
        }

        const cerrar = () => {
            el.classList.add('sc-yendose');
            setTimeout(() => el.remove(), 320);
            document.removeEventListener('keydown', porTecla);
        };
        const porTecla = (ev) => { if (ev.key === 'Escape') cerrar(); };
        el.addEventListener('click', cerrar);
        document.addEventListener('keydown', porTecla);
        setTimeout(() => { if (document.body.contains(el)) cerrar(); }, d.duracion || 9000);
        return el;
    },

    async anunciarEnPerfil(e) {
        if (this._anunciado) return;
        if (e.estado !== 'CORRIENDO') return;
        if (!location.href.includes('/contribuyente/perfil')) return;

        this._anunciado = true;

        const cliente = (e.cola || [])[e.indice] || {};
        const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                       'agosto','septiembre','octubre','noviembre','diciembre'];
        const per = e.periodo ? `${MESES[e.periodo.monthIndex]} ${e.periodo.year}` : 'el periodo';

        // Del panel desplegable, que es donde el SRI lo dice de verdad.
        const delPanel = await this.ivaDelPerfil();

        const quien = cliente.name ? String(cliente.name).split(' ').slice(0, 2).join(' ') : 'este contribuyente';
        const detalle = delPanel
            ? `El SRI marca pendiente el IVA de ${delPanel.periodoTexto.toLowerCase()}, vence el ${delPanel.vence}.`
            : `Queda pendiente el IVA de ${per}.`;

        console.log(`📋 [PERFIL] ${detalle} Voy a declararlo para ${quien}.`);

        const total = (e.cola || []).length;
        const hora = new Date().getHours();
        const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
        const v = await this.veredictoDelPerfil();

        const guiones = {
            declarar: {
                titulo: '📋', color: 'var(--sc-activo)',
                veredicto: delPanel ? `IVA de ${delPanel.periodoTexto.toLowerCase()} · vence el ${delPanel.vence}` : 'Tiene una declaración pendiente',
                pasos: ['Traer los comprobantes recibidos', 'Llenar el formulario',
                        'Verificar que el saldo sea $0', 'Enviar y guardar el comprobante']
            },
            ya_declarada: {
                titulo: '✅', color: 'var(--sc-ok)',
                veredicto: 'Ya declaró este período',
                detalle: 'Tiene la obligación de IVA y no figura ninguna pendiente. No se declara de nuevo.',
                pasos: ['Confirmar en Consulta de declaraciones', 'Bajar el comprobante', 'Guardarlo en la nube']
            },
            no_declara_iva: {
                titulo: '🚫', color: 'var(--sc-alerta)',
                veredicto: 'No declara IVA',
                detalle: v.motivo, pasos: ['Queda en la lista de omitidos', 'Sigo con el próximo']
            },
            no_concluyo: {
                titulo: '👋', color: 'var(--sc-suave)',
                veredicto: 'Revisando sus obligaciones…',
                pasos: ['Leer qué pide el SRI', 'Decidir qué corresponde']
            }
        };
        const g = guiones[v.veredicto] || guiones.no_concluyo;

        this.mostrarSaludo({
            titulo: g.titulo, color: g.color,
            nombre: `${saludo}, ${quien}`,
            veredicto: g.veredicto,
            detalle: g.detalle,
            pasos: g.pasos,
            paso: (e.indice || 0) + 1, total
        });
        if (delPanel) {
            await anotarBitacora('el perfil pide', delPanel.texto);
            // Que el plan de vuelo lo muestre aunque la API no haya contestado.
            await SafeStorage.set({
                sri_obligacion_actual: {
                    periodo: delPanel.periodo,
                    periodoTexto: delPanel.periodoTexto,
                    vence: delPanel.vence,
                    estado: 'Por cumplir',
                    pendiente: true,
                    origen: 'panel del perfil'
                }
            });
        }

    },

    /** ¿En qué fase estamos? Se deduce de la URL y del estado guardado. */
    async _faseActual() {
        const u = window.location.href;
        const st = await SafeStorage.get(['pendingAction', 'declaration_synced_flag']);
        if (st.declaration_synced_flag) return 'respaldo';
        if (typeof encontrarCamposLogin === 'function' && encontrarCamposLogin()) return 'login';
        if (u.includes('comprobantesRecibidos')) return 'extraer';
        // Adentro pero todavía en el perfil: es cuando se le pregunta al portal
        // qué le toca. Antes este momento no aparecía en el plan y el bot
        // parecía saltar del login directo a comprobantes.
        if (u.includes('contribuyente/perfil') || u.includes('inicio/NAT')) return 'comprobar';
        if (typeof estaEnFormularioIva === 'function' && estaEnFormularioIva()) {
            return document.getElementById('frmFlujoDeclaracion:totalAPagar') ? 'verificar' : 'formulario';
        }
        if (String(st.pendingAction || '').includes('turbo')) return 'extraer';
        return 'login';
    },

    /**
     * Dibuja qué pide el SRI y en qué paso va el bot.
     * Nace de una duda concreta del usuario: ver entrar al bot a "documentos
     * recibidos" sin saber por qué daba desconfianza.
     */
    async pintarPlan(e) {
        const cont = this._el && this._el.querySelector('#slh-plan');
        if (!cont) return;

        if (e.estado === 'DETENIDO') { cont.style.display = 'none'; return; }
        cont.style.display = 'block';

        // Modo recuperación: el contribuyente ya declaró, solo falta el papel.
        const rec = (await SafeStorage.get(['recuperarComprobante'])).recuperarComprobante;
        if (rec) {
            const firmaRec = `rec|${rec.ruc}|${rec.per}|${rec.intentos || 0}`;
            if (this._firmaPlan === firmaRec) return;
            this._firmaPlan = firmaRec;
            cont.innerHTML = `
                <div style="font-size:9.5px;letter-spacing:.09em;color:#64748b;font-weight:800;margin-bottom:5px">
                  YA DECLARÓ · FALTA EL COMPROBANTE
                </div>
                <div style="font-size:11px;color:#7dd3fc;font-weight:700;margin-bottom:8px">
                  ${escapeHtml(rec.nombre || rec.ruc)} · ${escapeHtml(rec.per)}
                </div>
                <div class="slh-p slh-activo" style="color:#7dd3fc;font-size:10.5px;font-weight:800">
                  <span class="slh-punto" style="background:#7dd3fc"></span>
                  <span>🧾 Buscando el comprobante presentado</span>
                  <span class="slh-linea"></span>
                </div>
                <div style="font-size:10px;opacity:0.6;margin-top:6px">
                  No se vuelve a declarar: sería una sustitutiva.
                </div>`;
            return;
        }

        const fase = await this._faseActual();
        const i = this.FASES.findIndex((f) => f.id === fase);
        const cliente = (e.cola || [])[e.indice] || {};
        const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                       'agosto','septiembre','octubre','noviembre','diciembre'];
        const per = e.periodo ? `${MESES[e.periodo.monthIndex]} ${e.periodo.year}` : '';

        // Lo que pide el SRI. Primero lo que dijo su propia API; el texto de
        // la pantalla queda como respaldo.
        let exige = '';
        try {
            const ob = (await SafeStorage.get(['sri_obligacion_actual'])).sri_obligacion_actual;
            if (ob && ob.periodoTexto) {
                exige = `IVA ${String(ob.periodoTexto).toLowerCase()} · vence ${ob.vence}` +
                        (ob.dias !== undefined ? ` (${ob.dias} días)` : '');
            }
        } catch (e) { /* respaldo abajo */ }
        const txt = (document.body && document.body.textContent) || '';
        if (!exige) {
            const m = txt.match(/2011\s+DECLARACI[ÓO]N[^-]*-\s*([A-ZÁÉÍÓÚÑ]+\s+\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i);
            if (m) exige = `IVA ${m[1].toLowerCase()} · vence ${m[2]}`;
        }

        const filas = this.FASES.map((f, k) => {
            const hecho = k < i, activo = k === i;
            const color = hecho ? '#4ade80' : activo ? '#7dd3fc' : 'rgba(148,163,184,0.45)';
            const punto = hecho ? '#4ade80' : activo ? '#7dd3fc' : 'rgba(148,163,184,0.28)';
            return `<div class="slh-p ${activo ? 'slh-activo' : ''}" style="color:${color};font-size:10.5px;${activo ? 'font-weight:800' : ''}">
                      <span class="slh-punto" style="background:${punto}"></span>
                      <span style="opacity:${hecho ? 0.75 : 1}">${hecho ? '✓' : f.icono} ${f.txt}</span>
                      ${activo ? '<span class="slh-linea"></span>' : ''}
                    </div>`;
        }).join('');

        const firma = `${fase}|${i}|${cliente.ruc || ''}|${per}|${exige}`;
        if (this._firmaPlan === firma) return;   // nada cambió: dejar animar
        this._firmaPlan = firma;

        cont.innerHTML = `
            <div style="font-size:9.5px;letter-spacing:.09em;color:#64748b;font-weight:800;margin-bottom:5px">
              EL SRI PIDE
            </div>
            <div style="font-size:11px;color:#ffb95f;font-weight:700;margin-bottom:8px">
              ${exige ? escapeHtml(exige) : (per ? 'IVA ' + per : 'Declaración de IVA')}
            </div>
            <div style="font-size:9.5px;letter-spacing:.09em;color:#64748b;font-weight:800;margin-bottom:5px">
              PLAN ${cliente.name ? '· ' + escapeHtml(String(cliente.name).split(' ').slice(0, 2).join(' ')) : ''}
            </div>
            ${filas}`;
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

    /** Mantiene al día el contador del botón ⚠️, que solo aparece si hay alguno. */
    async refrescarContadorOmitidos() {
        const btn = document.getElementById('slh-omitidos');
        if (!btn) return;
        try {
            const lista = await Omitidos.lista();
            btn.textContent = `⚠️ ${lista.length}`;
            btn.style.display = lista.length ? '' : 'none';
        } catch (e) { /* el contador nunca rompe el HUD */ }
    },

    /** Dibuja la lista de omitidos con el motivo y qué se puede hacer. */
    async pintarOmitidos() {
        const panel = document.getElementById('slh-omitidos-panel');
        if (!panel) return;
        const lista = await Omitidos.lista();

        if (!lista.length) {
            panel.innerHTML = '<div style="font-size:11px;opacity:0.6;padding:4px 2px">✅ Ningún cliente quedó afuera.</div>';
            return;
        }

        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));
        const filas = lista.map((o) => {
            const ayuda = Omitidos.ARREGLO[o.motivo] || o.detalle || '';
            return [
                '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">',
                `  <div style="display:flex;align-items:center;gap:6px">`,
                `    <span style="font-weight:800;font-size:11px;flex:1">${esc(o.nombre || o.ruc)}</span>`,
                `    <button data-reintentar="${esc(o.ruc)}" style="border:none;border-radius:8px;padding:3px 8px;background:rgba(56,189,248,0.18);color:#7dd3fc;font-size:10px;font-weight:800;cursor:pointer">♻️ Reintentar</button>`,
                '  </div>',
                `  <div style="font-size:10px;color:#fbbf24;margin-top:2px">${esc(o.motivo.replace(/_/g, ' '))}${o.veces > 1 ? ` · ${o.veces} veces` : ''}</div>`,
                ayuda ? `  <div style="font-size:10px;opacity:0.65;margin-top:2px">${esc(ayuda)}</div>` : '',
                '</div>'
            ].join('');
        }).join('');

        panel.innerHTML =
            `<div style="font-size:10px;opacity:0.7;margin-bottom:4px">${lista.length} sin declarar</div>` + filas;
    },

    /**
     * La cola del lote, cruzada con lo que ya sabemos de cada cliente.
     * «cliente 2 de 27» dice la posición pero no QUIÉNES: quién ya pasó, quién
     * viene y quién quedó afuera vivía repartido en tres almacenes y solo se
     * podía mirar de a uno por consola.
     */
    async pintarCola() {
        const panel = document.getElementById('slh-cola-panel');
        if (!panel) return;

        const sem = await SriLoop.get();
        const cola = Array.isArray(sem.cola) ? sem.cola : [];
        if (!cola.length) {
            panel.innerHTML = '<div style="font-size:11px;opacity:0.6;padding:4px 2px">No hay ningún lote armado. Pulsá ▶ para empezar uno.</div>';
            return;
        }

        const periodo = (await SafeStorage.get(['workflowPeriod'])).workflowPeriod
                        || SriLoop.periodoPorDefecto();
        const omitidos = {};
        try { (await Omitidos.lista()).forEach((o) => { omitidos[o.ruc] = o; }); } catch (e) {}

        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));
        const filas = [];
        for (let i = 0; i < cola.length; i++) {
            const c = cola[i];
            let marca = '⬜', color = 'opacity:0.55', nota = 'en espera';

            const om = omitidos[c.ruc];
            const reg = await SriLoop.declaracionLocal(c.ruc, periodo);

            if (reg && reg.pdfSubido)      { marca = '✅'; color = 'color:#4ade80'; nota = 'declarado y guardado'; }
            else if (reg)                  { marca = '🧾'; color = 'color:#fbbf24'; nota = 'declarado · falta el comprobante'; }
            else if (om)                   { marca = '⚠️'; color = 'color:#fbbf24'; nota = om.motivo.replace(/_/g, ' '); }
            else if (i === (sem.indice || 0) && sem.estado === 'CORRIENDO') {
                                             marca = '⏳'; color = 'color:#7dd3fc'; nota = 'en curso ahora'; }

            filas.push(
                '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06)">' +
                `<span style="width:16px;text-align:center">${marca}</span>` +
                `<span style="flex:1;font-size:11px;font-weight:700;${color}">${esc(c.name || c.ruc)}</span>` +
                `<span style="font-size:10px;opacity:0.6">${esc(nota)}</span>` +
                '</div>');
        }

        const hechos = filas.filter((f) => f.includes('✅')).length;
        panel.innerHTML =
            `<div style="font-size:10px;opacity:0.75;margin-bottom:4px">` +
            `<b style="color:#4ade80">${hechos}</b> de ${cola.length} con su comprobante guardado</div>` +
            filas.join('');
    },

    /**
     * La bitácora, para leerla acá en vez de copiarla a ciegas.
     */
    /**
     * Deja abierto un solo panel del HUD.
     *
     * Es un método y no un ayudante suelto de montar() porque los paneles que
     * se abren solos —la pregunta de las notas de venta, por ejemplo— viven en
     * métodos y no veían al local. Una sola lista, en un solo lugar.
     */
    soloUnPanel(cual) {
        if (!this._el) return;
        ['slh-plan', 'slh-omitidos-panel', 'slh-registro-panel', 'slh-subida-panel',
         'slh-cola-panel', 'slh-bitacora-panel', 'slh-casilleros-panel',
         'slh-ir-panel', 'slh-proveedores-panel', 'slh-notas-panel',
         'slh-chequeo-panel']
            .filter((id) => id !== cual && id !== 'slh-plan')   // null cierra todos
            .forEach((id) => {
                const p = this._el.querySelector('#' + id);
                if (p) p.style.display = 'none';
            });
    },

    /**
     * Pinta el chequeo: qué anda, qué avisa y qué va a morder.
     *
     * Tres estados y ninguno más. Y cada uno dice QUÉ HACER — un diagnóstico
     * que no dice qué hacer no sirve de nada.
     */
    async pintarChequeo() {
        const panel = document.getElementById('slh-chequeo-panel');
        if (!panel || typeof Chequeo === 'undefined') return;
        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));

        panel.innerHTML = '<div style="font-size:11px;opacity:0.75;padding:6px 0">🩺 Revisando…</div>';

        let filas = [];
        try { filas = await Chequeo.correr(); }
        catch (e) {
            panel.innerHTML = `<div style="color:#fca5a5;font-size:11px">No se pudo chequear: ${esc(e.message)}</div>`;
            return;
        }

        const resumen = Chequeo.resumir(filas);
        const COLOR = {
            ok:       { i: '✅', c: '#86efac' },
            aviso:    { i: '⚠️', c: '#fcd34d' },
            problema: { i: '🛑', c: '#fca5a5' }
        };
        const cab = COLOR[resumen.estado];

        panel.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
            `  <span style="font-size:11px;font-weight:800;color:${cab.c}">${cab.i} ${esc(resumen.texto)}</span>` +
            '  <button id="slh-chequeo-otra" aria-label="Volver a chequear" style="border:none;border-radius:8px;padding:6px 10px;min-height:32px;background:rgba(148,163,184,0.18);color:#cbd5e1;font-size:11px;font-weight:800;cursor:pointer">↻ De nuevo</button>' +
            '</div>' +
            // Lo que muerde primero, arriba: nadie lee una lista de veinte
            // líneas buscando la roja.
            filas
                .slice()
                .sort((a, b) => {
                    const peso = { problema: 0, aviso: 1, ok: 2 };
                    return peso[a.estado] - peso[b.estado];
                })
                .map((f) => {
                    const c = COLOR[f.estado] || COLOR.ok;
                    return '<div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06)">' +
                        `<div style="font-size:11px"><span style="color:${c.c}">${c.i}</span> ` +
                        `<b>${esc(f.titulo)}</b> <span style="opacity:0.7">${esc(f.detalle)}</span></div>` +
                        (f.queHacer
                            ? `<div style="font-size:10px;opacity:0.65;margin-left:18px;line-height:1.45">→ ${esc(f.queHacer)}</div>`
                            : '') +
                        '</div>';
                }).join('');
    },

    /** El 📒 dice de un vistazo si el lote va a preguntar o no. */
    async pintarInterruptorNotas() {
        const b = this._el && this._el.querySelector('#slh-notas');
        if (!b || typeof NotasDeVenta === 'undefined') return;
        const on = await NotasDeVenta.estaEncendido();
        b.style.background = on ? 'rgba(192,132,252,0.22)' : 'rgba(148,163,184,0.16)';
        b.style.color = on ? '#d8b4fe' : '#cbd5e1';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.title = on
            ? 'Notas de venta ENCENDIDO: el lote pregunta el 508 y el 117 antes de llenar. Pulsá para apagar.'
            : 'Notas de venta apagado: no se toca el 508 ni el 117. Pulsá para que pregunte.';
    },

    /**
     * Pregunta el importe y la cantidad de notas de venta, con temporizador.
     *
     * Devuelve `null` si nadie contestó a tiempo — y ese null significa «no
     * sé», no «cero»: quien lo recibe no escribe nada en el formulario.
     *
     * El lote NO se detiene: la promesa se resuelve sola al vencer el reloj.
     *
     * @returns {Promise<{monto: number, cantidad: number}|null>}
     */
    preguntarNotasDeVenta({ ruc, nombre, periodo, segundos }) {
        const panel = this._el && this._el.querySelector('#slh-notas-panel');
        if (!panel) return Promise.resolve(null);

        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));
        const caja = 'background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.16);' +
                     'color:#e2e8f0;border-radius:8px;padding:9px 10px;font-family:ui-monospace,monospace;' +
                     'font-size:15px;font-weight:700;text-align:right';
        const boton = (fondo, color) => 'border:none;border-radius:9px;padding:10px 14px;min-height:38px;' +
                     `background:${fondo};color:${color};font-size:12px;font-weight:800;cursor:pointer`;

        // En el DOM del portal va sólo lo que hace falta ver. Nunca una clave.
        panel.innerHTML =
            '<div style="font-size:12px;font-weight:800;margin-bottom:2px">📒 Notas de venta (papel)</div>' +
            `<div style="font-size:11px;opacity:0.8;margin-bottom:6px">${esc(nombre || ruc)} · ${esc(periodo)}</div>` +

            // Por qué se pregunta. Sin esto, la pregunta aparece de la nada en
            // medio de un lote y no se sabe si es importante o se puede ignorar.
            '<div style="background:rgba(56,189,248,0.10);border-radius:8px;padding:7px 9px;' +
            'font-size:11px;line-height:1.5;opacity:0.9;margin-bottom:10px">' +
            'Son las de <b>papel</b>: no están en comprobantes electrónicos y el bot no tiene ' +
            'de dónde sacarlas. Si no las cargás, el 508 y el 117 quedan <b>vacíos</b> — ' +
            'no en cero.</div>' +

            // `autocomplete="off"` NO es decoración. El id es el mismo en cada
            // contribuyente, así que sin esto el navegador ofrecía lo tecleado
            // para el cliente anterior — y un número de otro aceptado sin
            // querer es una declaración mal hecha. Lo avisó el usuario:
            // «la sugerencia es para cada cliente, si no pone nada por defecto
            // vacío».
            '<div style="display:grid;grid-template-columns:1fr 92px;gap:10px;align-items:end">' +
            '  <label style="font-size:11px;opacity:0.85;font-weight:700">Valor total' +
            '    <span style="display:block;font-size:10px;opacity:0.6;font-weight:400">casillero 508 · en dólares</span>' +
            `    <input id="slh-nv-monto" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" autocomplete="off" style="display:block;width:100%;margin-top:4px;box-sizing:border-box;${caja}"></label>` +
            '  <label style="font-size:11px;opacity:0.85;font-weight:700">Cuántas' +
            '    <span style="display:block;font-size:10px;opacity:0.6;font-weight:400">casillero 117</span>' +
            `    <input id="slh-nv-cant" type="number" step="1" min="0" inputmode="numeric" placeholder="0" autocomplete="off" style="display:block;width:100%;margin-top:4px;box-sizing:border-box;${caja}"></label>` +
            '</div>' +

            // El 518 es el NETO del 508: «menos las notas de crédito». Sin
            // esto quedaba vacío con el 508 lleno — el mismo error que el
            // 550, y el crédito tributario sale del neto.
            //
            // Se deja vacío a propósito: la mayoría de las veces no hay notas
            // de crédito de notas de venta, y ahí el 518 vale lo mismo que el
            // 508. Un cero escrito acá y un campo vacío significan lo mismo
            // para el formulario, pero el vacío no le pone al contador un
            // número que él no puso.
            '<label style="display:block;margin-top:10px;font-size:11px;opacity:0.85;font-weight:700">' +
            '  Notas de crédito de esas notas de venta' +
            '  <span style="display:block;font-size:10px;opacity:0.6;font-weight:400">' +
            '    casillero 518 · dejalo vacío si no hubo</span>' +
            `  <input id="slh-nv-nc" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" autocomplete="off" style="display:block;width:100%;margin-top:4px;box-sizing:border-box;${caja}"></label>` +

            // Lo que se va a escribir, en palabras, antes de escribirlo.
            '<div id="slh-nv-eco" style="font-size:11px;margin-top:8px;min-height:16px;color:#7dd3fc"></div>' +

            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
            `  <button id="slh-nv-ok" style="${boton('rgba(16,185,129,0.22)', '#5eead4')};flex:1">✓ Guardar</button>` +
            `  <button id="slh-nv-no" style="${boton('rgba(148,163,184,0.18)', '#cbd5e1')}">No tuvo</button>` +
            `  <button id="slh-nv-mas" style="${boton('rgba(148,163,184,0.12)', '#94a3b8')}" title="Otro minuto para buscar el dato">+1 min</button>` +
            '</div>' +

            // La barra dice cuánto queda de un vistazo; el texto, qué pasa si
            // se acaba. Las dos cosas, porque una sola no alcanza.
            '<div style="height:4px;background:rgba(255,255,255,0.10);border-radius:3px;margin-top:12px;overflow:hidden">' +
            '  <div id="slh-nv-barra" style="height:100%;width:100%;background:#38bdf8;transition:width 0.9s linear"></div>' +
            '</div>' +
            '<div id="slh-nv-reloj" style="font-size:10px;opacity:0.7;margin-top:6px;line-height:1.45"></div>';

        this.soloUnPanel('slh-notas-panel');
        panel.style.display = 'block';
        this._notasPendiente = true;
        const reloj = panel.querySelector('#slh-nv-reloj');
        const campoMonto = panel.querySelector('#slh-nv-monto');
        setTimeout(() => { try { campoMonto.focus(); } catch (e) { /* nada */ } }, 60);

        const barra = panel.querySelector('#slh-nv-barra');
        const eco = panel.querySelector('#slh-nv-eco');
        const campoCant = panel.querySelector('#slh-nv-cant');
        const campoNc = panel.querySelector('#slh-nv-nc');

        // Vacíos SIEMPRE, para cada contribuyente. Aunque el navegador haya
        // restaurado algo, aunque el panel se reabra: el dato de uno no puede
        // aparecer prellenado en la pantalla del siguiente.
        campoMonto.value = ''; campoCant.value = ''; campoNc.value = '';

        return new Promise((resolve) => {
            const total = segundos;
            let quedan = segundos;
            let terminado = false;
            // Cuándo se tecleó por última vez. 0 = nunca.
            let ultimaTecla = 0;

            const cerrar = (valor) => {
                if (terminado) return;
                terminado = true;
                clearInterval(tic);
                this._notasPendiente = false;
                panel.style.display = 'none';
                panel.innerHTML = '';
                resolve(valor);
            };

            const pintarReloj = () => {
                barra.style.width = `${Math.max(0, (quedan / total) * 100)}%`;
                barra.style.background = quedan <= 10 ? '#fb923c' : '#38bdf8';
                reloj.textContent =
                    `Quedan ${quedan}s. Si no contestás, el lote sigue y el 508 y el 117 ` +
                    'quedan sin tocar — no en cero.';
            };

            const tic = setInterval(() => {
                // EL RELOJ NO CORRE MIENTRAS ESCRIBÍS.
                //
                // Un temporizador que vence mientras la persona está tipeando
                // el número castiga justo a quien está contestando.
                //
                // Pero el FOCO no alcanza como señal: este panel se autoenfoca
                // al abrirse, así que «congelar mientras el campo tiene el
                // foco» congelaba el reloj para siempre y un lote de 27 se
                // quedaba esperando en el primero. Lo cazó el banco, no la
                // lectura. Cuenta lo que la persona hizo: algo escrito, o una
                // tecla en los últimos segundos.
                const recien = Date.now() - ultimaTecla < 6000;
                const escribiendo = campoMonto.value !== '' || campoCant.value !== '' ||
                                    campoNc.value !== '' || recien;
                if (escribiendo) {
                    reloj.textContent = 'El reloj está detenido mientras cargás. Apretá ✓ Guardar o Enter.';
                    barra.style.background = '#5eead4';
                    return;
                }

                quedan--;
                if (quedan <= 0) {
                    // Se acabó el tiempo: null, que NO es cero. El lote sigue.
                    cerrar(null);
                    return;
                }
                pintarReloj();
            }, 1000);
            pintarReloj();

            // Lo que se va a escribir, dicho en palabras antes de escribirlo.
            const repetir = () => {
                const m = parseFloat(campoMonto.value);
                const c = parseInt(campoCant.value, 10);
                const nc = parseFloat(campoNc.value);
                if (!campoMonto.value && !campoCant.value && !campoNc.value) {
                    eco.textContent = ''; return;
                }
                const partes = [];
                partes.push(m > 0 ? `$${m.toFixed(2)} al 508` : 'nada al 508');
                // El 518 es el neto, y se muestra ya calculado: es el número
                // que va a quedar en el formulario, no el que se tecleó.
                if (m > 0) {
                    const neto = Math.max(0, m - (nc > 0 ? nc : 0));
                    partes.push(`$${neto.toFixed(2)} al 518` + (nc > 0 ? ` (menos $${nc.toFixed(2)} de NC)` : ''));
                }
                partes.push(c > 0 ? `${c} comprobante(s) al 117` : 'nada al 117');
                eco.textContent = '→ Se va a escribir ' + partes.join(', ') + '.';
            };
            campoMonto.addEventListener('input', repetir);
            campoCant.addEventListener('input', repetir);
            panel.querySelectorAll('input').forEach((i) => {
                i.addEventListener('keydown', () => { ultimaTecla = Date.now(); });
            });

            panel.querySelector('#slh-nv-ok').addEventListener('click', (ev) => {
                ev.stopPropagation();
                cerrar({
                    monto: parseFloat(campoMonto.value) || 0,
                    cantidad: parseInt(campoCant.value, 10) || 0,
                    nc: parseFloat(campoNc.value) || 0
                });
            });
            // «No tuvo» es una respuesta, no un silencio: cuenta para dejar de
            // preguntarle a este cliente en los próximos períodos.
            panel.querySelector('#slh-nv-no').addEventListener('click', (ev) => {
                ev.stopPropagation();
                cerrar({ monto: 0, cantidad: 0, nc: 0 });
            });
            // Un minuto más, para cuando hay que ir a buscar el dato.
            panel.querySelector('#slh-nv-mas').addEventListener('click', (ev) => {
                ev.stopPropagation();
                quedan += 60;
                pintarReloj();
            });
            // Enter en cualquiera de los dos campos guarda.
            panel.querySelectorAll('input').forEach((i) => {
                i.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') panel.querySelector('#slh-nv-ok').click();
                });
            });
        });
    },

    /**
     * La base de proveedores: qué se aprendió y qué falta.
     *
     * Los pendientes salen ordenados por cuántas veces apareció cada uno.
     * Clasificar el proveedor que está en 200 facturas rinde doscientas veces
     * más que el que está en una, y con 500 contribuyentes esa diferencia es
     * la que hace que la base se llene sola en vez de nunca.
     */
    async pintarProveedores() {
        const panel = document.getElementById('slh-proveedores-panel');
        if (!panel) return;
        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));

        if (typeof Proveedores === 'undefined') {
            panel.innerHTML = '<div style="opacity:0.7;font-size:11px">La base de proveedores no está cargada.</div>';
            return;
        }

        const r = await Proveedores.resumen();
        const faltan = await Proveedores.pendientes(40);

        // A qué se dedica el CLIENTE. Sin esto no se puede juzgar ninguna de
        // las decisiones de abajo: una compra da crédito tributario cuando
        // alimenta una actividad que a su vez está gravada, así que la misma
        // factura da distinta respuesta para un constructor y para otro rubro.
        let quienCompra = null;
        try {
            const rucCli = typeof rucDelClienteActual === 'function' ? await rucDelClienteActual() : '';
            if (rucCli && typeof Catastro !== 'undefined' && await Catastro.cargar()) {
                quienCompra = Catastro.buscar(rucCli);
            }
        } catch (e) { /* sin catastro se sigue, con menos datos */ }

        const bandaCliente = quienCompra
            ? '<div style="background:rgba(56,189,248,0.12);color:#7dd3fc;border-radius:8px;padding:6px 8px;margin-bottom:8px;font-size:11px;line-height:1.5">' +
              `👤 <b>El cliente se dedica a:</b> ${esc(String(quienCompra.actividad || '(sin actividad en el catastro)').slice(0, 110))}` +
              '<br><span style="opacity:0.75">Una compra da crédito tributario si es compatible con esta actividad. ' +
              'Eso lo decidís vos: acá sólo está el dato.</span></div>'
            : '<div style="background:rgba(251,191,36,0.14);color:#fcd34d;border-radius:8px;padding:6px 8px;margin-bottom:8px;font-size:11px;line-height:1.5">' +
              '👤 <b>No se sabe a qué se dedica el cliente.</b> Sin eso no se puede juzgar si una ' +
              'compra es compatible con su actividad. (Puede ser de otra provincia: el catastro es de El Oro.)</div>';

        if (r.total === 0) {
            panel.innerHTML =
                '<div style="opacity:0.8;font-size:11px;line-height:1.55">' +
                '🏷️ <b>La base está vacía.</b><br>' +
                'Se llena sola: cada factura de compras que pasa por el bot deja anotado ' +
                'a su proveedor. Corré una extracción y volvé.</div>';
            return;
        }

        const cabecera =
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
            `  <span style="font-size:11px;font-weight:800">🏷️ ${r.total} proveedores · ${r.comprobantes} comprobantes</span>` +
            '  <span style="display:flex;gap:6px">' +
            '    <button id="slh-prov-catastro" aria-label="Sugerir la actividad de cada proveedor desde el catastro del SRI" title="Completa la actividad de cada RUC con el catastro del SRI. Sugiere, no decide." style="border:none;border-radius:8px;padding:6px 10px;min-height:32px;background:rgba(56,189,248,0.16);color:#7dd3fc;font-size:11px;font-weight:800;cursor:pointer">🗂️ Catastro</button>' +
            '    <button id="slh-prov-ia" aria-label="Preguntarle a la IA la categoría de los que quedaron sin clasificar" title="Le pregunta a la IA SOLO por los que ni el contador ni el catastro resolvieron. Sale el nombre y la actividad pública; nunca el RUC ni los importes." style="border:none;border-radius:8px;padding:6px 10px;min-height:32px;background:rgba(192,132,252,0.16);color:#d8b4fe;font-size:11px;font-weight:800;cursor:pointer">🤖 IA</button>' +
            '    <button id="slh-prov-copiar" aria-label="Copiar la base de proveedores" style="border:none;border-radius:8px;padding:6px 10px;min-height:32px;background:rgba(148,163,184,0.18);color:#cbd5e1;font-size:11px;font-weight:800;cursor:pointer">📋 Copiar</button>' +
            '  </span>' +
            '</div>' +
            `<div style="font-size:10px;opacity:0.7;margin-bottom:8px">` +
            Object.keys(r.porOrigen).map((o) => `${esc(o)}: <b>${r.porOrigen[o]}</b>`).join(' · ') +
            '</div>';

        if (!faltan.length) {
            panel.innerHTML = cabecera + bandaCliente +
                '<div style="background:rgba(74,222,128,0.14);color:#86efac;border-radius:8px;padding:8px;font-size:11px">' +
                '✅ No queda ninguno sin clasificar.</div>';
            return;
        }

        // El aviso que protege la firma: un proveedor que figura suspendido o
        // pasivo en el catastro y sigue emitiendo es una compra objetable.
        const noActivos = faltan.filter((p) => p.estadoSri);
        const alertaEstado = noActivos.length
            ? '<div style="background:rgba(239,68,68,0.16);color:#fca5a5;border-radius:8px;padding:6px 8px;margin-bottom:8px;font-size:11px;line-height:1.5">' +
              `🚩 <b>${noActivos.length}</b> proveedor(es) NO figuran activos en el catastro del SRI. ` +
              'Una compra a un RUC suspendido es la clase de cosa que el SRI objeta.</div>'
            : '';

        // Los del 5% van primero. El usuario avisó que esa tarifa es del
        // sector construcción: son justo los que hay que mirar contra la
        // actividad del cliente, y perderlos al final de una lista de cuarenta
        // es perderlos.
        const del5 = faltan.filter((p) => p.tarifas && p.tarifas['5']);
        faltan.sort((a, b) => ((b.tarifas && b.tarifas['5']) ? 1 : 0) - ((a.tarifas && a.tarifas['5']) ? 1 : 0));

        const alerta5 = del5.length
            ? '<div style="background:rgba(251,146,60,0.16);color:#fdba74;border-radius:8px;padding:6px 8px;margin-bottom:8px;font-size:11px;line-height:1.5">' +
              `🧱 <b>${del5.length}</b> proveedor(es) facturaron al <b>5%</b>, la tarifa del sector construcción. ` +
              'Van primeros en la lista: revisá que su actividad y la del cliente justifiquen el crédito ' +
              'tributario antes de marcarlos.</div>'
            : '';

        const filas = faltan.map((p) => {
            const nombre = p.nombre || '(sin nombre)';
            // La actividad que sugiere el catastro: no decide, pero ahorra el
            // 90% del trabajo de clasificar a mano.
            const act = p.actividad
                ? `<span style="opacity:0.7"> · ${esc(String(p.actividad).slice(0, 48))}</span>` : '';
            // La categoría lleva de dónde salió pegada al lado. Una sugerencia
            // de la IA no puede parecer lo mismo que algo que confirmó alguien.
            const cat = p.categoria
                ? `<span style="background:rgba(192,132,252,0.18);color:#d8b4fe;border-radius:5px;padding:1px 5px;margin-left:4px;font-size:10px">${esc(p.categoria)}${p.origen === 'ia' ? ' · IA' : ''}</span>`
                : '';
            const bandera = p.estadoSri
                ? `<span style="color:#fca5a5;font-weight:800"> · ${esc(p.estadoSri)}</span>` : '';
            // A qué tarifa factura, contado de lo que se vio. No hace falta
            // preguntárselo a nadie: está en cada factura.
            const t = p.tarifas || {};
            const vistas = Object.keys(t).sort();
            const chapaTarifa = vistas.length
                ? '<span style="margin-left:4px;font-size:10px;border-radius:5px;padding:1px 5px;' +
                  (t['5'] ? 'background:rgba(251,146,60,0.2);color:#fdba74"' : 'background:rgba(148,163,184,0.16);color:#cbd5e1"') +
                  ` title="Tarifas vistas en sus comprobantes">${vistas.map((k) => (k === '?' ? '?' : k + '%') + '×' + t[k]).join(' ')}</span>`
                : '';
            return '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06)">' +
                `<span style="flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.ruc)}${p.actividad ? ' · ' + esc(p.actividad) : ''}">` +
                `  <b>${esc(nombre)}</b>${bandera}${cat}<span style="opacity:0.55"> · ${p.veces} comp.</span>${chapaTarifa}${act}</span>` +
                `<button data-sc-prov="${esc(p.ruc)}" data-sc-ded="si" title="Con derecho a crédito tributario" style="border:none;border-radius:7px;padding:5px 9px;min-height:30px;background:rgba(74,222,128,0.16);color:#86efac;font-size:11px;font-weight:800;cursor:pointer">deducible</button>` +
                `<button data-sc-prov="${esc(p.ruc)}" data-sc-ded="no" title="Sin derecho a crédito tributario (casillero 502)" style="border:none;border-radius:7px;padding:5px 9px;min-height:30px;background:rgba(251,191,36,0.16);color:#fcd34d;font-size:11px;font-weight:800;cursor:pointer">no</button>` +
                '</div>';
        }).join('');

        panel.innerHTML = cabecera + bandaCliente + alertaEstado + alerta5 +
            `<div style="font-size:10px;opacity:0.75;margin-bottom:4px">Faltan clasificar <b>${faltan.length}</b>, los más frecuentes primero:</div>` +
            filas +
            '<div style="font-size:10px;opacity:0.6;margin-top:8px;line-height:1.5">' +
            'Lo que marques queda como decisión tuya y ninguna sugerencia lo pisa. ' +
            'Sin clasificar, la compra va donde va hoy — nunca al 502 por las dudas.</div>';
    },

    /**
     * Los tres saltos que siempre se hacen a mano.
     *
     * Van por los puentes SSO de la Matriz Tatuada, no por la URL directa: el
     * puente es el que transfiere la sesión de Angular a JSF. Entrar derecho a
     * la URL final con la sesión en el lado equivocado devuelve un login.
     */
    async pintarIr() {
        const panel = document.getElementById('slh-ir-panel');
        if (!panel) return;

        const destinos = [
            ['📥', 'Comprobantes recibidos', SRI_PUENTE_RECIBIDOS],
            ['📝', 'Formulario de IVA', SRI_PUENTE_FORMULARIO_IVA],
            ['📋', 'Consulta de declaraciones', SRI_PUENTE_CONSULTA_DECLARACIONES],
            ['👤', 'Perfil del contribuyente', 'https://srienlinea.sri.gob.ec/sri-en-linea/contribuyente/perfil']
        ];

        let corriendo = false;
        try { corriendo = (await SriLoop.get()).estado === 'CORRIENDO'; } catch (e) {}

        const aviso = corriendo
            ? '<div style="background:rgba(245,158,11,0.16);color:#fcd34d;border-radius:8px;padding:6px 8px;margin-bottom:6px;font-size:11px">' +
              '⚠️ El lote está <b>corriendo</b>. Si te movés a mano, el bot pierde el hilo de dónde estaba.</div>'
            : '';

        panel.innerHTML = aviso +
            '<div style="display:flex;flex-direction:column;gap:4px">' +
            destinos.map(([ico, txt, url]) =>
                `<button data-sc-ir="${url}" style="text-align:left;border:none;border-radius:8px;padding:8px 10px;min-height:34px;` +
                'background:rgba(148,163,184,0.12);color:#cbd5e1;font-size:11px;font-weight:700;cursor:pointer">' +
                `${ico}  ${txt}</button>`
            ).join('') +
            '</div>';
    },

    /**
     * Pinta los casilleros que el formulario tiene DE VERDAD.
     *
     * Existe porque el 540 y el 550 no aparecen en pantalla y no se sabe si es
     * que no existen, que se llaman distinto o que el portal solo los muestra
     * en ciertos períodos. Suponerles un id es lo que la §5b prohíbe.
     *
     * Va como botón y no como comando de consola por una razón concreta: la
     * consola del content script no siempre deja pegar, y un dato que solo se
     * saca escribiendo es un dato que no se saca.
     */
    pintarCasilleros() {
        const panel = document.getElementById('slh-casilleros-panel');
        if (!panel) return;
        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));

        if (typeof sriMapaCasilleros !== 'function') {
            panel.innerHTML = '<div style="opacity:0.7;font-size:11px">No está cargado el lector de casilleros.</div>';
            return;
        }

        let mapa = [];
        try { mapa = sriMapaCasilleros() || []; } catch (e) {
            panel.innerHTML = `<div style="color:#fca5a5;font-size:11px">No pude leer el formulario: ${esc(e.message)}</div>`;
            return;
        }

        // Cuando no encuentra nada tiene que decir QUÉ vio. «No hay casilleros»
        // no permite arreglar nada; «hay 84 inputs y ninguno con número al
        // lado» sí. El diagnóstico se copia igual que la tabla.
        const d = (window.__mapaCasilleros && window.__mapaCasilleros.diagnostico) || {};
        const radiografia =
            '<div style="font-size:10px;opacity:0.75;line-height:1.6;background:rgba(148,163,184,0.10);' +
            'border-radius:8px;padding:6px 8px;margin-top:6px">' +
            `<b>Lo que hay en esta pantalla</b><br>` +
            `ruta: <code>${esc(d.url)}</code><br>` +
            `inputs de texto: <b>${d.inputsDeTexto}</b> · ocultos: ${d.inputsOcultos}<br>` +
            `con id <code>conceptoNNNN</code>: <b>${d.conIdConcepto}</b><br>` +
            `tablas: ${d.tablas} · celdas con un número solo: <b>${d.celdasSoloNumero}</b><br>` +
            `desplegables: <b>${d.desplegables || 0}</b><br>` +
            `primeros ids: <code>${esc((d.primerosIds || []).join(', '))}</code>` +
            '</div>';

        if (mapa.length === 0) {
            panel.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">' +
                '  <span style="font-size:11px;font-weight:800">📐 Ningún casillero acá</span>' +
                '  <button id="slh-casilleros-copiar" style="border:none;border-radius:8px;padding:6px 10px;min-height:32px;background:rgba(148,163,184,0.18);color:#cbd5e1;font-size:11px;font-weight:800;cursor:pointer">📋 Copiar la tabla</button>' +
                '</div>' +
                '<div style="opacity:0.85;font-size:11px;line-height:1.5">' +
                'Hay que estar <b>dentro del formulario</b> (el paso 3 del asistente), ' +
                'no en el período fiscal ni en el resumen de pago.<br>' +
                'Si ya estás ahí, copiá esto y pasámelo — dice qué vio:' +
                '</div>' +
                // Aunque no haya cajas de texto puede haber desplegables, y uno
                // de ellos es el que hoy frena el 5%. Irse diciendo «no hay
                // nada» sin mirarlos fue exactamente el error de esta pantalla.
                (((window.__mapaCasilleros && window.__mapaCasilleros.desplegables) || []).length
                    ? '<div style="margin-top:8px;font-size:11px;color:#fcd34d">' +
                      '🔽 Pero sí hay <b>' +
                      window.__mapaCasilleros.desplegables.length +
                      '</b> desplegable(s) — mirá la consola o copiá la tabla.</div>'
                    : '') +
                radiografia;
            return;
        }

        // Los DESPLEGABLES van en su propio bloque, con las opciones desplegadas.
        // El 203 —el decreto que habilita la tarifa reducida del 5%— es uno de
        // ellos, y hasta el 07-sep-2026 este panel ni los miraba: decía «no hay
        // nada» donde sí había.
        const desps = (window.__mapaCasilleros && window.__mapaCasilleros.desplegables) || [];
        const bloqueDesplegables = desps.length
            ? '<div style="margin-top:10px">' +
              `<div style="font-size:11px;font-weight:800;margin-bottom:4px">🔽 ${desps.length} desplegable(s)</div>` +
              desps.map((dd) => {
                  const esDelDecreto = dd.casillero === '203' ||
                        /tarifa reducida|decreto/i.test(dd.rotulo);
                  const borde = esDelDecreto ? 'border-left:3px solid #fbbf24;' : 'border-left:3px solid rgba(148,163,184,0.3);';
                  const ops = dd.opciones.length
                      ? dd.opciones.map((o) =>
                            `<div style="font-size:10px;opacity:0.85;padding-left:10px">` +
                            `<code style="color:#7dd3fc">${esc(o.valor)}</code> · ${esc(o.texto)}` +
                            (o.elegida ? ' <b style="color:#86efac">← elegida</b>' : '') + '</div>').join('')
                      : '<div style="font-size:10px;opacity:0.6;padding-left:10px">(sin opciones a la vista — ' +
                        'puede que el portal las cargue al abrirlo)</div>';
                  return `<div style="${borde}padding:4px 0 4px 8px;margin-bottom:6px">` +
                         `<div style="font-size:11px"><b style="color:#fcd34d">${esc(dd.casillero)}</b> ` +
                         `<code style="font-size:10px;color:#7dd3fc">${esc(dd.id)}</code></div>` +
                         `<div style="font-size:10px;opacity:0.8">${esc(dd.rotulo)}</div>` + ops + '</div>';
              }).join('') + '</div>'
            : '<div style="margin-top:10px;font-size:10px;opacity:0.6">🔽 Ningún desplegable en esta pantalla.</div>';

        // Lo que se está buscando: el 5%, las compras sin derecho a crédito,
        // y el 203 que hoy impide enviar cualquier declaración con 5%.
        const buscados = ['203', '502', '512', '540', '550', '560'];
        const hallados = mapa.filter((f) => buscados.includes(f.casillero) || /5\s*%/.test(f.rotulo));

        const aviso = hallados.length
            ? `<div style="background:rgba(74,222,128,0.14);color:#86efac;border-radius:8px;padding:6px 8px;margin-bottom:6px;font-size:11px">` +
              `🟡 <b>${hallados.length}</b> casillero(s) del 5% / sin crédito: ` +
              esc(hallados.map((f) => `${f.casillero} → ${f.id}`).join(' · ')) + '</div>'
            : `<div style="background:rgba(245,158,11,0.14);color:#fcd34d;border-radius:8px;padding:6px 8px;margin-bottom:6px;font-size:11px">` +
              '⚠️ Ni rastro del 502/512 ni del 540/550 en este formulario. ' +
              'Copiá la tabla y pasámela: puede que se llamen distinto.</div>';

        const filas = mapa.map((f) => {
            const marcado = buscados.includes(f.casillero) || /5\s*%/.test(f.rotulo);
            const fondo = marcado ? 'background:rgba(251,191,36,0.12)' : '';
            return `<tr style="${fondo}">` +
                `<td style="padding:2px 6px;font-weight:800;color:#fcd34d">${esc(f.casillero)}</td>` +
                `<td style="padding:2px 6px;font-family:monospace;font-size:10px;color:#7dd3fc">${esc(f.id)}</td>` +
                `<td style="padding:2px 6px;font-size:10px;opacity:0.6">${f.editable ? '✏️' : '🔒'}</td>` +
                `<td style="padding:2px 6px;font-size:10px;opacity:0.85">${esc(f.rotulo)}</td>` +
                '</tr>';
        }).join('');

        const md = (window.__mapaCasilleros && window.__mapaCasilleros.markdown) || '';

        panel.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">' +
            `  <span style="font-size:11px;font-weight:800">📐 ${mapa.length} casilleros en este formulario</span>` +
            '  <button id="slh-casilleros-copiar" aria-label="Copiar la tabla de casilleros al portapapeles" style="border:none;border-radius:8px;padding:6px 10px;min-height:32px;background:rgba(148,163,184,0.18);color:#cbd5e1;font-size:11px;font-weight:800;cursor:pointer">📋 Copiar la tabla</button>' +
            '</div>' +
            aviso +
            '<table style="width:100%;border-collapse:collapse;font-size:11px">' + filas + '</table>' +
            bloqueDesplegables +
            radiografia +
            // Respaldo por si el portapapeles no está disponible: se selecciona
            // y se copia a mano. Nunca dejar al usuario sin salida.
            `<pre id="slh-casilleros-texto" style="display:none;white-space:pre-wrap;word-break:break-all;font-size:10px;margin-top:8px;padding:6px;background:rgba(0,0,0,0.35);border-radius:8px;user-select:text">${esc(md)}</pre>`;
    },

    async pintarBitacora() {
        const panel = document.getElementById('slh-bitacora-panel');
        if (!panel) return;
        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));

        let lista = [];
        try { lista = (await SafeStorage.get(['sc_bitacora'])).sc_bitacora || []; } catch (e) {}

        const copiar = '<button id="slh-bitacora-copiar" aria-label="Copiar la bitácora al portapapeles" style="border:none;border-radius:8px;padding:6px 10px;min-height:32px;background:rgba(148,163,184,0.18);color:#cbd5e1;font-size:11px;font-weight:800;cursor:pointer">📋 Copiar</button>';

        if (!lista.length) {
            panel.innerHTML = '<div style="font-size:11px;opacity:0.6;padding:4px 2px">La bitácora está vacía.</div>';
            return;
        }

        // Las últimas primero: cuando algo falla, lo que importa es el final.
        const hora = (t) => new Date(t).toLocaleTimeString('es-EC', { hour12: false });
        const cuerpo = lista.slice(-30).reverse().map((e) => [
            '<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.06)">',
            `  <span style="font-family:monospace;font-size:10px;opacity:0.5">${hora(e.t)}</span>`,
            `  <span style="font-size:11px;font-weight:700;margin-left:5px">${esc(e.evento)}</span>`,
            e.detalle ? `  <div style="font-size:10px;opacity:0.7;margin-left:46px">${esc(e.detalle)}</div>` : '',
            e.cliente ? `  <div style="font-size:10px;opacity:0.5;margin-left:46px">${esc(e.cliente)}${e.paso ? ' · ' + esc(e.paso) : ''}</div>` : '',
            '</div>'
        ].join('')).join('');

        panel.innerHTML =
            `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">` +
            `<span style="font-size:10px;opacity:0.75;flex:1">últimos ${Math.min(30, lista.length)} de ${lista.length}</span>` +
            copiar + '</div>' + cuerpo;
    },

    /**
     * El registro local: qué se declaró y de cuáles el comprobante llegó de
     * verdad a la nube. Es la respuesta a la pregunta del proyecto —«¿tengo
     * todos los comprobantes?»— que hasta ahora había que sacar de un
     * console.table.
     */
    async pintarRegistro() {
        const panel = document.getElementById('slh-registro-panel');
        if (!panel) return;
        const filas = (typeof SriLoop !== 'undefined' && SriLoop.verDeclaraciones)
            ? await SriLoop.verDeclaraciones() : [];

        if (!filas.length) {
            panel.innerHTML = '<div style="font-size:11px;opacity:0.6;padding:4px 2px">Todavía no hay ninguna declaración registrada.</div>';
            return;
        }

        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));
        const conPdf = filas.filter((d) => d.pdfSubido).length;
        const sinPdf = filas.length - conPdf;

        const cuerpo = filas.slice(0, 40).map((d) => [
            '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06)">',
            `  <span style="flex:1;font-size:11px;font-weight:700">${esc(d.nombre || d.ruc)}</span>`,
            `  <span style="font-size:10px;opacity:0.7;font-family:monospace">${esc(d.periodo)}</span>`,
            d.pdfSubido
                ? '  <span title="El comprobante está guardado" style="font-size:11px;color:#4ade80">✅</span>'
                : '  <span title="Se declaró, pero el comprobante NO quedó guardado" style="font-size:11px;color:#fbbf24">⚠️</span>',
            '</div>'
        ].join('')).join('');

        panel.innerHTML =
            `<div style="font-size:10px;opacity:0.75;margin-bottom:4px">` +
            `<b style="color:#4ade80">${conPdf}</b> con comprobante guardado` +
            (sinPdf ? ` · <b style="color:#fbbf24">${sinPdf}</b> sin guardar` : '') +
            (filas.length > 40 ? ` · se muestran 40 de ${filas.length}` : '') +
            '</div>' + cuerpo +
            (sinPdf ? '<div style="font-size:10px;opacity:0.65;margin-top:6px">Los ⚠️ se declararon pero su PDF no llegó a la nube. El botón 🧾 los recupera desde Consulta de declaraciones.</div>' : '');
    },

    /**
     * Lista los comprobantes que quedaron DENTRO de la base. **No toca nada.**
     *
     * Deuda histórica: hasta el 07-sep-2026 R2 no estaba en el flujo, y el PDF
     * se guardaba entero en `clients.declaration_history`. Medido el
     * 10-sep-2026: 207 PDFs · 7,65 MB · 79 contribuyentes · **0 duplicados**,
     * o sea que son el único ejemplar de esos comprobantes.
     *
     * Esto siempre corre antes de migrar. Y el botón de migrar se pinta **por
     * período**, nunca uno que diga «migrar todo»: 207 de una es justo la
     * clase de operación que no se puede deshacer si sale mal.
     */
    async pintarMigracion() {
        const panel = document.getElementById('slh-migrar-panel');
        if (!panel) return;
        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));
        const KB = (b) => (b / 1024).toFixed(0) + ' KB';

        if (typeof listarComprobantesEmbebidos !== 'function') {
            panel.innerHTML = '<div style="color:#fca5a5;font-size:11px">No está cargado el lector de la deuda.</div>';
            return;
        }
        const r = await listarComprobantesEmbebidos(null);
        if (r.error) {
            panel.innerHTML = `<div style="color:#fca5a5;font-size:11px">No pude leer la base: ${esc(r.error)}</div>`;
            return;
        }

        if (r.migrables.length === 0 && r.ambiguos.length === 0 && r.fragmentos.length === 0) {
            panel.innerHTML = '<div style="font-size:11px;color:#86efac">✅ No queda ningún comprobante ' +
                              'dentro de la base. Todos están en la nube.</div>';
            return;
        }

        // Por período, el que más pesa arriba: es por donde conviene empezar.
        const grupos = {};
        r.migrables.forEach((m) => {
            grupos[m.periodo] = grupos[m.periodo] || { n: 0, bytes: 0 };
            grupos[m.periodo].n++; grupos[m.periodo].bytes += m.bytes;
        });
        const filas = Object.entries(grupos).sort((a, b) => b[1].bytes - a[1].bytes).map(([per, g]) =>
            '<tr>' +
            `<td style="padding:3px 6px;font-weight:800;color:#fcd34d">${esc(per)}</td>` +
            `<td style="padding:3px 6px;font-size:10px">${g.n} comprobante(s)</td>` +
            `<td style="padding:3px 6px;font-size:10px;opacity:0.8">${KB(g.bytes)}</td>` +
            `<td style="padding:3px 6px"><button data-migrar="${esc(per)}" ` +
            'style="border:none;border-radius:8px;padding:4px 9px;background:rgba(251,191,36,0.22);' +
            'color:#fcd34d;font-size:10px;font-weight:800;cursor:pointer">Migrar</button></td>' +
            '</tr>').join('');

        const pesoTotal = r.migrables.reduce((a, m) => a + m.bytes, 0);
        const rarezas = [...new Set(r.ambiguos.map((a) => a.periodo))].slice(0, 6).join(', ');

        panel.innerHTML =
            '<div style="font-size:11px;font-weight:800;margin-bottom:6px">📦 Comprobantes que viven dentro de la base</div>' +
            '<div style="font-size:10px;opacity:0.85;line-height:1.5;margin-bottom:8px">' +
            `<b>${r.migrables.length}</b> PDF(s) migrables · <b>${KB(pesoTotal)}</b>. ` +
            'Ninguno tiene copia en la nube: son el único ejemplar, así que ' +
            '<b>el contenido se borra sólo después de leerlo de vuelta desde R2</b>.' +
            '</div>' +
            (filas ? '<table style="width:100%;border-collapse:collapse">' + filas + '</table>' : '') +
            (r.ambiguos.length
                ? '<div style="margin-top:8px;font-size:10px;background:rgba(245,158,11,0.14);color:#fcd34d;' +
                  `border-radius:8px;padding:6px 8px">⚠️ <b>${r.ambiguos.length}</b> con período que no se entiende ` +
                  `(${esc(rarezas)}). No se migran solos: el período va en la ruta, y archivar con uno ` +
                  'inventado es el bug del 07-sep otra vez.</div>'
                : '') +
            (r.fragmentos.length
                ? `<div style="margin-top:6px;font-size:10px;opacity:0.7">🧹 ${r.fragmentos.length} fragmento(s) de ` +
                  'menos de 200 bytes que no son PDF. No hay nada que subir.</div>'
                : '');
    },

    /**
     * Migra UN período, de a un comprobante y con pausa.
     *
     * De a uno a propósito: si el número quince falla, los catorce anteriores
     * ya están a salvo y el listado siguiente muestra exactamente qué queda.
     */
    async migrarPeriodo(periodo) {
        const panel = document.getElementById('slh-migrar-panel');
        if (!panel || !periodo) return;
        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));

        const r = await listarComprobantesEmbebidos(periodo);
        if (r.error) {
            panel.innerHTML = `<div style="color:#fca5a5;font-size:11px">${esc(r.error)}</div>`;
            return;
        }
        const lista = r.migrables;
        if (!lista.length) { await this.pintarMigracion(); return; }

        const linea = (t, color) => `<div style="font-size:10px;color:${color};padding:1px 0">${t}</div>`;
        const partes = ['<div style="font-size:11px;font-weight:800;margin-bottom:6px">' +
                        `📦 Migrando ${esc(periodo)} — ${lista.length} comprobante(s)</div>`];
        const repintar = () => { panel.innerHTML = partes.join(''); panel.scrollTop = panel.scrollHeight; };
        let hechos = 0, fallados = 0;
        repintar();

        for (let i = 0; i < lista.length; i++) {
            const it = lista[i];
            const quien = esc(it.nombre || it.ruc);
            partes.push(linea(`⏳ ${i + 1}/${lista.length} · ${quien}…`, '#cbd5e1'));
            repintar();

            const res = await migrarUnComprobanteEmbebido(it);
            partes.pop();
            if (res.ok) {
                hechos++;
                partes.push(linea(`✅ ${i + 1}/${lista.length} · ${quien} — en la nube`, '#86efac'));
                anotarBitacora('comprobante migrado', `${it.ruc} · ${it.periodo}`);
            } else {
                fallados++;
                partes.push(linea(`⚠️ ${i + 1}/${lista.length} · ${quien} — ${esc(res.motivo)}`, '#fcd34d'));
                anotarBitacora('migración fallida', `${it.ruc} · ${it.periodo} · ${res.motivo}`);
            }
            repintar();
            // Sin apuro: R2 no tiene por qué recibir trece peticiones seguidas.
            await sleep(600);
        }

        partes.push(
            '<div style="margin-top:8px;padding:6px 8px;border-radius:8px;font-size:11px;' +
            `background:${fallados ? 'rgba(245,158,11,0.14)' : 'rgba(74,222,128,0.14)'};` +
            `color:${fallados ? '#fcd34d' : '#86efac'}">` +
            `<b>${hechos}</b> migrado(s)${fallados ? ` · <b>${fallados}</b> quedaron donde estaban` : ''}. ` +
            (fallados ? 'Lo que falló no se tocó: el comprobante sigue en la base.'
                      : 'La base quedó más liviana.') +
            '</div><div style="margin-top:6px;font-size:10px;opacity:0.7">Volvé a abrir 📦 para ver qué queda.</div>');
        repintar();

        this._aviso(fallados ? '📦 Migración con avisos' : '📦 Migración terminada',
            `${hechos} comprobante(s) de ${esc(periodo)} pasaron a la nube.` +
            (fallados ? ` ${fallados} quedaron en la base y se pueden reintentar.` : ''), 8000);
    },

    /**
     * Prueba la subida y dice por qué falla cada camino. Antes esto solo se
     * podía preguntar escribiendo sriProbarSubida() en la consola, y era la
     * duda que bloqueaba saber si los comprobantes se estaban guardando.
     */
    async pintarSubida() {
        const panel = document.getElementById('slh-subida-panel');
        if (!panel) return;
        const esc = (t) => (typeof escapeHtml === 'function' ? escapeHtml(String(t || '')) : String(t || ''));

        let r = null;
        try {
            if (typeof probarSubida === 'function') r = await probarSubida();
        } catch (e) { /* abajo se informa */ }

        if (!r) {
            panel.innerHTML = '<div style="font-size:11px;color:#fca5a5;padding:4px 2px">No pude preguntarle al service worker. Recargá la extensión y probá de nuevo.</div>';
            return;
        }

        if (r.ok) {
            panel.innerHTML =
                `<div style="font-size:11px;color:#4ade80;font-weight:800">✅ La subida funciona (vía ${esc(r.via || '?')})</div>` +
                '<div style="font-size:10px;opacity:0.65;margin-top:4px">Los comprobantes se están guardando en la nube.</div>';
            return;
        }

        const motivos = (r.motivos && r.motivos.length) ? r.motivos : (r.error ? [r.error] : []);
        panel.innerHTML =
            '<div style="font-size:11px;color:#fca5a5;font-weight:800">❌ Ningún camino de subida funcionó</div>' +
            motivos.map((m) => `<div style="font-size:10px;opacity:0.8;margin-top:3px;font-family:monospace">· ${esc(m)}</div>`).join('') +
            '<div style="font-size:10px;opacity:0.6;margin-top:6px">Si estás detrás de un proxy como Burp, esto puede fallar por el TLS aunque en Chrome normal funcione.</div>';
    },

    async pintar() {
        if (!this._el) return;

        // En modo paso, el freno vive acá: pintar() ya corre cada 2 s y en cada
        // cambio del semáforo, así que es donde antes se nota que la fase cambió.
        try {
            const frenoEn = await SriLoop.frenarSiCambioLaFase(await this._faseActual());
            if (frenoEn) {
                const f = this.FASES.find((x) => x.id === frenoEn);
                this._aviso('👣 Un paso por vez',
                    f ? `Lo próximo: ${f.icono} ${f.txt}. Pulsá ▶ cuando quieras.`
                      : 'Pulsá ▶ para seguir.', 6000);
            }
        } catch (err) { /* frenar nunca puede romper el pintado */ }

        const e = await SriLoop.get();
        const paso = this._el.querySelector('#slh-paso');
        if (paso) {
            paso.style.background = e.paso ? 'rgba(167,139,250,0.22)' : 'rgba(148,163,184,0.16)';
            paso.style.color = e.paso ? '#c4b5fd' : '#cbd5e1';
            paso.textContent = e.paso ? '👣' : '🏃';
            paso.setAttribute('aria-pressed', e.paso ? 'true' : 'false');
            paso.title = e.paso
                ? 'Paso a paso: el lote frena al empezar cada fase. Pulsá para volver a corrido.'
                : 'De corrido: el lote avanza sin parar. Pulsá para ir paso a paso.';
        }

        const play = this._el.querySelector('#slh-play');
        const est = this._el.querySelector('#slh-estado');
        const det = this._el.querySelector('#slh-detalle');
        this.pintarPlan(e).catch(() => {});
        this.anunciarEnPerfil(e).catch(() => {});

        const aqui = this._el.querySelector('#slh-aqui');
        if (aqui) {
            const corriendo = e.estado === 'CORRIENDO' || e.estado === 'PAUSANDO';
            aqui.style.display = corriendo ? 'none' : '';
        }
        // Traer comprobantes solo tiene sentido con alguien logueado. Se
        // esconde la CELDA del cajón, no el botón: si no, quedaba el rótulo
        // solo, flotando debajo de nada.
        const celdaPdfs = this._el.querySelector('[data-celda="slh-pdfs"]');
        const pdfs = this._el.querySelector('#slh-pdfs');
        if (pdfs) {
            const info = (window.sriAssistant && window.sriAssistant.extractClientInfo)
                ? window.sriAssistant.extractClientInfo() : {};
            const hay = !!(info && info.ruc);
            if (celdaPdfs) celdaPdfs.style.display = hay ? 'flex' : 'none';
            else pdfs.style.display = hay ? '' : 'none';
        }

        // El 📐 NO se esconde fuera del formulario. Se escondía, y el día que
        // hacía falta no apareció: la detección de «estoy en el formulario» es
        // justo lo que puede fallar. Un botón que a veces no está es peor que
        // uno que a veces abre un panel diciendo que no hay nada que leer.

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
        const nuevoDetalle = total ? `cliente ${pos} de ${total}` : (e.motivo || 'lote vacío');
        if (det.textContent !== nuevoDetalle) {
            det.textContent = nuevoDetalle;
            // Solo al pasar de cliente, no en cada repintado.
            if (total && this._ultimaPos !== undefined && this._ultimaPos !== pos) {
                det.classList.remove('slh-salta');
                void det.offsetWidth;          // reinicia la animación
                det.classList.add('slh-salta');
            }
            this._ultimaPos = pos;
        }

        est.classList.toggle('slh-respira', e.estado === 'CORRIENDO');

        // Barra de avance: cuántos clientes quedaron atrás.
        const barra = this._el.querySelector('#slh-barra');
        const fill = this._el.querySelector('#slh-barra-fill');
        if (barra && fill) {
            if (total) {
                barra.style.display = 'block';
                fill.style.width = `${Math.round((e.indice / total) * 100)}%`;
                fill.classList.toggle('slh-brillo', e.estado === 'CORRIENDO');
            } else {
                barra.style.display = 'none';
            }
        }

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

async function arrancarEnLaPagina() {
    // 💤 Dormida por defecto: en el portal no se monta la barra salvo que la
    // extensión esté despierta (la despierta tu web o el popup). El canario de
    // versión sí corre siempre: es sólo lectura y avisa si el portal cambió.
    const despierta = (typeof extensionDespierta === 'function') ? await extensionDespierta() : true;
    if (despierta) SriLoopHUD.montar();
    if (typeof revisarVersionDelPortal === 'function') {
        revisarVersionDelPortal().catch(() => {});
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancarEnLaPagina);
} else {
    arrancarEnLaPagina();
}

// ── Detección del wizard de recepción de declaraciones ───────────────────
// (Las constantes SRI_FORMULARIO_IVA_URL y SRI_PUENTE_* viven en 01_utilidades_y_pdf.js)

// El wizard puede vivir en cualquiera de las dos rutas: para DETECTAR aceptamos ambas.
function estaEnFormularioIva(url = window.location.href) {
    return url.includes('recibirDeclaracion.jsf') || url.includes('declaracionImpuesto.jsf');
}

async function ejecutarNavegacionDeclaracion(periodData) {
    if (typeof SafeStorage !== 'undefined' && SafeStorage.remove) {
        await SafeStorage.remove(['declaration_synced_flag', 'iva_sin_ubicar']);
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
                // El puente SSO está CONFIRMADO (AGENTS.md §6A, 03-sep-2026);
                // el id de la tarjeta «Formulario IVA» NO lo está (Biblia,
                // entrada 06). La regla §5b dice que lo confirmado manda, así
                // que el puente va primero y la tarjeta queda de respaldo.
                //
                // Además el barrido viejo miraba '.card, a, button, span' de
                // TODO el documento y elegía por texto: la misma clase de
                // barrido amplio que hacía que el «ojo de halcón» leyera
                // números del HUD de la propia extensión.
                const enlaceDirecto = document.querySelector(
                    'a[href*="redireccion=310"], a[href*="declaracionImpuesto"]');

                if (enlaceDirecto && esVisible(enlaceDirecto)) {
                    console.log('📑 El índice ofrece el enlace directo al formulario IVA. Lo uso.');
                    safeStatus('🎯 Accediendo a Formulario IVA...');
                    if (!await clickCuandoSePueda(enlaceDirecto, 'Enlace Formulario IVA')) {
                        console.warn('⚠️ El clic no se pudo dar. Voy por el puente SSO.');
                        window.location.href = SRI_PUENTE_FORMULARIO_IVA;
                        await sleep(4000);
                        return;
                    }
                    await sleep(2500);
                } else {
                    console.log('📑 En índice de declaraciones. Voy por el puente SSO, que es el camino confirmado.');
                    safeStatus('⚡ Accediendo a Formulario IVA...');
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
            if (await cortarSiPidieronParar('selección de la obligación')) return;
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
                    // Lo que se espera es que la etiqueta diga 2011, que es
                    // justo lo que se comprueba abajo. Un segundo fijo era una
                    // apuesta; esto sigue apenas pegó y aguanta más si tarda.
                    await esperarAjaxSri(() => {
                        const l = getLabelObligacion();
                        return l && (l.textContent || '').includes('2011');
                    }, 'la obligación 2011 seleccionada', 6000);

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
                    if (await cortarSiPidieronParar('apertura del calendario')) return false;
                    console.log(`🎯 Abriendo calendario (Intento ${i + 1})...`);
                    calendarInput.focus();
                    await sleep(350);

                    // En PrimeFaces el foco YA abre el panel. Si además se clickea, el
                    // click cae sobre el panel abierto y lo cierra: por eso hacía falta
                    // un segundo intento y parecía que «lo tocaba dos veces».
                    // Solo se clickea si el foco no alcanzó.
                    if (isCalendarVisible()) return true;

                    const rect = calendarInput.getBoundingClientRect();
                    calendarInput.dispatchEvent(new MouseEvent('mousedown', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2
                    }));
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
                    if (await cortarSiPidieronParar('ajuste del año en el calendario')) return false;
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
                        soloDelPortal(document.querySelectorAll('button')).find(b => b.innerText.toUpperCase().includes('SIGUIENTE'));
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
        await sleep(600); // Pequeña espera para que PrimeFaces termine de actualizar la vista
        
        const checkTipo = typeof tipoDeDeclaracionEnPantalla === 'function' ? tipoDeDeclaracionEnPantalla() : { esSustitutiva: false, marca: '' };
        const marcaDirecta = (document.getElementById('frmFlujoDeclaracion:outMarcaDeclaracion')?.textContent ||
                              document.querySelector('[id$="outMarcaDeclaracion"]')?.textContent || '').trim().toUpperCase();
        
        const errorMessages = Array.from(document.querySelectorAll('.ui-messages-error-detail, .ui-messages-warn-detail, .ui-messages-info-detail, .ui-dialog-content, .ui-messages-summary'));
        let isAlreadyDeclared = checkTipo.esSustitutiva || marcaDirecta.includes('SUSTITUTIVA') || errorMessages.some(el => {
            // FIX: Ignorar modales o mensajes ocultos de PrimeFaces
            if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;

            const txt = (el.innerText || '').toUpperCase();
            return txt.includes('SUSTITUTIVA') || 
                   txt.includes('YA FUE PRESENTADA') || 
                   txt.includes('YA EXISTE') ||
                   txt.includes('YA SE ENCUENTRA REGISTRADA');
        });

        if (isAlreadyDeclared) {
            console.warn('⚠️ DECLARACIÓN PREVIA / SUSTITUTIVA DETECTADA EN WIZARD SRI.');
            safeStatus('⚠️ Declaración ya registrada (Sustitutiva)');
            
            if (window.sriAssistant) {
                window.sriAssistant.showEliteToast({
                    title: '🛑 Período Ya Declarado',
                    msg: 'El portal abrió una <b>SUSTITUTIVA</b>: este período ya fue presentado. No se abrirá el formulario.',
                    duration: 6000
                });
            }

            const af = await SafeStorage.get(['pending_sri_autofill', 'workflowPeriod']);
            const quien = af.pending_sri_autofill || {};
            const periodo = af.workflowPeriod;

            try {
                if (quien.ruc) {
                    if (typeof Omitidos !== 'undefined') {
                        await Omitidos.anotar(quien.ruc, 'ya_declarada', {
                            nombre: quien.name,
                            detalle: 'El wizard marcó SUSTITUTIVA al seleccionar el período: ya estaba declarada. Recuperando comprobante.'
                        });
                    }
                    if (typeof SriLoop !== 'undefined' && periodo) {
                        await SriLoop.marcarDeclarado(quien.ruc, periodo, { nombre: quien.name });
                    }
                }
            } catch (e) { /* no frenar por error de registro */ }

            // Si tenemos el contribuyente y el período, vamos DIRECTO a recuperar el comprobante
            if (quien.ruc && periodo && typeof irARecuperarComprobante === 'function') {
                safeStatus('🧾 Ya declarada (Sustitutiva) · Recuperando comprobante...');
                if (window.sriAssistant) {
                    window.sriAssistant.showEliteToast({
                        title: '🧾 Redirigiendo a Consulta',
                        msg: 'Este período ya fue declarado (SUSTITUTIVA). Yendo a Consulta de declaraciones para descargar el comprobante oficial y subirlo a Supabase...',
                        duration: 6000
                    });
                }
                console.log(`🧾 [WIZARD] Redirigiendo a Consulta de declaraciones para traer el comprobante de ${quien.name || quien.ruc}...`);
                await sleep(1200);
                await irARecuperarComprobante(quien.ruc, periodo, quien.name || '');
                return; // Redirección en marcha
            }

            await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'workflowPeriod']);

            const autoRes = await SafeStorage.get(['auto_batch_enabled', 'sri_auto_mode']);
            const enLote = autoRes.auto_batch_enabled || autoRes.sri_auto_mode || (typeof SriLoop !== 'undefined' && await SriLoop.puedeAvanzar());
            if (enLote) {
                safeStatus('⏩ Avanzando al siguiente cliente del lote...');
                await sleep(1500);
                if (typeof handleBatchNextClient === 'function') {
                    const hasNext = await handleBatchNextClient();
                    if (!hasNext && typeof cerrarSesionSRI === 'function') await cerrarSesionSRI();
                } else if (typeof cerrarSesionSRI === 'function') {
                    await cerrarSesionSRI();
                }
            }
            return; // Detener flujo sin abrir el formulario ni redirigir a ciegas
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
            // Doble candado de seguridad: verificar que no sea sustitutiva antes de abrir
            if (typeof tipoDeDeclaracionEnPantalla === 'function' && tipoDeDeclaracionEnPantalla().esSustitutiva) {
                console.warn('🛑 [PASO 6] Sustitutiva detectada antes de abrir formulario. Cancelando apertura.');
                return;
            }
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
