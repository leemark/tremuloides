# Ink & Wash (`ink-wash`)

A painterly, illustrated look built entirely from classic non-photorealistic rendering techniques. Paint is flattened into brush-like strokes that follow the image's structure, colors are pulled toward a small palette, and dark ink lines are drawn along edges.

## Pipeline (GPU, 7–8 passes)
1. **Structure tensor:** Sobel gradients of Oklab lightness, at half resolution (stored in RGBA16F; scaled RGBA8 fallback on GPUs without half-float targets).
2. **Tensor smoothing:** separable Gaussian, σ = 2 ref px. Gives the local edge orientation φ and anisotropy A.
3. **Anisotropic Kuwahara filter:** 8 sectors with polynomial weights, the elliptical kernel aligned to the flow, radius = Brush size. Sectors with low variance win, weighted by `1 / (1 + (255·σ²)^(q/2))`, where q = Edge sharpness. This flattens texture but keeps edges, and the elliptical kernel makes strokes follow the image structure.
4. **Ink:** difference of Gaussians on lightness (σ = Line weight, k = 1.6), soft-thresholded on the dark side of edges. Line amount moves the threshold. The *Flow* line style then averages the ink along the tangent flow, connecting it into longer, brushier strokes.
5. **Composite:** the palette is applied, the ink is multiplied over it, and optional paper grain and a warm paper white are added.

### Palettes
| Palette | How it works |
|---|---|
| Auto | k-means in Oklab (k = Colors) on a 128 px sample. It runs in a Web Worker and refreshes about once a second in the preview, easing between updates so it doesn't flicker. Saved photos use a palette computed from the photo itself. Each pixel softly blends its two nearest palette colors. |
| San Juan | Fixed: Aspen Gold `#E9B825`, Ember `#D96A27`, Iron Red `#A4412E`, Spruce `#2E4A3B`, Sage `#7E8F6A`, Sky `#4E86C8`, Granite `#8B8781`, Snow `#F3F2EC`, Ink `#1A1C21` |
| Gouache | Lightness quantized to Colors levels; hue kept, chroma ×1.15 |
| Mono ink | Four warm gray washes under the ink |

The Auto and San Juan palettes keep 15% of the original lightness, so flat areas still have a little modelling.

## Params
| Id | Range | Default | Notes |
|---|---|---|---|
| `brush` | 2–14 ref px | 6 | Kuwahara radius |
| `sharpness` | 1–16 | 8 | Sector weighting q |
| `palette` | auto / sanjuan / gouache / mono | auto | |
| `colors` | 3–12 | 7 | Auto and Gouache only |
| `lineWeight` | 0.5–4 ref px | 1.3 | DoG σ |
| `lineAmount` | 0–1 | 0.6 | Higher = more edges inked |
| `lineStyle` | clean / flow | clean | |
| `ink` | color | `#1a1c21` | |
| `paper` | toggle | on | Grain is sized in ref px, so it looks the same at every resolution |
| `quality` | fast / balanced / best | balanced | Sample density only; final renders use at least Balanced |

## Resolution independence
All spatial sizes are in reference pixels at a 1080 px short edge (PRD §6.2), scaled by `shortEdge / 1080` in `plan.ts`. Kernels keep the same footprint at every size; Quality changes only how densely they're sampled. That's how the 720p preview matches the 12 MP final render.

## References
- Kyprianidis, Kang, Döllner. *Image and Video Abstraction by Anisotropic Kuwahara Filtering.* Computer Graphics Forum 28(7), 2009.
- Kyprianidis. *Anisotropic Kuwahara Filtering with Polynomial Weighting Functions.* EG UK TPCG, 2010.
- Winnemöller, Kyprianidis, Olsen. *XDoG: An eXtended difference-of-Gaussians compendium.* Computers & Graphics 36(6), 2012.
- Kang, Lee, Chui. *Coherent Line Drawing.* NPAR 2007.
- Ottosson. *A perceptual color space for image processing (Oklab).* 2020.
