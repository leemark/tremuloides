# Impasto

Flow Painter's brushwork laid on as thick oil paint. Every stroke leaves a ridge of paint, combed by the bristles, and a light rakes across the canvas so the ridges catch it on one side and fall into shade on the other. Wet paint glints.

Impasto is Flow Painter with a second output per stroke: the strokes, layers, faces and timelapse are Flow Painter's own code (`createPainter(kit, reliefOf)` in `../flow-painter/index.ts`), so anything that changes there changes here too.

## Algorithm
1. **Strokes** are planned and traced exactly as in Flow Painter, with bigger default brushes (Stroke length 56, Stroke width 9, Color jitter 0.35): impasto is laid on with a loaded brush.
2. **Paint and thickness** (`impasto.frag.glsl`). Each stroke writes two render targets at once: its color (as `stroke.frag.glsl`) to the paint, and its thickness to a height target (RGBA16F, RGBA8 where the GPU can't render to half floats). Both blend "over" with the stroke's coverage, so a stroke flattens the ridges beneath it and its own edges stand up from them. Thickness is:
   - a rounded bead across the stroke, √(1 − t²), as high as Paint thickness × brush width / 3,
   - combed by the bristles: each bristle's ridge is 80–100% of the bead, blended smoothly into its neighbors',
   - thick where the brush lands, thinning to 55% as it drags, with a lip of paint where it lifts (at 86% of its length),
   - 75% as thick on long strokes as on short dabs, and scraped down to 20% where bristles run dry.

   Heights are stored in reference px / 32 (`HEIGHT_UNIT`), so the 8-bit fallback keeps the same range: a coarse stroke at full thickness stays below 1.
3. **Light** (`light.frag.glsl`), the final pass. Normals come from the height's slope over ±1.5 px (per reference px, so a preview and a save are lit alike), plus the canvas weave as a height where the paint is thin. Diffuse shading is divided by flat paint's own lighting, so flat paint keeps its exact color: shade = clamp(0.5 + 0.5 · (n·L / L.z), 0.55, 1.3). A Blinn highlight (exponent 32), minus flat paint's, adds the gloss. The light sits at 0.75 elevation; Light from turns it around the picture.

Faces are painted as in Flow Painter, in finer strokes, so their ridges are finer too.

## Params
Flow Painter's params (with the defaults above), plus:

| Id | Range | Default | Notes |
|---|---|---|---|
| `thickness` | 0–1 | 0.6 | Bead height, as a share of brush width / 3. 0 is flat paint lit evenly |
| `gloss` | 0–1 | 0.4 | Strength of the wet-oil highlights |
| `lightAngle` | 0–360° | 135 | Direction the light comes from: 0 is the right, 90 above, 180 the left |

Seeded: New seed moves every stroke. Painterly turns the light with the phone's tilt; here it's a slider.
