in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform float u_levels;     // number of lightness bands
uniform float u_saturation; // chroma multiplier
uniform float u_soft;       // half-width of the band transition (0 = hard steps)

void main() {
  vec3 lab = srgbToOklab(texture(u_input, v_uv).rgb);

  // Band centres sit at (i + 0.5) / N. Shift so centres land on integers, then
  // step between neighbouring centres at the band boundary.
  float x = lab.x * u_levels - 0.5;
  float n = floor(x);
  float f = x - n;
  float stepped = u_soft > 0.0 ? smoothstep(0.5 - u_soft, 0.5 + u_soft, f) : step(0.5, f);
  float L = clamp((n + stepped + 0.5) / u_levels, 0.0, 1.0);

  vec2 ab = lab.yz * u_saturation;
  outColor = vec4(oklabToSrgb(vec3(L, ab)), 1.0);
}
