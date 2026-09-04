# 🎨 Informe de interfaz — Nueva Luz 3.0

Estado de la UI por sección, qué falla y en qué orden convendría arreglarlo.
04-sep-2026, build `3.1.0+20260904.1106`.

---

## El número que resume todo

```
396  atributos style="…" inline
 31  clases CSS propias
  4  bloques <style> inyectados
```

**Trece veces más estilo suelto que clases.** No es un problema estético sino de
mantenimiento: cambiar el color de acento hoy significa tocar cientos de líneas,
y por eso cada superficie terminó con su propio criterio.

---

## Las seis superficies

| # | Superficie | Dónde vive | Cuándo aparece |
| :-: | :--- | :--- | :--- |
| 1 | **HUD del bucle** (`SriLoopHUD`) | `07` | Siempre, en toda página del SRI |
| 2 | **Panel / píldora** (`renderPill`, `renderPanel`) | `06` | Siempre, esquina opuesta |
| 3 | **Barra de clientes** (`renderAnticipationWidget`) | `01` | En el login |
| 4 | **Cockpit de login** (`renderLoginCockpit`) | `03` | En el login, además de la 3 |
| 5 | **Tarjetas** (`showContextCard`) | `06` | Modal con overlay |
| 6 | **Avisos** (`showEliteToast`) | `06` | Flotantes |

Seis superficies que no se hablan entre sí, dibujadas por cuatro módulos
distintos. Ahí está el origen de casi todo lo demás.

---

## 🔴 Lo más grave: controles duplicados

De la radiografía real del DOM en la pantalla de resumen, **ocho controles
visibles a la vez**:

```
⚡ LLENAR TODO AUTOMÁTICO      ✨ EFECTUAR CIERRE MÁGICO
🛑 DETENER                     ⏸️ PAUSAR
⏭️ Next                        🔄 Recargar
⏸ (HUD)                        🛑 (HUD)
```

**Dos pausas y dos detenciones distintas**, en dos widgets distintos, sin nada
que indique cuál manda. Y en el código son tres:

```
detener  →  btn-panel-detener · btn-pill-stop · slh-stop
sync     →  btn-force-sync · btn-force-sync-panel · btn-sync-supabase
siguiente→  btn-panel-force-next · btn-success-next
```

Esto no es sólo feo: después de todo el trabajo del semáforo, tener tres botones
de parada es exactamente la clase de ambigüedad que causó los bugs de control
que estuvimos persiguiendo. **Un solo control por acción, en un solo lugar.**

---

## Sección por sección

### 1 · HUD del bucle — 🟢 el mejor parado

Es el más nuevo y el único con lenguaje visual propio: fases con punto latiendo,
línea de avance, verde/celeste/apagado. Arrastrable y recuerda su posición.

**Qué le falta**: es la única superficie con animación real. Debería ser la
plantilla del resto, no la excepción.

### 2 · Panel / píldora — 🟠 el más cargado

Concentra la mayoría de los 396 estilos inline. Botones de tamaños y pesos
distintos, sin jerarquía: `⚡ LLENAR TODO AUTOMÁTICO` compite visualmente con
`🔄 Recargar`, y uno es destructivo y el otro trivial.

**Qué le falta**: jerarquía. Una acción primaria por pantalla, el resto
secundario o escondido tras un menú. Y ceder pausa/stop al HUD.

### 3 y 4 · Barra de clientes + cockpit — 🟠 se pisan

**Dos superficies distintas en la misma pantalla de login**, dibujadas por
módulos distintos (`01` y `03`), mostrando ambas la lista de clientes.

**Qué le falta**: fusionarlas. Es la duplicación más cara del proyecto — dos
listas que hay que mantener sincronizadas a mano.

### 5 · Tarjetas modales — 🟡 recién corregidas

Ya se arregló que en automático no aparezcan (dibujaban un velo negro sobre
toda la página mientras el bot trabajaba detrás). En manual siguen y ahí están
bien.

**Qué le falta**: que `showContextCard` no auto-confirme a los 4 segundos por
defecto. Una tarjeta que *pregunta* nunca debería responderse sola; hoy hay que
acordarse de pasar `timeout: null`.

### 6 · Avisos — 🟢 funcionan

Es la pieza más sana. No bloquean, se apilan bien, tienen duración configurable.

---

## Cómo lo haría, en orden

### Paso 1 · Tokens de diseño *(medio día, cero riesgo)*

Un bloque `<style>` con variables y clases base:

```css
:root{
  --sc-fondo:rgba(5,20,36,.94); --sc-borde:rgba(255,255,255,.14);
  --sc-txt:#d5e4fa; --sc-suave:#94a3b8;
  --sc-ok:#4ade80; --sc-activo:#7dd3fc; --sc-alerta:#ffb95f; --sc-mal:#f87171;
  --sc-r:14px; --sc-sombra:0 10px 30px rgba(0,0,0,.5);
}
.sc-btn{...} .sc-btn--primario{...} .sc-btn--peligro{...} .sc-panel{...}
```

Nada visual cambia todavía. Pero a partir de acá cada superficie que se toque
puede migrar sola, y el resto sigue andando.

### Paso 2 · Un control por acción *(el que más se nota)*

Pausa y stop **solo en el HUD**. Se van `btn-panel-detener`, `btn-pill-stop`,
`sri-panel-pause` y los dos Sync sobrantes. El panel queda para lo suyo:
llenar, ver el resumen, la lista de clientes.

Es el cambio de mayor impacto y el que reduce riesgo, no sólo ruido.

### Paso 3 · Fusionar login *(barra + cockpit → uno solo)*

Una sola lista de clientes en el login. Elimina la duplicación más cara.

### Paso 4 · Jerarquía de botones

Una acción primaria por pantalla —llena, grande, con acento— y el resto
secundarias o dentro de un `⋯`. Las destructivas siempre en rojo y nunca
adyacentes a las frecuentes.

### Paso 5 · Animación con criterio

Lo del HUD extendido al resto, pero sólo donde comunica algo:

- **Números que cambian** → transición corta al actualizarse
- **Fase activa** → latido (ya está)
- **Éxito** → un check que se dibuja, no un color que aparece
- **Cliente N → N+1** → deslizamiento lateral, para que se vea el avance del lote

Todo CSS puro. Nada de librerías: el bundle ya pesa 340 KB en cada página.

Y una regla: **si una animación no dice nada, no va.** El spinner de "cargando"
sirve; el degradado que late porque sí, no.

---

## Lo que NO tocaría

- **Los emojis como íconos.** Pesan cero, se ven bien en Windows y ya son parte
  del lenguaje del proyecto. Cambiarlos por SVG es gasto sin retorno.
- **La paleta.** El azul oscuro con acentos funciona y ya es reconocible.
- **El panel grande completo.** Reescribirlo entero es semanas; migrar por
  partes con los tokens del paso 1 llega al mismo lugar sin romper nada.

---

## Recomendación

Los pasos 1 y 2 juntos, en una sola pasada. El 1 no cambia nada visible pero
habilita todo lo demás; el 2 es el que vas a sentir enseguida, porque hoy hay
dos pausas y dos stops compitiendo.

Del 3 al 5 son mejoras acumulativas que se pueden hacer de a una, sin bloquear
el objetivo principal —que sigue siendo cerrar la subida del comprobante.
