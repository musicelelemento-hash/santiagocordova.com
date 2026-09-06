// ── Navegación a Comprobantes Recibidos (Regla Inmutable) ──────────────
async function navegarAComprobantes() {
    const url = window.location.href.toLowerCase();
    // Si estamos en login, ni lo intentamos
    if (url.includes('/auth/realms/') || url.includes('login')) {
        console.warn('🔒 Navegación abortada: Estamos en la página de login.');
        return false;
    }

    // Si ya estamos en la página de comprobantes recibidos
    if (url.includes('comprobantesrecibidos.jsf')) {
        console.log('✅ Ya estamos en Comprobantes Recibidos.');
        return true;
    }
    console.log('🚀 [REGLA INMUTABLE] Navegando a Comprobantes Electrónicos Recibidos vía Puente SSO...');
    if (typeof safeStatus === 'function') safeStatus('🚀 Abriendo Comprobantes Recibidos...');
    window.location.href = SRI_PUENTE_RECIBIDOS;
    return true;
}

async function autoLlenarPeriodoFiscal(data) {
    console.log('📅 Auto-llenando Periodo Fiscal...');

    let anio, mesIndex;
    if (data && data.year) {
        anio = data.year;
        mesIndex = data.monthIndex;
    } else {
        const fechaActual = new Date();
        const mesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 1, 1);
        anio = mesAnterior.getFullYear();
        mesIndex = mesAnterior.getMonth();
    }

    const valorPeriodo = `${(mesIndex + 1).toString().padStart(2, '0')}/${anio}`;
    console.log(`   🎯 Periodo objetivo: ${valorPeriodo}`);

    let camposLlenados = 0;

    // 2. Llenar Selección (Obligación)
    let obligacionSeleccionada = false;

    // Buscar select de Obligación
    const selects = document.querySelectorAll('select');
    for (const s of selects) {
        for (const opt of s.options) {
            if (opt.text.toUpperCase().includes('DECLARACION DE IVA') || opt.value.includes('2011')) {
                if (s.value !== opt.value) {
                    s.value = opt.value;
                    s.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('   ✅ Obligación seleccionada');
                    obligacionSeleccionada = true;
                } else {
                    console.log('   ℹ️ Obligación ya estaba seleccionada');
                    obligacionSeleccionada = true;
                }
                break;
            }
        }
        if (obligacionSeleccionada) break;
    }

    if (obligacionSeleccionada) {
        console.log('   ⏳ Esperando actualización de campos (2.5s)...');
        await sleep(2500); // Esperar reload de JSF
    }

    // 3. Llenar Periodo
    console.log('   🔍 Buscando campo Periodo...');
    let inputPeriodo = null;

    // Estrategia 1: XPath exacto (Label -> Input)
    const xpaths = [
        "//label[contains(text(), 'Período')]/following::input[1]",
        "//label[contains(text(), 'Periodo')]/following::input[1]",
        "//span[contains(text(), 'Período')]/following::input[1]"
    ];

    for (const xpath of xpaths) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue) {
                inputPeriodo = result.singleNodeValue;
                console.log(`   ✅ Encontrado por XPath: ${xpath}`);
                break;
            }
        } catch (e) { }
    }

    // Estrategia 2: Selectores de ID comunes en PrimeFaces (calendar inputs)
    if (!inputPeriodo) {
        const inputs = document.querySelectorAll('input[type="text"]');
        for (const inp of inputs) {
            const id = inp.id.toLowerCase();
            const placeholder = inp.placeholder ? inp.placeholder.toLowerCase() : '';

            // "fecha", "periodo", "fiscal", o placeholder tipo fecha
            if ((id.includes('periodo') || id.includes('fecha') || id.includes('fiscal')) &&
                (placeholder.includes('/') || inp.classList.contains('hasDatepicker') || inp.className.includes('calendar'))) {
                inputPeriodo = inp;
                console.log(`   ✅ Encontrado por ID/Class: ${inp.id}`);
                break;
            }
        }
    }

    if (inputPeriodo) {
        // HACK PRIMEFACES: Simular interacción real
        inputPeriodo.focus();
        inputPeriodo.click();
        await sleep(100);

        // Intento 1: Escribir directo
        inputPeriodo.value = valorPeriodo;
        if (inputPeriodo.value !== valorPeriodo) {
            console.warn('   ⚠️ Input tiene máscara/bloqueo, intentando forzar...');
        }

        // PrimeFaces no lee el .value asignado por script hasta que se notifica.
        inputPeriodo.dispatchEvent(new Event('input', { bubbles: true }));
        inputPeriodo.dispatchEvent(new Event('change', { bubbles: true }));
        inputPeriodo.blur();
        console.log(`   ✅ Periodo fiscal establecido: ${valorPeriodo}`);
    }
}

async function extraerTodasLasFacturas() {
    console.log('Iniciando extracción de facturas...');

    const todasLasFacturas = [];
    let paginaActual = 1;

    while (true) {
        console.log('Procesando página ' + paginaActual);
        await esperarTabla();

        // ELITE v13.1: Feedback de progreso en tiempo real
        if (window.sriAssistant) {
            window.sriAssistant.log(`📄 Procesando página ${paginaActual}...`);
        }

        const facturasPagina = extraerFacturasPaginaActual();
        console.log('Extraídas ' + facturasPagina.length + ' facturas');

        if (facturasPagina.length === 0) break;

        todasLasFacturas.push(...facturasPagina);

        const hayMasPaginas = await irSiguientePagina();
        if (!hayMasPaginas) break;

        paginaActual++;
        // irSiguientePagina() ya esperó a que la página cambiara de verdad.
        // Lo único que queda por vigilar es un segundo AJAX en curso.
        await esperarAjaxSri(null, `página ${paginaActual} de facturas`);
    }

    console.log('Total: ' + todasLasFacturas.length + ' facturas');

    // §7 · Cada proveedor que aparece queda anotado. No se le pregunta nada a
    // nadie: se aprende mirando, y lo aprendido sirve para todos los clientes
    // que le compren. Anotar nunca puede romper una extracción.
    if (typeof Proveedores !== 'undefined') {
        try {
            await Proveedores.registrarLote(todasLasFacturas, await rucDelClienteActual());
        } catch (e) { console.warn('🏷️ [PROVEEDORES] No se pudieron anotar:', e.message); }
    }

    const resumen = calcularResumen(todasLasFacturas);
    return resumen;
}

