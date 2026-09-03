// Supabase Direct REST API Client for SC PRO Chrome Extension Extractor V1
const SC_SUPABASE_DEFAULT_URL = "https://afssvsxlxiwqgtcgvqxp.supabase.co";
const SC_SUPABASE_DEFAULT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmc3N2c3hseGl3cWd0Y2d2cXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzY1ODgsImV4cCI6MjA4OTIxMjU4OH0.pLqgC4_5dVEOV2Bgfwa14Ib2PbVfz6QmSnSIEKfRZ9I";

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
    return 3;
  } else if (freq.includes('semestral') || regime.includes('emprendedor')) {
    return 2;
  } else {
    return 1;
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

async function fetchClientsFromSupabase() {
  const endpoint = `${SC_SUPABASE_DEFAULT_URL}/rest/v1/clients?is_deleted=eq.false&select=id,name,trade_name,ruc,sri_password,declaration_history,tax_profile,regime`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'apikey': SC_SUPABASE_DEFAULT_KEY,
        'Authorization': `Bearer ${SC_SUPABASE_DEFAULT_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("⚠️ [SC PRO Supabase] HTTP error", response.status);
      return getCachedClientsFromStorage();
    }

    const data = await response.json();

    const mapped = data.map(item => ({
      id: item.id,
      name: item.name,
      tradeName: item.trade_name,
      ruc: (item.ruc || '').trim(),
      sriPassword: item.sri_password || '',
      declarations: (item.declaration_history || []).map(d => ({ period: d.period, status: d.status, proof_file: !!d.proof_file })),
      ivaFrequency: item.tax_profile?.ivaFrequency || (item.regime?.includes('EMPRENDEDOR') ? 'Semestral' : (item.regime?.includes('POPULAR') ? 'Ninguno' : 'Mensual')),
      regime: item.regime || ''
    }));

    const sorted = sortClientsMatrix(mapped);

    const matrixMap = {};
    sorted.forEach(c => { if (c.ruc) matrixMap[c.ruc] = c; });

    chrome.storage.local.set({
      sc_clients_matrix: matrixMap,
      sc_ordered_matrix: sorted,
      matrix_updated_at: Date.now()
    });

    return sorted;
  } catch (err) {
    console.warn("⚠️ [SC PRO Supabase] Excepción/Timeout:", err.message);
    return getCachedClientsFromStorage();
  }
}

async function getCachedClientsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sc_ordered_matrix', 'sc_clients_matrix'], (data) => {
      const cached = data.sc_ordered_matrix || (data.sc_clients_matrix ? Object.values(data.sc_clients_matrix) : []);
      resolve(cached || []);
    });
  });
}

async function saveDeclarationToSupabase(ruc, period, status = 'Declarado', proofFileObj = null) {
  if (!ruc || !period) return false;
  try {
    const cleanRuc = ruc.trim();
    const getEndpoint = `${SC_SUPABASE_DEFAULT_URL}/rest/v1/clients?ruc=eq.${encodeURIComponent(cleanRuc)}&is_deleted=eq.false&select=id,declaration_history`;
    const getRes = await fetch(getEndpoint, {
      method: 'GET',
      headers: {
        'apikey': SC_SUPABASE_DEFAULT_KEY,
        'Authorization': `Bearer ${SC_SUPABASE_DEFAULT_KEY}`
      }
    });

    if (!getRes.ok) return false;
    const rows = await getRes.json();
    if (!rows || rows.length === 0) return false;

    const clientObj = rows[0];
    let history = Array.isArray(clientObj.declaration_history) ? [...clientObj.declaration_history] : [];
    const nowIso = new Date().toISOString();

    const newEntry = {
      type: 'IVA',
      period: period,
      status: status,
      is_paid: true,
      declaredAt: nowIso,
      updated_at: nowIso,
      proof_file: proofFileObj || { name: `declaracion_iva_${period}_${cleanRuc}.pdf`, date: nowIso }
    };

    const existingIdx = history.findIndex(d => d.period === period && (d.type === 'IVA' || !d.type));
    if (existingIdx >= 0) {
      history[existingIdx] = { ...history[existingIdx], ...newEntry };
    } else {
      history.push(newEntry);
    }

    const patchEndpoint = `${SC_SUPABASE_DEFAULT_URL}/rest/v1/clients?id=eq.${clientObj.id}`;
    const patchRes = await fetch(patchEndpoint, {
      method: 'PATCH',
      headers: {
        'apikey': SC_SUPABASE_DEFAULT_KEY,
        'Authorization': `Bearer ${SC_SUPABASE_DEFAULT_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        declaration_history: history,
        updated_at: nowIso
      })
    });

    if (patchRes.ok) {
      console.log(`✅ [SC PRO Supabase] Declaración ${period} guardada exitosamente en web para RUC ${cleanRuc}`);
      fetchClientsFromSupabase();
      return true;
    }
  } catch (err) {
    console.error("❌ Error guardando declaración en Supabase:", err);
  }
  return false;
}

async function saveClientPasswordToSupabase(ruc, password) {
  if (!ruc || !password || password.length < 3) return false;
  try {
    const cleanRuc = ruc.trim();
    const endpoint = `${SC_SUPABASE_DEFAULT_URL}/rest/v1/clients?ruc=eq.${encodeURIComponent(cleanRuc)}`;
    const patchRes = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'apikey': SC_SUPABASE_DEFAULT_KEY,
        'Authorization': `Bearer ${SC_SUPABASE_DEFAULT_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        sri_password: password
      })
    });

    if (patchRes.ok) {
      console.log(`✅ [SC PRO Supabase] Clave SRI actualizada en la web para RUC ${cleanRuc}`);
      return true;
    }
  } catch (err) {
    console.error("❌ Error guardando clave en Supabase:", err);
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.fetchClientsFromSupabase = fetchClientsFromSupabase;
  window.saveDeclarationToSupabase = saveDeclarationToSupabase;
  window.saveClientPasswordToSupabase = saveClientPasswordToSupabase;
}

fetchClientsFromSupabase();
// Optimizado: En lugar de consultar cada 10 segundos (agota el Egress de Supabase),
// consulta cada 10 minutos (600,000 ms).
setInterval(fetchClientsFromSupabase, 600000);

