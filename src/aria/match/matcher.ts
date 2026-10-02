import type { Sound } from '../audio';
import { Balloons } from '../trace/balloons';
import { vfx } from '../vfx';
import { PICTURES, ANIMALS, DINOSAURS, POP_STARS, type Category, type PictureDef } from './pictures';
import { PIECE_COLORS, shapesFor, type ShapeDef } from './shapes';

// Matching: three colored shapes (or animals, dinosaurs, pop stars) and their
// three outlines or shadows. Drag each one onto its own. Drops are forgiving
// (anywhere near the right one snaps in) and a miss just floats it home again.

const PAIRS = 3;
/** Pause after the last shape before the next round starts by itself. */
const NEXT_ROUND_MS = 1400;
/** A drop this close to the right outline (as a share of the shape size) snaps in. */
const SNAP = 0.8;
/** A finger that moved less than this (px) was a tap, not a drag. */
const TAP_PX = 10;
const ROUND_KEY = 'arias-world:match-round';
const ROUNDS_KEY = 'arias-world:match-rounds';
const CATEGORY_KEY = 'arias-world:match-category';
const CATEGORIES: Category[] = ['shapes', 'animals', 'dinosaurs', 'stars'];
/** Pictures arrive turned a little after this many rounds (shapes: TURN_SHAPES). */
const TURN_PICTURES = 6;
const TURN_SHAPES = 10;
/** Balloons float up after every this many finished rounds (confetti every round). */
const BALLOONS_EVERY = 3;

type Item = ShapeDef | PictureDef;
const isPicture = (i: Item): i is PictureDef => 'art' in i;
const STARS_KEY = 'arias-world:match-stars';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function readNumber(key: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(key)) || 0);
  } catch {
    return 0;
  }
}

function writeNumber(key: string, n: number): void {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    // storage blocked (private mode): progress lasts for this visit only
  }
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Pair {
  shape: Item;
  color: string;
  hole: HTMLElement;
  piece: HTMLElement;
  /** Where the piece rests until it's placed (column index). */
  home: number;
  /** Turn of the piece before it's placed, in degrees. */
  turn: number;
  placed: boolean;
}

interface Drag {
  pair: Pair;
  id: number;
  /** Finger offset from the piece's top-left. */
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export class MatchingApp {
  private readonly board = $<HTMLDivElement>('match-board');
  private pairs: Pair[] = [];
  private category: Category = 'animals';
  /** Rounds finished in each category (more kinds of shapes as they go up). */
  private rounds: Record<Category, number> = { shapes: readNumber(ROUND_KEY), animals: 0, dinosaurs: 0, stars: 0 };
  private stars = readNumber(STARS_KEY);
  private size = 120;
  private slots: { holes: [number, number][]; homes: [number, number][] } = { holes: [], homes: [] };
  private drag: Drag | null = null;
  private nextTimer = 0;
  private built = false;
  private balloons: Balloons | null = null;
  private lastSet = '';
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly sound: Sound) {
    try {
      const saved = JSON.parse(localStorage.getItem(ROUNDS_KEY) ?? '{}') as Partial<Record<Category, number>>;
      for (const c of CATEGORIES) if (Number.isFinite(saved[c])) this.rounds[c] = Math.max(0, saved[c]!);
      const cat = localStorage.getItem(CATEGORY_KEY) as Category | null;
      if (cat && CATEGORIES.includes(cat)) this.category = cat;
    } catch {
      // storage blocked: start fresh
    }
  }

  /** True while a finger is moving a shape. */
  get busy(): boolean {
    return this.drag !== null;
  }

  open(): void {
    if (!this.built) this.build();
    this.newRound();
  }

  close(): void {
    clearTimeout(this.nextTimer);
    this.drag = null;
    this.balloons?.clear();
  }

  private build(): void {
    this.built = true;
    this.balloons = new Balloons(this.board, this.sound);
    $('match-new').addEventListener('click', () => {
      this.sound.playPop();
      this.newRound();
    });
    this.buildCategories();
    new ResizeObserver(() => this.layout()).observe(this.board);
    this.board.addEventListener('contextmenu', (e) => e.preventDefault());
    this.updateStars();
  }

