// ============================================================
// SERVICE WORKER — Nueva Luz 3.0
// ============================================================
// Existe por una sola razón: desde Chrome 85 los content scripts están
// sujetos a CORS. `host_permissions` NO los exime — solo el contexto de fondo
// de la extensión puede hacer peticiones cross-origin sin preflight.
//
// Por eso las subidas del comprobante fallaban con
//   "blocked by CORS policy: No 'Access-Control-Allow-Origin' header"
// aunque el manifest ya declaraba *.workers.dev.
//
// El content script captura el PDF y le pide a este worker que lo suba.
// ============================================================

/**
 * Traduce un fallo de fetch a algo accionable.
 *
 * «TypeError: Failed to fetch» es el mensaje que Chrome da para tres cosas muy
 * distintas: no hay permiso para ese host, no hay red, o el TLS no cerró. Sin
 * distinguirlas no se arregla nada — y el caso del permiso es justo el que
 * tuvo rota la subida a R2 todo este tiempo.
 *
 * @param {Error} e El error del fetch.
 * @param {string} url A dónde se intentó ir.
 * @returns {string} Una frase que dice qué hacer.
 */
function porQueFalloElFetch(e, url) {
  const msg = e && e.message ? e.message : String(e);
  if (!/failed to fetch|load failed|networkerror/i.test(msg)) return msg;

  let host = '';
  try { host = new URL(url).host; } catch (err) { /* url rara */ }

  const permitidos = (chrome.runtime.getManifest().host_permissions || []);
  const cubierto = permitidos.some((p) => {
    const m = /^https?:\/\/([^/]+)/.exec(p);
    if (!m) return false;
    const patron = m[1];
    if (patron.startsWith('*.')) {
      const base = patron.slice(2);
      return host === base || host.endsWith('.' + base);
    }
    return host === patron;
  });

  if (!cubierto) {
    return `no llegué a ${host}: ese host NO está en host_permissions del manifest. ` +
           'No es la red ni las credenciales — Chrome bloqueó la petición.';
  }
  return `no llegué a ${host}: el permiso está, así que es la red, el servidor caído, ` +
         'o un proxy que rompe el TLS (Burp hace justo eso).';
}

/**
 * Las credenciales de R2, con `chrome.storage.local` por encima del código.
 *
 * `shared_config.js` viaja dentro de la extensión y está en el repositorio: una
 * clave ahí es una clave publicada. Lo correcto es guardarla en el almacén
 * local de la extensión, que no se versiona ni se distribuye.
 *
 * Se lee así para poder rotar la clave sin volver a commitearla: lo que esté
 * en `sc_r2_credenciales` gana sobre lo que venga en el código.
 */
async function credencialesR2(config) {
  let guardadas = {};
  try {
    guardadas = (await chrome.storage.local.get(['sc_r2_credenciales'])).sc_r2_credenciales || {};
  } catch (e) { /* sin almacén, queda lo del código */ }
  return { ...(config || {}), ...guardadas };
}

