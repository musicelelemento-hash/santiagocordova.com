# Informe: cómo se llena el Formulario 104 (IVA) — con foco en COMPRAS y su clasificación

> **Fecha**: 04-nov-2026 · **Alcance**: declaración mensual de IVA (Formulario 104,
> obligación «2011 DECLARACION DE IVA») del portal SRI en línea.
> **Para quién**: el contador del estudio y quien tenga que tocar el llenado.
> **Regla que gobierna todo el documento**: cuando algo depende de criterio
> contable o legal, el bot **junta los datos y los muestra; no decide**. La
> declaración lleva la firma del contador, no la del software.

**Fuentes, en orden de autoridad para este proyecto**:

1. `BIBLIA_FORMULARIO_IVA_2011.md` — armada con **capturas y escrituras reales**
   del formulario del SRI (tabla de casilleros e `id` del DOM).
2. **Instructivo oficial del Formulario 104** del SRI (PDF, 20 páginas) —
   descargado y leído para este informe. Es la fuente de los textos legales de
   cada casillero.
3. **Art. 66 de la LRTI** (PDF oficial, texto completo) — el artículo que decide
   qué compra da crédito tributario.
4. `.agents/AGENTS.md` §0b.1, §9a, §9b, §12 — lo que este proyecto ya aprendió
   a golpes, con la evidencia de cada caso.
5. El código (`src/04`, `src/05`, `src/07`) — lo que el bot hace hoy.

> Si la Biblia y el instructivo se contradicen, **manda la pantalla real** (la
> Biblia): el instructivo describe el formulario de 2017 y el portal de 2026
> cambió rótulos, `id`s y algunas tarifas. Las diferencias están anotadas en la §8.

---

## 0. Resumen ejecutivo

1. **La sección de compras no es una lista de gastos: es una matriz de tres
   ejes.** Cada compra tiene (a) una **tarifa** (15% / 5% / 0% / no objeto), (b)
   un **destino** (con derecho o sin derecho a crédito) y (c) un **origen**
   (local, importación, activo fijo). El casillero sale de cruzar los tres.
2. **El crédito no es una propiedad del proveedor.** El Art. 66 lo ata a que la
   compra se destine a la producción o comercialización de bienes o servicios
   **gravados**. La misma ferretería es insumo para un maestro de obra y gasto
   personal para una odontóloga. Por eso la clasificación es por
   **proveedor × cliente**.
3. **Quien vende sólo al 0% no tiene derecho a crédito por nada.** Lo dice el
   Art. 66 con todas las letras. Es un interruptor por contribuyente y resuelve
   todas sus facturas de una vez.
4. **El 502 no es el basurero de lo dudoso.** Mandar al 502 lo que sí daba
   crédito le quita plata al contribuyente; dejar en el 500 lo que no daba
   derecho lo hace pagar de menos. Las dos cosas son caras y ninguna avisa.
5. **La aritmética de las facturas mezcladas no se adivina: se calcula.** Si una
   factura tiene parte al 15% y parte al 0%, el IVA cobrado sólo pudo salir de la
   parte gravada (`base 15% = IVA / 0,15`). Y si el reparto no cierra, se frena.

---

## 1. El marco legal, en una página

### 1.1 Art. 66 LRTI — el texto que decide (literal, con la tarifa de hoy)

> «Los sujetos pasivos del IVA que se dediquen a: la producción o
> comercialización de bienes para el mercado interno gravados […], a la
> prestación de servicios gravados […], […] o a la exportación de bienes y
> servicios, **tendrán derecho al crédito tributario por la totalidad del IVA
> pagado** en las adquisiciones locales o importaciones de los bienes que pasen
> a formar parte de su activo fijo; o de los bienes, de las materias primas o
> insumos y de los servicios **necesarios para la producción y comercialización
> de dichos bienes y servicios**».

> «Los sujetos pasivos […] que en parte estén gravados con tarifa cero y en
> parte con tarifa distinta de cero tendrán derecho a un crédito tributario
> proporcional» — la proporción se establece relacionando las **ventas
> gravadas** (+ exportaciones) con el **total de las ventas**.

> «Si estos sujetos pasivos mantienen sistemas contables que permitan
> diferenciar, inequívocamente, las adquisiciones […] empleados **exclusivamente**
> en la producción […] gravada […] podrán […] utilizar la totalidad del IVA
> pagado».

