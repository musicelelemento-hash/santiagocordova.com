// sc_sesion.js — Sesión del estudio en Supabase (Supabase Auth, sin supabase-js)
// ---------------------------------------------------------------------------
// Misma copia en las tres extensiones (01 Nueva Luz, 02 Cambio de Claves,
// 04 Anulador). Si la cambiás en una, copiala a las otras dos.
//
// Por qué existe: la llave `anon` viaja dentro de la extensión y cualquiera
// puede sacarla. Las tablas con datos de clientes se van a cerrar para `anon`
// (santiagocordova-main/docs/ENCARGO_SESION_LOCAL.md) y desde entonces sólo
// responden con un usuario que inició sesión.
//
// Reglas:
//  - La CONTRASEÑA no se guarda nunca. Se usa una vez para pedir los tokens y
//    se descarta. Lo que queda en `chrome.storage.local` es el access token
//    (vence ~1 h) y el refresh token (renueva solo).
//  - Sin sesión, `cabeceras()` cae a la llave anon y deja `sinSesion: true`:
//    mientras la base no esté cerrada todo sigue andando igual; después, la
//    respuesta 401 se traduce en «Inicia sesión» en vez de fallar callada.
//  - Funciona en service worker, popup, página de opciones y content script.
// ---------------------------------------------------------------------------
(function (global) {
  'use strict';

  var CLAVE = 'sc_sesion_web';         // { access_token, refresh_token, expires_at, email, user_id }
  var CLAVE_AVISO = 'sc_sesion_web_aviso'; // { motivo, cuando } — el último problema, para mostrarlo
  var MARGEN_MS = 90 * 1000;           // renovar si faltan menos de 90 s

  var cache = null;          // última sesión leída en este contexto
  var renovando = null;      // promesa en curso, para no renovar dos veces a la vez

  function cfg() {
    var c = global.SC_CONFIG || {};
    return { url: String(c.SUPABASE_URL || '').replace(/\/$/, ''), anon: String(c.SUPABASE_ANON_KEY || '') };
  }

  function hayStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function leer() {
    return new Promise(function (ok) {
      if (!hayStorage()) return ok(cache);
      chrome.storage.local.get([CLAVE], function (d) { cache = (d && d[CLAVE]) || null; ok(cache); });
    });
  }

  function escribir(s) {
    cache = s;
    return new Promise(function (ok) {
      if (!hayStorage()) return ok();
      var o = {}; o[CLAVE] = s;
      chrome.storage.local.set(o, function () { ok(); });
    });
  }

  function avisar(motivo) {
    if (!hayStorage()) return;
    var o = {}; o[CLAVE_AVISO] = motivo ? { motivo: motivo, cuando: Date.now() } : null;
    chrome.storage.local.set(o);
  }

  function aSesion(r, emailPrevio) {
    var expiraEn = Number(r.expires_in) || 3600;
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      expires_at: r.expires_at ? Number(r.expires_at) * 1000 : Date.now() + expiraEn * 1000,
      email: (r.user && r.user.email) || emailPrevio || '',
      user_id: (r.user && r.user.id) || '',
    };
  }

  function vigente(s) {
    return !!(s && s.access_token && s.expires_at && s.expires_at - Date.now() > MARGEN_MS);
  }

  async function pedirToken(grant, cuerpo) {
    var c = cfg();
    if (!c.url || !c.anon) throw new Error('Falta la URL o la llave pública de Supabase.');
    var res = await fetch(c.url + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST',
      headers: { apikey: c.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    var texto = await res.text();
    var json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch (e) { /* respuesta no-JSON */ }
    if (!res.ok) {
      var msg = (json && (json.error_description || json.msg || json.message || json.error)) || ('HTTP ' + res.status);
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  /** Inicia sesión. La contraseña no se guarda. */
  async function iniciar(email, password) {
    email = String(email || '').trim();
    if (!email || !password) throw new Error('Escribí el correo y la contraseña.');
    var r = await pedirToken('password', { email: email, password: String(password) });
    var s = aSesion(r, email);
    await escribir(s);
    avisar(null);
    return { email: s.email, expires_at: s.expires_at };
  }

  async function renovar(s) {
    try {
      var r = await pedirToken('refresh_token', { refresh_token: s.refresh_token });
      var nueva = aSesion(r, s.email);
      await escribir(nueva);
      avisar(null);
      return nueva;
    } catch (e) {
      // Otro contexto (popup, SW, otra pestaña) pudo haberla renovado justo antes
      // y quemado este refresh token: si en el almacén ya hay una vigente, sirve.
      var actual = await leer();
      if (vigente(actual)) return actual;
      if (e.status === 400 || e.status === 401 || e.status === 403) {
        await escribir(null);
        avisar('La sesión venció. Inicia sesión otra vez.');
      } else {
        avisar('No se pudo renovar la sesión: ' + e.message);
      }
      return null;
    }
  }

  /** Vencimiento (ms) de un JWT, sin validarlo: sólo para no usar uno vencido. */
  function expDeJwt(jwt) {
    try {
      var p = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return (JSON.parse(atob(p)).exp || 0) * 1000;
    } catch (e) { return 0; }
  }

  /**
   * Respaldo: el access token de la sesión de la WEB que copia el puente de
   * Nueva Luz (`sc_supabase_token`). No se renueva desde acá; sólo sirve
   * mientras no venza. En las otras extensiones esa clave no existe.
   */
  function tokenPrestado() {
    return new Promise(function (ok) {
      if (!hayStorage()) return ok(null);
      chrome.storage.local.get(['sc_supabase_token'], function (d) {
        var t = d && d.sc_supabase_token;
        ok(t && expDeJwt(t) - Date.now() > MARGEN_MS ? t : null);
      });
    });
  }

  /** Access token vigente, renovándolo si hace falta. `null` = sin sesión. */
  async function token() {
    var s = vigente(cache) ? cache : await leer();
    if (vigente(s)) return s.access_token;
    if (s && s.refresh_token) {
      if (!renovando) renovando = renovar(s).finally(function () { renovando = null; });
      var nueva = await renovando;
      if (nueva) return nueva.access_token;
    }
    return tokenPrestado();
  }

  /** Lo que va después de «Bearer »: el token de sesión, o la llave si no hay sesión. */
  async function bearer(anon) {
    var t = null;
    try { t = await token(); } catch (e) { t = null; }
    return t || anon || cfg().anon;
  }

  /**
   * Encabezados para /rest/v1 y /storage/v1.
   * @param {string} [anon] llave pública a usar (la de Ajustes, si hay); por defecto la del código.
   * @param {object} [extra] encabezados adicionales.
   */
  async function cabeceras(anon, extra) {
    var llave = anon || cfg().anon;
    var t = null;
    try { t = await token(); } catch (e) { t = null; }
    var h = { apikey: llave, Authorization: 'Bearer ' + (t || llave) };
    if (extra) for (var k in extra) h[k] = extra[k];
    Object.defineProperty(h, 'sinSesion', { value: !t, enumerable: false });
    return h;
  }

  /** Para la interfaz: quién está conectado, sin tokens. */
  async function estado() {
    var s = await leer();
    var aviso = await new Promise(function (ok) {
      if (!hayStorage()) return ok(null);
      chrome.storage.local.get([CLAVE_AVISO], function (d) { ok((d && d[CLAVE_AVISO]) || null); });
    });
    return {
      conectado: !!(s && s.refresh_token),
      email: (s && s.email) || '',
      vence: (s && s.expires_at) || 0,
      aviso: aviso && aviso.motivo ? aviso.motivo : '',
    };
  }

  async function cerrar() {
    var s = await leer();
    if (s && s.access_token) {
      var c = cfg();
      try {
        await fetch(c.url + '/auth/v1/logout', {
          method: 'POST',
          headers: { apikey: c.anon, Authorization: 'Bearer ' + s.access_token },
        });
      } catch (e) { /* cerrar localmente igual */ }
    }
    await escribir(null);
    avisar(null);
  }

  /** Avisar que Supabase rechazó una petición sin sesión (para pintar «Inicia sesión»). */
  function rechazoSinSesion(status) {
    if (status === 401 || status === 403) avisar('Supabase pidió iniciar sesión (HTTP ' + status + ').');
  }

  /**
   * Arma un formulario de sesión mínimo dentro de `contenedor` (popups de las
   * extensiones 02 y 04). Todo por DOM, sin innerHTML con datos.
   */
  function montarFormulario(contenedor) {
    if (!contenedor || typeof document === 'undefined') return;
    var d = document;
    function el(tag, props, estilo) {
      var e = d.createElement(tag);
      for (var k in (props || {})) e[k] = props[k];
      if (estilo) e.style.cssText = estilo;
      return e;
    }
    var caja = el('div', {}, 'border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:8px;margin:6px 0;font-size:12px');
    var titulo = el('div', { textContent: '👤 Sesión del estudio' }, 'font-weight:700;margin-bottom:4px');
    var estadoEl = el('div', { textContent: '—' }, 'margin-bottom:6px');
    var email = el('input', { type: 'email', placeholder: 'correo', autocomplete: 'username' }, 'width:100%;box-sizing:border-box;margin-bottom:4px');
    var pass = el('input', { type: 'password', placeholder: 'contraseña', autocomplete: 'current-password' }, 'width:100%;box-sizing:border-box;margin-bottom:4px');
    var btnIn = el('button', { type: 'button', textContent: 'Iniciar sesión' });
    var btnOut = el('button', { type: 'button', textContent: 'Cerrar sesión' });
    var nota = el('div', { textContent: 'La contraseña no se guarda: sólo la sesión, que se renueva sola.' }, 'opacity:.7;font-size:10px;margin-top:4px');
    [titulo, estadoEl, email, pass, btnIn, btnOut, nota].forEach(function (x) { caja.appendChild(x); });
    contenedor.appendChild(caja);

    async function pintar() {
      var e = await estado();
      estadoEl.textContent = e.conectado
        ? '✅ ' + e.email + (e.aviso ? ' · ⚠️ ' + e.aviso : '')
        : (e.aviso ? '⚠️ ' + e.aviso : '⚠️ Inicia sesión: sin sesión la extensión no podrá leer ni guardar en la web.');
      email.hidden = pass.hidden = btnIn.hidden = e.conectado;
      btnOut.hidden = !e.conectado;
    }
    async function entrar() {
      btnIn.disabled = true;
      try { await iniciar(email.value, pass.value); }
      catch (err) { estadoEl.textContent = '❌ ' + err.message; pass.value = ''; btnIn.disabled = false; return; }
      pass.value = '';
      btnIn.disabled = false;
      pintar();
    }
    btnIn.addEventListener('click', entrar);
    pass.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') entrar(); });
    btnOut.addEventListener('click', function () { cerrar().then(pintar); });
    if (hayStorage()) chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'local' && (ch[CLAVE] || ch[CLAVE_AVISO])) pintar();
    });
    pintar();
  }

  if (hayStorage() && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'local' && ch[CLAVE]) cache = ch[CLAVE].newValue || null;
    });
  }

  global.ScSesion = {
    iniciar: iniciar, cerrar: cerrar, token: token, bearer: bearer, cabeceras: cabeceras,
    estado: estado, rechazoSinSesion: rechazoSinSesion, montarFormulario: montarFormulario,
    CLAVE: CLAVE, CLAVE_AVISO: CLAVE_AVISO,
  };
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
