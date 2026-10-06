# Risograph

The look of a Risograph print: two or three flat spot inks (fluorescent pink, blue, yellow, teal…), each laid down by its own stencil drum as halftone dots or grain, a little off-register, with uneven ink and paper tooth.

## Algorithm
1. **Separation** (`separation.ts`, unit-tested). Stacked inks multiply, so in absorbance space (−ln(color / paper), Beer–Lambert) they add. Each ink's absorbance is a vector; a pixel's ink densities are the least-squares solution (pseudo-inverse with slight ridge regularization), clamped to 0–1. Paper → no ink; each pure ink → its own drum. Density and Contrast are then applied per ink.
2. **Screens.** *Halftone dots*: each ink gets its own screen angle (15°, 45°, 75°), Dot size (ref px) and a dot radius ∝ √density, with grainy edges. *Grain*: stochastic dither at ~1 ref px.
3. **Riso character.** Per-ink misregistration (fixed by the seed, so **New seed** re-registers; the first ink stays put); low-frequency density wobble (uneven drum inking); small voids in solid ink; paper tooth.
4. **Composite.** Paper × Π mix(1, ink / paper, coverage), in linear light.

## Params
| Id | Range | Default |
|---|---|---|
| `inks` | Pink+Teal, Pink+Blue+Yellow, Orange+Blue, Red+Black, Green+Pink | Pink+Blue+Yellow |
| `screen` | dots / grain | dots |
| `dot` | 3–16 ref px | 6 |
| `misregister` | 0–12 ref px | 3 |
| `density` | 0.5–2 | 1.1 |
| `contrast` | 0.6–2 | 1.25 |

Ink colors approximate Riso Fluorescent Pink, Teal, Blue, Yellow, Orange, Bright Red, Black and Green on cream paper (#F4F0E6).
