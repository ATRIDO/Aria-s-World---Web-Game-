// Vite plugin for Aria's World: makes it installable ("Add to Home Screen") and playable
// offline, and draws the QR code that opens it. At build time it writes, into
// dist/:
//   manifest.webmanifest   app name, icons, full-screen display
//   icon-*.png             home-screen icons (Android; iOS uses apple-touch-icon)
//   sw.js                  service worker that caches every file of the build
//   qr.svg, qr.png         QR code for ARIA_URL (default: the live site)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import QRCode from 'qrcode';
import type { Plugin } from 'vite';

/**
 * Where the QR code points: the GitHub Pages address, which always serves the latest
 * `main`. For a custom domain later, set ARIA_URL in the Publish workflow and push.
 */
export const ARIA_URL = process.env.ARIA_URL || 'https://atrido.github.io/Aria-s-World---Web-Game-/';

/** Folder inside dist/ that the game is built into ('' = dist/ itself). */
const DIR = '';
const BG = '#ebced5';
const read = (path: string) => readFileSync(new URL(`../src/aria/${path}`, import.meta.url));

const ICONS = [
  { file: 'icon-192.png', sizes: '192x192', purpose: 'any' },
  { file: 'icon-512.png', sizes: '512x512', purpose: 'any' },
  { file: 'icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' },
];

const manifest = {
  id: './',
  name: "Aria's World",
  short_name: "Aria's World",
  description: 'A coloring game for kids.',
  start_url: './',
  scope: './',
  display: 'fullscreen',
  display_override: ['fullscreen', 'standalone'],
  orientation: 'any',
  background_color: BG,
  theme_color: BG,
  icons: ICONS.map(({ file, sizes, purpose }) => ({ src: file, sizes, type: 'image/png', purpose })),
};

const qrOptions = { margin: 2, errorCorrectionLevel: 'M', color: { dark: '#5b3a47', light: '#ffffff' } } as const;

export function ariaPwa(): Plugin {
  return {
    name: 'aria-pwa',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'manifest', href: 'manifest.webmanifest' }, injectTo: 'head' }],
    async generateBundle(_options, bundle) {
      const emit = (file: string, source: string | Uint8Array) =>
        this.emitFile({ type: 'asset', fileName: DIR + file, source });

      emit('manifest.webmanifest', JSON.stringify(manifest, null, 2));
      for (const { file } of ICONS) emit(file, read(`assets/app/${file}`));
      emit('qr.svg', await QRCode.toString(ARIA_URL, { ...qrOptions, type: 'svg' }));
      emit('qr.png', await QRCode.toBuffer(ARIA_URL, { ...qrOptions, type: 'png', width: 1024 }));

      // Everything the game loads, relative to the game page. './' is the game page itself.
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith(DIR) && !f.endsWith('.map') && !f.endsWith('.html') && !/(^|\/)qr\.(svg|png)$/.test(f))
        .map((f) => f.slice(DIR.length))
        .sort();
      const assets = [...new Set(['./', 'manifest.webmanifest', ...ICONS.map((i) => i.file), ...files])];
      const version = createHash('sha256').update(assets.join('\n')).update(Date.now().toString()).digest('hex').slice(0, 12);
      const sw = read('sw.js')
        .toString()
        .replace('__VERSION__', JSON.stringify(version))
        .replace('__ASSETS__', JSON.stringify(assets));
      emit('sw.js', sw);
    },
  };
}
