# Contrato: compras del mes en la Bóveda

La Bóveda muestra las compras **por proveedor** con el crédito tributario
separado. Este es el contrato entre la extensión (que extrae) y la web (que
muestra).

---

## Dónde vive el dato

En `clients.tax_profile.purchase_summary` (JSONB, ya existe la columna). No hace
falta migración.

```json
{
  "purchase_summary": {
    "2026-10": [
      {
        "ruc": "0990858322001",
        "razonSocial": "DIFARE S.A.",
        "base": 646.85,
        "iva": 97.03,
        "tarifa": 15,
        "sinCredito": false,
        "numero": "001-001-000012345"
      }
    ]
  }
}
```

| Campo | Obligatorio | Qué es |
| :--- | :--- | :--- |
| `ruc` | sí | RUC del proveedor (13 dígitos) |
| `razonSocial` | no | Nombre; si falta se muestra el RUC |
| `base` | sí | Base imponible |
| `iva` | sí | IVA de la factura |
| `tarifa` | no | 15 / 5 / 0 |
| `sinCredito` | no | `true` si el contador la marcó sin derecho |
| `numero` | no | Número o clave del comprobante |

---

## Quién lo escribe

La **extensión 01**, al terminar la extracción del período (después de
`[AUDITORÍA] … Cuadra`). Debe:

1. Leer el resumen que ya arma en memoria (los mismos totales que usa para
   llenar el 500/502/507).
2. Hacer `PATCH /rest/v1/clients?ruc=eq.<RUC>` con
   `tax_profile = tax_profile_actual || { purchase_summary: { "<YYYY-MM>": [...] } }`.
3. No pisar otras claves de `tax_profile` (merge, no replace).

---

## Quién lo lee

La web, en la Bóveda del cliente:

- `components/features/PurchaseInvoicesPanel.tsx` agrupa por RUC y muestra
  base, IVA, crédito y sin derecho por proveedor.
- `services/purchases.ts` hace la agrupación (pura, sin React).
- Si el cliente no tiene `purchase_summary`, el panel **no se muestra**: no
  inventa compras.

---

## Por qué así

- **Sin migración**: `tax_profile` ya es JSONB y ya se sincroniza.
- **Sin costo extra**: son unos KB por cliente y período.
- **Idempotente**: el período es la clave; volver a declarar reemplaza ese mes.

---

## Estado

- **Hecho (08-nov)**: `publicarComprasEnLaNube()` en `04_extraccion_datos.js`.
  Al terminar la extracción guarda el arqueo **y** hace el `PATCH` con merge
  sobre `tax_profile`; el período sale de `sri_target_period`.
- **Hecho (08-nov)**: `sinCredito` por proveedor. Se lee
  `Proveedores.mapaCredito(ruc)` —la decisión del contador— y se publica junto
  con cada proveedor. El panel de la Bóveda ya lo separa en la columna
  «Crédito».
- **Falta**: la regla «solo vende al 0%» (ahí el formulario manda todo a 502,
  pero el resumen publicado sólo refleja el mapa por proveedor) y la prueba con
  un cliente real.
