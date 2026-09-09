// ══════════════════════════════════════════════════════════════════════════
// REGLAMENTO SRI — fuente única de reglas de Nueva Luz 3.0
// ══════════════════════════════════════════════════════════════════════════
//
// ¿Qué es esto?  Cada regla de negocio que el proyecto aprendió con sangre
// (o que el contador dicta) vive acá, con su fuente y su banco de cobertura.
// Un solo lugar para gobernarse: la Biblia documenta el portal, AGENTS.md
// cuenta el porqué, este archivo es el QUÉ — ejecutable y verificable.
//
// Estructura de una regla:
//   id          inmutable. Si se borra o cambia, el banco tests/reglas.html falla.
//   severidad   'critica' (frena el envío / toca plata) | 'aviso'
//   tipo        'ley'    criterio contable/legal → lo escribe el contador, con fuente
//               'portal' cómo es el portal de verdad (evidencia: Biblia / captura)
//               'bot'    cómo se comporta el bot (seguridad del automatismo)
//   regla       el mandato, en una frase, sin ambigüedad
//   porque      la historia real que lo justifica (bug, corrida, decisión)
//   fuente      de dónde salió: doc § / Biblia / PDF de evidencia
//   accion      qué hace el bot cuando la regla aplica
//   cobertura   bancos de tests/ que demuestran que se cumple (si existen)
//   estado      'vigente' | 'requiere_contador' | 'pendiente_evidencia'
//
// REGLAS DE ORO AL EDITAR ESTE ARCHIVO:
//   1. Una regla 'ley' sin fuente legal NO se marca 'vigente': queda
//      'requiere_contador' hasta que el contador la confirme con su fuente.
//   2. No se borra una regla: se la pasa a 'descartada' con el motivo.
//   3. Si agregás una regla, agregale su banco de cobertura o dejala
//      'pendiente_evidencia' — nunca 'vigente' sin demostración.
//   4. Un número de casillero entra SOLO con evidencia (📐 / captura), nunca
//      por patrón ni por texto externo. Lo dice AGENTS §5b y salvó dos veces.
//
// Evidencia primaria sin transcribir (09-sep-2026, primera mano del portal):
//   _EVIDENCIA_SRI/codigo_fuente_decl_iva_mes.pdf      (view-source del portal)
//   _EVIDENCIA_SRI/formulario_iva_mensual_sep_2026.pdf (formulario real sep-2026)
//   Su texto no está transcrito todavía (PDF con fuente sin tabla ToUnicode y
//   capturas en imagen). NINGÚN id de este archivo se tomó de ahí sin pasar
//   por el 📐. Cuando se transcriban, se citan en 'fuente.evidencia'.
// ══════════════════════════════════════════════════════════════════════════

