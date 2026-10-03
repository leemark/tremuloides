# Topo

Reads the scene's lightness as elevation and draws it as a contour map. Bright aspens become hilltops and dark spruce become valleys. The sky reads as a high plateau, tinted blue in the USGS style.

## Algorithm
1. **Field.** Convert to Oklab. L is the elevation. A blue-sky mask is computed from b < −0.015…−0.04, L > 0.45…0.55 and a < 0.02…0.05, with smooth edges. The field is rendered to an RGBA16F texture at up to 768 px (preview) or 2048 px (final) on the long edge. If half-float targets aren't available it falls back to RGBA8.
2. **Smoothing.** A separable Gaussian with σ = Smoothing × (short edge / 1080), so preview and final renders match.
3. **Lines (GPU).** With h = L × levels and k = round(h), the distance to the nearest contour in output pixels is |h − k| / fwidth(h). That gives anti-aliased lines of constant width at any slope. Every 5th level is an index contour, drawn 1.9× thicker in a darker ink. Levels 0 and `levels` are never drawn.
4. **Hillshade.** Central-difference gradient of the field, used as a surface normal and lit from the upper left (north-west on a map). The shade is clamped to 0.72–1.1 and multiplied into the paper.
5. **SVG export (CPU, in a Web Worker).** The original photo is resized to a 1000 px long edge. The same field and blur feed marching squares (saddles resolved by the cell centre), and the segments are joined into polylines. Specks shorter than 6 grid px are dropped, then Douglas–Peucker simplification is applied with a 0.5 px tolerance (closed loops measured from their start point). Each level becomes its own Inkscape layer, `level-<k>`, labeled and marked "(index)" where it applies. The paper is a separate "Background" layer that you hide before plotting.

The final raster render uses the GPU path at full resolution rather than rasterizing the vector contours. That keeps it identical to the live preview, and it's sharper and faster. The SVG and the raster use the same field, levels and smoothing, so their lines match.

## Params
| Id | Range | Default | Notes |
|---|---|---|---|
| `levels` | 8–60 | 24 | Contours at L = k / levels |
| `smoothing` | 0–20 ref px | 8 | Gaussian σ before contouring |
| `style` | usgs / night / blueprint | usgs | Paper, line and index colors |
| `hillshade` | toggle | on | Shaded relief under the lines |
| `lineWeight` | 0.5–4 ref px | 1.2 | Index contours are 1.9× (raster) or 2× (SVG) |

## References
- W. E. Lorensen and H. E. Cline, "Marching Cubes" (1987), and its 2D form, marching squares.
- D. Douglas and T. Peucker, "Algorithms for the reduction of the number of points required to represent a digitized line" (1973).
- USGS topographic map symbols (index and intermediate contours).
- Björn Ottosson, "A perceptual color space for image processing" (2020).
