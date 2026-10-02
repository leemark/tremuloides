# Tremuloides — Product Requirements Document

**Owner:** Mark
**Version:** 1.0 (October 1, 2026)
**Status:** Ready to build. M1 starts now; later milestones ship during a 3-day photography trip in the San Juan Mountains, Colorado.
**Builder:** a coding agent (Claude Code), directed from a phone. Read `AGENTS.md` for working rules.

---

## 1. Summary

Tremuloides (after *Populus tremuloides*, the quaking aspen) is an offline-first camera web app (PWA) for Android. It turns phone photos into art using **algorithmic "lenses"**: shaders, simulations, and classic image-processing techniques. It uses **no generative AI and no ML models**. Every lens is deterministic given its parameters and a seed, the way a generative art piece is.

The app is used in the field: on mountain roads, at trailheads, in aspen groves, often with no cell signal, in bright sun, with cold hands. It must be fast to open, reliable offline, and easy to use one-handed.

Development happens in short increments. Each agent task delivers one milestone or one lens as a pull request. Mark merges the PR on his phone, GitHub Pages deploys it, and the installed PWA picks up the update the next time he has signal.

## 2. Goals and non-goals

### Goals
1. **Works fully offline after the first load.** Every feature works with no network connection.
2. **Safe, predictable updates.** New versions install completely or not at all. The user always knows which version is running and when an update is ready.
3. **A pluggable lens system.** Adding a lens means adding one folder and one registry line, with the UI generated from the lens's parameter declarations.
4. **Field-ready UX.** Big controls, high contrast, quick launch, low battery drain.
5. **Your data is never lost.** Captures survive app updates. Export to the phone's gallery or other apps is always one tap away.
6. **Distinctive output.** The lenses should produce results that feel crafted and specific to an autumn landscape, not generic Instagram-style filters.

### Non-goals
- No backend, accounts, cloud sync, analytics, or telemetry.
- No generative AI, ML models, or remote APIs of any kind.
- No native app in this phase. A Capacitor wrapper for an APK is in the backlog.
- iOS/Safari doesn't need special optimization. It should degrade gracefully, but Android Chrome is the target.

## 3. Target platform and constraints

- **Device:** a modern Android phone running the latest Chrome, installed as a PWA from GitHub Pages.
- **Hosting:** GitHub Pages project site at `https://<user>.github.io/<repo>/`, so the app runs under a sub-path. Never hard-code `/`.
- **Rendering:** WebGL2 for per-pixel work. Query `MAX_TEXTURE_SIZE` and adapt; check for float render targets (`EXT_color_buffer_float`) and fall back if they're missing.
- **CPU-heavy work** (k-means, contour tracing, particle setup, audio rendering) runs in Web Workers.
- **Connectivity:** assume none in the field. Updates happen opportunistically on Wi-Fi or in town.
- **Build verification:** the build agent can't run a real camera, and may not have a GPU browser. Correctness has to come from pure, unit-tested modules, a synthetic test-pattern source, and in-app diagnostics that Mark can copy into a bug report.

## 4. Tech stack (decisions made; don't revisit without cause)

| Concern | Choice |
|---|---|
| Build | Vite + TypeScript (strict) |
| UI | Vanilla TypeScript and DOM, with small hand-written components. No UI framework. |
| PWA | `vite-plugin-pwa` (Workbox, `generateSW`), registration mode `prompt` |
| GPU | WebGL2, with a small in-repo helper module (programs, textures, framebuffers, ping-pong, fullscreen triangle). No three.js. |
| Shaders | GLSL ES 3.00 files imported as strings with `?raw` |
| Storage | IndexedDB through the `idb` package. Blobs stored in IndexedDB. |
| Workers | Vite module workers |
| Tests | Vitest, with `fake-indexeddb` for storage tests |
| Icons | SVG source, with PNGs generated at build time (e.g. `@vite-pwa/assets-generator`) |
| CI/CD | GitHub Actions: CI on PRs; build and deploy to GitHub Pages on push to `main` |

Use the system font stack. No web fonts.

## 5. Offline and update behavior (critical)

### 5.1 Precaching
- The service worker precaches **every** build asset: HTML, JS, CSS, workers, shaders (bundled in JS), icons, and the manifest.
- Precaching is versioned and atomic. A new version activates only after all of its files have downloaded. Old caches are cleaned up after activation.
- Navigation falls back to the cached `index.html`.
- **Zero runtime network requests.** `npm run check:offline` enforces this (see §12).

