# Stained Glass (`stained-glass`)

Turns the scene into leaded glass. The image is divided into Voronoi panes. Panes are smaller and denser along edges and fine detail, so the shapes stay readable. Each pane is filled with the average color under it, lead came runs along every border, and light seems to glow through the glass.

## Pipeline
1. **Seed placement (CPU, deterministic):** the input is downsampled to a 320 px long edge, lightly blurred (two 3×3 box passes, added in v2 so grass and gravel texture don't read as structure), and its Sobel edge magnitude is measured (normalized at the 95th percentile). N seeds are drawn with probability ∝ `(1 − a) + a·6·edge` (a = Edge attraction) using the seeded PRNG, with sub-pixel jitter. Preview and final use the same 320 px sample, so pane layouts match.
2. **Jump flooding (GPU):** seeds are written into a grid (positions packed as 16-bit fixed point in RGBA8, so no float textures are needed), then JFA+1 passes (steps n/2 … 1, 1) find the nearest seed for every texel. The grid is ≤ 1024 px in preview and ≤ 2048 px in final renders.
3. **Glass (GPU, full resolution):** each pixel gathers candidate seeds from the JFA grid (its own texel plus 16 probes on two rings) and picks the exact nearest. Its distance to the nearest perpendicular bisector gives crisp, true-width lead lines at any output size, independent of the JFA grid resolution.
   - **Pane color:** average of 9 taps around the seed (spread 0.4 × typical cell radius), with a slight lightness and chroma lift and a small per-pane variation.
   - **Glass texture:** streaky value noise sized in ref px.
   - **Glow:** panes brighter in the middle, darker toward the lead.
   - **Lead:** a soft-edged band of Lead width with a slight bevel highlight.
4. **Live preview:** seeds are re-placed at most twice a second (or right away when Cells, Edge attraction or the seed changes), and the Voronoi grid is only rebuilt then. Other frames run just the glass pass. **Freeze panes** keeps the current layout, including for the photo you take.

## Params
| Id | Range | Default | Notes |
|---|---|---|---|
| `cells` | 200–6000 | 1800 | Number of panes (resolution-independent) |
| `attraction` | 0–1 | 0.6 | 0 = uniform panes |
| `leadWidth` | 0.5–6 ref px | 2 | |
| `leadColor` | color | `#1a1c21` | |
| `glow` | 0–1 | 0.6 | |
| `texture` | toggle | on | |
| `freeze` | toggle | off | Preview layout is reused for captures |

**Seeded:** New seed reshuffles the panes. With Freeze on, the layout is kept even when the seed changes, and it isn't stored with the photo, so re-edits get a fresh layout from the seed.

## References
- G. Rong, T.-S. Tan. *Jump Flooding in GPU with Applications to Voronoi Diagram and Distance Transform.* I3D 2006.
- A. Hausner. *Simulating Decorative Mosaics.* SIGGRAPH 2001.
- Stained-glass filters in the tradition of Mould, *A Stained Glass Image Filter* (EGSR 2003).

## v3 (v0.17.2)
Seed density is (1 − attraction) × 0.12 + attraction × 8 × edge (was (1 − attraction) + attraction × 6 × edge). At the default attraction of 0.6, flat sky and water get about 100× fewer seeds than strong edges (was 10×), so they read as a few large panes.
