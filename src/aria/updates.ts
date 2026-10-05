import type { ViewState } from './app';
import type { Mode } from './pages';

// New versions of the game, applied without anyone noticing: the service worker
// (sw.js) downloads a new version in the background; once it has taken over, the
// page reloads at a quiet moment and comes straight back to the same screen.

/** A screen to come back to after reloading. */
export type Screen =
  | { name: 'start' }
  | { name: 'trace' }
  | { name: 'match' }
  | { name: 'dress' }
  | { name: 'tug' }
  | { name: 'memory' }
  | { name: 'feed' }
  | { name: 'gallery'; mode: Mode }
  | { name: 'color'; mode: Mode; view?: ViewState };

const RESUME_KEY = 'arias-world:resume';
/** No touches for this long counts as a quiet moment. */
const IDLE_MS = 12_000;
/** Long sessions look for a new version this often too. */
const CHECK_EVERY_MS = 30 * 60_000;
const FADE_MS = 220;

export function saveResume(screen: Screen): void {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(screen));
  } catch {
    // storage blocked: the game opens on the start screen instead
  }
}

/** The screen saved before an update reload, once (then it's cleared). */
export function consumeResume(): Screen | null {
  try {
    const v = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    return v ? (JSON.parse(v) as Screen) : null;
  } catch {
    return null;
  }
}

interface Options {
  /** True while a finger is down (never reload under a finger). */
  busy: () => boolean;
  /** True on the start screen, where reloading loses nothing. */
  onStart: () => boolean;
  /** Save everything before reloading. */
  prepare: () => Promise<void>;
}

export interface Updates {
  /** Reload now if a new version is waiting and it's a good moment. */
  check(): void;
}

export function watchForUpdates(o: Options): Updates {
  const none: Updates = { check: () => {} };
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return none;
  const sw = navigator.serviceWorker;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hadController = !!sw.controller;
  let ready = false;
  let restarting = false;
  let lastTouch = performance.now();

  const restart = async (fade: boolean) => {
    if (restarting) return;
    restarting = true;
    try {
      await o.prepare();
    } catch (e) {
      console.warn('[aria] saving before the update failed; trying again later', e);
      restarting = false;
      return;
    }
    // A quick fade to the background color instead of a white flash.
    if (fade && !reduced) {
      document.documentElement.classList.add('leaving');
      await new Promise((r) => setTimeout(r, FADE_MS));
    }
    location.reload();
  };

  const check = () => {
    if (!ready || restarting || o.busy()) return;
    if (document.visibilityState === 'hidden') void restart(false);
    else if (o.onStart() || performance.now() - lastTouch > IDLE_MS) void restart(true);
  };

  sw.addEventListener('controllerchange', () => {
    // The very first install also "changes" the controller; that's not an update.
    if (!hadController) {
      hadController = true;
      return;
    }
    ready = true;
    check();
  });

  for (const type of ['pointerdown', 'pointermove', 'keydown']) {
    document.addEventListener(type, () => (lastTouch = performance.now()), { capture: true, passive: true });
  }
  // A lift of the finger may be the quiet moment we were waiting for.
  document.addEventListener('pointerup', () => setTimeout(check, 0), { capture: true });
  setInterval(check, 3000);

  window.addEventListener('load', () => {
    sw.register('sw.js')
      .then((reg) => {
        // Home-screen apps resume without reloading, so look for a new version whenever
        // the game comes back to the front, and now and then during long sessions.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
          // Switched away: the best moment of all, nobody sees the reload.
          check();
        });
        setInterval(() => reg.update().catch(() => {}), CHECK_EVERY_MS);
      })
      .catch((e) => console.warn('[aria] offline mode unavailable', e));
  });

  return { check };
}
