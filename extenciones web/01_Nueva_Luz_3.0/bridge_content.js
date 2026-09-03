// Bridge Content Script for Nueva Luz 3.0
// Escucha mensajes de SantiagoCordova.com y sincroniza la Matriz Completa y Credenciales de Declaración
console.log("⚡ [SC PRO Bridge Nueva Luz 3.0] Conectado al Sistema Web SantiagoCordova.com");

function isMensual(c) {
  if (!c || !c.ruc) return false;
  if (c.isDeleted || c.is_deleted) return false;
  if (c.isActive === false || c.is_active === false) return false;

  const tp = c.tax_profile || c.taxProfile || {};
  const freq = (tp.ivaFrequency || c.iva_frequency || c.ivaFrequency || '').toLowerCase();
  const reg = (c.regime || '').toLowerCase();
  const type = (c.client_type || c.clientType || tp.clientType || '').toLowerCase();

  if (type === 'solo_plan' || c.requires_declarations === false || tp.requiresDeclarations === false) return false;
  if (freq === 'mensual') return true;
  if (freq === 'semestral' || freq === 'ninguno' || freq === 'anual') return false;
  if (reg.includes('popular')) return false;
  if (reg.includes('emprendedor')) {
    return freq === 'mensual';
  }
  return true;
}

function processAndSaveClientsList(clientsList) {
  if (!Array.isArray(clientsList) || clientsList.length === 0) return;
  chrome.storage.local.get(['sc_clients_cache'], (storageRes) => {
    const existingMap = new Map((storageRes?.sc_clients_cache || []).map(p => [p.ruc, p]));
    const validClients = clientsList
      .filter(c => c && c.ruc && c.ruc.trim().length >= 10)
      .filter(isMensual) // 🎯 FILTRO ESTRICTO: Solo clientes que declaran IVA Mensual
      .map(c => {
        const tp = c.tax_profile || c.taxProfile || {};
        const prev = existingMap.get(c.ruc.trim()) || {};
        const pass = c.sriPassword || c.password || c.sri_password || prev.password || prev.sri_password || prev.sriPassword || '';

        // Fusionar declaraciones recibidas con las previas
        const incomingDecls = c.declarations || c.declaration_history || [];
        const prevDecls = prev.declarations || prev.declaration_history || [];
        const declMap = new Map();
        [...prevDecls, ...incomingDecls].forEach(d => {
          if (!d || !d.period) return;
          const cleanPeriod = d.period.split(':')[0].trim();
          declMap.set(cleanPeriod, { ...d, period: cleanPeriod });
        });

        return {
          id: c.id,
          name: c.name || prev.name || 'Cliente SRI',
          ruc: c.ruc.trim(),
          password: pass,
          sri_password: pass,
          sriPassword: pass,
          declarations: Array.from(declMap.values()),
          regime: c.regime || prev.regime || 'Régimen General',
          tax_profile: { ...tp, ivaFrequency: 'Mensual' },
          taxProfile: { ...tp, ivaFrequency: 'Mensual' },
          ivaFrequency: 'Mensual'
        };
      });

    chrome.storage.local.set({
      sc_clients_cache: validClients,
      matrix_updated_at: Date.now()
    }, () => {
      console.log(`✅ [SC PRO Bridge Nueva Luz 3.0] ${validClients.length} clientes mensuales sincronizados en la extensión con declaraciones.`);
    });
  });
}

let __lastClientsRaw = null;
let __lastTokenSynced = null;

function syncFullClientsMatrix() {
  try {
    // 1. Respaldar token de autenticación de Supabase si existe
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        try {
          const sess = JSON.parse(localStorage.getItem(k));
          // Solo escribimos si el token cambió (evita writes constantes a chrome.storage)
          if (sess?.access_token && sess.access_token !== __lastTokenSynced) {
            __lastTokenSynced = sess.access_token;
            chrome.storage.local.set({ sc_supabase_token: sess.access_token });
          }
        } catch (e) {}
      }
    }

    // 2. Extraer clientes
    const rawHistory = localStorage.getItem('sc_clients_history') || localStorage.getItem('sc_pro_store');
    if (rawHistory && rawHistory !== __lastClientsRaw) {
      __lastClientsRaw = rawHistory;
      const parsed = JSON.parse(rawHistory);
      const clientsList = Array.isArray(parsed) ? parsed : (parsed.state?.clients || []);
      processAndSaveClientsList(clientsList);
    }

    const rawActive = localStorage.getItem('sri_active_credentials') || localStorage.getItem('_sri_autofill_pending');
    if (rawActive) {
      const activeData = JSON.parse(rawActive);
      if (activeData.ruc) {
        const now = new Date();
        let cMonth = now.getMonth() - 1;
        let cYear = now.getFullYear();
        if (cMonth < 0) { cMonth = 11; cYear--; }

        chrome.storage.local.set({
          pending_sri_autofill: {
            ruc: activeData.ruc,
            password: activeData.password || activeData.sriPassword || '',
            name: activeData.name || 'Cliente SRI',
            timestamp: Date.now(),
            manual: true
          },
          pendingAction: 'verifyProfile',
          workflowPeriod: { year: cYear, monthIndex: cMonth },
          actionTimestamp: Date.now(),
          sri_master_switch_on: true,
          sriAutomationPaused: false
        });
        
        // Limpiar para evitar bucles infinitos
        localStorage.removeItem('sri_active_credentials');
        localStorage.removeItem('_sri_autofill_pending');
      }
    }
  } catch (e) {
    console.warn("⚠️ Error en syncFullClientsMatrix Nueva Luz 3.0:", e);
  }
}

