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
// `let`, no `const`: lo que esté guardado en Ajustes pisa a lo del código.
// shared_config.js está versionado, así que una llave ahí es una llave
// publicada — y rotarla no debería exigir editar código y reconstruir.
let SC_SUPABASE_URL = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.SUPABASE_URL)
  ? window.SC_CONFIG.SUPABASE_URL
  : null;
let SC_SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.SC_CONFIG && window.SC_CONFIG.SUPABASE_ANON_KEY)
  ? window.SC_CONFIG.SUPABASE_ANON_KEY
  : null;

/** De dónde salió la llave que se está usando. Sólo el nombre, nunca el valor. */
let SC_SUPABASE_ORIGEN = 'del código';

/**
 * Aplica las credenciales de Supabase guardadas en Ajustes, si las hay.
 *
 * Se llama una vez al arrancar, con el volcado de storage que 03 ya pide.
 * Todos los usos leen la global dentro de una función, así que el reemplazo
 * llega a tiempo: las llamadas a la web pasan mucho después del arranque.
 *
 * @param {object} items Volcado de `SafeStorage.get(null)`.
 */
function aplicarCredencialesSupabaseGuardadas(items) {
  const g = (items || {}).sc_supabase_credenciales;
  if (!g) return;
  if (g.SUPABASE_URL) SC_SUPABASE_URL = g.SUPABASE_URL;
  if (g.SUPABASE_ANON_KEY) {
    SC_SUPABASE_ANON_KEY = g.SUPABASE_ANON_KEY;
    SC_SUPABASE_ORIGEN = 'de Ajustes';
    console.log('🔑 [WEB] Usando la llave de Supabase guardada en Ajustes, no la del código.');
  }
}
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

/**
 * Inyecta las variables y clases base de la interfaz. Idempotente.
 *
 * Existe porque había 396 atributos style="" inline contra 31 clases, y cuatro
 * módulos dibujando interfaz sin compartir nada. Cambiar un color obligaba a
 * tocar cientos de líneas.
 */
function instalarEstilosSC() {
  if (typeof document === 'undefined' || document.getElementById('sc-tokens')) return;
  const st = document.createElement('style');
  st.id = 'sc-tokens';
  st.textContent = `
    :root{
      --sc-fondo:rgba(5,20,36,.94);
      --sc-fondo-2:rgba(255,255,255,.04);
      --sc-borde:rgba(255,255,255,.14);
      --sc-txt:#d5e4fa;
      --sc-suave:#94a3b8;
      --sc-tenue:#64748b;
      --sc-ok:#4ade80;
      --sc-activo:#7dd3fc;
      --sc-alerta:#ffb95f;
      --sc-mal:#f87171;
      --sc-radio:14px;
      --sc-radio-btn:10px;
      --sc-sombra:0 10px 30px rgba(0,0,0,.5);
      --sc-fuente:'Manrope','Inter',system-ui,sans-serif;
    }
    .sc-panel{
      background:var(--sc-fondo); border:1px solid var(--sc-borde);
      border-radius:var(--sc-radio); box-shadow:var(--sc-sombra);
      color:var(--sc-txt); font-family:var(--sc-fuente);
      backdrop-filter:blur(14px);
    }
    .sc-btn{
      border:none; border-radius:var(--sc-radio-btn); cursor:pointer;
      padding:7px 12px; font-size:12px; font-weight:800;
      font-family:var(--sc-fuente); background:var(--sc-fondo-2);
      color:var(--sc-txt); transition:filter .15s, transform .15s;
    }
    .sc-btn:hover{ filter:brightness(1.25) }
    .sc-btn:active{ transform:scale(.97) }
    .sc-btn--primario{ background:linear-gradient(135deg,#10b981,#059669); color:#fff }
    .sc-btn--peligro{ background:rgba(239,68,68,.16); color:var(--sc-mal) }
    .sc-btn--fantasma{ background:transparent; border:1px solid var(--sc-borde); color:var(--sc-suave) }
    .sc-rotulo{
      font-size:9.5px; letter-spacing:.09em; color:var(--sc-tenue);
      font-weight:800; text-transform:uppercase;
    }
  `;
  (document.head || document.documentElement).appendChild(st);
}

