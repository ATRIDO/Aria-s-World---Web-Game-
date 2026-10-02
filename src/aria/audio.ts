import bgmUrl from './assets/media/bgm.mp3';
import popUrl from './assets/media/pop.mp3';

const MUSIC_KEY = 'arias-world:music';

type AudioCtor = typeof AudioContext;

/**
 * Background music + pop sound. iOS Safari only allows audio to start inside
 * a user gesture, so `unlock()` must be called from a tap handler.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private pop: AudioBuffer | null = null;
  private readonly bgm = new Audio(bgmUrl);
  private musicOn: boolean;
  /** Set once the player has tapped Play, so we never start music on our own before that. */
  private started = false;

  constructor() {
    this.bgm.loop = true;
    this.bgm.preload = 'auto';
    this.bgm.volume = 0.5;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MUSIC_KEY);
    } catch {
      // storage blocked; default to on
    }
    this.musicOn = stored !== 'off';

    // Pause in a background tab or when the app is switched away; resume on return.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.bgm.pause();
      else if (this.started && this.musicOn) this.playMusic();
    });
  }

  get music(): boolean {
    return this.musicOn;
  }

  /** Call from a tap/click handler. */
  unlock(): void {
    this.started = true;
    if (!this.ctx) {
      const Ctor: AudioCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (Ctor) {
        this.ctx = new Ctor();
        // A silent buffer played inside the gesture fully unlocks older iOS.
        const silent = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = silent;
        src.connect(this.ctx.destination);
        src.start(0);
        void this.loadPop();
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    if (this.musicOn) this.playMusic();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    try {
      localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
    } catch {
      // ignore
    }
    if (on) this.playMusic();
    else this.bgm.pause();
  }

  /** `rate` above 1 plays it higher and shorter (e.g. a small balloon). */
  playPop(rate = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.pop) return;
    const src = ctx.createBufferSource();
    src.buffer = this.pop;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    src.connect(gain).connect(ctx.destination);
    src.start(0);
  }

  private playMusic(): void {
    this.bgm.play().catch(() => {
      // Autoplay refused (not in a gesture); the next tap will retry.
    });
  }

  private async loadPop(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const data = await (await fetch(popUrl)).arrayBuffer();
      // Callback form: the promise form is missing in older Safari.
      this.pop = await new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
    } catch (e) {
      console.warn('[audio] pop sound unavailable', e);
    }
  }
}
