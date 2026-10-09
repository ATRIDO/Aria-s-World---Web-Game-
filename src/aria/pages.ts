
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

/**
 * Titles are only read by screen readers; new pages fall back to "Picture N".
 * Every page is original (art17+ made with Higgsfield, see ART17-59-SOURCE.md; pages-src/
 * and scripts/svg-to-page.mjs are for hand-drawn SVG pages).
 */
const TITLES: Record<string, string> = {
  art17: 'Princess and castle',
  art18: 'Pop star',
  art19: 'Mermaid princess',
  art20: 'Two princesses',
  art21: 'Princess carriage',
  art22: 'Three pop stars on stage',
  art23: 'Idol and kitty',
  art24: 'Brave heroes and dragon',
  art25: 'Lion family',
  art26: 'Panda and koala',
  art27: 'Dino family',
  art28: 'Rocket in space',
  art29: 'Idol trio',
  art30: 'Boy band',
  art31: 'Snowman and penguins',
  art32: 'Idol group on stage',
  art33: 'Street dancer',
  art34: 'Little wizards',
  art35: 'Princess library',
  art36: 'Winged pony ride',
  art37: 'Sailing girl',
  art38: 'Knight princess',
  art39: 'Rose garden fairies',
  art40: 'Princess and frog',
  art41: 'Tower princess',
  art42: 'Royal ball',
  art43: 'Teddy tea party',
  art44: 'Super girls flying',
  art45: 'Super girls at the beach',
  art46: 'Kitten rescue',
  art47: 'Hero and puppy',
  art48: 'Super girls cheer',
  art49: 'Unicorn meadow',
  art50: 'Flying pony',
  art51: 'Pony with cupcake',
  art52: 'Bear reading',
  art53: 'Bunny ice cream',
  art54: 'Animal birthday',
  art55: 'Toy robot',
  art56: 'Toy dinosaur',
  art57: 'Cowboy teddy',
  art58: 'Piggy bank',
  art59: 'Toy astronaut',
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

/** Brush radii in paint-texture pixels (paint is PAINT_SCALE × page size). */
export const BRUSH_SIZES = [
  { name: 'Small', radius: 14 },
  { name: 'Medium', radius: 28 },
  { name: 'Large', radius: 50 },
];

/** Paint layer resolution relative to the page art, for crisper strokes. */
export const PAINT_SCALE = 2;
