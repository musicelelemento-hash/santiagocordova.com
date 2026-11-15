# Cobro de anulaciones — diseño e implementación

Cada comprobante que se anula en el SRI es un servicio de **$2** (precio
configurable). Este documento define cómo se numera, cómo se cobra al cerrar
el mes o el semestre, cómo se ve en la Bóveda y cómo entra en la factura.

---

## 1 · La idea, mejorada

La versión simple sería “un contador que suma $2 por anulación”. Eso falla en
cuanto pasa algo normal: se reintenta un comprobante, se anula dos veces el
mismo, el SRI rechaza uno, o el cliente paga el semestre completo. El modelo
que quedó implementado resuelve eso con cinco reglas:

| # | Regla | Por qué |
| :-: | :--- | :--- |
| 1 | **La clave de acceso es la identidad** | Una clave de 49 dígitos = un comprobante = un cobro. Reintentar no cobra dos veces. |
| 2 | **Nada se borra** | Los errores se corrigen con estado (`exonerado`), no eliminando. La historia queda auditable. |
| 3 | **Sólo se cobra lo confirmado** | Si el SRI rechaza, queda `no_cobrable` con precio 0. El acta es completa; la factura no cobra lo que no pasó. |
| 4 | **Precio configurable** | Global ($2) y por cliente (`sc_anulacion_precios`). Un cliente VIP puede tener $0 o $1,50. |
| 5 | **El cobro tiene número y lote** | `AN-2026-000123` + `L-20261107`: el acta del día y la línea de la factura se pueden conciliar. |

---

## 2 · Quién paga

Paga **el emisor del comprobante**: el cliente dueño de la factura anulada. La
extensión lo saca de la propia clave (posiciones 10–23) y, si hay sesión
abierta, la confirma contra el RUC logueado en el portal
(`SriTaxCompliance.obtenerRucSesionActiva`).

El comprador que figura en el PDF (receptor) **no paga**: se guarda como dato
de referencia.

Caso “solo plan factura / solo firma”: si ese RUC no está en la cartera, el
cobro igual queda registrado con su RUC; la web lo muestra como *cliente no
registrado* para asignarlo o exonerarlo. Nunca se pierde el cobro por no tener
la ficha.

---

## 3 · Numeración

| Campo | Formato | Ejemplo | Regla |
| :--- | :--- | :--- | :--- |
| Consecutivo | `AN-AAAA-000000` | `AN-2026-000123` | Global, ascendente, nunca se reutiliza |
| Lote | `L-AAAAMMDD` | `L-20261107` | Agrupa la corrida del día (el acta) |
| Período | `AAAA-MM` | `2026-11` | Mes en que se anuló: define en qué corte se cobra |
| Factura | secuencial del SRI | `001-001-000000456` | Referencia del comprobante anulado |

El contador vive en `chrome.storage.local` (`sc_anulaciones_seq`) y se
incrementa en la misma escritura que el registro: no hay dos numeraciones
paralelas.

---

## 4 · Estados y transiciones

```
                 ┌──────────────┐
   SRI confirma  │  pendiente   │  ← cobrable, entra en el próximo corte
   la anulación  └──────┬───────┘
                        │ se factura
                        ▼
                 ┌──────────────┐
                 │  facturado   │  (guarda facturaRef)
                 └──────┬───────┘
                        │ entra el pago
                        ▼
                 ┌──────────────┐
                 │    pagado    │
                 └──────────────┘

   SRI rechaza → no_cobrable (precio 0). Si mañana se anula bien → pendiente.
   Decisión comercial → exonerado (sigue en la historia, no se cobra).
```

Los estados viven en el registro; **no se borra ninguna fila**. Una
corrección es un cambio de estado, con su motivo en `detalle`.

---

## 5 · Cuándo se cobra

- El cobro pertenece al **período de la anulación** (`2026-11`), no al día en
  que se factura. Así el cliente que anuló el 29 y se factura el 3 no pierde
  el cargo ni lo ve duplicado.
- **Plan mensual**: las anulaciones del mes entran en la factura de ese mes.
- **Lote semestral**: se acumulan y entran en el cierre del semestre.
- **Cliente sin plan**: quedan `pendiente` hasta que se emita una cuenta de
  cobro; la Bóveda los muestra como deuda.

