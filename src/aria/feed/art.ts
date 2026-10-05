// Art for Feed the Puppy: an original puppy and her food, drawn by hand as SVG
// (no image files, so they stay sharp and work offline).

const INK = '#5b3a47';

export type FoodKind = 'bone' | 'cookie' | 'apple' | 'carrot';
export const FOOD_KINDS: FoodKind[] = ['bone', 'cookie', 'apple', 'carrot'];

export interface FoodDef {
  /** Shown to grown-ups (aria-label). */
  name: string;
  /** SVG markup inside a 100 × 100 box. */
  art: string;
}

// The bone is drawn twice: outlined parts first, then the same parts without an
// outline on top, so only the outside edge shows.
const BONE_PARTS =
  '<rect x="24" y="40" width="52" height="20" rx="6"/>' +
  '<circle cx="24" cy="38" r="12"/><circle cx="24" cy="62" r="12"/>' +
  '<circle cx="76" cy="38" r="12"/><circle cx="76" cy="62" r="12"/>';

export const FOODS: Record<FoodKind, FoodDef> = {
  bone: {
    name: 'Bone',
    art: `<g transform="rotate(-25 50 50)">
      <g fill="#fff6e4" stroke="${INK}" stroke-width="8">${BONE_PARTS}</g>
      <g fill="#fff6e4">${BONE_PARTS}</g>
      <path d="M30 46h36" stroke="#f0dcc0" stroke-width="5" stroke-linecap="round"/>
    </g>`,
  },
  cookie: {
    name: 'Cookie',
    art: `<circle cx="50" cy="50" r="38" fill="#e3a55e" stroke="${INK}" stroke-width="4"/>
      <circle cx="50" cy="50" r="30" fill="#eab673"/>
      <g fill="#6b3f2a"><circle cx="36" cy="38" r="6"/><circle cx="60" cy="32" r="5"/><circle cx="64" cy="56" r="6"/>
      <circle cx="40" cy="64" r="5"/><circle cx="52" cy="48" r="4"/></g>
      <path d="M26 40a26 26 0 0 1 14-16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.6"/>`,
  },
  apple: {
    name: 'Apple',
    art: `<path d="M50 30c-6-6-30-10-34 14-4 22 12 44 24 44 4 0 6-2 10-2s6 2 10 2c12 0 28-22 24-44-4-24-28-20-34-14z"
        fill="#ec4840" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M50 30c0-8 2-14 6-18" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
      <path d="M56 20c6-8 18-10 22-6-4 8-14 12-22 6z" fill="#5cc062" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M28 46c0-6 4-10 8-11" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`,
  },
  carrot: {
    name: 'Carrot',
    art: `<g transform="rotate(30 50 50)">
      <path d="M38 34h24c0 22-6 44-12 56-6-12-12-34-12-56z" fill="#fa8a28" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M43 48h7M47 62h6M44 74h5" stroke="#c8611a" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M50 34c-2-10-10-18-16-20 0 8 6 16 16 20zM50 34c0-10 2-20 6-26 4 8 2 18-6 26zM50 34c4-8 14-14 20-12-2 8-12 12-20 12z"
        fill="#5cc062" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    </g>`,
  },
};

/** Puppy size in her own units; the board scales her to fit. */
export const PUPPY_W = 240;
export const PUPPY_H = 260;
/** Where food goes in, and the top of her head (puppy units). */
export const MOUTH = { x: 120, y: 142 };
export const HEAD_TOP = { x: 120, y: 46 };

/**
 * The puppy, in groups the CSS animates: .pp-all (jumps, wiggles), .pp-bob
 * (breathes), .pp-head (tilts up when food comes near), .pp-tail (wags),
 * .pp-eyes (blink), .pp-eyes-happy, .pp-mouth (opens to eat).
 */
export const PUPPY_SVG = `<svg viewBox="0 0 ${PUPPY_W} ${PUPPY_H}" aria-hidden="true">
  <ellipse cx="120" cy="252" rx="86" ry="8" fill="rgb(91 58 71 / 0.15)"/>
  <g class="pp-all"><g class="pp-bob">
    <g class="pp-tail">
      <path d="M166 200c24-4 38-26 34-50" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round"/>
      <path d="M166 200c24-4 38-26 34-50" fill="none" stroke="#e9b77e" stroke-width="10" stroke-linecap="round"/>
    </g>
    <ellipse cx="120" cy="200" rx="62" ry="48" fill="#f2c48d" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="120" cy="212" rx="32" ry="30" fill="#fff3e0"/>
    <g fill="#f2c48d" stroke="${INK}" stroke-width="5">
      <ellipse cx="92" cy="242" rx="21" ry="12"/><ellipse cx="148" cy="242" rx="21" ry="12"/>
    </g>
    <path d="M88 240v6M96 240v6M144 240v6M152 240v6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M80 158q40 22 80 0" fill="none" stroke="#ec4840" stroke-width="12" stroke-linecap="round"/>
    <circle cx="120" cy="176" r="9" fill="#ffd034" stroke="${INK}" stroke-width="3.5"/>
    <g class="pp-head">
      <circle cx="120" cy="106" r="60" fill="#f2c48d" stroke="${INK}" stroke-width="5"/>
      <ellipse cx="146" cy="96" rx="20" ry="18" fill="#dda06a"/>
      <g class="pp-ear-l"><path d="M76 64C48 56 30 92 38 126c4 16 24 18 32 4 8-14 12-40 14-58z" fill="#a8683e" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/></g>
      <g class="pp-ear-r"><path d="M164 64c28-8 46 28 38 62-4 16-24 18-32 4-8-14-12-40-14-58z" fill="#a8683e" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/></g>
      <g class="pp-eyes" fill="#3b2a30">
        <circle cx="98" cy="98" r="10"/><circle cx="142" cy="98" r="10"/>
        <circle cx="101" cy="94" r="3.5" fill="#fff"/><circle cx="145" cy="94" r="3.5" fill="#fff"/>
      </g>
      <g class="pp-eyes-happy" fill="none" stroke="#3b2a30" stroke-width="5" stroke-linecap="round">
        <path d="M88 100q10-12 20 0M132 100q10-12 20 0"/>
      </g>
      <circle cx="80" cy="122" r="9" fill="#ff9fb8" opacity="0.6"/><circle cx="160" cy="122" r="9" fill="#ff9fb8" opacity="0.6"/>
      <ellipse cx="120" cy="128" rx="30" ry="22" fill="#fff3e0" stroke="${INK}" stroke-width="4"/>
      <path d="M120 128v6M108 134q6 6 12-1q6 7 12 1" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <g class="pp-mouth">
        <ellipse cx="120" cy="142" rx="14" ry="12" fill="#7a2f3e" stroke="${INK}" stroke-width="4"/>
        <ellipse cx="120" cy="148" rx="8" ry="5" fill="#ff7f9a"/>
      </g>
      <path d="M109 114h22c0 8-6 13-11 13s-11-5-11-13z" fill="#3b2a30" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="114" cy="117" rx="3.5" ry="2" fill="#fff" opacity="0.8"/>
    </g>
  </g></g>
</svg>`;
