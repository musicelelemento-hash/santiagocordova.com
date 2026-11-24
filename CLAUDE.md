# SantiagoCordova.com — Workspace

Workspace multi-proyecto para **Soluciones Contables Pro**, SaaS de gestión contable/tributaria para Ecuador (SRI: RIMPE, IVA, Renta, Anexos, Facturación Electrónica, Firmas .p12).

- `santiagocordova-main/` — la app web (React + Vite + TS + Supabase). Repo git propio. Ver su [CLAUDE.md](santiagocordova-main/CLAUDE.md).
- `extenciones web/` — extensiones de Chrome que automatizan el portal del SRI (incl. "Nueva Luz 3.0"). No es un repo git independiente; el código fuente vive dentro de cada subcarpeta.
- `modelo para comprobante/`, `template_Productos.xls` — plantillas, no código.

@.agents/AGENTS.md

## Trabajando en la nube (claude.ai/code)
En la nube solo se clona el repo elegido, así que falta lo que en local viene aparte:
- **La web** (`santiagocordova-main/`) es otro repo: `musicelelemento-hash/santiagocordova`. El hook `SessionStart` (`.claude/hooks/nube.cjs`) corre solo, y solo en la nube, `bash tools/preparar_nube.sh`; si hiciera falta a mano, es ese comando (la trae, instala dependencias y avisa de lo que falte). Lo ideal es abrir la sesión con los dos repos.
- **`.env.local` nunca está** (no va a git). Los nombres están en `santiagocordova-main/docs/VARIABLES_ENTORNO.md`; los valores se cargan como variables del entorno en la nube. No crear un `.env` con valores inventados.
- **No hay portal SRI ni Chrome con la extensión**: en la nube solo se puede `node --check`, `npm run build` y los bancos de `tests/`. Lo que necesite el portal real queda como «sin probar contra el portal».
- Datos de clientes, `_EVIDENCIA_SRI`, recorridos y respaldos no se versionan a propósito: no buscarlos ni pedir que se suban.

## Seguridad — leer antes de tocar archivos en esta carpeta raíz
- `Contraseñas de Chrome.csv` (export de contraseñas de Chrome en texto plano) vive suelto en esta carpeta. **Nunca leerlo, commitearlo, subirlo a ningún sitio ni citar su contenido** salvo pedido explícito del usuario. Ideal: el usuario debería moverlo a un gestor de contraseñas y borrarlo del disco.
- `import_passwords.js` está relacionado con ese CSV — tratarlo con la misma cautela.
- Nunca imprimir valores de `.env.local` ni de ningún archivo `*.env*`.