/** base64 → Uint8Array, sin pasar por Blob (no existe atob-a-blob en SW). */
function base64ABytes(base64) {
  const limpio = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
  const bin = atob(limpio);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Sube el comprobante. Devuelve { ok, url, via, error }.
 *
 * Orden deliberado: el Worker primero, porque no necesita credenciales en el
 * cliente. La subida S3 directa queda de respaldo.
 */
/**
 * Prueba la subida con un archivo mínimo y devuelve QUÉ pasó en cada intento.
 * El detalle vuelve al que preguntó: los console.log del service worker viven
 * en su propia consola y en la práctica nadie los mira.
 *
 * Nunca devuelve claves ni secretos, solo si están presentes.
 */
async function diagnosticarSubida(recibido) {
  const config = await credencialesR2(recibido);
  const informe = {
    ok: false,
    configurado: {
      worker: !!config.R2_UPLOAD_ENDPOINT,
      s3: !!(config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY && config.R2_BUCKET_NAME),
      bucket: config.R2_BUCKET_NAME || '(sin definir)',
      endpointWorker: config.R2_UPLOAD_ENDPOINT || '(sin definir)'
    },
    intentos: []
  };

  const key = `diagnostico/prueba-${Date.now()}.txt`;
  const cuerpo = new Blob(['prueba de subida de Nueva Luz'], { type: 'text/plain' });

  // ── Worker relay ──
  if (config.R2_UPLOAD_ENDPOINT) {
    const url = `${config.R2_UPLOAD_ENDPOINT}/upload/${key}`;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: cuerpo });
      const texto = await res.text().catch(() => '');
      informe.intentos.push({
        via: 'worker', url, estado: res.status, ok: res.ok,
        respuesta: texto.slice(0, 200)
      });
      if (res.ok) {
        informe.ok = true;
        informe.via = 'worker';
        try { informe.url = (JSON.parse(texto) || {}).url; } catch (e) {}
        informe.url = informe.url || `${config.R2_UPLOAD_ENDPOINT}/files/${key}`;
      }
    } catch (e) {
      informe.intentos.push({ via: 'worker', url, error: porQueFalloElFetch(e, url) });
    }
  } else {
    informe.intentos.push({ via: 'worker', omitido: 'no hay R2_UPLOAD_ENDPOINT configurado' });
  }

  // ── S3 directo, solo si el Worker no funcionó ──
  if (!informe.ok) {
    if (informe.configurado.s3) {
      try {
        const r = await subirComprobante({
          key, base64: 'data:text/plain;base64,' + btoa('prueba de subida de Nueva Luz'),
          contentType: 'text/plain', config: { ...config, R2_UPLOAD_ENDPOINT: '' }
        });
        informe.intentos.push({ via: 's3', ok: !!(r && r.ok), url: r && r.url });
        if (r && r.ok) { informe.ok = true; informe.via = 's3'; informe.url = r.url; }
      } catch (e) {
        informe.intentos.push({
          via: 's3',
          error: porQueFalloElFetch(e, `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/`)
        });
      }
    } else {
      informe.intentos.push({ via: 's3', omitido: 'faltan credenciales de R2' });
    }
  }

  return informe;
}

async function subirComprobante({ key, base64, contentType, config: recibido }) {
  const config = await credencialesR2(recibido);
  const bytes = base64ABytes(base64);
  const cuerpo = new Blob([bytes], { type: contentType || "application/pdf" });
  const motivos = [];

  // ── Tier 1: Worker relay ─────────────────────────────────────────────────
  if (config.R2_UPLOAD_ENDPOINT) {
    try {
      const url = `${config.R2_UPLOAD_ENDPOINT}/upload/${key}`;
      console.log("🚀 [SW] Subiendo vía Worker:", url);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": contentType || "application/pdf" },
        body: cuerpo,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const fileUrl = data.url || `${config.R2_UPLOAD_ENDPOINT}/files/${key}`;
        console.log("✅ [SW] Subido vía Worker:", fileUrl);
        return { ok: true, url: fileUrl, via: "worker" };
      }
      const respuestaWorker = await res.text().catch(() => "");
      motivos.push(`worker: HTTP ${res.status}${respuestaWorker ? ' · ' + respuestaWorker.slice(0, 120) : ''}`);
      console.warn(`⚠️ [SW] Worker respondió ${res.status}:`, respuestaWorker);
    } catch (e) {
      const porQue = porQueFalloElFetch(e, `${config.R2_UPLOAD_ENDPOINT}/upload/${key}`);
      motivos.push(`worker: ${porQue}`);
      console.warn("⚠️ [SW] Worker no disponible:", porQue);
    }
  } else {
    motivos.push('worker: sin R2_UPLOAD_ENDPOINT configurado');
  }

  // ── Tier 2: S3 SigV4 directo a R2 ────────────────────────────────────────
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL } = config;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME) {
    try {
      const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
      const endpoint = `https://${host}/${R2_BUCKET_NAME}/${key}`;
      const ahora = new Date();
      const amzDate = ahora.toISOString().replace(/[:-]|\.\d{3}/g, "");
      const dateStamp = amzDate.slice(0, 8);

      const sha256Hex = async (data) => {
        const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
        const h = await crypto.subtle.digest("SHA-256", buf);
        return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
      };
      const hmac = async (clave, msg) => {
        const k = await crypto.subtle.importKey(
          "raw", typeof clave === "string" ? new TextEncoder().encode(clave) : clave,
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
      };

      const payloadHash = await sha256Hex(bytes);
      const canonicalHeaders =
        `content-type:${contentType || "application/pdf"}\n` +
        `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
      const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
      const canonicalRequest =
        `PUT\n/${R2_BUCKET_NAME}/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
      const scope = `${dateStamp}/auto/s3/aws4_request`;
      const stringToSign =
        `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`;

      let k = await hmac("AWS4" + R2_SECRET_ACCESS_KEY, dateStamp);
      k = await hmac(k, "auto");
      k = await hmac(k, "s3");
      k = await hmac(k, "aws4_request");
      const firma = [...(await hmac(k, stringToSign))].map((b) => b.toString(16).padStart(2, "0")).join("");

      console.log("🚀 [SW] Subiendo directo a R2 (respaldo)...");
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: {
          Authorization: `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${firma}`,
          "x-amz-date": amzDate,
          "x-amz-content-sha256": payloadHash,
          "Content-Type": contentType || "application/pdf",
        },
        body: bytes,
      });
      if (res.ok) {
        const fileUrl = `${R2_PUBLIC_URL}/${key}`;
        console.log("✅ [SW] Subido directo a R2:", fileUrl);
        return { ok: true, url: fileUrl, via: "r2-directo" };
      }
      const cuerpoR2 = await res.text().catch(() => "");
      motivos.push(`r2-directo: HTTP ${res.status}${cuerpoR2 ? ' · ' + cuerpoR2.slice(0, 160) : ''}`);
      console.warn(`⚠️ [SW] R2 respondió ${res.status}:`, cuerpoR2);
    } catch (e) {
      motivos.push(`r2-directo: ${porQueFalloElFetch(e, `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/`)}`);
      console.warn("⚠️ [SW] Subida directa falló:", e.message);
    }
  } else {
    motivos.push('r2-directo: faltan credenciales de R2');
  }

  // El motivo viaja de vuelta: sin esto, quien pregunta se queda con un
  // "no funcionó" que no permite arreglar nada.
  return { ok: false, error: motivos.join(' | '), motivos };
}

