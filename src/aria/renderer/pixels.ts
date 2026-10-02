/** Straight → premultiplied alpha, as a new array. */
export function premultiplied(src: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    out[i] = (src[i] * a + 127) / 255;
    out[i + 1] = (src[i + 1] * a + 127) / 255;
    out[i + 2] = (src[i + 2] * a + 127) / 255;
    out[i + 3] = a;
  }
  return out;
}

/** Premultiplied → straight alpha (what ImageData and PNG expect). */
export function unpremultiplyInto(src: Uint8Array, dst: Uint8ClampedArray, srcOffset = 0): void {
  for (let i = 0; i < dst.length; i += 4) {
    const a = src[srcOffset + i + 3];
    if (a === 0) {
      dst[i] = dst[i + 1] = dst[i + 2] = dst[i + 3] = 0;
      continue;
    }
    dst[i] = (src[srcOffset + i] * 255 + (a >> 1)) / a;
    dst[i + 1] = (src[srcOffset + i + 1] * 255 + (a >> 1)) / a;
    dst[i + 2] = (src[srcOffset + i + 2] * 255 + (a >> 1)) / a;
    dst[i + 3] = a;
  }
}
