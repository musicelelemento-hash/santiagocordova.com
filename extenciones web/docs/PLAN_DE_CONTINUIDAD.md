# Plan de continuidad: que no se pare

Revisión del 08-nov-2026, hecha **corriendo las puertas**, no de memoria.

---

## 1 · Estado verificado ahora

| Puerta | Resultado |
| :--- | :--- |
| Extensiones (`tools/verificar.ps1`) | **OK** · 22 archivos, suite determinista, 0 secretos, manifiestos válidos |
| Web (`tsc --noEmit`) | **OK** · 0 errores |
| Bot (`npm run build`) | **OK** · compila y genera la regla compartida |

Un solo comando para repetirlo:

```powershell
powershell -ExecutionPolicy Bypass -File "extenciones web\tools\verificar_todo.ps1"
```

**Regla:** ninguna tanda se cierra con un paso en FALLA. Si falla, primero se arregla.

---

## 2 · Lo que quedó hecho

### Anulaciones (04 + web + bot)

- Motor v2.5, numeración `AN-AAAA-NNNNNN`, lote, período, idempotencia por clave.
- Subida a Supabase con estado visible en el popup (`☁ nube OK · 14 envíos · 6 KB`).
- Panel de cobro en la Bóveda, editor de precio por cliente (gratis / fijo / cupo).
- Aviso al facturar + línea al **0 % (RIMPE)** + marcado `facturado` con el secuencial.
- Tarjeta de capacidad (500 MB, margen de clientes) y recordatorio de cobro.
- Bot: `consultar_cobros_pendientes` con la misma regla compilada.

### Extensiones

- `_recorridos` → `recorridos` (Chrome rechaza el `_`) + guard en la puerta y en el constructor.
- Popups 01–04 con el sistema Obsidian & Liquid Gold (01 con hero de tres números, tabs segmentadas y **tarjetas nuevas**: estado, semáforo del 9.º dígito y sello de comprobante).
- 01: el lote explica su alcance (`3 de 16`), botón **Correr todos**, y la línea de reconciliación.
- 04: tarjeta **Emisor detectado** (el RUC sale de la clave) con **Entrar y anular**.

### Web

- Importador de CSV de Chrome con **vista previa** (detecta / actualiza / crea / iguales) y
  empuje de la matriz a la extensión.
- **Ctrl+K → Entrar al SRI** por cliente (login rápido sin abrir la ficha).
- Botón **Entrar SRI** en la tarjeta de cada cliente.

---

## 3 · Lo que falta, en orden (con criterio de terminado)

### P0 — seguridad (no es opcional)

| # | Acción | Terminado cuando |
| :--- | :--- | :--- |
| 1 | Rotar la clave de Anthropic (quedó en el chat y en un YAML) | la vieja da 401 |
| 2 | Rotar el token de GitHub embebido en `origin` | `git remote -v` sin `ghp_` |
| 3 | Mover `Contraseñas de Chrome.csv` a un gestor y borrarlo del disco | el archivo no existe |
| 4 | Cifrar `sri_password` en reposo | la columna no se lee en claro desde la API |

### P1 — cerrar lo que está a medias

| # | Acción | Terminado cuando |
| :--- | :--- | :--- |
| 5 | ~~Rediseño de las tarjetas de cliente y el cajón de herramientas (01)~~ **HECHO 08-nov** | captura `popup_01_tarjetas.png` / `popup_01_herramientas.png`; delegación por `data-action` intacta |
| 6 | Facturar anulaciones **sin declaración** | un cliente con firma y 0 declaraciones se factura |
| 7 | Panel de cobro en Cobranza (además de la Bóveda) | un cobro se hace desde Cobranza |
| 8 | Bot en producción | responde en Telegram con datos reales |

### P2 — crecer

| # | Acción | Terminado cuando |
| :--- | :--- | :--- |
| 9 | Agrupar PDFs por emisor en el 04 | un lote de 3 clientes se procesa sin mezclar claves |
| 10 | “Cierre de mes”: checklist clave/declarado/comprobante/pagado | el reporte sale del sistema |
| 11 | Auditoría del período contra Supabase | tres grupos: coinciden / sin comprobante / sin declaración |
| 12 | R2 para archivos | la tarjeta de capacidad pasa el 80 % de Storage |

---

## 4 · Auditoría: lo que se pasó por alto

1. **201 archivos sin commitear** en la raíz; 111 son de `_RESPALDO_EXTENSIONES_SEGURA` y 38 de
   `_ARCHIVADAS_Y_LEGACY`. Ojo: **esos respaldos están trackeados en git** (no son untracked),
   por eso el `.gitignore` no los saca. Decisión pendiente:
   `git rm -r --cached "extenciones web/_RESPALDO_EXTENSIONES_SEGURA"` y lo mismo con
   `_ARCHIVADAS_Y_LEGACY` — los archivos quedan en disco y salen del repo. Hacerlo en un commit
   propio, no mezclado con features.
2. **La web no tiene CI**. El workflow `extensiones.yml` cubre las extensiones; los cambios de
   React y del bot no los verifica nadie hasta que se corre a mano.
3. **`annulment_policies` no la lee nadie**: la política vive en `tax_profile.facturadorConfig`.
   La tabla quedó documentada como reservada; conviene borrarla o usarla.
4. **La clave de Claude no tiene saldo**: el proveedor está bien configurado y falla por crédito,
   no por código.
5. **Chrome tiene que recargar 01/02/03/04** después de los cambios de popup; la suite no.
6. **`.env.local` y `import_passwords.js`** siguen en el disco (nunca se imprimen).

---

## 5 · Cómo evitar que se pare

1. **Una sola puerta**: `verificar_todo.ps1` antes de cada commit.
2. **Commits chicos**: un tema por commit; si la puerta falla, no se commitea.
3. **CI**: agregar al repo web un workflow con `typecheck` + `build` + build del bot.
4. **Definición de terminado** por tanda:
   - la puerta en verde,
   - una captura o una prueba real del cambio,
   - el doc actualizado (una línea, no un tratado).
5. **Nada de “a medias”**: si una función no se puede terminar, queda documentada en la §3 con su
   criterio, no escondida.
