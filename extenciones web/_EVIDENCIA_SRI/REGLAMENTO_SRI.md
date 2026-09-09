# 📜 REGLAMENTO SRI — Nueva Luz 3.0

> Generado automáticamente desde `reglas_sri.js` (versión 1.0.0, 2026-09-09).
> **No se edita a mano**: se regenera con `node tools/generar_reglamento.js`.
> La fuente ejecutable y verificable es el archivo de código; esta copia es para leer.

Cada regla tiene un `id` **inmutable**: si se borra o cambia, el banco
`tests/reglas.html` falla. Ninguna regla se rompe en silencio.

**20 reglas** · 19 críticas · 3 esperan al contador · 1 pendientes de evidencia.

---

## ⚖️ Ley (criterio contable) (6)

### R-LEY-SUSTENTO-CREDITO-LIQUIDACION — 🔴 crítica · 👤 espera al contador

**Regla:** La liquidación de compra sustenta crédito tributario de IVA solo si se retuvo y depositó el 100% del IVA correspondiente.

**Por qué:** Criterio dicho por el usuario el 09-sep-2026 (AGENTS §8a). Las liquidaciones respaldan compras a quienes no pueden facturar.

**Fuente:** AGENTS.md §8a (criterio del usuario, 09-sep-2026)
**Acción:** no declarada: pendiente de validar en pantalla y de que el contador fije la fuente legal

---

### R-LEY-ND-INCREMENTAN-BRUTO — 🔴 crítica · 👤 espera al contador

**Regla:** La nota de débito recibida incrementa el valor bruto del tipo de compra correspondiente en el período en que se recibe.

**Por qué:** Criterio dicho por el usuario el 09-sep-2026 (AGENTS §8a). Nunca se barrió una ND: es el tipo que falta construir.

**Fuente:** AGENTS.md §8a (criterio del usuario, 09-sep-2026)
**Acción:** no construida: falta el barrido del tipo de comprobante nota de débito

---

### R-LEY-NC-REDUCEN-BASE-E-IVA — 🔴 crítica · ✅ vigente

**Regla:** La nota de crédito recibida reduce base imponible E IVA de compras en el período en que se recibe (neto = bruto − NC).

**Por qué:** Regla estructural del formulario; el bot ya resta NC del 510/517/550. Los excedentes por compensar (543/544/554) no se usan aún.

**Fuente:** Biblia Formulario 2011 §2A · BIBLIA_FORMULARIO_IVA_2011.md
**Acción:** restar NC del neto del casillero correspondiente (vigente); manejar excedentes: pendiente
**Cobertura (bancos):** `iva5.html`

---

### R-LEY-CASILLERO-540-5PORCIENTO — 🔴 crítica · ✅ vigente

**Regla:** El casillero 540/550 es para compras legítimas al 5% (materiales de construcción). Una compra que NO es 5% exacto jamás va ahí.

**Por qué:** El falso 5% por centavos bloqueó a MIÑO, CABRERA, RAMÓN ORELLANA y WALTER MIÑO con el casillero 203. Ver AGENTS §9d y §0b.

**Fuente:** AGENTS.md §9d y STATE.md 08-sep · BIBLIA_FORMULARIO_IVA_2011.md §6
**Acción:** clasificarTarifaIva exige cociente 5% real; las mezcladas exactas van a null, nunca al 540
**Cobertura (bancos):** `iva5.html`

---

### R-LEY-502-512-SIN-DERECHO — 🔴 crítica · 👤 espera al contador

**Regla:** Los casilleros 502/512 (compras sin derecho a crédito) existen; el bot no los usa hasta que el contador defina el mapa CIIU → deducible.

**Por qué:** Mandarlo ahí por las dudas le quita al contribuyente un crédito que quizá le corresponde. AGENTS §0b.1.

**Fuente:** AGENTS.md §0b.1 y §9a
**Acción:** hoy: todo va a 500/510; el 502/512 queda sin cablear hasta el mapa (decisión del contador)

---

### R-LEY-NUMERACION-104-VS-2011 — 🟠 aviso · 🔎 pendiente de evidencia (📐)

**Regla:** La numeración de la sección compras debe confirmarse contra el formulario real (el usuario describió 501/511/521 corriente y 553/554 proporcionalidad; la Biblia del 2011 dice 500/510/520 y 563/564/565).

**Por qué:** Discrepancia abierta el 09-sep-2026. No se resuelve discutiendo: se resuelve con el 📐 sobre la fila real. AGENTS §8a.

