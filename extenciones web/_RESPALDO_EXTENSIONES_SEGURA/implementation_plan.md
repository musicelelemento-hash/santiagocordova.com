# Modernización del Workflow Turbo y Lector de Perfil

Este documento detalla el plan para implementar el flujo de automatización "Turbo" en 3 pasos y la capacidad de lectura inteligente del perfil del contribuyente.

## User Review Required

> [!IMPORTANT]
> El Paso 3 (Llenado de Formulario) se detendrá **antes** de enviar la declaración para permitir la revisión manual por parte del usuario, tal como se solicitó.

## Proposed Changes

### [Component] Content Script (content.js)

Se realizarán modificaciones extensas para orquestar el flujo Turbo y añadir el lector de perfil.

#### [MODIFY] [content.js](file:///c:/Users/Santiago/Documents/Visual%20Code%20Antigraviti/02_Extenciones/Extractor%20V1/content.js)

- **Fase 1: Extracción Refinada**: Asegurar que `extraerTodasLasFacturas`, `extraerTodasLasRetenciones` y `extraerTodasLasNotasCredito` se ejecuten secuencialmente para el mes anterior de forma automática.
- **Fase 2: Wizard de IVA**: Completar `ejecutarNavegacionDeclaracion` para:
  - Seleccionar Año y Mes en el Wizard.
  - Hacer clic en "Siguiente".
  - Responder al cuestionario de preguntas frecuentes (SÍ/NO) basado en la lógica de declaración mensual estándar.
  - Avanzar hasta el formulario de edición.
- **Fase 3: Llenado de Formulario**: Refinar `autoLlenarFormularioIVA` para mapear los datos extraídos a los casilleros correspondientes (Ventas, Compras, Retenciones).
- **Lector de Perfil**: Implementar `capturarDatosPerfil` que se ejecute en las páginas de inicio/perfil:
  - Leer RUC (`label.titulo-perfil`).
  - Leer Nombre (`label.nombre-contribuyente`).
  - Leer Tiempo Restante y Próximas Obligaciones (usando los selectores y clases proporcionados por el usuario).
  - Almacenar estos datos en `SafeStorage` para que estén disponibles en el POPUP.

---

### [Component] Popup (popup.html / popup.js)

Actualizar la interfaz para mostrar la información del perfil y el estado del flujo Turbo.

#### [MODIFY] [popup.js](file:///c:/Users/Santiago/Documents/Visual%20Code%20Antigraviti/02_Extenciones/Extractor%20V1/popup.js)

- Escuchar cambios en `SafeStorage` para mostrar los datos del perfil actualizados (RUC, Nombre, Cuenta regresiva).
- Actualizar el disparador del botón "TURBO" para iniciar el flujo de 3 fases.

---

## Open Questions

- **Cuestionario de IVA**: ¿Existe alguna pregunta específica del cuestionario inicial que deba responderse de manera diferente a "SÍ" para compras/ventas y "NO" para el resto? Por defecto, asumiré una declaración mensual estándar con actividad.
- **Casilleros de Llenado**: ¿Existen casilleros específicos adicionales además de los estándar (500, 507, 401, 411, 609, 610) que debamos llenar?

## Verification Plan

### Automated Tests
- Ejecutar el flujo "Turbo" desde el Popup y verificar mediante `console.log` la transición entre:
  1. Extracción de Facturas -> Retenciones -> NC.
  2. Navegación al sitio de declaraciones -> Selección de periodo -> Cuestionario.
  3. Formulario de IVA cargado y campos poblados.

### Manual Verification
- Cargar la extensión y navegar a la página de "Perfil" del SRI. Verificar que el Popup muestre correctamente el RUC, nombre y el tiempo restante de las obligaciones.
- Iniciar el Modo Turbo y validar que se detenga en el formulario de IVA con los datos correctamente ingresados.
