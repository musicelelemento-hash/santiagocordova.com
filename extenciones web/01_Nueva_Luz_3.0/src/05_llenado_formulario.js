async function calculateEliteFinancials(targetField) {
    console.group(`🧮 Elite Tax Engine: Refuerzo para ${targetField}`);
    
    // Insumos desde el DOM
    const impCausado   = await leerCampo('601'); // Impuesto Causado
    const credAnterior = await leerCampo('605'); // Saldo mes anterior
    const credEsteMes  = await leerCampo('602'); // Crédito tributario período
    const retAnterior  = await leerCampo('606'); // Retenciones mes anterior
    const retEsteMes   = await leerCampo('609'); // Retenciones este mes

    let result = 0;
    const totalCredito = (credAnterior || 0) + (credEsteMes || 0);
    const totalRetenciones = (retAnterior || 0) + (retEsteMes || 0);

    if (targetField === '564' || targetField === '565') {
        // Cálculo del Factor de Proporcionalidad (Art. 66 LRTI Ecuador)
        const ventas15 = (await leerCampo('411')) || (await leerCampo('401')) || 0;
        const ventas0 = ((await leerCampo('413')) || (await leerCampo('403')) || 0) +
                        ((await leerCampo('415')) || (await leerCampo('405')) || 0) +
                        ((await leerCampo('417')) || (await leerCampo('407')) || 0) +
                        ((await leerCampo('418')) || (await leerCampo('408')) || 0);
        const ivaCompras = (await leerCampo('520')) || (await leerCampo('539')) || 0;
        const totalVentas = ventas15 + ventas0;

        let factor = 1.0;
        if (totalVentas > 0) {
            factor = Math.min(1, Math.max(0, ventas15 / totalVentas));
        }
        console.log(`   💡 Proporcionalidad: Ventas15=$${ventas15}, Ventas0=$${ventas0}, Total=$${totalVentas} -> Factor=${factor.toFixed(4)}, IVA Compras=$${ivaCompras}`);

        const credito564 = Math.round((ivaCompras * factor) * 100) / 100;
        const gasto565 = Math.max(0, Math.round((ivaCompras - credito564) * 100) / 100);

        result = (targetField === '564') ? credito564 : gasto565;
        console.log(`   💡 Cálculo ${targetField}: 564=$${credito564}, 565=$${gasto565} (Suma=$${(credito564 + gasto565).toFixed(2)})`);
    } else if (targetField === '615') {
        // Crédito Tributario próximo mes: (Crédito Total) - (Lo usado para cubrir 601)
        result = Math.max(0, totalCredito - impCausado);
        console.log(`   💡 Cálculo 615: (${totalCredito}) - ${impCausado} = ${result}`);
    } else if (targetField === '617') {
        // Retenciones próximo mes: (Retenciones Total) - (Lo usado para cubrir el restante de 601 si el Crédito no alcanzó)
        const remanenteImpuesto = Math.max(0, impCausado - totalCredito);
        result = Math.max(0, totalRetenciones - remanenteImpuesto);
        console.log(`   💡 Cálculo 617: (${totalRetenciones}) - remanente(${remanenteImpuesto}) = ${result}`);
    }

    console.groupEnd();
    return result;
}


// ============================================
// AUTO-LLENAR FORMULARIO
// ============================================
// HELPER: CÁLCULO ELITE DE CRÉDITOS Y RETENCIONES (v10.0)
// ============================================



// ============================================

async function autoLlenarFormulario(data) {
    // Lo primero, antes de tocar un solo casillero.
    if (typeof frenarSiEsSustitutiva === 'function' && await frenarSiEsSustitutiva('antes de llenar')) return;

    console.group('🔥 SRI Llenado Maestro v9.0 ELITE');
    let total = 0;

    try {
        if (window.sriAssistant) window.sriAssistant.log('🚀 Iniciando Ejecución Total (Orquestada)...');
        await GhostMemory.set('workflowState', 'FILLING_FORM'); // Sincronía Popup


        // 1. VENTAS
        console.log('--- FASE 1: VENTAS ---');
        safeStatus('📊 Llenando Ventas...');
        total += await llenarVentas(data);
        await sleep(800);

        // 2. COMPRAS
        console.log('--- FASE 2: COMPRAS ---');
        safeStatus('🛍️ Llenando Compras...');
        total += await llenarCompras(data);
        await sleep(800);

        // 3. RETENCIONES / RESUMEN
        console.group('📋 Resumen Impositivo (Elite Engine)');
        safeStatus('💎 Aplicando Sugeridos y Retenciones...');
        total += await llenarRetenciones(data);
        await sleep(600);

        // FASE 4: RESUMEN IMPOSITIVO (Sugeridos + Refuerzo Técnico)
        // Primero los de RESUMEN —la sección que llenarRetenciones() acaba de
        // dejar abierta— y recién después los de COMPRAS. Al revés, como
        // estaba, el formulario abría COMPRAS, saltaba a RESUMEN y volvía.
        //
        // Se vuelve a pasar por 564/565 a propósito: llenar el 609 puede
        // cambiar el crédito que el SRI sugiere.
        const eliteFields = ['615', '617', '619', '564', '565'];
        for (const f of eliteFields) {
            // Aseguramos sección abierta
            if (['615', '617', '619'].includes(f)) await toggleSriSection('RESUMEN', true);
            else if (['564', '565'].includes(f)) await toggleSriSection('COMPRAS', true);

            const exito = await procesarCampoConSugerido(f);
            if (exito) {
                total++;
                await sleep(400);
            } else if (['564', '565', '615', '617'].includes(f)) {
                console.log(`📡 Refuerzo Técnico para campo ${f}...`);
                const technicalVal = await calculateEliteFinancials(f);
                if (technicalVal > 0) {
                    if (await llenarCampo(f, technicalVal)) total++;
                }
            }
        }
        console.groupEnd();

        // Limpieza Visual Final
        await toggleSriSection('COMPRAS', false);
        await toggleSriSection('RESUMEN', true); // Mantener resumen a la vista para el usuario

        // FASE 5: REPORTE FINAL ELITE
        if (window.sriAssistant) {
            await window.sriAssistant.showFinalReport(data, total);
            window.sriAssistant.log(`✅ Operación total finalizada: ${total} campos.`);
        }

        console.log(`🚀 RESULTADO FINAL: ${total} campos exitosos.`);
        return total;

    } catch (e) {
        console.error('Error en llenado maestro:', e);
        if (window.sriAssistant) window.sriAssistant.log('❌ Error: ' + e.message);
    } finally {
        if (window.sriAssistant) {
            window.sriAssistant.setWorking(false);
            window.sriAssistant.toggleMinimize(false);
        }
    }

    console.groupEnd();
    return total;
}

async function llenarVentas(data) {
    console.log('📋 Procesando VENTAS (Espejo de Columnas: Bruto -> Neto) ...');
    let camposLlenados = 0;

    // Expandir Sección Ventas (Sequential Visual)
    await toggleSriSection('Ventas', true);

    // Definir pares de casilleros ESENCIALES (Origen: Bruto -> Destino: Neto)
    const pares = [
        ['401', '411'], // Ventas tarifa diferente de 0
        ['402', '412'],
        ['425', '435'],
        ['403', '413'], // Ventas tarifa 0%
        ['404', '414'],
        ['405', '415'],
        ['406', '416'],
        ['407', '417'],
        ['408', '418'],
        ['431', '441'],
        ['434', '444']
    ];

    for (const [idOrigen, idDestino] of pares) {
        try {
            const valor = await leerCampo(idOrigen);
            if (valor > 0) {
                console.log(`   ➤ [Ventas] Origen ${idOrigen} ($${valor}) -> Destino ${idDestino}`);
                const exito = await llenarCampo(idDestino, valor);
                if (exito) camposLlenados++;
            }
        } catch (e) {
            console.warn(`   ⚠️ Error procesando par ${idOrigen}->${idDestino}:`, e);
        }
    }

    try {
        console.log('🔍 [Ventas] Extrayendo Valores Sugeridos de Ventas para las métricas...');
        const base15 = await leerCampo('401') || 0;
        const base0 = await leerCampo('403') || 0;
        const iva15 = await leerCampo('421') || (base15 * 0.15);
        
        await GhostMemory.set('ventasExtraidas', {
            base15,
            base0,
            iva15
        });
        console.log('✅ [Ventas] Valores de Ventas guardados en GhostMemory:', { base15, base0, iva15 });
    } catch(e) {
        console.warn('⚠️ [Ventas] Error extrayendo métricas de ventas:', e);
    }

    console.log(`📊 FINALIZADO VENTAS: ${camposLlenados} campos procesados.`);
    
    // Colapsar Sección Ventas (Sequential Visual)
    await toggleSriSection('Ventas', false);

    if (window.sriAssistant?.showEliteToast && camposLlenados > 0) {
        window.sriAssistant.showEliteToast({
            title: '✅ Ventas Llenadas',
            msg: `Se han espejado ${camposLlenados} casilleros de ventas.`
        });
    }

    return camposLlenados;
}

