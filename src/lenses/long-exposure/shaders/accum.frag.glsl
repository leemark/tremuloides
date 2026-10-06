// Accumulates frames in LINEAR light (like a real long exposure).
// mode 0: running mean (or EMA for the preview), mode 1: lighten (max) with optional decay.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_prev;   // linear accumulator (rgba16f)
uniform sampler2D u_frame;  // new camera frame (sRGB, image space)
uniform vec2 u_shift;       // alignment, uv units
uniform float u_weight;     // mean: 1/n (or EMA alpha); 1 = replace
uniform float u_decay;      // lighten: per-frame fade of old trails (1 = keep forever)
uniform int u_mode;
void main() {
  vec3 cur = srgbToLinear(texture(u_frame, clamp(v_uv + u_shift, 0.0, 1.0)).rgb);
  vec3 prev = texture(u_prev, v_uv).rgb;
  vec3 c = u_mode == 1 ? max(prev * u_decay, cur) : mix(prev, cur, u_weight);
  if (u_weight >= 1.0) c = cur;
  outColor = vec4(c, 1.0);
}
