// SRI Gastos Personales Auto-Filler - content.js (Advanced Version)
console.log("%c SRI Gastos Personales Intelligent Assistant Loaded ", "background: #004d99; color: gold; font-weight: bold; font-size: 14px;");

// --- CONFIGURACIÓN & ESTADO ---
let IS_TURBO_RUNNING = false;
let LAST_CLICKED_ROW = null; // Fila que el usuario marcó manualmente
let USER_MAPPINGS = {};
let USER_KEYWORDS = [];
let USER_ITEM_KEYWORDS = {};
let CURRENT_CARGAS = "0";
let CURRENT_THEME = "glass"; // Default to premium glassmorphism

// Topes personalizados por rubro (0 = sin límite)
let CATEGORY_LIMITS = {
    alimentacion: 0,
    salud: 0,
    vivienda: 0,
    educacionArteCultura: 0,
    vestimenta: 0,
    turismo: 0
}; let lastTargetCategory = null;
const GEMINI_API_KEY = "AIzaSyCNgO9PD33xySEAekuQLaz_RhdxuwSkxdE";

// --- MOTOR DE IA (Gemini Pro) ---
const GeminiAI = {
    async classify(providerName, items) {
        if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("AIzaSy")) {
            // Validating key existence (AIzaSy is prefix, if only prefix it means placeholder but here we have the full key)
        }

        const itemsList = items.map(i => i.name).join(', ');
        const prompt = `Eres un experto contable tributario en Ecuador. 
        Clasifica este gasto del proveedor "${providerName}" en uno de estos rubros de Gastos Personales del SRI: 
        - alimentacion
        - salud
        - vivienda
        - educacionArteCultura
        - vestimenta
        - turismo
        - NO_DEDUCIBLE (Si es actividad de comercio, negocio, o no es personal)

        Productos detectados: [${itemsList}].
        
        Responde exclusivamente en formato JSON: {"category": "rubro_detectado", "reason": "explicación breve"}`;

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { response_mime_type: "application/json" }
                })
            });
            const data = await response.json();
            const resultText = data.candidates[0].content.parts[0].text;
            return JSON.parse(resultText);
        } catch (e) {
            console.error("[GeminiAI] Error de clasificación:", e);
            return null;
        }
    }
};

// --- MOTOR DE WORKFLOWS Y REGLAS DE NAVEGACIÓN ---
const WorkflowEngine = {
    workflows: {}, // Almacena flujos configurados por el usuario

    registerWorkflow(id, steps) {
        this.workflows[id] = steps;
        console.log(`[WorkflowEngine] Flujo '${id}' registrado exitosamente con ${steps.length} pasos.`);
    },

    async run(id) {
        const steps = this.workflows[id];
        if (!steps) {
            console.error(`[WorkflowEngine] No se encontró el flujo '${id}'.`);
            return;
        }

        console.log(`[WorkflowEngine] Iniciando flujo '${id}'...`);
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            console.log(`%c[Paso ${i + 1}] %c${step.description || step.type}`, 'font-weight: bold; color: #4caf50', 'color: #fff');
            
            // Chequear si hay pausa activa de Pilot (respetar estado global si existe)
            const isPaused = await new Promise(r => chrome.storage.local.get(['autopilotPaused'], res => r(res.autopilotPaused)));
            if (isPaused) {
                 console.log("[WorkflowEngine] Flujo pausado, abortando ejecución.");
                 break; 
            }

            try {
                await this.executeStep(step);
            } catch (e) {
                console.error(`[WorkflowEngine] Error en el Paso ${i + 1}:`, e);
                break; // Romper ejecución al fallar un paso crucial
            }
        }
        console.log(`[WorkflowEngine] Flujo '${id}' finalizado.`);
    },

    async executeStep(step) {
        const { type, selector, value, timeout, action, sleepAfter } = step;

        switch (type.toUpperCase()) {
            case 'WAIT':
                if (timeout) await new Promise(r => setTimeout(r, timeout));
                if (selector) await this.waitForElement(selector, timeout || 15000);
                break;

            case 'CLICK':
                let el = await this.waitForElement(selector, timeout || 10000);
                if (el) {
                    el.focus();
                    el.click();
                    // Espera automática para dar margen al AJAX de JSF
                    await new Promise(r => setTimeout(r, sleepAfter || 2000));
                } else {
                    throw new Error(`Elemento no encontrado para click: ${selector}`);
                }
                break;

            case 'INPUT':
                const inputEl = await this.waitForElement(selector, timeout || 10000);
                if (inputEl) {
                    inputEl.value = value;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('blur', { bubbles: true })); // Importante para validadores SRI
                    await new Promise(r => setTimeout(r, sleepAfter || 1000));
                } else {
                    throw new Error(`Campo no encontrado para input: ${selector}`);
                }
                break;
                
            case 'CUSTOM':
                 if (typeof action === 'function') {
                      await action();
                 }
                 break;

            default:
                console.warn(`[WorkflowEngine] Tipo de paso no soportado: ${type}`);
        }
    },

    // Espera inteligente: no solo que el elemento exista, sino que esté visible
    async waitForElement(selector, maxWait = 15000) {
        let elapsed = 0;
        let delay = 300;
        
        while (elapsed < maxWait) {
            const el = document.querySelector(selector);
            // Comprobación de que no es un input type="hidden" ni está oculto por CSS
            if (el && el.offsetParent !== null) {
                 return el;
            }
            await new Promise(r => setTimeout(r, delay));
            elapsed += delay;
        }
        return null;
    }
};

// --- CONFIGURACIÓN DINÁMICA DE LÍMITES ---
const CURRENT_YEAR = new Date().getFullYear();
const BUDGET_CONFIG = {
    2024: { canasta: 789.57 }, // Datos referenciales 2024
    2025: { canasta: 798.31 }  // Datos referenciales 2025
};

const ACTIVE_CONFIG = BUDGET_CONFIG[CURRENT_YEAR] || BUDGET_CONFIG[2025];
const CANASTA_BASICA = ACTIVE_CONFIG.canasta;

const TOPES_GASTOS = {
    "0": 7 * CANASTA_BASICA,    // Meta base
    "1": 9 * CANASTA_BASICA,
    "2": 11 * CANASTA_BASICA,
    "3": 14 * CANASTA_BASICA,
    "4": 17 * CANASTA_BASICA,
    "5": 20 * CANASTA_BASICA,
    "100": 100 * CANASTA_BASICA,
    "FORCE_ALL": 999999
};

const CANASTAS_DISPLAY_MAP = {
    "0": "7 Canastas", "1": "9 Canastas", "2": "11 Canastas", "3": "14 Canastas",
    "4": "17 Canastas", "5": "20 Canastas", "100": "100 Canastas"
};

function getBalancedLimit() {
    const totalTope = TOPES_GASTOS[CURRENT_CARGAS] || TOPES_GASTOS["0"];
    // Dividimos para 5 en lugar de 6 para dar un margen de "sobra" (20% extra) en cada rubro.
    return totalTope / 5;
}

/** 
 * FORMATEADOR CRÍTICO: El SRI acepta decimales con COMA.
 * Sin esto, los montos se pueden interpretar mal (Ej: 21.11 -> 2111) y sale error de "Excede".
 */
function formatSRIAmount(val) {
    if (typeof val !== 'number') return val;
    return val.toFixed(2).replace('.', ',');
}

const CAT_NAMES = {
    'alimentacion': 'Alimentación', 'salud': 'Salud', 'vivienda': 'Vivienda',
    'educacionArteCultura': 'Educación', 'vestimenta': 'Vestimenta', 'turismo': 'Turismo',
    'NO_DEDUCIBLE': 'No Deducible'
};


// Cargar mapeos, palabras clave y configuración
chrome.storage.local.get(['providerMappings', 'userKeywords', 'userItemKeywords', 'cargasFamiliares', 'selectedTheme', 'categoryLimits', 'autopilotState'], (result) => {
    if (result.providerMappings) USER_MAPPINGS = result.providerMappings;
    if (result.userKeywords) USER_KEYWORDS = result.userKeywords;
    if (result.userItemKeywords) USER_ITEM_KEYWORDS = result.userItemKeywords;
    if (result.cargasFamiliares !== undefined) CURRENT_CARGAS = result.cargasFamiliares;
    if (result.categoryLimits) CATEGORY_LIMITS = { ...CATEGORY_LIMITS, ...result.categoryLimits };

    // Default to 'glass' if not set for the first time
    CURRENT_THEME = result.selectedTheme || 'glass';

    // ASEGURAR: Al cargar la página, el asistente debe estar READY (sin pausa)
    chrome.storage.local.set({ autopilotPaused: false });

    applyTheme();

    // AUTO-REANUDAR SI HAY UN PROCESO ACTIVO
    if (result.autopilotState && result.autopilotState.active) {
        console.log("%c [Autopilot] Detectado proceso interrumpido. Reanudando... ", "background: #ff5722; color: white; padding: 2px 5px;");
        const state = result.autopilotState;
        
        // Pequeña espera para que el DOM se asiente
        setTimeout(() => {
            if (state.mode === 'A') {
                startTurboProcess(state.category, { 
                    resumeState: state,
                    multiPage: true,
                    tope: 999999 
                });
            } else if (state.mode === 'B') {
                runModeBForProvider(state.category, state);
            }
        }, 2000);
    }
});

function applyTheme() {
    chrome.storage.local.get(['selectedTheme'], (result) => {
        const theme = result.selectedTheme || 'glass';
        const container = document.getElementById('sri-assistant-container');
        if (container) {
            container.classList.remove('theme-dark', 'theme-glass', 'theme-gold', 'theme-cyber');
            if (theme !== 'default') container.classList.add(`theme-${theme}`);
        }
    });
}

function saveMapping(providerName, category, reason = null) {
    if (!providerName || providerName === "Desconocido") return;

    // --- SEGURIDAD DE ALMACENAMIENTO ---
    const mappingCount = Object.keys(USER_MAPPINGS).length;
    if (mappingCount > 1000) {
        console.warn("Límite de mapeos alcanzado. Limpiando caché... 🧹");
        const keys = Object.keys(USER_MAPPINGS);
        for (let i = 0; i < 100; i++) delete USER_MAPPINGS[keys[i]];
    }

    const current = USER_MAPPINGS[providerName];
    let newEntry = { category, reason, count: 1 };

    if (current) {
        if (typeof current === 'string') {
            if (current === category) {
                newEntry.count = 2; // Was string, now matching -> count 2
            }
        } else if (typeof current === 'object') {
            if (current.category === category && current.reason === reason) {
                newEntry.count = (current.count || 1) + 1;
            }
        }
    }

    USER_MAPPINGS[providerName] = newEntry;

    chrome.storage.local.set({ providerMappings: USER_MAPPINGS }, () => {
        const displayLabel = reason ? `${category} (${reason})` : category;
        console.log(`Guardado: ${providerName} -> ${displayLabel} (Uso #${newEntry.count})`);
        showNotification(`Aprendido: ${providerName} es ${CAT_NAMES[category] || category} ${reason ? ': ' + reason : ''} 🧠 (#${newEntry.count})`);
    });
}

function saveNoDeducibleReason(keyword) {
    if (!keyword || keyword.length < 3) return;

    const cleanKeyword = keyword.toUpperCase().trim();
    if (!USER_KEYWORDS.includes(cleanKeyword)) {
        USER_KEYWORDS.push(cleanKeyword);
        chrome.storage.local.set({ userKeywords: USER_KEYWORDS }, () => {
            console.log("Nueva palabra clave no deducible guardada:", cleanKeyword);
            showNotification(`Aprendido: "${cleanKeyword}" es No Deducible 🚫 (Gasolina/Transporte)`);
        });
    }
}

// --- BASE DE DATOS DE CONOCIMIENTO (MAESTRO DE PROVEEDORES + USUARIO) ---
const DEFAULT_PROVIDER_MAP = {
    // SALUD
    "ASEGURADORA": "salud", "SEGUROS": "salud", "FARCOMED": "salud", "FARMACIA": "salud", "MEDICITY": "salud",
    "CRUZ AZUL": "salud", "FYBECA": "salud", "SANA SANA": "salud", "HOSPITAL": "salud", "CLINICA": "salud",
    "LABORATORIO": "salud", "DOCTOR": "salud", "DR.": "salud", "DRA.": "salud", "SALUD": "salud",
    "FARMAENLACE": "salud", "ECONOMICA": "salud", "CARDIMEDI": "salud", "SCANNER CUENCA": "salud", "CORPSCANNER": "salud",
    // VIVIENDA
    "OTECEL": "vivienda", "MOVISTAR": "vivienda", "CONECEL": "vivienda", "CLARO": "vivienda", "CNT": "vivienda",
    "ETAPA": "vivienda", "INTERNET": "vivienda", "TV CABLE": "vivienda", "DIRECTV": "vivienda", "NETLIFE": "vivienda",
    "MUNICIPIO": "vivienda", "AGUA POTABLE": "vivienda", "EMPRESA ELECTRICA": "vivienda", "CNEL": "vivienda", "CONDOMINIO": "vivienda",
    "ALICUOTA": "vivienda", "BANCO": "vivienda", "COOPERATIVA": "vivienda", "FERRETERIA": "vivienda",
    "CONSTRUCCION": "vivienda", "EPA": "vivienda", "KYWI": "vivienda", "FERREMUNDO": "vivienda", "IMPROACERO": "vivienda",
    "SIKA": "vivienda", "CEMENTO": "vivienda", "HIERRO": "vivienda", "PINTURA": "vivienda", "EMPASTE": "vivienda",
    // VESTIMENTA
    "ROPA": "vestimenta", "ZAPATO": "vestimenta", "TEXTIL": "vestimenta", "MODA": "vestimenta", "BOUTIQUE": "vestimenta",
    "DE PRATI": "vestimenta", "ETAFASHION": "vestimenta", "RM": "vestimenta", "PICA": "vestimenta",
    "PRETTY STORE": "vestimenta", "CALZACUERO": "vestimenta", "BELEVA": "vestimenta",
    // ALIMENTACION
    "CORPORACION EL ROSADO": "alimentacion", "MI COMISARIATO": "alimentacion", "CORPORACION FAVORITA": "alimentacion",
    "SUPERMAXI": "alimentacion", "AKI": "alimentacion", "MEGAMAXI": "alimentacion", "TIA": "alimentacion",
    "SANTA MARIA": "alimentacion", "KFC": "alimentacion", "SHEMLON": "alimentacion", "DELI INTERNACIONAL": "alimentacion",
    "EL ESPAÑOL": "alimentacion", "RESTAURANTE": "alimentacion", "COMEDOR": "alimentacion", "POLLO": "alimentacion",
    "PIZZA": "alimentacion", "BURGER": "alimentacion", "ALIMENTOS": "alimentacion", "TIENDAS TUTI": "alimentacion",
    "TUTI": "alimentacion", "INT FOOD SERVICES": "alimentacion", "CORPORACION PAÑORA": "alimentacion",
    "CORPAÑORA": "alimentacion", "TIENDEC": "alimentacion",
    // EDUCACION, ARTE Y CULTURA
    "UNIDAD EDUCATIVA": "educacionArteCultura", "UNIVERSIDAD": "educacionArteCultura", "COLEGIO": "educacionArteCultura",
    "ESCUELA": "educacionArteCultura", "LIBRERIA": "educacionArteCultura", "PAPELERIA": "educacionArteCultura",
    "FUNDACION ESPERANZA": "educacionArteCultura", "PARROQUIA ECLESIASTICA": "educacionArteCultura",
    "BRAVO MEDINA": "educacionArteCultura",
    // NO DEDUCIBLES
    "GASOLINERA": "NO_DEDUCIBLE", "ESTACION DE SERVICIO": "NO_DEDUCIBLE", "SINDICATO DE CHOFERES": "NO_DEDUCIBLE",
    "COMBUSTIBLE": "NO_DEDUCIBLE", "DIESEL": "NO_DEDUCIBLE", "GASOLINA": "NO_DEDUCIBLE",
    "BANANO": "NO_DEDUCIBLE", "CACAO": "NO_DEDUCIBLE", "BABA": "NO_DEDUCIBLE", "MAIZ": "NO_DEDUCIBLE",
    "POR MAYOR": "NO_DEDUCIBLE", "MAYORISTA": "NO_DEDUCIBLE", "COMERCIALIZADORA": "NO_DEDUCIBLE",
    "EXPORTADORA": "NO_DEDUCIBLE", "AGRIPAC": "NO_DEDUCIBLE", "FERTISA": "NO_DEDUCIBLE",
    "IMPOLLANTAS": "NO_DEDUCIBLE", "TEDASA": "NO_DEDUCIBLE", "ARCGOLD": "NO_DEDUCIBLE", "VALAUTO": "NO_DEDUCIBLE"
};

const ITEM_KEYWORDS = {
    'alimentacion': ['POLLO', 'ARROZ', 'ACEITE', 'PAN', 'LECHE', 'CENA', 'ALMUERZO', 'COMIDA', 'RESTAURANTE', 'MENU', 'VIVERES', 'GOLOSINAS'],
    'salud': ['MEDICINA', 'FARMACIA', 'DOCTOR', 'CONSULTA', 'HOSPITAL', 'CLINICA', 'EXAMEN', 'LABORATORIO', 'BIENESTAR', 'VITAMINAS', 'ODONTOLOGO', 'MEDICO'],
    'vivienda': ['LUZ', 'AGUA', 'INTERNET', 'ARRIENDO', 'ALICUOTA', 'CELULAR', 'TELEFONO', 'EMPASTE', 'RESINA', 'CEMENTO', 'HIERRO', 'PINTURA', 'SIKA', 'FERRETERIA'],
    'vestimenta': ['ROPA', 'ZAPATOS', 'CAMISA', 'PANTALON', 'TEXTIL', 'CONFECCION', 'CALZADO'],
    'educacionArteCultura': ['MATRICULA ESTUDIANTIL', 'COLEGIATURA', 'LIBROS', 'PAPELERIA', 'CUADERNO', 'DIPLOMADO', 'CURSO ACADEMICO'],
    'turismo': ['HOTEL', 'PASAJES', 'TOURS', 'AEROLINEA', 'HOSPEDAJE'],
    'NO_DEDUCIBLE': ['DIESEL', 'GASOLINA', 'OCTANOS', 'SUPER', 'ECOPLUS', 'ESTACION DE SERVICIO', 'COMBUSTIBLE', 'LLANTA', 'ACEITE MOTOR', 'REPUESTO', 'PEAJE', 'CACAO', 'AGRO', 'FERTILIZANTE']
};

// --- BASE DE DATOS ENRIQUECIDA (BETA) ---
const KNOWLEDGE_BASE = {
    "0791740150001": { name: "CRESIO CIA. LTDA.", category: "salud" },
    "0993162161001": { name: "TIENDAS TUTI", category: "alimentacion" },
    "0968599020001": { name: "EMPRESA ELECTRICA CNEL", category: "vivienda" },
    "0791839688001": { name: "GASOLINERA SIVISAPA", category: "NO_DEDUCIBLE" },
    "0790046439001": { name: "SINDICATO DE CHOFERES PASAJE", category: "NO_DEDUCIBLE" },
    "0703055186001": { name: "ACADEMIA / EDUCACION (SCAN)", category: "educacionArteCultura" },
    "0703231274001": { name: "LAINES REYES (MAYORISTA CACAO)", category: "NO_DEDUCIBLE" },
    "0703273177001": { name: "GRANDA CORDOVA OCALIO WUALTER (Ferretería)", category: "vivienda" },
    "0702206871001": { name: "ORTIZ GONZALEZ (GASTO PERSONAL)", category: "NO_DEDUCIBLE" }
};

let AI_DESCRIPTIONS = {}; // Para guardar descripciones de Vision IA

// Cargar mapeos, palabras clave, descripciones IA y mapa global de proveedores
chrome.storage.local.get(['providerMappings', 'userKeywords', 'aiDescriptions', 'totalProviderMap'], (result) => {
    if (result.providerMappings) USER_MAPPINGS = result.providerMappings;
    if (result.userKeywords) USER_KEYWORDS = result.userKeywords;
    if (result.aiDescriptions) AI_DESCRIPTIONS = result.aiDescriptions;
    // Restaurar el mapa global de proveedores (Panorama completo)
    if (result.totalProviderMap && result.totalProviderMap.length > 0) {
        AutopilotManager.fullProvidersList = result.totalProviderMap;
        // console.log(`[Panorama] Mapa global restaurado: ${result.totalProviderMap.length} emisores`); // Silenciado por petición
    }
});

