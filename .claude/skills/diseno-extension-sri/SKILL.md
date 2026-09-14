---
name: diseno-extension-sri
description: Mejorar el diseño visual y la experiencia de uso de las superficies flotantes de la extensión Nueva Luz 3.0 (la barra SriLoopHUD, el panel SriAssistantPanel, el cajón 🧰, el sidebar de anticipación). Úsala cuando pidan mejorar, rediseñar, prolijar o modernizar la interfaz de la extensión, agregar un control visual nuevo, o resolver sobrecarga/inconsistencia visual — no para la web santiagocordova-main, que tiene sus propias reglas de diseño "premium".
---

# Diseño de la interfaz flotante de Nueva Luz 3.0

Esta skill es para **proponer e implementar** mejoras visuales. Para
**auditar** un cambio ya propuesto por otra razón, usá el agente
`hud-design-reviewer` (`.claude/agents/hud-design-reviewer.md`) — las dos
comparten las mismas reglas, pero esta skill construye y esa audita.

La interfaz vive **inyectada sobre el portal del SRI**, no es una web propia:
la primera regla de cualquier mejora es que no compita visualmente con el
portal ni lo tape, y que no agregue nada que no sea imprescindible mientras el
usuario está tratando de trabajar ahí. El usuario ya pasó por un problema real
de sobrecarga (17 controles sueltos — AGENTS.md §9c) y lo resolvió metiendo
casi todo en un cajón colapsable. No repetirlo es más importante que agregar
brillo.

## El sistema visual ya existe — no inventar uno nuevo

Extraído de `06_panel_interfaz.js`, es "glassmorphism oscuro", consistente en
todo el panel y el HUD:

- **Fondo**: `rgba(15, 23, 42, 0.7)` a `0.9` (slate-900 translúcido) —
  nunca un fondo sólido opaco, nunca blanco.
- **Bordes y contenedores internos**: translúcidos sobre el fondo oscuro,
  `rgba(255,255,255,0.03)` a `0.1` según jerarquía (más opaco = más
  importante). Tarjetas internas con `border-radius: 8-12px`; el contenedor
  raíz con `border-radius: 20px`.
- **Sombra**: `box-shadow: 0 20px 50px rgba(0,0,0,0.3-0.5), 0 0 1px rgba(255,255,255,0.3)`
  — el borde de 1px translúcido es lo que separa el panel del fondo del portal
  sin una línea dura.
- **Tipografía**: `'Inter', 'Segoe UI', system-ui, sans-serif`. Texto
  principal blanco (`color: white` / `#f8fafc`), texto secundario gris
  (`#94a3b8`, `#cbd5e1`, `#aaa`).
- **Paleta semántica, no decorativa** — cada color ya significa algo en toda
  la interfaz; reusar el significado, no el color suelto:
  - `#10b981` (verde esmeralda) — éxito, saldo en cero, "todo bien".
  - `#ef4444` (rojo) — saldo a pagar, alerta, detener.
  - `#3b82f6` / `#2563eb` / `#6366f1` / `#60a5fa` — acción primaria, navegación,
    info neutral.
  - `#f59e0b` (ámbar) — advertencia, algo a revisar sin ser grave (0%, pendiente).
  - `#a78bfa` (púrpura) — retenciones y datos secundarios de cálculo.
  - `#818cf8` — encabezados de sección dentro de tarjetas oscuras.
  - Gradientes (`linear-gradient(135deg, #3b82f6, #2563eb)`,
    `linear-gradient(90deg, #6366f1, #10b981)`) solo en botones de acción
    principal o barras de progreso — no en texto ni en fondos de tarjeta.
- **Botones**: `border: none`, `border-radius: 6-10px`, `font-weight: 800`,
  `cursor: pointer`. El peso tipográfico alto (800) es lo que reemplaza al
  contraste de color para que un botón se lea como interactivo sobre fondo
  oscuro.
- **Texto de apoyo** (rótulos de campo, unidades): `font-size: 9-11px`,
  `text-transform: uppercase`, `letter-spacing: 0.05em`, color gris — nunca
  compite en tamaño con el dato que describe.

Un control nuevo que no combine con esto (fondo blanco, colores fuera de la
paleta, tipografía distinta, sombras duras) se nota al lado de todo lo demás y
hay que rehacerlo — mejor calibrarlo contra esta lista antes de escribir CSS.

## Las reglas de arquitectura de UI que ya costaron un bug (no negociables)

