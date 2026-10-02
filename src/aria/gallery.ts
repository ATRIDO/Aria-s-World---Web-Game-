// Gallery: every picture the child has colored or drawn, as framed tiles on a
// wall. Tapping one shows it big, with "color more" and save buttons. Nothing
// here deletes anything; clearing a picture happens on its page, with undo.

import type { ColoringApp } from './app';
import { vfx } from './vfx';

const THUMB_WIDTH = 320;
const FRAME_COLORS = ['#f6c453', '#8fd0f0', '#f59ab5', '#a4dc8a', '#c9b3f5', '#ffab76'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Gallery {
  private readonly grid = $<HTMLDivElement>('gallery-grid');
  private readonly empty = $<HTMLDivElement>('gallery-empty');
  private readonly view = $<HTMLDivElement>('gallery-view');
  /** Bumped on every open so a slow earlier render stops adding tiles. */
  private generation = 0;
  private viewUrl = '';
  private viewing = '';

  constructor(
    private readonly app: ColoringApp,
    /** Continue a picture: open its page. */
    private readonly onEdit: (pageId: string) => void,
    /** Nothing saved yet: start coloring. */
    private readonly onStart: () => void,
  ) {
    const tap = (id: string, fn: () => void) =>
      $<HTMLButtonElement>(id).addEventListener('click', () => {
        this.app.sound.playPop();
        fn();
      });
    tap('gallery-start', () => this.onStart());
    tap('gallery-back', () => this.closeView());
    tap('gallery-edit', () => {
      const id = this.viewing;
      this.closeView();
      this.onEdit(id);
    });
    this.view.addEventListener('click', (e) => {
      if (e.target === this.view) this.closeView();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.view.hidden) this.closeView();
    });
  }

  async open(): Promise<void> {
    const gen = ++this.generation;
    this.grid.replaceChildren();
    this.empty.hidden = true;
    let count = 0;
    for await (const pic of this.app.pictures(THUMB_WIDTH)) {
      if (gen !== this.generation) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'frame';
      b.dataset.page = pic.page.id;
      b.dataset.mode = pic.mode;
      b.setAttribute('aria-label', pic.page.title);
      b.style.setProperty('--frame', FRAME_COLORS[count % FRAME_COLORS.length]);
      b.style.setProperty('--tilt', `${(count % 3) - 1}deg`);
      b.style.animationDelay = `${Math.min(count, 8) * 60}ms`;
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.src = pic.thumb.toDataURL('image/png');
      b.appendChild(img);
      b.addEventListener('click', () => {
        this.app.sound.playPop();
        void this.show(pic.page.id, img.src);
      });
      this.grid.appendChild(b);
      count++;
    }
    if (gen === this.generation && count === 0) this.empty.hidden = false;
  }

  close(): void {
    this.generation++;
    this.closeView();
  }

  /** The picture big, with Color more / Save. */
  private async show(pageId: string, preview: string): Promise<void> {
    this.viewing = pageId;
    const image = $<HTMLImageElement>('gallery-image');
    image.src = preview;
    const share = $<HTMLButtonElement>('gallery-share');
    const download = $<HTMLAnchorElement>('gallery-download');
    share.hidden = true;
    download.hidden = true;
    this.view.hidden = false;
    $<HTMLButtonElement>('gallery-edit').focus();
    const r = image.getBoundingClientRect();
    vfx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 16, shape: 'star', speed: 320, size: 9 });

    // The full-size picture for saving (the preview is only a thumbnail).
    const png = await this.app.picturePng(pageId).catch(() => null);
    if (!png || this.viewing !== pageId || this.view.hidden) return;
    URL.revokeObjectURL(this.viewUrl);
    this.viewUrl = URL.createObjectURL(png);
    image.src = this.viewUrl;
    const fileName = `arias-world-${pageId}.png`;
    download.href = this.viewUrl;
    download.download = fileName;
    download.hidden = false;
    // Web Share with files: on iPad this offers "Save Image" to Photos.
    const file = typeof File === 'function' ? new File([png], fileName, { type: 'image/png' }) : null;
    share.hidden = !(file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));
    share.onclick = () => {
      this.app.sound.playPop();
      navigator.share({ files: [file!], title: "Aria's World" }).catch(() => {});
    };
  }

  private closeView(): void {
    this.view.hidden = true;
    this.viewing = '';
    URL.revokeObjectURL(this.viewUrl);
    this.viewUrl = '';
  }
}
