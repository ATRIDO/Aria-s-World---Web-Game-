import type { TraceItem } from './glyphs';

// The spoken names for the tracing game: one short clip per letter (A.mp3, ...)
// and per number (21.mp3, ...), made with Higgsfield (see assets/voice/README.md).
// A missing clip just means silence, so the game works before every clip is added.

const CLIPS = import.meta.glob<string>('../assets/voice/**/*.mp3', { eager: true, import: 'default' });

/** True once at least one clip is in the build (the voice button is hidden until then). */
export const VOICE_READY = Object.keys(CLIPS).length > 0;

/** The clip that says this letter or number, if there is one. */
export function clipFor(item: TraceItem): string | undefined {
  const folder = item.category === 'numbers' ? 'numbers' : 'letters';
  const name = item.category === 'numbers' ? item.label : item.label.toUpperCase();
  return CLIPS[`../assets/voice/${folder}/${name}.mp3`];
}
