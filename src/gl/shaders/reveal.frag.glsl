// Before/after wipe: left of the divider shows the lens, right shows the original.
// The divider leans slightly, has a soft shadow and a bright core.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_before;
uniform sampler2D u_after;
uniform float u_pos;     // 0 = all before, 1 = all after
uniform vec2 u_size;     // px
uniform float u_ref;     // px per reference px
void main() {
  vec2 uv = v_uv; // image space (v = 0 at top)
  float lean = (uv.y - 0.5) * 0.12; // slight diagonal
  float edge = (u_pos * 1.16 - 0.08) + lean; // run fully off both sides
  float px = (uv.x - edge) * u_size.x;
  vec3 a = texture(u_after, uv).rgb;
  vec3 b = texture(u_before, uv).rgb;
  vec3 c = px < 0.0 ? a : b;
  float w = 1.6 * u_ref;
  float shadow = exp(-pow(px / (7.0 * u_ref), 2.0)) * 0.35;
  c *= 1.0 - shadow;
  float core = 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, abs(px));
  c = mix(c, vec3(0.98, 0.97, 0.94), core);
  outColor = vec4(c, 1.0);
}