1. **Todo lo que no sea del lote activo va al cajón 🧰**, en su propia línea,
   con el **rótulo escrito debajo del ícono** — un ícono sin texto es
   ilegible a las dos semanas de no tocarlo. A la vista solo: ▶/⏸, paso a
   paso, estado, 🎯, ⚠️, ⏭️, 🏁, 🧰, 🛑.
2. **Antes de montar cualquier superficie nueva** (`position: fixed`), buscar
   su elemento raíz por `id` en el DOM (`document.getElementById(...)`) y
   adoptarlo si ya existe. Recargar la extensión con una pestaña abierta deja
   dos content scripts corriendo a la vez — sin esta guarda, la superficie se
   duplica (pasó de verdad con `SriLoopHUD`, corregido el 10-sep-2026).
3. **Nunca `offsetParent === null` para saber si algo es visible.** En Chrome
   todo `position: fixed` da `null` ahí. Usar `esVisible(el)` de
   `02_servicios_y_memoria.js`.
4. **Toda UI nueva respeta el modo dormido**: la extensión no monta nada en
   `srienlinea.sri.gob.ec` salvo que `extensionDespierta()` devuelva `true`
   (master switch, lote vivo, o autofill pendiente). No agregues una
   superficie que se monte sin pasar por esa compuerta.
5. **`pintar()` esconde la celda entera**, no solo el ícono, cuando una
   herramienta no aplica al estado actual — un rótulo huérfano flotando sin su
   botón es peor que ocultar los dos juntos.
6. **Los botones que se re-renderizan se mueven con `appendChild` tras armar
   el `innerHTML`**, nunca se recrean — si no, los handlers enganchados por
   `id` quedan huérfanos y se acumulan duplicados.
7. **Nunca cerrar un modal ajeno por el texto de su botón.** El SRI mete una
   encuesta de satisfacción con un botón real que enviaría una respuesta en
   nombre del usuario. Cierre solo por controles explícitos (`aria-label`,
   `×`, `.mat-dialog-close`); si no hay ninguno, dejarlo quieto y avisar por
   consola.

## Flujo de trabajo

1. **Leer la superficie que se va a tocar** en `src/06_panel_interfaz.js`
   (`SriLoopHUD` para la barra chica, `SriAssistantPanel` para el panel grande
   y el cajón) antes de escribir nada — es una clase de ~3.500 líneas y ya
   existen métodos parecidos que conviene reusar en vez de duplicar
   (`grep -n "async nombreDelMetodo(" src/06_panel_interfaz.js` para chequear
   que el nombre no exista ya).
2. **Diseñar el cambio contra la lista de arriba**: ¿va al cajón o necesita
   visibilidad permanente y por qué? ¿combina con la paleta y la tipografía
   existentes? ¿respeta el modo dormido y el chequeo de montaje único?
3. **Editar el archivo `src/` correspondiente** — nunca `build/content.js`
   directamente, se sobrescribe en el próximo build. Si es un parche puntual,
   seguir la regla de las dos IAs en paralelo (AGENTS.md §0a): reemplazar un
   fragmento único, verificado (`s.count(viejo) == 1`), no reescribir el
   archivo entero.
4. **Compilar**: `npm run build` dentro de la carpeta de la extensión
   (`extenciones web/01_Nueva_Luz_3.0`). Antes de compilar, `git status` — si
   hay cambios ajenos en `src/`, no es tu build para correr todavía.
5. **Correr los bancos relevantes** en `tests/index.html` (servidor
   `bancos-extension` de `.claude/launch.json`, `localhost:8791`) — como
   mínimo `tests/parada.html` si el cambio toca montaje o duplicación de
   superficies. `node --check` sobre cada archivo tocado.
6. **Antes de dar el cambio por terminado**, pasarlo por el agente
   `hud-design-reviewer` para una segunda mirada contra las mismas reglas —
   dos revisiones (la propia durante el diseño, la del agente al final)
   atrapan más que una sola.

## Checklist final

- [ ] ¿El control nuevo tiene justificación para vivir fuera del cajón, o
      debería ir adentro?
- [ ] ¿Tiene rótulo visible si está en el cajón?
- [ ] ¿Usa la paleta y tipografía existentes, no colores/fuentes nuevas?
- [ ] ¿Chequea `document.getElementById` antes de montar su raíz?
- [ ] ¿Pasa por `extensionDespierta()` antes de mostrarse en el portal?
- [ ] ¿`npm run build` corrido, bancos en verde, `node --check` limpio?
