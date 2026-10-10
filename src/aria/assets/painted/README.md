# Painted dress-up art

Original painted dolls and clothes for the dress-up game (`src/aria/dress/painted.ts`).
They are original (no one else's characters) and made for this game with Nano Banana
(Google's image model) on the owner's Higgsfield account, then cut out by the scripts
in `scripts/painted/`.

## How it fits together

- **One shared body.** `body-<name>.png` is the same painted doll in six skin tones and
  eye colors (`scripts/painted/tint.cjs` recolors the one bare doll), so every piece of
  clothing fits every painted doll exactly.
- **Pieces** (`pd-*` dresses, `pt-*` tops, `pb-*` bottoms, `ps-*` shoes, `ph-*` hair and
  hats) are transparent 600 × 894 pictures laid over the body, in the same place.
- The game draws them in a 200 × 320 box (like the drawn dolls) and recolors them with an
  SVG color matrix (a hue shift), so the color dots work on painted pieces too.
- `painted-data.ts` (generated) lists every piece with its slot, main color and bounds.

`pb-shorts` is not a drawer item: it is worn by default whenever a painted doll has no dress
or bottom on, so the body never shows underwear (see `UNDERLAYER_ID` in `painted.ts`).

## Making a new piece

1. On the Higgsfield website (Nano Banana Pro, unlimited, 2:3), give it the bare doll
   `body-fair` as the reference and ask for **the same doll wearing the piece** on a flat
   green (`#00FF00`) background, for example:
   `Same doll, identical face, bald head, skin, pose, size and position, same storybook
   style and plum outline. Only change clothes: <the piece>. Solid flat pure green
   background #00FF00, no shadow.`
   (Asking for "only the shirt" does not work: the piece comes out the wrong size and place.)
   Dresses should have bare feet, so shoes stay a separate piece.
2. Put the picture's address in a recipe (`[{ "id", "slot", "name", "url", "cutBelow"? }]`)
   and run `node scripts/painted/build.cjs recipe.json <bare doll>.png <out dir>`, then
   `node scripts/painted/gen-data.cjs <out dir> .`. The build subtracts the bare doll from
   the picture and keeps only what changed. It needs `pngjs` (already installed with `qrcode`).
3. Check it on a few dolls, run `npm run typecheck && npm run build`, and push.
