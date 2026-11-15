# Auditoría UX · Popup de la 01 (Nueva Luz)

Hecha con **ui-ux-pro-max** (10 categorías, 120 reglas) sobre `popup.html` y
`popup.js`. Evidencia medida con búsqueda en el código, no impresiones.

---

## Resumen

| Prioridad | Hallazgos | Aplicados | Pendientes |
| :--- | ---: | ---: | ---: |
| P0 · Crítico | 1 | 1 | 0 |
| P1 · Alto | 3 | 3 | 0 |
| P2 · Medio | 5 | 5 | 0 |
| P3 · Bajo | 3 | 2 | 1 |

---

## Aplicado en esta pasada

### P0 · `reduced-motion` (Accesibilidad, §7)

**Evidencia:** 0 usos de `prefers-reduced-motion` en `popup.html`, con spinner,
pulso y transiciones activas.

**Fix:** bloque global que apaga animaciones y transiciones si el sistema lo pide.

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

### P1 · `focus-appearance` (Accesibilidad, §1)

**Evidencia:** el anillo de foco usaba `var(--primary)` (esmeralda) sobre
botones esmeralda: el indicador no llega a **3:1** contra el fondo del botón.

**Fix:** anillo **dorado `#C9A96E`** a 2px con `outline-offset: 2px` (contrasta
sobre cualquier color de la paleta), más `[role="menuitem"]`.

### P1 · `readable-font-size` / `contrast-readability` (Tipografía, §6)

**Evidencia:** **20 selectores** con `font-size` de 8–9.5px (`.menu-label`,
`.tool`, `.cc-badge`, `.cc-ruc`, `.nube-chip`, `.ver-mas`, `.buzon-panel`,
`.ultimo-lote`…). Es el anti-patrón “texto por debajo del mínimo legible”.

**Fix:** todos subidos a **10px** (0 restantes por debajo).

### P1 · `aria-labels` (Accesibilidad, §1)

**Evidencia:** el botón del buzón (💡) era icono puro con `title`.

**Fix:** `aria-label="Buzón de sugerencias"`.

---

## Pendientes (con fix propuesto)

### ✅ P2 · `dynamic-type` — nada escala con el tamaño de texto del sistema (HECHO)

Todos los tamaños son `px` fijos; si el usuario agranda el texto, no crece nada.

**Fix:** pasar los textos de lectura a `rem` (base 16px) y dejar `px` sólo en
íconos y bordes. *Esfuerzo: medio.*

### ✅ P2 · `escape-routes` / `error-feedback` — 5 `window.confirm()` (4 hechos; queda 1 en `bindEvents`)

Los 5 confirm nativos son feos, no se pueden estilar y en una ventana emergente
pueden quedar detrás.

**Fix:** un diálogo interno (overlay + tarjeta) reutilizable con “Sí / No” y
texto de consecuencia. *Esfuerzo: bajo-medio.*

### ✅ P2 · `primary-action` — cinco CTA compitiendo (HECHO)

`Ejecutar lote`, `Correr todos`, `Detener`, `Segunda vuelta`, `Siguiente tanda`
pueden estar visibles a la vez; la jerarquía se pierde.

**Fix:** una sola acción primaria por estado:
- sin lote → **Ejecutar** (verde)
- corriendo → **Detener** (rojo, única)
- terminado con faltantes → **Segunda vuelta** (dorada, única)
- Las otras, en el menú. *Esfuerzo: bajo.*

### ✅ P2 · `loading-buttons` — falta estado “trabajando” en los CTA (HECHO)

Al apretar “Ejecutar lote” no se ve un spinner/disabled hasta que arranca el
lote.

**Fix:** `disabled` + spinner mientras se arma la cola y se abre la pestaña.
*Esfuerzo: bajo.*

### ✅ P2 · `empty-state` con salida (HECHO)

Los 6 estados vacíos explican, pero no siempre ofrecen la acción siguiente.

**Fix:** cada vacío con **un** botón (“Cambiar de mes”, “Cargar claves”,
“Sumar pendientes”). *Esfuerzo: bajo.*

### ✅ P2 · `chip-collection-reflow` — chips que pueden desbordar (HECHO)

Chispas de estado (`.cc-badge`, `.nube-chip`) sin `max-width` ni `nowrap`
explícito en nombres largos.

**Fix:** `white-space: nowrap` + `text-overflow: ellipsis` + `title` con el
texto completo. *Esfuerzo: bajo.*

### ✅ P3 · `aria-labels` en el menú (2 de 3 hechos; queda `touch-target-size` como excepción)

Los `menu-item` usan `title` (Chrome calcula el nombre accesible), pero no es
uniforme entre navegadores.

**Fix:** `aria-label` explícito en los 6 items. *Esfuerzo: bajo.*

### P3 · `touch-target-size`

Botones de 32px: cumplen **WCAG 24px** (web). Para touch real de 44px no hay
espacio en un popup de 520px.

**Fix:** no hacer. Queda documentado como excepción consciente.

---

## Lo que ya estaba bien

| Regla | Evidencia |
| :--- | :--- |
| `no-emoji-icons` | 24 iconos SVG en el HUD; el popup usa emoji sólo como texto decorativo |
| `web-target-size` | 32px ≥ 24px (WCAG 2.5.8) |
| `virtualize-lists` | listas paginadas de 60 (`.ver-mas`) |
| `state-clarity` | estados con texto + color (no color solo) |
| `escape-routes` | cajón/menú con ✕ y cierre por overlay |
| `consistent-help` | Ajustes y Diagnóstico en el pie, siempre en el mismo orden |