> «**No tienen derecho a crédito tributario** por el IVA pagado, en las
> adquisiciones locales e importaciones de bienes o utilización de servicios
> realizados por los sujetos pasivos que produzcan o vendan bienes o presten
> servicios **gravados en su totalidad con tarifa cero**, ni en las adquisiciones
> o importaciones de activos fijos de los sujetos que […] [vendan] en su
> totalidad con tarifa cero».

> «En general, para tener derecho al crédito tributario **el valor del impuesto
> deberá constar por separado** en los respectivos comprobantes de venta […]
> Y: «se tendrá derecho a crédito tributario […] siempre que tales bienes y
> servicios **se destinen a la producción y comercialización de otros bienes y
> servicios gravados**».

### 1.2 Lo que eso significa en la práctica: cinco requisitos

| # | Requisito | Dónde vive en el formulario |
| :-: | :--- | :--- |
| 1 | **Comprobante válido**, electrónico o físico, a nombre del RUC del contribuyente y con el **IVA desglosado** | No es un casillero: es un requisito de existencia |
| 2 | **Tarifa distinta de 0%** (si es 0% no hay IVA que acreditar) | 507/517 (0%) vs 500/510/540/550 |
| 3 | **Destino**: la compra alimenta la actividad **gravada** del contribuyente | 500/510 con crédito vs 502/512 sin derecho |
| 4 | **El contribuyente no vende sólo al 0%**; si vende mixto, aplica el factor de proporcionalidad | 563 / 564 |
| 5 | **No es activo fijo** (si lo es, tiene sus propios casilleros) | 501/511/521 |

### 1.3 Reglamento (RALRTI) e instructivo

- **Arts. 153 y 157 RALRTI**: desarrollo del crédito tributario y del
  tratamiento de las adquisiciones que no lo generan. El instructivo del 104 los
  cita **casillero por casillero** (500/501 y 502).
- **Instructivo del Formulario 104**: es la guía operativa del SRI. Describe cada
  casillero, su fórmula y los ejemplos numéricos de arrastre de notas de crédito.

---

## 2. Anatomía del Formulario 104

| Sección | Qué contiene | Casilleros que importan |
| :--- | :--- | :--- |
| **1. Ventas y otras operaciones** | Ventas por tarifa, activo fijo, exportaciones, notas de crédito, ICE | 401–419, 411/412 (netas gravadas), 403/404 (0% sin derecho), 405/406 (0% con derecho), 429 (IVA generado), 415–418 (exportaciones y turismo) |
| **2. Compras y adquisiciones** | **La matriz de la §3** | 500–509, 510–519, 520–529, 540/550/560, 507/517, 508/518, 531/532, 543/544/554, 526/527 |
| **3. Resumen impositivo** | Crédito, saldos, retenciones, impuesto a pagar | 563, 564, 565, 601, 602, 605, 606, 609, 615, 617, 619 |
| **4. Agentes de percepción / retención** | Solo si aplica | 721–731 |
| **5. Datos informativos** | Establecimientos, obligaciones | No afecta el cálculo |

La **numeración de las filas** del formulario es la que manda para escribir: el
bot localiza cada campo por el **número que aparece en la celda** (y por la
geometría de la fila), no por un `id` supuesto. Ver §5 y §7.

---

## 3. COMPRAS: la matriz completa

### 3.1 La lógica del bloque, en una línea

```
BRUTO (base imponible)  →  NETO (bruto − notas de crédito)  →  IMPUESTO (IVA)
   500 / 501 / 502            510 / 511 / 512                   520 / 521 / 522
   540 / 541 / …              550 / …                           560
   507 / 531 / 532            517 / 541 / 542                   —
```

El ejemplo del instructivo oficial (mes 1) lo deja claro: con adquisiciones de
$5.000 al 12% y notas de crédito de $10.000, el formulario queda `500 = 5.000`,
`510 = 0` (nada que compensar, el neto no puede ser negativo) y `544/554 = 5.000/800`
(el excedente pasa al mes siguiente). **El neto nunca es negativo: el excedente
va a los casilleros de «por compensar».**

### 3.2 Tabla maestra

