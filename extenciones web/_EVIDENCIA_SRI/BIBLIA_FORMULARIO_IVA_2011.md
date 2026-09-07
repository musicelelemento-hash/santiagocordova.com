# 📖 BIBLIA DEL FORMULARIO DE IVA MENSUAL (FORMULARIO 2011)
> **Código de Obligación:** 2011 — Declaración de Impuesto al Valor Agregado (Mensual)  
> **Portal:** SRI en Línea (`sri-declaraciones-web-internet/pages/recepcion/recibirDeclaracion.jsf`)  
> **Fuente:** Evidencia real extraída directamente del DOM del SRI (Septiembre 2026).  
> **Uso:** Especificación técnica canónica para el llenado automático, validaciones y auditoría en **Nueva Luz 3.0**.

---

## 🏛️ ESTRUCTURA GENERAL DEL FORMULARIO

El formulario de IVA 2011 consta de **6 secciones principales**, organizadas en un acordeón PrimeFaces (`#frmFlujoDeclaracion`):

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. VENTAS Y OTRAS OPERACIONES (Casilleros 401 a 499 + 111/113)  │
├─────────────────────────────────────────────────────────────────┤
│ 2. COMPRAS Y ADQUISICIONES    (Casilleros 500 a 565 + 115/117)  │
├─────────────────────────────────────────────────────────────────┤
│ 3. RESUMEN IMPOSITIVO         (Casilleros 601 a 699)            │
├─────────────────────────────────────────────────────────────────┤
│ 4. DEVOLUCIÓN ISD             (Casilleros 700 a 702)            │
├─────────────────────────────────────────────────────────────────┤
│ 5. RETENCIONES EFECTUADAS     (Casilleros 721 a 801)            │
├─────────────────────────────────────────────────────────────────┤
│ 6. TOTALES CONSOLIDADOS       (Casilleros 859 a 902)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. VENTAS Y OTRAS OPERACIONES

> **Aviso oficial del SRI:** *«El valor de ventas que se muestra en Información Fiscal proviene de Facturación Electrónica, y corresponde al total de sus transacciones; distribuya este valor en los casilleros de acuerdo a su necesidad.»*

### A. Matriz de Ventas (Bruto → Neto → Impuesto Generado)

| Rótulo del SRI | Bruto | Neto (Bruto - NC) | Impuesto Generado | ID DOM Bruto | ID DOM Neto | ID DOM IVA | Regla / Comportamiento del Bot |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **Ventas tarifa 15% / plena** (excluye activos fijos) | **401** | **411** | **421** | `concepto450` | `concepto460` | `concepto470` | **Espejo automático**: 401 viene precargado por SRI; el bot copia `411 = 401 - NC`. El 421 se calcula automáticamente. |
| **Ventas activos fijos tarifa 15% / plena** | **402** | **412** | **422** | `concepto510` (H) | `concepto520` | `concepto530` | Solo si el contador declara venta de bienes de uso. |
| **Ventas tarifa 5%** (excluye activos fijos) | **425** | **435** | **445** | `concepto510` | `concepto520` | `concepto530` | Materiales de construcción / regulados al 5%. |
| **Ajuste IVA notas de crédito distinta tarifa (a pagar)** | — | **423** | — | — | `concepto550` | — | Ajuste cuando la NC tiene tarifa menor a la factura original. |
| **Ajuste IVA notas de crédito distinta tarifa (a favor)** | — | **424** | — | — | `concepto560` | — | Ajuste a favor del sujeto pasivo. |
| **Ventas tarifa 0% sin crédito tributario** | **403** | **413** | — | `concepto570` | `concepto580` | — | Ventas locales de productos tarifa 0% (alimentación básica, etc.). |
| **Ventas activos fijos tarifa 0% sin crédito** | **404** | **414** | — | `concepto610` | `concepto620` | — | Venta de maquinaria/activos con tarifa 0%. |
| **Ventas tarifa 0% con crédito tributario** | **405** | **415** | — | `concepto670` | `concepto680` | — | Exportadores o ventas que dan derecho a crédito. |
| **Ventas activos fijos tarifa 0% con crédito** | **406** | **416** | — | `concepto700` | `concepto710` | — | Activos fijos vinculados a actividades con derecho a crédito. |
| **Exportaciones de bienes** | **407** | **417** | — | `concepto790` | `concepto800` | — | Ventas al exterior de mercaderías. |
| **Exportaciones de servicios y/o derechos** | **408** | **418** | — | `concepto810` | `concepto820` | — | Servicios prestados a clientes en el exterior. |
| **TOTAL VENTAS Y OPERACIONES** | **409** | **419** | **429** | `concepto860` | `concepto870` | `concepto880` | **Solo lectura (Calculado por SRI):** `409 = Σ Brutos`, `419 = Σ Netos`, `429 = Σ IVA`. |
| **Transferencias no objeto o exentas de IVA** | **431** | **441** | — | `concepto1038` | `concepto1040` | — | Ingresos no gravados por Ley de Régimen Tributario. |
| **NC tarifa 0% por compensar próximo mes** | — | **442** | — | — | `concepto1050` | — | Excedente de notas de crédito 0%. |
| **NC tarifa diferente de cero por compensar** | — | **443** | **453** | — | `concepto1070` | `concepto1080` | Excedente de NC gravadas para compensar en futuro período. |
| **Ingresos por reembolso como intermediario** | **434** | **444** | **454** | `concepto1098` | `concepto1100` | `concepto1110` | Informativo para operadoras de transporte y agencias. |