async function llenarCompras(data) {
    console.group('🛍️ Llenado de COMPRAS v2.0 (Zero-Touch Elite)');

    // Con qué criterio se reparte. Preguntado por el usuario el 07-sep-2026:
    // «no vi si clasifica por IVA o por actividad». No lo decía en ningún
    // lado, y una decisión sobre plata que no se explica no se puede auditar.
    console.log('   ⚖️ Criterio: se reparte por TARIFA — el cociente IVA/base de cada factura.');
    console.log('      15% → 500/510   ·   5% → 540/550   ·   0% → 507/517');
    console.log('      La ACTIVIDAD del proveedor y la del cliente todavía NO deciden nada: el ' +
                '502/512 (sin derecho a crédito) queda sin usar hasta que exista el mapa, que ' +
                'es criterio contable. Lo que se sabe de cada proveedor está en 🏷️, en el cajón 🧰.');
    let camposLlenados = 0;

    // Robusto: detectamos si nos pasan el objeto raíz o el de facturas
    const facturas = data.facturas || data;
    const notasCredito = data.notasCredito || null;

    if (!facturas || (!facturas.iva15 && !facturas.iva0)) {
        console.warn('⚠️ No hay datos de facturas válidos.');
        console.log('Datos recibidos:', JSON.stringify(data, null, 2));
        console.groupEnd();
        return 0;
    }

    console.log('📊 Datos de facturas detectados:');
    console.log('  - Tarifa plena (12/13/14/15%):', facturas.iva15);
    console.log('  - IVA 5%:', facturas.iva5);
    console.log('  - IVA 0%:', facturas.iva0);
    if (notasCredito) {
        console.log('📄 Notas de Crédito:');
        console.log('  - NC IVA 15%:', notasCredito.iva15);
        console.log('  - NC IVA 0%:', notasCredito.iva0);
    }

    // ─── PASO 1: Expandir Sección COMPRAS si está colapsada ───────────────────
    await toggleSriSection('COMPRAS', true);

    // ─── PASO 1.2: Notas de venta (casilleros 508 y 117) ─────────────────────
    // Son comprobantes FÍSICOS: no están en «comprobantes electrónicos
    // recibidos» y el bot no tiene de dónde sacarlos. El dato lo tiene el
    // contador. Si no lo da, NO se escribe nada: un cero inventado acá es una
    // declaración mal hecha.
    //
    // Se pregunta ACÁ, apenas se abre COMPRAS, y no al final del llenado.
    // Pedido del usuario el 06-sep-2026: la pregunta llega cuando la sección
    // está en pantalla, que es cuando quien mira puede contestarla mirando el
    // formulario. Preguntarlo al final, con todo lleno, era preguntar tarde.
    let nvPendiente = null;
    if (typeof NotasDeVenta !== 'undefined') {
        try {
            const rucNv = typeof rucDelClienteActual === 'function' ? await rucDelClienteActual() : '';
            const st = await SafeStorage.get(['workflowPeriod', 'pending_sri_autofill']);
            const wp = st.workflowPeriod;
            const periodoNv = wp
                ? `${wp.year}-${String((wp.monthIndex || 0) + 1).padStart(2, '0')}`
                : '';

            if (rucNv && periodoNv) {
                let nv = await NotasDeVenta.saber(rucNv, periodoNv);
                if (!nv) {
                    if (await NotasDeVenta.debePreguntar(rucNv)) {
                        // Con temporizador: si nadie contesta, el lote sigue.
                        nv = await NotasDeVenta.preguntar(
                            rucNv, (st.pending_sri_autofill || {}).name, periodoNv);
                    } else {
                        // Y se DICE por qué no se preguntó. Una ausencia callada
                        // es indistinguible de una falla, y fue justo lo que
                        // pasó: «tampoco vi la sugerencia».
                        const enc = await NotasDeVenta.estaEncendido();
                        console.log(enc
                            ? '📒 Paso 1.2: a este contribuyente no se le pregunta por notas de venta ' +
                              '(tres períodos seguidos en cero). Se lo despierta con sriNotasDeVentaPreguntar("RUC").'
                            : '📒 Paso 1.2: no se pregunta por notas de venta porque el interruptor 📒 está APAGADO. ' +
                              'Está en el cajón 🧰 de la barra, rotulado «Notas de venta».');
                    }
                }
                nvPendiente = nv;
            }
        } catch (e) {
            // Preguntar por las notas de venta nunca puede tumbar el llenado.
            console.warn('📒 [NOTAS DE VENTA] No se pudo preguntar:', e.message);
        }
    }

    // ─── PASO 1.5: Número de Comprobantes (Casillero 115) ───────────────────
    const docsCount = facturas.totalFacturas || facturas.recibidosCount || 0;
    if (docsCount > 0) {
        console.log(`  📝 Casillero 115 (No. Comprobantes) = ${docsCount}`);
        // El usuario mencionó que el ID es concepto256 en su inspección, pero el casillero es 115
        if (await llenarCampo('115', docsCount)) {
            camposLlenados++;
            await sleep(600);
        }
    }


    // ─── PASO 2: Compras con IVA (casilleros 500 y 510) ──────────────────────
    console.log('\n🔍 Paso 2: Compras con IVA (15%)...');
    const base15 = parseDecimal(facturas.iva15?.baseImponible || 0);
    const nc15 = parseDecimal(notasCredito?.iva15?.baseImponible || 0);

    if (base15 > 0 || nc15 > 0) {
        console.log(`  Base Imponible 15%: $${base15.toFixed(2)} | NC: $${nc15.toFixed(2)}`);

        console.log('  📝 Casillero 500 (Compras 15% - Bruto)...');
        if (await llenarCampo('500', base15)) {
            camposLlenados++;
            console.log('  ⏳ Pausa para recálculo SRI tras 500...');
            await sleep(1500);
        }

        const valor510 = Math.max(0, base15 - nc15);
        console.log(`  📝 Casillero 510 = $${base15.toFixed(2)} - $${nc15.toFixed(2)} (NC) = $${valor510.toFixed(2)}`);
        if (await llenarCampo('510', valor510)) camposLlenados++;
        await sleep(800);

        // ─── ELITE v13.2: Notas de Crédito por compensar (15% -> 544) ─────────
        const valor544 = Math.max(0, nc15 - base15);
        if (valor544 > 0) {
            console.log(`  📝 [NC SURPLUS] Casillero 544 (Compensación 15%): $${valor544.toFixed(2)} (NC:$${nc15.toFixed(2)} > Base:$${base15.toFixed(2)})`);
            if (await llenarCampo('544', valor544)) camposLlenados++;
            await sleep(600);
        }
    } else {
        console.log('  ℹ️ Sin compras ni NC con IVA (15%).');
    }

    // ─── PASO 2.5: Compras al 5% (casilleros 540 y 550) ──────────────────────
    // El 5% tiene derecho a crédito tributario, pero en SUS casilleros. Hasta
    // acá caía en el 500 junto con el 15%, y como el SRI calcula el 520
    // (impuesto generado en compras) a partir del 510, eso inflaba el crédito:
    // el contribuyente terminaba pagando de menos con la firma del contador.
    const base5 = parseDecimal(facturas.iva5?.baseImponible || 0);
    const nc5 = parseDecimal(notasCredito?.iva5?.baseImponible || 0);
    const sinUbicar = [];

    if (base5 > 0 || nc5 > 0) {
        console.log(`\n🔍 Paso 2.5: Compras al 5%... Base $${base5.toFixed(2)} | NC $${nc5.toFixed(2)}`);

        // Los ids reales del 540 y el 550 no están en la Matriz Tatuada: se
        // buscan por el número de casillero, que es el camino que ya usa el
        // resto del formulario. Si no aparecen NO se inventa un destino ni se
        // los manda al 500: se anota y el cierre mágico frena el envío.
        console.log('  📝 Casillero 540 (Compras 5% - Bruto)...');
        const input540 = await encontrarInputPorCasillero('540');
        if (await llenarCampo('540', base5, input540)) {
            camposLlenados++;
            console.log('  ⏳ Pausa para recálculo SRI tras 540...');
            await sleep(1500);

            const valor550 = Math.max(0, base5 - nc5);
            console.log(`  📝 Casillero 550 = $${base5.toFixed(2)} - $${nc5.toFixed(2)} (NC) = $${valor550.toFixed(2)}`);

            let ok550 = await llenarCampo('550', valor550);

            // El 550 vive en la misma fila que el 540, a su derecha. Si el
            // buscador por número no dio con él —pasó el 07-sep-2026, y dejó
            // el bruto cargado y el neto vacío, que es PEOR que no haber
            // cargado nada— se lo rescata por vecindad.
            //
            // La referencia se vuelve a pedir ACÁ y no se reusa la de arriba:
            // cuando se buscó el 540 la sección todavía estaba colapsada («540
            // encontrado pero OCULTO»), así que aquel elemento no tenía
            // tamaño y no servía para medir nada.
            const ref540 = (await encontrarInputPorCasillero('540')) || input540;
            if (!ok550 && ref540) {
                const vecino = vecinoDeFila(ref540);
                if (vecino) {
                    console.log(`  🔎 El 550 no salió por número; se toma el vecino de fila del 540: id=${vecino.id || '(sin id)'}`);
                    ok550 = await llenarCampo('550', valor550, vecino);
                } else {
                    console.warn('  ⚠️ El 550 tampoco salió por vecindad. Se anota y NO se envía.');
                }
            }

            if (ok550) camposLlenados++;
            else sinUbicar.push('no se encontró el casillero 550 (neto 5%): el bruto quedó cargado y el neto no');
            await sleep(800);
        } else {
            sinUbicar.push(`no se encontró el casillero 540: $${base5.toFixed(2)} de compras al 5% quedaron sin declarar`);
        }
    }

    // ─── PASO 3: Compras sin IVA (casilleros 507 y 517) ──────────────────────
    console.log('\n🔍 Paso 3: Compras sin IVA (0%)...');
    const base0 = parseDecimal(facturas.iva0?.baseImponible || 0);
    const nc0 = parseDecimal(notasCredito?.iva0?.baseImponible || 0);

    if (base0 > 0 || nc0 > 0) {
        console.log(`  Base Imponible 0%: $${base0.toFixed(2)} | NC: $${nc0.toFixed(2)}`);

        console.log('  📝 Casillero 507 (Compras 0% - Bruto)...');
        if (await llenarCampo('507', base0)) camposLlenados++;
        await sleep(800);

        const valor517 = Math.max(0, base0 - nc0);
        console.log(`  📝 Casillero 517 = $${base0.toFixed(2)} - $${nc0.toFixed(2)} (NC) = $${valor517.toFixed(2)}`);
        if (await llenarCampo('517', valor517)) camposLlenados++;
        await sleep(800);

        // ─── ELITE v13.2: Notas de Crédito por compensar (0% -> 543) ──────────
        const valor543 = Math.max(0, nc0 - base0);
        if (valor543 > 0) {
            console.log(`  📝 [NC SURPLUS] Casillero 543 (Compensación 0%): $${valor543.toFixed(2)} (NC:$${nc0.toFixed(2)} > Base:$${base0.toFixed(2)})`);
            if (await llenarCampo('543', valor543)) camposLlenados++;
            await sleep(600);
        }
    } else {
        console.log('  ℹ️ Sin compras ni NC tarifa 0%.');
    }

    // ─── PASO 3.5: Notas de venta: escribir lo que se preguntó al abrir ──────
    // La PREGUNTA se hizo en el paso 1.2, con la sección recién abierta. Acá
    // sólo se escribe, y en el orden en que el formulario lista los casilleros.
    if (nvPendiente && (nvPendiente.monto > 0 || nvPendiente.cantidad > 0)) {
        console.log(`
📒 Paso 3.5: Notas de venta · $${nvPendiente.monto.toFixed(2)} en ${nvPendiente.cantidad} comprobante(s)...`);
        // Los id del 508 y el 117 no están en la Matriz Tatuada: se buscan por
        // número. Si no aparecen, la plata NO se manda a otro casillero — se
        // anota y el cierre mágico frena.
        if (nvPendiente.monto > 0) {
            const input508 = await encontrarInputPorCasillero('508');
            if (await llenarCampo('508', nvPendiente.monto, input508)) { camposLlenados++; await sleep(900); }
            else sinUbicar.push(`no se encontró el casillero 508: $${nvPendiente.monto.toFixed(2)} de notas de venta quedaron sin declarar`);

            // El 518 es el NETO del 508: «menos las notas de crédito», dicho
            // por el usuario el 07-sep-2026. Quedaba vacío con el 508 lleno —
            // el mismo error que el 550, y el crédito tributario sale del
            // neto, no del bruto.
            const ncNv = Number(nvPendiente.nc) || 0;
            const valor518 = Math.max(0, nvPendiente.monto - ncNv);
            console.log(`  📝 Casillero 518 = $${nvPendiente.monto.toFixed(2)} - $${ncNv.toFixed(2)} (NC) = $${valor518.toFixed(2)}`);

            let ok518 = await llenarCampo('518', valor518);
            // Y si no sale por número, es el vecino de fila del 508. Misma
            // lección que el 550, incluida la de pedir la referencia de nuevo:
            // un elemento que se buscó con la sección colapsada no tiene
            // tamaño y no sirve para medir.
            const ref508 = (await encontrarInputPorCasillero('508')) || input508;
            if (!ok518 && ref508) {
                const vecino = vecinoDeFila(ref508);
                if (vecino) {
                    console.log(`  🔎 El 518 no salió por número; se toma el vecino de fila del 508: id=${vecino.id || '(sin id)'}`);
                    ok518 = await llenarCampo('518', valor518, vecino);
                }
            }
            if (ok518) camposLlenados++;
            else sinUbicar.push('no se encontró el casillero 518 (neto de notas de venta): el bruto quedó cargado y el neto no');
            await sleep(700);
        }
        if (nvPendiente.cantidad > 0) {
            if (await llenarCampo('117', nvPendiente.cantidad)) { camposLlenados++; await sleep(600); }
            else sinUbicar.push('no se encontró el casillero 117: la cantidad de notas de venta quedó sin declarar');
        }
    } else if (nvPendiente) {
        console.log('📒 Paso 3.5: el contador dijo que este período no tiene notas de venta. No se toca el 508 ni el 117.');
    }

    // ─── PASO 4: Valores Sugeridos (564 y 565) ───────────────────────────────
    console.log('\n🔍 Paso 4: Valores sugeridos (564 y 565)...');
    try {
        const sugeridos = await llenarValorSugerido();
        camposLlenados += sugeridos;
        console.log(`  ✅ ${sugeridos} valor(es) sugerido(s) llenados.`);
    } catch (e) {
        console.error('  ❌ Error capturando sugeridos:', e);
    }

    if (window.sriAssistant?.showEliteToast && camposLlenados > 0) {
        window.sriAssistant.showEliteToast({
            title: '✅ Compras Llenadas',
            msg: `Casilleros 500/510/507/517/564/565 procesados (${camposLlenados} campos).`
        });
    }

    // Constancia de lo que no encontró casillero. La lee el cierre mágico
    // antes de enviar: una declaración con plata mal repartida entre casilleros
    // de IVA cambia el crédito tributario, así que no se manda a ciegas.
    if (typeof anotarIvaSinUbicar === 'function') {
        const ambiguas = [].concat(
            Array.isArray(facturas.ambiguas) ? facturas.ambiguas : [],
            Array.isArray(notasCredito?.ambiguas) ? notasCredito.ambiguas : []
        );
        await anotarIvaSinUbicar(sinUbicar, ambiguas);
    }

    console.group('\n📊 RESUMEN COMPRAS: ' + camposLlenados + ' campos llenados.');
    console.groupEnd();
    
    // Colapsar para que el usuario vea la siguiente sección
    await toggleSriSection('COMPRAS', false);
    
    return camposLlenados;
}

