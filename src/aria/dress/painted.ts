// Painted dress-up: one shared painted body (in a few skin tones and eye colors)
// and painted clothes drawn to fit it exactly, so every piece fits every painted
// doll. The art is in assets/painted (made from AI-generated pictures of the
// bare doll wearing each piece, then cut out; see assets/painted/README.md).
// Painted pieces are recolored with a hue shift (an SVG color matrix, which also
// works on older iPads), so the color dots still work.
import type { Doll, Item, Slot } from './wardrobe';
import { PAINTED_MANIFEST } from './painted-data';

const URLS = import.meta.glob<string>('../assets/painted/*.png', { eager: true, import: 'default' });
const urlOf = (file: string): string => URLS[`../assets/painted/${file}.png`] ?? '';

/** The picture is 600 × 894; it is drawn into the same 200 × 320 box as the SVG dolls. */
const IMG_H = 320;
const IMG_W = (IMG_H * 600) / 894;
const IMG_X = (200 - IMG_W) / 2;

const num = (v: number) => (Math.round(v * 100) / 100).toString();

function hsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** How bright a color looks (0 to 1). */
function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

let filterCount = 0;

/** A filter that turns a piece that is mostly `base` into one that is mostly `target`. */
function recolorFilter(base: string, target: string): { id: string; defs: string } | null {
  if (base.toLowerCase() === target.toLowerCase()) return null;
  const [bh, bs, bl] = hsl(base);
  const [th, ts, tl] = hsl(target);
  const id = `pc${filterCount++}`;
  let steps: string;
  if (ts < 0.2) {
    // white, grey or black: drain the color and set the brightness
    const k = clamp(luma(target) / Math.max(luma(base), 0.1), 0.15, 3.5);
    steps = `<feColorMatrix type="saturate" values="0.04"/><feComponentTransfer><feFuncR type="linear" slope="${num(k)}"/><feFuncG type="linear" slope="${num(k)}"/><feFuncB type="linear" slope="${num(k)}"/></feComponentTransfer>`;
  } else {
    const k = clamp(tl / Math.max(bl, 0.1), 0.6, 1.5);
    const sat = clamp(ts / Math.max(bs, 0.2), 0.6, 1.6);
    steps = `<feColorMatrix type="hueRotate" values="${num(th - bh)}"/><feColorMatrix type="saturate" values="${num(sat)}"/><feComponentTransfer><feFuncR type="linear" slope="${num(k)}"/><feFuncG type="linear" slope="${num(k)}"/><feFuncB type="linear" slope="${num(k)}"/></feComponentTransfer>`;
  }
  return { id, defs: `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">${steps}</filter>` };
}

/** One painted picture, optionally recolored from `base` to `target`. */
export function paintedImage(file: string, base?: string, target?: string): string {
  const f = base && target ? recolorFilter(base, target) : null;
  return `${f ? `<defs>${f.defs}</defs>` : ''}<image href="${urlOf(file)}" x="${num(IMG_X)}" y="0" width="${num(IMG_W)}" height="${IMG_H}" preserveAspectRatio="none"${f ? ` filter="url(#${f.id})"` : ''}/>`;
}

/** The painted doll's body (skin tone and eyes are baked into the picture). */
export const paintedBody = (d: Doll): string => paintedImage(`body-${d.body}`);

/** A box around the head (and hair or hat), for small pictures of her face. */
export const PAINTED_HEAD_BOX = '34 2 132 120';

const mk = (m: (typeof PAINTED_MANIFEST)[number]): Item => ({
  id: m.id,
  slot: m.slot as Slot,
  name: m.name,
  front: '',
  colors: [m.color, '#ffffff'],
  painted: { file: m.id, bounds: m.bounds },
});

/**
 * Knee-length shorts she always wears when she has no dress or bottom on, so the
 * painted body never shows underwear. Not in any drawer; it can't be taken off.
 */
export const UNDERLAYER_ID = 'pb-shorts';

export const PAINTED_HAIR: Item[] = PAINTED_MANIFEST.filter((m) => m.slot === 'hair').map(mk);
export const PAINTED_ITEMS: Item[] = PAINTED_MANIFEST.filter((m) => m.slot !== 'hair' && m.id !== UNDERLAYER_ID).map(mk);
export const PAINTED_UNDERLAYER: Item[] = PAINTED_MANIFEST.filter((m) => m.id === UNDERLAYER_ID).map(mk);

const has = (id: string | undefined) => !!id && PAINTED_MANIFEST.some((m) => m.id === id);
const outfit = (o: Partial<Record<Slot, string>>): Partial<Record<Slot, string>> =>
  Object.fromEntries(Object.entries(o).filter(([, id]) => has(id))) as Partial<Record<Slot, string>>;

/** A doll whose chosen hairstyle isn't made yet gets the first one that is. */
const withHair = (d: Doll): Doll => (has(d.hair) ? d : { ...d, hair: PAINTED_HAIR[0]?.id ?? d.hair });

/** Original painted dolls: the same body in different skin tones, eyes and hair. */
export const PAINTED_DOLLS: Doll[] = ([
  { id: 'pia', name: 'Pia', body: 'fair', skin: '#fbd9c2', eyes: '#3b6fb0', hair: 'ph-long', hairColor: '#f2c75c',
    outfit: outfit({ dress: 'pd-party', shoes: 'ps-flats' }) },
  { id: 'tali', name: 'Tali', body: 'tan', skin: '#e0a878', eyes: '#2f7a4a', hair: 'ph-ponytail', hairColor: '#6b4128',
    outfit: outfit({ top: 'pt-tee', bottom: 'pb-jeans', shoes: 'ps-sneakers' }) },
  { id: 'rina', name: 'Rina', body: 'amber', skin: '#c78a5a', eyes: '#6b4128', hair: 'ph-buns', hairColor: '#2b2230',
    outfit: outfit({ dress: 'pd-sundress', shoes: 'ps-flats' }) },
  { id: 'kemi', name: 'Kemi', body: 'brown', skin: '#9a6440', eyes: '#3a2418', hair: 'ph-curly', hairColor: '#2b2230',
    outfit: outfit({ dress: 'pd-pink-gown', hat: 'ph-crown' }) },
  { id: 'amani', name: 'Amani', body: 'deep', skin: '#6e4128', eyes: '#2a1a12', hair: 'ph-bob', hairColor: '#9b6ae0',
    outfit: outfit({ top: 'pt-hoodie', bottom: 'pb-skirt', shoes: 'ps-boots' }) },
  { id: 'lily', name: 'Lily', body: 'rose', skin: '#f1c7a0', eyes: '#7a4ab0', hair: 'ph-braid', hairColor: '#d9473c',
    outfit: outfit({ dress: 'pd-blue-gown', shoes: 'ps-flats' }) },
] as Doll[]).map(withHair);
