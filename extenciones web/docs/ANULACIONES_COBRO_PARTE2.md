# Cobro de anulaciones — parte 2: precios por cliente, cupos y meses

Segunda tanda (07-nov-2026), a partir de tus respuestas: precio **flexible y
personalizable**, cupos, recordatorio para cobrar junto con la declaración, y
meses de cobro **claros y predecibles**. Esta parte es la lógica y la pantalla
lista para conectar; la primera (registro + numeración + CSV) sigue vigente.

---

## 11 · Precio por cliente (flexible, sin tocar código)

Cada cliente puede tener una de cuatro reglas. Si no tiene ninguna, hereda la
global ($2 por anulación, sin cupo):

| Modo | Qué hace | Ejemplo |
| :--- | :--- | :--- |
| `heredado` | Usa la global | La mayoría |
| `gratis` | Nunca se cobra | Un cliente al que le incluís el servicio |
| `fijo` | Su propio precio, sin cupo | $1,50 por anulación |
| `cupo` | N incluidas por período y el resto al precio | 2 gratis por mes, después $2 |

La regla vive en `annulment_policies` (o en `billingPlan.annulmentPolicy`) y se
resuelve con `resolverPolitica()`. Nada de precios hardcodeados: el $2 es sólo
el valor por defecto.

```ts
resolverPolitica({ modo: 'cupo', precio: 2, cupoPorPeriodo: 2 })
// → { precio: 2, cupo: 2, gratis: false, origen: 'cliente' }
```

---

## 12 · Cupos: cuántas anulaciones van incluidas

El cupo es **por período** (mes o semestre, según el plan) y se aplica en orden
de consecutivo: las primeras N no se cobran, el resto sí.

- Se **reinicia** en cada período: diciembre tiene su propio cupo.
- Es **determinista**: si cambiás el cupo, se recalcula; no reescribe la
  historia ni los cobros ya facturados.
- Se ve en la pantalla: “3 en cupo · 2 cobrables”.

```ts
aplicarCupo(anulaciones, { precio: 2, cupo: 2, gratis: false })
// → { incluidas: [...], cobrables: [...], total: 6 }
```

---

## 13 · Meses del plan mensual: claros y predecibles

Hoy el facturador se confunde con qué mes falta cobrar. La regla es simple y
calculable: **desde el inicio del plan hasta el mes actual, un mes por período**,
y cada uno tiene un estado:

| Estado | Significado |
| :--- | :--- |
| `pagado` | La factura existe y está pagada |
| `facturado` | La factura existe y no está pagada |
| `pendiente` | **No hay factura de ese mes** |
| `cortesia` | Mes bonificado (no se cobra) |

`mesesDePlan({ inicio, hasta, cuotaMensual, registros })` devuelve la lista
completa; la pantalla la pinta como una tira de chips (`ago 26 · pagado`,
`sep 26 · facturado`, `oct 26 · sin facturar`). Es la misma lógica predecible
del menú de declaraciones: no hay que adivinar, se calcula.

Casos que resuelve: cliente que entró en mayo (no se le cobran los meses
anteriores), mes con cortesía, mes facturado sin pago, y el mes en curso.

---

## 14 · Recordatorio para cobrar

`recordatorioDeCobro()` junta todo en una frase y en datos:

```
ACME PRUEBA: 1 anulación $2.00 · 2 incluidas en el cupo ·
2 mes(es) sin facturar (oct-26, nov-26) · Total $22.00
```

- **Cobranza**: cada fila del cliente muestra esta frase y el total.
- **Ficha del cliente**: el mismo dato en la Bóveda.
- **Bot**: cuando preguntás “¿qué tiene pendiente ACME?”, contesta esto
  (devuelve `texto`, `total`, `mesesPendientes` y el detalle).
- **Al facturar**: se muestra antes de confirmar, para no cobrar de más ni de
  menos.

---

## 15 · Las dos formas de facturar (y la intermedia)

