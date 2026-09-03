// Supabase Direct REST API Client for SC PRO Chrome Extension
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

async function getSupabaseConfig() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['sc_supabase_url', 'sc_supabase_key'], (resSync) => {
        if (resSync && resSync.sc_supabase_url && resSync.sc_supabase_key) {
          resolve({ url: resSync.sc_supabase_url.trim(), key: resSync.sc_supabase_key.trim() });
        } else if (chrome.storage.local) {
          chrome.storage.local.get(['sc_supabase_url', 'sc_supabase_key'], (resLocal) => {
            if (resLocal && resLocal.sc_supabase_url && resLocal.sc_supabase_key) {
              resolve({ url: resLocal.sc_supabase_url.trim(), key: resLocal.sc_supabase_key.trim() });
            } else {
              resolve({ url: SC_SUPABASE_DEFAULT_URL, key: SC_SUPABASE_DEFAULT_KEY });
            }
          });
        } else {
          resolve({ url: SC_SUPABASE_DEFAULT_URL, key: SC_SUPABASE_DEFAULT_KEY });
        }
      });
    } else {
      resolve({ url: SC_SUPABASE_DEFAULT_URL, key: SC_SUPABASE_DEFAULT_KEY });
    }
  });
}

async function fetchClientsFromSupabase() {
  const config = await getSupabaseConfig();
  if (!config.url || !config.key) {
    console.warn("⚠️ [SC PRO Supabase] Configuración de Supabase no establecida en el Popup de la extensión.");
    return null;
  }

  const endpoint = `${config.url.replace(/\/$/, '')}/rest/v1/clients?is_deleted=eq.false&select=*`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ [SC PRO Supabase] Error al consultar clientes: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log(`✅ [SC PRO Supabase] Descargados ${data.length} clientes directamente de Supabase.`);

    const mapped = data.map(item => ({
      id: item.id,
      name: item.name,
      tradeName: item.trade_name,
      ruc: (item.ruc || '').trim(),
      sriPassword: item.sri_password || '',
      sriPasswordUpdatedAt: item.sri_password_updated_at || item.updated_at || null,
      ivaFrequency: item.tax_profile?.ivaFrequency || (item.regime?.includes('EMPRENDEDOR') ? 'Semestral' : (item.regime?.includes('POPULAR') ? 'Ninguno' : 'Mensual')),
      regime: item.regime || ''
    }));

    return sortClientsMatrix(mapped);
  } catch (err) {
    console.error("❌ [SC PRO Supabase] Excepción en fetchClientsFromSupabase:", err);
    return null;
  }
}

async function updatePasswordInSupabase(ruc, newPassword) {
  if (!ruc || !newPassword || newPassword === '-' || newPassword.includes('Sin data') || ruc.includes('Sin RUC')) return false;

  const config = await getSupabaseConfig();
  if (!config.url || !config.key) {
    console.warn("⚠️ [SC PRO Supabase] No se puede actualizar en la nube: Configuración de Supabase no establecida.");
    return false;
  }

  const rucClean = ruc.trim();
  const passClean = newPassword.trim();
  const nowIso = new Date().toISOString();
  const endpoint = `${config.url.replace(/\/$/, '')}/rest/v1/clients?ruc=eq.${encodeURIComponent(rucClean)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        sri_password: passClean,
        sri_password_updated_at: nowIso,
        updated_at: nowIso
      })
    });

    if (!response.ok) {
      console.error(`❌ [SC PRO Supabase] Falló actualización en Supabase para RUC ${rucClean}: ${response.status}`);
      return false;
    }

    console.log(`🎉 [SC PRO Supabase] Clave de RUC ${rucClean} actualizada DIRECTAMENTE en Supabase a: ${passClean}`);
    return true;
  } catch (err) {
    console.error("❌ [SC PRO Supabase] Excepción en updatePasswordInSupabase:", err);
    return false;
  }
}

async function testSupabaseConnection(url, anonKey) {
  if (!url || !anonKey) return { success: false, message: 'URL y Key son requeridos.' };
  const endpoint = `${url.trim().replace(/\/$/, '')}/rest/v1/clients?limit=1`;
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': anonKey.trim(),
        'Authorization': `Bearer ${anonKey.trim()}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      return { success: true, message: '¡Conexión exitosa a Supabase!' };
    } else {
      return { success: false, message: `Error HTTP ${res.status}: ${res.statusText}` };
    }
  } catch (e) {
    return { success: false, message: `Error de red o CORS: ${e.message}` };
  }
}
