# Plan maestro: ejecutar todo con resultado excelente

08-nov-2026. El orden importa: cada fase deja algo **visible y verificable**, y
ninguna se cierra con una puerta en rojo.

---

## Regla de oro (aplica a todas las fases)

1. `powershell -ExecutionPolicy Bypass -File "extenciones web\tools\verificar_todo.ps1"`
   en verde.
2. **Una prueba real** del cambio (captura, log o caso de uso).
3. Doc de una línea actualizada.
4. Commit chico, un tema.

Si algo no se puede terminar, queda anotado con su criterio. Nunca “a medias y
escondido”.

---

## Fase 0 · Base (hecha)

- Puertas unificadas, CI de la web y del bot, contrato de IDs del popup y del HUD.

---

## Fase 1 · Flotante final de la 01

**Objetivo:** que el HUD deje de parecer experimental y sea la herramienta diaria.

| # | Tarea | Criterio de terminado |
| :--- | :--- | :--- |
| 1.1 | ~~Iconos SVG~~ **HECHO** (24 íconos) | `hud_01_svg.png` |
| 1.2 | ~~Cola visual por D9~~ **HECHO** | `cola_01_visual.png` |
| 1.3 | ~~Cajón legible~~ **HECHO** (10px, dos líneas) | — |
| 1.4 | ~~Modo limpio real~~ **HECHO**: a los 10 s se achica a estado + ⏸ + 🧰 + detener | `hud_01_minimo.png` |

**Verificación:** captura del HUD en corrida + la cola abierta con 3 clientes.

---

## Fase 2 · Escala a 2000

**Objetivo:** volumen sin volverse loco.

| # | Tarea | Criterio de terminado |
| :--- | :--- | :--- |
| 2.1 | ~~Bucle por lotes de 50~~ **HECHO**: corta en 50, guarda `sc_lote_resto` y el botón “Siguiente tanda” continúa | `TANDA_LOTE` en popup.js |
| 2.2 | ~~Auto-refresco~~ **HECHO**: caché de 30 min; `updated_at` ya viene en el SELECT (delta listo para activar) | popup.js |
| 2.3 | ~~Medición~~ **HECHO**: 2000 clientes → DOM listo en **306 ms**, 60 tarjetas | `tools/bench/correr.ps1` |

**Verificación:** script que genera 2000 clientes falsos + medición.

---

## Fase 3 · Bóveda que entiende un humano

| # | Tarea | Criterio de terminado |
| :--- | :--- | :--- |
| 3.1 | **Compras por proveedor** + chip de crédito: **web hecho** (panel + servicio puro, ver `CONTRATO_PURCHASE_SUMMARY.md`); **extensión publica** `tax_profile.purchase_summary` (con `sinCredito` desde `Proveedores.mapaCredito`) | `compras_boveda.png` |
| 3.2 | ~~Modo cliente~~ **HECHO**: modal “Ver como cliente” con estado, vendiste/compraste/te toca pagar y comprobante | `vista_cliente.png` |

**Verificación:** captura de las dos vistas.

---

## Fase 4 · Bucle confiable

| # | Tarea | Criterio de terminado |
| :--- | :--- | :--- |
| 4.1 | ~~Revisión manual~~ **HECHO**: la extensión no envía con saldo > 0 (borrador + `por_pagar`); la Bóveda muestra el aviso con los períodos y montos | VaultTab |
| 4.2 | **HUD que se calla** si ya hay un bucle · *pausado*: el semáforo es compartido y no dice en qué pestaña corre; hace falta dueño de pestaña | — |

---

## Fase 5 · Seguridad (tuya, no la puedo hacer yo)

| # | Tarea | Criterio |
| :--- | :--- | :--- |
| 5.1 | Rotar clave de Anthropic | la vieja da 401 |
| 5.2 | Rotar token de GitHub | `git remote -v` sin `ghp_` |
| 5.3 | Sacar el CSV de contraseñas del disco | el archivo no existe |
| 5.4 | Cifrar `sri_password` en reposo | no se lee en claro desde la API |

---

## Fase 6 · Cierre

| # | Tarea | Criterio |
| :--- | :--- | :--- |
| 6.1 | CI corriendo en cada push (web + bot + extensiones) | el check aparece en GitHub |
| 6.2 | README + docs al día | una persona nueva puede operar |
| 6.3 | Versiones y notas de release | `v4.2.0` de la suite documentada |

---

## Dependencias y riesgos

- **1.1 → 1.2 → 1.4**: sin iconos, la isla no se ve limpia.
- **2.1 → 2.3**: no medir antes de lotes no sirve.
- **5.x**: bloquea el resto de seguridad, no el producto.
- **Riesgo alto:** cambios del portal SRI (selectores). Mitigación: los bancos de
  prueba y el auditor ya detectan desvíos.
- **Riesgo medio:** 2000 clientes en `chrome.storage` (5 MB). Mitigación: cache
  por RUC + sync incremental.

---

## Qué haría yo primero

**1.1 + 1.2** (dos días de trabajo reales): es lo que más cambia la sensación y lo
que usás todos los días. Después **2.1** (el bucle por lotes), que es lo que te
permite crecer.