function extraerFacturasPaginaActual() {
    console.log('🔍 DEBUG: Iniciando extraerFacturasPaginaActual');
    const facturas = [];

    // NUEVA ESTRATEGIA: Buscar tabla por encabezados de columna
    let tabla = null;
    const todasLasTablas = document.querySelectorAll('table');
    console.log(`🔍 DEBUG: Analizando ${todasLasTablas.length} tablas en la página...`);

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        // Buscar tabla que contenga los encabezados característicos de comprobantes
        if (textoEncabezados.includes('valor sin impuestos') &&
            textoEncabezados.includes('iva') &&
            textoEncabezados.includes('importe total')) {
            tabla = t;
            console.log(`✅ DEBUG: Encontrada tabla de comprobantes por encabezados: id="${t.id}", class="${t.className}"`);
            console.log(`   Encabezados: ${textoEncabezados.substring(0, 100)}...`);
            break;
        }
    }

    // Fallback: Intentar selectores tradicionales si no se encontró por encabezados
    if (!tabla) {
        console.log('🔍 DEBUG: No se encontró por encabezados, intentando selectores tradicionales...');
        tabla = document.querySelector('table[id*="dtComprobantes"]');
    }

    if (!tabla) {
        tabla = document.querySelector('table[id*="Comprobantes"]');
    }

    if (!tabla) {
        tabla = document.querySelector('.ui-datatable-tablewrapper table');
    }

    // Buscar tabla RichFaces con clase rf-dt que tenga datos de comprobantes
    if (!tabla) {
        const tablasRF = document.querySelectorAll('table.rf-dt');
        console.log(`🔍 DEBUG: Buscando entre ${tablasRF.length} tablas RichFaces...`);

        for (const t of tablasRF) {
            const primeraFila = t.querySelector('tbody tr');
            if (primeraFila) {
                const texto = primeraFila.textContent;
                // Verificar si contiene datos que parecen de comprobantes (números largos, RUC, etc)
                if (texto.match(/\d{13}/) || texto.toLowerCase().includes('factura') || texto.includes('$')) {
                    tabla = t;
                    console.log(`✅ DEBUG: Encontrada tabla RichFaces con datos de comprobantes: id="${t.id}"`);
                    break;
                }
            }
        }
    }

    console.log('🔍 DEBUG: Tabla encontrada:', tabla ? 'SÍ' : 'NO');

    if (!tabla) {
        console.error('❌ DEBUG: No se encontró tabla con ningún selector');
        console.error('⚠️ POSIBLES CAUSAS:');
        console.error('   1. No has hecho clic en el botón "Consultar" después de configurar la búsqueda');
        console.error('   2. El CAPTCHA no se resolvió correctamente');
        console.error('   3. No hay resultados para el período seleccionado');

        console.log('📊 DEBUG: Tablas encontradas en la página:');
        todasLasTablas.forEach((t, i) => {
            const headers = t.querySelectorAll('thead th, thead td');
            const headerText = Array.from(headers).map(h => h.textContent.trim()).join(', ');
            console.log(`   Tabla ${i}: id="${t.id}", class="${t.className}"`);
            if (headerText) {
                console.log(`      Headers: ${headerText.substring(0, 80)}`);
            }
        });
        return facturas;
    }

    // DETECCIÓN DINÁMICA DE COLUMNAS
    let idxValorSinImpuestos = -1;
    let idxIva = -1;
    let idxImporteTotal = -1;

    const thead = tabla.querySelector('thead');
    if (thead) {
        const headers = thead.querySelectorAll('th, td');
        headers.forEach((th, index) => {
            const texto = th.textContent.toLowerCase().trim();
            if (texto.includes('valor sin impuestos') || texto.includes('base imponible') || texto.includes('subtotal')) {
                idxValorSinImpuestos = index;
            } else if (texto.includes('iva') && !texto.includes('ret')) {
                idxIva = index;
            } else if (texto.includes('importe total') || texto.includes('total')) {
                idxImporteTotal = index;
            }
        });
        console.log(`   🎯 Columnas detectadas: SinImpuestos=${idxValorSinImpuestos}, IVA=${idxIva}, Total=${idxImporteTotal}`);
    }

    const filas = tabla.querySelectorAll('tbody tr');
    console.log('📋 DEBUG: Filas encontradas en tbody:', filas.length);

    filas.forEach((fila, idx) => {
        try {
            const celdas = fila.querySelectorAll('td');
            console.log(`   Fila ${idx}: ${celdas.length} columnas`);

            // Verificar que no sea mensaje de "no encontrado"
            const textoCompleto = fila.textContent.trim();
            if (textoCompleto.includes('No se encontraron')) {
                console.log(`   ⚠️ Fila ${idx} descartada: mensaje "No se encontraron"`);
                return;
            }

            // Necesitamos al menos 7 columnas para extraer datos básicos
            if (celdas.length < 7) {
                console.warn(`   ⚠️ Fila ${idx} descartada: solo tiene ${celdas.length} columnas (se requieren al menos 7)`);
                return;
            }

            // console.log(`   ✅ Fila ${idx} válida - Extrayendo datos...`);

            // Intentar detectar las columnas correctas
            let valorSinImpuestos, iva, importeTotal;

            // ESTRATEGIA 0: USAR INDICES DETECTADOS (Prioridad)
            if (idxValorSinImpuestos !== -1 && idxIva !== -1 && idxImporteTotal !== -1 &&
                celdas[idxValorSinImpuestos] && celdas[idxIva] && celdas[idxImporteTotal]) {

                valorSinImpuestos = parseDecimal(celdas[idxValorSinImpuestos].textContent);
                iva = parseDecimal(celdas[idxIva].textContent);
                importeTotal = parseDecimal(celdas[idxImporteTotal].textContent);

                // console.log(`      Usando índices dinámicos: SinImp=${valorSinImpuestos}, IVA=${iva}, Total=${importeTotal}`);
            }
            // Estrategia 1: Asumir estructura de 9+ columnas (fallback anterior)
            else if (celdas.length >= 9) {
                // console.log(`      Usando índices fijos (6,7,8)`);
                valorSinImpuestos = parseDecimal(celdas[6].textContent);
                iva = parseDecimal(celdas[7].textContent);
                importeTotal = parseDecimal(celdas[8].textContent);
            }
            // Estrategia 2: Buscar columnas con valores numéricos al final
            else {
                // console.log(`      Usando estrategia alternativa (últimas 3)`);
                // Las últimas 3 columnas suelen ser: Subtotal, IVA, Total
                const ultimas3 = [
                    celdas[celdas.length - 3],
                    celdas[celdas.length - 2],
                    celdas[celdas.length - 1]
                ];

                valorSinImpuestos = parseDecimal(ultimas3[0].textContent);
                iva = parseDecimal(ultimas3[1].textContent);
                importeTotal = parseDecimal(ultimas3[2].textContent);
            }

            // Validar que los valores sean razonables
            if ((!importeTotal && !valorSinImpuestos) || (importeTotal === 0 && valorSinImpuestos === 0)) {
                // console.warn(`   ⚠️ Fila ${idx} descartada: valores en 0`);
                return;
            }

            // ── Reconciliación: total = base + IVA ──────────────────────────
            // Vale para las tres estrategias de arriba, porque las tres eligen
            // celdas por índice y ninguna sabe si acertó. parseDecimal devuelve
            // 0 tanto para «cero» como para «no pude leer», así que un IVA en 0
            // puede ser una factura exenta o una columna mal leída; de ahí
            // depende que la factura vaya al casillero de 15% o al de 0%.
            //
            // La resta no depende de ningún índice: es la identidad que el
            // portal cumple siempre.
            if (importeTotal > 0 && valorSinImpuestos > 0) {
                const ivaSegunResta = redondear(importeTotal - valorSinImpuestos);
                if (ivaSegunResta >= 0 && Math.abs(ivaSegunResta - iva) > 0.02) {
                    console.warn(`   ⚠️ [Factura ${idx + 1}] La columna del IVA da $${iva} y total - base da $${ivaSegunResta}. ` +
                                 `Mando la resta: de esto depende si va al 15% o al 0%.`);
                    iva = ivaSegunResta;
                }
            }

            facturas.push({
                numero: idx + 1,
                rucRazon: celdas[1] ? celdas[1].textContent.trim() : 'S/N',
                valorSinImpuestos: valorSinImpuestos,
                iva: iva,
                importeTotal: importeTotal,
                tieneIva: iva > 0
            });

            console.log(`      Factura agregada: SinImp=${valorSinImpuestos}, IVA=${iva}, Total=${importeTotal}`);
        } catch (error) {
            console.error('❌ Error en fila ' + idx, error);
        }
    });

    console.log(`✅ DEBUG: Total facturas extraídas: ${facturas.length}`);
    return facturas;
}

async function extraerTodasLasRetenciones() {
    console.log("🚀 SRI Bot Content Script v4.0 - RETENCIONES FIX LOADED");
    console.log('🚀 Iniciando extracción de retenciones...');
    console.log('⚠️ MODO DEBUG ACTIVADO - Revisa la consola para detalles');

    // Usar la misma estrategia de detección por encabezados
    let tabla = null;
    const todasLasTablas = document.querySelectorAll('table');
    console.log(`🔍 DEBUG: Analizando ${todasLasTablas.length} tablas en la página...`);

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        // Buscar tabla de retenciones (tiene "clave de acceso" y "comprobante")
        if ((textoEncabezados.includes('clave de acceso') || textoEncabezados.includes('clave acceso')) &&
            (textoEncabezados.includes('comprobante') || textoEncabezados.includes('retención'))) {
            tabla = t;
            console.log(`✅ DEBUG: Encontrada tabla de retenciones por encabezados: id="${t.id}"`);
            break;
        }
    }

    // Fallback: selector tradicional
    if (!tabla) {
        console.log('🔍 DEBUG: Intentando selector tradicional...');
        tabla = document.querySelector('table[id*="dtComprobantes"]');
    }

    // FAST-FAIL: Verificar si hay mensaje de "No existen datos" antes de rendirse o esperar
    const msgWarn = document.querySelector('.ui-messages-warn-detail, .ui-messages-info-detail');
    if (msgWarn && (msgWarn.textContent.includes('No existen datos') || msgWarn.textContent.includes('No se encontraron'))) {
        console.warn('⚡ [Fast-Fail] Confirmado: No existen retenciones en este periodo.');
        return { totalRetenciones: 0, ivaRetenido: { cantidad: 0, total: 0 }, rentaRetenida: { cantidad: 0, total: 0 } };
    }

    if (!tabla) {
        console.error('❌ No se encontró tabla de retenciones');
        console.error('⚠️ Asegúrate de:');
        console.error('   1. Haber seleccionado "Comprobante de Retención" en el tipo');
        console.error('   2. Haber hecho clic en "Consultar"');
        console.error('   3. Que existan retenciones para el período');
        return { totalRetenciones: 0, ivaRetenido: { cantidad: 0, total: 0 }, rentaRetenida: { cantidad: 0, total: 0 } };
    }

    const filas = tabla.querySelectorAll('tbody tr');
    console.log('📋 Filas encontradas:', filas.length);

    if (filas.length > 0) {
        const primeraFila = filas[0];
        const celdas = primeraFila.querySelectorAll('td');
        console.log('📊 Columnas en primera fila:', celdas.length);

        if (celdas.length >= 4) {
            const celdaClaveAcceso = celdas[3];
            console.log('🔍 Contenido celda [3]:', celdaClaveAcceso.textContent.substring(0, 50));
            console.log('🔍 HTML celda [3]:', celdaClaveAcceso.innerHTML.substring(0, 200));

            const enlace = celdaClaveAcceso.querySelector('a');
            console.log('🔗 Enlace encontrado:', enlace ? 'SÍ' : 'NO');

            if (enlace) {
                console.log('✅ Href:', enlace.href);
                console.log('✅ Texto:', enlace.textContent.substring(0, 30));
            } else {
                console.warn('⚠️ NO HAY ENLACE - Buscando alternativas...');
                // Intentar buscar cualquier elemento clickeable
                const clickeable = celdaClaveAcceso.querySelector('span, div, button');
                console.log('🔍 Elemento clickeable alternativo:', clickeable ? clickeable.tagName : 'NINGUNO');
            }
        }
    }

    const todasLasRetenciones = [];
    let paginaActual = 1;

    while (true) {
        console.log(`📄 Procesando página ${paginaActual} de retenciones`);
        await esperarTabla();

        // ELITE v13.1: Feedback de progreso en tiempo real
        if (window.sriAssistant) {
            window.sriAssistant.log(`📄 Procesando página ${paginaActual} de retenciones...`);
        }

        const retencionesPagina = await extraerRetencionesPaginaActual();
        console.log(`   Extraídas ${retencionesPagina.length} retenciones`);

        if (retencionesPagina.length === 0) break;

        todasLasRetenciones.push(...retencionesPagina);

        const hayMasPaginas = await irSiguientePagina();
        if (!hayMasPaginas) break;

        paginaActual++;
        await esperarAjaxSri(null, `página ${paginaActual} de retenciones`);
    }

    console.log(`✅ Total: ${todasLasRetenciones.length} retenciones`);

    const resumen = calcularResumenRetenciones(todasLasRetenciones);
    console.log('📊 Resumen final:', resumen);

    // GUARDAR RESPALDO: Por si el mensaje falla
    try {
        await SafeStorage.set({ retenciones: resumen });
        console.log('💾 Backup de retenciones guardado en storage');
    } catch (e) {
        console.warn('No se pudo guardar backup', e);
    }

    return resumen;
}

