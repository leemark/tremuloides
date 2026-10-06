# Long Exposure

A neutral-density long exposure from the live camera: streams turn silky, clouds streak, aspens moving in the wind blur into gold mist, and moving lights leave trails. A temporal lens: it needs the live camera and isn't available in the editor.

## How it works
- **Capture (shutter).** Records for *Exposure* seconds from the camera stream at its full resolution. Each frame is converted to **linear light** and stacked in an RGBA16F accumulator: a running mean (weight 1/n) for Smooth and Ghost, a per-channel max for Light trails. Linear light matters: averaging in sRGB would darken highlights the way a real long exposure never does.
- **Handheld steadying** (`align.ts`). Each frame is shrunk to 160 px gray and compared with the first. The shift is the minimum mean absolute difference: a coarse ±10 px search in 2 px steps, a ±2 px refinement, then a parabolic sub-pixel fit. The frame is sampled at that offset before stacking, which cancels small translational hand shake (not rotation).
- **Ghost** mixes 35% of the latest aligned frame over the mean: soft trails behind a sharp present.
- **Original** is the first frame (sharp), so hold-to-compare and Re-edit work.
- **Live preview.** An exponential moving average (α = 1 / (0.5 · seconds · 30)) or a decaying lighten of preview frames, updated only when a new camera frame arrives (detected via the frame history head).

## Params
| Id | Range | Default | Notes |
|---|---|---|---|
| `mode` | smooth / trails / ghost | smooth | |
| `seconds` | 1–10 | 3 | Exposure length |
| `steady` | toggle | on | Frame alignment |

## References
- Classic image stacking: mean stacking for noise and motion blur, lighten or max stacking for star and light trails.
- Kuglin & Hines, phase correlation; here a cheaper SAD block search on thumbnails.
