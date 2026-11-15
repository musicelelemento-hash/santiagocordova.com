# 🔬 Informe — la extensión contra el tráfico real

Comparación de los tres exports de Burp Suite del `_EVIDENCIA_SRI` contra el
código de Nueva Luz 3.0 (build `3.1.0+20260903.1804`). 04-sep-2026.
**Revisado el 07-nov-2026: ver §7 para el estado actual de cada prioridad.**

| Traza | Peticiones | Duración | Qué es |
| :--- | ---: | ---: | :--- |
| `recorrido_manual_sri.xml` | 189 | — | El recorrido **a mano**. La verdad de referencia. |
| `prueba con la extencion` | 117 | 224 s | Corrida **automática**. |
| `comparacion _3` | 237 | 981 s | **Mixta**: el bot extrae y llega al formulario, una persona lo llena y envía. |

Cómo se distingue bot de humano: por el ritmo. El bot dispara acciones cada
0–8 s; en `comparacion _3` hay huecos de **103 s, 163 s y 529 s** justo en el
llenado del formulario. Nueve minutos de pausa son una persona pensando.

---

## 1. El veredicto en una línea

**La extensión hace bien la extracción y sabe llegar al formulario, pero el
salto no es fiable: en una de las dos corridas no ocurrió.**

Prueba objetiva, contando el puente SSO al formulario IVA:

| Traza | `redireccion=57` (comprobantes) | `redireccion=310` (formulario IVA) | `recibirDeclaracion.jsf` |
| :--- | :---: | :---: | :---: |
| Manual | 1 | **2** | 18 |
| **Prueba con la extensión** | 1 | **0** ❌ | **0** ❌ |
| Comparación 3 | 1 | **2** ✅ | 18 |

En `prueba con la extencion` el bot entra, extrae, **recarga comprobantes otra
vez y ahí se queda**. Nunca pide el puente al formulario. En `comparacion _3`,
con el mismo código, sí lo pide. Es intermitente, no está roto del todo — que
es exactamente lo que venías describiendo.

---

## 2. Lo que SÍ funciona (confirmado por red, no por suposición)

La corrida automática ejecutó, sola y en orden:

```
inicio/NAT
  → POST /auth/realms/Internet/login-actions/authenticate  → 302   ✅ auto-login
  → /sri-en-linea/contribuyente/perfil                             ✅ sesión abierta
  → /tuportal-internet/accederAplicacion.jspa?redireccion=57&idGrupo=55
  → GeneraToken.jsp → j_security_check → comprobantesRecibidos.jsf ✅ puente SSO
  → ⚡ frmPrincipal:btnConsultarSinRe          (facturas)
  → ⚡ frmPrincipal:tablaCompRecibidos         (paginación)
  → ⚡ frmPrincipal:btnConsultarSinRe          (retenciones)
  → ⚡ tablaCompRecibidos:0..3:j_idt66         (4 modales de detalle)
```

El auto-login que arreglamos **funciona contra el portal real**. El puente SSO
también. La extracción con sus modales, también. Eso ya no es teoría.

---

## 3. 🔴 Lo que falta POR DENTRO (código)

### 3.1 El salto al formulario cuelga de una bandera vieja

En [`03_ingreso_y_sesion.js:670`](../01_Nueva_Luz_3.0/src/03_ingreso_y_sesion.js):

```js
if (currentAction === 'FIN_TURBO') {
    const isAuto = storage.autoDeclaration === true;   // ← bandera legacy
    if (isAuto) runUnifiedWorkflow('NAVIGATE_AND_FILL', items.workflowPeriod);
    return;
}
```

Es **el único punto de todo el flujo que decide pasar a declarar**, y consulta
`autoDeclaration` en vez de `SriLoop.puedeAvanzar()`. Hoy el semáforo sincroniza
esa bandera, así que suele coincidir — pero es justo el patrón que ya causó
cuatro bugs en esta sesión. Si algo desincroniza `autoDeclaration`, el bot
extrae y se queda mirando, sin un solo error en consola.

**Encaja exactamente con lo observado.** Es el sospechoso número uno.

### 3.2 `j_idt947` está hardcodeado y los `j_idt` NO son estables

La Biblia lo da por confirmado, pero las tres trazas lo desmienten:

