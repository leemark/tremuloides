// One jump-flooding step (Rong & Tan 2006): keep the nearest seed seen at ±step offsets.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_size;  // grid size in texels
uniform float u_step; // texels
void main() {
  vec4 best = vec4(0.0);
  float bd = 1e20;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 q = v_uv + vec2(float(i), float(j)) * u_step / u_size;
      if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) continue;
      vec4 c = texture(u_src, q);
      vec2 s = decodeSeed(c);
      if (s.x < 0.0) continue;
      vec2 d = (s - v_uv) * u_size;
      float dd = dot(d, d);
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
  }
  outColor = best;
}