> **Estado**: ✅ = el bot lo escribe · 📖 = referencia (no lo escribe) ·
> ⚠️ = escrito pero con una limitación conocida.
> Los `id` son los de la Biblia (capturas reales). «Por número» = el bot buscó
> el campo por el número de la fila, sin depender del `id`.

| Rótulo del SRI | Bruto | Neto | IVA | `id` (Biblia) | Qué va | Estado |
| :--- | :-: | :-: | :-: | :--- | :--- | :-: |
| **Adquisiciones locales 15% con derecho a crédito** | **500** | **510** | **520** | `concepto1270` / `1280` / `1290` | Base de facturas locales al 15% (12/13/14/15 según el período) que **sí** dan crédito. Neto = 500 − NC del 15%. | ✅ |
| **Activos fijos locales 15%** | **501** | **511** | **521** | `concepto1390` / `1400` / `1410` | Maquinaria, equipos, vehículos afectos a la actividad. | 📖 |
| **Adquisiciones locales 5% con derecho** | **540** | **550** | **560** | `concepto1261` / `1262` / `1263` | Materiales de construcción y servicios con tarifa reducida. Exige el **203** (decreto). | ✅ (⛔ 203) |
| **Otras adquisiciones gravadas SIN derecho a crédito** | **502** | **512** | **522** | `concepto1470` / `1550` / `1480` | Lo que el **contador** marcó sin derecho, y **todo** lo gravado si el contribuyente vende sólo al 0%. | ✅ desde 04-nov-2026 |
| **Importaciones de servicios / derechos 15%** | **503** | **513** | **523** | `concepto1552` / `1554` / `1556` | Servicios del exterior: exige **liquidación de compra** y **retención del 100% del IVA**. | 📖 |
| **Importaciones de bienes (no activo fijo)** | **504** | **514** | **524** | `concepto1600` / `1610` / `1620` | Valor en aduana + ICE + aranceles + tasas. | 📖 |
| **Importaciones de activos fijos 15%** | **505** | **515** | **525** | `concepto1640` / `1650` / `1660` | Bienes de capital importados. | 📖 |
| **Importaciones de bienes 0%** | **506** | **516** | — | `concepto1700` / `1710` | Importaciones con IVA 0%. | 📖 |
| **Adquisiciones locales 0%** | **507** | **517** | — | `concepto1720` / `1730` | Bienes y servicios al 0% (canasta básica, medicinas, etc.). Neto = 507 − NC del 0%. | ✅ |
| **Compras a RISE / RIMPE Negocio Popular** | **508** | **518** | — | `concepto1735` / `1740` | **Notas de venta** de negocios populares. El IVA va incluido en el total y **no genera crédito**. | ✅ (pregunta) |
| **TOTAL adquisiciones y pagos** | **509** | **519** | **529** | `concepto1780` / `1790` / `1800` | Sumatoria. **Solo lectura: lo calcula el SRI.** | 📖 |
| **Adquisiciones no objeto de IVA** | **531** | **541** | — | `concepto1820` / `1823` | Fuera del ámbito del IVA: tasas, multas, peajes, transferencia de inmuebles. | 📖 |
| **Adquisiciones exentas de IVA** | **532** | **542** | — | `concepto1825` / `1830` | Exoneradas por ley (discapacidad, COPCI, etc.). | 📖 |
| **NC 0% por compensar próximo mes** | — | **543** | — | `concepto1900` | Excedente de NC al 0% (`NC0 > base0`). | ✅ |
| **NC 15% por compensar próximo mes** | — | **544** | **554** | `concepto1890` / `1910` | Excedente de NC al 15%. **El IVA del excedente va en 554.** | ⚠️ base sí, IVA no |
| **Ajuste por NC de distinta tarifa (+ crédito)** | — | **526** | — | `concepto2860` | Ajuste en positivo cuando la NC va con **menor** tarifa. | 📖 |
| **Ajuste por NC de distinta tarifa (− crédito)** | — | **527** | — | `concepto2865` | Ajuste en negativo cuando la NC va con **mayor** tarifa. | 📖 |
| **Reembolsos de gastos del intermediario** | **535** | **545** | **555** | `concepto1978` / `1980` / `1990` | Informativo. No entra al crédito. | 📖 |
| **Contador de comprobantes** | **115** | — | — | `concepto256` | Cantidad de comprobantes recibidos en el período. | ✅ |
| **Contador de notas de venta** | **117** | — | — | `concepto258` | Cantidad de notas de venta recibidas. | ✅ |
| **Liquidaciones de compra emitidas** | **119** | — | — | `concepto260` | Cantidad. | 📖 |

