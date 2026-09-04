# 🏦 Bóveda del cliente — proyección del Impuesto a la Renta

> **Objetivo registrado.** 04-sep-2026.
> Que cada declaración de IVA que el bucle procesa deposite sus valores en una
> bóveda por cliente, para que al cierre del año la proyección del Impuesto a la
> Renta salga sola, sin volver a entrar al portal ni rehacer el trabajo.

---

## Por qué vale la pena

Hoy el bot entra al SRI, extrae todo, declara el IVA y **tira los números**.
Solo quedan dentro del `proof_file` de esa declaración puntual.

Pero esos mismos números son, mes a mes, exactamente los insumos de la
declaración de Renta anual. Doce corridas del bucle ya contienen el año fiscal
completo. **La información ya se está pagando; falta cobrarla.**

## Lo que ya se captura (no hay que extraer nada nuevo)

`syncDeclarationToSupabase()` en [01_utilidades_y_pdf.js](src/01_utilidades_y_pdf.js)
ya arma este bloque por cada declaración:

| Campo hoy | Qué es | Para qué sirve en Renta |
| :--- | :--- | :--- |
| `ventas15`, `ventas0` | Base imponible de ventas | **Ingresos gravados del ejercicio** |
| `montoIvaVentas` | IVA en ventas | (control, no entra a Renta) |
| `compras15`, `compras0` | Base imponible de compras | **Costos y gastos deducibles** |
| `retRenta` | Retenciones en la fuente de Renta | **Crédito tributario contra el impuesto anual** |
| `retIva` | Retenciones de IVA | (control) |
| `nc15`, `nc0`, `ncTotal` | Notas de crédito | **Deducciones de ingresos** |

**`retRenta` es la joya.** Es plata que al cliente ya le retuvieron y que se
descuenta del impuesto anual. Si no se acumula, se pierde de vista y el cliente
paga de más.

## Lo que falta

### Fase 1 · Depositar (lo mínimo que da valor)

Una tabla `boveda_cliente`, una fila por cliente y periodo:

```
ruc · periodo · ventas15 · ventas0 · compras15 · compras0 ·
retRenta · retIva · ncTotal · origen · fecha
```

El bucle ya pasa por el punto exacto donde escribir: el mismo lugar donde hoy
hace el `upsert` de la declaración. Es un segundo `upsert`, no una extracción
nueva.

**Clave primaria `ruc + periodo`**, para que una declaración sustitutiva
sobrescriba en vez de duplicar.

### Fase 2 · Acumular y proyectar

Con doce filas, la app web arma:

```
Ingresos del año        =  Σ (ventas15 + ventas0) − Σ ncTotal
Gastos deducibles       =  Σ (compras15 + compras0)
Base imponible estimada =  Ingresos − Gastos
Impuesto según tabla    =  tabla progresiva del ejercicio
Menos: Σ retRenta       =  crédito ya retenido
─────────────────────────────────────────────
Saldo estimado a pagar (o a favor)
```

### Fase 3 · Avisar a tiempo

Lo que de verdad cambia el negocio: que en **septiembre** el sistema diga
*«a este cliente le va a salir a pagar, conviene revisar gastos deducibles»*, y
no descubrirlo en marzo cuando ya no hay nada que hacer.

## 🛑 Reglas que no se tocan

1. **Es una proyección, no una declaración.** Todo lo que salga de acá se
   rotula como estimado. El bot nunca presenta un Formulario 102.
2. **Los meses que faltan se dicen.** Una proyección con 7 de 12 meses debe
   mostrar «faltan 5 meses», no fingir un año completo.
3. **Cada valor dice de dónde salió.** Igual que el laboratorio de proveedores:
   si vino de la declaración de agosto, se puede rastrear hasta ese comprobante.
4. **No se recalcula lo ya declarado.** La bóveda copia lo que se declaró; si
   algo estaba mal, se corrige con una sustitutiva, no editando la bóveda.
5. **Coste cero adicional en R2.** La bóveda son filas en la base, no archivos.
   Ver [REGLAS_COSTOS_Y_LABORATORIO.md](REGLAS_COSTOS_Y_LABORATORIO.md).

## Relación con el resto

- Se apoya en el mismo `sc_declaraciones_locales` que ya evita redeclarar.
- Comparte insumo con el **laboratorio de proveedores**: la clasificación de
  gasto deducible vs. personal es justamente lo que afina la Fase 2.
- No depende de la subida del PDF: los números viajan aunque el comprobante
  falle.
