import './style.css';
import { ColoringApp, type RendererChoice } from './app';
import { Gallery } from './gallery';
import { setupInstall } from './install';
import eraserImg from './assets/crayons/eraser.png';
import menuVideo from './assets/media/menu-bg.mp4';
import logo from './assets/ui/logo.png';
import modeColor from './assets/ui/mode-color.png';
import modeSketch from './assets/ui/mode-sketch.png';
import type { Mode } from './pages';
import { MatchingApp } from './match/matcher';
import { TracingApp } from './trace/tracer';
import { consumeResume, saveResume, watchForUpdates, type Screen } from './updates';
import { installTapPop } from './vfx';

const params = new URLSearchParams(location.search);
// ?renderer=canvas forces the Canvas 2D path (handy for testing the Safari
// fallback on any browser); ?debug shows which renderer is running.
const choice = (params.get('renderer') ?? 'auto') as RendererChoice;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const start = byId<HTMLElement>('start');
const color = byId<HTMLElement>('color');
const video = byId<HTMLVideoElement>('start-video');
const status = byId<HTMLParagraphElement>('start-status');

byId<HTMLImageElement>('start-logo').src = logo;
byId<HTMLImageElement>('eraser-img').src = eraserImg;
byId<HTMLImageElement>('mode-color-img').src = modeColor;
byId<HTMLImageElement>('mode-sketch-img').src = modeSketch;
video.src = menuVideo;
video.play().catch(() => {
  // Low Power Mode on iOS blocks autoplay; the logo still shows.
});

// iOS Safari ignores user-scalable=no; block pinch zoom so a two-finger
// scribble doesn't zoom the page. Double-tap zoom is off via CSS touch-action.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

const app = new ColoringApp(choice);
app.preload();
const tracing = new TracingApp(app.sound);
const trace = byId<HTMLElement>('trace');
const matching = new MatchingApp(app.sound);
const match = byId<HTMLElement>('match');
installTapPop();
let ready: Promise<void> | null = null;

const galleryScreen = byId<HTMLElement>('gallery');
const gallery = new Gallery(
  app,
  (pageId) => void openColoring(() => app.showPage(pageId), 'Getting the crayons…'),
  () => void openColoring(() => app.setMode('color'), 'Getting the crayons…'),
);

type StartChoice = Mode | 'trace' | 'match';

async function play(mode: StartChoice): Promise<void> {
  app.sound.unlock();
  app.sound.playPop();
  if (mode === 'trace') {
    start.hidden = true;
    trace.hidden = false;
    video.pause();
    tracing.open();
    return;
  }
  if (mode === 'match') {
    start.hidden = true;
    match.hidden = false;
    video.pause();
    matching.open();
    return;
  }
  await openColoring(() => app.setMode(mode), mode === 'sketch' ? 'Sharpening the crayons…' : 'Getting the crayons…');
}

/** Shows the coloring screen once `show` has opened the right page. */
async function openColoring(show: () => Promise<void>, waiting: string): Promise<void> {
  status.textContent = waiting;
  try {
    ready ??= app.init();
    await ready;
    await show();
  } catch (e) {
    ready = null;
    console.error(e);
    status.textContent = 'Something went wrong. Please reload the page.';
    color.hidden = true;
    start.hidden = false;
    return;
  }
  status.textContent = '';
  start.hidden = true;
  gallery.close();
  galleryScreen.hidden = true;
  color.hidden = false;
  video.pause();
  app.redraw();
  if (params.has('debug')) {
    const badge = byId<HTMLParagraphElement>('renderer-badge');
    badge.textContent = app.rendererKind;
    badge.hidden = false;
  }
}

for (const b of document.querySelectorAll<HTMLButtonElement>('.mode-card')) {
  b.addEventListener('click', () => void play(b.dataset.mode as StartChoice));
}

// Offline play and "Add to Home Screen" (see install.ts). The service worker is only
// built for production (scripts/aria-pwa.ts). New versions apply by themselves at a
// quiet moment, and the child comes back to the same screen, page and crayon.
const updates = watchForUpdates({
  busy: () => app.busy || tracing.busy || matching.busy,
  onStart: () => !start.hidden,
  prepare: async () => {
    saveResume(currentScreen());
    await app.flushSave();
  },
});
setupInstall(() => !start.hidden);

function goHome(): void {
  app.sound.playPop();
  void app.flushSave();
  tracing.close();
  matching.close();
  gallery.close();
  color.hidden = true;
  trace.hidden = true;
  match.hidden = true;
  galleryScreen.hidden = true;
  start.hidden = false;
  video.play().catch(() => {});
  updates.check();
}

byId<HTMLButtonElement>('home').addEventListener('click', goHome);
byId<HTMLButtonElement>('trace-home').addEventListener('click', goHome);
byId<HTMLButtonElement>('match-home').addEventListener('click', goHome);
// The Gallery opens from the Color/Sketch toolbar and goes back to the picture.
byId<HTMLButtonElement>('gallery-open').addEventListener('click', () => {
  app.sound.playPop();
  color.hidden = true;
  galleryScreen.hidden = false;
  void gallery.open();
});
byId<HTMLButtonElement>('gallery-exit').addEventListener('click', () => {
  app.sound.playPop();
  gallery.close();
  galleryScreen.hidden = true;
  color.hidden = false;
  app.redraw();
});

/** Where the child is right now, to come back to after an update. */
function currentScreen(): Screen {
  if (!trace.hidden) return { name: 'trace' };
  if (!match.hidden) return { name: 'match' };
  if (!galleryScreen.hidden) return { name: 'gallery', mode: app.currentMode };
  if (!color.hidden) return { name: 'color', mode: app.currentMode, view: app.viewState };
  return { name: 'start' };
}

// Just updated: skip the start screen and go straight back to where the child was.
const resume = consumeResume();
if (resume && resume.name !== 'start') {
  document.documentElement.classList.add('resuming');
  // Sound can only start from a tap on iOS; the first tap anywhere turns it back on.
  document.addEventListener('pointerdown', () => app.sound.unlock(), { once: true, capture: true });
  start.hidden = true;
  video.pause();
  if (resume.name === 'trace') {
    trace.hidden = false;
    tracing.open();
  } else if (resume.name === 'match') {
    match.hidden = false;
    matching.open();
  } else {
    color.hidden = false;
    const mode = resume.mode ?? app.currentMode;
    void openColoring(() => app.setMode(mode), '').then(() => {
      if (!start.hidden) return; // couldn't open the page; the start screen shows instead
      if (resume.name === 'gallery') {
        color.hidden = true;
        galleryScreen.hidden = false;
        void gallery.open();
      } else if (resume.view) {
        app.setViewState(resume.view);
      }
    });
  }
}
