export interface Env {
  R2_VAULT: R2Bucket;
  AUTH_KEY?: string;
  SIGNING_SECRET?: string;
}

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowed = [
    "https://santiagocordova.com",
    "https://www.santiagocordova.com",
    "https://santiago-cordova.com",
    "https://www.santiago-cordova.com",
  ];

  const isAllowed =
    !origin ||
    allowed.includes(origin) ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin.startsWith("chrome-extension://") ||
    origin.endsWith(".santiagocordova.com") ||
    origin.endsWith(".santiago-cordova.com");

  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Custom-Auth, apikey",
    "Access-Control-Max-Age": "86400",
  };
}

async function signMessage(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyHmacSignature(secret: string, message: string, signatureHex: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = new Uint8Array(
    signatureHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
  return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(message));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);

    // 1. Manejo de Preflight CORS (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // 2. Health check y estado
      if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "online",
            service: "santiagocordova-r2-vault",
            tier: "Cloudflare R2 ($0 Egress)",
            authEnabled: !!env.AUTH_KEY,
            signingEnabled: !!(env.SIGNING_SECRET || env.AUTH_KEY),
            timestamp: new Date().toISOString(),
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // 3. Endpoint para generar URLs Firmadas (GET /sign?path=...&expires=...)
      if (request.method === "GET" && url.pathname === "/sign") {
        const filePath = url.searchParams.get("path");
        const expiresInSec = parseInt(url.searchParams.get("expires") || "3600", 10);
        const secret = env.SIGNING_SECRET || env.AUTH_KEY;

        if (!secret) {
          return new Response(
            JSON.stringify({ error: "Signing not configured on worker (SIGNING_SECRET missing)" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (env.AUTH_KEY) {
          const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "") || request.headers.get("X-Custom-Auth");
          if (authHeader !== env.AUTH_KEY) {
            return new Response(
              JSON.stringify({ error: "Unauthorized to generate signed URLs" }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        if (!filePath) {
          return new Response(
            JSON.stringify({ error: "Missing path parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const exp = Math.floor(Date.now() / 1000) + (isNaN(expiresInSec) ? 3600 : expiresInSec);
        const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
        const message = `${cleanPath}:${exp}`;
        const sig = await signMessage(secret, message);
        const signedUrl = `${url.origin}/files/${cleanPath}?exp=${exp}&sig=${sig}`;

        return new Response(
          JSON.stringify({
            success: true,
            path: cleanPath,
            expiresAt: new Date(exp * 1000).toISOString(),
            signedUrl,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 4. Subida de archivos (POST /upload/* o PUT /upload/*)
      if ((request.method === "POST" || request.method === "PUT") && url.pathname.startsWith("/upload/")) {
        const filePath = url.pathname.replace(/^\/upload\//, "");
        if (!filePath) {
          return new Response(
            JSON.stringify({ error: "Missing file path in upload URL" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 🛡️ SEGURIDAD DE COSTOS: Prevenir path traversal
        if (filePath.includes("..") || filePath.startsWith("/")) {
          return new Response(
            JSON.stringify({ error: "Invalid file path" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 🛡️ LÍMITE ESTRICTO DE TAMAÑO (Max 15 MB)
        const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 Megabytes
        const contentType = request.headers.get("Content-Type") || "application/pdf";
        const body = await request.arrayBuffer();

        if (!body || body.byteLength === 0) {
          return new Response(
            JSON.stringify({ error: "Empty request body" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (body.byteLength > MAX_FILE_SIZE) {
          return new Response(
            JSON.stringify({ error: `File too large (${(body.byteLength / 1024 / 1024).toFixed(1)}MB). Max allowed is 15MB to protect Free Tier.` }),
            { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 🛡️ CONTROL DE ACCESO: Si AUTH_KEY está configurada, exigir autorización
        if (env.AUTH_KEY) {
          const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "") || request.headers.get("X-Custom-Auth");
          if (authHeader !== env.AUTH_KEY) {
            return new Response(
              JSON.stringify({ error: "Unauthorized: Invalid AUTH_KEY" }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Almacenar en Cloudflare R2 con metadatos y caché inmutable
        const r2Object = await env.R2_VAULT.put(filePath, body, {
          httpMetadata: {
            contentType: contentType,
            cacheControl: "public, max-age=31536000, immutable",
          },
          customMetadata: {
            uploadedAt: new Date().toISOString(),
            source: request.headers.get("User-Agent") || "santiagocordova-client",
          },
        });

        const filePublicUrl = `${url.origin}/files/${filePath}`;

        return new Response(
          JSON.stringify({
            success: true,
            provider: "cloudflare_r2",
            key: filePath,
            url: filePublicUrl,
            size: body.byteLength,
            etag: r2Object.httpEtag,
            uploadedAt: new Date().toISOString(),
          }),
          {
            status: 201,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // 5. Consulta de existencia (HEAD /files/*)
      if (request.method === "HEAD" && url.pathname.startsWith("/files/")) {
        const filePath = url.pathname.replace(/^\/files\//, "");
        const object = await env.R2_VAULT.head(filePath);

        if (!object) {
          return new Response(null, { status: 404, headers: corsHeaders });
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set("ETag", object.httpEtag);
        return new Response(null, { headers });
      }

      // 6. Descarga / Visualización de archivos (GET /files/*)
      if (request.method === "GET" && url.pathname.startsWith("/files/")) {
        const filePath = url.pathname.replace(/^\/files\//, "");
        const secret = env.SIGNING_SECRET || env.AUTH_KEY;
        const isProtected = filePath.startsWith("declaraciones/");

        // Si es documento fiscal protegido y hay clave configurada, exigir firma o token
        if (isProtected && secret) {
          const exp = url.searchParams.get("exp");
          const sig = url.searchParams.get("sig");
          const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "") || request.headers.get("X-Custom-Auth");

          let isAuthorized = false;
          if (authHeader && authHeader === env.AUTH_KEY) {
            isAuthorized = true;
          } else if (exp && sig) {
            const expNum = parseInt(exp, 10);
            if (!isNaN(expNum) && Math.floor(Date.now() / 1000) <= expNum) {
              const message = `${filePath}:${exp}`;
              isAuthorized = await verifyHmacSignature(secret, message, sig);
            }
          }

          if (!isAuthorized) {
            return new Response(
              JSON.stringify({ error: "Acceso denegado: Se requiere URL firmada o token de autorización para consultar declaraciones fiscales." }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const object = await env.R2_VAULT.get(filePath);

        if (!object) {
          return new Response(
            JSON.stringify({ error: "File not found in R2 Vault" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set("ETag", object.httpEtag);
        headers.set("Cache-Control", "private, max-age=3600");

        return new Response(object.body, { headers });
      }

      // 7. Eliminación de archivos (DELETE /files/*)
      if (request.method === "DELETE" && url.pathname.startsWith("/files/")) {
        if (env.AUTH_KEY) {
          const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "") || request.headers.get("X-Custom-Auth");
          if (authHeader !== env.AUTH_KEY) {
            return new Response(
              JSON.stringify({ error: "Unauthorized: Invalid AUTH_KEY for deletion" }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const filePath = url.pathname.replace(/^\/files\//, "");
        await env.R2_VAULT.delete(filePath);

        return new Response(
          JSON.stringify({ success: true, message: `Deleted ${filePath}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Endpoint not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message || "Internal R2 Worker Error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