  /** Picture buttons to choose what to match: shapes, animals, dinosaurs or pop stars. */
  private buildCategories(): void {
    const icons: Record<Category, string> = {
      shapes:
        '<path d="M28 8 52 50H4z" fill="#ffc933" stroke="#5b3a47" stroke-width="4" stroke-linejoin="round"/>' +
        '<circle cx="70" cy="66" r="24" fill="#3a80e8" stroke="#5b3a47" stroke-width="4"/>' +
        '<path d="M14 62h30v30H14z" fill="#ec4840" stroke="#5b3a47" stroke-width="4" stroke-linejoin="round"/>',
      animals: ANIMALS[0].art,
      dinosaurs: DINOSAURS[0].art,
      stars: POP_STARS[0].art,
    };
    const names: Record<Category, string> = { shapes: 'Shapes', animals: 'Animals', dinosaurs: 'Dinosaurs', stars: 'Pop stars' };
    const box = $('match-cats');
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat match-cat';
      b.dataset.cat = c;
      b.setAttribute('aria-label', names[c]);
      b.innerHTML = `<svg viewBox="-6 -6 112 112" aria-hidden="true">${icons[c]}</svg>`;
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.setCategory(c);
      });
      box.appendChild(b);
    }
    this.syncCategories();
  }

  private setCategory(c: Category): void {
    this.category = c;
    try {
      localStorage.setItem(CATEGORY_KEY, c);
    } catch {
      // storage blocked
    }
    this.syncCategories();
    this.newRound();
  }

  private syncCategories(): void {
    $('match-cats').querySelectorAll<HTMLElement>('.match-cat').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.cat === this.category)));
  }

  private updateStars(): void {
    $('match-star-count').textContent = String(this.stars);
  }

  // ---------------------------------------------------------------------------
  // Rounds
  // ---------------------------------------------------------------------------

  private newRound(): void {
    clearTimeout(this.nextTimer);
    this.drag = null;
    this.board.querySelectorAll('.match-hole, .match-piece, .match-name').forEach((el) => el.remove());

    // Three different ones, not the same three as last time.
    const round = this.rounds[this.category];
    const pool: Item[] = this.category === 'shapes' ? shapesFor(round) : PICTURES[this.category];
    let shapes: Item[];
    let key: string;
    let tries = 0;
    do {
      shapes = shuffle([...pool]).slice(0, PAIRS);
      key = shapes.map((s) => s.id).sort().join();
    } while (key === this.lastSet && ++tries < 10);
    this.lastSet = key;
    const colors = shuffle([...PIECE_COLORS]);
    const homes = shuffle([0, 1, 2]);
    // Later rounds show them turned a little: still the same shape.
    const turns = round >= (this.category === 'shapes' ? TURN_SHAPES : TURN_PICTURES);

    this.pairs = shapes.map((shape, i) => {
      const hole = this.shapeEl('match-hole', shape);
      const piece = this.shapeEl('match-piece', shape, true);
      piece.style.setProperty('--piece', colors[i]);
      piece.style.animationDelay = `${i * 0.08}s`;
      this.board.append(hole, piece);
      const pair: Pair = {
        shape, color: colors[i], hole, piece, home: homes[i], placed: false,
        turn: turns && !(!isPicture(shape) && shape.round) ? (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 20) : 0,
      };
      this.bindPiece(pair);
      return pair;
    });
    this.layout();
  }

  private finishRound(): void {
    this.rounds[this.category]++;
    this.stars++;
    writeNumber(ROUND_KEY, this.rounds.shapes);
    try {
      localStorage.setItem(ROUNDS_KEY, JSON.stringify(this.rounds));
    } catch {
      // storage blocked
    }
    writeNumber(STARS_KEY, this.stars);
    this.updateStars();
    const r = this.board.getBoundingClientRect();
    vfx.confetti(50);
    vfx.burst(r.left + r.width / 2, r.top + r.height / 3, { count: 20, shape: 'star', speed: 380, size: 11, life: 0.9 });
    if (this.stars % BALLOONS_EVERY === 0) this.balloons?.release(2 + Math.min(3, Math.floor(this.rounds[this.category] / 3)));
    this.nextTimer = window.setTimeout(() => this.newRound(), NEXT_ROUND_MS);
  }

  // ---------------------------------------------------------------------------
  // Layout: outlines in one line, shapes in another beside it (rows across a
  // wide screen, columns down a tall one), whichever gives the bigger shapes
  // ---------------------------------------------------------------------------

  private layout(): void {
    const w = this.board.clientWidth, h = this.board.clientHeight;
    if (!w || !h) return;
    // As big as fits, with room between (small fingers, no precise taps).
    const inRows = Math.min((w / PAIRS) * 0.7, (h / 2) * 0.68);
    const inColumns = Math.min((w / 2) * 0.68, (h / PAIRS) * 0.7);
    const rows = inRows >= inColumns;
    const s = (this.size = Math.max(80, Math.min(rows ? inRows : inColumns, 220)));
    const along = (i: number, len: number) => (len / PAIRS) * (i + 0.5) - s / 2;
    const cell = (i: number, line: number): [number, number] =>
      rows ? [along(i, w), h * line - s / 2] : [w * line - s / 2, along(i, h)];
    this.slots = {
      holes: [0, 1, 2].map((i) => cell(i, 0.27)),
      homes: [0, 1, 2].map((i) => cell(i, 0.73)),
    };
    this.pairs.forEach((p, i) => {
      for (const el of [p.hole, p.piece]) {
        el.style.width = el.style.height = `${this.size}px`;
      }
      const [hx, hy] = this.slots.holes[i];
      this.place(p.hole, hx, hy, 0);
      this.rest(p, false);
    });
    this.board.querySelectorAll<HTMLElement>('.match-name').forEach((n) => {
      const i = Number(n.dataset.index);
      const [hx, hy] = this.slots.holes[i];
      n.style.left = `${hx + this.size / 2}px`;
      n.style.top = `${hy + this.size + 6}px`;
    });
  }

  // Position with `translate` and the turn with `transform`: the lift, wiggle and pop
  // effects (CSS `scale`/`rotate`) then stay centered on the shape.
  private place(el: HTMLElement, x: number, y: number, turn: number): void {
    el.style.translate = `${x}px ${y}px`;
    el.style.transform = turn ? `rotate(${turn}deg)` : '';
  }

  /** Puts a piece where it belongs now: in its outline if placed, else back home. */
  private rest(p: Pair, animate: boolean): void {
    p.piece.classList.toggle('settle', animate);
    if (p.placed) {
      const [x, y] = this.slots.holes[this.pairs.indexOf(p)];
      this.place(p.piece, x, y, 0);
    } else {
      const [x, y] = this.slots.homes[p.home];
      this.place(p.piece, x, y, p.turn);
    }
  }

  /** A shape or picture. `face`: the piece to drag (the outline/shadow otherwise). */
  private shapeEl(cls: string, shape: Item, face = false): HTMLElement {
    const el = document.createElement('div');
    el.className = cls;
    el.dataset.shape = shape.id;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '-6 -6 112 112');
    svg.setAttribute('aria-hidden', 'true');
    if (isPicture(shape)) {
      // The same drawing for both; the hole shows it as a soft shadow (see .silhouette).
      svg.innerHTML = shape.art;
      el.classList.add(face ? 'picture' : 'silhouette');
      el.appendChild(svg);
      if (face) {
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', shape.name);
      }
      return el;
    }
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', shape.d);
    path.setAttribute('class', 'body');
    svg.appendChild(path);
    if (face) svg.appendChild(this.face(shape));
    el.appendChild(svg);
    if (face) {
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', shape.name);
    }
    return el;
  }

  /** Two eyes and a smile, so the shapes look like little friends. */
  private face({ face: { x, y, s } }: ShapeDef): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'face');
    g.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
    g.innerHTML =
      '<circle cx="-10" cy="-5" r="4.5" /><circle cx="10" cy="-5" r="4.5" />' +
      '<path d="M-9 6q9 8 18 0" fill="none" stroke-width="4" stroke-linecap="round" />';
    return g;
  }

  // ---------------------------------------------------------------------------
  // Dragging
  // ---------------------------------------------------------------------------

  private bindPiece(p: Pair): void {
    const el = p.piece;
    el.addEventListener('pointerdown', (e) => {
      // One shape at a time; a second finger is ignored.
      if (p.placed || this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const r = this.board.getBoundingClientRect();
      const [x, y] = this.slots.homes[p.home];
      this.drag = {
        pair: p, id: e.pointerId,
        dx: e.clientX - r.left - x, dy: e.clientY - r.top - y,
        startX: e.clientX, startY: e.clientY, moved: false,
      };
      el.classList.remove('settle');
      el.classList.add('lifted');
      this.sound.playPop(1.3);
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      e.preventDefault();
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > TAP_PX) d.moved = true;
      const [x, y] = this.clampToBoard(e);
      // The shape straightens as it travels, so it fits its outline when it gets there.
      const turn = d.moved ? p.turn * 0.4 : p.turn;
      this.place(el, x, y, turn);
      const near = this.distanceTo(p, x, y) < this.size * SNAP;
      p.hole.classList.toggle('near', near);
    });
    const up = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      el.classList.remove('lifted');
      p.hole.classList.remove('near');
      if (!d.moved) {
        this.hint(p);
        this.rest(p, true);
        return;
      }
      const [x, y] = this.clampToBoard(e);
      if (this.distanceTo(p, x, y) < this.size * SNAP) this.match(p);
      else this.miss(p, x, y);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  /** Piece top-left for a finger position, kept on the board. */
  private clampToBoard(e: PointerEvent): [number, number] {
    const d = this.drag ?? { dx: this.size / 2, dy: this.size / 2 };
    const r = this.board.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left - d.dx, 0), r.width - this.size);
    const y = Math.min(Math.max(e.clientY - r.top - d.dy, 0), r.height - this.size);
    return [x, y];
  }

  private distanceTo(p: Pair, x: number, y: number): number {
    const [hx, hy] = this.slots.holes[this.pairs.indexOf(p)];
    return Math.hypot(x - hx, y - hy);
  }

  private match(p: Pair): void {
    p.placed = true;
    this.rest(p, true);
    p.piece.classList.add('placed');
    p.hole.classList.add('filled');
    this.sound.playPop();
    const r = p.hole.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    vfx.ring(cx, cy, p.color, this.size * 0.7);
    vfx.burst(cx, cy, { count: 14, colors: [p.color, '#ffd54f', '#ffffff'], shape: 'star', speed: 260, size: 9, life: 0.7 });
    // The shape's name under it, for grown-ups reading along.
    const i = this.pairs.indexOf(p);
    const name = document.createElement('span');
    name.className = 'match-name';
    name.dataset.index = String(i);
    name.textContent = p.shape.name;
    const [hx, hy] = this.slots.holes[i];
    name.style.left = `${hx + this.size / 2}px`;
    name.style.top = `${hy + this.size + 6}px`;
    this.board.appendChild(name);
    if (this.pairs.every((q) => q.placed)) this.finishRound();
  }

  /** Not the right outline: float home and show where it goes. No "wrong" sound. */
  private miss(p: Pair, x: number, y: number): void {
    const overOther = this.pairs.some((q) => q !== p && !q.placed && Math.hypot(x - this.slots.holes[this.pairs.indexOf(q)][0], y - this.slots.holes[this.pairs.indexOf(q)][1]) < this.size * SNAP);
    this.rest(p, true);
    if (overOther) this.hint(p);
  }

  /** A little wiggle on the piece and a glow on its outline: "it goes here". */
  private hint(p: Pair): void {
    for (const el of [p.hole, p.piece]) {
      el.classList.remove('hint');
      void el.offsetWidth; // restart the animation
      el.classList.add('hint');
    }
    if (!this.reduced) {
      const r = p.hole.getBoundingClientRect();
      vfx.sparkle(r.left + r.width / 2, r.top + r.height / 2, p.color);
    }
  }
}
