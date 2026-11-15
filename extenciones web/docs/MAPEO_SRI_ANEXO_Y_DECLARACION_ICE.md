# Mapeo del SRI · Anexo ICE y Declaración ICE

Extraído de los recorridos reales (exports de Burp) del 10-nov-2026.
Sirve para automatizar sin adivinar selectores.

---

## A · Anexo ICE — subida del ZIP

**Pantalla:** `https://srienlinea.sri.gob.ec/rig/pages/menuInicial.xhtml?codOperativo=ICE`

| Paso | Selector real | Nota |
|---|---|---|
| Formulario | `#…:frmRecepcion` | `enctype=multipart/form-data`, action `menuInicial.xhtml` |
| Campo de archivo | `input[type=file][id$=":frmRecepcion:anexosSubir_input"]` | PrimeFaces `FileUpload` con **`auto:true`** (sube al elegir) |
| Botón “Buscar” | `[id$=":btnBuscarTalon"]` | opcional |
| Validar | `[id$=":frmRecepcion:btnCargar"]` | valida el ZIP y muestra confirmación |
| Confirmar | `[id$=":frmRecepcion:btnAceptarConf"]` | envía el anexo |
| Mensajes | `[id$=":frmRecepcion:messagesText1"]` · errores `[id$=":frmRecepcion:pnlErrores"]` | |
| Límites | ZIP ≤ **8 MB** | texto de la pantalla |

Los ids traen un prefijo generado (`j_idt19:`), por eso se buscan **por sufijo**.

Implementado en la extensión 01: botón 📤 del HUD y `window.scSubirAnexoIce()`.
Al confirmar, publica `clients.tax_profile.ice_anexos[periodo] = {estado:'presentado'}`.

---

## B · Declaración ICE — wizard de declaraciones

**Pantalla:** `…/sri-declaraciones-web-internet/pages/recepcion/recibirDeclaracion.jsf?identificadorGrupoObligacion=ICE`

Pasos del wizard: `1 Período Fiscal · 2 Preguntas · 3 Formulario · 4 Pago`

| Paso | Selector real |
|---|---|
| Obligación | `#frmFlujoDeclaracion:somObligacion` (PrimeFaces selectOneMenu) · opción **`3031 - ICE BEBIDAS ALCOHÓLICAS`** |
| Año/Período | `#frmFlujoDeclaracion:calPeriodo` |
| Siguiente obligación | `#frmFlujoDeclaracion:btnObligacionSiguiente` |
| Perfilador (preguntas) | `#frmFlujoDeclaracion:btnPerfiladorSiguiente` · panel `…:perfilamiento_preguntasPanel` |
| Confirmación | `#frmFlujoDeclaracion:divBotonContinuarConfirmacion` |
| Éxito | texto **“Su declaración ha sido procesada satisfactoriamente”** |
| Tras enviar | `#frmFlujoDeclaracion:btnDescargarComprobante` (Imprimir) · `…:btnSinValorPagarNuevaDeclaracion` (Nueva declaración) |

**Datos que devuelve el SRI al confirmar** (para guardar en la web):

```
Identificación: 0706482023001
Razón social: CHAVEZ CORDOVA GUIDO ERMEL
Período fiscal: AGOSTO 2026
Tipo declaración: ORIGINAL
CEP # (Número de Serie): 873096863842
Fecha y hora: 08/09/2026 16:33:57
Vencimiento: 14/09/2026
```

**Declaración en cero:** en el recorrido no se llenó ningún casillero — el flujo
llegó hasta “Pago” y el SRI respondió “procesada satisfactoriamente”. Es decir:
para un mes sin movimiento **no hay formulario que llenar**, sólo wizard +
confirmación. Eso hace la automatización mucho más simple que la del IVA.

### Catálogo de obligaciones ICE (SRI), para cualquier cliente

Incluye 3031 Bebidas alcohólicas, 3011/3021 cigarrillos, 3041 cerveza,
3051/3053/3054 gaseosas, 3610 perfumes, 3620 videojuegos, 3630 armas,
3640 focos, 3650 casinos, 3660 cuotas/membresías, 3670 cocinas/calefones,
3680 fundas plásticas, y las variantes SENAE (importaciones).
La extensión debe elegir la opción **por texto**, no por índice.

---

## C · Lo que falta para cerrar la automatización

1. **Web → “Subir al SRI”**: dejar `pending_anexo_ice` y abrir la pantalla de Anexos (la extensión sube sola).
2. **Declaración ICE en cero**: parametrizar el wizard de la extensión
   (hoy fija IVA/2011) para aceptar `identificadorGrupoObligacion=ICE` y elegir
   `3031` por texto; el resto del flujo ya existe.
3. **Guardar el CEP** de la declaración ICE en `sri_declaraciones` para que la
   web la muestre como presentada.
