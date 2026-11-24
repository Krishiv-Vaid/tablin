import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Builds the extension pages (popup, options) and the background service worker.
 * The content script is built separately (vite.content.config.ts) because Chrome
 * requires content scripts to be classic, self-contained scripts.
 */
export default defineConfig(({ mode }) => ({
  root: resolve(__dirname, 'src'),
  publicDir: resolve(__dirname, 'public'),
  base: '',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: mode === 'development' ? 'inline' : false,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
