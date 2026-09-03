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
    R2_UPLOAD_ENDPOINT: "https://santiagocordova-r2-vault.workers.dev",
    R2_PUBLIC_URL: "https://santiagocordova-r2-vault.workers.dev/files",
  };
  if (typeof window !== "undefined") window.SC_CONFIG = SC_CONFIG;
  if (typeof globalThis !== "undefined") globalThis.SC_CONFIG = SC_CONFIG;
})();
