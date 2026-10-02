import { regionBoxes } from '../regions';
import { brushAlpha, type PageLayers, type PaintRenderer, type Snapshot, type StampBatch } from './types';

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return ctx;
}

function imageCanvas(img: ImageData): HTMLCanvasElement {
  const c = makeCanvas(img.width, img.height);
  ctx2d(c).putImageData(img, 0, 0);
  return c;
}

/** Keep this many region masks; older ones are rebuilt on demand. */
const MAX_MASKS = 16;

interface RegionMask {
  canvas: HTMLCanvasElement;
  /** Top-left of the mask, in page pixels. */
  x: number;
  y: number;
}

class CanvasSnapshot implements Snapshot {
  constructor(public canvas: HTMLCanvasElement | null) {}
  release(): void {
    // Shrinking to 0×0 frees the backing store right away; iOS Safari has a
    // tight total canvas memory budget.
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = null;
  }
}

/**
 * Fallback renderer for browsers without WebGPU (Safari before 26, older
 * iPads). Same layers and brush as the WebGPU path, done with Canvas 2D
 * compositing: stamps go to a scratch canvas, get clipped with the region
 * mask via `destination-in`, then merge into the paint layer.
 */
export class Canvas2dRenderer implements PaintRenderer {
  readonly kind = 'canvas2d' as const;

