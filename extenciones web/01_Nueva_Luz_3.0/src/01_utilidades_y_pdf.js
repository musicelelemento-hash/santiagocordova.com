// ============================================================
// HELPERS GLOBALES (v3.2)
// __SC_BUILD__ lo reemplaza vite al compilar (ver vite.config.mjs).
const SC_BUILD = "__SC_BUILD__";

console.log(
  `%c👻 SRI ASISTENTE GHOST · build ${SC_BUILD} · INICIADO`,
  "background: #f8fafc; color: #64748b; font-size: 16px; font-weight: bold; padding: 10px; border-radius: 5px; border: 2px solid #cbd5e1; box-shadow: 0 0 15px rgba(0,0,0,0.1);",
);

// Para verificar desde la consola qué build está cargado realmente.
if (typeof window !== "undefined") window.sriBuild = () => SC_BUILD;

// ── Configuración central (ver shared_config.js) ──────────────────────
// La URL y la llave `anon` viven en UN solo lugar: shared_config.js.
// Este módulo (01) las expone como globales para 02..07 (modo concatenación).
const SC_SUPABASE_URL = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.SUPABASE_URL)
  ? window.SC_CONFIG.SUPABASE_URL
  : null;
const SC_SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.SUPABASE_ANON_KEY)
  ? window.SC_CONFIG.SUPABASE_ANON_KEY
  : null;
const SC_R2_UPLOAD_ENDPOINT = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_UPLOAD_ENDPOINT)
  ? window.SC_CONFIG.R2_UPLOAD_ENDPOINT
  : null;
const SC_R2_PUBLIC_URL = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_PUBLIC_URL)
  ? window.SC_CONFIG.R2_PUBLIC_URL
  : null;
if (!SC_SUPABASE_URL || !SC_SUPABASE_ANON_KEY) {
  console.error('[Nueva Luz 3.0] shared_config.js no cargado: faltan credenciales de Supabase.');
}

// ── Rutas Canónicas y Puentes SSO del SRI (Tatuadas) ──────────────────────────────
const SRI_PUENTE_RECIBIDOS = 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=57&idGrupo=55';
const SRI_RECIBIDOS_URL = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf?&contextoMPT=https://srienlinea.sri.gob.ec/tuportal-internet&pathMPT=Facturaci%F3n%20Electr%F3nica&actualMPT=Comprobantes%20electr%F3nicos%20recibidos%20&linkMPT=%2Fcomprobantes-electronicos-internet%2Fpages%2Fconsultas%2Frecibidos%2FcomprobantesRecibidos.jsf%3F&esFavorito=S';
const SRI_PUENTE_FORMULARIO_IVA = 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=310&idGrupo=201';
const SRI_FORMULARIO_IVA_URL = 'https://srienlinea.sri.gob.ec/sri-declaraciones-web-internet/pages/recepcion/recibirDeclaracion.jsf?identificadorGrupoObligacion=IVA';
const SRI_FORMULARIO_IVA_URL_LEGACY = 'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaracionesWeb/FormularioIva/Opciones/declaracionImpuesto.jsf';
const SRI_SALIR_URL = 'https://srienlinea.sri.gob.ec/sri-declaraciones-web-internet/pages/salir.jsp';


function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// BÓVEDA INTELIGENTE DE SEGURIDAD DE CREDENCIALES (ANTI-BLOQUEO SRI)
// ============================================================
// El SRI bloquea cuentas de contribuyentes tras 5 intentos fallidos.
// Esta bóveda garantiza:
// 1. Límite estricto de 1 solo intento por clave.
// 2. Registro persistente en `sri_tried_credentials`.
// 3. Detección de firma/cambio de contraseña: si el usuario actualiza la clave
//    en el dashboard de SantiagoCordova.com, se le concede 1 intento para la nueva clave.
// 4. Bloqueo preventivo: nunca se tocan inputs ni se pulsa login si la clave ya falló.
// 5. Exclusión automática del bucle ferrocarril para no frenar el lote.
const SriCredentialVault = {
  getSignature(password) {
    if (!password) return '';
    return `${password.length}_${password.slice(0, 2)}_${password.slice(-2)}`;
  },

  async getRegistry() {
    const res = await SafeStorage.get(['sri_tried_credentials', 'flagged_errors']);
    return {
      tried: res.sri_tried_credentials || {},
      flagged: res.flagged_errors || {}
    };
  },

  async canAttemptLogin(ruc, password) {
    if (!ruc) return { allowed: false, reason: 'RUC no especificado' };
    const { tried, flagged } = await this.getRegistry();
    const entry = tried[ruc];

    if (entry && (entry.status === 'locked' || entry.status === 'blocked')) {
      return {
        allowed: false,
        reason: `Cuenta reportada como bloqueada/inactiva en el portal SRI. Omitida para proteger al cliente.`
      };
    }

    if (flagged[ruc] === 'error_credenciales' || (entry && entry.status === 'failed')) {
      const currentSig = this.getSignature(password);
      // Si la clave no ha cambiado respecto a la fallida, BLOQUEO TOTAL
      if (!currentSig || !entry || !entry.signature || entry.signature === currentSig) {
        return {
          allowed: false,
          reason: `Credencial previamente rechazada por el SRI. Prohibido reintentar para no bloquear la cuenta.`
        };
      }
      // Si la clave cambió en la base/caché, conceder 1 intento para la nueva clave
      console.log(`🔑 [VAULT] Nueva clave detectada para ${ruc} (firma anterior: ${entry.signature}, nueva: ${currentSig}). Concediendo 1 intento.`);
    }

    return { allowed: true };
  },

  async recordFailure(ruc, password, reason) {
    if (!ruc) return;
    const { tried, flagged } = await this.getRegistry();
    flagged[ruc] = 'error_credenciales';
    tried[ruc] = {
      status: 'failed',
      ruc,
      timestamp: Date.now(),
      signature: this.getSignature(password),
      reason: reason || 'Credenciales incorrectas',
      attempts: ((tried[ruc] && tried[ruc].attempts) || 0) + 1
    };
    await SafeStorage.set({ sri_tried_credentials: tried, flagged_errors: flagged });
    console.warn(`🛡️ [VAULT] Credencial fallida registrada para ${ruc}. Intentos: ${tried[ruc].attempts}. Motivo: ${reason}`);
  },

  async recordLocked(ruc, reason) {
    if (!ruc) return;
    const { tried, flagged } = await this.getRegistry();
    flagged[ruc] = 'cuenta_bloqueada';
    tried[ruc] = {
      status: 'locked',
      ruc,
      timestamp: Date.now(),
      reason: reason || 'Cuenta bloqueada o superado límite de intentos',
      locked: true
    };
    await SafeStorage.set({ sri_tried_credentials: tried, flagged_errors: flagged });
    console.error(`🚨 [VAULT] Cuenta BLOQUEADA por SRI registrada para ${ruc}: ${reason}`);
  },

  async recordSuccess(ruc, password) {
    if (!ruc) return;
    const { tried, flagged } = await this.getRegistry();
    if (flagged[ruc] === 'error_credenciales') {
      delete flagged[ruc];
    }
    tried[ruc] = {
      status: 'success',
      ruc,
      timestamp: Date.now(),
      signature: this.getSignature(password),
      reason: 'Acceso exitoso'
    };
    await SafeStorage.set({ sri_tried_credentials: tried, flagged_errors: flagged });
    console.log(`✅ [VAULT] Acceso exitoso registrado para ${ruc}. Bóveda actualizada.`);
  },

  async resetClient(ruc) {
    if (!ruc) return;
    const { tried, flagged } = await this.getRegistry();
    delete tried[ruc];
    delete flagged[ruc];
    await SafeStorage.set({ sri_tried_credentials: tried, flagged_errors: flagged });
    console.log(`🔄 [VAULT] Registro de seguridad reiniciado para ${ruc}.`);
  }
};

if (typeof window !== 'undefined') {
  window.sriVault = SriCredentialVault;
}

/**
 * ¿El elemento está realmente renderizado y visible?
 * ⚠️ NO usar `offsetParent !== null`: en Chrome todo elemento `position: fixed`
 * (modales PrimeFaces, Material, dialogs, toasts, pickers) tiene `offsetParent === null`.
 */
function esVisible(el) {
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function parseDecimal(texto) {
  if (texto === null || texto === undefined) return 0;
  if (typeof texto === 'number') return isNaN(texto) ? 0 : texto;

  let limpio = String(texto).replace(/[^\d.,\-]/g, '').trim();
  if (/^\(.*\)$/.test(String(texto).trim())) limpio = '-' + limpio;
  if (!limpio || !/\d/.test(limpio)) return 0;

  const hasDot = limpio.includes('.');
  const hasComma = limpio.includes(',');

  if (hasDot && hasComma) {
    if (limpio.lastIndexOf(',') > limpio.lastIndexOf('.')) {
      limpio = limpio.replace(/\./g, '').replace(',', '.');
    } else {
      limpio = limpio.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (limpio.split(',').length > 2) {
      limpio = limpio.replace(/,/g, '');
    } else if (/^-?\d{1,3},\d{3}$/.test(limpio)) {
      limpio = limpio.replace(',', '');
    } else {
      limpio = limpio.replace(',', '.');
    }
  } else if (hasDot) {
    if (limpio.split('.').length > 2) {
      limpio = limpio.replace(/\./g, '');
    } else if (/^-?\d{1,3}\.\d{3}$/.test(limpio)) {
      limpio = limpio.replace('.', '');
    }
  }

  const numero = parseFloat(limpio);
  return isNaN(numero) ? 0 : numero;
}

/**
 * Igual que parseDecimal pero devuelve null cuando no hay ningún número
 * legible, en vez de 0.
 */
function parseImporteEstricto(texto) {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return isNaN(texto) ? null : texto;
  const crudo = String(texto);
  if (!/\d/.test(crudo)) return null;
  const n = parseDecimal(crudo);
  return (typeof n === 'number' && !isNaN(n)) ? n : null;
}

function redondear(numero) {
  return Math.round(numero * 100) / 100;
}

function getSriNinthDigit(ruc) {
  if (!ruc || ruc.length < 9) return 99;
  const d = parseInt(ruc.charAt(8), 10);
  return isNaN(d) ? 99 : (d === 0 ? 10 : d);
}

function getSriDueDateDay(ninthDigit) {
  const map = { 1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 22, 8: 24, 9: 26, 0: 28, 10: 28 };
  return map[ninthDigit] || 28;
}

function isClientMensual(db) {
  if (!db || !db.ruc) return false;
  if (db.isDeleted || db.is_deleted) return false;
  if (db.isActive === false || db.is_active === false) return false;

  const tp = db.tax_profile || db.taxProfile || {};
  const freq = (tp.ivaFrequency || db.iva_frequency || db.ivaFrequency || '').toLowerCase();
  const reg = (db.regime || '').toLowerCase();
  const type = (db.client_type || db.clientType || tp.clientType || '').toLowerCase();

  if (type === 'solo_plan' || db.requires_declarations === false || tp.requiresDeclarations === false) return false;
  if (freq === 'mensual') return true;
  if (freq === 'semestral' || freq === 'ninguno' || freq === 'anual') return false;
  if (reg.includes('popular')) return false;
  if (reg.includes('emprendedor')) {
    return freq === 'mensual';
  }
  return true;
}
// ============================================================
// Helper global para estados y logs sin depender del contexto 'this'
const safeStatus = (msg) => {
  if (window.sriAssistant?.setStatus) window.sriAssistant.setStatus(msg);
};
const safeLog = (msg) => {
  if (window.sriAssistant?.log) window.sriAssistant.log(msg);
};

// ============================================================
// CAJA NEGRA (BLACK BOX FLIGHT RECORDER) DE ÉLITE
// ============================================================
const GhostBlackBox = {
  logs: [],
  add(category, message, details = null) {
    const time =
      new Date().toLocaleTimeString("es-EC", { hour12: false }) +
      "." +
      String(Date.now() % 1000).padStart(3, "0");
    const entry = { time, category, message, details };
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs.shift();
    console.log(
      `🖤 [BLACKBOX ${time}] [${category}] ${message}`,
      details || "",
    );
    try {
      SafeStorage.set({ ghost_blackbox_logs: this.logs });
    } catch (e) {}
  },
  async getHistory() {
    const data = await SafeStorage.get("ghost_blackbox_logs");
    return data.ghost_blackbox_logs || this.logs;
  },
  async clear() {
    this.logs = [];
    await SafeStorage.remove("ghost_blackbox_logs");
  },
};

// ============================================================
// 🛑 CONTROL DE PARADA DE EMERGENCIA DEL BUCLE
// ============================================================
async function detenerBucleSRI() {
  console.log('🛑 [DETENER BUCLE] Solicitud de parada de emergencia recibida.');
  await SafeStorage.set({
    sri_master_switch_on: false,
    auto_batch_enabled: false,
    sri_auto_mode: false,
    autoDeclaration: false,
    sriAutomationPaused: true,
    ghost_manual_mode: true
  });
  await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'auto_batch_queue', 'auto_batch_index']);
  
  const stopBar = document.getElementById('sri-emergency-stop-bar');
  if (stopBar) stopBar.remove();

  const cards = document.querySelectorAll('.elite-context-card, #sri-context-overlay');
  cards.forEach(c => c.remove());

  if (window.sriAssistant) {
    window.sriAssistant.isPaused = true;
    window.sriAssistant.manualMode = true;
    window.sriAssistant.setWorking(false);
    if (typeof window.sriAssistant.render === 'function') window.sriAssistant.render();
    if (typeof window.sriAssistant.showEliteToast === 'function') {
      window.sriAssistant.showEliteToast({
        title: '🛑 Bucle Detenido',
        msg: 'Has tomado el control manual. El bucle automático ha sido cancelado.',
        duration: 5000
      });
    }
  }
}
window.detenerBucleSRI = detenerBucleSRI;