if (typeof document !== 'undefined') {
  if (document.head) instalarEstilosSC();
  else document.addEventListener('DOMContentLoaded', instalarEstilosSC);
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
  /**
   * Una marca para saber si la clave cambió — sin que la marca sea la clave.
   *
   * Acá decía `largo_primeras2_últimas2`. Eso alcanzaba para comparar, y
   * alcanzaba también para reconstruir buena parte de una contraseña del SRI:
   * el largo exacto, el principio y el final. Y se imprimía en la consola,
   * que es justo lo que se copia y se pega en un chat cuando algo falla.
   *
   * Ahora es un resumen que no se puede desandar (FNV-1a de 32 bits). Sirve
   * igual para lo único que hace falta — ¿es la misma de antes, sí o no— y
   * no dice nada de la clave si se filtra.
   *
   * Las marcas viejas no coinciden con las nuevas: la primera vez, cada
   * contribuyente cuenta como «clave cambiada» y se le concede un intento.
   * Es exactamente lo que hay que hacer con una clave que no se sabe si sirve.
   */
  getSignature(password) {
    if (!password) return '';
    let h = 0x811c9dc5;
    for (let i = 0; i < password.length; i++) {
      h ^= password.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return 'h' + h.toString(36);
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
      // La marca NO se imprime, ni la vieja ni la nueva. Un log se pega en un
      // chat, en un ticket o en un correo; que ahí no haya nada de la clave.
      console.log(`🔑 [VAULT] La clave guardada de ${ruc} cambió desde el último rechazo. Concediendo 1 intento.`);
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
    // 🪪 Sello de identidad. El SRI acaba de aceptar la clave de ESTE ruc: la
    // sesion es suya, diga lo que diga la cabecera cacheada de otra app JSF.
    await SafeStorage.set({
      sri_tried_credentials: tried,
      flagged_errors: flagged,
      sc_sesion_confirmada: { ruc, ts: Date.now() }
    });
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
/**
 * ¿El wizard está armando una sustitutiva? Si lo dice el portal, ese período
 * ya está declarado.
 * @returns {{esSustitutiva: boolean, marca: string}}
 */
/**
 * ¿La pantalla actual es el resumen de pago del wizard?
 * Se apoya en elementos que SOLO existen ahí.
 */
function estaEnResumenDeclaracion() {
  const marcas = [
    'frmFlujoDeclaracion:pagValoresRemision',
    'frmFlujoDeclaracion:outTotalPagarSinRemision',
    'frmFlujoDeclaracion:totalAPagar',
    // Agregado el 06-sep-2026: cuando la declaración deja algo por cubrir, el
    // resumen muestra los medios de pago y las tres marcas de arriba quedaron
    // ocultas. El bot dijo «todavía no estamos en el resumen» estando en él, y
    // el verdadero motivo del bloqueo —$9.60 sin cubrir— nunca se nombró.
    'frmFlujoDeclaracion:divSaldosMediosPago'
  ];
  for (const id of marcas) {
    const el = document.getElementById(id);
    if (el && esVisible(el)) return true;
  }
  return false;
}

function tipoDeDeclaracionEnPantalla() {
  const el = document.getElementById('frmFlujoDeclaracion:outMarcaDeclaracion')
          || document.querySelector('[id$="outMarcaDeclaracion"]');
  const marca = el ? (el.textContent || '').trim().toUpperCase() : '';
  return { esSustitutiva: marca.includes('SUSTITUTIVA'), marca };
}

/**
 * Corta el flujo si el portal marcó la declaración como sustitutiva.
 * @returns {Promise<boolean>} true si hay que frenar.
 */
async function frenarSiEsSustitutiva(donde = '') {
  const { esSustitutiva, marca } = tipoDeDeclaracionEnPantalla();
  if (!esSustitutiva) return false;

  console.error(`🛑 [SUSTITUTIVA] El portal marca esta declaración como "${marca}"${donde ? ' (' + donde + ')' : ''}. ` +
                'Ese período YA fue declarado. El bot no presenta sustitutivas: se detiene.');

  if (typeof anotarBitacora === 'function') {
    await anotarBitacora('⛔ SUSTITUTIVA', `el portal marca "${marca}"${donde ? ' · ' + donde : ''}`);
  }

  try {
    const af = (await SafeStorage.get(['pending_sri_autofill', 'workflowPeriod']));
    const quien = af.pending_sri_autofill || {};
    if (quien.ruc) {
      if (typeof Omitidos !== 'undefined') {
        await Omitidos.anotar(quien.ruc, 'ya_declarada', {
          nombre: quien.name,
          detalle: 'El portal abrió una SUSTITUTIVA: el período ya estaba declarado. Recuperando comprobante.'
        });
      }
      // Constancia local para que el lote no vuelva a intentarlo.
      if (typeof SriLoop !== 'undefined' && af.workflowPeriod) {
        await SriLoop.marcarDeclarado(quien.ruc, af.workflowPeriod, { nombre: quien.name });
      }

      // 🧾 Si tenemos el periodo, vamos a Consulta de declaraciones a traer el comprobante oficial
      if (af.workflowPeriod && typeof irARecuperarComprobante === 'function') {
        console.log(`🧾 [SUSTITUTIVA] Redirigiendo a Consulta de declaraciones para recuperar el comprobante de ${quien.name || quien.ruc}...`);
        if (window.sriAssistant && window.sriAssistant.showEliteToast) {
          window.sriAssistant.showEliteToast({
            title: '🧾 Redirigiendo a Consulta',
            msg: 'Este período ya fue declarado. Yendo a descargar el comprobante oficial y guardarlo en Supabase...',
            duration: 6000
          });
        }
        await sleep(1200);
        await irARecuperarComprobante(quien.ruc, af.workflowPeriod, quien.name || '');
        return true;
      }
    }
  } catch (e) { /* registrar nunca puede impedir el freno */ }

  if (window.sriAssistant && window.sriAssistant.showEliteToast) {
    window.sriAssistant.showEliteToast({
      title: '🛑 Ya estaba declarada',
      msg: 'El portal abrió una <b>SUSTITUTIVA</b>: este período ya fue declarado. ' +
           'No se toca nada. Una sustitutiva la decidís vos, no el bot.',
      duration: 12000
    });
  }

  // Si el semáforo del lote está activo, se omite a este cliente ya declarado
  // y se avanza al siguiente, en vez de congelar a todos los clientes restantes.
  const autoRes = await SafeStorage.get(['auto_batch_enabled', 'sri_auto_mode']);
  const puedeSeguir = (autoRes.auto_batch_enabled || autoRes.sri_auto_mode) && 
                      (typeof SriLoop !== 'undefined' ? await SriLoop.puedeAvanzar() : false);

  if (puedeSeguir && typeof handleBatchNextClient === 'function') {
    console.log('⏩ [SUSTITUTIVA] Cliente ya declarado. Avanzando al siguiente cliente del lote...');
    await SafeStorage.remove(['pendingAction', 'actionTimestamp']);
    setTimeout(async () => {
      try {
        const hasNext = await handleBatchNextClient();
        if (!hasNext && typeof cerrarSesionSRI === 'function') await cerrarSesionSRI();
      } catch (err) {
        console.warn('⚠️ Error al avanzar al siguiente cliente tras sustitutiva:', err);
      }
    }, 2000);
  } else {
    // Si era ejecución manual o el lote terminó, se detiene.
    if (typeof SriLoop !== 'undefined') {
      await SriLoop.detener('Se abrió una sustitutiva: el período ya estaba declarado');
    }
    await SafeStorage.remove(['pendingAction', 'actionTimestamp']);
  }
  return true;
}

/**
 * ¿Este elemento lo dibujó la extensión?
 *
 * Todo lo que inyectamos lleva data-sc-ui. Las búsquedas dirigidas al portal
 * —cerrar un modal, hallar «Siguiente», salir de la sesión— tienen que
 * saltearlo: si no, el bot termina pulsándose a sí mismo.
 */
function esDeLaExtension(el) {
  if (!el || !el.closest) return false;
  return !!el.closest('[data-sc-ui], #sri-loop-hud, #sri-assistant-panel-root, #sri-elite-panel, #sri-smart-hub, #sri-main-toast');
}

/** Quita de una lista todo lo que sea nuestro. */
function soloDelPortal(lista) {
  return Array.from(lista || []).filter((el) => !esDeLaExtension(el));
}

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

/**
 * Traduce un HTTP de Supabase a algo que se pueda arreglar.
 *
 * Un 401 con una llave que no está vencida significa una sola cosa: la
 * revocaron del lado de Supabase. Pasó el 06-sep-2026 y el log sólo decía
 * «HTTP 401», que no le dice a nadie dónde ir.
 *
 * @param {number} status Código HTTP.
 * @returns {string} Texto para pegar al final del aviso, o cadena vacía.
 */
function avisoLlaveWeb(status) {
  if (status !== 401 && status !== 403) return '';

  // Antes que nada: ¿HAY una llave? Si `shared_config.js` no cargó, la
  // petición sale sin `apikey` y Supabase contesta 401 igual — pero decir «la
  // rechaza» manda a rotar una credencial que está sana. Un diagnóstico
  // equivocado cuesta más que no dar ninguno.
  if (!SC_SUPABASE_ANON_KEY) {
    return ' · pero NO hay ninguna llave cargada: la petición salió sin `apikey`. ' +
           'No es que Supabase la rechace, es que no había qué mandar. ' +
           'Revisá que shared_config.js se cargue antes del content script, o pegá una en Ajustes.';
  }

  // Si la llave salió de Ajustes, lo primero que hay que probar NO es buscar
  // otra: es BORRAR la de Ajustes. Pisa a la del código, y la del código puede
  // estar perfectamente sana — pasó el 07-sep-2026 y costó una corrida entera
  // de métricas. Una credencial de repuesto que no anda es peor que no tener
  // repuesto, porque tapa a la buena sin decir nada.
  if (SC_SUPABASE_ORIGEN === 'de Ajustes') {
    return ' · Supabase rechaza la llave que está guardada en AJUSTES, y esa llave pisa ' +
           'a la del código. Abrí Ajustes de la extensión y apretá «Borrar»: si la del ' +
           'código está sana, con eso alcanza. Recién si sigue fallando hace falta una nueva.';
  }
  // La llave del código dio HTTP 200 probada desde afuera el 07-sep-2026 y
  // 401 desde el content script. Antes de mandar a rotarla hay que descartar
  // que lo que sale por el cable no sea la llave entera: si el bundle la
  // truncara, el síntoma sería exactamente éste.
  //
  // Se dice la FORMA, nunca el valor: cuántos caracteres tiene y si sigue
  // pareciendo un JWT (tres partes separadas por punto). Alcanza para
  // distinguir «está rota» de «está sana y la rechazan», y no alcanza para
  // nada más. Un log se pega en un chat.
  const partes = String(SC_SUPABASE_ANON_KEY).split('.').length;
  const forma = `${SC_SUPABASE_ANON_KEY.length} caracteres, ${partes} parte(s)`;
  const sana = partes === 3 && SC_SUPABASE_ANON_KEY.length > 100;

  if (!sana) {
    return ` · la llave del código NO parece un JWT completo (${forma}). ` +
           'Revisá shared_config.js: rotarla no arreglaría nada.';
  }

  return ` · la llave del código llegó entera (${forma}) y Supabase igual dijo que no. ` +
         'Mirá el `code` que devolvió (arriba): si no lo hay, revisá que el proyecto ' +
         'esté activo. **Antes de rotar nada, leelo**: un 401 de Supabase casi nunca ' +
         'es la llave.';
}

/**
 * Lo que Supabase contestó en el cuerpo, traducido a qué hacer.
 *
 * **Un 401 de Supabase casi nunca es la llave.** PostgREST devuelve el motivo
 * real en el cuerpo, con el código de PostgreSQL, y este proyecto lo estuvo
 * tirando a la basura mientras el aviso mandaba a rotar una credencial sana.
 * Comprobado el 07-sep-2026 contra el proyecto de verdad:
 *
 *     401  select=id           → 200 ok
 *     401  select=is_deleted   → {"code":"42501","message":"permission denied for table clients"}
 *
 * `42501` es *insufficient_privilege*: la llave estaba perfecta y lo que
 * faltaba era un permiso sobre UNA columna. Media hora de diferencia entre el
 * diagnóstico bueno y el malo.
 *
 * @param {string} cuerpo El texto crudo de la respuesta.
 * @returns {string} Qué pasa y qué hacer, o '' si no se pudo interpretar.
 */
function loQueDijoSupabase(cuerpo) {
  if (!cuerpo) return '';
  let d = null;
  try { d = JSON.parse(cuerpo); } catch (e) { return ' · contestó: ' + String(cuerpo).slice(0, 160); }
  if (!d || typeof d !== 'object') return '';

  const code = d.code || '';
  const msg = d.message || d.msg || d.error_description || d.error || '';

  // Los dos que ya mordieron, dichos con lo que hay que hacer.
  if (code === '42501') {
    return ` · **NO es la llave**: PostgreSQL dice 42501 (permiso insuficiente) — «${msg}». ` +
           'El rol `anon` no puede tocar alguna columna de las que se piden. ' +
           'Se arregla con un GRANT en Supabase, o sacando esa columna de la consulta. ' +
           'Rotar la llave no cambia nada.';
  }
  if (code === '42703') {
    return ` · **NO es la llave**: PostgreSQL dice 42703 — «${msg}». ` +
           'Se está pidiendo una columna que no existe en la tabla. ' +
           'O se crea, o se saca de la consulta.';
  }
  if (/jwt|expired|invalid.*(key|token)/i.test(msg)) {
    return ` · Supabase habla de la credencial: «${msg}». Acá sí puede ser la llave.`;
  }
  return msg ? ` · Supabase contestó${code ? ' [' + code + ']' : ''}: «${msg}».` : '';
}

/**
 * Los comprobantes que hoy viven DENTRO de la base, en base64.
 *
 * Deuda histórica: hasta el 07-sep-2026 R2 no estaba en el flujo de subida, y
 * el PDF se guardaba entero en `clients.declaration_history`. Desde entonces
 * sube el 100% y sólo queda la URL — pero lo viejo sigue adentro.
 *
 * **Sólo lee.** Devuelve tres montones, y la distinción importa:
 *
 * - `migrables`: PDFs de verdad, con período `AAAA-MM` legible.
 * - `ambiguos`: PDFs cuyo período no se entiende (`2025`, `2026-S1`,
 *   `2025:IC`). **No se migran solos**: el período va en la ruta de R2, y
 *   archivar con un período inventado es el bug del 07-sep otra vez.
 * - `fragmentos`: menos de 200 bytes o no empiezan con `%PDF`. No son
 *   comprobantes; no hay nada que subir.
 *
 * @param {string|null} periodo Acota a un período (`'2026-08'`). `null` = todos.
 * @returns {Promise<{migrables: object[], ambiguos: object[], fragmentos: object[], error: string}>}
 */
async function listarComprobantesEmbebidos(periodo = null) {
  const vacio = { migrables: [], ambiguos: [], fragmentos: [], error: '' };
  if (!SC_SUPABASE_URL || !SC_SUPABASE_ANON_KEY) {
    return { ...vacio, error: 'No hay credenciales de Supabase cargadas.' };
  }
  const cab = { apikey: SC_SUPABASE_ANON_KEY, Authorization: `Bearer ${SC_SUPABASE_ANON_KEY}` };

  let filas;
  try {
    const r = await fetch(`${SC_SUPABASE_URL}/rest/v1/clients?select=id,ruc,name,declaration_history`,
                          { headers: cab });
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => '');
      const dijo = (typeof loQueDijoSupabase === 'function') ? loQueDijoSupabase(cuerpo) : '';
      return { ...vacio, error: `HTTP ${r.status}${dijo}` };
    }
    filas = await r.json();
  } catch (e) {
    return { ...vacio, error: 'No pude leer la base: ' + e.message };
  }

  const salida = { migrables: [], ambiguos: [], fragmentos: [], error: '' };

  filas.forEach((cli) => {
    const hist = Array.isArray(cli.declaration_history) ? cli.declaration_history : [];
    hist.forEach((dec, indice) => {
      const pf = (dec && dec.proof_file) || {};
      if (!pf.content) return;                       // ya está en la nube, o no hay nada
      if (pf.url || dec.pdfUrl) return;              // ya tiene URL: no es deuda

      const per = String(dec.period || '');
      if (periodo && per !== periodo) return;

      // ¿Es un PDF de verdad? Se mira el contenido, no el nombre del archivo.
      let crudo = String(pf.content);
      const marcaDatos = /^data:([^;]+);base64,/.exec(crudo);
      if (marcaDatos) crudo = crudo.slice(marcaDatos[0].length);
      let bytes = 0;
      let esPdf = false;
      try {
        const bin = atob(crudo);
        bytes = bin.length;
        esPdf = bin.slice(0, 5).startsWith('%PDF');
      } catch (e) { /* no decodifica: va a fragmentos */ }

      const item = {
        clienteId: cli.id, ruc: cli.ruc || '', nombre: cli.name || '',
        indice, periodo: per, tipo: dec.type || '', estado: dec.status || '',
        bytes, enBase: crudo.length,
        archivo: pf.name || `Declaracion_IVA_${cli.ruc}_${per}.pdf`,
        base64: crudo
      };

      // **La cabecera manda; el tamaño no descarta.** Un `%PDF` de 300 bytes
      // sigue siendo el comprobante de alguien. En los datos reales del
      // 10-sep-2026 los 473 fragmentos NO tenían cabecera de PDF, así que
      // pedir sólo la cabecera no deja entrar basura y no deja fuera a nadie.
      if (!esPdf) { salida.fragmentos.push(item); return; }
      // El período va en la ruta: si no es AAAA-MM, no se archiva a ciegas.
      if (!/^\d{4}-\d{2}$/.test(per)) { salida.ambiguos.push(item); return; }
      salida.migrables.push(item);
    });
  });

  const porPeso = (a, b) => b.bytes - a.bytes;
  salida.migrables.sort(porPeso);
  salida.ambiguos.sort(porPeso);
  return salida;
}

/**
 * Audita, de SOLO LECTURA, los comprobantes archivados con el período
 * equivocado por el bug del año-sacado-del-RUC (§2c del AGENTS.md, corregido
 * el 07-sep-2026: `extractFormPeriod()` tomaba el primer `202X` del texto de
 * la cabecera, y el RUC del contribuyente a veces lo lleva adentro —ej.
 * `0706482023001` contiene `2023`—). NO mueve ni borra nada: sólo lista
 * candidatos para que el usuario decida.
 *
 * Heurística: una declaración es candidata cuando el AÑO de su `period` NO
 * coincide con el año en que realmente se guardó (`updated_at`) Y ese mismo
 * año aparece como substring dentro del RUC del cliente — la huella exacta
 * del bug. Cualquiera de las dos señales sola puede ser legítima (una
 * declaración atrasada real, o una coincidencia de dígitos); las dos juntas
 * son la firma del bug. Sigue siendo una lista de candidatos, no un veredicto.
 *
 * @returns {Promise<{sospechosos: object[], revisados: number, error: string}>}
 */
async function auditarPeriodosSospechosos() {
  const vacio = { sospechosos: [], revisados: 0, error: '' };
  if (!SC_SUPABASE_URL || !SC_SUPABASE_ANON_KEY) {
    return { ...vacio, error: 'No hay credenciales de Supabase cargadas.' };
  }
  const cab = { apikey: SC_SUPABASE_ANON_KEY, Authorization: `Bearer ${SC_SUPABASE_ANON_KEY}` };

  let filas;
  try {
    const r = await fetch(`${SC_SUPABASE_URL}/rest/v1/clients?select=id,ruc,name,declaration_history`,
                          { headers: cab });
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => '');
      const dijo = (typeof loQueDijoSupabase === 'function') ? loQueDijoSupabase(cuerpo) : '';
      return { ...vacio, error: `HTTP ${r.status}${dijo}` };
    }
    filas = await r.json();
  } catch (e) {
    return { ...vacio, error: 'No pude leer la base: ' + e.message };
  }

  const sospechosos = [];
  let revisados = 0;

  filas.forEach((cli) => {
    const ruc = cli.ruc || '';
    const hist = Array.isArray(cli.declaration_history) ? cli.declaration_history : [];
    hist.forEach((dec, indice) => {
      if (!dec || !dec.period) return;
      revisados++;
      const mPer = String(dec.period).match(/^(\d{4})/);
      const anioPeriodo = mPer && mPer[1];
      if (!anioPeriodo || !ruc.includes(anioPeriodo)) return;

      const mGuardado = dec.updated_at ? String(dec.updated_at).match(/^(\d{4})/) : null;
      const anioGuardado = mGuardado && mGuardado[1];
      // Coinciden → el año no es sospechoso: declaró ese año, ese mismo año.
      if (anioGuardado && anioGuardado === anioPeriodo) return;

      sospechosos.push({
        clienteId: cli.id, ruc, nombre: cli.name || '',
        indice, periodo: String(dec.period), tipo: dec.type || '',
        guardadoEl: dec.updated_at || '', anioPeriodo, anioGuardado: anioGuardado || '(sin fecha)'
      });
    });
  });

  return { sospechosos, revisados, error: '' };
}

