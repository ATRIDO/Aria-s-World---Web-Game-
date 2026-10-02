import { labelRegionsJs, type LabelParams } from './regions-fallback';
import wasmUrl from './wasm/regions.wasm?url';

interface RegionsExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  label_regions(
    rgba: number, width: number, height: number, out: number,
    darkThreshold: number, minRegion: number, grow: number,
  ): number;
}

export interface RegionMap {
  width: number;
  height: number;
  /** One label per page pixel, row-major from the top-left. 0 = not paintable. */
  labels: Uint32Array;
  count: number;
}

const PARAMS: LabelParams = { darkThreshold: 268, minRegion: 40, grow: 3 };

let wasm: Promise<RegionsExports | null> | undefined;

function loadWasm(): Promise<RegionsExports | null> {
  // fetch + instantiate(bytes) instead of instantiateStreaming: works in every
  // Safari version and doesn't depend on the server sending application/wasm.
  wasm ??= fetch(wasmUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`regions.wasm: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then(({ instance }) => instance.exports as unknown as RegionsExports)
    .catch((e) => {
      // Blocked by CSP (Safari 15 has no 'wasm-unsafe-eval') or failed to load.
      console.warn('[regions] WebAssembly unavailable, using the JS fallback', e);
      return null;
    });
  return wasm;
}

/** Splits the page into fillable regions (see crates/regions). */
export async function labelRegions(img: ImageData): Promise<RegionMap> {
  const ex = await loadWasm();
  const { width, height } = img;
  if (!ex) return { width, height, ...labelRegionsJs(img.data, width, height, PARAMS) };
  const bytes = width * height * 4;
  const inPtr = ex.alloc(bytes) >>> 0;
  const outPtr = ex.alloc(bytes) >>> 0;
  try {
    // Views are created after every alloc: growing memory detaches old buffers.
    new Uint8Array(ex.memory.buffer, inPtr, bytes).set(img.data);
    const count = ex.label_regions(inPtr, width, height, outPtr, PARAMS.darkThreshold, PARAMS.minRegion, PARAMS.grow);
    const labels = new Uint32Array(ex.memory.buffer, outPtr, width * height).slice();
    return { width, height, labels, count };
  } finally {
    ex.dealloc(inPtr, bytes);
    ex.dealloc(outPtr, bytes);
  }
}

/**
 * Region under a page pixel. Taps that land on the line art snap to the
 * nearest region within a few pixels, so small fingers still hit something.
 */
export function regionAt(map: RegionMap, x: number, y: number, reach = 8): number {
  const { width, height, labels } = map;
  const cx = Math.floor(x), cy = Math.floor(y);
  let best = 0, bestD = Infinity;
  for (let dy = -reach; dy <= reach; dy++) {
    const py = cy + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = -reach; dx <= reach; dx++) {
      const px = cx + dx;
      if (px < 0 || px >= width) continue;
      const l = labels[py * width + px];
      const d = dx * dx + dy * dy;
      if (l && d < bestD) {
        best = l;
        bestD = d;
        if (d === 0) return l;
      }
    }
  }
  return best;
}

const boxCache = new WeakMap<RegionMap, Int32Array>();

/**
 * Bounding box [minX, minY, maxX, maxY] of every region (4 entries per label),
 * in page pixels. Computed once per map.
 */
export function regionBoxes(map: RegionMap): Int32Array {
  let box = boxCache.get(map);
  if (box) return box;
  const { width, labels, count } = map;
  box = new Int32Array((count + 1) * 4);
  for (let r = 0; r <= count; r++) {
    box[r * 4] = box[r * 4 + 1] = 0x7fffffff;
    box[r * 4 + 2] = box[r * 4 + 3] = -1;
  }
  for (let i = 0; i < labels.length; i++) {
    const r = labels[i] * 4, x = i % width, y = (i / width) | 0;
    if (x < box[r]) box[r] = x;
    if (y < box[r + 1]) box[r + 1] = y;
    if (x > box[r + 2]) box[r + 2] = x;
    if (y > box[r + 3]) box[r + 3] = y;
  }
  boxCache.set(map, box);
  return box;
}
