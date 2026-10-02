// Pass 5: ink lines from a difference of Gaussians on Oklab lightness (XDoG-style
// thresholding, Winnemöller et al. 2012). Lines sit on the dark side of edges.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_outSize;
uniform float u_sigma;     // pixels
uniform float u_stride;    // pixels between taps
uniform int u_taps;
uniform float u_threshold;

void main() {
  float s1 = u_sigma;
  float s2 = 1.6 * u_sigma;
  float i1 = 1.0 / (2.0 * s1 * s1);
  float i2 = 1.0 / (2.0 * s2 * s2);
  float a1 = 0.0, w1 = 0.0, a2 = 0.0, w2 = 0.0;
  for (int j = -8; j <= 8; j++) {
    if (abs(j) > u_taps) continue;
    for (int i = -8; i <= 8; i++) {
      if (abs(i) > u_taps) continue;
      vec2 o = vec2(float(i), float(j)) * u_stride;
      float r2 = dot(o, o);
      float L = srgbToOklab(texture(u_src, v_uv + o / u_outSize).rgb).x;
      float g1 = exp(-r2 * i1);
      float g2 = exp(-r2 * i2);
      a1 += L * g1; w1 += g1;
      a2 += L * g2; w2 += g2;
    }
  }
  float D = a1 / w1 - a2 / w2;
  float ink = smoothstep(u_threshold, u_threshold * 2.2 + 0.002, -D);
  outColor = vec4(vec3(ink), 1.0);
}
