# Anexo ICE · guía de llenado (y qué automatiza nuestro sistema)

Guía completa del **Anexo ICE** (Impuesto a los Consumos Especiales) tal como lo
pide el SRI, con el ejemplo real de **CHAVEZ CORDOVA GUIDO ERMEL** (vino, código
`3031`) y el detalle de qué campo llena el generador y cuál va a mano.

---

## 1 · ¿Qué es y quién lo presenta?

- Es el **informe electrónico mensual** donde el fabricante o importador de bienes
  gravados con ICE reporta sus operaciones: ventas, devoluciones y bajas.
- **Obligados**: quien fabrica, importa o presta servicios gravados con ICE, con
  RUC activo (bebidas alcohólicas, cigarrillos, bebidas azucaradas, etc.).
- **Sin movimiento**: si en el mes no hubo ventas, devoluciones ni bajas, el
  anexo **igual se presenta** (declaración en cero / “sin movimiento”).

## 2 · Encabezado (datos del informante)

| Campo | Ejemplo | Nota |
|---|---|---|
| RUC | `0706482023001` | 13 dígitos, sin guiones |
| Razón social | `CHAVEZ CORDOVA GUIDO ERMEL` | Tal como consta en el RUC |
| Período | octubre 2026 | En el XML va como `<Anio>2026</Anio><Mes>10</Mes>` |

El ZIP se nombra con el período: **`AICEmmaaaa.zip`** → `AICE102026.zip`.
No es `AAAA-MM` ni `MMAAAA` en el nombre: son **mes de 2 dígitos + año de 4**.

## 3 · Código de producto: 33 caracteres

El DIMM arma el código con 8 campos. Si un campo es más corto, **se rellena con
ceros a la izquierda** hasta su longitud.

| Campo | Largo | Ejemplo | Descripción |
|---|---:|---|---|
| Código de impuesto | 4 | `3031` | Bebidas alcohólicas distintas a la cerveza |
| Clasificación | 2–3 | `053` | Vino nacional (53) |
| Marca | 6 | `049147` | Código del catálogo oficial de marcas del SRI |
| Presentación | 3 | `013` | Envase / botella |
| Capacidad | 6 | `000750` | Mililitros (750 ml) |
| Unidad | 2 | `66` | Unidad de medida |
| País | 3 | `593` | Ecuador |
| Grado alcohólico | 6 | `000012` | 12° de alcohol |

**Resultado (33 dígitos)**: `30315304914701300075066593000012`
**En el XML**, cada campo va con guion: `3031-053-049147-013-000750-66-593-000012`

Variantes del vino: frutas **54/55**, espumoso **56**. Cambia la clasificación,
no el resto.

## 4 · Módulo de ventas (el detalle del período)

Por cada línea de venta se reporta:

| Dato | En el XML | Ejemplo |
|---|---|---|
| Código de producto | `<codProdICE>` | `3031-053-…` |
| Gramos de azúcar añadida | `<gramoAzucar>` | `0.00` siempre en 3031 |
| Tipo de identificación | `<tipoIdCliente>` | `F` (consumidor final), `C`, `R`, `P` |
| Número del cliente | `<idCliente>` | `9999999999999` = consumidor final |
| Tipo de venta | `<tipoVentaICE>` | `1` |
| Valor de venta | `<ventaICE>` | `0` o `1250.50` |
| Devoluciones | `<devICE>` | `0` |
| Productos dados de baja | `<cantProdBajaICE>` | `0` |

**Gramos de azúcar**: en vinos y bebidas alcohólicas del código 3031 va **0.00**;
solo aplica a bebidas gaseosas / no alcohólicas con azúcar.

**Mes sin ventas**: el detalle puede quedar sin movimientos. Nuestro generador,
para no cambiar la forma del archivo que el SRI ya aceptó, escribe **una línea en
cero** con el producto del cliente (idéntica a la declaración de septiembre 2026).

## 5 · Módulo de importaciones (solo si aplica)

Si se importó el producto: unidades ingresadas, fecha de desaduanización, país de
procedencia y datos de la liquidación aduanera (distrito, año, régimen y
secuencial del refrendo). Un fabricante nacional **no** lo llena.

