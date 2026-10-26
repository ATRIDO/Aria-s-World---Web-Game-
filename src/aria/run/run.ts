import type { Sound } from '../audio';
import { cropAll, headSvg, lookMarkup } from '../dress/art';
import { characters, type Character } from '../dress/friends';
import { star } from '../vfx';

// Dash: an endless run along a sandy path, seen from behind (like Temple Run, but
// gentle). The friend runs by itself. Swipe or tap the big arrows to change lanes,
// jump over logs, slide under the branches, and collect the stars. A bump never
// ends the run: the friend tumbles, slows down a little and gets going again.
// Drawn on a Canvas 2D road with perspective scaling, so it needs no 3D engine.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Units are metres. Lanes sit at -1, 0 and 1; the road runs from -1.5 to 1.5.
type Lane = -1 | 0 | 1;
type Kind = 'crate' | 'log' | 'arch';
interface Obstacle { kind: Kind; lanes: Lane[]; d: number }
interface Star { lane: Lane; d: number; got: boolean }
type Phase = 'pick' | 'play';

const ROAD_HALF = 1.5;
const HERO_H = 1.7;
const SLIDE_H = 0.55; // how much the friend squashes while sliding
const LOG_H = 0.5;
const CRATE_H = 1.2;
const ARCH_BOTTOM = 1.2;
const ARCH_TOP = 1.9;
const STAR_H = 1.0;
const GRAVITY = 26;
const JUMP_V = 10.5;
const JUMP_BUFFER_S = 0.25;
const SLIDE_S = 0.7;
const BUMP_S = 1;
const SPEED_MIN = 11;
const SPEED_MAX = 18;
const SPEED_PER_M = 1 / 90;
const ROW_GAP = 15;
const ROW_GAP_RANGE = 7;
/** Rows are made until the road reaches this far ahead; DRAW_D is the farthest drawn. */
const SPAWN_D = 95;
const DRAW_D = 110;
/** Shrinks things with distance: half size at 14 m, nearly gone at the horizon. */
const DEPTH = 0.07;

