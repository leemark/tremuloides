// Edge orientation as a doubled-angle vector, weighted by gradient strength and stored in 0–1:
//   v = w · (cos 2φ, sin 2φ),  w = |g|² / (|g|² + ε²),  stored as v · 0.5 + 0.5.
// Blurring this is equivalent to smoothing the structure tensor, but the values stay in a normal
// range, so it survives GPUs that flush tiny half-floats to zero or only render to 8-bit targets.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_texel;    // one field texel in uv
uniform float u_lod;     // mip level matching the field resolution
uniform float u_gradScale; // texels per reference px (converts per-texel gradients to per-ref-px)
uniform float u_flat;    // ε: gradients (L per ref px) below this count as flat
float lum(vec2 o) { return srgbToOklab(textureLod(u_src, v_uv + o * u_texel, u_lod).rgb).x; }
void main() {
  float tl = lum(vec2(-1.0, -1.0)), tc = lum(vec2(0.0, -1.0)), tr = lum(vec2(1.0, -1.0));
  float ml = lum(vec2(-1.0, 0.0)), mr = lum(vec2(1.0, 0.0));
  float bl = lum(vec2(-1.0, 1.0)), bc = lum(vec2(0.0, 1.0)), br = lum(vec2(1.0, 1.0));
  // Scaled up before squaring so nothing gets near half-float denormals.
  float gx = ((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl)) / 8.0 * u_gradScale / u_flat;
  float gy = ((bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr)) / 8.0 * u_gradScale / u_flat;
  float m2 = gx * gx + gy * gy; // in units of ε²
  vec2 v = m2 > 1e-6 ? vec2(gx * gx - gy * gy, 2.0 * gx * gy) / (m2 + 1.0) : vec2(0.0);
  outColor = vec4(v * 0.5 + 0.5, 0.5, 1.0);
}
