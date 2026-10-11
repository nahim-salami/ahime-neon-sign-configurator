/**
 * The build of the web component shipped in the WordPress plugin.
 *
 * - ES module output with lazy chunks: the 3D view (three.js), the augmented reality export, the QR code and
 *   the glTF / RGBE loaders are only downloaded when they are used.
 * - Stable file names: the plugin enqueues `assets/neon-config.js`, which imports the other `neon-*.js` files.
 * - READABLE output: no minification, no identifier renaming. Third-party libraries keep their own published
 *   production builds. The five fonts are inlined as data URLs, so the build has no network access at runtime.
 *
 * Output: ../../ahime-neon-sign-configurator/assets/neon-*.js (the other files of assets/ are not touched).
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  plugins: [react()],
  // In library mode Vite leaves `process.env.NODE_ENV` untouched; the store page has no `process`, and React
  // would otherwise ship its development build.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: {
    alias: [{ find: /^@neon\/core$/, replacement: here('../core/src/index.ts') }],
  },
  build: {
    outDir: here('../../ahime-neon-sign-configurator/assets'),
    emptyOutDir: false,
    minify: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        chunkFileNames: 'neon-[name].js',
      },
    },
    lib: {
      entry: here('src/element.tsx'),
      name: 'NeonConfig',
      formats: ['es'],
      fileName: () => 'neon-config.js',
    },
  },
});
