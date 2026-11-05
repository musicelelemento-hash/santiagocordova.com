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
      
      // 🏷️ Sello de compilación: versión del manifest + fecha/hora local.
      // Permite saber en la consola del SRI si Chrome cargó este build o una
      // copia vieja (hay que pulsar ↻ en chrome://extensions tras compilar).
      const pkgVersion = JSON.parse(
        fs.readFileSync(path.resolve(currentDir, 'manifest.json'), 'utf-8')
      ).version;
      const ahora = new Date();
      const dosDigitos = (n) => String(n).padStart(2, '0');
      const sello = `${pkgVersion}+${ahora.getFullYear()}${dosDigitos(ahora.getMonth() + 1)}${dosDigitos(ahora.getDate())}.${dosDigitos(ahora.getHours())}${dosDigitos(ahora.getMinutes())}`;
      concatenatedCode = concatenatedCode.split('__SC_BUILD__').join(sello);
      console.log(`\n  🏷️  build: ${sello}\n`);

      // 💡 MINIFICAR con esbuild: 870 KB → ~250 KB (menos parse/memoria en el SRI)
      //
      // `npm run build:dev` saltea la minificación. El minificado es lo que
      // viaja al SRI, pero deja el stack de una excepción en una sola línea de
      // 250 KB: cuando algo falla en la página, no hay forma de saber en qué
      // módulo pasó. Con `build:dev` los números de línea del navegador son
      // los del archivo fuente y el error se puede seguir.
      const sinMinificar = process.env.npm_lifecycle_event === 'build:dev';
      const codigo = sinMinificar
        ? { code: concatenatedCode }
        : await transform(concatenatedCode, {
            minify: true,
            loader: 'js',
            target: 'chrome110',
            legalComments: 'none'
          });

      this.emitFile({
        type: 'asset',
        fileName: 'content.js',
        source: codigo.code
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
