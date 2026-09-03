const fs = require('fs');
let code = fs.readFileSync('src/01_utilidades_y_pdf.js', 'utf8');

const replacement = "    try {
        console.log('⏳ [SUPABASE STORAGE] Subiendo PDF al bucket sri_proofs...');
        let pdfUrl = '';
        try {
            const byteCharacters = atob(pdfData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const pdfBlob = new Blob([byteArray], {type: 'application/pdf'});

            const fileName = \Declaracion_IVA_\_\.pdf\;
            const filePath = \\/\\;

            const uploadRes = await fetch(\\/storage/v1/object/sri_proofs/\\, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': \Bearer \\,
                    'Content-Type': 'application/pdf',
                    'x-upsert': 'true'
                },
                body: pdfBlob
            });

            if (uploadRes.ok) {
                pdfUrl = \\/storage/v1/object/public/sri_proofs/\\;
                console.log('✅ [SUPABASE STORAGE] PDF subido con éxito:', pdfUrl);
            } else {
                console.error('❌ [SUPABASE STORAGE] Error subiendo PDF:', await uploadRes.text());
                pdfUrl = \ase64:\\; 
            }
        } catch (storageErr) {
            console.error('❌ [SUPABASE STORAGE] Excepción:', storageErr);
            pdfUrl = \ase64:\\;
        }

        const fetchRes = await fetch(\\/rest/v1/clients?ruc=eq.\&select=id,declaration_history\, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': \Bearer \\ }
        });

        if (!fetchRes.ok) return;
        const rows = await fetchRes.json();
        if (!rows || rows.length === 0) return;

        const client = rows[0];
        const existingHistory = Array.isArray(client.declaration_history) ? client.declaration_history : [];

        const ghostData = preFetchedGhostData || ((typeof GhostMemory !== 'undefined' && GhostMemory.getData) ? (await GhostMemory.getData()) : {});
        const facturas = ghostData.facturas || {};
        const retenciones = ghostData.retenciones || {};
        const notasCredito = ghostData.notasCredito || {};
        const ventasData = ghostData.ventasExtraidas || {};

        const proofFileObj = {
            name: \Declaracion_IVA_\_\.pdf\,
            type: 'pdf',
            size: Math.round(pdfData.length * 0.75),
            lastModified: Date.now(),
            content: null,
            url: pdfUrl,
            metadata: {
                period: periodStr,
                uploadedAt: new Date().toISOString(),
                sriId: (document.body.innerText.match(/CEP.*?(\\d{10,})/i) || [])[1] || '',
                ventas15: ventasData.base15 || 0,
                ventas0: ventasData.base0 || 0,
                montoIvaVentas: ventasData.iva15 || ((ventasData.base15 || 0) * 0.15),
                compras15: facturas.iva15?.baseImponible || 0,
                compras0: facturas.iva0?.baseImponible || 0,
                montoIvaCompras: facturas.iva15?.montoIva || ((facturas.iva15?.baseImponible || 0) * 0.15),
                retIva: retenciones.retIva || 0,
                retRenta: retenciones.retRenta || 0,
                retBaseTotal: retenciones.baseImponible || 0,
                nc15: notasCredito.iva15?.baseImponible || 0,
                nc0: notasCredito.iva0?.baseImponible || 0,
                ncTotal: notasCredito.totalGeneral || 0
            }
        };

        const idx = existingHistory.findIndex(d => (d.period || '').includes(periodStr));
        if (idx >= 0) {
            existingHistory[idx] = {
                ...existingHistory[idx],
                proof_file: proofFileObj,
                status: 'completado',
                date: new Date().toISOString()
            };
        } else {
            existingHistory.push({
                period: periodStr,
                proof_file: proofFileObj,
                status: 'completado',
                date: new Date().toISOString()
            });
        }

        // Patch ultraligero a Supabase
        await fetch(\\/rest/v1/clients?id=eq.\\, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': \Bearer \\,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ declaration_history: existingHistory })
        });

        console.log('⚡ [SUPABASE WEBSYSTEM] Objeto proof_file con PDF real guardado en Supabase:', ruc, periodStr);
    } catch (e) {
        console.warn('⚠️ Supabase sync error:', e);
    }
";

// We extract the exact old block
const oldTryIndex = code.indexOf('    try {\n        const fetchRes = await fetch(');
if (oldTryIndex === -1) {
    console.log("Could not find the try block!");
    process.exit(1);
}

const endCatchIndex = code.indexOf('    } catch (e) {\n        console.warn(\\'⚠️ Supabase sync error:\\', e);\n    }\n', oldTryIndex);
if (endCatchIndex === -1) {
    console.log("Could not find the end of the try block!");
    process.exit(1);
}

const before = code.substring(0, oldTryIndex);
const after = code.substring(endCatchIndex + '    } catch (e) {\n        console.warn(\\'⚠️ Supabase sync error:\\', e);\n    }\n'.length);

const finalCode = before + replacement + '\n' + after;

fs.writeFileSync('src/01_utilidades_y_pdf.js', finalCode, 'utf8');
console.log('Successfully replaced logic using precise substring extraction.');
