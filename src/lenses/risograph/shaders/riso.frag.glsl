// Risograph: per-ink density from a least-squares separation in absorbance space, each ink
// halftoned (or grain-dithered) on its own screen, slightly misregistered, with riso grain and
// uneven ink, multiplied onto paper.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform vec3 u_paper;        // linear
uniform vec3 u_ink[3];       // linear
uniform vec3 u_rows[3];      // separation rows
uniform int u_count;
uniform vec2 u_offset[3];    // misregistration, uv
uniform vec2 u_size;         // output px
uniform float u_cell;        // halftone cell, px
uniform int u_screen;        // 0 dots, 1 grain
uniform float u_density;     // ink amount
uniform float u_contrast;
uniform float u_ref;
uniform float u_seed;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y);
}

float densityAt(vec2 uv, int i) {
  vec3 lin = srgbToLinear(texture(u_input, clamp(uv, 0.0, 1.0)).rgb);
  vec3 A = max(vec3(0.0), -log(max(lin, vec3(1e-3)) / max(u_paper, vec3(1e-3))));
  float d = dot(u_rows[i], A) * u_density;
  d = clamp((d - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  return d;
}

float screenAt(vec2 px, float d, int i) {
  // Riso drum unevenness: low-frequency density wobble per ink.
  d *= 0.9 + 0.2 * vnoise(px / (u_ref * 90.0) + float(i) * 17.0 + u_seed);
  if (u_screen == 1) {
    float n = h12(floor(px / max(1.0, u_ref * 0.9)) + float(i) * 31.7 + u_seed);
    return step(n, d);
  }
  float ang = radians(float(i) * 30.0 + 15.0);
  mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 q = R * px / u_cell;
  vec2 c = fract(q) - 0.5;
  float r = sqrt(d) * 0.72;               // dot area ≈ density
  float aa = 0.75 / u_cell + 0.04;
  float dot_ = 1.0 - smoothstep(r - aa, r + aa, length(c));
  // Grainy dot edges: riso stencils are not crisp.
  float grain = h12(floor(px / max(1.0, u_ref)) + float(i) * 7.3);
  return clamp(dot_ + (grain - 0.5) * 0.35 * step(0.02, d) * (1.0 - abs(dot_ * 2.0 - 1.0)), 0.0, 1.0);
}

void main() {
  vec2 px = v_uv * u_size;
  vec3 col = u_paper;
  for (int i = 0; i < 3; i++) {
    if (i >= u_count) break;
    float d = densityAt(v_uv + u_offset[i], i);
    float cov = screenAt(px + u_offset[i] * u_size, d, i);
    // Speckle: tiny voids inside solid ink.
    cov *= 1.0 - 0.18 * step(0.93, h12(floor(px / max(1.0, u_ref * 0.7)) + float(i) * 3.1 + 5.0));
    col *= mix(vec3(1.0), u_ink[i] / max(u_paper, vec3(1e-3)), cov);
  }
  // Paper tooth.
  col *= 0.97 + 0.04 * vnoise(px / max(1.0, u_ref * 1.5));
  outColor = vec4(linearToSrgb(col), 1.0);
}
