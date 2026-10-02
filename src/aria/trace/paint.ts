import type { Pt } from './glyphs';

// Paint colors for the tracing game, mixed like real paint. Colors live in RYB
// (red-yellow-blue, the color wheel children learn): red + blue makes violet,
// red + yellow orange, yellow + blue green, and the steps between are the
// tertiary colors. Where two strokes meet, their colors blend smoothly into
// each other instead of meeting at a hard edge.

export type Ryb = [number, number, number];

/** The 12-step color wheel: primary, tertiary, secondary, tertiary, ... */
const WHEEL: Ryb[] = [
  [1, 0, 0], [1, 0.5, 0], [1, 1, 0], [0.5, 1, 0], // red, red-orange, orange, yellow-orange
  [0, 1, 0], [0, 1, 0.5], [0, 1, 1], [0, 0.5, 1], // yellow, yellow-green, green, blue-green
  [0, 0, 1], [0.5, 0, 1], [1, 0, 1], [1, 0, 0.5], // blue, blue-violet, violet, red-violet
];

// Corners of the RYB cube in bright, child-friendly RGB. Anything between is
// interpolated, so every mix stays in the same family of colors.
const CUBE: [number, number, number][] = [
  [255, 255, 255], // none
  [236, 72, 64], // red
  [255, 208, 52], // yellow
  [250, 138, 40], // red + yellow: orange
  [58, 128, 232], // blue
  [150, 82, 208], // red + blue: violet
  [58, 180, 96], // yellow + blue: green
  [128, 92, 72], // all three: brown
];

/** RYB → sRGB (0-255), written into `out`. */
export function rybToRgb(r: number, y: number, b: number, out: number[]): void {
  for (let c = 0; c < 3; c++) {
    const lo = (i: number) => CUBE[i][c];
    const x00 = lo(0) + (lo(1) - lo(0)) * r, x10 = lo(2) + (lo(3) - lo(2)) * r;
    const x01 = lo(4) + (lo(5) - lo(4)) * r, x11 = lo(6) + (lo(7) - lo(6)) * r;
    const y0 = x00 + (x10 - x00) * y, y1 = x01 + (x11 - x01) * y;
    out[c] = y0 + (y1 - y0) * b;
  }
}

export function rybCss(c: Ryb): string {
  const out = [0, 0, 0];
  const m = Math.max(c[0], c[1], c[2]) || 1;
  rybToRgb(c[0] / m, c[1] / m, c[2] / m, out);
  return `rgb(${out.map(Math.round).join(',')})`;
}

const lerp = (a: Ryb, b: Ryb, t: number): Ryb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A stroke's colors: a gentle gradient from `from` to `to` along its length. */
export interface StrokeColor {
  from: Ryb;
  to: Ryb;
}

let lastFamily = -1;

/**
 * Random colors for one letter. All strokes take colors from one arc of the
 * wheel between two primaries (e.g. red → orange → yellow), so every mix of
 * them is a bright secondary or tertiary color, never mud.
 */
export function pickColors(strokes: number): StrokeColor[] {
  let family = Math.floor(Math.random() * 3);
  if (family === lastFamily) family = (family + 1 + Math.floor(Math.random() * 2)) % 3;
  lastFamily = family;
  const start = family * 4, dir = Math.random() < 0.5 ? 1 : -1;
  const hue = (step: number) => WHEEL[(start + dir * step + 12) % 12];
  const out: StrokeColor[] = [];
  let prev = -1;
  for (let i = 0; i < strokes; i++) {
    let a = Math.floor(Math.random() * 5);
    if (a === prev) a = (a + 2) % 5; // next stroke starts in a different color
    const shift = Math.random() < 0.5 ? 1 : 2;
    const b = a + shift <= 4 ? a + shift : a - shift;
    out.push({ from: hue(a), to: hue(b) });
    prev = b;
  }
  return out;
}

export interface FieldStroke {
  pts: Pt[];
  len: number[];
  total: number;
  color: StrokeColor;
}

/** Field cells per glyph unit. Colors change slowly, so a coarse grid upscaled smoothly is enough. */
const RES = 1;
/** How wide the blend between two meeting strokes is, in glyph units. */
const BLEND = 7;

/**
 * The color of the paint everywhere on the page, on a coarse grid. The crisp
 * shape comes from the painted paths; this only says which color each spot is,
 * so drawing it scaled up (smoothed) under a path mask gives soft color blends
 * with sharp edges.
 */
