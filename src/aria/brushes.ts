// Brushes, stamps and colors for the coloring and sketch modes.
//
// Every brush is made of the renderers' round dots (see StampBatch), laid out
// differently: a smooth line, a thin pencil, grainy chalk, a spray, a dotted
// line, or a line that runs through the rainbow. Stamps are shapes turned into
// a grid of dots, so both renderers draw them with no extra code.

export type RGB = [number, number, number];

export type BrushKind = 'crayon' | 'pencil' | 'chalk' | 'spray' | 'dots' | 'rainbow';

export interface BrushDef {
  id: BrushKind;
  name: string;
  /** Icon: strokes drawn in the chosen color (currentColor). */
  icon: string;
}

const line = (d: string, w: number, extra = '') =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const WAVE = 'M6 30C14 14 22 14 30 24S46 34 54 18';

export const BRUSHES: BrushDef[] = [
  { id: 'crayon', name: 'Crayon', icon: line(WAVE, 9) },
  { id: 'pencil', name: 'Pencil', icon: line(WAVE, 3.5) },
  {
    id: 'chalk', name: 'Chalk',
    icon: [[8, 28], [11, 23], [14, 30], [16, 20], [19, 26], [22, 18], [25, 23], [28, 19], [30, 26], [33, 23], [36, 29], [38, 24],
      [41, 30], [44, 25], [46, 20], [49, 24], [52, 16], [52, 21], [24, 28], [42, 21]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="currentColor"/>`).join(''),
  },
  {
    id: 'spray', name: 'Spray paint',
    icon: [[12, 26], [18, 20], [16, 30], [24, 24], [22, 16], [28, 28], [32, 20], [36, 26], [30, 14], [40, 18], [44, 24], [48, 16], [42, 30], [20, 34], [50, 22]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="currentColor"/>`).join(''),
  },
  {
    id: 'dots', name: 'Dots',
    icon: [[10, 27], [22, 19], [34, 25], [46, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="currentColor"/>`).join(''),
  },
  {
    id: 'rainbow', name: 'Rainbow',
    icon: `<defs><linearGradient id="rb" x1="0" x2="1"><stop offset="0" stop-color="#ec4840"/><stop offset=".25" stop-color="#ffc933"/>` +
      `<stop offset=".5" stop-color="#3ab460"/><stop offset=".75" stop-color="#3a80e8"/><stop offset="1" stop-color="#9652d0"/></linearGradient></defs>` +
      `<path d="${WAVE}" fill="none" stroke="url(#rb)" stroke-width="9" stroke-linecap="round"/>`,
  },
];

/** Dot spacing along the stroke, as a share of the brush radius. */
export function brushSpacing(kind: BrushKind): number {
  switch (kind) {
    case 'spray': return 0.45;
    case 'chalk': return 0.3;
    case 'dots': return 2.6;
    default: return 0.12;
  }
}

/** Radius actually drawn for a brush, from the size buttons' radius. */
export function brushRadius(kind: BrushKind, r: number): number {
  switch (kind) {
    case 'pencil': return Math.max(4, r * 0.32);
    case 'dots': return r * 0.85;
    default: return r;
  }
}

/** One batch of dots to draw, all the same size and color. */
export interface Dab {
  points: number[];
  radius: number;
  rgb: RGB;
}

/**
 * Turns the evenly spaced centers of a stroke into what the brush draws.
 * `hue` carries the rainbow's color along the stroke (returned updated).
 */
export function brushDabs(kind: BrushKind, centers: number[], r: number, rgb: RGB, hue: number): { dabs: Dab[]; hue: number } {
  const radius = brushRadius(kind, r);
  if (kind === 'spray') {
    const dot = Math.max(1.5, r * 0.07);
    const points: number[] = [];
    for (let i = 0; i < centers.length; i += 2) {
      for (let k = 0; k < 7; k++) {
        // Denser in the middle, like a real spray can.
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 1.15 * Math.random() ** 0.35;
        points.push(centers[i] + Math.cos(a) * d, centers[i + 1] + Math.sin(a) * d);
      }
    }
    return { dabs: [{ points, radius: dot, rgb }], hue };
  }
  if (kind === 'chalk') {
    // Small dots scattered over the brush width: a rough, grainy line.
    const dot = Math.max(2, r * 0.26);
    const points: number[] = [];
    for (let i = 0; i < centers.length; i += 2) {
      for (let k = 0; k < 7; k++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * (r - dot);
        points.push(centers[i] + Math.cos(a) * d, centers[i + 1] + Math.sin(a) * d);
      }
    }
    return { dabs: [{ points, radius: dot, rgb }], hue };
  }
  if (kind === 'rainbow') {
    // A new color every few dots; the hue turns about once per long stroke.
    const dabs: Dab[] = [];
    const step = 6;
    for (let i = 0; i < centers.length; i += step * 2) {
      dabs.push({ points: centers.slice(i, i + step * 2), radius, rgb: hslToRgb(hue, 0.85, 0.55) });
      hue = (hue + (step * brushSpacing('rainbow') * r) / 5) % 360;
    }
    return { dabs, hue };
  }
  return { dabs: [{ points: centers, radius, rgb }], hue };
}

// ---------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------

export interface StampDef {
  id: string;
  name: string;
  /** SVG path in a 100 × 100 box. */
  d: string;
}

function starPath(points: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = ((-90 + (180 * i) / points) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(53 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

const circle = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

function flowerPath(): string {
  let d = circle(50, 50, 14);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    d += circle(50 + Math.cos(a) * 28, 50 + Math.sin(a) * 28, 18);
  }
  return d;
}

function sunPath(): string {
  let d = circle(50, 50, 26);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, b = 0.22;
    const p = (r: number, t: number) => `${(50 + Math.cos(t) * r).toFixed(1)} ${(50 + Math.sin(t) * r).toFixed(1)}`;
    d += `M${p(31, a - b)}L${p(48, a)}L${p(31, a + b)}Z`;
  }
  return d;
}

export const STAMPS: StampDef[] = [
  { id: 'star', name: 'Star', d: starPath(5, 48, 21) },
  { id: 'heart', name: 'Heart', d: 'M50 90C22 70 5 52 5 32 5 17 16 7 30 7c9 0 16 5 20 13 4-8 11-13 20-13 14 0 25 10 25 25 0 20-17 38-45 58Z' },
  { id: 'flower', name: 'Flower', d: flowerPath() },
  { id: 'sun', name: 'Sun', d: sunPath() },
  { id: 'moon', name: 'Moon', d: 'M64 6A45 45 0 1 0 94 72 36 36 0 0 1 64 6Z' },
  { id: 'paw', name: 'Paw print', d: circle(50, 64, 22) + circle(22, 38, 10) + circle(40, 22, 10) + circle(60, 22, 10) + circle(78, 38, 10) },
  { id: 'butterfly', name: 'Butterfly', d: 'M48 50C30 18 6 18 8 40 10 56 30 58 46 54 30 62 16 80 30 88 42 94 48 72 48 58ZM52 50C70 18 94 18 92 40 90 56 70 58 54 54 70 62 84 80 70 88 58 94 52 72 52 58Z' },
  { id: 'cloud', name: 'Cloud', d: 'M24 76C8 76 4 56 18 50 16 34 36 26 46 38 52 20 80 22 82 42 98 44 98 76 80 76Z' },
  { id: 'dino', name: 'Dinosaur', d: 'M14 84V62C14 44 30 36 46 40L58 22C62 14 76 12 82 20 88 28 84 38 74 38L68 38 70 60C84 62 96 70 96 70 80 74 70 74 64 72L62 84H52L50 74H32L30 84Z' },
  { id: 'fish', name: 'Fish', d: 'M8 50C24 24 60 22 76 42L94 26V74L76 58C60 78 24 76 8 50Z' },
  { id: 'smile', name: 'Happy face', d: `${circle(50, 50, 46)}M30 40a6 6 0 1 0 12 0a6 6 0 1 0-12 0ZM58 40a6 6 0 1 0 12 0a6 6 0 1 0-12 0ZM28 58Q50 82 72 58Q50 70 28 58Z` },
  { id: 'note', name: 'Music note', d: 'M38 10 84 2V66A14 12 0 1 1 72 54V22L46 27V78A14 12 0 1 1 34 66V10Z' },
];

/** Stamp half-widths in paint pixels, for the small, medium and large size buttons. */
export const STAMP_SIZES = [42, 70, 108];

const stampCache = new Map<string, Float32Array>();

/**
 * Dot centers that fill a stamp of half-width `size`, centered on 0,0,
 * and the dot radius that covers the gaps between them. The happy face's
 * eyes and smile are holes (even-odd), so they stay uncolored.
 */
export function stampDots(def: StampDef, size: number): { points: Float32Array; radius: number } {
  const step = Math.max(1.5, size / 40);
  const key = `${def.id}:${size}`;
  let pts = stampCache.get(key);
  if (!pts) {
    const px = Math.ceil(size * 2);
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.scale(px / 100, px / 100);
    g.fill(new Path2D(def.d), def.id === 'smile' ? 'evenodd' : 'nonzero');
    const data = g.getImageData(0, 0, px, px).data;
    const out: number[] = [];
    for (let y = step / 2; y < px; y += step) {
      for (let x = step / 2; x < px; x += step) {
        if (data[(Math.floor(y) * px + Math.floor(x)) * 4 + 3] > 160) out.push(x - size, y - size);
      }
    }
    pts = new Float32Array(out);
    stampCache.set(key, pts);
  }
  // Big enough that neighbors overlap past their soft rims: a solid shape, no grid.
  return { points: pts, radius: step * 0.6 + 1.6 };
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export interface CrayonColor {
  name: string;
  rgb: RGB;
}

/** The crayon box: primary colors first, then the rest of the rainbow and friends. */
export const CRAYON_COLORS: CrayonColor[] = [
  { name: 'Red', rgb: [0xe8, 0x2c, 0x2c] },
  { name: 'Yellow', rgb: [0xff, 0xd2, 0x1f] },
  { name: 'Blue', rgb: [0x1f, 0x5f, 0xe0] },
  { name: 'Orange', rgb: [0xff, 0x8a, 0x1c] },
  { name: 'Green', rgb: [0x2e, 0xb0, 0x4a] },
  { name: 'Purple', rgb: [0x8a, 0x3f, 0xd1] },
  { name: 'Pink', rgb: [0xff, 0x6f, 0xb5] },
  { name: 'Sky blue', rgb: [0x5c, 0xc6, 0xf2] },
  { name: 'Light green', rgb: [0xa6, 0xe2, 0x5a] },
  { name: 'Lilac', rgb: [0xc9, 0xa8, 0xf5] },
  { name: 'Peach', rgb: [0xff, 0xc9, 0xa0] },
  { name: 'Brown', rgb: [0x8a, 0x56, 0x2e] },
  { name: 'Gray', rgb: [0x8a, 0x86, 0x88] },
  { name: 'Black', rgb: [0x2a, 0x26, 0x28] },
  { name: 'White', rgb: [0xff, 0xff, 0xff] },
];

export const rgbCss = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Light-to-dark shades of one hue, for under the color wheel. */
export function shadesOf(h: number, s: number): RGB[] {
  return [0.88, 0.76, 0.64, 0.52, 0.4, 0.28, 0.16].map((l) => hslToRgb(h, Math.max(s, 0.15), l));
}

/** A crayon drawn in any color (so the box can hold any number of them). */
export function crayonSvg(rgb: RGB): string {
  const c = rgbCss(rgb);
  return `<svg viewBox="0 0 200 34" aria-hidden="true">
  <path d="M2 17 28 5H194a5 5 0 0 1 5 5V24a5 5 0 0 1-5 5H28Z" fill="${c}" stroke="rgba(43,34,48,.35)" stroke-width="1.5"/>
  <path d="M2 17 10 13.3V20.7Z" fill="rgba(0,0,0,.18)"/>
  <path d="M28 5V29" stroke="rgba(0,0,0,.18)" stroke-width="2"/>
  <path d="M44 6c4 4-4 7 0 11s-4 7 0 11M52 6c4 4-4 7 0 11s-4 7 0 11M160 6c4 4-4 7 0 11s-4 7 0 11M168 6c4 4-4 7 0 11s-4 7 0 11" fill="none" stroke="rgba(30,20,25,.55)" stroke-width="2.5"/>
  <path d="M60 10H154" stroke="rgba(255,255,255,.45)" stroke-width="3" stroke-linecap="round"/>
  <path d="M30 25H194" stroke="rgba(0,0,0,.12)" stroke-width="4"/>
</svg>`;
}