async function extraerRetencionesPaginaActual() {
    const retenciones = [];

    // Usar detección por encabezados (igual que en extraerTodasLasRetenciones)
    let tabla = null;
    const todasLasTablas = document.querySelectorAll('table');

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        if ((textoEncabezados.includes('clave de acceso') || textoEncabezados.includes('clave acceso')) &&
            (textoEncabezados.includes('comprobante') || textoEncabezados.includes('retención'))) {
            tabla = t;
            break;
        }
    }

    if (!tabla) {
        console.warn('⚠️ No se encontró tabla en extraerRetencionesPaginaActual');
        return retenciones;
    }

    const filas = tabla.querySelectorAll('tbody tr');
    console.log(`   🔍 Procesando ${filas.length} filas...`);

    for (let idx = 0; idx < filas.length; idx++) {
        const fila = filas[idx];

        try {
            const celdas = fila.querySelectorAll('td');
            if (celdas.length < 9) {
                console.log(`   ⚠️ Fila ${idx} descartada: solo ${celdas.length} columnas`);
                continue;
            }

            const textoCompleto = fila.textContent.trim();
            if (textoCompleto.includes('No se encontraron')) continue;

            console.log(`   📋 Procesando retención ${idx + 1}`);

            const celdaClaveAcceso = celdas[3];
            const enlace = celdaClaveAcceso.querySelector('a');

            if (!enlace) {
                console.warn(`   ❌ No se encontró enlace en fila ${idx + 1}`);
                continue;
            }

            console.log(`   🔗 Abriendo modal de retención fila ${idx + 1}...`);
            
            // 1. Asegurar que no haya overlay o modal previo bloqueando el click (Fix Burp Item 109)
            await waitFor(() => {
                const shade = document.querySelector('.ui-widget-overlay, .rf-pp-sh, #disablingDiv');
                return !shade || !esVisible(shade);
            }, 2000, 'Espera de Overlay Libre');

            // 2. Click en enlace de detalle
            enlace.scrollIntoView({ behavior: 'auto', block: 'center' });
            enlace.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            enlace.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            enlace.click();

            // 3. Espera reactiva del panel de retenciones (SRI responde en ~250-350ms)
            const tablaDetalle = await waitFor(() => {
                // Selector directo confirmado en Burp Suite (form-detalle-comprobante-retencion:tabla-impuestos-comprobante-retencion)
                const direct = document.getElementById('form-detalle-comprobante-retencion:tabla-impuestos-comprobante-retencion');
                if (direct && (typeof esVisible === 'function' ? esVisible(direct) : true)) {
                    const rows = direct.querySelectorAll('tbody tr');
                    if (rows.length > 0) return direct;
                }
                // Fallback: Diálogos visibles en DOM
                const dialogs = Array.from(document.querySelectorAll('.ui-dialog, .rf-pp-cntr')).filter(d => (typeof esVisible === 'function' ? esVisible(d) : true));
                for (const d of dialogs) {
                    const tables = d.querySelectorAll('table');
                    for (const t of tables) {
                        const h = (t.textContent || '').toLowerCase();
                        if (h.includes('base imponible') && h.includes('valor retenido')) {
                            const rows = t.querySelectorAll('tbody tr');
                            if (rows.length > 0) return t;
                        }
                    }
                }
                return null;
            }, 3500, `Modal Retención ${idx + 1}`);

            if (tablaDetalle) {
                const datosRetencion = procesarTablaRetencion(tablaDetalle);
                if (datosRetencion) {
                    retenciones.push({
                        idx: idx + 1,
                        comprobanteNo: celdas[2]?.textContent.trim() || '',
                        rucRazon: celdas[1]?.textContent.trim() || '',
                        ivaRetenido: datosRetencion.ivaRetenido,
                        rentaRetenida: datosRetencion.rentaRetenida,
                        baseImponibleIva: datosRetencion.baseImponibleIva,
                        baseImponibleRenta: datosRetencion.baseImponibleRenta
                    });

                    console.log(`   ⚡ Retención ${idx + 1} extraída en tiempo récord: IVA $${datosRetencion.ivaRetenido} (Base $${datosRetencion.baseImponibleIva}), Renta $${datosRetencion.rentaRetenida} (Base $${datosRetencion.baseImponibleRenta})`);
                }
            } else {
                console.warn(`   ⚠️ Timeout esperando modal de retención fila ${idx + 1}`);
            }

            // 4. Cerrar modal inmediatamente y esperar a que el DOM y el overlay queden libres
            await cerrarModal();
            await waitFor(() => {
                const panel = document.getElementById('form-detalle-comprobante-retencion:panel-detalle-comprobante-retencion');
                const shade = document.querySelector('.ui-widget-overlay, .rf-pp-sh, #disablingDiv');
                const panelHidden = !panel || !esVisible(panel);
                const shadeHidden = !shade || !esVisible(shade);
                return panelHidden && shadeHidden;
            }, 2000, 'Cierre Modal Retención');
            await sleep(80);

        } catch (error) {
            console.error(`   ❌ Error en fila ${idx}:`, error);
            await cerrarModal();
        }
    }

    // POR SI ACASO: Asegurar que cualquier modal residual quede cerrado
    console.log('   🧹 Limpieza final: Asegurando cierre de modales...');
    await cerrarModal();

    return retenciones;
}

async function extraerDatosModalRetencion() {
    console.log('      🔍 Buscando modal (Estrategia Headers de Tabla)...');

    // 1. Buscar dentro de Dialogs visibles (Prioridad)
    const dialogs = Array.from(document.querySelectorAll('.ui-dialog, .rf-pp-cntr')).filter(d => (typeof esVisible === 'function' ? esVisible(d) : true));

    // Iterar en reverso (último abierto)
    for (let i = dialogs.length - 1; i >= 0; i--) {
        const d = dialogs[i];
        const tablas = d.querySelectorAll('table');
        for (const t of tablas) {
            const headers = t.textContent.toLowerCase();
            if (headers.includes('base imponible') && headers.includes('valor retenido')) {
                console.log(`      ✅ Tabla encontrada en Dialog #${i} (por headers)`);
                return procesarTablaRetencion(t);
            }
        }
    }

    // 2. Fallback: Buscar cualquier tabla en el DOM con esos headers
    const todasLasTablas = document.querySelectorAll('table');
    for (const t of todasLasTablas) {
        const headers = t.textContent.toLowerCase();
        if (headers.includes('base imponible') && headers.includes('valor retenido')) {
            console.log('      ✅ Tabla "suelta" encontrada en DOM (por headers exactos)');
            return procesarTablaRetencion(t);
        }
    }

    console.warn('      ❌ Falló estrategia headers. No se encontraron datos.');
    return null;
}

function procesarTablaRetencion(tabla) {
    console.log(`      📊 Procesando tabla específica...`);

    let ivaRetenido = 0;
    let rentaRetenida = 0;
    let baseImponibleRenta = 0;
    let baseImponibleIva = 0;

    // INTENTO DE MAPEO DE COLUMNAS POR HEADER
    let indiceValorRetenido = -1;
    let indiceBaseImponible = -1;

    // Buscar en thead o en la primera fila de la tabla si no hay thead
    const headerSource = tabla.querySelector('thead') || tabla.querySelector('tbody tr');

    if (headerSource) {
        const potentialHeaders = headerSource.querySelectorAll('th, td');
        potentialHeaders.forEach((th, index) => {
            const texto = th.textContent.toLowerCase().trim();
            if (texto.includes('valor retenido') || texto.includes('valor ret')) {
                indiceValorRetenido = index;
                console.log(`      🎯 Columna 'Valor Retenido' detectada en índice: ${index}`);
            }
            if (texto.includes('base imponible') || texto.includes('base imp')) {
                indiceBaseImponible = index;
                console.log(`      🎯 Columna 'Base Imponible' detectada en índice: ${index}`);
            }
        });
    }

    // Si no encontramos header (o no detectó columnas clave), usamos heurística
    if (indiceValorRetenido === -1) {
        const filas = tabla.querySelectorAll('tbody tr');
        if (filas.length > 0) {
            const celdas = filas[0].querySelectorAll('td');
            if (celdas.length >= 5) {
                indiceValorRetenido = 4; // Estándar SRI
                indiceBaseImponible = 2; // Estándar SRI
                console.log(`      ⚠️ Headers no detectados mediante texto. Usando índices estándar: Ret=${indiceValorRetenido}, Base=${indiceBaseImponible}`);
            }
        }
    }

    const filas = tabla.querySelectorAll('tbody tr');
    filas.forEach(fila => {
        // Con separador entre celdas: textContent las pega sin nada en medio
        // ("…a la renta" + "303" = "renta303") y entonces un límite de palabra
        // nunca cierra. De eso depende distinguir «renta» de «RIVADENEIRA».
        const textoFila = Array.from(fila.querySelectorAll('td, th'))
            .map((c) => c.textContent).join(' ').toLowerCase() ||
            fila.textContent.toLowerCase();

        // ELITE FIX: Si esta fila fue usada como header, saltarla para no procesarla como datos
        if (headerSource && fila === headerSource && indiceValorRetenido !== -1) return;
        const celdas = fila.querySelectorAll('td, th');

        // Si tenemos índices confirmados
        if (indiceValorRetenido !== -1 && celdas[indiceValorRetenido]) {
            const textoCelda = celdas[indiceValorRetenido].textContent;
            const val = parseDecimal(textoCelda);

            let valBase = 0;
            if (indiceBaseImponible !== -1 && celdas[indiceBaseImponible]) {
                valBase = parseDecimal(celdas[indiceBaseImponible].textContent);
            }

            // ¿Renta o IVA? Con límite de palabra, no por subcadena: "iva"
            // está dentro de RIVADENEIRA, BOLIVAR, OLIVARES, OLIVA, VIVANCO…
            // y el texto de la fila incluye el nombre del proveedor. Antes,
            // con cualquiera de esos apellidos, una retención de RENTA se
            // sumaba TAMBIÉN al IVA retenido —casillero 609, que es crédito—,
            // y eso baja el impuesto a pagar.
            const esRenta = /\brenta\b/.test(textoFila);
            const esIva = /\biva\b/.test(textoFila);
            const esFecha = textoCelda.includes('-') || textoCelda.includes('/');

            if (esRenta && esIva) {
                // Las dos a la vez no puede ser, y adivinar mueve plata.
                console.warn(`      ⚠️ Fila de retención que dice renta E IVA a la vez ($${val}). ` +
                             'No la sumo a ninguna: revisala a mano. ' +
                             `"${textoFila.replace(/\s+/g, ' ').trim().slice(0, 100)}"`);
            } else if (esRenta && !esFecha) {
                rentaRetenida += val;
                baseImponibleRenta += valBase;
                console.log(`      ✅ RENTA (idx ${indiceValorRetenido}): Val=${val}, Base=${valBase}`);
            } else if (esIva && !esFecha) {
                ivaRetenido += val;
                baseImponibleIva += valBase;
                console.log(`      ✅ IVA (idx ${indiceValorRetenido}): Val=${val}, Base=${valBase}`);
            }
        }
        // FALLBACK ANTIGUO (Solo si falló detección de índice)
        else if (celdas.length >= 5) {
            // Buscar en últimas columnas descartando fechas
            for (let i = celdas.length - 1; i >= 2; i--) {
                const texto = celdas[i].textContent.trim();
                // Ignorar fechas largas o años
                if (texto.includes('-') || texto.includes('/') || (texto.length === 4 && parseInt(texto) > 1990)) continue;

                const val = parseDecimal(texto);
                if (val > 0) {
                    if (texto.includes('%')) continue;

                    if (/\brenta\b/.test(textoFila)) {
                        rentaRetenida += val;
                        // En el fallback antiguo no tenemos el índice de base imponible fácilmente
                        // pero podríamos asumir que es i - 2 (si i es 4, base es 2)
                        if (celdas[i - 2]) baseImponibleRenta += parseDecimal(celdas[i - 2].textContent);

                        console.log(`      ✅ RENTA (Fallback col ${i}): ${val}`);
                        break;
                    } else if (/\biva\b/.test(textoFila)) {
                        ivaRetenido += val;
                        if (celdas[i - 2]) baseImponibleIva += parseDecimal(celdas[i - 2].textContent);
                        console.log(`      ✅ IVA (Fallback col ${i}): ${val}`);
                        break;
                    }
                }
            }
        }
    });

    return { ivaRetenido, rentaRetenida, baseImponibleRenta, baseImponibleIva };
}

