# Interfaz de la extensión · plan para verse “de clase mundial”

Objetivo: que el popup de **SC TaxPilot** se sienta como un producto comercial
(saas profesional), no como una herramienta interna. Lenguaje visual:
**Obsidian & Liquid Gold** (fondo #020617/#051424, esmeralda #00A896 para acción,
oro #C9A96E para autoridad/KPIs, Manrope para títulos, Inter para texto,
JetBrains Mono para cifras/RUC/fechas).

---

## 1 · Jerarquía (lo que ya se hizo)

| Idea | Por qué | Estado |
|---|---|---|
| **Un solo CTA primario**: “Ejecutar lote” con degradado esmeralda, glow y press | En un popup de 500 px todo lo que se ve “grande” compite; una sola acción clara vende | ✅ |
| **Números como protagonistas**: KPIs con Manrope 800 y etiquetas mono | Es lo primero que se mira: sin declarar / con comprobante / en lista | ✅ |
| **Marca PRO**: `SC TaxPilot` + chip dorado `PRO` + chip de versión (`v3.4.3`) | Comunica producto y actualización; el “v…” evita dudas de builds viejos | ✅ |
| **Hairline superior esmeralda→oro** | Detalle de lujo que ancla la marca sin ruido | ✅ |

## 2 · Confianza y contexto (implementado)

| Idea | Por qué | Estado |
|---|---|---|
| **Tira de sesión** `🪪 Sesión SRI: cliente · RUC` con botón Cerrar | Elimina la confusión de “¿de quién es esta sesión?” | ✅ |
| **ATS pendientes** con borde dorado y barra de estado | El pendiente se ve como una tarea de primera clase | ✅ |
| **Micro-interacciones**: lift 1 px, borde que ilumina, transición 160 ms `cubic-bezier(.16,1,.3,1)` | Sensación de calidad al pasar el mouse, sin “brincos” | ✅ |
| **Accesibilidad**: foco dorado, `prefers-reduced-motion`, targets ≥ 36 px, scrollbar fina | Contraste y confort; no rompe con zoom del sistema | ✅ |

## 3 · Lo que falta para el salto “mundial” (propuestas)

| # | Idea | Detalle | Impacto |
|---|---|---|---|
| 1 | **Vista “mes en una línea”** | Un renglón fijo arriba: `OCT · 12 sin declarar · 3 pendientes ATS · 0 errores` | El usuario entiende el estado sin abrir nada |
| 2 | **Estado vacío con acción** | Sin clientes: “Todavía no cargaste clientes → Sincronizar” en vez de una caja vacía | Primera impresión |
| 3 | **Aviso de build nuevo** | Si la tienda tiene una versión más nueva, chip `Actualizar` | Confianza de producto vivo |
| 4 | **Progreso del lote en vivo** | Barra fina con `cliente 3 de 12 · ETA 4 min` | Reduce ansiedad del proceso largo |
| 5 | **Historial mini** | Últimos 3 eventos: `10:42 · ATS 2026-08 subido` | Sensación de “sistema que registra” |
| 6 | **Modo COMPACTO** | Un toggle que achica tarjetas a una línea (nombre + estado + acción) | Para carteras de 100+ clientes |
| 7 | **Buscador en el popup** | Input que filtra tarjetas por nombre/RUC (teclado, sin mouse) | Es lo que hacés a diario |
| 8 | **Etiquetas de plan** | Chip `Plan mensual` / `VIP` según `fee_structure` | Refuerzo comercial |
| 9 | **Onboarding de 3 pasos** | Primera vez: `1) Sincronizar 2) Elegir mes 3) Ejecutar` con foco guiado | Conversión de nuevos usuarios |
| 10 | **Tipografía internacional** | Sentence case, sin gritar en mayúsculas; fechas `12 nov 2026` | Se lee como producto global |
| 11 | **Tema claro opcional** | Variante “glass light” para pantallas con sol | Uso en oficina/campo |
| 12 | **Firma de marca** | Footer mínimo `SantiagoCordova.com · soporte` con enlace | Cierre comercial/confianza |

## 4 · Reglas de diseño que no se negocian

1. **Nada de rojo decorativo**: el rojo sólo para error/bloqueo.
2. **Oro sólo en autoridad**: marca, KPIs económicos, estados “verificado”.
3. **Un emoji por zona**: el resto, iconos vectoriales.
4. **Cifras siempre mono** y con separador de miles `1.234,56`.
5. **Sin layout shift**: alturas reservadas para listas y toasts.
6. **Todo a 8 px de retícula**: márgenes 12/16/24, radios 10/14/18.

---

### Estado de implementación

- **Hecho**: hierarquía del CTA, KPIs, marca PRO + versión, hairline, sesión SRI,
  ATS pendientes, micro-interacciones, reduced-motion, scrollbar, foco dorado.
- **Siguiente sugerido**: 1 (mes en una línea), 7 (buscador en popup), 4 (progreso en vivo).
