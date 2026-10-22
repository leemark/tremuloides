// A dot of paint: round with a slightly irregular edge, a soft rim, and a little unevenness in the paint.
in vec2 v_uv;
in vec3 v_color;
flat in float v_seed;
out vec4 outColor;
void main() {
  float a = atan(v_uv.y, v_uv.x);
  float wobble = 1.0 + 0.08 * sin(3.0 * a + v_seed * 40.0) + 0.05 * sin(5.0 * a + v_seed * 17.0);
  float r = length(v_uv) * wobble;
  float alpha = 1.0 - smoothstep(0.72, 1.0, r);
  if (alpha <= 0.0) discard;
  // paint is a touch thicker (darker, richer) at the rim where the brush lifted
  vec3 c = v_color * (0.97 + 0.05 * smoothstep(0.4, 0.95, r) * (v_seed - 0.5));
  outColor = vec4(c, 0.96 * alpha);
}
