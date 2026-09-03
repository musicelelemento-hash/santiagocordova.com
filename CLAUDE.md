# SantiagoCordova.com — Workspace

Workspace multi-proyecto para **Soluciones Contables Pro**, SaaS de gestión contable/tributaria para Ecuador (SRI: RIMPE, IVA, Renta, Anexos, Facturación Electrónica, Firmas .p12).

- `santiagocordova-main/` — la app web (React + Vite + TS + Supabase). Repo git propio. Ver su [CLAUDE.md](santiagocordova-main/CLAUDE.md).
- `extenciones web/` — extensiones de Chrome que automatizan el portal del SRI (incl. "Nueva Luz 3.0"). No es un repo git independiente; el código fuente vive dentro de cada subcarpeta.
- `modelo para comprobante/`, `template_Productos.xls` — plantillas, no código.

@.agents/AGENTS.md

## Seguridad — leer antes de tocar archivos en esta carpeta raíz
- `Contraseñas de Chrome.csv` (export de contraseñas de Chrome en texto plano) vive suelto en esta carpeta. **Nunca leerlo, commitearlo, subirlo a ningún sitio ni citar su contenido** salvo pedido explícito del usuario. Ideal: el usuario debería moverlo a un gestor de contraseñas y borrarlo del disco.
- `import_passwords.js` está relacionado con ese CSV — tratarlo con la misma cautela.
- Nunca imprimir valores de `.env.local` ni de ningún archivo `*.env*`.