async function llenarRetenciones(data) {
    console.log('📋 Procesando RETENCIONES ...');
    let camposLlenados = 0;
    const { retenciones } = data;

    if (!retenciones) return 0;

    // Expandir Sección Resumen/Retenciones
    await toggleSriSection('RESUMEN', true);

    // 1. IVA Retenido (Casillero 609)
    if (retenciones.ivaRetenido && retenciones.ivaRetenido.total > 0) {
        console.log(`💎 IVA Retenido: ${retenciones.ivaRetenido.total}`);
        if (await llenarCampo('609', retenciones.ivaRetenido.total)) {
            camposLlenados++;
            console.log('   ✅ Campo 609 (Retenciones IVA) llenado.');
        }
    }

    // 2. RENTA Retenida (¡ELITE FIX: NO INYECTAR EN IVA!)
    if (retenciones.rentaRetenida && retenciones.rentaRetenida.total > 0) {
        console.log(`💡 Info: Retención de Renta ($${retenciones.rentaRetenida.total}) detectada. Ignorada para formulario de IVA mensual.`);
    }

    // No colapsamos aquí porque luego suelen venir los sugeridos en la misma sección (Resumen)
    // Pero actualizamos estado
    safeStatus('📋 Validando Sugeridos...');
    return camposLlenados;
}

