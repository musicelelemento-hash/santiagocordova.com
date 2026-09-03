// Bridge Content Script: Sincronización entre SantiagoCordova.com (Menú Declaraciones) y la Extensión SRI
console.log("⚡ [SC PRO Bridge Declaraciones] Conectado a SantiagoCordova.com");

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
        sriPasswordUpdatedAt: c.sriPasswordUpdatedAt || c.updatedAt || null,
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
    console.log(`✅ [SC PRO Bridge] Matriz de ${validClients.length} clientes guardada en extensión.`);
  });
}

function syncFullClientsMatrix() {
  try {
    const rawHistory = localStorage.getItem('sc_clients_history') || localStorage.getItem('sc_pro_store') || localStorage.getItem('santiago_cordova_clients');
    if (rawHistory) {
      const parsed = JSON.parse(rawHistory);
      const clientsList = Array.isArray(parsed) ? parsed : (parsed.state?.clients || []);
      processAndSaveClientsList(clientsList);
    }
  } catch (e) {
    console.warn("⚠️ Error en syncFullClientsMatrix:", e);
  }
}

syncFullClientsMatrix();
setInterval(syncFullClientsMatrix, 4000);

// Escuchar cambios de declaraciones completadas en la extensión para enviarlas al Sistema Web (Menú Declaraciones)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.last_declaration_completed) {
      const decData = changes.last_declaration_completed.newValue;
      if (decData) {
        window.postMessage({
          source: 'SC_PRO_EXTENSION',
          type: 'SRI_DECLARATION_COMPLETED_SYNC',
          data: decData
        }, "*");
        console.log("🚀 [SC PRO Bridge] Sincronizando declaración completada con Menú Declaraciones:", decData.ruc, decData.period);
      }
    }
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;

  if (data && data.source === 'SC_PRO_DASHBOARD') {
    if (data.type === 'SRI_FULL_MATRIX_DATA' && Array.isArray(data.data)) {
      processAndSaveClientsList(data.data);
    }

    if (data.type === 'SRI_START_BATCH_DECLARATION') {
      console.log("🚀 [SC PRO Bridge] Iniciar lote de declaraciones:", data.data.declarationType, "con", data.data.clients?.length, "clientes");
      chrome.storage.local.set({
        sc_declaration_queue: data.data.clients || [],
        sc_declaration_type: data.data.declarationType || 'mensual',
        sc_queue_index: 0,
        sc_queue_active: true,
        sc_queue_started_at: Date.now()
      });
    }
  }
});
