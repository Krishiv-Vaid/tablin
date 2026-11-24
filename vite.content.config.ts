import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** Builds the content script as a single self-contained IIFE (no imports at runtime). */
export default defineConfig(({ mode }) => ({
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: mode === 'development' ? 'inline' : false,
    lib: {
      entry: resolve(__dirname, 'src/content/content-script.ts'),
      formats: ['iife'],
      name: 'TablinContent',
      fileName: () => 'content-script.js',
    },
  },
}));
