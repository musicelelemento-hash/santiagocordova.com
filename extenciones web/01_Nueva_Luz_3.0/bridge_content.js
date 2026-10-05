// Bridge Content Script for Nueva Luz 3.0
// Escucha mensajes de SantiagoCordova.com y sincroniza la Matriz Completa y Credenciales de Declaración
console.log("⚡ [SC PRO Bridge Nueva Luz 3.0] Conectado al Sistema Web SantiagoCordova.com");

// La web marca "aún no empieza a declarar" con clientStartPeriod (primer período
// en el que el cliente tiene obligación). Si se especifica un período de referencia,
// se valida contra él; de lo contrario, se usa el mes calendario anterior.
function clientAunNoEmpiezaADeclarar(c, tp, targetPeriodRef) {
  const startPeriod = (tp && tp.clientStartPeriod) || (c && (c.client_start_period || c.clientStartPeriod)) || '';
  if (!startPeriod) return false;
  let targetKey = '';
  if (targetPeriodRef) {
    if (typeof targetPeriodRef === 'string') {
      targetKey = targetPeriodRef.split(':')[0].trim();
    } else if (typeof targetPeriodRef === 'object' && targetPeriodRef.year && typeof targetPeriodRef.monthIndex === 'number') {
      targetKey = `${targetPeriodRef.year}-${String(targetPeriodRef.monthIndex + 1).padStart(2, '0')}`;
    }
  }
  if (!targetKey) {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    targetKey = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
  }
  return String(startPeriod) > targetKey;
}

function extractPeriodFromData(data) {
  if (!data) return null;
  if (data.workflowPeriod && data.workflowPeriod.year && typeof data.workflowPeriod.monthIndex === 'number') {
    return { year: data.workflowPeriod.year, monthIndex: data.workflowPeriod.monthIndex };
  }
  const pStr = data.period || data.targetPeriod;
  if (typeof pStr === 'string') {
    const clean = pStr.split(':')[0].trim();
    const match = clean.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      return { year: parseInt(match[1], 10), monthIndex: parseInt(match[2], 10) - 1 };
    }
  }
  return null;
}

