// Oklab lightness into r, g, b (each channel gets its own blur next).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
void main() {
  float L = srgbToOklab(texture(u_input, v_uv).rgb).x;
  outColor = vec4(L, L, L, 1.0);
}
