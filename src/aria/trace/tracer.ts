import type { Sound } from '../audio';
import { star, vfx } from '../vfx';
import { Balloons } from './balloons';
import { BASE, DESC, ITEMS, MID, TOP, layoutItem, type Category, type Pt, type TraceItem } from './glyphs';
import { ColorField, pickColors } from './paint';

// Tracing game: follow each stroke of a letter or number from the green dot to
// the star. The paint follows the letter's path, not the finger, so every
// attempt looks neat; nothing ever "fails".

/** Road (the shape to stay on), in glyph units. */
const ROAD = 15;
/** How far from the path a finger may wander and still count, in glyph units / screen px. */
const TOLERANCE = 17;
const MIN_TOLERANCE_PX = 44;
/** How far ahead along the path one move may jump (stops shortcuts across a letter). */
const LOOKAHEAD = 28;
/** Close enough to the end of a stroke to count as finished. */
const END_SNAP = 4;
const SAMPLE_STEP = 1.5;
/** Paint width while tracing, as a share of the road; when finished it grows to cover the road. */
const PAINT_WIDTH = 0.78;
/** Pause after finishing before the next letter or number opens by itself. */
const AUTO_NEXT_MS = 1000;
/** Finishing this many in a row counts as a combo (shown on the combo chip). */
const COMBO_BALLOONS = 2;
/** Every third finished letter sends up balloons; finishing them in a row adds more. */
const BALLOONS_EVERY = 3;
const BALLOONS_FIRST = 4;
const BALLOONS_PER_COMBO = 2;
const MAX_BALLOONS_PER_ROUND = 12;
const STARS_KEY = 'arias-world:trace-stars';
const LAST_KEY = 'arias-world:trace-last';
const VOICE_KEY = 'arias-world:voice';
/**
 * Spoken letter names are off for now: the browser voices sound robotic and
 * sometimes say the wrong thing. Turn back on once there are recorded sounds.
 */
const SPEECH_ENABLED = false;

interface Stroke {
  pts: Pt[];
  /** Cumulative length at each point. */
  len: number[];
  total: number;
}

function resample(src: Pt[]): Stroke {
  if (src.length === 1) return { pts: [src[0]], len: [0], total: 0 };
  const pts: Pt[] = [src[0]];
  const len = [0];
  let acc = 0;
  for (let i = 1; i < src.length; i++) {
    const [ax, ay] = src[i - 1], [bx, by] = src[i];
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(d / SAMPLE_STEP));
    for (let k = 1; k <= n; k++) {
      pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
      len.push(acc + (d * k) / n);
    }
    acc += d;
  }
  return { pts, len, total: acc };
}

