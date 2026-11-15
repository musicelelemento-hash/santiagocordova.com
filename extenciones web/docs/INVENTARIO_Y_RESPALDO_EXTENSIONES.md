# 📁 Inventario de extensiones — SC PRO

Mapa oficial de las extensiones de Chrome del ecosistema **Santiago Córdova
PRO**: qué hay, qué se instala, dónde está cada cosa y cómo se recupera.
Actualizado tras la reorganización de **nov-2026**.

---

## 🧰 Lo que se instala

Hay **cinco** artefactos instalables: la suite (los cuatro módulos juntos) y
las cuatro extensiones individuales. Los dos caminos conviven en el disco,
pero **no se instalan a la vez para el mismo módulo**.

| Artefacto | Carpeta | Nombre en Chrome | Versión | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **Suite** | `suite/` | 🧰 [SC PRO SUITE] - IVA · Claves · Gastos · Anulador | 4.1.0 | 🟢 generada y probada en empaquetado |
| **01** IVA | `01_Nueva_Luz_3.0/` | ⚡ [SC PRO 01] - Declaración IVA & Robot SRI | 3.2.0 | 🟢 prod (909 comprobaciones en verde) |
| **02** Claves | `02_Cambio_Claves_SRI/` | 🔑 [SC PRO 02] - Asistente Claves SRI & Ecuafact | 1.1.0 | 🟢 prod |
| **03** Gastos | `03_Anexo_Gastos_Personales/` | 📑 [SC PRO 03] - Llenador Anexo Gastos Personales | 1.2.0 | 🟡 utilidad |
| **04** Anulador | `04_Anulador_Comprobantes_SRI/` | 💎 [SC PRO 04] - Anulador de Comprobantes SRI (motor v2.5) | 2.5.0 | 🟢 el motor que funciona (el rediseño v3.0 quedó archivado) |

### Qué hace cada módulo

| # | Dónde actúa | Qué automatiza |
| :-: | :--- | :--- |
| 01 | `srienlinea.sri.gob.ec` | Declaración de IVA 2011 completa: login, extracción, cálculo, llenado, cierre en $0, captura del PDF y sincronización con la web. Popup: lote de clientes por período, selección, herramientas. |
| 02 | `srienlinea`, `ecuafact.com` | Detecta la pantalla de cambio de clave, transforma `*` → `@` y completa los tres campos. Silencioso: si la clave ya termina en `@`, no hace nada. |
| 03 | `sriservicios.sri.gob.ec/…/anexo-gastos-personales/…` | Asistente de clasificación de gastos por rubro, topes por categoría y montos por carga familiar. |
| 04 | `srienlinea` → anulación | Lee los PDFs de comprobantes y llena la solicitud de anulación en bloque. |

---

## 🛠️ La suite: qué es y cómo se mantiene

`suite/` **no se edita a mano**: es un artefacto que se genera desde las cuatro
carpetas individuales.

```powershell
cd "C:\Programacion\Paginas Web\SantiagoCordova.com\extenciones web"
node tools/construir_suite.mjs           # regenera suite/
node tools/construir_suite.mjs --check   # avisa si quedó vieja
```

El constructor copia popup, ajustes, service worker e íconos de la 01, los
assets que los módulos piden por ruta fija (`vendor/`, `libs/`) y envuelve cada
content script en una IIFE para que los cuatro compartan mundo aislado sin
pisarse los nombres. Antes de dar la suite por buena valida el manifiesto
(archivos existentes) y compila cada módulo con `node --check`.

### Pruebas reales (Edge 157, que sí acepta `--load-extension`)

```powershell
# Todo junto: sintaxis, build, 909 bancos, suite y las tres pruebas de navegador
powershell -ExecutionPolicy Bypass -File tools\verificar.ps1 -ConNavegador -Python "C:\ruta\python.exe"
```

- `prueba_suite.ps1` abre el popup en una instancia aparte y verifica que **el
  manifiesto cargue, el service worker arranque y el riel pinte los 4 módulos**.
- `prueba_experiencia.ps1` monta el HUD con el host del SRI y verifica **modos,
  cronómetro y resumen**.
- `prueba_inyeccion.ps1` usa el módulo 02 como canario sobre una página local:
  comprueba que el módulo empaquetado **se inyecte y complete** `clave123*` →
  `clave123@`.

Por qué Edge: Chrome estable ya ignora `--load-extension`
(`--load-extension is not allowed in Google Chrome, ignoring.`). Es el mismo
Chromium; sirve como prueba de humo, no reemplaza probar en el portal real.

---

## 📥 Instalación en Google Chrome

1. Abrir `chrome://extensions/`.
2. Activar **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** y elegir la carpeta del artefacto.

| Quiero… | Elijo |
| :--- | :--- |
| Todo junto (recomendado) | `extenciones web\suite` |
| Sólo IVA | `extenciones web\01_Nueva_Luz_3.0` |
| Sólo claves | `extenciones web\02_Cambio_Claves_SRI` |
| Sólo gastos | `extenciones web\03_Anexo_Gastos_Personales` |
| Sólo anulador | `extenciones web\04_Anulador_Comprobantes_SRI` |

