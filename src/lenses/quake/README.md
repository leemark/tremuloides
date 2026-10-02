# Quake (`quake`, temporal)

Time displacement and slit-scan imaging. Every part of the picture comes from a different moment, so trembling aspen leaves smear into flowing gold while still things stay crisp.

## How it works
- **Frame history:** a ring buffer of recent frames in a `TEXTURE_2D_ARRAY` (RGBA8), see `src/gl/history.ts`.
  - The live preview keeps one at half the camera resolution, with up to 64 frames inside a 150 MB budget.
  - Diagnostics (`temporal.history`) shows its size and fill.
- **Time-displacement modes:** each pixel samples the frame `t × Span` frames ago, where `t` (0–1) depends on the mode. With **Smooth** on, it interpolates between neighbouring frames.

  | Mode | `t` |
  |---|---|
  | Rows | Top rows are oldest |
  | Columns | Left columns are oldest |
  | Radial | Centre is now, edges are oldest |
  | Luma (default) | Bright pixels lag most (sunlit leaves), dark trunks stay sharp |

  **Direction: Reversed** flips `t`. **Mix with live** blends the current frame back in.
- **Slit-scan:** tap the shutter to start, pan the phone, and tap again to stop. Each new frame appends a thin vertical slit from the centre of the frame to a growing strip. While recording, the viewfinder shows the strip as it grows.
  - Slit width is height / 240, so about 8 s at 30 fps makes a roughly square image.
  - The strip is up to 4096 px wide, and recording stops automatically when it's full.
  - Reversed builds the strip right to left, for panning the other way.

## Capture
- **Time modes:** the shutter records a **burst** of Span + 2 frames at the highest resolution that fits the 150 MB budget (at Span 24 that's about 1630×920), then renders the still from it with the same shader as the preview. The newest frame is kept as the original.
- **Slit-scan:** saves the strip itself. There's no separate original.
- Temporal lenses need live video, so the Editor (imports and re-edits) doesn't offer them.

## Params
| Id | Range | Default |
|---|---|---|
| `mode` | rows / columns / radial / luma / slit | luma |
| `span` | 4–64 frames | 24 |
| `direction` | normal / reverse | normal |
| `smooth` | toggle | on |
| `mix` | 0–1 | 0 |

Delays are measured in frames, so preview and capture behave the same at any resolution. There are no spatial params.

## Not yet
- Loop video export (`MediaRecorder`) from PRD M3 "nice to have".
- Horizontal (row) slits for vertical pans.

## References
- Golan Levin, *An Informal Catalogue of Slit-Scan Video Artworks* (2005–).
- Time-displacement video effects in the tradition of Zbigniew Rybczyński's *Tango* and later slit-scan work.