### 5.2 Load strategy
- Cache-first for all app assets, so a weak connection can never stall startup.
- Update checks happen in the background:
  - on launch,
  - when the app becomes visible again,
  - when the "Check for updates" button is tapped.

### 5.3 Update UX
- **"Ready to work offline."** Show a one-time toast the first time precaching completes, and a persistent status line in Settings. Mark relies on this before driving out of coverage.
- **Update banner.** When a new version is waiting, show a non-blocking banner: *"Update ready: v0.3.0 (abc1234). Reload"*.
  - Never auto-reload.
  - Don't show the banner while a render or recording is in progress.
  - Reloading activates the waiting service worker and refreshes once.
- **Visible version.** Settings shows the semver, short git SHA, and build date. The update banner uses the same format.
- **Manual check.** A "Check for updates" button in Settings reports one of three results: "Up to date", "Update downloading…" then the banner, or "Offline, can't check".
- **What's new (nice to have).** After an update, show a one-time toast built from the newest `CHANGELOG.md` entry, embedded at build time.

### 5.4 Storage durability
- On first launch, call `navigator.storage.persist()` and show the result in Settings.
- Settings shows usage and quota from `navigator.storage.estimate()`.
- **IndexedDB schema changes must be additive, versioned migrations.** Captures must survive every update. Migrations need unit tests.

## 6. Core concepts

### 6.1 Lenses
A **lens** is a self-contained renderer with declared parameters. There are three kinds:
- **Realtime lenses** run on the live viewfinder and on stills. Ink & Wash, Posterize, and Topo preview are examples.
- **Temporal lenses** need a history of frames (Quake).
- **Still-only lenses** run progressively on a captured or imported image (Flow Painter, Ridgeline Score). In the viewfinder they show a lightweight preview or the original image, with a "renders after capture" label.

### 6.2 Resolution-independent parameters
Spatial parameters (radii, line widths, cell sizes) are expressed in **reference pixels at a 1080 px short edge** and scaled by `actualShortEdge / 1080`. This keeps a 720p preview looking like the 4K final render. Every lens must follow this rule.

### 6.3 Seeds
Every capture stores a 32-bit seed. Seeded lenses must produce the same output for the same input, parameters, seed, and lens version. The parameter sheet has a "New seed" button. Use a small seeded PRNG module shared across lenses.

### 6.4 Lens interface (guidance; refine as needed)

```ts
export type ParamValue = number | boolean | string;

export type ParamSpec =
  | { id: string; label: string; type: 'range'; min: number; max: number; step: number; default: number; help?: string }
  | { id: string; label: string; type: 'toggle'; default: boolean; help?: string }
  | { id: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string; help?: string }
  | { id: string; label: string; type: 'color'; default: string; help?: string };

export interface LensMeta {
  id: string;            // kebab-case, permanent (stored in captures)
  name: string;          // display name
  tagline: string;       // one line for the lens picker
  version: number;       // bump when output for the same params changes materially
  kind: 'realtime' | 'temporal' | 'still';
  seeded: boolean;
  params: ParamSpec[];
  temporal?: { maxFrames: number; historyScale: number };
}

export interface RenderRequest {
  input: WebGLTexture;               // RGBA8 source at full input size
  width: number; height: number;     // output size
  params: Record<string, ParamValue>;
  seed: number;
  quality: 'preview' | 'final';
  history?: FrameHistory;            // temporal lenses only
  onProgress?: (fraction: number) => void; // still lenses
}

export interface LensInstance {
  render(req: RenderRequest, target: WebGLFramebuffer | null): void | Promise<void>;
  dispose(): void;
}

export interface Lens extends LensMeta {
  create(gl: WebGL2RenderingContext, shared: SharedGL): LensInstance;
}
```

The preview and the final render go through the **same** `render` path, at different sizes and quality levels.

### 6.5 File layout (target)

