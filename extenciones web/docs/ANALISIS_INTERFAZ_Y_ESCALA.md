# Análisis de la visión: interfaz, bucle y escala

Revisión del 08-nov-2026. Cada idea de tu mensaje, contrastada con el código que ya
existe. Sin promesas: lo que está, está; lo que falta, tiene plan.

---

## 1 · Lo que ya existe (y quizá no estás viendo)

| Tu idea | Estado | Dónde |
| :--- | :--- | :--- |
| **Bucle desde la web** | **Existe**: pantalla completa con período sugerido, modos y envío a la extensión | `screens/LoopDeclaracionesScreen.tsx` (948 líneas), `sendBatchDeclarationToExtension` |
| **Duración del bucle y telemetría** | **Existe**: cronómetro, tiempo por cliente, estimación restante, pulsos `SRI_TELEMETRY_PULSE` | mismo archivo (L246-300) |
| **Dos modos (limpio / cockpit)** | **Existe en la web y en la extensión** | `sc_loop_modo` (web) y `sc_modo_vista` + `Alt+Shift+M` (01, `src/08_experiencia.js`) |
| **Sugerir la declaración mensual** | **Parcial**: el período se autoselecciona con `periodoIvaMensual()` | L229 |
| **Clasificar cartera** (listos / declarados / por pagar) | **Existe** | `clasificarCartera` (L259) |
| **Flotante con salto por cliente** | **Existe** en la 01 (HUD con lanzador 🧑) y en la web (`Ctrl+K` → Entrar al SRI) | `08_experiencia.js` |
| **No saturar si ya corre** | **Parcial**: el HUD se colapsa, pero no detecta “ya hay un bucle” para callarse | `08_experiencia.js` |
| **Login coherente** (isla en Inicio) | **Existe** | `03_ingreso_y_sesion.js` |

**Conclusión honesta:** el 70 % de la visión está construido. Lo que falta no es
“hacerlo”, es **pulirlo y conectarlo**.

---

## 2 · Lo que falta de verdad

### A · Bóveda del cliente: compras por proveedor y crédito tributario

Hoy la Bóveda guarda declaraciones, comprobantes PDF y cifras agregadas
(`extractDeclarationCifras`). No hay una vista de **facturas de compras separadas por
proveedor**, ni la marca de **crédito tributario**.

- Datos: los comprobantes viven en `sri_comprobantes` (los sube la 01) y en
  `sri_declaraciones.proof_file`.
- Falta: una tabla agrupada por proveedor con `base`, `IVA`, y un chip
  **“crédito tributario”** cuando corresponde.

### B · Vista “persona normal” vs “contador”

El contador ve todo; el cliente debería ver una versión animada y simple.
Hoy hay una sola vista. Falta un **modo cliente** (menos números, más lenguaje).

### C · Escala 2000 clientes

Números reales con la arquitectura actual:

| Pieza | Límite práctico | Qué pasa con 2000 |
| :--- | :--- | :--- |
| Popup 01 (pinta todas las tarjetas) | ~300-400 sin lag | **Se arrastra**: hay que virtualizar |
| `sc_clients_cache` en storage | ~5 MB por extensión | ~1 KB/cliente → 2 MB, entra |
| Bóveda web (una tabla con todos) | ~1000 filas | **Paginar o virtualizar** |
| Bucle (cola secuencial) | sin límite lógico | 2000 × ~40 s ≈ **22 h**: hay que partir por lotes |

### D · Valores a pagar → revisión manual

Existe `porPagar` en la clasificación, pero no un estado explícito
**“listo para revisión”** que pause el bucle y avise.

### E · Formulario y captura de facturas “bonitos”

Hoy el llenado es funcional. Falta la capa visual (progreso, resumen de lo capturado,
validación en vivo) que pedís.

---

## 3 · Plan por tandas (cada una con criterio de terminado)

### Tanda 1 · Escala (la que evita volverse loco)

1. **Virtualizar la lista del popup** (solo pintar lo visible). Terminado: 2000
   clientes abren en < 1 s.
2. **Bucle por lotes de N** (ej. 50) con pausa y reanudación. Terminado: 2000
   clientes se pueden correr en varias sesiones sin perder la cola.
3. **Sync incremental**: traer solo clientes con `updated_at` nuevo. Terminado: la
   sync no descarga todo cada vez.

### Tanda 2 · Bóveda que entiende un humano

4. **Compras por proveedor + crédito tributario** (tabla + chip). Terminado: el
   contador ve las compras del mes agrupadas y marcadas.
5. **Modo cliente** (vista animada, sin jerga). Terminado: un cliente entiende su mes.

### Tanda 3 · Bucle confiable

6. **Estado “revisión manual”** cuando hay valor a pagar. Terminado: el bucle se
   detiene y lo lista.
7. **HUD que se calla** si ya hay un bucle en curso. Terminado: no molesta.

### Tanda 4 · Estética del formulario

8. **Captura de facturas con progreso** y **formulario con resumen en vivo**.
   Terminado: se ve qué se capturó y qué falta antes de enviar.

---

## 4 · Sobre costos (tu condición)

- **Supabase free**: alcanza para 2000 clientes; el límite real son los archivos.
- **R2 no hace falta**: se activa cuando la tarjeta de capacidad pase el 80 % de
  Storage (hoy ni se acerca).
- **Nada pago**: la única pieza que pide crédito es la API de Claude, y es opcional.

---

## 5 · Lo que hay que verificar (no está confirmado)

- El bucle de ayer (3 de 7) **no subió a Supabase**: hay que revisar si el perfil de
  Chrome usado tenía `SC_CONFIG` (la clave anon). El 04 ya muestra el estado de
  subida; la 01 no. **Acción**: agregar el mismo chip de nube al popup 01.