### 3.3 Los cuatro casilleros que más plata mueven

**`500` vs `502` — el mismo dinero, dos destinos.** Si una factura de $100 + $15
de IVA se declara en el 500/510, el contribuyente se acredita **$15**. Si va al
502/512, se acredita **$0** y esos $15 son costo. No es un detalle de forma: es
la diferencia entre pagar $15 menos o $15 más.

**`540/550/560` — el 5%.** Hasta el 05-sep-2026 el bot metía el 5% dentro del
500. Como el SRI calcula el 520 a partir del 510, $1.000 al 5% declarados como
15% le daban **$150 de crédito donde correspondían $50**. El contribuyente
pagaba de menos, con la firma del contador. Hoy el 5% tiene sus casilleros.

**`507/517` — el 0%.** No hay IVA que acreditar; lo que importa es que la base
quede declarada (se cruza contra el ATS del proveedor).

**`544/554` — el excedente de notas de crédito.** Cuando las NC del período
superan las compras, la diferencia no se pierde: se arrastra al mes siguiente. La
**base** va al 544 y el **IVA** al 554.

### 3.4 Notas de crédito, notas de débito y liquidaciones

- **NC recibidas (tipo 04)**: reducen base **y** IVA en el período en que se
  reciben. El bot las resta del bruto de su tarifa (`510 = 500 − NC15`,
  `517 = 507 − NC0`, `550 = 540 − NC5`). Si la NC excede, el saldo va a 543/544.
- **ND recibidas (tipo 05)**: **incrementan** el bruto del tipo de compra. Es el
  único tipo que este proyecto todavía no barre (AGENTS §8a).
- **Liquidaciones de compra (tipo 03)**: sustentan crédito **sólo si se retuvo y
  depositó el 100% del IVA** (caso típico: servicios del exterior, 503/513/523).
- **Comprobantes de retención (tipo 07)**: no son compras; van al 609 y a la
  declaración de retenciones.

---

## 4. La clasificación: qué hace que una compra pierda el crédito

### 4.1 El dato que decide no es el proveedor: es el destino

El Art. 66 no dice «tal proveedor da crédito». Dice que el IVA se acredita
**cuando la compra se destina a producir o vender algo gravado**. De ahí salen
tres preguntas, y las tres tienen que poder contestarse:

| # | Pregunta | De dónde sale el dato | ¿Quién decide? |
| :-: | :--- | :--- | :--- |
| 1 | ¿A qué tarifa facturó? | Cociente IVA/base de cada comprobante | El bot (aritmética) |
| 2 | ¿A qué se dedica el proveedor? | Catastro del SRI (CIIU) | El bot sugiere, no decide |
| 3 | ¿A qué se dedica **el cliente** y esa compra alimenta esa actividad? | RUC del contribuyente + criterio | **El contador** |

### 4.2 Las cuatro razones que quitan el crédito (criterio del contador, 10-sep-2026)

| # | Razón | Dato que hace falta | Estado hoy |
| :-: | :--- | :--- | :--- |
| 1 | **Gasto personal o del hogar**, no relacionado con la actividad (víveres de la casa, luz del domicilio, ropa, ocio). | proveedor × cliente | **Se marca a mano en 🏷️**, por cliente. Es caso por caso. |
| 2 | **Comprobante inválido o a nombre de un tercero** (recibos informales, notas de remisión, factura al cónyuge). | que sea electrónico y al RUC del cliente | Resuelto de hecho: el bot sólo baja «comprobantes electrónicos recibidos»; los físicos son 508/518. |
| 3 | **Compra con tarifa 0%**: no hay IVA que acreditar. | la tarifa | Resuelto: 507/517. |
| 4 | **El cliente vende EXCLUSIVAMENTE al 0%** (salud, educación, transporte). Ninguna compra gravada le da crédito: ese IVA es costo. | un flag por cliente | **`CreditoCliente.soloCero`** (04-nov-2026), interruptor en 🏷️. |