async function cerrarModal() {
    try {
        // Prioridad 1: Buscar botón cerrar en el diálogo específico de retenciones
        const formRet = document.getElementById('form-detalle-comprobante-retencion') ||
                        document.getElementById('form-detalle-comprobante-retencion:panel-detalle-comprobante-retencion');
        const dialogPadre = formRet?.closest('.ui-dialog, .rf-pp-cntr');
        if (dialogPadre) {
            const btnClosePadre = dialogPadre.querySelector('.ui-dialog-titlebar-close, .ui-icon-closethick, [id*="close"], a[href="#"]');
            if (btnClosePadre && (typeof esVisible === 'function' ? esVisible(btnClosePadre) : true)) {
                btnClosePadre.click();
                await sleep(80);
                return;
            }
        }

        // Prioridad 2: Buscar cualquier botón cerrar visible
        // `aria-label*="Cerrar"` es amplísimo y se llevaba puesto nuestro
        // botón «Cerrar la declaración», que abre un confirm(): de ahí salía
        // el cuadro repetido que bloqueaba el lote entero.
        const botonesCerrar = soloDelPortal(document.querySelectorAll('.ui-dialog-titlebar-close, .ui-dialog-close, [id*="close"], .ui-icon-closethick, button[aria-label*="Close" i], button[aria-label*="Cerrar" i]'));
        const botonVisible = botonesCerrar.find(btn => (typeof esVisible === 'function' ? esVisible(btn) : true));
        if (botonVisible) {
            if (typeof clickElement === 'function') clickElement(botonVisible, 'Cerrar Modal Retención');
            else botonVisible.click();
            await sleep(80);
        } else if (botonesCerrar.length > 0) {
            botonesCerrar[0].click();
            await sleep(80);
        } else {
            // Click fuera o Escape
            document.body.click();
            await sleep(80);
        }
    } catch (error) {
        console.warn('Error cerrando modal:', error);
    }
}

async function irSiguientePagina() {
    const btnSiguiente = document.querySelector('.ui-paginator-next');
    if (!btnSiguiente) return false;

    const clases = btnSiguiente.className || '';
    if (clases.includes('ui-state-disabled') || btnSiguiente.getAttribute('aria-disabled') === 'true') return false;

    // Guardar referencia al contenido previo para detectar la mutación real de página
    const primeraCeldaAntes = (document.querySelector('tbody tr td')?.textContent || '').trim();
    const paginadorActivoAntes = (document.querySelector('.ui-paginator-page.ui-state-active')?.textContent || '').trim();

    // Scroll al botón para asegurar visibilidad
    btnSiguiente.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    btnSiguiente.click();

    // Esperar reactivamente a que la tabla cambie de página o se procese el AJAX
    const startWait = Date.now();
    while (Date.now() - startWait < 8000) {
        await sleep(250);

        // Si aparece el spinner, esperar a que se oculte
        const spinner = document.querySelector('.ui-blockui') || document.querySelector('.ui-widget-overlay');
        if (spinner && getComputedStyle(spinner).display !== 'none') {
            await esperarTabla();
            break;
        }

        // Si el número de página activa cambió
        const paginadorActivoDespues = (document.querySelector('.ui-paginator-page.ui-state-active')?.textContent || '').trim();
        if (paginadorActivoDespues && paginadorActivoDespues !== paginadorActivoAntes) {
            break;
        }

        // Si los datos de la primera celda cambiaron
        const primeraCeldaDespues = (document.querySelector('tbody tr td')?.textContent || '').trim();
        if (primeraCeldaDespues && primeraCeldaDespues !== primeraCeldaAntes) {
            break;
        }
    }

    // Margen de estabilidad para renderizado completo de PrimeFaces
    await sleep(350);
    return true;
}

/**
 * ELITE v13.0: Maximiza el número de registros por página para acelerar la extracción.
 * Intenta configurar el dropdown de PrimeFaces a "100" o el valor más alto disponible.
 */
async function optimizarTamanoPagina() {
    try {
        const dropdownRPP = document.querySelector('.ui-paginator-rpp-options, select[name*="rpp"]');
        if (!dropdownRPP) return false;

        const options = Array.from(dropdownRPP.options);
        // Buscar la opción más alta o específicamente "100"
        let targetOption = options.find(opt => opt.value === "100" || opt.text.includes("100"));
        if (!targetOption && options.length > 0) {
            targetOption = options[options.length - 1]; // La última suele ser la mas grande
        }

        if (targetOption && dropdownRPP.value !== targetOption.value) {
            console.log(`🚀 Optimizando tamaño de página a: ${targetOption.text}`);
            dropdownRPP.value = targetOption.value;
            dropdownRPP.dispatchEvent(new Event('change', { bubbles: true }));

            // Esperar a que la tabla se recargue con los nuevos datos
            await sleep(1500);
            await esperarTabla();
            return true;
        }
    } catch (e) {
        console.warn('⚠️ No se pudo optimizar el tamaño de la página:', e);
    }
    return false;
}

async function esperarTabla() {
    await sleep(200);
    if (typeof waitForPortal === 'function') {
        await waitForPortal(8000);
    } else {
        let intentos = 0;
        while (intentos < 35) {
            const spinner = document.querySelector('.ui-blockui') || document.querySelector('.ui-widget-overlay');
            if (!spinner || spinner.style.display === 'none' || (typeof esVisible === 'function' && !esVisible(spinner))) break;
            await sleep(200);
            intentos++;
        }
    }
    await sleep(300);
}


const TIPO_COMPROBANTE = { factura: '1', notaCredito: '3', retencion: '6' };

/**
 * Baja el XML autorizado de UNA fila de la tabla de comprobantes recibidos.
 *
 * Cada fila trae dos enlaces, `lnkXml` y `lnkPdf`. No son AJAX: `mojarra.jsfcljs`
 * manda el formulario entero con el id del enlace como parámetro, exactamente
 * igual que `lnkTxtlistado`. Confirmado el 05-sep-2026 en la traza «flujo de
 * reportes de documentos electrónicos recibidos» (Biblia).
 *
 * Se reproduce el POST en vez de pulsar el enlace para que el archivo no baje
 * al disco del usuario: se lee y se descarta.
 *
 * @param {number} indiceFila Índice de la fila tal como lo numera PrimeFaces
 *                            (el N de `tablaCompRecibidos:N:lnkXml`).
 * @returns {Promise<Object|null>} salida de parsearXmlComprobante(), o null.
 */
async function descargarXmlComprobante(indiceFila) {
    const val = (id) => {
        const el = document.getElementById(id);
        return el ? (el.value || '') : '';
    };
    const viewState = document.querySelector('input[name="javax.faces.ViewState"]');
    if (!viewState) {
        console.warn('📄 [XML] No hay ViewState en la página: no se puede pedir el comprobante.');
        return null;
    }

    const enlace = `frmPrincipal:tablaCompRecibidos:${indiceFila}:lnkXml`;
    if (!document.getElementById(enlace)) {
        console.warn(`📄 [XML] La fila ${indiceFila} no tiene enlace de XML en pantalla.`);
        return null;
    }

    const cuerpo = new URLSearchParams({
        'frmPrincipal': 'frmPrincipal',
        'frmPrincipal:opciones': 'ruc',
        'frmPrincipal:ano': val('frmPrincipal:ano'),
        'frmPrincipal:mes': val('frmPrincipal:mes'),
        'frmPrincipal:dia': val('frmPrincipal:dia') || '0',
        'frmPrincipal:cmbTipoComprobante': val('frmPrincipal:cmbTipoComprobante') || TIPO_COMPROBANTE.factura,
        'javax.faces.ViewState': viewState.value,
        [enlace]: enlace
    });

    try {
        const r = await fetch(window.location.href.split('#')[0], {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: cuerpo.toString()
        });
        if (!r.ok) { console.warn(`📄 [XML] El portal devolvió HTTP ${r.status} en la fila ${indiceFila}.`); return null; }

        const texto = await r.text();
        // Si la sesión caducó el portal devuelve HTML, no el comprobante.
        if (!texto.trimStart().startsWith('<?xml') && !texto.includes('<infoTributaria')) {
            console.warn(`📄 [XML] La respuesta de la fila ${indiceFila} no es un comprobante (¿sesión caducada?).`);
            return null;
        }
        return parsearXmlComprobante(texto);
    } catch (err) {
        console.warn(`📄 [XML] Falló la descarga de la fila ${indiceFila}:`, err.message);
        return null;
    }
}

