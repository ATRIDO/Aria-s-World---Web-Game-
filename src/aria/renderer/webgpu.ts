import { premultiplied, unpremultiplyInto } from './pixels';
import type { PageLayers, PaintRenderer, Snapshot, StampBatch } from './types';

// Brush stamps: one instanced quad per dot, clipped to the active region by
// reading the label map, edge matching brushAlpha() in types.ts.
const STAMP_WGSL = /* wgsl */ `
struct Uniforms {
  color: vec4f,
  size: vec2f,
  radius: f32,
  scale: f32,
  region: u32,
  solid: u32,
  pad1: u32,
  pad2: u32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var labels: texture_2d<u32>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @location(0) center: vec2f) -> VOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let offset = corners[vi] * (u.radius + 1.0);
  let p = center + offset;
  var o: VOut;
  o.pos = vec4f(p.x / u.size.x * 2.0 - 1.0, 1.0 - p.y / u.size.y * 2.0, 0.0, 1.0);
  o.local = offset;
  return o;
}

@fragment
fn fs(v: VOut) -> @location(0) vec4f {
  let lp = vec2i(floor(v.pos.xy / u.scale));
  let dims = vec2i(textureDimensions(labels));
  if (any(lp < vec2i(0)) || any(lp >= dims)) {
    discard;
  }
  if (textureLoad(labels, lp, 0).r != u.region) {
    discard;
  }
  var a = 1.0;
  if (u.solid == 0u) {
    let edge = max(1.5, u.radius * 0.15);
    let t = clamp((u.radius - length(v.local)) / edge, 0.0, 1.0);
    a = t * t * (3.0 - 2.0 * t);
  }
  if (a <= 0.0) {
    discard;
  }
  return vec4f(u.color.rgb * a, a);
}
`;

// Final picture: paper-white base, then paint (premultiplied), then line art
// (premultiplied). Same order as Unity's Composite.shader.
const COMPOSITE_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var baseTex: texture_2d<f32>;
@group(0) @binding(2) var paintTex: texture_2d<f32>;
@group(0) @binding(3) var lineTex: texture_2d<f32>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var pts = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = pts[vi];
  var o: VOut;
  o.pos = vec4f(p, 0.0, 1.0);
  o.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return o;
}

