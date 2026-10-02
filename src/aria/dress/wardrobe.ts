// Dress-up: original dolls (not any brand's or show's characters) and their
// clothes, drawn by hand as SVG in one 200 × 320 box so every item fits every
// doll. Colors come from CSS variables, so a child can recolor what's worn:
//   .skin → --skin, .hair → --hair, .eye → --eyes, .c1 → --c1, .c2 → --c2

export type Slot = 'hair' | 'top' | 'bottom' | 'dress' | 'shoes' | 'hat' | 'acc';

export interface Item {
  id: string;
  slot: Slot;
  /** Shown to grown-ups (aria-label); kids go by the picture. */
  name: string;
  /** Drawn behind the doll's body (long hair, a cape). */
  back?: string;
  /** Drawn in this slot's layer, over the body. */
  front: string;
  /** Default colors for .c1 and .c2 (hair uses the doll's hair color). */
  colors: [string, string];
}

export interface Doll {
  id: string;
  name: string;
  skin: string;
  eyes: string;
  hair: string;
  hairColor: string;
  /** What she starts in: item id per slot. */
  outfit: Partial<Record<Slot, string>>;
}

const INK = '#5b3a47';
const O = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
/** A limb: a dark outline stroke under a colored stroke. */
const limb = (d: string, cls: string, w = 13) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 5}" stroke-linecap="round"/>` +
  `<path d="${d}" fill="none" class="${cls}-stroke" stroke-width="${w}" stroke-linecap="round"/>`;
const sparkle = (x: number, y: number, r = 4) =>
  `<path d="M${x} ${y - r}l${r * 0.3} ${r * 0.7} ${r * 0.7} ${r * 0.3}-${r * 0.7} ${r * 0.3}-${r * 0.3} ${r * 0.7}-${r * 0.3}-${r * 0.7}-${r * 0.7}-${r * 0.3} ${r * 0.7}-${r * 0.3}z" fill="#fff"/>`;

const LEFT_ARM = 'M71 140C63 165 60 190 60 212';
const RIGHT_ARM = 'M129 140C137 165 140 190 140 212';

/** The doll: legs, arms, torso, head and face. Clothes go on top. */
export const BODY = `
  ${limb('M86 204v90', 'skin', 15)}${limb('M114 204v90', 'skin', 15)}
  ${limb(LEFT_ARM, 'skin')}${limb(RIGHT_ARM, 'skin')}
  <circle cx="60" cy="216" r="7" class="skin" ${O}/><circle cx="140" cy="216" r="7" class="skin" ${O}/>
  <path d="M74 132Q100 125 126 132L122 176Q120 192 124 206H76Q80 192 78 176Z" fill="#ffe3ee" ${O}/>
  <path d="M76 190H124L126 210H74Z" fill="#ffc7da" ${O}/>
  <rect x="92" y="108" width="16" height="26" rx="6" class="skin" ${O}/>
  <circle cx="57" cy="80" r="7" class="skin" ${O}/><circle cx="143" cy="80" r="7" class="skin" ${O}/>
  <circle cx="100" cy="74" r="44" class="skin" ${O}/>
  <ellipse cx="84" cy="83" rx="7" ry="9" class="eye"/><ellipse cx="116" cy="83" rx="7" ry="9" class="eye"/>
  <circle cx="86.5" cy="79.5" r="2.8" fill="#fff"/><circle cx="118.5" cy="79.5" r="2.8" fill="#fff"/>
  <path d="M76 75l-4-3M124 75l4-3" fill="none" ${O}/>
  <ellipse cx="74" cy="96" rx="6" ry="3.5" fill="#ff9db5" opacity="0.6"/><ellipse cx="126" cy="96" rx="6" ry="3.5" fill="#ff9db5" opacity="0.6"/>
  <path d="M92 100q8 7 16 0" fill="none" ${O}/>`;

/** Bare feet in the doll's skin, shown when no shoes are on. */
export const FEET = `<ellipse cx="84" cy="298" rx="10" ry="6" class="skin" ${O}/><ellipse cx="116" cy="298" rx="10" ry="6" class="skin" ${O}/>`;

const H = (id: string, name: string, back: string, front: string): Item => ({ id, slot: 'hair', name, back, front, colors: ['#ff6fae', '#ffffff'] });

