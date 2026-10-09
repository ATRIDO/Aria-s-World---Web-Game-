import type { Sound } from '../audio';
import { vfx } from '../vfx';
import {
  SVG_NS, cloneLook as clone, cropAll, fitToContent, freshLook, headOnly, headSvg, itemById as byId, lookMarkup,
  type Look,
} from './art';
import { dollOf, loadFriends, saveFriends, type Friend } from './friends';
import { PAINTED_HAIR, PAINTED_HEAD_BOX, PAINTED_ITEMS, paintedImage } from './painted';
import { BODY, CLOTH_COLORS, DOLLS, DRAWERS, HAIR, HAIR_COLORS, ITEMS, type Doll, type Item, type Slot } from './wardrobe';

// Dress-up: pick a doll, open a drawer (hair, dresses, tops, ...), and tap or
// drag a piece onto her. Tapping a piece she already wears takes it off; the
// color dots recolor what she wears from the open drawer. Everything can be
// undone, and each doll keeps her outfit for next time.

const SAVE_KEY = 'arias-world:dress';
const MAX_UNDO = 30;
/** A finger that moved less than this (px) was a tap, not a drag. */
const TAP_PX = 10;
/** Drawer buttons show one item that says what's inside. */
const DRAWER_ICON: Partial<Record<Slot, string>> = { hair: 'curly', face: 'lipstick', ears: 'starstuds', hat: 'tiara', back: 'fairywings' };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Saved {
  doll: number;
  looks: Record<string, Look>;
}


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
    $('dress-save').addEventListener('click', () => {
      this.sound.playPop();
      this.openFriends();
    });
    const pop = $('dress-friends');
    const closeFriends = () => {
      pop.hidden = true;
    };
    $('dress-friends-close').addEventListener('click', () => {
      this.sound.playPop();
      closeFriends();
    });
    pop.addEventListener('click', (e) => {
      if (e.target === pop) closeFriends();
    });
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFriends();
    });
    document.addEventListener('pointermove', (e) => this.onDragMove(e));
    document.addEventListener('pointerup', (e) => this.onDragEnd(e));
    document.addEventListener('pointercancel', () => this.endDrag());
  }

  // ---------------------------------------------------------------------------
  // Saving friends (up to five), to play as in other games
  // ---------------------------------------------------------------------------

  private openFriends(): void {
    $('dress-friends').hidden = false;
    this.renderFriends();
    $<HTMLButtonElement>('dress-friends-close').focus();
  }

  /**
   * Five places. An empty one saves her there right away; a full one asks first
   * (it wiggles, and a second tap replaces it). The little x clears one, also
   * with a second tap, so nobody loses a friend by accident.
   */
  private renderFriends(armed = ''): void {
    const box = $('dress-friend-slots');
    box.replaceChildren();
    const friends = loadFriends();
    friends.forEach((f, i) => {
      const cell = document.createElement('div');
      cell.className = 'friend-cell';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'friend-slot';
      if (f) {
        b.setAttribute('aria-label', armed === `put${i}` ? 'Tap again to put her here instead' : 'Saved friend: tap twice to put her here instead');
        b.appendChild(headSvg(dollOf(f.doll), f.look));
        if (armed === `put${i}`) b.classList.add('armed');
      } else {
        b.classList.add('empty');
        b.setAttribute('aria-label', 'Save her here');
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>';
      }
      b.addEventListener('click', () => {
        if (f && armed !== `put${i}`) {
          this.sound.playPop(0.9);
          this.renderFriends(`put${i}`);
          return;
        }
        this.putFriend(friends, i);
      });
      cell.appendChild(b);
      if (f) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'friend-clear';
        if (armed === `clear${i}`) x.classList.add('armed');
        x.setAttribute('aria-label', armed === `clear${i}` ? 'Tap again to remove' : 'Remove');
        x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>';
        x.addEventListener('click', () => {
          this.sound.playPop(0.8);
          if (armed !== `clear${i}`) {
            this.renderFriends(`clear${i}`);
            return;
          }
          friends[i] = null;
          saveFriends(friends);
          this.renderFriends();
        });
        cell.appendChild(x);
      }
      box.appendChild(cell);
    });
    cropAll(box);
  }

  private putFriend(friends: (Friend | null)[], i: number): void {
    friends[i] = { doll: this.dollDef.id, look: clone(this.look) };
    saveFriends(friends);
    this.renderFriends();
    const slot = $('dress-friend-slots').children[i]?.querySelector<HTMLElement>('.friend-slot');
    slot?.classList.add('saved');
    const r = slot?.getBoundingClientRect();
    if (r) vfx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, colors: ['#ff6fae', '#ffd54f', '#ffffff'], shape: 'star', speed: 280, size: 9, life: 0.7 });
    this.sound.playPop(1.3);
    window.setTimeout(() => {
      $('dress-friends').hidden = true;
    }, 900);
  }

  /** What she can wear from a drawer: painted dolls get painted pieces, drawn dolls get drawn ones; places suit both. */
  private itemsFor(slot: Slot): Item[] {
    const painted = !!this.dollDef.body;
    if (slot === 'hair') return painted ? PAINTED_HAIR : HAIR;
    return [...ITEMS, ...PAINTED_ITEMS].filter((i) => i.slot === slot && (slot === 'scene' || !!i.painted === painted));
  }

  /** The one picture on a drawer's button that says what's inside. */
  private drawerIcon(slot: Slot): string {
    const items = this.itemsFor(slot);
    if (this.dollDef.body) return items[0].id;
    return DRAWER_ICON[slot] ?? items[0].id;
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

  private dollMarkup(d: Doll, look: Look): string {
    return lookMarkup(d, look);
  }

  private renderDoll(popSlot?: Slot): void {
    const svg = $('dress-doll').querySelector('svg')!;
    svg.innerHTML = this.dollMarkup(this.dollDef, this.look);
    if (popSlot && !this.reduced) svg.querySelector(`.layer[data-slot="${popSlot}"]`)?.classList.add('pop');
  }

  private renderDrawer(): void {
    // Only drawers with something in them for this doll are shown (painted dolls have fewer, for now).
    const open = DRAWERS.filter((d) => this.itemsFor(d.slot).length);
    if (!open.some((d) => d.slot === this.drawer)) this.drawer = open[0].slot;
    $('dress-drawers').querySelectorAll<HTMLElement>('.dress-drawer').forEach((b) => {
      const slot = b.dataset.slot as Slot;
      const there = open.some((d) => d.slot === slot);
      b.hidden = !there;
      b.setAttribute('aria-pressed', String(slot === this.drawer));
      if (there && b.dataset.icon !== `${this.dollDef.id}:${this.drawerIcon(slot)}`) {
        b.dataset.icon = `${this.dollDef.id}:${this.drawerIcon(slot)}`;
        b.replaceChildren(this.thumb(this.drawerIcon(slot), true));
      }
    });

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
    cropAll($('dress'));
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
    if (item.painted) {
      if (item.slot === 'hair') {
        // Hair is shown on her head.
        svg.setAttribute('viewBox', PAINTED_HEAD_BOX);
        svg.innerHTML = this.dollMarkup(d, { worn: { hair: id }, colors: {}, hairColor: icon ? d.hairColor : this.look.hairColor });
      } else {
        const [x, y, w, h] = item.painted.bounds;
        const pad = Math.max(w, h) * 0.06;
        svg.setAttribute('viewBox', `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`);
        svg.innerHTML = paintedImage(item.painted.file);
      }
      svg.classList.remove('crop');
      return svg;
    }
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
    return headSvg(d, this.looks[d.id] ?? freshLook(d));
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
    // Painted dolls have fewer drawers: only pick from what she has.
    const some = (slot: Slot, chance: number): Partial<Record<Slot, string>> => {
      const items = this.itemsFor(slot);
      return items.length && Math.random() < chance ? { [slot]: pick(items).id } : {};
    };
    const dress = Math.random() < 0.45;
    look.worn = {
      hair: pick(this.itemsFor('hair')).id,
      ...some('shoes', 1),
      ...(dress ? some('dress', 1) : { ...some('top', 1), ...some('bottom', 1) }),
      ...some('hat', 0.7),
      ...some('acc', 0.6),
      ...some('ears', 0.5),
      ...some('face', 0.4),
      ...some('back', 0.3),
      ...some('scene', 0.7),
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
