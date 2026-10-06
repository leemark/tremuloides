// Draws ink lines (difference of Gaussians) or contour lines over a lens's output.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_base;   // the lens output
uniform sampler2D u_field;  // r = L·blur σ, g = L·blur kσ, b = L·blur (contours)
uniform int u_kind;         // 1 ink, 2 contours
uniform float u_strength;
uniform vec3 u_ink;
uniform float u_phi;        // ink steepness
uniform float u_levels;
uniform float u_lineHalf;   // contour half width, px
void main() {
  vec3 base = texture(u_base, v_uv).rgb;
  vec3 f = texture(u_field, v_uv).rgb;
  float ink = 0.0;
  if (u_kind == 1) {
    // XDoG-style: dark where the centre is darker than its surround.
    float d = f.r - 0.985 * f.g;
    ink = clamp(-d * u_phi, 0.0, 1.0);
  } else if (u_kind == 2) {
    float h = f.b * u_levels;
    float k = floor(h + 0.5);
    float dist = abs(h - k) / max(fwidth(h), 1e-5);
    bool isIndex = mod(k, 5.0) < 0.5;
    float hw = u_lineHalf * (isIndex ? 1.8 : 1.0);
    ink = 1.0 - smoothstep(hw - 0.6, hw + 0.6, dist);
    if (k < 0.5 || k > u_levels - 0.5) ink = 0.0;
  }
  outColor = vec4(mix(base, u_ink, ink * u_strength), 1.0);
}
