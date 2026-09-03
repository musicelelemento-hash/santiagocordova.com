repo: musicelelemento-hash/ImprentaCordova
branch: main
path: ImprentaCordova

## Last sync
date: 2026-09-01
source: carpeta local montada `ImprentaCordova.Net` (no se leyó la API de GitHub en este turno; el commit exacto no se conoce)

### Updated in this project
- Informe de auditoría de diseño: pantallas sin diseño hi-fi y hallazgos con archivo citado.
- Ingreso al panel rediseñado en tema claro (escritorio + celular), con marca vectorial.
- Nueva Orden unificada: un solo flujo de 4 pasos; el SRI pasa a ser un formulario dentro del paso 2.
- Nueva Orden en celular: asistente de 3 pasos, controles de 52–56 px y pie fijo con el total vivo.

## Screen map
| Pantalla del proyecto | Archivos del repo leídos |
|---|---|
| `Informe-Faltantes.dc.html` | `design_manifest.md`, `components/panelTheme.ts`, `pages/NuevoPedido.tsx`, `pages/Login.tsx`, `components/ui/*`, `components/orders/SriIdentityFlow.tsx`, `pages/NotaDeVenta.tsx`, `pages/OrdenProduccion.tsx`, `tailwind.config.js` |
| `Ingreso.dc.html` | `pages/Login.tsx`, `components/panelTheme.ts` |
| `Nueva-Orden-Unificada.dc.html` | `pages/NuevoPedido.tsx`, `components/orders/OrderDetails.tsx`, `components/orders/SriSolicitudStep.tsx`, `components/panelTheme.ts`, handoff `Panel-Interno.dc.html` |
| `Nueva-Orden-Movil.dc.html` | `pages/NuevoPedido.tsx`, handoff `Panel-Movil-Tablet.dc.html`, `services/orderPricing.ts` (reglas descritas en `design_manifest.md` §6.1) |