function saveAiDescription(ruc, description) {
    if (!ruc || !description) return;
    AI_DESCRIPTIONS[ruc] = description;
    chrome.storage.local.set({ aiDescriptions: AI_DESCRIPTIONS });
}

function expandAll() {
    return new Promise((resolve) => {
        const expandBtn = document.getElementById('collapse-init') ||
            Array.from(document.querySelectorAll('a, button, span, img')).find(el => {
                const text = (el.innerText || el.title || el.alt || "").toLowerCase();
                return text.includes('expandir') || text.includes('expand all');
            });

        if (expandBtn) {
            const text = (expandBtn.innerText || expandBtn.title || "").toLowerCase();

            // Solo clickear si el texto o title dice "Expandir"
            if (text.includes('expandir') || text.includes('expand')) {
                console.log("[Expandir] Click detectado para expandir detalles.");
                expandBtn.click();
                setTimeout(resolve, 800);
            } else {
                console.log("[Expandir] Ya parece estar expandido. Saltando.");
                resolve();
            }
        } else {
            resolve();
        }
    });
}

/**
 * Detects if a string is likely a person's name (Names + Surnames)
 * typical in Ecuador: 2 names + 2 surnames or 1 name + 2 surnames
 */
function isLikelyPersonName(text) {
    if (!text) return false;
    const words = text.trim().split(/\s+/);
    // Un nombre de empresa suele tener Palabras como "CJ", "SA", "CIA", "CORP", "INC" o artículos
    const companyIndicators = ["SA", "CIA", "LTDA", "CORP", "INC", "CJ", "C.A.", "C.L.", "EP", "UNIDAD", "HOSPITAL", "COLEGIO", "CONDOMINIO"];
    if (words.some(w => companyIndicators.includes(w.toUpperCase()))) return false;

    // Si tiene de 3 a 5 palabras y no tiene indicadores de empresa, es probable que sea persona
    return words.length >= 3 && words.length <= 5;
}

