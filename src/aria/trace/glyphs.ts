// Handwriting paths for tracing, in the ball-and-stick style taught in schools
// (Zaner-Bloser / Handwriting Without Tears): each glyph is a list of strokes in
// the order and direction a child should draw them.
//
// Coordinates: y grows downward. Capitals and digits sit between the top line
// (y = 10) and the baseline (y = 90); lowercase x-height is 50..90, ascenders
// reach 10, descenders reach ~125. The midline is y = 50.

export type Pt = [number, number];

export interface Glyph {
  /** Advance width in glyph units. */
  width: number;
  /** Strokes in drawing order. A single-point stroke is a dot to tap. */
  strokes: Pt[][];
}

export const TOP = 10;
export const MID = 50;
export const BASE = 90;
export const DESC = 125;

/** Points along an ellipse from angle a0 to a1 (degrees; 0 = right, 90 = down). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Pt[] {
  const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 5));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** One stroke made of consecutive parts (lines are just point lists). */
function S(...parts: Pt[][]): Pt[] {
  const out: Pt[] = [];
  for (const part of parts) {
    for (const p of part) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.01) out.push(p);
    }
  }
  return out;
}

const L = (...pts: Pt[]): Pt[] => pts;
const dot = (x: number, y: number): Pt[] => [[x, y]];
const g = (width: number, ...strokes: Pt[][]): Glyph => ({ width, strokes });

export const UPPER: Record<string, Glyph> = {
  A: g(70, L([35, 10], [5, 90]), L([35, 10], [65, 90]), L([17, 62], [53, 62])),
  B: g(58,
    L([8, 10], [8, 90]),
    S(L([8, 10], [28, 10]), arc(28, 29.5, 19, 19.5, -90, 90), L([28, 49], [8, 49])),
    S(L([8, 49], [30, 49]), arc(30, 69.5, 21, 20.5, -90, 90), L([30, 90], [8, 90]))),
  C: g(72, arc(38, 50, 32, 40, -40, -320)),
  D: g(62, L([8, 10], [8, 90]), S(L([8, 10], [22, 10]), arc(22, 50, 32, 40, -90, 90), L([22, 90], [8, 90]))),
  E: g(52, L([8, 10], [8, 90]), L([8, 10], [46, 10]), L([8, 50], [38, 50]), L([8, 90], [46, 90])),
  F: g(50, L([8, 10], [8, 90]), L([8, 10], [46, 10]), L([8, 50], [38, 50])),
  G: g(76, S(arc(38, 50, 32, 40, -40, -360), L([70, 50], [46, 50]))),
  H: g(60, L([8, 10], [8, 90]), L([52, 10], [52, 90]), L([8, 50], [52, 50])),
  I: g(36, L([18, 10], [18, 90]), L([4, 10], [32, 10]), L([4, 90], [32, 90])),
  J: g(50, S(L([40, 10], [40, 68]), arc(24, 68, 16, 22, 0, 180))),
  K: g(58, L([8, 10], [8, 90]), L([50, 10], [8, 52]), L([8, 52], [52, 90])),
  L: g(50, L([8, 10], [8, 90]), L([8, 90], [46, 90])),
  M: g(76, L([8, 10], [8, 90]), L([8, 10], [38, 72], [68, 10], [68, 90])),
  N: g(62, L([8, 10], [8, 90]), L([8, 10], [54, 90], [54, 10])),
  O: g(74, arc(37, 50, 32, 40, -90, -450)),
  P: g(56, L([8, 10], [8, 90]), S(L([8, 10], [28, 10]), arc(28, 30, 20, 20, -90, 90), L([28, 50], [8, 50]))),
  Q: g(74, arc(37, 50, 32, 40, -90, -450), L([44, 66], [70, 96])),
  R: g(58, L([8, 10], [8, 90]), S(L([8, 10], [28, 10]), arc(28, 30, 20, 20, -90, 90), L([28, 50], [8, 50])), L([26, 50], [54, 90])),
  S: g(56, S(arc(28, 30, 20, 20, -20, -270), arc(28, 70, 20, 20, -90, 160))),
  T: g(56, L([28, 10], [28, 90]), L([4, 10], [52, 10])),
  U: g(60, S(L([8, 10], [8, 62]), arc(30, 62, 22, 28, 180, 0), L([52, 62], [52, 10]))),
  V: g(64, L([4, 10], [32, 90], [60, 10])),
  W: g(88, L([4, 10], [24, 90], [44, 30], [64, 90], [84, 10])),
  X: g(60, L([6, 10], [54, 90]), L([54, 10], [6, 90])),
  Y: g(60, L([6, 10], [30, 50]), L([54, 10], [30, 50], [30, 90])),
  Z: g(56, L([6, 10], [50, 10], [6, 90], [50, 90])),
};

