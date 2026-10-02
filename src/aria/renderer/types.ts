import type { RegionMap } from '../regions';

export interface PageLayers {
  /** Page art size. */
  pageWidth: number;
  pageHeight: number;
  /** Paint layer size (page × PAINT_SCALE); also the display canvas size. */
  paintWidth: number;
  paintHeight: number;
  /** Base drawing flattened onto white (opaque). */
  base: ImageData;
  /** Line art drawn over the paint (straight alpha). */
  outline: ImageData;
  regions: RegionMap;
}

export interface StampBatch {
  /** x,y pairs in paint pixels. */
  points: Float32Array;
  /** Stamps are clipped to this region's pixels. */
  region: number;
  /** sRGB 0-255. */
  rgb: [number, number, number];
  radius: number;
  erase: boolean;
  /** Full-strength coverage instead of the soft brush falloff (used by fill). */
  solid?: boolean;
}

/** An opaque saved copy of the paint layer, for undo/redo. */
export interface Snapshot {
  release(): void;
}

/**
 * Owns the display canvas and the paint layer. Two implementations: WebGPU
 * (preferred) and Canvas 2D (for browsers without WebGPU, e.g. Safari < 26).
 * Both must produce the same picture.
 */
export interface PaintRenderer {
  readonly kind: 'webgpu' | 'canvas2d';
  /** Switches to a page. `paint` is a saved paint layer (straight alpha) or null. */
  setPage(layers: PageLayers, paint: ImageData | null): void;
  stamp(batch: StampBatch): void;
  /** Paints (or with `erase`, clears) one whole region in a solid color: the Fill tool. */
  fill(region: number, rgb: [number, number, number], erase: boolean): void;
  clear(): void;
  snapshot(): Snapshot;
  restore(s: Snapshot): void;
  /** Paint layer as straight-alpha RGBA, paintWidth × paintHeight. */
  readPaint(): Promise<ImageData>;
  /** Draws the composite (paper, base, paint, outline) to the canvas if anything changed. */
  present(): void;
  /** Forces the next present() to redraw (the canvas may have been dropped). */
  invalidate(): void;
  destroy(): void;
}

/**
 * Brush edge, shared by both renderers so strokes look identical: a solid body
 * with a narrow soft rim, like a marker. Overlapping dots then give one smooth,
 * even line instead of a blurry or beaded one.
 */
export function brushAlpha(dist: number, radius: number): number {
  const t = Math.min(Math.max((radius - dist) / brushEdge(radius), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Width of the soft rim, in paint pixels. Keep in sync with STAMP_WGSL. */
export function brushEdge(radius: number): number {
  return Math.max(1.5, radius * 0.15);
}
