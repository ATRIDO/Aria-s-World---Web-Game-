# RESUME: Higgsfield graphics upgrade

Follow `CREDIT_EFFICIENCY.md` (Sonnet, medium effort, only the Higgsfield connector on, short output).

## Decisions (from the owner)
- Areas: all four: (1) new original coloring pages, (2) menu/buttons/UI icons, (3) dress-up/match/memory art, (4) app icon, backgrounds, reward stickers.
- Style: soft storybook watercolor, pastel, rounded shapes, no text in images. Coloring pages are the exception: clean thick-outline line art on white (watercolor would break region fill).
- Budget: tiny test first, then approve a small batch, then the rest.

## Rules
- Original art only; no characters owned by others, no brand names (see CLAUDE.md "Art and copyright").
- Coloring pages: new ids (`art17`+), SVG/PNG pipeline in `scripts/svg-to-page.mjs`; Higgsfield output is raster, so check it converts to closed regions (fill tool needs closed outlines). Test one page in the real fill tool first.
- Touch targets >= 44 px, no reading required; check at 390x844 and iPad.
- Note the Higgsfield licence/terms for commercial use next to the files.

## Steps
1. `balance` (credits), `models_explore(action:'recommend')`; pick the cheapest model that suits.
2. Test: 1 UI icon set sheet + 1 coloring page (2 images). Show the user, get a yes.
3. Batch (`generate_image_batch`): ~10 images, one `jobs_wait`, one `show_generation_by_ids`.
4. `remove_background` for icons/stickers; `upscale_image` only if needed.
5. Import into `src/aria/assets/{ui,pages-src,...}`, update `pages.ts`, run `npm run typecheck && npm run build` once.

## Open
- Which animals/themes for new coloring pages (ask with AskUserQuestion).
- Current UI icons to replace: see `src/aria/assets/ui`.