## 6 · El XML, campo por campo (ejemplo real)

```xml
<ice>
  <TipoIDInformante>R</TipoIDInformante>        <!-- R = RUC -->
  <IdInformante>0706482023001</IdInformante>    <!-- RUC -->
  <razonSocial>CHAVEZ CORDOVA GUIDO ERMEL</razonSocial>
  <Anio>2026</Anio>
  <Mes>10</Mes>                                 <!-- 10 = octubre -->
  <actImport>02</actImport>                     <!-- 02 = normal -->
  <codigoOperativo>ICE</codigoOperativo>
  <ventas>
    <vta>
      <codProdICE>3031-053-049147-013-000750-66-593-000012</codProdICE>
      <gramoAzucar>0.00</gramoAzucar>
      <tipoIdCliente>F</tipoIdCliente>
      <idCliente>9999999999999</idCliente>
      <tipoVentaICE>1</tipoVentaICE>
      <ventaICE>0</ventaICE>
      <devICE>0</devICE>
      <cantProdBajaICE>0</cantProdBajaICE>
    </vta>
  </ventas>
</ice>
```

## 7 · Generar el ZIP

- Comprimir el XML en un ZIP estándar.
- Nombre: **`AICEmmaaaa.zip`** (sin espacios ni caracteres especiales).
- Ejemplo: octubre 2026 → `AICE102026.zip`.

## 8 · Subirlo al SRI

1. Entrar a **SRI en Línea** con el RUC y la clave del contribuyente.
2. **Declaraciones → Anexos → Envío y consulta de anexos**.
3. Elegir **Anexo ICE**, adjuntar el `.zip` y procesar.
4. Guardar el comprobante/constancia de recepción.

## 9 · Vencimiento (9.º dígito del RUC)

Se presenta el mes siguiente, del **10 al 28**, según el 9.º dígito del RUC:

| 9.º dígito | Vence el día |
|---|---|
| 1 | 10 |
| 2 | 12 |
| 3 | 14 |
| 4 | 16 |
| 5 | 18 |
| 6 | 20 |
| 7 | 22 |
| 8 | 24 |
| 9 | 26 |
| 0 | 28 |

Si cae sábado, domingo o feriado, pasa al siguiente día hábil.

## 10 · Qué automatiza nuestro sistema

| Paso | Herramienta | Estado |
|---|---|---|
| Armar el XML con el código de 33 | `tools/anexo_ice.mjs` | ✅ automático |
| Nombre `AICEmmaaaa.zip` | el generador y la web | ✅ automático |
| Mes que toca (el anterior) | por defecto, sin parámetros | ✅ automático |
| Ventas del mes (si hay) | leer del formulario + `--json` | ✅ semiautomático |
| Publicar las ventas en la nube | `--publicar` / botón web | ✅ automático |
| Configurar el producto de cada cliente ICE | web → Configurar ICE | ✅ automático |
| Subir el ZIP al SRI | portal (manual) | ❌ a mano |
| Ventas: leer del formulario del SRI | `anexo_ice_leer_formulario.js` | ⚠ revisar el JSON |

### Comandos

```powershell
# mes anterior, sin ventas
node "extenciones web/tools/anexo_ice.mjs"

# un mes concreto
node "extenciones web/tools/anexo_ice.mjs" --mes 2026-10

# con ventas leídas del formulario
node "extenciones web/tools/anexo_ice.mjs" --mes 2026-10 --json ventas.json --publicar
```

En la web: **Clientes → cliente → Ver como cliente → Descargar XML · <mes>**, y
**⚙ Configurar ICE** para el código de producto de cada cliente.

## 11 · Errores comunes

| Error | Causa |
|---|---|
| ZIP rechazado | nombre incorrecto (debe ser `AICEmmaaaa.zip`) o XML con otro período |
| “No existen datos para los parámetros” | período mal elegido en el otro módulo del portal |
| Ventas en cero en un mes con movimiento | no se cargaron las ventas del formulario |
| Código de producto inválido | guiones en el DIMM (ahí va sin guiones) o longitud distinta a 33 |
| “Módulo de ventas vacío” | el portal lo acepta, pero nuestro XML mantiene una línea en cero por consistencia |
