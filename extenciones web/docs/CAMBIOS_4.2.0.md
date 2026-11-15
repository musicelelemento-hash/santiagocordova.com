# Suite SC PRO 4.2.0 — notas de la versión

08-nov-2026. Cierra las fases 1 a 4 del [plan maestro](PLAN_MAESTRO.md).

---

## Flotante de la 01 (fase 1)

- **24 iconos SVG** en el HUD: se acabaron los emojis y los tamaños dispares.
- **Anillo de progreso** alrededor de ▶/⏸ (`conic-gradient` sobre `indice/total`).
- **Estado en tres líneas**: estado · cliente · `D9` y día de vencimiento.
- **Cola visual ordenada por 9.º dígito**: actual resaltado, vencimientos y
  estados (declarado / en curso / falta comprobante / sin clave).
- **Modo limpio automático**: a los 10 s sin interacción queda estado + ⏸ + 🧰 +
  Detener; cualquier movimiento lo devuelve.
- **Cajón legible**: etiquetas de 10px, dos líneas.
- **HUD minimalista**: 5 controles siempre visibles (pausa, estado, aquí, omitidos, omitir, cerrar) + **⋯** que despliega 18 herramientas en su propia fila. Stop siempre a la vista.

## Escala (fase 2)

- **Tandas de 50** con reanudación: `sc_lote_resto` + botón “Siguiente tanda”.
- **Auto-refresco** de la caché a los 30 min (y `updated_at` listo para el delta).
- **Banco de 2000**: `tools/bench/correr.ps1` → **306 ms**, 60 tarjetas.

## Bóveda (fase 3)

- **Compras por proveedor** con crédito tributario (panel + `services/purchases.ts`).
- La extensión **publica** el resumen en `tax_profile.purchase_summary`, con
  `sinCredito` leído de `Proveedores.mapaCredito`.
- **Vista del cliente**: el mes explicado sin jerga (“vendiste / compraste / te
  toca pagar”), con el comprobante a mano.

## Bucle confiable (fase 4)

- Con **saldo > 0** la extensión no envía: borrador + `por_pagar` + aviso.
- **La Bóveda muestra** esas declaraciones pendientes de revisión con período y
  monto.

## Anulaciones (tanda anterior, incluida)

- Motor v2.5, numeración `AN-…`, cobro por cliente (gratis / fijo / cupo),
  capacidad y recordatorio, línea al 0 % en la factura y marcado `facturado`.

---

## Verificación de la versión

```powershell
powershell -ExecutionPolicy Bypass -File "extenciones web\tools\verificar_todo.ps1"
powershell -ExecutionPolicy Bypass -File "extenciones web\tools\bench\correr.ps1"
```

## Pendiente conocido

- `sinCredito` no cubre el caso “el cliente sólo vende al 0 %”.
- 4.2 (HUD que se calla) necesita dueño de pestaña.
- Seguridad: rotar claves y sacar el CSV de contraseñas (tarea del usuario).