function isMensual(c) {
  if (!c || !c.ruc) return false;
  if (c.isDeleted || c.is_deleted) return false;
  if (c.isActive === false || c.is_active === false) return false;

  const tp = c.tax_profile || c.taxProfile || {};
  const freq = (tp.ivaFrequency || c.iva_frequency || c.ivaFrequency || '').toLowerCase();
  const reg = (c.regime || '').toLowerCase();
  const type = (c.client_type || c.clientType || tp.clientType || '').toLowerCase();

  if (type === 'solo_plan' || c.requires_declarations === false || tp.requiresDeclarations === false) return false;
  if (clientAunNoEmpiezaADeclarar(c, tp)) return false;
  if (freq === 'mensual') return true;
  if (freq === 'semestral' || freq === 'ninguno' || freq === 'anual') return false;
  if (reg.includes('popular')) return false;
  if (reg.includes('emprendedor')) {
    return freq === 'mensual';
  }
  // 💤 Sin frecuencia marcada, ya NO se incluye por defecto (10-sep-2026):
  // así entraban clientes viejos y de prueba sin la frecuencia cargada en la
  // web. processAndSaveClientsList() de más abajo la fuerza a 'Mensual' para
  // los que SÍ pasan este filtro, así que esto no les afecta.
  return false;
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

        const startPeriod = tp.clientStartPeriod || c.client_start_period || prev.clientStartPeriod || '';

        return {
          id: c.id,
          name: c.name || prev.name || 'Cliente SRI',
          ruc: c.ruc.trim(),
          password: pass,
          sri_password: pass,
          sriPassword: pass,
          declarations: Array.from(declMap.values()),
          regime: c.regime || prev.regime || 'Régimen General',
          tax_profile: { ...tp, ivaFrequency: 'Mensual', clientStartPeriod: startPeriod },
          taxProfile: { ...tp, ivaFrequency: 'Mensual', clientStartPeriod: startPeriod },
          ivaFrequency: 'Mensual',
          clientStartPeriod: startPeriod
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
        let periodToUse = extractPeriodFromData(activeData);
        if (!periodToUse) {
          const now = new Date();
          let cMonth = now.getMonth() - 1;
          let cYear = now.getFullYear();
          if (cMonth < 0) { cMonth = 11; cYear--; }
          periodToUse = { year: cYear, monthIndex: cMonth };
        }

        chrome.storage.local.set({
          pending_sri_autofill: {
            ruc: activeData.ruc,
            password: activeData.password || activeData.sriPassword || '',
            name: activeData.name || 'Cliente SRI',
            timestamp: Date.now(),
            manual: true
          },
          accionDeQuien: activeData.ruc,
          pendingAction: 'verifyProfile',
          workflowPeriod: periodToUse,
          actionTimestamp: Date.now(),
          sri_master_switch_on: true,
          sri_auto_mode: true,
          autoDeclaration: true,
          sriAutomationPaused: false,
          sc_loop: {
            estado: 'CORRIENDO',
            cola: [{ ruc: activeData.ruc, name: activeData.name || 'Cliente SRI', password: activeData.password || activeData.sriPassword || '' }],
            indice: 0,
            periodo: periodToUse,
            latido: Date.now(),
            motivo: 'Iniciado vía activeData en Web',
            paso: false,
            ultimaFase: ''
          }
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

// Diagnóstico de arranque: el puente era mudo, así que cuando no sincronizaba
// no había forma de saber si faltaba la sesión, la lista, o la clave correcta.
(function diagnosticoPuente() {
  const claves = ["sc_clients_history", "sc_pro_store", "sri_active_credentials", "_sri_autofill_pending"];
  const halladas = claves.filter((k) => !!localStorage.getItem(k));
  let cuantos = 0;
  try {
    const raw = localStorage.getItem("sc_clients_history") || localStorage.getItem("sc_pro_store");
    if (raw) {
      const p = JSON.parse(raw);
      cuantos = Array.isArray(p) ? p.length : (p.state && p.state.clients ? p.state.clients.length : 0);
    }
  } catch (e) {}

  if (cuantos > 0) {
    console.log("✅ [SC PRO Bridge] " + cuantos + " clientes listos para sincronizar con la extensión.");
  } else {
    console.warn(
      "⚠️ [SC PRO Bridge] No hay clientes que sincronizar.\n" +
      "   La web solo escribe la lista cuando ya la cargó: hay que estar logueado y ver los clientes en pantalla.\n" +
      "   Claves presentes en localStorage: " + (halladas.join(", ") || "ninguna")
    );
  }
})();

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
      
      let periodToUse = extractPeriodFromData(data.data);
      if (!periodToUse) {
        const now = new Date();
        let cMonth = now.getMonth() - 1;
        let cYear = now.getFullYear();
        if (cMonth < 0) { cMonth = 11; cYear--; }
        periodToUse = { year: cYear, monthIndex: cMonth };
      }

      chrome.storage.local.set({
        pending_sri_autofill: {
          ruc: data.data.ruc,
          password: data.data.password || data.data.sriPassword || '',
          name: data.data.name || 'Cliente SRI',
          timestamp: Date.now(),
          manual: true
        },
        accionDeQuien: data.data.ruc,
        pendingAction: 'verifyProfile',
        workflowPeriod: periodToUse,
        actionTimestamp: Date.now(),
        sri_master_switch_on: true,
        sri_auto_mode: true,
        autoDeclaration: true,
        sriAutomationPaused: false,
        sc_loop: {
          estado: 'CORRIENDO',
          cola: [{ ruc: data.data.ruc, name: data.data.name || 'Cliente SRI', password: data.data.password || data.data.sriPassword || '' }],
          indice: 0,
          periodo: periodToUse,
          latido: Date.now(),
          motivo: 'Iniciado desde Web (Individual)',
          paso: false,
          ultimaFase: ''
        }
      });
    }

    if (data.type === 'SRI_START_BATCH_DECLARATION' && data.data) {
      console.log("🚀 Lote de Declaración recibido:", data.data);
      const queue = (data.data.clients || []).map(c => ({
        ruc: c.ruc,
        password: c.sriPassword || c.password,
        name: c.name,
        period: c.period || undefined
      }));
      
      let periodToUse = extractPeriodFromData(data.data);
      if (queue.length > 0 && queue[0].period && /^\d{4}-\d{2}$/.test(queue[0].period)) {
        const parts = queue[0].period.split('-');
        periodToUse = { year: parseInt(parts[0], 10), monthIndex: parseInt(parts[1], 10) - 1 };
      }
      if (!periodToUse) {
        const now = new Date();
        let cMonth = now.getMonth() - 1;
        let cYear = now.getFullYear();
        if (cMonth < 0) { cMonth = 11; cYear--; }
        periodToUse = { year: cYear, monthIndex: cMonth };
      }

      const payload = {
        auto_batch_enabled: true,
        auto_batch_queue: queue,
        auto_batch_index: 0,
        auto_batch_period: periodToUse,
        auto_batch_mode: 'turbo_step1_facturas',
        pendingAction: 'verifyProfile',
        workflowPeriod: periodToUse,
        actionTimestamp: Date.now(),
        sri_master_switch_on: true,
        sri_auto_mode: true,
        autoDeclaration: true,
        sriAutomationPaused: false,
        sc_loop: {
          estado: 'CORRIENDO',
          cola: queue,
          indice: 0,
          periodo: periodToUse,
          latido: Date.now(),
          motivo: 'Iniciado desde Web SantiagoCordova.com (Cadena)',
          paso: false,
          ultimaFase: ''
        }
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
        payload.accionDeQuien = queue[0].ruc;
      }

      chrome.storage.local.set(payload, () => {
        console.log("✅ Lote guardado en storage de Nueva Luz 3.0 con sc_loop CORRIENDO.");
        if (!data.data.portalAlreadyOpened) {
          window.open('https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT', '_blank');
        }
      });
    }

    if (data.type === 'SRI_RESUME_BATCH') {
      console.log("▶️ [SC PRO Bridge] Orden de reanudación de lote recibida desde Web...");
      chrome.storage.local.get(['sc_loop', 'auto_batch_queue', 'auto_batch_index', 'sc_declaraciones_locales'], (st) => {
        const loop = st.sc_loop || {};
        const queue = loop.cola || st.auto_batch_queue || [];
        if (!queue.length) {
          console.warn("⚠️ [SC PRO Bridge] No hay cola previa para reanudar.");
          return;
        }

        let idx = typeof loop.indice === 'number' ? loop.indice : (st.auto_batch_index || 0);
        const decls = st.sc_declaraciones_locales || {};
        const p = loop.periodo || { year: new Date().getFullYear(), monthIndex: new Date().getMonth() - 1 };
        const pStr = typeof p === 'string' ? p : `${p.year}-${String((p.monthIndex || 0) + 1).padStart(2, '0')}`;

        while (idx < queue.length) {
          const c = queue[idx];
          if (c && c.ruc && decls[`${c.ruc}_${pStr}`]) {
            idx++;
          } else {
            break;
          }
        }

        if (idx >= queue.length) {
          console.log("🏁 [SC PRO Bridge] Todos los clientes de la cola ya fueron declarados.");
          return;
        }

        const cliente = queue[idx];
        const patch = {
          auto_batch_enabled: true,
          auto_batch_queue: queue,
          auto_batch_index: idx,
          sri_master_switch_on: true,
          sri_auto_mode: true,
          autoDeclaration: true,
          sriAutomationPaused: false,
          pendingAction: 'verifyProfile',
          workflowPeriod: p,
          actionTimestamp: Date.now(),
          pending_sri_autofill: {
            ruc: cliente.ruc,
            password: cliente.password || cliente.sriPassword || '',
            name: cliente.name || 'Cliente SRI',
            timestamp: Date.now(),
            manual: true,
            isBatch: true
          },
          accionDeQuien: cliente.ruc,
          sc_loop: {
            ...loop,
            estado: 'CORRIENDO',
            cola: queue,
            indice: idx,
            periodo: p,
            latido: Date.now(),
            motivo: 'Reanudado desde Dashboard Web tras desconexión/pausa',
            paso: false
          }
        };

        chrome.storage.local.set(patch, () => {
          console.log(`✅ [SC PRO Bridge] Lote reanudado en cliente ${idx + 1}/${queue.length}: ${cliente.name || cliente.ruc}`);
          window.open('https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT', '_blank');
        });
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

    const p = { year: cYear, monthIndex: cMonth };
    chrome.storage.local.set({
      pending_sri_autofill: {
        ruc: e.detail.ruc,
        password: e.detail.password || e.detail.sriPassword || '',
        name: e.detail.name || 'Cliente SRI',
        timestamp: Date.now(),
        manual: true
      },
      accionDeQuien: e.detail.ruc,
      pendingAction: 'verifyProfile',
      workflowPeriod: p,
      actionTimestamp: Date.now(),
      sri_master_switch_on: true,
      sri_auto_mode: true,
      autoDeclaration: true,
      sriAutomationPaused: false,
      sc_loop: {
        estado: 'CORRIENDO',
        cola: [{ ruc: e.detail.ruc, name: e.detail.name || 'Cliente SRI', password: e.detail.password || e.detail.sriPassword || '' }],
        indice: 0,
        periodo: p,
        latido: Date.now(),
        motivo: 'Iniciado vía sriAutofillReady',
        paso: false,
        ultimaFase: ''
      }
    });
  }
});

// 📢 Sincronización en tiempo real: cuando el robot en el portal del SRI termina una declaración y guarda el PDF,
// este listener captura el evento y lo retransmite al dashboard de SantiagoCordova.com sin requerir recargar la página.
try {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.last_declaration_completed && changes.last_declaration_completed.newValue) {
        const item = changes.last_declaration_completed.newValue;
        console.log("📢 [SC PRO Bridge] Retransmitiendo comprobante completado a la web:", item.ruc, item.period);
        window.postMessage({
          source: 'SC_PRO_EXTENSION',
          type: 'SRI_DECLARATION_COMPLETED_SYNC',
          data: item
        }, '*');
      }
      if (area === 'local' && changes.sc_telemetria_pulso && changes.sc_telemetria_pulso.newValue) {
        const pulso = changes.sc_telemetria_pulso.newValue;
        try {
          localStorage.setItem('sc_ultimo_pulso_rpa', JSON.stringify(pulso));
        } catch (e) {}
        window.postMessage({
          source: 'SC_PRO_EXTENSION',
          type: 'SRI_TELEMETRY_PULSE',
          data: pulso
        }, '*');
      }
    });
  }
} catch (e) {
  console.warn("⚠️ [SC PRO Bridge] No se pudo inicializar storage.onChanged:", e);
}