/**
 * Baja el XML de varias filas, de a una y con pausa.
 *
 * A propósito NO baja todo: el XML se pide sólo para las pocas facturas que lo
 * necesitan —las que quedaron sin tarifa reconocible, las que el cociente leyó
 * como 5%, las candidatas a activo fijo—. Bajar 27 XML por cliente y por mes,
 * en serie y por 27 contribuyentes, es la clase de ráfaga que termina en un
 * bloqueo del WAF.
 *
 * @param {number[]} indices Filas a pedir.
 * @param {{pausaMs?: number, tope?: number}} opciones
 * @returns {Promise<Map<number, Object>>} índice → comprobante parseado.
 */
async function traerXmlDeComprobantes(indices, opciones = {}) {
    const { pausaMs = 700, tope = 40 } = opciones;
    const pedidos = (indices || []).slice(0, tope);
    const salida = new Map();

    if ((indices || []).length > tope) {
        console.warn(`📄 [XML] Se pidieron ${indices.length} comprobantes; se bajan los primeros ${tope}.`);
    }

    for (let i = 0; i < pedidos.length; i++) {
        const idx = pedidos[i];
        const xml = await descargarXmlComprobante(idx);
        if (xml) {
            salida.set(idx, xml);
            const tarifas = Object.keys(xml.porTarifa).map((k) => `${k}%: $${xml.porTarifa[k].base}`).join(' · ');
            console.log(`   📄 [XML ${i + 1}/${pedidos.length}] fila ${idx} → ${tarifas || 'sin IVA'}`);
        }
        if (i < pedidos.length - 1) await sleep(pausaMs);
    }

    console.log(`📄 [XML] ${salida.size} de ${pedidos.length} comprobantes leídos.`);
    return salida;
}

// ── El XML autorizado: la tarifa dicha, no deducida ───────────────────────
// `codigoPorcentaje` del esquema de comprobantes electrónicos. Es lo que
// declaró quien emitió, así que acá no se adivina nada.
//   0 = 0%   ·  2 = 12%  ·  3 = 14%  ·  4 = 15%  ·  5 = 5%
//   6 = no objeto de IVA ·  7 = exento ·  8 = IVA diferenciado ·  10 = 15%
//
// El 6 y el 7 NO son «tarifa cero»: son transferencias que no gravan. Van al
// 507/517 igual que el 0% porque el formulario no los separa, pero se cuentan
// aparte por si algún día hace falta.
const CODIGO_PORCENTAJE_IVA = {
    '0': 0, '2': 12, '3': 14, '4': 15, '5': 5, '6': 0, '7': 0, '10': 15
};

/**
 * Lee un comprobante electrónico del SRI y devuelve la base y el IVA
 * SEPARADOS POR TARIFA.
 *
 * Esto es lo que el cociente IVA/base no puede hacer. Una factura de $100 con
 * un tercio al 15% y el resto al 0% da un cociente de 4,95%, idéntico al de
 * una del 5%: desde la tabla de recibidos las dos se ven igual. El XML dice
 * cuánto va en cada tarifa, línea por línea, y ahí se termina la duda.
 *
 * Acepta tanto el comprobante suelto (`<factura>`, `<notaCredito>`) como la
 * respuesta de autorización que lo trae envuelto en un CDATA.
 *
 * @param {string} xmlTexto Contenido del XML.
 * @returns {{claveAcceso: string, rucEmisor: string, razonSocial: string,
 *            codDoc: string, esNotaCredito: boolean, fechaEmision: string,
 *            porTarifa: Object<string, {base: number, iva: number}>,
 *            totalSinImpuestos: number, importeTotal: number,
 *            tarifasDesconocidas: string[]}|null}
 */
function parsearXmlComprobante(xmlTexto) {
    if (!xmlTexto || typeof xmlTexto !== 'string') return null;

    let texto = xmlTexto;

    // La respuesta de autorización envuelve el comprobante en un CDATA. Si
    // está, el comprobante de verdad es lo de adentro.
    const cdata = texto.match(/<comprobante>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/comprobante>/);
    if (cdata) texto = cdata[1];

    let doc;
    try {
        doc = new DOMParser().parseFromString(texto, 'text/xml');
    } catch (e) {
        console.error('❌ [XML] No se pudo parsear el comprobante:', e);
        return null;
    }
    if (!doc || doc.querySelector('parsererror')) {
        console.error('❌ [XML] El contenido no es un XML válido.');
        return null;
    }

    const txt = (sel) => {
        const el = doc.querySelector(sel);
        return el ? (el.textContent || '').trim() : '';
    };
    const num = (sel) => parseDecimal(txt(sel));

    const codDoc = txt('infoTributaria > codDoc');
    const porTarifa = {};
    const tarifasDesconocidas = [];

    // El bloque de totales es el que hay que declarar: ya viene agrupado por
    // tarifa y es el que el SRI autorizó. El detalle por línea sirve para ver
    // QUÉ se compró (activo fijo), no para sumar.
    const impuestos = doc.querySelectorAll('totalConImpuestos > totalImpuesto');
    impuestos.forEach((imp) => {
        const codigo = (imp.querySelector('codigo')?.textContent || '').trim();
        if (codigo !== '2') return;   // 2 = IVA; 3 = ICE; 5 = IRBPNR

        const cp = (imp.querySelector('codigoPorcentaje')?.textContent || '').trim();
        const base = parseDecimal(imp.querySelector('baseImponible')?.textContent);
        const valor = parseDecimal(imp.querySelector('valor')?.textContent);

        const tarifa = CODIGO_PORCENTAJE_IVA[cp];
        if (tarifa === undefined) {
            // Un código nuevo no se reparte a ojo: se anota y lo mira el contador.
            tarifasDesconocidas.push(cp);
            console.warn(`   ⚠️ [XML] codigoPorcentaje "${cp}" desconocido: base $${base}, IVA $${valor}.`);
            return;
        }

        const k = String(tarifa);
        if (!porTarifa[k]) porTarifa[k] = { base: 0, iva: 0 };
        porTarifa[k].base += base;
        porTarifa[k].iva += valor;
    });

    Object.keys(porTarifa).forEach((k) => {
        porTarifa[k].base = redondear(porTarifa[k].base);
        porTarifa[k].iva = redondear(porTarifa[k].iva);
    });

    return {
        claveAcceso: txt('infoTributaria > claveAcceso') || txt('claveAcceso'),
        rucEmisor: txt('infoTributaria > ruc'),
        razonSocial: txt('infoTributaria > razonSocial'),
        codDoc,
        esNotaCredito: codDoc === '04',
        fechaEmision: txt('fechaEmision'),
        porTarifa,
        totalSinImpuestos: num('totalSinImpuestos'),
        importeTotal: num('importeTotal') || num('valorModificacion'),
        tarifasDesconocidas
    };
}

/**
 * Reparte lo que dice un XML en los baldes del resumen (0 / 5 / plena).
 *
 * Se usa igual para facturas y para notas de crédito: los dos resúmenes tienen
 * los mismos tres baldes. Al venir del XML, ninguna cae en «ambiguas»: la
 * tarifa está dicha.
 *
 * @param {Object} resumen Resumen con baldes iva0 / iva5 / iva15.
 * @param {Object} xml Salida de parsearXmlComprobante().
 * @returns {boolean} false si el XML traía tarifas que no se reconocen.
 */
function repartirXmlEnResumen(resumen, xml) {
    if (!resumen || !xml || !xml.porTarifa) return false;

    Object.keys(xml.porTarifa).forEach((k) => {
        const { base, iva } = xml.porTarifa[k];
        const tarifa = Number(k);
        const balde = tarifa === 0 ? resumen.iva0
                    : tarifa === 5 ? resumen.iva5
                    : resumen.iva15;
        if (!balde) return;
        balde.baseImponible += base;
        if (typeof balde.montoIva === 'number') balde.montoIva += iva;
        balde.total += base + iva;
        if (typeof balde.cantidad === 'number') balde.cantidad++;
    });

    return (xml.tarifasDesconocidas || []).length === 0;
}

/**
 * Descarga el listado TXT del período que esté cargado en pantalla.
 * Reproduce el POST del enlace en vez de pulsarlo, así el archivo no baja al
 * disco del usuario: se lee y se descarta.
 *
 * @returns {Promise<Array<Object>|null>} filas ya parseadas, o null si falló.
 */
async function descargarTxtRecibidos(tipo = TIPO_COMPROBANTE.factura) {
    const val = (id) => {
        const el = document.getElementById(id);
        return el ? (el.value || '') : '';
    };
    const viewState = document.querySelector('input[name="javax.faces.ViewState"]');
    if (!viewState) {
        console.warn('📄 [TXT] No hay ViewState en la página: no se puede pedir el listado.');
        return null;
    }

    const cuerpo = new URLSearchParams({
        'frmPrincipal': 'frmPrincipal',
        'frmPrincipal:opciones': 'ruc',
        'frmPrincipal:ano': val('frmPrincipal:ano'),
        'frmPrincipal:mes': val('frmPrincipal:mes'),
        'frmPrincipal:dia': val('frmPrincipal:dia') || '0',
        'frmPrincipal:cmbTipoComprobante': tipo,
        'javax.faces.ViewState': viewState.value,
        'frmPrincipal:lnkTxtlistado': 'frmPrincipal:lnkTxtlistado'
    });

    try {
        const r = await fetch(window.location.href.split('#')[0], {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: cuerpo.toString()
        });
        if (!r.ok) { console.warn(`📄 [TXT] El portal devolvió HTTP ${r.status}.`); return null; }

        const texto = await r.text();
        // Si la sesión caducó, el portal devuelve HTML en vez del archivo.
        if (!texto.startsWith('RUC_EMISOR')) {
            console.warn('📄 [TXT] La respuesta no es el listado (¿sesión caducada?).');
            return null;
        }
        const filas = parsearTxtRecibidos(texto);

        // El TXT es la mejor fuente: trae el RUC y la razón social SEPARADOS,
        // no pegados como en la tabla. Las retenciones NO entran: las emite el
        // cliente que te retuvo, no un proveedor.
        if (typeof Proveedores !== 'undefined' && tipo !== TIPO_COMPROBANTE.retencion) {
            try {
                await Proveedores.registrarLote(filas, await rucDelClienteActual());
            } catch (e) { console.warn('🏷️ [PROVEEDORES] No se pudieron anotar:', e.message); }
        }

        return filas;
    } catch (err) {
        console.warn('📄 [TXT] Falló la descarga:', err.message);
        return null;
    }
}

