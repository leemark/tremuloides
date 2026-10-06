// Layered paper cut-outs: lightness bands become sheets, nearer sheets cast soft shadows on the
// ones behind, and sheet edges catch a thin highlight. Light comes from the upper left.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_field;   // r = smoothed L, g/b = heavily smoothed a/b (Oklab)
uniform vec2 u_px;           // one output pixel in uv
uniform float u_layers;
uniform float u_shadow;      // shadow length, px
uniform float u_ref;         // px per reference px
uniform int u_darkFront;     // 1: darker sheets are nearer (landscapes)
uniform int u_paper;         // 0 photo colours, 1 white, 2 kraft
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

/** Continuous layer coordinate (0 … layers) and its depth rank (0 = nearest). */
float layerAt(vec2 uv) {
  float L = clamp(texture(u_field, uv).r, 0.0, 0.999);
  return L * u_layers;
}
float depthOf(float layer) {
  float k = floor(layer);
  return u_darkFront == 1 ? k : (u_layers - 1.0 - k);
}

void main() {
  float layer = layerAt(v_uv);
  float k = floor(layer);
  float depth = depthOf(layer);

  // Sheet colour: band-centre lightness with the area's smoothed hue.
  vec3 f = texture(u_field, v_uv).rgb;
  float Lc = (k + 0.5) / u_layers;
  vec3 lab;
  if (u_paper == 1) lab = vec3(mix(0.62, 0.97, Lc), 0.0, 0.004);           // white card, shaded by depth
  else if (u_paper == 2) lab = vec3(mix(0.38, 0.86, Lc), 0.018, 0.055);     // kraft
  else {
    // Flat paper: hue snapped to 16 steps, chroma to steps of 0.035 (so each sheet is one colour).
    float C = length(f.gb);
    float h = atan(f.b, f.g);
    float step = 6.2831853 / 16.0;
    float hq = floor(h / step + 0.5) * step;
    float Cq = min(0.16, floor(C / 0.035 + 0.5) * 0.035) * 1.2;
    lab = vec3(mix(0.22, 0.93, Lc), Cq * cos(hq), Cq * sin(hq));
  }
  vec3 col = oklabToSrgb(lab);

  // Soft drop shadow: is there a nearer sheet toward the light (up-left)?
  vec2 dir = normalize(vec2(-1.0, -1.15)) * u_px;
  float shadow = 0.0;
  for (int i = 1; i <= 8; i++) {
    float t = float(i) / 8.0;
    float d = depthOf(layerAt(v_uv + dir * u_shadow * t));
    if (d < depth) shadow = max(shadow, (1.0 - t * 0.85) * min(1.0, (depth - d) * 0.6 + 0.4));
  }
  col *= 1.0 - 0.42 * shadow;

  // Cut edge: a thin lit rim where the sheet behind is up-left of this one.
  float rimW = max(1.0, 1.2 * u_ref);
  float behind = depthOf(layerAt(v_uv + dir * rimW));
  if (behind > depth) col = mix(col, min(col * 1.25 + 0.06, vec3(1.0)), 0.7);

  // Paper fibre and grain, different per sheet.
  vec2 q = v_uv / u_px / max(u_ref, 0.5);
  float fibre = vnoise(q * vec2(0.9, 0.25) + k * 13.1 + u_seed) * 0.6 + vnoise(q * 3.0 + k * 7.0) * 0.4;
  col *= 0.965 + fibre * 0.07;

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