export const LOWER: Record<string, Glyph> = {
  a: g(50, arc(24, 70, 20, 20, -30, -390), L([44, 50], [44, 90])),
  b: g(50, L([8, 10], [8, 90]), arc(26, 70, 18, 20, 180, 540)),
  c: g(46, arc(24, 70, 20, 20, -40, -320)),
  d: g(50, arc(24, 70, 20, 20, -30, -390), L([44, 10], [44, 90])),
  e: g(48, S(L([6, 70], [44, 70]), arc(25, 70, 19, 20, 0, -320))),
  f: g(38, S(arc(26, 24, 14, 14, -20, -180), L([12, 24], [12, 90])), L([2, 50], [30, 50])),
  g: g(50, arc(24, 70, 20, 20, -30, -390), S(L([44, 50], [44, 108]), arc(28, 108, 16, 16, 0, 160))),
  h: g(50, L([8, 10], [8, 90]), S(arc(26, 68, 18, 18, 180, 360), L([44, 68], [44, 90]))),
  i: g(16, L([8, 50], [8, 90]), dot(8, 32)),
  j: g(30, S(L([22, 50], [22, 108]), arc(12, 108, 10, 14, 0, 160)), dot(22, 32)),
  k: g(46, L([8, 10], [8, 90]), L([40, 50], [10, 72]), L([10, 72], [42, 90])),
  l: g(16, L([8, 10], [8, 90])),
  m: g(72,
    L([8, 50], [8, 90]),
    S(arc(22, 64, 14, 14, 180, 360), L([36, 64], [36, 90])),
    S(arc(50, 64, 14, 14, 180, 360), L([64, 64], [64, 90]))),
  n: g(50, L([8, 50], [8, 90]), S(arc(26, 68, 18, 18, 180, 360), L([44, 68], [44, 90]))),
  o: g(46, arc(23, 70, 20, 20, -90, -450)),
  p: g(50, L([8, 50], [8, DESC]), arc(26, 70, 18, 20, 180, 540)),
  q: g(50, arc(24, 70, 20, 20, -30, -390), L([44, 50], [44, DESC])),
  r: g(40, L([8, 50], [8, 90]), arc(24, 66, 16, 16, 180, 320)),
  s: g(40, S(arc(20, 60, 14, 10, -20, -270), arc(20, 80, 14, 10, -90, 160))),
  t: g(32, L([16, 22], [16, 90]), L([4, 50], [30, 50])),
  u: g(48, S(L([8, 50], [8, 72]), arc(24, 72, 16, 18, 180, 0), L([40, 72], [40, 50])), L([40, 50], [40, 90])),
  v: g(48, L([4, 50], [24, 90], [44, 50])),
  w: g(68, L([4, 50], [18, 90], [34, 58], [50, 90], [64, 50])),
  x: g(44, L([4, 50], [40, 90]), L([40, 50], [4, 90])),
  y: g(48, L([4, 50], [24, 90]), L([44, 50], [14, DESC])),
  z: g(44, L([4, 50], [40, 50], [4, 90], [40, 90])),
};

export const DIGITS: Record<string, Glyph> = {
  '0': g(50, arc(25, 50, 21, 40, -90, -450)),
  '1': g(30, L([15, 10], [15, 90])),
  '2': g(52, S(arc(25, 31, 20, 21, 200, 400), L([40.3, 44.5], [5, 90], [47, 90]))),
  '3': g(48, S(arc(22, 30, 20, 20, 215, 450), arc(22, 70, 20, 20, 270, 505))),
  '4': g(52, L([30, 10], [6, 62], [48, 62]), L([38, 10], [38, 90])),
  '5': g(48, S(L([10, 10], [8.7, 47.3]), arc(24, 64, 20, 26, 220, 505)), L([10, 10], [42, 10])),
  '6': g(50, S(arc(40, 52, 32, 40, 262, 150), arc(28, 70, 16, 18, 174, -186))),
  '7': g(48, L([4, 10], [44, 10], [16, 90])),
  '8': g(46, S(arc(23, 30, 17, 20, -20, -270), arc(23, 70, 20, 20, -90, 270), arc(23, 30, 17, 20, 90, -20))),
  '9': g(48, arc(24, 32, 20, 22, -20, -380), L([44, 32], [44, 90])),
};

export type Category = 'upper' | 'lower' | 'numbers';

export interface TraceItem {
  /** Stable id used for saved stars, e.g. "upper:A", "numbers:23". */
  id: string;
  label: string;
  /** What the voice says. */
  say: string;
  category: Category;
}

const LETTER_NAMES: Record<string, string> = {
  A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'ef', G: 'jee', H: 'aitch', I: 'eye',
  J: 'jay', K: 'kay', L: 'el', M: 'em', N: 'en', O: 'oh', P: 'pee', Q: 'cue', R: 'ar',
  S: 'ess', T: 'tee', U: 'you', V: 'vee', W: 'double you', X: 'ex', Y: 'why', Z: 'zee',
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const ITEMS: Record<Category, TraceItem[]> = {
  upper: LETTERS.map((c) => ({ id: `upper:${c}`, label: c, say: LETTER_NAMES[c], category: 'upper' })),
  lower: LETTERS.map((c) => ({ id: `lower:${c.toLowerCase()}`, label: c.toLowerCase(), say: LETTER_NAMES[c], category: 'lower' })),
  numbers: Array.from({ length: 100 }, (_, i) => ({ id: `numbers:${i + 1}`, label: String(i + 1), say: String(i + 1), category: 'numbers' })),
};

const GAP = 10;

export interface Layout {
  /** Every stroke of the item, positioned, in drawing order. */
  strokes: Pt[][];
  width: number;
  /** Vertical extent in glyph units: capitals/digits 0..100, lowercase 0..130. */
  height: number;
}

/** Glyphs of an item side by side (multi-digit numbers are traced left to right). */
export function layoutItem(item: TraceItem): Layout {
  const table = item.category === 'upper' ? UPPER : item.category === 'lower' ? LOWER : DIGITS;
  const strokes: Pt[][] = [];
  let x = 0;
  [...item.label].forEach((ch, i) => {
    const glyph = table[ch];
    if (i > 0) x += GAP;
    for (const s of glyph.strokes) strokes.push(s.map(([px, py]) => [px + x, py] as Pt));
    x += glyph.width;
  });
  return { strokes, width: x, height: item.category === 'lower' ? 130 : 100 };
}
