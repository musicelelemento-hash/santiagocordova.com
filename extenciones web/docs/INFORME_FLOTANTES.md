# Informe: por qué las flotantes se sienten “experimentales”

08-nov-2026. Diagnóstico honesto de las interfaces flotantes de la 01, y qué falta
para que sean **versión final** (vas a declarar con ellas todos los días).

---

## 1 · Por qué se siente experimental

No es el color ni el vidrio. Es **jerarquía**:

1. **Demasiados botones sin etiqueta.** El HUD tiene ~30 botones de emoji, todos
   del mismo tamaño y peso. El ojo no sabe cuál es “el importante”.
2. **El estado es chiquito.** “CORRIENDO” en 11px compite con 30 botones: lo que
   más importa (¿en quién va? ¿cuánto falta?) es lo más pequeño.
3. **El cajón es una grilla densa.** Celdas al 25% con etiquetas de 9px: se lee
   como panel de administración, no como herramienta.
4. **Mezcla de lenguajes.** Emoji + texto + mono + colores por acción, todo al
   mismo nivel. Sin un sistema, parece armado por partes.
5. **Falta el orden visible.** La cola corre por vencimiento (9.º dígito) pero eso
   no se veía en ninguna parte.
6. **Los paneles son tablas.** Útiles, pero sin diseño: texto plano sobre fondo.

**Lo que sí está bien y no hay que tocar:** el semáforo como única autoridad, el
cajón agrupado (Datos/Portal/Sistema), el arrastre, los atajos y el botón de
detener rotulado.

---

## 2 · La versión final que propongo (3 niveles)

### Nivel 1 · Isla colapsada (lo que ves el 95% del tiempo)

```
● 3/6  CAMBA PATIÑO · IVA 10/26        [⏸] [🏁] [🛑] [🧰]
        D9 3 · vence 16                 ▓▓▓▓▓░░░░ 50%
```

- **Un solo renglón de estado**, con el cliente y el vencimiento.
- **Anillo de progreso** (no barra): se lee de un vistazo.
- **Cuatro acciones**: pausar, cerrar, detener, herramientas.
- Nada más. Cero emojis sueltos.

### Nivel 2 · Panel de corrida (al tocar el estado)

- **La cola ordenada por D9**, con el cliente actual resaltado y su vencimiento.
- Tiempo por cliente y total.
- Las acciones de la fase (llenar, cerrar, omitir).

### Nivel 3 · Cajón (herramientas)

- Grilla de 3 columnas con **etiqueta legible (10px)** e icono.
- Buscador de herramienta arriba (son 16).
- Cada herramienta con su estado (“listo / requiere sesión / no aplica”).

---

## 3 · Qué falta técnicamente

| Pieza | Estado | Trabajo |
| :--- | :--- | :--- |
| Orden por 9.º dígito | **Hecho** (cola ordenada) | — |
| Ver el D9 y el vencimiento en el HUD | **Hecho** (línea nueva) | — |
| Isla de vidrio + botones circulares | **Hecho** | — |
| Anillo de progreso | Falta | CSS `conic-gradient` + dato `indice/total` |
| Estado con cliente prominente | Parcial | Mover `#slh-detalle` al renglón principal |
| Iconos consistentes | Falta | SVG en vez de emoji (16 piezas) |
| Etiquetas legibles en el cajón | Falta | Subir 9px → 10px y 2 líneas |
| Cola visual en el panel | Falta | Lista ordenada con vencimientos |
| Estados vacíos del cajón | Falta | “Requiere sesión” en vez de nada |

---

## 4 · Orden de implementación

1. **Anillo de progreso + estado prominente** (1 hora de trabajo, cambio visible
   inmediato).
2. **Cola visual ordenada por D9** en el panel (lo que pediste: “más visual”).
3. **Iconos SVG** en el cajón y etiquetas de 10px.
4. **Estados por herramienta** (“requiere sesión”, “no aplica”).

Con eso deja de parecer experimental: hay una sola cosa importante en pantalla y
el resto está a un toque.