### B. Liquidación del IVA en el Mes (Ventas)

| Casillero | Concepto | Fórmula / Origen | ID DOM | Tipo |
| :---: | :--- | :--- | :--- | :---: |
| **480** | Ventas gravadas a contado este mes | Por defecto igual a 411 si no hay ventas a crédito | `concepto1200` | Editable |
| **481** | Ventas gravadas a crédito este mes | Ventas cuyo cobro e IVA se difiere | `concepto1210` | Editable |
| **482** | Total impuesto generado | Trasládese campo 429 | `concepto1220` | Solo lectura |
| **483** | Impuesto ventas netas a liquidar meses anteriores | Ventas a crédito de períodos previos que vencen este mes | `concepto1230` | Editable |
| **484** | Impuesto a liquidar en este mes | Porción del IVA a liquidar en el período actual | `concepto1240` | Editable |
| **485** | Impuesto ventas a crédito a liquidar en próximos meses | `482 - 484` | `concepto1250` | Solo lectura |
| **486** | Mes a pagar el monto de IVA ventas a crédito | Número de meses de diferimiento | `concepto1251` | Editable |
| **487** | Tamaño COPCI | Clasificación empresarial según Código de la Producción | `concepto1252` | Solo lectura |
| **499** | **TOTAL IMPUESTO A LIQUIDAR EN ESTE MES** | **`483 + 484`** | `concepto1260` | **Solo lectura** |

### C. Contador de Comprobantes de Ventas

| Casillero | Concepto | ID DOM | Regla del Bot |
| :---: | :--- | :--- | :--- |
| **111** | Total comprobantes de venta emitidos | `concepto252` | Facturas físicas o electrónicas emitidas. |
| **113** | Total comprobantes de venta anulados | `concepto254` | Comprobantes dados de baja o anulados. |

---

## 2. COMPRAS Y ADQUISICIONES

> **Aviso oficial del SRI:** *«El valor de compras que se muestra en Información Fiscal proviene de Facturación Electrónica, y corresponde al total de sus adquisiciones; distribuya este valor en los casilleros de acuerdo a su necesidad. Recuerde verificar que estos valores sean exclusivamente de su actividad económica.»*

### A. Matriz de Compras por Tarifa y Deducibilidad

