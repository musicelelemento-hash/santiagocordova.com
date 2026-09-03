// Bridge Content Script for Extractor V1
// Escucha mensajes de SantiagoCordova.com y sincroniza la Matriz Completa y Credenciales de Declaración
console.log("⚡ [SC PRO Bridge Extractor V1] Conectado al Sistema Web SantiagoCordova.com");

function processAndSaveClientsList(clientsList) {
  if (!Array.isArray(clientsList) || clientsList.length === 0) return;
  const matrixMap = {};
  const validClients = [];

  clientsList.forEach(c => {
    if (c.ruc && c.sriPassword) {
      const clientObj = {
        id: c.id,
        name: c.name,
        ruc: c.ruc.trim(),
        sriPassword: c.sriPassword,
        ivaFrequency: c.taxProfile?.ivaFrequency || c.ivaFrequency || 'Mensual',
        regime: c.regime || c.taxRegime || ''
      };
      matrixMap[c.ruc.trim()] = clientObj;
      validClients.push(clientObj);
    }
  });

  chrome.storage.local.set({
    sc_clients_matrix: matrixMap,
    sc_ordered_matrix: validClients,
    matrix_updated_at: Date.now()
  }, () => {
    console.log(`✅ [SC PRO Bridge Extractor V1] ${validClients.length} clientes sincronizados en la extensión.`);
  });
}

function syncFullClientsMatrix() {
  try {
    const rawHistory = localStorage.getItem('sc_clients_history') || localStorage.getItem('sc_pro_store');
    if (rawHistory) {
      const parsed = JSON.parse(rawHistory);
      const clientsList = Array.isArray(parsed) ? parsed : (parsed.state?.clients || []);
      processAndSaveClientsList(clientsList);
    }

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
    console.warn("⚠️ Error en syncFullClientsMatrix Extractor V1:", e);
  }
}

syncFullClientsMatrix();
setInterval(syncFullClientsMatrix, 2500);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;

  if (data && data.source === 'SC_PRO_DASHBOARD') {
    if (data.type === 'SRI_FULL_MATRIX_DATA' && Array.isArray(data.data)) {
      processAndSaveClientsList(data.data);
    }

    if (data.type === 'SRI_AUTOFILL_DATA') {
      console.log("🚀 Credenciales SRI recibidas para RUC:", data.data.ruc);
      chrome.storage.local.set({
        pending_sri_autofill: data.data,
        ruc: data.data.ruc,
        sriPassword: data.data.password,
        activeClient: { ruc: data.data.ruc, sriPassword: data.data.password, name: data.data.name }
      });
    }

    if (data.type === 'SRI_START_BATCH_DECLARATION') {
      console.log("🚀 Lote de Declaración recibido:", data.data);
      chrome.storage.local.set({
        sc_batch_declaration_queue: data.data,
        pendingAction: 'turbo_monthly_start',
        actionTimestamp: Date.now()
      });
    }
  }
});

// Escuchar también evento CustomEvent sriAutofillReady
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
