# Codex prompts — Tremuloides

Copy and paste these into a Codex Cloud task, choosing this repo's environment.

---

## 1. Foundation (M1) — run first

```
Read AGENTS.md and PRD.md in full. Implement Milestone M1 (Foundation) exactly as specified in PRD.md §14, along with everything M1 depends on in §4–§13.

This repo contains only docs so far, so scaffold the project from scratch: Vite + TypeScript, vite-plugin-pwa, WebGL2, Vitest. Include both GitHub Actions workflows: ci.yml for PRs, and deploy.yml, which deploys to GitHub Pages on push to main using BASE_PATH from the repo name.

If you have to make trade-offs, prioritize in this order:
1. Offline reliability and the update flow: atomic precache, the "Ready to work offline" confirmation, the update banner, the manual "Check for updates" button, and the visible version and SHA.
2. Capture → save → gallery → share working end to end, with storage that survives future updates (schema v1 plus the migration framework).
3. Live viewfinder with the lens system and auto-generated parameter UI (Original and Posterize lenses), plus Import and the Editor.
4. Diagnostics with "Copy diagnostics" and the FPS overlay.

Don't implement Ink & Wash or any later lens yet, but make sure the lens architecture will support realtime, temporal, and still-only lenses as described in PRD §6.

Before finishing:
- Make sure npm run check passes.
- Write docs/TESTING.md, README.md, and CHANGELOG.md.
- Open a PR using the description format in AGENTS.md. List anything you couldn't verify without a real device.
```

## 2. Ink & Wash (M2)

```
Read AGENTS.md and PRD.md. Implement Milestone M2: the Ink & Wash lens (src/lenses/ink-wash), as specified in PRD §14 M2, and make it the default lens.

Tune the defaults for autumn aspen landscapes: golden foliage, dark conifers, blue sky, and red rock. Use M1's adaptive preview resolution plus the lens's Quality setting to keep the live viewfinder smooth. Make sure the preview matches the full-resolution render (PRD §6.2).

Run npm run check, update TESTING.md and CHANGELOG.md, bump the version, and open a PR in the AGENTS.md format.
```

## 3. Later milestones (fill in the brackets)

```
Read AGENTS.md and PRD.md. Implement Milestone [M3 Quake / M4 Field Log / M5 Stained Glass / M6 Flow Painter / M7 Ridgeline Score / M8 Topo] as specified in PRD §14.

Field notes from testing the current version (v[x.y.z]):
- [what's working, what isn't, what to prioritize]

Run npm run check, update TESTING.md and CHANGELOG.md, bump the version, and open a PR in the AGENTS.md format.
```

## 4. Bug report

```
Read AGENTS.md. Bug on my phone, running v[x.y.z] ([sha]):

What I did: [steps]
What happened: [result]
What I expected: [result]

Diagnostics report:
[paste from Settings → Diagnostics → Copy diagnostics]

Find the root cause and fix it. Add a test if the logic is testable, and add a diagnostics entry if the failure could recur. Open a patch PR in the AGENTS.md format.
```

## 5. Tuning a lens from the field

```
Read AGENTS.md and the README for the [lens id] lens. Tune it based on field use (screenshot attached if possible):

- [e.g. "ink lines too heavy in shadowed spruce; want them lighter in dark areas"]
- [e.g. "San Juan palette turns sunlit aspens orange; should stay gold"]

Adjust defaults and/or the algorithm, bump the lens version, and open a patch PR in the AGENTS.md format. Explain each change in one line.
```

## 6. After M1 merges (environment upkeep, optional)

In Codex settings, edit the cloud environment and ask:

```
Set the install script to `npm ci` and verify that `npm run check` passes, then publish.
```

This makes later tasks start faster.