export const HAIR: Item[] = [
  H('long', 'Long hair',
    `<path d="M54 72C48 26 152 26 146 72L154 196Q100 212 46 196Z" class="hair" ${O}/>`,
    `<path d="M54 78A47 47 0 1 1 146 78C132 58 114 52 100 60 86 52 68 58 54 78Z" class="hair" ${O}/>`),
  H('ponytail', 'Ponytail',
    `<path d="M136 44c30 6 38 56 24 112-10-20-10-58-26-82z" class="hair" ${O}/>`,
    `<path d="M54 78A47 47 0 1 1 146 78C126 56 96 50 76 60 66 64 60 70 54 78Z" class="hair" ${O}/>
     <circle cx="138" cy="44" r="7" class="c1" ${O}/>`),
  H('buns', 'Two buns',
    `<circle cx="60" cy="34" r="18" class="hair" ${O}/><circle cx="140" cy="34" r="18" class="hair" ${O}/>`,
    `<path d="M54 78A47 47 0 1 1 146 78C122 60 78 60 54 78Z" class="hair" ${O}/>`),
  H('bob', 'Short bob',
    `<path d="M51 74C46 28 154 28 149 74L150 118Q140 128 126 120H74Q60 128 50 118Z" class="hair" ${O}/>`,
    `<path d="M53 76A48 48 0 1 1 147 76Q122 62 100 64 78 62 53 76Z" class="hair" ${O}/>`),
  H('curly', 'Curly puff',
    `<circle cx="100" cy="26" r="26" class="hair" ${O}/><circle cx="58" cy="60" r="16" class="hair" ${O}/><circle cx="142" cy="60" r="16" class="hair" ${O}/>`,
    `<path d="M54 78A47 47 0 1 1 146 78C136 62 126 56 116 60 110 52 90 52 84 60 74 56 64 62 54 78Z" class="hair" ${O}/>`),
];

export const HAIR_COLORS = ['#2b2230', '#6b4128', '#c58a4a', '#f2c75c', '#ff8fc8', '#9b6ae0', '#4f7fe0', '#d9473c'];

const I = (id: string, slot: Slot, name: string, colors: [string, string], front: string, back?: string): Item =>
  ({ id, slot, name, colors, front, back });

const SLEEVES_SHORT = `<path d="M74 132 60 152l11 6 9-14z" class="c1" ${O}/><path d="M126 132l14 20-11 6-9-14z" class="c1" ${O}/>`;
const SLEEVES_LONG = `${limb(LEFT_ARM, 'c1', 15)}${limb(RIGHT_ARM, 'c1', 15)}
  <circle cx="60" cy="214" r="6" class="c2" ${O}/><circle cx="140" cy="214" r="6" class="c2" ${O}/>`;

