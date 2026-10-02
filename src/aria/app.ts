import { Sound } from './audio';
import {
  BRUSHES, CRAYON_COLORS, STAMPS, STAMP_SIZES, brushDabs, brushSpacing, crayonSvg, hslToRgb, rgbCss, shadesOf, stampDots,
  type BrushKind, type RGB,
} from './brushes';
import { canvasToPng, composite, decodePng, encodePng, flattenOnWhite, loadImageData } from './images';
import {
  BRUSH_SIZES, PAGES, PAINT_SCALE, isBlank, newSketchPage, sketchPages, type AnyPage, type Mode,
} from './pages';
import type { RegionMap } from './regions';
import { labelRegions, regionAt, regionBoxes } from './regions';
import { Canvas2dRenderer } from './renderer/canvas2d';
import type { PageLayers, PaintRenderer, Snapshot } from './renderer/types';
import { createWebGpuRenderer } from './renderer/webgpu';
import { listPaint, listPaintIds, loadPaint, savePaint } from './storage';
import { vfx } from './vfx';

const MAX_UNDO = 10;
const SAVE_DELAY_MS = 600;
const SAVE_RETRY_MS = 3000;
const ERASER_RGB: RGB = [255, 255, 255];
/** Colors picked with the magic pen, newest first. */
const MAX_RECENT = 5;

// Touch tuning, sized for small fingers.
const LONG_PRESS_MS = 450;
const TAP_SLOP_PX = 12;
const SLIDE_TAP_PX = 40;
const CANCEL_STROKE_MS = 350;
const MAX_ZOOM = 8;
/** Press-and-hold zooms until the area under the finger fills about this much of the paper. */
const AREA_FILL = 0.5;
/** When already that close, each further hold zooms in this much more. */
const ZOOM_STEP = 1.6;
/** Fill taps snap to an area this many page pixels away (e.g. tapping an earring's outline). */
const FILL_REACH = 12;

type Tool = 'fill' | 'crayon' | 'stamp';
const isTool = (t: unknown): t is Tool => t === 'fill' || t === 'crayon' || t === 'stamp';

/** The child's choices, kept across visits and app updates (see prefs()). */
const PREFS_KEY = 'arias-world:color-prefs';

interface ColorPrefs {
  mode?: Mode;
  /** Last page id in each mode. */
  pages?: Partial<Record<Mode, string>>;
  /** Index in CRAYON_COLORS, or -1 for the magic pen's color. */
  crayon?: number;
  custom?: RGB;
  recent?: RGB[];
  brush?: BrushKind;
  stamp?: string;
  sizeIndex?: number;
  erasing?: boolean;
  tools?: Partial<Record<Mode, Tool>>;
}

/** Zoom and pan of the picture, to put it back after an update. */
export interface ViewState {
  zoom: number;
  tx: number;
  ty: number;
}

function readPrefs(): ColorPrefs {
  try {
    const v = localStorage.getItem(PREFS_KEY);
    return v ? (JSON.parse(v) as ColorPrefs) : {};
  } catch {
    return {};
  }
}

