/**
 * Lector del formulario ICE del SRI (para los meses CON ventas).
 *
 * Cómo se usa:
 *   1. Abrí el formulario del anexo ICE en el portal del SRI, con el mes cargado.
 *   2. F12 → pestaña Console.
 *   3. Pegá TODO este archivo y Enter.
 *   4. Te imprime el JSON y lo copia al portapapeles.
 *   5. Guardalo como ventas.json y generá el anexo:
 *        node tools/anexo_ice.mjs --mes 2026-10 --json ventas.json
 *
 * Es un lector heurístico: busca el código de producto en la tabla y toma los
 * números de la misma fila. Revisá el JSON antes de generar el XML.
 */
(() => {
    const RE_COD = /\b\d{4}-\d{3}-\d{6}-\d{3}-\d{6}-\d{2}-\d{3}-\d{6}\b/;
    const aNumero = (v) => {
        const n = Number(String(v == null ? '' : v).replace(/[^\d.,-]/g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    };
    const leerPorNombre = (contenedor, patrones) => {
        const campos = Array.from(contenedor.querySelectorAll('input, select, td, span'));
        for (const el of campos) {
            const etiqueta = `${el.name || ''} ${el.id || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
            if (!patrones.some((p) => p.test(etiqueta) || p.test(String(el.textContent || '').toLowerCase()))) continue;
            const valor = 'value' in el ? el.value : el.textContent;
            const n = aNumero(valor);
            if (n) return n;
        }
        return 0;
    };

    const productos = [];
    document.querySelectorAll('tr').forEach((tr) => {
        const texto = tr.innerText || '';
        const cod = (texto.match(RE_COD) || [])[0];
        if (!cod) return;
        productos.push({
            codProdICE: cod,
            gramoAzucar: leerPorNombre(tr, [/gramo/, /azucar/, /azúcar/]),
            tipoIdCliente: 'F',
            idCliente: '9999999999999',
            tipoVentaICE: 1,
            ventaICE: leerPorNombre(tr, [/venta/, /base/]),
            devICE: leerPorNombre(tr, [/devol/, /dev/]),
            cantProdBajaICE: Math.round(leerPorNombre(tr, [/baja/])),
        });
    });

    // Si no hay tabla, buscar los campos sueltos del formulario.
    if (!productos.length) {
        const cod = ((document.body.innerText || '').match(RE_COD) || [])[0] || '';
        productos.push({
            codProdICE: cod,
            gramoAzucar: leerPorNombre(document, [/gramo/, /azucar/]),
            tipoIdCliente: 'F',
            idCliente: '9999999999999',
            tipoVentaICE: 1,
            ventaICE: leerPorNombre(document, [/ventaice/, /venta/]),
            devICE: leerPorNombre(document, [/device/, /devol/]),
            cantProdBajaICE: Math.round(leerPorNombre(document, [/baja/])),
        });
    }

    const anioEl = document.querySelector('select[name*="anio" i], input[name*="anio" i], #anio, #Anio');
    const mesEl = document.querySelector('select[name*="mes" i], input[name*="mes" i], #mes, #Mes');
    const ahora = new Date();
    const salida = {
        anio: anioEl ? Number(anioEl.value) : ahora.getFullYear(),
        mes: mesEl ? Number(mesEl.value) : ahora.getMonth() + 1,
        ruc: '0706482023001',
        nombre: 'CHAVEZ CORDOVA GUIDO ERMEL',
        productos,
    };

    const json = JSON.stringify(salida, null, 2);
    console.log('%cANEXO ICE · datos leídos del formulario', 'color:#4edea3;font-weight:bold');
    console.log(json);
    try { copy(json); console.log('✅ Copiado al portapapeles: guardalo como ventas.json'); }
    catch { console.log('ℹ️ No se pudo copiar: seleccioná el JSON de arriba y guardalo como ventas.json'); }
    if (productos.every((p) => !p.ventaICE && !p.devICE)) {
        console.log('ℹ️ Todo en cero: ese mes se puede generar sin --json (anexo sin ventas).');
    }
})();