### 4.3 La tabla de decisión que usa el bot

```
factura recibida
  ├─ tarifa 0%               → 507/517                       (no hay crédito que discutir)
  ├─ tarifa 5%               → 540/550      (con derecho)  ·  502/512 (sin derecho)
  ├─ tarifa 15% (12/13/14)   → 500/510      (con derecho)  ·  502/512 (sin derecho)
  └─ sin tarifa reconocible  → se reparte por aritmética; si no cierra, FRENA
```

Y la regla que gobierna el «sin derecho»:

> **Sólo se aparta lo que alguien decidió.** `null` (nadie lo dijo) **no** es
> «no da crédito». Esa compra va donde iba siempre. Mandarla al 502 por las
> dudas le quita al contribuyente un crédito que quizá le corresponde.

### 4.4 El caso masivo: «vende sólo al 0%»

Es la razón #4 y la que más plata mueve de una sola vez. Con
`CreditoCliente.soloCero = true`, **todas** las compras gravadas del
contribuyente van al 502/512, sin importar el proveedor. El Art. 66 lo dice
literalmente («no tienen derecho a crédito […] los que […] presten servicios
gravados en su totalidad con tarifa cero»).

**No se deduce del CIIU**: el catastro dice a qué se dedica alguien, no si su
facturación es 0%. Ponerlo solo sería inventar un dato que se lleva el crédito de
todo un período. Lo afirma el contador.

### 4.5 Facturas mezcladas: aritmética, no adivinanza

En un supermercado se compra comida (0%) y limpieza (15%) en el mismo ticket. Si
la factura sólo tiene ítems al 15% y al 0%, el IVA cobrado sólo pudo salir de la
parte gravada:

```
base al 15% = IVA / 0,15
base al 0%  = base total − base al 15%
```

Ejemplo real: base $61,00 con IVA $1,83 → **$12,20 al 15% + $48,80 al 0%**.
Antes se declaraban los $61 enteros al 15%, inflando el crédito.

**Cuándo NO se puede calcular y hay que frenar:**

- El reparto no cabe (hay una tercera tarifa de por medio, o el IVA es mayor al
  que la base admite).
- El reparto cabe **de dos maneras**: si el emisor también factura al 5%, la
  misma factura puede ser $12,20 al 15% o $36,60 al 5%. Eso lo decide el XML del
  comprobante (que dice la tarifa línea por línea), no el cociente.

### 4.6 Proporcionalidad (vende gravado **y** 0%)

- **563 Factor de proporcionalidad** = (ventas gravadas + exportaciones + ventas
  0% que dan derecho) / **total de ventas**. El instructivo 2017 lo escribe
  `(411+412+415+416+417+418)/419`; el formulario real de este proyecto usa
  `(411+412+420+435+415+416+417+418)/419`. **El portal lo calcula solo**: el bot
  no lo inventa.
- **564 Crédito tributario aplicable** = crédito del período × factor (o el
  criterio contable del contribuyente). El bot respeta el **valor sugerido** del
  SRI; si no hay sugerido, aplica su refuerzo técnico.
- **565 IVA no considerado crédito** (el que se va a costo por el factor). También
  se toma del sugerido.
- **Regla**: un cero sugerido por el SRI se respeta. Pisarlo es declarar de más.

---

## 5. Cómo lo implementa Nueva Luz 3.0

### 5.1 El recorrido del dato

```
comprobantes recibidos (tabla o TXT oficial)
   └─ 04_extraccion_datos.js
        clasificarTarifaIva(base, iva)         → 0 / 5 / plena / null
        calcularResumen()                      → baldes iva0 / iva5 / iva15
                                                 + detalle15 / detalle5 (emisor, base, IVA)
        resolverAmbiguasConXml()               → la tarifa DICHA por el XML
        registrarLote()                        → base de proveedores (tarifas, actividad)
   └─ 05_llenado_formulario.js
        repartirComprasPorCredito()            → lee sc_proveedores + sc_credito_cliente
        repartirCreditoCompras()   (pura)      → con derecho vs sin derecho, al centavo
        llenarCompras()                        → escribe 500/510 · 502/512 · 540/550 · 507/517
        anotarIvaSinUbicar()                   → lo que no encontró casillero → frena el envío
   └─ 06_panel_interfaz.js
        ejecutarCierreMagico()                 → frenarSiHayIvaSinUbicar() antes de enviar
```