| Rótulo del SRI | Bruto | Neto (Bruto - NC) | Impuesto Generado | ID DOM Bruto | ID DOM Neto | ID DOM IVA | Regla / Comportamiento del Bot |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **Adquisiciones locales 15%** (con derecho a crédito) | **500** | **510** | **520** | `concepto1270` | `concepto1280` | `concepto1290` | **Compras operativas gravadas:** Llena `500 = Base 15%`, `510 = 500 - NC 15%`. El 520 lo calcula el SRI. |
| **Activos fijos locales 15%** (con crédito) | **501** | **511** | **521** | `concepto1390` | `concepto1400` | `concepto1410` | Maquinaria, equipos o vehículos afectos a la actividad. |
| **Adquisiciones locales tarifa 5%** (con crédito) | **540** | **550** | **560** | `concepto1271` | `concepto1281` | `concepto1800` | **Materiales de construcción (Ley 2024):** Solo si la factura es legítimamente al 5%. Si es 0.00, no llenar para evitar salto de Casillero 203. |
| **Compras gravadas sin derecho a crédito** | **502** | **512** | **522** | `concepto1470` | `concepto1480` | `concepto1818` | Gastos no deducibles o de actividades no gravadas. Pendiente mapa CIIU. |
| **Importaciones de servicios / derechos 15%** | **503** | **513** | **523** | `concepto1550` | `concepto1552` | `concepto1554` | Licencias de software en el exterior, servicios técnicos, etc. |
| **Importaciones de bienes (excluye activos fijos)** | **504** | **514** | **524** | `concepto1556` | `concepto1600` | `concepto1610` | Materias primas y mercaderías importadas. |
| **Importaciones de activos fijos 15%** | **505** | **515** | **525** | `concepto1620` | `concepto1640` | `concepto1650` | Bienes de capital importados. |
| **Ajuste IVA NC compras distinta tarifa (+ crédito)** | — | **526** | — | — | `concepto1660` | — | Ajuste en positivo al crédito tributario. |
| **Ajuste IVA NC compras distinta tarifa (- crédito)** | — | **527** | — | — | `concepto1700` | — | Ajuste en negativo al crédito tributario. |
| **Importaciones de bienes tarifa 0%** | **506** | **516** | — | `concepto1710` | `concepto1715` | — | Bienes importados con arancel/IVA 0%. |
| **Adquisiciones locales tarifa 0%** | **507** | **517** | — | `concepto1720` | `concepto1730` | — | **Compras con IVA 0%:** Llena `507 = Base 0%`, `517 = 507 - NC 0%`. |
| **Compras a Negocios Populares (RIMPE)** | **508** | **518** | — | `concepto1735` | `concepto1740` | — | **Notas de venta físicas:** Controlado por interruptor `NotasDeVenta` (pregunta al contador). |
| **TOTAL ADQUISICIONES Y PAGOS** | **509** | **519** | **529** | `concepto1780` | `concepto1790` | `concepto1800` | **Solo lectura (Calculado por SRI):** Sumatoria de todas las compras brutas, netas e IVA. |
| **Adquisiciones no objeto de IVA** | **531** | **541** | — | `concepto1820` | `concepto1823` | — | Pagos fuera del ámbito del IVA (tasas, multas, peajes). |
| **Adquisiciones exentas de IVA** | **532** | **542** | — | `concepto1825` | `concepto1830` | — | Pagos legalmente exonerados. |
| **NC tarifa 0% por compensar próximo mes** | — | **543** | — | — | `concepto1900` | — | Excedente de notas de crédito recibidas al 0% (`NC0 > Base0`). |
| **NC tarifa 15% por compensar próximo mes** | — | **544** | **554** | — | `concepto1890` | `concepto1910` | Excedente de notas de crédito recibidas al 15% (`NC15 > Base15`). |
| **Pagos netos por reembolso como intermediario** | **535** | **545** | **555** | `concepto1978` | `concepto1980` | `concepto1990` | Informativo de reembolsos de gastos. |

### B. Proporcionalidad y Crédito Tributario

| Casillero | Concepto | Fórmula Oficial del SRI | ID DOM | Regla del Bot |
| :---: | :--- | :--- | :--- | :--- |
| **563** | **Factor de proporcionalidad** | `(411 + 412 + 420 + 435 + 415 + 416 + 417 + 418) / 419` | `concepto2110` | **Automático del SRI:** Da `1.0000` si todas las ventas gravadas dan derecho a crédito. |
| **564** | **Crédito tributario aplicable en el período** | `(520+521+534+560+523+524+525+526-527) x 563` | `concepto2130` | **Sugerido Oficial SRI:** El bot toma el valor sugerido de `concepto2130.sugerido` (ej. $647.60). |
| **565** | **IVA no considerado crédito tributario** | IVA de compras que pasa al costo/gasto por factor | `concepto1276` | **Sugerido Oficial SRI:** El bot toma `concepto1276.sugerido` (suele ser 0.00). |

### C. Contador de Comprobantes de Compras

| Casillero | Concepto | ID DOM | Regla del Bot |
| :---: | :--- | :--- | :--- |
| **115** | Total comprobantes de venta recibidos | `concepto256` | **Total facturas recibidas:** Cuenta física + electrónica (ej. `157`). |
| **117** | Total notas de venta recibidas | `concepto258` | Notas de venta RIMPE de negocios populares. |
| **119** | Total liquidaciones de compra emitidas | `concepto260` | Liquidaciones emitidas por compras a no domiciliados / artesanos. |

