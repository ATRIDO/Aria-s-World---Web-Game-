import type { Sound } from '../audio';
import { cropAll, headSvg, lookMarkup } from '../dress/art';
import { characters } from '../dress/friends';
import { ANIMALS, DINOSAURS, POP_STARS, type PictureDef } from '../match/pictures';
import { PIECE_COLORS, shapesFor } from '../match/shapes';
import { Balloons } from '../trace/balloons';
import { vfx } from '../vfx';

// Memory: cards lie face down; turn two over and keep them if they match.
// Rounds grow from 2 pairs to 8 as the child finishes more of them. No
// reading, no clock and no way to lose: a miss just turns back over.

type Category = 'animals' | 'dinosaurs' | 'stars' | 'shapes' | 'friends';
const CATEGORIES: Category[] = ['animals', 'dinosaurs', 'stars', 'shapes', 'friends'];
const NAMES: Record<Category, string> = {
  animals: 'Animals', dinosaurs: 'Dinosaurs', stars: 'Pop stars', shapes: 'Shapes', friends: 'Your dress-up friends',
};
/** Pairs per round: the first rounds are tiny, then it grows. */
const PAIRS_BY_ROUND = [2, 3, 3, 4, 4, 6, 6, 8];
/** How long a pair that doesn't match stays face up. */
const MISS_MS = 1000;
const NEXT_ROUND_MS = 1700;
const BALLOONS_EVERY = 3;
const SAVE_KEY = 'arias-world:memory';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Face {
  key: string;
  label: string;
  /** Builds the picture for one card (each card needs its own element). */
  make: () => Element;
}

interface Card {
  face: Face;
  el: HTMLButtonElement;
  up: boolean;
  matched: boolean;
}

interface Saved {
  category?: Category;
  rounds?: Partial<Record<Category, number>>;
  stars?: number;
}

