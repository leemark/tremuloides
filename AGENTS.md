# AGENTS.md — Tremuloides

Instructions for any coding agent working on this repo (Claude Code reads them via `CLAUDE.md`). Read `PRD.md` in full before starting any task. This file is the short operational version. If they conflict, `PRD.md` wins, and you should point out the conflict in your PR.

## Context
- Tremuloides is an **offline-first camera PWA** with algorithmic photo "lenses": shaders, simulations, and classic image processing.
- **No generative AI, no ML models, no backend, no network calls at runtime.**
- **Target:** Chrome on Android, installed from GitHub Pages under a sub-path (`/<repo>/`).
- **Owner:** Mark. He directs work and merges PRs **from his phone** during a photography trip, often with poor connectivity. He can't run code locally during the trip.

## Working style
- Make reasonable decisions without asking. Record assumptions in the PR description.
- **One milestone or one lens per PR.** Keep diffs focused; don't refactor unrelated code.
- Never leave `main` broken. CI must pass.
- **You may not be able to see the UI or use a camera.** If your environment has a headless browser, run the built app with `?demo=1` and check screenshots. Either way, compensate:
  - Keep logic in pure, unit-tested modules.
  - Use the procedural test-pattern source (`?demo=1`).
  - Make failures visible in the app through Diagnostics.
  - Prefer defensive fallbacks over assumptions about device APIs.
- Finish complete, working increments. If something must be deferred, leave it out cleanly (no dead buttons) and list it in the PR.

## Commands
```
npm ci
npm run dev             # local dev server
npm run typecheck
npm test                # Vitest
npm run build
npm run check:offline   # fails on external URLs or incomplete precache
npm run check           # all of the above; MUST pass before you finish
```

## Hard rules
1. **No runtime network requests.** No CDNs, remote fonts, analytics, or external APIs. Everything is bundled and precached.
2. **Never break stored data.** IndexedDB schema changes are additive, versioned migrations, with tests. Migrations never delete captures.
3. **Lens ids are permanent** because they're stored in captures. Bump a lens's `version` when its output changes materially.
4. **Resolution-independent parameters.** Spatial params use reference pixels at a 1080 px short edge, scaled to the actual resolution, so previews match full-resolution renders.
5. **Keep the main thread responsive.** Per-pixel work goes on the GPU (WebGL2). Heavy CPU work (k-means, contours, particles, audio rendering) goes in Web Workers.
6. **Release resources.** Stop camera tracks when hidden; dispose textures, framebuffers, and programs; `close()` ImageBitmaps; revoke object URLs.
7. **Updates never auto-reload.** Use the update banner, and never interrupt an in-progress render or recording.
8. **Never hard-code `/`.** Use `import.meta.env.BASE_URL`; `base` comes from `BASE_PATH`.
9. **Dependencies:** small, well-maintained, and offline-safe only, justified in the PR. No UI frameworks, no three.js.
10. **TypeScript strict.** No `any` without a comment explaining why.

## Adding a lens
1. Create `src/lenses/<id>/` containing:
   - `index.ts`, which exports a `Lens`,
   - `shaders/*.glsl`, imported with `?raw`,
   - `README.md`, covering the algorithm, params, and references.
2. Register it in `src/lenses/registry.ts`.
3. Declare params in the lens metadata. The UI is generated from them.
4. Pick defaults that look good on autumn mountain landscapes: golden aspens, dark spruce, blue sky, red rock, early snow.
5. Add unit tests for any CPU-side logic. The registry test validates metadata automatically.

## Every PR must
- Pass `npm run check`.
- Bump the `package.json` version: minor for a milestone or lens, patch for fixes and tuning.
- Add a `CHANGELOG.md` entry. The newest entry may be shown in the app as "What's new", so write it for a user: short and plain.
- Update `docs/TESTING.md` with phone test steps for the change.
- Use this PR description format, kept short (Mark reads it on a phone):

```
**What's new**
- 2–4 bullets

**Test on phone**
1. ≤ 6 numbered steps

**Known limitations / assumptions**
- bullets

**If it breaks**
- What to copy from Settings → Diagnostics, and what to look for
```
