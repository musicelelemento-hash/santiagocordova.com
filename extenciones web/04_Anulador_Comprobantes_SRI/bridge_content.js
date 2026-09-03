// Bridge Content Script for SRI Anulador PDF
// Escucha mensajes de SantiagoCordova.com y sincroniza las Credenciales de Anulación
console.log("⚡ [SC PRO Bridge Anulador] Conectado al Sistema Web SantiagoCordova.com");

function syncActiveCredentials() {
  try {
    const rawActive = localStorage.getItem('sri_active_credentials') || localStorage.getItem('_sri_autofill_pending');
    if (rawActive) {
      const activeData = JSON.parse(rawActive);
      if (activeData.ruc) {
        chrome.storage.local.set({
          pending_sri_autofill: activeData,
          ruc: activeData.ruc,
          sriPassword: activeData.password || activeData.sriPassword || '',
          activeClient: { ruc: activeData.ruc, sriPassword: activeData.password || activeData.sriPassword || '', name: activeData.name || '' }
        });
      }
    }
  } catch (e) {
    console.warn("⚠️ Error en syncActiveCredentials Anulador:", e);
  }
}

syncActiveCredentials();
setInterval(syncActiveCredentials, 2500);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;

  if (data && data.source === 'SC_PRO_DASHBOARD') {
    if (data.type === 'SRI_AUTOFILL_DATA') {
      console.log("🚀 Credenciales SRI Anulación recibidas para RUC:", data.data.ruc);
      chrome.storage.local.set({
        pending_sri_autofill: data.data,
        ruc: data.data.ruc,
        sriPassword: data.data.password,
        activeClient: { ruc: data.data.ruc, sriPassword: data.data.password, name: data.data.name }
      });
    }
  }
});

// Escuchar evento CustomEvent sriAutofillReady
window.addEventListener("sriAutofillReady", (e) => {
  if (e.detail) {
    chrome.storage.local.set({
      pending_sri_autofill: e.detail,
      ruc: e.detail.ruc,
      sriPassword: e.detail.password,
      activeClient: { ruc: e.detail.ruc, sriPassword: e.detail.password, name: e.detail.name }
    });
  }
});