export const ITEMS: Item[] = [
  // Tops
  I('tee', 'top', 'T-shirt', ['#4fc3ee', '#ffd84a'], `${SLEEVES_SHORT}
    <path d="M73 130Q100 124 127 130L124 182H76Z" class="c1" ${O}/>
    <path d="M100 146l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" class="c2"/>`),
  I('sweater', 'top', 'Sweater', ['#ff8f6b', '#fff1df'], `${SLEEVES_LONG}
    <path d="M73 130Q100 124 127 130L125 190H75Z" class="c1" ${O}/>
    <path d="M76 182h48v8H76z" class="c2" ${O}/><path d="M86 130q14 10 28 0" fill="none" ${O}/>`),
  I('tank', 'top', 'Tank top', ['#a4e07a', '#ffffff'], `
    <path d="M80 130h7q13 14 26 0h7l4 52H76Z" class="c1" ${O}/>
    <circle cx="92" cy="160" r="3" class="c2"/><circle cx="108" cy="166" r="3" class="c2"/><circle cx="100" cy="152" r="3" class="c2"/>`),
  I('jacket', 'top', 'Stage jacket', ['#9b6ae0', '#ffd84a'], `${SLEEVES_LONG}
    <path d="M73 130Q86 126 96 128L94 176H76Z" class="c1" ${O}/><path d="M127 130Q114 126 104 128L106 176H124Z" class="c1" ${O}/>
    <path d="M94 128 86 142l8 4M106 128l8 14-8 4" fill="none" ${O}/>
    ${sparkle(84, 156)}${sparkle(116, 162)}${sparkle(80, 168, 3)}`),

  // Bottoms
  I('skirt', 'bottom', 'Skirt', ['#ff7ab8', '#ffffff'], `
    <path d="M76 178H124L138 236Q100 246 62 236Z" class="c1" ${O}/>
    <path d="M90 180 84 240M100 180v62M110 180l6 60" fill="none" stroke="${INK}" stroke-width="1.5" opacity="0.5"/>
    <path d="M76 178h48v6H76z" class="c2" ${O}/>`),
  I('jeans', 'bottom', 'Jeans', ['#4c86d9', '#ffd84a'], `
    <path d="M76 178H124L123 290H104L100 214 96 290H77Z" class="c1" ${O}/>
    <path d="M100 182v32M80 186h16M104 186h16" fill="none" class="c2-stroke" stroke-width="1.6" stroke-dasharray="3 3"/>`),
  I('shorts', 'bottom', 'Shorts', ['#f6a33c', '#ffffff'], `
    <path d="M76 178H124L127 218H102L100 204 98 218H73Z" class="c1" ${O}/>
    <path d="M76 178h48v6H76z" class="c2" ${O}/>`),
  I('tutu', 'bottom', 'Tutu', ['#ffb3d9', '#ffffff'], `
    <path d="M70 182h60l14 30-9-5-7 7-7-6-7 7-7-6-7 7-7-6-7 7-7-6-7 7-7-6-7 7-9 5z" class="c1" ${O} opacity="0.95"/>
    <path d="M76 178h48v7H76z" class="c2" ${O}/>`),

  // Dresses (worn instead of a top and bottom)
  I('party', 'dress', 'Party dress', ['#ec4840', '#ffd84a'], `${SLEEVES_SHORT}
    <path d="M75 132Q100 125 125 132L121 182 142 252Q100 264 58 252L79 182Z" class="c1" ${O}/>
    <path d="M100 182l-12-7v14zM100 182l12-7v14z" class="c2" ${O}/><circle cx="100" cy="182" r="4" class="c2" ${O}/>`),
  I('gown', 'dress', 'Ball gown', ['#7fd0f5', '#ffffff'], `
    <circle cx="74" cy="138" r="11" class="c1" ${O}/><circle cx="126" cy="138" r="11" class="c1" ${O}/>
    <path d="M78 132Q100 125 122 132L118 180C140 220 152 262 162 296Q100 310 38 296C48 262 60 220 82 180Z" class="c1" ${O}/>
    <path d="M70 250q30 12 60 0M60 280q40 14 80 0" fill="none" class="c2-stroke" stroke-width="3" stroke-linecap="round"/>
    ${sparkle(86, 214)}${sparkle(118, 236)}${sparkle(96, 266, 5)}${sparkle(130, 276, 3)}${sparkle(70, 284, 3)}`),
  I('sundress', 'dress', 'Sundress', ['#ffd84a', '#ff8fa8'], `
    <path d="M84 130v10M116 130v10" fill="none" ${O}/>
    <path d="M78 138H122L120 180 136 244Q100 254 64 244L80 180Z" class="c1" ${O}/>
    <circle cx="88" cy="204" r="5" class="c2"/><circle cx="110" cy="220" r="5" class="c2"/><circle cx="96" cy="234" r="4" class="c2"/><circle cx="118" cy="196" r="4" class="c2"/>`),
  I('stage', 'dress', 'Stage dress', ['#2b2230', '#ff6fae'], `${SLEEVES_SHORT}
    <path d="M75 132Q100 125 125 132L121 182 130 222Q100 230 70 222L79 182Z" class="c1" ${O}/>
    <path d="M78 180h44v8H78z" class="c2" ${O}/>
    <path d="M100 178l3 5 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#ffd84a" ${O}/>
    ${sparkle(88, 150)}${sparkle(112, 160)}${sparkle(94, 206)}${sparkle(112, 212, 3)}`),

  // Shoes
  I('sneakers', 'shoes', 'Sneakers', ['#ffffff', '#ec4840'], `
    <path d="M73 292c0-6 6-8 12-8s11 4 13 10v6H73z" class="c1" ${O}/><path d="M102 292c0-6 6-8 12-8s11 4 13 10v6h-25z" class="c1" ${O}/>
    <path d="M73 300h25M102 300h25" fill="none" class="c2-stroke" stroke-width="4"/>`),
  I('boots', 'shoes', 'Boots', ['#a8693a', '#f2c75c'], `
    <path d="M77 252h18v42c4 0 8 3 8 8H75z" class="c1" ${O}/><path d="M105 252h18v50H97c0-5 4-8 8-8z" class="c1" ${O}/>
    <path d="M77 252h18v6H77zM105 252h18v6h-18z" class="c2" ${O}/>`),
  I('sandals', 'shoes', 'Sandals', ['#ff7ab8', '#ffd84a'], `
    ${FEET}
    <path d="M75 296q9-8 18 0M107 296q9-8 18 0" fill="none" class="c1-stroke" stroke-width="4" stroke-linecap="round"/>
    <circle cx="84" cy="292" r="3" class="c2"/><circle cx="116" cy="292" r="3" class="c2"/>`),
  I('flats', 'shoes', 'Party shoes', ['#9b6ae0', '#ffffff'], `
    <ellipse cx="84" cy="298" rx="11" ry="7" class="c1" ${O}/><ellipse cx="116" cy="298" rx="11" ry="7" class="c1" ${O}/>
    <circle cx="80" cy="294" r="3" class="c2"/><circle cx="112" cy="294" r="3" class="c2"/>`),

  // Hats and headbands
  I('crown', 'hat', 'Crown', ['#ffcf3a', '#ec4840'], `
    <path d="M70 40 76 14l12 14 12-20 12 20 12-14 6 26q-30-8-60 0z" class="c1" ${O}/>
    <circle cx="100" cy="30" r="4" class="c2"/><circle cx="82" cy="32" r="3" class="c2"/><circle cx="118" cy="32" r="3" class="c2"/>`),
  I('beret', 'hat', 'Beret', ['#ec4840', '#2b2230'], `
    <ellipse cx="96" cy="36" rx="42" ry="14" transform="rotate(-8 96 36)" class="c1" ${O}/>
    <path d="M96 22v-6" fill="none" class="c2-stroke" stroke-width="4" stroke-linecap="round"/>`),
  I('sunhat', 'hat', 'Sun hat', ['#f8e2b0', '#ff7ab8'], `
    <ellipse cx="100" cy="42" rx="64" ry="13" class="c1" ${O}/>
    <path d="M70 40c0-24 60-24 60 0z" class="c1" ${O}/>
    <path d="M71 34h58v6H71z" class="c2" ${O}/>`),
  I('bow', 'hat', 'Big bow', ['#ff6fae', '#ffffff'], `
    <path d="M124 34 104 22v26zM124 34l20-12v26z" class="c1" ${O}/><circle cx="124" cy="34" r="6" class="c1" ${O}/>
    <circle cx="112" cy="30" r="2" class="c2"/><circle cx="136" cy="30" r="2" class="c2"/>`),
  I('headphones', 'hat', 'Headphones', ['#27b8b0', '#ffffff'], `
    <path d="M58 76C56 20 144 20 142 76" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M58 76C56 20 144 20 142 76" fill="none" class="c1-stroke" stroke-width="5" stroke-linecap="round"/>
    <rect x="46" y="66" width="16" height="26" rx="7" class="c1" ${O}/><rect x="138" y="66" width="16" height="26" rx="7" class="c1" ${O}/>
    <circle cx="54" cy="79" r="4" class="c2"/><circle cx="146" cy="79" r="4" class="c2"/>`),

  // Things to hold or wear
  I('mic', 'acc', 'Microphone', ['#9aa3b5', '#ff6fae'], `
    <path d="M140 212v-34" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M140 212v-34" fill="none" class="c2-stroke" stroke-width="3" stroke-linecap="round"/>
    <circle cx="140" cy="172" r="9" class="c1" ${O}/><circle cx="140" cy="216" r="7" class="skin" ${O}/>`),
  I('lightstick', 'acc', 'Light stick', ['#ffffff', '#ff6fae'], `
    <path d="M60 212v-40" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
    <path d="M60 212v-40" fill="none" class="c1-stroke" stroke-width="4" stroke-linecap="round"/>
    <path d="M60 148l6 12 13 2-10 9 3 13-12-7-12 7 3-13-10-9 13-2z" class="c2" ${O}/>
    <circle cx="60" cy="216" r="7" class="skin" ${O}/>`),
  I('bag', 'acc', 'Handbag', ['#f6a33c', '#ffffff'], `
    <path d="M132 214q8-16 16 0" fill="none" ${O}/>
    <rect x="126" y="214" width="28" height="22" rx="6" class="c1" ${O}/><circle cx="140" cy="224" r="3" class="c2"/>
    <circle cx="140" cy="214" r="7" class="skin" ${O}/>`),
  I('necklace', 'acc', 'Necklace', ['#ffffff', '#ff6fae'], `
    <path d="M84 132q16 18 32 0" fill="none" stroke="${INK}" stroke-width="1.5"/>
    <circle cx="86" cy="136" r="3" class="c1" ${O}/><circle cx="92" cy="142" r="3" class="c1" ${O}/><circle cx="100" cy="145" r="3.5" class="c2" ${O}/>
    <circle cx="108" cy="142" r="3" class="c1" ${O}/><circle cx="114" cy="136" r="3" class="c1" ${O}/>`),
  I('glasses', 'acc', 'Glasses', ['#ff6fae', '#bfe4fb'], `
    <circle cx="84" cy="84" r="12" class="c2" opacity="0.5"/><circle cx="116" cy="84" r="12" class="c2" opacity="0.5"/>
    <circle cx="84" cy="84" r="12" fill="none" class="c1-stroke" stroke-width="4"/><circle cx="116" cy="84" r="12" fill="none" class="c1-stroke" stroke-width="4"/>
    <path d="M96 82h8" fill="none" class="c1-stroke" stroke-width="4"/>`),
  I('wand', 'acc', 'Star wand', ['#ffd84a', '#b98af0'], `
    <path d="M140 212 152 160" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M140 212 152 160" fill="none" class="c2-stroke" stroke-width="3" stroke-linecap="round"/>
    <path d="M153 140l5 10 11 1-8 8 2 11-10-5-10 5 2-11-8-8 11-1z" class="c1" ${O}/>
    <circle cx="140" cy="216" r="7" class="skin" ${O}/>`),
];

