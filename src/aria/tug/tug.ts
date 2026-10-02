import type { Sound } from '../audio';
import { cropAll, headSvg, lookMarkup } from '../dress/art';
import { characters, type Character } from '../dress/friends';
import { Balloons } from '../trace/balloons';
import { vfx } from '../vfx';

// Tug of war: two children (or one against a gentle computer) each pick a
// character, saved friends from dress-up first, then tap their big button as
// fast as they can. Every tap pulls the rope a step their way; whoever drags
// the yellow flag past their own colored marker wins.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Rope travel per tap, and how far the flag must go to win (field units). */
const STEP = 9;
const WIN_AT = 150;
/** The computer's taps: one every this many ms, plus up to JITTER_MS. */
const ROBOT_MS = 240;
const JITTER_MS = 170;
const COUNT_MS = 650;
const PULL_ANIM_MS = 140;
const PLAYERS_KEY = 'arias-world:tug';

type Side = 'left' | 'right';
type Phase = 'pick' | 'count' | 'play' | 'done';

// Where everything sits on the 1000 × 560 field.
const GROUND_Y = 470;
const ROPE_Y = 366;
const LEFT_DOLL_X = 180;
const RIGHT_DOLL_X = 620;
const DOLL_Y = GROUND_Y - 318;

const MARK = (x: number, color: string) =>
  `<path d="M${x} ${GROUND_Y + 6}V${GROUND_Y - 44}" stroke="#5b3a47" stroke-width="5" stroke-linecap="round"/>` +
  `<path d="M${x} ${GROUND_Y - 44}l${x < 500 ? -40 : 40} 14 ${x < 500 ? 40 : -40} 14z" fill="${color}" stroke="#5b3a47" stroke-width="4" stroke-linejoin="round"/>` +
  `<ellipse cx="${x}" cy="${GROUND_Y + 30}" rx="46" ry="10" fill="${color}" opacity="0.55"/>`;

const CROWN = `<path d="M-34 0-40-36-20-16 0-44 20-16 40-36 34 0Z" fill="#ffcf3a" stroke="#5b3a47" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="0" cy="-12" r="5" fill="#ff5fa8"/>`;

