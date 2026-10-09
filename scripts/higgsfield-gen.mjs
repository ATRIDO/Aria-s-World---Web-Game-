// Offline art generator: run on your own machine, commit only the finished images.
// Usage: HIGGSFIELD_API_KEY=... node scripts/higgsfield-gen.mjs [--dry]
// Credit rules: hard cap per run, skips files that already exist, never re-rolls.
// Set HIGGSFIELD_API_URL to the image endpoint from the Higgsfield API docs (not guessed here).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_IMAGES = 8;
const STYLE = 'original child-friendly illustration, soft pastel pink and coral palette (#ebced5, #e5634c, #5b3a47), rounded shapes, no text, no existing characters or brands';
const JOBS = [
  ['src/aria/assets/ui/gen/home-bg.png', 'dreamy pastel sky with gentle clouds and sparkles, empty centre'],
  ['src/aria/assets/ui/gen/icon-color.png', 'rounded sticker icon of a crayon and paint drop'],
  ['src/aria/assets/ui/gen/icon-sketch.png', 'rounded sticker icon of a pencil and squiggle'],
  ['src/aria/assets/ui/gen/icon-trace.png', 'rounded sticker icon of a dotted letter path'],
  ['src/aria/assets/ui/gen/icon-match.png', 'rounded sticker icon of matching shapes'],
  ['src/aria/assets/ui/gen/sticker-star.png', 'cute smiling star sticker'],
  ['src/aria/assets/ui/gen/sticker-bunny.png', 'cute original bunny mascot sticker'],
  ['src/aria/assets/ui/gen/sticker-cloud.png', 'happy cloud sticker with rainbow'],
];

const dry = process.argv.includes('--dry');
const key = process.env.HIGGSFIELD_API_KEY;
const url = process.env.HIGGSFIELD_API_URL;
const todo = JOBS.filter(([f]) => !existsSync(f)).slice(0, MAX_IMAGES);
console.log(`${todo.length} image(s) to generate (cap ${MAX_IMAGES}).`);
if (dry || !todo.length) process.exit(0);
if (!key || !url) throw new Error('Set HIGGSFIELD_API_KEY and HIGGSFIELD_API_URL.');

for (const [file, prompt] of todo) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ prompt: `${prompt}, ${STYLE}` }),
  });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`); // stop, don't retry: retries cost credits
  const body = await res.json();
  const img = body.url ? Buffer.from(await (await fetch(body.url)).arrayBuffer()) : Buffer.from(body.image, 'base64');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, img);
  console.log('saved', file);
}