/**
 * Le pregunta a la IA a qué categoría pertenece cada proveedor.
 *
 * QUÉ SALE DE ACÁ, y nada más: el **nombre** del proveedor y, si se conoce, su
 * actividad según el catastro público del SRI. No sale el RUC del proveedor, no
 * sale el RUC del cliente, no salen importes, no sale con quién opera nadie.
 * El que responde no puede armar el mapa comercial del estudio.
 *
 * Y lo que vuelve es una SUGERENCIA. Se guarda con `origen: 'ia'` y, por la
 * regla de la §7, no pisa nada que haya decidido el contador.
 *
 * @param {{nombres: string[], actividades: string[], modelo?: string}} msg
 * @returns {Promise<{ok, categorias?: string[], error?: string}>}
 */
async function clasificarConIA({ nombres, actividades, modelo }) {
  const g = await chrome.storage.local.get(['sc_ia_credenciales']);
  const clave = (g.sc_ia_credenciales || {}).apiKey;
  if (!clave) {
    return { ok: false, error: 'No hay clave de IA guardada. Cargala en Ajustes.' };
  }
  if (!Array.isArray(nombres) || !nombres.length) {
    return { ok: false, error: 'No se mandó ningún proveedor.' };
  }

  // Las seis del anexo de gastos personales del SRI, más «ninguna». Son las
  // mismas que ya usa la extensión del anexo: el dato sirve para los tres
  // proyectos, no sólo para el IVA.
  const CATEGORIAS = ['vivienda', 'salud', 'educacion', 'alimentacion',
                      'vestimenta', 'turismo', 'ninguna'];

  const lista = nombres.map((n, i) => {
    const act = (actividades && actividades[i]) || '';
    return `${i + 1}. ${n}${act ? ' — actividad registrada: ' + act : ''}`;
  }).join('\n');

  const instruccion =
    'Sos un asistente contable ecuatoriano. Para cada proveedor de la lista, decí a cuál de ' +
    'estas categorías del anexo de gastos personales del SRI corresponde lo que vende:\n' +
    CATEGORIAS.join(', ') + '.\n\n' +
    'Reglas:\n' +
    '- Usá "ninguna" si no encaja o si no estás seguro. Es preferible a adivinar.\n' +
    '- No expliques nada. No agregues texto fuera del JSON.\n' +
    '- Respondé SOLO un arreglo JSON de strings, uno por proveedor, en el mismo orden.\n\n' +
    'Proveedores:\n' + lista;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
              encodeURIComponent(modelo || 'gemini-2.5-flash') + ':generateContent';

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instruccion }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' }
      })
    });
  } catch (e) {
    return { ok: false, error: porQueFalloElFetch(e, url) };
  }

  const cuerpo = await res.text().catch(() => '');
  if (!res.ok) {
    // El error del proveedor se devuelve tal cual: si el modelo no existe para
    // esa clave, o la cuota se acabó, hay que poder leerlo y arreglarlo.
    let detalle = cuerpo.slice(0, 300);
    try { detalle = JSON.parse(cuerpo).error.message; } catch (e) { /* texto pelado */ }
    return { ok: false, error: `HTTP ${res.status} · ${detalle}` };
  }

  let texto = '';
  try {
    texto = JSON.parse(cuerpo).candidates[0].content.parts[0].text;
  } catch (e) {
    return { ok: false, error: 'La respuesta no tiene el formato esperado.' };
  }

  // Por las dudas viene envuelto en un bloque de código.
  const limpio = texto.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  let categorias;
  try {
    categorias = JSON.parse(limpio);
  } catch (e) {
    return { ok: false, error: 'La IA no devolvió JSON: ' + limpio.slice(0, 160) };
  }
  if (!Array.isArray(categorias)) {
    return { ok: false, error: 'La IA devolvió algo que no es una lista.' };
  }

  // Nunca se acepta una categoría inventada: lo que no está en la lista es
  // «ninguna», que es lo mismo que decir «no sé».
  const normal = categorias.map((c) => {
    const v = String(c || '').toLowerCase().trim();
    return CATEGORIAS.includes(v) ? v : 'ninguna';
  });

  return { ok: true, categorias: normal, pedidos: nombres.length, devueltos: categorias.length };
}