const scale = (d: number) => 1 / (1 + DEPTH * d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const LANES: Lane[] = [-1, 0, 1];

// Canvas colors. Warm sand path, soft grass, the same ink as the rest of the game.
const INK = '#5b3a47';
const GRASS = '#9fe08c';
const GRASS_DARK = '#7fcb74';
const SAND = '#f5d59c';
const SAND_EDGE = '#dfae6a';
const CRATE = '#e0944f';
const LOG = '#b9773f';
const ARCH = '#8a5a3b';
const GOLD = '#ffcf3a';

export class RunApp {
  private phase: Phase = 'pick';
  private chars: Character[] = [];
  private built = false;
  private frame = 0;
  private last = 0;
  private dirty = true;

  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private stage!: HTMLElement;
  private hero!: HTMLElement;
  private tilt!: HTMLElement;
  private pick!: HTMLElement;
  private coinCount!: HTMLElement;
  // Layout in CSS pixels, set by measure().
  private w = 0;
  private h = 0;
  private cx = 0;
  private horizon = 0;
  private base = 0;
  private m = 1;

  // Game state.
  private lane: Lane = 0;
  private heroX = 0;
  private y = 0;
  private vy = 0;
  private slideT = 0;
  private jumpBuf = 0;
  private bumpT = 0;
  private slow = 1;
  private traveled = 0;
  private frontier = 0;
  private coins = 0;
  private obstacles: Obstacle[] = [];
  private stars: Star[] = [];

  constructor(private readonly sound: Sound) {}

  /** True during a run, so an update never reloads mid-run. */
  get busy(): boolean {
    return this.phase === 'play';
  }

  open(): void {
    if (!this.built) this.build();
    this.chars = characters();
    this.toPick();
  }

  close(): void {
    this.stop();
    this.phase = 'pick';
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private build(): void {
    this.built = true;
    this.canvas = $<HTMLCanvasElement>('run-canvas');
    this.g = this.canvas.getContext('2d')!;
    this.stage = $('run-stage');
    this.hero = $('run-hero');
    this.tilt = $('run-tilt');
    this.pick = $('run-pick');
    this.coinCount = $('run-coin-count');

    // Big buttons act on press, so a child's tap answers at once.
    const press = (id: string, fn: () => void) =>
      $(id).addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.phase === 'play') fn();
      });
    press('run-left', () => this.move(-1));
    press('run-right', () => this.move(1));
    press('run-jump', () => this.jump());
    press('run-slide', () => this.slide());
    $('run-change').addEventListener('click', () => {
      this.sound.playPop();
      this.toPick();
    });

    // Swipes on the road: sideways changes lane, up jumps, down slides. Small
    // wiggles count as taps and do nothing, so stray touches never move the friend.
    let sx = 0, sy = 0, id = -1;
    this.stage.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'play') return;
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
    });
    this.stage.addEventListener('pointerup', (e) => {
      if (e.pointerId !== id || this.phase !== 'play') return;
      id = -1;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      if (Math.abs(dx) > Math.abs(dy)) this.move(dx < 0 ? -1 : 1);
      else if (dy < 0) this.jump();
      else this.slide();
    });
    this.stage.addEventListener('pointercancel', () => (id = -1));

    window.addEventListener('keydown', (e) => {
      if (this.phase !== 'play') return;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => this.move(-1),
        ArrowRight: () => this.move(1),
        ArrowUp: () => this.jump(),
        ' ': () => this.jump(),
        ArrowDown: () => this.slide(),
      };
      const act = keys[e.key];
      if (!act) return;
      e.preventDefault();
      act();
    });

    window.addEventListener('resize', () => (this.dirty = true));
    // Pause the run while the app is in the background.
    document.addEventListener('visibilitychange', () => {
      if (this.phase !== 'play') return;
      if (document.hidden) this.stop();
      else this.resume();
    });
  }

  // ---------------------------------------------------------------------------
  // Choosing a runner
  // ---------------------------------------------------------------------------

  private toPick(): void {
    this.stop();
    this.phase = 'pick';
    this.hero.hidden = true;
    this.pick.hidden = false;
    this.renderPick();
    this.dirty = true;
    this.measure();
    this.drawRoad();
  }

  private renderPick(): void {
    this.pick.replaceChildren();
    for (const c of this.chars) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'run-choice';
      if (c.saved) b.classList.add('saved');
      b.setAttribute('aria-label', c.saved ? 'Your saved friend' : c.doll.name);
      b.appendChild(headSvg(c.doll, c.look));
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.start(c);
      });
      this.pick.appendChild(b);
    }
    cropAll(this.pick);
  }

  private start(c: Character): void {
    this.tilt.innerHTML = `<svg viewBox="0 0 200 320" overflow="visible">${lookMarkup(c.doll, c.look, ['scene'])}</svg>`;
    this.pick.hidden = true;
    this.hero.hidden = false;
    this.hero.classList.remove('bump');
    this.phase = 'play';

    this.lane = 0;
    this.heroX = 0;
    this.y = 0;
    this.vy = 0;
    this.slideT = 0;
    this.jumpBuf = 0;
    this.bumpT = 0;
    this.slow = 1;
    this.traveled = 0;
    this.coins = 0;
    this.obstacles = [];
    this.stars = [];
    this.frontier = 30;
    this.fill();
    this.coinCount.textContent = '0';

    this.dirty = true;
    this.measure();
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  private tick = (t: number): void => {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.dirty) this.measure();
    this.update(dt);
    this.drawRoad();
    this.drawThings();
    this.drawHero();
    this.frame = requestAnimationFrame(this.tick);
  };

  private stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private resume(): void {
    if (this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private update(dt: number): void {
    this.bumpT = Math.max(0, this.bumpT - dt);
    if (this.bumpT === 0) this.hero.classList.remove('bump');
    this.slow = Math.min(1, this.slow + dt * 0.6);
    this.slideT = Math.max(0, this.slideT - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);

    // Lanes ease over, so the friend glides rather than jumps sideways.
    this.heroX += (this.lane - this.heroX) * Math.min(1, dt * 12);

    // Jumping: gravity pulls back to the road; a jump pressed just before landing still counts.
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      if (this.jumpBuf > 0) this.jump();
    }

    const speed = Math.min(SPEED_MAX, SPEED_MIN + this.traveled * SPEED_PER_M) * this.slow;
    const move = speed * dt;
    this.traveled += move;

    for (const o of this.obstacles) {
      const prev = o.d;
      o.d -= move;
      if (prev > 0 && o.d <= 0) this.crossed(o);
    }
    for (const s of this.stars) {
      s.d -= move;
      if (!s.got && Math.abs(s.d) < 0.9 && Math.abs(this.heroX - s.lane) < 0.8) {
        s.got = true;
        this.coins++;
        this.coinCount.textContent = String(this.coins);
        this.sound.playPop(1.6);
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.d > -3);
    this.stars = this.stars.filter((s) => s.d > -3);

    this.frontier -= move;
    this.fill();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private move(dir: number): void {
    this.lane = clamp(this.lane + dir, -1, 1) as Lane;
  }

  private jump(): void {
    if (this.y > 0) {
      // In the air: remember the press, it fires on landing.
      this.jumpBuf = JUMP_BUFFER_S;
      return;
    }
    this.vy = JUMP_V;
    this.slideT = 0;
    this.jumpBuf = 0;
    this.sound.playPop(1.2);
  }

  private slide(): void {
    if (this.y === 0) this.slideT = SLIDE_S;
  }

  /** Obstacles hit the friend the moment they pass it. */
  private crossed(o: Obstacle): void {
    if (this.bumpT > 0) return;
    const onLane = o.lanes.includes(this.lane);
    const hit =
      o.kind === 'crate' ? onLane :
      o.kind === 'log' ? onLane && this.y < LOG_H + 0.1 :
      this.slideT <= 0; // arch: the branch is only avoided by sliding
    if (hit) this.bump();
  }

  private bump(): void {
    this.bumpT = BUMP_S;
    this.slow = 0.5;
    this.hero.classList.remove('bump');
    void this.hero.offsetWidth; // restart the wobble
    this.hero.classList.add('bump');
    this.sound.playPop(0.6);
  }

  // ---------------------------------------------------------------------------
  // Making the road ahead
  // ---------------------------------------------------------------------------

  private fill(): void {
    while (this.frontier < SPAWN_D) {
      this.frontier += ROW_GAP + Math.random() * ROW_GAP_RANGE;
      this.row(this.frontier);
    }
  }

  /** One row ahead: a line of stars, or one thing to dodge (plus stars when there is room). */
  private row(d: number): void {
    const lane = LANES[Math.floor(Math.random() * 3)];
    const r = Math.random();
    if (r < 0.35) {
      for (let i = 0; i < 6; i++) this.stars.push({ lane, d: d + i * 2, got: false });
      return;
    }
    if (r < 0.6) this.obstacles.push({ kind: 'crate', lanes: [lane], d });
    else if (r < 0.8) this.obstacles.push({ kind: 'log', lanes: [lane], d });
    else {
      this.obstacles.push({ kind: 'arch', lanes: [-1, 0, 1], d });
      return;
    }
    // Reward for the lane change: a star in another lane.
    if (Math.random() < 0.5) {
      const other = LANES.filter((l) => l !== lane);
      const free = other[Math.floor(Math.random() * other.length)];
      this.stars.push({ lane: free, d, got: false });
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  /** Size the canvas and the friend for the stage. */
  private measure(): void {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.cx = w / 2;
    this.horizon = h * 0.36;
    this.base = h * 0.92;
    this.m = Math.min(w * 0.26, h * 0.24);
    const heroH = HERO_H * this.m;
    this.hero.style.width = `${(heroH * 200) / 320}px`;
    this.hero.style.height = `${heroH}px`;
    this.dirty = false;
  }

  /** Screen x of a point `off` metres across the road, `d` metres ahead. */
  private xAt(off: number, d: number): number {
    return this.cx + off * this.m * scale(d);
  }

  /** Screen y of the road surface `d` metres ahead. */
  private yAt(d: number): number {
    return this.horizon + (this.base - this.horizon) * scale(d);
  }

  private drawRoad(): void {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = GRASS;
    g.fillRect(0, this.horizon, this.w, this.h - this.horizon);
    // Soft stripes of grass, closer together near the horizon.
    g.fillStyle = GRASS_DARK;
    for (let i = 0; i < 6; i++) {
      const y = this.yAt(4 + i * 14);
      g.fillRect(0, y, this.w, 4 * scale(4 + i * 14) + 2);
    }

    // The path: a sand strip with darker edges.
    const edge = (sign: number) => {
      const pts: [number, number][] = [];
      for (let d = 0; d <= DRAW_D; d += 5) pts.push([this.xAt(sign * ROAD_HALF, d), this.yAt(d)]);
      return pts;
    };
    const left = edge(-1), right = edge(1);
    g.beginPath();
    g.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) g.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
    g.closePath();
    g.fillStyle = SAND;
    g.fill();
    g.lineWidth = Math.max(3, 0.25 * this.m * scale(0));
    g.strokeStyle = SAND_EDGE;
    for (const side of [left, right]) {
      g.beginPath();
      side.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }

    // Dashed lane lines between the three lanes.
    g.strokeStyle = '#fff';
    for (const off of [-0.5, 0.5]) {
      for (let d = 0; d < DRAW_D; d += 8) {
        const s = scale(d);
        g.lineWidth = Math.max(1.5, 0.08 * this.m * s);
        g.beginPath();
        g.moveTo(this.xAt(off, d), this.yAt(d));
        g.lineTo(this.xAt(off, d + 4), this.yAt(d + 4));
        g.stroke();
      }
    }

    // The friend's shadow, shrinking as the friend jumps.
    const sh = Math.max(0.3, 1 - this.y / 3);
    g.fillStyle = 'rgb(91 58 71 / 0.22)';
    g.beginPath();
    g.ellipse(this.xAt(this.heroX, 0), this.base, 0.6 * this.m * sh, 0.18 * this.m * sh, 0, 0, Math.PI * 2);
    g.fill();
  }

  /** Obstacles and stars, far first, so near things overlap far ones. */
  private drawThings(): void {
    const items: { d: number; draw: () => void }[] = [];
    for (const o of this.obstacles) if (o.d > -1 && o.d < DRAW_D) items.push({ d: o.d, draw: () => this.drawObstacle(o) });
    for (const s of this.stars) if (!s.got && s.d > -1 && s.d < DRAW_D) items.push({ d: s.d, draw: () => this.drawStar(s) });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) it.draw();
  }

  private drawObstacle(o: Obstacle): void {
    const g = this.g, m = this.m, s = scale(o.d), base = this.yAt(o.d);
    g.lineWidth = Math.max(2, 0.08 * m * s);
    g.strokeStyle = INK;
    if (o.kind === 'arch') {
      const left = this.xAt(-ROAD_HALF, o.d), right = this.xAt(ROAD_HALF, o.d);
      const post = 0.2 * m * s;
      g.fillStyle = ARCH;
      g.fillRect(left - post / 2, base - ARCH_BOTTOM * m * s, post, ARCH_BOTTOM * m * s);
      g.fillRect(right - post / 2, base - ARCH_BOTTOM * m * s, post, ARCH_BOTTOM * m * s);
      g.fillRect(left, base - ARCH_TOP * m * s, right - left, (ARCH_TOP - ARCH_BOTTOM) * m * s);
      g.strokeRect(left, base - ARCH_TOP * m * s, right - left, (ARCH_TOP - ARCH_BOTTOM) * m * s);
      return;
    }
    const x = this.xAt(o.lanes[0], o.d);
    if (o.kind === 'crate') {
      const w = 0.9 * m * s, h = CRATE_H * m * s;
      g.fillStyle = CRATE;
      g.fillRect(x - w / 2, base - h, w, h);
      g.strokeRect(x - w / 2, base - h, w, h);
      g.beginPath();
      g.moveTo(x - w / 2, base - h / 2);
      g.lineTo(x + w / 2, base - h / 2);
      g.stroke();
      return;
    }
    // Log: a fallen trunk across the lane, with a light end.
    const w = 0.9 * m * s, h = LOG_H * m * s;
    g.fillStyle = LOG;
    g.fillRect(x - w / 2, base - h, w, h);
    g.strokeRect(x - w / 2, base - h, w, h);
    g.fillStyle = '#e7b67a';
    g.beginPath();
    g.ellipse(x + w / 2, base - h / 2, h * 0.35, h / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  private drawStar(s: Star): void {
    const x = this.xAt(s.lane, s.d), y = this.yAt(s.d) - STAR_H * this.m * scale(s.d);
    const r = 0.3 * this.m * scale(s.d);
    this.g.fillStyle = '#fff7c2';
    this.g.strokeStyle = INK;
    this.g.lineWidth = Math.max(1.5, 0.06 * this.m * scale(s.d));
    this.g.beginPath();
    this.g.arc(x, y, r * 1.25, 0, Math.PI * 2);
    this.g.fill();
    this.g.stroke();
    this.g.fillStyle = GOLD;
    star(this.g, x, y, r);
  }

  private drawHero(): void {
    const heroH = HERO_H * this.m;
    const heroW = (heroH * 200) / 320;
    const x = this.cx + this.heroX * this.m;
    const feet = this.base - this.y * this.m;
    this.hero.style.transform = `translate(${x - heroW / 2}px, ${feet - heroH}px)`;
    // Lean into the lane change, and squash while sliding.
    const lean = clamp(this.lane - this.heroX, -1, 1) * 8;
    this.tilt.style.transform = `rotate(${lean}deg) scaleY(${this.slideT > 0 ? SLIDE_H : 1})`;
  }
}