/**
 * Sube UN comprobante a R2 y recién entonces lo saca de la base.
 *
 * **La regla de oro**: estos PDFs no tienen copia en ningún lado. El `content`
 * sólo se borra después de haber **leído el objeto de vuelta desde R2** y
 * comprobado que es el mismo archivo. Si algo falla en el medio, la base
 * queda intacta y el comprobante sigue donde estaba.
 *
 * @param {object} item Un elemento de `listarComprobantesEmbebidos().migrables`.
 * @returns {Promise<{ok: boolean, url?: string, motivo?: string}>}
 */
async function migrarUnComprobanteEmbebido(item) {
  if (!item || !item.base64) return { ok: false, motivo: 'sin contenido' };

  // 1 · A bytes.
  let blob;
  try {
    const bin = atob(item.base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    blob = new Blob([arr], { type: 'application/pdf' });
  } catch (e) { return { ok: false, motivo: 'el base64 no decodifica' }; }

  // 2 · La MISMA ruta que usarían las subidas nuevas. La semilla vive en este
  //     navegador: por eso esto no se puede correr desde un script de afuera.
  let ruta;
  try {
    ruta = await rutaDeComprobante(item.ruc, item.periodo, item.archivo);
  } catch (e) { return { ok: false, motivo: 'no pude calcular la ruta: ' + e.message }; }

  // 3 · Subir.
  let url;
  try {
    url = await uploadToCloudflareR2Direct(ruta, blob, 'application/pdf');
    if (!url) return { ok: false, motivo: 'la subida no devolvió URL' };
  } catch (e) { return { ok: false, motivo: 'R2 rechazó la subida: ' + e.message }; }

  // 4 · **Leerlo de vuelta.** Sin esto, borrar el base64 es tirar el único
  //     ejemplar confiando en que la subida salió bien.
  try {
    // El content script NO puede leer de R2 con fetch directo: CORS desde
    // Chrome 85, y host_permissions no lo exime (misma lección que la subida).
    // Va por el service worker, que sí puede — con *.r2.dev y *.workers.dev
    // en el manifest.
    const v = await chrome.runtime.sendMessage({ tipo: 'SC_VERIFICAR_R2', url });
    if (!v || !v.ok) {
      const detalle = (v && (v.error || (v.status ? 'HTTP ' + v.status : ''))) || 'el service worker no respondió';
      return { ok: false, motivo: `subió pero no se pudo releer desde R2 (${detalle})` };
    }
    if (v.bytes !== item.bytes) {
      return { ok: false, motivo: `subió ${v.bytes} bytes y el original tiene ${item.bytes}` };
    }
    if (!String(v.cabecera || '').startsWith('%PDF')) {
      return { ok: false, motivo: 'lo que volvió de R2 no es un PDF' };
    }
  } catch (e) { return { ok: false, motivo: 'no pude releerlo desde R2: ' + e.message }; }

  // 5 · Recién ahora se toca la base. Se relee el cliente para no pisar lo que
  //     otra corrida haya escrito mientras tanto.
  const cabS = { apikey: SC_SUPABASE_ANON_KEY, Authorization: `Bearer ${SC_SUPABASE_ANON_KEY}`,
                 'Content-Type': 'application/json' };
  try {
    const r = await fetch(
      `${SC_SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(item.clienteId)}&select=declaration_history`,
      { headers: cabS });
    if (!r.ok) return { ok: false, motivo: `subió a R2, pero no pude releer al cliente (HTTP ${r.status})` };
    const filas = await r.json();
    const hist = (filas[0] && filas[0].declaration_history) || [];
    const dec = hist[item.indice];

    // Si la entrada ya no es la misma, no se toca: puede haberla movido otra
    // corrida. El PDF ya está en R2; el próximo listado lo va a ver igual.
    if (!dec || String(dec.period || '') !== item.periodo || !(dec.proof_file || {}).content) {
      return { ok: false, motivo: 'el historial cambió mientras se migraba; no se tocó nada' };
    }

    dec.proof_file = { ...(dec.proof_file || {}), content: null, url, provider: 'cloudflare_r2' };
    dec.pdfUrl = url;

    const w = await fetch(`${SC_SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(item.clienteId)}`,
      { method: 'PATCH', headers: cabS, body: JSON.stringify({ declaration_history: hist }) });
    if (!w.ok) {
      const cuerpo = await w.text().catch(() => '');
      const dijo = (typeof loQueDijoSupabase === 'function') ? loQueDijoSupabase(cuerpo) : '';
      return { ok: false, motivo: `subió a R2 pero la base no se actualizó: HTTP ${w.status}${dijo}` };
    }
  } catch (e) {
    return { ok: false, motivo: 'subió a R2 pero falló al actualizar la base: ' + e.message };
  }

  return { ok: true, url };
}

/**
 * La semilla con la que se ofuscan las rutas de los comprobantes.
 *
 * Se genera sola la primera vez y vive **únicamente** en el almacén local de
 * esta computadora: no está en el repositorio, no viaja en la extensión y no
 * se sube a ningún lado. Perderla no pierde ningún comprobante —la URL de cada
 * uno queda guardada en la base— pero cambia las rutas de los que vengan.
 *
 * @returns {Promise<string>} 64 hex.
 */
async function semillaDeRutas() {
  try {
    const g = await SafeStorage.get(['sc_semilla_rutas']);
    if (g.sc_semilla_rutas) return g.sc_semilla_rutas;
  } catch (e) { /* se genera una nueva */ }

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const semilla = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try { await SafeStorage.set({ sc_semilla_rutas: semilla }); } catch (e) { /* nada */ }
  console.log('🔐 [RUTAS] Semilla nueva creada. Las rutas de los comprobantes dejan de ser adivinables.');
  return semilla;
}

/**
 * La ruta donde se guarda el comprobante de un contribuyente.
 *
 * **Por qué no es `declaraciones/<RUC>/<archivo>` a secas.** Esa ruta se deduce
 * del RUC, y el RUC en Ecuador es la cédula + 001. Con el bucket servido por el
 * dominio público `pub-*.r2.dev`, cualquiera que sepa una cédula se bajaba la
 * declaración de esa persona. El link ES la credencial cuando se manda por
 * WhatsApp: lo que no puede pasar es que la credencial se derive de un dato
 * público.
 *
 * El tramo del medio son 88 bits de HMAC sobre (RUC · período) con la semilla
 * local. Determinista a propósito: el mismo comprobante siempre cae en la
 * misma ruta, así que sigue valiendo no volver a subir lo que ya está.
 *
 * @param {string} ruc
 * @param {string} periodo 'YYYY-MM'
 * @param {string} archivo Nombre del PDF.
 * @returns {Promise<string>}
 */
async function rutaDeComprobante(ruc, periodo, archivo) {
  try {
    const semilla = await semillaDeRutas();
    const enc = new TextEncoder();
    const llave = await crypto.subtle.importKey(
      'raw', enc.encode(semilla), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const firma = await crypto.subtle.sign('HMAC', llave, enc.encode(`${ruc}|${periodo}`));
    const tramo = Array.from(new Uint8Array(firma).slice(0, 11),
                             (b) => b.toString(16).padStart(2, '0')).join('');
    return `declaraciones/${ruc}/${tramo}/${archivo}`;
  } catch (e) {
    // Si el navegador no diera WebCrypto, es preferible una ruta con azar sin
    // memoria —que puede duplicar una subida— antes que una adivinable.
    console.warn('🔐 [RUTAS] No se pudo derivar la ruta; se usa uno al azar:', e.message);
    const azar = Array.from(crypto.getRandomValues(new Uint8Array(11)),
                            (b) => b.toString(16).padStart(2, '0')).join('');
    return `declaraciones/${ruc}/${azar}/${archivo}`;
  }
}

function redondear(numero) {
  return Math.round(numero * 100) / 100;
}

function getSriDueDateDay(ninthDigit) {
  const map = { 1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 22, 8: 24, 9: 26, 0: 28, 10: 28 };
  return map[ninthDigit] || 28;
}

function clientAunNoEmpiezaADeclarar(c, tp, targetPeriodRef) {
  // La web marca "aún no empieza a declarar" con clientStartPeriod (primer período
  // de obligación: "Al día desde"/"Inicio de Obligaciones"). Si se especifica un
  // período de referencia (ej. el del lote o celda), se valida contra él; de lo
  // contrario, se usa el mes calendario anterior.
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

function isClientMensual(db) {
  if (!db || !db.ruc) return false;
  if (db.isDeleted || db.is_deleted) return false;
  if (db.isActive === false || db.is_active === false) return false;

  const tp = db.tax_profile || db.taxProfile || {};
  const freq = (tp.ivaFrequency || db.iva_frequency || db.ivaFrequency || '').toLowerCase();
  const reg = (db.regime || '').toLowerCase();
  const type = (db.client_type || db.clientType || tp.clientType || '').toLowerCase();

  if (type === 'solo_plan' || db.requires_declarations === false || tp.requiresDeclarations === false) return false;
  if (clientAunNoEmpiezaADeclarar(db, tp)) return false;
  if (freq === 'mensual') return true;
  if (freq === 'semestral' || freq === 'ninguno' || freq === 'anual') return false;
  if (reg.includes('popular')) return false;
  if (reg.includes('emprendedor')) {
    return freq === 'mensual';
  }
  // 💤 Sin frecuencia marcada, ya NO se incluye por defecto (10-sep-2026):
  // así aparecían clientes viejos y de prueba que nunca declararon la
  // frecuencia en la web. La lista real es la que sincroniza tu web — un
  // cliente de verdad la trae marcada.
  return false;
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
  marcarParadaPedida();

  // 🚦 El semáforo es la ÚNICA autoridad del bucle (AGENTS §2): puedeAvanzar()
  // pregunta por sc_loop.estado, no por banderas sueltas. Antes esta función
  // solo apagaba las banderas viejas: la barra roja desaparecía pero sc_loop
  // seguía CORRIENDO y el bucle continuaba — «no se puede detener la extensión».
  // Parar de verdad = SriLoop.emergencia(), el mismo camino del 🛑 del HUD.
  if (typeof SriLoop !== 'undefined') {
    await SriLoop.emergencia('la barra roja flotante');
    // emergencia() sincroniza las banderas viejas apagadas y descarta la acción
    // pendiente; ghost_manual_mode queda de nuestra cuenta y la cola legacy se
    // barre como antes (sc_loop.cola es la de verdad, DETENIDO la inmoviliza).
    await SafeStorage.set({ ghost_manual_mode: true });
    await SafeStorage.remove(['auto_batch_queue', 'auto_batch_index']);
  } else {
    // Red de seguridad si el semáforo no llegó a cargar (no debería pasar en
    // un clic: 02 ya cargó). Parar no puede fallar por esto.
    await SafeStorage.set({
      sri_master_switch_on: false,
      auto_batch_enabled: false,
      sri_auto_mode: false,
      autoDeclaration: false,
      sriAutomationPaused: true,
      ghost_manual_mode: true
    });
    await SafeStorage.remove(['pendingAction', 'actionTimestamp', 'auto_batch_queue', 'auto_batch_index']);
  }
  
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

// ============================================================
// 🛑 COMPUERTA ÚNICA DE PARADA PARA EL TRABAJO EN CURSO
// ============================================================
// «Parar tiene que parar» (AGENTS §2). El 09-sep-2026 el usuario pulsó 🛑 y el
// bot SIGUIÓ: terminó el llenado, clickeó «Siguiente» y entró al bucle de
// «desmissear advertencias» de 20 s. Los botones de parada marcaban el
// almacén y el semáforo, pero los bucles que ya estaban corriendo en la página
// no los miraban — seguían con lo mismo hasta el final.
//
// Todo bucle de la página que repita una acción consulta sePidioParar() y
// corta en seco. En memoria (lo que se pulsó en ESTA página) + el semáforo
// (un lote vivo parado) + el almacén (pausa/stop). La marca en memoria expira
// a los 3 minutos o la limpia un arranque nuevo (SriLoop.iniciar/reanudar).
let paradaPedidaEnMemoria = 0;
function marcarParadaPedida() { paradaPedidaEnMemoria = Date.now(); }
function limpiarParadaPedida() { paradaPedidaEnMemoria = 0; }

async function sePidioParar() {
    if (paradaPedidaEnMemoria && Date.now() - paradaPedidaEnMemoria < 180000) return true;
    try {
        const sem = await SriLoop.get();
        if (sem && Array.isArray(sem.cola) && sem.cola.length > 0) {
            // Lote de verdad: la autoridad es el semáforo. Sólo DETENIDO es
            // "se pidió parar" y descarta lo pendiente. PAUSADO y PAUSANDO NO:
            // el lote sigue vivo y ▶ lo reanuda. El modo paso a paso vive en
            // PAUSADO entre fases — tratarlo como parada borraba el
            // pendingAction en cada recarga y el lote no avanzaba nunca
            // (DELGADO QUITO, 10-sep-2026). La pausa suave promete "termina el
            // cliente en curso", así que tampoco corta el trabajo a medias.
            return sem.estado === 'DETENIDO';
        }
    } catch (e) { /* si no se puede leer, seguir con el resto de la compuerta */ }
    try {
        const r = await SafeStorage.get(['sriAutomationPaused']);
        if (r.sriAutomationPaused === true) return true;
    } catch (e) { /* lo mismo */ }
    return false;
}

/** Devuelve true si se pidió parar y deja constancia en la consola. */
async function cortarSiPidieronParar(rotulo = '') {
    if (!(await sePidioParar())) return false;
    console.warn('🛑 [PARADA] ' + (rotulo || 'Trabajo en curso') +
                 ' cortado: el usuario pidió detener.');
    return true;
}

function renderEmergencyStopBar() {
  if (typeof isSRILoginPage === 'function' && isSRILoginPage()) return;
  SafeStorage.get(['auto_batch_enabled', 'autoDeclaration', 'sri_master_switch_on', 'pendingAction', 'sc_loop']).then(st => {
    // La autoridad es el semáforo (AGENTS §2): si sc_loop está CORRIENDO hay
    // bucle aunque las banderas viejas digan lo contrario (estados varados que
    // dejó el bug «no se puede detener»: master en false con bucle vivo).
    const sem = st.sc_loop || {};
    const semaforoCorriendo = sem.estado === 'CORRIENDO';
    const isRunning = semaforoCorriendo ||
        ((st.auto_batch_enabled || st.autoDeclaration || st.pendingAction) && st.sri_master_switch_on !== false);
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
  clearCapturedPdf('cerrarSesionSRI');
  await anotarBitacora('cierra sesión', force ? 'forzado' : 'fin de cliente');

  // 1. Destrucción de Caché (Bomba de Memoria)
  try {
    sessionStorage.clear();
    localStorage.clear();
    console.log("💣 Caché local de la SPA destruido.");
  } catch (e) {
    console.warn("⚠️ No se pudo purgar el almacenamiento local:", e);
  }

  // 2. Exterminio de Cookies Total (SW Cookie Bomb + document.cookie)
  try {
    document.cookie =
      "JSESSIONID=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie =
      "KEYCLOAK_IDENTITY=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  } catch (e) {
    console.warn("⚠️ No se pudieron limpiar las cookies locales:", e);
  }

  // Purga profunda de cookies HttpOnly en todas las sub-apps del SRI vía Service Worker
  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ tipo: "SC_LIMPIAR_SESION_SRI" }, (resp) => {
        if (resp && resp.ok) {
          console.log(`🍪 [LOGOUT SW] ${resp.eliminadas} cookies del SRI destruidas en el navegador.`);
        }
        resolve();
      });
      setTimeout(resolve, 800);
    });
  } catch (e) {
    console.warn("⚠️ Error solicitando purga de cookies al Service Worker:", e);
  }

  // El último candidato, `[title*="Cerrar"]`, es peligrosamente amplio:
  // encontraba nuestro propio botón «Cerrar la declaración» y lo pulsaba
  // creyendo que era el icono de salir del portal. La sesión no se cerraba y
  // encima se disparaba el cierre mágico. Ahora cada candidato pasa el filtro.
  const logoutIcon = [
    'span.topbar-icon.material-icons.sri-icon-cerrar-sesion',
    '.sri-icon-cerrar-sesion',
    'span.sri-icon-cerrar-sesion',
    'em.sri-icon-cerrar-sesion',
    'i.sri-icon-cerrar-sesion',
    'a[href*="logout"]',
    '[title*="Cerrar"]'
  ].reduce((hallado, sel) =>
    hallado || soloDelPortal(document.querySelectorAll(sel))[0] || null, null);
  if (logoutIcon) {
    try {
      // El icono del SRI lleva `href="javascript:..."`, y una navegación
      // `javascript:` la bloquea la CSP de la extensión: el clic no hace nada
      // y deja dos violaciones en la consola por cliente. Con 25 clientes son
      // 50 líneas de ruido tapando lo que importa. Enseguida se cae al
      // endpoint canónico, que es el que de verdad cierra la sesión, así que
      // ni siquiera hay que intentarlo.
      const enlaceDelIcono = logoutIcon.closest('a, button, li');
      const hrefDelIcono = (enlaceDelIcono && enlaceDelIcono.getAttribute('href')) || '';
      if (hrefDelIcono.toLowerCase().startsWith('javascript:')) {
        console.log('🚪 [LOGOUT] El icono del portal usa una URL «javascript:», que la CSP bloquea. ' +
                    'Se va directo al endpoint de cierre.');
        throw new Error('icono con javascript: — se usa el endpoint canónico');
      }
      console.log("✅ Haciendo clic en icono de cerrar sesión...", logoutIcon);
      clickElement(logoutIcon, "Icono Cerrar Sesión SRI");
      const parentLink = logoutIcon.closest("a, button, li");
      if (parentLink) {
        const href = parentLink.getAttribute("href") || "";
        if (!href.toLowerCase().startsWith("javascript:")) {
          clickElement(parentLink, "Enlace Padre Cerrar Sesión");
        }
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
let capturedPdfRuc = null;
let capturedPdfPeriod = null;

function getActiveClientRuc() {
  try {
    if (window.sriAssistant && typeof window.sriAssistant.extractClientInfo === 'function') {
      const info = window.sriAssistant.extractClientInfo();
      if (info && info.ruc && /^\d{10,13}$/.test(String(info.ruc).trim())) {
        return String(info.ruc).trim();
      }
    }
  } catch (e) {}
  try {
    const el = document.querySelector('[id*="ruc"], [name*="ruc"], #lblRuc, .ruc-usuario, #usuario');
    if (el) {
      const val = (el.value || el.textContent || '').match(/\b(0[1-9]\d{8,11})\b/);
      if (val && val[1]) return val[1];
    }
  } catch (e) {}
  return null;
}

function setCapturedPdf(base64, origen = "") {
  if (!base64 || typeof base64 !== "string") return;
  capturedPdfBase64 = base64;
  capturedPdfRuc = getActiveClientRuc();
  console.log(
    `📄 [PDF CAPTURE] ¡PDF Oficial SRI capturado mediante ${origen}! Tamaño: ${base64.length} chars | RUC activo: ${capturedPdfRuc || 'desconocido'}`
  );
}

function clearCapturedPdf(motivo = "") {
  if (capturedPdfBase64) {
    console.log(
      `🧹 [PDF PURGE] Limpiando PDF capturado en memoria (${capturedPdfBase64.length} chars, RUC: ${capturedPdfRuc || 'desconocido'}). Motivo: ${motivo || 'desconocido'}`
    );
  }
  capturedPdfBase64 = null;
  capturedPdfRuc = null;
  capturedPdfPeriod = null;
}
if (typeof window !== "undefined") {
  window.sriLimpiarPdfMemoria = clearCapturedPdf;
}

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
            setCapturedPdf(base64, "createObjectURL");
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
                setCapturedPdf(base64, "XHR");
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
            setCapturedPdf(base64, "Fetch");
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
            setCapturedPdf(base64, "window.open");
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
            setCapturedPdf(base64, "DOM Element");
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
    const printBtns = soloDelPortal(
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
    // 🎯 PRIORIDAD CEP: Si existe el botón específico "Imprimir comprobante de pago",
    // ése es el comprobante oficial de pago que el SRI emite con código de barras y valor.
    const btnComprobantePago = printBtns.find((el) => {
      const txt = (el.innerText || el.value || el.textContent || "").toLowerCase();
      return txt.includes("comprobante de pago") || txt.includes("comprobante para pago");
    });

    if (btnComprobantePago) {
      const idx = printBtns.indexOf(btnComprobantePago);
      if (idx !== -1) printBtns.splice(idx, 1);
      printBtns.unshift(btnComprobantePago);
      console.log("🎯 [PDF MASTER] Botón 'Imprimir comprobante de pago' priorizado sobre formulario.");
    } else if (confirmedPrintBtn && esVisible(confirmedPrintBtn) && !printBtns.includes(confirmedPrintBtn)) {
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
              setCapturedPdf(base64, "Fetch FormData");

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
// ── SUBIDA DEL COMPROBANTE (vía service worker) ─────────────────────────────
// ⚠️ NO subir desde acá con fetch directo. Desde Chrome 85 los content scripts
// están sujetos a CORS y host_permissions NO los exime: tanto el Worker relay
// como R2 rechazaban el preflight con
//   "blocked by CORS policy: No 'Access-Control-Allow-Origin' header".
//
// El service worker (background.js) sí puede hacer la petición cross-origin
// con las host_permissions del manifest. Acá solo le pasamos el PDF.
async function uploadToCloudflareR2Direct(key, blob, contentType = "application/pdf") {
  const cfg = (typeof window !== "undefined" && window.SC_CONFIG) || {};

  // El service worker no recibe Blobs por mensaje: va como base64.
  const base64 = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No se pudo leer el PDF"));
    fr.readAsDataURL(blob);
  });

  let r;
  try {
    r = await chrome.runtime.sendMessage({
      tipo: "SC_SUBIR_COMPROBANTE",
      key,
      base64,
      contentType,
      config: cfg,
    });
  } catch (e) {
    console.error("❌ [R2] No se pudo hablar con el service worker:", e.message);
    console.error("   Si la extensión se acaba de actualizar, recargá la página.");
    throw new Error("Service worker no disponible");
  }

  if (r && r.ok && r.url) {
    console.log(`✅ [R2] Comprobante subido (${r.via}):`, r.url);
    anotarBitacora('PDF SUBIDO', r.via);
    return r.url;
  }

  anotarBitacora('PDF NO SUBIÓ', (r && r.error) || 'sin detalle');
  console.error("❌ [R2] Ningún camino de subida funcionó. El comprobante NO quedó en la nube.");
  // Un motivo por camino, para poder arreglarlo en vez de adivinar.
  const motivos = (r && r.motivos) || (r && r.error ? [r.error] : []);
  motivos.forEach((m) => console.error("   ·", m));
  console.error("   Probá sriProbarSubida() en Chrome normal: por un proxy como Burp esto puede fallar por el TLS.");
  throw new Error("No se pudo subir a Cloudflare R2");
}

/**
 * ¿Sube el comprobante? Lo prueba con un archivo mínimo por el mismo camino.
 * Uso: sriProbarSubida() en la consola de cualquier pestaña del SRI.
 */
async function probarSubida() {
  const cfg = (typeof window !== 'undefined' && window.SC_CONFIG) || {};
  console.log('🧪 Probando la subida con un archivo mínimo...');

  let r;
  try {
    r = await chrome.runtime.sendMessage({ tipo: 'SC_DIAGNOSTICO_SUBIDA', config: cfg });
  } catch (e) {
    console.error('❌ No se pudo hablar con el service worker:', e.message);
    console.error('   Recargá la extensión en chrome://extensions y volvé a probar.');
    return null;
  }

  if (!r) { console.error('❌ El service worker no respondió nada.'); return null; }

  const cfgInforme = r.configurado || {};
  console.log('── Configuración ──');
  console.table([{
    'Worker relay': cfgInforme.worker ? '✅ configurado' : '❌ falta',
    'Claves S3': cfgInforme.s3 ? '✅ presentes' : '❌ faltan',
    'Bucket': cfgInforme.bucket || '(sin definir)'
  }]);

  console.log('── Qué pasó en cada intento ──');
  console.table((r.intentos || []).map((i) => ({
    via: i.via,
    resultado: i.omitido ? '⏭️ ' + i.omitido
             : i.error ? '❌ ' + i.error
             : i.ok ? '✅ subió'
             : `❌ HTTP ${i.estado}`,
    detalle: (i.respuesta || '').slice(0, 80) || (i.url || '')
  })));

  if (r.ok) {
    console.log(`✅ LA SUBIDA FUNCIONA (vía ${r.via}).`, r.url);
    console.log('   El comprobante de una declaración va a llegar a la nube.');
  } else {
    console.error('❌ LA SUBIDA NO FUNCIONA por ningún camino.');
    console.error('   Los comprobantes NO se están guardando en la nube.');
  }
  return r;
}

if (typeof window !== 'undefined') window.sriProbarSubida = () => probarSubida();

// Sincronización ultraligera con Supabase enviando estructura StoredFile compatible
/**
 * Deja constancia EN LA WEB de que la clave del SRI de este contribuyente no
 * sirve, para que se vea desde SantiagoCordova.com sin abrir la extensión.
 * Nunca escribe la clave: solo su estado.
 *
 * @param {string} ruc
 * @param {'ok'|'incorrecta'|'caducada'|'bloqueada'} estado
 * @param {string} motivo Texto corto para mostrar en la ficha.
 */
async function marcarCredencialEnLaWeb(ruc, estado, motivo = '') {
  if (!ruc || !SC_SUPABASE_URL || !SC_SUPABASE_ANON_KEY) return false;
  const cab = {
    apikey: SC_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SC_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const r = await fetch(
      // SIN `is_deleted=eq.false`. El rol `anon` no tiene permiso sobre esa
      // columna (42501, comprobado el 07-sep-2026) y el filtro convertía cada
      // consulta en un 401. La búsqueda es por UN RUC concreto — el que se
      // está declarando—, así que traer un borrado sería inofensivo; no
      // traer nada no lo era.
      `${SC_SUPABASE_URL}/rest/v1/clients?ruc=eq.${encodeURIComponent(ruc)}&select=id,tax_profile`,
      { headers: cab }
    );
    if (!r.ok) {
      // El cuerpo PRIMERO: Supabase dice el motivo real ahí. El aviso sobre la
      // llave queda como último recurso, para cuando no dijo nada.
      let cuerpo = '';
      try { cuerpo = await r.text(); } catch (e) { /* si no se puede leer, se sigue */ }
      const dijo = (typeof loQueDijoSupabase === 'function') ? loQueDijoSupabase(cuerpo) : '';
      console.warn(`⚠️ [WEB] No pude consultar a ${ruc}: HTTP ${r.status}` +
                   (dijo || avisoLlaveWeb(r.status)));
      return false;
    }

    const filas = await r.json();
    if (!filas.length) { console.warn(`⚠️ [WEB] ${ruc} no está en la base web; no se marca nada.`); return false; }

    const cli = filas[0];
    const perfil = (cli.tax_profile && typeof cli.tax_profile === 'object') ? cli.tax_profile : {};

    // Si vuelve a andar o ingresa con éxito, registramos el timestamp de último acceso verificado
    if (estado === 'ok') {
      perfil.sriCredencial = {
        estado: 'ok',
        ultimo_ingreso: new Date().toISOString(),
        marcado_por: 'Nueva Luz'
      };
    } else {
      perfil.sriCredencial = {
        estado,
        motivo: String(motivo || '').slice(0, 200),
        cuando: new Date().toISOString(),
        marcado_por: 'Nueva Luz'
      };
    }

    const p = await fetch(`${SC_SUPABASE_URL}/rest/v1/clients?id=eq.${cli.id}`, {
      method: 'PATCH',
      headers: { ...cab, Prefer: 'return=minimal' },
      body: JSON.stringify({ tax_profile: perfil, updated_at: new Date().toISOString() })
    });

    if (!p.ok) { console.warn(`⚠️ [WEB] No pude marcar a ${ruc}: HTTP ${p.status}`); return false; }
    console.log(estado === 'ok'
      ? `🌐 [WEB] ${ruc}: clave verificada OK, último ingreso registrado en Supabase.`
      : `🌐 [WEB] ${ruc} marcado en la web: clave ${estado}.`);
    return true;
  } catch (e) {
    console.warn('⚠️ [WEB] Error marcando la credencial:', e);
    return false;
  }
}

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

  // 🛡️ BLINDAJE CONTRA CONTAMINACIÓN CRUZADA DE COMPROBANTES:
  // Si la declaración tiene saldo a pagar o inconsistencias, NO SE ENVIÓ AL SRI.
  // Por ende, NO existe comprobante oficial de presentación para este período.
  const noEsDeclaracionEnviada = (customStatus === 'por_pagar' || customStatus === 'inconsistencia' || customStatus === 'sin_declarar');
  if (noEsDeclaracionEnviada) {
    console.log(`🛑 [PDF GUARD] Declaración con estado '${customStatus}' (${ruc}, ${canonicalPeriod}): NO se adjunta comprobante PDF porque la declaración no fue presentada.`);
    clearCapturedPdf('estado_no_enviado_' + customStatus);
    pdfContentBase64 = null;
  }

  // Si hay un PDF capturado en memoria pero pertenece a OTRO contribuyente, descartarlo inmediatamente
  if (capturedPdfBase64 && capturedPdfRuc && capturedPdfRuc !== ruc) {
    console.warn(`🚨 [PDF CONTAMINATION GUARD] Descartando PDF de memoria: pertenece a RUC ${capturedPdfRuc}, pero estamos procesando ${ruc}.`);
    clearCapturedPdf('ruc_mismatch');
  }

  // Esperar activamente hasta 8 segundos a que los interceptores de 5 capas capturen el PDF OFICIAL REAL del SRI (solo si fue enviada)
  let realPdf = noEsDeclaracionEnviada ? null : (pdfContentBase64 || capturedPdfBase64);
  if (typeof realPdf !== "string") realPdf = null;
  if (!noEsDeclaracionEnviada && !realPdf) {
    console.log(
      "⏳ [PDF SYNC] Esperando emisión y captura del PDF oficial del SRI...",
    );
    for (let attempt = 0; attempt < 16; attempt++) {
      await tryCaptureRealPdfFromDOM(attempt === 0);
      if (capturedPdfRuc && capturedPdfRuc !== ruc) {
        clearCapturedPdf('dom_capture_ruc_mismatch');
      }
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

  // Sin comprobante oficial hay que maquetar uno de respaldo solo si fue enviada
  let pdfData = null;
  if (!noEsDeclaracionEnviada) {
    if (!realPdf) await ensureJsPdfLoaded();
    pdfData = realPdf || generateValidPdfBase64(ruc, canonicalPeriod, clientName);
  }

  try {
    let pdfUrl = "";
    let storageProvider = "cloudflare_r2";
    const fileName = `Declaracion_IVA_${ruc}_${canonicalPeriod}.pdf`;
    // UNA sola ruta para los tres destinos. Calcularla dos veces invita a que
    // se suba a un lado y se devuelva el link de otro.
    const vaultPath = await rutaDeComprobante(ruc, canonicalPeriod, fileName);
    const publicUrlVault = `${SUPABASE_URL}/storage/v1/object/public/clients-vault/${vaultPath}`;
    const publicUrlProofs = `${SUPABASE_URL}/storage/v1/object/public/sri_proofs/${vaultPath}`;

    if (pdfData && !noEsDeclaracionEnviada) {
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
                `${SUPABASE_URL}/storage/v1/object/sri_proofs/${vaultPath}`,
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
    }

    // 🧾 Constancia del resultado de la subida, junto a la de la declaración.
    if (typeof SriLoop !== 'undefined') {
      try {
        const per = (await SafeStorage.get(['workflowPeriod'])).workflowPeriod
                 || SriLoop.periodoPorDefecto();
        if (pdfUrl) {
          await SriLoop.marcarPdfSubido(ruc, per, { url: pdfUrl, provider: storageProvider });
          await anotarBitacora('comprobante guardado', storageProvider);
        } else if (!noEsDeclaracionEnviada) {
          await anotarBitacora('⚠️ sin comprobante', 'la declaración quedó sin PDF en la nube');
        }
      } catch (e) { console.warn('No se pudo registrar el estado del PDF:', e); }
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

    const proofFileObj = (pdfData && !noEsDeclaracionEnviada) ? {
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

        // Ventas: Extraídas directamente de los casilleros del formulario (401, 403, 404, 405, 421, 422, 424)
        ventas15: ventasData.base15 || 0,
        ventas5: ventasData.base5 || 0,
        ventas8: ventasData.base8 || 0,
        ventas0: ventasData.base0 || 0,
        montoIvaVentas: ventasData.iva15 || (ventasData.base15 || 0) * 0.15,
        montoIva5: ventasData.iva5 || 0,
        montoIva8: ventasData.iva8 || 0,

        // Compras: Extraídas por el Extractor V1 de las Facturas Recibidas
        compras15: facturas.iva15?.baseImponible || 0,
        compras5: facturas.iva5?.baseImponible || 0,
        compras8: facturas.iva8?.baseImponible || 0,
        compras0: facturas.iva0?.baseImponible || 0,
        // El IVA de compras se SUMA, no se recalcula: multiplicar la base por
        // 0.15 estaba dando de más en cuanto aparecía una compra al 5%.
        montoIvaCompras:
          (facturas.iva15?.montoIva ?? (facturas.iva15?.baseImponible || 0) * 0.15) +
          (facturas.iva5?.montoIva ?? 0) +
          (facturas.iva8?.montoIva ?? 0),
        // Cuántas facturas quedaron sin tarifa reconocible. Un cero acá no es
        // «no había»: es «todas se pudieron ubicar». La diferencia importa
        // cuando alguien mire estos números dentro de un año.
        comprasDudosas: Array.isArray(facturas.ambiguas) ? facturas.ambiguas.length : 0,

        // Retenciones: Extraídas por el Extractor V1 o leídas del formulario si están disponibles
        retIva: (retenciones.ivaRetenido?.total ?? retenciones.retIva ?? 0) || ventasData.retIvaForm || 0,
        retRenta: (retenciones.rentaRetenida?.total ?? retenciones.retRenta ?? 0) || ventasData.retRentaForm || 0,
        retBaseTotal: (retenciones.ivaRetenido?.baseTotal ?? 0)
                    + (retenciones.rentaRetenida?.baseTotal ?? 0)
                    || retenciones.baseImponible || 0,
        // Base solo de renta: es la que sirve para proyectar el impuesto anual,
        // separada de la de IVA. Ver OBJETIVO_BOVEDA_RENTA.md
        retRentaBase: retenciones.rentaRetenida?.baseTotal ?? 0,
        retIvaBase: retenciones.ivaRetenido?.baseTotal ?? 0,
        retCantidad: retenciones.totalRetenciones ?? 0,

        // Notas de Crédito
        nc15: notasCredito.iva15?.baseImponible || 0,
        nc5: notasCredito.iva5?.baseImponible || 0,
        nc0: notasCredito.iva0?.baseImponible || 0,
        ncTotal: notasCredito.totalGeneral || 0,
      },
    } : null;

    const decType = canonicalPeriod.length === 7 ? 'IVA' : (canonicalPeriod.includes('ANEXO') ? 'ANEXO' : 'RENTA');
    // Canónico de estado: 'Enviada' es el enum estándar DeclarationStatus.Enviada en la app web y matriz
    const finalStatus = (customStatus === 'completado' || customStatus === 'Realizada' || !customStatus)
      ? 'Enviada'
      : customStatus;
    const declarationToUpsert = {
      client_id: client.id,
      type: decType,
      period: canonicalPeriod,
      status: finalStatus,
      proof_file: proofFileObj,
      updated_at: new Date().toISOString()
    };

    // 1. Upsert a la tabla relacional sri_declaraciones con on_conflict explícito
    try {
      const res1 = await fetch(`${SUPABASE_URL}/rest/v1/sri_declaraciones?on_conflict=client_id,type,period`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(declarationToUpsert),
      });

      if (res1.ok || res1.status === 201 || res1.status === 204) {
        console.log(`✅ [SUPABASE] sri_declaraciones guardado (upsert): ${ruc} (${canonicalPeriod}).`);
      } else {
        const errText = await res1.text().catch(() => "");
        // Si falló con 401/42501 (falta de política UPDATE en RLS para anon), intentar INSERT directo
        if (res1.status === 401 || errText.includes("42501")) {
          console.warn(`⚠️ [SUPABASE] Upsert bloqueado por RLS (401/42501). Probando INSERT directo para ${ruc}...`);
          const resDirect = await fetch(`${SUPABASE_URL}/rest/v1/sri_declaraciones`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(declarationToUpsert),
          });

          if (resDirect.ok || resDirect.status === 201) {
            console.log(`✅ [SUPABASE] sri_declaraciones guardado (INSERT directo): ${ruc} (${canonicalPeriod}).`);
          } else if (resDirect.status === 409) {
            console.log(`ℹ️ [SUPABASE] sri_declaraciones ya existía para ${ruc} (${canonicalPeriod}).`);
          } else {
            console.warn(`⚠️ [SUPABASE] sri_declaraciones INSERT falló: HTTP ${resDirect.status}`);
          }
        } else {
          console.warn(`⚠️ [SUPABASE] sri_declaraciones POST HTTP ${res1.status}: ${errText.slice(0, 150)}`);
        }
      }
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
          status: finalStatus,
          proof_file: proofFileObj,
          updated_at: new Date().toISOString()
        }
      ];

      const resPatch = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${client.id}`, {
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

      if (resPatch.ok || resPatch.status === 204) {
        console.log(`✅ [SUPABASE] clients.declaration_history actualizado para ${ruc} (${canonicalPeriod}).`);
      } else {
        console.warn(`⚠️ [SUPABASE] clients.declaration_history PATCH HTTP ${resPatch.status}`);
      }
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

      // 📢 Notificar en tiempo real a la pestaña de SantiagoCordova.com
      if (typeof SafeStorage !== 'undefined' && SafeStorage.set) {
        await SafeStorage.set({
          last_declaration_completed: {
            ruc,
            period: canonicalPeriod,
            type: decType,
            success: true,
            pdfUrl: pdfUrl,
            proof_file: proofFileObj,
            timestamp: Date.now()
          }
        });
      }
    } catch (cacheErr) {
      console.warn("⚠️ Local cache sync error:", cacheErr);
    }
  } catch (e) {
    console.warn("⚠️ Supabase sync error:", e);
  } finally {
    clearCapturedPdf('post_sync_complete');
  }
}

// ============================================================
// PODERES DE AUTO ADMIN & MODO AUTO BUCLE
// ============================================================
async function handleBatchNextClient() {
  clearCapturedPdf('handleBatchNextClient_start');
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
    "sc_declaraciones_locales",
    "sri_period_order",
  ]);
  let queue = Array.isArray(res.auto_batch_queue) ? res.auto_batch_queue : [];
  let currentIndex = res.auto_batch_index || 0;
  let batchEnabled = !!res.auto_batch_enabled;
  // 🗓️ ORDEN DE MESES: { ruc, periodos: ['AAAA-MM', ...] } armada desde el popup.
  // Mientras exista, la cola es UNA orden del mismo contribuyente en varios
  // meses consecutivos: se desactiva el ferrocarril (nada de meter clientes
  // sueltos en medio) y entre ítems del mismo RUC NO se cierra la sesión.
  const ordenActiva = res.sri_period_order || null;

    if (typeof SriLoop !== 'undefined') {
      const loopData = await SriLoop.get();
      if (loopData && loopData.estado === 'CORRIENDO' && Array.isArray(loopData.cola) && loopData.cola.length > 0) {
        // 🚦 El semáforo es LA autoridad sobre la cola, no un respaldo.
        // Antes solo se usaba si auto_batch_queue venía vacía; con restos de
        // una corrida anterior (un cliente, índice al final) el lote concluía
        // que no había siguiente, cerraba sesión y se detenía.
        batchEnabled = true;
        queue = loopData.cola;
        currentIndex = loopData.indice || 0;
        console.log(`🚦 [BUCLE] Cola del semáforo: ${currentIndex + 1}/${queue.length}.`);
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
  // 🕯️ Pero la Lista Bendita manda: si está activa, solo entran los benditos.
  // 🗓️ Y si hay una ORDEN DE MESES activa, el tren se frena: la orden es del
  // cliente elegido y no queremos que se metan clientes sueltos en el medio.
  if (ordenActiva) {
    console.log('🗓️ [ORDEN MESES] Ferrocarril desactivado: la cola es una orden del mismo contribuyente.');
  } else {
  const benditaActiva = await leerBendita();   // null = inactiva = todos entran
  const benditaSet = benditaActiva === null ? null : new Set(benditaActiva.map(String));
  const existingRucs = new Set(queue.map(q => q && q.ruc).filter(Boolean));
  let nuevosAgregados = 0;
  for (const c of cacheList) {
    if (!c || !c.ruc) continue;
    if (existingRucs.has(c.ruc)) continue;
    if (benditaSet && !benditaSet.has(String(c.ruc))) continue;   // no bendito → no corre
    const clave = c.password || c.sri_password || c.sriPassword;
    if (!clave) continue;
    if (flaggedErrs[c.ruc] || tried[c.ruc]?.status === 'failed' || tried[c.ruc]?.status === 'locked') continue;
    if (typeof clientAunNoEmpiezaADeclarar === 'function' &&
        clientAunNoEmpiezaADeclarar(c, c.tax_profile || c.taxProfile || {}, targetPeriodStr)) continue;

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
  }

  const registroLocal = res.sc_declaraciones_locales || {};

  const isClientDoneOrError = (item) => {
    const clientRuc = item && item.ruc;
    if (!clientRuc || flaggedErrs[clientRuc]) return true;
    const clientPer = item.period || targetPeriodStr;
    // 🧾 Constancia de esta misma corrida: si ya declaró el periodo, no se
    // vuelve. BUG real (10-sep-2026): esto trataba CUALQUIER registro local
    // como "ya está", con o sin `pdfSubido`. Un cliente en cola marcado
    // `soloRecuperar` —ya declaró, sólo le falta el comprobante— tiene
    // justamente un registro local sin `pdfSubido`, así que desaparecía en
    // silencio de acá en cuanto no era el primero del lote: nunca llegaba a
    // la rama que lo recupera. Ahora sólo cuenta como "hecho" si el PDF ya
    // subió, o si el cliente no estaba marcado para recuperar nada.
    const reg = registroLocal[`${clientRuc}|${clientPer}`];
    if (reg && (reg.pdfSubido || !item.soloRecuperar)) {
      console.log(`🧾 [REGISTRO] ${clientRuc} ya declaró ${clientPer} en esta corrida.`);
      return true;
    }
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
        return (d.period || "").includes(clientPer);
      });
    }
    return false;
  };

  while (
    nextIndex < queue.length &&
    isClientDoneOrError(queue[nextIndex])
  ) {
    console.log(
      `⏩ [MODO AUTO BUCLE] Saltando cliente ya realizado, con error o credencial fallida: ${queue[nextIndex].ruc}`,
    );
    nextIndex++;
  }

  if (nextIndex < queue.length) {
    const nextClient = queue[nextIndex];
    const clientPer = nextClient.period || targetPeriodStr;
    console.log(
      `🚀 [MODO AUTO BUCLE] Siguiente cliente (${nextIndex + 1}/${queue.length}): ${nextClient.name} (${nextClient.ruc}) [Período: ${clientPer}] [Modo: ${res.auto_batch_mode || 'startIvaNavigation'}]`,
    );

    const pParts = clientPer.split("-");
    const pYear = parseInt(pParts[0]);
    const pMonth = parseInt(pParts[1]) - 1; // monthIndex 0..11 para workflowPeriod
    const periodoSiguiente = { year: pYear, monthIndex: pMonth };

    // 🧾 BUG real (10-sep-2026): este método arma pendingAction para el
    // siguiente cliente con su PROPIA copia, sin mirar `soloRecuperar`. Ese
    // flag —puesto por armarCola() para quien YA declaró y sólo le falta el
    // PDF— sólo lo respetaba SriLoop.prepararCliente(), y a ése únicamente lo
    // llama arrancarLote() para el cliente #1. Del #2 en adelante, un cliente
    // marcado «solo recuperar» terminaba pasando por `turbo_step1_facturas`
    // igual que cualquiera — extraía todo, navegaba el wizard entero, y recién
    // en el paso 4 el freno de la sustitutiva lo frenaba. No declaraba mal
    // (el freno lo evita) pero quemaba minutos por cada uno de esos clientes.
    // El orden «primero el comprobante» pedido por el usuario depende de que
    // ESTA rama también lo respete, no sólo la del primer cliente.
    if (nextClient.soloProbarClave) {
      console.log(`🔑 [PROBAR CLAVES] ${nextClient.name || nextClient.ruc}: sólo entra y sale, no declara nada.`);
      await SafeStorage.set({
        auto_batch_index: nextIndex,
        pending_sri_autofill: {
          ruc: nextClient.ruc, password: nextClient.password, name: nextClient.name,
          timestamp: Date.now(), manual: true, isBatch: true,
        },
        pendingAction: 'probar_clave',
        actionTimestamp: Date.now(),
        ghost_manual_mode: false,
      });
      if (typeof SriLoop !== 'undefined') {
        await SriLoop.avanzarIndice(nextIndex);
        await SriLoop.avanzarA(nextIndex);
      }
      await GhostMemory.clearCurrent();
      await sleep(1000);
      await cerrarSesionSRI();
      return true;
    }

    if (nextClient.soloRecuperar) {
      console.log(`🧾 [BUCLE] ${nextClient.name || nextClient.ruc} ya declaró: solo se recupera su comprobante.`);
      await SafeStorage.set({
        auto_batch_index: nextIndex,
        pending_sri_autofill: {
          ruc: nextClient.ruc, password: nextClient.password, name: nextClient.name,
          timestamp: Date.now(), manual: true, isBatch: true,
        },
        pendingAction: 'recuperar_comprobante',
        recuperarComprobante: {
          ruc: nextClient.ruc, nombre: nextClient.name, periodo: periodoSiguiente,
          per: clientPer, intentos: 0,
        },
        workflowPeriod: periodoSiguiente,
        actionTimestamp: Date.now(),
        ghost_manual_mode: false,
      });
      if (typeof SriLoop !== 'undefined') {
        await SriLoop.avanzarIndice(nextIndex);
        await SriLoop.avanzarA(nextIndex);
      }
      await SafeStorage.remove(['declaration_synced_flag', 'iva_sin_ubicar']);
      await GhostMemory.clearCurrent();
      await sleep(1000);
      await cerrarSesionSRI();
      return true;
    }

    // 🧾→🚀 «Primero el comprobante, después declarar» (10-sep-2026). Espejo
    // exacto de lo que SriLoop.prepararCliente() hace para el cliente #1 —
    // acá hace falta porque este método arma el pendingAction del siguiente
    // cliente con su propia copia, sin llamar a prepararCliente(). El
    // handler de `bajar_todos_comprobantes` en 03_ingreso_y_sesion.js sigue
    // con `continuarCon` en cuanto el barrido de años termina.
    if (nextClient.barrerAntes) {
      console.log(`🧾 [BUCLE] ${nextClient.name || nextClient.ruc}: primero el comprobante, después declarar.`);
      await SafeStorage.set({
        auto_batch_index: nextIndex,
        pending_sri_autofill: {
          ruc: nextClient.ruc, password: nextClient.password, name: nextClient.name,
          timestamp: Date.now(), manual: true, isBatch: true,
        },
        pendingAction: 'bajar_todos_comprobantes',
        bajarTodos: {
          ruc: nextClient.ruc, nombre: nextClient.name, soloFaltantes: true,
          continuarCon: res.auto_batch_mode || 'turbo_step1_facturas',
          continuarPeriodo: periodoSiguiente,
        },
        workflowPeriod: periodoSiguiente,
        actionTimestamp: Date.now(),
        ghost_manual_mode: false,
      });
      if (typeof SriLoop !== 'undefined') {
        await SriLoop.avanzarIndice(nextIndex);
        await SriLoop.avanzarA(nextIndex);
      }
      await SafeStorage.remove(['declaration_synced_flag', 'iva_sin_ubicar']);
      await GhostMemory.clearCurrent();
      await sleep(1000);
      await cerrarSesionSRI();
      return true;
    }

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
      workflowPeriod: periodoSiguiente,
      actionTimestamp: Date.now(),
      ghost_manual_mode: false
      // Las banderas de encendido las gestiona SriLoop, no este método.
      // Escribirlas acá era lo que anulaba la pausa del usuario.
    });

    // 🚦 Que el contador del HUD (cliente N/M) siga la realidad del lote.
    if (typeof SriLoop !== 'undefined') await SriLoop.avanzarIndice(nextIndex);

    if (typeof SriLoop !== 'undefined') await SriLoop.avanzarA(nextIndex);

    // Resetear flag para que el Cierre Mágico se ejecute en el nuevo cliente
    await SafeStorage.remove(['declaration_synced_flag', 'iva_sin_ubicar']);


    await GhostMemory.clearCurrent();

    // 🗓️ ORDEN DE MESES: si el siguiente item es del MISMO contribuyente y hay
    // sesión abierta, no hace falta salir y volver a entrar: se mantiene la
    // sesión y se navega directo a Comprobantes Recibidos con el periodo nuevo.
    // El flujo semi-inmutable (03) replanta turbo_step1_facturas con el
    // workflowPeriod que ya dejamos escrito acá. Si el SRI se complica (exige
    // re-login), el auto-login con pending_sri_autofill ya puesto lo resuelve.
    const itemAnterior = queue[currentIndex] || {};
    const mismosRuc = !!(ordenActiva && nextClient.ruc && itemAnterior.ruc === nextClient.ruc);
    if (mismosRuc && !window.location.href.toLowerCase().includes('/auth/realms/')) {
      console.log(
        '🗓️ [ORDEN MESES] Mismo contribuyente, siguiente mes sin cerrar sesión: navegando a Comprobantes...',
        `${nextClient.period || targetPeriodStr}`,
      );
      await sleep(1000);
      window.location.href = SRI_RECIBIDOS_URL;
      return true;
    }

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
    // 🗓️ La orden de meses terminó: se limpia para que el siguiente arranque
    // vuelva al comportamiento normal (cola de todo el periodo).
    if (ordenActiva) await SafeStorage.remove(['sri_period_order']);
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

/**
 * Lo que dice el formulario de acceso del PORTAL, y nada más.
 *
 * **Por qué no `document.body.innerText`.** El cuerpo de la página incluye la
 * barra flotante de la extensión, sus avisos y el panel de omitidos, donde
 * figuran las palabras «clave», «incorrecta» y «error». Leer eso y concluir
 * que el SRI rechazó una credencial es el bot leyéndose a sí mismo y creyendo
 * que habló el portal.
 *
 * Ya había pasado con `esPantallaCambioClave()` y volvió a pasar el
 * 07-sep-2026: un contribuyente que HABÍA entrado quedó marcado con la clave
 * mala, y esa marca lo deja afuera hasta que alguien la borre a mano.
 *
 * Devuelve cadenas vacías cuando no hay formulario. Eso significa «no hay de
 * dónde leer», no «no fue rechazado»: quien llame decide, y lo correcto ahí es
 * reintentar, no condenar.
 *
 * @returns {{aviso: string, texto: string}} `aviso` es el cartel de error del
 *   formulario, si está a la vista. `texto` es el formulario entero.
 */
function loQueDiceElFormularioDeAcceso() {
  const campos = typeof encontrarCamposLogin === 'function' ? encontrarCamposLogin() : null;
  const ancla = campos && (campos.pass || campos.ruc);
  if (!ancla) return { aviso: '', texto: '' };

  // El ámbito NO es el `<form>`.
  //
  // En Keycloak —que es lo que usa el SRI— el cartel de error es HERMANO del
  // formulario, no hijo: vive en `#kc-content-wrapper`, encima del form. Al
  // restringir la lectura al `<form>` para no leerme a mí mismo me quedé
  // corto, y el motivo real del rechazo quedaba invisible: tres contribuyentes
  // salieron como «sesión caída» el 07-sep-2026 sin que el bot pudiera decir
  // por qué.
  //
  // Se sube al contenedor de login del portal, y los nodos de la extensión se
  // quitan explícitamente. Ni todo el body —donde me leo a mí mismo— ni sólo
  // el form, donde no veo lo que dice el portal.
  const zona = ancla.closest('#kc-content-wrapper, #kc-content, .login-pf-page, .card-pf') ||
               ancla.closest('form') ||
               ancla.closest('div.card, div.login, main') ||
               ancla.parentElement;
  if (!zona) return { aviso: '', texto: '' };

  // Una copia sin la barra flotante ni los avisos de la extensión. El clon no
  // se inserta en ningún lado: sólo se lo lee.
  const limpio = zona.cloneNode(true);
  limpio.querySelectorAll('[id^="sri-"], [id^="slh-"], [class*="sri-assistant"], [class*="ghost-"]')
        .forEach((n) => n.remove());

  // `.alert` a secas agarra cualquier caja informativa de una página hecha con
  // Bootstrap, y Keycloak está hecho con Bootstrap. Se exige que esté a la
  // vista: un cartel oculto es un cartel que el portal decidió no mostrar.
  const cartel = zona.querySelector(
    '.alert-error, .alert-danger, .kc-feedback-text, .ui-messages-error, #input-error, .alert');
  const aviso = (cartel && (typeof esVisible !== 'function' || esVisible(cartel)))
    ? (cartel.innerText || cartel.textContent || '').trim() : '';

  return { aviso, texto: limpio.innerText || limpio.textContent || '' };
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
    //
    // El texto se busca ALREDEDOR de los campos de contraseña, no en todo
    // el body. Mirar el body entero hace que el bot se lea a sí mismo: un
    // aviso NUESTRO que diga «la clave expiró» dispararía la detección. Es
    // la misma trampa que la de pulsar nuestros propios botones.
    const cajas = Array.from(document.querySelectorAll('input[type="password"]'))
        .filter((el) => !(typeof esDeLaExtension === 'function' && esDeLaExtension(el)));
    const cerca = cajas.length
        ? (cajas[0].closest('form, section, .ui-dialog, main, article') || cajas[0].parentElement)
        : null;
    const txt = ((cerca ? cerca.textContent : (document.body ? document.body.textContent : '')) || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    // «Su clave expiro, acceda a la opción cambiar clave y modifíquela» es la
    // frase textual del portal, confirmada en la traza del 06-sep-2026. Faltaba.
    const pide = /actualice su clave|actualizar su clave|cambio de clave obligatorio|debe cambiar su clave|su clave (ha caducado|expiro|expiró)|clave expirada|acceda a la opcion cambiar clave/.test(txt);
    return pide && cajas.length >= 2;
}

/**
 * ¿El SRI pide cambiar la clave? Se pregunta ANTES de navegar a ningún lado.
 *
 * `esPantallaCambioClave()` sólo sirve estando YA en esa pantalla, con los dos
 * campos de contraseña delante. Pero el aviso aparece antes —en el portal— y
 * recién después redirige: cuando el bot miraba, todavía no había campos, se
 * iba derecho al wizard y rebotaba. Con la actualización nacional de claves
 * eso pasaría en TODOS los clientes del lote.
 *
 * Por eso se le pregunta primero al portal, que lo sabe sin ambigüedad, y la
 * pantalla queda de respaldo.
 *
 * 🛑 Detectar no es resolver: cambiar una contraseña es una operación de
 * credenciales y este bot no la hace nunca. Marca al cliente y sigue.
 *
 * @returns {Promise<{pide: boolean, mensaje: string, via: string}>}
 */
async function elSriPideCambiarLaClave() {
  // 1 · El portal, que es quien lo sabe.
  try {
    if (typeof SriApi !== 'undefined' && SriApi.claveVencida) {
      const r = await SriApi.claveVencida();
      // Un `null` es «no pude preguntar», no «está vigente»: se sigue mirando.
      if (r && r.vencida) return { pide: true, mensaje: r.mensaje, via: 'api' };
      if (r && !r.vencida) return { pide: false, mensaje: '', via: 'api' };
    }
  } catch (e) { /* se sigue con la pantalla */ }

  // 2 · La pantalla, si ya nos redirigió.
  if (esPantallaCambioClave()) {
    return { pide: true, mensaje: 'El portal abrió la pantalla de cambio de clave.', via: 'pantalla' };
  }
  return { pide: false, mensaje: '', via: 'ninguno' };
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

// 💤 Ya NO consulta Supabase por su cuenta — elección del usuario, 10-sep-2026:
// «la lista real es la de mi web, no quiero clientes fantasma». Antes esta
// función le preguntaba a Supabase directamente y por eso aparecían clientes
// viejos y de prueba: `isClientMensual` decía «sí, incluir» a cualquiera sin
// la frecuencia marcada, y ese default vivía en TRES copias del mismo filtro
// (acá, en bridge_content.js y en renderAnticipationWidget) que nadie
// mantenía sincronizadas.
//
// La única fuente de la verdad ahora es `sc_clients_cache`: la llena
// `bridge_content.js` sincronizando lo que ves en el menú Declaraciones de tu
// web (cada 2,5 s mientras esa pestaña está abierta), o lo que importaste a
// mano por CSV. Se mantiene el nombre de la función y la forma del retorno
// (array de clientes) para no tocar a cada uno de los que la llaman.
async function fetchClientsDirectly() {
  try {
    const cache = await SafeStorage.get(["sc_clients_cache"]);
    const list = Array.isArray(cache.sc_clients_cache) ? cache.sc_clients_cache : [];
    return list.filter(isClientMensual);
  } catch (err) {
    console.warn("fetchClientsDirectly error:", err);
    return [];
  }
}

function getNinthDigit(ruc) {
  if (!ruc || ruc.length < 9) return 99;
  const digit = parseInt(ruc.charAt(8), 10);
  if (isNaN(digit)) return 99;
  return digit === 0 ? 10 : digit;
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

  // 10-sep-2026: era una tercera copia del mismo filtro, con su propio
  // default (a veces `true`, acá ya `false`). Tres copias del mismo criterio
  // es cómo un default quedó suelto sin que nadie lo notara. Delega en el
  // único `isClientMensual` de arriba.
  const isClientMensualLocal = (c) => {
    if (typeof isClientMensual === 'function') return isClientMensual(c);
    return false;
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
                    ⚡ SC TAXPILOT PRO
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
        await SafeStorage.remove(['declaration_synced_flag', 'iva_sin_ubicar']);

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
