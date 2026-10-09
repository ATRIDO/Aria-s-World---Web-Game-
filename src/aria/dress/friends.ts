// Characters saved from dress-up ("friends"), up to five, for the games that
// let children play as their own creations.
import { cloneLook, freshLook, isHexColor, type Look } from './art';
import { DOLLS, type Doll } from './wardrobe';

export const MAX_FRIENDS = 5;
const KEY = 'arias-world:friends';
/** Dress-up's own save, for the starter dolls' current outfits. */
const DRESS_KEY = 'arias-world:dress';

export interface Friend {
  /** Which doll (skin, eyes) she is. */
  doll: string;
  look: Look;
}

/** A character to play as: a saved friend or one of the starter dolls. */
export interface Character {
  key: string;
  doll: Doll;
  look: Look;
  saved: boolean;
}

function isLook(v: unknown): v is Look {
  const l = v as Look | null;
  return !!l && typeof l === 'object' && typeof l.worn === 'object' && isHexColor(l.hairColor);
}

/** Always MAX_FRIENDS long; empty places are null. */
export function loadFriends(): (Friend | null)[] {
  const out: (Friend | null)[] = Array.from({ length: MAX_FRIENDS }, () => null);
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[];
    list.slice(0, MAX_FRIENDS).forEach((f, i) => {
      const x = f as Friend | null;
      if (x && DOLLS.some((d) => d.id === x.doll) && isLook(x.look)) out[i] = { doll: x.doll, look: x.look };
    });
  } catch {
    // storage blocked or damaged: no friends yet
  }
  return out;
}

export function saveFriends(list: (Friend | null)[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_FRIENDS)));
  } catch {
    // storage blocked: friends last for this visit only
  }
}

export const dollOf = (id: string): Doll => DOLLS.find((d) => d.id === id) ?? DOLLS[0];

/** Saved friends first, then the starter dolls as they're dressed right now. */
export function characters(): Character[] {
  const out: Character[] = [];
  loadFriends().forEach((f, i) => {
    if (f) out.push({ key: `friend${i}`, doll: dollOf(f.doll), look: cloneLook(f.look), saved: true });
  });
  let looks: Record<string, Look> = {};
  try {
    looks = (JSON.parse(localStorage.getItem(DRESS_KEY) ?? 'null') as { looks?: Record<string, Look> } | null)?.looks ?? {};
  } catch {
    // no dress-up save
  }
  for (const d of DOLLS) {
    const l = looks[d.id];
    out.push({ key: d.id, doll: d, look: isLook(l) ? cloneLook(l) : freshLook(d), saved: false });
  }
  return out;
}
