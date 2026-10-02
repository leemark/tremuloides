# Agent prompts — Tremuloides

Paste these into a Claude session that has access to this repo. Each prompt produces one PR. Merge it in the GitHub app; the Pages deploy takes a minute or two, and the installed app then shows its **Reload** banner.

---

## 1. Foundation (M1): done in v0.1.0

Shipped: the PWA shell, offline/update flow, camera, the Original and Posterize lenses, gallery, editor, settings, and diagnostics.

## 2. Ink & Wash (M2): done in v0.2.0

```
Read AGENTS.md and PRD.md. Implement Milestone M2: the Ink & Wash lens (src/lenses/ink-wash), as specified in PRD §14 M2, and make it the default lens.

Tune the defaults for autumn aspen landscapes: golden foliage, dark conifers, blue sky, and red rock. Use M1's adaptive preview resolution plus the lens's Quality setting to keep the live viewfinder smooth. Make sure the preview matches the full-resolution render (PRD §6.2).

Run npm run check, update docs/TESTING.md and CHANGELOG.md, bump the version, and open a PR in the AGENTS.md format.
```

## M3 Quake: done in v0.3.0

## M4 Field Log: done in v0.4.0

## M5 Stained Glass: done in v0.5.0

## 3. Later milestones (fill in the brackets)

```
Read AGENTS.md and PRD.md. Implement Milestone [M6 Flow Painter / M7 Ridgeline Score / M8 Topo] as specified in PRD §14.

Field notes from testing the current version (v[x.y.z]):
- [what's working, what isn't, what to prioritize]

Run npm run check, update docs/TESTING.md and CHANGELOG.md, bump the version, and open a PR in the AGENTS.md format.
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