async function llenarValorSugerido() {
    console.log('📋 Procesando Valores Sugeridos en COMPRAS (564, 565)...');

    // Paso clave: Forzar el recálculo del backend SRI (AJAX PrimeFaces).
    // Al hacer blur del foco activo y un click en body, PrimeFaces
    // dispara el onblur de los campos de compras y actualiza los campos .sugerido.
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT')) {
        activeElement.blur();
    }
    document.body.click();

    // Pausa de estabilidad: dar tiempo al SRI para calcular los sugeridos
    console.log('⏳ Esperando recálculo SRI para valores sugeridos (1.5s)...');
    await sleep(1500);

    let totalLlenados = 0;

    // Campo 564 (IVA en compras / Crédito Tributario del período)
    console.log('🔍 Procesando campo sugerido → 564...');
    if (await procesarCampoConSugerido('564')) {
        totalLlenados++;
        console.log('✅ Campo 564 llenado con valor sugerido.');
        await sleep(600);
    } else {
        console.log('ℹ️ Campo 564: sin sugerido en DOM, aplicando Refuerzo Técnico...');
        const val564 = await calculateEliteFinancials('564');
        if (val564 > 0 && await llenarCampo('564', val564)) {
            totalLlenados++;
            console.log(`✅ Campo 564 llenado con Refuerzo Técnico ($${val564}).`);
        }
    }

    // Campo 565 (Gasto sin crédito tributario / Factor de Proporcionalidad)
    console.log('🔍 Procesando campo sugerido → 565...');
    if (await procesarCampoConSugerido('565')) {
        totalLlenados++;
        console.log('✅ Campo 565 llenado con valor sugerido.');
    } else {
        console.log('ℹ️ Campo 565: sin sugerido en DOM, aplicando Refuerzo Técnico...');
        const val565 = await calculateEliteFinancials('565');
        if (val565 > 0 && await llenarCampo('565', val565)) {
            totalLlenados++;
            console.log(`✅ Campo 565 llenado con Refuerzo Técnico ($${val565}).`);
        }
    }

    return totalLlenados;
}

// Función robusta que encapsula la espera, detección y pegado de un valor sugerido.
// Estrategia 0: Mapa directo de IDs .sugerido confirmados por el usuario.
// Estrategia A: XPath por fila del casillero.
// Estrategia B: Detección por proximidad visual (original).
async function procesarCampoConSugerido(casillero) {
    console.log(`🔍 [Sugerido] Procesando casillero ${casillero}...`);
    await sleep(400);

    const sugeridoMap = {
        '564': ['concepto2130.sugerido'],
        '565': ['concepto1276.sugerido', 'concepto2140.sugerido'],
        '615': ['concepto2220.sugerido'],
        '617': ['concepto2230.sugerido'],
        '619': ['concepto2240.sugerido'],
    };

    // ── ESTRATEGIA 0: Mapa directo de IDs .sugerido confirmados ───────────────────
    const possibleIds = sugeridoMap[casillero] || [];
    for (const id of possibleIds) {
        const input = document.getElementById(id);
        if (input) {
            // Sin `|| '0'`: una caja vacía tiene que poder distinguirse de un
            // cero escrito por el SRI. parseImporteEstricto devuelve null.
            const rawVal = input.value || input.getAttribute('value') || input.innerText || '';
            const parsed = parseImporteEstricto(rawVal);

            if (parsed === null) {
                // La caja existe pero no dice nada. Eso NO es un sugerido: se
                // deja pasar al Refuerzo Técnico en vez de fingir un 0 oficial.
                console.log(`  [${casillero}] ⬜ El campo sugerido (${id}) está vacío. No hay sugerido del SRI.`);
                continue;
            }
            console.log(`  [${casillero}] 📍 SugeridoMap detectado por ID (${id}) = ${parsed} (raw: "${rawVal}")`);

            if (parsed > 0) {
                console.log(`  [${casillero}] ✏️ Aplicando sugerido SRI positivo ${parsed}...`);
                const ok = await llenarCampo(casillero, parsed);
                if (ok) return true;

                const inputEditable = await encontrarInputPorCasillero(casillero);
                if (inputEditable) {
                    inputEditable.focus();
                    inputEditable.select();
                    const ins = document.execCommand('insertText', false, parsed.toFixed(2));
                    if (!ins) inputEditable.value = parsed.toFixed(2);
                    ['input', 'change', 'blur'].forEach(ev =>
                        inputEditable.dispatchEvent(new Event(ev, { bubbles: true }))
                    );
                    return true;
                }
            } else {
                console.log(`  [${casillero}] ℹ️ El valor sugerido SRI oficial por ID (${id}) es 0.00. Se respeta en 0.`);
                return true; // El SRI indica 0.00 oficialmente. Lo consideramos manejado para no usar fallbacks.
            }
        }
    }

    // ── ESTRATEGIA 1: Buscar en la fila TR del casillero por la clase .sugerido ──
    const inputEditable = await encontrarInputPorCasillero(casillero);
    if (inputEditable) {
        const row = inputEditable.closest('tr');
        if (row) {
            const sugEl = row.querySelector('.sugerido, input[id*="sugerido"], span[id*="sugerido"]');
            if (sugEl) {
                const rawVal = sugEl.value || sugEl.getAttribute('value') || sugEl.innerText || '';
                const parsed = parseImporteEstricto(rawVal);

                // null = la caja está ahí pero vacía. Eso no es un sugerido:
                // se sigue buscando por las otras estrategias.
                if (parsed === null) {
                    console.log(`  [${casillero}] ⬜ El sugerido de la fila está vacío. No hay sugerido del SRI.`);
                } else if (parsed > 0) {
                    console.log(`  [${casillero}] 📍 Sugerido de fila (${sugEl.id || sugEl.className}) = ${parsed}. Aplicando...`);
                    const ok = await llenarCampo(casillero, parsed);
                    if (ok) return true;
                } else {
                    console.log(`  [${casillero}] ℹ️ El valor sugerido SRI en la fila es 0.00. Se respeta en 0.`);
                    return true; // El SRI indica 0.00 en el DOM de la fila. Lo consideramos manejado.
                }
            }
        }
    }

    // ── ESTRATEGIA A: XPath → fila → sugerido + editable ────────────────────────
    const xpaths = [
        `//td[contains(.,'${casillero}')]/ancestor::tr[1]`,
        `//span[contains(.,'${casillero}')]/ancestor::tr[1]`,
        `//label[contains(.,'${casillero}')]/ancestor::tr[1]`,
        `//*[normalize-space(text())='${casillero}']/ancestor::tr[1]`
    ];

    for (const xpath of xpaths) {
        try {
            const row = document.evaluate(
                xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            ).singleNodeValue;
            if (!row) continue;

            const sugeridoInput = row.querySelector(
                'input.sugerido, input[id*="sugerido"][readonly], input[readonly][style*="0000FF"]'
            );
            if (sugeridoInput) {
                // Sin `|| '0'`: vacío tiene que poder distinguirse de un cero
                // escrito por el SRI. parseImporteEstricto devuelve null.
                const val = parseImporteEstricto(sugeridoInput.value);
                if (val === null) {
                    console.log(`  [${casillero}] ⬜ El sugerido XPath (${sugeridoInput.id}) está vacío. No hay sugerido del SRI.`);
                    continue;
                }
                console.log(`  [${casillero}] XPath sugerido: ${sugeridoInput.id} = ${val}`);
                if (val > 0) {
                    const ok = await llenarCampo(casillero, val);
                    if (ok) return true;
                } else {
                    console.log(`  [${casillero}] ℹ️ Valor sugerido XPath es 0.00. Se respeta en 0.`);
                    return true;
                }
            }
        } catch (e) {
            console.warn(`  XPath error para casillero ${casillero}:`, e.message);
        }
    }

    // ── ESTRATEGIA B: Fallback por proximidad visual (solo si no hay ningún elemento .sugerido) ──
    console.log(`  [${casillero}] Fallback: detección por proximidad visual...`);
    let resultado = { found: false, value: 0 };

    for (let i = 0; i < 5; i++) {
        const input = await encontrarInputPorCasillero(casillero);
        if (!input) { await sleep(300); continue; }

        resultado = await detectarValorSugeridoEnDOM(casillero, input);
        if (resultado.found && resultado.value > 0) {
            console.log(`  ✨ [${casillero}] Detectado por proximidad: ${resultado.value}`);
            break;
        }
        await sleep(300);
    }

    if (resultado.found && resultado.value > 0) {
        return await llenarCampo(casillero, resultado.value);
    }

    console.log(`ℹ️ Sin valor sugerido positivo para ${casillero}. Se mantiene en 0.00.`);
    return false;
}