@fragment
fn fs(v: VOut) -> @location(0) vec4f {
  let b = textureSample(baseTex, samp, v.uv).rgb;
  let p = textureSample(paintTex, samp, v.uv);
  let l = textureSample(lineTex, samp, v.uv);
  var c = p.rgb + b * (1.0 - p.a);
  c = l.rgb + c * (1.0 - l.a);
  return vec4f(c, 1.0);
}
`;

const PREMULT_OVER: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};
const ERASE: GPUBlendState = {
  color: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

const UNIFORM_BYTES = 48;

interface PageGpu {
  layers: PageLayers;
  base: GPUTexture;
  outline: GPUTexture;
  labels: GPUTexture;
  paint: GPUTexture;
  stampGroup: GPUBindGroup;
  compositeGroup: GPUBindGroup;
}

class GpuSnapshot implements Snapshot {
  constructor(public tex: GPUTexture | null, private readonly onRelease: (t: GPUTexture) => void) {}
  release(): void {
    if (this.tex) this.onRelease(this.tex);
    this.tex = null;
  }
}

/** Returns null when WebGPU is missing or no adapter is available. */
export async function createWebGpuRenderer(
  canvas: HTMLCanvasElement,
  onLost: (reason: string) => void,
): Promise<PaintRenderer | null> {
  if (!('gpu' in navigator) || !navigator.gpu) return null;
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch {
    return null;
  }
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) {
    device.destroy();
    return null;
  }
  return new WebGpuRenderer(device, canvas, context, onLost);
}

class WebGpuRenderer implements PaintRenderer {
  readonly kind = 'webgpu' as const;

  private readonly format: GPUTextureFormat;
  private readonly stampPaint: GPURenderPipeline;
  private readonly stampErase: GPURenderPipeline;
  private readonly stampLayout: GPUBindGroupLayout;
  private readonly composite: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniforms: GPUBuffer;
  private readonly uniformData = new ArrayBuffer(UNIFORM_BYTES);
  private instances: GPUBuffer;
  private page: PageGpu | null = null;
  private pool: GPUTexture[] = [];
  private dirty = true;
  private destroyed = false;

  constructor(
    private readonly device: GPUDevice,
    private readonly canvas: HTMLCanvasElement,
    private readonly context: GPUCanvasContext,
    onLost: (reason: string) => void,
  ) {
    device.lost.then((info) => {
      if (!this.destroyed) onLost(info.message || info.reason || 'unknown');
    });
    device.addEventListener('uncapturederror', (e) => {
      console.error('[webgpu]', (e as GPUUncapturedErrorEvent).error.message);
    });

    this.format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format: this.format, alphaMode: 'opaque' });

    const stampModule = device.createShaderModule({ code: STAMP_WGSL });
    // Paint and erase share one explicit layout so one bind group serves both
    // ('auto' layouts are unique per pipeline and can't be shared).
    this.stampLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'uint' } },
      ],
    });
    const stampPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.stampLayout] });
    const stampPipeline = (blend: GPUBlendState) =>
      device.createRenderPipeline({
        layout: stampPipelineLayout,
        vertex: {
          module: stampModule,
          entryPoint: 'vs',
          buffers: [{
            arrayStride: 8,
            stepMode: 'instance',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          }],
        },
        fragment: { module: stampModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm', blend }] },
        primitive: { topology: 'triangle-list' },
      });
    this.stampPaint = stampPipeline(PREMULT_OVER);
    this.stampErase = stampPipeline(ERASE);

    const compositeModule = device.createShaderModule({ code: COMPOSITE_WGSL });
    this.composite = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: compositeModule, entryPoint: 'vs' },
      fragment: { module: compositeModule, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });

    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniforms = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.instances = this.createInstanceBuffer(1024);
  }

  setPage(layers: PageLayers, paint: ImageData | null): void {
    const { device } = this;
    const prev = this.page;
    const sameSize = prev && prev.layers.paintWidth === layers.paintWidth && prev.layers.paintHeight === layers.paintHeight;
    if (prev) {
      prev.base.destroy();
      prev.outline.destroy();
      prev.labels.destroy();
      if (!sameSize) prev.paint.destroy();
    }
    if (!sameSize) this.drainPool();

    const { pageWidth: pw, pageHeight: ph, paintWidth: w, paintHeight: h } = layers;
    const base = this.uploadRgba(layers.base.data, pw, ph);
    const outline = this.uploadRgba(premultiplied(layers.outline.data), pw, ph);

    const labels = device.createTexture({
      size: [pw, ph],
      format: 'r32uint',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: labels }, layers.regions.labels, { bytesPerRow: pw * 4 }, [pw, ph]);

    const paintTex = sameSize ? prev!.paint : device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
    });

    this.page = {
      layers,
      base,
      outline,
      labels,
      paint: paintTex,
      stampGroup: device.createBindGroup({
        layout: this.stampLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms } },
          { binding: 1, resource: labels.createView() },
        ],
      }),
      compositeGroup: device.createBindGroup({
        layout: this.composite.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: base.createView() },
          { binding: 2, resource: paintTex.createView() },
          { binding: 3, resource: outline.createView() },
        ],
      }),
    };

    if (paint && paint.width === w && paint.height === h) {
      device.queue.writeTexture({ texture: paintTex }, premultiplied(paint.data), { bytesPerRow: w * 4 }, [w, h]);
    } else {
      this.clear();
    }

    this.canvas.width = w;
    this.canvas.height = h;
    this.dirty = true;
  }

  stamp(b: StampBatch): void {
    const page = this.page;
    if (!page || b.points.length < 2) return;
    const { device } = this;
    const count = b.points.length / 2;

    if (this.instances.size < b.points.byteLength) {
      this.instances.destroy();
      this.instances = this.createInstanceBuffer(count * 2);
    }
    device.queue.writeBuffer(this.instances, 0, b.points.buffer, b.points.byteOffset, b.points.byteLength);

    const f = new Float32Array(this.uniformData);
    const i = new Uint32Array(this.uniformData);
    f[0] = b.rgb[0] / 255; f[1] = b.rgb[1] / 255; f[2] = b.rgb[2] / 255; f[3] = 1;
    f[4] = page.layers.paintWidth; f[5] = page.layers.paintHeight;
    f[6] = b.radius;
    f[7] = page.layers.paintWidth / page.layers.pageWidth;
    i[8] = b.region;
    i[9] = b.solid ? 1 : 0;
    device.queue.writeBuffer(this.uniforms, 0, this.uniformData);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: page.paint.createView(), loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(b.erase ? this.stampErase : this.stampPaint);
    pass.setBindGroup(0, page.stampGroup);
    pass.setVertexBuffer(0, this.instances);
    pass.draw(6, count);
    pass.end();
    device.queue.submit([enc.finish()]);
    this.dirty = true;
  }

  fill(region: number, rgb: [number, number, number], erase: boolean): void {
    const page = this.page;
    if (!page) return;
    const { paintWidth: w, paintHeight: h } = page.layers;
    this.stamp({ points: new Float32Array([w / 2, h / 2]), region, rgb, radius: Math.hypot(w, h), erase, solid: true });
  }

  clear(): void {
    if (!this.page) return;
    const enc = this.device.createCommandEncoder();
    enc.beginRenderPass({
      colorAttachments: [{
        view: this.page.paint.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    }).end();
    this.device.queue.submit([enc.finish()]);
    this.dirty = true;
  }

  snapshot(): Snapshot {
    const page = this.page!;
    const { paintWidth: w, paintHeight: h } = page.layers;
    const tex = this.pool.pop() ?? this.device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
    });
    this.copy(page.paint, tex, w, h);
    return new GpuSnapshot(tex, (t) => {
      const size = this.page?.layers;
      if (!this.destroyed && size && t.width === size.paintWidth && t.height === size.paintHeight) {
        this.pool.push(t);
      } else {
        t.destroy();
      }
    });
  }

  restore(s: Snapshot): void {
    const page = this.page;
    if (!page || !(s instanceof GpuSnapshot) || !s.tex) return;
    this.copy(s.tex, page.paint, page.layers.paintWidth, page.layers.paintHeight);
    this.dirty = true;
  }

  async readPaint(): Promise<ImageData> {
    const page = this.page!;
    const { paintWidth: w, paintHeight: h } = page.layers;
    const bytesPerRow = Math.ceil((w * 4) / 256) * 256; // WebGPU copy alignment
    const buf = this.device.createBuffer({
      size: bytesPerRow * h,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: page.paint }, { buffer: buf, bytesPerRow }, [w, h]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const out = new ImageData(w, h);
    const row = new Uint8ClampedArray(w * 4);
    for (let y = 0; y < h; y++) {
      unpremultiplyInto(src, row, y * bytesPerRow);
      out.data.set(row, y * w * 4);
    }
    buf.unmap();
    buf.destroy();
    return out;
  }

  present(): void {
    if (!this.dirty || !this.page) return;
    this.dirty = false;
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.composite);
    pass.setBindGroup(0, this.page.compositeGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  invalidate(): void {
    this.dirty = true;
  }

  destroy(): void {
    this.destroyed = true;
    this.drainPool();
    this.device.destroy();
  }

  private uploadRgba(data: Uint8Array | Uint8ClampedArray, w: number, h: number): GPUTexture {
    const tex = this.device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: w * 4 }, [w, h]);
    return tex;
  }

  private copy(src: GPUTexture, dst: GPUTexture, w: number, h: number): void {
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToTexture({ texture: src }, { texture: dst }, [w, h]);
    this.device.queue.submit([enc.finish()]);
  }

  private createInstanceBuffer(floats: number): GPUBuffer {
    return this.device.createBuffer({
      size: Math.max(floats * 4, 4096),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private drainPool(): void {
    for (const t of this.pool) t.destroy();
    this.pool = [];
  }
}
