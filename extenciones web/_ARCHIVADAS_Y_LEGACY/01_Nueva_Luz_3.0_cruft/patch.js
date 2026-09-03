const fs = require('fs');
let code = fs.readFileSync('src/01_utilidades_y_pdf.js', 'utf8');
code = code.replace(/\r\n/g, '\n'); // Normalize line endings

const originalTry = `    try {
        const fetchRes = await fetch(\`\${SUPABASE_URL}/rest/v1/clients?ruc=eq.\${ruc}&select=id,declaration_history\`, {`;

const newTry = `    try {
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

            const fileName = \`Declaracion_IVA_\${ruc}_\${periodStr}.pdf\`;
            const filePath = \`\${ruc}/\${fileName}\`;

            const uploadRes = await fetch(\`\${SUPABASE_URL}/storage/v1/object/sri_proofs/\${filePath}\`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': \`Bearer \${SUPABASE_KEY}\`,
                    'Content-Type': 'application/pdf',
                    'x-upsert': 'true'
                },
                body: pdfBlob
            });

            if (uploadRes.ok) {
                pdfUrl = \`\${SUPABASE_URL}/storage/v1/object/public/sri_proofs/\${filePath}\`;
                console.log('✅ [SUPABASE STORAGE] PDF subido con éxito:', pdfUrl);
            } else {
                console.error('❌ [SUPABASE STORAGE] Error subiendo PDF:', await uploadRes.text());
                pdfUrl = \`base64:\${pdfData}\`; 
            }
        } catch (storageErr) {
            console.error('❌ [SUPABASE STORAGE] Excepción:', storageErr);
            pdfUrl = \`base64:\${pdfData}\`;
        }

        const fetchRes = await fetch(\`\${SUPABASE_URL}/rest/v1/clients?ruc=eq.\${ruc}&select=id,declaration_history\`, {`;

code = code.replace(originalTry, newTry);

const originalProofFile = `        const proofFileObj = {
            name: \`Declaracion_IVA_\${ruc}_\${periodStr}.pdf\`,
            type: 'pdf',
            size: Math.round(pdfData.length * 0.75),
            lastModified: Date.now(),
            content: pdfData,
            metadata: {`;

const newProofFile = `        const proofFileObj = {
            name: \`Declaracion_IVA_\${ruc}_\${periodStr}.pdf\`,
            type: 'pdf',
            size: Math.round(pdfData.length * 0.75),
            lastModified: Date.now(),
            content: null,
            url: pdfUrl,
            metadata: {`;

code = code.replace(originalProofFile, newProofFile);

fs.writeFileSync('src/01_utilidades_y_pdf.js', code, 'utf8');
console.log('Patched file correctly.');