// Eliminar definición duplicada (consolidada más abajo)

/**
 * Helper Elite: Expande o Colapsa una sección del formulario SRI con visibilidad secuencial.
 * @param {string} sectionName - 'VENTAS', 'COMPRAS', 'RESUMEN'
 * @param {boolean} expand - true para abrir, false para cerrar
 */
async function toggleSriSection(sectionName, expand = true) {
    const idMap = {
        'VENTAS': 'seccionVentas',
        'COMPRAS': 'seccionAdquisiciones',
        'RESUMEN': 'seccionResumenImpositivo'
    };
    
    const target = idMap[sectionName.toUpperCase()];
    const header = document.querySelector(`[id*="${target}"] .ui-accordion-header`) || 
                 Array.from(document.querySelectorAll('.ui-accordion-header')).find(el => {
                     const txt = el.textContent.toUpperCase();
                     return txt.includes(sectionName.toUpperCase()) || (sectionName === 'COMPRAS' && txt.includes('ADQUISICIONES'));
                 });

    if (!header) return console.warn(`⚠️ No se encontró la sección ${sectionName}`);

    // ELITE FIX: Verificar estado real de forma más robusta (Header + Contenedor)
    const container = document.querySelector(`[id*="${target}"]:not(.ui-accordion-header)`);
    const isExpanded = header.getAttribute('aria-expanded') === 'true' || 
                      header.classList.contains('ui-state-active') || 
                      (container && container.style.display !== 'none' && container.offsetHeight > 0);
    
    if (expand && !isExpanded) {
        console.log(`🔓 [ELITE] Expandiendo sección: ${sectionName}`);
        header.click();
        await sleep(1500); // Aumentado para estabilidad del DOM
    } else if (!expand && isExpanded) {
        console.log(`🔒 [ELITE] Colapsando sección: ${sectionName}`);
        header.click();
        await sleep(600);
    } else {
        console.log(`ℹ️ [ELITE] Sección ${sectionName} ya está en el estado deseado (${expand ? 'Expandido' : 'Colapsado'}).`);
    }
}

/**
 * @param {string} casillero Número de casillero, para los mensajes.
 * @param {number} valor
 * @param {HTMLInputElement} [inputDado] Una casilla ya localizada por otro
 *   camino — por ejemplo el vecino de fila. Cuando viene, no se busca nada.
 */
async function llenarCampo(casillero, valor, inputDado) {
    let input = inputDado || await encontrarInputPorCasillero(casillero);
    if (!input) {
        input = document.querySelector(`input[id$=":${casillero}"]`) ||
            document.querySelector(`input[name$=":${casillero}"]`) ||
            document.querySelector(`input[id*="concepto${casillero}"]`) ||
            document.querySelector(`input[id*="casillero${casillero}"]`);
    }

    if (!input) {
        console.warn(`🚫 Casillero ${casillero} NO ENCONTRADO en el DOM.`);
        return false;
    }

    // --- ELITE FIX: Auto-expandir si el elemento está oculto ---
    if (typeof esVisible === 'function' ? !esVisible(input) : input.offsetParent === null) {
        console.log(`🔍 Casillero ${casillero} encontrado pero OCULTO. Intentando expandir sección...`);
        const parentSection = input.closest('.ui-accordion-content') || input.closest('fieldset') || input.closest('div[id*="seccion"]');
        if (parentSection) {
            const header = parentSection.previousElementSibling || document.querySelector(`a[aria-controls="${parentSection.id}"]`);
            if (header) {
                console.log('📂 Click en cabecera para mostrar campo...');
                header.click();
                await sleep(800);
            }
        }
    }

    if (input.disabled || input.readOnly) {
        console.warn(`🚫 Casillero ${casillero} está BLOQUEADO (disabled: ${input.disabled}, readOnly: ${input.readOnly}).`);
        return false;
    }

    const valorFormateado = parseFloat(valor).toFixed(2);

    try {
        input.focus();
        const rect = input.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
            input.scrollIntoView({ behavior: 'auto', block: 'center' });
        }

        input.select();
        const ok = document.execCommand('insertText', false, valorFormateado);
        if (!ok) {
            input.value = valorFormateado;
        }

        ['input', 'change', 'blur'].forEach(e => input.dispatchEvent(new Event(e, { bubbles: true })));

        // Verificación y re-intento si es necesario
        await sleep(300);
        const esperado = parseDecimal(valorFormateado);
        if (parseDecimal(input.value) !== esperado) {
            input.value = valorFormateado;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(150);
        }

        // Se comprueba el reintento. Antes no se comprobaba: la función decía
        // ✅ y devolvía true aunque el casillero hubiera quedado vacío, y
        // quien la llamó seguía adelante creyendo que estaba lleno. Con eso
        // la declaración podía enviarse con un casillero sin llenar y sin
        // nada raro en la consola.
        const quedo = parseDecimal(input.value);
        if (quedo !== esperado) {
            console.error(`❌ ${casillero}: pedí ${valorFormateado} y quedó "${input.value}". El casillero NO se llenó.`);
            if (typeof anotarBitacora === 'function') {
                await anotarBitacora('casillero sin llenar', `${casillero} · esperaba ${valorFormateado}`);
            }
            return false;
        }

        console.log(`✅ ${casillero}: ${valorFormateado}`);
        return true;
    } catch (e) {
        console.error(`❌ Error en ${casillero}:`, e);
        return false;
    }
}

async function leerCampo(casillero) {
    console.log(`   🔍 Leyendo casillero ${casillero}...`);

    // 1. PRIORIDAD: Buscar en la tabla usando XPath EXACTO (para campos calculados como 401, 403)
    // IMPORTANTE: NO usar starts-with() — causa falsos positivos entre casilleros vecinos (ej. 401 vs 403)
    const xpaths = [
        `//td[normalize-space(text())='${casillero}']/following-sibling::td[1]`,          // Exacto en td
        `//span[normalize-space(text())='${casillero}']/ancestor::td/following-sibling::td[1]`, // Exacto en span
        `//label[normalize-space(text())='${casillero}']/ancestor::td/following-sibling::td[1]` // Exacto en label
    ];

    for (const xpath of xpaths) {
        try {
            const resultado = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const celda = resultado.singleNodeValue;

            if (celda) {
                // Buscar SOLO inputs visibles (type=text) — ignorar hidden de PrimeFaces
                const inputInterno = celda.querySelector('input[type="text"]') || celda.querySelector('input:not([type="hidden"])');

                if (inputInterno) {
                    // SIEMPRE usar el valor del input cuando existe — evita concatenación de textContent
                    const valorInput = parseDecimal(inputInterno.value);
                    console.log(`   📖 Casillero ${casillero} (XPath+Input[text]) = ${valorInput}`);
                    return valorInput;
                } else {
                    // Solo usar textContent si la celda NO tiene input (celda de solo lectura)
                    // Usamos el primer nodo de texto directo para evitar concatenación de hijos
                    let textoDirecto = '';
                    for (const nodo of celda.childNodes) {
                        if (nodo.nodeType === Node.TEXT_NODE && nodo.textContent.trim()) {
                            textoDirecto = nodo.textContent.trim();
                            break;
                        }
                    }
                    const valorTexto = textoDirecto ? parseDecimal(textoDirecto) : parseDecimal(celda.textContent.trim());
                    console.log(`   📖 Casillero ${casillero} (XPath Texto) = ${valorTexto}`);
                    return valorTexto;
                }
            }
        } catch (e) { }
    }

    // 2. FALLBACK: Intentar encontrar como Input directo
    let input = await encontrarInputPorCasillero(casillero);
    if (input) {
        const valorTexto = input.value || '0';
        const valorNumerico = parseDecimal(valorTexto);

        // Si el input tiene un valor válido > 0, usarlo
        if (valorNumerico > 0) {
            console.log(`   📖 Casillero ${casillero} (Input) = ${valorTexto}`);
            return valorNumerico;
        }

        // Si el input está en 0, buscar el valor en elementos de texto cercanos
        const parent = input.closest('td') || input.parentElement;
        if (parent) {
            const spans = parent.querySelectorAll('span, label, div');
            for (const span of spans) {
                const texto = span.textContent.trim();
                if (texto.match(/[\d\.,]+/) && !texto.includes(casillero)) {
                    const valorSpan = parseDecimal(texto);
                    if (valorSpan > 0) {
                        console.log(`   📖 Casillero ${casillero} (Span cerca de Input) = ${texto}`);
                        return valorSpan;
                    }
                }
            }
        }

        console.log(`   📖 Casillero ${casillero} (Input) = ${valorTexto}`);
        return valorNumerico;
    }

    console.warn(`   ⚠️ No se encontró campo ni valor para casillero ${casillero}`);
    return 0;
}

