# 🔬 Informe — la extensión contra el tráfico real

Comparación de los tres exports de Burp Suite del `_EVIDENCIA_SRI` contra el
código de Nueva Luz 3.0 (build `3.1.0+20260903.1804`). 04-sep-2026.

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
