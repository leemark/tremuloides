// Live view while slit-scanning: the strip so far, newest columns at the leading edge,
// over a dimmed live frame.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform sampler2D u_strip;
uniform vec2 u_stripSize; // px
uniform float u_written;  // px written so far
uniform float u_reverse;
uniform vec2 u_outSize;
void main() {
  vec3 live = texture(u_input, v_uv).rgb * 0.3;
  float s = u_stripSize.y / u_outSize.y;
  float visibleW = u_outSize.x * s;
  float x;
  bool inside;
  if (u_reverse < 0.5) {
    x = u_written - visibleW + v_uv.x * visibleW;
    inside = x >= 0.0 && x < u_written;
  } else {
    float start = u_stripSize.x - u_written;
    x = start + v_uv.x * visibleW;
    inside = x >= start && x < u_stripSize.x;
  }
  vec3 c = inside ? texture(u_strip, vec2(x / u_stripSize.x, v_uv.y)).rgb : live;
  outColor = vec4(c, 1.0);
}