| Forma | Qué pasa | Cuándo |
| :--- | :--- | :--- |
| **Sólo la declaración** | La factura sale sin anulaciones; quedan `pendiente` y visibles | El cliente paga después |
| **Declaración + anulaciones** | Se agrega la línea “Servicio de anulación…” y pasan a `facturado` | Cobro completo |
| **Parcial** | Se tildan algunas; el resto queda pendiente | “Cobrame estas tres y el resto después” |

La tercera es la que pediste (“que quede pendiente”): no es un estado raro, es
la selección por defecto. El botón *“Sólo la declaración · dejar pendiente”*
está siempre, y el total pendiente queda a la vista.

---

## 16 · La pantalla (lista para conectar)

`components/features/AnnulmentsBillingPanel.tsx` — recibe datos y devuelve
decisiones por callbacks. No consulta nada por su cuenta, así se puede montar
en la Bóveda y en Cobranza sin duplicar la regla.

```
Cobro de anulaciones            [Cambiar]
ACME · Cupo 2 por período · $2.00 c/u
Meses: ago · pagado | sep · facturado | oct · sin facturar | nov · sin facturar
Anulaciones: AN-…001 incluida · AN-…002 incluida · AN-…003 $2.00 [exonerar]
[A facturar $2.00] [Queda pendiente $20.00] [Total $22.00]
ACME: 1 anulación $2.00 · 2 incluidas · 2 meses sin facturar · Total $22.00
[ Agregar a la factura ($2.00) ]  [ Sólo la declaración · dejar pendiente ]
```

### Cómo conectarlo (2 puntos)

1. **Bóveda del cliente** (`VaultTab.tsx`): una tarjeta con
   `<AnnulmentsBillingPanel cliente={...} annulments={...} policy={...} plan={...} onFacturar={...} />`.
   `onFacturar` llama al flujo de factura que ya existe y pasa la línea.
2. **Cobranza** (`CobranzaScreen.tsx`): el mismo panel en el detalle del
   cliente; el botón usa el mismo `onFacturar`.

### De dónde salen los datos

| Opción | Costo | Cuándo |
| :--- | :--- | :--- |
| **CSV del popup** → importar | $0, sin migración | Ya funciona (`importarCsv`) |
| **Tabla `annulments`** | $0 en el plan free | Para que aparezca solo; SQL listo en `database/annulments.sql` |
| Puente extensión ↔ web | $0 | Cuando la tabla esté y se quiera automático |

La tabla ya está escrita (con `unique` por clave para la idempotencia), pero
**RLS queda cerrado a propósito** hasta que se decida el modelo de acceso,
igual que se hizo con `clients`.

---

## 17 · Verificado

- `tsc --noEmit` del proyecto: **0 errores**.
- **12 comprobaciones** de la lógica (compiladas con `tsc` y corridas en Node):
  precio global, cupo por período, reinicio del cupo, gratis, fijo, heredado,
  idempotencia por clave, rechazo→éxito, meses y sus estados, recordatorio,
  facturar parcial y exonerar sin borrar.
- La captura del popup sigue en `captura_04_cobro.png`.

---

## 18 · Lo que falta

1. **Conectar el panel** en la Bóveda y en Cobranza (2 puntos de la §16).
2. **Editar la política por cliente** desde la ficha (el “Cambiar” del panel):
   gratis / fijo / cupo.
3. **Bot**: una herramienta `get_pending_charges(ruc)` que devuelva
   `recordatorioDeCobro()`.
4. Decidir el acceso a la tabla `annulments` (RLS) o quedarse en CSV.

---

## 19 · Tercera tanda: la conexión (misma vía que las declaraciones)

Se implementó la conexión que pediste, copiando el camino que ya usa la
declaración:

| Pieza | Cómo quedó |
| :--- | :--- |
| **Extensión 04 → Supabase** | Al confirmar cada anulación sube el cobro a `annulments` por REST con la clave `anon` y **upsert por `clave`** (la idempotencia vive en la base). Si la nube falla, el registro local queda igual. |
| **Config** | La 04 ahora lleva `shared_config.js` (la misma URL y clave pública que la 01), así funciona sola y dentro de la suite. |
| **Web** | Todas las consultas de clientes piden `annulments(*)` junto con `sri_declaraciones(*)`, y el cliente llega a la app con `client.annulments`. |
| **Al facturar** | Antes de emitir, si hay anulaciones pendientes aparece un aviso con el total y la decisión explícita: la factura sale **sólo por la declaración** y las anulaciones quedan pendientes para cobrarlas desde la Bóveda. |

SQL: las políticas `anon` quedaron activas en `database/annulments.sql`, igual
que `sri_declaraciones` (la extensión escribe desde el navegador).

### La línea dentro de la factura (hecho 07-nov-2026, sin IVA por RIMPE)

Como sos **RIMPE Negocio Popular**, el servicio va con **IVA 0%** y el
generador ya lo hace solo (`emisorRegimen === 3` → tarifa 0). Al aceptar el
aviso, la factura suma:

- un segundo `detalle`: **Servicio de anulación de comprobantes (N)** con el
  monto y su impuesto al 0%;
- el total del documento (base + IVA 0%);
- al autorizar, las anulaciones pasan a **facturado** con el secuencial de la
  factura. Si el SRI rechaza, **no se marcan** y quedan pendientes: nunca se
  cobran dos veces por error.

Si algún día pasás a régimen general, el mismo código aplica 15% sin cambios
(la tasa sale del régimen del emisor).

---

## 20 · Cuarta tanda: la pantalla y el estado de la nube

| Pieza | Qué quedó |
| :--- | :--- |
| **Editor de precio por cliente** | En la Bóveda, botón **Cambiar** del panel: heredar ($2), gratis, precio propio o cupo por período. Se guarda en `billingPlan.annulmentPolicy` y lo lee todo el sistema. |
| **Aviso global en Cobranza** | Franja arriba de los KPI: “N cliente(s) · $X · se agregan al facturar”. Sólo aparece si hay algo pendiente. |
| **Estado de la nube en el 04** | Cada subida anota si llegó a Supabase. El popup muestra `☁ nube OK · 12:30` o `⚠ local · 12:30` con el motivo, y un botón **Probar nube**. |
| **Precio vigente** | El panel muestra y suma con la política actual, no con el precio que tenía el cobro cuando se capturó. |

Con eso el ciclo queda cerrado: la anulación se captura, se cobra con la regla del
cliente, entra en la factura al 0% (RIMPE) y queda marcada como facturada.

### Lo que sigue

1. **Bot**: herramienta `consultar_cobros_pendientes` (en curso por un colaborador).
2. **Cobranza sin declaración**: hoy el aviso y la inclusión ocurren al facturar la
   declaración. Falta facturar anulaciones solas (cliente que sólo compra firma).

---

## 21 · El bot ya contesta el pendiente

Herramienta `consultar_cobros_pendientes` en `telegram-bot`:

- Preguntás “¿cuánto tiene pendiente ACME?” y devuelve el mismo recordatorio:
  total, meses sin facturar y anulaciones (cobrables / incluidas en cupo).
- Usa **la misma regla** que la web: `services/annulmentBilling.ts` se compila a
  `telegram-bot/dist/services` con `npm run build:shared` (corre solo en
  `predev`/`prebuild`). No hay lógica duplicada.
- Si la tabla o el plan no se pueden leer, degrada con un aviso en la respuesta
  en vez de inventar un número.

Sobre `annulment_policies`: quedó **reservada**. La política real vive en
`tax_profile.facturadorConfig.annulmentPolicy` (lo que guarda el editor de la
Bóveda); la tabla existe para el día que se quiera consultar sin leer el JSON.
