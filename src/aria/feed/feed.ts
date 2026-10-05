import type { Sound } from '../audio';
import { Balloons } from '../trace/balloons';
import { vfx } from '../vfx';
import { FOOD_KINDS, FOODS, HEAD_TOP, MOUTH, PUPPY_H, PUPPY_SVG, PUPPY_W, type FoodKind } from './art';

// Feed the Puppy: a counting game. The bubble over the puppy's head shows how
// many treats she wants (a number and the same number of little treats). Drag a
// treat to her, or just tap it, and she gobbles it up; each one fills a treat in
// the bubble and floats its count up. When she has had enough she jumps for joy.
// There are always a few treats too many, so the child counts and stops, but
// nothing can go wrong: once she's full the extras simply hop away.

/** Most treats she can ask for in a round: small numbers first, then up to ten. */
const MAX_BY_ROUND = [2, 3, 3, 4, 5, 5, 6, 7, 8, 10];
const NEXT_ROUND_MS = 2400;
const BALLOONS_EVERY = 3;
/** A press that moves less than this is a tap (and feeds the treat). */
const TAP_PX = 14;
const SAVE_KEY = 'arias-world:feed';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Treat {
  el: HTMLDivElement;
  /** Top-left on the board, in pixels. */
  x: number;
  y: number;
  /** Which cell of the food grid is home, and where in it (0..1). */
  cell: number;
  jx: number;
  jy: number;
  eaten: boolean;
}

