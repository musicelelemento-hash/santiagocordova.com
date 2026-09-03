function transformPassword(oldPass) {
  if (!oldPass) return '';
  const trimmed = oldPass.trim();
  if (trimmed.endsWith('@')) return trimmed;
  return trimmed + '@';
}

document.addEventListener('DOMContentLoaded', async () => {
  const rucEl = document.getElementById('popup-ruc');
  const oldEl = document.getElementById('popup-old-pass');
  const newEl = document.getElementById('popup-new-pass');

  const tabActiveBtn = document.getElementById('tab-active-btn');
  const tabConfigBtn = document.getElementById('tab-config-btn');
  const tabActiveContent = document.getElementById('tab-active-content');
  const tabConfigContent = document.getElementById('tab-config-content');

  const urlInput = document.getElementById('cfg-supabase-url');
  const keyInput = document.getElementById('cfg-supabase-key');
  const saveBtn = document.getElementById('btn-save-supabase');
  const syncBtn = document.getElementById('btn-sync-cloud-now');
  const statusMsg = document.getElementById('cfg-status-msg');

  // Tabs logic
  tabActiveBtn.addEventListener('click', () => {
    tabActiveBtn.classList.add('active');
    tabConfigBtn.classList.remove('active');
    tabActiveContent.classList.add('active');
    tabConfigContent.classList.remove('active');
  });

  tabConfigBtn.addEventListener('click', () => {
    tabConfigBtn.classList.add('active');
    tabActiveBtn.classList.remove('active');
    tabConfigContent.classList.add('active');
    tabActiveContent.classList.remove('active');
  });

  // Load active client data
  chrome.storage.local.get(['pending_sri_change', 'pending_sri_autofill', 'active_processing_client', 'sc_ordered_matrix', 'sc_current_matrix_index'], (result) => {
    const active = result.active_processing_client;
    const pending = result.pending_sri_change || result.pending_sri_autofill;
    const matrix = result.sc_ordered_matrix || [];
    const idx = result.sc_current_matrix_index || 0;
    const currentFromMatrix = matrix[idx];

    const data = active || pending || currentFromMatrix;

    if (data) {
      if (rucEl) rucEl.innerText = data.ruc || 'N/D';
      if (oldEl) oldEl.innerText = data.oldPassword || data.sriPassword || data.password || 'N/D';
      
      const oldP = data.oldPassword || data.sriPassword || data.password || '';
      const newP = data.newPassword || transformPassword(oldP);
      if (newEl) newEl.innerText = newP || 'N/D';
    } else {
      if (rucEl) rucEl.innerText = 'Sin cliente activo';
    }
  });

  // Load Supabase Config
  if (typeof getSupabaseConfig === 'function') {
    const cfg = await getSupabaseConfig();
    if (cfg.url && !cfg.url.includes('dummy')) urlInput.value = cfg.url;
    if (cfg.key && !cfg.key.includes('dummy')) keyInput.value = cfg.key;
  }

  // Save & Test Supabase Config
  saveBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();

    if (!url || !key) {
      statusMsg.style.color = '#ef4444';
      statusMsg.innerText = '⚠️ Ingrese URL y Anon Key de Supabase.';
      return;
    }

    statusMsg.style.color = '#fbbf24';
    statusMsg.innerText = '⏳ Probando conexión con Supabase Nube...';

    const testRes = await testSupabaseConnection(url, key);

    if (testRes.success) {
      chrome.storage.sync.set({ sc_supabase_url: url, sc_supabase_key: key });
      chrome.storage.local.set({ sc_supabase_url: url, sc_supabase_key: key });
      statusMsg.style.color = '#10b981';
      statusMsg.innerText = '✅ ¡Conexión Exitosa! Guardado en la Extensión.';

      // Immediately fetch clients
      if (typeof fetchClientsFromSupabase === 'function') {
        const clients = await fetchClientsFromSupabase();
        if (clients && clients.length > 0) {
          const matrixMap = {};
          const mensList = [];
          const semesList = [];

          clients.forEach(c => {
            if (c.ruc && c.sriPassword) {
              matrixMap[c.ruc] = c;
              if ((c.ivaFrequency || '').toLowerCase().includes('semestral')) semesList.push(c);
              else mensList.push(c);
            }
          });

          const orderedList = [...mensList, ...semesList];
          chrome.storage.local.set({
            sc_clients_matrix: matrixMap,
            sc_ordered_matrix: orderedList,
            matrix_updated_at: Date.now()
          });
          statusMsg.innerText = `✅ Sincronizados ${orderedList.length} clientes desde Nube.`;
        }
      }
    } else {
      statusMsg.style.color = '#ef4444';
      statusMsg.innerText = `❌ ${testRes.message}`;
    }
  });

  // Sync Cloud Now Button
  syncBtn.addEventListener('click', async () => {
    if (typeof fetchClientsFromSupabase === 'function') {
      const clients = await fetchClientsFromSupabase();
      if (clients && clients.length > 0) {
        const matrixMap = {};
        const mensList = [];
        const semesList = [];

        clients.forEach(c => {
          if (c.ruc && c.sriPassword) {
            matrixMap[c.ruc] = c;
            if ((c.ivaFrequency || '').toLowerCase().includes('semestral')) semesList.push(c);
            else mensList.push(c);
          }
        });

        const orderedList = [...mensList, ...semesList];
        chrome.storage.local.set({
          sc_clients_matrix: matrixMap,
          sc_ordered_matrix: orderedList,
          matrix_updated_at: Date.now()
        }, () => {
          alert(`✅ Sincronización Nube Completa: ${orderedList.length} clientes descargados.`);
          window.location.reload();
        });
      } else {
        alert('⚠️ No se pudieron descargar clientes. Revisa tu conexión Supabase en la pestaña Configuración ⚙️');
      }
    }
  });

  document.getElementById('btn-open-sri').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT' });
  });

  document.getElementById('btn-copy-new').addEventListener('click', () => {
    const newPass = newEl.innerText;
    if (newPass && newPass !== '-') {
      navigator.clipboard.writeText(newPass);
      alert('📋 Nueva clave copiada: ' + newPass);
    }
  });
});