export class ColorField {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly w: number;
  private readonly h: number;
  /** Per stroke, per cell: squared distance to the stroke and arc length at the nearest point. */
  private readonly dist2: Float32Array[] = [];
  private readonly along: Float32Array[] = [];
  private key = '';

  /** Covers the page box grown by `margin` on every side (glyph units). */
  constructor(private readonly strokes: FieldStroke[], width: number, height: number, readonly margin: number) {
    this.w = Math.ceil((width + margin * 2) * RES) + 1;
    this.h = Math.ceil((height + margin * 2) * RES) + 1;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(this.w, this.h);
    for (const st of strokes) this.measure(st);
  }

  /** Recolors for how far each stroke is painted (`upTo[i]` glyph units, < 0 = not started). */
  update(upTo: number[]): void {
    const key = upTo.map((u) => u.toFixed(1)).join();
    if (key === this.key) return;
    this.key = key;
    const { w, h, strokes } = this;
    const data = this.image.data;
    const rgb = [0, 0, 0];
    const inv = 1 / (BLEND * BLEND);
    for (let c = 0; c < w * h; c++) {
      let r = 0, y = 0, b = 0, sum = 0;
      for (let i = 0; i < strokes.length; i++) {
        const u = upTo[i];
        if (u < 0) continue;
        // Distance to the painted part: past the tip, count the distance to the tip too.
        const s = this.along[i][c];
        const past = s > u ? s - u : 0;
        const d2 = (this.dist2[i][c] + past * past) * inv;
        const wgt = 1 / (1 + d2 * d2);
        const { total, color } = strokes[i];
        const t = total ? (s < u ? s : u) / total : 0;
        const { from, to } = color;
        r += (from[0] + (to[0] - from[0]) * t) * wgt;
        y += (from[1] + (to[1] - from[1]) * t) * wgt;
        b += (from[2] + (to[2] - from[2]) * t) * wgt;
        sum += wgt;
      }
      const o = c * 4;
      if (!sum) {
        data[o + 3] = 0;
        continue;
      }
      // Keep mixes as bright as the colors that went in (mixing paint, not dimming it).
      const m = Math.max(r, y, b) || 1;
      rybToRgb(r / m, y / m, b / m, rgb);
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  /** Draws the field over the page box; `X`/`Y` map glyph units to the canvas. */
  draw(g: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, scale: number): void {
    // Cell centers sit on whole glyph units, so the image starts half a cell early.
    const o = -this.margin - 0.5 / RES;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.canvas, X(o), Y(o), (this.w / RES) * scale, (this.h / RES) * scale);
  }

  /** Color of stroke `i` at `s` along it, as CSS (for sparkles). */
  colorAt(i: number, s: number): string {
    const st = this.strokes[i];
    return rybCss(lerp(st.color.from, st.color.to, st.total ? Math.min(1, s / st.total) : 0));
  }

  private measure(st: FieldStroke): void {
    const { w, h, margin } = this;
    const dist2 = new Float32Array(w * h).fill(1e12);
    const along = new Float32Array(w * h);
    // Only cells near the stroke matter; the rest keep "far away".
    const reach = margin * 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of st.pts) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const cx0 = Math.max(0, Math.floor((x0 - reach + margin) * RES)), cx1 = Math.min(w - 1, Math.ceil((x1 + reach + margin) * RES));
    const cy0 = Math.max(0, Math.floor((y0 - reach + margin) * RES)), cy1 = Math.min(h - 1, Math.ceil((y1 + reach + margin) * RES));
    // Every other resampled point (3 units apart) is plenty for a coarse grid.
    const step = st.pts.length > 2 ? 2 : 1;
    for (let cy = cy0; cy <= cy1; cy++) {
      const gy = cy / RES - margin;
      for (let cx = cx0; cx <= cx1; cx++) {
        const gx = cx / RES - margin;
        let best = Infinity, bestS = 0;
        for (let k = 0; k < st.pts.length; k += step) {
          const dx = st.pts[k][0] - gx, dy = st.pts[k][1] - gy;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            bestS = st.len[k];
          }
        }
        const c = cy * w + cx;
        dist2[c] = best;
        along[c] = bestS;
      }
    }
    this.dist2.push(dist2);
    this.along.push(along);
  }
}
