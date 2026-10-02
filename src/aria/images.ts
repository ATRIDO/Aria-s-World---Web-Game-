function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available');
  return [c, ctx];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Loads an image and returns its pixels (straight alpha), optionally resized. */
export async function loadImageData(src: string, width?: number, height?: number): Promise<ImageData> {
  const img = await loadImage(src);
  const w = width ?? img.naturalWidth, h = height ?? img.naturalHeight;
  const [, ctx] = canvas2d(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Composites the image over white so it is fully opaque. */
export function flattenOnWhite(img: ImageData): ImageData {
  const out = new ImageData(img.width, img.height);
  const s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3] / 255;
    d[i] = s[i] * a + 255 * (1 - a);
    d[i + 1] = s[i + 1] * a + 255 * (1 - a);
    d[i + 2] = s[i + 2] * a + 255 * (1 - a);
    d[i + 3] = 255;
  }
  return out;
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

export async function encodePng(img: ImageData): Promise<Blob> {
  const [c, ctx] = canvas2d(img.width, img.height);
  ctx.putImageData(img, 0, 0);
  return toBlob(c);
}

/** Decodes a stored PNG, scaled to the given size if it differs. */
export async function decodePng(data: Blob, width: number, height: number): Promise<ImageData> {
  const url = URL.createObjectURL(data);
  try {
    return await loadImageData(url, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Paper + base + paint + outline, as a canvas of the given size. */
export function composite(
  base: ImageData, paint: ImageData | null, outline: ImageData, width: number, height: number,
): HTMLCanvasElement {
  const [c, ctx] = canvas2d(width, height);
  const layer = (img: ImageData) => {
    const [lc, lctx] = canvas2d(img.width, img.height);
    lctx.putImageData(img, 0, 0);
    ctx.drawImage(lc, 0, 0, width, height);
  };
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  layer(base);
  if (paint) layer(paint);
  layer(outline);
  return c;
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Blob> {
  return toBlob(c);
}