```
AGENTS.md  PRD.md  PROMPTS.md  CHANGELOG.md  README.md
docs/TESTING.md
index.html  vite.config.ts  package.json
public/            icon.svg, generated icons
scripts/           check-offline.mjs
src/
  main.ts
  app/             screens, router, state, UI components
  camera/          stream, still capture, import, test-pattern source
  gl/              WebGL2 helpers, shared programs (blur, structure tensor, color conversion)
  color/           Oklab/Oklch, palettes, k-means (worker), nearest-color
  lenses/
    types.ts  registry.ts
    original/  posterize/  ink-wash/  quake/  …   (one folder per lens, each with a README.md)
  fieldlog/        palette extraction, chromatograph (M4)
  storage/         db, migrations, blob store
  pwa/             service worker registration, update banner
  diagnostics/     error log, FPS meter, device report
  util/            prng, ids, formatting
tests/
.github/workflows/ ci.yml, deploy.yml
```

## 7. Data model

```ts
interface Capture {
  id: string;                 // ULID or similar, sortable by time
  createdAt: string;          // ISO 8601
  source: 'camera' | 'import' | 'derived';
  parentId?: string;          // set when re-rendered from another capture
  originalKey?: string;       // blob key for the original (if kept)
  outputKey: string;          // blob key for the rendered output
  thumbKey: string;           // ~400px JPEG
  lensId: string;
  lensVersion: number;
  params: Record<string, ParamValue>;
  seed: number;
  width: number; height: number;
  captureMethod?: 'imagecapture' | 'video-frame' | 'file';
  geo?: { lat: number; lon: number; accuracy: number; altitude: number | null; altitudeAccuracy: number | null; at: string };
  fieldlog?: { palette: { hex: string; weight: number }[]; warmIndex: number; version: number }; // M4
  appVersion: string;
}
```

Store blobs and metadata in IndexedDB. Keeping originals is **on by default**. That allows re-rendering, and it lets the Field Log backfill palettes later.

## 8. Screens and UX

**Visual style:**
- Dark UI with an aspen-gold accent (`#E9B825`) and high contrast.
- Touch targets at least 48 px; the shutter button is at least 72 px.
- One-handed use: primary controls sit along the bottom edge.
- Respect `prefers-reduced-motion`.

