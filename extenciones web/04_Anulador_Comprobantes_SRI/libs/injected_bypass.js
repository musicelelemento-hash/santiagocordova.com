/*
 * SRI Asistente - Main World Elite Bypass Shield & Polyfill
 * Desarrollado para Santiago Córdova - Asesor Tributario
 * 
 * Auto-aprueba diálogos nativos confirm/alert en el contexto real de la página (Main World),
 * desactiva frenos de confirmación en el DOM y provee escudos de compatibilidad RichFaces/PrimeFaces.
 */
(function() {
    // 🛡️ AISLAMIENTO ESTRICTO DE CONTEXTO:
    // El Anulador PRO solo debe operar en el subsistema de anulación de comprobantes.
    // Prohibido interferir en Declaraciones (recibirDeclaracion.jsf), Consulta (lista-obligaciones),
    // Perfil o Login, para garantizar convivencia 100% armónica con la extensión de Declaraciones Mensuales.
    const url = (window.location.href || '').toLowerCase();
    const esRutaAnulacion = url.includes('/anulacion/') || 
                            url.includes('menuanulacion') || 
                            url.includes('solicitudanulacion');
    if (!esRutaAnulacion) {
        return; // Silencio total fuera del módulo de anulación
    }

    if (window.__sriBypassActive) return;
    window.__sriBypassActive = true;
    console.log("⚡ [SC ANULADOR PRO] Main World Elite Bypass Shield ACTIVO en módulo de anulación 🚀");

    // 2. OVERRIDE NATIVO DE CONFIRMACIONES (Zero-Click Auto-Approve)
    try {
        const originalConfirm = window.confirm;
        window.confirm = function(message) {
            console.log("⚡ [SC ANULADOR PRO] Auto-aprobando confirm del SRI de forma transparente:", message);
            return true;
        };
        window.__originalConfirm = originalConfirm;
    } catch(e) {}

    // 3. OVERRIDE NATIVO DE ALERTAS (No bloqueante y Captura de Mensajes)
    try {
        const originalAlert = window.alert;
        window.alert = function(msg) {
            console.log("ℹ️ [SC ANULADOR PRO] Alerta SRI interceptada (no bloqueante):", msg);
            window.__sriLastPortalAlert = msg;
            try {
                window.dispatchEvent(new CustomEvent('SRI_PORTAL_ALERT', { detail: { message: msg } }));
            } catch(e){}
            return true;
        };
        window.__originalAlert = originalAlert;
    } catch(e) {}

    // 4. OVERRIDE DE PROMPT (Retorna cadena vacía)
    try {
        window.prompt = function() {
            return '';
        };
    } catch(e) {}

    // 5. ESCUDO DE EVENTOS CLICK PARA PREVENIR CONFIRMACIONES INLINE
    // Neutraliza handlers onclick que contengan 'confirm(' antes de que se ejecuten
    try {
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('button, input[type="submit"], input[type="button"], a');
            if (btn) {
                const onclickAttr = btn.getAttribute('onclick') || '';
                if (onclickAttr.includes('confirm(')) {
                    console.log("⚡ [SC ANULADOR PRO] Desactivando confirm() inline en botón:", btn.id || btn.name);
                    const cleaned = onclickAttr.replace(/if\s*\(!confirm\([^)]*\)\)\s*return\s*false;?/gi, '');
                    btn.setAttribute('onclick', cleaned);
                }
            }
        }, true); // Capturing phase
    } catch(e) {}

    // 6. AUTO-CIERRE Y CAPTURA DE DIÁLOGOS DEL PORTAL SRI (RichFaces / PrimeFaces)
    setInterval(() => {
        try {
            // Si aparece un diálogo con botón de Aceptar/Cerrar, capturar su texto y cerrar si es informativo
            const dialogs = document.querySelectorAll('.ui-dialog:not([style*="display: none"]), .rich-modalpanel:not([style*="display: none"])');
            dialogs.forEach(dlg => {
                const text = (dlg.innerText || '').trim();
                const lowerText = text.toLowerCase();
                if (text && (lowerText.includes('información') || lowerText.includes('notificación') || lowerText.includes('aviso') || lowerText.includes('plazo') || lowerText.includes('estimado contribuyente'))) {
                    window.__sriLastPortalDialog = text;
                    try {
                        window.dispatchEvent(new CustomEvent('SRI_PORTAL_DIALOG', { detail: { text: text } }));
                    } catch(e){}
                    const okBtn = dlg.querySelector('button, input[type="button"], .ui-dialog-titlebar-close');
                    if (okBtn) {
                        console.log("⚡ [SC ANULADOR PRO] Auto-cerrando diálogo informativo del portal:", text.slice(0, 45));
                        okBtn.click();
                    }
                }
            });
        } catch(err) {}
    }, 800);

    // 7. PUENTE DE ACTIVACIÓN DIRECTA PARA ENVIAR (PASO 2) DESDE MAIN WORLD
    window.addEventListener('SRI_DISPARAR_ENVIAR', function() {
        const btn = document.getElementById('frmPrincipal:btnEnviar') || document.querySelector('input[id*="btnEnviar"]') || document.querySelector('input[value="Enviar"]');
        if (!btn) return;
        console.log("⚡ [SC ANULADOR PRO] Disparando btnEnviar desde contexto Main World...");
        try {
            btn.removeAttribute('disabled');
            btn.disabled = false;
        } catch(e){}

        try {
            const oc = btn.getAttribute('onclick') || '';
            if (oc.includes('confirm')) {
                btn.setAttribute('onclick', oc.replace(/if\s*\(!confirm\([^)]*\)\)\s*return\s*false;?/gi, ''));
            }
        } catch(e){}

        try {
            btn.click();
        } catch(e) {
            console.warn("Click directo en Main World:", e);
        }

        try {
            if (typeof RichFaces !== 'undefined' && RichFaces.ajax) {
                RichFaces.ajax("frmPrincipal:btnEnviar", null, { "incId": "1" });
            }
        } catch(e){}
    });
})();
