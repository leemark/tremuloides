# Flow Painter

Paints the photo with brush strokes that follow the shapes in the scene: along ridgelines, up aspen trunks, and swirling with the clouds. Strokes go down coarse to fine, like a painter blocking in big shapes and then adding detail where the picture needs it.

Everything runs on the GPU. The stroke geometry is built in the vertex shader, so there are no vertex buffers and no CPU work per stroke.

## Algorithm
1. **Color source.** The photo is copied into a mipmapped texture, so each mip level is a blurred version matching a brush size.
2. **Flow field.** Sobel gradients of Oklab L (per reference px) form the structure tensor (Jxx, Jyy, Jxy) at ≤ 1024 px (final) or ≤ 512 px (preview). It is smoothed with a Gaussian of σ = 2 × Stroke width (4–24 ref px). The flow runs along the minor eigenvector. Where the tensor is weak or isotropic (coherence < 0.08…0.35, RMS gradient < 0.0015…0.006 L per ref px), the flow blends toward horizontal, so flat skies get calm horizontal strokes.
3. **Underpainting.** The canvas tone is mixed 40/60 with a heavily blurred wash of the photo, so gaps between strokes read as paint.
4. **Layers** (`plan.ts`). The finest brush is Stroke width, and each coarser layer doubles it. Stroke length grows with √(scale). Each layer uses a jittered grid sized so that about 2.2 × Detail strokes cover each pixel (2× that for the first layer). Cells are visited in a scrambled order, (i × p) mod n with p coprime to n, so overlaps don't run in one direction.
5. **Strokes** (instanced triangle strips, `stroke.vert.glsl`). Each stroke takes its position, size, color jitter and bristle seed from a hash of (cell, layer, seed). Its color comes from the mip level matching its brush, with an Oklab jitter scaled by Color jitter. The spine is traced from the centre in both directions with midpoint steps along the flow field. The sign is kept consistent so strokes don't fold, and tracing stops after 2 steps where the color differs from the stroke's by more than 0.28 (0.45 on the first layer), following Hertzmann's stopping rule.
6. **Refinement.** A stroke in a finer layer is drawn only where its color differs from the previous layer's blur by more than 0.06 / Detail (with a random gate), so fine brushes concentrate on detail.
7. **Brush texture** (`stroke.frag.glsl`). Bristle streaks across the stroke, soft edges, tapered ends, and dry-brush gaps toward the tail.
8. **Canvas.** A faint weave and grain over the finished paint. It fades out on small previews to avoid moiré.

The final render draws strokes in batches of 3000 and yields to the UI every 2 batches. Progress is reported through `onProgress`, shown as "Painting… N%". The live preview uses the same code with 8 segments per stroke instead of 12, and keeps only the coarsest layers that fit a 24,000-stroke budget.

## Params
| Id | Range | Default | Notes |
|---|---|---|---|
| `detail` | 0.5–2 | 1 | Stroke density, and how readily fine layers paint |
| `strokeLength` | 10–120 ref px | 40 | Finest layer; coarser layers are longer |
| `strokeWidth` | 2–20 ref px | 6 | Finest brush |
| `jitter` | 0–1 | 0.45 | Oklab color variation per stroke |
| `layers` | 1–4 | 3 | Coarse-to-fine passes |
| `canvas` | linen / umber / gesso / slate | linen | Ground tone in the underpainting |

Seeded: New seed moves every stroke.

## References
- Aaron Hertzmann, "Painterly Rendering with Curved Brush Strokes of Multiple Sizes" (SIGGRAPH 1998).
- Peter Litwinowicz, "Processing Images and Video for an Impressionist Effect" (SIGGRAPH 1997).
- Jan Eric Kyprianidis et al., "Image and Video Abstraction by Anisotropic Kuwahara Filtering" (2009), for the structure tensor.
