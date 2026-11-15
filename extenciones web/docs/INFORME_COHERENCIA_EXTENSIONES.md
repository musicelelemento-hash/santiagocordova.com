# 🔬 Informe de coherencia — Ecosistema de Extensiones SRI

Diagnóstico de sentido: qué hace cada pieza, por qué existe, dónde el sistema se
contradice consigo mismo y qué conviene hacer. 22-sep-2026.

Fuentes: `INVENTARIO_Y_RESPALDO_EXTENSIONES.md`, `01_Nueva_Luz_3.0/HANDOFF.md`,
`01_Nueva_Luz_3.0/INFORME_UI.md`, lectura de código.

---

## Resumen ejecutivo

El ecosistema **tiene un propósito claro y bien ejecutado en lo funcional**: cuatro
extensiones que automatizan el ciclo tributario del estudio contable (declarar IVA,
gestionar claves, llenar anexo de gastos, anular comprobantes). La extensión
principal (Nueva Luz 3.0) está **madura**: 561 comprobaciones de prueba en verde
sobre el bundle real, cortacircuitos anti-bucle y frenos de seguridad explícitos.

Las incoherencias que sí existen son de **tres tipos** y están localizadas:

1. **Seguridad** (crítica): dos credenciales viven en código fuente y una pasó por git.
2. **UI / control** (deuda): seis superficies flotantes sin lenguaje común y
   controles duplicados que se pisan (dos pausas, dos stops, tres sync).
3. **Continuidad** (funcional): piezas construidas pero no conectadas al flujo y
   un par de endpoints muertos que arrastran caminos alternativos.

Nada de esto invalida el proyecto: son puntos de tensión conocidos y mapeados,
no diseño roto.

---

## 1. El ecosistema y su sentido

| Ext | Nombre | Qué automatiza | Sentido dentro del flujo | Estado real |
| :-: | :--- | :--- | :--- | :---: |
| 01 | Nueva Luz 3.0 | Declaración IVA 2011 completa: login, extracción, llenado, cierre $0 | **El corazón.** Donde se gana el tiempo | 🟢 Prod. Madura (561 tests) |
| 02 | Cambio Claves SRI | Transforma `*`→`@` y autocompleta cambio de contraseña | Cierra el ciclo de "clave vencida" que la 01 detecta | 🟢 Prod |
| 03 | Anexo Gastos Personales | Clasifica gastos por rubro (IA) con topes por categoría | Reutiliza la base de proveedores de la 01 | 🟡 Utilidad |
| 04 | Anulador Masivo | Lee PDF de factura y llena la anulación en bloque | Complementa al revés: rectificaciones sobre lo emitido | 🟠 Selectores SRI vencidos |

Cuatro piezas, tres fases del mismo flujo contable: **declarar** (01), **mantener
credenciales** (02), **complementar anexos** (03), **rectificar** (04). La lógica
de negocio es coherente y no hay solapamiento de *función* entre ellas.

---

## 2. Lo que sí tiene sentido (y por qué no tocarlo)

- **La cascada proveedores → catastro → IA** (`HANDOFF §3`): el orden es correcto —
  decide el contador, sugiere el catastro (gratis, en disco), y la IA solo entra al
  final. Esto es coherencia real: se gasta dinero en IA solo cuando las fuentes
  baratas no alcanzan.
- **Los frenos de seguridad** (`HANDOFF §2`): nunca paga, nunca presenta sustitutiva,
  nunca cambia claves, `null` ≠ 0, una sugerencia no pisa una decisión. Cualquiera de
  ellos es un plato de un día en multas; que estén como reglas no negociables es el
  mejor diseño del sistema.
- **La suite de 16 bancos sobre el bundle compilado**: los tests cargan el
  `build/content.js` real, no una copia. Esto es coherencia metodológica difícil de
  encontrar: lo que se prueba es lo que corre.
- **Piezas pequeñas de una sola responsabilidad** (02 con 80 líneas de content.js):
  el tamaño es proporcional a la tarea.
- **Lo que no tocar**: paleta azul oscuro, emojis como íconos, y los cuatro `sleep()`
  del cierre mágico (`06_panel_interfaz.js:1398, 1421, 1433, 1502`) — son una
  secuencia de envío probada que no se optimiza sin el portal delante.

---

## 3. Incoherencias por corregir, priorizadas

### 🔴 P0 · Seguridad — 2 hallazgos, ambos reales

1. **Secreto de R2 en `01_Nueva_Luz_3.0/shared_config.js`** (`HANDOFF §4.1`).
   La subida ya funciona por camino `s3`, pero el secreto sigue en el archivo
   **y en el historial de git** — borrarlo del archivo no lo des-compromete.
   Hay que **rotarlo en Cloudflare R2** (Manage R2 API Tokens) y luego vaciar
   `shared_config.js` dejando la credencial solo en Ajustes.
