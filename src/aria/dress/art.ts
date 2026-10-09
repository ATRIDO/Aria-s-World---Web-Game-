// Drawing a dressed doll, shared by dress-up and the games that use the
// characters saved there (tug of war).
import { BODY, FEET, HAIR, ITEMS, LAYERS, type Doll, type Item, type Slot } from './wardrobe';

/** What one doll wears: item id per slot, and the colors chosen for each slot. */
export interface Look {
  worn: Partial<Record<Slot, string>>;
  colors: Partial<Record<Slot, [string, string]>>;
  hairColor: string;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const itemById = new Map<string, Item>([...ITEMS, ...HAIR].map((i) => [i.id, i]));

export function freshLook(d: Doll): Look {
  return { worn: { hair: d.hair, ...d.outfit }, colors: {}, hairColor: d.hairColor };
}

/** Colors come back from localStorage and end up inside SVG markup, so only plain hex colors are let through. */
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
export const isHexColor = (c: unknown): c is string => typeof c === 'string' && HEX_COLOR.test(c);
const safeColor = (c: unknown, fallback: string): string => (isHexColor(c) ? c : fallback);

export const cloneLook = (l: Look): Look => JSON.parse(JSON.stringify(l)) as Look;

/**
 * The doll with everything she wears, in layer order (200 × 320 box).
 * `skip` leaves out some slots, e.g. the background place when she's in a game.
 */
export function lookMarkup(d: Doll, look: Look, skip: Slot[] = []): string {
  let back = '', front = '';
  for (const slot of LAYERS) {
    if (skip.includes(slot)) continue;
    const id = look.worn[slot];
    const item = id ? itemById.get(id) : undefined;
    if (!item) continue;
    const picked = look.colors[slot];
    const c1 = safeColor(picked?.[0], item.colors[0]);
    const c2 = safeColor(picked?.[1], item.colors[1]);
    const style = `--c1:${c1};--c2:${c2}`;
    if (item.back) back += `<g style="${style}">${item.back}</g>`;
    front += `<g class="layer" data-slot="${slot}" style="${style}">${item.front}</g>`;
  }
  const feet = look.worn.shoes ? '' : FEET;
  return `<g style="--skin:${d.skin};--eyes:${d.eyes};--hair:${safeColor(look.hairColor, d.hairColor)}">${back}${BODY}${feet}${front}</g>`;
}

/** Just the head and face of BODY (for hair pictures and the doll buttons). */
export function headOnly(): string {
  const start = BODY.indexOf('<circle cx="57"');
  return BODY.slice(start);
}

/** A picture of a doll's head with her hair (and hat, earrings and makeup). */
export function headSvg(d: Doll, look: Look): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 320');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('crop');
  svg.dataset.crop = 'head';
  const { worn } = look;
  const head: Look = { worn: { hair: worn.hair, hat: worn.hat, ears: worn.ears, face: worn.face }, colors: look.colors, hairColor: look.hairColor };
  svg.innerHTML = lookMarkup(d, head).replace(BODY, headOnly());
  return svg;
}

/** Tight viewBox around what's drawn, with a little room. */
export function fitToContent(svg: SVGSVGElement): void {
  if (svg.dataset.fitted) return;
  try {
    const g = svg.firstElementChild as SVGGraphicsElement | null;
    const b = g?.getBBox();
    if (!b || !b.width || !b.height) return;
    let { x, y, width: w, height: h } = b;
    if (svg.dataset.crop === 'head') h = Math.min(h, 130 - y);
    const pad = Math.max(w, h) * 0.08;
    svg.setAttribute('viewBox', `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`);
    svg.dataset.fitted = '1';
  } catch {
    // not rendered yet; keep the full box
  }
}

/** Crops every `svg.crop` inside `root` once it's on screen. */
export function cropAll(root: ParentNode): void {
  requestAnimationFrame(() => root.querySelectorAll<SVGSVGElement>('svg.crop').forEach(fitToContent));
}
