# Publicar en la Chrome Web Store (sin tocar la tienda a mano)

`tools/empaquetar_tienda.mjs` arma los ZIP; `tools/publicar_tienda.mjs` los **sube** y,
si se pide, los **publica** con la API oficial.

> La API de la Chrome Web Store **no admite service accounts**: hace falta un
> **OAuth Client ID de tipo “Desktop app”** y un **refresh token** de tu cuenta de
> desarrollador. Los secretos se definen por variable de entorno en la sesión:
> **nunca** en un archivo commiteado.

---

## 1 · Preparar el cliente OAuth (una sola vez)

1. Entrá a [Google Cloud Console](https://console.cloud.google.com/) → proyecto de la tienda.
2. **APIs y servicios → Biblioteca** → habilitá **Chrome Web Store API**.
3. **Credenciales → Crear credenciales → ID de cliente OAuth**:
   - Tipo: **Aplicación de escritorio**.
   - Anotá `client_id` y `client_secret`.
4. **Pantalla de consentimiento OAuth**: agregá el scope
   `https://www.googleapis.com/auth/chromewebstore`.
5. Obtené el **refresh token** (una vez). Dos caminos:

   **A. OAuth Playground** (rápido)
   - Abrí <https://developers.google.com/oauthplayground/>
   - Engranaje ⚙ → *Use your own OAuth credentials* → pegá `client_id` y `client_secret`.
   - En “Input your own scopes”: `https://www.googleapis.com/auth/chromewebstore`
   - *Authorize APIs* → iniciá sesión con la cuenta **dueña de la tienda**.
   - *Exchange authorization code for tokens* → copiá el **Refresh token**.

   **B. Script local** (si preferís no usar el playground): un `curl` contra
   `https://oauth2.googleapis.com/token` con `grant_type=authorization_code`
   y el `code` del redirect `http://localhost`.

6. **ID del ítem**: en el panel de desarrollador (`chrome.google.com/webstore/devconsole`)
   abrí cada extensión; el ID está en la URL: `/detail/<itemId>`.
   - ID de **01 Nueva Luz** → `CWS_ITEM_01`
   - ID de **SUITE** → `CWS_ITEM_SUITE`

---

## 2 · Definir el entorno en la sesión

PowerShell:

```powershell
$env:CWS_CLIENT_ID      = "<client_id>"
$env:CWS_CLIENT_SECRET  = "<client_secret>"
$env:CWS_REFRESH_TOKEN  = "<refresh_token>"
$env:CWS_ITEM_01        = "<itemId de Nueva Luz>"
$env:CWS_ITEM_SUITE     = "<itemId de la suite>"
```

Bash:

```bash
export CWS_CLIENT_ID="..." CWS_CLIENT_SECRET="..." CWS_REFRESH_TOKEN="..."
export CWS_ITEM_01="..." CWS_ITEM_SUITE="..."
```

> `CWS_PUBLISHER_ID` es opcional (sólo si usás la API v2).

---

## 3 · Comandos

```powershell
# 1) empaquetar (siempre, para que el ZIP tenga la versión del manifest)
node "tools/empaquetar_tienda.mjs"

# 2) validar entorno y ver qué ZIP se subiría (no toca la tienda)
node "tools/publicar_tienda.mjs" --check

# 3) subir sin publicar (borrador para revisar en el panel)
node "tools/publicar_tienda.mjs" --upload --solo 01

# 4) subir y publicar
node "tools/publicar_tienda.mjs" --publish --solo 01
node "tools/publicar_tienda.mjs" --publish --solo suite

# 5) ver el estado que reporta la tienda
node "tools/publicar_tienda.mjs" --status
```

- Cada subida queda registrada en `entregables/PUBLICACION.json` (archivo, versión,
  modo y fecha; **sin secretos**).
- Los ZIP deben existir en `entregables/`. El script toma el más reciente de cada
  prefijo (`SC-PRO-01-*`, `SC-PRO-SUITE-*`).
- Si la tienda exige **revisión manual** (cambios de permisos), el estado queda en
  “pendiente de revisión” y se publica solo cuando Google aprueba.

---

## 4 · Errores frecuentes

| Síntoma | Causa / solución |
|---|---|
| `invalid_grant` | El refresh token venció o se generó con otro client_id. Repetir el paso 1.5. |
| `HTTP 401` al subir | La cuenta del refresh token no es la dueña del ítem. |
| `HTTP 403` “No permission” | Falta habilitar la Chrome Web Store API o el scope. |
| `uploadState: FAILED` | El ZIP no cumple el manifest (versión repetida, permisos nuevos, archivos prohibidos). Revisar el mensaje completo que imprime el script. |
| `HTTP 404` | `itemId` equivocado (copiado de otra extensión). |

---

## 5 · Seguridad

- No pegar secretos en `git`, ni en capturas, ni en el chat. El script los enmascara
  pero viven en el entorno de la sesión.
- Si se filtra un `client_secret` o un refresh token: **revocar** el cliente en Google
  Cloud Console y generar uno nuevo.
- El ZIP de la tienda **no** incluye `src/`, `tests/`, `tools/`, `docs/` ni `entregables/`
  (ver exclusión en `empaquetar_tienda.mjs`).