(function () {
  var REGLAS = [

    // ─────────────────────────────────────────────────────────────────────
    // 1 · LEY — criterio contable/legal. Las escribe el contador con fuente.
    // ─────────────────────────────────────────────────────────────────────

    {
      id: 'R-LEY-SUSTENTO-CREDITO-LIQUIDACION',
      severidad: 'critica',
      tipo: 'ley',
      regla: 'La liquidación de compra sustenta crédito tributario de IVA solo si se retuvo y depositó el 100% del IVA correspondiente.',
      porque: 'Criterio dicho por el usuario el 09-sep-2026 (AGENTS §8a). Las liquidaciones respaldan compras a quienes no pueden facturar.',
      fuente: { doc: 'AGENTS.md §8a (criterio del usuario, 09-sep-2026)' },
      accion: 'no declarada: pendiente de validar en pantalla y de que el contador fije la fuente legal',
      cobertura: [],
      estado: 'requiere_contador'
    },
    {
      id: 'R-LEY-ND-INCREMENTAN-BRUTO',
      severidad: 'critica',
      tipo: 'ley',
      regla: 'La nota de débito recibida incrementa el valor bruto del tipo de compra correspondiente en el período en que se recibe.',
      porque: 'Criterio dicho por el usuario el 09-sep-2026 (AGENTS §8a). Nunca se barrió una ND: es el tipo que falta construir.',
      fuente: { doc: 'AGENTS.md §8a (criterio del usuario, 09-sep-2026)' },
      accion: 'no construida: falta el barrido del tipo de comprobante nota de débito',
      cobertura: [],
      estado: 'requiere_contador'
    },
    {
      id: 'R-LEY-NC-REDUCEN-BASE-E-IVA',
      severidad: 'critica',
      tipo: 'ley',
      regla: 'La nota de crédito recibida reduce base imponible E IVA de compras en el período en que se recibe (neto = bruto − NC).',
      porque: 'Regla estructural del formulario; el bot ya resta NC del 510/517/550. Los excedentes por compensar (543/544/554) no se usan aún.',
      fuente: { doc: 'Biblia Formulario 2011 §2A', biblia: 'BIBLIA_FORMULARIO_IVA_2011.md' },
      accion: 'restar NC del neto del casillero correspondiente (vigente); manejar excedentes: pendiente',
      cobertura: ['iva5.html'],
      estado: 'vigente'
    },
    {
      id: 'R-LEY-CASILLERO-540-5PORCIENTO',
      severidad: 'critica',
      tipo: 'ley',
      regla: 'El casillero 540/550 es para compras legítimas al 5% (materiales de construcción). Una compra que NO es 5% exacto jamás va ahí.',
      porque: 'El falso 5% por centavos bloqueó a MIÑO, CABRERA, RAMÓN ORELLANA y WALTER MIÑO con el casillero 203. Ver AGENTS §9d y §0b.',
      fuente: { doc: 'AGENTS.md §9d y STATE.md 08-sep', biblia: 'BIBLIA_FORMULARIO_IVA_2011.md §6' },
      accion: 'clasificarTarifaIva exige cociente 5% real; las mezcladas exactas van a null, nunca al 540',
      cobertura: ['iva5.html'],
      estado: 'vigente'
    },

    // ─────────────────────────────────────────────────────────────────────
    // 2 · PORTAL — cómo es el portal de verdad (evidencia, no suposición)
    // ─────────────────────────────────────────────────────────────────────

    {
      id: 'R-PORTAL-ID-SOLO-CON-EVIDENCIA',
      severidad: 'critica',
      tipo: 'portal',
      regla: 'Un id de casillero entra al código SOLO con evidencia de que el bot escribió en él (📐 / captura). Prohibido suponerlo por patrón.',
      porque: 'El 550 resultó concepto1281 y el 540 concepto1271: el patrón existía y aun así se cablearon después de escribirlos de verdad. AGENTS §5b / §0b.5.',
      fuente: { doc: 'AGENTS.md §5b y §0b.5' },
      accion: 'todo id nuevo pasa por el botón 📐 y se anota en la Biblia antes de cablear',
      cobertura: [],
      estado: 'vigente'
    },
    {
      id: 'R-PORTAL-SALDO-USD-CERO',
      severidad: 'critica',
      tipo: 'portal',
      regla: 'El saldo del resumen viene como "USD 0.00". Decidir un envío con parseDecimal() está prohibido: devuelve 0 tanto para cero como para no-pude-leer.',
      porque: 'parseDecimal mintió y casi envía a ciegas. Para decidir plata existe parseImporteEstricto() que devuelve null cuando no hay número. AGENTS §4/§6.',
      fuente: { doc: 'AGENTS.md §4 (regla del saldo) y Matriz §6 C', biblia: 'BIBLIA_FORMULARIO_IVA_2011.md' },
      accion: 'detectarSaldo() y parseImporteEstricto() son los únicos válidos para decidir envío',
      cobertura: ['resumen.html'],
      estado: 'vigente'
    },
    {
      id: 'R-PORTAL-203-SIN-DECRETO-INVENTADO',
      severidad: 'critica',
      tipo: 'portal',
      regla: 'El casillero 203 (concepto91) tiene 17 opciones, todas decretos del 8% (feriados/turismo). El bot NUNCA elige un decreto a ciegas.',
      porque: 'Ninguna opción dice 5%. Elegir el equivocado es declarar mal. La relación 540↔203 sigue sin resolver (AGENTS §9d). La corrida real de APOLO (09-sep) volvió a frenar ahí.',
      fuente: { doc: 'AGENTS.md §9d', biblia: 'BIBLIA_FORMULARIO_IVA_2011.md §6' },
      accion: 'frenar el envío y dejar el motivo formulario_incompleto con el reclamo del 203',
      cobertura: ['iva5.html'],
      estado: 'vigente'
    },

    // ─────────────────────────────────────────────────────────────────────
    // 3 · BOT — comportamiento del automatismo (seguridad)
    // ─────────────────────────────────────────────────────────────────────

    {
      id: 'R-BOT-NUNCA-SUSTITUTIVA',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'El bot NUNCA presenta una declaración sustitutiva. Si el wizard rotula SUSTITUTIVA, no toca nada y detiene el lote.',
      porque: 'Una sustitutiva corrige una declaración aceptada: es decisión del contador. Pasó de verdad el 04-sep-2026. AGENTS §3a.',
      fuente: { doc: 'AGENTS.md §3a' },
      accion: 'frenarSiEsSustitutiva() antes de llenar y antes de enviar',
      cobertura: [],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-NUNCA-PAGA',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'El bot NUNCA paga. Si el saldo no es exactamente 0, guarda borrador y frena.',
      porque: 'Pagar es decisión del estudio. AGENTS §4 (contrato del envío).',
      fuente: { doc: 'AGENTS.md §4' },
      accion: 'ejecutarCierreMagico: saldo ≠ 0 → borrador + freno',
      cobertura: ['resumen.html'],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-NULL-NO-ES-CERO',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'Un "no sé" jamás se guarda como cero. null no es dato: es ausencia de dato.',
      porque: 'Vale para el saldo, las notas de venta, la tarifa de IVA y las sugerencias de IA. AGENTS §0a / HANDOFF §5.',
      fuente: { doc: 'AGENTS.md §0a y HANDOFF.md §5' },
      accion: 'parseImporteEstricto() devuelve null; nunca convertir null en 0 para decidir',
      cobertura: ['iva5.html', 'notasventa.html'],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-SIN-CLAVES-EN-DOM',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'Nunca se escriben claves en el DOM del portal ni en atributos data-*: solo el RUC en el elemento; la credencial se resuelve al hacer clic.',
      porque: 'La página del SRI no debe conocer las contraseñas de los clientes. AGENTS §1.',
      fuente: { doc: 'AGENTS.md §1 (CLAVES FUERA DEL DOM)' },
      accion: 'credencial contra sc_clients_cache en el momento del click',
      cobertura: ['claves.html'],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-NO-CAMBIAR-CLAVES',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'El bot nunca cambia contraseñas. Si el SRI pide cambiar la clave, omite al cliente y avisa.',
      porque: 'Cambiar la clave de un contribuyente sin pedirlo es una decisión con consecuencias. AGENTS §0a y §1.',
      fuente: { doc: 'AGENTS.md §0a' },
      accion: 'detectar clave vencida ANTES de navegar y marcar al cliente en Omitidos',
      cobertura: ['clavevencida.html'],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-NO-LEERSE-A-SI-MISMO',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'El bot nunca lee el texto de su propia interfaz como si fuera del portal.',
      porque: 'Se leyó a sí mismo tres veces (modales, login, período) y cada vez rompió distinto. AGENTS §0a.',
      fuente: { doc: 'AGENTS.md §0a (propuesta del lector único) y §2c' },
      accion: 'esDeLaExtension() / soloDelPortal(); el texto del portal se lee de la zona, no del body',
      cobertura: ['login.html', 'periodo.html'],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-AUSENCIA-NO-ES-LIMPIO',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'La ausencia de mensajes en el resumen NO significa "todo bien": hay que confirmar el estado limpio del SRI.',
      porque: 'Esa regresión permitió enviar a ciegas si el selector fallaba. AGENTS §4.',
      fuente: { doc: 'AGENTS.md §4' },
      accion: 'analizarMensajesResumen() debe devolver "limpio" explícito',
      cobertura: ['resumen.html'],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-NO-SALTEAR-POR-AVISO',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'Nunca se saltea a un contribuyente por el aviso de vencimiento: hay que comprobarlo en Consulta de declaraciones.',
      porque: 'El aviso cambia alrededor del cierre de mes. Saltar ahí es dejar a alguien sin declarar. AGENTS §3b.',
      fuente: { doc: 'AGENTS.md §3b' },
      accion: 'veredictoDelPerfil(): si dice presentada, ir a Consulta y ver la fila',
      cobertura: ['recuperar.html'],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-NO-CONTESTAR-ENCUESTAS',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'El bot nunca pulsa un botón de modal por su texto, ni contesta encuestas del SRI.',
      porque: 'El portal muestra una encuesta con un botón "Quiero responder" que enviaría una opinión en nombre del usuario. AGENTS §1.',
      fuente: { doc: 'AGENTS.md §1 (NUNCA PULSAR UN BOTÓN DE MODAL POR SU TEXTO)' },
      accion: 'cerrarModalesNoPrimeFaces() solo usa controles de cierre explícitos',
      cobertura: [],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-END-PDF-REAL',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'Un comprobante solo se guarda si la respuesta empieza con %PDF. HTML de sesión caída jamás se guarda como comprobante.',
      porque: 'Con la sesión caída el portal contesta HTML: guardarlo como PDF es peor que no tener nada (el panel diría que está y no está). AGENTS §0b.3b.',
      fuente: { doc: 'AGENTS.md §0b.3b' },
      accion: 'validar magic bytes %PDF antes de subir',
      cobertura: ['recuperar.html'],
      estado: 'vigente'
    },
    {
      id: 'R-BOT-RESPETAR-SUGERIDO-CERO',
      severidad: 'critica',
      tipo: 'bot',
      regla: 'Un 0.00 sugerido oficial del SRI se respeta y se mantiene en cero. El refuerzo técnico jamás lo sobrescribe.',
      porque: 'El SRI inyecta valores sugeridos oficiales (615, 617, 564, 565): pisar un cero deliberado es declarar de más. AGENTS §3.',
      fuente: { doc: 'AGENTS.md §3 (Protocolo de Casilleros y Refuerzo Técnico)' },
      accion: 'si el sugerido es 0.00, dejarlo en cero y devolver true',
      cobertura: ['iva5.html'],
      estado: 'vigente'
    },

    // ─────────────────────────────────────────────────────────────────────
    // 4 · HUECOS DECLARADOS — reglas que el contador debe escribir o validar
    // ─────────────────────────────────────────────────────────────────────

    {
      id: 'R-LEY-502-512-SIN-DERECHO',
      severidad: 'critica',
      tipo: 'ley',
      regla: 'Los casilleros 502/512 (compras sin derecho a crédito) existen; el bot no los usa hasta que el contador defina el mapa CIIU → deducible.',
      porque: 'Mandarlo ahí por las dudas le quita al contribuyente un crédito que quizá le corresponde. AGENTS §0b.1.',
      fuente: { doc: 'AGENTS.md §0b.1 y §9a' },
      accion: 'hoy: todo va a 500/510; el 502/512 queda sin cablear hasta el mapa (decisión del contador)',
      cobertura: [],
      estado: 'requiere_contador'
    },
    {
      id: 'R-LEY-NUMERACION-104-VS-2011',
      severidad: 'aviso',
      tipo: 'ley',
      regla: 'La numeración de la sección compras debe confirmarse contra el formulario real (el usuario describió 501/511/521 corriente y 553/554 proporcionalidad; la Biblia del 2011 dice 500/510/520 y 563/564/565).',
      porque: 'Discrepancia abierta el 09-sep-2026. No se resuelve discutiendo: se resuelve con el 📐 sobre la fila real. AGENTS §8a.',
      fuente: { doc: 'AGENTS.md §8a (advertencia de numeración)' },
      accion: '📐 sobre el formulario real → corregir Biblia o el criterio',
      cobertura: [],
      estado: 'pendiente_evidencia'
    }
  ];

  // Índice por id, para consultas rápidas y para que el banco valide unicidad.
  var POR_ID = {};
  REGLAS.forEach(function (r) {
    if (!r.id) throw new Error('Regla sin id en reglas_sri.js');
    if (POR_ID[r.id]) throw new Error('Regla duplicada en reglas_sri.js: ' + r.id);
    POR_ID[r.id] = r;
  });

  var REGLAMENTO = {
    version: '1.0.0',
    actualizado: '2026-09-09',
    reglas: REGLAS,
    porId: function (id) { return POR_ID[id] || null; },
    criticas: function () { return REGLAS.filter(function (r) { return r.severidad === 'critica'; }); },
    porEstado: function (estado) { return REGLAS.filter(function (r) { return r.estado === estado; }); }
  };

  if (typeof window !== 'undefined') window.REGLAMENTO_SRI = REGLAMENTO;
  if (typeof globalThis !== 'undefined') globalThis.REGLAMENTO_SRI = REGLAMENTO;
})();