### 5.2 Qué escribe el bot, y con qué criterio

| Casillero | De dónde sale el número | Qué pasa si el campo no aparece |
| :--- | :--- | :--- |
| 115 | `totalFacturas` | sigue (informativo) |
| 500 | `iva15.baseImponible − sin derecho` | sigue |
| 510 | `500 − NC15` (nunca negativo) | sigue |
| 544 | `NC15 − 500` si es positivo | sigue |
| 502 | suma de lo marcado sin derecho (15% + 5%) | **anota y FRENA** |
| 512 | igual a 502 (neto sin NC atribuibles) | **anota y FRENA** |
| 540 | `iva5.baseImponible − sin derecho` | **anota y FRENA** |
| 550 | `540 − NC5` | **anota y FRENA** |
| 507 / 517 | base 0% y su neto | sigue |
| 508 / 518 / 117 | sólo si el contador contesta la pregunta de notas de venta | **anota y FRENA** |
| 564 / 565 | valor sugerido del SRI | refuerzo técnico |

**«Frena»** significa: el formulario queda lleno, **no se envía**, se guarda
borrador y el aviso dice qué casillero faltó y cuánto dinero quedó sin declarar.

### 5.3 El panel 🏷️ (la mesa de clasificación)

- Muestra la **actividad del cliente** (catastro) y el interruptor «vende sólo al
  0%».
- Lista los proveedores que le facturaron, **los del período primero**, con las
  tarifas vistas en sus comprobantes y la actividad del catastro.
- **Vista previa en dinero**: `$X → 500/510 · $Y → 502/512`. Marcar un proveedor
  y ver el monto cambiar de casillero es toda la función.
- `↺` deshace una clasificación. Sin eso, un click equivocado quedaba grabado
  para siempre.
- Una sugerencia (catastro/IA) **nunca** pisa lo que decidió el contador.

---

## 6. Checklist de auditoría antes de enviar

1. **¿La declaración es sustitutiva?** Se frena y se va a *Consulta de
   declaraciones* a bajar el comprobante oficial. Nunca se presenta una
   sustitutiva.
2. **¿Hay facturas ambiguas o al 5% sin resolver?** El aviso de `iva_sin_ubicar`
   tiene que estar vacío.
3. **¿El 500 cuadra con el 15% de la tabla menos lo marcado sin derecho?**
   `500 + 502 = base 15% + base 5% + base 0%` no aplica: cada tarifa tiene su
   casillero.
4. **¿El 510 es 500 − NC15?** Y si la NC excede, ¿está en el 544 (y su IVA en el
   554)?
5. **¿El 5% fue al 540/550 y no al 500?**
6. **¿Hay compras al 5% sin el decreto del 203?** El portal no deja pasar.
7. **¿Los proveedores están activos en el catastro?** Un RUC suspendido que
   sigue facturando es una compra objetable.
8. **¿El cliente vende sólo al 0%?** Si sí, ninguna compra gravada da crédito.
9. **¿El saldo se LEYÓ y es exactamente 0.00?** `null` no es cero: si no se pudo
   leer, no se envía.
10. **¿Hay mensajes de inconsistencia del SRI?** Se leen; no se asume nada.
11. **¿El comprobante quedó capturado?** `%PDF` real, no HTML de sesión caída.
12. **¿Se archivó en el período correcto?** `AAAA-MM` canónico, no el año que
    aparece dentro del RUC.

---

## 7. Los errores que este proyecto ya pagó (para no repetirlos)