| Elemento | Manual | Comparación 3 | Extensión |
| :--- | :--- | :--- | :--- |
| Aceptar del diálogo de advertencias | `j_idt947` | **`j_idt946`**, `j_idt944` | — |
| Ver advertencias | `j_idt949` | `j_idt552` | — |
| Detalle en la tabla | `j_idt85` | `j_idt66` | `j_idt66` |

Son identificadores autogenerados por JSF: **cambian entre versiones y renders**.
El código los fija en dos lugares:

- `02_servicios_y_memoria.js:1165` → `getElementById('frmFlujoDeclaracion:j_idt947')`
- `02_servicios_y_memoria.js:551` → `[id*="j_idt195"]` (ni siquiera aparece en las trazas)

En la corrida real el botón fue `j_idt946`. **Ese selector ya está fallando.**
Hay respaldo por texto detrás, así que no es fatal, pero el ID hardcodeado es
ruido que da falsa confianza. Corresponde bajarlo a "pista", no a "confirmado",
en la Matriz Tatuada.

### 3.3 `frmPrincipal:tablaCompRecibidos` no está en el código

Es el único ID de la tabla maestra de la Biblia que **no aparece en `src/`**. La
extracción funciona por estructura, así que no urge — pero conviene anclarla al
ID confirmado en vez de depender de heurísticas de DOM.

### 3.4 La extensión nunca llegó al envío por sí sola

En ninguna traza el bot ejecutó `btnFormularioSiguiente`,
`divBotonContinuarConfirmacion` ni tocó `#panelSinValorAPagar`. En
`comparacion _3` esas acciones las hizo una persona (huecos de 103 s y 529 s).

**Todo el cierre mágico —incluida la validación de saldo que calibramos— sigue
sin ejecutarse jamás contra el portal real.** Está probado en banco, no en vivo.

---

## 4. 🟠 Lo que falta POR FUERA (producto y flujo)

### 4.1 El bucle nunca encadenó dos clientes

Las tres trazas son de **un solo contribuyente**. No hay evidencia de
`cliente 1 → 2`, ni de un `logout` seguido de un login con otras credenciales.
El objetivo que planteaste —41 clientes hasta vaciar la lista— **no tiene una
sola prueba de funcionamiento**.

Es lo primero que hay que capturar: una traza con dos clientes seguidos.

### 4.2 El comprobante no se sube porque nunca se genera

No hay tráfico a `workers.dev` (R2) ni a `supabase.co` en ninguna corrida del
bot. Lógico: sin llegar al envío no hay CEP que subir. Pero significa que **la
cadena PDF → R2 → Supabase → dashboard tampoco está probada en vivo.**

### 4.3 Falta la traza del final

`comparacion _3` termina en `divBotonContinuarConfirmacion` (el envío) y después
solo hay peticiones de Keycloak. **No se capturó la pantalla de confirmación con
el CEP ni el `btnDescargarComprobante`.** Es justo lo que hace falta para
blindar la captura del comprobante.

### 4.4 Cuellos de botella operativos

- **Clave caducada**: LABANDA quedó bloqueado por cambio de contraseña
  obligatorio. Con 41 clientes, esto va a pasar seguido. Hoy se detecta, se
  marca y se salta — pero hay que revisar cuántos quedan marcados y resolverlos
  a mano con la extensión 02.
- **La encuesta de satisfacción** aparece en el perfil tras cada login. Ya se
  cierra sola, pero con 41 logins se cierra 41 veces: conviene confirmar que no
  agrega latencia ni se cuela algún clic.

---

## 5. Prioridades

| # | Qué | Por qué |
| :---: | :--- | :--- |
| 1 | Cambiar `autoDeclaration === true` por `SriLoop.puedeAvanzar()` en `03:670` | Es el único punto que decide pasar a declarar y es el patrón que ya causó 4 bugs. |
| 2 | Capturar una traza de **dos clientes seguidos** | El encadenado del bucle no tiene ninguna prueba. |
| 3 | Degradar `j_idt947` y `j_idt195` a "pista" y confiar en el texto | La evidencia muestra que cambian entre corridas. |
| 4 | Capturar la pantalla de confirmación con el CEP | Falta para blindar la captura del comprobante. |
| 5 | Anclar la tabla a `frmPrincipal:tablaCompRecibidos` | Único ID confirmado sin usar. |

---

## 6. Corrección a la Biblia

