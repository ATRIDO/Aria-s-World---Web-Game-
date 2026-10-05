// Lightweight visual effects: one full-screen overlay canvas, a small particle
// pool, and a requestAnimationFrame loop that only runs while something is
// animating. Everything is skipped when the device asks for reduced motion.

type Shape = 'dot' | 'star' | 'ring' | 'confetti' | 'heart';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: Shape;
  gravity: number;
  spin: number;
  angle: number;
  /** Rings grow to this radius instead of moving. */
  grow: number;
}

export interface BurstOptions {
  count?: number;
  colors?: string[];
  shape?: Shape;
  speed?: number;
  size?: number;
  gravity?: number;
  life?: number;
}

const MAX_PARTICLES = 400;
const TAU = Math.PI * 2;

class Vfx {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private frame = 0;
  private last = 0;
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Scattered particles from a point, e.g. a paint splash or a star pop. */
  burst(x: number, y: number, o: BurstOptions = {}): void {
    const count = o.count ?? 14;
    const colors = o.colors ?? ['#ffd54f', '#ff8a65', '#81c784', '#64b5f6', '#ba68c8'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = (o.speed ?? 260) * (0.4 + Math.random() * 0.6);
      this.add({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (o.gravity ? v * 0.35 : 0),
        life: 0,
        maxLife: (o.life ?? 0.7) * (0.7 + Math.random() * 0.5),
        size: (o.size ?? 7) * (0.6 + Math.random() * 0.7),
        color: colors[i % colors.length],
        shape: o.shape ?? 'dot',
        gravity: o.gravity ?? 0,
        spin: (Math.random() - 0.5) * 8,
        angle: Math.random() * TAU,
        grow: 0,
      });
    }
  }

  /** An expanding ring, e.g. where a fill starts spreading. */
  ring(x: number, y: number, color: string, radius = 70): void {
    this.add({ x, y, vx: 0, vy: 0, life: 0, maxLife: 0.45, size: 6, color, shape: 'ring', gravity: 0, spin: 0, angle: 0, grow: radius });
  }

  /** One small twinkle, for trails. Call at most every few pixels. */
  sparkle(x: number, y: number, color: string): void {
    const a = Math.random() * TAU;
    this.add({
      x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6,
      vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 - 30,
      life: 0, maxLife: 0.45, size: 4 + Math.random() * 4, color,
      shape: Math.random() < 0.5 ? 'star' : 'dot', gravity: 0, spin: 4, angle: a, grow: 0,
    });
  }

  /** Confetti falling from the top of the screen: the big "you did it". */
  confetti(count = 70): void {
    const colors = ['#ec5c48', '#feb787', '#e0ea55', '#a4eea4', '#5a8ee7', '#d0c3ff', '#ffd6fc'];
    const w = innerWidth;
    for (let i = 0; i < count; i++) {
      this.add({
        x: Math.random() * w, y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 160,
        life: 0, maxLife: 2.2 + Math.random(), size: 8 + Math.random() * 6,
        color: colors[i % colors.length], shape: Math.random() < 0.3 ? 'star' : 'confetti',
        gravity: 60, spin: (Math.random() - 0.5) * 10, angle: Math.random() * TAU, grow: 0,
      });
    }
  }

  private add(p: Particle): void {
    if (this.reduced) return;
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
    this.ensureCanvas();
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((t) => this.tick(t));
    }
  }

  private ensureCanvas(): void {
    if (this.canvas) return;
    const c = document.createElement('canvas');
    c.className = 'vfx-layer';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
  }

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.canvas!, g = this.ctx!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = innerWidth, h = innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.angle += p.spin * dt;
      const t = p.life / p.maxLife;
      g.globalAlpha = p.shape === 'confetti' ? Math.min(1, (1 - t) * 3) : 1 - t;
      g.fillStyle = p.color;
      g.strokeStyle = p.color;
      this.draw(g, p, t);
      alive.push(p);
    }
    g.globalAlpha = 1;
    this.particles = alive;
    if (alive.length) {
      this.frame = requestAnimationFrame((t) => this.tick(t));
    } else {
      this.frame = 0;
      g.clearRect(0, 0, w, h);
    }
  }

  private draw(g: CanvasRenderingContext2D, p: Particle, t: number): void {
    switch (p.shape) {
      case 'dot':
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, TAU);
        g.fill();
        break;
      case 'ring':
        g.lineWidth = p.size * (1 - t);
        g.beginPath();
        g.arc(p.x, p.y, 8 + p.grow * easeOut(t), 0, TAU);
        g.stroke();
        break;
      case 'star':
        star(g, p.x, p.y, p.size * (1 - t * 0.3), p.angle);
        break;
      case 'heart':
        heart(g, p.x, p.y, p.size * (1 - t * 0.3));
        break;
      case 'confetti':
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.angle);
        g.scale(1, Math.cos(p.angle * 1.7)); // flutter
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g.restore();
        break;
    }
  }
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, angle = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = angle + (i * Math.PI) / 5;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  g.fill();
}

export const vfx = new Vfx();

/** A quick squash-and-stretch on the tapped button (CSS, see .tap-pop). */
export function installTapPop(): void {
  document.addEventListener('pointerdown', (e) => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (!b || (b as HTMLButtonElement).disabled) return;
    b.classList.remove('tap-pop');
    void (b as HTMLElement).offsetWidth; // restart the animation
    b.classList.add('tap-pop');
  });
  document.addEventListener('animationend', (e) => {
    (e.target as Element).classList?.remove('tap-pop');
  });
}