/** Convierte el TXT separado por tabuladores en objetos. */
function parsearTxtRecibidos(texto) {
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
    if (lineas.length < 1) return [];
    const cols = lineas[0].split('\t').map((c) => c.trim());

    // Los importes vienen con punto decimal y a veces sin el cero de la
    // izquierda (".3"). parseFloat lo resuelve; el vacío queda en null para
    // poder distinguir "cero" de "el portal no lo informa".
    const num = (v) => {
        const t = String(v || '').trim();
        if (!t) return null;
        const n = parseFloat(t.replace(',', '.'));
        return isNaN(n) ? null : n;
    };

    return lineas.slice(1).map((l) => {
        const f = l.split('\t');
        const o = {};
        cols.forEach((c, i) => { o[c] = (f[i] || '').trim(); });
        return {
            rucEmisor: o.RUC_EMISOR || '',
            razonSocial: o.RAZON_SOCIAL_EMISOR || '',
            tipo: o.TIPO_COMPROBANTE || '',
            serie: o.SERIE_COMPROBANTE || '',
            claveAcceso: o.CLAVE_ACCESO || '',
            fechaEmision: o.FECHA_EMISION || '',
            sinImpuestos: num(o.VALOR_SIN_IMPUESTOS),
            iva: num(o.IVA),
            total: num(o.IMPORTE_TOTAL)
        };
    });
}

/**
 * Compara lo que dice el portal con lo que leyó la extracción.
 * Un desajuste normalmente significa que se perdió una página del paginador,
 * que es el fallo más peligroso porque no da ningún error.
 */
async function auditarExtraccionConTxt(tipo, cantidadLeida, totalLeido = null) {
    const filas = await descargarTxtRecibidos(tipo);
    if (!filas) return null;

    const suma = (k) => filas.reduce((a, f) => a + (f[k] || 0), 0);
    const informe = {
        segunPortal: filas.length,
        segunExtraccion: cantidadLeida,
        cuadra: filas.length === cantidadLeida,
        baseTxt: Number(suma('sinImpuestos').toFixed(2)),
        ivaTxt: Number(suma('iva').toFixed(2)),
        totalTxt: Number(suma('total').toFixed(2)),
        proveedores: [...new Map(filas.filter((f) => f.rucEmisor)
            .map((f) => [f.rucEmisor, f.razonSocial])).entries()]
            .map(([ruc, nombre]) => ({ ruc, nombre }))
    };

    if (informe.cuadra) {
        console.log(`✅ [AUDITORÍA] ${filas.length} comprobantes según el portal y según la extracción. Cuadra.`);
    } else {
        console.error(`🚨 [AUDITORÍA] El portal informa ${filas.length} comprobantes y la extracción leyó ${cantidadLeida}. ` +
                      'Falta o sobra algo: revisá la paginación antes de declarar.');
        if (typeof anotarBitacora === 'function') {
            await anotarBitacora('⚠️ auditoría no cuadra', `portal=${filas.length} · leídos=${cantidadLeida}`);
        }
    }

    if (totalLeido !== null && informe.totalTxt) {
        const dif = Math.abs(informe.totalTxt - totalLeido);
        if (dif > 0.02) {
            console.warn(`⚠️ [AUDITORÍA] Importe total: portal $${informe.totalTxt} vs extracción $${totalLeido} (difieren $${dif.toFixed(2)}).`);
        }
    }

    return informe;
}

if (typeof window !== 'undefined') {
    /** Uso a mano, estando en Comprobantes Recibidos con una consulta hecha. */
    window.sriTxt = async (tipo) => {
        const filas = await descargarTxtRecibidos(tipo || TIPO_COMPROBANTE.factura);
        if (!filas) return null;
        console.log(`📄 ${filas.length} comprobantes en el listado del portal.`);
        console.table(filas.slice(0, 40).map((f) => ({
            emisor: f.razonSocial.slice(0, 34), tipo: f.tipo, serie: f.serie,
            base: f.sinImpuestos, iva: f.iva, total: f.total
        })));
        return filas;
    };
    window.sriAuditar = (tipo, n) => auditarExtraccionConTxt(tipo || TIPO_COMPROBANTE.factura, n);
    // sriMapaCasilleros() NO se envuelve. El bundle es una concatenacion sin
    // IIFE, asi que toda funcion de nivel superior YA es window.<nombre>:
    // reasignarla con un envoltorio que la llama por su propio nombre se
    // llamaba a si mismo hasta reventar la pila. Lo cazo el banco de pruebas.
    // Pegale el texto de un XML autorizado y devuelve la base y el IVA por tarifa.
    window.sriLeerXml = (texto) => parsearXmlComprobante(texto);
    // Parado en Comprobantes Recibidos: baja el XML de una fila, o de varias.
    window.sriBajarXml = (n) => (Array.isArray(n) ? traerXmlDeComprobantes(n) : descargarXmlComprobante(n));
}

// ── Tarifas de IVA y el corte por cociente ────────────────────────────────
// Tarifas realmente vigentes en algún período declarable: 12% hasta marzo de
// 2024, 13% ese marzo, 15% desde abril, y el 5% de las adquisiciones locales
// que va a sus propios casilleros (540 / 550).
//
// El 8% de feriados queda AFUERA a propósito. No es que no exista: es que cae
// justo en la zona donde una factura mezclada (parte al 15%, parte al 0%)
// produce ese mismo cociente. Prefiero que una factura al 8% caiga en «no sé»
// y la mire el contador, antes que una mezclada se declare como si fuera de
// una sola tarifa.
const TARIFAS_IVA = [5, 12, 13, 14, 15];

/**
 * Deduce la tarifa de una factura por el cociente IVA / base.
 *
 * Funciona cuando la factura es de una sola tarifa, que es la mayoría. Cuando
 * trae líneas mezcladas el cociente no dice nada útil: $100 con un tercio al
 * 15% da 4,95% y se parece a una del 5%. Por eso hay tres respuestas y la
 * tercera es «no sé» — nunca se adivina.
 *
 * @param {number} base Valor sin impuestos.
 * @param {number} iva Monto de IVA (ya reconciliado contra total − base).
 * @returns {{tarifa: number|null, motivo: string}}
 */
function clasificarTarifaIva(base, iva) {
    if (!(base > 0.005)) return { tarifa: null, motivo: 'sin base imponible legible' };
    // Umbral en centavos, no === 0: la resta de la reconciliación puede dejar
    // una cola binaria minúscula que no es IVA de verdad.
    if (!(iva > 0.005)) return { tarifa: 0, motivo: 'sin IVA' };

    // El portal redondea por línea, así que una factura de muchas líneas se
    // aparta unos centavos del producto exacto. La holgura es en plata, no en
    // puntos porcentuales: en una factura de $5 un centavo son 0,2 puntos.
    const holgura = Math.max(0.02, base * 0.001);

    for (const t of TARIFAS_IVA) {
        if (Math.abs(iva - base * t / 100) <= holgura) return { tarifa: t, motivo: 'cociente' };
    }

    const pct = (100 * iva / base).toFixed(2);
    return { tarifa: null, motivo: `el IVA es el ${pct}% de la base y no coincide con ninguna tarifa (¿factura de tarifas mezcladas?)` };
}

function calcularResumen(facturas) {
    let periodo = "Desconocido";
    if (facturas.length > 0) {
        // Asumimos formato fecha dd/mm/yyyy o yyyy-mm-dd en propiedad algun lado?
        // En extraerFacturasPaginaActual no grabamos fecha explicita, agreguemosla si es posible o usemos la fecha actual - 1 mes
        // PERO: El usuario quiere el mes de los datos.
        // Simulamos obteniendo de la busqueda actual
        const fechaActual = new Date();
        const mesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 1, 1);
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        periodo = `${meses[mesAnterior.getMonth()]} ${mesAnterior.getFullYear()}`;
    }

    // `iva15` junta todas las tarifas plenas (12, 13, 14, 15): todas van a los
    // mismos casilleros 500 / 510. El 5% tiene los suyos (540 / 550), y por eso
    // necesita balde propio.
    const balde = () => ({ cantidad: 0, total: 0, baseImponible: 0, montoIva: 0 });
    const resumen = {
        totalFacturas: facturas.length,
        iva0: balde(),
        iva5: balde(),
        iva15: balde(),
        ambiguas: [],   // sin tarifa reconocible: las reparte el contador
        periodo: periodo
    };

    facturas.forEach((factura, i) => {
        const { tarifa, motivo } = clasificarTarifaIva(factura.valorSinImpuestos, factura.iva);

        let destino;
        if (tarifa === 0) {
            destino = resumen.iva0;
        } else if (tarifa === 5) {
            destino = resumen.iva5;
            console.log(`   🟡 [Factura ${factura.numero || i + 1}] Leída al 5%: base $${factura.valorSinImpuestos}, IVA $${factura.iva}. Va al 540/550, no al 500.`);
        } else if (tarifa !== null) {
            destino = resumen.iva15;
        } else {
            // Se cuenta en la tarifa plena para NO achicar el total declarado,
            // pero queda anotada: el cierre mágico no envía con ambigüedades.
            destino = resumen.iva15;
            resumen.ambiguas.push({
                numero: factura.numero || i + 1,
                rucRazon: factura.rucRazon || 'S/N',
                base: redondear(factura.valorSinImpuestos),
                iva: redondear(factura.iva),
                motivo
            });
            console.warn(`   ⚠️ [Factura ${factura.numero || i + 1}] ${motivo}`);
        }

        destino.cantidad++;
        destino.total += factura.importeTotal;
        destino.baseImponible += factura.valorSinImpuestos;
        destino.montoIva += factura.iva;
    });

    [resumen.iva0, resumen.iva5, resumen.iva15].forEach((b) => {
        b.total = redondear(b.total);
        b.baseImponible = redondear(b.baseImponible);
        b.montoIva = redondear(b.montoIva);
    });

    if (resumen.iva5.cantidad > 0) {
        console.log(`   🟡 ${resumen.iva5.cantidad} factura(s) al 5%: base $${resumen.iva5.baseImponible}. Casilleros 540 / 550.`);
    }
    if (resumen.ambiguas.length > 0) {
        console.warn(`   ⚠️ ${resumen.ambiguas.length} factura(s) sin tarifa reconocible. No se envía hasta que las mires.`);
    }

    return resumen;
}

