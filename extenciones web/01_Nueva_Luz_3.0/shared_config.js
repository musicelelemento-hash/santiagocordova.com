// shared_config.js — Configuración central de la extensión Nueva Luz 3.0
// ---------------------------------------------------------------------
// Única fuente de verdad para URL y llave de Supabase (evita duplicarla
// en 6 archivos). La llave `anon` es PÚBLICA por diseño (viaja en el
// bundle); tras el endurecimiento RLS de 2026 ya NO puede leer contraseñas
// ni datos sensibles de la BD.
//
// Se carga ANTES que los content scripts y popup:
//  - manifest.json content_scripts: ["shared_config.js", "build/content.js"]
//  - popup.html: <script src="shared_config.js"></script>
// ---------------------------------------------------------------------
(function () {
  var SC_CONFIG = {
    SUPABASE_URL: "https://afssvsxlxiwqgtcgvqxp.supabase.co",
    SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmc3N2c3hseGl3cWd0Y2d2cXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzY1ODgsImV4cCI6MjA4OTIxMjU4OH0.pLqgC4_5dVEOV2Bgfwa14Ib2PbVfz6QmSnSIEKfRZ9I",
    R2_ACCOUNT_ID: "5daf9742bb674b34c0a69fb60557c90b",
    R2_ACCESS_KEY_ID: "add05f5db1cf3dcb52c98d7fb61645d4",
    R2_SECRET_ACCESS_KEY: "bac5532e941cd72dcf8c219ab48053862abd00db2a8b3c16a6e2e41f6edcac1c",
    R2_BUCKET_NAME: "santiagocordova-files",
    R2_PUBLIC_URL: "https://pub-0f0bf9175c8a41f1bb854a22ca33390d.r2.dev",
    R2_UPLOAD_ENDPOINT: "https://santiagocordova-r2-vault.workers.dev",
  };
  if (typeof window !== "undefined") window.SC_CONFIG = SC_CONFIG;
  if (typeof globalThis !== "undefined") globalThis.SC_CONFIG = SC_CONFIG;
})();
