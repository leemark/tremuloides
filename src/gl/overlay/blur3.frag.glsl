// Separable Gaussian with a different sigma per channel (r, g: ink DoG pair; b: contour field).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_dir;    // one texel along x or y
uniform vec3 u_sigma;  // texels
void main() {
  vec3 s = max(u_sigma, vec3(0.3));
  int r = int(ceil(max(s.r, max(s.g, s.b)) * 3.0));
  vec3 acc = vec3(0.0);
  vec3 wsum = vec3(0.0);
  for (int i = -96; i <= 96; i++) {
    if (i < -r) continue;
    if (i > r) break;
    float fi = float(i);
    vec3 w = exp(-(fi * fi) / (2.0 * s * s));
    acc += w * texture(u_src, v_uv + u_dir * fi).rgb;
    wsum += w;
  }
  outColor = vec4(acc / wsum, 1.0);
}