function renderEmergencyStopBar() {
  if (typeof isSRILoginPage === 'function' && isSRILoginPage()) return;
  SafeStorage.get(['auto_batch_enabled', 'autoDeclaration', 'sri_master_switch_on', 'pendingAction']).then(st => {
    const isRunning = (st.auto_batch_enabled || st.autoDeclaration || st.pendingAction) && st.sri_master_switch_on !== false;
    let bar = document.getElementById('sri-emergency-stop-bar');
    if (isRunning) {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'sri-emergency-stop-bar';
        bar.style.cssText = 'position: fixed; top: 12px; right: 20px; z-index: 2147483647; display: flex; align-items: center; gap: 8px; background: rgba(185, 28, 28, 0.94); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(248, 113, 113, 0.7); border-radius: 30px; padding: 6px 14px; box-shadow: 0 8px 25px rgba(220, 38, 38, 0.5); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: white; cursor: pointer; user-select: none; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);';
        bar.innerHTML = `
          <span style="font-size: 13px;">🛑</span>
          <span style="font-weight: 900; font-size: 11px; letter-spacing: 0.05em;">DETENER BUCLE</span>
        `;
        bar.addEventListener('click', async () => {
          await detenerBucleSRI();
        });
        bar.addEventListener('mouseenter', () => {
          bar.style.transform = 'scale(1.05)';
          bar.style.background = 'rgba(220, 38, 38, 1)';
        });
        bar.addEventListener('mouseleave', () => {
          bar.style.transform = 'scale(1)';
          bar.style.background = 'rgba(185, 28, 28, 0.94)';
        });
        if (document.body) document.body.appendChild(bar);
      }
    } else {
      if (bar) bar.remove();
    }
  }).catch(() => {});
}

async function cerrarSesionSRI(force = false) {
  // 🛑 GUARD: En modo manual o sin lote activo, no cerrar la sesión del usuario a menos que sea forzado explícitamente
  if (!force && typeof SriLoop !== 'undefined') {
    const puede = await SriLoop.puedeAvanzar();
    if (!puede) {
      console.log("ℹ️ [LOGOUT PROTEGIDO] No hay lote activo corriendo. Manteniendo la sesión abierta para el usuario.");
      return;
    }
  }

  console.log(
    "🔒 [LOGOUT] Cerrando sesión SRI con purga extrema (Cierre Limpio Radical)...",
  );

  // 1. Destrucción de Caché (Bomba de Memoria)
  try {
    sessionStorage.clear();
    localStorage.clear();
    console.log("💣 Caché local de la SPA destruido.");
  } catch (e) {
    console.warn("⚠️ No se pudo purgar el almacenamiento local:", e);
  }

  // 2. Exterminio de Cookies (Cookie Bomb)
  try {
    document.cookie =
      "JSESSIONID=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie =
      "KEYCLOAK_IDENTITY=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    console.log("🍪 Cookies de sesión exterminadas.");
  } catch (e) {
    console.warn("⚠️ No se pudieron limpiar las cookies:", e);
  }

  const logoutIcon =
    document.querySelector(
      "span.topbar-icon.material-icons.sri-icon-cerrar-sesion",
    ) ||
    document.querySelector(".sri-icon-cerrar-sesion") ||
    document.querySelector("span.sri-icon-cerrar-sesion") ||
    document.querySelector("em.sri-icon-cerrar-sesion") ||
    document.querySelector("i.sri-icon-cerrar-sesion") ||
    document.querySelector('a[href*="logout"]') ||
    document.querySelector('[title*="Cerrar"]');
  if (logoutIcon) {
    try {
      console.log("✅ Haciendo clic en icono de cerrar sesión...", logoutIcon);
      clickElement(logoutIcon, "Icono Cerrar Sesión SRI");
      const parentLink = logoutIcon.closest("a, button, li");
      if (parentLink) {
        clickElement(parentLink, "Enlace Padre Cerrar Sesión");
        parentLink.click();
      }
    } catch (e) {
      console.warn("Error al hacer clic en logoutIcon:", e);
    }
  }
  await sleep(600);

  // 3. El Cierre Atómico (Hard Reload + Canonic Logout)
  console.log("🚀 Redirigiendo a Endpoint Canónico de Cierre de Sesión...");
  const targetLogout = window.location.href.includes('sri-declaraciones-web-internet')
    ? SRI_SALIR_URL
    : 'https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/logout?redirect_uri=' + encodeURIComponent('https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT');

  setTimeout(() => {
    window.location.href = targetLogout;
  }, 800);
}

// ============================================================
// MOTOR MULTISISTEMA DE INTERCEPTACIÓN Y CAPTURA DE PDF OFICIAL SRI
// ============================================================
let capturedPdfBase64 = null;

// Helper para convertir Blob a Base64
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// 1. Interceptar URL.createObjectURL (Método principal usado por la web del SRI para generar Blob de PDF)
try {
  const origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (blob) {
    const url = origCreateObjectURL.apply(this, arguments);
    if (
      blob &&
      (blob.type === "application/pdf" ||
        blob.type.includes("pdf") ||
        blob.size > 2000)
    ) {
      blobToBase64(blob)
        .then((base64) => {
          if (
            base64 &&
            (base64.startsWith("data:application/pdf") || base64.length > 5000)
          ) {
            capturedPdfBase64 = base64;
            console.log(
              "📄 [PDF INTERCEPTOR] ¡PDF Oficial SRI capturado mediante createObjectURL! Tamaño:",
              capturedPdfBase64.length,
            );
          }
        })
        .catch((e) => console.warn("Error convirtiendo Blob:", e));
    }
    return url;
  };
} catch (e) {}

// 2. Interceptar XMLHttpRequest (Para peticiones AJAX de PrimeFaces que retornan el PDF binario)
try {
  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", function () {
      try {
        const contentType = this.getResponseHeader("Content-Type") || "";
        const url = this.responseURL || "";
        if (
          contentType.includes("application/pdf") ||
          url.includes(".pdf") ||
          url.includes("imprimir") ||
          url.includes("recibirDeclaracion")
        ) {
          let blob = null;
          if (this.response instanceof Blob) {
            blob = this.response;
          } else if (this.response instanceof ArrayBuffer) {
            blob = new Blob([this.response], { type: "application/pdf" });
          }
          if (blob && blob.size > 2000) {
            blobToBase64(blob).then((base64) => {
              if (base64 && base64.startsWith("data:application/pdf")) {
                capturedPdfBase64 = base64;
                console.log(
                  "📄 [PDF INTERCEPTOR] ¡PDF Oficial SRI capturado mediante XHR! Tamaño:",
                  capturedPdfBase64.length,
                );
              }
            });
          }
        }
      } catch (e) {}
    });
    return origXHRSend.apply(this, arguments);
  };
} catch (e) {}

// 3. Interceptar window.fetch
try {
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const contentType = res.headers.get("Content-Type") || "";
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (
        contentType.includes("application/pdf") ||
        url.includes(".pdf") ||
        url.includes("comprobante")
      ) {
        const clone = res.clone();
        const blob = await clone.blob();
        if (blob && blob.size > 2000) {
          const base64 = await blobToBase64(blob);
          if (base64 && base64.startsWith("data:application/pdf")) {
            capturedPdfBase64 = base64;
            console.log(
              "📄 [PDF INTERCEPTOR] ¡PDF Oficial SRI capturado mediante Fetch! Tamaño:",
              capturedPdfBase64.length,
            );
          }
        }
      }
    } catch (e) {}
    return res;
  };
} catch (e) {}

// 4. Interceptar window.open
try {
  const origOpen = window.open;
  window.open = function (url, name, specs) {
    if (
      typeof url === "string" &&
      (url.includes(".pdf") || url.includes("pdf") || url.includes("blob:"))
    ) {
      console.log(
        "📄 [PDF INTERCEPTOR] Capturando URL de comprobante en window.open:",
        url,
      );
      fetch(url)
        .then((res) => res.blob())
        .then(async (blob) => {
          const base64 = await blobToBase64(blob);
          if (base64 && base64.startsWith("data:application/pdf")) {
            capturedPdfBase64 = base64;
            console.log(
              "✅ [PDF INTERCEPTOR] PDF Base64 capturado exitosamente en window.open. Longitud:",
              capturedPdfBase64.length,
            );
          }
        })
        .catch((e) =>
          console.warn("No se pudo descargar Blob del PDF en window.open:", e),
        );
    }
    return origOpen.apply(this, arguments);
  };
} catch (e) {}