**Fuente:** AGENTS.md §8a (advertencia de numeración)
**Acción:** 📐 sobre el formulario real → corregir Biblia o el criterio

---

## 🏛️ Portal (evidencia) (3)

### R-PORTAL-ID-SOLO-CON-EVIDENCIA — 🔴 crítica · ✅ vigente

**Regla:** Un id de casillero entra al código SOLO con evidencia de que el bot escribió en él (📐 / captura). Prohibido suponerlo por patrón.

**Por qué:** El 550 resultó concepto1281 y el 540 concepto1271: el patrón existía y aun así se cablearon después de escribirlos de verdad. AGENTS §5b / §0b.5.

**Fuente:** AGENTS.md §5b y §0b.5
**Acción:** todo id nuevo pasa por el botón 📐 y se anota en la Biblia antes de cablear

---

### R-PORTAL-SALDO-USD-CERO — 🔴 crítica · ✅ vigente

**Regla:** El saldo del resumen viene como "USD 0.00". Decidir un envío con parseDecimal() está prohibido: devuelve 0 tanto para cero como para no-pude-leer.

**Por qué:** parseDecimal mintió y casi envía a ciegas. Para decidir plata existe parseImporteEstricto() que devuelve null cuando no hay número. AGENTS §4/§6.

**Fuente:** AGENTS.md §4 (regla del saldo) y Matriz §6 C · BIBLIA_FORMULARIO_IVA_2011.md
**Acción:** detectarSaldo() y parseImporteEstricto() son los únicos válidos para decidir envío
**Cobertura (bancos):** `resumen.html`

---

### R-PORTAL-203-SIN-DECRETO-INVENTADO — 🔴 crítica · ✅ vigente

**Regla:** El casillero 203 (concepto91) tiene 17 opciones, todas decretos del 8% (feriados/turismo). El bot NUNCA elige un decreto a ciegas.

**Por qué:** Ninguna opción dice 5%. Elegir el equivocado es declarar mal. La relación 540↔203 sigue sin resolver (AGENTS §9d). La corrida real de APOLO (09-sep) volvió a frenar ahí.

**Fuente:** AGENTS.md §9d · BIBLIA_FORMULARIO_IVA_2011.md §6
**Acción:** frenar el envío y dejar el motivo formulario_incompleto con el reclamo del 203
**Cobertura (bancos):** `iva5.html`

---

## 🤖 Bot (seguridad) (11)

### R-BOT-NUNCA-SUSTITUTIVA — 🔴 crítica · ✅ vigente

**Regla:** El bot NUNCA presenta una declaración sustitutiva. Si el wizard rotula SUSTITUTIVA, no toca nada y detiene el lote.

**Por qué:** Una sustitutiva corrige una declaración aceptada: es decisión del contador. Pasó de verdad el 04-sep-2026. AGENTS §3a.

**Fuente:** AGENTS.md §3a
**Acción:** frenarSiEsSustitutiva() antes de llenar y antes de enviar

---

### R-BOT-NUNCA-PAGA — 🔴 crítica · ✅ vigente

**Regla:** El bot NUNCA paga. Si el saldo no es exactamente 0, guarda borrador y frena.

**Por qué:** Pagar es decisión del estudio. AGENTS §4 (contrato del envío).

**Fuente:** AGENTS.md §4
**Acción:** ejecutarCierreMagico: saldo ≠ 0 → borrador + freno
**Cobertura (bancos):** `resumen.html`

---

### R-BOT-NULL-NO-ES-CERO — 🔴 crítica · ✅ vigente

**Regla:** Un "no sé" jamás se guarda como cero. null no es dato: es ausencia de dato.

**Por qué:** Vale para el saldo, las notas de venta, la tarifa de IVA y las sugerencias de IA. AGENTS §0a / HANDOFF §5.

**Fuente:** AGENTS.md §0a y HANDOFF.md §5
**Acción:** parseImporteEstricto() devuelve null; nunca convertir null en 0 para decidir
**Cobertura (bancos):** `iva5.html` `notasventa.html`

---

### R-BOT-SIN-CLAVES-EN-DOM — 🔴 crítica · ✅ vigente

**Regla:** Nunca se escriben claves en el DOM del portal ni en atributos data-*: solo el RUC en el elemento; la credencial se resuelve al hacer clic.

**Por qué:** La página del SRI no debe conocer las contraseñas de los clientes. AGENTS §1.

**Fuente:** AGENTS.md §1 (CLAVES FUERA DEL DOM)
**Acción:** credencial contra sc_clients_cache en el momento del click
**Cobertura (bancos):** `claves.html`

---