type Gesture =
  | { kind: 'none' }
  | { kind: 'lift' }
  | { kind: 'stroke'; id: number; started: number }
  | { kind: 'press'; id: number; x: number; y: number; timer: number; moved?: boolean }
  | { kind: 'pan'; id: number }
  | { kind: 'pinch'; dist: number; mid: { x: number; y: number }; zoom: number; tx: number; ty: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// Brush feel: the finger path is lightly smoothed, then drawn as curves through
// the midpoints of the smoothed points, with dots packed close together. That
// gives round, even lines instead of the corners a straight polyline shows.
/** Share of each new finger position taken (lower = smoother, but lags more). */
const STROKE_SMOOTHING = 0.55;
/** Dot spacing as a share of the brush radius. */
const DOT_SPACING = 0.12;

interface Stroke {
  region: number;
  /** Smoothed finger position (also the control point of the next curve). */
  px: number;
  py: number;
  /** Where the drawn curve ends so far. */
  mx: number;
  my: number;
  /** Latest raw finger position; the line runs to it when the finger lifts. */
  rx: number;
  ry: number;
  /** Distance travelled since the last dot. */
  carry: number;
  pending: number[];
  /** Where the rainbow brush is in the rainbow. */
  hue: number;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

export type RendererChoice = 'auto' | 'webgpu' | 'canvas';

export class ColoringApp {
  readonly sound = new Sound();

  private renderer!: PaintRenderer;
  private canvas: HTMLCanvasElement;
  private readonly layerCache = new Map<string, Promise<PageLayers>>();
  private layers: PageLayers | null = null;
  private mode: Mode = 'color';
  /** Page shown on screen (null until the first page opens). */
  private page: AnyPage | null = null;
  /** Last page opened in each mode, so switching modes returns to it. */
  private readonly lastPage: Record<Mode, number> = { color: 0, sketch: 0 };
  /** Sketch sheets; grows when the + tile adds one. Loaded from storage in init(). */
  private sketches: AnyPage[] = sketchPages([]);

  private crayon = 0;
  /** The magic pen's color (used when crayon is -1). */
  private custom: RGB = [0x27, 0xb8, 0xb0];
  private recent: RGB[] = [];
  private brush: BrushKind = 'crayon';
  private stamp = STAMPS[0].id;
  private sizeIndex = 1;
  private erasing = false;

  private readonly strokes = new Map<number, Stroke>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture = { kind: 'none' };
  private trail = { x: -1e4, y: -1e4 };
  private view = { zoom: 1, tx: 0, ty: 0 };
  /** Fill (tap an area) is the default for coloring pages; sketches use the crayon. */
  private tool: Tool = 'fill';
  private readonly toolFor: Record<Mode, Tool> = { color: 'fill', sketch: 'crayon' };
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  private frame = 0;
  private saveTimer = 0;
  private saving: Promise<void> = Promise.resolve();
  private unsaved = false;
  private switching: Promise<void> = Promise.resolve();
  private closeFinished: (() => void) | null = null;

  private readonly saved = readPrefs();

  constructor(private readonly choice: RendererChoice) {
    this.canvas = $<HTMLCanvasElement>('canvas');
    const p = this.saved;
    if (p.mode === 'color' || p.mode === 'sketch') this.mode = p.mode;
    if (Number.isInteger(p.crayon) && p.crayon! >= -1 && p.crayon! < CRAYON_COLORS.length) this.crayon = p.crayon!;
    const isRgb = (c: unknown): c is RGB => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
    if (isRgb(p.custom)) this.custom = p.custom;
    if (Array.isArray(p.recent)) this.recent = p.recent.filter(isRgb).slice(0, MAX_RECENT);
    if (BRUSHES.some((b) => b.id === p.brush)) this.brush = p.brush!;
    if (STAMPS.some((st) => st.id === p.stamp)) this.stamp = p.stamp!;
    if (Number.isInteger(p.sizeIndex) && p.sizeIndex! >= 0 && p.sizeIndex! < BRUSH_SIZES.length) this.sizeIndex = p.sizeIndex!;
    this.erasing = p.erasing === true;
    for (const m of ['color', 'sketch'] as const) {
      const t = p.tools?.[m];
      if (isTool(t) && !(m === 'sketch' && t === 'fill')) this.toolFor[m] = t;
    }
  }

  /** Mode the coloring screen is in (or will open in). */
  get currentMode(): Mode {
    return this.mode;
  }

  /** True while a finger is down on the picture (drawing, zooming or about to fill). */
  get busy(): boolean {
    return this.strokes.size > 0 || this.pointers.size > 0;
  }

  get viewState(): ViewState {
    return { ...this.view };
  }

  /** Puts back a saved zoom and pan (kept inside the paper as usual). */
  setViewState(v: ViewState): void {
    if (!this.layers || !(v.zoom > 1)) return;
    this.setView(clamp(v.zoom, 1, MAX_ZOOM), v.tx, v.ty, false);
  }

  /** Remembers the child's choices so the next visit (or an update) starts where they left off. */
  private savePrefs(): void {
    const pages: Partial<Record<Mode, string>> = { ...this.saved.pages };
    for (const m of ['color', 'sketch'] as const) {
      const id = this.pagesFor(m)[this.lastPage[m]]?.id;
      if (id) pages[m] = id;
    }
    const prefs: ColorPrefs = {
      mode: this.mode,
      pages,
      crayon: this.crayon,
      custom: this.custom,
      recent: this.recent,
      brush: this.brush,
      stamp: this.stamp,
      sizeIndex: this.sizeIndex,
      erasing: this.erasing,
      tools: { ...this.toolFor },
    };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage blocked (private mode): choices last for this visit only
    }
  }

  get rendererKind(): string {
    return this.renderer?.kind ?? 'none';
  }

  async init(): Promise<void> {
    this.renderer = await this.createRenderer(this.canvas);
    this.syncSketches(await listPaintIds());
    // Back to the page each mode was last on.
    for (const m of ['color', 'sketch'] as const) {
      const i = this.pagesFor(m).findIndex((pg) => pg.id === this.saved.pages?.[m]);
      if (i >= 0) this.lastPage[m] = i;
    }
    this.buildToolbar();
    this.buildCrayons();
    this.bindCanvas(this.canvas);
    new ResizeObserver(() => this.fitCanvas()).observe(this.canvas.parentElement!);

    // Safari may discard background tabs; make sure the last strokes land.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flushSave();
      else this.redraw();
    });
    window.addEventListener('pagehide', () => void this.flushSave());
    // Coming back from the back/forward cache, or after iOS dropped the canvas.
    window.addEventListener('pageshow', () => this.redraw());
  }

  // ---------------------------------------------------------------------------
  // Renderer
  // ---------------------------------------------------------------------------

  private async createRenderer(canvas: HTMLCanvasElement): Promise<PaintRenderer> {
    if (this.choice !== 'canvas') {
      try {
        const gpu = await createWebGpuRenderer(canvas, (reason) => void this.onGpuLost(reason));
        if (gpu) return gpu;
      } catch (e) {
        console.warn('[aria] WebGPU unavailable, using Canvas 2D', e);
      }
    }
    return new Canvas2dRenderer(canvas);
  }

  /** GPU gone (driver reset, memory pressure): continue on Canvas 2D from the last save. */
  private async onGpuLost(reason: string): Promise<void> {
    console.warn('[aria] WebGPU device lost:', reason);
    // A canvas can't switch context types, so swap in a fresh element.
    const fresh = this.canvas.cloneNode(false) as HTMLCanvasElement;
    fresh.style.cssText = this.canvas.style.cssText;
    this.canvas.replaceWith(fresh);
    this.canvas = fresh;
    this.bindCanvas(fresh);
    this.dropHistory();
    this.strokes.clear();
    this.renderer = new Canvas2dRenderer(fresh);
    if (this.layers) {
      this.renderer.setPage(this.layers, this.page ? await this.loadSavedPaint(this.page, this.layers) : null);
      this.schedule();
    }
  }

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------

  private loadLayers(page: AnyPage): Promise<PageLayers> {
    let p = this.layerCache.get(page.id);
    if (!p) {
      p = isBlank(page) ? Promise.resolve(blankLayers(page.blank.width, page.blank.height)) : (async () => {
        const [baseRaw, outline] = await Promise.all([loadImageData(page.base), loadImageData(page.outline)]);
        const base = flattenOnWhite(baseRaw);
        const regions = await labelRegions(base);
        return {
          pageWidth: base.width,
          pageHeight: base.height,
          paintWidth: base.width * PAINT_SCALE,
          paintHeight: base.height * PAINT_SCALE,
          base,
          outline,
          regions,
        };
      })();
      p.catch(() => this.layerCache.delete(page.id));
      this.layerCache.set(page.id, p);
    }
    return p;
  }

  /** Starts loading and labeling the first page early (during the start screen). */
  preload(): void {
    void this.loadLayers(PAGES[0]).catch(() => {});
  }

  private async loadSavedPaint(page: AnyPage, layers: PageLayers): Promise<ImageData | null> {
    try {
      const png = await loadPaint(page.id);
      return png ? await decodePng(png, layers.paintWidth, layers.paintHeight) : null;
    } catch (e) {
      console.warn('[aria] could not load saved picture', e);
      return null;
    }
  }

  private get pages(): AnyPage[] {
    return this.pagesFor(this.mode);
  }

  private pagesFor(mode: Mode): AnyPage[] {
    return mode === 'color' ? PAGES : this.sketches;
  }

  /** Adds sheets saved in storage to the sketch list, keeping the sheets already in it. */
  private syncSketches(savedIds: string[]): void {
    const known = new Map(this.sketches.map((p) => [p.id, p]));
    this.sketches = sketchPages([...known.keys(), ...savedIds]).map((p) => known.get(p.id) ?? p);
  }

  /**
   * The + tile: opens a fresh sheet. If the last sheet is still empty, go there
   * instead, so a row of taps doesn't pile up blank sheets.
   */
  addSketch(): Promise<void> {
    this.switching = this.switching.then(async () => {
      await this.flushSave();
      const last = this.sketches[this.sketches.length - 1];
      if (!(await loadPaint(last.id))) {
        if (last === this.page) this.nudgeThumb(last.id);
        else await this.doOpenPage(this.sketches.length - 1);
        return;
      }
      this.sketches.push(newSketchPage(this.sketches));
      this.renderPageNav();
      void this.refreshAllThumbnails();
      await this.doOpenPage(this.sketches.length - 1);
    });
    return this.switching;
  }

  /** Coloring pages or blank sketch sheets. Opens the last page used in that mode. */
  setMode(mode: Mode): Promise<void> {
    this.switching = this.switching.then(async () => {
      if (mode !== this.mode || !this.page) {
        this.mode = mode;
        document.body.dataset.mode = mode;
        this.setTool(this.toolFor[mode]);
        this.renderPageNav();
        void this.refreshAllThumbnails();
      }
    });
    return this.openPage(this.lastPage[mode]);
  }

  openPage(index: number): Promise<void> {
    // Serialize page switches so a fast double-tap can't interleave loads.
    this.switching = this.switching.then(() => this.doOpenPage(index));
    return this.switching;
  }

  private async doOpenPage(index: number): Promise<void> {
    const page = this.pages[index];
    if (!page || page === this.page) return;
    await this.flushSave();
    const layers = await this.loadLayers(page);
    const paint = await this.loadSavedPaint(page, layers);
    this.strokes.clear();
    this.dropHistory();
    this.page = page;
    this.lastPage[this.mode] = index;
    this.savePrefs();
    this.layers = layers;
    this.renderer.setPage(layers, paint);
    this.fitCanvas();
    this.updatePageNav();
    this.updateHistoryButtons();
    this.schedule();
  }

  /** "You're already here": a little wiggle on that page's thumbnail. */
  private nudgeThumb(id: string): void {
    const b = $<HTMLElement>('pages').querySelector<HTMLElement>(`.thumb[data-page="${id}"]`);
    if (!b) return;
    b.classList.remove('nudge');
    void b.offsetWidth; // restart the animation
    b.classList.add('nudge');
  }

  /** Largest size that fits the paper area, keeping the page's aspect ratio. */
  private fitCanvas(): void {
    const box = this.canvas.parentElement;
    if (!box || !this.layers) return;
    this.resetZoom();
    const { width, height } = box.getBoundingClientRect();
    const scale = Math.min(width / this.layers.pageWidth, height / this.layers.pageHeight);
    if (!(scale > 0)) return;
    this.canvas.style.width = `${Math.floor(this.layers.pageWidth * scale)}px`;
    this.canvas.style.height = `${Math.floor(this.layers.pageHeight * scale)}px`;
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private bindCanvas(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('lostpointercapture', (e) => this.onUp(e));
    // Stop iOS from showing the image callout or magnifier on long-press.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  private toPaint(e: { clientX: number; clientY: number }): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const l = this.layers!;
    return [
      ((e.clientX - rect.left) / rect.width) * l.paintWidth,
      ((e.clientY - rect.top) / rect.height) * l.paintHeight,
    ];
  }

  private get radius(): number {
    return BRUSH_SIZES[this.sizeIndex].radius;
  }

  /** The color being painted with. */
  private get rgb(): RGB {
    if (this.erasing) return ERASER_RGB;
    return this.crayon >= 0 ? CRAYON_COLORS[this.crayon].rgb : this.custom;
  }

  /** The eraser always rubs out with the plain round brush. */
  private get brushNow(): BrushKind {
    return this.erasing ? 'crayon' : this.brush;
  }

  // One finger: draw (Crayon) or tap to fill (Fill). Two fingers: pinch to zoom and pan.
  // Fill: press and hold zooms in on that spot; one-finger drag pans while zoomed.
  private onDown(e: PointerEvent): void {
    if (!this.layers || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      this.beginPinch();
      return;
    }
    if (this.pointers.size > 2 || this.gesture.kind !== 'none') return;

    if (this.tool === 'fill' || this.tool === 'stamp') {
      const timer = window.setTimeout(() => this.onLongPress(e.pointerId), LONG_PRESS_MS);
      this.gesture = { kind: 'press', id: e.pointerId, x: e.clientX, y: e.clientY, timer };
      return;
    }
    const [x, y] = this.toPaint(e);
    // Like the Unity version, a stroke only colors the region it started in.
    const region = regionAt(this.layers.regions, x / PAINT_SCALE, y / PAINT_SCALE);
    if (!region) return;
    this.pushUndo();
    this.strokes.set(e.pointerId, {
      region, px: x, py: y, mx: x, my: y, rx: x, ry: y, carry: 0, pending: [x, y], hue: Math.random() * 360,
    });
    this.gesture = { kind: 'stroke', id: e.pointerId, started: performance.now() };
    this.schedule();
  }

  private onMove(e: PointerEvent): void {
    const pt = this.pointers.get(e.pointerId);
    if (!pt) return;
    e.preventDefault();
    const prev = { ...pt };
    pt.x = e.clientX;
    pt.y = e.clientY;
    const g = this.gesture;

    if (g.kind === 'pinch') {
      this.updatePinch();
    } else if (g.kind === 'press' && g.id === e.pointerId) {
      if (Math.hypot(pt.x - g.x, pt.y - g.y) > TAP_SLOP_PX) {
        clearTimeout(g.timer);
        // Dragging while zoomed moves the picture; otherwise it's still a (sloppy) tap.
        this.gesture = this.view.zoom > 1 ? { kind: 'pan', id: e.pointerId } : { ...g, timer: 0, moved: true };
      }
    } else if (g.kind === 'pan' && g.id === e.pointerId) {
      this.panBy(pt.x - prev.x, pt.y - prev.y);
    } else if (g.kind === 'stroke' && g.id === e.pointerId) {
      const stroke = this.strokes.get(e.pointerId);
      if (!stroke) return;
      // Safari doesn't support getCoalescedEvents everywhere; fall back to the event itself.
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ev of events.length ? events : [e]) this.extend(stroke, ...this.toPaint(ev));
      this.schedule();
      // A light sparkle trail behind the crayon.
      if (!this.erasing && Math.hypot(e.clientX - this.trail.x, e.clientY - this.trail.y) > 28) {
        this.trail = { x: e.clientX, y: e.clientY };
        vfx.sparkle(e.clientX, e.clientY, this.brushNow === 'rainbow' ? rgbCss(hslToRgb(stroke.hue, 0.85, 0.55)) : rgbCss(this.rgb));
      }
    }
  }

  private onUp(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    const g = this.gesture;
    if (g.kind === 'press' && g.id === e.pointerId) {
      clearTimeout(g.timer);
      // A tap, or a small slide: kids rarely hold perfectly still.
      if (!g.moved || Math.hypot(e.clientX - g.x, e.clientY - g.y) < SLIDE_TAP_PX) {
        if (this.tool === 'stamp') this.stampAt(g.x, g.y);
        else this.fillAt(g.x, g.y);
      }
      this.gesture = { kind: 'none' };
    } else if (g.kind === 'stroke' && g.id === e.pointerId) {
      this.endStroke(e.pointerId);
      this.gesture = { kind: 'none' };
    } else if (g.kind === 'pan' && g.id === e.pointerId) {
      this.gesture = { kind: 'none' };
    } else if (g.kind === 'pinch') {
      // Ignore the finger still down so it doesn't start drawing or filling.
      this.gesture = { kind: 'lift' };
    }
    if (this.pointers.size === 0) this.gesture = { kind: 'none' };
  }

  private endStroke(id: number): void {
    const stroke = this.strokes.get(id);
    if (!stroke) return;
    this.curve(stroke, stroke.px, stroke.py, stroke.rx, stroke.ry);
    this.flushStroke(stroke);
    this.strokes.delete(id);
    this.renderer.present();
    this.scheduleSave();
  }

  // ---------------------------------------------------------------------------
  // Fill tool
  // ---------------------------------------------------------------------------

  private fillAt(clientX: number, clientY: number): void {
    if (!this.layers) return;
    const [x, y] = this.toPaint({ clientX, clientY });
    const region = regionAt(this.layers.regions, x / PAINT_SCALE, y / PAINT_SCALE, FILL_REACH);
    if (!region) return;
    this.pushUndo();
    const rgb = this.rgb;
    this.renderer.fill(region, rgb, this.erasing);
    this.sound.playPop();
    // Splash: a ring where the paint lands and a few droplets.
    const css = this.erasing ? '#ffffff' : `rgb(${rgb.join(',')})`;
    vfx.ring(clientX, clientY, this.erasing ? '#d9c2ca' : css, 80);
    vfx.burst(clientX, clientY, { count: 10, colors: [css, '#ffffff'], speed: 230, size: 6, gravity: 700, life: 0.6 });
    this.unsaved = true;
    this.schedule();
    this.scheduleSave();
  }

  // ---------------------------------------------------------------------------
  // Stamp tool
  // ---------------------------------------------------------------------------

  /** Stamps the chosen shape where the finger tapped, inside that area like the crayon. */
  private stampAt(clientX: number, clientY: number): void {
    if (!this.layers) return;
    const [x, y] = this.toPaint({ clientX, clientY });
    const region = regionAt(this.layers.regions, x / PAINT_SCALE, y / PAINT_SCALE, FILL_REACH);
    if (!region) return;
    const def = STAMPS.find((st) => st.id === this.stamp) ?? STAMPS[0];
    const { points, radius } = stampDots(def, STAMP_SIZES[this.sizeIndex]);
    const at = new Float32Array(points.length);
    for (let i = 0; i < points.length; i += 2) {
      at[i] = points[i] + x;
      at[i + 1] = points[i + 1] + y;
    }
    this.pushUndo();
    const rgb = this.rgb;
    this.renderer.stamp({ points: at, region, rgb, radius, erase: this.erasing });
    this.sound.playPop();
    const css = this.erasing ? '#d9c2ca' : rgbCss(rgb);
    vfx.burst(clientX, clientY, { count: 12, colors: [css, '#ffffff', '#ffd84a'], speed: 260, size: 6, gravity: 500, life: 0.6 });
    this.unsaved = true;
    this.schedule();
    this.scheduleSave();
  }

  private onLongPress(id: number): void {
    const g = this.gesture;
    if (g.kind !== 'press' || g.id !== id || g.moved) return;
    // Hold on a spot: zoom in on the area under the finger. Every hold zooms in
    // (never out), so holding again on a tiny area gets closer still; the big
    // zoom-out button goes back.
    this.zoomToArea(g.x, g.y);
    this.gesture = { kind: 'pan', id };
  }

  /** Zooms so the fillable area under a point fills about half the paper, centered. */
  private zoomToArea(clientX: number, clientY: number): void {
    const layers = this.layers;
    if (!layers) return;
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const origin = this.layoutOrigin();
    const v = this.view;
    // The point in unzoomed canvas CSS pixels.
    let cx = (clientX - origin.x - v.tx) / v.zoom, cy = (clientY - origin.y - v.ty) / v.zoom;
    const cssPerPage = this.canvas.offsetWidth / layers.pageWidth;

    let zoom = 0;
    const [x, y] = this.toPaint({ clientX, clientY });
    const region = regionAt(layers.regions, x / PAINT_SCALE, y / PAINT_SCALE, FILL_REACH);
    if (region) {
      const b = regionBoxes(layers.regions);
      const w = (b[region * 4 + 2] - b[region * 4] + 1) * cssPerPage;
      const h = (b[region * 4 + 3] - b[region * 4 + 1] + 1) * cssPerPage;
      zoom = Math.min((box.width * AREA_FILL) / w, (box.height * AREA_FILL) / h);
      if (zoom > v.zoom * 1.15) {
        // Center the area itself, so the whole of a small spot comes into view.
        cx = ((b[region * 4] + b[region * 4 + 2] + 1) / 2) * cssPerPage;
        cy = ((b[region * 4 + 1] + b[region * 4 + 3] + 1) / 2) * cssPerPage;
      }
    }
    // Big areas (or already this close): step in a bit around the finger.
    if (!(zoom > v.zoom * 1.15)) zoom = v.zoom * ZOOM_STEP;
    const z = clamp(zoom, 1, MAX_ZOOM);
    this.setView(z, box.left + box.width / 2 - origin.x - z * cx, box.top + box.height / 2 - origin.y - z * cy, true);
    this.sound.playPop();
    vfx.ring(clientX, clientY, '#5a8ee7', 60);
  }

  // ---------------------------------------------------------------------------
  // Zoom and pan (CSS transform on the canvas; toPaint() already accounts for it)
  // ---------------------------------------------------------------------------

  private beginPinch(): void {
    const g = this.gesture;
    if (g.kind === 'press') clearTimeout(g.timer);
    if (g.kind === 'stroke') {
      // A second finger right after the first means "zoom", not "draw": take back the dot.
      if (performance.now() - g.started < CANCEL_STROKE_MS) {
        this.strokes.delete(g.id);
        this.undoLast();
      } else {
        this.endStroke(g.id);
      }
    }
    const [a, b] = [...this.pointers.values()];
    this.gesture = {
      kind: 'pinch',
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: this.view.zoom,
      tx: this.view.tx,
      ty: this.view.ty,
    };
  }

  private updatePinch(): void {
    const g = this.gesture;
    if (g.kind !== 'pinch' || this.pointers.size < 2) return;
    const [a, b] = [...this.pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = clamp(g.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist), 1, MAX_ZOOM);
    // Keep the picture point that was under the fingers' midpoint under it.
    const origin = this.layoutOrigin();
    const cx = (g.mid.x - origin.x - g.tx) / g.zoom, cy = (g.mid.y - origin.y - g.ty) / g.zoom;
    this.setView(zoom, mid.x - origin.x - zoom * cx, mid.y - origin.y - zoom * cy, false);
  }

  private panBy(dx: number, dy: number): void {
    this.setView(this.view.zoom, this.view.tx + dx, this.view.ty + dy, false);
  }

  resetZoom(animate = false): void {
    this.setView(1, 0, 0, animate);
  }

  /** Where the canvas's top-left would be with no zoom or pan. */
  private layoutOrigin(): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left - this.view.tx, y: r.top - this.view.ty };
  }

  private setView(zoom: number, tx: number, ty: number, animate: boolean): void {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const origin = this.layoutOrigin();
    // Keep the zoomed picture covering the paper area (no dragging it off into empty
    // space); if it's smaller than the paper on an axis, center it on that axis.
    const fit = (t: number, o: number, size: number, b0: number, bSize: number) =>
      size >= bSize ? clamp(t, b0 + bSize - size - o, b0 - o) : b0 + (bSize - size) / 2 - o;
    if (zoom <= 1) {
      zoom = 1;
      tx = ty = 0;
    } else {
      tx = fit(tx, origin.x, this.canvas.offsetWidth * zoom, box.left, box.width);
      ty = fit(ty, origin.y, this.canvas.offsetHeight * zoom, box.top, box.height);
    }
    this.view = { zoom, tx, ty };
    this.canvas.classList.toggle('zoom-anim', animate);
    this.canvas.style.transform = zoom === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${zoom})`;
    $<HTMLButtonElement>('zoom-out').hidden = zoom === 1;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.layers) return;
    e.preventDefault();
    const zoom = this.view.zoom * Math.exp(-e.deltaY * 0.0015);
    const origin = this.layoutOrigin();
    const v = this.view;
    const cx = (e.clientX - origin.x - v.tx) / v.zoom, cy = (e.clientY - origin.y - v.ty) / v.zoom;
    const z = clamp(zoom, 1, MAX_ZOOM);
    this.setView(z, e.clientX - origin.x - z * cx, e.clientY - origin.y - z * cy, false);
  }

  /** Feeds one finger position into a stroke. */
  private extend(s: Stroke, x: number, y: number): void {
    s.rx = x;
    s.ry = y;
    const nx = s.px + (x - s.px) * STROKE_SMOOTHING, ny = s.py + (y - s.py) * STROKE_SMOOTHING;
    if (Math.hypot(nx - s.px, ny - s.py) < 0.5) return;
    // Curve from the last midpoint to the next one, bending through the smoothed point.
    const mx = (s.px + nx) / 2, my = (s.py + ny) / 2;
    this.curve(s, s.px, s.py, mx, my);
    s.px = nx;
    s.py = ny;
  }

  /**
   * Adds evenly spaced dots along the quadratic curve from the stroke's end
   * (s.mx, s.my) to (ex, ey), bending toward (bx, by), and moves the end there.
   */
  private curve(s: Stroke, bx: number, by: number, ex: number, ey: number): void {
    const spacing = Math.max(0.75, this.radius * (this.brushNow === 'crayon' ? DOT_SPACING : brushSpacing(this.brushNow)));
    const ax = s.mx, ay = s.my;
    const n = Math.max(1, Math.ceil((Math.hypot(bx - ax, by - ay) + Math.hypot(ex - bx, ey - by)) / spacing));
    let x = ax, y = ay;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const qx = u * u * ax + 2 * u * t * bx + t * t * ex;
      const qy = u * u * ay + 2 * u * t * by + t * t * ey;
      let seg = Math.hypot(qx - x, qy - y);
      while (s.carry + seg >= spacing) {
        const k = (spacing - s.carry) / seg;
        x += (qx - x) * k;
        y += (qy - y) * k;
        seg -= spacing - s.carry;
        s.carry = 0;
        s.pending.push(x, y);
      }
      s.carry += seg;
      x = qx;
      y = qy;
    }
    s.mx = ex;
    s.my = ey;
  }

  private flushStroke(s: Stroke): void {
    if (!s.pending.length) return;
    const { dabs, hue } = brushDabs(this.brushNow, s.pending, this.radius, this.rgb, s.hue);
    for (const d of dabs) {
      this.renderer.stamp({ points: new Float32Array(d.points), region: s.region, rgb: d.rgb, radius: d.radius, erase: this.erasing });
    }
    s.hue = hue;
    s.pending = [];
    this.unsaved = true;
  }

  /** Repaints the canvas from the paint layer, e.g. after returning to the tab. */
  redraw(): void {
    this.renderer?.invalidate();
    this.schedule();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      for (const s of this.strokes.values()) this.flushStroke(s);
      this.renderer.present();
    });
  }

  // ---------------------------------------------------------------------------
  // Undo / redo / clear
  // ---------------------------------------------------------------------------

  private pushUndo(): void {
    this.undoStack.push(this.renderer.snapshot());
    while (this.undoStack.length > MAX_UNDO) this.undoStack.shift()!.release();
    for (const s of this.redoStack) s.release();
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  /** Drops the newest change without offering it for redo (an accidental dot). */
  private undoLast(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.renderer.restore(s);
    s.release();
    this.updateHistoryButtons();
    this.schedule();
  }

  private undo(): void {
    this.step(this.undoStack, this.redoStack);
  }

  private redo(): void {
    this.step(this.redoStack, this.undoStack);
  }

  private step(from: Snapshot[], to: Snapshot[]): void {
    if (!from.length || this.strokes.size) return;
    to.push(this.renderer.snapshot());
    const s = from.pop()!;
    this.renderer.restore(s);
    s.release();
    this.unsaved = true;
    this.updateHistoryButtons();
    this.schedule();
    this.scheduleSave();
  }

  private clearPage(): void {
    if (this.strokes.size) return;
    this.pushUndo();
    this.renderer.clear();
    this.unsaved = true;
    this.schedule();
    this.scheduleSave();
  }

  private dropHistory(): void {
    for (const s of this.undoStack) s.release();
    for (const s of this.redoStack) s.release();
    this.undoStack = [];
    this.redoStack = [];
  }

  private updateHistoryButtons(): void {
    $<HTMLButtonElement>('undo').disabled = !this.undoStack.length;
    $<HTMLButtonElement>('redo').disabled = !this.redoStack.length;
  }

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flushSave(), SAVE_DELAY_MS);
  }

  /** Writes the current page's paint to storage if it changed. */
  flushSave(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (!this.unsaved || !this.layers || !this.page) return this.saving;
    this.unsaved = false;
    const page = this.page;
    const renderer = this.renderer;
    this.saving = this.saving.then(async () => {
      try {
        const paint = await renderer.readPaint();
        await savePaint(page.id, await encodePng(paint));
        void this.refreshThumbnail(page, paint);
      } catch (e) {
        console.error('[aria] save failed', e);
        this.unsaved = true;
        this.saveTimer = window.setTimeout(() => void this.flushSave(), SAVE_RETRY_MS);
      }
    });
    return this.saving;
  }

  /** Shows the finished picture with Share / Download options. */
  private async showFinished(): Promise<void> {
    if (!this.layers || !this.page) return;
    const layers = this.layers;
    const page = this.page;
    const paint = await this.renderer.readPaint();
    const picture = composite(layers.base, paint, layers.outline, layers.paintWidth, layers.paintHeight);
    const blob = await canvasToPng(picture);
    this.closeFinished?.();
    const url = URL.createObjectURL(blob);
    const fileName = `arias-world-${page.id}.png`;

    const dialog = $<HTMLDivElement>('finished');
    $<HTMLImageElement>('finished-image').src = url;
    const download = $<HTMLAnchorElement>('finished-download');
    download.href = url;
    download.download = fileName;

    // Web Share with files: on iPad this offers "Save Image" to Photos.
    const share = $<HTMLButtonElement>('finished-share');
    const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
    const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    share.hidden = !canShare;
    share.onclick = () => {
      // Called straight from the tap, so Safari keeps the user activation.
      navigator.share({ files: [file!], title: "Aria's World" }).catch(() => {});
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const close = () => {
      dialog.hidden = true;
      URL.revokeObjectURL(url);
      document.removeEventListener('keydown', onKey);
      this.closeFinished = null;
    };
    document.addEventListener('keydown', onKey);
    this.closeFinished = close;
    $<HTMLButtonElement>('finished-close').onclick = close;
    dialog.onclick = (e) => {
      if (e.target === dialog) close();
    };
    dialog.hidden = false;
    $<HTMLButtonElement>('finished-close').focus();
    vfx.confetti(50);
  }

  // ---------------------------------------------------------------------------
  // Gallery
  // ---------------------------------------------------------------------------

  /**
   * Every picture with some paint on it, newest first, as thumbnails `width` px wide.
   * Yields one at a time so the gallery can show them as they're ready.
   */
  async *pictures(width: number): AsyncGenerator<GalleryPicture> {
    await this.flushSave();
    const all = await listPaint();
    // The gallery can open before init(), so it may be the first to see added sheets.
    this.syncSketches(all.map((s) => s.pageId));
    for (const saved of all) {
      const found = this.findPage(saved.pageId);
      if (!found) continue;
      try {
        const layers = await this.loadLayers(found.page);
        const paint = await decodePng(saved.png, layers.paintWidth, layers.paintHeight);
        if (!hasPaint(paint)) continue;
        const height = Math.round((width * layers.pageHeight) / layers.pageWidth);
        yield { ...found, updated: saved.updated, thumb: composite(layers.base, paint, layers.outline, width, height) };
      } catch (e) {
        console.warn('[aria] could not show a saved picture', saved.pageId, e);
      }
    }
  }

  /** A saved picture at full size, as PNG (for saving to Photos or downloading). */
  async picturePng(pageId: string): Promise<Blob | null> {
    const found = this.findPage(pageId);
    if (!found) return null;
    await this.flushSave();
    const layers = await this.loadLayers(found.page);
    const paint = await this.loadSavedPaint(found.page, layers);
    return canvasToPng(composite(layers.base, paint, layers.outline, layers.paintWidth, layers.paintHeight));
  }

  /** Opens a page in its own mode (from the gallery). */
  showPage(pageId: string): Promise<void> {
    const found = this.findPage(pageId);
    if (!found) return Promise.resolve();
    this.lastPage[found.mode] = found.index;
    return this.setMode(found.mode);
  }

  private findPage(pageId: string): { page: AnyPage; mode: Mode; index: number } | null {
    for (const mode of ['color', 'sketch'] as const) {
      const pages = this.pagesFor(mode);
      const index = pages.findIndex((p) => p.id === pageId);
      if (index >= 0) return { page: pages[index], mode, index };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  private buildToolbar(): void {
    const tap = (id: string, fn: () => void) =>
      $<HTMLButtonElement>(id).addEventListener('click', () => {
        this.sound.playPop();
        fn();
      });
    tap('undo', () => this.undo());
    tap('redo', () => this.redo());
    tap('clear', () => this.clearPage());
    tap('finish', () => void this.showFinished());
    tap('zoom-out', () => this.resetZoom(true));
    tap('tool-fill', () => this.setTool('fill'));
    tap('tool-crayon', () => this.setTool('crayon'));
    tap('tool-stamp', () => this.setTool('stamp'));
    const music = $<HTMLButtonElement>('music');
    const syncMusic = () => music.setAttribute('aria-pressed', String(this.sound.music));
    music.addEventListener('click', () => {
      this.sound.setMusic(!this.sound.music);
      syncMusic();
    });
    syncMusic();
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.toolFor[this.mode] = tool;
    document.body.dataset.tool = tool;
    this.savePrefs();
    $<HTMLButtonElement>('tool-fill').setAttribute('aria-pressed', String(tool === 'fill'));
    $<HTMLButtonElement>('tool-crayon').setAttribute('aria-pressed', String(tool === 'crayon'));
    $<HTMLButtonElement>('tool-stamp').setAttribute('aria-pressed', String(tool === 'stamp'));
  }

  private buildCrayons(): void {
    const box = $<HTMLDivElement>('crayons');
    const tools = box.closest<HTMLElement>('.tools')!;
    const eraser = $<HTMLButtonElement>('eraser');
    const pen = $<HTMLButtonElement>('wheel-open');
    const buttons: HTMLButtonElement[] = [];
    const pop = (fn: () => void) => () => {
      this.sound.playPop();
      fn();
    };

    // Shows the chosen color everywhere: brush and stamp pictures, the magic pen.
    const show = () => {
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(!this.erasing && j === this.crayon)));
      eraser.setAttribute('aria-pressed', String(this.erasing));
      pen.setAttribute('aria-pressed', String(!this.erasing && this.crayon < 0));
      const c = this.erasing ? '#c9b3bb' : rgbCss(this.erasing ? ERASER_RGB : this.rgb);
      tools.style.setProperty('--pen', c);
      $('wheel-pen').style.setProperty('--custom', rgbCss(this.custom));
      this.renderRecent(show);
      this.savePrefs();
    };
    this.showColor = show;

    CRAYON_COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'crayon';
      b.setAttribute('aria-label', c.name);
      b.innerHTML = crayonSvg(c.rgb);
      b.addEventListener('click', pop(() => {
        this.erasing = false;
        this.crayon = i;
        show();
      }));
      box.appendChild(b);
      buttons.push(b);
    });
    eraser.addEventListener('click', pop(() => {
      this.erasing = true;
      show();
    }));
    pen.addEventListener('click', pop(() => {
      this.openWheel();
      this.erasing = false;
      this.crayon = -1;
      show();
    }));

    // Brushes and stamps: tapping one also switches to that tool.
    const brushBox = $<HTMLDivElement>('brushes');
    const brushButtons = BRUSHES.map((def) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'brush';
      b.setAttribute('aria-label', def.name);
      b.innerHTML = `<svg viewBox="0 0 60 44" aria-hidden="true">${def.icon}</svg>`;
      b.addEventListener('click', pop(() => {
        this.brush = def.id;
        this.setTool('crayon');
        syncBrushes();
      }));
      brushBox.appendChild(b);
      return b;
    });
    const stampBox = $<HTMLDivElement>('stamps');
    const stampButtons = STAMPS.map((def) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'brush stamp';
      b.setAttribute('aria-label', `${def.name} stamp`);
      b.innerHTML = `<svg viewBox="-4 -4 108 108" aria-hidden="true"><path d="${def.d}" fill="currentColor" fill-rule="${def.id === 'smile' ? 'evenodd' : 'nonzero'}"/></svg>`;
      b.addEventListener('click', pop(() => {
        this.stamp = def.id;
        this.setTool('stamp');
        syncBrushes();
      }));
      stampBox.appendChild(b);
      return b;
    });
    const syncBrushes = () => {
      brushButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(BRUSHES[i].id === this.brush)));
      stampButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(STAMPS[i].id === this.stamp)));
      this.savePrefs();
    };
    syncBrushes();
    // The magic pen sits in the crayon box, in the spot after the last crayon.
    box.appendChild(pen);
    this.buildWheel();
    show();

    const sizes = $<HTMLDivElement>('sizes');
    const sizeButtons = BRUSH_SIZES.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'size';
      b.setAttribute('aria-label', `${s.name} brush`);
      b.style.setProperty('--dot', `${8 + i * 7}px`);
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.sizeIndex = i;
        if (this.tool === 'fill') this.setTool('crayon');
        this.savePrefs();
        sizeButtons.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
      });
      sizes.appendChild(b);
      return b;
    });
    sizeButtons.forEach((x, j) => x.setAttribute('aria-pressed', String(j === this.sizeIndex)));
  }

  /** Set by buildCrayons(): refreshes everything that shows the chosen color. */
  private showColor: () => void = () => {};

  /** The magic pen's last few colors, as dots beside it. */
  private renderRecent(show: () => void): void {
    const row = $<HTMLDivElement>('more-colors');
    row.querySelectorAll('.recent').forEach((el) => el.remove());
    this.recent.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'recent';
      b.setAttribute('aria-label', 'A color you picked');
      b.style.setProperty('--dot', rgbCss(c));
      const same = !this.erasing && this.crayon < 0 && c.every((v, k) => v === this.custom[k]);
      b.setAttribute('aria-pressed', String(same));
      b.addEventListener('click', () => {
        this.sound.playPop();
        this.erasing = false;
        this.crayon = -1;
        this.custom = [...c];
        show();
      });
      row.appendChild(b);
    });
  }

  private buildWheel(): void {
    const pop = $<HTMLDivElement>('wheel');
    const disc = $<HTMLDivElement>('wheel-disc');
    const knob = $<HTMLSpanElement>('wheel-knob');
    const shades = $<HTMLDivElement>('wheel-shades');
    let hue = 180, sat = 1, active = -1;

    const pick = (c: RGB) => {
      this.erasing = false;
      this.crayon = -1;
      this.custom = c;
      knob.style.background = rgbCss(c);
      this.showColor();
    };
    const renderShades = () => {
      shades.replaceChildren();
      for (const c of shadesOf(hue, sat)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'recent';
        b.setAttribute('aria-label', 'Shade');
        b.style.setProperty('--dot', rgbCss(c));
        b.addEventListener('click', () => {
          this.sound.playPop();
          pick(c);
          this.remember(c);
        });
        shades.appendChild(b);
      }
    };
    // The wheel: hue around the circle, white in the middle, full color at the rim.
    const at = (e: PointerEvent) => {
      const r = disc.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const rad = r.width / 2;
      const t = Math.min(1, Math.hypot(dx, dy) / rad);
      hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      sat = t;
      const full = hslToRgb(hue, 1, 0.5);
      // The knob stays on the wheel even when the finger slides off its edge.
      const k = Math.min(1, rad / Math.max(1, Math.hypot(dx, dy)));
      knob.style.left = `${50 + (dx * k * 50) / rad}%`;
      knob.style.top = `${50 + (dy * k * 50) / rad}%`;
      pick(full.map((v) => Math.round(v * t + 255 * (1 - t))) as RGB);
      renderShades();
    };
    disc.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = e.pointerId;
      disc.setPointerCapture(e.pointerId);
      at(e);
    });
    disc.addEventListener('pointermove', (e) => {
      if (e.pointerId === active) at(e);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = -1;
      this.sound.playPop();
      this.remember(this.custom);
    };
    disc.addEventListener('pointerup', up);
    disc.addEventListener('pointercancel', up);
    const close = () => {
      pop.hidden = true;
    };
    $<HTMLButtonElement>('wheel-done').addEventListener('click', () => {
      this.sound.playPop();
      close();
    });
    pop.addEventListener('click', (e) => {
      if (e.target === pop) close();
    });
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    this.openWheel = () => {
      knob.style.background = rgbCss(this.custom);
      renderShades();
      pop.hidden = false;
      $<HTMLButtonElement>('wheel-done').focus();
    };
  }

  /** Set by buildWheel(). */
  private openWheel: () => void = () => {};

  /** Keeps a magic-pen color among the recent dots. */
  private remember(c: RGB): void {
    this.recent = [c, ...this.recent.filter((x) => !x.every((v, k) => v === c[k]))].slice(0, MAX_RECENT);
    this.showColor();
  }

  /** Thumbnails for the current mode's pages. */
  private renderPageNav(): void {
    const nav = $<HTMLElement>('pages');
    nav.replaceChildren();
    this.pages.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'thumb';
      b.dataset.page = p.id;
      b.setAttribute('aria-label', p.title);
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.src = isBlank(p) ? blankThumb() : p.base;
      b.appendChild(img);
      b.addEventListener('click', () => {
        this.sound.playPop();
        void this.openPage(i);
      });
      nav.appendChild(b);
    });
    if (this.mode === 'sketch') {
      const add = document.createElement('button');
      add.className = 'thumb add-sheet';
      add.type = 'button';
      add.setAttribute('aria-label', 'New drawing');
      add.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>';
      add.addEventListener('click', () => {
        this.sound.playPop();
        void this.addSketch();
      });
      nav.appendChild(add);
    }
  }

  private updatePageNav(): void {
    $<HTMLElement>('pages').querySelectorAll<HTMLElement>('.thumb[data-page]').forEach((b) => {
      const current = b.dataset.page === this.page?.id;
      b.setAttribute('aria-current', String(current));
      // With many sheets the strip scrolls; keep the open one in view.
      if (current) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  private async refreshThumbnail(page: AnyPage, paint?: ImageData): Promise<void> {
    const layers = await this.loadLayers(page);
    const p = paint ?? (await this.loadSavedPaint(page, layers));
    if (!p) return;
    const c = composite(layers.base, p, layers.outline, 160, Math.round((160 * layers.pageHeight) / layers.pageWidth));
    // The thumbnail may be gone if the mode changed while saving.
    const img = $<HTMLElement>('pages').querySelector<HTMLImageElement>(`.thumb[data-page="${page.id}"] img`);
    if (img) img.src = c.toDataURL('image/png');
  }

  private async refreshAllThumbnails(): Promise<void> {
    for (const page of this.pages) await this.refreshThumbnail(page).catch(() => {});
  }
}

export interface GalleryPicture {
  page: AnyPage;
  mode: Mode;
  index: number;
  updated: number;
  thumb: HTMLCanvasElement;
}

/** True if any pixel of the paint layer has been colored. */
function hasPaint(paint: ImageData): boolean {
  const px = new Uint32Array(paint.data.buffer, paint.data.byteOffset, paint.data.byteLength >> 2);
  for (let i = 0; i < px.length; i++) if (px[i] >>> 24) return true;
  return false;
}

/** Layers for an empty sheet: white paper, no line art, one region covering everything. */
function blankLayers(width: number, height: number): PageLayers {
  const base = new ImageData(width, height);
  base.data.fill(255);
  const regions: RegionMap = { width, height, labels: new Uint32Array(width * height).fill(1), count: 1 };
  return {
    pageWidth: width,
    pageHeight: height,
    paintWidth: width * PAINT_SCALE,
    paintHeight: height * PAINT_SCALE,
    base,
    outline: new ImageData(width, height),
    regions,
  };
}

let blankThumbUrl = '';
function blankThumb(): string {
  if (!blankThumbUrl) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 8, 8);
    blankThumbUrl = c.toDataURL('image/png');
  }
  return blankThumbUrl;
}