/**
 * Lista TODOS los casilleros que el formulario tiene de verdad, con su `id`
 * real, su rótulo y su valor.
 *
 * Existe por una razón concreta: el 540 y el 550 (compras al 5%) no aparecen
 * en el formulario, y nadie sabe si es porque no existen, porque se llaman
 * distinto o porque el portal solo los muestra en ciertos períodos. Suponer
 * un número de casillero es exactamente lo que la §5b prohíbe.
 *
 * Se corre desde la consola, parado en el formulario:
 *
 *     sriMapaCasilleros()            → tabla en consola
 *     sriMapaCasilleros({copiar:true}) → además lo deja en el portapapeles
 *     sriMapaCasilleros({desde:500, hasta:599})
 *
 * @returns {Array<{casillero: string, id: string, rotulo: string, valor: string, editable: boolean}>}
 */
function sriMapaCasilleros(opciones = {}) {
    const { desde = 0, hasta = 9999, copiar = false } = opciones;
    const mapa = [];
    const vistos = new Set();

    const propio = (el) => (typeof esDeLaExtension === 'function' && esDeLaExtension(el));
    const soloNumero = (t) => /^\s*\d{3}\s*$/.test(t || '');
    const limpio = (el) => ((el && el.textContent) || '').trim();

    const anotar = (casillero, input, rotulo, via) => {
        if (!input || propio(input)) return;
        const n = Number(casillero);
        if (!(n >= desde && n <= hasta)) return;
        const clave = casillero + '|' + (input.id || '');
        if (vistos.has(clave)) return;
        vistos.add(clave);
        mapa.push({
            casillero,
            id: input.id || '(sin id)',
            rotulo: (rotulo || '').replace(/\s+/g, ' ').trim().slice(0, 110),
            valor: input.value,
            editable: input.type === 'text' && !input.readOnly && !input.disabled,
            via
        });
    };

    const entradas = Array.from(document.querySelectorAll('input[type="text"], input[type="hidden"]'))
        .filter((el) => !propio(el));

    // ── Estrategia 1 · el número y el input en la misma fila ────────────────
    // Es el caso simple, y era el ÚNICO que había. Falla cuando el portal anida
    // una tabla por celda: closest('tr') devuelve la fila interna, sin número.
    entradas.forEach((input) => {
        const fila = input.closest('tr');
        if (!fila) return;
        const celdas = Array.from(fila.querySelectorAll('td, th'));
        const celdaNum = celdas.find((c) => soloNumero(c.textContent));
        if (!celdaNum) return;
        const casillero = limpio(celdaNum);
        const rotulo = celdas.map(limpio).filter((t) => t && t !== casillero)
            .sort((a, b) => b.length - a.length)[0] || '';
        anotar(casillero, input, rotulo, 'fila');
    });

    // ── Estrategia 2 · desde el rótulo hacia el input ───────────────────────
    // El mismo camino que ya usa encontrarInputPorCasillero(): una celda cuyo
    // texto es sólo el número, y el input en la celda de al lado. Funciona
    // aunque el input viva dentro de una tabla anidada.
    document.querySelectorAll('td, th, span, label').forEach((et) => {
        if (propio(et) || !soloNumero(et.textContent)) return;
        const casillero = limpio(et);
        const celda = et.closest('td, th');
        if (!celda) return;
        let cursor = celda.nextElementSibling;
        for (let salto = 0; cursor && salto < 3; salto++, cursor = cursor.nextElementSibling) {
            const input = cursor.querySelector('input[type="text"], input[type="hidden"]');
            if (input) {
                const fila = celda.closest('tr');
                const rotulo = fila
                    ? Array.from(fila.querySelectorAll('td, th')).map(limpio)
                        .filter((t) => t && t !== casillero).sort((a, b) => b.length - a.length)[0] || ''
                    : '';
                anotar(casillero, input, rotulo, 'rótulo');
                break;
            }
        }
    });

    // ── Estrategia 3 · por el id, que en el SRI es `conceptoNNNN` ───────────
    // Último recurso, y el más valioso cuando las otras dos no encuentran nada:
    // devuelve los ids REALES aunque no se sepa a qué casillero corresponden.
    // Un id sin número sigue siendo evidencia; «no hay nada» no lo es.
    // Pedir un rango es preguntar por casilleros NUMERADOS: si alguien pide
    // 507-510, no puede recibir además los que no tienen número.
    const rangoCompleto = desde === 0 && hasta === 9999;
    entradas.forEach((input) => {
        if (!rangoCompleto) return;
        if (!/concepto\d+/i.test(input.id || '')) return;
        if (Array.from(vistos).some((k) => k.endsWith('|' + input.id))) return;
        const fila = input.closest('tr');
        const rotulo = fila ? limpio(fila).slice(0, 110) : '';
        // Sin número de casillero conocido: se marca como tal, no se inventa.
        const clave = '???|' + input.id;
        if (vistos.has(clave)) return;
        vistos.add(clave);
        mapa.push({
            casillero: '???',
            id: input.id,
            rotulo: rotulo.replace(/\s+/g, ' ').trim(),
            valor: input.value,
            editable: input.type === 'text' && !input.readOnly && !input.disabled,
            via: 'id'
        });
    });

    mapa.sort((a, b) => {
        const na = Number(a.casillero), nb = Number(b.casillero);
        if (isNaN(na) && isNaN(nb)) return (a.id || '').localeCompare(b.id || '');
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return na - nb;
    });

    // ── Diagnóstico ─────────────────────────────────────────────────────────
    // Cuando no encuentra nada tiene que decir QUÉ vio. «No hay casilleros» no
    // permite arreglar nada; «hay 84 inputs y ninguno tiene número al lado» sí.
    const diagnostico = {
        url: location.pathname,
        inputsDeTexto: entradas.filter((e) => e.type === 'text').length,
        inputsOcultos: entradas.filter((e) => e.type === 'hidden').length,
        conIdConcepto: entradas.filter((e) => /concepto\d+/i.test(e.id || '')).length,
        tablas: document.querySelectorAll('table').length,
        celdasSoloNumero: Array.from(document.querySelectorAll('td, th, span, label'))
            .filter((e) => !propio(e) && soloNumero(e.textContent)).length,
        primerosIds: entradas.slice(0, 12).map((e) => e.id || '(sin id)')
    };

    console.log(`📋 ${mapa.length} casilleros encontrados.`);
    if (mapa.length && console.table) console.table(mapa);
    else mapa.forEach((f) => console.log(`   ${f.casillero}  ${String(f.id).padEnd(16)} ${f.rotulo}`));
    console.log('🔎 Lo que hay en pantalla:', diagnostico);

    // Para pegar en la Biblia sin tener que transcribir a mano.
    const comoTabla = [
        `<!-- ${diagnostico.url} · ${diagnostico.inputsDeTexto} inputs de texto · ` +
        `${diagnostico.conIdConcepto} con id conceptoNNNN · ${diagnostico.celdasSoloNumero} celdas con un número solo -->`,
        ...mapa.map((f) =>
            `| **${f.casillero}** | \`${f.id}\` | ${f.editable ? 'editable' : 'solo lectura'} | ${f.rotulo} |`)
    ].join('\n');

    if (copiar && navigator.clipboard) {
        navigator.clipboard.writeText(comoTabla)
            .then(() => console.log('📎 Copiado al portapapeles, listo para pegar en la Biblia.'))
            .catch(() => console.log('No se pudo copiar. Está en window.__mapaCasilleros.'));
    }
    window.__mapaCasilleros = { filas: mapa, markdown: comoTabla, diagnostico };

    const cincoPorCiento = mapa.filter((f) => /5\s*%/.test(f.rotulo) || ['502','512','540','550'].includes(f.casillero));
    if (cincoPorCiento.length) {
        console.log('🟡 Candidatos para el 5% / sin derecho a crédito:');
        cincoPorCiento.forEach((f) => console.log(`   ${f.casillero} → ${f.id} · ${f.rotulo}`));
    } else {
        console.log('🟡 Ni rastro del 5% ni del 502/512 en esta pantalla.');
    }

    return mapa;
}