  private readonly display: CanvasRenderingContext2D;
  private layers: PageLayers | null = null;
  private base: HTMLCanvasElement | null = null;
  private outline: HTMLCanvasElement | null = null;
  private paint = makeCanvas(1, 1);
  private scratch = makeCanvas(1, 1);
  private masks = new Map<number, RegionMask>();
  private brushes = new Map<string, HTMLCanvasElement>();
  private dirty = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.display = ctx2d(canvas);
  }

  setPage(layers: PageLayers, paint: ImageData | null): void {
    const { paintWidth: w, paintHeight: h } = layers;
    this.layers = layers;
    this.base = imageCanvas(layers.base);
    this.outline = imageCanvas(layers.outline);
    this.dropMasks();
    if (this.paint.width !== w || this.paint.height !== h) {
      this.paint = makeCanvas(w, h);
      this.scratch = makeCanvas(w, h);
    }
    const p = ctx2d(this.paint);
    p.clearRect(0, 0, w, h);
    if (paint && paint.width === w && paint.height === h) p.putImageData(paint, 0, 0);
    this.canvas.width = w;
    this.canvas.height = h;
    this.dirty = true;
  }

  stamp(b: StampBatch): void {
    const layers = this.layers;
    if (!layers || b.points.length < 2) return;
    const scale = layers.paintWidth / layers.pageWidth;
    const r = b.radius;

    // Bounding box of this batch, snapped to whole mask pixels.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < b.points.length; i += 2) {
      x0 = Math.min(x0, b.points[i]); x1 = Math.max(x1, b.points[i]);
      y0 = Math.min(y0, b.points[i + 1]); y1 = Math.max(y1, b.points[i + 1]);
    }
    const mx0 = Math.max(0, Math.floor((x0 - r - 1) / scale));
    const my0 = Math.max(0, Math.floor((y0 - r - 1) / scale));
    const mx1 = Math.min(layers.pageWidth, Math.ceil((x1 + r + 1) / scale));
    const my1 = Math.min(layers.pageHeight, Math.ceil((y1 + r + 1) / scale));
    if (mx1 <= mx0 || my1 <= my0) return;
    const bx = mx0 * scale, by = my0 * scale, bw = (mx1 - mx0) * scale, bh = (my1 - my0) * scale;

    const s = ctx2d(this.scratch);
    s.save();
    s.beginPath();
    s.rect(bx, by, bw, bh);
    s.clip();
    s.clearRect(bx, by, bw, bh);
    const brush = this.brush(b.rgb, r);
    for (let i = 0; i < b.points.length; i += 2) {
      s.drawImage(brush, b.points[i] - r, b.points[i + 1] - r);
    }
    s.globalCompositeOperation = 'destination-in';
    s.imageSmoothingEnabled = false;
    // The mask only covers its region's bounding box; everything else inside the
    // clip counts as transparent, so destination-in clears it too.
    const m = this.mask(b.region);
    s.drawImage(m.canvas, m.x * scale, m.y * scale, m.canvas.width * scale, m.canvas.height * scale);
    s.restore();

    const p = ctx2d(this.paint);
    p.globalCompositeOperation = b.erase ? 'destination-out' : 'source-over';
    p.drawImage(this.scratch, bx, by, bw, bh, bx, by, bw, bh);
    p.globalCompositeOperation = 'source-over';
    this.dirty = true;
  }

  fill(region: number, rgb: [number, number, number], erase: boolean): void {
    const layers = this.layers;
    if (!layers) return;
    const scale = layers.paintWidth / layers.pageWidth;
    const m = this.mask(region);
    const bx = m.x * scale, by = m.y * scale, bw = m.canvas.width * scale, bh = m.canvas.height * scale;

    const s = ctx2d(this.scratch);
    s.save();
    s.clearRect(bx, by, bw, bh);
    s.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    s.fillRect(bx, by, bw, bh);
    s.globalCompositeOperation = 'destination-in';
    s.imageSmoothingEnabled = false;
    s.drawImage(m.canvas, bx, by, bw, bh);
    s.restore();

    const p = ctx2d(this.paint);
    // Fill replaces whatever was there, like a paint bucket.
    p.globalCompositeOperation = 'destination-out';
    p.drawImage(this.scratch, bx, by, bw, bh, bx, by, bw, bh);
    p.globalCompositeOperation = 'source-over';
    if (!erase) p.drawImage(this.scratch, bx, by, bw, bh, bx, by, bw, bh);
    this.dirty = true;
  }

  clear(): void {
    ctx2d(this.paint).clearRect(0, 0, this.paint.width, this.paint.height);
    this.dirty = true;
  }

  snapshot(): Snapshot {
    const c = makeCanvas(this.paint.width, this.paint.height);
    ctx2d(c).drawImage(this.paint, 0, 0);
    return new CanvasSnapshot(c);
  }

  restore(s: Snapshot): void {
    if (!(s instanceof CanvasSnapshot) || !s.canvas) return;
    const p = ctx2d(this.paint);
    p.clearRect(0, 0, this.paint.width, this.paint.height);
    p.drawImage(s.canvas, 0, 0);
    this.dirty = true;
  }

  async readPaint(): Promise<ImageData> {
    return ctx2d(this.paint).getImageData(0, 0, this.paint.width, this.paint.height);
  }

  present(): void {
    if (!this.dirty || !this.layers || !this.base || !this.outline) return;
    this.dirty = false;
    const { paintWidth: w, paintHeight: h } = this.layers;
    const d = this.display;
    d.imageSmoothingEnabled = true;
    d.fillStyle = '#fff';
    d.fillRect(0, 0, w, h);
    d.drawImage(this.base, 0, 0, w, h);
    d.drawImage(this.paint, 0, 0);
    d.drawImage(this.outline, 0, 0, w, h);
  }

  invalidate(): void {
    this.dirty = true;
  }

  destroy(): void {
    this.dropMasks();
    this.brushes.clear();
    this.paint.width = this.paint.height = 0;
    this.scratch.width = this.scratch.height = 0;
  }

  private dropMasks(): void {
    for (const m of this.masks.values()) m.canvas.width = m.canvas.height = 0;
    this.masks.clear();
  }

  /**
   * Mask for one region, cropped to its bounding box: opaque where the label
   * equals `region`. Only the most recent few are kept, since a page can have
   * over a hundred regions and iOS Safari caps total canvas memory.
   */
  private mask(region: number): RegionMask {
    let m = this.masks.get(region);
    if (m) {
      this.masks.delete(region); // re-insert as most recently used
      this.masks.set(region, m);
      return m;
    }
    const { width, labels } = this.layers!.regions;
    const box = regionBoxes(this.layers!.regions);
    const x0 = box[region * 4], y0 = box[region * 4 + 1];
    const w = Math.max(1, box[region * 4 + 2] - x0 + 1), h = Math.max(1, box[region * 4 + 3] - y0 + 1);
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
      const row = (y0 + y) * width + x0;
      for (let x = 0; x < w; x++) {
        if (labels[row + x] === region) img.data[(y * w + x) * 4 + 3] = 255;
      }
    }
    m = { canvas: imageCanvas(img), x: x0, y: y0 };
    this.masks.set(region, m);
    while (this.masks.size > MAX_MASKS) {
      const [oldest, old] = this.masks.entries().next().value!;
      old.canvas.width = old.canvas.height = 0;
      this.masks.delete(oldest);
    }
    return m;
  }

  /** Round brush sprite, 2r × 2r, same edge as the WebGPU shader. */
  private brush(rgb: [number, number, number], r: number): HTMLCanvasElement {
    const key = `${rgb.join(',')}/${r}`;
    let c = this.brushes.get(key);
    if (c) return c;
    const size = Math.ceil(r * 2);
    const img = new ImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = brushAlpha(Math.hypot(x + 0.5 - r, y + 0.5 - r), r);
        const i = (y * size + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    c = imageCanvas(img);
    this.brushes.set(key, c);
    return c;
  }
}