/** Petición genérica cross-origin por cuenta del content script. */
async function peticion({ url, opciones }) {
  try {
    const res = await fetch(url, opciones || {});
    const texto = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: texto };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Limpia todas las cookies de sesión del SRI (incluyendo HttpOnly en sub-apps como
 * /tuportal-internet, /comprobantes-electronicos-internet, /sri-declaraciones-web-internet).
 */
async function limpiarCookiesSri() {
  if (!chrome.cookies) {
    console.warn("⚠️ [SW] chrome.cookies no está disponible en este contexto.");
    return { ok: false, error: "API chrome.cookies no disponible" };
  }
  try {
    let eliminadas = 0;
    const dominios = ["sri.gob.ec", ".sri.gob.ec", "srienlinea.sri.gob.ec"];
    for (const domain of dominios) {
      const cookies = await chrome.cookies.getAll({ domain }).catch(() => []);
      for (const cookie of cookies) {
        const protocol = cookie.secure ? "https:" : "http:";
        const rawDomain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
        const cookieUrl = `${protocol}//${rawDomain}${cookie.path}`;
        await chrome.cookies.remove({
          url: cookieUrl,
          name: cookie.name,
          storeId: cookie.storeId,
        }).catch(() => {});
        eliminadas++;
      }
    }
    console.log(`🧹 [SW] Limpieza de sesión SRI: ${eliminadas} cookies eliminadas.`);
    return { ok: true, eliminadas };
  } catch (e) {
    console.warn("⚠️ [SW] Error eliminando cookies SRI:", e);
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (!msg || !msg.tipo) return;

  if (msg.tipo === "SC_LIMPIAR_SESION_SRI") {
    limpiarCookiesSri()
      .then(responder)
      .catch((e) => responder({ ok: false, error: e.message }));
    return true; // respuesta asíncrona
  }

  if (msg.tipo === "SC_SUBIR_COMPROBANTE") {
    subirComprobante(msg)
      .then(responder)
      .catch((e) => responder({ ok: false, error: e.message }));
    return true; // respuesta asíncrona
  }

  if (msg.tipo === "SC_DIAGNOSTICO_SUBIDA") {
    diagnosticarSubida(msg.config || {})
      .then(responder)
      .catch((e) => responder({ ok: false, error: e.message }));
    return true;
  }

  if (msg.tipo === "SC_CLASIFICAR_IA") {
    clasificarConIA(msg)
      .then(responder)
      .catch((e) => responder({ ok: false, error: e.message }));
    return true;
  }

  if (msg.tipo === "SC_FETCH") {
    peticion(msg)
      .then(responder)
      .catch((e) => responder({ ok: false, error: e.message }));
    return true;
  }
});

console.log("⚙️ [SW] Nueva Luz 3.0 — service worker listo (subidas sin CORS).");
