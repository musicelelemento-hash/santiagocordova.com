/**
 * ⚡ SC TaxPilot PRO — Zifact Auto-Login Agent
 * Automatización táctica para acceso en 1-clic a https://zifact.com/login
 */

(function () {
  'use strict';

  console.log("⚡ [SC TaxPilot PRO] Zifact Auto-Login Agent activo en", window.location.href);

  // Selector cache
  const SELECTORS = {
    username: '#login-username, input[name="_username"], input.input100[type="text"]',
    password: '#login-password, input[name="_password"], input.input100[type="password"]',
    submit: 'button.login100-form-btn, button[type="submit"], .login100-form-btn'
  };

  function showBanner(message, type = 'info') {
    let existing = document.getElementById('sc-zifact-hud');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'sc-zifact-hud';
    const borderColor = type === 'success' ? '#4edea3' : type === 'warning' ? '#ffb95f' : '#38bdf8';
    banner.setAttribute('style', `
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999999;
      background: rgba(5, 20, 36, 0.95);
      backdrop-filter: blur(14px);
      border: 1px solid ${borderColor};
      color: #f8fafc;
      padding: 10px 22px;
      border-radius: 9999px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.65), 0 0 20px ${borderColor}40;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      pointer-events: none;
      transition: all 0.3s ease;
    `);

    banner.innerHTML = `
      <span style="font-size: 16px; display: inline-block; animation: pulse 1s infinite;">⚡</span>
      <span>${message}</span>
    `;

    document.body.appendChild(banner);

    if (type !== 'info') {
      setTimeout(() => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateX(-50%) translateY(-10px)';
        setTimeout(() => banner.remove(), 400);
      }, 4000);
    }
  }

  function escribirValor(input, valor) {
    if (!input) return;
    input.focus();
    input.value = valor;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function intentarLogin(username, password, clientName) {
    let attempts = 0;
    const maxAttempts = 35; // ~7 segundos max

    showBanner(`⚡ SC TaxPilot PRO: Autocompletando credenciales para <b>${clientName || username}</b>...`);

    const interval = setInterval(() => {
      attempts++;
      const userEl = document.querySelector(SELECTORS.username);
      const passEl = document.querySelector(SELECTORS.password);
      const btnEl = document.querySelector(SELECTORS.submit);

      if (userEl && passEl) {
        clearInterval(interval);
        console.log("⚡ [SC TaxPilot PRO] Formulario detectado. Escribiendo credenciales...");

        escribirValor(userEl, username);
        escribirValor(passEl, password);

        // Limpiar la orden en storage para evitar bucles si la clave fuese errónea
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove(['sc_zifact_pending_login']);
        }

        showBanner(`✅ Credenciales aplicadas. Iniciando sesión...`, 'success');

        setTimeout(() => {
          if (btnEl) {
            console.log("🚀 [SC TaxPilot PRO] Pulsando botón 'Iniciar Sesión'...");
            btnEl.click();
          } else {
            const form = userEl.closest('form');
            if (form) form.submit();
          }
        }, 400);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn("⚠️ [SC TaxPilot PRO] No se encontraron los campos de login en zifact.com.");
        showBanner(`⚠️ No se detectaron los campos de usuario/contraseña en esta pantalla.`, 'warning');
      }
    }, 200);
  }

  function revisarStorageYHash() {
    // 1. Revisar primero si hay credenciales en hash URL (#autologin=base64)
    if (window.location.hash && window.location.hash.includes('autologin=')) {
      try {
        const raw = window.location.hash.split('autologin=')[1].split('&')[0];
        const decoded = JSON.parse(decodeURIComponent(escape(atob(raw))));
        if (decoded.username && decoded.password) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
          intentarLogin(decoded.username, decoded.password, decoded.clientName);
          return;
        }
      } catch (err) {
        console.error("Error parseando hash autologin:", err);
      }
    }

    // 2. Revisar almacenamiento local de la extensión
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['sc_zifact_pending_login', 'sc_clients_cache'], (res) => {
        const pending = res?.sc_zifact_pending_login;
        if (pending && pending.username && pending.password) {
          const edad = Date.now() - (pending.timestamp || 0);
          if (edad < 180000) { // Menor a 3 minutos
            intentarLogin(pending.username, pending.password, pending.clientName);
          } else {
            chrome.storage.local.remove(['sc_zifact_pending_login']);
          }
        }

        // Inyectar mini-lanzador flotante para acceso táctico
        inyectarLanzadorRapido(res?.sc_clients_cache || []);
      });
    }
  }

  // Mini-Widget Flotante para cuando entras directo a zifact.com/login
  function inyectarLanzadorRapido(clients) {
    if (document.getElementById('sc-zifact-quick-dock')) return;

    // Filtrar clientes que usan Zifact o tienen credenciales
    const zifactClients = (clients || []).filter(c => {
      const p = (c.billingPlan?.programName || c.facturadorConfig?.programName || '').toLowerCase();
      const planPass = c.billingPlan?.password || c.facturadorConfig?.password;
      return p.includes('zifac') || (planPass && planPass.length > 0);
    });

    if (zifactClients.length === 0) return;

    const dock = document.createElement('div');
    dock.id = 'sc-zifact-quick-dock';
    dock.setAttribute('style', `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `);

    dock.innerHTML = `
      <div id="sc-zifact-dock-panel" style="display: none; width: 280px; max-height: 340px; background: #051424; border: 1px solid rgba(78, 222, 163, 0.3); border-radius: 16px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); overflow: hidden; margin-bottom: 12px; flex-direction: column;">
        <div style="padding: 12px 14px; background: rgba(78, 222, 163, 0.1); border-bottom: 1px solid rgba(78, 222, 163, 0.2); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 11px; font-weight: 800; color: #4edea3; letter-spacing: 0.5px; text-transform: uppercase;">
            ⚡ SC TaxPilot · Clientes Zifact
          </div>
          <span style="font-size: 10px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 10px; color: #94a3b8; font-weight: bold;">
            ${zifactClients.length}
          </span>
        </div>
        <div id="sc-zifact-client-list" style="overflow-y: auto; max-height: 280px; padding: 6px;"></div>
      </div>
      <button id="sc-zifact-dock-toggle" style="background: linear-gradient(135deg, #051424, #0b253d); border: 1px solid #4edea3; color: #4edea3; width: 44px; height: 44px; border-radius: 50%; box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 12px rgba(78,222,163,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; transition: transform 0.2s;" title="SC TaxPilot: Lista Rápida Zifact">
        ⚡
      </button>
    `;

    document.body.appendChild(dock);

    const toggle = document.getElementById('sc-zifact-dock-toggle');
    const panel = document.getElementById('sc-zifact-dock-panel');
    const list = document.getElementById('sc-zifact-client-list');

    let open = false;
    toggle.addEventListener('click', () => {
      open = !open;
      panel.style.display = open ? 'flex' : 'none';
      toggle.style.transform = open ? 'rotate(90deg)' : 'none';
    });

    zifactClients.forEach(c => {
      const plan = c.billingPlan || c.facturadorConfig || {};
      const user = plan.username || c.ruc;
      const pwd = plan.password || c.sriPassword;

      const item = document.createElement('div');
      item.setAttribute('style', `
        padding: 8px 10px;
        border-radius: 8px;
        margin-bottom: 4px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: background 0.15s;
      `);
      item.innerHTML = `
        <div style="font-size: 11px; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${c.tradeName || c.name}
        </div>
        <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">
          ${user}
        </div>
      `;

      item.addEventListener('mouseenter', () => item.style.background = 'rgba(78, 222, 163, 0.15)');
      item.addEventListener('mouseleave', () => item.style.background = 'rgba(255, 255, 255, 0.03)');
      item.addEventListener('click', () => {
        panel.style.display = 'none';
        open = false;
        intentarLogin(user, pwd, c.tradeName || c.name);
      });

      list.appendChild(item);
    });
  }

  // Inicialización
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revisarStorageYHash);
  } else {
    revisarStorageYHash();
  }
})();
