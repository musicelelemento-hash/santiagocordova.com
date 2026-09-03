# SRI Extractor - Extensión Chrome

Extensión para extraer y sumar facturas del portal SRI automáticamente.

## 🚀 Instalación

1. Abre Chrome y ve a `chrome://extensions/`
2. Activa el **Modo de desarrollador** (esquina superior derecha)
3. Haz clic en **Cargar extensión sin empaquetar**
4. Selecciona la carpeta: `automatizacion-sri/extension`  
   **⚠️ IMPORTANTE: Solo la carpeta `extension`, NO la carpeta raíz**

## 📖 Uso

### Workflow Optimizado (3 Pasos):

**PASO 1: Auto-llenar Búsqueda** 🔧

1. Abre la página de **Comprobantes Electrónicos Recibidos**
2. Click en el ícono de la extensión
3. Click en **"🔧 Auto-llenar Búsqueda"**
   - La extensión configura automáticamente:
     - Período: Mes anterior (Noviembre 2025)
     - Tipo: Factura
4. **Si aparece CAPTCHA:** Resuélvelo manualmente
5. Click en **"Consultar"** en la página del SRI

**PASO 2: Extraer Facturas** 📊

6. Cuando la tabla de facturas esté visible
7. Click en **"📊 Extraer Facturas"**
8. La extensión:
   - Lee directamente las columnas visibles de la tabla
   - Cruza TODAS las páginas automáticamente
   - Separa facturas en:
     - 🟢 **Compras IVA 0%** (columna IVA = 0.00)
     - 🟠 **Compras IVA 15%** (columna IVA > 0.00)
9. **Click en los valores** para copiar al clipboard

**PASO 3: Extraer Retenciones** 📋

10. Cambia el tipo de comprobante a **"Retención"** y consulta
11. Click en **"📋 Extraer Retenciones"**
12. La extensión:
    - Lee las columnas IVA y Total de la tabla
    - Calcula Renta Retenida = Total - IVA
    - Cruza todas las páginas
13. Muestra:
    - 💰 **IVA Retenido** (suma columna IVA)
    - 📄 **Renta Retenida** (diferencia Total - IVA)
14. **Click en los valores** para copiar

---

## ✨ Características Mejoradas

- ✅ **Auto-llenado robusto:** Selectores mejorados para diferentes versiones del SRI
- ✅ **Extracción directa:** Lee datos de las columnas visibles (NO abre modales)
- ✅ **Rápido y confiable:** Sin esperas innecesarias ni clicks complejos
- ✅ **Separación por IVA:** Distingue facturas IVA 0% vs IVA 15%
- ✅ **Retenciones inteligentes:** Calcula IVA y Renta automáticamente
- ✅ **Copia rápida:** Click en valores para copiar al clipboard
- ✅ **Workflow optimizado:** 3 pasos simples para completar la extracción

## 🛠️ Estructura de Archivos

```
extension/
├── manifest.json       # Configuración de la extensión
├── popup.html         # Interfaz del popup
├── popup.js           # Lógica del popup
├── content.js         # Script que se inyecta en SRI
├── icon16.png         # Ícono 16x16
├── icon48.png         # Ícono 48x48
└── icon128.png        # Ícono 128x128
```

## ⚠️ Solución de Problemas

**Error: "Cannot load extension with file or directory name __pycache__"**
- Estás cargando la carpeta incorrecta
- Debes cargar solo `extension/`, no la carpeta raíz del proyecto

**Error: "No se puede enviar mensaje"**
- Asegúrate de estar en la página de Comprobantes Recibidos
- Recarga la página e intenta nuevamente