const svgOf = (art: string, viewBox = '-6 -6 112 112') => {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="${viewBox}" aria-hidden="true">${art}</svg>`;
  return t.content.firstElementChild!;
};

export class MemoryApp {
  private readonly board = $<HTMLDivElement>('memory-board');
  private category: Category = 'animals';
  private rounds: Record<Category, number> = { animals: 0, dinosaurs: 0, stars: 0, shapes: 0, friends: 0 };
  private stars = 0;
  private cards: Card[] = [];
  /** Cards turned up this turn (0, 1 or 2) that aren't matched yet. */
  private turned: Card[] = [];
  private missTimer = 0;
  private nextTimer = 0;
  private built = false;
  private balloons: Balloons | null = null;
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly sound: Sound) {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Saved | null;
      if (s) {
        if (s.category && CATEGORIES.includes(s.category)) this.category = s.category;
        for (const c of CATEGORIES) if (Number.isFinite(s.rounds?.[c])) this.rounds[c] = Math.max(0, s.rounds![c]!);
        this.stars = Math.max(0, Number(s.stars) || 0);
      }
    } catch {
      // storage blocked or damaged: start fresh
    }
  }

  /** True while two cards are showing and about to turn back. */
  get busy(): boolean {
    return this.turned.length === 2;
  }

  open(): void {
    if (!this.built) this.build();
    this.newRound();
  }

  close(): void {
    clearTimeout(this.missTimer);
    clearTimeout(this.nextTimer);
    this.turned = [];
    this.balloons?.clear();
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private build(): void {
    this.built = true;
    this.balloons = new Balloons(this.board, this.sound);
    $('memory-new').addEventListener('click', () => {
      this.sound.playPop();
      this.newRound();
    });
    const icons: Record<Category, () => Element> = {
      animals: () => svgOf(ANIMALS[0].art),
      dinosaurs: () => svgOf(DINOSAURS[0].art),
      stars: () => svgOf(POP_STARS[0].art),
      shapes: () => svgOf('<path d="M28 8 52 50H4z" fill="#ffc933" stroke="#5b3a47" stroke-width="4" stroke-linejoin="round"/>' +
        '<circle cx="70" cy="66" r="24" fill="#3a80e8" stroke="#5b3a47" stroke-width="4"/>' +
        '<path d="M14 62h30v30H14z" fill="#ec4840" stroke="#5b3a47" stroke-width="4" stroke-linejoin="round"/>'),
      friends: () => {
        const c = characters()[0];
        return headSvg(c.doll, c.look);
      },
    };
    const box = $('memory-cats');
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat match-cat';
      b.dataset.cat = c;
      b.setAttribute('aria-label', NAMES[c]);
      b.appendChild(icons[c]());
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.category = c;
        this.save();
        this.syncCategories();
        this.newRound();
      });
      box.appendChild(b);
    }
    cropAll(box);
    this.syncCategories();
    this.updateStars();
    new ResizeObserver(() => this.layout()).observe(this.board);
    this.board.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private syncCategories(): void {
    $('memory-cats').querySelectorAll<HTMLElement>('.match-cat').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.cat === this.category)));
  }

  private updateStars(): void {
    $('memory-star-count').textContent = String(this.stars);
  }

  private save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ category: this.category, rounds: this.rounds, stars: this.stars } satisfies Saved));
    } catch {
      // storage blocked: progress lasts for this visit only
    }
  }

  // ---------------------------------------------------------------------------
  // Rounds
  // ---------------------------------------------------------------------------

  /** Every face the current category can show. */
  private faces(): Face[] {
    const pic = (p: PictureDef): Face => ({ key: p.id, label: p.name, make: () => svgOf(p.art) });
    switch (this.category) {
      case 'animals': return ANIMALS.map(pic);
      case 'dinosaurs': return DINOSAURS.map(pic);
      case 'stars': return POP_STARS.map(pic);
      case 'shapes': {
        const colors = shuffle([...PIECE_COLORS]);
        return shapesFor(99).map((s, i) => ({
          key: s.id,
          label: s.name,
          make: () => svgOf(`<path d="${s.d}" fill="${colors[i % colors.length]}" stroke="#5b3a47" stroke-width="4" stroke-linejoin="round"/>`),
        }));
      }
      case 'friends':
        // Saved friends first, then the starter dolls to fill up the round.
        return characters().map((c) => ({
          key: c.key,
          label: c.saved ? 'Your friend' : c.doll.name,
          make: () => svgOf(lookMarkup(c.doll, c.look, ['scene', 'back']), '0 0 200 320'),
        }));
    }
  }

  private newRound(): void {
    clearTimeout(this.missTimer);
    clearTimeout(this.nextTimer);
    this.turned = [];
    this.board.querySelectorAll('.memory-card').forEach((el) => el.remove());
    const all = this.faces();
    const round = this.rounds[this.category];
    const pairs = Math.min(PAIRS_BY_ROUND[Math.min(round, PAIRS_BY_ROUND.length - 1)], all.length);
    // Friends you saved always come along; the rest are a random pick.
    const pick = this.category === 'friends'
      ? [...all.slice(0, pairs).filter((f) => f.key.startsWith('friend')), ...shuffle(all.filter((f) => !f.key.startsWith('friend')))].slice(0, pairs)
      : shuffle([...all]).slice(0, pairs);
    this.cards = shuffle([...pick, ...pick]).map((face, i) => this.makeCard(face, i));
    for (const c of this.cards) this.board.appendChild(c.el);
    this.layout();
    cropAll(this.board);
    // Cards land one after another, like being dealt.
    if (!this.reduced) this.cards.forEach((c, i) => c.el.style.setProperty('--deal', `${i * 45}ms`));
  }

  private makeCard(face: Face, i: number): Card {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'memory-card';
    el.setAttribute('aria-label', `Card ${i + 1}, face down`);
    const inner = document.createElement('span');
    inner.className = 'memory-inner';
    const back = document.createElement('span');
    back.className = 'memory-back';
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7Z" /></svg>';
    const front = document.createElement('span');
    front.className = 'memory-front';
    const art = face.make();
    if (this.category === 'friends') art.classList.add('crop');
    front.appendChild(art);
    inner.append(back, front);
    el.appendChild(inner);
    const card: Card = { face, el, up: false, matched: false };
    el.addEventListener('click', () => this.turn(card));
    return card;
  }

  /** Lays the cards out in the grid that makes them biggest on this screen. */
  private layout(): void {
    const n = this.cards.length;
    if (!n) return;
    const r = this.board.getBoundingClientRect();
    const gap = Math.max(8, Math.min(r.width, r.height) * 0.02);
    const pad = gap * 1.5;
    const w = r.width - pad * 2, h = r.height - pad * 2;
    // Cards are a little taller than wide.
    const ratio = 1.2;
    let best = { cols: n, size: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const size = Math.min((w - gap * (cols - 1)) / cols, ((h - gap * (rows - 1)) / rows) / ratio);
      if (size > best.size) best = { cols, size };
    }
    const size = Math.min(best.size, 220);
    this.board.style.setProperty('--cols', String(best.cols));
    this.board.style.setProperty('--card', `${Math.floor(size)}px`);
    this.board.style.setProperty('--gap', `${Math.floor(gap)}px`);
  }

  // ---------------------------------------------------------------------------
  // Turning cards
  // ---------------------------------------------------------------------------

  private turn(card: Card): void {
    if (card.up || card.matched) return;
    // Two wrong ones still showing: a new tap turns them back straight away.
    if (this.turned.length === 2) this.hideMiss();
    this.flip(card, true);
    this.sound.playPop(1 + this.turned.length * 0.15);
    this.turned.push(card);
    if (this.turned.length < 2) return;

    const [a, b] = this.turned;
    if (a.face.key === b.face.key) {
      this.turned = [];
      for (const c of [a, b]) {
        c.matched = true;
        c.el.classList.add('matched');
        c.el.setAttribute('aria-label', `${c.face.label}, found`);
      }
      this.cheer(b.el);
      if (this.cards.every((c) => c.matched)) this.finish();
    } else {
      this.missTimer = window.setTimeout(() => this.hideMiss(), MISS_MS);
    }
  }

  private hideMiss(): void {
    clearTimeout(this.missTimer);
    for (const c of this.turned) this.flip(c, false);
    this.turned = [];
  }

  private flip(card: Card, up: boolean): void {
    card.up = up;
    card.el.classList.toggle('up', up);
    card.el.setAttribute('aria-label', up ? card.face.label : 'Face down card');
  }

  private cheer(el: HTMLElement): void {
    this.sound.playPop(1.4);
    const r = el.getBoundingClientRect();
    vfx.burst(r.left + r.width / 2, r.top + r.height / 2, {
      count: 14, colors: ['#ffd54f', '#ff6fae', '#ffffff'], shape: 'star', speed: 260, size: 9, life: 0.7,
    });
  }

  private finish(): void {
    this.rounds[this.category]++;
    this.stars++;
    this.save();
    this.updateStars();
    const r = this.board.getBoundingClientRect();
    vfx.confetti(60);
    vfx.burst(r.left + r.width / 2, r.top + r.height / 3, { count: 22, shape: 'star', speed: 380, size: 11, life: 0.9 });
    if (this.stars % BALLOONS_EVERY === 0) this.balloons?.release(3);
    this.nextTimer = window.setTimeout(() => this.newRound(), NEXT_ROUND_MS);
  }
}
