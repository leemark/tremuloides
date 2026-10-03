// Box-filtered downsample (4×4 taps across each output texel's footprint), so the skyline
// sample matches the high-quality resize used when the photo's audio is generated.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_outSize;
void main() {
  vec2 cell = 1.0 / u_outSize;
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = (vec2(float(i), float(j)) + 0.5) / 4.0 - 0.5;
      sum += texture(u_input, v_uv + o * cell).rgb;
    }
  }
  outColor = vec4(sum / 16.0, 1.0);
}
