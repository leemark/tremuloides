in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
void main() {
  outColor = vec4(texture(u_input, v_uv).rgb, 1.0);
}
