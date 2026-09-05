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
        const eliteFields = ['564', '565', '615', '617', '619'];
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
    console.log('  - IVA 15%:', facturas.iva15);
    console.log('  - IVA 0%:', facturas.iva0);
    if (notasCredito) {
        console.log('📄 Notas de Crédito:');
        console.log('  - NC IVA 15%:', notasCredito.iva15);
        console.log('  - NC IVA 0%:', notasCredito.iva0);
    }

    // ─── PASO 1: Expandir Sección COMPRAS si está colapsada ───────────────────
    await toggleSriSection('COMPRAS', true);

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

async function llenarCampo(casillero, valor) {
    let input = await encontrarInputPorCasillero(casillero);
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
        if (parseDecimal(input.value) !== parseDecimal(valorFormateado)) {
            input.value = valorFormateado;
            input.dispatchEvent(new Event('change', { bubbles: true }));
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

    try {
        // 1. ESCANEO POR CLASE DIRECTA (The Oracle's Shortcut)
        const sugeridosInputs = Array.from(document.querySelectorAll('input.sugerido, .input-sugerido, input[id*="sugerido"]'))
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
        const rowElements = Array.from(document.querySelectorAll('span, b, label, td, input, div'))
            .filter(el => {
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