function calcularResumenRetenciones(retenciones) {
    let periodo = "Desconocido";
    if (retenciones.length > 0) {
        // Igual, usamos la logica de mes anterior por defecto ya que es lo que busca el bot
        const fechaActual = new Date();
        const mesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 1, 1);
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        periodo = `${meses[mesAnterior.getMonth()]} ${mesAnterior.getFullYear()}`;
    }

    const resumen = {
        totalRetenciones: retenciones.length,
        ivaRetenido: { cantidad: 0, total: 0, baseTotal: 0, valores: [] },
        rentaRetenida: { cantidad: 0, total: 0, baseTotal: 0, valores: [] },
        listaNumeros: [],
        periodo: periodo
    };

    retenciones.forEach(retencion => {
        if (retencion.comprobanteNo) {
            resumen.listaNumeros.push(retencion.comprobanteNo);
        }

        // Procesar IVA (si tiene valor o base)
        if (retencion.ivaRetenido > 0 || (retencion.baseImponibleIva && retencion.baseImponibleIva > 0)) {
            resumen.ivaRetenido.cantidad++;
            resumen.ivaRetenido.total += (retencion.ivaRetenido || 0);
            resumen.ivaRetenido.baseTotal += (retencion.baseImponibleIva || 0);
            resumen.ivaRetenido.valores.push((retencion.ivaRetenido || 0).toFixed(2));
        }

        // Procesar Renta (si tiene valor o base)
        if (retencion.rentaRetenida > 0 || (retencion.baseImponibleRenta && retencion.baseImponibleRenta > 0)) {
            resumen.rentaRetenida.cantidad++;
            resumen.rentaRetenida.total += (retencion.rentaRetenida || 0);
            resumen.rentaRetenida.baseTotal += (retencion.baseImponibleRenta || 0);
            resumen.rentaRetenida.valores.push((retencion.rentaRetenida || 0).toFixed(2));
        }
    });

    resumen.ivaRetenido.total = redondear(resumen.ivaRetenido.total);
    resumen.rentaRetenida.total = redondear(resumen.rentaRetenida.total);
    resumen.ivaRetenido.baseTotal = redondear(resumen.ivaRetenido.baseTotal);
    resumen.rentaRetenida.baseTotal = redondear(resumen.rentaRetenida.baseTotal);

    // Generar strings de detalle (ej: "10.00 + 5.00")
    resumen.ivaRetenido.detalleStr = resumen.ivaRetenido.valores.join(' + ');
    resumen.rentaRetenida.detalleStr = resumen.rentaRetenida.valores.join(' + ');

    return resumen;
}

// ============================================
// EXTRACCIÓN DE NOTAS DE CRÉDITO
// ============================================

async function extraerTodasLasNotasCredito() {
    console.log('🚀 Iniciando extracción de Notas de Crédito...');
    const todasLasNC = [];
    let paginaActual = 1;

    while (true) {
        console.log('Procesando página ' + paginaActual + ' de NC');
        await esperarTabla();

        // ELITE v13.1: Feedback de progreso en tiempo real
        if (window.sriAssistant) {
            window.sriAssistant.log(`📄 Procesando página ${paginaActual} de Notas de Crédito...`);
        }

        const ncPagina = await extraerNotasCreditoPaginaActualDeep();
        console.log('Extraídas ' + ncPagina.length + ' notas de crédito');

        if (ncPagina.length === 0 && paginaActual === 1) {
            // Check if "No existen datos" message is present
            const msgError = document.querySelector('.ui-messages-warn-detail, .ui-growl-item');
            if (msgError && msgError.textContent.includes('No existen datos')) {
                console.log('ℹ️ No hay notas de crédito.');
                break;
            }
        }

        if (ncPagina.length === 0 && paginaActual > 1) break; // Fin de paginación

        todasLasNC.push(...ncPagina);

        const hayMasPaginas = await irSiguientePagina();
        if (!hayMasPaginas) break;

        paginaActual++;
        await esperarAjaxSri(null, `página ${paginaActual} de notas de crédito`);
    }

    console.log('Total: ' + todasLasNC.length + ' notas de crédito');

    // Una nota de crédito la emite el mismo proveedor: cuenta igual.
    if (typeof Proveedores !== 'undefined') {
        try {
            await Proveedores.registrarLote(todasLasNC, await rucDelClienteActual());
        } catch (e) { console.warn('🏷️ [PROVEEDORES] No se pudieron anotar:', e.message); }
    }

    return calcularResumenNotasCredito(todasLasNC);
}

function extraerNotasCreditoPaginaActual() {
    console.log('🔍 DEBUG: Iniciando extraerNotasCreditoPaginaActual');
    const notas = [];

    // Reusar lógica de búsqueda de tabla de Facturas (misma estructura generalmente)
    let tabla = null;
    const todasLasTablas = document.querySelectorAll('table');

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        // Tablas de NC suelen tener 'Valor sin impuestos' y 'Importe Total' igual que facturas
        if ((textoEncabezados.includes('valor sin impuestos') || textoEncabezados.includes('base imponible')) &&
            textoEncabezados.includes('importe total') &&
            esVisible(t)) {
            tabla = t;
            console.log(`✅ Tabla NC encontrada: ${t.id} (Headers: ${textoEncabezados})`);
            break;
        }
    }

    // Fallback selectors
    if (!tabla) tabla = document.querySelector('table[id*="dtComprobantes"]');
    if (!tabla) tabla = document.querySelector('table[id*="Comprobantes"]');

    if (!tabla) {
        console.warn('⚠️ No se encontró tabla de Notas de Crédito');
        return notas;
    }

    // Indices (Generalmente iguales a Facturas, pero recalculamos por seguridad)
    let idxValorSinImpuestos = -1;
    let idxIva = -1;
    let idxImporteTotal = -1;

    const thead = tabla.querySelector('thead');
    if (thead) {
        const headers = thead.querySelectorAll('th, td');
        headers.forEach((th, index) => {
            const texto = th.textContent.toLowerCase().trim();
            if (texto.includes('valor sin impuestos') || texto.includes('base imponible')) {
                idxValorSinImpuestos = index;
            } else if (texto.includes('iva') && !texto.includes('ret')) {
                idxIva = index;
            } else if (texto.includes('importe total') || texto.includes('total')) {
                idxImporteTotal = index;
            }
        });
    }

    const filas = tabla.querySelectorAll('tbody tr');
    filas.forEach((fila, idx) => {
        try {
            const celdas = fila.querySelectorAll('td');
            if (celdas.length < 7) return;

            // Verificar mensaje
            if (fila.textContent.includes('No se encontraron')) return;

            let valorSinImpuestos = 0, iva = 0, importeTotal = 0;

            // Estrategia Indices Dinámicos
            if (idxValorSinImpuestos !== -1 && idxImporteTotal !== -1) {
                valorSinImpuestos = parseDecimal(celdas[idxValorSinImpuestos].textContent);
                if (idxIva !== -1) iva = parseDecimal(celdas[idxIva].textContent);
                importeTotal = parseDecimal(celdas[idxImporteTotal].textContent);
            }
            // Estrategia  Falta (Últimas columnas)
            else if (celdas.length >= 9) {
                // Asumimos mismas posiciones que Facturas: 6=SinImp, 7=IVA, 8=Total
                valorSinImpuestos = parseDecimal(celdas[6].textContent);
                iva = parseDecimal(celdas[7].textContent);
                importeTotal = parseDecimal(celdas[8].textContent);
            }
            else {
                // Fallback últimas 3
                const ultimas3 = [
                    celdas[celdas.length - 3],
                    celdas[celdas.length - 2],
                    celdas[celdas.length - 1]
                ];
                valorSinImpuestos = parseDecimal(ultimas3[0].textContent);
                iva = parseDecimal(ultimas3[1].textContent);
                importeTotal = parseDecimal(ultimas3[2].textContent);
            }

            if (importeTotal === 0 && valorSinImpuestos === 0) return;

            notas.push({
                numero: idx + 1,
                valorSinImpuestos: valorSinImpuestos,
                iva: iva,
                importeTotal: importeTotal
            });

        } catch (e) {
            console.error('Error procesando fila NC ' + idx, e);
        }
    });

    return notas;
}

