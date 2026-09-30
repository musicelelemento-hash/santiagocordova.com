# 🛒 Material de listado — Chrome Web Store

> Estatus: listo para usar. Solo faltan las **capturas de pantalla** reales del popup (sección al final).

## Nombre
**Anulador de Comprobantes SRI**

## Descripción corta (135 caracteres máx.)
Llena automáticamente la solicitud de anulación de comprobantes del SRI (Ecuador) extrayendo los datos de tus PDFs.

## Descripción larga (máx. 132 caracteres por línea)
Anulador de Comprobantes SRI automatiza el trámite de anulación de facturas y documentos electrónicos emitidos en el SRI (Ecuador).

¿Cómo funciona?
1. Arrastra los PDFs de los comprobantes que quieres anular (por lotes o uno a uno).
2. La extensión extrae la clave de acceso (49 dígitos), razón social, RUC, número de comprobante, fecha y correo del PDF.
3. Presiona "Iniciar Automatización": llena el formulario de solicitud de anulación del SRI automáticamente.
4. Solo revisa y confirma. Envío manual incluido en la cola para el portal.

Características:
- ✅ Lectura local de PDFs: nada se sube ni se envía a ningún servidor.
- ✅ Procesamiento por lotes: arrastra varios comprobantes y se llenan en secuencia.
- ✅ Correo del receptor extraído del campo Información Adicional.
- ✅ Soporta facturas, notas de crédito, comprobantes de retención y más.
- ✅ Veredicto limpio: sin publicidad, sin rastreadores, sin cuentas.
- ✅ Gratis y de código simple, funciona solo con permisos mínimos.

Compatibilidad: Chrome / Edge (Manifest V3).

## Categoría sugerida
Productividad

## Idiomas
Español

## Permisos declarados (mínimos)
- `storage` — cola de comprobantes local.
- `activeTab` — navegar el portal del SRI al pulsar "Ingresar al Portal".
- host: `https://srienlinea.sri.gob.ec/*` — el único sitio sobre el que la extensión actúa.

## Declaración de privacidad (Data safety / Privacy policy)
**No se recopila ningún dato.** No se usa seguimiento, analítica, publicidad ni telemetría.
- Todo el procesamiento es **local**: los PDFs se leen en tu máquina y los datos extraídos solo se muestran en el popup y en la pestaña del SRI abierta por ti.
- La extensión no guarda tus PDFs ni los datos extraídos en la nube, no crea cuentas ni requiere registro.
- El único destino de los datos es el formulario oficial del SRI que tú mismo confirmas antes de enviar.
- Permisos mínimos: `storage` y `activeTab`, con restricción de host exclusiva al portal SRI en línea.

Texto preparado para la URL de la Política de Privacidad (se puede alojar en GitHub Pages o en la web santiagocordova.com):

```
POLÍTICA DE PRIVACIDAD — Anulador de Comprobantes SRI

Última actualización: septiembre 2026

La extensión "Anulador de Comprobantes SRI" no recopila, almacena, transmite ni
comparte datos personales de ningún tipo.

1. Procesamiento local: los archivos PDF que el usuario selecciona se procesan
   EXCLUSIVAMENTE en su dispositivo. Ningún dato sale de su máquina.
2. Sin cuentas, sin registro: la extensión no requiere crear una cuenta y no envía
   información a servidores propios ni de terceros.
3. Sin seguimiento ni publicidad: la extensión no utiliza cookies propias,
   rastreadores, analítica, ni redes de anuncios.
4. Datos en el navegador: la extensión solo usa el almacenamiento local de Chrome
   (chrome.storage.local) para recordar la cola de comprobantes entre acciones.
   Este almacenamiento permanece en el dispositivo del usuario.
5. Sitios visitados: la extensión opera únicamente en el portal oficial del SRI
   (https://srienlinea.sri.gob.ec), sobre los formularios que el propio usuario
   abre y confirma.
6. Servicios de terceros: ninguno. No se integra con servicios externos.
7. Contacto: Ing. Santiago Córdova — soporte@... — WhatsApp 0978980722.

El usuario es el único responsable de los datos que ingrese o confirme en los
formularios oficiales. Esta política puede actualizarse; los cambios se
publicarán en esta misma URL.
```

## Capturas de pantalla (PENDIENTE — capturar manualmente)
1. **Popup con cola de lote**: popup abierto con 2-3 PDFs en la lista y el botón "Iniciar Automatización" visible.
2. **Popup vacío**: el drop-zone "Suelta aquí tus PDFs (Lote)".
3. (Opcional) **Formulario SRI llenado por la extensión**: pantalla de solicitud de anulación con los campos ya autocompletados (requiere sesión real del SRI).

Tamaño recomendado por Google: 1280×800 o 640×400, PNG/JPG.

## Íconos
Los íconos **ya están generados** en el repo (`icon16.png`, `icon48.png`, `icon128.png`): documento azul con marca de anulación en rojo.

## Preguntas frecuentes (FAQ) sugeridas
- ¿Necesito conexión? Sí, para operar el portal del SRI (autenticación y envío).
- ¿Mis PDFs se suben a la nube? No. El procesamiento es 100% local.
- ¿Anula por mí? No: llena el formulario y tú confirmas el envío en cada comprobante.
- ¿Cuánto cuesta? Es gratuito.