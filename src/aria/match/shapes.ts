// Shapes for the matching game, as SVG paths in a 100 × 100 box. Grouped from
// the first shapes children learn to the harder ones; later rounds mix in more.

export interface ShapeDef {
  id: string;
  /** Shown under a placed shape, for grown-ups reading along. */
  name: string;
  d: string;
  /** Where the little face sits, and how big (1 = normal). */
  face: { x: number; y: number; s: number };
  /** Looks the same when turned, so it's never shown turned. */
  round?: boolean;
}

function polygon(sides: number, r = 45, rotate = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotate + (360 * i) / sides) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

function starPath(points = 5, outer = 48, inner = 21): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = ((-90 + (180 * i) / points) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(53 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

const S = (id: string, name: string, d: string, face: ShapeDef['face'], round = false): ShapeDef => ({ id, name, d, face, round });

/** First shapes: easy to tell apart. */
const EASY: ShapeDef[] = [
  S('circle', 'Circle', 'M50 6a44 44 0 1 1 0 88a44 44 0 1 1 0-88Z', { x: 50, y: 50, s: 1 }, true),
  S('square', 'Square', 'M10 10h80v80H10Z', { x: 50, y: 50, s: 1 }),
  S('triangle', 'Triangle', 'M50 6 95 90H5Z', { x: 50, y: 64, s: 0.85 }),
  S('star', 'Star', starPath(), { x: 50, y: 56, s: 0.6 }),
  S('heart', 'Heart', 'M50 90C22 70 5 52 5 32 5 17 16 7 30 7c9 0 16 5 20 13 4-8 11-13 20-13 14 0 25 10 25 25 0 20-17 38-45 58Z', { x: 50, y: 42, s: 0.9 }),
];

/** Next: shapes that look a bit like the first ones. */
const MEDIUM: ShapeDef[] = [
  S('rectangle', 'Rectangle', 'M3 24h94v52H3Z', { x: 50, y: 50, s: 0.9 }),
  S('oval', 'Oval', 'M50 20a47 30 0 1 1 0 60a47 30 0 1 1 0-60Z', { x: 50, y: 50, s: 0.9 }),
  S('diamond', 'Diamond', 'M50 3 88 50 50 97 12 50Z', { x: 50, y: 50, s: 0.8 }),
  S('moon', 'Crescent', 'M60 4A46 46 0 1 0 60 96A38 38 0 0 1 60 4Z', { x: 30, y: 52, s: 0.6 }),
  S('semicircle', 'Semicircle', 'M4 72a46 46 0 0 1 92 0Z', { x: 50, y: 55, s: 0.85 }),
];

/** Then: shapes with more sides. */
const HARD: ShapeDef[] = [
  S('pentagon', 'Pentagon', polygon(5, 47), { x: 50, y: 54, s: 0.9 }),
  S('hexagon', 'Hexagon', polygon(6, 47, 0), { x: 50, y: 50, s: 0.95 }),
  S('octagon', 'Octagon', polygon(8, 47, 22.5), { x: 50, y: 50, s: 1 }),
  S('trapezoid', 'Trapezoid', 'M28 18h44l25 66H3Z', { x: 50, y: 54, s: 0.9 }),
  S('cross', 'Cross', 'M35 5h30v30h30v30H65v30H35V65H5V35h30Z', { x: 50, y: 50, s: 0.7 }),
];

/** Shapes to choose from in a round: more kinds as the child plays more rounds. */
export function shapesFor(round: number): ShapeDef[] {
  if (round < 3) return EASY;
  if (round < 7) return [...EASY, ...MEDIUM];
  return [...EASY, ...MEDIUM, ...HARD];
}

/** Bright piece colors (the holes are all the same, so color is never the clue). */
export const PIECE_COLORS = ['#ec4840', '#fa8a28', '#ffc933', '#3ab460', '#3a80e8', '#9652d0', '#ff6fae', '#27b8b0'];