---

## 3. RESUMEN IMPOSITIVO (DETERMINACIÓN DEL IMPUESTO)

| Casillero | Concepto | Fórmula / Lógica | ID DOM | Regla del Bot |
| :---: | :--- | :--- | :--- | :--- |
| **601** | **Impuesto causado** | Si `(499 - 564) > 0` | `concepto2140` | **Calculado SRI:** IVA Ventas > Crédito Compras. |
| **602** | **Crédito tributario aplicable del período** | Si `(499 - 564) < 0` | `concepto2150` | **Calculado SRI:** Crédito generado a favor del cliente en este mes. |
| **603** | (-) Compensación IVA medios electrónicos / adultos mayores | Devoluciones de IVA | `concepto2515` | Valor acreditado en el mes. |
| **605** | (-) Saldo crédito tributario mes anterior (adquisiciones) | Trasládese campo 615 mes previo | `concepto2160` | **Arrastre contable:** Se traslada del período previo. |
| **606** | (-) Saldo crédito tributario mes anterior (retenciones) | Trasládese campo 617 mes previo | `concepto2170` | **Arrastre contable:** Retenciones no compensadas que vienen de atrás. |
| **607** | (-) Saldo crédito mes anterior medios electrónicos | Trasládese campo 618 mes previo | `concepto2520` | Saldos arrastrados. |
| **608** | (-) Saldo crédito mes anterior zonas afectadas | Trasládese campo 619 mes previo | `concepto2525` | Ley de solidaridad / sentencias. |
| **609** | **(-) Retenciones en la fuente de IVA efectuadas en este período** | Retenciones recibidas de clientes | `concepto2200` | **Extraído del módulo de Retenciones:** Llena el total de retenciones IVA (ej. $144.01). |
| **610** | (+) Ajuste por IVA devuelto/descontado medios electrónicos | Reversión de beneficios | `concepto2530` | Ajuste en contra del crédito. |
| **612** | (+) Ajuste por IVA devuelto e IVA rechazado (adquisiciones) | Resoluciones administrativas SRI | `concepto2540` | Ajuste al crédito de adquisiciones. |
| **613** | (+) Ajuste por IVA devuelto e IVA rechazado (retenciones) | Resoluciones administrativas SRI | `concepto2555` | Ajuste al crédito de retenciones. |
| **614** | (+) Ajuste por IVA devuelto instituciones públicas | Entidades del sector público | `concepto2570` | Ajuste oficial. |
| **615** | **Saldo crédito tributario para el próximo mes (adquisiciones)** | **Valor Sugerido SRI** | `concepto2220` | **Sugerido Oficial SRI:** Se aplica el sugerido positivo (ej. $2.523,55). |
| **617** | **Saldo crédito tributario para el próximo mes (retenciones)** | **Valor Sugerido SRI** | `concepto2230` | **Sugerido Oficial SRI:** Se aplica el sugerido positivo (ej. $2.082,82). |
| **618** | Saldo crédito próximo mes medios electrónicos | Calculado | `concepto2580` | Saldo para el período siguiente. |
| **619** | Saldo crédito próximo mes zonas afectadas | Calculado | `concepto2590` | Saldo para el período siguiente. |
| **620** | **SUBTOTAL A PAGAR** | Si fórmula `Σ créditos < Σ débitos` | `concepto2260` | **Freno del Bot:** Si `620 > 0`, el bot guarda borrador y NO envía solo. |
| **699** | **TOTAL IMPUESTO A PAGAR POR PERCEPCIÓN** | `620 + 621` | `concepto2270` | **Solo lectura:** Impuesto neto a cancelar por ventas. |

---

## 4. AGENTE DE RETENCIÓN DE IVA (RETENCIONES EFECTUADAS)

> **Regla:** Esta sección solo se llena si el contribuyente está calificado como **Agente de Retención** por el SRI y emitió comprobantes de retención en sus compras.

