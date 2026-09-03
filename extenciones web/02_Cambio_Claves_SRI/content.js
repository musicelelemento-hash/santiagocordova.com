// Content Script: Asistente Discreto para Cambio de Claves SRI (100% Silencioso)
// REGLA: Si la clave termina en @ o no hay solicitud explicita de cambio, NO hacer NADA.
console.log("🛡️ [SC PRO Suite] Asistente Discreto de Claves SRI listo (Modo Silencioso).");

function transformPassword(oldPass) {
  if (!oldPass) return '';
  const trimmed = oldPass.trim();
  if (trimmed.endsWith('*')) {
    return trimmed.slice(0, -1) + '@';
  } else if (trimmed.endsWith('@')) {
    return trimmed;
  } else {
    return trimmed + '@';
  }
}

// Únicamente si el usuario está EXPLÍCITAMENTE en la pantalla de actualizar clave
function handleSilentPasswordUpdatePage() {
  const currentUrl = window.location.href;
  if (!currentUrl.includes('/actualizar') && !currentUrl.includes('/cambia')) {
    return; // No estamos en pantalla de cambio de clave, no hacer NADA.
  }

  chrome.storage.local.get(['pending_sri_change'], (res) => {
    const changeData = res.pending_sri_change;
    if (!changeData) return;

    const oldPass = (changeData.oldPassword || '').trim();
    
    // REGLA ABSOLUTA: Si ya termina en @ y NO requiere cambio (*), NO MOLESTAR
    if (oldPass.endsWith('@') && !oldPass.endsWith('*')) {
      console.log("🟢 [SC PRO] La clave ya termina en @. No se realiza ninguna acción.");
      return;
    }

    const actualInput = document.querySelector('#actual') || document.querySelector('input[formcontrolname="actual"]');
    const nuevoInput = document.querySelector('#nuevo') || document.querySelector('input[formcontrolname="nuevo"]');
    const confirmInput = document.querySelector('#confirmacion') || document.querySelector('input[formcontrolname="confirmacion"]');

    if (actualInput && nuevoInput && confirmInput) {
      const newPassTransformed = transformPassword(oldPass);
      
      actualInput.value = oldPass;
      actualInput.dispatchEvent(new Event('input', { bubbles: true }));

      nuevoInput.value = newPassTransformed;
      nuevoInput.dispatchEvent(new Event('input', { bubbles: true }));

      confirmInput.value = newPassTransformed;
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      console.log("✅ [SC PRO] Campos de cambio de clave autocompletados de forma discreta.");

      // Inyectar listener en el botón de Guardar/Aceptar
      const buttons = Array.from(document.querySelectorAll('button, span, a, input[type="submit"]'));
      const saveBtn = buttons.find(b => {
        const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
        return text.includes('guardar') || text.includes('aceptar') || text.includes('actualizar');
      });

      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          console.log("🖱️ [SC PRO] Clic detectado en Guardar. Actualizando en Supabase...");
          if (typeof updatePasswordInSupabase === 'function' && changeData.ruc) {
            updatePasswordInSupabase(changeData.ruc, newPassTransformed).then(success => {
              if(success) console.log("☁️ [SC PRO] Clave sincronizada correctamente en Supabase.");
            });
          } else {
             console.warn("⚠️ [SC PRO] updatePasswordInSupabase no disponible o RUC ausente.");
          }
        });
      }
    }
  });
}

// Ejecutar únicamente en la página específica de cambio de clave
if (window.location.href.includes('/actualizar') || window.location.href.includes('/cambia')) {
  setTimeout(handleSilentPasswordUpdatePage, 1000);
}
