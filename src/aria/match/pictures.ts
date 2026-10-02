// Pictures for the matching game: drag each one onto its shadow. Drawn by hand
// as SVG in a 100 × 100 box (no image files, so they stay sharp and work offline).
// The shadow is the same drawing in one soft color (see .silhouette in style.css),
// so every picture needs an outline that's easy to tell apart from the others.

export interface PictureDef {
  id: string;
  /** Shown under a placed picture, for grown-ups reading along. */
  name: string;
  /** SVG markup inside the 100 × 100 box. */
  art: string;
}

/** Outline for every part: chunky and rounded, like a sticker. */
const O = 'stroke="#5b3a47" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
const INK = '#5b3a47';
const eye = (x: number, y: number, r = 2.8) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff"/>`;
const smile = (x: number, y: number, w = 4) =>
  `<path d="M${x - w} ${y}q${w} ${w * 0.9} ${w * 2} 0" fill="none" ${O}/>`;
const blush = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="2" fill="#ff9db5" opacity="0.7"/>`;

const P = (id: string, name: string, art: string): PictureDef => ({ id, name, art });

export const ANIMALS: PictureDef[] = [
  P('cat', 'Cat', `
    <path d="M66 84c14 2 25-6 22-19-1-6-9-6-8 1 1 6-6 10-14 9z" fill="#f6a33c" ${O}/>
    <ellipse cx="50" cy="72" rx="22" ry="19" fill="#f6a33c" ${O}/>
    <path d="M31 32 29 10l17 13zM69 32l2-22-17 13z" fill="#f6a33c" ${O}/>
    <path d="M33 26 32 16l7 6zM67 26l1-10-7 6z" fill="#ffb3c4"/>
    <circle cx="50" cy="40" r="22" fill="#f6a33c" ${O}/>
    <path d="M44 22c2 4 0 7-2 8M56 22c-2 4 0 7 2 8M50 20v8" fill="none" stroke="#d97a1c" stroke-width="2.5" stroke-linecap="round"/>
    ${eye(42, 39)}${eye(58, 39)}
    <path d="M48 45h4l-2 3z" fill="#ff7f9f"/>${smile(50, 48, 3)}
    <path d="M30 44h-8M30 48l-8 2M70 44h8M70 48l8 2" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="42" cy="90" rx="7" ry="4" fill="#f6a33c" ${O}/><ellipse cx="58" cy="90" rx="7" ry="4" fill="#f6a33c" ${O}/>`),

  P('dog', 'Dog', `
    <path d="M24 52c-10-4-14-13-11-23 3 0 5 2 5 6 0 6 4 10 9 12z" fill="#c98b55" ${O}/>
    <rect x="23" y="62" width="9" height="24" rx="4" fill="#c98b55" ${O}/>
    <rect x="35" y="62" width="9" height="24" rx="4" fill="#c98b55" ${O}/>
    <rect x="54" y="62" width="9" height="24" rx="4" fill="#c98b55" ${O}/>
    <rect x="65" y="62" width="9" height="24" rx="4" fill="#c98b55" ${O}/>
    <rect x="20" y="44" width="54" height="26" rx="13" fill="#c98b55" ${O}/>
    <ellipse cx="44" cy="56" rx="10" ry="7" fill="#e8b98a"/>
    <circle cx="74" cy="34" r="16" fill="#c98b55" ${O}/>
    <ellipse cx="86" cy="41" rx="10" ry="7.5" fill="#e8b98a" ${O}/>
    <circle cx="94" cy="38" r="3.4" fill="${INK}"/>
    <path d="M64 22c-9 2-11 17-4 24 5-2 9-11 6-23z" fill="#8a5a33" ${O}/>
    ${eye(77, 30)}
    <path d="M62 46c6 3 14 3 20-1" fill="none" stroke="#ec4840" stroke-width="4" stroke-linecap="round"/>`),

  P('bunny', 'Bunny', `
    <ellipse cx="39" cy="22" rx="7.5" ry="19" fill="#fbf4f7" ${O}/><ellipse cx="61" cy="22" rx="7.5" ry="19" fill="#fbf4f7" ${O}/>
    <ellipse cx="39" cy="23" rx="3.5" ry="13" fill="#ffc2d1"/><ellipse cx="61" cy="23" rx="3.5" ry="13" fill="#ffc2d1"/>
    <ellipse cx="50" cy="77" rx="21" ry="18" fill="#fbf4f7" ${O}/>
    <circle cx="50" cy="48" r="19" fill="#fbf4f7" ${O}/>
    ${eye(43, 46)}${eye(57, 46)}${blush(38, 53)}${blush(62, 53)}
    <path d="M48 51h4l-2 2.5z" fill="#ff7f9f"/>${smile(50, 54, 2.5)}
    <ellipse cx="40" cy="93" rx="8" ry="4" fill="#fbf4f7" ${O}/><ellipse cx="60" cy="93" rx="8" ry="4" fill="#fbf4f7" ${O}/>`),

  P('elephant', 'Elephant', `
    <path d="M86 52c6 2 8 8 6 13" fill="none" ${O}/>
    <rect x="34" y="62" width="12" height="24" rx="5" fill="#9fb6da" ${O}/>
    <rect x="48" y="62" width="12" height="24" rx="5" fill="#9fb6da" ${O}/>
    <rect x="66" y="62" width="12" height="24" rx="5" fill="#9fb6da" ${O}/>
    <ellipse cx="60" cy="54" rx="28" ry="22" fill="#9fb6da" ${O}/>
    <path d="M18 48c-9 8-10 21-3 31 3 2 7 0 6-3-4-8-3-15 5-21z" fill="#9fb6da" ${O}/>
    <circle cx="28" cy="42" r="17" fill="#9fb6da" ${O}/>
    <ellipse cx="42" cy="44" rx="11" ry="15" fill="#b9cbe8" ${O}/>
    <ellipse cx="42" cy="45" rx="6" ry="9" fill="#ffc2d1"/>
    ${eye(23, 38)}${blush(26, 48)}`),

  P('giraffe', 'Giraffe', `
    <rect x="39" y="68" width="6" height="26" rx="3" fill="#ffcf4a" ${O}/>
    <rect x="48" y="68" width="6" height="26" rx="3" fill="#ffcf4a" ${O}/>
    <rect x="66" y="68" width="6" height="26" rx="3" fill="#ffcf4a" ${O}/>
    <rect x="75" y="68" width="6" height="26" rx="3" fill="#ffcf4a" ${O}/>
    <path d="M82 60c6 4 7 10 6 16" fill="none" ${O}/>
    <ellipse cx="60" cy="64" rx="24" ry="12" fill="#ffcf4a" ${O}/>
    <path d="M37 62 29 22h11l9 38z" fill="#ffcf4a" ${O}/>
    <path d="M28 12V4M38 12V4" fill="none" ${O}/><circle cx="28" cy="4" r="3" fill="#a8693a" ${O}/><circle cx="38" cy="4" r="3" fill="#a8693a" ${O}/>
    <ellipse cx="30" cy="18" rx="13" ry="8.5" fill="#ffcf4a" ${O}/>
    <ellipse cx="21" cy="21" rx="5.5" ry="4.5" fill="#ffe6a0"/>
    <circle cx="52" cy="60" r="4" fill="#d8893f"/><circle cx="66" cy="66" r="4.5" fill="#d8893f"/><circle cx="72" cy="58" r="3" fill="#d8893f"/>
    <circle cx="38" cy="42" r="3" fill="#d8893f"/><circle cx="41" cy="53" r="2.5" fill="#d8893f"/><circle cx="34" cy="31" r="2.2" fill="#d8893f"/>
    ${eye(31, 16, 2.4)}`),

  P('fish', 'Fish', `
    <path d="M68 50 94 30v40z" fill="#3fb0e0" ${O}/>
    <path d="M30 32c8-12 24-14 32-4z" fill="#2f8fc4" ${O}/>
    <ellipse cx="44" cy="52" rx="32" ry="22" fill="#4fc3ee" ${O}/>
    <path d="M46 34c6 10 6 26 0 36M58 36c4 9 4 22 0 32" fill="none" stroke="#2f8fc4" stroke-width="3" stroke-linecap="round"/>
    ${eye(26, 47, 3.4)}
    <path d="M13 56q4 3 8 0" fill="none" ${O}/>`),

  P('chick', 'Chick', `
    <path d="M44 28c-2-8 4-12 8-8 2-6 10-4 8 4" fill="#ffd84a" ${O}/>
    <path d="M40 90l-4 6M40 90v7M40 90l4 6M60 90l-4 6M60 90v7M60 90l4 6" fill="none" stroke="#f2902e" stroke-width="3" stroke-linecap="round"/>
    <circle cx="50" cy="58" r="30" fill="#ffd84a" ${O}/>
    <path d="M20 58c-8 2-10 10-6 14 6 0 10-6 10-10zM80 58c8 2 10 10 6 14-6 0-10-6-10-10z" fill="#ffc22e" ${O}/>
    ${eye(41, 52)}${eye(59, 52)}${blush(36, 62)}${blush(64, 62)}
    <path d="M44 60h12l-6 8z" fill="#f2902e" ${O}/>`),

  P('turtle', 'Turtle', `
    <circle cx="86" cy="60" r="10" fill="#8fd16a" ${O}/>
    <path d="M10 66l8-4v8z" fill="#8fd16a" ${O}/>
    <ellipse cx="28" cy="76" rx="8" ry="9" fill="#8fd16a" ${O}/><ellipse cx="68" cy="76" rx="8" ry="9" fill="#8fd16a" ${O}/>
    <path d="M14 70C14 32 80 32 80 70z" fill="#3fa65a" ${O}/>
    <path d="M14 70h66" fill="none" ${O}/>
    <path d="M38 46l9-6 9 6v9l-9 6-9-6zM24 58l6-4M66 54l6 4" fill="none" stroke="#2c7d42" stroke-width="2.5" stroke-linejoin="round"/>
    ${eye(89, 57, 2.4)}${smile(88, 64, 2.5)}`),

  P('butterfly', 'Butterfly', `
    <path d="M47 26c-4-10-10-16-16-18M53 26c4-10 10-16 16-18" fill="none" ${O}/>
    <circle cx="31" cy="8" r="3" fill="${INK}"/><circle cx="69" cy="8" r="3" fill="${INK}"/>
    <ellipse cx="28" cy="38" rx="22" ry="19" fill="#ff8fc6" ${O}/><ellipse cx="72" cy="38" rx="22" ry="19" fill="#ff8fc6" ${O}/>
    <ellipse cx="32" cy="70" rx="16" ry="15" fill="#b98af0" ${O}/><ellipse cx="68" cy="70" rx="16" ry="15" fill="#b98af0" ${O}/>
    <circle cx="26" cy="36" r="7" fill="#ffd84a"/><circle cx="74" cy="36" r="7" fill="#ffd84a"/>
    <circle cx="32" cy="70" r="5" fill="#fff" opacity="0.7"/><circle cx="68" cy="70" r="5" fill="#fff" opacity="0.7"/>
    <ellipse cx="50" cy="52" rx="6" ry="28" fill="#6b4a8a" ${O}/>
    ${eye(47.5, 34, 1.6)}${eye(52.5, 34, 1.6)}`),

  P('snail', 'Snail', `
    <path d="M6 88c0-10 4-16 10-20l2-22M18 46c-2-8-4-12-8-14M22 46c2-8 4-12 8-14" fill="none" ${O}/>
    <circle cx="10" cy="31" r="3" fill="${INK}"/><circle cx="30" cy="31" r="3" fill="${INK}"/>
    <path d="M10 88c-2-14 4-28 12-38 4-4 8-2 8 4v26h56c6 0 8 8 2 8z" fill="#a8e07a" ${O}/>
    <circle cx="58" cy="56" r="28" fill="#f6a33c" ${O}/>
    <path d="M58 56c0-6 8-6 8 0 0 10-16 10-16 0 0-14 24-14 24 0 0 18-32 18-32 0" fill="none" stroke="#c0661a" stroke-width="3" stroke-linecap="round"/>
    ${eye(20, 58, 2.2)}${smile(20, 66, 2.5)}`),

  P('whale', 'Whale', `
    <path d="M44 22c-4-6-2-12 2-14M48 22c0-8 4-12 8-12M52 24c4-6 10-6 12-4" fill="none" stroke="#7fd0f5" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M76 56c6-10 12-18 20-20-2 8-6 12-10 14 6 0 10 4 12 10-8 0-14-2-18-6z" fill="#4c86d9" ${O}/>
    <path d="M6 58C6 36 26 26 46 28c18 2 32 14 34 30 0 14-14 24-36 24C20 82 6 74 6 58z" fill="#4c86d9" ${O}/>
    <path d="M10 64c10 12 46 14 66 0-6 12-20 18-34 18-16 0-28-6-32-18z" fill="#bfe4fb"/>
    ${eye(24, 52, 3)}${smile(30, 62, 4)}${blush(18, 60)}`),

  P('tiger', 'Tiger', `
    <circle cx="28" cy="26" r="10" fill="#f58a2a" ${O}/><circle cx="72" cy="26" r="10" fill="#f58a2a" ${O}/>
    <circle cx="28" cy="26" r="5" fill="#fff1df"/><circle cx="72" cy="26" r="5" fill="#fff1df"/>
    <ellipse cx="50" cy="54" rx="34" ry="32" fill="#f58a2a" ${O}/>
    <path d="M50 22v10M42 24l2 8M58 24l-2 8M16 50h10M18 60h8M84 50H74M82 60h-8" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="50" cy="68" rx="18" ry="13" fill="#fff1df"/>
    ${eye(38, 50, 3.2)}${eye(62, 50, 3.2)}
    <path d="M46 60h8l-4 4z" fill="${INK}"/><path d="M42 68q4 4 8 0 4 4 8 0" fill="none" ${O}/>`),
];

export const DINOSAURS: PictureDef[] = [
  P('trex', 'T. rex', `
    <path d="M30 58C20 62 10 70 3 80c12-2 22-6 32-12z" fill="#7cc96b" ${O}/>
    <rect x="34" y="66" width="10" height="20" rx="4" fill="#5fae55" ${O}/>
    <ellipse cx="46" cy="60" rx="22" ry="16" fill="#7cc96b" ${O}/>
    <path d="M56 52 64 34l12 6-10 18z" fill="#7cc96b" ${O}/>
    <path d="M60 30c0-8 8-14 18-14h8c8 0 12 6 12 12v6c0 4-3 6-6 6H74l-6 6h-6z" fill="#7cc96b" ${O}/>
    <path d="M74 40h22" fill="none" ${O}/><path d="M78 40l2 3 2-3 2 3 2-3 2 3 2-3" fill="#fff" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    ${eye(80, 26, 3)}
    <path d="M64 58c6 0 8 4 6 8" fill="none" stroke="#5b3a47" stroke-width="5" stroke-linecap="round"/>
    <path d="M64 58c6 0 8 4 6 8" fill="none" stroke="#7cc96b" stroke-width="2" stroke-linecap="round"/>
    <path d="M48 66c4 4 6 10 6 20" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
    <path d="M48 66c4 4 6 10 6 20" fill="none" stroke="#7cc96b" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="57" cy="89" rx="9" ry="4" fill="#7cc96b" ${O}/>
    <path d="M30 46l4-6 4 5 4-7 4 6 4-6 3 7" fill="#4f9b45" ${O}/>`),

  P('stegosaurus', 'Stegosaurus', `
    <path d="M26 46l6-14 8 12 6-18 8 16 8-16 6 18 8-12 4 14z" fill="#ff8fa8" ${O}/>
    <path d="M78 62c8 0 14-4 18-10l-2 14c-4 2-10 4-16 4z" fill="#ffb03a" ${O}/>
    <path d="M90 52l4-8M94 60l6-4" fill="none" ${O}/>
    <rect x="30" y="64" width="11" height="22" rx="4" fill="#ffb03a" ${O}/><rect x="62" y="64" width="11" height="22" rx="4" fill="#ffb03a" ${O}/>
    <path d="M14 66c4-26 66-34 70-2 0 8-8 10-36 10S12 76 14 66z" fill="#ffb03a" ${O}/>
    <ellipse cx="13" cy="68" rx="10" ry="7" fill="#ffb03a" ${O}/>
    ${eye(10, 66, 2.2)}${smile(12, 71, 2)}`),

  P('brontosaurus', 'Brontosaurus', `
    <path d="M76 66c10 0 18 2 22 8-8 4-18 2-24-2z" fill="#b48ae8" ${O}/>
    <rect x="44" y="70" width="11" height="20" rx="4" fill="#b48ae8" ${O}/><rect x="70" y="70" width="11" height="20" rx="4" fill="#b48ae8" ${O}/>
    <ellipse cx="60" cy="66" rx="26" ry="16" fill="#b48ae8" ${O}/>
    <path d="M40 60C34 44 26 30 20 22l8-6c8 8 18 22 22 38z" fill="#b48ae8" ${O}/>
    <ellipse cx="20" cy="15" rx="11" ry="7.5" fill="#b48ae8" ${O}/>
    <circle cx="56" cy="62" r="4" fill="#d6bdf5"/><circle cx="68" cy="58" r="3" fill="#d6bdf5"/><circle cx="66" cy="70" r="3.5" fill="#d6bdf5"/>
    ${eye(15, 13, 2.2)}${smile(14, 18, 2)}`),

  P('triceratops', 'Triceratops', `
    <path d="M80 60c8 0 14 4 16 10-8 2-14 0-18-4z" fill="#5fb7d8" ${O}/>
    <rect x="44" y="68" width="11" height="20" rx="4" fill="#5fb7d8" ${O}/><rect x="68" y="68" width="11" height="20" rx="4" fill="#5fb7d8" ${O}/>
    <ellipse cx="60" cy="62" rx="26" ry="17" fill="#5fb7d8" ${O}/>
    <path d="M38 34c-14-4-24 8-20 22 2 8 10 12 18 12 6-10 8-22 2-34z" fill="#ffb03a" ${O}/>
    <ellipse cx="24" cy="62" rx="15" ry="11" fill="#5fb7d8" ${O}/>
    <path d="M22 52 6 42l14 4zM30 50 18 36l16 10zM10 62 2 58l8-2z" fill="#fff6e0" ${O}/>
    ${eye(22, 58, 2.4)}${smile(18, 66, 2.5)}`),

  P('pterodactyl', 'Pterodactyl', `
    <path d="M48 44 4 30c4 14 14 24 44 26zM52 44l44-14c-4 14-14 24-44 26z" fill="#f58a6a" ${O}/>
    <ellipse cx="50" cy="56" rx="8" ry="16" fill="#f58a6a" ${O}/>
    <path d="M46 70l-4 10M54 70l4 10" fill="none" ${O}/>
    <path d="M44 34c-4-10 0-18 6-20l8 4c10 2 16 6 20 10-8 0-14 0-18 2l-4 6z" fill="#f58a6a" ${O}/>
    <path d="M48 16l-12-8 14 2z" fill="#ffcf4a" ${O}/>
    ${eye(52, 24, 2.4)}`),

  P('egg', 'Baby dino', `
    <circle cx="50" cy="34" r="16" fill="#8fd16a" ${O}/>
    <path d="M38 22l4-8 4 6 4-8 4 8 4-6 3 8" fill="#ff8fa8" ${O}/>
    ${eye(44, 34)}${eye(56, 34)}${smile(50, 40, 3)}${blush(40, 41)}${blush(60, 41)}
    <path d="M18 56c0 24 14 40 32 40s32-16 32-40l-10 6-8-8-8 8-6-8-6 8-8-8-8 8z" fill="#fff6e0" ${O}/>
    <circle cx="36" cy="76" r="4" fill="#8fd1f0"/><circle cx="62" cy="82" r="5" fill="#8fd1f0"/><circle cx="56" cy="68" r="3" fill="#ffcf4a"/>`),
];

// Original chibi pop-star heroes (not any show's characters): big heads,
// sparkly eyes, and each with her own hair and prop so the shadows differ.
const SKIN = '#fdd9c0';
const face = (x = 50, y = 38) =>
  `${eye(x - 7, y, 3.4)}${eye(x + 7, y, 3.4)}${blush(x - 11, y + 7)}${blush(x + 11, y + 7)}${smile(x, y + 8, 3)}`;

export const POP_STARS: PictureDef[] = [
  P('singer', 'Singer', `
    <path d="M66 22c14 0 22 14 18 34-2 14 2 24 8 30-12 2-20-6-22-18-2-14 2-30-4-46z" fill="#3b4fa8" ${O}/>
    <path d="M40 60h20l8 24H32z" fill="#7b5ce0" ${O}/>
    <rect x="38" y="84" width="7" height="12" rx="3" fill="${SKIN}" ${O}/><rect x="55" y="84" width="7" height="12" rx="3" fill="${SKIN}" ${O}/>
    <path d="M40 64c-8 0-10-8-12-14" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M40 64c-8 0-10-8-12-14" fill="none" stroke="${SKIN}" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 44l4 8" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><circle cx="23" cy="42" r="5" fill="#9aa3b5" ${O}/>
    <circle cx="50" cy="38" r="22" fill="${SKIN}" ${O}/>
    <path d="M28 36c0-16 12-22 24-22s22 8 22 20c-8-2-16-8-20-14-4 8-14 14-26 16z" fill="#3b4fa8" ${O}/>
    <path d="M62 64l2-4 2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3z" fill="#ffd84a"/>
    ${face()}`),

  P('dancer', 'Dancer', `
    <path d="M78 6l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#ffd84a" ${O}/>
    <path d="M76 22 70 52" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="14" r="9" fill="#ff7ab8" ${O}/><circle cx="68" cy="14" r="9" fill="#ff7ab8" ${O}/>
    <path d="M38 60h24l10 22H28z" fill="#ff9fcf" ${O}/>
    <path d="M28 82c6-4 12 4 22 0s16-4 22 0" fill="#fff" ${O}/>
    <rect x="39" y="84" width="7" height="12" rx="3" fill="${SKIN}" ${O}/><rect x="54" y="84" width="7" height="12" rx="3" fill="${SKIN}" ${O}/>
    <path d="M60 64c6-2 10-8 12-16" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M60 64c6-2 10-8 12-16" fill="none" stroke="${SKIN}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="50" cy="38" r="22" fill="${SKIN}" ${O}/>
    <path d="M28 36c0-14 10-22 22-22s22 8 22 22c-6-6-14-10-22-10s-16 4-22 10z" fill="#ff7ab8" ${O}/>
    ${face()}`),

  P('rapper', 'Rapper', `
    <path d="M38 60h24l6 24H32z" fill="#27b8b0" ${O}/>
    <rect x="38" y="84" width="8" height="12" rx="3" fill="#3b4fa8" ${O}/><rect x="54" y="84" width="8" height="12" rx="3" fill="#3b4fa8" ${O}/>
    <path d="M36 66c-6 4-8 8-6 12M64 66c6 4 8 8 6 12" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M36 66c-6 4-8 8-6 12M64 66c6 4 8 8 6 12" fill="none" stroke="${SKIN}" stroke-width="3" stroke-linecap="round"/>
    <path d="M50 92C34 82 32 74 36 70c4-4 10-2 14 4 4-6 10-8 14-4 4 4 2 12-14 22z" fill="#ec4840" ${O}/>
    <circle cx="50" cy="40" r="22" fill="${SKIN}" ${O}/>
    <path d="M28 44c-2-12 6-20 22-20s24 8 22 20l-4-8H32z" fill="#ffcf4a" ${O}/>
    <path d="M26 30c0-12 10-18 24-18s22 6 22 16H26z" fill="#ec4840" ${O}/>
    <path d="M66 28h22c2 4-2 6-6 6H66z" fill="#c8322b" ${O}/>
    ${face(50, 42)}`),

  P('drummer', 'Drummer', `
    <circle cx="50" cy="38" r="22" fill="${SKIN}" ${O}/>
    <path d="M28 40c-2-16 8-24 22-24s24 8 22 24c-2-6-6-10-10-12-2 4-6 6-12 6s-10-2-12-6c-4 2-8 6-10 12z" fill="#8a5a33" ${O}/>
    <path d="M30 38c-6 8-6 18 0 24M70 38c6 8 6 18 0 24" fill="none" stroke="#8a5a33" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="50" cy="78" rx="28" ry="16" fill="#ffd84a" ${O}/>
    <ellipse cx="50" cy="70" rx="28" ry="8" fill="#fff6e0" ${O}/>
    <path d="M26 82l48-6M30 90l40-4" fill="none" stroke="#f2902e" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M34 68 14 52M66 68l20-16" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M34 68 14 52M66 68l20-16" fill="none" stroke="#c98b55" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="13" cy="51" r="4" fill="#ff7ab8" ${O}/><circle cx="87" cy="51" r="4" fill="#ff7ab8" ${O}/>
    ${face()}`),
];

export type Category = 'shapes' | 'animals' | 'dinosaurs' | 'stars';

export const PICTURES: Record<Exclude<Category, 'shapes'>, PictureDef[]> = {
  animals: ANIMALS,
  dinosaurs: DINOSAURS,
  stars: POP_STARS,
};
