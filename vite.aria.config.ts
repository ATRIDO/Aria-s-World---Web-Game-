import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { ariaPwa } from './scripts/aria-pwa';

// Aria's World builds into dist/ (index.html, assets/, sw.js…), which GitHub Pages
// serves at https://atrido.github.io/Aria-s-World---Web-Game-/ (see
// .github/workflows/pages.yml). All URLs are relative, so any address works.
export default defineConfig({
  // The page lives in arias-world/; it loads the code from ../src/aria/.
  root: fileURLToPath(new URL('./arias-world', import.meta.url)),
  // Relative asset URLs so the build works from any host or sub-path.
  base: './',
  publicDir: false,
  // Home-screen install, offline play and the QR code (see scripts/aria-pwa.ts).
  plugins: [ariaPwa()],
  build: {
    // Safari 15 is the oldest browser we support (WebAssembly bulk-memory,
    // dvh units, Pointer Events). WebGPU is optional on top of that.
    target: ['es2020', 'safari15'],
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    assetsDir: 'assets',
    // Never inline assets as data: URLs (keeps a strict CSP possible).
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        aria: fileURLToPath(new URL('./arias-world/index.html', import.meta.url)),
      },
    },
  },
  server: { open: '/' },
});
