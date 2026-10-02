import type { Sound } from '../audio';
import { vfx } from '../vfx';

// Balloons that float up over the tracing paper after each finished letter,
// more for a combo (letters finished one after another). Tap one to pop it. Purely a treat: they never
// block anything and just drift away if nobody pops them.

const COLORS = ['#ec4840', '#fa8a28', '#ffd034', '#3ab460', '#3a80e8', '#9652d0', '#ff7ab8', '#4cc9f0', '#ff9f9f', '#8bd450'];
const MAX_BALLOONS = 24;

const SVG = `<svg viewBox="0 0 60 100" aria-hidden="true">
  <path class="string" d="M30 73c-5 8 5 13 0 24" />
  <path class="knot" d="M25 74h10l-5-8z" />
  <ellipse class="body" cx="30" cy="36" rx="26" ry="32" />
  <ellipse class="shine" cx="20" cy="22" rx="6" ry="10" transform="rotate(-25 20 22)" />
</svg>`;

export class Balloons {
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly host: HTMLElement, private readonly sound: Sound) {}

  /** Sends up `count` balloons from the bottom of the paper, a little apart. */
  release(count: number): void {
    const room = MAX_BALLOONS - this.host.querySelectorAll('.balloon').length;
    const rise = this.host.clientHeight + 160;
    for (let i = 0; i < Math.min(count, room); i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'balloon';
      b.tabIndex = -1;
      b.setAttribute('aria-label', 'Balloon');
      b.innerHTML = SVG;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      b.style.setProperty('--balloon', color);
      b.style.left = `${6 + Math.random() * 78}%`;
      b.style.setProperty('--rise', `${-rise}px`);
      b.style.setProperty('--size', `${0.85 + Math.random() * 0.35}`);
      if (this.reduced) {
        b.style.top = `${15 + Math.random() * 50}%`;
      } else {
        b.style.animationDuration = `${5.5 + Math.random() * 2.5}s`;
        b.style.animationDelay = `${i * 0.25 + Math.random() * 0.2}s`;
      }
      // Pop on touch-down: quicker and more forgiving than waiting for a click.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pop(b, color);
      });
      b.addEventListener('animationend', (e) => {
        if (e.target === b) b.remove();
      });
      this.host.appendChild(b);
    }
  }

  clear(): void {
    this.host.querySelectorAll('.balloon').forEach((b) => b.remove());
  }

  private pop(b: HTMLElement, color: string): void {
    const r = b.querySelector('.body')!.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    b.remove();
    this.sound.playPop(1.2 + Math.random() * 0.4);
    vfx.ring(x, y, color, 60);
    vfx.burst(x, y, { count: 16, colors: [color, '#ffffff', '#ffd54f'], shape: 'confetti', speed: 320, size: 10, gravity: 500, life: 0.9 });
    vfx.burst(x, y, { count: 6, colors: ['#ffd54f', color], shape: 'star', speed: 200, size: 8, life: 0.6 });
  }
}
