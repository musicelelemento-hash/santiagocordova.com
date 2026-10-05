/*
 * SRI Asistente - Main World Bypass Script
 * Bypasses native confirm dialogs safely within the page context.
 */

(function() {
    console.log("SRI Asistente: Main world bypass script activo 🚀");
    
    // Override window.confirm to auto-approve SRI confirmation popups
    const originalConfirm = window.confirm;
    window.confirm = function(message) {
        console.log("SRI Asistente: Auto-aceptando diálogo confirm(...) ->", message);
        return true;
    };
})();
