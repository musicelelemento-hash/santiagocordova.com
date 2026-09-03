import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transform } from 'esbuild';

const currentDir = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));

// Custom Vite plugin to concatenate files instead of ES module resolution
// This allows us to modularize legacy monolithic scripts without rewriting them to strict ES imports
function concatPlugin() {
  return {
    name: 'concat-plugin',
    async generateBundle(options, bundle) {
      // The files to concatenate in order
      // ⚡ jsPDF (355 KB) YA NO se concatena: se carga bajo demanda desde
      // vendor/jspdf.umd.min.js (ver ensureJsPdfLoaded en 01_utilidades_y_pdf.js).
      // Solo hace falta para embellecer el PDF de respaldo cuando no se pudo
      // capturar el comprobante oficial del SRI.
      const files = [
        'src/01_utilidades_y_pdf.js',
        'src/02_servicios_y_memoria.js',
        'src/03_ingreso_y_sesion.js',
        'src/04_extraccion_datos.js',
        'src/05_llenado_formulario.js',
        'src/06_panel_interfaz.js',
        'src/07_navegacion_sri.js'
      ];
      
      let concatenatedCode = '';
      for (const file of files) {
        const filePath = path.resolve(currentDir, file);
        if (fs.existsSync(filePath)) {
          concatenatedCode += `\n/* --- FILE: ${file} --- */\n`;
          concatenatedCode += fs.readFileSync(filePath, 'utf-8');
          concatenatedCode += `\n`;
        }
      }
      
      // 💡 MINIFICAR con esbuild: 870 KB → ~250 KB (menos parse/memoria en el SRI)
      const minified = await transform(concatenatedCode, {
        minify: true,
        loader: 'js',
        target: 'chrome110',
        legalComments: 'none'
      });

      // Emit the concatenated (minified) file
      this.emitFile({
        type: 'asset',
        fileName: 'content.js',
        source: minified.code
      });
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/main.js', // Dummy input, the plugin handles output
    }
  },
  plugins: [concatPlugin()]
});
