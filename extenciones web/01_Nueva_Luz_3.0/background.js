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
async function subirComprobante({ key, base64, contentType, config }) {
  const bytes = base64ABytes(base64);
  const cuerpo = new Blob([bytes], { type: contentType || "application/pdf" });

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
      console.warn(`⚠️ [SW] Worker respondió ${res.status}:`, await res.text().catch(() => ""));
    } catch (e) {
      console.warn("⚠️ [SW] Worker no disponible:", e.message);
    }
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
      console.warn(`⚠️ [SW] R2 respondió ${res.status}:`, await res.text().catch(() => ""));
    } catch (e) {
      console.warn("⚠️ [SW] Subida directa falló:", e.message);
    }
  }

  return { ok: false, error: "Ningún camino de subida funcionó" };
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

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (!msg || !msg.tipo) return;

  if (msg.tipo === "SC_SUBIR_COMPROBANTE") {
    subirComprobante(msg)
      .then(responder)
      .catch((e) => responder({ ok: false, error: e.message }));
    return true; // respuesta asíncrona
  }

  if (msg.tipo === "SC_FETCH") {
    peticion(msg)
      .then(responder)
      .catch((e) => responder({ ok: false, error: e.message }));
    return true;
  }
});

console.log("⚙️ [SW] Nueva Luz 3.0 — service worker listo (subidas sin CORS).");
