// Passes 2–3: separable Gaussian smoothing of the tensor.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_step;    // uv offset between taps (direction × stride)
uniform float u_stride; // pixels between taps
uniform float u_sigma;  // pixels
uniform int u_taps;
void main() {
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  float inv = 1.0 / (2.0 * u_sigma * u_sigma);
  for (int i = -16; i <= 16; i++) {
    if (abs(i) > u_taps) continue;
    float x = float(i) * u_stride;
    float w = exp(-x * x * inv);
    sum += decodeTensor(texture(u_src, v_uv + u_step * float(i))) * w;
    wsum += w;
  }
  outColor = encodeTensor(sum / wsum);
}
