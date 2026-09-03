# 📁 INVENTARIO Y ESTRUCTURA DE EXTENSIONES WEB - SANTIAGO CÓRDOVA PRO

Este documento contiene el mapa oficial, clasificación de estado, instrucciones de instalación y respaldos de seguridad de todas las extensiones de Chrome del ecosistema **Santiago Córdova PRO**.

---

## 🛡️ Respaldo de Seguridad y Archivo Histórico

- **Respaldo Intacto Original:**
  `C:\Programacion\Paginas Web\SantiagoCordova.com\extenciones web\_RESPALDO_EXTENSIONES_SEGURA`
- **Versiones Históricas / Archivadas:**
  `C:\Programacion\Paginas Web\SantiagoCordova.com\extenciones web\_ARCHIVADAS_Y_LEGACY`

---

## 🚀 Ecosistema Oficial de Extensiones Activas

| Carpeta | Nombre Oficial en Chrome | Tipo / Función Principal | Estado | Observaciones |
| :--- | :--- | :--- | :---: | :--- |
| **`01_Nueva_Luz_3.0`** | `⚡ [SC PRO 01] - Declaración IVA & Robot SRI (Nueva Luz 3.0)` | **Declaración IVA Mensual Completa** | 🟢 **PROD (Activa)** | Arquitectura modular con Vite (`src/` ➔ `build/content.js`). Cálculos Elite, captura de PDF real y sincronización directa con Supabase. |
| **`02_Cambio_Claves_SRI`** | `🔑 [SC PRO 02] - Asistente Claves SRI & Ecuafact` | **Gestión de Claves SRI & Ecuafact** | 🟢 **PROD (Activa)** | Sugerencia flotante arrastrable, regla de transformación `*` ➔ `@`, llenado instantáneo y sync con panel web. |
| **`03_Anexo_Gastos_Personales`** | `📑 [SC PRO 03] - Llenador Anexo Gastos Personales` | **Anexo Gastos Personales** | 🟡 **UTILIDAD** | Automatiza el llenado del anexo de gastos personales en el portal SRI. |
| **`04_Anulador_Comprobantes_SRI`** | `🚫 [SC PRO 04] - Anulador Masivo Comprobantes PDF` | **Anulación Masiva SRI** | 🟠 **EN AJUSTE** | Lectura de comprobantes PDF y anulación en bloque (requiere ajuste de selectores por cambios de versión del SRI). |

---

## 📦 Extensiones Archivadas (`_ARCHIVADAS_Y_LEGACY/`)

- `Extractor V1`: Versión previa monolítica del extractor de IVA.
- `Automatizacion declaracion iva`: Versión previa para declaraciones de IVA y analítica.

---

## 📥 Instrucciones de Instalación en Google Chrome

1. Abre Google Chrome y navega a `chrome://extensions/`.
2. Activa el interruptor **Modo de desarrollador** (esquina superior derecha).
3. Haz clic en **Cargar descomprimida** (*Load unpacked*).
4. Selecciona la carpeta correspondiente:
   - Para IVA: `C:\Programacion\Paginas Web\SantiagoCordova.com\extenciones web\01_Nueva_Luz_3.0`
   - Para Claves: `C:\Programacion\Paginas Web\SantiagoCordova.com\extenciones web\02_Cambio_Claves_SRI`
   - Para Gastos: `C:\Programacion\Paginas Web\SantiagoCordova.com\extenciones web\03_Anexo_Gastos_Personales`
   - Para Anulaciones: `C:\Programacion\Paginas Web\SantiagoCordova.com\extenciones web\04_Anulador_Comprobantes_SRI`
5. ¡Listo! Todas las extensiones se ordenarán automáticamente bajo el prefijo `[SC PRO XX]`.