### R-BOT-NO-CAMBIAR-CLAVES — 🔴 crítica · ✅ vigente

**Regla:** El bot nunca cambia contraseñas. Si el SRI pide cambiar la clave, omite al cliente y avisa.

**Por qué:** Cambiar la clave de un contribuyente sin pedirlo es una decisión con consecuencias. AGENTS §0a y §1.

**Fuente:** AGENTS.md §0a
**Acción:** detectar clave vencida ANTES de navegar y marcar al cliente en Omitidos
**Cobertura (bancos):** `clavevencida.html`

---

### R-BOT-NO-LEERSE-A-SI-MISMO — 🔴 crítica · ✅ vigente

**Regla:** El bot nunca lee el texto de su propia interfaz como si fuera del portal.

**Por qué:** Se leyó a sí mismo tres veces (modales, login, período) y cada vez rompió distinto. AGENTS §0a.

**Fuente:** AGENTS.md §0a (propuesta del lector único) y §2c
**Acción:** esDeLaExtension() / soloDelPortal(); el texto del portal se lee de la zona, no del body
**Cobertura (bancos):** `login.html` `periodo.html`

---

### R-BOT-AUSENCIA-NO-ES-LIMPIO — 🔴 crítica · ✅ vigente

**Regla:** La ausencia de mensajes en el resumen NO significa "todo bien": hay que confirmar el estado limpio del SRI.

**Por qué:** Esa regresión permitió enviar a ciegas si el selector fallaba. AGENTS §4.

**Fuente:** AGENTS.md §4
**Acción:** analizarMensajesResumen() debe devolver "limpio" explícito
**Cobertura (bancos):** `resumen.html`

---

### R-BOT-NO-SALTEAR-POR-AVISO — 🔴 crítica · ✅ vigente

**Regla:** Nunca se saltea a un contribuyente por el aviso de vencimiento: hay que comprobarlo en Consulta de declaraciones.

**Por qué:** El aviso cambia alrededor del cierre de mes. Saltar ahí es dejar a alguien sin declarar. AGENTS §3b.

**Fuente:** AGENTS.md §3b
**Acción:** veredictoDelPerfil(): si dice presentada, ir a Consulta y ver la fila
**Cobertura (bancos):** `recuperar.html`

---

### R-BOT-NO-CONTESTAR-ENCUESTAS — 🔴 crítica · ✅ vigente

**Regla:** El bot nunca pulsa un botón de modal por su texto, ni contesta encuestas del SRI.

**Por qué:** El portal muestra una encuesta con un botón "Quiero responder" que enviaría una opinión en nombre del usuario. AGENTS §1.

**Fuente:** AGENTS.md §1 (NUNCA PULSAR UN BOTÓN DE MODAL POR SU TEXTO)
**Acción:** cerrarModalesNoPrimeFaces() solo usa controles de cierre explícitos

---

### R-BOT-END-PDF-REAL — 🔴 crítica · ✅ vigente

**Regla:** Un comprobante solo se guarda si la respuesta empieza con %PDF. HTML de sesión caída jamás se guarda como comprobante.

**Por qué:** Con la sesión caída el portal contesta HTML: guardarlo como PDF es peor que no tener nada (el panel diría que está y no está). AGENTS §0b.3b.

**Fuente:** AGENTS.md §0b.3b
**Acción:** validar magic bytes %PDF antes de subir
**Cobertura (bancos):** `recuperar.html`

---

### R-BOT-RESPETAR-SUGERIDO-CERO — 🔴 crítica · ✅ vigente

**Regla:** Un 0.00 sugerido oficial del SRI se respeta y se mantiene en cero. El refuerzo técnico jamás lo sobrescribe.

**Por qué:** El SRI inyecta valores sugeridos oficiales (615, 617, 564, 565): pisar un cero deliberado es declarar de más. AGENTS §3.

**Fuente:** AGENTS.md §3 (Protocolo de Casilleros y Refuerzo Técnico)
**Acción:** si el sugerido es 0.00, dejarlo en cero y devolver true
**Cobertura (bancos):** `iva5.html`

---

## 🔎 Evidencia primaria sin transcribir

- `_EVIDENCIA_SRI/codigo_fuente_decl_iva_mes.pdf` (view-source del portal, 09-sep-2026)
- `_EVIDENCIA_SRI/formulario_iva_mensual_sep_2026.pdf` (formulario real sep-2026)

Ningún id de este reglamento se tomó de esos PDFs sin pasar por el 📐.
Cuando se transcriban, se citan en `fuente.evidencia` de la regla correspondiente.