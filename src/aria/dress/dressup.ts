import type { Sound } from '../audio';
import { vfx } from '../vfx';
import {
  BODY, CLOTH_COLORS, DOLLS, DRAWERS, FEET, HAIR, HAIR_COLORS, ITEMS, LAYERS,
  type Doll, type Item, type Slot,
} from './wardrobe';

// Dress-up: pick a doll, open a drawer (hair, dresses, tops, ...), and tap or
// drag a piece onto her. Tapping a piece she already wears takes it off; the
// color dots recolor what she wears from the open drawer. Everything can be
// undone, and each doll keeps her outfit for next time.

const SAVE_KEY = 'arias-world:dress';
const MAX_UNDO = 30;
/** A finger that moved less than this (px) was a tap, not a drag. */
const TAP_PX = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** Drawer buttons show one item that says what's inside. */
const DRAWER_ICON: Partial<Record<Slot, string>> = { hair: 'curly', face: 'lipstick', ears: 'starstuds', hat: 'tiara', back: 'fairywings' };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** What one doll wears: item id per slot, and the colors chosen for each slot. */
interface Look {
  worn: Partial<Record<Slot, string>>;
  colors: Partial<Record<Slot, [string, string]>>;
  hairColor: string;
}

interface Saved {
  doll: number;
  looks: Record<string, Look>;
}

const byId = new Map<string, Item>([...ITEMS, ...HAIR].map((i) => [i.id, i]));

function freshLook(d: Doll): Look {
  return { worn: { hair: d.hair, ...d.outfit }, colors: {}, hairColor: d.hairColor };
}

const clone = (l: Look): Look => JSON.parse(JSON.stringify(l)) as Look;

