# Overlay (lens blends)

Lines drawn over the output of **any** lens, set in the lens sheet (viewfinder) or the editor:

- **Ink lines:** XDoG-style edges. Oklab L blurred at σ = 1.1 and 1.76 ref px; ink where `Gσ − 0.985·Gkσ < 0`, steepness 45. These are the same kind of lines as Ink & Wash, so you can put ink on Stained Glass, Flow Painter or Posterize.
- **Contours:** L blurred at σ = 8 ref px, 20 levels, index lines every 5th level (1.8× thicker), anti-aliased with `fwidth` as in Topo. Topo contour lines over Ink & Wash, the photo itself, or any lens.

The field is computed from the **lens input** (the photo), not the lens output, so lines follow the real scene. It's an RGBA16F target at ≤ 1280 px (preview) / ≤ 2048 px (final) long edge, with one separable blur using a per-channel sigma (`blur3.frag.glsl`). The overlay is stored per capture (`Capture.overlay`) and reused by Re-edit, New seed and batch re-render. Video clips record it as shown.

The overlay sits on top of the lens instead of running a second full lens. That keeps live preview cost to three cheap passes.