Después de cargar (o de regenerar la suite) hay que **recargar las pestañas del
SRI ya abiertas**: los content scripts sólo entran al cargar la página.

### Reglas de convivencia

- **Un módulo, una extensión.** Suite + standalone del mismo módulo duplican
  paneles y flujos. Elegí uno.
- **Las claves no se comparten.** `chrome.storage.local` es por extensión: la
  suite arranca sin las claves SRI, la clave de IA, los mapeos de la 03 ni las
  credenciales de R2 que tenga cargadas la individual. Se cargan de nuevo en
  **Ajustes** (riel 🧰 → “Ajustes y claves”).
- Los datos del SRI (clientes, declaraciones) no viven en la extensión: vienen
  de Supabase al abrir el popup.

---

## 🛡️ Respaldos y archivo

| Carpeta | Qué guarda | Tamaño aprox. |
| :--- | :--- | :--- |
| `_respaldos/extensiones_2026/` | Respaldo completo del ecosistema previo a la reorganización (incluye el anulador `v2.5` que hoy es el 04 oficial, la versión histórica `v1.0`, y el estado anterior de la 03) | ~40 MB |
| `_respaldos/04_anulador_previo/` | Anulador previo con sus facturas de prueba y scripts sueltos | ~0,5 MB |
| `_archivo/legacy/` | `Extractor V1`, `Automatizacion declaracion iva` y `01_Nueva_Luz_3.0_cruft` | ~4 MB |
| `_archivo/04_anulador_v3_experimental/` | El rediseño “SC SUITE COMERCIAL v3.0” del anulador: no completaba el llenado (se trababa). Archivado con sus tests y su listing | ~13 MB |
| `_archivo/cruft/` | Restos de Windows que viajaban dentro de la 03 (`desktop.ini`) | ~0,1 KB |

Ninguna de estas carpetas se instala en Chrome.

### ⚠️ Evidencia sensible

`_EVIDENCIA_SRI/` (≈113 MB) guarda capturas con RUC, nombres y correos de
contribuyentes reales, y exports de Burp con cookies de sesión vivas. **No sale
de este equipo.** Su protección está en las reglas de `.gitignore` de la raíz
del repo (`extenciones web/_EVIDENCIA_SRI/…`). Si se mueve o renombra la
carpeta, hay que mover también esas reglas **antes** de cualquier `git add`.

Cada extensión tiene una **copia de trabajo** en `<extensión>/recorridos/`
(01: 112 MB de trazas, biblias, capturas y diccionarios; 02: la traza del
cambio de clave; 03 y 04: vacías, falta capturarlas). Esas copias están
ignoradas por git; Chrome las carga con la extensión, así que hay que excluirlas de cualquier ZIP. Mapa y capturas pendientes:
[`RECORRIDOS.md`](RECORRIDOS.md).

---

## 🗂️ Estructura completa

```
extenciones web/
├── README.md                      Índice maestro
├── suite/                         🧰 Suite generada (5.º artefacto)
├── 01_Nueva_Luz_3.0/              ⚡ IVA (fuente: src/ → build/content.js)
├── 02_Cambio_Claves_SRI/          🔑 Claves
├── 03_Anexo_Gastos_Personales/    📑 Gastos
├── 04_Anulador_Comprobantes_SRI/  💎 Anulador
│   (cada extensión tiene además su recorridos/: evidencia real del portal,
│    fuera de git y fuera del paquete de Chrome)
├── tools/
│   ├── verificar.ps1              Puerta de calidad (sintaxis, build, bancos, suite)
│   ├── construir_suite.mjs        Generador + validador
│   ├── suite_rail.js              Riel 🧰 del popup
│   ├── prueba_suite.ps1           Prueba de empaquetado y popup
│   ├── prueba_experiencia.ps1     Prueba del HUD (modos, cronómetro, resumen)
│   └── prueba_inyeccion.ps1       Prueba de inyección (canario 02)
├── docs/                          Este inventario, informes, manuales, PDF
├── _archivo/                      Legacy y cruft
├── _respaldos/                    Copias intactas
└── _EVIDENCIA_SRI/                Evidencia de auditoría (sensible)
```

---

## 📚 Documentación relacionada

- `docs/RUNBOOK.md` — cómo operar y entregar: ciclo, rollback, incidentes, secretos.
- `docs/RECORRIDOS.md` — evidencia real del portal por extensión y qué falta capturar.
- `docs/ESTADO_ACTUAL_2026-11.md` — qué está abierto hoy y en qué orden.
- `docs/INFORME_COHERENCIA_EXTENSIONES.md` — diagnóstico de coherencia (sep-2026).
- `docs/MANUAL_MAPA_RUTAS_Y_SELECTORES_SRI.md` — rutas y selectores del portal.
- `01_Nueva_Luz_3.0/EXPERIENCIA_2026-11.md` — modos limpio/cockpit, cronómetro,
  resumen de corrida y lanzador de clientes.
- `01_Nueva_Luz_3.0/HANDOFF.md` — diseño y reglas del motor de IVA.
- `suite/README.md` — qué trae la suite, cómo se prueba y sus límites.