| Error | Qué pasó | Lección |
| :--- | :--- | :--- |
| **El 5% dentro del 500** | $1.000 al 5% declarados como 15% → $150 de crédito en vez de $50 | La tarifa decide el casillero antes que nada |
| **Mezcladas enteras al 15%** | 15 de 42 facturas eran de supermercado; se declaraban completas | La aritmética del IVA reparte; no es «no sé» |
| **El `id` del 540/550** | Se cableó `concepto1271`/`1281` porque «el bot escribió y no crasheó». Eran los casilleros **530/533** | Un `id` se confirma **leyendo el rótulo**, no escribiendo a ciegas |
| **El 502 decorativo** | Marcar «sin derecho» en 🏷️ no movía un centavo: el 502 no se escribía nunca | Un botón que no hace nada es peor que no tenerlo |
| **El arqueo en ceros** | `sri_ultimo_arqueo_compras` leía `resumen.baseTotal`, `iva15.base`, `tarifaCero`: campos que no existen | Un diagnóstico que miente es peor que ninguno |
| **La ND que nunca se barrió** | Las notas de débito incrementan el bruto y no están en el flujo | Falta construirlo (AGENTS §8a) |
| **El 203** | Dos contribuyentes con 5% quedaron trabados; el cierre los marcó «saldo a pagar» con saldo $0 | Un motivo equivocado manda a buscar plata que no existe |

---

## 8. Discrepancias abiertas y pendientes

| # | Tema | Estado |
| :-: | :--- | :--- |
| 1 | **503/513/523 vs 502/512/522** para «sin derecho» | **Resuelto por diseño**: el bot busca por **número de casillero** en la fila, no por `id`. El instructivo confirma que 503 es *importación de servicios*, no «sin derecho». |
| 2 | **`id` del 512** (`concepto1550` vs `concepto1480`) | Sin inspección DOM a mano. Por eso no se cableó ningún `id` para el 502/512: se usa el **número**. |
| 3 | **554 (IVA del excedente de NC)** | **Hallazgo de este informe**: el bot llena el 544 (base) pero **no el 554** (IVA). Con NC que exceden las compras, el arrastre de crédito queda incompleto. **Propuesta**: calcularlo y escribirlo. |
| 4 | **560 (IVA generado del 5%)** | `concepto1263`, misma fila que 540/550. El bot no lo escribe; el SRI suele calcularlo. Verificar en la próxima corrida real con 5%. |
| 5 | **508 «RISE» vs «RIMPE Negocio Popular»** | El instructivo 2017 dice RISE; el formulario 2026 lo rotula para notas de venta de negocios populares (RIMPE). La Biblia manda: 508/518 notas de venta. |
| 6 | **563: fórmula 2017 vs 2011** | `(411+412+415+416+417+418)/419` (instructivo) vs `(411+412+420+435+415+416+417+418)/419` (Biblia 2011). El portal lo calcula: el bot sólo lee el sugerido. |
| 7 | **Notas de débito y liquidaciones** | Sin barrer. Es el hueco más grande que queda en compras. |
| 8 | **Activo fijo (501/511/521)** | El bot no lo separa: una compra de maquinaria hoy cae en el 500. Necesita detección por ítem (XML) + criterio del contador. |

---

## 9. Fuentes consultadas

- **SRI · Instructivo Formulario 104** (PDF oficial, 20 pp.):
  <https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/6485dd98-aff4-40bd-a612-1f7948f2db7a/Instructivo+Formulario+104.pdf>
- **SRI · Artículo 66 LRTI — Crédito tributario** (PDF oficial):
  <https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/e8b834b7-132b-47f8-b006-553bb0d943a7/Articulo+66+LRTI.pdf>
- **SRI · Crédito tributario** (compilación):
  <https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/27816a91-2ba9-447d-b254-77d952b198fb/Cr%C3%A9dito%20tributario.pdf>
- **SRI · Instructivo Formulario 104A** (agentes de retención):
  <https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/6fa48f71-2ad2-465f-9853-9d91ef42201b/Instructivo+Formulario+104A.pdf>
- **BCI · Instructivo Formulario 104** (copia de referencia):
  <https://www.bci.com.ec/wp-content/uploads/2017/06/Instructivo-Formulario-104.pdf>
- Internas: `BIBLIA_FORMULARIO_IVA_2011.md`, `BIBLIA_PANTALLAS_SRI.md`,
  `.agents/AGENTS.md` (§0b.1, §9a, §9b, §12), `reglas_sri.js`.

> **Nota sobre las tarifas**: los PDF oficiales hablan del 12% porque son de
> 2017. La tarifa plena vigente en 2026 es **15%** (con 12/13/14 para períodos
> anteriores). El código usa `TARIFA_PLENA` y `clasificarTarifaIva()` para no
> hardcodear el porcentaje en cada cuenta.