La tabla maestra marca los `j_idt` como **confirmados contra el portal**. Las
propias trazas los desmienten: `j_idt947` en el recorrido manual es `j_idt946`
en la comparación. Conviene anotar en la Biblia que **los identificadores
`j_idt*` son autogenerados y volátiles**, y que solo los IDs semánticos
(`btnObligacionSiguiente`, `totalAPagar`, `divBotonContinuarConfirmacion`,
`panelSinValorAPagar`, `btnDescargarComprobante`…) merecen tratarse como fijos.

Esa distinción vale más que cualquier ID suelto: separa lo que se puede
hardcodear de lo que hay que buscar por texto o por estructura.

---

## 7 · Estado al 07-nov-2026 — qué se cerró y qué sigue abierto

> Revisión contra el código de `01_Nueva_Luz_3.0` (build `3.1.0+20261107.1255`)
> y contra el log de una corrida real del mismo día (clientes 3 a 6, un solo
> lote). La traza de Burp sigue siendo la verdad de referencia para la
> **secuencia de peticiones**; el log sólo prueba lo que el bot hizo en esta
> máquina.

### 7.1 Prioridades del §5

| # | Prioridad | Estado | Dónde se ve |
| :---: | :--- | :--- | :--- |
| 1 | `FIN_TURBO` decide con `SriLoop.puedeAvanzar()` | **Parcial** | `03_ingreso_y_sesion.js:1657-1663`: consulta el semáforo y registra las tres entradas, pero sigue haciendo `porSemaforo \|\| porBandera`. La bandera legacy no se retiró. |
| 2 | Traza de dos clientes seguidos | **Sin traza, con evidencia operativa** | El log del 07-nov encadenó 3 → 4 → 5 → 6 con logout/login y declaración en cada uno. No hay XML de Burp que lo respalde: falta capturarlo. |
| 3 | Degradar los `j_idt*` a «pista» | **Cerrado** | Ya no hay `j_idt947` ni `j_idt195` en `src/`. Se quitó además el respaldo `#j_idt15_content` de la lectura de período (`06:716-728`), donde acertar el id equivocado devolvía **otro período** en vez de null. Queda `#formCabecera\:j_idt31` dentro de una lista de selectores de RUC: ahí el peor caso es «no encuentra», no «encuentra mal». |
| 4 | Pantalla de confirmación con el CEP | **Cerrado en operación** | Log del 07-nov: `🎉 [SRI WATCHER] ¡Pantalla de confirmación detectada!`, clic en `btnDescargarComprobante`, PDF oficial de 114.052 chars, subida a R2 y `upsert` en Supabase. Falta la traza de red para blindarlo. |
| 5 | Anclar la tabla maestra | **Cerrado** | `04_extraccion_datos.js:1134` arma el enlace del XML con `frmPrincipal:tablaCompRecibidos:${indiceFila}:lnkXml`, el id semántico y estable. |

### 7.2 Brechas del §3 y §4

- **§3.1 (el salto colgaba de `autoDeclaration`)** — ya no cuelga sólo de eso,
  pero no se cerró del todo: ver prioridad 1. Mientras exista el `||`, una
  bandera vieja puede hacer declarar cuando el semáforo dice que no. **Es el
  único punto del flujo donde la evidencia del recorrido manual todavía
  contradice al código.**
- **§3.4 (nunca llegó al envío sola)** — superado: el 07-nov el bot validó
  saldo $0.00, confirmó el diálogo, envió, capturó el PDF y lo archivó.
- **§4.2 (PDF → R2 → Supabase sin probar)** — superado en la misma corrida.
- **§4.3 (falta la pantalla final)** — superado en operación; falta la traza.

### 7.3 Hallazgo nuevo, del log del 07-nov

Mientras la sesión detectada era del RUC `0703371740001`, el log escribió:

```
📊 [ARQUEO COMPRAS] Resumen guardado para 0705549145001: 23 facturas.
```

Es el cliente **anterior** del lote. Si ese resumen alimenta el llenado, las
compras de un contribuyente terminan en la declaración de otro. No se corrigió
a ciegas: hay que reproducirlo con el DOM real y decidir si el arqueo debe
llevar el RUC con el que se leyó la tabla, no el `lastRuc` del almacén.
**Candidato a prioridad 1 del próximo ciclo.**

### 7.4 Regla que queda

Una traza de Burp vale por la **secuencia** (qué petición habilita a cuál) y
por los **ids semánticos**. Los `j_idt*`, los tiempos y los nombres de archivo
no son evidencia de nada. Cuando el log de consola contradiga a la traza, gana
la traza; cuando la traza calle, el log es una hipótesis, no una prueba.