### 8.1 Viewfinder (home)
- Full-bleed live preview with the current lens applied.
- **Top bar:** lens name and tagline (tap opens the parameter sheet), and a Settings gear.
- **Bottom bar:**
  - last-capture thumbnail (opens the Gallery),
  - shutter,
  - lens picker button, plus an Import button (photo from the phone's gallery).
- **Gestures:**
  - Swipe horizontally on the preview to change lens.
  - Press and hold the preview to see the unprocessed original.
- **Parameter sheet** (bottom sheet): controls generated from `ParamSpec`, plus Reset and, for seeded lenses, New seed. Parameters persist per lens.
- **Shutter feedback:** haptic pulse (`navigator.vibrate`), a brief flash, and a "Saving…" indicator. Capture must never block the next shot for more than about 1 s; finish the full-res render in the background and queue it if needed.
- **Screen wake lock** while the viewfinder is visible (Settings toggle, default on).
- **Camera lifecycle:** stop camera tracks when the app is hidden or the viewfinder isn't showing; restart on return.

### 8.2 Editor (imports and re-edits)
- Same lens and parameter UI, applied to a still image, with a live preview at screen resolution.
- "Render" produces the full-resolution output and saves it as a new capture (`source: 'import'` or `'derived'` with `parentId`).

### 8.3 Gallery
- Grid of thumbnails, newest first, grouped by day.
- **Detail view:**
  - the full image, with press-and-hold to compare against the original,
  - lens name and parameters,
  - location and elevation if present.
- **Actions:** Share, Save to device, Re-edit, New seed (re-render with a fresh seed), Delete (with confirmation).
- **Multi-select** with "Share selected" (nice to have in M1).

### 8.4 Settings
- **About:** version, build SHA and date, and offline-ready status.
- **Check for updates.**
- **Storage:** usage, quota, and persistence status.
- **Captures:**
  - Keep originals (default on).
  - Max render size: 2048 / 4096 (default) / Max, where Max means the device's `MAX_TEXTURE_SIZE`.
  - Export format: JPEG (default, quality 0.92) / PNG.
- **Location tagging** (default on, permission requested on first capture) and **Keep screen on**.
- **Diagnostics** (§10).
- **Danger zone:** delete all captures, with a typed confirmation.

## 9. Capture pipeline

1. **Live stream.** Request `getUserMedia` with `facingMode: 'environment'` and an ideal resolution of 1920×1080. Upload frames to a texture each animation frame (`texImage2D` from the video element, or `requestVideoFrameCallback` where available).
2. **Adaptive preview resolution.** Render the preview at a lens-appropriate fraction of screen resolution. Scale it down automatically if FPS stays below 24, and back up when there's headroom.
3. **Still capture.**
   - Prefer `ImageCapture.takePhoto()`, requesting the largest size from `getPhotoCapabilities()`.
   - If that's unavailable or fails, use the current video frame at the track's resolution.
   - Record the method in `captureMethod`.
4. **Decode** with `createImageBitmap(blob, { imageOrientation: 'from-image' })`. Stills must appear upright in portrait and landscape; record orientation details in diagnostics.
5. **Render size.** Long edge = min(source long edge, Max render size setting, `MAX_TEXTURE_SIZE`). Full-resolution tiled rendering is in the backlog.
6. **Encode** with `canvas.toBlob` or `OffscreenCanvas.convertToBlob`. Generate a thumbnail and store everything.
7. **Location.** `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 })`. GPS works without cell service. **Never block capture on location:** attach it to the record when it resolves.
8. **Import.** Use `<input type="file" accept="image/*">`. It goes through the same decode → render → store path, which also handles photos copied over from a dedicated camera.
9. **Test-pattern source.** When no camera is available (desktop, headless, permission denied) or the URL has `?demo=1`, use a procedural animated scene as the input stream: gradient sky, a jagged mountain silhouette, dark conifers, and vertical aspen trunks with gold leaves that flicker. This is used for development and as a fallback.

**Memory hygiene:** `close()` ImageBitmaps, revoke object URLs, delete GL resources, and avoid holding more than one full-resolution bitmap at a time.

## 10. Diagnostics (for debugging from a phone)

- Global `error` and `unhandledrejection` handlers, plus explicit lens and camera errors, write to a ring buffer of the last 200 entries in IndexedDB.
- **Settings → Diagnostics shows:**
  - app version and build,
  - user agent,
  - GL renderer and vendor (`WEBGL_debug_renderer_info` where available),
  - `MAX_TEXTURE_SIZE` and float render target support,
  - camera track settings and capabilities, and whether ImageCapture is supported,
  - storage estimate and persistence status,
  - service worker state,
  - current lens and preview resolution,
  - recent errors.
- **Copy diagnostics** copies a compact JSON report to the clipboard so Mark can paste it into an agent task.
- **FPS overlay** toggle for the viewfinder.

## 11. Export and sharing

- **Share** uses the Web Share API with files (`navigator.canShare({ files })`), so images can go straight to Photos, Lightroom, or messages. If that's unavailable, fall back to a download link.
- **Filename:** `tremuloides_YYYYMMDD_HHMMSS_<lensId>.jpg`.
- **Embedded metadata** (date, GPS, lens and parameters) is in the backlog (B1). Canvas export strips EXIF.

## 12. Quality bar and checks

- **Scripts:**
  - `npm run typecheck`, `npm test`, `npm run build`
  - `npm run check:offline`
  - `npm run check`, which runs all of the above.
- **`check:offline`** (`scripts/check-offline.mjs`) fails if:
  - the built `dist/` references any external `http(s)://` resource. Allow-list only non-fetching strings such as license URLs in comments, the SVG namespace, and `<a href>` links to docs.
  - the generated precache manifest is missing `index.html`, any emitted JS or CSS file, any worker, or the web manifest.
- **Unit tests cover:**
  - Oklab/Oklch conversions and nearest-color matching,
  - k-means determinism for a given seed,
  - PRNG determinism,
  - parameter defaults and validation,
  - registry integrity: unique ids, valid param specs, and a README for every lens,
  - storage migrations (`fake-indexeddb`),
  - filename and version formatting.
- **Optional GPU smoke test.** If the environment can install a headless Chromium with software WebGL, add a test that renders every lens on the test pattern and checks the output isn't blank or NaN. If not, skip it and say so in the PR.
- **Performance targets** on a recent mid-to-high-end Android phone:
  - cold start to live viewfinder under 2 s once cached,
  - realtime lens preview at 24 fps or better,
  - 12 MP final render in under 5 s for realtime lenses,
  - JS bundle under 250 KB gzipped for M1.

## 13. CI/CD

- **`ci.yml`:** runs on pull requests and on pushes to non-`main` branches. Steps: `npm ci`, then `npm run check`.
- **`deploy.yml`:** runs on push to `main` and on `workflow_dispatch`.
  - Run `npm ci` and `npm run check`.
  - Build with `BASE_PATH="/${{ github.event.repository.name }}/"`, then run `npm run check:offline` again on that build, since it's the one that ships.
  - Upload the Pages artifact and deploy with `actions/deploy-pages`.
  - Required permissions: `pages: write`, `id-token: write`.
- **`vite.config.ts`** reads `base` from `process.env.BASE_PATH ?? '/'`. The manifest `scope`, `start_url`, and the service worker scope all derive from it.
- **Build version:** inject `package.json` version, the short SHA from `GITHUB_SHA` (or `git rev-parse` locally, `dev` as fallback), and the build date with Vite `define`.
- **Prerequisite done manually by Mark:** repo Settings → Pages → Source = "GitHub Actions".

---

## 14. Milestones

Each milestone is one PR unless noted. Default lens after M2: Ink & Wash.

### M1 — Foundation
**Scope:**
- Project scaffold, CI/CD (§13), and the PWA manifest and icons. Icon: a stylized aspen leaf in gold on a near-black background. Include maskable variants.
- The complete offline and update behavior from §5.
- WebGL2 helper layer and the lens system (§6), with the registry and auto-generated parameter UI.
- **Lens: Original.** Passthrough.
- **Lens: Posterize.** Oklab lightness quantized into N levels (2–12, default 5), with a saturation boost (0–2, default 1.2) and an optional soft-step mode. This proves the realtime pipeline end to end.
- Viewfinder, Editor, Gallery, and Settings (§8), the capture pipeline including geolocation, import, and the test pattern (§9), Diagnostics (§10), and Export (§11).
- Storage with schema version 1 and the migration framework.
- `docs/TESTING.md` with a phone test checklist covering install, the offline airplane-mode test, capture, gallery, share, and update.
- `CHANGELOG.md` and `README.md` (what the app is, dev commands, deploy notes).

**Acceptance:**
1. `npm run check` passes, and deploying to Pages works from `main`.
2. On first load, the app can be installed from Chrome and shows "Ready to work offline".
3. With the phone in airplane mode, the app launches, captures with both lenses, saves to the gallery, re-edits, and shares.
4. After a new deploy and with connectivity, the update banner appears. Tapping Reload switches to the new version, Settings shows the new SHA, and existing captures are intact.
5. Diagnostics shows device info, and Copy diagnostics produces JSON.

### M2 — Ink & Wash lens (`ink-wash`)
A painterly, illustrated "cartoon" look built from classic non-photorealistic rendering techniques.

**Pipeline (GPU, multi-pass):**
1. Convert to linear RGB and Oklab as needed.
2. Compute the structure tensor from Sobel gradients and smooth it with a Gaussian (σ about 2 ref px). Derive the local orientation and anisotropy.
3. **Anisotropic Kuwahara filter** (Kyprianidis et al. 2009): 8 sectors with Gaussian sector weighting. Radius = Brush size. Sharpness `q` controls sector weighting. This flattens texture while keeping edges and makes brush-like strokes that follow the image's structure.
4. **Color stylization** by palette mode:
   - *Auto:* k-means in Oklab (k = Colors) on a ~128 px downsample, computed in a worker. Cache the palette and refresh it about once a second in the preview; for stills, compute it from the still. Map each pixel to a soft blend of its nearest two palette colors (the blend sharpness is internal).
   - *San Juan:* fixed palette. Map to the nearest color in Oklab, with a slight smoothing at boundaries.
     - Aspen Gold `#E9B825`, Ember `#D96A27`, Iron Red `#A4412E`
     - Spruce `#2E4A3B`, Sage `#7E8F6A`, Sky `#4E86C8`
     - Granite `#8B8781`, Snow `#F3F2EC`, Ink `#1A1C21`
   - *Gouache:* quantize Oklab lightness to Colors levels and keep hue, slightly boosting chroma.
   - *Mono ink:* paper-white wash with gray tones (3–4 levels) under ink lines.
5. **Ink lines:** XDoG (Winnemöller 2012) on Oklab lightness, with σ = Line weight, k = 1.6, and the sharpening and threshold derived from Line amount. If performance allows, add the *Flow* line style, which smooths the DoG along the structure tangent (flow-based DoG) for brushier, connected lines.
6. **Composite:** multiply the ink color over the stylized color, then add an optional procedural paper grain and a slightly warm paper white.

**Params** (defaults are starting points; tune them for autumn landscapes):

| Id | Label | Type | Range / options | Default |
|---|---|---|---|---|
| `brush` | Brush size | range | 2–14 ref px | 6 |
| `sharpness` | Edge sharpness | range | 1–16 | 8 |
| `palette` | Palette | select | Auto / San Juan / Gouache / Mono ink | Auto |
| `colors` | Colors | range | 3–12 (Auto and Gouache) | 6 |
| `lineWeight` | Line weight | range | 0.5–4 ref px | 1.4 |
| `lineAmount` | Line amount | range | 0–1 | 0.6 |
| `lineStyle` | Line style | select | Clean / Flow | Clean |
| `ink` | Ink color | color | — | `#1A1C21` |
| `paper` | Paper texture | toggle | — | on |
| `quality` | Quality | select | Fast / Balanced / Best (final renders use at least Balanced) | Balanced |

**Acceptance:**
- Smooth live preview (target 24 fps or better with adaptive resolution) and a final 12 MP render in under 5 s.
- Looks good on golden aspens against dark conifers and blue sky.
- Preview matches the final render (§6.2).
- Lens README explains the algorithm, with references.

### M3 — Quake lens (`quake`, temporal)
Time-displacement and slit-scan imaging that turns trembling aspen leaves into flowing gold.

**Frame history:**
- A ring buffer held in a `TEXTURE_2D_ARRAY`, at `historyScale` × preview resolution.
- Frame count adapts to a GPU memory budget of about 150 MB or less (up to 64 frames).
- Diagnostics shows the actual count and resolution.

**Modes:**
- *Rows:* each output row samples a frame delayed in proportion to its y position. Direction: top-older or bottom-older.
- *Columns:* the same, along x.
- *Radial:* the center is "now", and the edges are progressively older.
- *Luma:* brighter pixels lag more, so the sunlit leaves smear while trunks stay crisp.
- *Slit-scan:* while recording, the center column (or row) of each frame is appended to a growing image. Panning the phone stretches the grove into ribbons. Stop to finish.

**Params:** Mode, Span (4–64 frames, default 24), Direction, Smooth (interpolate between frames, default on), Mix with live (0–1, default 0).

**Capture:**
- Shutter starts a 2–4 s burst recording at the highest resolution the memory budget allows (for example 1920×1080 with fewer frames), then renders the still from that burst. Record the actual output resolution in the capture.
- Slit-scan uses start/stop recording.

**Loop export (nice to have):** record a 5 s clip of the live rendered canvas using `canvas.captureStream()` and `MediaRecorder`, and share it.

**Acceptance:** smooth preview, all modes working, burst capture saved, and memory cleaned up when leaving the lens.

### M4 — Field Log and Chromatograph
A passive color diary of the trip, plotted against time and elevation.

**Per capture:**
- In a worker, compute a 6-color palette with weights (k-means in Oklab, using the original, downsampled to about 160 px).
- Compute a **warm index**: the fraction of pixels in the autumn-foliage range (yellow–orange–red Oklch hues with chroma ≥ 0.08 and moderate lightness). Calibrate the thresholds and document them.
- **Backfill** every existing capture on first run, and process new captures automatically.

**Trips:** a named date range, with a default trip "San Juans 2026" covering the first capture date onward. The trip is editable.

**Field Log screen:**
- *Timeline:* each capture's palette shown as a stripe, grouped by day.
- *Elevation:* a time × altitude plot, with each point colored by its dominant warm color.
- *Constellation:* lat/lon positions plotted as points, with no basemap (offline), connected in time order.

**Chromatograph export:** a print-ready PNG poster at 4800×7200.
- Layouts (seeded): Stripes (by time or by elevation), Rings, and Grid.
- Minimal typography: trip name, dates, and elevation range.
- Share or download.

**Acceptance:** works offline, backfill completes, poster exports, and captures without GPS are handled gracefully.

### M5 — Stained Glass lens (`stained-glass`)
- **Voronoi on the GPU** using the jump flooding algorithm.
- **Seeds:** N seeds (200–6000, default 1800), placed with probability proportional to edge magnitude plus a base density, using a seeded PRNG.
- **Cell color:** the average color of the cell (an approximation from mip-level sampling is acceptable), with an optional slight color "lift".
- **Lead lines:** width 0.5–6 ref px, default 2.
- **Glass effect:** subtle noise texture and an inner glow.
- **Params:** Cells, Edge attraction (0–1), Lead width, Lead color, Glow (0–1), Texture (toggle).
- In the realtime preview, seeds are re-placed at most twice a second to avoid flicker. A Freeze toggle locks seed positions.

### M6 — Flow Painter lens (`flow-painter`, still)
- **Tangent field:** derived from the smoothed structure tensor.
- **Strokes:** placed in coarse-to-fine layers (e.g. three layers, 5k → 50k → 150k strokes, scaled by Detail).
- Each stroke follows the tangent field for a length set by Stroke length, taking its color from the source at its start point with a small Oklab jitter.
- Strokes are drawn as instanced, textured quads with alpha. The render is progressive and shows live progress.
- **Params:** Detail, Stroke length, Stroke width, Color jitter, Layers (1–4), Canvas tone, and New seed.
- The viewfinder shows a simplified preview (a single coarse layer) or the original image with a "renders after capture" label.

### M7 — Ridgeline Score lens (`ridgeline`, still plus audio)
Turns the skyline of the photo into music.

**Skyline detection:**
- For each column, scan down from the top while pixels look like sky: high lightness, blue-ish or neutral, low local texture.
- The first non-sky pixel is the ridge.
- Clean up with a median filter, outlier rejection, and a minimum confidence. If confidence is low, fall back to the strongest horizontal edge contour.
- Draw the traced ridgeline over the image, with an animated playhead during playback.

**Music:**
- Sample the ridge at Notes points (16–64, default 32). Height maps to a scale degree within a 2-octave Range.
- Settings: Scale (Major pentatonic / Minor pentatonic / Dorian / Lydian / Mixolydian) and Root (C–B, default D).
- Steep sections produce shorter notes.
- Bright warm clusters below the ridge trigger soft mallet percussion.
- The seed controls humanization (timing and velocity).

**Synthesis:** Web Audio only, with no samples to download. Use simple subtractive voices (triangle or sine with an envelope, plus a soft pluck) and a procedurally generated impulse-response reverb. Tempo 60–140 BPM, default 84.

**Export:**
- WAV, rendered with `OfflineAudioContext`.
- **MIDI**: a standard MIDI file from a small in-repo SMF writer, for use in a DAW.
- The annotated image.

### M8 — Topo lens (`topo`)
- Treat Oklab lightness, blurred by Smoothing (ref px), as elevation.
- **Contours** at Levels (8–60, default 24) using marching squares in a worker on a downsampled grid (about 1000 px long edge). Simplify the paths (Douglas–Peucker).
- **Index contours** every 5th level, drawn thicker.
- **Styles:** USGS (brown `#8B5A2B` on cream `#F4EEDC`, with a blue tint for sky regions), Night (gold on ink), Blueprint.
- **Hillshade underlay** toggle.
- **Exports:** PNG, and a **plotter-ready SVG** (one path per level, grouped and labeled by level).
- **Realtime preview:** a GPU iso-line approximation (fract-based lines with screen-space derivatives). The final render uses the vector contours.

## 15. Backlog (not scheduled)

- **B1.** Write EXIF (DateTimeOriginal, GPS, Software, and lens parameters in UserComment) into exported JPEGs.
- **B2.** Tiled rendering beyond `MAX_TEXTURE_SIZE` for full-resolution imports from dedicated cameras.
- **B3.** Capacitor wrapper and an APK build in GitHub Actions, signed with a keystore stored as a repo secret.
- **B4.** Zoom and tap-to-focus, where track capabilities allow.
- **B5.** Lens presets, and shareable preset links.
- **B6.** Batch re-render of a selection with a new lens.
- **B7.** WebGPU code path.
- **B8.** Dual-lens blend, e.g. Topo lines over Ink & Wash.

## 16. Assumptions and open questions

- Target device: a recent Android phone with current Chrome. If camera APIs behave differently on Mark's device, Diagnostics should make that visible.
- GitHub Pages is served from a public repository (or private, on GitHub Pro).
- The build agent can't test the real camera or the phone's GPU. Real-device testing happens on Mark's phone, guided by `docs/TESTING.md`.
- Mark will tune lens defaults from field use. Expect follow-up "tuning" PRs that change defaults and bump lens `version`.