function detectProvider() {
    try {
        let name = null;
        let ruc = null;

        // 1. Prioridad: Paneles de información específicos del SRI
        const infoPanels = [
            '#proveedor-info', 'div[id*="panelEmisor"]', 'div[id*="infoEmisor"]',
            '.panel-heading', '.ui-panel-titlebar', '.ui-widget-header'
        ];

        for (const sel of infoPanels) {
            const el = document.querySelector(sel);
            if (el) {
                const text = (el.innerText || "").replace(/\s+/g, " ");

                // Intentar sacar RUC (13 dígitos)
                if (!ruc) {
                    const rMatch = text.match(/(\d{13})/);
                    if (rMatch) ruc = rMatch[1];
                }

                // NOMBRE - Revisar títulos (a veces el texto visible está truncado pero el title tiene el nombre completo)
                const titleEl = el.querySelector('[title]');
                if (titleEl && titleEl.getAttribute('title').length > 5) {
                    name = titleEl.getAttribute('title');
                }

                if (!name || name.length < 5) {
                    const allStrongs = Array.from(el.querySelectorAll('span.strong, strong, .ui-panel-title, b'));
                    const bestName = allStrongs.find(s => {
                        const t = s.innerText.trim();
                        return t.length > 5 && !t.includes('$') && !/^\d{8,13}$/.test(t) && !t.includes('Periodo') && !t.includes('Facturas');
                    });
                    if (bestName) name = bestName.innerText.trim();
                }

                // NOMBRE - Caso 1.5: Buscar en labels o textos descriptivos
                if (!name || name.length < 5) {
                    const allLabels = Array.from(el.querySelectorAll('label, .ui-outputlabel, td'));
                    const nameLabel = allLabels.find(l => {
                        const t = l.innerText.toUpperCase();
                        return (t.includes('EMISOR') || t.includes('SOCIAL') || t.includes('NOMBRE')) && !t.includes('BUSCAR');
                    });
                    if (nameLabel) {
                        // El valor suele ser el siguiente hermano o estar dentro de un span
                        const nextEl = nameLabel.nextElementSibling || nameLabel.parentElement.querySelector('span:not(.strong)');
                        if (nextEl && nextEl.innerText.length > 5) name = nextEl.innerText.trim();
                    }
                }

                // NOMBRE - Caso 2: Regex más amplio
                if (!name || name.length < 5) {
                    const nameMatch = text.match(/(?:Social|Nombre|Apellidos|Emisor|Contribuyente|Razon|Sujeto)[:\s]*([A-Z\.\s\&\áéíóúÁÉÍÓÚÑñ]{5,100})/i);
                    if (nameMatch) name = nameMatch[1].trim();
                }
            }
        }

        // 2. RECUPERACIÓN DE NOMBRE (Knowledge Base / Mappings)
        if (ruc && (!name || name === "Nombre no detectado")) {
            if (KNOWLEDGE_BASE[ruc]) name = KNOWLEDGE_BASE[ruc].name;
            else if (USER_MAPPINGS[ruc] && typeof USER_MAPPINGS[ruc] === 'object' && USER_MAPPINGS[ruc].name) {
                name = USER_MAPPINGS[ruc].name;
            }
        }

        // Limpieza agresiva de basura en el nombre
        if (name) {
            name = name.replace(/\s+/g, " ")
                .replace(/["']+/g, "")
                .replace(/^(NOMBRE|RAZON SOCIAL|EMISOR|CONTRIBUYENTE)[:\s-]+/i, "")
                .trim();
        }

        // 3. BÚSQUEDA AGRESIVA EN TABLAS (Vista de lista)
        if (!name || name === "Nombre no detectado" || name === "Desconocido") {
            const allTds = Array.from(document.querySelectorAll('td'));
            const rucCell = allTds.find(el => /^\d{13}$/.test(el.innerText.trim()));

            if (rucCell) {
                ruc = rucCell.innerText.trim();
                const row = rucCell.closest('tr');
                if (row) {
                    // Buscar en title si el texto está cortado (...)
                    const nameCell = row.querySelector('span[title], td[title]');
                    if (nameCell && nameCell.getAttribute('title').length > 5) {
                        name = nameCell.getAttribute('title');
                    } else {
                        const nameEl = row.querySelector('span.strong, strong, b');
                        if (nameEl) name = nameEl.innerText.trim();
                        else {
                            const rowCells = Array.from(row.querySelectorAll('td'));
                            for (const cell of rowCells) {
                                const val = cell.innerText.trim();
                                if (val.length > 5 && val !== ruc && !val.includes('$') && !val.includes('/') && !val.includes('-')) {
                                    name = val;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (name === ruc) name = null;

        return {
            name: (name && name !== "Desconocido") ? name.replace(/\s+/g, " ").trim() : "Nombre no detectado",
            ruc: (ruc && ruc !== "Desconocido") ? ruc.trim() : "RUC no detectado"
        };
    } catch (e) {
        console.error("Error detectando proveedor:", e);
    }
    return { name: "Desconocido", ruc: "Desconocido" };
}

function getCurrentTotal() {
    let totals = {
        alimentacion: 0,
        educacionArteCultura: 0,
        salud: 0,
        turismo: 0,
        vestimenta: 0,
        vivienda: 0,
        total: 0
    };

    // Mapeo EXACTO basado en el Inspector del SRI
    const sriLabelMap = {
        'Alimentación': 'alimentacion',
        'Educación, Arte y Cultura': 'educacionArteCultura',
        'Salud': 'salud',
        'Turismo': 'turismo',
        'Vestimenta': 'vestimenta',
        'Vivienda': 'vivienda'
    };

    // PRIORIDAD 1: Los botones azules redondos del SRI (es la verdad absoluta de la página)
    const resumoBtns = Array.from(document.querySelectorAll('button.btn-primary, button.ui-button, div[id*="total"] button'))
        .filter(btn => btn.innerText.includes('$') && (btn.innerText.includes(':') || btn.innerText.includes(' ')));

    if (resumoBtns.length > 0) {
        resumoBtns.forEach(btn => {
            const text = btn.innerText;
            for (const [label, key] of Object.entries(sriLabelMap)) {
                if (text.includes(label)) {
                    const match = text.match(/\$([0-9\.,]+)/);
                    if (match) {
                        const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                        if (!isNaN(val)) totals[key] = val;
                    }
                }
            }
        });
    } else {
        // PRIORIDAD 2: El resumen textual si los botones no cargan
        const pageText = document.body.innerText;
        for (const [label, key] of Object.entries(sriLabelMap)) {
            const regex = new RegExp(`${label}.*?\\$([0-9\\.,]+)`, 'i');
            const match = pageText.match(regex);
            if (match) {
                const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                if (!isNaN(val)) totals[key] = val;
            }
        }
    }

    totals.total = totals.alimentacion + totals.educacionArteCultura + totals.salud + totals.turismo + totals.vestimenta + totals.vivienda;

    // ELITE SYNC: Escanear también los inputs actuales del detalle (si estamos en vista detalle)
    // Esto hace que las barras se muevan ANTES de que el SRI actualice sus botones resumen.
    const url = window.location.href.toLowerCase();
    if (url.includes('detalle') || url.includes('facturas-') || url.includes('comprobantes-')) {
        Object.keys(CAT_NAMES).forEach(cat => {
            if (cat === 'NO_DEDUCIBLE' || cat === 'SMART') return;
            const inputs = document.querySelectorAll(`input[id*=":${cat}:campo"]`);
            let pageSum = 0;
            inputs.forEach(inp => {
                const val = parseFloat(inp.value.replace(',', '.')) || 0;
                pageSum += val;
            });
            // Si la suma de la página es mayor a lo que dice el resumen (porque acabamos de llenar y no se ha reflejado), usamos la de la página.
            // O mejor, sumamos la diferencia si el resumen no incluye la página actual.
            // Por simplicidad en esta lógica: si pageSum existe, nos aseguramos que totals[cat] sea al menos eso.
            if (pageSum > 0) {
                // El SRI a veces no incluye la pág actual en el resumen hasta que cambias de página o guardas.
                // Pero los botones resumen suelen ser el TOTAL de todas las páginas procesadas.
                // Así que solo ajustamos si detectamos que falta sincronización.
                if (totals[cat] < pageSum) totals[cat] = pageSum;
            }
        });
    }

    return totals;
}

function detectCategoryByItems() {
    const items = analyzeRideItems();
    if (items.length === 0) return null;

    // 1. Prioridad: Mapeos aprendidos por el usuario (Interactivo)
    for (const item of items) {
        for (const [cat, keywords] of Object.entries(USER_ITEM_KEYWORDS)) {
            if (keywords.some(kw => item.name.includes(kw))) return cat;
        }
    }

    // 2. Fallback: Palabras clave por defecto
    for (const item of items) {
        for (const [cat, keywords] of Object.entries(ITEM_KEYWORDS)) {
            if (keywords.some(kw => item.name.includes(kw))) return cat;
        }
    }
    return null;
}

function analyzeRideItems() {
    const modal = Array.from(document.querySelectorAll('.ui-dialog.ui-widget-content')).find(m => m.offsetParent !== null);
    if (!modal) return [];

    const items = [];
    const rows = Array.from(modal.querySelectorAll('tr'));

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        // El RIDE tiene una estructura típica de 9 columnas, Descripción suele ser la 4ta (index 3)
        if (cells.length >= 4) {
            const desc = cells[3].innerText.trim().toUpperCase();
            if (desc && desc.length > 2 && !desc.includes('DESCRIPCIÓN') && isNaN(desc)) {
                items.push({ name: desc });
            }
        }
    });

    return items;
}

function learnItemCategory(itemName, category) {
    if (!itemName || !category) return;

    if (!USER_ITEM_KEYWORDS[category]) USER_ITEM_KEYWORDS[category] = [];
    if (!USER_ITEM_KEYWORDS[category].includes(itemName)) {
        USER_ITEM_KEYWORDS[category].push(itemName);
        chrome.storage.local.set({ userItemKeywords: USER_ITEM_KEYWORDS }, () => {
            showNotification(`Producto memorizado: ${itemName} -> ${CAT_NAMES[category]}`);
            resetUI();
        });
    }
}

/**
 * UNIFIED DETECTION LOGIC (The single source of truth)
 */
function detectSmartCategory(provider) {
    const { name, ruc } = provider || detectProvider();

    if (!name && !ruc) {
        console.log("[Detector] Sin datos de proveedor para clasificar.");
        return null;
    }

    // 1. PRIORIDAD ABSOLUTA: Filtros Maestros (Nombres protegidos)
    if (name) {
        const cleanName = name.toUpperCase();
        for (const [key, category] of Object.entries(DEFAULT_PROVIDER_MAP)) {
            if (cleanName.includes(key)) {
                // console.log(`[Regla: Maestro] Coincidencia: ${key} -> ${category}`); // Silenciado para evitar spam en consola
                return category;
            }
        }

        // Hheurística para personas naturales vendiendo cacao
        if (isLikelyPersonName(name) && (cleanName.includes("CACAO") || cleanName.includes("BABA"))) {
            console.log(`[Regla: Heurística Persona Cacao] ${name} detectado como Negocio.`);
            return { category: 'NO_DEDUCIBLE', reason: 'Persona Natural - Negocio Cacao' };
        }

        // 2. Mapeos aprendidos por el usuario (PRIORIDAD SOBRE KB)
        if (ruc && USER_MAPPINGS[ruc]) {
            const entry = USER_MAPPINGS[ruc];
            const isObj = entry && typeof entry === 'object';
            const cat = isObj ? entry.category : entry;
            const reason = isObj ? entry.reason : null;
            return { category: cat, reason };
        }
        if (name && USER_MAPPINGS[name]) {
            const entry = USER_MAPPINGS[name];
            const isObj = entry && typeof entry === 'object';
            const cat = isObj ? entry.category : entry;
            const reason = isObj ? entry.reason : null;
            return { category: cat, reason };
        }

        // 3. RUC Exact Match (Knowledge Base del sistema)
        if (ruc && KNOWLEDGE_BASE[ruc]) {
            return KNOWLEDGE_BASE[ruc].category;
        }
    }

    // 4. BABA/CACAO BUSINESS DETECTION (Specific Request)
    const modalText = Array.from(document.querySelectorAll('.ui-dialog.ui-widget-content'))
        .find(m => m.offsetParent !== null)?.innerText.toUpperCase() || "";

    if (modalText.includes('CACAO') || modalText.includes('BABA')) {
        console.log(`[Regla: Negocio Cacao] Detectado Cacao/Baba en RIDE. Marcando como NO_DEDUCIBLE (Negocio).`);
        return { category: 'NO_DEDUCIBLE', reason: 'Actividad de Negocio (Cacao/Baba)' };
    }

    // 5. RIDE Item Scanning
    const itemCat = detectCategoryByItems();
    if (itemCat) {
        let finalCat = itemCat;
        // Corrección de sesgo: Salud vs Educación en RIDE
        if (itemCat === 'educacionArteCultura' && (modalText.includes('PROFESIONAL') || modalText.includes('MEDICO') || modalText.includes('ODON'))) {
            finalCat = 'salud';
        }
        console.log(`[Regla: RIDE Items] Detectado: ${finalCat}`);
        return finalCat;
    }

    // ELIMINADO: Fallback de totales de página (Causa el Sesgo de Salud)
    // console.log(`[Detector] No se pudo clasificar con seguridad a: ${name || ruc}`); // Silenciado por petición de usuario
    return null;
}

/**
 * CONTROLLED FILLING (Prevents "Blind Filling")
 * @param {string} categorySuffix - The category code or 'SMART' to detect per row
 */
/**
 * Rellena una sola fila con la categoría dada. Devuelve { count, amount }.
 */
/**
 * Verifica si una fila ya fue procesada por el SRI.
 * El SRI muestra $0,00 en el span cuando el valor fue tomado (asignado).
 */
/**
 * Busca el botón de copiado (Copy Amount) asociado a un input específico.
 * Es vital que el botón pertenezca a la misma celda o columna que el input.
 */
function findCopyButton(input, row) {
    if (!input) return null;

    // 1. Buscar en la misma celda (subiendo niveles hasta encontrar el contenedor común)
    let cellEl = input.parentElement;
    while (cellEl && cellEl !== row) {
        // Buscar botones, links o iconos de copiado
        const specificBtn = cellEl.querySelector('.fa-copy, .fa-clipboard, [id*="copiar"], [id*="copy"], [title*="Copiar"]');
        const genericBtn = cellEl.querySelector('button, a, .ui-button, .ui-commandlink');
        const btn = specificBtn || genericBtn;
        if (btn) {
            // Asegurarnos de que no haya otros inputs de otras categorías en esta misma celda/contenedor
            // (Esto garantiza que el botón que encontramos sea el que corresponde a ESTE input)
            const otherInputs = Array.from(cellEl.querySelectorAll('input[id*=":campo"]'))
                .filter(inp => inp !== input);

            if (otherInputs.length === 0) {
                // Si encontramos un icono, intentamos obtener el elemento clickeable padre
                // si el icono mismo no tiene el onclick.
                const clickable = btn.hasAttribute('onclick') ? btn : btn.closest('button, a, [onclick]');
                return clickable || btn;
            }
        }
        cellEl = cellEl.parentElement;
    }

    // 2. Fallback: Hermano inmediato
    const next = input.nextElementSibling;
    if (next && (next.matches('button, a, span, i') || next.onclick)) {
        return next;
    }

    return null;
}

function isRowAlreadyDone(row, targetCatStr, rowAmount = 0) {
    if (!targetCatStr || targetCatStr === 'SMART' || !rowAmount) return false;

    // Solo marcamos como "hecho" si el cuadro de texto YA tiene el valor cargado.
    // Esto evita que el robot salte facturas por falsos positivos de "0,00" en otras columnas (IVA, ICE, etc).
    const input = row.querySelector(`input[id*=":${targetCatStr}:campo"]`);
    if (input) {
        const val = (input.value || "").replace(',', '.').replace(/[^\d\.]/g, '');
        const currentVal = parseFloat(val) || 0;
        // Margen de 2 centavos por redondeos del SRI
        if (Math.abs(currentVal - rowAmount) < 0.02) {
            return true;
        }
    }

    return false;
}

/**
 * Calcula el monto a deducir de una fila, manejando Subtotales y Notas de Crédito (N/C).
 * @param {HTMLElement} row 
 * @param {HTMLElement} copyBtn (Opcional) botón para extraer el valor del onclick
 */
function calculateRowDeduction(row, copyBtn = null) {
    const text = (row.innerText || "").replace(/\s+/g, " ");
    
    // 1. EXTRAER VALORES BASE
    // Regex mejorado para capturar subtotales y notas de crédito considerando el prefijo (-) del usuario
    const subtotalMatch = text.match(/(?:SUBTOTAL|TOTAL|VALOR):\s*\$?([\d\.,]+)/i);
    const ncMatch = text.match(/(?:\(?-\)?\s*)?(?:N\/C|NOTA DE CR[EÉ]DITO):\s*\$?([\d\.,]+)/i);
    const maxMatch = text.match(/M[AÁ]XIMO\s+A\s+DEDUCIR:\s*\$?([\d\.,]+)/i);

    const parseVal = (str) => {
        if (!str) return 0;
        // Limpiamos todo lo que no sea dígito, coma o punto
        const cleanStr = str.replace(/[^\d,\.]/g, "");
        if (cleanStr.includes(",") && cleanStr.includes(".")) {
            // Formato 1,234.56 -> 1234.56 (Eliminamos coma de miles)
            return parseFloat(cleanStr.replace(/,/g, ""));
        } else if (cleanStr.includes(",")) {
            // Formato 1234,56 -> 1234.56 (Cambiamos coma decimal por punto)
            return parseFloat(cleanStr.replace(",", "."));
        }
        return parseFloat(cleanStr);
    };

    let subtotal = parseVal(subtotalMatch ? subtotalMatch[1] : null);
    let nc = parseVal(ncMatch ? ncMatch[1] : null);
    let maxDeducible = parseVal(maxMatch ? maxMatch[1] : null);

    console.log(`[Deducción] RAW DATA -> Subtotal: ${subtotal}, N/C: ${nc}, Máximo: ${maxDeducible}`);

    // 2. LÓGICA DE DECISIÓN (Prioridad reportada por el usuario)
    // Si hay Nota de Crédito, el valor real es Subtotal - N/C
    if (subtotal > 0 && nc > 0) {
        const result = Math.round((subtotal - nc) * 100) / 100;
        console.log(`%c [Deducción] Calculado (SUBTOTAL - N/C): ${subtotal} - ${nc} = ${result} `, "background: #4caf50; color: white;");
        return result > 0 ? result : 0;
    }

    // Si el SRI ya calculó un "MÁXIMO A DEDUCIR" y es menor al subtotal, lo honramos
    if (maxDeducible > 0 && (subtotal === 0 || maxDeducible < subtotal)) {
        console.log(`[Deducción] Usando Máximo a Deducir: ${maxDeducible}`);
        return maxDeducible;
    }

    // Fallback al subtotal simple
    if (subtotal > 0) return subtotal;

    // 3. FALLBACK FINAL: Valor del botón COPY (onclick)
    const btn = copyBtn || row.querySelector('button[onclick*="copiar"], a[onclick*="copiar"], .ui-commandlink');
    if (btn) {
        const onclick = btn.getAttribute('onclick') || btn.parentElement?.getAttribute('onclick') || "";
        const m = onclick.match(/['"]([0-9\.]+)['"]/);
        if (m) return parseFloat(m[1]);
    }

    return 0;
}

async function fillSingleRow(row, targetCatStr) {
    if (!row || !targetCatStr) return { count: 0, amount: 0 };

    const input = row.querySelector(`input[id*=":${targetCatStr}:campo"]`);
    if (!input) {
        console.warn(`[SingleFill] No encontré input para categoría ${targetCatStr} en esta fila.`);
        return { count: 0, amount: 0 };
    }

    const copyBtn = findCopyButton(input, row);
    if (!copyBtn) {
        console.warn('[SingleFill] No se encontró botón de copiar para la fila.');
        return { count: 0, amount: 0 };
    }

    // USAR NUEVA LÓGICA DE DEDUCCIÓN (Resta de Notas de Crédito)
    const rowAmount = calculateRowDeduction(row, copyBtn);

    if (isRowAlreadyDone(row, targetCatStr, rowAmount)) {
        console.log(`[SingleFill] Fila ya procesada ($${rowAmount}), omitiendo.`);
        return { count: 0, amount: 0 };
    }

    console.log(`[SingleFill] Llenando fila marcada -> ${targetCatStr} ($${rowAmount})`);

    // Feedback visual previo al click
    row.style.outline = '3px solid #3b82f6';
    copyBtn.focus();
    copyBtn.click();

    // Esperar respuesta AJAX del SRI
    await new Promise(r => setTimeout(r, 800));

    // FORZAR el valor si el SRI no lo puso o lo puso mal
    if (input) {
        const currentVal = parseFloat(input.value.replace(',', '.')) || 0;
        if (Math.abs(currentVal - rowAmount) > 0.01) {
            input.value = formatSRIAmount(rowAmount);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    }

    // VERIFICAR ÉXITO: el saldo debe ser $0,00 o el input debe tener el valor correcto
    const success = isRowAlreadyDone(row, targetCatStr, rowAmount);
    if (success) {
        console.log(`[SingleFill] ✅ Confirmado: fila procesada ($${rowAmount}).`);
        row.style.outline = '';
        row.style.backgroundColor = '#e8f5e9';
        row.style.borderLeft = '4px solid #4caf50';
        setTimeout(() => { row.style.backgroundColor = ''; row.style.borderLeft = ''; }, 2000);
    } else {
        console.warn('[SingleFill] ⚠️ No se detectó $0,00 o valor en input tras el click.');
        row.style.outline = '3px solid #ff9800';
        setTimeout(() => { row.style.outline = ''; }, 2000);
    }

    return { count: success ? 1 : 0, amount: success ? rowAmount : 0 };
}

function getPageFingerprint() {
    const rows = document.querySelectorAll('.panel-body, .ui-panel-content, .comprobante-det, tr[role="row"]');
    if (rows.length === 0) return "EMPTY_" + Math.random();
    // Tomar los primeros 50 caracteres de cada fila para crear una huella digital de la página
    return Array.from(rows).map(row => (row.innerText || "").substring(0, 100).replace(/\s+/g, '')).join('|');
}

async function fillPageSmartly(categorySuffix, limitInvoices = 0) {
    if (!IS_TURBO_RUNNING) return { count: 0, amount: 0 };

    // ── MODO FILA ÚNICA: Si el usuario seleccionó manualmente una fila, rellenar SOLO esa ──
    if (LAST_CLICKED_ROW && LAST_CLICKED_ROW.isConnected) {
        const targetCatStr = (categorySuffix && typeof categorySuffix === 'object') ? categorySuffix.category : categorySuffix;
        if (targetCatStr && targetCatStr !== 'NO_DEDUCIBLE' && targetCatStr !== 'SMART') {
            console.log('[SmartFiller] Fila marcada manualmente detectada → relleno individual.');
            const result = await fillSingleRow(LAST_CLICKED_ROW, targetCatStr);
            LAST_CLICKED_ROW = null; // Limpiar selección después de usar
            return result;
        }
    }

    // SISTEMA UNIVERSAL: Siempre expandir todo antes de buscar filas
    updateTurboUI(`Expandiendo detalles... 🔎`);
    await expandAll();

    // Esperar a que los elementos aparezcan realmente
    await waitForRows(3000);

    // 1. Identificar filas de forma robusta basada en la presencia de inputs
    const allInputsOnPage = Array.from(document.querySelectorAll('input[id*=":campo"]'));
    if (allInputsOnPage.length === 0) {
        console.warn("[SmartFiller] No se detectaron campos de entrada (:campo).");
        return { count: 0, amount: 0 };
    }

    const rowsFound = new Set();
    allInputsOnPage.forEach(input => {
        const row = input.closest('tr, .panel-body, .ui-panel-content, .comprobante-det') || input.parentElement;
        if (row) rowsFound.add(row);
    });

    let rows = Array.from(rowsFound);
    console.log(`[SmartFiller] Detectadas ${rows.length} filas potenciales para procesar.`);

    let count = 0;
    let amountProcessed = 0;

    // NORMALIZACIÓN: Asegurar que targetCat es un string para los selectores CSS
    const targetCatStr = (categorySuffix && typeof categorySuffix === 'object') ? categorySuffix.category : categorySuffix;
    lastTargetCategory = targetCatStr; // Sincronizar para resaltar en UI

    console.log(`[SmartFiller] Iniciando proceso en modo: ${targetCatStr}`);

    for (const row of rows) {
        // --- VERIFICACIÓN DE PAUSA ---
        while (true) {
            const pauseRes = await new Promise(r => chrome.storage.local.get(['autopilotPaused'], r));
            if (!pauseRes.autopilotPaused) break;
            updateTurboUI("PAUSADO ⏸️ - Esperando...");
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!IS_TURBO_RUNNING && count > 0) break; // Si paramos el turbo, dejar de procesar
        if (limitInvoices > 0 && count >= limitInvoices) break;

        try {
            let rowCat = targetCatStr;

            // Si el modo es SMART, intentamos detectar para ESTA fila o proveedor actual
            if (targetCatStr === 'SMART') {
                const provider = detectProvider();
                const detection = detectSmartCategory(provider);
                rowCat = (detection && typeof detection === 'object') ? detection.category : detection;
            }

            if (!rowCat || rowCat === 'NO_DEDUCIBLE' || rowCat === 'MIXTO') {
                console.log("[SmartFiller] Fila omitida (Sin categoría clara, No Deducible o Mix)");
                row.style.borderLeft = "4px solid #f44336"; // Mark red as warning
                continue;
            }

            const input = row.querySelector(`input[id*=":${rowCat}:campo"], input[id*=":${rowCat}"]`);
            if (!input) {
                // No loggear cada fila para no saturar la consola si no es el rubro buscado
                continue;
            }

            // 1. Encontrar el botón de copiado de forma robusta
            const copyBtn = findCopyButton(input, row);
            if (!copyBtn) {
                console.warn(`[SmartFiller] No encontré el botón de copiado para "${rowCat}" en una fila.`);
                continue;
            }

            // 2. Extraer monto (Dando prioridad a MÁXIMO A DEDUCIR o Cálculo manual Subtotal - N/C)
            const rowAmount = calculateRowDeduction(row, copyBtn);

            // 3. Verificación de "Ya Procesada" (AHORA SÍ con rowAmount definido)
            if (isRowAlreadyDone(row, rowCat, rowAmount)) {
                // console.log(`[SmartFiller] Fila ya tiene $${rowAmount}, saltando.`);
                continue;
            }

            if (rowAmount <= 0) {
                console.log(`[SmartFiller] Monto detectado como 0.00 o inválido (${rowAmount}), intentando presionar copiado ciego.`);
            }

            // 4. Ejecutar Clic y ASEGURAR PERSISTENCIA (Formato coma y 2 decimales)
            const rowText = row.innerText.substring(0, 50).replace(/\n/g, " ");
            console.log(`[SmartFiller] Llenando "${rowText}" -> ${rowCat} ($${rowAmount})`);

            copyBtn.focus();
            copyBtn.click();

            // Esperar un momento para que el script del SRI actúe
            await new Promise(r => setTimeout(r, 800)); // Acelerado (era 1200)

            // FORZAR el valor si el SRI no lo puso o lo puso sin coma/decimales correctos
            if (input && rowAmount > 0) {
                const currentVal = parseFloat(input.value.replace(',', '.')) || 0;
                if (Math.abs(currentVal - rowAmount) > 0.01) {
                    console.warn(`[SmartFiller] El valor no se marcó automáticamente. Forzando: ${rowAmount}`);
                    input.value = formatSRIAmount(rowAmount);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            count++;
            amountProcessed += rowAmount;

            // Actualizar reporte de escaneo en tiempo real (Elite Sync)
            const totalOnPage = rows.length;
            const remaining = totalOnPage - count;
            updateTurboUI(`Llenando: ${count}/${totalOnPage} | Faltan: ${remaining} ⚡`);

            // Sincronizar barras progresivas en tiempo real (Optimizado: solo texto)
            // setTimeout(() => resetUI(), 100); // ELIMINADO: Causaba loops y crashes

            // Pausa humana para permitir que los scripts del SRI actualicen sus totales
            await new Promise(r => setTimeout(r, 450)); // Acelerado (era 800)
        } catch (e) {
            console.error("Error en SmartFiller Row:", e);
        }
    }

    return { count, amount: amountProcessed };
}


/**
 * Instala listeners en las filas de facturas para rastrear qué fila
 * hizo clic el usuario (antes de clickear en categoría del asistente).
 * Esto resuelve el problema de "el SRI no detecta la factura como marcada".
 */
function installRowClickTracker() {
    // Selectores de filas con facturas
    const rowSelectors = ['.panel-body', '.ui-panel-content', '.comprobante-det'];
    let rows = [];
    for (const sel of rowSelectors) {
        const found = Array.from(document.querySelectorAll(sel)).filter(r => r.querySelector('input[id*=":campo"]'));
        if (found.length > 0) { rows = found; break; }
    }

    rows.forEach(row => {
        if (row.dataset.sriTracked) return; // No instalar doble listener
        row.dataset.sriTracked = '1';
        row.addEventListener('click', (e) => {
            // Si el usuario hace clic dentro de esta fila (pero NO en un input/button de categoría)
            // registrarla como la fila activa seleccionada
            if (e.target.closest('button, a, input[type="checkbox"]')) return; // Ignorar clics en botones
            LAST_CLICKED_ROW = row;
            // Resaltar la fila activa visualmente
            document.querySelectorAll('[data-sri-active="1"]').forEach(r => {
                r.style.outline = '';
                delete r.dataset.sriActive;
            });
            row.dataset.sriActive = '1';
            row.style.outline = '2px solid #3b82f6';
            console.log('[Tracker] Fila marcada como activa:', row.innerText.substring(0, 60).replace(/\n/g, ' '));
        }, { passive: true });
    });

    // También rastrear clics en los spans/links del número de factura (strong2/small2)
    const facturaLinks = Array.from(document.querySelectorAll('span.strong2, span.small2, .comprobante-numero, td span[class*="strong"]'));
    facturaLinks.forEach(el => {
        if (el.dataset.sriTracked) return;
        el.dataset.sriTracked = '1';
        el.addEventListener('click', (e) => {
            // Encontrar la fila contenedora
            const parentRow = el.closest('.panel-body, .ui-panel-content, .comprobante-det, tr');
            if (parentRow && parentRow.querySelector('input[id*=":campo"]')) {
                LAST_CLICKED_ROW = parentRow;
                document.querySelectorAll('[data-sri-active="1"]').forEach(r => {
                    r.style.outline = '';
                    delete r.dataset.sriActive;
                });
                parentRow.dataset.sriActive = '1';
                parentRow.style.outline = '2px solid #3b82f6';
                console.log('[Tracker] Factura seleccionada:', el.innerText.trim());
            }
        }, { passive: true });
    });
}

// Nueva función para llenar basado en la muestra de la primera fila
async function fillRowsBySample() {
    await expandAll();

    const rowSelectors = ['.panel-body', '.ui-panel-content', '.comprobante-det'];
    let rows = [];
    for (const selector of rowSelectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
            rows = Array.from(found);
            break;
        }
    }

    if (rows.length === 0) {
        showNotification("No detecté facturas en la página. 🧐", "warning");
        return 0;
    }

    const firstRow = rows[0];
    const categoriesToCopy = [];
    const possibleCategories = ['alimentacion', 'educacionArteCultura', 'salud', 'turismo', 'vestimenta', 'vivienda'];

    // 1. Detectar qué categorías tienen valor > 0 en la primera fila
    possibleCategories.forEach(cat => {
        const input = firstRow.querySelector(`input[id*=":${cat}:campo"]`);
        if (input) {
            const cleanVal = input.value.trim().replace(',', '.');
            const val = parseFloat(cleanVal);
            if (!isNaN(val) && val > 0) {
                categoriesToCopy.push(cat);
            }
        }
    });

    if (categoriesToCopy.length === 0) {
        showNotification("Llenada la primera factura y luego presiona Turbo. 💡", "warning");
        return 0;
    }

    let totalCount = 0;
    for (const row of rows) {
        // --- VERIFICACIÓN DE PAUSA ---
        while (true) {
            const pauseRes = await new Promise(r => chrome.storage.local.get(['autopilotPaused'], r));
            if (!pauseRes.autopilotPaused) break;
            updateTurboUI("PAUSADO ⏸️");
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!IS_TURBO_RUNNING && totalCount > 0) break;

        for (const cat of categoriesToCopy) {
            const input = row.querySelector(`input[id*=":${cat}:campo"]`);
            if (input) {
                // Saltar si ya tiene valor
                const currentVal = parseFloat(input.value.replace(',', '.'));
                if (!isNaN(currentVal) && currentVal > 0) continue;

                const parent = input.parentElement;
                const copyBtn = parent.querySelector('button.btn-primary, button.ui-button, a.ui-commandlink, a.btn-primary');
                if (copyBtn) {
                    copyBtn.click();
                    totalCount++;
                    // Pausa entre clics (Optimizado)
                    await new Promise(r => setTimeout(r, 250));
                }
            }
        }
    }

    return totalCount;
}

function findNextButton() {
    // 1. Prioridad: Selectores robustos por atributos y clases comunes de PrimeFaces/SRI
    // MODIFICADO: Priorizar botones numéricos que EXPLÍCITAMENTE están después de la página activa
    const activePageEl = document.querySelector('.ui-state-active, .ui-paginator-page.ui-state-active, span.active');
    if (activePageEl) {
        const nextPageNum = parseInt(activePageEl.innerText.trim()) + 1;
        
        // El usuario reportó formato: <a id="deduccion:pagina:navegacion:1:navegar">2</a>
        const specificLink = document.querySelector(`a[id="deduccion:pagina:navegacion:${nextPageNum - 1}:navegar"]`);
        if (specificLink) return specificLink;

        const targetPageLink = Array.from(document.querySelectorAll('a[id*="navegacion"], .ui-paginator-page'))
            .find(el => el.innerText.trim() === nextPageNum.toString());
        if (targetPageLink) return targetPageLink;
    }

        'a[id="deduccion:pagina:siguiente"]', 
        '#deduccion\\:pagina\\:siguiente',
        '.ui-paginator-next',
        'a[aria-label="Next Page"]',
        'a[aria-label*="Siguiente"]',
        'button.ui-paginator-next',
        '.pagination .next a',
        'input[id*="pagina"][value*="Siguiente"]',
        'a[id*="pagina"][id*="siguiente"]'
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const btn of elements) {
            const text = (btn.innerText || btn.value || "").toUpperCase();
            if (btn && !btn.disabled && !btn.classList.contains('ui-state-disabled') && btn.offsetParent !== null) {
                // Para selectores específicos, retornar de inmediato
                // EXCLUSIÓN CRÍTICA: Nunca confundir paginación de facturas con navegación de contribuyente
                if (btn.id.includes('navegacion') || btn.name?.includes('navegacion') || btn.closest('#navegacion')) {
                    continue; 
                }

                // Para selectores específicos, retornar de inmediato
                if (selectors.indexOf(selector) < 6) return btn;
                // Excluir "Siguiente Contribuyente" o "Siguiente Proveedor"
                if (text.includes('CONTRIBUYENTE') || text.includes('PROVEEDOR')) continue;
                // Para selectores genéricos (button/a), verificar que contengan texto de navegación
                if (text.includes('SIGUIENTE') || text.includes('NEXT') || text.includes('→')) return btn;
            }
        }
    }

    // 2. Búsqueda por contenido de texto (Fuzzy matching más agresivo)
    const allClickables = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], .ui-paginator-next, [role="button"], li, span[onclick]'));
    const fuzzyNext = allClickables.find(el => {
        const text = (el.innerText || el.textContent || el.value || "").toLowerCase().trim();
        // Excluir específicamente los botones que son saltos de proveedor
        if (text.includes('contribuyente') || text.includes('proveedor')) return false;

        // Buscar span interno con texto "siguiente" (especificamente pedido por el usuario)
        const innerSpans = Array.from(el.querySelectorAll('span'));
        const spanMatch = innerSpans.some(s => s.innerText.toLowerCase().includes('siguiente') && 
                                              !s.innerText.toLowerCase().includes('contribuyente') && 
                                              !s.innerText.toLowerCase().includes('proveedor'));

        // Criterio de match
        const matchesText = text.includes('siguiente') || text.includes('next') || spanMatch || text === '>>' || text === 'continuar';
        const isVisible = el.offsetParent !== null;
        const isNotSRI = !el.id.includes('sri-assistant') && !el.id.includes('sri-notification');
        const isNotDisabled = !el.disabled && !el.classList.contains('ui-state-disabled');

        return matchesText && isVisible && isNotSRI && isNotDisabled;
    });

    // 3. Intento directo sobre el span reportado por el usuario si nada funcionó
    if (!fuzzyNext) {
        const directSpan = Array.from(document.querySelectorAll('span')).find(s => s.innerText.toLowerCase().trim() === 'siguiente' && s.offsetParent !== null);
        if (directSpan) {
            return directSpan.closest('a, button, [role="button"]') || directSpan;
        }
    }

    return fuzzyNext || null;
}

/**
 * Busca específicamente el botón para pasar al siguiente proveedor/contribuyente.
 * Se mantiene por compatibilidad con la UI, pero el Turbo ya no lo usa automáticamente.
 */
function findNextProviderButton() {
    // Excluir específicamente el botón que el usuario odia si está dentro de 'navegacion'
    const selectors = [
        'input[name="navegacion:j_idt24"]',
        'input[name*="navegacion"]',
        '#navegacion\\:siguiente',
        'input[value="Siguiente"]:not([id*="pagina"])'
    ];

    for (const s of selectors) {
        const btn = document.querySelector(s);
        if (btn && btn.offsetParent !== null && !btn.disabled) return btn;
    }
    return null;
}

/**
 * Navega a una página específica del paginador del SRI (PrimeFaces).
 * Es vital para retomar el proceso tras una recarga de página.
 */
async function navigateToPage(targetPageNum) {
    if (targetPageNum <= 1) return true; // Ya estamos en la 1 por defecto al cargar

    console.log(`[Navigation] Intentando navegar a la página ${targetPageNum}...`);
    updateTurboUI(`Navegando a Pág ${targetPageNum}... ➡️`);

    // 1. Esperar a que el paginador esté visible
    await new Promise(r => setTimeout(r, 1500));

    // 2. Verificar si ya estamos en la página
    const activePageEl = document.querySelector('.ui-state-active, .ui-paginator-page.ui-state-active, span.active');
    if (activePageEl && activePageEl.innerText.trim() === targetPageNum.toString()) {
        console.log(`[Navigation] Ya estamos en la página ${targetPageNum}.`);
        return true;
    }

    // 3. Buscar el botón de la página específica
    // Formato PrimeFaces: deduccion:pagina:navegacion:X:navegar (donde X es pageNum - 1)
    let pageBtn = document.querySelector(`a[id*="navegacion:${targetPageNum - 1}:navegar"]`) ||
        Array.from(document.querySelectorAll('.ui-paginator-page, a[id*="navegacion"]'))
            .find(el => el.innerText.trim() === targetPageNum.toString());

    if (!pageBtn) {
        console.warn(`[Navigation] No se encontró botón directo para la página ${targetPageNum}. Intentando por proximidad...`);
        // Si no está el botón, puede que estemos en una página lejana. Clickeamos "Siguiente" hasta verla.
        const nextBtn = findNextButton();
        if (nextBtn) {
            nextBtn.click();
            await new Promise(r => setTimeout(r, 3000));
            return await navigateToPage(targetPageNum); // Recursión controlada
        }
        return false;
    }

    pageBtn.click();

    // 4. Esperar confirmación de cambio de página
    let success = false;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const currentActive = document.querySelector('.ui-state-active, .ui-paginator-page.ui-state-active, span.active');
        if (currentActive && currentActive.innerText.trim() === targetPageNum.toString()) {
            success = true;
            break;
        }
    }

    if (success) {
        console.log(`[Navigation] Llegamos con éxito a la Pág ${targetPageNum}.`);
        await waitForRows(8000);
        return true;
    }
    return false;
}




function findPrevButton() {
    const selectors = [
        '#navegacion\\:regresar',
        '#regresar',
        'button[id*="regresar"]',
        'a[id*="regresar"]',
        '#navegacion\\:anterior',
        '#deduccion\\:pagina\\:anterior',
        '.ui-paginator-prev'
    ];

    for (const s of selectors) {
        const btn = document.querySelector(s);
        if (btn && btn.offsetParent !== null) return btn;
    }

    return Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button, a')).find(el => {
        const text = (el.value || el.innerText || "").toLowerCase();
        return text.includes('regresar') || text.includes('volver') || text === 'anterior' || text === 'previous' || text === '<<';
    });
}

// Nueva función de apoyo para esperar a que cargue el contenido
async function waitForRows(timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        // El mejor indicador de que la página está lista para llenar son los campos :campo
        const inputs = document.querySelectorAll('input[id*=":campo"]');
        const rows = document.querySelectorAll('.panel-body, .ui-panel-content, .comprobante-det');
        if (inputs.length > 0 || rows.length > 0) return true;
        await new Promise(r => setTimeout(r, 400));
    }
    return false;
}

/**
 * GUARDADO REAL DEL SRI
 * El SRI usa el checkbox #proveedor-info:facturas-revisar que dispara
 * mojarra.ab(this,event,'valueChange',0,'deduccion') para persistir los datos.
 * Al checkearlo se envía el AJAX de guardado al servidor.
 */
async function ensureOnlyPendingChecked() {
    // Intentar por ID directo, ID parcial y búsqueda por texto
    const check = document.getElementById('proveedor-info:facturas-revisar') ||
        document.querySelector('input[id*="facturas-revisar"]') ||
        Array.from(document.querySelectorAll('label, span, td')).find(el => (el.innerText || "").toUpperCase().includes("SOLO POR REVISAR"))?.parentElement?.querySelector('input[type="checkbox"]');

    if (check && !check.checked) {
        console.log("[Filtro] Activando 'Sólo por revisar'...");
        check.click();
        // El SRI suele disparar un evento AJAX al clickear este check
        await new Promise(r => setTimeout(r, 2500));
        await waitForRows(8000); // Esperar a que la tabla se limpie
        return true;
    }
    return false;
}

async function savePage() {
    // 0. Forzar que el SRI detecte los cambios haciendo blur y lanzando eventos
    const lastInput = document.activeElement;
    if (lastInput && lastInput.tagName === 'INPUT') {
        lastInput.dispatchEvent(new Event('change', { bubbles: true }));
        lastInput.blur();
        await new Promise(r => setTimeout(r, 600));
    }

    // 1. PRIORIDAD ABSOLUTA: Botón de Guardar principal del formulario (j_idt177)
    // Usar el ID preciso suministrado por el reporte del cliente o equivalentes.
    const mainSaveBtn = document.querySelector('input[name="deduccion:j_idt177"], input[name*="j_idt177"], input[value="Guardar"]') ||
        Array.from(document.querySelectorAll('input[type="submit"], button.btn-primary'))
            .find(el => (el.value || el.innerText || "").toLowerCase().includes("guardar"));

    if (mainSaveBtn) {
        console.log('[Guardar] Presionando Botón Principal SRI (j_idt177)...');
        mainSaveBtn.click();
        // Espera extendida para que el SRI procese el formulario completo
        await new Promise(r => setTimeout(r, 6000));
        return true;
    }

    // 2. FALLBACK: Checkbox de revisión (si no hay botón o falló el anterior)
    const saveCheckbox = document.querySelector('input[id*="facturas-revisar"]');
    if (saveCheckbox) {
        console.log('[Guardar] Usando Checkbox de revisión como fallback.');
        if (!saveCheckbox.checked) {
            saveCheckbox.click();
        } else {
            saveCheckbox.click();
            await new Promise(r => setTimeout(r, 600));
            saveCheckbox.click();
        }
        await new Promise(r => setTimeout(r, 4500));
        return true;
    }

    console.warn('[Guardar] No se encontró botón j_idt177 ni checkbox en esta página.');
    return false;
}


// --- TURBO MODE (MULTI-PAGE) ---
// --- TURBO MODE (MULTI-PAGE) ---
async function startTurboProcess(category, limitInvoices = 0, limitAmount = 0, multiPage = true, resumeState = null) {
    if (IS_TURBO_RUNNING) return;

    const provider = detectProvider();

    // NORMALIZACIÓN: Asegurar que trabajamos con el string de la categoría para lógica de llenado
    let targetCatOrig = category;
    let targetCat = (category && typeof category === 'object') ? category.category : category;

    // SISTEMA DE SEGURIDAD: Preguntar si no sabemos o es No Deducible (para confirmar motivo)
    if (!targetCat || targetCat === 'MIXTO' || targetCat === 'NO_DEDUCIBLE') {
        const isAutopilotActive = await new Promise(r => chrome.storage.local.get(['autopilotState'], res => r(res.autopilotState?.active)));

        // Si el autopiloto está activo y es No Deducible, NO preguntar, solo frenar este turbo.
        if (isAutopilotActive && targetCat === 'NO_DEDUCIBLE') {
            console.log("[Turbo] Saltando modal de confirmación por Autopiloto Activo (No Deducible).");
            IS_TURBO_RUNNING = false;
            return;
        }

        const response = await showCategoryModal(provider);
        if (!response || response === 'RIDE') {
            if (response === 'RIDE') {
                const firstRide = document.querySelector('a[id*="ride"], .ui-commandlink, img[src*="pdf"]');
                if (firstRide) firstRide.click();
            }
            IS_TURBO_RUNNING = false;
            return;
        }

        targetCatOrig = response;
        targetCat = (response && typeof response === 'object') ? response.category : response;

        // Aprender para la próxima vez
        if (targetCat && targetCat !== 'NO_DEDUCIBLE' && targetCat !== 'MIXTO') {
            saveMapping(provider.ruc || provider.name, targetCatOrig);
        }

        // Si resultó ser No Deducible tras preguntar o detectar, frenamos aquí para no llenar nada.
        if (targetCat === 'NO_DEDUCIBLE') {
            const reason = (targetCatOrig && targetCatOrig.reason) ? ` (${targetCatOrig.reason})` : "";
            showNotification(`Proveedor NO DEDUCIBLE${reason}. Saltando... ⏭️`, "info");
            IS_TURBO_RUNNING = false;
            resetUI();
            return;
        }
    }

    IS_TURBO_RUNNING = true;
    updateTurboUI("Iniciando Turbo... 🚀");

    // SOLO guardar mapeo si el usuario lo confirmó o si es una detección Segura (no en modo automático ciego)
    const isAutopilotActive = await new Promise(r => chrome.storage.local.get(['autopilotState'], res => r(res.autopilotState?.active)));

    if (targetCat && provider.name && !isAutopilotActive) {
        saveMapping(provider.ruc || provider.name, targetCat);
    }

    let totalProcessed = resumeState ? (resumeState.totalDocs || 0) : 0;
    let totalAmountProcessed = resumeState ? (resumeState.totalAmount || 0) : 0;
    let currentPage = resumeState ? (resumeState.currentPage || 1) : 1;
    let stagnationCount = 0;
    let lastPageFingerprint = "";

    function getPageFingerprint() {
        return Array.from(document.querySelectorAll('.panel-body, .ui-panel-content, .comprobante-det'))
            .map(row => row.innerText.substring(0, 50)).join('|');
    }

    // MARGEN DE SEGURIDAD: Llenar hasta un 110% de la meta solicitada para asegurar que no falte nada
    const baseTope = TOPES_GASTOS[CURRENT_CARGAS] || TOPES_GASTOS["0"];
    const tope = baseTope * 1.1;

    // RECOUPERACIÓN DE POSICIÓN TRAS RECARGA
    if (currentPage > 1) {
        console.log(`[Turbo] Reanudando en Pág ${currentPage}...`);
        await navigateToPage(currentPage);
    }

    while (IS_TURBO_RUNNING) {
        // --- VERIFICACIÓN DE PAUSA ---
        while (true) {
            const pauseRes = await new Promise(r => chrome.storage.local.get(['autopilotPaused'], r));
            if (!pauseRes.autopilotPaused) break;
            updateTurboUI("PAUSADO ⏸️");
            await new Promise(r => setTimeout(r, 1000));
        }

        if (limitInvoices > 0 && totalProcessed >= limitInvoices) break;
        if (limitAmount > 0 && totalAmountProcessed >= limitAmount) break;

        // ASEGURAR QUE SOLO VEMOS PENDIENTES Y VERIFICAR FIN
        const reviewCheck = document.querySelector('input[id*="facturas-revisar"]');
        if (reviewCheck && !reviewCheck.checked) {
            updateTurboUI("Filtrando pendientes... 🔍");
            await ensureOnlyPendingChecked();
        }
        
        // VERIFICAR FIN DE PROVEEDOR
        const zeroInvoicesSpan = Array.from(document.querySelectorAll('span, div, p')).find(s => s.innerText.includes('Tiene 0 comprobantes'));
        if (zeroInvoicesSpan) {
            console.log("[Turbo] El proveedor está completamente clasificado (0 comprobantes pendientes).");
            updateTurboUI("¡Todo clasificado! ✅");
            break;
        }

        // RE-DETECCION POR PAGINA (Seguridad extrema)
        const currentProvider = detectProvider();
        let pageCat = targetCat;
        if (!pageCat) {
            const detection = detectSmartCategory(currentProvider);
            pageCat = (detection && typeof detection === 'object') ? detection.category : detection;
        }

        const currentTotals = getCurrentTotal();

        // ── TOPES POR RUBRO (configuración del cliente) ──
        if (pageCat && pageCat !== 'SMART' && pageCat !== 'NO_DEDUCIBLE') {
            const catLimit = CATEGORY_LIMITS[pageCat];
            const catCurrent = currentTotals[pageCat] || 0;
            if (catLimit > 0 && catCurrent >= catLimit) {
                showNotification(`🛑 Tope de ${CAT_NAMES[pageCat]} alcanzado: $${catCurrent.toFixed(2)} / $${catLimit.toFixed(2)}`, 'warning');
                // IMPORTANTE: Guardar lo que se haya hecho en esta página antes de salir
                await savePage();
                IS_TURBO_RUNNING = false;
                break;
            }
        }

        if (currentTotals.total >= tope) {
            updateTurboUI(`Meta Total Alcanzada ($${currentTotals.total.toFixed(2)}) 🏁`);
            if (currentTotals.total >= tope * 1.5) break;
        }

        updateTurboUI(`Procesando página... ✍️`);

        // PASO 1: LLENAR la página actual
        const result = await fillPageSmartly(pageCat || 'SMART', limitInvoices > 0 ? (limitInvoices - totalProcessed) : 0);

        if (result.count > 0) {
            totalProcessed += result.count;
            totalAmountProcessed += result.amount;
        }

        // PASO 1.5: Persistir progreso actual (en caso de que guardar o AJAX provoque recarga)
        await new Promise(r => chrome.storage.local.set({
            autopilotState: {
                active: true, mode: 'A', category, currentPage, 
                totalDocs: totalProcessed, totalAmount: totalAmountProcessed,
                providerRuc: provider.ruc, providerName: provider.name
            }
        }, r));

        // PASO 2: GUARDAR (Sincronizado)
        updateTurboUI(`Guardando pág... 💾`);
        const saved = await savePage();
        console.log(`[Turbo] Intento de guardado realizado. Facturas acumuladas: ${totalProcessed}`);

        if (!multiPage) break;

        // PASO 3: AVANZAR a la siguiente página (si existe)
        try {
            const currentFingerprint = getPageFingerprint();
            const nextBtn = findNextButton();

            // Si la página es idéntica a la anterior, incrementar estancamiento
            if (currentFingerprint === lastPageFingerprint) {
                stagnationCount++;
                console.warn(`[Turbo] La página no cambió. Estancamiento: ${stagnationCount}/8`);
            } else {
                stagnationCount = 0;
            }
            lastPageFingerprint = currentFingerprint;

            const totals = getCurrentTotal();
            const isTotalReached = totals.total >= tope;

            if (nextBtn && stagnationCount < 8 && !isTotalReached) {
                console.log("[Turbo] Siguiente página encontrada. Navegando...");
                // Sincronizar estado antes de clickar
                const targetPageNum = currentPage + 1;
                await new Promise(r => chrome.storage.local.set({
                    autopilotState: {
                        active: true, mode: 'A', category, currentPage: targetPageNum, 
                        totalDocs: totalProcessed, totalAmount: totalAmountProcessed,
                        providerRuc: provider.ruc, providerName: provider.name
                    }
                }, r));

                nextBtn.click();
                await new Promise(r => setTimeout(r, 6000)); // Esperar carga AJAX
                await waitForRows(8000);
                currentPage = targetPageNum;
                stagnationCount = 0;
                continue;
            }

            console.log("[Turbo] Detenido: Fin de páginas, meta alcanzada o estancamiento crítico para este proveedor.");
            break;
        } catch (err) {
            console.error("Error en transición de página:", err);
            break;
        }
    }

    IS_TURBO_RUNNING = false;

    showNotification(`✅ Finalizado: ${totalProcessed} facturas clasificadas de este proveedor.`, "success");
    resetUI();

    return { count: totalProcessed, amount: totalAmountProcessed };
}

function stopTurbo() {
    IS_TURBO_RUNNING = false;
    updateTurboUI("DETENIENDO... 🛑");
    // Forzar reseteo inmediato para detener cualquier loop asíncrono pendiente
    setTimeout(resetUI, 500);
}


// --- UI MANAGER ---

// --- DEEP DIVE MANAGER (RIDE EXTRACTION) ---

class DeepDiveManager {
    constructor() {
        this.isRunning = false;
        this.results = [];
    }

    async start(providerName) {
        if (this.isRunning) return;
        this.isRunning = true;
        updateTurboUI("Iniciando Escaneo Profundo... 🕵️22646A");

        try {
            await this.processPages();
            this.finish();
        } catch (e) {
            console.error("Deep Dive Error:", e);
            updateTurboUI("Error en Escaneo. 🛑");
            this.isRunning = false;
        }
    }

    async processPages() {
        while (this.isRunning) {
            // --- VERIFICACIÓN DE PAUSA ---
            while (true) {
                const pauseRes = await new Promise(r => chrome.storage.local.get(['autopilotPaused'], r));
                if (!pauseRes.autopilotPaused) break;
                updateTurboUI("SCAN PAUSADO ⏸️");
                await new Promise(r => setTimeout(r, 1000));
            }

            // 1. Scan current page for RIDE links
            await this.scanCurrentPage();

            // 2. Go to next page if available
            const nextBtn = this.getNextButton();
            if (nextBtn && !nextBtn.disabled) {
                updateTurboUI("Siguiente página... ⏭️");
                nextBtn.click();
                await this.wait(3000); // Wait for page load
            } else {
                break; // No more pages
            }
        }
    }

    getNextButton() {
        // Try multiple selectors for "Next" button in pagination
        return document.querySelector('.ui-paginator-next') ||
            document.querySelector('a[aria-label="Next Page"]');
    }

    async scanCurrentPage() {
        // Find all RIDE icons/links
        // Based on user description: "hay un icono dice ride"
        // We look for typical RIDE icon classes or text
        const rideLinks = Array.from(document.querySelectorAll('a, i')).filter(el =>
            el.innerText.toLowerCase().includes('ride') ||
            (el.title && el.title.toLowerCase().includes('ride')) ||
            (el.className && el.className.includes('fa-file-text')) // Common for details
        );

        // Filter to ensure we have clickable row actions, likely in a table
        // This part needs to be robust.
        // Strategy: Iterate table rows, find the action column.

        const rows = document.querySelectorAll('tbody tr');
        let processedInPage = 0;

        for (const row of rows) {
            if (!this.isRunning) break;

            // Find the RIDE/Detail trigger in this row
            // Usually a link or button in the last column
            const actions = row.querySelectorAll('a, button');
            let rideBtn = null;

            for (let btn of actions) {
                if (btn.innerText.includes('RIDE') || btn.title.includes('RIDE')) {
                    rideBtn = btn;
                    break;
                }
            }

            if (rideBtn) {
                updateTurboUI(`Analizando factura ${processedInPage + 1}... 🧐`);

                // Click and wait for popup/modal
                rideBtn.click();
                await this.wait(2000); // Wait for modal

                // Extract Data
                const data = this.extractRideData();
                if (data) {
                    console.log("Extracted:", data);
                    this.results.push(data);
                    // TODO: Save to storage?
                }

                // Close Modal/Back
                this.closeModal();
                await this.wait(1000);

                processedInPage++;
            }
        }

        return processedInPage;
    }

    extractRideData() {
        // En SRI, el detalle suele estar en un modal o div específico
        const modal = document.querySelector('.ui-dialog.ui-widget-content') ||
            document.querySelector('div[id*="detalle"]') ||
            document.body; // Último recurso

        if (!modal) return null;

        const data = {};
        try {
            // Buscamos la tabla de productos (suele tener más de 3 columnas)
            const tables = Array.from(modal.querySelectorAll('table'));
            const productTable = tables.find(t => t.querySelectorAll('th').length > 3) || tables[0];

            if (!productTable) return null;

            const headers = Array.from(productTable.querySelectorAll('th')).map(th => th.innerText.toLowerCase());
            const descIndex = headers.findIndex(h => h.includes('descrip') || h.includes('concepto'));
            const unitPriceIndex = headers.findIndex(h => h.includes('unitario'));
            const totalIndex = headers.findIndex(h => h.includes('total') || h.includes('subsidio'));

            const rows = productTable.querySelectorAll('tbody tr');
            const items = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    // Intento de detección inteligente de columnas por contenido si los índices fallan
                    const rowData = Array.from(cells).map(c => c.innerText.trim());

                    const item = {
                        descripcion: rowData[descIndex !== -1 ? descIndex : 2] || "",
                        cantidad: rowData[descIndex !== -1 ? descIndex - 1 : 1] || "1",
                        precioUnitario: rowData[unitPriceIndex !== -1 ? unitPriceIndex : cells.length - 2] || "0",
                        precioTotal: rowData[totalIndex !== -1 ? totalIndex : cells.length - 1] || "0"
                    };

                    if (item.descripcion && item.descripcion.length > 2) {
                        items.push(item);
                    }
                }
            });

            data.items = items;
            // Guardar texto completo para clasificación semántica posterior
            data.fullText = items.map(i => i.descripcion).join(" ");

        } catch (e) {
            console.warn("Error extrayendo datos del RIDE:", e);
            data.error = true;
        }

        return data;
    }

    closeModal() {
        const closeBtn = document.querySelector('.ui-dialog-titlebar-close');
        if (closeBtn) closeBtn.click();
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    finish() {
        this.isRunning = false;
        showNotification(`Escaneo finalizado. ${this.results.length} facturas analizadas.`);
        updateTurboUI("Escaneo Completo ✅");
        setTimeout(resetUI, 3000);
    }
}

const deepDiveManager = new DeepDiveManager();

// --- PROFESSIONAL SUMMARY ENGINE ---
function showProfessionalSummary() {
    const totals = getCurrentTotal();
    const limit = DEDUCTION_LIMITS[CURRENT_YEAR] || 4300;
    const applicableTotal = Math.min(totals.total, limit);

    // Sort categories by amount
    const sortedCats = Object.entries(CAT_NAMES)
        .map(([id, name]) => ({ id, name, val: totals[id] || 0 }))
        .sort((a, b) => b.val - a.val);

    const modalHTML = `
        <div id="sri-summary-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:1000000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px); font-family:'Outfit', sans-serif;">
            <div style="background:white; width:90%; max-width:500px; border-radius:16px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.3); animation: premiumSlideIn 0.4s ease-out;">
                <div style="background:linear-gradient(135deg, #1e3a8a, #3b82f6); color:white; padding:20px; position:relative;">
                    <h2 style="margin:0; font-size:18px; font-weight:700;">RESUMEN DE GASTOS ${CURRENT_YEAR}</h2>
                    <p style="margin:5px 0 0; font-size:12px; opacity:0.8;">Análisis Profesional por Asistente Elite</p>
                    <button id="close-summary-modal" style="position:absolute; top:15px; right:15px; background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                
                <div style="padding:20px; overflow-y:auto; max-height:70vh;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                        <div style="background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #e2e8f0;">
                            <small style="color:#64748b; font-weight:bold; display:block; margin-bottom:5px;">TOTAL ACUMULADO</small>
                            <span style="font-size:20px; font-weight:800; color:#1e3a8a;">$${totals.total.toFixed(2)}</span>
                        </div>
                        <div style="background:#f0fdf4; padding:15px; border-radius:12px; border:1px solid #bbf7d0;">
                            <small style="color:#166534; font-weight:bold; display:block; margin-bottom:5px;">BASE DEDUCIBLE</small>
                            <span style="font-size:20px; font-weight:800; color:#16a34a;">$${applicableTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    <h3 style="font-size:14px; color:#1e293b; margin-bottom:10px; border-bottom:2px solid #f1f5f9; padding-bottom:5px;">DESGLOSE POR RUBROS</h3>
                    ${sortedCats.map(cat => `
                        <div style="margin-bottom:12px;">
                            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                                <span style="font-weight:600; color:#334155;">${cat.name}</span>
                                <span style="font-weight:700; color:#1e293b;">$${cat.val.toFixed(2)}</span>
                            </div>
                            <div style="height:6px; background:#f1f5f9; border-radius:10px; overflow:hidden;">
                                <div style="width:${Math.min((cat.val / (limit / 5)) * 100, 100)}%; height:100%; background:linear-gradient(90deg, #3b82f6, #60a5fa); border-radius:10px;"></div>
                            </div>
                        </div>
                    `).join('')}

                    <div style="margin-top:20px; padding:15px; background:#fff7ed; border-radius:12px; border:1px solid #ffedd5;">
                        <p style="margin:0; font-size:11px; color:#9a3412; line-height:1.4;">
                            <strong>💡 Nota Tributaria:</strong> El límite proyectado para ${CURRENT_YEAR} es de <b>$${limit.toFixed(0)}</b>. Has cubierto el <b>${((applicableTotal / limit) * 100).toFixed(1)}%</b> de tu cupo máximo de deducción.
                        </p>
                    </div>
                </div>

                <div style="padding:20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; gap:10px;">
                    <button id="sri-copy-report" style="flex:1; background:#1e3a8a; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                        📋 COPIAR INFORME
                    </button>
                    <button id="sri-download-pdf" style="background:#f1f5f9; color:#475569; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer;" title="Descargar (Próximamente)">
                        📥
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('close-summary-modal').onclick = () => {
        document.getElementById('sri-summary-modal').remove();
    };

    document.getElementById('sri-copy-report').onclick = () => {
        const report = `📊 INFORME DE GASTOS PERSONALES ${CURRENT_YEAR}\n` +
            `------------------------------------------\n` +
            `Total Acumulado: $${totals.total.toFixed(2)}\n` +
            `Base Deducible: $${applicableTotal.toFixed(2)}\n\n` +
            `DETALLE:\n` +
            sortedCats.filter(c => c.val > 0).map(c => `- ${c.name}: $${c.val.toFixed(2)}`).join('\n') +
            `\n\nGenerado por Gastos Assistant (Ing. Santiago Cordova)`;

        navigator.clipboard.writeText(report).then(() => {
            showNotification("Informe copiado al portapapeles 📋");
            document.getElementById('sri-copy-report').innerText = "✅ ¡COPIADO!";
            setTimeout(() => { if (document.getElementById('sri-copy-report')) document.getElementById('sri-copy-report').innerText = "📋 COPIAR INFORME"; }, 2000);
        });
    };
}

// --- UI MANAGER ---

// ═══════════════════════════════════════════════════════════════════
// --- PANEL DE CONFIGURACIÓN DE TOPES POR RUBRO ---
// ═══════════════════════════════════════════════════════════════════
function showCategoryLimitsModal() {
    const existing = document.getElementById('sri-limits-modal');
    if (existing) { existing.remove(); return; }

    const totals = getCurrentTotal();

    const catConfig = [
        { id: 'alimentacion', name: 'Alimentaci\u00f3n', emoji: '\uD83C\uDF4E', color: '#16a34a', light: '#f0fdf4', border: '#bbf7d0' },
        { id: 'salud', name: 'Salud', emoji: '\u2695\uFE0F', color: '#dc2626', light: '#fef2f2', border: '#fecaca' },
        { id: 'vivienda', name: 'Vivienda', emoji: '\uD83C\uDFE0', color: '#ea580c', light: '#fff7ed', border: '#fed7aa' },
        { id: 'educacionArteCultura', name: 'Educaci\u00f3n', emoji: '\uD83C\uDF93', color: '#1d4ed8', light: '#eff6ff', border: '#bfdbfe' },
        { id: 'vestimenta', name: 'Vestimenta', emoji: '\uD83D\uDC55', color: '#7c3aed', light: '#f5f3ff', border: '#ddd6fe' },
        { id: 'turismo', name: 'Turismo', emoji: '\u2708\uFE0F', color: '#0891b2', light: '#ecfeff', border: '#a5f3fc' },
    ];

    const rowsHTML = catConfig.map(cat => {
        const current = totals[cat.id] || 0;
        const limit = CATEGORY_LIMITS[cat.id] || 0;
        const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
        const isOver = limit > 0 && current >= limit;
        const barColor = isOver ? '#ef4444' : cat.color;
        return `
        <div style="background:${cat.light};border:1px solid ${cat.border};border-radius:12px;padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:16px;">${cat.emoji}</span>
                    <div>
                        <div style="font-size:11px;font-weight:800;color:${cat.color};">${cat.name}</div>
                        <div style="font-size:9px;color:#64748b;">Actual: <b style="color:${cat.color};">$${current.toFixed(2)}</b></div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                    <span style="font-size:9px;color:#94a3b8;">Tope $</span>
                    <input id="sri-limit-input-${cat.id}" type="number" min="0" step="50"
                        value="${limit > 0 ? limit : ''}" placeholder="\u221E"
                        style="width:70px;padding:4px 6px;border:2px solid ${cat.border};border-radius:8px;font-size:11px;font-weight:700;color:${cat.color};background:white;text-align:right;outline:none;"/>
                </div>
            </div>
            ${limit > 0 ? `
            <div style="height:5px;background:rgba(0,0,0,0.06);border-radius:10px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:10px;transition:width 0.4s;"></div>
            </div>
            <div style="font-size:8px;color:${isOver ? '#ef4444' : '#94a3b8'};margin-top:2px;text-align:right;">
                ${isOver ? '\uD83D\uDED1 \u00a1TOPE ALCANZADO!' : `${pct.toFixed(0)}% \u2014 quedan $${(limit - current).toFixed(2)}`}
            </div>` : `<div style="font-size:8px;color:#94a3b8;margin-top:2px;">Sin l\u00edmite \u2014 se llenara todo lo disponible.</div>`}
        </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'sri-limits-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);font-family:"Outfit",sans-serif;';
    modal.innerHTML = `
        <div style="background:white;width:92%;max-width:440px;border-radius:20px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,0.4);">
            <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:white;padding:20px 22px;position:relative;">
                <div style="font-size:18px;font-weight:900;">\u2699\uFE0F Topes por Rubro</div>
                <div style="font-size:10px;opacity:0.7;margin-top:3px;">L\u00edmite m\u00e1ximo de gastos por categor\u00eda (por cliente)</div>
                <button id="sri-limits-close" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.15);border:none;color:white;width:28px;height:28px;border-radius:50%;font-size:16px;cursor:pointer;font-weight:bold;">\u00d7</button>
            </div>
            <div style="padding:14px 16px;max-height:65vh;overflow-y:auto;">
                <div style="background:#fefce8;border:1px solid #fef08a;border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:9.5px;color:#713f12;">
                    \uD83D\uDCA1 <b>Tip:</b> Deja en blanco (\u221E) para llenado ilimitado. El sistema para cuando el rubro alcanza su tope.
                </div>
                <div style="display:flex;gap:6px;margin-bottom:12px;">
                    <button id="sri-limits-preset-balanced" style="flex:1;padding:7px 4px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:9px;font-weight:700;color:#1d4ed8;cursor:pointer;">\u2696\uFE0F BALANCEAR (1/5 c/u)</button>
                    <button id="sri-limits-preset-clear" style="flex:1;padding:7px 4px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:9px;font-weight:700;color:#dc2626;cursor:pointer;">\uD83D\uDDD1\uFE0F LIMPIAR TODO</button>
                </div>
                ${rowsHTML}
            </div>
            <div style="padding:14px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;gap:8px;">
                <button id="sri-limits-save" style="flex:1;background:linear-gradient(135deg,#1e3a8a,#3b82f6);color:white;border:none;padding:12px;border-radius:10px;font-weight:800;cursor:pointer;font-size:13px;">\uD83D\uDCBE GUARDAR TOPES</button>
                <button id="sri-limits-close2" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:12px 16px;border-radius:10px;cursor:pointer;font-size:12px;">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('sri-limits-close').onclick = closeModal;
    document.getElementById('sri-limits-close2').onclick = closeModal;
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    document.getElementById('sri-limits-preset-balanced').onclick = () => {
        const tope = TOPES_GASTOS[CURRENT_CARGAS] || TOPES_GASTOS["0"];
        const perCat = (tope / 5).toFixed(0);
        catConfig.forEach(cat => {
            const inp = document.getElementById(`sri-limit-input-${cat.id}`);
            if (inp) inp.value = perCat;
        });
    };

    document.getElementById('sri-limits-preset-clear').onclick = () => {
        catConfig.forEach(cat => {
            const inp = document.getElementById(`sri-limit-input-${cat.id}`);
            if (inp) inp.value = '';
        });
    };

    document.getElementById('sri-limits-save').onclick = () => {
        catConfig.forEach(cat => {
            const inp = document.getElementById(`sri-limit-input-${cat.id}`);
            const val = parseFloat(inp.value);
            CATEGORY_LIMITS[cat.id] = (!isNaN(val) && val > 0) ? val : 0;
        });
        chrome.storage.local.set({ categoryLimits: CATEGORY_LIMITS }, () => {
            showNotification('\u2705 Topes guardados correctamente!', 'success');
            closeModal();
        });
    };
}

async function showCategoryModal(provider) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'sri-modal-overlay';

        const content = document.createElement('div');
        content.className = 'sri-modal-content';

        const title = document.createElement('div');
        title.className = 'sri-modal-title';
        title.innerText = `¿Qué es "${provider.name || 'este emisor'}"?`;

        const subtitle = document.createElement('div');
        subtitle.className = 'sri-modal-subtitle';
        subtitle.innerText = 'No lo reconozco. Ayúdame a clasificarlo para aprender:';

        const grid = document.createElement('div');
        grid.className = 'sri-modal-grid';

        const categories = [
            { id: 'alimentacion', name: 'Alimentación', icon: '🍎' },
            { id: 'salud', name: 'Salud', icon: '🏥' },
            { id: 'vivienda', name: 'Vivienda', icon: '🏠' },
            { id: 'educacionArteCultura', name: 'Educación', icon: '📚' },
            { id: 'vestimenta', name: 'Vestimenta', icon: '👕' },
            { id: 'turismo', name: 'Turismo', icon: '✈️' },
            { id: 'NO_DEDUCIBLE', name: 'No Deducible', icon: '🚫' }
        ];

        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'sri-btn-modal';
            btn.innerHTML = `<span>${cat.icon}</span> <span>${cat.name}</span>`;
            btn.onclick = async () => {
                if (cat.id === 'NO_DEDUCIBLE') {
                    const reason = prompt("¿Por qué es no deducible? (Ej: Gasolina, Alcohol, Repuestos)", "");
                    if (reason === null) return; // Cancelado
                    cleanup();
                    resolve({ category: 'NO_DEDUCIBLE', reason: reason || 'Gasto Personal' });
                } else {
                    cleanup();
                    resolve(cat.id);
                }
            };
            grid.appendChild(btn);
        });

        const rideBtn = document.createElement('button');
        rideBtn.className = 'sri-btn-modal sri-btn-modal-large';
        rideBtn.innerHTML = `<span>🔍 Ver RIDE (Detalle de Factura)</span>`;
        rideBtn.onclick = () => {
            cleanup();
            resolve('RIDE');
        };
        grid.appendChild(rideBtn);

        content.appendChild(title);
        content.appendChild(subtitle);
        content.appendChild(grid);
        overlay.appendChild(content);
        document.body.appendChild(overlay);

        function cleanup() {
            overlay.remove();
        }

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        };
    });
}

function updateTurboUI(statusText) {
    const btn = document.getElementById('sri-start-turbo');
    if (btn) {
        btn.innerHTML = `
            <div style="background: #f5222d; color: white; padding: 5px; border-radius: 5px; width: 100%;">
                <span class="spinner">↻</span> ${statusText} <br>
                <strong style="font-size:12px;">🛑 CLICK PARA DETENER</strong>
            </div>
        `;
        btn.style.background = '#f5222d';
        btn.style.color = 'white';
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (deepDiveManager.isRunning) deepDiveManager.stop();
            stopTurbo();
        };
        btn.classList.add('turbo-active');
    }
}




function detectCategoryByName(name) {
    if (!name) return null;
    const cleanName = name.toUpperCase();

    // 1. Mapeos de usuario (Aprendizaje)
    if (USER_MAPPINGS[name]) return USER_MAPPINGS[name];

    // 2. Mapeos por defecto
    for (const [key, category] of Object.entries(DEFAULT_PROVIDER_MAP)) {
        if (cleanName.includes(key)) return category;
    }

    return null;
}

function detectViewType() {
    const url = window.location.href.toLowerCase();

    // Lista de proveedores agrupados
    if (url.includes('facturas-electronicas-agrupadas.jsf')) return 'GROUPED_PROVIDERS';

    // RIDE externo en nueva pestaña (sriservicios o similar)
    if (url.includes('sri.gob.ec') && (url.includes('factura') || url.includes('comprobante') || url.includes('ride') || url.includes('visualizar'))) {
        return 'RIDE_EXTERNAL';
    }

    // Vista de detalle de un proveedor (facturas individuales o revisión)
    if (url.includes('facturas-') || url.includes('comprobantes-') || url.includes('revisar.jsf') || url.includes('detalle')) {
        return 'INVOICE_DETAIL';
    }

    if (url.includes('anexos.jsf')) return 'GENERATE_ANNEX';
    return 'OTHER';
}

// ===========================================================================================
// --- MODO A: AUTOMÁTICO TOTAL (PRE-ESCANEO + COLA INTELIGENTE + INFORME MAESTRO) ---
// ===========================================================================================

const AutopilotModeA = {
    isRunning: false,
    queue: [],           // [{ruc, name, total, pending, link, category}]
    sessionReport: [],   // [{ruc, name, category, docsProcessed, amount}]
    MAX_DOCS: 999,         // Sin límites: Permitir todos los proveedores
    MAX_SCAN_PAGES: 100,  // Sin límites: Escanear todas las páginas necesarias

    async start() {
        if (this.isRunning) return;
        const view = detectViewType();
        if (view !== 'GROUPED_PROVIDERS') {
            showNotification('Debes estar en la lista de proveedores para usar este modo.', 'warning');
            return;
        }

        const tope = TOPES_GASTOS[CURRENT_CARGAS] || TOPES_GASTOS["0"];
        const confirmScan = confirm(`¿Deseas iniciar el Escaneo Total (Panorama)? \n\nEl robot recorrerá todas las páginas buscando facturas pendientes para procesarlas automáticamente.\n\nMeta estimada: $${tope.toLocaleString()}`);
        if (!confirmScan) return;

        this.isRunning = true;
        this.queue = [];
        this.sessionReport = [];
        chrome.storage.local.set({ modeAActive: true, modeAReport: [] });

        showNotification(`🔍 Fase 1: Escaneando Panorama Global...`, 'info');
        await this._fullPanoramaScan();
        resetUI();

        if (this.queue.length === 0) {
            showNotification(`No se encontraron proveedores pequeños para procesar.`, 'warning');
            this.isRunning = false;
            chrome.storage.local.set({ modeAActive: false });
            return;
        }

        // Ya el _fullPanoramaScan llama a _goToPage1 al final si es necesario, pero asegurémoslo aquí
        showNotification(`🔍 Regresando a la Página 1 para iniciar...`, 'info');
        await this._goToPage1();

        showNotification(`🚀 Iniciando llenado maestro de ${this.queue.length} proveedores...`, 'success');
        await this._processQueue();
    },

    async _goToPage1() {
        console.log("[Autopilot] Navegando a Página 1...");
        let firstPageBtn = document.querySelector('.ui-paginator-first') ||
            document.querySelector('a[id*=":navegacion:0:navegar"]') ||
            Array.from(document.querySelectorAll('.ui-paginator-page')).find(p => p.innerText.trim() === '1');

        if (firstPageBtn) {
            // Verificar si ya es la página activa
            const isActive = firstPageBtn.classList.contains('ui-state-active') || firstPageBtn.parentElement?.classList.contains('ui-state-active');
            if (isActive) {
                console.log("[Autopilot] Ya estamos en la Página 1.");
                return;
            }

            firstPageBtn.click();

            // ESPERAR HASTA QUE EL BOTÓN SEA ACTIVO O TIMEOUT
            let success = false;
            for (let i = 0; i < 30; i++) { // Max 15 segundos
                await new Promise(r => setTimeout(r, 500));
                const updatedBtn = document.querySelector('.ui-paginator-first') || document.querySelector('a[id*=":navegacion:0:navegar"]');
                const isNowActive = updatedBtn?.classList.contains('ui-state-active') || updatedBtn?.parentElement?.classList.contains('ui-state-active');
                if (isNowActive) {
                    success = true;
                    break;
                }
            }
            if (!success) console.warn("[Autopilot] Timeout esperando Página 1, continuando de todos modos...");
            await waitForRows(8000);
        }
    },

    async _fullPanoramaScan() {
        // Asegurar que empezamos desde la pág 1 para el panorama
        await this._goToPage1();

        let pagesScanned = 0;
        const PANORAMA_MAX_PAGES = 40;

        while (pagesScanned < PANORAMA_MAX_PAGES) {
            pagesScanned++;
            console.log(`[PANORAMA] Analizando Página ${pagesScanned}...`);
            updateModeAProgressUI(`Escaneando Pág. ${pagesScanned}... (${this.queue.length} pequeños encontrados)`);

            const batch = this._readCurrentPageProviders();

            // RELAJADO: No detenerse solo por una página de grandes. 
            // Seguimos escaneando hasta el final o hasta que el usuario decida.
            /* 
            const allAboveLimit = batch.length > 0 && batch.every(p => p.pendingForMode > this.MAX_DOCS);
            if (allAboveLimit) {
                console.log(`[Panorama] Pág. ${pagesScanned}: Superado límite de ${this.MAX_DOCS} docs. Finalizando escaneo.`);
                break;
            }
            */

            batch.forEach(p => {
                if (p.pendingForMode >= 1 && p.pendingForMode <= this.MAX_DOCS && !this.queue.find(x => x.ruc === p.ruc)) {
                    this.queue.push(p);
                }
            });

            const nextBtn = findNextButton();
            if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('ui-state-disabled') && nextBtn.offsetParent !== null) {
                console.log(`[PANORAMA] Pasando a la siguiente página...`);
                nextBtn.click();
                await new Promise(r => setTimeout(r, 2000)); // Latencia reducida
                await waitForRows(8000);
            } else {
                console.log(`[PANORAMA] Escaneo finalizado por falta de páginas o límite alcanzado.`);
                break;
            }
        }
        chrome.storage.local.set({ modeAQueue: this.queue });
    },


    async _preScanAllPages() {
        // Ir a página 1 primero
        let firstPageBtn = document.querySelector('.ui-paginator-first') ||
            document.querySelector('a[id*=":navegacion:0:navegar"]') ||
            Array.from(document.querySelectorAll('.ui-paginator-page')).find(p => p.innerText.trim() === '1');
        if (firstPageBtn && !firstPageBtn.classList.contains('ui-state-disabled')) {
            firstPageBtn.click();
            await new Promise(r => setTimeout(r, 3000));
            await waitForRows(8000);
        }

        // El SRI ordena de MENOR a MAYOR cantidad de docs.
        // Las primeras páginas tienen los proveedores pequeños (≤MAX_DOCS).
        // No hay necesidad de ir más allá de MAX_SCAN_PAGES.
        let pagesScanned = 0;
        while (pagesScanned < this.MAX_SCAN_PAGES) {
            pagesScanned++;
            const batch = this._readCurrentPageProviders();

            // Si TODOS los proveedores de esta página ya superan el MAX_DOCS,
            // no tiene sentido seguir (el resto serán aún más grandes).
            const allAboveLimit = batch.length > 0 && batch.every(p => p.pendingForMode > this.MAX_DOCS);
            if (allAboveLimit) {
                console.log(`[ModoA] Pág. ${pagesScanned}: todos los proveedores tienen >${this.MAX_DOCS} docs. Parando escaneo.`);
                break;
            }

            batch.forEach(p => {
                // Solo incluir proveedores con 1–MAX_DOCS facturas pendientes
                if (p.pendingForMode >= 1 && p.pendingForMode <= this.MAX_DOCS && !this.queue.find(x => x.ruc === p.ruc)) {
                    this.queue.push(p);
                }
            });
            updateModeAProgressUI(`Pág. ${pagesScanned}/${this.MAX_SCAN_PAGES} — ${this.queue.length} proveedores ≤${this.MAX_DOCS} docs`);

            if (pagesScanned >= this.MAX_SCAN_PAGES) break; // Límite de páginas alcanzado

            const nextBtn = findNextButton();
            if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('ui-state-disabled') && nextBtn.offsetParent !== null) {
                nextBtn.click();
                await new Promise(r => setTimeout(r, 2000));
                await waitForRows(6000);
            } else {
                break; // No hay más páginas
            }
        }

        // Guardar cola para continuar entre recargas de página
        chrome.storage.local.set({ modeAQueue: this.queue });
    },

    _readCurrentPageProviders() {
        const rows = Array.from(document.querySelectorAll('tr')).slice(1);
        return rows.map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) return null;

            const ruc = cells[0].innerText.trim();
            const name = cells[1].innerText.trim();
            const totalStr = cells[2] ? cells[2].innerText.trim() : '0';
            const pendingStr = cells[3] ? cells[3].innerText.trim() : cells[4].innerText.trim();
            const link = cells[4]?.querySelector('a') || cells[0]?.querySelector('a') || cells[3]?.querySelector('a');

            const detection = detectSmartCategory({ name, ruc });
            const category = (detection && typeof detection === 'object') ? detection.category : detection;

            // Use max of total / pending columns (different SRI layouts)
            const pendingForMode = Math.max(total, pending);

            return { ruc, name, total, pending, pendingForMode, link, category };
        }).filter(p => p !== null && p.ruc && p.ruc.length > 5);
    },

    async _processQueue() {
        // --- VERIFICACIÓN DE PAUSA ---
        const pauseRes = await new Promise(r => chrome.storage.local.get(['autopilotPaused'], r));
        if (pauseRes.autopilotPaused) {
            console.log("[ModoA] Pausado, abortando ciclo actual. Esperando reanudación manual.");
            updateModeAProgressUI("PAUSADO ⏸️ - Esperando...");
            return;
        }

        if (!this.isRunning || this.queue.length === 0) {
            this._showMasterReport();
            return;
        }

        const next = this.queue[0];
        const totalProviders = this.queue.length + this.sessionReport.length;
        const done = this.sessionReport.length;

        // --- BUSQUEDA DEL PROVEEDOR EN LA LISTA ---
        let link = this._findProviderLink(next.ruc);

        if (!link) {
            // Si no está en esta página, intentar buscarlo en la siguiente
            console.log(`[ModoA] Buscando ${next.name} en la siguiente página...`);
            const moved = await AutopilotManager.nextScanningPage();
            if (moved) {
                setTimeout(() => this._processQueue(), 1500);
            } else {
                console.error(`[ModoA] No se encontró el proveedor ${next.name} en ninguna página.`);
                this.sessionReport.push({ ...next, docsProcessed: 0, amount: 0, skipped: true, error: "No encontrado" });
                this.queue.shift();
                setTimeout(() => this._processQueue(), 1000);
            }
            return;
        }

        chrome.storage.local.set({
            modeAActive: true,
            modeACurrentProvider: next,
            modeAQueue: this.queue,
            modeAReport: this.sessionReport,
            autopilotState: {
                active: true,
                mode: 'A',
                currentCategory: next.category,
                providerName: next.name,
                providerRuc: next.ruc,
                totalDocs: next.pendingForMode,
                doneProviders: done,
                totalProviders: totalProviders,
                limitInvoices: 999,
                limitAmount: 99999
            }
        }, () => {
            this.queue.shift();
            showNotification(`📂 Abriendo: ${next.name} (${next.pendingForMode} docs)`, 'info');
            link.click();
        });
    },

    _findProviderLink(ruc) {
        const rows = Array.from(document.querySelectorAll('tr')).slice(1);
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length > 0 && cells[0].innerText.trim() === ruc) {
                return cells[4]?.querySelector('a') || cells[0]?.querySelector('a') || cells[3]?.querySelector('a');
            }
        }
        return null;
    },


    _showMasterReport() {
        this.isRunning = false;
        // LIMPIEZA TOTAL DEL ESTADO PARA EVITAR REANUDACIONES FANTASMA
        chrome.storage.local.set({
            modeAActive: false,
            autopilotState: { active: false },
            autopilotPaused: false
        });

        // Quitar la barra de status persistente si existe
        const sBar = document.getElementById('sri-autopilot-status-bar');
        if (sBar) sBar.remove();

        const report = this.sessionReport;
        if (report.length === 0) {
            showNotification('Modo A finalizado sin datos.', 'info');
            resetUI();
            return;
        }

        const totalDocs = report.reduce((a, r) => a + (r.docsProcessed || 0), 0);
        const totalAmount = report.reduce((a, r) => a + (r.amount || 0), 0);

        const rowsHTML = report.map(r => `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:6px 4px; font-size:10px; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.name}">${r.name}</td>
                <td style="padding:6px 4px; font-size:10px; text-align:center; color:#1565c0; font-weight:bold;">${CAT_NAMES[r.category] || r.category || '—'}</td>
                <td style="padding:6px 4px; font-size:10px; text-align:center;">${r.docsProcessed || 0}</td>
                <td style="padding:6px 4px; font-size:10px; text-align:right; font-weight:bold; color:#1b5e20;">$${(r.amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        const modal = document.createElement('div');
        modal.id = 'sri-modeA-report';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:9999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);font-family:"Outfit",sans-serif;';
        modal.innerHTML = `
            <div style="background:white;width:92%;max-width:520px;border-radius:16px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.35);">
                <div style="background:linear-gradient(135deg,#1b5e20,#43a047);color:white;padding:18px 20px;position:relative;">
                    <div style="font-size:18px;font-weight:800;">🤖 INFORME MAESTRO — MODO AUTOMÁTICO</div>
                    <div style="font-size:11px;opacity:0.8;margin-top:3px;">${report.length} proveedores procesados • ${totalDocs} documentos • $${totalAmount.toFixed(2)} total</div>
                    <button id="sri-modeA-close" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;font-size:16px;cursor:pointer;font-weight:bold;">×</button>
                </div>
                <div style="padding:16px;max-height:60vh;overflow-y:auto;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f5f5f5;">
                                <th style="padding:8px 4px;font-size:10px;text-align:left;color:#555;">PROVEEDOR</th>
                                <th style="padding:8px 4px;font-size:10px;text-align:center;color:#555;">RUBRO</th>
                                <th style="padding:8px 4px;font-size:10px;text-align:center;color:#555;">DOCS</th>
                                <th style="padding:8px 4px;font-size:10px;text-align:right;color:#555;">VALOR</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                        <tfoot>
                            <tr style="background:#e8f5e9;font-weight:bold;">
                                <td style="padding:8px 4px;font-size:11px;">TOTAL</td>
                                <td></td>
                                <td style="padding:8px 4px;font-size:11px;text-align:center;">${totalDocs}</td>
                                <td style="padding:8px 4px;font-size:11px;text-align:right;color:#1b5e20;">$${totalAmount.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div style="padding:14px 16px;background:#fafafa;border-top:1px solid #eee;display:flex;gap:8px;">
                    <button id="sri-modeA-copy" style="flex:1;background:#1b5e20;color:white;border:none;padding:11px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:12px;">📋 COPIAR INFORME</button>
                    <button id="sri-modeA-close2" style="background:#f5f5f5;color:#555;border:1px solid #ddd;padding:11px 16px;border-radius:8px;cursor:pointer;font-size:12px;">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); resetUI(); };
        document.getElementById('sri-modeA-close').onclick = closeModal;
        document.getElementById('sri-modeA-close2').onclick = closeModal;
        document.getElementById('sri-modeA-copy').onclick = () => {
            const text = `📊 INFORME MAESTRO — MODO AUTOMÁTICO ${new Date().getFullYear()}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                report.map(r => `• ${r.name} | ${CAT_NAMES[r.category] || r.category || 'Sin cat.'} | ${r.docsProcessed || 0} docs | $${(r.amount || 0).toFixed(2)}`).join('\n') +
                `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `TOTAL: ${totalDocs} documentos | $${totalAmount.toFixed(2)}\n` +
                `Generado por Gastos Assistant — Ing. Santiago Cordova`;
            navigator.clipboard.writeText(text).then(() => {
                document.getElementById('sri-modeA-copy').innerText = '✅ ¡COPIADO!';
                setTimeout(() => { if (document.getElementById('sri-modeA-copy')) document.getElementById('sri-modeA-copy').innerText = '📋 COPIAR INFORME'; }, 2000);
            });
        };
    }
};

function updateModeAProgressUI(msg) {
    const btn = document.getElementById('sri-modeA-start');
    if (btn) {
        btn.innerHTML = `<span class="spinner">↻</span> ${msg}`;
    }
}

// ===========================================================================================
// --- MODO B: ASISTIDO POR PROVEEDOR (HISTORIAL + CHIPS + MINI-INFORME + AUTO-LLENAR) ---
// ===========================================================================================

let modeBSession = []; // [{ruc, name, category, docsProcessed, amount}]

/**
 * Returns the classification history for a provider from USER_MAPPINGS storage.
 * Returns [{category, reason, count}]
 */
function getMappingHistory(rucOrName) {
    const history = [];
    const entry = USER_MAPPINGS[rucOrName];
    if (!entry) return [];

    if (typeof entry === 'string') {
        history.push({ category: entry, reason: null, count: 1 });
    } else if (typeof entry === 'object' && entry.category) {
        history.push({ category: entry.category, reason: entry.reason, count: entry.count || 1 });
    }
    return history;
}

/**
 * Builds the HTML for history chips showing how many times
 * a provider was classified into each category + reason.
 * E.g. "diesel × 3" as a stylised chip.
 */
function renderHistoryChips(rucOrName) {
    // Gather all mappings: check by RUC then by Name
    const allMappings = {};

    const addEntry = (entry, key) => {
        if (!entry) return;
        const cat = typeof entry === 'string' ? entry : entry.category;
        const reason = (entry && typeof entry === 'object') ? (entry.reason || null) : null;
        const label = reason ? reason : (CAT_NAMES[cat] || cat);
        const mapKey = `${cat}__${label}`;
        if (!allMappings[mapKey]) allMappings[mapKey] = { cat, label, count: 0 };
        allMappings[mapKey].count += (entry.count || 1);
    };

    if (USER_MAPPINGS[rucOrName]) addEntry(USER_MAPPINGS[rucOrName]);

    const chips = Object.values(allMappings);
    if (chips.length === 0) return '<span style="font-size:9px;color:#aaa;font-style:italic;">Sin historial previo</span>';

    // Sort by count desc
    chips.sort((a, b) => b.count - a.count);
    const maxCount = chips[0].count;

    const catChipColors = {
        alimentacion: { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
        salud: { bg: '#fce4ec', text: '#c62828', border: '#f48fb1' },
        vivienda: { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
        educacionArteCultura: { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
        vestimenta: { bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8' },
        turismo: { bg: '#e0f7fa', text: '#00695c', border: '#80deea' },
        NO_DEDUCIBLE: { bg: '#ffebee', text: '#b71c1c', border: '#ef9a9a' }
    };

    return chips.map(chip => {
        const colors = catChipColors[chip.cat] || { bg: '#f5f5f5', text: '#555', border: '#ddd' };
        const opacity = 0.5 + (chip.count / maxCount) * 0.5;
        const fontWeight = chip.count >= 3 ? 'bold' : 'normal';
        const glow = chip.count >= 3 ? `box-shadow:0 0 6px ${colors.border};` : '';
        return `
            <div style="display:inline-flex;align-items:center;gap:3px;background:${colors.bg};color:${colors.text};border:1px solid ${colors.border};
                padding:3px 7px;border-radius:20px;font-size:9px;font-weight:${fontWeight};opacity:${opacity};${glow}margin:2px;white-space:nowrap;">
                <span>${chip.label}</span>
                ${chip.count > 1 ? `<span style="background:${colors.border};color:${colors.text};border-radius:10px;padding:0 4px;font-size:8px;font-weight:bold;">×${chip.count}</span>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Mode B: fill all pages for the current provider with a given category,
 * auto-save, show a mini-report, then navigate back.
 */
async function runModeBForProvider(category, resumeState = null) {
    if (IS_TURBO_RUNNING && !resumeState) return;

    const provider = detectProvider();
    const catName = CAT_NAMES[category] || category;

    if (!resumeState) {
        showNotification(`🤝 Modo B: Llenando todas las páginas de "${provider.name}" → ${catName}`, 'info');
    }

    IS_TURBO_RUNNING = true;

    try {
        // Restaurar estado si estamos reanudando
        let totalDocs = resumeState ? (resumeState.totalDocs || 0) : 0;
        let totalAmount = resumeState ? (resumeState.totalAmount || 0) : 0;
        let currentPage = resumeState ? (resumeState.currentPage || 1) : 1;

        updateTurboUI(`Modo B: Pág ${currentPage}... ✍️`);

        // PASO 0: Activar filtro de pendientes para ir más rápido y evitar duplicados
        await ensureOnlyPendingChecked();

        // RECOUPERACIÓN DE POSICIÓN TRAS RECARGA (Solución al bug de "Solo 1 página")
        if (currentPage > 1) {
            console.log(`[ModoB] Detectada reanudación en Pág ${currentPage}. Navegando...`);
            const navOk = await navigateToPage(currentPage);
            if (!navOk) console.warn("[ModoB] No se encontró la página objetivo, iniciando desde la actual.");
        }

        while (IS_TURBO_RUNNING) {
            // Asegurar que los datos estén cargados antes de decidir nada
            updateTurboUI(`Sincronizando con SRI... ⏳`);
            await waitForRows(8000);

            // --- VERIFICACIÓN DE PAUSA ---
            while (true) {
                const pauseRes = await new Promise(r => chrome.storage.local.get(['autopilotPaused'], r));
                if (!pauseRes.autopilotPaused) break;
                updateTurboUI("PAUSADO ⏸️");
                await new Promise(r => setTimeout(r, 1000));
            }

            // ... (rest of logic continues)

            // PASO 1: Llenar página actual
            updateTurboUI(`Llenando Pág ${currentPage}... ✍️`);
            const result = await fillPageSmartly(category, 0);

            if (result.count > 0) {
                totalDocs += result.count;
                totalAmount += result.amount;

                // GUARDAR ESTADO ANTES DE RECARGAR
                await new Promise(r => chrome.storage.local.set({
                    autopilotState: {
                        active: true, mode: 'B', category, currentPage, totalDocs, totalAmount,
                        providerRuc: provider.ruc, providerName: provider.name
                    }
                }, r));

                // PASO 2: GUARDAR PÁGINA (Provoca recarga si es j_idt177)
                updateTurboUI(`Guardando y persistiendo... 💾`);
                const saveSuccess = await savePage();

                // Si el SRI recarga la página, el código se corta aquí y el listener reinicia todo.
                // Si NO recarga (AJAX), esperamos un momento
                if (saveSuccess) {
                    console.log("[ModoB] Guardado realizado. Esperando sincronización...");
                    await new Promise(r => setTimeout(r, 3500));
                    await waitForRows(8000);
                }
            } else {
                console.log(`[ModoB] Pág ${currentPage} limpia. Verificando si hay más páginas...`);
                // Pequeña espera por si el SRI está tardando en renderizar la tabla vacía
                await new Promise(r => setTimeout(r, 1500));
            }

            // PASO 3: SIGUIENTE PÁGINA O REPROCESAR ACTUAL
            // Si el filtro "Por Revisar" está activo, y acabamos de guardar, 
            // es probable que nuevos registros hayan subido a la página actual.
            const pendingCheck = document.querySelector('input[id*="facturas-revisar"]');
            const isPendingMode = pendingCheck && pendingCheck.checked;

            if (result.count > 0 && isPendingMode) {
                console.log("[ModoB] Registros procesados en modo Pendientes. Re-escaneando página actual...");
                updateTurboUI(`Refrescando Pág ${currentPage}... 🔄`);
                await new Promise(r => setTimeout(r, 2000));
                await waitForRows(8000);
                continue; // Volver al inicio del while sin cambiar de página
            }

            const nextBtn = findNextButton();
            if (nextBtn) {
                const btnText = (nextBtn.innerText || nextBtn.value || "").trim();
                let targetPageNum = currentPage + 1;
                if (!isNaN(btnText) && btnText !== "") targetPageNum = parseInt(btnText);

                updateTurboUI(`Saltando a Pág ${targetPageNum}... ➡️`);
                
                // Guardar estado con el NUEVO número de página antes de clickear (por si recarga)
                await new Promise(r => chrome.storage.local.set({
                    autopilotState: {
                        active: true, mode: 'B', category, currentPage: targetPageNum, totalDocs, totalAmount,
                        providerRuc: provider.ruc, providerName: provider.name
                    }
                }, r));

                nextBtn.click();

                // Verificar si la página cambió físicamente (Active class)
                let pageChanged = false;
                for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 600));
                    const newActive = document.querySelector('.ui-state-active, .ui-paginator-page.ui-state-active, span.active');
                    if (newActive && newActive.innerText.trim() === targetPageNum.toString()) {
                        pageChanged = true;
                        currentPage = targetPageNum;
                        break;
                    }
                }

                if (!pageChanged) {
                    console.warn("[ModoB] La página no parece haber cambiado según el DOM. Intentando continuar...");
                    currentPage = targetPageNum; 
                }

                await waitForRows(10000);
            } else {
                console.log("[ModoB] Fin de paginación o no se encontró botón siguiente.");
                break;
            }
        }

    } finally {
        IS_TURBO_RUNNING = false;
        
        // ELIMINAR EL ESTADO ACTIVO PARA QUE NO REANUDE SOLA
        chrome.storage.local.set({ autopilotState: { active: false } });

        // Verificación final pedida por el usuario:
        // "lo ultimo seria darle click en el check de Mostrar comprobantes solo por revisar"
        console.log("[ModoB] Realizando verificación final de pendientes...");
        updateTurboUI(`Validando: 0 Pendientes... 🔍✅`);

        await ensureOnlyPendingChecked();
        // Espera para que el SRI actualice la vista tras el check (AJAX)
        await new Promise(r => setTimeout(r, 2000));
        await waitForRows(5000);

        resetUI();

        // Save mapping
        saveMapping(provider.ruc || provider.name, category); // Actualizado a la línea real

        // Add to session report
        const sessionEntry = {
            ruc: provider.ruc,
            name: provider.name,
            category,
            docsProcessed: totalDocs,
            amount: totalAmount
        };
        modeBSession.push(sessionEntry);
        chrome.storage.local.set({ modeBSession });

        showNotification(`✅ Finalizado: ${totalDocs} documentos procesados ($${totalAmount.toFixed(2)})`, 'success');

        // Pausa extendida para el mensaje final
        await new Promise(r => setTimeout(r, 4500));

        // A PETICIÓN DEL USUARIO: NO volver atrás. Que se quede en la tabla vacía del proveedor.
        console.log("[ModoB] Proceso finalizado. Esperando acción manual del usuario.");
        // const backBtn = findPrevButton();
        // if (backBtn) backBtn.click();
        // else window.history.back();
    }
}

/**
 * Función prototipo: Llena solo la página actual.
 * Expande detalles, marca facturas y se detiene para revisión/guardado manual.
 */
async function fillOnlyCurrentPage(category) {
    if (IS_TURBO_RUNNING) return;

    const catName = CAT_NAMES[category] || category;
    showNotification(`⚡ Llenando esta página → ${catName}`, 'info');

    IS_TURBO_RUNNING = true;

    try {
        // 1. Llenar la página (esto expande y marca los valores)
        const result = await fillPageSmartly(category, 0);

        // 2. GUARDADO AUTOMÁTICO (CRÍTICO pedido por el usuario)
        // El usuario notó que si solo llena y cambia de página los datos se pierden.
        updateTurboUI(`Persistiendo cambios... 💾`);
        await savePage();

        showNotification(`✅ Página cargada y GUARDADA (${result.count} docs).`, 'success');
    } catch (e) {
        console.error("Error en Llenar Página:", e);
        showNotification("Hubo un error al procesar la página.", "error");
    } finally {
        IS_TURBO_RUNNING = false;
        resetUI();
    }
}

/**
 * Mode B master report modal for the whole session.
 */
function showModeBMasterReport() {
    if (modeBSession.length === 0) {
        showNotification('Aún no has procesado ningún proveedor en esta sesión.', 'info');
        return;
    }

    const totalDocs = modeBSession.reduce((a, r) => a + (r.docsProcessed || 0), 0);
    const totalAmount = modeBSession.reduce((a, r) => a + (r.amount || 0), 0);

    // Group by category for summary
    const byCat = {};
    modeBSession.forEach(r => {
        if (!byCat[r.category]) byCat[r.category] = { docs: 0, amount: 0 };
        byCat[r.category].docs += r.docsProcessed || 0;
        byCat[r.category].amount += r.amount || 0;
    });

    const rowsHTML = modeBSession.map((r, i) => `
        <tr style="border-bottom:1px solid #f0f0f0;${i % 2 === 1 ? 'background:#fafafa;' : ''}">
            <td style="padding:6px 4px;font-size:10px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.name}">${r.name}</td>
            <td style="padding:6px 4px;font-size:10px;text-align:center;color:#1565c0;font-weight:bold;">${CAT_NAMES[r.category] || r.category}</td>
            <td style="padding:6px 4px;font-size:10px;text-align:center;">${r.docsProcessed}</td>
            <td style="padding:6px 4px;font-size:10px;text-align:right;font-weight:bold;color:#1b5e20;">$${(r.amount || 0).toFixed(2)}</td>
        </tr>
    `).join('');

    const catSummaryHTML = Object.entries(byCat).map(([cat, d]) => `
        <div style="display:flex;justify-content:space-between;font-size:10px;padding:4px 0;border-bottom:1px dashed #eee;">
            <span style="color:#333;font-weight:600;">${CAT_NAMES[cat] || cat}</span>
            <span style="color:#1b5e20;font-weight:bold;">$${d.amount.toFixed(2)} <span style="color:#888;font-weight:normal;">(${d.docs} docs)</span></span>
        </div>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'sri-modeB-report';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:9999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);font-family:"Outfit",sans-serif;';
    modal.innerHTML = `
        <div style="background:white;width:92%;max-width:520px;border-radius:16px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.35);">
            <div style="background:linear-gradient(135deg,#1a237e,#3949ab);color:white;padding:18px 20px;position:relative;">
                <div style="font-size:17px;font-weight:800;">🤝 INFORME DE SESIÓN — MODO ASISTIDO</div>
                <div style="font-size:11px;opacity:0.8;margin-top:3px;">${modeBSession.length} proveedores • ${totalDocs} documentos • $${totalAmount.toFixed(2)}</div>
                <button id="sri-modeB-close" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;font-size:16px;cursor:pointer;font-weight:bold;">×</button>
            </div>
            <div style="padding:14px 16px;max-height:58vh;overflow-y:auto;">
                <div style="margin-bottom:12px;">
                    <div style="font-size:10px;font-weight:bold;color:#555;margin-bottom:6px;text-transform:uppercase;">Resumen por Rubro</div>
                    ${catSummaryHTML}
                </div>
                <div style="font-size:10px;font-weight:bold;color:#555;margin-bottom:6px;text-transform:uppercase;">Detalle por Proveedor</div>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f5f5f5;">
                            <th style="padding:7px 4px;font-size:10px;text-align:left;color:#555;">PROVEEDOR</th>
                            <th style="padding:7px 4px;font-size:10px;text-align:center;color:#555;">RUBRO</th>
                            <th style="padding:7px 4px;font-size:10px;text-align:center;color:#555;">DOCS</th>
                            <th style="padding:7px 4px;font-size:10px;text-align:right;color:#555;">VALOR</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                    <tfoot>
                        <tr style="background:#e8eaf6;font-weight:bold;">
                            <td style="padding:8px 4px;font-size:11px;">TOTAL SESIÓN</td>
                            <td></td>
                            <td style="padding:8px 4px;font-size:11px;text-align:center;">${totalDocs}</td>
                            <td style="padding:8px 4px;font-size:11px;text-align:right;color:#1a237e;">$${totalAmount.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div style="padding:14px 16px;background:#fafafa;border-top:1px solid #eee;display:flex;gap:8px;">
                <button id="sri-modeB-copy" style="flex:1;background:#1a237e;color:white;border:none;padding:11px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:12px;">📋 COPIAR INFORME</button>
                <button id="sri-modeB-close2" style="background:#f5f5f5;color:#555;border:1px solid #ddd;padding:11px 16px;border-radius:8px;cursor:pointer;font-size:12px;">Cerrar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => { modal.remove(); };
    document.getElementById('sri-modeB-close').onclick = closeModal;
    document.getElementById('sri-modeB-close2').onclick = closeModal;
    document.getElementById('sri-modeB-copy').onclick = () => {
        const text = `📊 INFORME SESIÓN — MODO ASISTIDO ${new Date().getFullYear()}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            modeBSession.map(r => `• ${r.name} | ${CAT_NAMES[r.category] || r.category} | ${r.docsProcessed} docs | $${(r.amount || 0).toFixed(2)}`).join('\n') +
            `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `TOTAL: ${totalDocs} docs | $${totalAmount.toFixed(2)}\n` +
            `Generado por Gastos Assistant — Ing. Santiago Cordova`;
        navigator.clipboard.writeText(text).then(() => {
            document.getElementById('sri-modeB-copy').innerText = '✅ ¡COPIADO!';
            setTimeout(() => { if (document.getElementById('sri-modeB-copy')) document.getElementById('sri-modeB-copy').innerText = '📋 COPIAR INFORME'; }, 2000);
        });
    };
}

// Load modeBSession from storage on init
chrome.storage.local.get(['modeBSession'], res => {
    if (res.modeBSession) modeBSession = res.modeBSession;
});

// --- MANAGER DE AUTOPILOTO ---
const AutopilotManager = {
    isRunning: false,
    providersQueue: [],
    isScanning: false,
    fullProvidersList: [],

    async megaScan(isBackground = false) {
        if (this.isRunning || this.isScanning) return;
        this.isScanning = true;
        this.fullProvidersList = [];
        if (!isBackground) this.isRunning = true;

        if (!isBackground) showNotification('Iniciando Mapa Global de Proveedores... 🔍');

        // Límite de páginas: igual que Modo A para ser consistentes y no llegar a la pág 12
        const MAX_PAGES = isBackground ? 3 : 50;
        let pagesScanned = 0;

        while (this.isScanning && pagesScanned < MAX_PAGES) {
            pagesScanned++;
            const status = `Mapeando Panorama pág.${pagesScanned}: ${this.fullProvidersList.length} emisores...`;
            if (!isBackground) updateTurboUI(status);
            else console.log(`[Panorama-BG] ${status}`);

            const batch = this.scanProvidersRaw();
            batch.forEach(p => {
                if (!this.fullProvidersList.find(x => x.ruc === p.ruc)) {
                    this.fullProvidersList.push(p);
                }
            });

            // En background NO llamar resetUI para no interrumpir la clasificación manual
            if (!isBackground) resetUI();

            const nextBtn = findNextButton();
            if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('ui-state-disabled')) {
                nextBtn.click();
                await new Promise(r => setTimeout(r, isBackground ? 2000 : 2500));
                await waitForRows(isBackground ? 6000 : 8000);
            } else {
                break;
            }
        }

        this.isScanning = false;
        this.isRunning = false;
        if (!isBackground) updateTurboUI('Panorama Completo ✅');

        // Integrar hallazgos en mapeos permanentes
        this.fullProvidersList.forEach(p => {
            if (p.category && p.category !== 'NO_DEDUCIBLE' && !USER_MAPPINGS[p.ruc]) {
                saveMapping(p.ruc || p.name, p.category, 'Detección Panorama');
            }
        });

        // Guardar en storage para persistencia del mapa
        chrome.storage.local.set({ totalProviderMap: this.fullProvidersList });

        if (!isBackground) {
            showNotification(`Panorama completo: ${this.fullProvidersList.length} emisores mapeados.`, 'success');
            setTimeout(resetUI, 1500);
        } else {
            // Solo un reset al FINAL del escaneo background (no en cada página)
            console.log(`[Panorama-BG] Completado: ${this.fullProvidersList.length} emisores.`);
            resetUI();
        }
    },

    scanProvidersRaw() {
        const rows = Array.from(document.querySelectorAll('tr')).slice(1);
        return rows.map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) return null;

            const ruc = cells[0].innerText.trim();
            const name = cells[1].innerText.trim();
            const total = parseInt(cells[3].innerText.trim()) || 0;
            const pending = parseInt(cells[4].innerText.trim()) || 0;
            const link = cells[4].querySelector('a') || cells[0].querySelector('a');

            const detection = detectSmartCategory({ name, ruc });
            const category = (detection && typeof detection === 'object') ? detection.category : detection;

            return { ruc, name, total, pending, link, category };
        }).filter(p => p !== null);
    },

    async nextScanningPage() {
        const nextBtn = findNextButton();
        if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('ui-state-disabled')) {
            nextBtn.click();
            await new Promise(r => setTimeout(r, 2500));
            await waitForRows(8000);
            return true;
        }
        return false;
    },

    async start(force = false) {
        // Logica estratégica para llegar a la meta ($5000+)
        const targetGoal = 100000; // Meta muy alta por pedido de usuario (Sin límites)
        const currentTotals = getCurrentTotal();
        const remaining = targetGoal - currentTotals.total;

        if (remaining <= 0) {
            showNotification("¡Meta alcanzada! 🎉", "success");
        }

        if (this.isRunning && !force) return;
        const view = detectViewType();
        if (view !== 'GROUPED_PROVIDERS') return;

        this.isRunning = true;
        chrome.storage.local.set({ autopilotPaused: false });
        await this.scanProviders();
        this.processNextProvider();
    },

    async resetAndStart() {
        showNotification("Navegando al inicio (Página 1)... 🔄", "info");

        // Limpiar Panorama previo para empezar de cero si no hay escaneo manual
        this.fullProvidersList = [];
        chrome.storage.local.remove('totalProviderMap');

        // 1. Intentar ir a la primera página de la tabla
        let firstPageBtn = document.querySelector('a[id*=":navegacion:0:navegar"]') ||
            document.querySelector('.ui-paginator-first') ||
            Array.from(document.querySelectorAll('.pagination li a')).find(p => p.innerText.trim() === '1') ||
            Array.from(document.querySelectorAll('.ui-paginator-page')).find(p => p.innerText.trim() === '1');

        const isAlreadyOnFirst = !firstPageBtn || firstPageBtn.parentElement?.classList.contains('active');

        if (firstPageBtn && !firstPageBtn.classList.contains('ui-state-disabled') && !isAlreadyOnFirst) {
            console.log("[Autopilot] Navegando a Página 1...");
            firstPageBtn.click();
            await new Promise(r => setTimeout(r, 4500));
            await waitForRows(8000);
        }

        // 2. UNA VEZ EN PÁGINA 1, iniciar el proceso
        this.isRunning = true;
        chrome.storage.local.set({ autopilotPaused: false });
        await this.scanProviders();
        this.processNextProvider();
    },

    async scanProviders() {
        // ENFOQUE 1-A-1: Solo leer la tabla actual en su orden natural
        const rows = Array.from(document.querySelectorAll('tr')).slice(1);
        this.providersQueue = rows.map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) return null;

            const ruc = cells[0].innerText.trim();
            const name = cells[1].innerText.trim();
            const pending = parseInt(cells[4].innerText.trim()) || 0;
            const link = cells[4].querySelector('a') || cells[0].querySelector('a');

            // Categorización simple
            const detection = detectSmartCategory({ name, ruc });
            const category = (detection && typeof detection === 'object') ? detection.category : detection;

            return { ruc, name, pending, link, category };
        }).filter(p => p !== null && p.pending > 0);

        console.log(`[Autopilot] Escaneo de página completado: ${this.providersQueue.length} proveedores en cola.`);
    },

    async processNextProvider() {
        const storage = await new Promise(r => chrome.storage.local.get(['autopilotPaused'], r));
        if (storage.autopilotPaused) {
            this.isRunning = false;
            showNotification("Autopiloto PAUSADO ⏸️", "info");
            resetUI();
            return;
        }

        if (this.providersQueue.length === 0 || !this.isRunning) {
            const nextTableBtn = findNextButton();
            if (nextTableBtn && this.isRunning) {
                showNotification("Pasando a la siguiente página de proveedores... 📑", "info");
                nextTableBtn.click();
                setTimeout(() => {
                    this.scanProviders().then(() => this.processNextProvider());
                }, 4000);
                return;
            }
            this.stop("¡Proceso de Autopiloto completado! 🏁");
            return;
        }

        // Obtener el siguiente en orden natural
        const next = this.providersQueue.shift();

        chrome.storage.local.set({
            autopilotState: {
                active: true,
                currentCategory: next.category,
                remainingProviders: this.providersQueue.length,
                limitInvoices: 999, // Sin límites por visita para modo 1-a-1
                limitAmount: 99999
            }
        }, () => {
            showNotification(`Abriendo emisor: ${next.name} 📂`);
            if (next.link) next.link.click();
        });
    },

    async skipAndContinue() {
        showNotification("Saltando proveedor... Buscando el próximo reconocido 🔍");
        this.isRunning = true;
        chrome.storage.local.set({ autopilotPaused: false });

        // Regresar a la lista para procesar el siguiente en la cola
        const backBtn = findPrevButton();
        if (backBtn) {
            backBtn.click();
        } else {
            window.history.back();
        }
    },

    stop(msg) {
        console.log("[Autopilot] Forzando parada completa.");
        this.isRunning = false;
        this.providersQueue = [];
        // Limpieza profunda del estado para que no arranque solo al recargar
        chrome.storage.local.set({
            autopilotState: { active: false },
            autopilotPaused: false
        }, () => {
            if (msg) showNotification(msg, "success");
            setTimeout(resetUI, 500);
        });
    }
};

function createAssistantUI() {
    try {
        if (document.getElementById('sri-assistant-container')) return;

        const view = detectViewType();

        const isSRIPage = window.location.hostname.includes('sri.gob.ec');

        // LIMITACIÓN: Solo mostrar en el portal del SRI.
        if (!isSRIPage) return;

        // Si es una vista 'OTHER', solo permitimos si el usuario lo invoca manualmente (container ya existe o similar)
        // Pero para el ciclo automático, limitamos a las vistas relevantes.
        if (view === 'OTHER' && !window.location.href.includes('anexo')) {
            return;
        }

        const container = document.createElement('div');
        container.id = 'sri-assistant-container';

        const provider = detectProvider();
        const providerName = provider.name || "Desconocido";
        const providerRuc = provider.ruc || "";

        chrome.storage.local.get(['assistantCollapsed', 'autopilotPaused', 'autopilotState'], (res) => {
            try {
                if (res.assistantCollapsed) container.classList.add('collapsed');
                const isPaused = res.autopilotPaused || false;

                const totalsData = getCurrentTotal();
                const currentTotal = totalsData.total;
                const tope = TOPES_GASTOS[CURRENT_CARGAS] || TOPES_GASTOS["0"];
                const progressPercent = Math.min((currentTotal / tope) * 100, 100);
                const progressColor = progressPercent > 95 ? '#e91e63' : (progressPercent > 70 ? '#ff9800' : '#4caf50');
                const balancedTarget = getBalancedLimit();

                let catBarsHTML = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-top: 4px;">';
                const catColors = { alimentacion: '#4caf50', salud: '#f44336', vivienda: '#ff9800', educacionArteCultura: '#2196f3', vestimenta: '#9c27b0', turismo: '#00bcd4' };
                const catLabels = { alimentacion: 'Alim.', salud: 'Salud', vivienda: 'Viv.', educacionArteCultura: 'Educ.', vestimenta: 'Vest.', turismo: 'Tur.' };

                Object.entries(catLabels).forEach(([key, label]) => {
                    const val = totalsData[key] || 0;
                    const barWidth = Math.min((val / balancedTarget) * 100, 100);
                    catBarsHTML += `
                        <div style="margin-bottom: 2px;">
                            <div style="display:flex; justify-content:space-between; font-size:9px; line-height:1; margin-bottom:2px;">
                                <span style="color:#64748b; font-weight:600;">${label}</span>
                                <span style="font-weight:700; color:#1e293b;">$${val.toFixed(0)}</span>
                            </div>
                            <div style="height:4px; background:rgba(0,0,0,0.05); border-radius:4px; overflow:hidden;">
                                <div style="width:${barWidth}%; height:100%; background:${catColors[key]}; border-radius:4px;"></div>
                            </div>
                        </div>
                    `;
                });
                catBarsHTML += '</div>';

                const limitStatusHTML = `
                    <div style="background:white; padding:10px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-size:14px; font-weight:800; color:#1e3a8a;">$${currentTotal.toFixed(2)}</span>
                            <span style="font-size:10px; font-weight:700; color:${progressColor};">${progressPercent.toFixed(1)}%</span>
                        </div>
                        ${catBarsHTML}
                    </div>
                `;

                let mainContentHTML = '';
                if (view === 'GROUPED_PROVIDERS') {
                    const providers = AutopilotManager.fullProvidersList.length > 0 ? AutopilotManager.fullProvidersList : AutopilotManager.scanProvidersRaw();
                    const allPending = providers.filter(p => (p.pending || 0) > 0 && (p.pending || 0) <= 5);
                    let previewHTML = '';
                    allPending.forEach(p => {
                        const rucKey = (p.ruc || p.name).replace(/'/g, "\\'");
                        previewHTML += `
                            <div style="padding:4px 0; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                                <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:9px; color:#334155;"><b>${p.name}</b> (${p.pending})</div>
                                <button data-quick-fill="${rucKey}" style="background:#f97316; color:white; border:none; border-radius:4px; font-size:9px; padding:2px 5px; cursor:pointer;">🚀</button>
                            </div>
                        `;
                    });
                    mainContentHTML = `
                        <div style="margin-bottom:8px;">
                            <div style="font-size:9px; font-weight:800; color:#64748b; margin-bottom:4px; text-transform:uppercase;">📊 PANORAMA</div>
                            <div style="max-height:100px; overflow-y:auto; padding-right:4px;">${previewHTML || '<div style="font-size:9px; color:#94a3b8; text-align:center;">Todo clasificado</div>'}</div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            <button id="sri-modeA-start" style="background:#1e3a8a; color:white; border:none; border-radius:8px; padding:8px; font-weight:bold; font-size:10px; cursor:pointer;">🤖 MODO AUTO</button>
                            <button id="sri-modeB-enter" style="background:#f1f5f9; color:#1e3a8a; border:1px solid #e2e8f0; border-radius:8px; padding:8px; font-weight:bold; font-size:10px; cursor:pointer;">🤝 ASISTIDO</button>
                        </div>
                    `;
                } else if (view === 'GENERATE_ANNEX') {
                    mainContentHTML = `
                        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:12px; margin-bottom:10px; text-align:center;">
                            <div style="font-size:11px; font-weight:800; color:#0f172a; margin-bottom:10px;">PREPARAR ANEXO</div>
                            <button id="sri-fill-annex-start" style="width:100%; height:42px; background:#6366f1; color:white; border:none; border-radius:10px; font-weight:bold; font-size:12px; cursor:pointer; box-shadow:0 4px 12px rgba(99,102,241,0.25);">⚡ COMPLETAR SELECCIÓN</button>
                            <div style="font-size:9px; color:#64748b; margin-top:8px;">Seleccionaré el año y entraré al anexo por ti.</div>
                        </div>
                    `;
                } else {
                    const detection = detectSmartCategory(provider);
                    const suggestedCat = (detection && typeof detection === 'object') ? detection.category : detection;
                    const displayCat = CAT_NAMES[suggestedCat] || 'NUEVO';
                    const isUnknown = !suggestedCat;

                    mainContentHTML = `
                        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:12px; margin-bottom:10px;">
                            <div style="font-size:11px; font-weight:800; color:#0f172a; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${providerName}</div>
                            <div style="font-size:9px; color:#64748b; margin-bottom:8px;">RUBRO: <b>${isUnknown ? '???' : displayCat.toUpperCase()}</b></div>
                            ${!isUnknown && suggestedCat !== 'NO_DEDUCIBLE' ? `
                                <button id="sri-fill-current-page" style="width:100%; height:38px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:bold; font-size:11px; cursor:pointer; margin-bottom:6px; box-shadow:0 4px 12px rgba(16,185,129,0.25);">⚡ LLENAR SÓLO ESTA PÁG</button>
                                <button id="sri-modeB-fill-all" style="width:100%; height:42px; background:#1e3a8a; color:white; border:none; border-radius:10px; font-weight:bold; font-size:12px; cursor:pointer; margin-bottom:6px; box-shadow:0 4px 15px rgba(30,58,138,0.3);">🚀 LLENAR TODAS LAS PÁGINAS</button>
                            ` : `
                                <button id="sri-next-provider" style="width:100%; height:38px; background:#94a3b8; color:white; border:none; border-radius:8px; font-weight:bold; font-size:11px; cursor:pointer;">⏩ SIGUIENTE</button>
                            `}
                        </div>
                        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:4px;">
                            ${Object.entries(catLabels).map(([c, label]) =>
                        `<button class="sri-learn-mini" data-learn="${c}" style="background:white; border:1px solid #e2e8f0; border-radius:4px; padding:4px; font-size:12px; cursor:pointer;">${{ alimentacion: '🍎', salud: '⚕️', vivienda: '🏠', educacionArteCultura: '🎓', vestimenta: '👕', turismo: '✈️' }[c]}</button>`
                    ).join('')}
                        </div>
                    `;
                }

                container.innerHTML = `
                    <div class="sri-assistant-header" style="background:linear-gradient(135deg, #1e3a8a, #0f172a); padding:8px 12px; display:flex; justify-content:space-between; align-items:center; cursor:move; border-radius:12px 12px 0 0;">
                        <div style="color:white; font-size:10px; font-weight:900;">SRI ELITE ⚡</div>
                        <div style="display:flex; gap:6px;">
                            <button id="sri-play-pause-toggle" style="background:${isPaused ? '#10b981' : '#f59e0b'}; border:none; color:white; width:22px; height:22px; border-radius:50%; font-size:10px; cursor:pointer;">${isPaused ? '▶️' : '⏸️'}</button>
                            <button id="sri-close-ui" style="background:none; border:none; color:white; font-size:16px; cursor:pointer; opacity:0.6;">×</button>
                        </div>
                    </div>
                    <div class="sri-assistant-body" style="padding:12px;">
                        ${limitStatusHTML}
                        ${mainContentHTML}
                    </div>
                `;

                document.body.appendChild(container);
                applyTheme();
                makeDraggable(container);

                const setOn = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
                setOn('sri-close-ui', () => container.remove());
                setOn('sri-play-pause-toggle', (e) => {
                    e.stopPropagation();
                    const nowPaused = !isPaused;
                    chrome.storage.local.set({ autopilotPaused: nowPaused }, () => {
                        showNotification(nowPaused ? "PAUSA ⏸️" : "REANUDAR ▶️", nowPaused ? "warning" : "success");
                        resetUI();
                    });
                });
                setOn('sri-modeA-start', () => AutopilotModeA.start());
                setOn('sri-modeB-enter', () => AutopilotManager.processNextProvider());
                setOn('sri-fill-current-page', async () => {
                    const currentP = detectProvider();
                    const d = detectSmartCategory(currentP);
                    const c = (d && typeof d === 'object') ? d.category : d;
                    if (c) await fillOnlyCurrentPage(c);
                    else showNotification("No se detectó el rubro. Por favor selecciona uno de los iconos (🍎, 🏠...) para ayudar al robot.", "warning");
                });
                setOn('sri-modeB-fill-all', async () => {
                    const d = detectSmartCategory(provider);
                    const c = (d && typeof d === 'object') ? d.category : d;
                    if (c) await runModeBForProvider(c);
                });
                setOn('sri-fill-annex-start', () => fillAnnexSelection());
                setOn('sri-next-provider', () => {
                    const nb = findNextProviderButton() || document.querySelector('input[value="Siguiente"]');
                    if (nb) nb.click(); else window.history.back();
                });

                container.querySelectorAll('.sri-learn-mini').forEach(btn => {
                    btn.onclick = async () => {
                        const cat = btn.getAttribute('data-learn');
                        const catLabel = CAT_NAMES[cat] || cat;

                        // El usuario pidió: al marcar el emogi avisar que llenará todas las páginas
                        if (confirm(`¿Deseas clasificar y llenar TODAS las páginas de este proveedor como "${catLabel.toUpperCase()}"?\n\nEl asistente procesará cada página (llenar + guardar) automáticamente.`)) {
                            saveMapping(providerRuc || providerName, cat);
                            await runModeBForProvider(cat);
                        } else {
                            // Si cancela el masivo, solo llenamos la página actual para que el usuario no pierda el flujo
                            await fillOnlyCurrentPage(cat);
                        }
                        resetUI();
                    };
                });

                container.querySelectorAll('[data-quick-fill]').forEach(btn => {
                    btn.onclick = () => {
                        const key = btn.getAttribute('data-quick-fill');
                        const link = Array.from(document.querySelectorAll('a')).find(a => a.innerText.includes(key));
                        if (link) chrome.storage.local.set({ autopilotPendingAction: { type: 'AUTO_FILL_EMISOR', category: 'smart' } }, () => link.click());
                    };
                });

                const h = container.querySelector('.sri-assistant-header');
                if (h) h.ondblclick = () => { container.classList.toggle('collapsed'); chrome.storage.local.set({ assistantCollapsed: container.classList.contains('collapsed') }); };

                if (res.autopilotState && res.autopilotState.active) showAutopilotStatusBar(res.autopilotState);
            } catch (innerErr) { console.error("UI Storage callback error:", innerErr); }
        });

        function makeDraggable(el) {
            let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
            const h = el.querySelector(".sri-assistant-header") || el;
            h.onmousedown = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                e.preventDefault();
                p3 = e.clientX; p4 = e.clientY;
                document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
                document.onmousemove = (e) => {
                    p1 = p3 - e.clientX; p2 = p4 - e.clientY;
                    p3 = e.clientX; p4 = e.clientY;
                    el.style.top = (el.offsetTop - p2) + "px";
                    el.style.left = (el.offsetLeft - p1) + "px";
                    el.style.right = 'auto';
                };
            };
        }
    } catch (e) { console.error("Critical error in createAssistantUI:", e); }
}

function showSmartNavigation() {
    if (document.getElementById('sri-smart-nav')) return;
    const btn = document.createElement('button');
    btn.id = 'sri-smart-nav';
    btn.innerHTML = '📂 Ir a Anexos de Gastos';
    btn.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: #004d99; color: white; border: none; padding: 10px 15px; border-radius: 50px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); cursor: pointer; z-index: 999999; font-weight: bold;`;
    btn.onclick = () => window.location.href = 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=101&idGrupo=98';
    document.body.appendChild(btn);
}

function showNotification(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `sri-toast ${type}`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showAutopilotStatusBar(state) {
    let bar = document.getElementById('sri-autopilot-status-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'sri-autopilot-status-bar';
        bar.style.cssText = `position:fixed; top:0; left:0; width:100%; height:32px; background:linear-gradient(90deg, #1e3a8a, #3b82f6); color:white; z-index:10000000; display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; font-size:12px; font-weight:800; box-shadow:0 2px 10px rgba(0,0,0,0.3); border-bottom:1px solid rgba(255,255,255,0.2);`;
        document.body.appendChild(bar);
    }

    const progress = state.totalProviders > 0 ? ((state.doneProviders || 0) / state.totalProviders * 100).toFixed(0) : 0;

    bar.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; width:100%; max-width:1200px; padding:0 20px;">
                <span style="display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.15); padding:2px 8px; border-radius:4px; font-size:10px;">
                    <span class="pulse-small">🤖</span> MODO AUTO ACTIVO
                </span>
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:0.9;">
                    Manejando: <b style="color:#fbbf24;">${state.providerName || 'Cargando...'}</b> (${state.doneProviders || 0}/${state.totalProviders || '?'})
                </span>
                <div style="width:100px; height:6px; background:rgba(0,0,0,0.2); border-radius:3px; overflow:hidden;">
                    <div style="width:${progress}%; height:100%; background:#fbbf24; transition:width 0.5s;"></div>
                </div>
                <button id="sri-stop-auto-top" style="background:#ef4444; color:white; border:none; border-radius:4px; padding:2px 10px; font-size:10px; font-weight:800; cursor:pointer; margin-left:10px;">DETENER</button>
            </div>
            `;

    document.getElementById('sri-stop-auto-top').onclick = () => {
        if (confirm("¿Detener todo el proceso automático?")) {
            AutopilotManager.stop("Proceso detenido por el usuario.");
            bar.remove();
        }
    };
}

function resetUI() {
    const old = document.getElementById('sri-assistant-container');
    if (old) old.remove();
    LAST_CLICKED_ROW = null; // Limpiar selección manual al refrescar UI
    createAssistantUI();
    // Re-instalar el tracker de filas tras recrear la UI
    setTimeout(() => installRowClickTracker(), 600);
}

// --- LOGICA DE CONTINUACIÓN Y CICLO (MODO SEGURO) ---
chrome.storage.local.get(['autopilotState', 'autopilotPaused'], (result) => {
    // Solo actuar si el estado existe, está activo Y no está pausado
    if (result.autopilotState && result.autopilotState.active === true && result.autopilotPaused !== true) {
        const view = detectViewType();

        if (view === 'INVOICE_DETAIL') {
            console.log("[Autopilot] Reanudando clasificación en detalle...");
            setTimeout(async () => {
                // Verificar que seguimos activos antes de arrancar
                const check = await new Promise(r => chrome.storage.local.get(['autopilotState'], r));
                if (!check.autopilotState || !check.autopilotState.active) return;

                const state = result.autopilotState;
                const p = detectProvider();
                const detection = detectSmartCategory(p);
                const detectedCatStr = (detection && typeof detection === 'object') ? detection.category : detection;

                if (!detectedCatStr || detectedCatStr === 'NO_DEDUCIBLE') {
                    showNotification(`Saltando: ${p.name} (NO DEDUCIBLE). Buscando el siguiente... ⏭️`, "info");
                    // For Mode A: log it as skipped
                    if (state.mode === 'A') {
                        chrome.storage.local.get(['modeAReport', 'modeAQueue'], stRes => {
                            const report = stRes.modeAReport || [];
                            report.push({ ruc: p.ruc, name: p.name, category: 'NO_DEDUCIBLE', docsProcessed: 0, amount: 0, skipped: true });
                            AutopilotModeA.sessionReport = report;
                            chrome.storage.local.set({ modeAReport: report });
                        });
                    }
                    setTimeout(() => {
                        const backBtn = findPrevButton();
                        if (backBtn) {
                            console.log("[Autopilot] Regresando a la lista por emisor no deducible.");
                            backBtn.click();
                        } else {
                            window.history.back();
                        }
                    }, 1500);
                    return;
                }

                if (state.mode === 'B') {
                    console.log("[Autopilot] Reanudando Modo B (Llenado por proveedor)...");
                    runModeBForProvider(state.category, {
                        totalDocs: state.totalDocs || 0,
                        totalAmount: state.totalAmount || 0,
                        currentPage: state.currentPage || 1
                    });
                    return;
                }

                // Iniciar clasificación automática (Modo A)
                const turboResult = await startTurboProcess(detectedCatStr, state.limitInvoices || 0, state.limitAmount || 0, true, state);

                // Mode A: save this provider's result to the report
                if (state.mode === 'A') {
                    chrome.storage.local.get(['modeAReport'], stRes => {
                        const report = stRes.modeAReport || [];
                        report.push({
                            ruc: state.providerRuc || p.ruc,
                            name: state.providerName || p.name,
                            category: detectedCatStr,
                            docsProcessed: typeof turboResult === 'object' ? (turboResult.count || 0) : 0,
                            amount: typeof turboResult === 'object' ? (turboResult.amount || 0) : 0
                        });
                        AutopilotModeA.sessionReport = report;
                        chrome.storage.local.set({ modeAReport: report });
                    });
                }

                // Volver a la lista al terminar
                setTimeout(() => {
                    if (IS_TURBO_RUNNING) return;
                    const backBtn = findPrevButton();
                    if (backBtn) backBtn.click();
                    else window.history.back();
                }, 3000);
            }, 3500); // Dar un margen para que el usuario pueda pausar
        } else if (view === 'GROUPED_PROVIDERS') {
            const state = result.autopilotState;
            // Solo cargar los datos en memoria, NO arrancar el proceso automáticamente
            if (state && state.mode === 'A') {
                chrome.storage.local.get(['modeAQueue', 'modeAReport'], res => {
                    AutopilotModeA.queue = res.modeAQueue || [];
                    AutopilotModeA.sessionReport = res.modeAReport || [];
                    if (AutopilotModeA.queue.length > 0) {
                        console.log("[Autopilot] Sesión pausada de Modo A detectada. Esperando acción manual.");
                        resetUI(); // Mostrar botón de reanudación en la UI
                    }
                });
            } else {
                chrome.storage.local.set({ autopilotState: { active: false } });
            }
        }
    }
});

let lastUrl = location.href;
let lastTotal = -1;
let isRideOpen = false;

setInterval(() => {
    // 1. Detectar cambio de URL
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (!IS_TURBO_RUNNING) resetUI(); // Solo resetear si no hay turbo activo
    }
    // 2. Detectar si el total cambió (para la barra de progreso)
    // IMPORTANTE: NO resetear la UI mientras el turbo está activo — causaría un loop
    if (!IS_TURBO_RUNNING) {
        const totalsData = getCurrentTotal();
        const currentTotalVal = totalsData.total;
        if (currentTotalVal !== lastTotal) {
            lastTotal = currentTotalVal;
            resetUI(); // Refrescar para mover la barra (solo cuando no está llenando)
        }
    }

    // 3. MONITOR DE RIDE: Auto-detectar contenido al abrir modal
    const modal = document.querySelector('.ui-dialog.ui-widget-content');
    const modalVisible = modal && modal.offsetParent !== null;

    if (modalVisible && !isRideOpen) {
        isRideOpen = true;
        console.log("[Monitor] RIDE detectado. Analizando contenido...");
        setTimeout(() => {
            const detected = detectCategoryByItems();
            if (detected) {
                showNotification(`Detalle RIDE: Parece ser ${CAT_NAMES[detected]} 🔍`, "info");
                if (!IS_TURBO_RUNNING) resetUI(); // Actualizar UI con la nueva sugerencia
            }
        }, 800);
    } else if (!modalVisible && isRideOpen) {
        isRideOpen = false;
    }

    // 4. Asegurar que el tracker de filas esté activo (por si la tabla cambió por AJAX)
    installRowClickTracker();
}, 2500);

createAssistantUI();
// Instalar tracker de filas para que el usuario pueda marcar una factura
// y luego clickear en el botón de categoría del asistente
setTimeout(() => installRowClickTracker(), 1200);

// Helper global para clasificar desde la antesala
window.askCategoryFor = async (id) => {
    const p = { name: id, ruc: id };
    const response = await showCategoryModal(p);
    if (!response || response === 'RIDE') return;

    if (typeof response === 'object') {
        saveMapping(id, response.category, response.reason);
    } else {
        saveMapping(id, response);
    }
    resetUI();
};

async function fillAnnexSelection() {
    showNotification("Preparando selección de anexo... ⏳", "info");

    // 1. Intentar seleccionar el año (Ejercicio Fiscal)
    const yearSelect = document.querySelector('select[id*="ejercicio"], select[id*="anio"], select[id*="fiscal"]');
    if (yearSelect) {
        const options = Array.from(yearSelect.options);
        // Priorizar 2024, luego 2025, luego el último disponible
        const targetYear = options.find(o => o.text.includes("2024")) ||
            options.find(o => o.text.includes("2025")) ||
            options[options.length - 1];

        if (targetYear) {
            yearSelect.value = targetYear.value;
            yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
            console.log("[FillAnnex] Año seleccionado:", targetYear.text);
        }
    }

    // 2. Dar tiempo para cualquier AJAX y clickear Siguiente
    setTimeout(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.ui-button'));
        const nextBtn = buttons.find(b => {
            const txt = (b.innerText || b.value || "").toUpperCase();
            return txt.includes("SIGUIENTE") || txt.includes("CONTINUAR");
        });

        if (nextBtn) {
            console.log("[FillAnnex] Clic en Siguiente/Continuar.");
            nextBtn.click();
        } else {
            showNotification("No encontré el botón 'Siguiente'. ¿Podrías clickearlo tú? 👆", "warning");
        }
    }, 1200);
}

// --- MANEJO DE ACCIONES PENDIENTES (Ej: 1-Clic desde Panorama) ---
chrome.storage.local.get(['autopilotPendingAction'], (res) => {
    if (res.autopilotPendingAction) {
        const action = res.autopilotPendingAction;
        const view = detectViewType();

        if (view === 'INVOICE_DETAIL' && action.type === 'AUTO_FILL_EMISOR') {
            console.log("[1-Clic] Acción detectada: Llenado automático de emisor.");
            // Limpiar la acción para no repetirla
            chrome.storage.local.set({ autopilotPendingAction: null }, () => {
                setTimeout(() => {
                    startTurboProcess(action.category, 0, 0, true);
                }, 1000);
            });
        }
    }
});