2. **API key de Gemini hardcodeada en `03_Anexo_Gastos_Personales/content.js:22`**
   (hallazgo nuevo de esta revisión, presente también en los respaldos).
   La extensión 01 ya resuelve esto con claves en Ajustes; la 03 debe hacer lo mismo.
   ➜ Mover a options/Ajustes y rotar la llave.

### 🔴 P0 · Control — la UI se contradice consigo misma

`INFORME_UI` medido en el DOM real, pantalla de resumen: **ocho controles a la vez,
dos pausas y dos stops distintos**, y en código tres versiones de cada acción:

```
detener   → btn-panel-detener · btn-pill-stop · slh-stop
sync      → btn-force-sync · btn-force-sync-panel · btn-sync-supabase
siguiente → btn-panel-force-next · btn-success-next
```

Una pausa duplicada no es estética: es la clase de ambigüedad que produjo los bugs
de control. Principio recomendado y ya propuesto en `INFORME_UI` paso 2: **una sola
acción por control, en un solo lugar** (pausa/stop solo en el HUD; el panel no toca
eso). Sumado a las **396 etiquetas `style` inline**, la deuda de UI es deuda de
mantenimiento, no cosmética.

El tercer punto del mismo grupo: **barra de clientes y cockpit de login se pisan
en la misma pantalla**, dibujados por módulos distintos (`01` y `03`) con dos listas
de clientes que hay que mantener sincronizadas a mano. Es la duplicación más cara.

### 🟠 P1 · Funcional a medias (construido pero desconectado)

- **XML descargable pero no conectado** (`HANDOFF §4.4`): el parser existe y el 5% es
  el límite del cociente; hay que llamar `sriBajarXml(n)` a mano. Conectarlo
  automáticamente cerraría el falso-5% que el cociente no distingue.
- **Nota de débito y liquidación de compra no se barren** (`§4.5`): hueco de cobertura.
- **Worker R2 caído** (`§4.8`): `santiagocordova-r2-vault.workers.dev` no responde;
  lo cubre S3 directo con cortacircuitos, pero el camino muerto sigue registrado
  como canal.
- **`fetchSRIPublicData` rota** en la web (`§4.9`, `santiagocordova-main/services/sri.ts`):
  `corsproxy.io` da 403. Ya existe alternativa mejor — el catastro local de la extensión.

### 🟡 P2 · Arquitectura y mantenimiento

- **04 Anulador "EN AJUSTE"** (`INVENTARIO`): selectores de `menuAnulacion.jsf`
  desactualizados; y el manifest declara `libs/pdf.worker.js` cuando en disco solo
  está `pdf.worker.mjs` — incoherencia de empaquetado.
- **Unificación evaluada, no iniciada** (`§4.10`): conviene solo extrayendo un
  `core/` de Nueva Luz, con `02` (cambio de claves) quedando aparte por su
  naturaleza sensible. Dejarla separada es la decisión coherente.
- **Secretos en la 03 fuera de Ajustes** (ver P0): mismo caso que R2, en otra pieza.

---

## 4. Recomendaciones en orden

| # | Acción | Impacto | Riesgo |
| :-: | :--- | :--- | :---: |
| 1 | Rotar R2 + vaciar `shared_config.js`; mover Gemini de la 03 a Ajustes y rotarla | Elimina las 2 filtraciones activas | Bajo |
| 2 | Un control por acción: pausa/stop solo en HUD, quitar sync/next duplicados | Quita la ambigüedad que genera bugs | Medio |
| 3 | Tokens de diseño + migrar superficies por partes (paso 1 de INFORME_UI) | Hace la UI mantenible sin tocar lo visual | Bajo |
| 4 | Fusionar barra de clientes + cockpit del login en una sola lista | Elimina la sincronización manual | Medio |
| 5 | Conectar XML al flujo para las facturas ambiguas/5% | Cierra el último hueco de tarifas | Alto (pruebas) |
| 6 | Buscar/arreglar selectores de la 04 y corregir el manifest de pdf.worker | Vuelve a prod una herramienta parada | Bajo |

Los pasos 1 y 5 son los que cuestan plata si no se hacen; los 2 y 4 son los que se
notan al usarla.

---

## 5. Lo que mueve la aguja

- Los **dos hallazgos de seguridad nuevos** (Gemini en la 03) y el secreto R2 ya
  documentado están abiertos hoy: son el único bloqueo, no es deuda incremental.
- La madurez de la 01 (tests, frenos, HANDOFF honesto sobre lo que falta) indica
  que el problema del sistema **no es el qué hace**, sino **la cantidad de caminos
  paralelos**: controles duplicados, listas duplicadas, canal R2 muerto con canal S3
  vivo, XML construido sin conectar. Cada uno es un ejemplo de lo mismo:
  **la funcionalidad avanza más rápido que la consolidación**.
- El orden correcto es consolidar (2, 3, 4) antes de expandir (5, 6): dos pausas
  cuestan debugging; una tarifa mal puesta cuesta plata, y ahí el XML ya está armado
  solo para ser conectado.