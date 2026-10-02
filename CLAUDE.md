# Notes for Claude sessions

Aria's World: a Vite + TypeScript game (coloring, sketch, tracing, matching) with a small
Rust/WebAssembly region labeler, for young children. It publishes itself to GitHub Pages at
https://atrido.github.io/Aria-s-World---Web-Game-/ on every push to `main` (`.github/workflows/pages.yml`).

- Game code: `src/aria/`, page: `arias-world/index.html`, build: `vite.aria.config.ts`,
  install/offline/QR: `scripts/aria-pwa.ts`, WebAssembly source: `crates/regions/`
  (rebuild `src/aria/wasm/regions.wasm` with `npm run build:wasm`; the built file is committed).
- The build goes to `dist/` with relative URLs, so it works at any address.
- Saved pictures live in the browser (IndexedDB) per address: changing the address loses them
  for players, so don't change the repo name or Pages URL without a reason.

Before pushing: `npm run typecheck && npm run build` (CI runs the same). Regenerate
`package-lock.json` with `npm install`; never hand-edit it.

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
