# Anexo ICE mensual — CHAVEZ CORDOVA GUIDO ERMEL

Anexo del **Impuesto a los Consumos Especiales** que se sube al SRI todos los
meses. Mientras no haya ventas, el anexo va con los **mismos parámetros** y
sólo cambia el **año y el mes**.

## Qué genera

```
ICE-<año>-<ruc> <MES>.xml   ← el anexo
ICE-<año>-<ruc> <MES>.zip   ← el mismo XML comprimido (lo que sube el portal)
```

Ejemplo: `ICE-2026-0706482023001 OCT.xml` y `.zip`.

Parámetros fijos del contribuyente:

| Campo | Valor |
|---|---|
| RUC | `0706482023001` |
| Razón social | `CHAVEZ CORDOVA GUIDO ERMEL` |
| Código de producto ICE | `3031-053-049147-013-000750-66-593-000012` |
| Tipo de venta | `1` (consumidor final) |
| Identificación del cliente | `F` · `9999999999999` |
| Ventas / devoluciones | `0` (sin ventas) |

## Uso mensual (lo más fácil)

Doble clic en **`Generar anexo ICE del mes.bat`** (está en
`Downloads\Anexo_PVP_80310525`). Genera el anexo del **mes anterior**, que es el
que toca declarar, y abre la carpeta con los archivos.

Para un mes concreto, arrastrá el `.bat` a la consola o abrí una consola y
escribí el período:

```bat
"Generar anexo ICE del mes.bat" 2026-12
```

O directamente desde el proyecto:

```powershell
node "tools/anexo_ice.mjs"                 # mes anterior
node "tools/anexo_ice.mjs" --mes 2026-12    # diciembre 2026
node "tools/anexo_ice.mjs" --mes 2026-10 --todos   # 12 meses seguidos
```

## Verificación

El generador reproduce el anexo presentado en **septiembre 2026** de forma
**byte a byte** (mismo hash). El ZIP es un ZIP estándar (deflate) con el XML
adentro: se abre con Windows y lo acepta el portal.

## Cuando haya ventas

El anexo en cero **sólo vale para meses sin ventas**. Para un mes con movimiento
hay dos caminos.

### A · Leer los datos del formulario del SRI (recomendado)

1. Abrí el **formulario del anexo ICE** en el portal, con el mes cargado.
2. `F12` → pestaña **Console**.
3. Pegá el contenido de **`tools/anexo_ice_leer_formulario.js`** y `Enter`.
   - Imprime el JSON y lo **copia al portapapeles**.
   - Revisalo: si todo está en cero, no hace falta.
4. Guardalo como `ventas.json` y generá el anexo:

```powershell
node "extenciones web/tools/anexo_ice.mjs" --mes 2026-10 --json ventas.json
```

El JSON tiene esta forma (una línea por producto):

```json
{
  "anio": 2026,
  "mes": 10,
  "ruc": "0706482023001",
  "nombre": "CHAVEZ CORDOVA GUIDO ERMEL",
  "productos": [
    {
      "codProdICE": "3031-053-049147-013-000750-66-593-000012",
      "gramoAzucar": 125.5,
      "tipoIdCliente": "F",
      "idCliente": "9999999999999",
      "tipoVentaICE": 1,
      "ventaICE": 1250.5,
      "devICE": 0,
      "cantProdBajaICE": 0
    }
  ]
}
```

### B · A mano, con parámetros

```powershell
node "extenciones web/tools/anexo_ice.mjs" --mes 2026-10 --ventas 1250.50 --devoluciones 0 --gramos 125.5 --bajas 0
```

## Verificación

- Sin ventas: reproduce el anexo de **septiembre 2026** **byte a byte** (mismo hash).
- Con ventas: `ventaICE`, `devICE`, `gramoAzucar` y `cantProdBajaICE` salen con el
  formato del SRI (`1250.50`, `0`, `2`) y el ZIP es estándar (deflate).
- El generador tolera JSON guardados con BOM (como los guarda Windows).


En la misma carpeta hay un `PVP-2025-0706482023001.xml` que es **otro** anexo
(precios de venta al público por producto, anual). No se genera con esta
herramienta: es anual y no cambia mes a mes.
