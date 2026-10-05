/*
 * SRI Asistente - Main World Bypass Script (Edición Comercial Suite)
 * Auto-aprueba diálogos nativos confirm/alert en el contexto real de la página (Main World).
 */
(function() {
    console.log("⚡ [SC ANULADOR SUITE] Main World Bypass activo 🚀");
    window.__sriBypassActive = true;
    
    // Override window.confirm para RichFaces/JSF
    try {
        window.confirm = function(message) {
            console.log("⚡ [SC ANULADOR SUITE] Auto-aprobando confirm del SRI:", message);
            return true;
        };
    } catch(e) {}

    // Override window.alert para evitar que una alerta frene el bucle
    try {
        window.alert = function(msg) {
            console.log("ℹ️ [SC ANULADOR SUITE] Alerta SRI interceptada (no bloqueante):", msg);
        };
    } catch(e) {}
})();
