# Notes for Claude sessions

Aria's World: a Vite + TypeScript game (coloring, sketch, tracing, matching) with a small
Rust/WebAssembly region labeler, for young children. It publishes itself to GitHub Pages at
https://atrido.github.io/Aria-s-World---Web-Game-/ on every push to `main` (`.github/workflows/pages.yml`).

- Game code: `src/aria/`, page: `index.html`, build: `vite.aria.config.ts`,
  install/offline/QR: `scripts/aria-pwa.ts`, WebAssembly source: `crates/regions/`
  (rebuild `src/aria/wasm/regions.wasm` with `npm run build:wasm`; the built file is committed).
- The build goes to `dist/` with relative URLs, so it works at any address.
- Saved pictures live in the browser (IndexedDB) per address: changing the address loses them
  for players, so don't change the repo name or Pages URL without a reason.

Before pushing: `npm run typecheck && npm run build` (CI runs the same). Regenerate
`package-lock.json` with `npm install`; never hand-edit it.

## Art and copyright (required)

This repo and its GitHub Pages site are public, so everything in the game is published.

- **New art you make or add** must be original (drawn here, or made by the owner) or clearly
  licensed for reuse (public domain / CC0 etc., licence noted next to the file). Don't draw, trace
  or "chibi" characters owned by others (Disney, Pixar, Warner Bros., Hasbro, Mattel/Barbie,
  Netflix/Sony's KPop Demon Hunters, Nintendo, etc.); offer an original alternative instead
  (original fashion dolls, K-pop idols, princesses...). Keep brand names out of the UI.
- **Existing coloring pages `page1`–`page31`** show such characters (Disney princesses, Frozen,
  Toy Story, Harry Potter, Powerpuff Girls, My Little Pony, Peppa Pig, KPop Demon Hunters fan
  art). The owner decided to keep them for now, knowing the risk. **If a report, takedown notice
  or complaint about any of them arrives, remove those pages right away** (delete
  `src/aria/assets/pages/pageN-*.png`, drop the titles in `src/aria/pages.ts`) and publish; the
  `art17`–`art52` (made with Higgsfield, original) remain.
- Coloring pages are drawn as SVG in `src/aria/assets/pages-src/` and converted with
  `node scripts/svg-to-page.mjs` (needs Playwright; see the script). Give new pages new ids:
  saved pictures are stored per page id, so reusing an id puts an old picture on a new page.
- Before adding assets from Google Drive or elsewhere, check where they came from; if unsure, ask.

## Google Drive (required)

Only open the **Aria's World** folder in Google Drive (folder id `17pv5rPJIw4Yfe4udDFXhD8_-pZhIJElP`)
and its subfolders. Never search, list or download anything else in the owner's Drive. If
something isn't in that folder, ask the owner to put it there.

## Aria's World must be child-friendly (required)

Aria's World is played by young children. Every change must keep the UX child-friendly; treat a
violation as a bug, not a style choice:

- **Touch targets ≥ 44 px** (aim for 48–64 px) with space between them. Never rely on precise taps.
- **Forgiving input**: taps snap to the nearest area, a slightly sliding tap still counts, a
  second finger means zoom (never an extra stroke), stray touches must not destroy work.
- **Tiny areas must be easy**: Fill (tap an area) is the default on coloring pages; zoom by
  pinch, press-and-hold (Fill tool), or mouse wheel, with a big always-visible zoom-out button.
- **Everything is undoable**; no confirmation dialogs, no destructive action without undo.
- **No reading required**: icons and pictures first; text only as a helper for grown-ups.
- **Instant, gentle feedback** (sound, motion) and no fail states, timers, ads, purchases,
  external links, or data collection inside the game.
- **Respect the device**: works offline once loaded, pauses music when hidden, honours
  `prefers-reduced-motion`, and runs on older iPads (Canvas 2D fallback, Safari 15+).
- Check new UI at phone size (390×844), iPad portrait and landscape before pushing.
