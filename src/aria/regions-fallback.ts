// TypeScript port of crates/regions (keep the two in sync). Used only when
// WebAssembly can't run, e.g. Safari 15 under a CSP without 'unsafe-eval'
// (it predates 'wasm-unsafe-eval'). Same inputs, same labels.

export interface LabelParams {
  darkThreshold: number;
  minRegion: number;
  grow: number;
}

export function labelRegionsJs(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  p: LabelParams,
): { labels: Uint32Array; count: number } {
  const n = width * height;
  const opaque = (i: number) => rgba[i * 4 + 3] > 0;
  const paintable = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2];
    paintable[i] = opaque(i) && s >= p.darkThreshold ? 1 : 0;
  }

  // Connected components with an explicit stack.
  const labels = new Uint32Array(n);
  const sizes: number[] = [0];
  const stack = new Uint32Array(n);
  for (let start = 0; start < n; start++) {
    if (!paintable[start] || labels[start]) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    labels[start] = id;
    stack[top++] = start;
    while (top) {
      const i = stack[--top];
      size++;
      const x = i % width, y = (i / width) | 0;
      // Same neighbour order as the Rust version: left, right, up, down.
      if (x > 0 && paintable[i - 1] && !labels[i - 1]) { labels[i - 1] = id; stack[top++] = i - 1; }
      if (x + 1 < width && paintable[i + 1] && !labels[i + 1]) { labels[i + 1] = id; stack[top++] = i + 1; }
      if (y > 0 && paintable[i - width] && !labels[i - width]) { labels[i - width] = id; stack[top++] = i - width; }
      if (y + 1 < height && paintable[i + width] && !labels[i + width]) { labels[i + width] = id; stack[top++] = i + width; }
    }
    sizes.push(size);
  }

  // Drop tiny regions and renumber the rest densely, in scan order.
  const remap = new Uint32Array(sizes.length);
  let count = 0;
  for (let id = 1; id < sizes.length; id++) {
    if (sizes[id] >= p.minRegion) remap[id] = ++count;
  }
  for (let i = 0; i < n; i++) labels[i] = remap[labels[i]];

  // Grow regions into unlabeled (but not transparent) pixels, one ring per pass.
  const changes: number[] = [];
  for (let pass = 0; pass < p.grow; pass++) {
    changes.length = 0;
    for (let i = 0; i < n; i++) {
      if (labels[i] || !opaque(i)) continue;
      const x = i % width, y = (i / width) | 0;
      let l = 0;
      if (x > 0) l = labels[i - 1];
      if (!l && x + 1 < width) l = labels[i + 1];
      if (!l && y > 0) l = labels[i - width];
      if (!l && y + 1 < height) l = labels[i + width];
      if (l) changes.push(i, l);
    }
    if (!changes.length) break;
    for (let k = 0; k < changes.length; k += 2) labels[changes[k]] = changes[k + 1];
  }

  return { labels, count };
}