| Casillero | Concepto | ID DOM | Tarifa Retenida |
| :---: | :--- | :--- | :---: |
| **721** | Retención del 10% | `concepto2602` | 10% IVA en bienes |
| **723** | Retención del 20% | `concepto2603` | 20% IVA en servicios específicos |
| **725** | Retención del 30% | `concepto2604` | 30% IVA en adquisición de bienes |
| **727** | Retención del 50% | `concepto2605` | 50% IVA exportadores |
| **729** | Retención del 70% | `concepto2606` | 70% IVA en prestación de servicios |
| **731** | Retención del 100% | `concepto2607` | 100% IVA honorarios profesionales / liquidaciones |
| **799** | **TOTAL IMPUESTO RETENIDO** | `concepto2610` | **`Σ (721 a 731)` (Solo lectura)** |
| **800** | Devolución provisional mediante compensación | `concepto2620` | Compensación autorizada |
| **801** | **TOTAL IMPUESTO A PAGAR POR RETENCIÓN** | `concepto2640` | **`799 - 800 - 802` (Solo lectura)** |

---

## 5. TOTALES Y VALORES A PAGAR

| Casillero | Concepto | Fórmula | ID DOM | Regla de Oro del Cierre Mágico |
| :---: | :--- | :--- | :--- | :--- |
| **859** | **TOTAL CONSOLIDADO DE IVA** | `699 + 801` | `concepto2860` | Suma de percepción + retenciones efectuadas. |
| **898** | (-) Imputación al pago en declaraciones sustitutivas | Pago previo en declaración original | `concepto2950` | En sustitutivas, el valor ya pagado. |
| **902** | **TOTAL IMPUESTO A PAGAR** | **`859 - 898`** | `concepto2960` | **Si `902 === 0.00`:** El bot envía automáticamente la declaración limpia y genera el CEP.<br>**Si `902 > 0.00`:** El bot guarda borrador, frena y marca `saldo_a_pagar` para decisión del contador. |

---

## 6. EL CASILLERO 203 Y SUS DESPLEGABLES (TARIFAS REDUCIDAS)

### Evidencia Confirmada
- **ID en el DOM:** `concepto91` (Widget Select PrimeFaces).
- **Opciones:** 17 opciones en total.
- **Contenido real:** Las 16 opciones con decreto corresponden exclusivamente a **Tarifa Reducida al 8% para Servicios Turísticos en Feriados** (Decretos Ejecutivos 339, 644, 190, 259, 429, 482, 542, 594, 179, 196, 271, 304, 348, 368, 391, 465).
- **Ninguna opción corresponde a la Ley de Materiales de Construcción (5%).**

### Regla Técnica de Blindaje
1. Si un contribuyente no tiene actividades turísticas registradas, **el Casillero 203 debe permanecer intacto en su opción por defecto (`[0]`)**.
2. Para evitar que el validador JSF del SRI exija el Casillero 203, **el Casillero 540 / 550 NUNCA debe llenarse por falsos positivos de redondeo** (facturas de centavos donde la holgura hacía confundir 15% con 5%).
3. Si el casillero 540 legítimamente contiene compras al 5% de construcción, el formulario se llena pero se detiene en borrador si el validador del SRI reclama el decreto, alertando al contador para que verifique si el SRI exige un decreto o si se debe clasificar al casillero 500.

---

## 7. MATRIZ RÁPIDA DE EQUIVALENCIAS TÉCNICAS (FIELD MAP RESUMIDO)

```javascript
const SRI_FIELD_MAP = {
    // Ventas
    '401': 'concepto450',  '411': 'concepto460',  '421': 'concepto470',
    '403': 'concepto570',  '413': 'concepto580',  '425': 'concepto510',
    '431': 'concepto1038', '434': 'concepto1098', '499': 'concepto1260',
    '111': 'concepto252',  '113': 'concepto254',

    // Compras
    '500': 'concepto1270', '510': 'concepto1280', '520': 'concepto1290',
    '540': 'concepto1271', '550': 'concepto1281', '560': 'concepto1800',
    '507': 'concepto1720', '517': 'concepto1730', '508': 'concepto1735',
    '518': 'concepto1740', '543': 'concepto1900', '544': 'concepto1890',
    '563': 'concepto2110', '564': 'concepto2130', '565': 'concepto1276',
    '115': 'concepto256',  '117': 'concepto258',  '119': 'concepto260',

    // Resumen Impositivo
    '601': 'concepto2140', '602': 'concepto2150', '609': 'concepto2200',
    '605': 'concepto2160', '606': 'concepto2170', '615': 'concepto2220',
    '617': 'concepto2230', '619': 'concepto2940', '620': 'concepto2260',
    '699': 'concepto2270',

    // Totales
    '859': 'concepto2860', '898': 'concepto2950', '902': 'concepto2960',

    // Desplegable Decreto Tarifa Reducida
    '203': 'concepto91'
};
```
