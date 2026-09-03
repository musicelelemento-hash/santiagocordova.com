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