async function extraerNotasCreditoPaginaActualDeep() {
    const notas = [];
    const todasLasTablas = document.querySelectorAll('table');
    let tabla = null;

    for (const t of todasLasTablas) {
        const encabezados = t.querySelectorAll('thead th, thead td');
        const textoEncabezados = Array.from(encabezados).map(th => th.textContent.toLowerCase().trim()).join(' ');

        if ((textoEncabezados.includes('valor sin impuestos') || textoEncabezados.includes('base imponible')) &&
            textoEncabezados.includes('importe total') &&
            esVisible(t)) {
            tabla = t;
            break;
        }
    }

    if (!tabla) tabla = document.querySelector('table[id*="dtComprobantes"]');

    if (!tabla) {
        console.warn('⚠️ No se encontró tabla de Notas de Crédito');
        return notas;
    }

    // DETECCIÓN DINÁMICA DE COLUMNAS PARA TABA EXTERNA
    let idxValSin = -1, idxValIva = -1, idxValTot = -1;
    const thead = tabla.querySelector('thead');
    if (thead) {
        const headers = thead.querySelectorAll('th, td');
        headers.forEach((th, idx) => {
            const h = th.textContent.toLowerCase().trim();
            if (h.includes('valor sin') || h.includes('base imponible')) idxValSin = idx;
            else if (h.includes('iva') && !h.includes('retención')) idxValIva = idx;
            else if (h.includes('total')) idxValTot = idx;
        });
    }

    const filas = tabla.querySelectorAll('tbody tr');
    console.log(`🔍 Deep NC: Procesando ${filas.length} filas en tabla [${tabla.id || 'sin id'}]...`);

    for (let idx = 0; idx < filas.length; idx++) {
        const fila = filas[idx];
        try {
            const celdas = fila.querySelectorAll('td');
            if (celdas.length < 8) continue;
            if (fila.textContent.includes('No se encontraron')) continue;

            const celdaEnlace = celdas[3]; // Clave de Acceso suele ser 3
            const enlace = celdaEnlace.querySelector('a');

            if (!enlace) {
                console.warn(`   ⚠️ No se encontró enlace en fila ${idx + 1}`);
                continue;
            }

            console.log(`📄 Deep NC [${idx + 1}]: Abriendo modal de detalle...`);
            enlace.click();

            // Esperar que el modal se abra (Checking for specific table presence)
            let datosModal = null;
            for (let t = 0; t < 6; t++) {
                await sleep(800);
                datosModal = await extraerDatosModalNC();
                if (datosModal) break;
            }

            if (datosModal) {
                notas.push({
                    numero: idx + 1,
                    valorSinImpuestos: datosModal.iva0 + datosModal.iva15,
                    iva: datosModal.valorIva,
                    importeTotal: datosModal.iva0 + datosModal.iva15 + datosModal.valorIva,
                    iva0: datosModal.iva0,
                    iva15: datosModal.iva15
                });
                console.log(`   ✅ Detalle NC [${idx + 1}]: Base0=$${datosModal.iva0}, Base15=$${datosModal.iva15}, IVA=$${datosModal.valorIva}`);
            } else {
                console.warn(`   ⚠️ Falló extracción en modal NC [${idx + 1}], usando datos de tabla externa.`);

                // Usar índices detectados o fallback fijo
                const cValSin = idxValSin !== -1 ? idxValSin : 6;
                const cValIva = idxValIva !== -1 ? idxValIva : 7;
                const cValTot = idxValTot !== -1 ? idxValTot : 8;

                // Estricto: null = «no pude leer», que NO es lo mismo que cero.
                const leerCelda = (i) => parseImporteEstricto(celdas[i]?.textContent);
                const sinLeido = leerCelda(cValSin);
                const ivaLeido = leerCelda(cValIva);
                const totLeido = leerCelda(cValTot);

                const valSin = sinLeido === null ? 0 : sinLeido;
                const valTot = totLeido === null ? 0 : totLeido;

                // El portal cumple total = base + IVA. Si la columna del IVA no
                // se pudo leer, se deduce de ahí: la resta no depende de que el
                // índice de columna sea el correcto.
                // total = base + IVA. Es una identidad, no una estimación: si
                // se pueden leer base y total, la resta es la fuente confiable.
                const deducido = (sinLeido !== null && totLeido !== null)
                    ? redondear(totLeido - sinLeido) : null;

                let valIva = ivaLeido;
                let comoSeSupo = 'columna';
                if (valIva === null && deducido !== null) {
                    valIva = deducido;
                    comoSeSupo = 'deducido de total - base';
                } else if (valIva !== null && deducido !== null &&
                           Math.abs(valIva - deducido) > 0.02) {
                    // La columna dice una cosa y la aritmética otra. Pasa
                    // cuando el índice apunta a una columna que no es el IVA
                    // (una de tarifa, por ejemplo: «15%» se lee como 15).
                    console.warn(`   ⚠️ [NC ${idx + 1}] La columna del IVA dice $${valIva} pero total - base da $${deducido}. ` +
                                 'Mando la resta, que es la que no puede mentir.');
                    valIva = deducido;
                    comoSeSupo = 'deducido (la columna no coincidía)';
                }

                if (valIva === null) {
                    // Ni leído ni deducible. Antes esto se declaraba como 0%
                    // en silencio; ahora se avisa, porque de este corte
                    // dependen los casilleros.
                    console.error(`   🚨 [NC ${idx + 1}] No pude leer ni deducir el IVA de esta nota. Se declara como 0% pero HAY QUE REVISARLA A MANO: "${(fila.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)}"`);
                    if (typeof anotarBitacora === 'function') {
                        await anotarBitacora('⚠️ NC sin IVA legible', `nota ${idx + 1} · revisar a mano`);
                    }
                    valIva = 0;
                    comoSeSupo = 'NO SE PUDO';
                }

                // Una nota con IVA es 15%; sin IVA, 0%. El umbral en centavos
                // evita que un redondeo de la resta la mande al lado que no es.
                const con15 = valIva > 0.005;

                notas.push({
                    numero: idx + 1,
                    valorSinImpuestos: valSin,
                    iva: valIva,
                    importeTotal: valTot,
                    iva0: con15 ? 0 : valSin,
                    iva15: con15 ? valSin : 0
                });
                console.log(`   🔸 Fallback NC [${idx + 1}]: Sin=$${valSin}, IVA=$${valIva} (${comoSeSupo}) → ${con15 ? '15%' : '0%'}`);
            }

            await cerrarModal();
            await sleep(500);

        } catch (e) {
            console.error(`   ❌ Error en Deep NC fila ${idx}`, e);
            await cerrarModal();
        }
    }

    return notas;
}

async function extraerDatosModalNC() {
    try {
        await sleep(500); // Pequeña pausa inicial

        // 1. ESTRATEGIA: ID Específico (según imagen del usuario)
        let tablaTotales = document.querySelector('table[id*="tabla-totales-impuesto-nota-credito"]');

        if (!tablaTotales) {
            // 2. ESTRATEGIA: Búsqueda por headers en tablas del diálogo
            const dialogTables = document.querySelectorAll('.ui-dialog table, [id*="form-detalle"] table');
            for (const t of dialogTables) {
                const hText = t.textContent.toLowerCase();
                // Verificamos que sea la tabla de TOTALES y no la de ítems
                if (hText.includes('totales por impuesto') ||
                    (hText.includes('impuesto') && hText.includes('base imponible') && hText.includes('valor') && !hText.includes('precio unitario'))) {
                    tablaTotales = t;
                    break;
                }
            }
        }

        if (!tablaTotales) return null;

        const filasTotales = Array.from(tablaTotales.querySelectorAll('tbody tr, .rf-dt-r'));
        // IMPORTANTE: Si la tabla existe pero no tiene filas de datos (vacia o cargando), seguimos esperando
        if (filasTotales.length === 0 || filasTotales[0].textContent.includes('No se encontraron')) {
            return null;
        }

        console.log(`      ✅ Tabla NC hallada con ${filasTotales.length} filas de impuestos.`);
        let iva0 = 0;
        let iva5 = 0;
        let iva15 = 0;
        let valorIva = 0;

        filasTotales.forEach(fila => {
            const celdas = fila.querySelectorAll('td');
            if (celdas.length >= 4) {
                const impuesto = celdas[1].textContent.toLowerCase();
                const codigo = celdas[2].textContent.trim();
                const base = parseDecimal(celdas[3].textContent);
                const valor = celdas[4] ? parseDecimal(celdas[4].textContent) : 0;

                if (impuesto.includes('iva')) {
                    // codigoPorcentaje del SRI. Acá no se deduce nada: es la
                    // tarifa que declaró quien emitió el comprobante.
                    //   0 = 0%   ·  2 = 12%  ·  3 = 14%  ·  4 y 10 = 15%
                    //   5 = 5%   ·  6 = no objeto  ·  7 = exento
                    const cod = codigo.replace(/\.0+$/, '');
                    if (cod === '0' || cod === '6' || cod === '7') {
                        iva0 += base;
                    } else if (cod === '5') {
                        iva5 += base;
                        valorIva += valor;
                    } else {
                        iva15 += base;
                        valorIva += valor;
                    }
                }
            }
        });

        // Solo retornamos si al menos capturamos algo o confirmamos que procesamos filas
        return { iva0, iva5, iva15, valorIva, processed: true };

    } catch (e) {
        console.error('❌ Error parseando modal NC:', e);
        return null;
    }
}

function calcularResumenNotasCredito(notas) {
    const resumen = {
        totalNotas: notas.length,
        valorSinImpuestos: 0,
        iva: { total: 0 },
        totalGeneral: 0,
        iva0: { baseImponible: 0, total: 0 },
        iva5: { baseImponible: 0, total: 0 },
        iva15: { baseImponible: 0, total: 0 },
        ambiguas: []
    };

    notas.forEach((nc, i) => {
        resumen.valorSinImpuestos += (nc.valorSinImpuestos || 0);
        resumen.iva.total += (nc.iva || 0);
        resumen.totalGeneral += (nc.importeTotal || 0);

        // Si tenemos datos del deep extraction (el modal trae el código de
        // porcentaje del SRI), los usamos: son la tarifa exacta, no deducida.
        if (typeof nc.iva0 === 'number' && typeof nc.iva15 === 'number') {
            resumen.iva0.baseImponible += nc.iva0;
            resumen.iva0.total += nc.iva0; // Reflejar en el total de esa base
            resumen.iva5.baseImponible += (nc.iva5 || 0);
            resumen.iva5.total += (nc.iva5 || 0);
            resumen.iva15.baseImponible += nc.iva15;
            resumen.iva15.total += nc.iva15 + (nc.iva || 0);
        } else {
            // Sin modal hay que deducir la tarifa como en las facturas. Una NC
            // al 5% que se reste del 510 en vez del 550 deja los dos casilleros
            // mal, así que tampoco acá se parte en dos baldes nomás.
            const { tarifa, motivo } = clasificarTarifaIva(nc.valorSinImpuestos, nc.iva || 0);
            if (tarifa === 5) {
                resumen.iva5.baseImponible += nc.valorSinImpuestos;
                resumen.iva5.total += nc.importeTotal;
            } else if (tarifa === 0) {
                resumen.iva0.baseImponible += nc.valorSinImpuestos;
                resumen.iva0.total += nc.importeTotal;
            } else {
                resumen.iva15.baseImponible += nc.valorSinImpuestos;
                resumen.iva15.total += nc.importeTotal;
                if (tarifa === null) {
                    resumen.ambiguas.push({
                        numero: nc.numero || i + 1,
                        rucRazon: 'nota de crédito ' + (nc.comprobanteNo || nc.rucRazon || 'S/N'),
                        base: redondear(nc.valorSinImpuestos),
                        iva: redondear(nc.iva || 0),
                        motivo
                    });
                }
            }
        }
    });

    resumen.valorSinImpuestos = redondear(resumen.valorSinImpuestos);
    resumen.iva.total = redondear(resumen.iva.total);
    resumen.totalGeneral = redondear(resumen.totalGeneral);
    [resumen.iva0, resumen.iva5, resumen.iva15].forEach((b) => {
        b.baseImponible = redondear(b.baseImponible);
        b.total = redondear(b.total);
    });

    return resumen;
}

/**
 * Motor de Cálculo Técnico Elite (Reinforcement Engine)
 * Calcula 615 y 617 siguiendo las reglas técnicas del SRI cuando el sugerido no es detectable.
 */