/**
 * La casilla que está a la derecha de otra, en su misma línea.
 *
 * El formulario del SRI pone bruto y neto uno al lado del otro:
 *
 *     540 [ caja ]   550 [ caja ]   560 [ caja ]
 *
 * Cuando el bruto se encuentra y el neto no, esto lo rescata. **No es una
 * suposición sobre los números** —«550 será 1281 porque 540 es 1271»— sino
 * sobre la estructura que se ve en la pantalla, que es lo que la §5b permite
 * usar. Inventar un id a partir de un patrón numérico sería darle un destino
 * a plata ajena sin haberlo visto.
 *
 * @param {HTMLElement} referencia La casilla ya encontrada (el bruto).
 * @returns {HTMLInputElement|null}
 */
function vecinoDeFila(referencia) {
    if (!referencia) return null;
    const rr = referencia.getBoundingClientRect();

    // Sin geometría no se puede medir «la misma altura» — pasa cuando la
    // sección todavía está colapsada. Antes se devolvía null y el rescate se
    // rendía en la primera línea, EN SILENCIO: el 07-sep-2026 dejó $4.507,72
    // al 5% con el bruto cargado y el neto vacío.
    //
    // Se cae al orden del DOM dentro de la fila real: el neto es el próximo
    // input de texto después del bruto. Menos preciso que medir, pero
    // infinitamente mejor que rendirse sin decir nada.
    if (!rr.width || !rr.height) {
        const fila = referencia.closest('tr') && referencia.closest('tr').closest('table')
            ? referencia.closest('table').closest('tr') || referencia.closest('tr')
            : referencia.closest('tr');
        const ambito = fila || referencia.closest('table') || document.body;
        const todos = Array.from(ambito.querySelectorAll('input[type="text"]'))
            .filter((el) => !el.disabled && !el.readOnly);
        const i = todos.indexOf(referencia);
        const siguiente = (i >= 0 && i + 1 < todos.length) ? todos[i + 1] : null;
        if (siguiente) {
            console.log('   📐 Sin geometría (¿sección colapsada?): se toma el siguiente ' +
                        'input de la fila por orden del DOM.');
        }
        return siguiente;
    }

    // El ámbito se abre de a poco, igual que en `encontrarInputPorCasillero`.
    // `closest('tr')` a secas devuelve la fila de la tabla ANIDADA —el SRI mete
    // una tabla dentro de cada celda— y ahí no hay más que la propia casilla.
    // El banco cazó este mismo tropiezo dos veces.
    const ambitos = [];
    for (let n = referencia.parentElement; n && n !== document.body; n = n.parentElement) {
        if (n.tagName === 'TR' || n.tagName === 'TABLE') ambitos.push(n);
    }
    ambitos.push(document.body);

    for (const ambito of ambitos) {
        const candidatos = Array.from(ambito.querySelectorAll('input[type="text"]'))
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ el, r }) =>
                el !== referencia && r.width > 0 && r.height > 0 &&
                r.left > rr.right - 2 &&
                Math.abs((r.top + r.height / 2) - (rr.top + rr.height / 2)) < Math.max(12, rr.height * 0.9) &&
                !el.disabled && !el.readOnly)
            .sort((a, b) => a.r.left - b.r.left);

        if (candidatos.length) return candidatos[0].el;
    }
    return null;
}

async function encontrarInputPorCasillero(casillero) {
    // 0. PRIMARY: Manual Map & Validated ID pattern
    // MAPA CONFIRMADO: casillero -> id real del DOM del SRI
    // ORIGEN (Bruto, solo lectura — se leen):
    //   401 -> concepto450   (Ventas tarifa != 0%, bruto)
    //   403 -> concepto570   (Ventas tarifa 0%, bruto)
    // DESTINO (Neto, editables — se llenan):
    //   411 -> concepto460   (Ventas tarifa != 0%, neto)
    //   413 -> concepto580   (Ventas tarifa 0%, neto)
    const fieldMap = {
        // ── VENTAS (Confirmado por DOM) ────────────────────────────────
        '401': 'concepto450',  // Ventas tarifa != 0% (Bruto)
        '411': 'concepto460',  // Ventas tarifa != 0% (Neto)
        '403': 'concepto570',  // Ventas tarifa 0% (Bruto)
        '413': 'concepto580',  // Ventas tarifa 0% (Neto)
        // ── COMPRAS (Adquisiciones) ──────────────────────────────────
        // Confirmados por el usuario desde el DOM del SRI
        '500': 'concepto1270', // Base imponible compras tarifa != 0% (Bruto)
        '510': 'concepto1280', // Base neta compras tarifa != 0% (Bruto - NC)
        '507': 'concepto1720', // Base imponible compras tarifa 0% (Bruto)
        '517': 'concepto1730', // Base neta compras tarifa 0% (Bruto - NC)
        // ── RESUMEN IMPOSITIVO ─────────────────────────────────
        // Confirmados por el usuario desde el DOM del SRI
        '601': 'concepto2140', // Impuesto causado (Derived)
        '602': 'concepto2150', // Crédito tributario periodo (si 499-564 < 0)
        '605': 'concepto2160', // Saldo crédito anterior (Comprobantes)
        '606': 'concepto2170', // Saldo retenciones anterior (Comprobantes)
        '609': 'concepto2200', // Retenciones IVA (solo IVA, NO renta)
        '520': 'concepto1290', // Impuesto Generado Compras (Fuente para 564)
        '564': 'concepto2130', // Crédito tributario periodo de acuerdo al factor de proporcionalidad
        '565': 'concepto1276', // Valor de IVA no considerado como crédito tributario por factor de proporcionalidad
        '615': 'concepto2220', // Saldo crédito próximo mes (Calculado)
        '617': 'concepto2230', // Saldo retenciones próximo mes (Calculado)
        '421': 'concepto470',  // Impuesto generado ventas diferente de 0%
        '422': 'concepto480',  // Impuesto generado ventas activo fijo
        '425': 'concepto510',  // Impuesto generado ventas otros
        '499': 'concepto1260', // Total impuesto a liquidar (Summary)
        '115': 'concepto256',  // Número de comprobantes (Compras) - ELITE MANUAL MAP
        '544': 'concepto1890', // NC por compensar 15% ( Assumption based on pattern )
        '543': 'concepto1900', // NC por compensar 0% ( Confirmado por el usuario )
        // ── Confirmados en la corrida del 07-sep-2026 ─────────────────────
        // No salen de suponer un patrón: la estrategia por altura los encontró
        // y el bot ESCRIBIÓ en ellos con éxito. Eso es evidencia, que es lo que
        // pide la §5b antes de cablear nada.
        '540': 'concepto1271', // Compras 5% bruto · escrito: 0.48
        '508': 'concepto1735', // Notas de venta, valor · escrito: 50.00
        '117': 'concepto258',  // Notas de venta, cantidad · escrito: 2
        // El 550 NO está: en esa corrida no apareció. Se lo rescata como vecino
        // de fila del 540 (ver `vecinoDeFila`). Suponer «concepto1281 porque el
        // 540 es 1271» sería inventarle un destino a plata ajena.
    };

    if (fieldMap[casillero]) {
        const mappedInput = document.getElementById(fieldMap[casillero]);
        if (mappedInput) {
            console.log(`   ✅ Encontrado por FieldMap (${casillero} -> ${fieldMap[casillero]})`);
            return mappedInput;
        }
    }

    const inputByConcepto = document.getElementById(`concepto${casillero}`);
    if (inputByConcepto) return inputByConcepto;

    // 1. Regex ID Robust (All inputs) - Check this FIRST as it's most precise if ID exists
    const inputById = document.querySelector(`input[id$=":${casillero}"], input[name$=":${casillero}"]`);
    if (inputById) return inputById;

    // 2. XPath: Celda con numero EXACTO -> Siguiente Celda -> Input[type=text] ÚNICAMENTE
    // CRÍTICO: usar [@type='text'] para NO capturar inputs hidden que PrimeFaces inyecta
    const xpaths = [
        `//td[normalize-space(text())='${casillero}']/following-sibling::td[1]//input[@type='text']`, // Sibling cell text input
        `//span[normalize-space(text())='${casillero}']/ancestor::td/following-sibling::td[1]//input[@type='text']`, // Span label -> sibling
        `//label[normalize-space(text())='${casillero}']/ancestor::td/following-sibling::td[1]//input[@type='text']`, // Label -> sibling
        `//td[normalize-space(text())='${casillero}']//input[@type='text']` // Input dentro de la misma celda (último recurso)
    ];

    for (const xpath of xpaths) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const el = result.singleNodeValue;
            if (el && el.tagName === 'INPUT' && el.type === 'text') {
                console.log(`   ✅ Encontrado por XPath Strict [type=text] (${casillero}): id=${el.id}`);
                return el;
            }
        } catch (e) { }
    }

    // 2.5 A LA MISMA ALTURA. La red que atrapa lo que las de arriba dejan pasar.
    //
    //     Las cuatro XPath de arriba exigen parentesco: que la casilla sea el
    //     `<td>` inmediatamente siguiente al número. El SRI anida tablas por
    //     celda y ahí la cadena se corta — el 540 estaba en pantalla y el bot
    //     reportó «no se encontró el casillero 540» (corrida del 06-sep-2026).
    //
    //     Esto no mira el HTML: mira la pantalla. El número de casillero y su
    //     casilla están en la misma línea, y eso es cierto porque así se ve la
    //     tabla, no porque el DOM lo prometa. Se toma el primer input de texto
    //     que esté a la derecha del número y a su misma altura.
    // El rótulo se busca en JavaScript, no con XPath. `normalize-space()` de
    // XPath 1.0 no toca el espacio duro (`&nbsp;`, U+00A0), que el SRI mete a
    // discreción: «550&nbsp;» no coincide con '550' y el casillero se vuelve
    // invisible para el buscador sin que nada avise.
    const soloTexto = (el) => {
        let t = '';
        for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
        return t.replace(/[\s ]+/g, ' ').trim();
    };
    const rotulos = Array.from(document.querySelectorAll('td, th, span, label, div, b, strong'))
        .filter((el) => soloTexto(el) === String(casillero));

    for (const rotulo of rotulos) {
        const rr = rotulo.getBoundingClientRect();
        if (!rr.height) continue;   // no está pintado: no dice dónde está nada

        // El ámbito se abre de a poco, de lo más cercano hacia afuera.
        //
        // Empezar por `closest('tr')` no alcanza: en el SRI cada celda lleva
        // una tabla adentro, así que la fila más cercana al número es la de esa
        // tabla anidada — y ahí no hay ningún input. Se sube fila por fila y
        // tabla por tabla hasta encontrar algo, en vez de mirar todo el
        // documento de una, que es como se termina agarrando el casillero de
        // otro renglón.
        const ambitos = [];
        for (let n = rotulo.parentElement; n && n !== document.body; n = n.parentElement) {
            const t = n.tagName;
            if (t === 'TR' || t === 'TABLE') ambitos.push(n);
        }
        ambitos.push(document.body);

        for (const ambito of ambitos) {
            const candidatos = Array.from(ambito.querySelectorAll('input[type="text"]'))
                .map((el) => ({ el, r: el.getBoundingClientRect() }))
                // A la derecha del número y a su misma altura. La tolerancia es
                // media línea: el número y la casilla no comparten line-height.
                // La tolerancia sale de la altura del propio rótulo, no de un
                // número fijo: una fila de 30 px y una de 12 px no se miden
                // igual, y el SRI usa las dos.
                .filter(({ el, r }) =>
                    r.width > 0 && r.height > 0 &&
                    r.left >= rr.left - 2 &&
                    Math.abs((r.top + r.height / 2) - (rr.top + rr.height / 2))
                        < Math.max(12, rr.height * 0.9) &&
                    !el.disabled && !el.readOnly)
                .sort((a, b) => a.r.left - b.r.left);

            if (candidatos.length) {
                const el = candidatos[0].el;
                console.log(`   ✅ Encontrado a la misma altura (${casillero}): id=${el.id || '(sin id)'}`);
                return el;
            }
        }
    }

    // 3. Fallback Regex ID loop (solo inputs type=text — jamás hidden)
    const inputs = document.querySelectorAll('input[type="text"]');
    const regex = new RegExp(`(\\D|^)${casillero}$`);

    for (const input of inputs) {
        if (regex.test(input.id) || regex.test(input.name)) {
            console.log(`   ✅ Encontrado por Regex (${casillero}): ID=${input.id}`);
            return input;
        }
    }

    return null;
}

