// Copies a thin vertical slit from the centre of the frame into the strip (drawn with a
// viewport covering one slit's columns).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_range; // source uv x range
void main() {
  outColor = vec4(texture(u_input, vec2(mix(u_range.x, u_range.y, v_uv.x), v_uv.y)).rgb, 1.0);
}
