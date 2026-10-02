// Pass 7: palette stylization + ink + paper.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_paint; // Kuwahara output
uniform sampler2D u_ink;
uniform int u_mode;        // 0 Auto, 1 San Juan, 2 Gouache, 3 Mono ink
uniform vec3 u_palette[12]; // Oklab
uniform int u_count;
uniform float u_blendK;
uniform float u_levels;
uniform vec3 u_inkColor;   // sRGB
uniform float u_paper;
uniform float u_refScale;
uniform vec2 u_outSize;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

vec3 paletteBlend(vec3 lab) {
  float d1 = 1e9, d2 = 1e9;
  int i1 = 0, i2 = 0;
  for (int i = 0; i < 12; i++) {
    if (i >= u_count) break;
    float d = distance(lab, u_palette[i]);
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
    else if (d < d2) { d2 = d; i2 = i; }
  }
  float t = u_count > 1 ? 0.5 * exp(-u_blendK * (d2 - d1)) : 0.0;
  return mix(u_palette[i1], u_palette[i2], t);
}

float softQuantize(float x, float levels) {
  float y = x * levels - 0.5;
  float n = floor(y);
  float f = y - n;
  return clamp((n + smoothstep(0.38, 0.62, f) + 0.5) / levels, 0.0, 1.0);
}

void main() {
  vec3 lab = srgbToOklab(texture(u_paint, v_uv).rgb);
  vec3 styl;
  if (u_mode == 0 || u_mode == 1) {
    styl = paletteBlend(lab);
    styl.x = mix(styl.x, lab.x, 0.15); // keep a little modelling inside flat areas
  } else if (u_mode == 2) {
    styl = vec3(softQuantize(lab.x, u_levels), lab.yz * 1.15);
  } else {
    float q = softQuantize(lab.x, 4.0);
    styl = vec3(mix(0.34, 0.97, q), 0.0, 0.0);
  }
  vec3 rgb = oklabToSrgb(styl);

  float ink = texture(u_ink, v_uv).r;
  rgb = mix(rgb, u_inkColor, ink * 0.94);

  if (u_paper > 0.5) {
    vec2 p = v_uv * u_outSize / max(u_refScale, 1e-3);
    float grain = noise(p * 0.55) * 0.6 + noise(p * 1.7) * 0.4;
    rgb *= 1.0 + (grain - 0.5) * 0.07;
    float light = smoothstep(0.55, 1.0, styl.x);
    rgb *= mix(vec3(1.0), vec3(1.0, 0.982, 0.94), light);
  }
  outColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