/** Colors offered for recoloring whatever is worn in the chosen drawer. */
export const CLOTH_COLORS = ['#ec4840', '#fa8a28', '#ffd84a', '#3ab460', '#4fc3ee', '#3a80e8', '#9b6ae0', '#ff7ab8', '#ffffff', '#2b2230'];

/** Original dolls with different skin tones, eyes and hair. */
export const DOLLS: Doll[] = [
  { id: 'luna', name: 'Luna', skin: '#fbd9c2', eyes: '#3b6fb0', hair: 'long', hairColor: '#f2c75c',
    outfit: { dress: 'party', shoes: 'flats', hat: 'bow' } },
  { id: 'sora', name: 'Sora', skin: '#f1c7a0', eyes: '#4a3328', hair: 'buns', hairColor: '#ff8fc8',
    outfit: { top: 'jacket', bottom: 'skirt', shoes: 'boots', acc: 'mic' } },
  { id: 'nia', name: 'Nia', skin: '#9a6440', eyes: '#3a2418', hair: 'curly', hairColor: '#2b2230',
    outfit: { top: 'tee', bottom: 'jeans', shoes: 'sneakers', hat: 'headphones' } },
  { id: 'ivy', name: 'Ivy', skin: '#d9a07a', eyes: '#2f7a4a', hair: 'ponytail', hairColor: '#6b4128',
    outfit: { dress: 'sundress', shoes: 'sandals', hat: 'sunhat', acc: 'bag' } },
];

export const DRAWERS: { slot: Slot; name: string }[] = [
  { slot: 'hair', name: 'Hair' },
  { slot: 'dress', name: 'Dresses' },
  { slot: 'top', name: 'Tops' },
  { slot: 'bottom', name: 'Skirts and pants' },
  { slot: 'shoes', name: 'Shoes' },
  { slot: 'hat', name: 'Hats' },
  { slot: 'acc', name: 'Things to hold' },
];

/** Layers from back to front. */
export const LAYERS: Slot[] = ['bottom', 'top', 'dress', 'shoes', 'hair', 'hat', 'acc'];
