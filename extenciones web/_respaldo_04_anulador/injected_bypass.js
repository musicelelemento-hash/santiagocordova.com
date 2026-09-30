/*
 * SRI Asistente - Main World Bypass Script
 * Overrides window.confirm in the page context to auto-approve SRI confirmation popups.
 */

(function() {
    console.log("SRI Asistente: Main world bypass activo 🚀");
    
    function customConfirm(msg) {
        console.log("SRI Asistente Turbo: Auto-aceptando confirmación SRI ->", msg);
        return true;
    }

    function overrideConfirm() {
        try {
            if (window.confirm !== customConfirm) {
                window.originalConfirm = window.confirm;
                window.confirm = customConfirm;
            }
        } catch(e){}
    }

    overrideConfirm();
    setInterval(overrideConfirm, 500);
})();
