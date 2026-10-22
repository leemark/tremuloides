# Pointillism

Rebuilds the photo from hundreds of thousands of small dots of pure color, as Seurat and Signac painted: neighboring dots are different pigments, and they blend back into the photo's colors in your eye. Up close it's dots; at arm's length it's the picture.

Everything runs on the GPU. Each dot is an instanced quad whose place, size, shape and pigment come from a hash of its grid cell (`dot.vert.glsl`), so there are no vertex buffers and any window of the picture paints exactly the same dots (Painterly paints its saves in tiles).

## Algorithm
1. **Color source.** The photo is copied into a mipmapped texture, so each mip level is a blurred version matching a dot size.
2. **Ground** (`ground.frag.glsl`). The canvas tone mixed with a heavily blurred wash of the photo (80%; 60% on umber), so the gaps between dots read as light, not holes.
3. **Layers** (`plan.ts`), relative to Dot size *s*:
   - big dots (1.8 *s*) everywhere, 1.2 dots per pixel: the ground is covered;
   - the main dots (*s*) everywhere, 1.7 per pixel;
   - small dots (0.6 *s*), only where their color differs from the main dots' blur by more than 0.05 / Detail (with a random gate): detail gets finer dots.

   Each layer is a jittered grid with cells visited in a scrambled order, (i × p) mod n with p coprime to n (Flow Painter's), so a timelapse fills the picture evenly.
4. **Pigment** (divisionism). The dot's color (from the mip level matching its size) goes to Oklab and gets a random push: ±0.1 in lightness and ±0.1 in a and b at full Color separation, less in hue for dull colors (greys and skin stay calm), and chroma × (1 + 0.25 × separation). The dot takes the **hue and chroma** of the pigment nearest that pushed color (lightness counts only 0.35 as much), and keeps the pushed **lightness**, like a pigment mixed with white or deepened. At separation *k* the dot is *k* of the way from the photo's color to that pigment. Because pushes are random, neighboring dots take different pigments and their average stays near the photo's color: dithering in Oklab. Keeping lightness is what keeps faces and forms readable (snapping lightness to the palette turned mid-tone skin into dark umber).
5. **Palette** (`PALETTES.seurat`, 21 colors): lead white, chrome yellows, orange, vermilion, madder lake, cobalt violet, ultramarine, cobalt and cerulean blue, emerald and viridian, ochre, burnt sienna, tints with white, and deep blue, violet, viridian and umber instead of black. **Photo colors** skips the pigments: each dot is the photo's color with the push.
6. **Dots** (`dot.frag.glsl`). Round, up to 1.35 × as long as wide at a random angle, sizes ±20%, with a wobbly edge, a soft rim and slight unevenness in the paint.
7. **Faces.** With `RenderRequest.faces`, each face gets a layer of its own dots (face width / 40, at least 1.5 ref px, 3 per pixel) painted last over Flow Painter's face ellipse, with the same blend: full weight inside 0.7 × the ellipse, none at 1.4 ×, face dots thinning out and growing toward the main dots across the band. Regular dots more than 1.6 × the face's dot stay out of the face in proportion.
8. **Canvas.** Flow Painter's faint weave and grain over the finished paint.

The final render draws dots in batches of 20,000 and yields to the UI every 4 batches. The live viewfinder keeps its targets and draws the layers that fit 120,000 dots.

## Timelapse
**Timelapse** (Flow Painter's, `timelapseAction(load, dotCount)`) shows the photo, the ground, then every dot going down over about 8 s, coarse to fine, faces last.

## Params
| Id | Range | Default | Notes |
|---|---|---|---|
| `dotSize` | 3–20 ref px | 14 | The main dots |
| `detail` | 0.5–2 | 1 | Dot density, and how readily small dots paint |
| `palette` | seurat / photo | seurat | Pure pigments, or the photo's own colors |
| `separation` | 0–1 | 0.75 | How far dots stray from the photo's color, and how pure they are |
| `ground` | cream / white / umber | cream | Canvas tone between the dots |

Seeded: New seed moves every dot.

## References
- Georges Seurat, *A Sunday Afternoon on the Island of La Grande Jatte* (1884–86); Paul Signac, *D'Eugène Delacroix au néo-impressionnisme* (1899).
- Hertzmann (1998), for the coarse-to-fine layering shared with Flow Painter.