export class TugApp {
  private phase: Phase = 'pick';
  private solo = false;
  private chars: Character[] = [];
  private pick: Record<Side, string> = { left: '', right: '' };
  private target = 0;
  private shown = 0;
  private frame = 0;
  private robot = 0;
  private timers: number[] = [];
  private built = false;
  private balloons: Balloons | null = null;
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly sound: Sound) {
    try {
      const s = JSON.parse(localStorage.getItem(PLAYERS_KEY) ?? 'null') as { solo?: boolean; left?: string; right?: string } | null;
      if (s) {
        this.solo = s.solo === true;
        this.pick = { left: String(s.left ?? ''), right: String(s.right ?? '') };
      }
    } catch {
      // storage blocked: defaults
    }
  }

  /** True during a game, so an update never reloads mid-pull. */
  get busy(): boolean {
    return this.phase === 'count' || this.phase === 'play';
  }

  open(): void {
    if (!this.built) this.build();
    this.chars = characters();
    // Keep the last players if they still exist; otherwise the first two.
    const has = (k: string) => this.chars.some((c) => c.key === k);
    if (!has(this.pick.left)) this.pick.left = this.chars[0].key;
    if (!has(this.pick.right) || (this.pick.right === this.pick.left && this.chars.length > 1)) {
      this.pick.right = this.chars.find((c) => c.key !== this.pick.left)?.key ?? this.chars[0].key;
    }
    this.toPick();
  }

  close(): void {
    this.stop();
    this.balloons?.clear();
    this.phase = 'pick';
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private build(): void {
    this.built = true;
    this.balloons = new Balloons($('tug-stage'), this.sound);
    this.tall.addEventListener?.('change', () => this.fit());
    this.fit();
    const tap = (id: string, fn: () => void) =>
      $(id).addEventListener('click', () => {
        this.sound.playPop();
        fn();
      });
    tap('tug-two', () => this.setSolo(false));
    tap('tug-one', () => this.setSolo(true));
    tap('tug-go', () => this.countdown());
    tap('tug-again', () => this.countdown());
    tap('tug-change', () => this.toPick());

    for (const side of ['left', 'right'] as const) {
      const b = $<HTMLButtonElement>(`tug-pull-${side}`);
      // Pointer down, not click: every finger counts at once, and fast taps aren't merged.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.pull(side);
      });
      b.addEventListener('click', (e) => {
        if (e.detail === 0) this.pull(side); // keyboard / switch access
      });
    }
    document.addEventListener('keydown', (e) => {
      if ($('tug').hidden || e.repeat) return;
      const k = e.key.toLowerCase();
      if (['a', 's', 'arrowleft'].includes(k)) this.pull('left');
      else if (['k', 'l', 'arrowright'].includes(k)) this.pull('right');
    });
  }

  private setSolo(solo: boolean): void {
    this.solo = solo;
    this.savePlayers();
    this.toPick();
  }

  private savePlayers(): void {
    try {
      localStorage.setItem(PLAYERS_KEY, JSON.stringify({ solo: this.solo, ...this.pick }));
    } catch {
      // storage blocked
    }
  }

  private char(side: Side): Character {
    return this.chars.find((c) => c.key === this.pick[side]) ?? this.chars[0];
  }

  private toPick(): void {
    this.stop();
    this.phase = 'pick';
    this.target = this.shown = 0;
    $('tug').dataset.phase = 'pick';
    $('tug').classList.toggle('solo', this.solo);
    $('tug-two').setAttribute('aria-pressed', String(!this.solo));
    $('tug-one').setAttribute('aria-pressed', String(this.solo));
    $('tug-pick').hidden = false;
    $('tug-end').hidden = true;
    $('tug-count').textContent = '';
    this.showPull(false);
    for (const side of ['left', 'right'] as const) this.renderChoices(side);
    this.drawField();
  }

  private renderChoices(side: Side): void {
    const box = $(`tug-pick-${side}`);
    box.replaceChildren();
    for (const c of this.chars) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat tug-choice';
      if (c.saved) b.classList.add('saved');
      b.setAttribute('aria-label', c.saved ? 'Your saved friend' : c.doll.name);
      b.setAttribute('aria-pressed', String(c.key === this.pick[side]));
      b.appendChild(headSvg(c.doll, c.look));
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.pick[side] = c.key;
        this.savePlayers();
        box.querySelectorAll('.tug-choice').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.drawField();
        const r = b.getBoundingClientRect();
        vfx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 8, colors: [side === 'left' ? '#ff6fae' : '#3a80e8', '#fff'], speed: 200, size: 6, life: 0.5 });
      });
      box.appendChild(b);
    }
    cropAll(box);
  }

  // ---------------------------------------------------------------------------
  // The field
  // ---------------------------------------------------------------------------

  private drawField(): void {
    const doll = (side: Side, x: number) => {
      const c = this.char(side);
      // In a game she stands on the grass: no background place.
      return `<g class="tug-doll ${side}"><svg x="${x}" y="${DOLL_Y}" width="200" height="320" viewBox="0 0 200 320" overflow="visible">${lookMarkup(c.doll, c.look, ['scene'])}</svg></g>`;
    };
    const rope = `<path d="M40 ${ROPE_Y + 4}Q500 ${ROPE_Y + 18} 960 ${ROPE_Y + 4}" fill="none" stroke="#7a4a2a" stroke-width="15" stroke-linecap="round"/>
      <path d="M40 ${ROPE_Y + 4}Q500 ${ROPE_Y + 18} 960 ${ROPE_Y + 4}" fill="none" stroke="#d9a066" stroke-width="7" stroke-dasharray="12 10" stroke-linecap="round"/>`;
    const flag = `<g class="tug-flag"><path d="M500 ${ROPE_Y + 10}v62l34-18z" fill="#ffd84a" stroke="#5b3a47" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="500" cy="${ROPE_Y + 10}" r="8" fill="#ff5fa8" stroke="#5b3a47" stroke-width="4"/></g>`;
    $('tug-field').innerHTML = `
      <path d="M-3000 ${GROUND_Y}L-400 ${GROUND_Y}Q500 ${GROUND_Y - 24} 1400 ${GROUND_Y}L4000 ${GROUND_Y}V4000H-3000Z" fill="#8fd46a" stroke="#5b3a47" stroke-width="5"/>
      <path d="M500 ${GROUND_Y - 4}v90" stroke="#fff" stroke-width="6" stroke-dasharray="12 12" opacity="0.8"/>
      ${MARK(500 - WIN_AT, '#ff6fae')}${MARK(500 + WIN_AT, '#3a80e8')}
      <g id="tug-move">${rope}${doll('left', LEFT_DOLL_X)}${doll('right', RIGHT_DOLL_X)}${flag}
        <g id="tug-crown" class="tug-crown" opacity="0"><g>${CROWN}</g></g>
      </g>`;
    this.place();
  }

  /**
   * Tall screens (phones held upright) zoom in on the players and keep them in
   * the middle, clear of the big buttons at the bottom.
   */
  private fit(): void {
    const field = $('tug-field');
    const tall = this.tall.matches;
    field.setAttribute('viewBox', tall ? '20 110 960 420' : '0 0 1000 560');
    field.setAttribute('preserveAspectRatio', tall ? 'xMidYMid meet' : 'xMidYMax meet');
  }

  private readonly tall = matchMedia('(max-aspect-ratio: 1/1)');

  private place(): void {
    $('tug-field').querySelector('#tug-move')?.setAttribute('transform', `translate(${this.shown.toFixed(1)} 0)`);
  }

  private animate(): void {
    if (this.frame) return;
    const step = () => {
      this.shown += (this.target - this.shown) * (this.reduced ? 1 : 0.28);
      if (Math.abs(this.target - this.shown) < 0.3) this.shown = this.target;
      this.place();
      this.frame = this.shown === this.target ? 0 : requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------

  private countdown(): void {
    this.stop();
    this.balloons?.clear();
    this.target = this.shown = 0;
    this.drawField();
    this.phase = 'count';
    $('tug').dataset.phase = 'count';
    $('tug-pick').hidden = true;
    $('tug-end').hidden = true;
    this.showPull(true);
    const count = $('tug-count');
    const show = (text: string, go = false) => {
      count.textContent = text;
      count.classList.toggle('go', go);
      count.classList.remove('tick');
      void count.offsetWidth; // restart the pop animation
      count.classList.add('tick');
    };
    ['3', '2', '1'].forEach((n, i) => this.later(() => {
      show(n);
      this.sound.playPop(0.8 + i * 0.1);
    }, i * COUNT_MS));
    this.later(() => {
      show('GO!', true);
      this.sound.playPop(1.4);
      this.phase = 'play';
      $('tug').dataset.phase = 'play';
      if (this.solo) this.robotTap();
    }, 3 * COUNT_MS);
    this.later(() => {
      if (this.phase === 'play') count.textContent = '';
    }, 4 * COUNT_MS);
  }

  private robotTap(): void {
    // Gentle: a bit slower when it's ahead, so a small child can always come back.
    const ahead = this.target > 0 ? 1 + this.target / WIN_AT : 1;
    this.robot = window.setTimeout(() => {
      if (this.phase !== 'play') return;
      this.pull('right', true);
      this.robotTap();
    }, (ROBOT_MS + Math.random() * JITTER_MS) * ahead);
  }

  private pull(side: Side, byRobot = false): void {
    if (this.phase !== 'play') return;
    if (side === 'right' && this.solo && !byRobot) return;
    this.target += side === 'left' ? -STEP : STEP;
    this.animate();
    this.lean(side);
    if (!byRobot) {
      this.sound.playPop(0.9 + Math.random() * 0.3);
      const r = $(`tug-pull-${side}`).getBoundingClientRect();
      vfx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 5, colors: [side === 'left' ? '#ff6fae' : '#3a80e8', '#fff'], speed: 180, size: 5, life: 0.4 });
    }
    if (Math.abs(this.target) >= WIN_AT) this.win(side);
  }

  /** She throws her weight back for a moment. */
  private lean(side: Side): void {
    const g = $('tug-field').querySelector(`.tug-doll.${side}`);
    if (!g) return;
    g.classList.remove('pull');
    void (g as SVGGElement).getBBox();
    g.classList.add('pull');
    this.later(() => g.classList.remove('pull'), PULL_ANIM_MS);
  }

  private win(side: Side): void {
    this.phase = 'done';
    $('tug').dataset.phase = 'done';
    window.clearTimeout(this.robot);
    this.showPull(false);
    const field = $('tug-field');
    field.querySelector(`.tug-doll.${side}`)?.classList.add('win');
    field.querySelector(`.tug-doll.${side === 'left' ? 'right' : 'left'}`)?.classList.add('fall');
    const crown = field.querySelector('#tug-crown');
    if (crown) {
      const x = (side === 'left' ? LEFT_DOLL_X : RIGHT_DOLL_X) + 100;
      crown.setAttribute('transform', `translate(${x} ${DOLL_Y + 4})`);
      crown.setAttribute('opacity', '1');
      crown.classList.add('show');
    }
    const count = $('tug-count');
    count.textContent = '';
    this.sound.playPop(1.5);
    vfx.confetti(90);
    this.balloons?.release(4);
    const r = field.getBoundingClientRect();
    vfx.burst(side === 'left' ? r.left + r.width * 0.3 : r.left + r.width * 0.7, r.top + r.height * 0.4, {
      count: 26, colors: [side === 'left' ? '#ff6fae' : '#3a80e8', '#ffd54f', '#ffffff'], shape: 'star', speed: 320, size: 10, life: 0.9,
    });
    this.later(() => {
      $('tug-end').hidden = false;
    }, 1100);
  }

  private showPull(on: boolean): void {
    $('tug-pull-left').hidden = !on;
    $('tug-pull-right').hidden = !on || this.solo;
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private stop(): void {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    window.clearTimeout(this.robot);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
