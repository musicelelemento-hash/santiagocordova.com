# Mapa · quién usa la llave pública de Supabase en las extensiones

> Paso 1 del encargo «cerrar la tabla de clientes»
> (`santiagocordova-main/docs/ENCARGO_SESION_LOCAL.md`), hecho el 23-nov-2026
> sobre `extension/nueva-luz-control-bucle` @ `f016d3e`.

## Cómo se arma la llave

- Nueva Luz no usa `supabase-js`: todo es `fetch` a mano contra `/rest/v1/` y
  `/storage/v1/`, con `apikey: <anon>` **y** `Authorization: Bearer <anon>`.
- Origen de la llave: `shared_config.js` (`SC_CONFIG.SUPABASE_ANON_KEY`).
  En el content script, `aplicarCredencialesSupabaseGuardadas()`
  (`src/01_utilidades_y_pdf.js:140`) la **pisa** con `sc_supabase_credenciales`
  de Ajustes si existe. `popup.js` y `background.js` leen sólo `SC_CONFIG`.
- Ya existe un token de sesión prestado: `bridge_content.js:141` copia el
  `access_token` de la sesión de la web (`sb-*-auth-token` en `localStorage`)
  a `sc_supabase_token`. **Sólo lo usa el runner remoto** (`background.js:570`),
  sin refresh token: vence a la hora.

## Nueva Luz — llamadas por tabla

| Tabla / bucket | Lectura | Escritura | Dónde |
| :--- | :--- | :--- | :--- |
| `clients` | ~20 GET (id, ruc, name, `tax_profile`, `declaration_history`, email; **`sri_password`** en `SriSincronizadorClaves`) | ~12 PATCH (`tax_profile`, `declaration_history`, estado de credencial) | `src/01` (448-462, 942-1156, 2332-2383, 2457, 2749, 2941, 3085-3130, 3854-3995), `src/02:1587, 2144, 2168`, `src/04:146-158`, `src/07:5833-5839`, `popup.js:71, 1093-1118`, `options.js:305-316` |
| `sri_declaraciones` | — | POST upsert `on_conflict=client_id,type,period` | `src/01:2861, 2881, 3983` |
| `suggestions` | — | POST | `popup.js:2635` |
| `bucle_remoto` + `rpc/claim_bucle_remoto` | GET | PATCH, RPC | `background.js` (runner, ya con token de la web) |
| Storage `clients-vault`, `sri_proofs` | URL pública | POST subida | `src/01:2618-2699` |

`annulments`, `annulment_policies` y `sri_contacts`: **Nueva Luz no las toca.**

## Otras extensiones que también se rompen al cerrar

| Extensión | Qué hace con la llave pública | Dónde |
| :--- | :--- | :--- |
| `02_Cambio_Claves_SRI` | `GET clients?select=*` — **trae todas las contraseñas** | `supabase_bridge.js:80` (llave de `chrome.storage` `sc_supabase_url/key` o la del código) |
| `04_Anulador_Comprobantes_SRI` | upsert y lectura de `annulments` | `content.js:1102`, `popup.js:695` |

## Lo que no cuadra con el encargo

1. **Los PATCH a `clients` probablemente ya fallan hoy.** El encargo dice que
   `clients` sólo le da `SELECT` a `anon`; Nueva Luz hace ~12 PATCH con esa
   llave (historial de declaraciones, `tax_profile`, estado de credencial).
   Sin verificar contra la base.
2. El cierre afecta a **tres** extensiones, no a una: 02 y 04 también
   necesitan sesión antes del paso 5.
3. No hay cliente `supabase-js` en la extensión: el login se haría contra
   `/auth/v1/token?grant_type=password` y `grant_type=refresh_token` a mano,
   o habría que meter la librería en `vendor/`.

---

## Paso 2 · La sesión en las tres extensiones (23-nov-2026)

`sc_sesion.js` — **misma copia** en `01_Nueva_Luz_3.0/`, `02_Cambio_Claves_SRI/`
y `04_Anulador_Comprobantes_SRI/`. Si se cambia en una, copiarla a las otras.

- Login contra `/auth/v1/token?grant_type=password` (sin `supabase-js`). La
  contraseña no se guarda: queda `sc_sesion_web` = access + refresh token.
- `ScSesion.token()` renueva solo con `grant_type=refresh_token` cuando faltan
  < 90 s; una sola renovación aunque pidan varias a la vez. Si el refresh es
  rechazado, borra la sesión y deja `sc_sesion_web_aviso` («Inicia sesión»);
  si es un error de red, la conserva.
- Sin sesión propia usa el token prestado de la web (`sc_supabase_token`, sólo
  existe en Nueva Luz) mientras no venza; si no, la llave pública. **Hasta que
  se cierre la base, nada cambia para quien no inicie sesión.**
- `apikey` sigue siendo la llave pública (Supabase la exige); sólo cambia el
  `Authorization: Bearer`.

| Extensión | Dónde se inicia sesión | Qué cambió |
| :--- | :--- | :--- |
| 01 Nueva Luz | Ajustes → «👤 Sesión del estudio»; el popup muestra «Inicia sesión» si falta | 20 `Bearer` de `src/` vía `scBearer()` (01), popup (5), runner del service worker. Los 401 marcan el aviso (`avisoLlaveWeb`). Las pruebas de llave de Ajustes/🩺 que comparan la llave del código siguen con la llave a propósito. |
| 02 Cambio de Claves | popup → pestaña de configuración | `supabase_bridge.js` (GET clientes y PATCH de clave). Además dejó de imprimir la clave nueva en la consola. |
| 04 Anulador | popup → bajo «Probar nube» | subida de `annulments` y la prueba de nube (dice «inicia sesión» ante 401/403). |

Banco nuevo: `tests/sesion.html`.