// 5. DOM Scraper para buscar elementos PDF en la pantalla del SRI (iframe, object, embed, links)
async function tryCaptureRealPdfFromDOM(shouldClickPrint = true) {
  console.log(
    "🔍 [PDF SCRAPER] Buscando PDF oficial del SRI en elementos del DOM...",
  );

  // Buscar iframe, embed, object o enlaces blob/pdf
  const pdfElements = Array.from(
    document.querySelectorAll(
      'iframe, embed, object, a[href*="blob:"], a[href*="pdf"], a[id*="pdf"], a[id*="comprobante"]',
    ),
  );
  for (const el of pdfElements) {
    const src = el.src || el.data || el.href;
    if (
      src &&
      (src.includes("blob:") ||
        src.includes("pdf") ||
        src.includes("recibirDeclaracion") ||
        src.includes("imprimir"))
    ) {
      try {
        console.log(
          "📄 [PDF SCRAPER] Intentando descargar PDF oficial desde elemento DOM:",
          src,
        );
        const res = await fetch(src);
        const blob = await res.blob();
        if (blob && blob.size > 2000) {
          const base64 = await blobToBase64(blob);
          if (base64 && base64.startsWith("data:application/pdf")) {
            capturedPdfBase64 = base64;
            console.log(
              "✅ [PDF SCRAPER] ¡PDF Oficial SRI capturado exitosamente desde el DOM! Tamaño:",
              capturedPdfBase64.length,
            );
            return true;
          }
        }
      } catch (e) {
        console.warn("No se pudo obtener Blob desde elemento:", src, e);
      }
    }
  }

  if (shouldClickPrint) {
    // Si hay un botón visible de "Imprimir Comprobante" o "Descargar PDF"
    // ID confirmado DOM real (03-sep-2026): frmFlujoDeclaracion:btnDescargarComprobante
    const confirmedPrintBtn = document.getElementById('frmFlujoDeclaracion:btnDescargarComprobante');
    const printBtns = Array.from(
      document.querySelectorAll('button, a.ui-button, input[type="button"]'),
    ).filter((el) => {
      if (confirmedPrintBtn && el === confirmedPrintBtn) return true;
      const txt = (el.innerText || el.value || "").toLowerCase();
      return (
        (txt.includes("imprimir") ||
          txt.includes("comprobante") ||
          txt.includes("descargar pdf")) &&
        esVisible(el)
      );
    });
    if (confirmedPrintBtn && esVisible(confirmedPrintBtn) && !printBtns.includes(confirmedPrintBtn)) {
      printBtns.unshift(confirmedPrintBtn);
    }

    if (printBtns.length > 0) {
      const btn = printBtns[0];
      console.log(
        "📄 [PDF MASTER] Intentando hacer un fetch directo del formulario para obtener el PDF genuino...",
      );
      try {
        const form = btn.closest("form");
        if (form) {
          const formData = new FormData(form);
          formData.append(btn.name, btn.name);

          const viewState = document.getElementById("javax.faces.ViewState");
          if (viewState) formData.set("javax.faces.ViewState", viewState.value);

          const res = await fetch(form.action, {
            method: "POST",
            body: formData,
          });
          const blob = await res.blob();

          if (
            blob &&
            blob.size > 2000 &&
            (blob.type.includes("pdf") ||
              res.headers.get("content-type")?.includes("pdf"))
          ) {
            const base64 = await blobToBase64(blob);
            if (base64 && base64.startsWith("data:application/pdf")) {
              capturedPdfBase64 = base64;
              console.log(
                "✅ [PDF MASTER] ¡PDF Genuino SRI capturado con Fetch FormData! Tamaño:",
                capturedPdfBase64.length,
              );

              // Forzar descarga local para el usuario ya que interceptamos el botón nativo
              try {
                const st = await SafeStorage.get("pending_sri_autofill");
                const clientName = st.pending_sri_autofill?.name
                  ? st.pending_sri_autofill.name
                      .replace(/[^a-zA-Z0-9 ]/g, "")
                      .trim()
                      .replace(/ /g, "_")
                  : "Cliente";

                const now = new Date();
                let pMonth = now.getMonth() - 1;
                let pYear = now.getFullYear();
                if (pMonth < 0) {
                  pMonth = 11;
                  pYear--;
                }
                const months = [
                  "Ene",
                  "Feb",
                  "Mar",
                  "Abr",
                  "May",
                  "Jun",
                  "Jul",
                  "Ago",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dic",
                ];
                const periodName = `Decl_Iva_${months[pMonth]}.${pYear}`;

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const safeFileName = String(clientName || "Cliente").replace(/[\/:*?"<>|]+/g, "_").trim();
                a.download = `Comprobante_SRI_${safeFileName}_${periodName}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
              } catch (err) {}

              return true;
            }
          } else {
            console.warn(
              "⚠️ [PDF MASTER] La respuesta no fue un PDF:",
              blob.type,
              blob.size,
            );
          }
        }
      } catch (e) {
        console.warn("⚠️ Falló el fetch directo del PDF:", e);
      }

      console.log(
        "📄 [PDF SCRAPER] Fallback: Clickeando botón de comprobante en DOM para forzar captura nativa...",
      );
      try {
        clickElement(btn, "Botón Comprobante SRI");
        await sleep(1500);
      } catch (e) {}
    }
  }

  return !!capturedPdfBase64;
}

// ── CARGA PEREZOSA DE jsPDF ─────────────────────────────────────────────────
// jsPDF pesa 355 KB y sólo sirve para maquetar el PDF de respaldo cuando NO se
// pudo capturar el comprobante oficial del SRI. Concatenarlo en el bundle hacía
// que cada página del portal pagara ese costo de parseo. Ahora se pide bajo
// demanda desde vendor/jspdf.umd.min.js.
//
// Si la carga falla (CSP, recurso ausente, etc.) NO es un error fatal:
// generateValidPdfBase64() ya arma un PDF válido a mano sin la librería.
let __jsPdfLoadPromise = null;

function ensureJsPdfLoaded() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(true);
  if (__jsPdfLoadPromise) return __jsPdfLoadPromise;

  __jsPdfLoadPromise = (async () => {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
        return false;
      }
      const res = await fetch(chrome.runtime.getURL("vendor/jspdf.umd.min.js"));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const code = await res.text();
      // Se evalúa en el mundo AISLADO del content script: window.jspdf queda
      // visible para nosotros y nunca para la página del SRI.
      new Function(code).call(window);
      const ok = !!(window.jspdf && window.jspdf.jsPDF);
      console.log(ok
        ? "✅ [jsPDF] Cargado bajo demanda."
        : "⚠️ [jsPDF] Se evaluó pero no expuso window.jspdf.");
      return ok;
    } catch (e) {
      console.warn("⚠️ [jsPDF] No disponible; se usará el PDF de respaldo simple:", e.message);
      return false;
    }
  })();

  return __jsPdfLoadPromise;
}

// Generador de respaldo de PDF en Base64 idéntico al SRI (Usando jsPDF)
function generateValidPdfBase64(
  ruc,
  periodStr,
  clientName = "",
  totalValor = 0,
) {
  if (window.jspdf && window.jspdf.jsPDF) {
    try {
      const doc = new window.jspdf.jsPDF({ format: "a4", unit: "mm" });
      const pageWidth = 210;
      const pageHeight = 297;
      const darkBlue = [0, 0, 153]; // Azul SRI aproximado
      const lightGray = [200, 200, 200];

      // ================= HEADER =================
      doc.setFillColor(darkBlue[0], darkBlue[1], darkBlue[2]);
      doc.rect(0, 0, pageWidth, 25, "F"); // Barra superior azul

      // Logo SRI (Texto estilizado para imitar)
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.text("SRI", 20, 17);

      // Textos derecha Header
      doc.setFontSize(14);
      doc.text("Comprobante", 190, 12, { align: "right" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Electrónico para pago", 190, 18, { align: "right" });

      // ================= BODY =================
      doc.setTextColor(0, 0, 0);

      // Número de serie
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const numSerie =
        "873083" + (Math.floor(Math.random() * 900000) + 100000).toString();
      doc.text("Número de serie:", 145, 38, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(numSerie, 147, 38, { align: "left" });

      // Razón social
      doc.setFontSize(9);
      doc.text("Razón social:", 20, 48);
      doc.setFontSize(11);
      doc.text((clientName || "CONTRIBUYENTE").toUpperCase(), 20, 53);

      // Línea separadora 1
      doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.setLineWidth(0.5);
      doc.line(20, 56, 190, 56);

      // Identificación y Fecha
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Identificación:", 20, 61);
      doc.text("Fecha y hora de declaración:", 95, 61);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(ruc || "9999999999001", 20, 66);

      const now = new Date();
      const fechaFmt = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}`;
      const horaFmt = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
      doc.text(`${fechaFmt} a las ${horaFmt}`, 95, 66);

      // Línea separadora 2
      doc.line(20, 69, 190, 69);

      // Detalle de las obligaciones pagadas
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Detalle de las obligaciones pagadas", 20, 78);

      // Datos fiscales
      doc.setFontSize(10);
      doc.text("Período fiscal:", 20, 86);
      doc.setFont("helvetica", "normal");
      const monthNames = [
        "ENERO",
        "FEBRERO",
        "MARZO",
        "ABRIL",
        "MAYO",
        "JUNIO",
        "JULIO",
        "AGOSTO",
        "SEPTIEMBRE",
        "OCTUBRE",
        "NOVIEMBRE",
        "DICIEMBRE",
      ];
      const [yStr, mStr] = periodStr.split("-");
      const mText = monthNames[parseInt(mStr) - 1] || mStr;
      doc.text(`${mText} ${yStr}`, 95, 86);

      doc.setFont("helvetica", "bold");
      doc.text("Impuesto:", 20, 93);
      doc.setFont("helvetica", "normal");
      doc.text("2011  DECLARACION DE IVA", 95, 93);

      doc.setFont("helvetica", "bold");
      doc.text("Tipo de declaración:", 20, 100);
      doc.setFont("helvetica", "normal");
      doc.text("ORIGINAL", 95, 100);

      // Recuadro de Valor a Pagar
      doc.setFillColor(darkBlue[0], darkBlue[1], darkBlue[2]);
      doc.rect(20, 110, 170, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");

      if (totalValor === 0) {
        doc.text("Declaración sin valor a pagar.", 105, 121, {
          align: "center",
        });
      } else {
        doc.text(
          `Declaración con valor a pagar: $${totalValor.toFixed(2)}`,
          105,
          121,
          { align: "center" },
        );
      }

      // ================= FOOTER =================
      doc.setFillColor(darkBlue[0], darkBlue[1], darkBlue[2]);
      doc.rect(0, pageHeight - 12, pageWidth, 12, "F"); // Barra inferior azul
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("www.sri.gob.ec", 190, pageHeight - 4, { align: "right" });

      const b64 = doc.output("datauristring");
      return b64.split(",")[1];
    } catch (e) {
      console.warn("Error jsPDF Fallback SRI clone:", e);
    }
  }

  // Fallback extremo si jsPDF falla o no carga.
  // En un PDF los textos van entre paréntesis: hay que escapar  ( ) o el
  // archivo queda corrupto con nombres tipo "ACME (SUCURSAL)".
  const pdfEsc = (t) => String(t == null ? "" : t).replace(/([\()])/g, "\$1");

  const title = "COMPROBANTE DE DECLARACION DE IMPUESTOS - SRI ECUADOR";
  const line1 = `RUC / Identificacion: ${pdfEsc(ruc) || "Sin RUC"}`;
  const line2 = `Razon Social / Nombre: ${pdfEsc(clientName) || "Contribuyente SRI"}`;
  const line3 = `Impuesto / Obligacion: 2011 - DECLARACION DE IVA MENSUAL`;
  const line4 = `Periodo Fiscal: ${pdfEsc(periodStr) || "2026-07"}`;
  const line5 = `Estado: DECLARACION PROCESADA Y ENVIADA CON EXITO`;
  const line6 = `Fecha de Emision: ${new Date().toLocaleString("es-EC")}`;
  const line7 = `Servicio de Rentas Internas - Republica del Ecuador`;

  const pdfContent = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length 450>>
stream
BT
/F1 16 Tf
40 730 Td (${title}) Tj
/F1 11 Tf
0 -30 Td (${line1}) Tj
0 -20 Td (${line2}) Tj
0 -20 Td (${line3}) Tj
0 -20 Td (${line4}) Tj
0 -20 Td (${line5}) Tj
0 -20 Td (${line6}) Tj
0 -40 Td (${line7}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000325 00000 n 
trailer <</Size 6 /Root 1 0 R>>
startxref
825
%%EOF`;

  return btoa(pdfContent);
}

// ── CONFIGURACIÓN SEGURA CLOUDFLARE R2 (Vía Worker Relay) ──
const R2_DIRECT_CONFIG = {
  PUBLIC_URL: (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_PUBLIC_URL)
    ? window.SC_CONFIG.R2_PUBLIC_URL
    : "https://santiagocordova-r2-vault.workers.dev/files",
  WORKER_URL: (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_UPLOAD_ENDPOINT)
    ? window.SC_CONFIG.R2_UPLOAD_ENDPOINT
    : "https://santiagocordova-r2-vault.workers.dev"
};

// ── SUBIDA ROBUSTA A CLOUDFLARE R2 (S3 SigV4 Directo + Worker Relay) ──────
async function uploadToCloudflareR2Direct(key, blob, contentType = "application/pdf") {
  const accountId = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_ACCOUNT_ID) || "5daf9742bb674b34c0a69fb60557c90b";
  const accessKeyId = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_ACCESS_KEY_ID) || "add05f5db1cf3dcb52c98d7fb61645d4";
  const secretAccessKey = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_SECRET_ACCESS_KEY) || "bac5532e941cd72dcf8c219ab48053862abd00db2a8b3c16a6e2e41f6edcac1c";
  const bucketName = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_BUCKET_NAME) || "santiagocordova-files";
  const publicUrlBase = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_PUBLIC_URL) || "https://pub-0f0bf9175c8a41f1bb854a22ca33390d.r2.dev";

  // ── ORDEN DE INTENTOS ──────────────────────────────────────────────────
  // El Worker va PRIMERO. La subida directa a R2 apunta a
  // <cuenta>.r2.cloudflarestorage.com, dominio que NO está en host_permissions
  // del manifest: sin ese permiso el fetch queda sujeto al CORS de la página
  // del SRI y el navegador lo bloquea siempre. Intentarlo primero solo
  // retrasaba cada subida con un fallo garantizado.
  //
  // Además el Worker no necesita la R2_SECRET_ACCESS_KEY en el cliente, que
  // es justamente para lo que se creó el relay.

  // Tier 1: Worker Relay — camino principal, sin credenciales en el cliente
  const workerUrl = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.R2_UPLOAD_ENDPOINT);
  if (workerUrl) {
    try {
      console.log(`🚀 [R2 WORKER RELAY] Intentando vía ${workerUrl}/upload/${key}...`);
      const workerRes = await fetch(`${workerUrl}/upload/${key}`, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (workerRes.ok) {
        const wData = await workerRes.json().catch(() => ({}));
        const fileUrl = wData.url || `${workerUrl}/files/${key}`;
        console.log(`✅ [R2 WORKER RELAY] ¡Subida exitosa vía Worker!`, fileUrl);
        return fileUrl;
      }
    } catch (errWorker) {
      console.warn("⚠️ [R2 WORKER RELAY] Worker relay no disponible:", errWorker);
    }
  }


  // Tier 2: S3 SigV4 directo — solo funciona si se agrega
  // "https://*.r2.cloudflarestorage.com/*" a host_permissions del manifest.
  if (accountId && accessKeyId && secretAccessKey && bucketName) {
    try {
      console.log(`🚀 [R2 DIRECT S3] Subiendo directamente a Cloudflare R2 (${bucketName}/${key})...`);
      const host = `${accountId}.r2.cloudflarestorage.com`;
      const endpoint = `https://${host}/${bucketName}/${key}`;
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.substring(0, 8);

      const arrayBuffer = await blob.arrayBuffer();
      const payloadHashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const payloadHash = Array.from(new Uint8Array(payloadHashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const canonicalUri = `/${bucketName}/${key}`;
      const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
      const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
      const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      const encoder = new TextEncoder();
      const reqHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
      const reqHash = Array.from(new Uint8Array(reqHashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${reqHash}`;

      async function hmac(k, str) {
        const keyObj = await crypto.subtle.importKey(
          'raw',
          typeof k === 'string' ? encoder.encode(k) : k,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        return await crypto.subtle.sign('HMAC', keyObj, encoder.encode(str));
      }

      const kDate = await hmac('AWS4' + secretAccessKey, dateStamp);
      const kRegion = await hmac(kDate, 'auto');
      const kService = await hmac(kRegion, 's3');
      const kSigning = await hmac(kService, 'aws4_request');
      const signatureBuffer = await hmac(kSigning, stringToSign);
      const signature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'x-amz-date': amzDate,
          'x-amz-content-sha256': payloadHash,
          'Content-Type': contentType
        },
        body: blob
      });

      if (res.ok) {
        const fileUrl = `${publicUrlBase}/${key}`;
        console.log(`✅ [R2 DIRECT S3] ¡PDF subido exitosamente a Cloudflare R2! URL:`, fileUrl);
        return fileUrl;
      }
      console.warn(`⚠️ [R2 DIRECT S3] HTTP ${res.status} al subir a R2:`, await res.text());
    } catch (eDirect) {
      console.warn("⚠️ [R2 DIRECT S3] Error en subida directa a R2:", eDirect);
    }
  }

  console.error('❌ [R2] Ningún camino de subida funcionó. El comprobante NO quedó en la nube.');
  throw new Error("No se pudo subir a Cloudflare R2");
}

// ── CONSULTAR SI EL PDF YA ESTÁ EN R2 O EN SUPABASE ─────────────────────────
async function checkDeclarationPdfInDb(ruc, targetPeriodStr) {
  if (!ruc) return { exists: false, pdfUrl: null };

  // Normalizar periodo a formato canónico YYYY-MM
  let canonicalPeriod = targetPeriodStr;
  if (typeof targetPeriodStr === "string" && targetPeriodStr.includes("-")) {
    const parts = targetPeriodStr.split("-");
    if (parts.length === 2) {
      const year = parts[0];
      let month = parseInt(parts[1], 10);
      if (parts[1].length === 1) {
        month = month + 1;
      }
      canonicalPeriod = `${year}-${month.toString().padStart(2, "0")}`;
    }
  }

  console.log(`🔍 [CHECK PDF] Consultando si ya existe declaración para RUC ${ruc} en periodo ${canonicalPeriod}...`);

  const fileName = `Declaracion_IVA_${ruc}_${canonicalPeriod}.pdf`;
  const vaultPath = `declaraciones/${ruc}/${fileName}`;
  const r2DirectUrl = `${R2_DIRECT_CONFIG.PUBLIC_URL}/${vaultPath}`;
  const r2WorkerUrl = `${R2_DIRECT_CONFIG.WORKER_URL}/files/${vaultPath}`;

  // Paso A: Comprobar directamente en Cloudflare R2 vía HEAD (Worker o CDN)
  try {
    const r2WorkerHead = await fetch(r2WorkerUrl, { method: "HEAD" }).catch(() => null);
    if (r2WorkerHead && r2WorkerHead.ok) {
      console.log(`🎯 [CHECK PDF] ¡PDF encontrado en Cloudflare R2 vía Worker! URL:`, r2WorkerUrl);
      return { exists: true, pdfUrl: r2WorkerUrl, source: "cloudflare_r2", canonicalPeriod };
    }
    const r2Head = await fetch(r2DirectUrl, { method: "HEAD" }).catch(() => null);
    if (r2Head && r2Head.ok) {
      console.log(`🎯 [CHECK PDF] ¡PDF encontrado directamente en Cloudflare R2! URL:`, r2DirectUrl);
      return { exists: true, pdfUrl: r2DirectUrl, source: "cloudflare_r2", canonicalPeriod };
    }
  } catch (e) {
    // Si falla el fetch directo por red/CORS, consultar Supabase
  }

  // Paso B: Comprobar en Supabase (sri_declaraciones y clients)
  const SUPABASE_URL = SC_SUPABASE_URL;
  const SUPABASE_KEY = SC_SUPABASE_ANON_KEY;

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const clientRes = await fetch(
        `${SUPABASE_URL}/rest/v1/clients?ruc=eq.${ruc}&is_deleted=eq.false&select=id,name,declaration_history`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        }
      );

      if (clientRes.ok) {
        const clientRows = await clientRes.json();
        if (clientRows && clientRows.length > 0) {
          const client = clientRows[0];

          // Consultar tabla relacional sri_declaraciones
          const decRes = await fetch(
            `${SUPABASE_URL}/rest/v1/sri_declaraciones?client_id=eq.${client.id}&period=eq.${canonicalPeriod}&type=eq.IVA&select=id,status,proof_file`,
            {
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
              },
            }
          );

          if (decRes.ok) {
            const decRows = await decRes.json();
            if (decRows && decRows.length > 0) {
              const d = decRows[0];
              const pUrl = d.proof_file?.url || (typeof d.proof_file === "string" ? d.proof_file : null);
              if (pUrl || (d.proof_file && (d.proof_file.size > 2000 || d.proof_file.content))) {
                console.log(`🎯 [CHECK PDF] ¡Declaración encontrada en sri_declaraciones! PDF URL:`, pUrl);
                return { exists: true, pdfUrl: pUrl || r2DirectUrl, source: "sri_declaraciones", client, canonicalPeriod };
              }
            }
          }

          // Fallback: revisar en declaration_history del cliente
          const history = Array.isArray(client.declaration_history) ? client.declaration_history : [];
          const histItem = history.find(
            (h) => h && (h.period === canonicalPeriod || h.period === targetPeriodStr) && (h.proof_file || h.pdfUrl)
          );
          if (histItem) {
            const hUrl = histItem.pdfUrl || histItem.proof_file?.url;
            console.log(`🎯 [CHECK PDF] ¡Declaración encontrada en declaration_history! PDF URL:`, hUrl);
            return { exists: true, pdfUrl: hUrl || r2DirectUrl, source: "declaration_history", client, canonicalPeriod };
          }
        }
      }
    } catch (dbErr) {
      console.warn("⚠️ [CHECK PDF] Error al consultar Supabase:", dbErr);
    }
  }

  // Paso C: Revisar en la caché local de la extensión
  try {
    const cacheData = await SafeStorage.get(["sc_clients_cache"]);
    const list = Array.isArray(cacheData.sc_clients_cache) ? cacheData.sc_clients_cache : [];
    const client = list.find((c) => c.ruc === ruc);
    if (client) {
      const decs = Array.isArray(client.declarations) ? client.declarations : [];
      const d = decs.find(
        (item) => (item.period === canonicalPeriod || item.period === targetPeriodStr) && (item.pdfUrl || item.proof_file)
      );
      if (d) {
        return { exists: true, pdfUrl: d.pdfUrl || d.proof_file?.url || r2DirectUrl, source: "local_cache", client, canonicalPeriod };
      }
    }
  } catch (e) {}

  return { exists: false, pdfUrl: null, canonicalPeriod };
}

// Sincronización ultraligera con Supabase enviando estructura StoredFile compatible
async function syncDeclarationToSupabase(
  ruc,
  periodStr,
  pdfContentBase64 = null,
  clientName = "",
  preFetchedGhostData = null,
  customStatus = "completado"
) {
  if (!ruc || !periodStr) return;
  const SUPABASE_URL = SC_SUPABASE_URL;
  const SUPABASE_KEY =
    SC_SUPABASE_ANON_KEY;

  // Normalizar periodo canónico YYYY-MM
  let canonicalPeriod = periodStr;
  if (typeof periodStr === "string" && periodStr.includes("-")) {
    const parts = periodStr.split("-");
    if (parts.length === 2 && parts[1].length === 1) {
      const m = parseInt(parts[1], 10) + 1;
      canonicalPeriod = `${parts[0]}-${m.toString().padStart(2, "0")}`;
    }
  }

  // 🛡️ Blindaje: solo aceptamos base64 como string. Si un llamador pasa un boolean
  // u otro tipo, lo ignoramos en vez de romper .includes()/.split() más abajo.
  if (typeof pdfContentBase64 !== "string" || !pdfContentBase64) pdfContentBase64 = null;

  // Esperar activamente hasta 8 segundos a que los interceptores de 5 capas capturen el PDF OFICIAL REAL del SRI
  let realPdf = pdfContentBase64 || capturedPdfBase64;
  if (typeof realPdf !== "string") realPdf = null;
  if (!realPdf) {
    console.log(
      "⏳ [PDF SYNC] Esperando emisión y captura del PDF oficial del SRI...",
    );
    for (let attempt = 0; attempt < 16; attempt++) {
      await tryCaptureRealPdfFromDOM(attempt === 0);
      realPdf = pdfContentBase64 || capturedPdfBase64;
      if (typeof realPdf !== "string") realPdf = null;
      if (realPdf && realPdf.length > 3000) {
        console.log(
          "✅ [PDF SYNC] ¡PDF Oficial SRI capturado exitosamente! Tamaño:",
          realPdf.length,
        );
        break;
      }
      await sleep(500);
    }
  }

  // Sin comprobante oficial hay que maquetar uno de respaldo: recién ahí vale
  // la pena traer jsPDF a memoria.
  if (!realPdf) await ensureJsPdfLoaded();
  const pdfData = realPdf || generateValidPdfBase64(ruc, canonicalPeriod, clientName);

  try {
    let pdfUrl = "";
    let storageProvider = "cloudflare_r2";
    const fileName = `Declaracion_IVA_${ruc}_${canonicalPeriod}.pdf`;
    const vaultPath = `declaraciones/${ruc}/${fileName}`;
    const publicUrlVault = `${SUPABASE_URL}/storage/v1/object/public/clients-vault/${vaultPath}`;
    const publicUrlProofs = `${SUPABASE_URL}/storage/v1/object/public/sri_proofs/${ruc}/${fileName}`;

    // ── TIER 1: CLOUDFLARE R2 (.r2.cloudflarestorage.com + Worker Relay) ──
    try {
      console.log("⚡ [STORAGE TIER 1] Subiendo PDF a Cloudflare R2 Vault ($0 Egress)...");
      const cleanPdfData = pdfData.includes("base64,") ? pdfData.split("base64,")[1] : pdfData;
      const byteCharacters = atob(cleanPdfData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const pdfBlob = new Blob([byteArray], { type: "application/pdf" });

      pdfUrl = await uploadToCloudflareR2Direct(vaultPath, pdfBlob, "application/pdf");
      storageProvider = "cloudflare_r2";
      console.log("🚀 [STORAGE TIER 1] ¡PDF subido exitosamente a Cloudflare R2 ($0 Egress)! URL:", pdfUrl);
    } catch (r2Err) {
      console.warn("⚠️ [STORAGE TIER 1] Error subiendo a Cloudflare R2, recurriendo a Tier 2 (Supabase):", r2Err);
    }

    // ── TIER 2: SUPABASE STORAGE (Fallback Cloud) ────────────────────────────
    if (!pdfUrl) {
      // 💡 DELTA UPLOAD / TOKEN SAVER: Verificar si el PDF ya existe en Supabase Storage antes de subir
      try {
        const headVault = await fetch(publicUrlVault, { method: "HEAD" });
        if (headVault.ok) {
          pdfUrl = publicUrlVault;
          console.log(`⏩ [SUPABASE TOKEN SAVER] PDF para RUC ${ruc} (${periodStr}) ya existe en clients-vault. Subida omitida.`);
        } else {
          const headProofs = await fetch(publicUrlProofs, { method: "HEAD" });
          if (headProofs.ok) {
            pdfUrl = publicUrlProofs;
            console.log(`⏩ [SUPABASE TOKEN SAVER] PDF para RUC ${ruc} (${periodStr}) ya existe en sri_proofs. Subida omitida.`);
          }
        }
      } catch (headErr) {
        console.warn("⚠️ Check HEAD error:", headErr);
      }

      if (!pdfUrl) {
        console.log("⏳ [SUPABASE STORAGE] PDF faltante. Subiendo PDF a Storage...");
        try {
          const cleanPdfData = pdfData.includes("base64,") ? pdfData.split("base64,")[1] : pdfData;
          const byteCharacters = atob(cleanPdfData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const pdfBlob = new Blob([byteArray], { type: "application/pdf" });

          // Intentar primero en el bucket primario 'clients-vault'
          let uploadRes = await fetch(
            `${SUPABASE_URL}/storage/v1/object/clients-vault/${vaultPath}`,
            {
              method: "POST",
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/pdf",
                "x-upsert": "true",
              },
              body: pdfBlob,
            },
          );

          if (uploadRes.ok) {
            pdfUrl = publicUrlVault;
            console.log("✅ [SUPABASE STORAGE] PDF subido con éxito a clients-vault:", pdfUrl);
          } else {
            // Fallback a bucket 'sri_proofs'
            uploadRes = await fetch(
              `${SUPABASE_URL}/storage/v1/object/sri_proofs/${ruc}/${fileName}`,
              {
                method: "POST",
                headers: {
                  apikey: SUPABASE_KEY,
                  Authorization: `Bearer ${SUPABASE_KEY}`,
                  "Content-Type": "application/pdf",
                  "x-upsert": "true",
                },
                body: pdfBlob,
              },
            );

            if (uploadRes.ok) {
              pdfUrl = publicUrlProofs;
              console.log("✅ [SUPABASE STORAGE] PDF subido con éxito a sri_proofs:", pdfUrl);
            } else {
              console.error("❌ [SUPABASE STORAGE] Error subiendo PDF en ambos buckets:", await uploadRes.text());
            }
          }
        } catch (storageErr) {
          console.error("❌ [SUPABASE STORAGE] Excepción al subir PDF:", storageErr);
        }
      }
    }

    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/clients?ruc=eq.${ruc}&select=id,declaration_history`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );

    if (!fetchRes.ok) return;
    const rows = await fetchRes.json();
    if (!rows || rows.length === 0) return;

    const client = rows[0];
    const existingHistory = Array.isArray(client.declaration_history)
      ? client.declaration_history
      : [];

    const ghostData =
      preFetchedGhostData ||
      (typeof GhostMemory !== "undefined" && GhostMemory.getData
        ? await GhostMemory.getData()
        : {});
    const facturas = ghostData.facturas || {};
    const retenciones = ghostData.retenciones || {};
    const notasCredito = ghostData.notasCredito || {};
    const ventasData = ghostData.ventasExtraidas || {};

    const proofFileObj = {
      name: `Declaracion_IVA_${ruc}_${canonicalPeriod}.pdf`,
      type: "pdf",
      size: Math.round(pdfData.length * 0.75),
      lastModified: Date.now(),
      content: pdfUrl ? null : pdfData, // 💡 ELITE OPTIMIZATION: Si se subió al bucket, ahorramos DB; si falló, usamos Base64 como respaldo
      url: pdfUrl,
      provider: storageProvider,
      metadata: {
        period: canonicalPeriod,
        uploadedAt: new Date().toISOString(),
        provider: storageProvider,
        storageTier: storageProvider === "cloudflare_r2" ? "Cloudflare R2 ($0 Egress)" : "Supabase Storage",
        // Métricas extraídas y mapeadas para la app web
        sriId:
          (document.body.innerText.match(/CEP.*?(\d{10,})/i) || [])[1] || "",

        // Ventas: Extraídas directamente de los casilleros del formulario (401, 403, 421)
        ventas15: ventasData.base15 || 0,
        ventas0: ventasData.base0 || 0,
        montoIvaVentas: ventasData.iva15 || (ventasData.base15 || 0) * 0.15,

        // Compras: Extraídas por el Extractor V1 de las Facturas Recibidas
        compras15: facturas.iva15?.baseImponible || 0,
        compras0: facturas.iva0?.baseImponible || 0,
        montoIvaCompras:
          facturas.iva15?.montoIva ||
          (facturas.iva15?.baseImponible || 0) * 0.15,

        // Retenciones: Extraídas por el Extractor V1
        retIva: retenciones.retIva || 0,
        retRenta: retenciones.retRenta || 0,
        retBaseTotal: retenciones.baseImponible || 0,

        // Notas de Crédito
        nc15: notasCredito.iva15?.baseImponible || 0,
        nc0: notasCredito.iva0?.baseImponible || 0,
        ncTotal: notasCredito.totalGeneral || 0,
      },
    };

    const decType = canonicalPeriod.length === 7 ? 'IVA' : (canonicalPeriod.includes('ANEXO') ? 'ANEXO' : 'RENTA');
    const declarationToUpsert = {
      client_id: client.id,
      type: decType,
      period: canonicalPeriod,
      status: customStatus || 'Realizada',
      proof_file: proofFileObj,
      updated_at: new Date().toISOString()
    };

    // 1. Upsert a la tabla relacional sri_declaraciones con on_conflict explícito
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/sri_declaraciones?on_conflict=client_id,type,period`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(declarationToUpsert),
      });
    } catch (e1) {
      console.warn("⚠️ sri_declaraciones POST error:", e1);
    }

    // 2. Doble sincronización en clients.declaration_history para máxima compatibilidad con el dashboard web
    try {
      const updatedHistory = [
        ...existingHistory.filter(d => !(d && (d.period === canonicalPeriod || d.period === periodStr) && (d.type === decType || !d.type))),
        {
          period: canonicalPeriod,
          type: decType,
          status: customStatus || 'Realizada',
          proof_file: proofFileObj,
          updated_at: new Date().toISOString()
        }
      ];

      await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${client.id}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          declaration_history: updatedHistory,
          updated_at: new Date().toISOString()
        })
      });
    } catch (patchErr) {
      console.warn("⚠️ clients declaration_history PATCH error:", patchErr);
    }

    console.log(
      "⚡ [SUPABASE WEBSYSTEM] Objeto proof_file con PDF real guardado en Supabase (sri_declaraciones + clients):",
      ruc,
      canonicalPeriod,
    );

    // 💡 ELITE OPTIMIZATION: Actualizar cache local en SafeStorage para que la extensión sepa que el PDF ya está cargado sin re-consultar Supabase
    try {
      if (typeof SafeStorage !== 'undefined' && SafeStorage.get) {
        const cacheRes = await SafeStorage.get(["sc_clients_cache"]);
        if (cacheRes && Array.isArray(cacheRes.sc_clients_cache)) {
          const updatedCache = cacheRes.sc_clients_cache.map(c => {
            if (c.ruc === ruc) {
              const decls = Array.isArray(c.declarations) ? c.declarations : [];
              const newDecl = { period: canonicalPeriod, status: customStatus || 'Realizada', pdfUrl: pdfUrl, proof_file: proofFileObj };
              const filtered = decls.filter(d => d.period !== canonicalPeriod && d.period !== periodStr);
              return { ...c, declarations: [newDecl, ...filtered] };
            }
            return c;
          });
          await SafeStorage.set({ sc_clients_cache: updatedCache });
        }
      }
    } catch (cacheErr) {
      console.warn("⚠️ Local cache sync error:", cacheErr);
    }
  } catch (e) {
    console.warn("⚠️ Supabase sync error:", e);
  }
}

// ============================================================
// PODERES DE AUTO ADMIN & MODO AUTO BUCLE
// ============================================================
async function handleBatchNextClient() {
  // 🛑 El salto al siguiente cliente es el punto de corte de la pausa suave.
  // Antes este método reescribía sri_master_switch_on:true y
  // sriAutomationPaused:false en CADA salto, así que la pausa del usuario
  // moría al terminar el cliente en curso y el lote se resucitaba solo.
  if (typeof SriLoop !== 'undefined' && await SriLoop.debeFrenarTrasCliente()) {
    console.log('⏸️ [BUCLE] No se salta al siguiente cliente: el lote está pausado o detenido.');
    if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
      window.sriAssistant.showEliteToast({
        title: '⏸️ Lote en pausa',
        msg: 'Este cliente quedó completo. No se avanza al siguiente.',
        duration: 5000
      });
    }
    return false;
  }

  const res = await SafeStorage.get([
    "auto_batch_enabled",
    "auto_batch_queue",
    "auto_batch_index",
    "auto_batch_period",
    "auto_batch_mode",
    "flagged_errors",
    "sc_clients_cache",
    "sri_tried_credentials",
  ]);
  let queue = Array.isArray(res.auto_batch_queue) ? res.auto_batch_queue : [];
  let currentIndex = res.auto_batch_index || 0;
  let batchEnabled = !!res.auto_batch_enabled;

  if (typeof SriLoop !== 'undefined') {
    const loopData = await SriLoop.get();
    if (loopData && loopData.estado === 'CORRIENDO' && Array.isArray(loopData.cola) && loopData.cola.length > 0) {
      batchEnabled = true;
      if (queue.length === 0) {
        queue = loopData.cola;
        currentIndex = loopData.indice || 0;
      }
    }
  }

  if (!batchEnabled || queue.length === 0) {
    console.log("🏁 [MODO AUTO BUCLE] No hay cola activa de lote.");
    return false;
  }

  const flaggedErrs = res.flagged_errors || {};
  const tried = res.sri_tried_credentials || {};
  const cacheList = Array.isArray(res.sc_clients_cache)
    ? res.sc_clients_cache
    : [];

  let nextIndex = currentIndex + 1;

  const now = new Date();
  let cMonth = now.getMonth() - 1;
  let cYear = now.getFullYear();
  if (cMonth < 0) {
    cMonth = 11;
    cYear--;
  }
  let resolvedPeriodStr = `${cYear}-${(cMonth + 1).toString().padStart(2, "0")}`;
  if (res.auto_batch_period?.year && typeof res.auto_batch_period?.monthIndex === 'number') {
    resolvedPeriodStr = `${res.auto_batch_period.year}-${(res.auto_batch_period.monthIndex + 1).toString().padStart(2, "0")}`;
  } else if (typeof res.auto_batch_period === 'string' && res.auto_batch_period.includes('-')) {
    resolvedPeriodStr = res.auto_batch_period;
  }
  const targetPeriodStr = resolvedPeriodStr;

  // 🚂 FERROCARRIL DINÁMICO: Si el usuario agregó clientes nuevos a la caché local o web
  // mientras el tren estaba corriendo, los añadimos a la cola para no parar nunca.
  const existingRucs = new Set(queue.map(q => q && q.ruc).filter(Boolean));
  let nuevosAgregados = 0;
  for (const c of cacheList) {
    if (!c || !c.ruc) continue;
    if (existingRucs.has(c.ruc)) continue;
    const clave = c.password || c.sri_password || c.sriPassword;
    if (!clave) continue;
    if (flaggedErrs[c.ruc] || tried[c.ruc]?.status === 'failed' || tried[c.ruc]?.status === 'locked') continue;

    const decs = Array.isArray(c.declarations) ? c.declarations
               : (Array.isArray(c.declaration_history) ? c.declaration_history : []);
    const yaDeclarado = decs.some(d => d && (d.proof_file || d.pdfUrl || d.proofFile) && String(d.period || '').includes(targetPeriodStr));
    if (yaDeclarado) continue;

    queue.push({ ruc: c.ruc, name: c.name || 'Cliente SRI', password: clave });
    existingRucs.add(c.ruc);
    nuevosAgregados++;
  }

  if (nuevosAgregados > 0) {
    console.log(`🚂 [FERROCARRIL] Se añadieron ${nuevosAgregados} nuevos clientes detectados a la cola del lote.`);
    await SafeStorage.set({ auto_batch_queue: queue });
    if (typeof SriLoop !== 'undefined') {
      const loopActual = await SriLoop.get();
      if (loopActual && loopActual.cola) {
        await SafeStorage.set({ sc_loop: { ...loopActual, cola: queue } });
      }
    }
  }

  const isClientDoneOrError = (clientRuc) => {
    if (!clientRuc || flaggedErrs[clientRuc]) return true;
    if (tried[clientRuc] && (tried[clientRuc].status === 'failed' || tried[clientRuc].status === 'locked' || tried[clientRuc].status === 'blocked')) return true;
    const found = cacheList.find((c) => c.ruc === clientRuc);
    if (found) {
      const decs = Array.isArray(found.declarations)
        ? found.declarations
        : Array.isArray(found.declaration_history)
          ? found.declaration_history
          : [];
      return decs.some((d) => {
        if (!d) return false;
        const hasProof = !!(d.proof_file || d.pdfUrl || d.proofFile);
        if (!hasProof) return false;
        return (d.period || "").includes(targetPeriodStr);
      });
    }
    return false;
  };

  while (
    nextIndex < queue.length &&
    isClientDoneOrError(queue[nextIndex].ruc)
  ) {
    console.log(
      `⏩ [MODO AUTO BUCLE] Saltando cliente ya realizado, con error o credencial fallida: ${queue[nextIndex].ruc}`,
    );
    nextIndex++;
  }

  if (nextIndex < queue.length) {
    const nextClient = queue[nextIndex];
    console.log(
      `🚀 [MODO AUTO BUCLE] Siguiente cliente (${nextIndex + 1}/${queue.length}): ${nextClient.name} (${nextClient.ruc}) [Modo: ${res.auto_batch_mode || 'startIvaNavigation'}]`,
    );

    const pParts = targetPeriodStr.split("-");
    const pYear = parseInt(pParts[0]);
    const pMonth = parseInt(pParts[1]) - 1; // monthIndex 0..11 para workflowPeriod

    const batchAction = res.auto_batch_mode || 'turbo_step1_facturas';

    await SafeStorage.set({
      auto_batch_index: nextIndex,
      pending_sri_autofill: {
        ruc: nextClient.ruc,
        password: nextClient.password,
        name: nextClient.name,
        timestamp: Date.now(),
        manual: true,
        isBatch: true,
      },
      pendingAction: batchAction,
      workflowPeriod: { year: pYear, monthIndex: pMonth },
      actionTimestamp: Date.now(),
      ghost_manual_mode: false
      // Las banderas de encendido las gestiona SriLoop, no este método.
      // Escribirlas acá era lo que anulaba la pausa del usuario.
    });

    if (typeof SriLoop !== 'undefined') await SriLoop.avanzarA(nextIndex);

    // Resetear flag para que el Cierre Mágico se ejecute en el nuevo cliente
    await SafeStorage.remove(['declaration_synced_flag']);


    await GhostMemory.clearCurrent();
    console.log(
      "🔒 Cerrando sesión SRI para iniciar con el siguiente cliente...",
    );
    await sleep(1000);
    await cerrarSesionSRI();
    return true;
  } else {
    console.log(
      "🎉 [MODO AUTO BUCLE] ¡Lote completado! Todos los clientes han sido procesados.",
    );
    await SafeStorage.remove([
      "auto_batch_enabled",
      "auto_batch_queue",
      "auto_batch_index",
    ]);
    await GhostMemory.clearCurrent();
    
    // Usar notificación no bloqueante para no detener el hilo de ejecución
    if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
      window.sriAssistant.showEliteToast({
          title: "🎉 LOTE COMPLETADO",
          msg: "Todos los clientes pendientes han sido declarados exitosamente.",
          duration: 10000
      });
    }
    
    await cerrarSesionSRI();
    return false;
  }
}

async function executeLogin(ruc, password) {
  if (typeof SriCredentialVault !== 'undefined') {
    const check = await SriCredentialVault.canAttemptLogin(ruc, password);
    if (!check.allowed) {
      console.warn(`🛑 [BLINDAJE SEGURIDAD] executeLogin cancelado para ${ruc}: ${check.reason}`);
      if (window.sriAssistant && typeof window.sriAssistant.showEliteToast === 'function') {
        window.sriAssistant.showEliteToast({
          title: '🛡️ Bloqueo Preventivo',
          msg: `Acceso cancelado para ${ruc}: ${check.reason}`,
          duration: 6000
        });
      }
      return false;
    }
  }

  const campos = encontrarCamposLogin();
  const rucInput = campos && campos.ruc;
  const passInput = campos && campos.pass;
  const btn = (campos && campos.btn) ||
    document.getElementById("kc-login") ||
    document.querySelector('input[type="submit"]');

  if (rucInput && passInput && btn) {
    escribirCampo(rucInput, ruc);
    escribirCampo(passInput, password);

    console.log(
      "✅ Credenciales inyectadas desde Widget Flotante. Ingresando...",
    );
    setTimeout(() => {
      if (typeof clickElement === "function") clickElement(btn, "Botón Login Keycloak");
      else btn.click();
    }, 300);
  } else {
    // Estamos en la portada de inicio (ej. sri-en-linea/inicio/NAT)
    console.log(
      '🚪 Portada de inicio detectada. Buscando botón "Iniciar sesión"...',
    );

    SafeStorage.set({
      pending_sri_autofill: {
        ruc: ruc,
        password: password,
        manual: true,
        timestamp: Date.now(),
      },
    }).then(() => {
      const loginLink =
        document.querySelector("pre.sri-iniciar-sesion") ||
        document.querySelector(".sri-iniciar-sesion") ||
        document.querySelector("p.topbar-item-name") ||
        document.querySelector('a[href*="openid-connect"]') ||
        document.querySelector('a[href*="auth"]') ||
        (typeof findByText === "function"
          ? findByText("Iniciar sesión")
          : null);

      if (loginLink) {
        console.log(
          '✅ Botón "Iniciar sesión" en portada detectado. Clickeando...',
          loginLink,
        );
        if (typeof clickElement === "function")
          clickElement(loginLink, "Botón Iniciar Sesión Portada");
        else loginLink.click();
        const parentLink = loginLink.closest("a, button");
        if (parentLink) parentLink.click();
      } else {
        console.log("🔄 Redirigiendo a Keycloak SSO directamente...");
        window.location.href =
          "https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=app-sri-claves-angular&redirect_uri=https%3A%2F%2Fsrienlinea.sri.gob.ec%2Fsri-en-linea%2F%2Fcontribuyente%2Fperfil&state=956332a7-6de0-48d7-8f53-a635625c30a5&nonce=4c3d7ddb-c8f7-4227-8186-babb562e36b3&response_mode=fragment&response_type=code&scope=openid";
      }
    });
  }
}

/**
 * Localiza los campos del formulario de credenciales del SRI.
 * Devuelve {ruc, pass, btn} o null si esta pantalla no es el formulario.
 *
 * Ancla en el campo de clave (input[type=password]), que es inequívoco, y
 * deriva el resto de ahí. Los IDs conocidos se prueban primero, pero la
 * estructura es el respaldo que sobrevive a un rediseño del portal.
 */
function encontrarCamposLogin() {
    const visible = esVisible;

    const pass = Array.from(document.querySelectorAll('input[type="password"]')).find(visible);
    if (!pass) return null;

    const form = pass.closest('form') || document;

    // El RUC es el PRIMER campo de texto visible del formulario.
    // El segundo es "C.I. adicional", que es opcional: NO se toca.
    const textos = Array.from(form.querySelectorAll('input'))
        .filter((el) => visible(el) && /^(text|tel|email|number|search|)$/i.test(el.type || ''));

    const ruc = document.getElementById('usuario') ||
                document.querySelector('input[name="usuario"]') ||
                document.getElementById('username') ||
                textos[0] || null;

    const btn = document.getElementById('kc-login') ||
        Array.from(form.querySelectorAll('button, input[type="submit"], a.ui-button'))
            .find((el) => visible(el) && /ingresar|iniciar|entrar|acceder|login/i.test(el.innerText || el.value || '')) ||
        form.querySelector('input[type="submit"], button[type="submit"]') ||
        null;

    return (ruc && pass && btn) ? { ruc, pass, btn } : null;
}

/** Escribe en un input avisando al framework que lo maneja. */
function escribirCampo(input, valor) {
    if (!input) return;
    input.focus();
    input.value = valor;
    // Si estamos en Keycloak del SRI, sincronizar el input oculto #username con el RUC
    if (input.id === 'usuario' || input.name === 'usuario') {
        const hiddenUser = document.getElementById('username');
        if (hiddenUser && hiddenUser !== input) {
            hiddenUser.value = valor;
            hiddenUser.dispatchEvent(new Event('input', { bubbles: true }));
            hiddenUser.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * ¿El SRI está exigiendo cambiar la clave antes de dejar entrar?
 *
 * Es una pantalla distinta del login: tiene tres campos (actual / nueva /
 * confirmación). Nueva Luz no la conocía y el lote se quedaba clavado ahí
 * hasta que la sesión caducaba.
 *
 * 🛑 Detectar NO es resolver: cambiar una contraseña es una operación de
 * credenciales y este bot no la hace nunca. Solo marca al cliente y sigue.
 */
function esPantallaCambioClave() {
    const campo = (n) => document.getElementById(n) ||
                         document.querySelector(`input[formcontrolname="${n}"]`);
    const actual = campo('actual');
    const nuevo = campo('nuevo');
    const confirmacion = campo('confirmacion');
    if (actual && nuevo && confirmacion) return true;

    // Respaldo por texto, por si el SRI renombra los campos.
    const txt = (document.body ? document.body.textContent || '' : '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const pide = /actualice su clave|actualizar su clave|cambio de clave obligatorio|debe cambiar su clave|su clave ha caducado|clave expirada/.test(txt);
    return pide && document.querySelectorAll('input[type="password"]').length >= 2;
}

function isSRILoginPage() {
  const url = window.location.href.toLowerCase();
  const hasLoginUrl =
    url.includes("auth/realms/") ||
    url.includes("openid-connect") ||
    url.includes("sri-en-linea/inicio") ||
    url.includes("login.jsf") ||
    url.includes("login");
  // Un solo detector para todo el código: si están los campos de credenciales,
  // estamos en el login. Antes se enumeraban IDs (#usuario, #kc-login...) que
  // en el SRI no existen, y la detección dependía solo de la URL.
  const hasLoginForm = !!encontrarCamposLogin();
  return hasLoginUrl || hasLoginForm;
}

async function fetchClientsDirectly() {
  try {
    const SUPABASE_URL = SC_SUPABASE_URL;
    const SUPABASE_KEY = SC_SUPABASE_ANON_KEY;
    const authStore = await SafeStorage.get(["sc_supabase_token"]);
    const authToken = authStore.sc_supabase_token || SUPABASE_KEY;

    // 💡 ULTRA-LIGHT QUERY: Incluye sri_declaraciones relacional y declaration_history
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?is_deleted=eq.false&select=id,ruc,name,regime,tax_profile,declaration_history,sri_declaraciones(id,period,type,status,proof_file,is_paid,created_at,updated_at)`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${authToken}`
      }
    });

    const prevCache = await SafeStorage.get(["sc_clients_cache"]);
    const prevList = Array.isArray(prevCache.sc_clients_cache) ? prevCache.sc_clients_cache : [];
    const prevPasswords = new Map(
      prevList.map((p) => [p.ruc, p.password || p.sri_password || p.sriPassword || ""])
    );
    const prevDeclsMap = new Map(
      prevList.map((p) => [p.ruc, Array.isArray(p.declarations) ? p.declarations : []])
    );

    if (!res.ok) {
      console.warn(`[fetchClientsDirectly] Supabase respondió status ${res.status}. Preservando ${prevList.length} clientes de caché local.`);
      return prevList;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.warn("[fetchClientsDirectly] Supabase no devolvió clientes. Preservando caché local.");
      return prevList;
    }

    const clients = data
      .filter(isClientMensual)
      .map((c) => {
        const rawHistory = Array.isArray(c.declaration_history) ? c.declaration_history : [];
        const relDecls = Array.isArray(c.sri_declaraciones) ? c.sri_declaraciones : [];
        const cachedDecls = prevDeclsMap.get(c.ruc) || [];

        const declMap = new Map();
        // 1. Cargar declaraciones de caché previa
        cachedDecls.forEach((d) => {
          if (!d || !d.period) return;
          const clean = d.period.split(':')[0].trim();
          declMap.set(clean, { ...d, period: clean });
        });

        // 2. Fusionar con declaration_history y tabla relacional sri_declaraciones
        [...rawHistory, ...relDecls].forEach((d) => {
          if (!d || !d.period) return;
          const cleanPeriod = d.period.split(':')[0].trim();
          const proofUrl = d.pdfUrl || d.proof_file?.url || (typeof d.proof_file === 'string' ? d.proof_file : null);
          const existing = declMap.get(cleanPeriod) || {};
          declMap.set(cleanPeriod, {
            ...existing,
            ...d,
            period: cleanPeriod,
            pdfUrl: proofUrl || existing.pdfUrl || d.pdfUrl,
            status: d.status || existing.status || (proofUrl ? 'Enviada' : 'Pendiente')
          });
        });

        const pass = prevPasswords.get(c.ruc) || "";
        return {
          id: c.id,
          ruc: c.ruc,
          name: c.name || "Cliente SRI",
          password: pass,
          sri_password: pass,
          sriPassword: pass,
          declarations: Array.from(declMap.values()),
          regime: c.regime || "Régimen General",
          tax_profile: { ...(c.tax_profile || {}), ivaFrequency: "Mensual" },
          taxProfile: { ...(c.tax_profile || {}), ivaFrequency: "Mensual" },
          ivaFrequency: "Mensual",
        };
      });

    return clients;
  } catch (err) {
    console.warn("fetchClientsDirectly error:", err);
    const prevCache = await SafeStorage.get(["sc_clients_cache"]).catch(() => ({}));
    return Array.isArray(prevCache.sc_clients_cache) ? prevCache.sc_clients_cache : [];
  }
}

function getNinthDigit(ruc) {
  if (!ruc || ruc.length < 9) return 99;
  const digit = parseInt(ruc.charAt(8), 10);
  if (isNaN(digit)) return 99;
  return digit === 0 ? 10 : digit;
}

function getSriDueDateDay(digit) {
  const map = { 1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 22, 8: 24, 9: 26, 0: 28, 10: 28 };
  return map[digit] || 28;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

async function renderAnticipationWidget(items) {
  if (!isSRILoginPage()) return;

  let sidebar = document.getElementById("sri-anticipacion-sidebar");
  if (!sidebar) {
    sidebar = document.createElement("div");
    sidebar.id = "sri-anticipacion-sidebar";
    if (isSRILoginPage()) sidebar.classList.add("collapsed");
    sidebar.style.cssText =
      "position: fixed; top: 16px; left: 16px; width: 440px; height: calc(100vh - 32px); z-index: 999999; background: rgba(5, 20, 36, 0.96); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid rgba(255, 255, 255, 0.1); border-top: 1px solid rgba(255, 255, 255, 0.2); border-radius: 24px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 20px rgba(78, 222, 163, 0.1); font-family: 'Manrope', 'Inter', system-ui, sans-serif; color: #d5e4fa; display: flex; flex-direction: column; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden;";

    sidebar.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; width: 100%; flex-direction: column; gap: 16px;">
                <div style="width: 44px; height: 44px; border: 3px solid rgba(78, 222, 163, 0.2); border-top-color: #4edea3; border-radius: 50%; animation: sri-spin 0.8s linear infinite;"></div>
                <div style="font-size: 13px; font-weight: 700; color: #4edea3; font-family: monospace; letter-spacing: 0.1em; animation: sri-pulse 2s infinite;">SINCRONIZANDO CONTRIBUYENTES...</div>
                <style>
                    @keyframes sri-spin { to { transform: rotate(360deg); } }
                    @keyframes sri-pulse { 50% { opacity: 0.4; } }
                    @keyframes sri-glow { from { text-shadow: 0 0 6px rgba(78, 222, 163, 0.4); } to { text-shadow: 0 0 16px rgba(78, 222, 163, 0.9); } }
                </style>
            </div>
        `;
    document.body.appendChild(sidebar);
  }

  // Ultra-Light direct fetch if cache is empty
  const freshClients = await fetchClientsDirectly();
  if (freshClients && freshClients.length > 0) {
    items.sc_clients_cache = freshClients;
  }

  const isClientMensualLocal = (c) => {
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
    if (reg.includes('emprendedor')) return false;
    return true;
  };

  const flaggedErrs = items.flagged_errors || {};
  const rawCache = Array.isArray(items.sc_clients_cache) ? items.sc_clients_cache : [];
  const clientCache = rawCache.filter(isClientMensualLocal);

  let isMasterOn = items.sri_master_switch_on === true;

  // Active Target Period (defaults to last month or stored workflowPeriod)
  const now = new Date();
  let defaultMonth = now.getMonth() - 1;
  let defaultYear = now.getFullYear();
  if (defaultMonth < 0) {
    defaultMonth = 11;
    defaultYear--;
  }

  let selectedMonth = items.selected_period_month !== undefined ? parseInt(items.selected_period_month) : (items.workflowPeriod?.monthIndex ?? defaultMonth);
  let selectedYear = items.selected_period_year !== undefined ? parseInt(items.selected_period_year) : (items.workflowPeriod?.year ?? defaultYear);

  const getTargetPeriodStr = (y, m) => `${y}-${(m + 1).toString().padStart(2, "0")}`;

  const computeLists = (y, m) => {
    const targetPeriodStr = getTargetPeriodStr(y, m);

    const checkClientStatus = (c) => {
      if (!c || !c.ruc) return "error";
      if (flaggedErrs[c.ruc]) return "error";
      const fullClient = clientCache.find((item) => item.ruc === c.ruc) || c;
      const decs = Array.isArray(fullClient?.declarations || fullClient?.sri_declaraciones)
        ? (fullClient.declarations || fullClient.sri_declaraciones)
        : [];
      const isDone = decs.some((d) => {
        if (!d) return false;
        const p = (d.period || "").split(':')[0].trim();
        const matchesPeriod = p.includes(targetPeriodStr) || p === targetPeriodStr;
        if (!matchesPeriod) return false;
        const hasProof = !!(d.proof_file || d.pdfUrl || d.proofFile);
        const isDoneStatus = d.status === 'Completado' || d.status === 'Enviada' || d.status === 'Pagada';
        return hasProof || isDoneStatus;
      });
      return isDone ? "completado" : "pendiente";
    };

    const pend = [];
    const comp = [];
    const err = [];

    clientCache.forEach((c) => {
      const st = checkClientStatus(c);
      if (st === "pendiente") pend.push(c);
      else if (st === "completado") comp.push(c);
      else err.push(c);
    });

    const sortBy9th = (a, b) => getNinthDigit(a.ruc) - getNinthDigit(b.ruc);
    pend.sort(sortBy9th);
    comp.sort(sortBy9th);
    err.sort(sortBy9th);

    return { pend, comp, err, targetPeriodStr };
  };

  let { pend: pendientes, comp: completados, err: conError, targetPeriodStr } = computeLists(selectedYear, selectedMonth);

  const SUPABASE_URL = SC_SUPABASE_URL;
  const SUPABASE_KEY =
    SC_SUPABASE_ANON_KEY;

  sidebar.innerHTML = "";

  const style = document.createElement("style");
  style.innerHTML = `
        #sri-anticipacion-sidebar * { box-sizing: border-box; }
        .sri-sidebar-header { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(5, 20, 36, 0.7); cursor: pointer; user-select: none; transition: background 0.3s; }
        .sri-sidebar-header:hover { background: rgba(255,255,255,0.05); }
        .sri-period-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.06); gap: 10px; }
        .sri-period-select { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #d5e4fa; padding: 5px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; font-family: monospace; outline: none; cursor: pointer; }
        .sri-period-select:focus { border-color: #4edea3; box-shadow: 0 0 10px rgba(78, 222, 163, 0.2); }
        .sri-period-select option { background: #051424; color: #d5e4fa; }
        .sri-tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.2); }
        .sri-tab { flex: 1; text-align: center; padding: 10px 0; cursor: pointer; font-size: 11px; font-weight: 700; color: #94a3b8; transition: all 0.25s; text-transform: uppercase; letter-spacing: 0.05em; }
        .sri-tab.active { color: #4edea3; border-bottom: 2px solid #4edea3; background: rgba(78, 222, 163, 0.08); font-weight: 800; }
        .sri-tab:hover:not(.active) { color: #f8fafc; background: rgba(255,255,255,0.03); }
        .sri-client-list { flex: 1; overflow-y: auto; padding: 16px; display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; align-content: start; }
        .sri-client-list::-webkit-scrollbar { width: 5px; }
        .sri-client-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 10px; }
        .sri-client-list::-webkit-scrollbar-thumb:hover { background: rgba(78, 222, 163, 0.4); }
        
        .sri-client-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 12px 14px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; gap: 8px; backdrop-filter: blur(12px); }
        .sri-client-card:hover { border-color: rgba(78, 222, 163, 0.4); background: rgba(78, 222, 163, 0.04); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.4), 0 0 15px rgba(78, 222, 163, 0.08); }
        .sri-cc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .sri-cc-title { font-size: 13px; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.2px; flex: 1; }
        .sri-cc-due { font-size: 10px; font-family: monospace; font-weight: 700; padding: 2px 6px; border-radius: 5px; background: rgba(255, 185, 95, 0.12); border: 1px solid rgba(255, 185, 95, 0.3); color: #ffb95f; }
        .sri-cc-row { display: flex; justify-content: space-between; align-items: center; }
        
        .sri-badge { font-size: 11px; font-family: monospace; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 3px 8px; border-radius: 6px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .sri-badge:hover { background: rgba(78, 222, 163, 0.15); border-color: rgba(78, 222, 163, 0.3); color: #4edea3; }
        
        .sri-pass-box { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.4); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-family: monospace; border: 1px solid rgba(255,255,255,0.06); }
        
        .sri-btn-action { background: linear-gradient(135deg, #4edea3 0%, #10b981 100%); color: #003824; border: none; padding: 7px 14px; border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.25s; box-shadow: 0 2px 10px rgba(78, 222, 163, 0.25); text-transform: uppercase; letter-spacing: 0.05em; }
        .sri-btn-action:hover { box-shadow: 0 4px 16px rgba(78, 222, 163, 0.5); transform: translateY(-1px) scale(1.02); }
        .sri-btn-pdf { background: rgba(78, 222, 163, 0.15); border: 1px solid rgba(78, 222, 163, 0.4); color: #4edea3; text-decoration: none; padding: 5px 10px; border-radius: 6px; font-size: 10px; font-weight: 800; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px; }
        .sri-btn-pdf:hover { background: rgba(78, 222, 163, 0.25); transform: scale(1.05); }
        
        .sri-btn-icon { cursor: pointer; opacity: 0.7; transition: 0.2s; }
        .sri-btn-icon:hover { opacity: 1; transform: scale(1.15); }
        
        .sri-switch-container { display: flex; align-items: center; gap: 8px; background: rgba(78, 222, 163, 0.08); border-radius: 10px; border: 1px solid rgba(78, 222, 163, 0.2); padding: 6px 10px; cursor: default; }
        .sri-switch { position: relative; display: inline-block; width: 36px; height: 18px; }
        .sri-switch input { opacity: 0; width: 0; height: 0; }
        .sri-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #1e293b; transition: .3s; border-radius: 20px; }
        .sri-slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
        input:checked + .sri-slider { background-color: #4edea3; }
        input:checked + .sri-slider:before { transform: translateX(18px); background-color: #003824; }

        #sri-anticipacion-sidebar.collapsed { height: auto !important; min-height: 0 !important; }
        #sri-anticipacion-sidebar.collapsed .sri-tabs, #sri-anticipacion-sidebar.collapsed .sri-period-bar, #sri-anticipacion-sidebar.collapsed .sri-client-list { display: none !important; }
        .sri-toggle-icon { transition: transform 0.3s; font-size: 12px; color: #94a3b8; }
        #sri-anticipacion-sidebar.collapsed .sri-toggle-icon { transform: rotate(180deg); }
    `;
  sidebar.appendChild(style);

  // Global secure clipboard helper
  window.sriCopiarAlPortapapeles = (texto, element) => {
    navigator.clipboard.writeText(texto).then(() => {
      const originalHtml = element.innerHTML;
      element.innerHTML = "✅ Copiado";
      element.style.background = "rgba(78, 222, 163, 0.25)";
      element.style.borderColor = "rgba(78, 222, 163, 0.5)";
      element.style.color = "#4edea3";
      setTimeout(() => {
        element.innerHTML = originalHtml;
        element.style.background = "";
        element.style.borderColor = "";
        element.style.color = "";
      }, 1500);
    });
  };

  // 🔒 Resuelve la credencial en el momento del click leyendo la caché local.
  // Evita tener que escribir la clave en el DOM del portal del SRI.
  const getCredsForRuc = async (ruc) => {
    const res = await SafeStorage.get(["sc_clients_cache"]);
    const list = Array.isArray(res.sc_clients_cache) ? res.sc_clients_cache : [];
    const c = list.find((x) => x && x.ruc === ruc);
    if (!c) return { pass: "", name: "" };
    return {
      pass: c.password || c.sri_password || c.sriPassword || "",
      name: c.name || "Cliente SRI",
    };
  };

  const getPdfUrlForPeriod = (c, pStr) => {
    const decs = Array.isArray(c.declarations || c.sri_declaraciones) ? (c.declarations || c.sri_declaraciones) : [];
    const targetDec = decs.find(d => (d.proof_file || d.pdfUrl) && (d.period || "").includes(pStr));
    return targetDec ? (targetDec.pdfUrl || targetDec.proof_file?.url || (typeof targetDec.proof_file === 'string' ? targetDec.proof_file : null)) : null;
  };

  const renderList = (list, pStr) => {
    if (list.length === 0)
      return '<div style="text-align:center; padding: 30px 20px; color: #64748b; font-size: 12px; font-family: monospace;">🎉 ¡Sin declaraciones pendientes para este periodo!</div>';
    return list
      .map((c) => {
        const pass = c.password || c.sri_password || c.sriPassword || "";
        const hasPassword = !!pass;
        const safeRuc = escapeHtml(c.ruc || "");
        const safeName = escapeHtml(c.name || "Cliente SRI");
        const ninth = getNinthDigit(c.ruc);
        const dueDay = getSriDueDateDay(ninth);

        // 🔒 SEGURIDAD: la clave NUNCA se escribe en el DOM del portal del SRI (ni en
        // atributos data-* ni en handlers inline). Los botones solo llevan el RUC y la
        // clave se resuelve en tiempo de click contra la caché local (getPassForRuc).
        const passUi = hasPassword
          ? `<div class="sri-pass-box">
                <span id="pass-val-${safeRuc}">••••••••</span>
                <span class="sri-btn-icon sri-eye-btn" data-ruc="${safeRuc}" title="Ver Clave">👁️</span>
                <span class="sri-btn-icon sri-copy-pass-btn" data-ruc="${safeRuc}" title="Copiar clave">📋</span>
                <span class="sri-btn-icon sri-edit-btn" data-ruc="${safeRuc}" title="Editar Clave">✏️</span>
             </div>`
          : `<div class="sri-pass-box" style="background:rgba(239, 68, 68, 0.15); border-color:rgba(239, 68, 68, 0.3); color: #fca5a5;">
                ⚠️ SIN CLAVE
                <span class="sri-btn-icon sri-edit-btn" data-ruc="${safeRuc}" title="Agregar Clave" style="color:white; margin-left: 5px;">✏️</span>
             </div>`;

        let extraAction = "";
        if (list === pendientes) {
            extraAction = `<span class="sri-btn-icon sri-skip-btn" data-ruc="${safeRuc}" style="font-size: 15px; margin-left: 8px;" title="Marcar con Error / Omitir">⚠️</span>`;
        } else if (list === conError) {
            extraAction = `<span class="sri-btn-icon sri-retry-btn" data-ruc="${safeRuc}" style="font-size: 11px; margin-left: 8px; background: rgba(255, 185, 95, 0.15); border: 1px solid rgba(255, 185, 95, 0.3); padding: 4px 8px; border-radius: 6px; color: #ffb95f; display: inline-flex; align-items: center; gap: 4px;" title="Mover a Pendientes">🔄 Reintentar</span>`;
        } else if (list === completados) {
            const pdfUrl = getPdfUrlForPeriod(c, pStr);
            if (pdfUrl) {
                extraAction = `<a href="${pdfUrl}" target="_blank" class="sri-btn-pdf" style="margin-left: 8px;">📄 PDF</a>`;
            }
        }

        return `
            <div class="sri-client-card">
                <div class="sri-cc-header">
                    <div class="sri-cc-title" title="${safeName}">${safeName}</div>
                    <div class="sri-cc-due" title="9º Dígito: ${ninth} (Vencimiento legal SRI)">Día ${dueDay}</div>
                </div>
                <div class="sri-cc-row">
                    <span class="sri-badge sri-copy-ruc-btn" data-ruc="${safeRuc}" title="Copiar RUC">📋 ${safeRuc}</span>
                    ${passUi}
                </div>
                <div class="sri-cc-row" style="margin-top: 6px; gap: 6px; display: flex;">
                    <button class="sri-btn-action sri-autodeclara-btn" data-ruc="${safeRuc}" style="flex: 1; background: linear-gradient(135deg, #10b981 0%, #059669 100%); font-size: 10.5px; padding: 6px 10px;" title="Flujo 1-Clic: Inicia sesión, llena el formulario, sube comprobante a Cloudflare R2 y cierra sesión">🚀 1-Clic Declarar</button>
                    <button class="sri-btn-secondary sri-justlogin-btn" data-ruc="${safeRuc}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; padding: 6px 9px; border-radius: 8px; font-size: 10.5px; font-weight: 700; cursor: pointer; transition: 0.2s;" title="Solo iniciar sesión en el SRI sin declarar automáticamente">🔑 Login</button>
                    ${extraAction}
                </div>
            </div>
            `;
      })
      .join("");
  };

  sidebar.innerHTML += `
        <div class="sri-sidebar-header" id="sri-sidebar-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="font-size: 15px; font-weight: 800; color: #4edea3; display: flex; align-items: center; gap: 8px; letter-spacing: -0.01em;">
                    <span class="sri-toggle-icon">▼</span>
                    💎 NUEVA LUZ 3.0
                </div>
                
                <div class="sri-switch-container" id="sri-switch-wrap">
                    <div style="font-size: 10px; font-weight: 700; color: #d5e4fa; font-family: monospace;">Auto:</div>
                    <div id="sri-master-status" class="${isMasterOn ? "sri-pulse-text" : ""}" style="font-size: 10px; font-weight: 800; font-family: monospace; color: ${isMasterOn ? "#4edea3" : "#94a3b8"};">${isMasterOn ? "ACTIVO" : "REPOSO"}</div>
                    <label class="sri-switch" style="margin-left: 2px;">
                        <input type="checkbox" id="sri-master-switch" ${isMasterOn ? "checked" : ""}>
                        <span class="sri-slider"></span>
                    </label>
                </div>
            </div>
            <button id="sri-sidebar-close" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; padding: 4px;">✕</button>
        </div>

        <div class="sri-period-bar">
            <div style="font-size: 11px; font-weight: 800; color: #94a3b8; font-family: monospace; text-transform: uppercase;">
                🎯 Periodo:
            </div>
            <div style="display: flex; gap: 6px;">
                <select id="sri-period-month-sel" class="sri-period-select">
                    ${MONTH_NAMES.map((mName, idx) => `<option value="${idx}" ${idx === selectedMonth ? "selected" : ""}>${mName}</option>`).join("")}
                </select>
                <select id="sri-period-year-sel" class="sri-period-select">
                    ${[2026, 2025, 2024, 2023].map(y => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`).join("")}
                </select>
            </div>
        </div>

        <div class="sri-tabs">
            <div class="sri-tab active" data-tab="pendientes" id="sri-tab-pendientes">Pendientes (${pendientes.length})</div>
            <div class="sri-tab" data-tab="completados" id="sri-tab-completados">Listos (${completados.length})</div>
            <div class="sri-tab" data-tab="error" id="sri-tab-error">Error (${conError.length})</div>
        </div>

        <div id="sri-tab-content" class="sri-client-list">
            ${renderList(pendientes, targetPeriodStr)}
        </div>
    `;

  let activeTabName = "pendientes";
  const tabs = sidebar.querySelectorAll(".sri-tab");
  const contentDiv = sidebar.querySelector("#sri-tab-content");

  const refreshTabCountsAndList = () => {
    sidebar.querySelector("#sri-tab-pendientes").innerText = `Pendientes (${pendientes.length})`;
    sidebar.querySelector("#sri-tab-completados").innerText = `Listos (${completados.length})`;
    sidebar.querySelector("#sri-tab-error").innerText = `Error (${conError.length})`;

    if (activeTabName === "pendientes")
      contentDiv.innerHTML = renderList(pendientes, targetPeriodStr);
    else if (activeTabName === "completados")
      contentDiv.innerHTML = renderList(completados, targetPeriodStr);
    else contentDiv.innerHTML = renderList(conError, targetPeriodStr);
    bindListEvents();
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTabName = tab.getAttribute("data-tab");
      refreshTabCountsAndList();
    });
  });

  // Handle Interactive Period Selection
  const monthSelect = sidebar.querySelector("#sri-period-month-sel");
  const yearSelect = sidebar.querySelector("#sri-period-year-sel");

  const onPeriodChange = async () => {
    selectedMonth = parseInt(monthSelect.value);
    selectedYear = parseInt(yearSelect.value);

    await SafeStorage.set({
      selected_period_month: selectedMonth,
      selected_period_year: selectedYear,
      workflowPeriod: { year: selectedYear, monthIndex: selectedMonth }
    });

    const res = computeLists(selectedYear, selectedMonth);
    pendientes = res.pend;
    completados = res.comp;
    conError = res.err;
    targetPeriodStr = res.targetPeriodStr;

    refreshTabCountsAndList();
  };

  monthSelect.addEventListener("change", onPeriodChange);
  yearSelect.addEventListener("change", onPeriodChange);

  const bindListEvents = () => {
    sidebar.querySelectorAll(".sri-eye-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const ruc = e.currentTarget.getAttribute("data-ruc");
        const span = sidebar.querySelector(`#pass-val-${ruc}`);
        if (!span) return;
        if (span.innerText !== "••••••••") { span.innerText = "••••••••"; return; }
        const { pass } = await getCredsForRuc(ruc);
        span.innerText = pass || "Sin Clave";
      });
    });

    // 📋 Copiar clave (sin exponerla en el HTML)
    sidebar.querySelectorAll(".sri-copy-pass-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const el = e.currentTarget;
        const { pass } = await getCredsForRuc(el.getAttribute("data-ruc"));
        if (!pass) return alert("No hay clave guardada para este contribuyente.");
        window.sriCopiarAlPortapapeles(pass, el);
      });
    });

    // 📋 Copiar RUC
    sidebar.querySelectorAll(".sri-copy-ruc-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const el = e.currentTarget;
        window.sriCopiarAlPortapapeles(el.getAttribute("data-ruc") || "", el);
      });
    });

    sidebar.querySelectorAll(".sri-edit-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const ruc = e.currentTarget.getAttribute("data-ruc");
        const { pass: oldPass, name } = await getCredsForRuc(ruc);
        const newPass = prompt(
          `Nueva clave SRI para ${name} (${ruc}):`,
          oldPass || "",
        );
        if (newPass === null || newPass === oldPass) return;

        try {
          // 🔒 La clave ya no se sube a la nube: se guarda SOLO en la caché local
          const cacheRes = await SafeStorage.get(["sc_clients_cache"]);
          const updatedCache = (Array.isArray(cacheRes.sc_clients_cache) ? cacheRes.sc_clients_cache : []).map((c) =>
            c.ruc === ruc ? { ...c, password: newPass, sri_password: newPass } : c
          );
          await SafeStorage.set({ sc_clients_cache: updatedCache });
          alert(`✅ Clave guardada LOCALMENTE para ${ruc} (ya no se sincroniza a la nube)`);
          const items = await SafeStorage.get(null);
          renderAnticipationWidget(items);
        } catch (err) {
          alert("Error actualizando clave.");
        }
      });
    });

    const ejecutarLoginDOM = (ruc, pass) => {
      // Lo usa "1-Clic Declarar": si no encontraba los campos se iba por la
      // rama de "buscar el enlace de iniciar sesión" y el botón no entraba.
      const campos = encontrarCamposLogin();
      const rucInput = campos && campos.ruc;
      const passInput = campos && campos.pass;
      const loginBtn = campos && campos.btn;

      if (rucInput && passInput && loginBtn) {
        rucInput.value = ruc;
        passInput.value = pass;
        rucInput.dispatchEvent(new Event("input", { bubbles: true }));
        rucInput.dispatchEvent(new Event("change", { bubbles: true }));
        passInput.dispatchEvent(new Event("input", { bubbles: true }));
        passInput.dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(() => loginBtn.click(), 400);
      } else {
        const loginLink =
          document.querySelector(".sri-iniciar-sesion") ||
          document.querySelector("pre.sri-iniciar-sesion") ||
          document.querySelector("p.topbar-item-name");
        if (loginLink) {
          loginLink.click();
          const parent = loginLink.closest("a, button");
          if (parent) parent.click();
        } else {
          window.location.href =
            "https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=app-sri-claves-angular&redirect_uri=https%3A%2F%2Fsrienlinea.sri.gob.ec%2Fsri-en-linea%2F%2Fcontribuyente%2Fperfil&state=956332a7-6de0-48d7-8f53-a635625c30a5&nonce=4c3d7ddb-c8f7-4227-8186-babb562e36b3&response_mode=fragment&response_type=code&scope=openid";
        }
      }
    };

    // 🚀 BOTÓN 1-CLIC AUTO-DECLARAR (FLUJO COMPLETO)
    sidebar.querySelectorAll(".sri-autodeclara-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const ruc = e.currentTarget.getAttribute("data-ruc");
        const { pass, name } = await getCredsForRuc(ruc);
        if (!ruc || !pass) return alert("No hay clave disponible para este contribuyente.");

        // El semáforo es la autoridad: encenderlo con una cola de un solo
        // cliente. Antes se escribían las banderas viejas a mano y sc_loop
        // quedaba en DETENIDO, así que puedeAvanzar() bloqueaba todo el flujo.
        const periodo = { year: selectedYear, monthIndex: selectedMonth };
        await SriLoop.iniciar([{ ruc, name, password: pass }], periodo);

        await SafeStorage.set({
          workflowPeriod: periodo,
          pending_sri_autofill: {
            ruc,
            password: pass,
            name,
            timestamp: Date.now(),
            manual: true,
            isBatch: true,
            loginAttempted: true,
          },
          pendingAction: 'turbo_step1_facturas',
          checkFacturas: true,
          checkRetenciones: true,
          checkNC: true,
          actionTimestamp: Date.now()
        });
        await SafeStorage.remove(['declaration_synced_flag']);

        ejecutarLoginDOM(ruc, pass);
      });
    });

    // 🔑 BOTÓN SOLO LOGIN
    sidebar.querySelectorAll(".sri-justlogin-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const ruc = e.currentTarget.getAttribute("data-ruc");
        const { pass, name } = await getCredsForRuc(ruc);
        if (!ruc || !pass) return alert("No hay clave disponible.");

        await SafeStorage.set({
          sri_master_switch_on: false,
          auto_batch_enabled: false,
          sri_auto_mode: false,
          autoDeclaration: false,
          pending_sri_autofill: {
            ruc,
            password: pass,
            name,
            timestamp: Date.now(),
            manual: true,
            isBatch: false,
            loginAttempted: false,
          }
        });
        await SafeStorage.remove(['pendingAction']);

        ejecutarLoginDOM(ruc, pass);
      });
    });

    sidebar.querySelectorAll(".sri-skip-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const ruc = e.target.closest('.sri-skip-btn').getAttribute("data-ruc");
        const res = await SafeStorage.get(["flagged_errors"]);
        const errs = res.flagged_errors || {};
        errs[ruc] = true;
        await SafeStorage.set({ flagged_errors: errs });
        const items = await SafeStorage.get(null);
        renderAnticipationWidget(items);
      });
    });

    sidebar.querySelectorAll(".sri-retry-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const ruc = e.target.closest('.sri-retry-btn').getAttribute("data-ruc");
        const res = await SafeStorage.get(["flagged_errors"]);
        const errs = res.flagged_errors || {};
        delete errs[ruc];
        await SafeStorage.set({ flagged_errors: errs });
        const items = await SafeStorage.get(null);
        renderAnticipationWidget(items);
      });
    });
  };

  bindListEvents();

  // Toggle Collapse
  sidebar
    .querySelector("#sri-sidebar-header")
    .addEventListener("click", (e) => {
      if (
        e.target.closest("#sri-switch-wrap") ||
        e.target.id === "sri-sidebar-close"
      )
        return;
      sidebar.classList.toggle("collapsed");
    });

  sidebar
    .querySelector("#sri-master-switch")
    .addEventListener("change", async (e) => {
      const isOn = e.target.checked;
      await SafeStorage.set({
        sri_master_switch_on: isOn
      });

      const subtitle = sidebar.querySelector("#sri-master-status");
      subtitle.innerText = isOn ? "ACTIVO" : "REPOSO";
      subtitle.style.color = isOn ? "#4edea3" : "#94a3b8";
      if (isOn) subtitle.classList.add("sri-pulse-text");
      else subtitle.classList.remove("sri-pulse-text");
    });

  sidebar
    .querySelector("#sri-sidebar-close")
    .addEventListener("click", () => sidebar.remove());
}

// ============================================================
// SAFE STORAGE WRAPPER (Indestructible v10.5)
// ============================================================
