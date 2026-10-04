// Final pass: a faint canvas weave over the paint.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_paint;
uniform float u_ref;      // px per reference px
uniform float u_weave;    // 0–1 strength
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(u_paint, v_uv).rgb;
  vec2 q = gl_FragCoord.xy / (u_ref * 2.2); // weave period ≈ 2.2 ref px
  float wx = 0.5 + 0.5 * sin(q.x * 6.2831853);
  float wy = 0.5 + 0.5 * sin(q.y * 6.2831853);
  float over = mod(floor(q.x) + floor(q.y), 2.0) < 1.0 ? wx : wy;
  float grain = h(floor(gl_FragCoord.xy / max(u_ref, 1.0))) - 0.5;
  float shade = 1.0 + u_weave * ((over - 0.5) * 0.07 + grain * 0.03);
  outColor = vec4(clamp(c * shade, 0.0, 1.0), 1.0);
}
