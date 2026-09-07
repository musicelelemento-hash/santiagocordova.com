// ============================================================
// AJUSTES — Nueva Luz 3.0
// ============================================================
// Página de opciones de la extensión. Se abre con clic derecho en el ícono →
// «Opciones», desde chrome://extensions → Detalles, o con el ⚙️ del popup.
//
// Existe por una razón concreta: las claves NO pueden vivir en
// `shared_config.js`. Ese archivo está en el repositorio —lo que se escribe ahí
// queda en el historial de git para siempre— y además viaja dentro de la
// extensión, que se inyecta en cada página del SRI.
//
// Acá van a `chrome.storage.local`: solo en esta computadora, sin versionar y
// sin distribuir. Y la página NUNCA muestra el valor guardado.
// ============================================================

const CLAVE_IA = 'sc_ia_credenciales';
const CLAVE_R2 = 'sc_r2_credenciales';
const CLAVE_WEB = 'sc_supabase_credenciales';

const $ = (id) => document.getElementById(id);

/**
 * «guardada · termina en …4KbAQ (39 caracteres)», nunca el valor entero.
 *
 * Seis caracteres alcanzan para saber cuál de dos claves está puesta y no
 * alcanzan para nada más.
 */
function comoTermina(valor) {
    if (!valor) return 'no hay ninguna guardada';
    const v = String(valor);
    return `guardada · termina en …${v.slice(-6)} (${v.length} caracteres)`;
}

async function pintarEstado() {
    const g = await chrome.storage.local.get([CLAVE_IA, CLAVE_R2, CLAVE_WEB]);
    const ia = (g[CLAVE_IA] || {}).apiKey;
    const r2 = (g[CLAVE_R2] || {}).R2_SECRET_ACCESS_KEY;

    $('estadoIa').textContent = comoTermina(ia);
    $('estadoIa').dataset.hay = ia ? 'si' : 'no';
    $('estadoR2').textContent = comoTermina(r2);
    $('estadoR2').dataset.hay = r2 ? 'si' : 'no';

    // El Access Key ID no es secreto —viaja en cada petición firmada—, así que
    // se muestra entero: sirve para comprobar de un vistazo que quedó el nuevo.
    const id = (g[CLAVE_R2] || {}).R2_ACCESS_KEY_ID;
    $('estadoIdR2').textContent = id || 'no hay ninguno guardado (se usa el del código)';
    $('estadoIdR2').dataset.hay = id ? 'si' : 'no';

    const web = (g[CLAVE_WEB] || {}).SUPABASE_ANON_KEY;
    $('estadoWeb').textContent = web ? comoTermina(web) : 'no hay ninguna guardada (se usa la del código)';
    $('estadoWeb').dataset.hay = web ? 'si' : 'no';
}

function avisar(texto) {
    const el = $('aviso-flotante');
    // El aviso es cortesía, no parte del guardado: si no está, no puede tumbar
    // la operación que ya se hizo.
    if (!el) { console.log('[Ajustes] ' + texto); return; }
    el.textContent = texto;
    el.style.opacity = '1';
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}

async function guardar() {
    const campoIa = $('claveIa');
    const campoR2 = $('claveR2');
    const cambios = {};

    // Un campo vacío significa «no la toques», no «borrala»: para borrar está
    // el botón de al lado, que lo dice con todas las letras.
    if (campoIa.value.trim()) {
        cambios[CLAVE_IA] = { apiKey: campoIa.value.trim(), cuando: Date.now() };
    }
    // Los dos de R2 van juntos en la misma llave: rotar cambia ambos.
    const campoIdR2 = $('idR2');
    if (campoR2.value.trim() || campoIdR2.value.trim()) {
        const previo = (await chrome.storage.local.get([CLAVE_R2]))[CLAVE_R2] || {};
        const nuevo = { ...previo, cuando: Date.now() };
        if (campoR2.value.trim()) nuevo.R2_SECRET_ACCESS_KEY = campoR2.value.trim();
        if (campoIdR2.value.trim()) nuevo.R2_ACCESS_KEY_ID = campoIdR2.value.trim();
        cambios[CLAVE_R2] = nuevo;
    }

    const campoWeb = $('claveWeb');
    if (campoWeb.value.trim()) {
        cambios[CLAVE_WEB] = { SUPABASE_ANON_KEY: campoWeb.value.trim(), cuando: Date.now() };
    }

    if (!Object.keys(cambios).length) { avisar('No escribiste ninguna clave'); return; }

    await chrome.storage.local.set(cambios);
    // Que no quede en pantalla ni en el DOM más de lo necesario.
    campoIa.value = '';
    campoR2.value = '';
    campoIdR2.value = '';
    campoWeb.value = '';
    await pintarEstado();
    avisar('🔑 Guardada fuera del código');
}

async function borrar() {
    await chrome.storage.local.remove([CLAVE_IA, CLAVE_R2, CLAVE_WEB]);
    $('claveIa').value = '';
    $('claveR2').value = '';
    $('idR2').value = '';
    $('claveWeb').value = '';
    await pintarEstado();
    avisar('🗑️ Borradas del almacén');
}

/**
 * Prueba los tres caminos de subida y muestra por qué falla cada uno.
 *
 * El trabajo lo hace el service worker: un `fetch` desde acá estaría sujeto a
 * CORS, que es exactamente lo que tuvo rota la subida durante meses.
 */
async function probarSubida() {
    const salida = $('resultadoPrueba');
    const boton = $('btnProbarSubida');
    salida.style.display = 'block';
    salida.textContent = 'Probando…';
    boton.disabled = true;

    try {
        const cfg = (typeof window !== 'undefined' && window.SC_CONFIG) || {};
        const r = await chrome.runtime.sendMessage({ tipo: 'SC_DIAGNOSTICO_SUBIDA', config: cfg });

        if (!r) { salida.textContent = 'El service worker no contestó. Recargá la extensión.'; return; }

        const lineas = [r.ok ? '✅ La subida funciona.' : '❌ Ningún camino funcionó.'];
        if (r.via) lineas.push(`   camino que sirvió: ${r.via}`);
        lineas.push('');
        (r.intentos || []).forEach((i) => {
            if (i.omitido) lineas.push(`· ${i.via}: ${i.omitido}`);
            else if (i.error) lineas.push(`· ${i.via}: ${i.error}`);
            else lineas.push(`· ${i.via}: ${i.ok ? 'bien' : 'no'}${i.estado ? ' (HTTP ' + i.estado + ')' : ''}`);
        });
        if (r.configurado) {
            lineas.push('', 'Configurado:');
            Object.keys(r.configurado).forEach((k) => {
                lineas.push(`   ${k}: ${r.configurado[k] ? 'sí' : 'no'}`);
            });
        }
        salida.textContent = lineas.join('\n');
    } catch (e) {
        salida.textContent = 'No se pudo hablar con el service worker: ' + e.message +
            '\nSi la extensión se acaba de actualizar, recargala en chrome://extensions.';
    } finally {
        boton.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $('btnGuardarClaves').addEventListener('click', guardar);
    $('btnBorrarClaves').addEventListener('click', borrar);
    $('btnProbarSubida').addEventListener('click', probarSubida);

    // Enter en cualquiera de los dos campos guarda: es lo que espera cualquiera
    // que acaba de pegar una clave.
    ['claveIa', 'claveR2', 'idR2'].forEach((id) => {
        $(id).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') guardar(); });
    });

    try { $('version').textContent = 'v' + chrome.runtime.getManifest().version; } catch (e) { /* da igual */ }

    pintarEstado();
});
