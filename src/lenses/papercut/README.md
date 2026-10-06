# Papercut

The scene as layered paper cut-outs in a shadow box: sky, far ridges, near ridges and trees each become a flat sheet of card, and nearer sheets cast soft shadows on the ones behind.

## Algorithm
1. Oklab L, a, b at ≤ 640 px (preview) or ≤ 1600 px (final), in an RGBA16F target. L is blurred by Cut smoothness (ref px), and color by 1.5× that (one separable pass, per-channel sigma).
2. **Sheets.** L × Layers gives the band index; the band decides depth. Darker is nearer by default, which suits landscapes, where haze makes distant ridges lighter. *In front: Lighter* reverses it.
3. **Sheet color.** Band-centre lightness, with the area's hue snapped to 16 steps and chroma snapped to 0.035 steps, so each region is one flat paper color. White and Kraft papers use fixed tints.
4. **Shadow.** 8 taps toward the light (upper left) up to Shadow depth: if a nearer sheet is there, darken by up to 42%, fading with distance.
5. **Cut edge.** A thin lit rim where the sheet behind lies toward the light, plus paper fibre noise varying per sheet.

## Params
| Id | Range | Default |
|---|---|---|
| `layers` | 3–8 | 5 |
| `smoothing` | 2–30 ref px | 10 |
| `shadow` | 0–40 ref px | 14 |
| `paper` | photo / white / kraft | photo |
| `order` | dark / light in front | dark |
