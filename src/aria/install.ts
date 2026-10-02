import icon from './assets/app/icon-192.png';

// "Add to Home Screen" helper for grown-ups. Opened from the home screen the game runs full
// screen and offline; in a browser tab it still plays normally, just with the browser bars.
//  - Android / Chrome / Edge / Samsung: the browser's own install prompt, one tap.
//  - iPhone / iPad: Safari has no install API, so we show the Share → Add to Home Screen steps.
//  - Other phones and tablets: the browser-menu steps.
//  - Computers: a QR code to open the game on a tablet or phone (plus Install if offered).
// Shown once on the start screen; "Play in the browser" hides it for a month. The corner
// button opens it again any time. Never shown inside the installed app.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Kind = 'ios' | 'android' | 'prompt' | 'desktop';

const DISMISS_KEY = 'arias-world:install-dismissed';
const INSTALLED_KEY = 'arias-world:installed';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage blocked: we'll just ask again next time
    }
  },
};

export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: fullscreen), (display-mode: standalone), (display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const ua = navigator.userAgent;
// iPadOS reports itself as a Mac; a Mac has no touch screen.
const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// In-app browsers (Instagram, Facebook, TikTok…) can't add to the Home Screen.
const inApp = ios && /FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|GSA\//.test(ua);
const touch = ios || /Android/i.test(ua) || matchMedia('(pointer: coarse)').matches;
// Where the browser's Share / menu button is, for the arrow. Safari on iPhone and
// Firefox/Edge on iOS keep it at the bottom; iPad Safari, Chrome on iOS and Android at the top.
const iPhone = /iPhone|iPod/.test(ua);
const pointerAt = iPhone && !/CriOS/.test(ua) ? 'bottom' : 'top';

export function setupInstall(isOnStartScreen: () => boolean): void {
  if (isStandalone()) return;

  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = byId<HTMLDivElement>('install');
  const openButton = byId<HTMLButtonElement>('install-open');
  const addButton = byId<HTMLButtonElement>('install-add');
  const closeButton = byId<HTMLButtonElement>('install-close');
  const qr = byId<HTMLImageElement>('install-qr');
  byId<HTMLImageElement>('install-icon').src = icon;
  const pointer = dialog.querySelector<HTMLElement>('.install-pointer');
  const pointerLabel = byId<HTMLSpanElement>('install-pointer-label');

  let deferred: InstallPromptEvent | null = null;
  let kind: Kind = ios ? 'ios' : touch ? 'android' : 'desktop';

  const render = () => {
    dialog.dataset.kind = kind;
    if (deferred) dialog.dataset.prompt = '';
    else delete dialog.dataset.prompt;
    if (inApp) dialog.dataset.inapp = '';
    if (pointer) {
      pointer.dataset.where = pointerAt;
      pointerLabel.textContent = kind === 'android' ? 'Menu ⋮' : iPhone && pointerAt === 'bottom' ? 'Share / •••' : 'Share';
    }
    if (kind === 'desktop' && !qr.src) {
      qr.src = 'qr.svg';
      qr.addEventListener('error', () => (qr.hidden = true), { once: true });
    }
  };

  const open = () => {
    render();
    dialog.hidden = false;
    // Move focus for keyboards; on touch screens it would only draw a focus ring.
    if (!touch) (deferred ? addButton : closeButton).focus({ preventScroll: true });
  };
  const close = () => {
    dialog.hidden = true;
  };
  const installed = () => {
    storage.set(INSTALLED_KEY, '1');
    close();
    openButton.hidden = true;
  };

  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', () => {
    storage.set(DISMISS_KEY, String(Date.now()));
    close();
  });
  // Tapping outside the card closes it for now (a stray tap shouldn't be remembered).
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dialog.hidden) close();
  });

  addButton.addEventListener('click', async () => {
    const event = deferred;
    if (!event) return;
    deferred = null;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') installed();
      else render();
    } catch {
      render();
    }
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    // Use our own card instead of the browser's mini bar.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    if (touch) kind = 'prompt';
    openButton.hidden = false;
    if (!dialog.hidden) render();
  });
  window.addEventListener('appinstalled', installed);

  if (kind === 'desktop') openButton.setAttribute('aria-label', 'Play on a tablet or phone: QR code');
  openButton.hidden = false;

  const dismissed = Number(storage.get(DISMISS_KEY) ?? 0);
  if (storage.get(INSTALLED_KEY) || Date.now() - dismissed < SNOOZE_MS) return;

  // Give Chrome a moment to offer its install prompt, then ask once, on the start screen only.
  setTimeout(() => {
    if (isOnStartScreen() && !isStandalone()) open();
  }, 2500);
}
