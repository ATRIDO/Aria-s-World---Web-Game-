// Turns original drawings into coloring pages: every SVG in src/aria/assets/pages-src/
// becomes src/aria/assets/pages/<name>-base.png (black line art on white) and
// <name>-outline.png (the same lines on transparent), which the game picks up by itself.
//
// The drawings can be in color: the outline color (#5b3a47) becomes black lines and
// every other fill or stroke becomes white, so shapes turn into areas to fill.
//
// Needs Playwright with Chromium (not a project dependency, so it doesn't slow CI):
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/svg-to-page.mjs            # all pages
//   node scripts/svg-to-page.mjs page3      # just one
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SRC = new URL('../src/aria/assets/pages-src/', import.meta.url);
const OUT = new URL('../src/aria/assets/pages/', import.meta.url);
const SIZE = 640;
const only = process.argv.slice(2);
const files = readdirSync(SRC).filter((f) => f.endsWith('.svg') && (!only.length || only.includes(f.slice(0, -4))));

// Class colors used by the game's drawings: eyes stay dark, the rest becomes areas to fill.
const CSS = `.eye{fill:#5b3a47}.skin,.hair,.c1,.c2{fill:#ccc}.skin-stroke,.c1-stroke,.c2-stroke{stroke:#ccc}`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
for (const f of files) {
  const svg = readFileSync(new URL(f, SRC), 'utf8');
  await page.setContent(`<style>html,body{margin:0;background:#fff}svg{display:block;width:${SIZE}px;height:${SIZE}px}${CSS}</style>${svg}`);
  const pngs = await page.evaluate(async (size) => {
    const ink = 'rgb(91, 58, 71)';
    for (const el of document.querySelectorAll('svg *')) {
      const cs = getComputedStyle(el);
      if (cs.fill !== 'none') el.style.fill = cs.fill === ink ? '#000' : '#fff';
      if (cs.stroke !== 'none') el.style.stroke = cs.stroke === ink ? '#000' : '#fff';
      el.style.opacity = '1';
    }
    const root = document.querySelector('svg');
    const xml = new XMLSerializer().serializeToString(root);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
    g.drawImage(img, 0, 0, size, size);
    const base = c.toDataURL('image/png');
    // Outline: darkness becomes opacity, so antialiased edges stay smooth.
    const d = g.getImageData(0, 0, size, size);
    for (let i = 0; i < d.data.length; i += 4) {
      const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
      d.data[i + 3] = 255 - lum;
    }
    g.putImageData(d, 0, 0);
    return [base, c.toDataURL('image/png')];
  }, SIZE);
  const name = f.slice(0, -4);
  writeFileSync(new URL(`${name}-base.png`, OUT), Buffer.from(pngs[0].split(',')[1], 'base64'));
  writeFileSync(new URL(`${name}-outline.png`, OUT), Buffer.from(pngs[1].split(',')[1], 'base64'));
  console.log('page', name);
}
await browser.close();