interface Drag {
  treat: Treat;
  id: number;
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface Saved {
  food?: FoodKind;
  round?: number;
  stars?: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const svgOf = (art: string) => `<svg viewBox="0 0 100 100" aria-hidden="true">${art}</svg>`;

export class FeedApp {
  private readonly board = $<HTMLDivElement>('feed-board');
  private readonly puppy = document.createElement('button');
  private readonly bubble = document.createElement('div');
  private readonly mat = document.createElement('div');
  private food: FoodKind = 'bone';
  private round = 0;
  private stars = 0;
  private target = 0;
  private fed = 0;
  private done = false;
  private treats: Treat[] = [];
  private drag: Drag | null = null;
  /** Puppy size on screen and its top-left; food grid. */
  private size = 0;
  private px = 0;
  private py = 0;
  private foodBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  private cells: [number, number][] = [];
  private treatSize = 0;
  private nextTimer = 0;
  private built = false;
  private balloons: Balloons | null = null;
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly sound: Sound) {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Saved | null;
      if (s) {
        if (s.food && FOOD_KINDS.includes(s.food)) this.food = s.food;
        this.round = Math.max(0, Number(s.round) || 0);
        this.stars = Math.max(0, Number(s.stars) || 0);
      }
    } catch {
      // storage blocked or damaged: start fresh
    }
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

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private build(): void {
    this.built = true;
    this.balloons = new Balloons(this.board, this.sound);

    this.mat.className = 'feed-mat';
    this.puppy.type = 'button';
    this.puppy.className = 'feed-puppy';
    this.puppy.setAttribute('aria-label', 'Puppy');
    this.puppy.innerHTML = PUPPY_SVG;
    this.puppy.addEventListener('click', () => this.pet());
    this.bubble.className = 'feed-bubble';
    this.bubble.setAttribute('role', 'status');
    this.board.append(this.mat, this.puppy, this.bubble);

    $('feed-new').addEventListener('click', () => {
      this.sound.playPop();
      this.newRound();
    });
    const box = $('feed-foods');
    for (const f of FOOD_KINDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat match-cat';
      b.dataset.food = f;
      b.setAttribute('aria-label', FOODS[f].name);
      b.innerHTML = svgOf(FOODS[f].art);
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.food = f;
        this.save();
        this.syncFoods();
        this.newRound();
      });
      box.appendChild(b);
    }
    this.syncFoods();
    this.updateStars();
    new ResizeObserver(() => this.layout()).observe(this.board);
    this.board.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private syncFoods(): void {
    $('feed-foods').querySelectorAll<HTMLElement>('.match-cat').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.food === this.food)));
  }

  private updateStars(): void {
    $('feed-star-count').textContent = String(this.stars);
  }

  private save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ food: this.food, round: this.round, stars: this.stars } satisfies Saved));
    } catch {
      // storage blocked: progress lasts for this visit only
    }
  }

  // ---------------------------------------------------------------------------
  // Rounds
  // ---------------------------------------------------------------------------

  private newRound(): void {
    clearTimeout(this.nextTimer);
    this.drag = null;
    this.done = false;
    this.fed = 0;
    for (const t of this.treats) t.el.remove();
    this.puppy.classList.remove('happy', 'near', 'chomp');

    const max = MAX_BY_ROUND[Math.min(this.round, MAX_BY_ROUND.length - 1)];
    // Never the same number twice in a row (unless there's no other choice).
    let target = 1 + Math.floor(Math.random() * max);
    if (target === this.target && max > 1) target = (target % max) + 1;
    this.target = target;
    const extra = target <= 2 ? 1 : target <= 5 ? 2 : 3;
    const count = target + extra;

    this.buildBubble();
    const cells = shuffleIndexes(this.gridFor(count).cells.length).slice(0, count);
    this.treats = cells.map((cell, i) => this.makeTreat(cell, i));
    for (const t of this.treats) this.board.appendChild(t.el);
    this.layout();
  }

  private buildBubble(): void {
    const art = svgOf(FOODS[this.food].art);
    this.bubble.classList.remove('done');
    this.bubble.style.setProperty('--pcols', String(Math.min(this.target, 5)));
    this.bubble.innerHTML =
      `<span class="feed-number">${this.target}</span>` +
      `<span class="feed-pips">${`<span class="feed-pip">${art}</span>`.repeat(this.target)}</span>`;
    this.bubble.setAttribute('aria-label', `Puppy wants ${this.target}`);
  }

  private makeTreat(cell: number, i: number): Treat {
    const el = document.createElement('div');
    el.className = 'feed-treat';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', FOODS[this.food].name);
    el.tabIndex = 0;
    el.innerHTML = svgOf(FOODS[this.food].art);
    el.style.setProperty('--turn', `${Math.round((Math.random() - 0.5) * 40)}deg`);
    if (!this.reduced) el.style.setProperty('--deal', `${150 + i * 60}ms`);
    const t: Treat = { el, x: 0, y: 0, cell, jx: Math.random(), jy: Math.random(), eaten: false };
    this.bind(t);
    return t;
  }

  // ---------------------------------------------------------------------------
  // Layout: puppy on one side (or on top), the picnic blanket with treats on the other
  // ---------------------------------------------------------------------------

  private layout(): void {
    const w = this.board.clientWidth, h = this.board.clientHeight;
    if (!w || !h) return;
    const wide = w > h * 1.15;
    const pup: Box = wide ? { x: 0, y: 0, w: w * 0.5, h } : { x: 0, y: 0, w, h: h * 0.58 };
    const pad = Math.max(10, Math.min(w, h) * 0.03);
    this.foodBox = wide
      ? { x: w * 0.5, y: pad, w: w * 0.5 - pad, h: h - pad * 2 }
      : { x: pad, y: h * 0.58, w: w - pad * 2, h: h * 0.42 - pad };

    // The bubble needs about half a puppy of room above her head.
    const size = Math.min(pup.w * 0.8, (pup.h * 0.94) / 1.62, 420);
    const u = size / PUPPY_W;
    const tall = size * (PUPPY_H / PUPPY_W) + size * 0.54;
    this.size = size;
    this.px = pup.x + (pup.w - size) / 2;
    this.py = pup.y + (pup.h - tall) / 2 + size * 0.54;
    this.board.style.setProperty('--u', `${u}px`);
    this.puppy.style.width = `${size}px`;
    this.puppy.style.height = `${size * (PUPPY_H / PUPPY_W)}px`;
    this.puppy.style.translate = `${this.px}px ${this.py}px`;
    this.bubble.style.left = `${this.px + HEAD_TOP.x * u}px`;
    this.bubble.style.top = `${this.py + HEAD_TOP.y * u - 10 * u}px`;

    const b = this.foodBox;
    Object.assign(this.mat.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });

    const grid = this.gridFor(this.treats.length);
    this.cells = grid.cells;
    this.treatSize = grid.size;
    this.board.style.setProperty('--treat', `${grid.size}px`);
    for (const t of this.treats) {
      if (t.eaten || this.drag?.treat === t) continue;
      [t.x, t.y] = this.home(t);
      this.place(t);
    }
  }

  /** The grid on the blanket that makes `n` treats biggest. */
  private gridFor(n: number): { cells: [number, number][]; size: number; cell: number } {
    const b = this.foodBox;
    let best = { cols: 1, rows: n, cell: 0 };
    for (let cols = 1; cols <= Math.max(1, n); cols++) {
      const rows = Math.ceil(n / cols);
      const cell = Math.min(b.w / cols, b.h / rows);
      if (cell > best.cell) best = { cols, rows, cell };
    }
    const { cols, rows, cell } = best;
    const ox = b.x + (b.w - cols * cell) / 2, oy = b.y + (b.h - rows * cell) / 2;
    const cells: [number, number][] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([ox + (c + 0.5) * cell, oy + (r + 0.5) * cell]);
    return { cells, size: Math.max(48, Math.min(cell * 0.78, 150)), cell };
  }

  private home(t: Treat): [number, number] {
    const [cx, cy] = this.cells[Math.min(t.cell, this.cells.length - 1)] ?? [0, 0];
    const cell = this.treatSize / 0.78;
    // A little scattered, like treats tipped out of a bag.
    const wiggle = Math.max(0, cell - this.treatSize) * 0.6;
    return [cx - this.treatSize / 2 + (t.jx - 0.5) * wiggle, cy - this.treatSize / 2 + (t.jy - 0.5) * wiggle];
  }

  private place(t: Treat): void {
    t.el.style.translate = `${t.x}px ${t.y}px`;
  }

  // ---------------------------------------------------------------------------
  // Dragging and tapping treats
  // ---------------------------------------------------------------------------

  private bind(t: Treat): void {
    const el = t.el;
    el.addEventListener('pointerdown', (e) => {
      // One treat at a time; a second finger is ignored.
      if (t.eaten || this.done || this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const r = this.board.getBoundingClientRect();
      this.drag = {
        treat: t, id: e.pointerId,
        dx: e.clientX - r.left - t.x, dy: e.clientY - r.top - t.y,
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
      if (!d.moved) return;
      const r = this.board.getBoundingClientRect();
      const s = this.treatSize;
      t.x = Math.min(Math.max(e.clientX - r.left - d.dx, 0), r.width - s);
      t.y = Math.min(Math.max(e.clientY - r.top - d.dy, 0), r.height - s);
      this.place(t);
      // She opens wide when a treat comes close.
      this.puppy.classList.toggle('near', this.nearPuppy(t));
    });
    const up = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      el.classList.remove('lifted');
      this.puppy.classList.remove('near');
      // A tap feeds her too: the treat hops over by itself.
      if (!d.moved || this.nearPuppy(t)) this.feed(t);
      else this.rest(t);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !t.eaten && !this.done) {
        e.preventDefault();
        this.feed(t);
      }
    });
  }

  /** Anywhere over the puppy (and a bit around her) counts. */
  private nearPuppy(t: Treat): boolean {
    const cx = t.x + this.treatSize / 2, cy = t.y + this.treatSize / 2;
    const m = this.size * 0.12;
    const h = this.size * (PUPPY_H / PUPPY_W);
    return cx > this.px - m && cx < this.px + this.size + m && cy > this.py - m && cy < this.py + h + m;
  }

  /** Floats a dropped treat back to its spot on the blanket. */
  private rest(t: Treat): void {
    [t.x, t.y] = this.home(t);
    t.el.classList.add('settle');
    this.place(t);
  }

  // ---------------------------------------------------------------------------
  // Feeding
  // ---------------------------------------------------------------------------

  private feed(t: Treat): void {
    if (t.eaten || this.done) {
      this.rest(t);
      return;
    }
    t.eaten = true;
    this.fed++;
    const count = this.fed;
    if (count >= this.target) this.done = true;
    const u = this.size / PUPPY_W;
    const mx = this.px + MOUTH.x * u, my = this.py + MOUTH.y * u;
    this.puppy.classList.add('near');
    t.el.classList.remove('settle', 'lifted');
    t.el.classList.add('fly');
    t.x = mx - this.treatSize / 2;
    t.y = my - this.treatSize / 2;
    this.place(t);
    this.sound.playPop(1.1);
    const gulp = () => this.gulp(t, count, mx, my);
    if (this.reduced) gulp();
    else window.setTimeout(gulp, 320);
  }

  /** The treat reaches her mouth: chomp, crumbs, and one more treat counted. */
  private gulp(t: Treat, count: number, mx: number, my: number): void {
    t.el.remove();
    if (!this.treats.includes(t)) return; // a new round started meanwhile
    this.puppy.classList.remove('near');
    restart(this.puppy, 'chomp');
    // Higher and higher as she counts up.
    this.sound.playPop(0.8 + count * 0.07);
    const r = this.board.getBoundingClientRect();
    const x = r.left + mx, y = r.top + my;
    vfx.burst(x, y, { count: 10, colors: crumbs(this.food), speed: 220, size: 6, gravity: 500, life: 0.6 });
    vfx.burst(x, y - this.size * 0.2, { count: 3, colors: ['#ff6fae', '#ff8fc8'], shape: 'heart', speed: 90, size: 10, gravity: -160, life: 1 });

    const pip = this.bubble.querySelectorAll<HTMLElement>('.feed-pip')[count - 1];
    if (pip) {
      pip.classList.add('full');
      const pr = pip.getBoundingClientRect();
      vfx.burst(pr.left + pr.width / 2, pr.top + pr.height / 2, { count: 6, colors: ['#ffd54f', '#ffffff'], shape: 'star', speed: 120, size: 6, life: 0.5 });
    }
    restart(this.bubble, 'bump', 400);
    // Beside her head, so it doesn't cover the bubble.
    this.floatCount(count, this.px + this.size * 0.9, this.py + this.size * 0.42);
    if (count >= this.target) window.setTimeout(() => this.finish(), this.reduced ? 0 : 450);
  }

  /** "1", "2", "3"… rises from her mouth as each treat goes in. */
  private floatCount(n: number, x: number, y: number): void {
    const el = document.createElement('span');
    el.className = 'feed-count';
    el.textContent = String(n);
    el.setAttribute('aria-hidden', 'true');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.board.appendChild(el);
    const drop = () => el.remove();
    el.addEventListener('animationend', drop);
    window.setTimeout(drop, 1400);
  }

  private finish(): void {
    if (!this.done) return;
    this.round++;
    this.stars++;
    this.save();
    this.updateStars();
    this.puppy.classList.add('happy');
    this.bubble.classList.add('done');
    // The treats she didn't need hop away.
    for (const t of this.treats) if (!t.eaten) t.el.classList.add('away');
    const r = this.board.getBoundingClientRect();
    const u = this.size / PUPPY_W;
    const cx = r.left + this.px + this.size / 2, cy = r.top + this.py + 100 * u;
    vfx.confetti(60);
    vfx.burst(cx, cy, { count: 12, colors: ['#ff6fae', '#ff8fc8', '#ec4840'], shape: 'heart', speed: 300, size: 12, gravity: -80, life: 1.1 });
    vfx.burst(cx, cy, { count: 18, shape: 'star', speed: 380, size: 10, life: 0.9 });
    this.sound.playPop(1.5);
    if (this.stars % BALLOONS_EVERY === 0) this.balloons?.release(3);
    this.nextTimer = window.setTimeout(() => this.newRound(), NEXT_ROUND_MS);
  }

  /** Tapping the puppy: a happy wiggle and some love. */
  private pet(): void {
    if (this.drag) return;
    restart(this.puppy, 'wiggle');
    this.sound.playPop(0.75);
    const r = this.puppy.getBoundingClientRect();
    vfx.burst(r.left + r.width / 2, r.top + r.height * 0.3, {
      count: 5, colors: ['#ff6fae', '#ff8fc8'], shape: 'heart', speed: 120, size: 11, gravity: -140, life: 1,
    });
  }
}

const timers = new Map<string, number>();

/** Re-runs a CSS animation class even if it's already on, and takes it off after `ms`. */
function restart(el: HTMLElement, cls: string, ms = 700): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  clearTimeout(timers.get(cls));
  timers.set(cls, window.setTimeout(() => el.classList.remove(cls), ms));
}

function crumbs(food: FoodKind): string[] {
  switch (food) {
    case 'bone': return ['#fff6e4', '#f0dcc0', '#e3c9a5'];
    case 'cookie': return ['#e3a55e', '#6b3f2a', '#eab673'];
    case 'apple': return ['#ec4840', '#fff3d6', '#5cc062'];
    case 'carrot': return ['#fa8a28', '#ffb35c', '#5cc062'];
  }
}

function shuffleIndexes(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
