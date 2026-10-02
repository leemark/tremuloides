// Pass 4: anisotropic Kuwahara filter with polynomial sector weights
// (Kyprianidis, Kang & Döllner 2009; polynomial weighting, Kyprianidis 2010).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform sampler2D u_tensor;
uniform vec2 u_outSize;
uniform float u_radius;  // pixels
uniform float u_q;       // sharpness
uniform float u_alpha;   // anisotropy strength
uniform int u_samples;   // max samples per half-axis (quality)

const float PI = 3.14159265358979;
const int N = 8;

void main() {
  vec4 flow = tensorFlow(decodeTensor(texture(u_tensor, v_uv)));
  float phi = flow.z;
  float A = flow.w;
  float radius = max(u_radius, 1.0);
  float a = radius * clamp((u_alpha + A) / u_alpha, 0.1, 2.0);
  float b = radius * clamp(u_alpha / (u_alpha + A), 0.1, 2.0);
  float cp = cos(phi), sp = sin(phi);
  mat2 SR = mat2(0.5 / a, 0.0, 0.0, 0.5 / b) * mat2(cp, -sp, sp, cp);
  float maxX = sqrt(a * a * cp * cp + b * b * sp * sp);
  float maxY = sqrt(a * a * sp * sp + b * b * cp * cp);
  float stride = max(1.0, max(maxX, maxY) / float(u_samples));
  int nx = int(maxX / stride);
  int ny = int(maxY / stride);

  vec4 m[8];
  vec3 s[8];
  for (int k = 0; k < N; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
  float zeta = 2.0 / radius;
  float sinN = sin(PI / float(N));
  float eta = (zeta + cos(PI / float(N))) / (sinN * sinN);

  for (int j = -12; j <= 12; j++) {
    if (abs(j) > ny) continue;
    for (int i = -12; i <= 12; i++) {
      if (abs(i) > nx) continue;
      vec2 off = vec2(float(i), float(j)) * stride;
      vec2 v = SR * off;
      if (dot(v, v) > 0.25) continue;
      vec3 c = texture(u_input, v_uv + off / u_outSize).rgb;
      vec3 cc = c * c;
      float w[8];
      float sum = 0.0;
      float vxx = zeta - eta * v.x * v.x;
      float vyy = zeta - eta * v.y * v.y;
      float z;
      z = max(0.0, v.y + vxx); w[0] = z * z; sum += w[0];
      z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
      z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
      z = max(0.0, v.x + vyy); w[6] = z * z; sum += w[6];
      v = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
      vxx = zeta - eta * v.x * v.x;
      vyy = zeta - eta * v.y * v.y;
      z = max(0.0, v.y + vxx); w[1] = z * z; sum += w[1];
      z = max(0.0, -v.x + vyy); w[3] = z * z; sum += w[3];
      z = max(0.0, -v.y + vxx); w[5] = z * z; sum += w[5];
      z = max(0.0, v.x + vyy); w[7] = z * z; sum += w[7];
      float g = exp(-3.125 * dot(v, v)) / max(sum, 1e-6);
      for (int k = 0; k < N; k++) {
        float wk = w[k] * g;
        m[k] += vec4(c * wk, wk);
        s[k] += cc * wk;
      }
    }
  }

  vec4 o = vec4(0.0);
  for (int k = 0; k < N; k++) {
    if (m[k].w <= 0.0) continue;
    vec3 mean = m[k].rgb / m[k].w;
    vec3 var = abs(s[k] / m[k].w - mean * mean);
    float sigma2 = var.r + var.g + var.b;
    float w = 1.0 / (1.0 + pow(255.0 * sigma2, 0.5 * u_q));
    o += vec4(mean * w, w);
  }
  vec3 fallback = texture(u_input, v_uv).rgb;
  outColor = vec4(o.w > 0.0 ? o.rgb / o.w : fallback, 1.0);
}
