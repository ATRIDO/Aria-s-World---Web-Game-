import red from './assets/crayons/red.png';
import orange from './assets/crayons/orange.png';
import yellow from './assets/crayons/yellow.png';
import green from './assets/crayons/green.png';
import blue from './assets/crayons/blue.png';
import lightBlue from './assets/crayons/light-blue.png';
import violet from './assets/crayons/violet.png';
import pink from './assets/crayons/pink.png';
import gray from './assets/crayons/gray.png';
import white from './assets/crayons/white.png';

export interface PageDef {
  /** Storage key; keep stable so saved pictures survive updates. */
  id: string;
  title: string;
  /** Full drawing on white, used to find the regions. */
  base: string;
  /** Transparent line art drawn over the paint. */
  outline: string;
}

/** An empty sheet: no line art, strokes aren't clipped to regions. */
export interface BlankPageDef {
  id: string;
  title: string;
  blank: { width: number; height: number };
}

export type AnyPage = PageDef | BlankPageDef;

export const isBlank = (p: AnyPage): p is BlankPageDef => 'blank' in p;

export type Mode = 'color' | 'sketch';

// Every `<id>-base.png` with a matching `<id>-outline.png` in assets/pages is a
// coloring page, so adding a picture is just adding its two files.
const bases = import.meta.glob<string>('./assets/pages/*-base.png', { eager: true, import: 'default' });
const outlines = import.meta.glob<string>('./assets/pages/*-outline.png', { eager: true, import: 'default' });

/** Titles are only read by screen readers; new pages fall back to "Picture N". */
const TITLES: Record<string, string> = {
  page1: 'Girl with sparkles',
  page2: 'Three friends',
  page3: 'Winter friends',
  page4: 'Ariel',
  page5: 'Belle',
  page6: 'Rapunzel',
  page7: 'Snow White',
  page8: 'Cinderella',
  page9: 'Aurora',
  page10: 'Jasmine',
  page11: 'Moana',
  page12: 'Mulan',
  page13: 'Three pop stars',
  page14: 'Singing girl',
  page15: 'Three wizards',
  page16: 'Powerpuff Girls flying',
  page17: 'Buttercup',
  page18: 'Powerpuff Girls at the beach',
  page19: 'Powerpuff Girls over the city',
  page20: 'Bubbles',
  page21: 'Rarity',
  page22: 'Twilight Sparkle',
  page23: 'Pinkie Pie',
  page24: 'Peppa reading',
  page25: 'Peppa with ice cream',
  page26: 'Peppa’s party',
  page27: 'Rex',
  page28: 'Woody',
  page29: 'Mr. Potato Head',
  page30: 'Alien',
  page31: 'Hamm',
};

export const PAGES: PageDef[] = Object.keys(bases)
  .map((path) => path.slice(path.lastIndexOf('/') + 1, -'-base.png'.length))
  .filter((id) => outlines[`./assets/pages/${id}-outline.png`])
  // Natural order, so page10 comes after page9.
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((id, i) => ({
    id,
    title: TITLES[id] ?? `Picture ${i + 1}`,
    base: bases[`./assets/pages/${id}-base.png`],
    outline: outlines[`./assets/pages/${id}-outline.png`],
  }));

// Square so the sheet fits both iPad orientations and phones; 640 → 1280 px paint,
// the same memory per undo step as the coloring pages.
const SHEET = { width: 640, height: 640 };

/** Sheets every player starts with (ids predate added sheets; keep them). */
const FIRST_SKETCH_IDS = ['sketch1', 'sketch2', 'sketch3'];
/** Prefix of sheets added with the + button: `sketch-<created ms>`. */
const ADDED_SKETCH_PREFIX = 'sketch-';

const sketchPage = (id: string, i: number): BlankPageDef => ({ id, title: `Drawing ${i + 1}`, blank: SHEET });

/**
 * The sketch sheets: the first three plus any added ones that were saved,
 * oldest first. `savedIds` are the ids in storage (other ids are ignored).
 */
export function sketchPages(savedIds: string[]): BlankPageDef[] {
  const added = [...new Set(savedIds)]
    .filter((id) => id.startsWith(ADDED_SKETCH_PREFIX))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return [...FIRST_SKETCH_IDS, ...added].map(sketchPage);
}

/** A new, empty sheet to append after the existing ones. */
export function newSketchPage(existing: AnyPage[]): BlankPageDef {
  // Date.now() keeps ids sortable; bump past any clash from a fast double tap.
  let t = Date.now();
  while (existing.some((p) => p.id === `${ADDED_SKETCH_PREFIX}${t}`)) t++;
  return sketchPage(`${ADDED_SKETCH_PREFIX}${t}`, existing.length);
}

export interface Crayon {
  name: string;
  /** sRGB, 0-255. */
  rgb: [number, number, number];
  image: string;
  /** CSS filter for reusing another crayon's art (the black one is a darkened gray). */
  filter?: string;
}

// Colors come from the Unity scene's PenColorButtons where set, otherwise
// sampled from the crayon artwork.
export const CRAYONS: Crayon[] = [
  { name: 'Red', rgb: [0xec, 0x5c, 0x48], image: red },
  { name: 'Orange', rgb: [0xfe, 0xb7, 0x87], image: orange },
  { name: 'Yellow', rgb: [0xe0, 0xea, 0x55], image: yellow },
  { name: 'Green', rgb: [0xa4, 0xee, 0xa4], image: green },
  { name: 'Blue', rgb: [0x5a, 0x8e, 0xe7], image: blue },
  { name: 'Light blue', rgb: [0xba, 0xcf, 0xf9], image: lightBlue },
  { name: 'Violet', rgb: [0xd0, 0xc3, 0xff], image: violet },
  { name: 'Pink', rgb: [0xff, 0xd6, 0xfc], image: pink },
  { name: 'Gray', rgb: [0x71, 0x71, 0x71], image: gray },
  { name: 'Black', rgb: [0x2a, 0x26, 0x28], image: gray, filter: 'brightness(0.4)' },
  { name: 'White', rgb: [0xf8, 0xf8, 0xf8], image: white },
];

/** Brush radii in paint-texture pixels (paint is PAINT_SCALE × page size). */
export const BRUSH_SIZES = [
  { name: 'Small', radius: 14 },
  { name: 'Medium', radius: 28 },
  { name: 'Large', radius: 50 },
];

/** Paint layer resolution relative to the page art, for crisper strokes. */
export const PAINT_SCALE = 2;