syncFullClientsMatrix();
setInterval(syncFullClientsMatrix, 2500);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  // 🛡️ S-A3: Validación estricta de origen permitido
  const origin = event.origin || window.location.origin;
  const isAllowedOrigin =
    origin === "https://santiagocordova.com" ||
    origin === "https://www.santiagocordova.com" ||
    origin === "https://santiago-cordova.com" ||
    origin === "https://www.santiago-cordova.com" ||
    origin.endsWith(".santiagocordova.com") ||
    origin.endsWith(".santiago-cordova.com") ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");

  if (!isAllowedOrigin) return;

  const data = event.data;

  if (data && data.source === 'SC_PRO_DASHBOARD') {
    if (data.type === 'SRI_FULL_MATRIX_DATA' && Array.isArray(data.data)) {
      processAndSaveClientsList(data.data);
    }

    if (data.type === 'SRI_AUTOFILL_DATA' && data.data) {
      console.log("🚀 Credenciales SRI recibidas para RUC:", data.data.ruc);
      
      const now = new Date();
      let cMonth = now.getMonth() - 1;
      let cYear = now.getFullYear();
      if (cMonth < 0) { cMonth = 11; cYear--; }

      chrome.storage.local.set({
        pending_sri_autofill: {
          ruc: data.data.ruc,
          password: data.data.password || data.data.sriPassword || '',
          name: data.data.name || 'Cliente SRI',
          timestamp: Date.now(),
          manual: true
        },
        pendingAction: 'verifyProfile',
        workflowPeriod: { year: cYear, monthIndex: cMonth },
        actionTimestamp: Date.now(),
        sri_master_switch_on: true,
        sriAutomationPaused: false
      });
    }

    if (data.type === 'SRI_START_BATCH_DECLARATION' && data.data) {
      console.log("🚀 Lote de Declaración recibido:", data.data);
      const queue = (data.data.clients || []).map(c => ({
        ruc: c.ruc,
        password: c.sriPassword || c.password,
        name: c.name
      }));
      
      const now = new Date();
      let cMonth = now.getMonth() - 1;
      let cYear = now.getFullYear();
      if (cMonth < 0) { cMonth = 11; cYear--; }

      const payload = {
        auto_batch_enabled: true,
        auto_batch_queue: queue,
        auto_batch_index: 0,
        auto_batch_period: { year: cYear, monthIndex: cMonth },
        pendingAction: 'verifyProfile',
        workflowPeriod: { year: cYear, monthIndex: cMonth },
        actionTimestamp: Date.now(),
        sri_master_switch_on: true,
        sriAutomationPaused: false
      };

      // Si hay al menos un cliente en el lote, prepararlo para el auto-login del primer paso
      if (queue.length > 0) {
        payload.pending_sri_autofill = {
          ruc: queue[0].ruc,
          password: queue[0].password,
          name: queue[0].name,
          timestamp: Date.now(),
          manual: true,
          isBatch: true
        };
      }

      chrome.storage.local.set(payload, () => {
        // Abrir pestaña automáticamente para iniciar el bucle
        window.open('https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT', '_blank');
      });
    }
  }
});

window.addEventListener("sriAutofillReady", (e) => {
  if (e.detail && e.detail.ruc) {
    const now = new Date();
    let cMonth = now.getMonth() - 1;
    let cYear = now.getFullYear();
    if (cMonth < 0) { cMonth = 11; cYear--; }

    chrome.storage.local.set({
      pending_sri_autofill: {
        ruc: e.detail.ruc,
        password: e.detail.password || e.detail.sriPassword || '',
        name: e.detail.name || 'Cliente SRI',
        timestamp: Date.now(),
        manual: true
      },
      pendingAction: 'verifyProfile',
      workflowPeriod: { year: cYear, monthIndex: cMonth },
      actionTimestamp: Date.now(),
      sri_master_switch_on: true,
      sriAutomationPaused: false
    });
  }
});
