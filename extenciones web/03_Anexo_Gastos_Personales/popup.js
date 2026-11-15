const cargasSelect = document.getElementById('cargas-familiares');

// Cargar preferencia guardada (Cargas y Tema)
chrome.storage.local.get(['cargasFamiliares', 'selectedTheme'], (result) => {
    if (result.cargasFamiliares !== undefined) {
        cargasSelect.value = result.cargasFamiliares;
    }
    const theme = result.selectedTheme || 'default';
    setActiveThemeCircle(theme);
});

function setActiveThemeCircle(theme) {
    document.querySelectorAll('.theme-circle').forEach(c => {
        c.classList.remove('active');
        if (c.dataset.theme === theme) c.classList.add('active');
    });
}

// Guardar Cargas al cambiar
cargasSelect.onchange = () => {
    chrome.storage.local.set({ cargasFamiliares: cargasSelect.value }, () => {
        refreshAssistant();
    });
};

// Manejar Cambio de Tema
document.querySelectorAll('.theme-circle').forEach(circle => {
    circle.onclick = () => {
        const theme = circle.dataset.theme;
        chrome.storage.local.set({ selectedTheme: theme }, () => {
            setActiveThemeCircle(theme);
            refreshAssistant();
        });
    };
});

function refreshAssistant() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: () => {
                    if (typeof resetUI === 'function') resetUI();
                    else if (typeof applyTheme === 'function') applyTheme();
                }
            });
        }
    });
}

document.getElementById('open-assistant').onclick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: () => {
                if (typeof createAssistantUI === 'function') {
                    createAssistantUI();
                } else {
                    alert("Por favor recarga la página del SRI para activar el asistente.");
                }
            }
        });
    });
};

if (document.getElementById('reset-mappings')) {
    document.getElementById('reset-mappings').onclick = () => {
        if (confirm("¿Seguro que quieres borrar lo que el robot ha aprendido (mapeos guardados)?")) {
            chrome.storage.local.set({ providerMappings: {}, userKeywords: [], aiDescriptions: {} }, () => {
                alert("Memoria borrada. Recarga la página para aplicar.");
            });
        }
    };
}

if (document.getElementById('go-to-anexos')) {
    document.getElementById('go-to-anexos').onclick = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const annexUrl = 'https://srienlinea.sri.gob.ec/tuportal-internet/accederAplicacion.jspa?redireccion=101&idGrupo=98';
            if (tabs[0]) {
                chrome.tabs.update(tabs[0].id, { url: annexUrl });
            } else {
                chrome.tabs.create({ url: annexUrl });
            }
        });
    };
}


// ── IA · Gemini ───────────────────────────────────────────────────────────
// La clave vive en chrome.storage.local, en la MISMA entrada que usa la 01
// (`sc_ia_credenciales`): un solo lugar donde rotarla. Este popup es para
// quien usa la 03 sola; con la suite, se carga en Ajustes y es la misma.
const CLAVE_IA_POPUP = 'sc_ia_credenciales';
const MODELO_IA_POPUP = 'gemini-2.5-flash';

const iaInput = document.getElementById('sc-ia-key');
const iaEstado = document.getElementById('sc-ia-estado');
const iaGuardar = document.getElementById('sc-ia-guardar');
const iaProbar = document.getElementById('sc-ia-probar');

function pintarEstadoIA(cfg) {
    if (!iaEstado) return;
    const k = (cfg && cfg.apiKey) || '';
    if (k) {
        iaEstado.innerHTML = '<span class="ia-ok">✅ Clave cargada</span> · termina en …' +
            k.slice(-4).replace(/[<>&]/g, '');
        iaEstado.title = 'La misma clave que usan la extensión 01 y la suite.';
    } else {
        iaEstado.innerHTML = '<span class="ia-mal">⚠️ Sin clave</span> · se clasifica sin IA (catastro + mapeos).';
        iaEstado.title = 'La clasificación por IA queda apagada hasta que cargues una clave.';
    }
}

chrome.storage.local.get([CLAVE_IA_POPUP], (r) => pintarEstadoIA(r[CLAVE_IA_POPUP]));

if (iaGuardar) {
    iaGuardar.addEventListener('click', () => {
        const apiKey = ((iaInput && iaInput.value) || '').trim();
        if (!apiKey) {
            iaEstado.innerHTML = '<span class="ia-mal">⚠️ Pegá la clave antes de guardar.</span>';
            return;
        }
        chrome.storage.local.get([CLAVE_IA_POPUP], (r) => {
            const previo = r[CLAVE_IA_POPUP] || {};
            const nuevo = Object.assign({}, previo, { apiKey, cuando: Date.now() });
            chrome.storage.local.set({ [CLAVE_IA_POPUP]: nuevo }, () => {
                if (iaInput) iaInput.value = '';
                pintarEstadoIA(nuevo);
            });
        });
    });
}

if (iaProbar) {
    iaProbar.addEventListener('click', async () => {
        iaEstado.innerHTML = '⏳ Probando la clave…';
        let apiKey = ((iaInput && iaInput.value) || '').trim();
        let modelo = MODELO_IA_POPUP;
        if (!apiKey) {
            const r = await new Promise((ok) => chrome.storage.local.get([CLAVE_IA_POPUP], ok));
            const cfg = r[CLAVE_IA_POPUP] || {};
            apiKey = (cfg.apiKey || '').trim();
            modelo = (cfg.modelo || '').trim() || MODELO_IA_POPUP;
        }
        if (!apiKey) {
            iaEstado.innerHTML = '<span class="ia-mal">⚠️ No hay clave para probar.</span>';
            return;
        }
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'ping' }] }],
                    generationConfig: { maxOutputTokens: 1 }
                })
            });
            if (res.ok) {
                iaEstado.innerHTML = '<span class="ia-ok">✅ La clave responde</span> · ' + modelo;
            } else {
                const cuerpo = (await res.text().catch(() => '')).slice(0, 120);
                iaEstado.innerHTML = '<span class="ia-mal">❌ HTTP ' + res.status + '</span> · ' +
                    cuerpo.replace(/[<>&]/g, '');
            }
        } catch (e) {
            iaEstado.innerHTML = '<span class="ia-mal">❌ No se pudo conectar</span> · ' +
                String((e && e.message) || e).replace(/[<>&]/g, '');
        }
    });
}
