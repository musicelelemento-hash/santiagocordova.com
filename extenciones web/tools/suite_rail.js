/* ============================================================
   SC PRO SUITE · riel del popup
   ------------------------------------------------------------
   El popup de la suite ES el panel de Nueva Luz 3.0 (el cockpit
   del IVA). Este archivo le agrega un botón junto al menú ☰ para
   llegar a los otros tres módulos desde el mismo lugar.

   Dos decisiones de diseño:
   1. No se toca una línea del popup original: se inyecta DOM y
      CSS desde acá. Si mañana cambia el header de Nueva Luz y el
      anclaje falla, el riel se cae solo y el popup sigue andando.
   2. No se reutilizan los popups de 02/03/04. Esos popups hablan
      con "la pestaña activa del navegador" (chrome.tabs.query con
      currentWindow) y dentro de otro popup ese destinatario pasa a
      ser el propio popup: navegarían la ventana equivocada. Los
      cuatro módulos ya montan su interfaz dentro de la página del
      SRI, así que acá sólo hace falta llevar a la persona al
      portal correcto y decirle en qué estado está cada módulo.

   Generado desde tools/suite_rail.js — el constructor lo copia
   tal cual. No editar dentro de suite/.
   ============================================================ */
(function () {
  'use strict';

  // Tiene que coincidir con VERSION_SUITE de tools/construir_suite.mjs.
  const VERSION_SUITE = '4.2.0';

  // Un módulo por fila. `ruta` es lo que tiene que aparecer en el
  // path del portal para considerar que ya está en la página del
  // módulo; sin `ruta` alcanza con estar en el dominio.
  const MODULOS = [
    {
      id: '01',
      emoji: '⚡',
      nombre: 'IVA & Robot SRI',
      pista: 'Declaración mensual, lote y 16 herramientas',
      hosts: ['srienlinea.sri.gob.ec'],
      ruta: null,
      abrir: 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT'
    },
    {
      id: '02',
      emoji: '🔑',
      nombre: 'Claves SRI & Ecuafact',
      pista: 'Sugiere la clave nueva (* → @) y la sincroniza',
      hosts: ['srienlinea.sri.gob.ec', 'app.ecuafact.com', 'ecuafact.com'],
      ruta: null,
      abrir: 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT'
    },
    {
      id: '03',
      emoji: '📑',
      nombre: 'Anexo Gastos Personales',
      pista: 'Clasifica por rubro y respeta los topes',
      hosts: ['sriservicios.sri.gob.ec', 'srienlinea.sri.gob.ec'],
      ruta: 'anexo-gastos-personales',
      abrir: 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=101&idGrupo=98'
    },
    {
      id: '04',
      emoji: '💎',
      nombre: 'Anulador de Comprobantes',
      pista: 'Lee los PDFs y llena la solicitud de anulación',
      hosts: ['srienlinea.sri.gob.ec'],
      ruta: 'anulacion',
      abrir: 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=61&idGrupo=58'
    }
  ];

  const ESTILOS = `
    .scs-panel {
      position: fixed; top: 54px; right: 12px; width: 330px;
      background: var(--bg-surface, #0b1c2e);
      border: 1px solid var(--border-highlight, rgba(255,255,255,.16));
      border-radius: 12px;
      box-shadow: 0 18px 44px rgba(0,0,0,.55);
      z-index: 70; display: none; overflow: hidden;
      font-family: 'Manrope', system-ui, sans-serif;
    }
    .scs-panel[data-abierto="si"] { display: block; }
    .scs-cab {
      display: flex; align-items: baseline; gap: 6px;
      padding: 9px 12px 7px; border-bottom: 1px solid var(--border, rgba(255,255,255,.09));
    }
    .scs-cab b { font-size: 11px; font-weight: 800; letter-spacing: .02em; color: var(--text-main, #f8fafc); text-transform: uppercase; }
    .scs-cab span { font-size: 9.5px; color: var(--tenue, #64748b); font-family: 'JetBrains Mono', monospace; }
    .scs-fila {
      display: grid; grid-template-columns: 22px 1fr auto; gap: 8px;
      align-items: center; padding: 7px 12px; border-bottom: 1px solid rgba(255,255,255,.05);
    }
    .scs-fila:last-of-type { border-bottom: 0; }
    .scs-emoji { font-size: 15px; line-height: 1; text-align: center; }
    .scs-txt { min-width: 0; }
    .scs-nombre { font-size: 11.5px; font-weight: 700; color: var(--text-main, #f8fafc); }
    .scs-pista { font-size: 9.5px; color: var(--text-dim, #94a3b8); margin-top: 1px; }
    .scs-estado { font-size: 8.5px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; margin-top: 3px; }
    .scs-estado[data-e="aqui"] { color: #4edea3; }
    .scs-estado[data-e="portal"] { color: #ffb95f; }
    .scs-estado[data-e="fuera"], .scs-estado[data-e="sistema"],
    .scs-estado[data-e="sin-datos"] { color: #64748b; }
    .scs-accion {
      font-family: 'Manrope', system-ui, sans-serif; font-size: 10px; font-weight: 800;
      padding: 5px 9px; border-radius: 7px; cursor: pointer; white-space: nowrap;
      border: 1px solid var(--border-highlight, rgba(255,255,255,.16));
      background: rgba(255,255,255,.05); color: var(--text-main, #f8fafc);
      transition: background .15s;
    }
    .scs-accion:hover { background: rgba(78,222,163,.16); border-color: rgba(78,222,163,.45); }
    .scs-pie {
      display: flex; align-items: center; justify-content: space-between;
      padding: 7px 12px; border-top: 1px solid var(--border, rgba(255,255,255,.09));
      background: rgba(0,0,0,.18);
    }
    .scs-pie button {
      font-family: 'Manrope', system-ui, sans-serif; font-size: 10px; font-weight: 700;
      background: transparent; border: 0; color: var(--text-dim, #94a3b8); cursor: pointer; padding: 2px 0;
    }
    .scs-pie button:hover { color: var(--text-main, #f8fafc); }
    .scs-pie small { font-size: 9px; color: var(--tenue, #64748b); font-family: 'JetBrains Mono', monospace; }
    .scs-btn[aria-expanded="true"] { background: rgba(78,222,163,.16); color: #4edea3; }
  `;

  // ── Utilidades ────────────────────────────────────────────

  const esSistema = (url) => !url || /^(chrome|edge|about|chrome-extension|devtools):/i.test(url);

  function hostDe(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
  }

  function rutaDe(url) {
    try { return new URL(url).pathname.toLowerCase(); } catch (e) { return ''; }
  }

  /**
   * Estado real del módulo en la pestaña que se está mirando. No
   * adivina por la extensión instalada (la suite está siempre), sino
   * por la URL: es exactamente la condición que usan los
   * content_scripts para inyectarse.
   */
  function estado(modulo, url) {
    if (!url) return 'sin-datos';
    if (esSistema(url)) return 'sistema';
    const host = hostDe(url);
    if (!host || !modulo.hosts.includes(host)) return 'fuera';
    if (modulo.ruta && !rutaDe(url).includes(modulo.ruta)) return 'portal';
    return 'aqui';
  }

  const ETIQUETA = {
    aqui: '● en esta pestaña',
    portal: '○ en el portal, falta entrar',
    fuera: '○ en otra pestaña',
    sistema: '○ no aplica acá',
    'sin-datos': '○ sin datos de la pestaña'
  };

  /**
   * La pestaña que la persona estaba mirando cuando abrió el popup.
   *
   * `currentWindow` no sirve desde un popup: ahí la ventana actual es el
   * propio popup. Se pregunta por la última ventana NORMAL del navegador,
   * que es la que tiene el SRI abierto.
   */
  function pestañaActiva() {
    return new Promise((resolve) => {
      const porVentanaNormal = () => {
        try {
          chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (win) => {
            if (chrome.runtime.lastError || !win || win.id === undefined) return porUltimoFoco();
            chrome.tabs.query({ active: true, windowId: win.id }, (tabs) => {
              if (chrome.runtime.lastError || !tabs || !tabs.length) return porUltimoFoco();
              resolve(tabs[0]);
            });
          });
        } catch (e) { porUltimoFoco(); }
      };

      function porUltimoFoco() {
        try {
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || !tabs.length) return resolve(null);
            resolve(tabs[0]);
          });
        } catch (e) { resolve(null); }
      }

      porVentanaNormal();
    });
  }

  function abrirModulo(modulo, tab, estadoActual) {
    if (estadoActual === 'aqui' && tab && tab.id >= 0) {
      // Ya está en la página del módulo: traer la pestaña al frente.
      try { chrome.tabs.update(tab.id, { active: true }); } catch (e) { /* sin pestaña */ }
      window.close();
      return;
    }
    try { chrome.tabs.create({ url: modulo.abrir }); } catch (e) { /* sin permiso */ }
    window.close();
  }

  // ── Construcción del riel ─────────────────────────────────

  function montar() {
    const ancla = document.getElementById('btnMenu');
    if (!ancla || !ancla.parentElement) return null;   // header desconocido: no se toca nada

    const boton = document.createElement('button');
    boton.id = 'scsBtn';
    boton.className = 'icon-btn scs-btn';
    boton.type = 'button';
    boton.title = `Suite SC PRO v${VERSION_SUITE} — los cuatro módulos en una extensión`;
    boton.setAttribute('aria-label', 'Abrir la suite');
    boton.setAttribute('aria-expanded', 'false');
    boton.textContent = '🧰';
    ancla.parentElement.insertBefore(boton, ancla);

    const panel = document.createElement('div');
    panel.className = 'scs-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Módulos de la suite');
    document.body.appendChild(panel);

    boton.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const abierto = panel.dataset.abierto === 'si';
      if (abierto) { cerrar(); return; }
      pintar(panel, boton);
    });

    document.addEventListener('click', (ev) => {
      if (!panel.contains(ev.target) && ev.target !== boton && !boton.contains(ev.target)) {
        if (panel.dataset.abierto === 'si') cerrar();
      }
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && panel.dataset.abierto === 'si') cerrar();
    });

    function cerrar() {
      panel.dataset.abierto = 'no';
      boton.setAttribute('aria-expanded', 'false');
    }

    return { panel, boton };
  }

  function pintar(panel, boton) {
    pestañaActiva().then((tab) => {
      const url = tab ? tab.url : '';
      const partes = [];

      partes.push(`<div class="scs-cab"><b>Suite SC PRO</b><span>v${VERSION_SUITE} · 4 módulos</span></div>`);

      MODULOS.forEach((m) => {
        const e = estado(m, url);
        const accion = e === 'aqui' ? 'Ver panel' : 'Abrir';
        partes.push(`
          <div class="scs-fila">
            <div class="scs-emoji">${m.emoji}</div>
            <div class="scs-txt">
              <div class="scs-nombre">${m.nombre}</div>
              <div class="scs-pista">${m.pista}</div>
              <div class="scs-estado" data-e="${e}">${ETIQUETA[e]}</div>
            </div>
            <button class="scs-accion" type="button" data-modulo="${m.id}">${accion}</button>
          </div>`);
      });

      partes.push(`
        <div class="scs-pie">
          <button type="button" id="scsAjustes">⚙ Ajustes y claves</button>
          <small>SC PRO</small>
        </div>`);

      panel.innerHTML = partes.join('');
      panel.dataset.abierto = 'si';
      boton.setAttribute('aria-expanded', 'true');

      panel.querySelectorAll('[data-modulo]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const m = MODULOS.find((x) => x.id === btn.getAttribute('data-modulo'));
          if (m) abrirModulo(m, tab, estado(m, url));
        });
      });

      const ajustes = panel.querySelector('#scsAjustes');
      if (ajustes) {
        ajustes.addEventListener('click', (ev) => {
          ev.stopPropagation();
          try {
            if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
            else chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
          } catch (e) { /* sin options */ }
          window.close();
        });
      }
    });
  }

  // ── Arranque ──────────────────────────────────────────────

  function iniciar() {
    const estilo = document.createElement('style');
    estilo.id = 'scsEstilos';
    estilo.textContent = ESTILOS;
    (document.head || document.documentElement).appendChild(estilo);

    const riel = montar();
    // Sin anclaje no hay botón. El popup de Nueva Luz queda intacto y en
    // consola queda el motivo, que es lo único accionable.
    if (!riel) console.warn('[SUITE] No encontré el header del popup (#btnMenu): riel sin montar.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
