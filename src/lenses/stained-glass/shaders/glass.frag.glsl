// Stained glass: exact cell borders from the seeds found by JFA, cell colour averaged around the
// seed, lead came along the bisectors, and an optional glass texture and inner glow.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform sampler2D u_jfa;
uniform vec2 u_outSize;
uniform vec2 u_jfaSize;
uniform float u_leadHalf;  // px
uniform vec3 u_leadColor;  // sRGB
uniform float u_glow;      // 0–1
uniform float u_texture;   // 0/1
uniform float u_cellR;     // typical cell radius, px
uniform float u_ref;       // ref-px scale

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 p = v_uv * u_outSize;
  vec2 cand[17];
  int n = 0;
  vec2 s0 = decodeSeed(texture(u_jfa, v_uv));
  if (s0.x >= 0.0) { cand[0] = s0 * u_outSize; n = 1; }
  float texelPx = u_outSize.x / u_jfaSize.x;
  float r1 = max(u_leadHalf + 2.0, 1.5 * texelPx);
  for (int ring = 1; ring <= 2; ring++) {
    float r = r1 * float(ring);
    for (int k = 0; k < 8; k++) {
      float a = 0.7853982 * float(k) + (ring == 2 ? 0.3926991 : 0.0);
      vec2 s = decodeSeed(texture(u_jfa, (p + r * vec2(cos(a), sin(a))) / u_outSize));
      if (s.x < 0.0) continue;
      vec2 sp = s * u_outSize;
      bool dup = false;
      for (int m = 0; m < 17; m++) {
        if (m >= n) break;
        if (distance(cand[m], sp) < 1e-3) { dup = true; break; }
      }
      if (!dup && n < 17) { cand[n] = sp; n++; }
    }
  }
  if (n == 0) {
    outColor = vec4(texture(u_input, v_uv).rgb, 1.0);
    return;
  }
  // Nearest seed (exact), then distance to the nearest bisector with any other candidate.
  int bi = 0;
  float bd = 1e20;
  for (int m = 0; m < 17; m++) {
    if (m >= n) break;
    float d = distance(p, cand[m]);
    if (d < bd) { bd = d; bi = m; }
  }
  vec2 A = cand[0];
  for (int m = 0; m < 17; m++) { if (m == bi) A = cand[m]; }
  float edge = 1e9;
  for (int m = 0; m < 17; m++) {
    if (m >= n || m == bi) continue;
    vec2 B = cand[m];
    vec2 dir = B - A;
    float len = length(dir);
    if (len < 1e-3) continue;
    edge = min(edge, dot((A + B) * 0.5 - p, dir / len));
  }

  // Cell colour: average of 9 taps around the seed.
  vec3 col = texture(u_input, A / u_outSize).rgb;
  float tr = u_cellR * 0.4;
  for (int k = 0; k < 8; k++) {
    float a = 0.7853982 * float(k);
    col += texture(u_input, (A + tr * vec2(cos(a), sin(a))) / u_outSize).rgb;
  }
  col /= 9.0;
  vec3 lab = srgbToOklab(col);
  float cellRand = hash12(floor(A) + 0.5);
  lab.x = clamp(lab.x * 0.94 + 0.05 + (cellRand - 0.5) * 0.05, 0.0, 1.0); // slight lift + per-pane variation
  lab.yz *= 1.18;
  col = oklabToSrgb(lab);

  if (u_texture > 0.5) {
    vec2 q = p / (u_ref * 26.0) + cellRand * 17.0;
    float streak = vnoise(vec2(q.x * 0.35, q.y * 2.2)) * 0.6 + vnoise(q * 3.1) * 0.4;
    col *= 0.94 + streak * 0.12;
  }
  float g = smoothstep(0.0, u_cellR * 0.9, edge);
  col *= mix(1.0 - 0.22 * u_glow, 1.0 + 0.10 * u_glow, g);

  float lead = 1.0 - smoothstep(u_leadHalf - 0.75, u_leadHalf + 0.75, edge);
  float bevel = clamp(1.0 - edge / max(u_leadHalf, 0.5), 0.0, 1.0);
  vec3 leadCol = u_leadColor + vec3(0.10) * bevel * bevel;
  outColor = vec4(clamp(mix(col, leadCol, lead), 0.0, 1.0), 1.0);
}