// ============================================
// FUNCIONES DE LLENADO DE FORMULARIO
// ============================================


// Helper: Check if a number looks like a field ID (casillero)
function isFieldId(num) {
    // SRI form fields are typically in ranges: 400-499, 500-599, 600-699, 700-899
    // We treat any integer in the 400-899 range as a potential ID to ignore as a value
    // EXCEPT if it's 0, which is never a field ID but is a common value.
    if (num === 0) return false;
    return Number.isInteger(num) && num >= 400 && num <= 899;
}

async function detectarValorSugeridoEnDOM(casillero, inputElement) {
    if (!inputElement) return { found: false, value: 0 };

    await sleep(150); // Reducido de 400 a 150
    const inputRect = inputElement.getBoundingClientRect();

    console.log(`      [*] [${casillero}] OJO DE HALCON Turbo V8.1...`);

    const parseRobust = (t) => {
        if (!t) return null;
        // Limpiar y capturar el primer numero (soporta decimales con punto o coma)
        const matches = t.match(/(\d+[.,]\d+|\b\d+\b)/);
        if (!matches) return null;
        return parseDecimal(matches[0]);
    };

    const esIdCasillero = (n, text) => {
        if (n === null) return false;
        // SRI: IDs de casilleros son usualmente 401, 500, etc.
        // Si el numero coincide con un casillero pero tiene etiquetas como "Base", "IVA", etc, dejar pasar.
        if (n >= 400 && n <= 700 && Number.isInteger(n)) {
            // Permitir explícitamente el 0 si es un valor sugerido real (muy común)
            if (n === 0) return false;
            // SI el texto alrededor dice "Casillero" o parece un ID, bloquearlo
            if (text && (text.includes('Casillero') || text.includes('Cod.'))) return true;

            // Si coincide con el propio casillero que estamos llenando, es definitivamente un label.
            if (n.toString() === casillero) return true;

            // Fallback: si es un numero redondo tipico de casillero (401, 411, 500, 510, 601, 615, 617, 619, 654, 655)
            const commonFields = [401, 411, 403, 413, 500, 510, 507, 517, 564, 565, 601, 602, 609, 615, 617, 619, 654, 655];
            if (commonFields.includes(n)) return true;
        }
        return false;
    };

    // El sugerido de un casillero está en SU fila, o no está. Buscar por
    // coordenadas en todo el documento hacía que cualquier cosa a la misma
    // altura —el HUD de la extensión incluido— pudiera terminar dentro de una
    // declaración.
    const ambito = inputElement.closest('tr') || inputElement.closest('table') ||
                   inputElement.closest('form');
    if (!ambito) {
        console.log(`      [*] [${casillero}] El campo no está dentro de una fila del formulario. No busco por proximidad.`);
        return { found: false, value: 0 };
    }
    // Y nunca leer de lo que dibuja la propia extensión.
    const esNuestro = (el) => !!el.closest('#sri-loop-hud, #sri-assistant-panel-root, #sri-elite-panel, #sri-smart-hub, #sri-main-toast');

    try {
        // 1. ESCANEO POR CLASE DIRECTA (The Oracle's Shortcut)
        const sugeridosInputs = Array.from(ambito.querySelectorAll('input.sugerido, .input-sugerido, input[id*="sugerido"]'))
            .filter(el => {
                const r = el.getBoundingClientRect();
                return Math.abs(r.top - inputRect.top) < 20;
            });

        if (sugeridosInputs.length > 0) {
            for (const sug of sugeridosInputs) {
                const val = parseRobust(sug.value || sug.getAttribute('value'));
                if (val !== null && val > 0) {
                    return { found: true, value: val };
                }
            }
        }

        // 2. ESCANEO DE FILA FISICA
        const rowElements = Array.from(ambito.querySelectorAll('span, b, label, td, input, div'))
            .filter(el => {
                if (esNuestro(el)) return false;
                const r = el.getBoundingClientRect();
                return Math.abs(r.top - inputRect.top) < 15;
            });

        const candidates = rowElements.map(el => {
            const textContent = el.tagName === 'INPUT' ? (el.value || el.getAttribute('value')) : el.textContent;
            const val = parseRobust(textContent);
            const r = el.getBoundingClientRect();

            return {
                val: val,
                distX: Math.abs(r.left - inputRect.left),
                isInput: el.tagName === 'INPUT',
                isSugeridoClass: el.classList.contains('sugerido'),
                text: textContent ? textContent.trim() : ""
            };
        }).filter(c => c.val !== null && !esIdCasillero(c.val, c.text));

        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                if (a.isSugeridoClass && !b.isSugeridoClass) return -1;
                if (!a.isSugeridoClass && b.isSugeridoClass) return 1;
                if (a.isInput && !b.isInput) return -1;
                if (!a.isInput && b.isInput) return 1;
                return a.distX - b.distX;
            });

            return { found: true, value: candidates[0].val };
        }

    } catch (e) {
        console.warn("Error en Ojo de Halcón:", e);
    }

    return { found: false, value: 0 };
}