export class DressUpApp {
  private doll = 0;
  private looks: Record<string, Look> = {};
  private drawer: Slot = 'dress';
  private undoStack: { doll: number; look: Look }[] = [];
  private built = false;
  private drag: { item: Item; id: number; x: number; y: number; ghost: HTMLElement | null } | null = null;
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly sound: Sound) {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Saved | null;
      if (s) {
        this.doll = Math.min(Math.max(0, s.doll | 0), DOLLS.length - 1);
        this.looks = s.looks ?? {};
      }
    } catch {
      // storage blocked or damaged: start fresh
    }
  }

  /** True while a finger is dragging a piece of clothing. */
  get busy(): boolean {
    return this.drag !== null;
  }

  open(): void {
    if (!this.built) this.build();
    this.render();
  }

  close(): void {
    this.endDrag();
  }

  private get dollDef(): Doll {
    return DOLLS[this.doll];
  }

  private get look(): Look {
    const d = this.dollDef;
    return (this.looks[d.id] ??= freshLook(d));
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  private build(): void {
    this.built = true;
    const picker = $('dress-dolls');
    DOLLS.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat dress-doll';
      b.setAttribute('aria-label', d.name);
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.doll = i;
        this.save();
        this.render();
      });
      picker.appendChild(b);
    });

    const tabs = $('dress-drawers');
    for (const { slot, name } of DRAWERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dress-drawer';
      b.dataset.slot = slot;
      b.setAttribute('aria-label', name);
      b.appendChild(this.thumb(DRAWER_ICON[slot] ?? this.itemsFor(slot)[0].id, true));
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.drawer = slot;
        this.renderDrawer();
      });
      tabs.appendChild(b);
    }

    $('dress-undo').addEventListener('click', () => {
      this.sound.playPop();
      this.undo();
    });
    $('dress-shuffle').addEventListener('click', () => {
      this.sound.playPop();
      this.surprise();
    });
    document.addEventListener('pointermove', (e) => this.onDragMove(e));
    document.addEventListener('pointerup', (e) => this.onDragEnd(e));
    document.addEventListener('pointercancel', () => this.endDrag());
  }

  private itemsFor(slot: Slot): Item[] {
    return slot === 'hair' ? HAIR : ITEMS.filter((i) => i.slot === slot);
  }

  private render(): void {
    $('dress-dolls').querySelectorAll<HTMLButtonElement>('.dress-doll').forEach((b, i) => {
      b.setAttribute('aria-pressed', String(i === this.doll));
      b.replaceChildren(this.headSvg(DOLLS[i]));
    });
    this.renderDoll();
    this.renderDrawer();
    $<HTMLButtonElement>('dress-undo').disabled = !this.undoStack.length;
  }

  /** The doll with everything she wears, in layer order. */
  private dollMarkup(d: Doll, look: Look): string {
    let back = '', front = '';
    for (const slot of LAYERS) {
      const id = look.worn[slot];
      const item = id ? byId.get(id) : undefined;
      if (!item) continue;
      const [c1, c2] = look.colors[slot] ?? item.colors;
      const style = `--c1:${c1};--c2:${c2}`;
      if (item.back) back += `<g style="${style}">${item.back}</g>`;
      front += `<g class="layer" data-slot="${slot}" style="${style}">${item.front}</g>`;
    }
    const feet = look.worn.shoes ? '' : FEET;
    return `<g style="--skin:${d.skin};--eyes:${d.eyes};--hair:${look.hairColor}">${back}${BODY}${feet}${front}</g>`;
  }

  private renderDoll(popSlot?: Slot): void {
    const svg = $('dress-doll').querySelector('svg')!;
    svg.innerHTML = this.dollMarkup(this.dollDef, this.look);
    if (popSlot && !this.reduced) svg.querySelector(`.layer[data-slot="${popSlot}"]`)?.classList.add('pop');
  }

  private renderDrawer(): void {
    $('dress-drawers').querySelectorAll<HTMLElement>('.dress-drawer').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.slot === this.drawer)));

    // Color dots: hair colors in the hair drawer, cloth colors elsewhere.
    const dots = $('dress-colors');
    dots.replaceChildren();
    const colors = this.drawer === 'hair' ? HAIR_COLORS : CLOTH_COLORS;
    const current = this.drawer === 'hair' ? this.look.hairColor : (this.look.colors[this.drawer]?.[0] ?? this.wornItem(this.drawer)?.colors[0]);
    for (const c of colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dress-color';
      b.style.setProperty('--dot', c);
      b.setAttribute('aria-label', 'Color');
      b.setAttribute('aria-pressed', String(c === current));
      b.disabled = this.drawer !== 'hair' && !this.wornItem(this.drawer);
      b.addEventListener('click', () => {
        this.sound.playPop(1.2);
        this.recolor(c);
      });
      dots.appendChild(b);
    }

    const box = $('dress-items');
    box.replaceChildren();
    for (const item of this.itemsFor(this.drawer)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dress-item';
      b.setAttribute('aria-label', item.name);
      b.setAttribute('aria-pressed', String(this.look.worn[item.slot] === item.id));
      b.appendChild(this.thumb(item.id));
      b.addEventListener('pointerdown', (e) => this.onDragStart(e, item));
      // Keyboard and switch access: Enter/Space "click" without a pointer.
      b.addEventListener('click', (e) => {
        if (e.detail === 0) this.toggle(item);
      });
      box.appendChild(b);
    }
    // Crop every picture to its drawing once it's on screen.
    requestAnimationFrame(() => document.querySelectorAll<SVGSVGElement>('#dress svg.crop').forEach(fitToContent));
  }

  private wornItem(slot: Slot): Item | undefined {
    const id = this.look.worn[slot];
    return id ? byId.get(id) : undefined;
  }

  /** A small picture of one item (hair is shown on the doll's head). */
  private thumb(id: string, icon = false): SVGSVGElement {
    const item = byId.get(id)!;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 320');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('crop');
    const d = this.dollDef;
    const [c1, c2] = item.colors;
    if (item.slot === 'hair') {
      svg.innerHTML = this.dollMarkup(d, { worn: { hair: id }, colors: {}, hairColor: icon ? '#6b4128' : this.look.hairColor })
        .replace(BODY, headOnly());
      svg.dataset.crop = 'head';
    } else if ((item.slot === 'face' || item.slot === 'ears') && !icon) {
      // Makeup and earrings are shown on her face.
      svg.innerHTML = this.dollMarkup(d, { worn: { hair: this.look.worn.hair, [item.slot]: id }, colors: {}, hairColor: this.look.hairColor })
        .replace(BODY, headOnly());
      svg.dataset.crop = 'head';
    } else if (item.slot === 'scene') {
      // A window onto the place, the same shape as the stage.
      svg.classList.remove('crop');
      svg.setAttribute('viewBox', '-60 -20 320 340');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      svg.innerHTML = `<g style="--c1:${c1};--c2:${c2}">${item.back ?? ''}</g>`;
    } else if (item.slot === 'ears') {
      // Earrings come in pairs far apart: the drawer shows just one.
      svg.classList.remove('crop');
      svg.setAttribute('viewBox', '43 80 28 28');
      svg.innerHTML = `<g style="--c1:${c1};--c2:${c2}">${item.front}</g>`;
    } else {
      svg.innerHTML = `<g style="--c1:${c1};--c2:${c2};--skin:${d.skin};--hair:${this.look.hairColor}">${item.back ?? ''}${item.front}</g>`;
    }
    return svg;
  }

  private headSvg(d: Doll): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 320');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('crop');
    svg.dataset.crop = 'head';
    const look = this.looks[d.id] ?? freshLook(d);
    svg.innerHTML = this.dollMarkup(d, { worn: { hair: look.worn.hair }, colors: {}, hairColor: look.hairColor }).replace(BODY, headOnly());
    return svg;
  }

  // ---------------------------------------------------------------------------
  // Dressing
  // ---------------------------------------------------------------------------

  /** Put an item on, or take it off if she already wears it. */
  private toggle(item: Item, at?: { x: number; y: number }): void {
    const look = this.look;
    const wearing = look.worn[item.slot] === item.id;
    if (item.slot === 'hair' && wearing) return; // she always has hair
    this.pushUndo();
    if (wearing) {
      delete look.worn[item.slot];
    } else {
      look.worn[item.slot] = item.id;
      // A dress replaces a top and bottom, and the other way round.
      if (item.slot === 'dress') {
        delete look.worn.top;
        delete look.worn.bottom;
      } else if (item.slot === 'top' || item.slot === 'bottom') {
        delete look.worn.dress;
      }
    }
    this.save();
    this.renderDoll(wearing ? undefined : item.slot);
    this.renderDrawer();
    this.cheer(wearing ? 1 : 0.6, at, item.colors[0]);
  }

  private recolor(c: string): void {
    const look = this.look;
    this.pushUndo();
    if (this.drawer === 'hair') {
      look.hairColor = c;
    } else {
      const item = this.wornItem(this.drawer);
      if (!item) return;
      const second = look.colors[this.drawer]?.[1] ?? item.colors[1];
      look.colors[this.drawer] = [c, second];
    }
    this.save();
    this.render();
    this.renderDoll(this.drawer);
    this.cheer(0.8, undefined, c);
  }

  /** A whole new outfit at random: "surprise me". */
  private surprise(): void {
    this.pushUndo();
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const look = this.look;
    const dress = Math.random() < 0.45;
    look.worn = {
      hair: pick(HAIR).id,
      shoes: pick(this.itemsFor('shoes')).id,
      ...(dress ? { dress: pick(this.itemsFor('dress')).id } : { top: pick(this.itemsFor('top')).id, bottom: pick(this.itemsFor('bottom')).id }),
      ...(Math.random() < 0.7 ? { hat: pick(this.itemsFor('hat')).id } : {}),
      ...(Math.random() < 0.6 ? { acc: pick(this.itemsFor('acc')).id } : {}),
      ...(Math.random() < 0.5 ? { ears: pick(this.itemsFor('ears')).id } : {}),
      ...(Math.random() < 0.4 ? { face: pick(this.itemsFor('face')).id } : {}),
      ...(Math.random() < 0.3 ? { back: pick(this.itemsFor('back')).id } : {}),
      ...(Math.random() < 0.7 ? { scene: pick(this.itemsFor('scene')).id } : {}),
    };
    look.colors = {};
    look.hairColor = pick(HAIR_COLORS);
    this.save();
    this.render();
    this.cheer(1.4);
  }

  private pushUndo(): void {
    this.undoStack.push({ doll: this.doll, look: clone(this.look) });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    $<HTMLButtonElement>('dress-undo').disabled = false;
  }

  private undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.doll = s.doll;
    this.looks[DOLLS[s.doll].id] = s.look;
    this.save();
    this.render();
  }

  private save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ doll: this.doll, looks: this.looks } satisfies Saved));
    } catch {
      // storage blocked: outfits last for this visit only
    }
  }

  /** Sparkles on the doll (or where the piece landed) and a pop. */
  private cheer(amount: number, at?: { x: number; y: number }, color = '#ff6fae'): void {
    this.sound.playPop(1 + Math.random() * 0.2);
    const r = $('dress-doll').getBoundingClientRect();
    const x = at?.x ?? r.left + r.width / 2, y = at?.y ?? r.top + r.height * 0.45;
    vfx.burst(x, y, { count: Math.round(14 * amount), colors: [color, '#ffd54f', '#ffffff'], shape: 'star', speed: 260, size: 9, life: 0.7 });
  }

  // ---------------------------------------------------------------------------
  // Dragging a piece onto the doll (a tap works too)
  // ---------------------------------------------------------------------------

  private onDragStart(e: PointerEvent, item: Item): void {
    if (this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.drag = { item, id: e.pointerId, x: e.clientX, y: e.clientY, ghost: null };
  }

  private onDragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.ghost && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) {
      const g = document.createElement('div');
      g.className = 'dress-ghost';
      g.appendChild(this.thumb(d.item.id));
      document.body.appendChild(g);
      d.ghost = g;
      requestAnimationFrame(() => g.querySelectorAll<SVGSVGElement>('svg.crop').forEach(fitToContent));
    }
    if (d.ghost) {
      d.ghost.style.translate = `${e.clientX}px ${e.clientY}px`;
      $('dress-doll').classList.toggle('near', this.overDoll(e));
    }
  }

  private onDragEnd(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dragged = !!d.ghost;
    const onDoll = this.overDoll(e);
    this.endDrag();
    if (!dragged) this.toggle(d.item); // a tap
    else if (onDoll) {
      // Dropped on her: always put it on (even if it was already on).
      if (this.look.worn[d.item.slot] === d.item.id) this.cheer(0.6, { x: e.clientX, y: e.clientY }, d.item.colors[0]);
      else this.toggle(d.item, { x: e.clientX, y: e.clientY });
    }
  }

  /** Anywhere on the doll's side of the screen counts (forgiving drops). */
  private overDoll(e: PointerEvent): boolean {
    const r = $('dress-doll').getBoundingClientRect();
    const pad = Math.min(r.width, r.height) * 0.15;
    return e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
  }

  private endDrag(): void {
    this.drag?.ghost?.remove();
    this.drag = null;
    $('dress-doll').classList.remove('near');
  }
}

/** Just the head and face of BODY (for hair pictures and the doll buttons). */
function headOnly(): string {
  const start = BODY.indexOf('<circle cx="57"');
  return BODY.slice(start);
}

/** Tight viewBox around what's drawn, with a little room. */
function fitToContent(svg: SVGSVGElement): void {
  if (svg.dataset.fitted) return;
  try {
    const g = svg.firstElementChild as SVGGraphicsElement | null;
    const b = g?.getBBox();
    if (!b || !b.width || !b.height) return;
    let { x, y, width: w, height: h } = b;
    if (svg.dataset.crop === 'head') h = Math.min(h, 130 - y);
    const pad = Math.max(w, h) * 0.08;
    svg.setAttribute('viewBox', `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`);
    svg.dataset.fitted = '1';
  } catch {
    // not rendered yet; keep the full box
  }
}
