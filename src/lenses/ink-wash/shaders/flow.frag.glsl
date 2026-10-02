// Optional pass 6 (Line style "Flow"): smooth the ink along the edge tangent flow so lines
// connect into longer, brushier strokes (in the spirit of flow-based DoG, Kang et al. 2007).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_ink;
uniform sampler2D u_tensor;
uniform vec2 u_outSize;
uniform float u_length; // pixels along the flow, each direction
const int STEPS = 6;
void main() {
  float stepPx = u_length / float(STEPS);
  float sigma = u_length * 0.5;
  float sum = texture(u_ink, v_uv).r;
  float wsum = 1.0;
  for (int dir = -1; dir <= 1; dir += 2) {
    vec2 p = v_uv;
    vec2 prev = vec2(0.0);
    for (int k = 1; k <= STEPS; k++) {
      vec2 t = tensorFlow(decodeTensor(texture(u_tensor, p))).xy;
      if (dot(t, prev) < 0.0) t = -t;
      if (k == 1 && dir < 0) t = -t;
      prev = t;
      p += t * stepPx / u_outSize;
      float x = float(k) * stepPx;
      float w = exp(-x * x / (2.0 * sigma * sigma));
      sum += texture(u_ink, p).r * w;
      wsum += w;
    }
  }
  float ink = smoothstep(0.18, 0.62, sum / wsum);
  outColor = vec4(vec3(ink), 1.0);
}