La regla de qué entra se decide al facturar con
`pendientes(registro, { ruc, periodo })`: nada de “arrastrar” saldos a mano.

---

## 6 · Cómo entra en la factura

Una línea por tarifa (normalmente una sola):

```
Servicio de anulación de comprobantes (7 × $2,00) ......... $14,00
   ↳ claves incluidas en el detalle, para auditar
```

`lineasDeFactura()` agrupa por precio unitario: si el cliente tiene dos
tarifas, salen dos líneas en lugar de un promedio falso. Al guardar la
factura, `marcarFacturadas(registro, claves, facturaRef)` deja cada cobro en
`facturado` con el secuencial; el pago lo pasa a `pagado`.

---

## 7 · Dónde se ve

- **Extensión 04 (popup)**: tarjeta “Cobro de anulaciones” con el total
  pendiente, cuántos clientes, la última anulación y el precio editable. Dos
  exportaciones: el **Acta** (todas las anulaciones) y **Cobros** (con
  consecutivo, precio, estado y período).
- **Bóveda del cliente** (web): pestaña con sus anulaciones, estado de cobro y
  total; es el mismo lugar donde ya viven firmas, claves y comprobantes.
- **Cobranza** (web): el total por cobrar de todos los clientes y el botón
  para volcar el período a la factura.

---

## 8 · Sincronización sin costo

| Etapa | Cómo | Costo |
| :--- | :--- | :--- |
| Hoy | El registro vive en `chrome.storage.local`; el popup exporta CSV | $0 |
| Siguiente | El CSV se importa en la Bóveda (`importarCsv`) y se concilia | $0 |
| Opcional | Puente extensión ↔ web (postMessage, como la 01) para que aparezca solo | $0 |
| No hace falta | Tabla nueva en Supabase, R2, Worker | — |

El CSV es el contrato: si un día se agrega sincronización automática, el
formato ya existe y la importación ya funciona.

---

## 9 · Casos borde resueltos

| Caso | Qué pasa |
| :--- | :--- |
| Se reintenta el mismo comprobante | `intentos++`; no se crea otro cobro |
| Primero falló, después salió | Pasa de `no_cobrable` a `pendiente` una sola vez |
| Se anula dos veces el mismo comprobante (imposible en el SRI) | La segunda vez no crea un consecutivo nuevo |
| El cliente no está en la cartera | Se registra por RUC; la web lo marca “no registrado” |
| Cliente exonerado | Se cambia a `exonerado`; sale del total, queda en la historia |
| Se facturó y no pagó | `facturado` sigue contando como cuenta por cobrar |
| Se anuló el cobro por error | `exonerado` con motivo; nunca se borra |
| Dos pestañas del SRI anulando a la vez | Cada una escribe su entrada; el consecutivo se toma del storage y las claves son distintas |

---

## 10 · Qué está implementado (07-nov-2026)

| Pieza | Estado |
| :--- | :--- |
| Registro en la extensión 04 (`SC_COBRO` en `content.js`) | ✅ escrito al confirmar cada anulación, idempotente por clave |
| Consecutivo + lote + período + precio | ✅ |
| Tarjeta en el popup con total, clientes y última anulación | ✅ |
| Precio editable (global) | ✅ |
| Exportación de cobros en CSV | ✅ |
| Tipos y funciones de facturación en la web (`types/annulment.ts`, `services/annulmentBilling.ts`) | ✅ `tsc --noEmit`: 0 errores |
| Pestaña en la Bóveda del cliente | ⏳ siguiente |
| Botón “volcar período a la factura” en Cobranza | ⏳ siguiente |
| Precio por cliente en Ajustes | ⏳ el storage ya lo soporta (`sc_anulacion_precios`) |

Las capturas del popup están en `docs/captura_04_cobro.png`.

---

## 11 · Segunda tanda

Precios por cliente (gratis / fijo / cupo), cupos por período, meses de cobro
predecibles, recordatorio para Cobranza y el panel listo para conectar:
[ANULACIONES_COBRO_PARTE2.md](ANULACIONES_COBRO_PARTE2.md).
