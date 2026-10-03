// One direction of a separable Gaussian blur (edge-clamped by the sampler).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_dir;   // one texel along x or y, in uv
uniform float u_sigma; // in texels
void main() {
  if (u_sigma < 0.3) {
    outColor = texture(u_src, v_uv);
    return;
  }
  int r = int(ceil(u_sigma * 3.0));
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -96; i <= 96; i++) {
    if (i < -r) continue;
    if (i > r) break;
    float fi = float(i);
    float w = exp(-(fi * fi) / (2.0 * u_sigma * u_sigma));
    acc += w * texture(u_src, v_uv + u_dir * fi);
    wsum += w;
  }
  outColor = acc / wsum;
}
