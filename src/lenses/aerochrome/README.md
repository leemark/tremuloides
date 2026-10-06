# Aerochrome

The look of Kodak Aerochrome color-infrared film: leaves turn crimson and magenta, skies go deep, and there's the soft bloom of infrared halation. Mono IR gives the classic black-and-white infrared look: white, glowing trees under a near-black sky.

## Algorithm
Phone cameras don't record infrared, so it is **estimated** per pixel:
1. **Foliage weight** from Oklab hue and chroma: gold through green and teal (45–205°, chroma above 0.02–0.07), plus vivid orange-red leaves (18–85° with chroma above 0.10–0.15, so muted red rock and soil don't count). Deep shadow is excluded.
2. **IR value.** Foliage gets `0.25 + 1.4·Y`: leaves are bright in IR even when they look dark. Everything else gets `0.95·R + 0.1·G` (rock and soil roughly track red), fading to `0.35·Y` for blue things (sky and water reflect little IR).
3. **Color-infrared mapping**, as on the film: display R ← IR, G ← red, B ← green. Leaves are treated as if they still held chlorophyll (red × (1 − 0.8·foliage)), so autumn gold and orange go crimson like summer green, instead of the lime-yellow a literal simulation gives. *Hot pink* lifts blue in foliage toward magenta.
4. **Mono IR**: the IR value with a gentle S-curve.
5. **Halation**: highlights above Y 0.55–0.95, blurred at quarter resolution (σ = 14 ref px), screen-blended back.

## Params
| Id | Range | Default | Notes |
|---|---|---|---|
| `variant` | aerochrome / pink / mono | aerochrome | |
| `foliage` | 0–1.5 | 1 | How strongly leaves glow |
| `saturation` | 0–2 | 1.15 | Color variants |
| `halation` | 0–1 | 0.35 | Bloom |

## References
- Kodak Aerochrome III Infrared Film 1443: false-color mapping of IR/red/green to red/green/blue.
- Near-infrared reflectance of vegetation (the "red edge"): chlorophyll absorbs red, and leaf cell structure reflects NIR.
