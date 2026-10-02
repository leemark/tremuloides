// Structure tensor (E, F, G) storage. Half-float targets store raw values;
// 8-bit fallback targets store a scaled, offset encoding.
uniform float u_encode; // 1.0 when the target is RGBA8
const float TENSOR_GAIN = 16.0;
vec3 decodeTensor(vec4 c) {
  if (u_encode < 0.5) return c.xyz;
  return vec3(c.x, c.y * 2.0 - 1.0, c.z) / TENSOR_GAIN;
}
vec4 encodeTensor(vec3 g) {
  if (u_encode < 0.5) return vec4(g, 1.0);
  vec3 s = g * TENSOR_GAIN;
  return vec4(clamp(s.x, 0.0, 1.0), clamp(s.y * 0.5 + 0.5, 0.0, 1.0), clamp(s.z, 0.0, 1.0), 1.0);
}
// Edge tangent (unit), angle and anisotropy from a smoothed tensor (Kyprianidis et al. 2009).
vec4 tensorFlow(vec3 g) {
  float E = g.x, F = g.y, G = g.z;
  float root = sqrt(max(0.0, (G - E) * (G - E) + 4.0 * F * F));
  float l1 = 0.5 * (E + G + root);
  float l2 = 0.5 * (E + G - root);
  vec2 t = vec2(l1 - E, -F);
  t = length(t) > 1e-8 ? normalize(t) : vec2(0.0, 1.0);
  float A = (l1 + l2) > 1e-8 ? (l1 - l2) / (l1 + l2) : 0.0;
  return vec4(t, atan(t.y, t.x), A);
}
