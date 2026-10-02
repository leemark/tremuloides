# Posterize

Quantizes perceptual lightness into flat bands while keeping each pixel's hue. It's a quick graphic look, and it also serves as the end-to-end test of the realtime lens pipeline.

## Algorithm
1. Convert sRGB to Oklab (Ottosson 2020).
2. Quantize L into N bands with centres at `(i + 0.5) / N`. Soft steps replace the hard step at each band boundary with a `smoothstep` of half-width 0.18 band.
3. Multiply chroma (a, b) by Saturation.
4. Convert back to sRGB and clamp.

## Params
| Id | Range | Default | Notes |
|---|---|---|---|
| `levels` | 2–12 | 5 | Number of lightness bands |
| `saturation` | 0–2 | 1.2 | Chroma multiplier; 0 gives grayscale bands |
| `soft` | toggle | off | Softens band edges |

No spatial parameters, so preview and final renders match at any resolution.

## References
- Björn Ottosson, "A perceptual color space for image processing" (2020).
