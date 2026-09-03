// Bridge Content Script: Escucha mensajes de SantiagoCordova.com y sincroniza la Matriz Completa Ordenada (Mensuales ➔ Semestrales)
console.log("⚡ [SC PRO Bridge] Conectado al Sistema Web SantiagoCordova.com");

function getNinthDigit(ruc) {
  if (!ruc || ruc.length < 9) return 99;
  const char = ruc.charAt(8);
  const digit = parseInt(char, 10);
  if (isNaN(digit)) return 99;
  return digit === 0 ? 10 : digit;
}

function classifyClientGroup(client) {
  const freq = (client.ivaFrequency || client.taxProfile?.ivaFrequency || '').toLowerCase();
  const regime = (client.regime || client.taxRegime || '').toLowerCase();

  if (freq.includes('ninguno') || freq.includes('anual') || regime.includes('popular')) {
    return 3; // Solo Anuales / Rimpe Negocio Popular
  } else if (freq.includes('semestral') || regime.includes('emprendedor')) {
    return 2; // Semestrales
  } else {
    return 1; // Mensuales (Default)
  }
}

function sortClientsMatrix(clientsList) {
  if (!Array.isArray(clientsList)) return [];

  const mensList = [];
  const semesList = [];
  const anualesList = [];

  clientsList.forEach(c => {
    const grp = classifyClientGroup(c);
    if (grp === 3) anualesList.push(c);
    else if (grp === 2) semesList.push(c);
    else mensList.push(c);
  });

  const sortBy9th = (a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc);

  mensList.sort(sortBy9th);
  semesList.sort(sortBy9th);
  anualesList.sort(sortBy9th);

  return [...mensList, ...semesList, ...anualesList];
}

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

  const orderedList = sortClientsMatrix(validClients);

  chrome.storage.local.set({
    sc_clients_matrix: matrixMap,
    sc_ordered_matrix: orderedList,
    matrix_updated_at: Date.now()
  }, () => {
    console.log(`✅ [SC PRO Bridge] Matriz Ordenada (${orderedList.length} clientes en 3 grupos por 9no dígito) guardada.`);
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

// Sincronizar de inmediato al cargar la página del sistema
syncFullClientsMatrix();
setInterval(syncFullClientsMatrix, 3000);

// Transmitir cambios realizados en el SRI o Ecuafact al Sistema Web
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.last_password_update) {
      const updateData = changes.last_password_update.newValue;
      if (updateData) {
        window.postMessage({
          source: 'SC_PRO_EXTENSION',
          type: 'SRI_PASSWORD_UPDATED_SYNC',
          data: updateData
        }, "*");
        console.log("🚀 [SC PRO Bridge] Enviada actualización de clave al sistema web:", updateData.ruc);
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

    if (data.type === 'SRI_CHANGE_PASSWORD_DATA') {
      console.log("🔑 [SC PRO Bridge] Cambio de clave recibido para RUC:", data.data.ruc);
      chrome.storage.local.get(['sc_password_updates_log'], (res) => {
        const updatesLog = res.sc_password_updates_log || {};
        const rucClean = (data.data.ruc || '').trim();
        if (rucClean) {
          updatesLog[rucClean] = {
            ruc: rucClean,
            updatedAt: data.data.timestamp || Date.now(),
            newPassword: data.data.newPassword
          };
        }
        chrome.storage.local.set({
          pending_sri_change: data.data,
          sc_password_updates_log: updatesLog,
          last_updated: Date.now()
        });
      });
    }

    if (data.type === 'SRI_AUTOFILL_DATA') {
      console.log("🚀 [SC PRO Bridge] Credenciales SRI recibidas para RUC:", data.data.ruc);
      chrome.storage.local.set({
        pending_sri_autofill: data.data
      });
    }

    if (data.type === 'SRI_START_BATCH_DECLARATION') {
      console.log("🚀 [SC PRO Bridge] Iniciar lote de declaraciones masivas:", data.data.declarationType, "con", data.data.clients?.length, "clientes");
      chrome.storage.local.set({
        sc_declaration_queue: data.data.clients || [],
        sc_declaration_type: data.data.declarationType || 'mensual',
        sc_queue_index: 0,
        sc_queue_active: true,
        sc_queue_started_at: Date.now()
      }, () => {
        console.log("✅ [SC PRO Bridge] Cola de declaraciones iniciada en memoria local de la extensión.");
      });
    }
  }
});

// Escuchar también por CustomEvent
window.addEventListener("sriChangePasswordReady", (e) => {
  if (e.detail) {
    chrome.storage.local.set({ pending_sri_change: e.detail });
  }
});