/** Point `s` units along a stroke. */
function pointAt(st: Stroke, s: number): Pt {
  if (st.total === 0) return st.pts[0];
  let i = st.len.findIndex((l) => l >= s);
  if (i <= 0) return st.pts[i < 0 ? st.pts.length - 1 : 0];
  const t = (s - st.len[i - 1]) / (st.len[i] - st.len[i - 1] || 1);
  const [ax, ay] = st.pts[i - 1], [bx, by] = st.pts[i];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked (private mode); stars last for this visit only
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class TracingApp {
  private readonly canvas = $<HTMLCanvasElement>('trace-canvas');
  private readonly g = this.canvas.getContext('2d')!;
  private readonly strip = $<HTMLDivElement>('trace-strip');
  private category: Category = 'upper';
  private index = 0;
  private strokes: Stroke[] = [];
  private field: ColorField | null = null;
  private paint = document.createElement('canvas');
  private box = { width: 100, height: 100 };
  private current = 0;
  /** Progress along the current stroke, in glyph units. */
  private progress = 0;
  private done = false;
  private doneAt = 0;
  private tracing: number | null = null;
  private lastFinger: Pt | null = null;
  private lastSparkle = 0;
  private hintUntil = 0;
  private view = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  private frame = 0;
  private visible = false;
  private readonly stars = new Set<string>(readJson<string[]>(STARS_KEY, []));
  private voice = readJson<boolean>(VOICE_KEY, true);
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private built = false;
  private nextTimer = 0;
  /** Letters finished in a row without skipping. */
  private combo = 0;
  private balloons: Balloons | null = null;
  /** Letters finished this visit (balloons come every BALLOONS_EVERY). */
  private finished = 0;

  constructor(private readonly sound: Sound) {}

  /** True while a finger is tracing. */
  get busy(): boolean {
    return this.tracing !== null;
  }

  /** Shows the tracing screen (call from a tap, so speech is allowed on iOS). */
  open(): void {
    if (!this.built) this.build();
    const last = readJson<{ category?: Category; index?: number }>(LAST_KEY, {});
    this.visible = true;
    this.setCategory(last.category ?? 'upper', last.index ?? 0);
    this.loop();
  }

  close(): void {
    this.visible = false;
    this.tracing = null;
    clearTimeout(this.nextTimer);
    this.setCombo(0);
    this.balloons?.clear();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  private build(): void {
    this.built = true;
    this.balloons = new Balloons(this.canvas.parentElement!, this.sound);
    document.querySelectorAll<HTMLButtonElement>('.trace-cats .cat').forEach((b) =>
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.setCategory(b.dataset.cat as Category, 0);
      }));
    $('trace-prev').addEventListener('click', () => this.step(-1));
    $('trace-next').addEventListener('click', () => this.step(1));
    $('trace-reset').addEventListener('click', () => {
      this.sound.playPop();
      this.openItem(this.index, false);
    });
    const voiceBtn = $('trace-voice');
    voiceBtn.hidden = !SPEECH_ENABLED;
    const syncVoice = () => voiceBtn.setAttribute('aria-pressed', String(this.voice));
    voiceBtn.addEventListener('click', () => {
      this.voice = !this.voice;
      writeJson(VOICE_KEY, this.voice);
      syncVoice();
      if (!this.voice && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    });
    syncVoice();

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('lostpointercapture', (e) => this.onUp(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => this.resize()).observe(c.parentElement!);
    this.updateStarCount();
  }

  private setCategory(category: Category, index: number): void {
    this.category = category;
    document.querySelectorAll<HTMLButtonElement>('.trace-cats .cat').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.cat === category)));
    this.renderStrip();
    this.openItem(Math.min(Math.max(index, 0), ITEMS[category].length - 1));
  }

  private renderStrip(): void {
    this.strip.replaceChildren();
    ITEMS[this.category].forEach((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'trace-tile';
      b.textContent = item.label;
      b.dataset.id = item.id;
      b.setAttribute('aria-label', `Trace ${item.label}`);
      b.classList.toggle('done', this.stars.has(item.id));
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.openItem(i);
      });
      this.strip.appendChild(b);
    });
  }

  private step(delta: number): void {
    this.sound.playPop();
    const items = ITEMS[this.category];
    this.openItem((this.index + delta + items.length) % items.length);
  }

  private get item(): TraceItem {
    return ITEMS[this.category][this.index];
  }

  /** `queue` lets the "great job" finish before the next name is spoken. */
  private openItem(index: number, speak = true, queue = false): void {
    clearTimeout(this.nextTimer);
    // Leaving one unfinished (skipping ahead, picking another) ends the combo.
    if (!this.done) this.setCombo(0);
    this.index = index;
    const layout = layoutItem(this.item);
    this.strokes = layout.strokes.map(resample);
    this.box = { width: layout.width, height: layout.height };
    const colors = pickColors(this.strokes.length);
    this.field = new ColorField(this.strokes.map((st, i) => ({ ...st, color: colors[i] })), layout.width, layout.height, ROAD);
    this.current = 0;
    this.progress = 0;
    this.done = false;
    this.tracing = null;
    $('trace-next').classList.remove('pulse');
    writeJson(LAST_KEY, { category: this.category, index });
    this.strip.querySelectorAll<HTMLElement>('.trace-tile').forEach((t, i) => t.setAttribute('aria-current', String(i === index)));
    const tile = this.strip.children[index] as HTMLElement | undefined;
    tile?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: this.reduced ? 'auto' : 'smooth' });
    this.resize();
    if (speak) this.say(this.item.say, queue);
  }

  private updateStarCount(): void {
    $('trace-star-count').textContent = String(this.stars.size);
  }

  private setCombo(n: number): void {
    this.combo = n;
    const chip = document.getElementById('trace-combo');
    if (!chip) return;
    chip.hidden = n < COMBO_BALLOONS;
    $('trace-combo-count').textContent = String(n);
    if (n >= COMBO_BALLOONS) {
      chip.classList.remove('tap-pop');
      void chip.offsetWidth; // restart the animation
      chip.classList.add('tap-pop');
    }
  }

  private say(text: string, queue = false): void {
    if (!SPEECH_ENABLED || !this.voice || typeof speechSynthesis === 'undefined') return;
    try {
      if (!queue) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.85;
      u.pitch = 1.15;
      speechSynthesis.speak(u);
    } catch {
      // no voice available
    }
  }

  // ---------------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------------

  private resize(): void {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = this.paint.width = Math.round(box.width * dpr);
    this.canvas.height = this.paint.height = Math.round(box.height * dpr);
    const scale = Math.min((box.width * 0.86) / this.box.width, (box.height * 0.86) / this.box.height);
    this.view = {
      scale,
      ox: (box.width - this.box.width * scale) / 2,
      oy: (box.height - this.box.height * scale) / 2,
      dpr,
      w: box.width,
      h: box.height,
    };
    this.draw(performance.now());
  }

  private toGlyph(e: { clientX: number; clientY: number }): Pt {
    const r = this.canvas.getBoundingClientRect();
    const { scale, ox, oy } = this.view;
    return [(e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale];
  }

  private toClient([x, y]: Pt): Pt {
    const r = this.canvas.getBoundingClientRect();
    const { scale, ox, oy } = this.view;
    return [r.left + ox + x * scale, r.top + oy + y * scale];
  }

  private get tolerance(): number {
    return Math.max(TOLERANCE, MIN_TOLERANCE_PX / this.view.scale);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    if (this.done || this.tracing !== null) return;
    const p = this.toGlyph(e);
    const st = this.strokes[this.current];
    // Count a touch on the green dot or anywhere on the part already painted
    // (children often restart a stroke from its beginning).
    const reach = this.tolerance * 1.2;
    let near = false;
    for (let i = 0; i < st.pts.length && st.len[i] <= this.progress + reach; i++) {
      if (Math.hypot(p[0] - st.pts[i][0], p[1] - st.pts[i][1]) <= reach) { near = true; break; }
    }
    if (!near) {
      // Not on the green dot: make it wiggle so the child sees where to start.
      this.hintUntil = performance.now() + 700;
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.tracing = e.pointerId;
    this.lastFinger = p;
    this.advance(p);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.tracing || !this.lastFinger) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const p = this.toGlyph(ev);
      // Walk from the last finger position in small steps so fast swipes still count.
      const [lx, ly] = this.lastFinger;
      const d = Math.hypot(p[0] - lx, p[1] - ly);
      const n = Math.max(1, Math.ceil(d / 3));
      for (let k = 1; k <= n && this.tracing !== null; k++) this.advance([lx + ((p[0] - lx) * k) / n, ly + ((p[1] - ly) * k) / n]);
      this.lastFinger = p;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.tracing) return;
    // Progress is kept: lifting and continuing is fine.
    this.tracing = null;
    this.lastFinger = null;
  }

  private advance(p: Pt): void {
    const st = this.strokes[this.current];
    const tol = this.tolerance;
    if (st.total === 0) {
      if (Math.hypot(p[0] - st.pts[0][0], p[1] - st.pts[0][1]) <= tol) this.finishStroke();
      return;
    }
    let best = this.progress;
    for (let i = 0; i < st.pts.length; i++) {
      const s = st.len[i];
      if (s <= best) continue;
      if (s > this.progress + LOOKAHEAD) break;
      if (Math.hypot(p[0] - st.pts[i][0], p[1] - st.pts[i][1]) <= tol) best = s;
    }
    if (best > this.progress) {
      const before = this.progress;
      this.progress = best;
      // Sparkles at the tip of the paint.
      if (best - this.lastSparkle > 6 || best < before) {
        this.lastSparkle = best;
        const [cx, cy] = this.toClient(pointAt(st, best));
        vfx.sparkle(cx, cy, this.field!.colorAt(this.current, best));
      }
    }
    if (this.progress >= st.total - END_SNAP) this.finishStroke();
  }

  private finishStroke(): void {
    const st = this.strokes[this.current];
    this.progress = st.total;
    const [cx, cy] = this.toClient(st.pts[st.pts.length - 1]);
    const color = this.field!.colorAt(this.current, st.total);
    vfx.burst(cx, cy, { count: 12, colors: [color, '#ffd54f'], shape: 'star', speed: 240, size: 8, life: 0.6 });
    this.sound.playPop();
    this.lastSparkle = 0;
    if (this.current < this.strokes.length - 1) {
      this.current++;
      this.progress = 0;
      // Keep going without lifting if the next stroke starts under the finger.
      if (this.lastFinger) {
        const [nx, ny] = this.strokes[this.current].pts[0];
        if (Math.hypot(this.lastFinger[0] - nx, this.lastFinger[1] - ny) > this.tolerance) this.tracing = null;
      }
      return;
    }
    this.finishItem();
  }

  private finishItem(): void {
    this.done = true;
    this.doneAt = performance.now();
    this.tracing = null;
    const item = this.item;
    this.stars.add(item.id);
    writeJson(STARS_KEY, [...this.stars]);
    this.updateStarCount();
    this.strip.querySelector(`[data-id="${item.id}"]`)?.classList.add('done');
    const r = this.canvas.getBoundingClientRect();
    vfx.confetti(60);
    vfx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 24, shape: 'star', speed: 420, size: 12, life: 0.9 });
    $('trace-next').classList.add('pulse');
    this.say(`${item.say}! Great job!`);
    this.setCombo(this.combo + 1);
    if (++this.finished % BALLOONS_EVERY === 0) {
      this.balloons?.release(Math.min(BALLOONS_FIRST + (this.combo - 1) * BALLOONS_PER_COMBO, MAX_BALLOONS_PER_ROUND));
    }
    // On to the next one by itself (wrapping around at the end of the row).
    this.nextTimer = window.setTimeout(() => {
      if (!this.visible || !this.done) return;
      const items = ITEMS[this.category];
      this.openItem((this.index + 1) % items.length, true, true);
    }, AUTO_NEXT_MS);
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  private loop(): void {
    if (this.frame) return;
    const tick = (t: number) => {
      this.frame = 0;
      if (!this.visible) return;
      this.draw(t);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private draw(now: number): void {
    const g = this.g;
    const { scale, ox, oy, dpr, w, h } = this.view;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const X = (x: number) => ox + x * scale;
    const Y = (y: number) => oy + y * scale;

    // Handwriting guidelines across the whole paper.
    g.lineWidth = Math.max(1.5, scale * 0.6);
    g.strokeStyle = '#efd3dc';
    for (const y of this.category === 'lower' ? [TOP, BASE, DESC] : [TOP, BASE]) {
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(0, Y(y));
      g.lineTo(w, Y(y));
      g.stroke();
    }
    g.setLineDash([scale * 3, scale * 3]);
    g.beginPath();
    g.moveTo(0, Y(MID));
    g.lineTo(w, Y(MID));
    g.stroke();
    g.setLineDash([]);

    const path = (st: Stroke, from: number, to: number) => {
      g.beginPath();
      let started = false;
      for (let i = 0; i < st.pts.length; i++) {
        if (st.len[i] < from || st.len[i] > to) continue;
        const [x, y] = st.pts[i];
        if (started) g.lineTo(X(x), Y(y));
        else g.moveTo(X(x), Y(y));
        started = true;
      }
      if (to < st.total && to > 0) {
        const [x, y] = pointAt(st, to);
        g.lineTo(X(x), Y(y));
      }
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // The road: where to stay.
    g.strokeStyle = '#f6e9ee';
    g.fillStyle = '#f6e9ee';
    g.lineWidth = ROAD * scale;
    for (const st of this.strokes) {
      if (st.total === 0) {
        g.beginPath();
        g.arc(X(st.pts[0][0]), Y(st.pts[0][1]), (ROAD * scale) / 2, 0, Math.PI * 2);
        g.fill();
      } else {
        path(st, 0, st.total);
        g.stroke();
      }
    }

    // Dashed guide down the middle of every stroke not finished yet.
    g.strokeStyle = '#d7b3c0';
    g.lineWidth = Math.max(2, scale * 1.2);
    g.setLineDash([scale * 2.5, scale * 3.5]);
    this.strokes.forEach((st, i) => {
      if (i < this.current || (this.done && i <= this.current) || st.total === 0) return;
      path(st, i === this.current ? this.progress : 0, st.total);
      g.stroke();
    });
    g.setLineDash([]);

    // Paint: finished strokes and the current one up to the finger. The shape
    // is drawn crisp in one color, then colored from the smooth color field, so
    // where strokes meet their colors blend instead of meeting at a hard edge.
    const celebrate = this.done ? Math.max(0, 1 - (now - this.doneAt) / 900) : 0;
    const upTo = this.strokes.map((st, i) => {
      const u = i < this.current || this.done ? st.total : i === this.current ? this.progress : -1;
      return u === 0 && st.total > 0 ? -1 : u;
    });
    if (this.field && upTo.some((u) => u >= 0)) {
      const p = this.paint.getContext('2d')!;
      p.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.clearRect(0, 0, w, h);
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.strokeStyle = p.fillStyle = '#000';
      // Once finished, the paint fills the whole road (no pale rim left around it).
      p.lineWidth = ROAD * scale * (this.done ? 1 + celebrate * 0.12 : PAINT_WIDTH);
      this.strokes.forEach((st, i) => {
        if (upTo[i] < 0) return;
        if (st.total === 0) {
          p.beginPath();
          p.arc(X(st.pts[0][0]), Y(st.pts[0][1]), p.lineWidth / 2, 0, Math.PI * 2);
          p.fill();
          return;
        }
        p.beginPath();
        let started = false;
        for (let k = 0; k < st.pts.length && st.len[k] <= upTo[i]; k++) {
          const [x, y] = st.pts[k];
          if (started) p.lineTo(X(x), Y(y));
          else p.moveTo(X(x), Y(y));
          started = true;
        }
        if (upTo[i] < st.total) {
          const [x, y] = pointAt(st, upTo[i]);
          p.lineTo(X(x), Y(y));
        }
        p.stroke();
      });
      this.field.update(upTo);
      p.globalCompositeOperation = 'source-in';
      this.field.draw(p, X, Y, scale);
      p.globalCompositeOperation = 'source-over';
      g.drawImage(this.paint, 0, 0, w, h);
    }

    if (this.done) return;

    // Where to go: a star at the end of the current stroke, a green dot with an arrow at the tip.
    const st = this.strokes[this.current];
    const pulse = this.reduced ? 1 : 1 + Math.sin(now / 220) * 0.08;
    const hint = now < this.hintUntil ? 1 + Math.sin(now / 45) * 0.18 : 1;
    if (st.total > 0) {
      const [ex, ey] = st.pts[st.pts.length - 1];
      g.fillStyle = '#ffc93c';
      star(g, X(ex), Y(ey), ROAD * scale * 0.55 * pulse);
    }
    const [hx, hy] = pointAt(st, this.progress);
    const r = ROAD * scale * 0.62 * pulse * hint;
    g.fillStyle = '#3cb862';
    g.beginPath();
    g.arc(X(hx), Y(hy), r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = Math.max(2, r * 0.16);
    g.stroke();
    if (st.total > 0) {
      const [ax, ay] = pointAt(st, Math.min(st.total, this.progress + 6));
      const a = Math.atan2(ay - hy, ax - hx);
      const cx = X(hx), cy = Y(hy), s = r * 0.55;
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
      g.lineTo(cx + Math.cos(a + 2.4) * s, cy + Math.sin(a + 2.4) * s);
      g.lineTo(cx + Math.cos(a - 2.4) * s, cy + Math.sin(a - 2.4) * s);
      g.closePath();
      g.fill();
    }
  }
}
