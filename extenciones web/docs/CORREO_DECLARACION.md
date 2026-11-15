# Copia por correo de la declaración

Cuando una declaración termina con su comprobante subido, el cliente recibe un
correo con el PDF y el aviso de que quedó presentada.

---

## Qué se envía

**Asunto:** `Declaración de IVA de octubre 2026 presentada`

```
Estimado/a JUAN PÉREZ:

Le informamos que su declaración de IVA correspondiente a octubre 2026 fue
presentada correctamente ante el SRI.

Adjuntamos una copia del comprobante en PDF para su archivo.
Si necesita una copia física o tiene alguna consulta, puede responder a este
correo.

Saludos cordiales,
Soluciones Contables Pro
```

- Se dispara **sólo** si el PDF se subió (`pdfUrl` existe).
- El correo sale del campo `email` del cliente en Supabase; si no tiene, no se
  envía (y queda el log).
- Si el servicio falla, la declaración **no se ve afectada**: el comprobante ya
  está guardado y la URL queda en el log.

---

## Cómo se activa

En el almacenamiento de la extensión:

```js
chrome.storage.local.set({
  sc_email_config: {
    url: "https://santiagocordova.onrender.com/email/declaracion",
    token: "<EMAIL_ROUTE_TOKEN del bot>",
    chatId: "<chat id de Telegram con Gmail autorizado>",
    firma: "Soluciones Contables Pro",   // opcional
    to: ""                               // opcional: forzar destinatario
  }
});
```

Y en Render (el bot): `EMAIL_ROUTE_TOKEN` y, si querés fijarlo, `EMAIL_CHAT_ID`.

Sin `sc_email_config.url` el envío **no se intenta**.

---

## Contrato del servicio

`POST <url>` con `Authorization: Bearer <token>` (si hay token):

```json
{
  "to": "cliente@correo.com",
  "subject": "Declaración de IVA de octubre 2026 presentada",
  "text": "Estimado/a …",
  "pdfUrl": "https://…/Declaracion_IVA_….pdf",
  "nombre": "JUAN PÉREZ",
  "ruc": "1712345678001",
  "periodo": "2026-10"
}
```

El servicio debe bajar el PDF de `pdfUrl` y adjuntarlo.

---

## Estado

- **Hecho**: el enganche, la plantilla y la configuración (`01_utilidades_y_pdf.js`,
  después del hito `COMPROBANTE_SUBIDO`).
- **Hecho**: la ruta `POST /email/declaracion` en el bot. Baja el PDF de `pdfUrl`,
  lo adjunta y lo envía con el Gmail ya autorizado (`sendEmailWithAttachment`).
- **Hecho**: tarjeta **📧 Copia por correo** en Ajustes (URL, token, chat ID,
  firma y destinatario fijo) con guardado y estado.
- **Falta**: probar con un cliente real (requiere el bot desplegado con el token).
