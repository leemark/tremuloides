// False-colour infrared. Infrared isn't recorded by phone cameras, so it is estimated: leaves
// (green through gold, by Oklab hue and chroma) reflect strongly in IR; sky and water barely.
// Colour-infrared mapping (Kodak Aerochrome): display R ← IR, G ← red, B ← green.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform int u_variant;     // 0 Aerochrome, 1 Hot pink, 2 Mono IR
uniform float u_foliage;   // how strongly leaves glow in IR (0–1.5)
uniform float u_saturation;

float foliageWeight(vec3 lab) {
  float C = length(lab.yz);
  float h = degrees(atan(lab.z, lab.y));
  if (h < 0.0) h += 360.0;
  // Gold, yellow, green and teal-green leaves (any noticeable chroma), plus vivid orange-red
  // leaves (high chroma only, so muted red rock and soil stay rock); never blue sky.
  float greenGold = smoothstep(45.0, 85.0, h) * (1.0 - smoothstep(170.0, 205.0, h)) * smoothstep(0.02, 0.07, C);
  float orangeRed = smoothstep(18.0, 40.0, h) * (1.0 - smoothstep(55.0, 85.0, h)) * smoothstep(0.1, 0.15, C);
  float lit = smoothstep(0.12, 0.3, lab.x); // deep shadow stays dark
  return max(greenGold, orangeRed) * lit;
}

void main() {
  vec3 srgb = texture(u_input, v_uv).rgb;
  vec3 lin = srgbToLinear(srgb);
  vec3 lab = linearToOklab(lin);
  float Y = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  float veg = foliageWeight(lab) * u_foliage;
  float v = clamp(veg, 0.0, 1.0);
  // Blue/cyan things (sky, water) reflect little IR; rock and soil roughly track their red;
  // foliage is bright in IR even when it looks dark.
  float blue = smoothstep(0.0, 0.08, -lab.z) * smoothstep(0.0, 0.05, length(lab.yz));
  float base = mix(0.95 * lin.r + 0.1 * lin.g, 0.35 * Y, blue);
  float ir = mix(base, clamp(0.25 + 1.4 * Y, 0.0, 1.0), v);
  ir *= 1.0 + 0.25 * max(veg - 1.0, 0.0);
  vec3 c;
  if (u_variant == 2) {
    float m = clamp(ir * 1.15, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m) * 0.85 + m * 0.15; // gentle S-curve
    c = vec3(m);
  } else {
    // Leaves are treated as if they still held chlorophyll (which absorbs red), so green, gold
    // and orange foliage all come out crimson, the look Aerochrome is loved for, instead of
    // the lime-yellow a literal simulation gives autumn leaves.
    c = vec3(ir, lin.r * (1.0 - 0.8 * v), lin.g * (1.0 - 0.35 * v));
    if (u_variant == 1) {
      // Hot pink: push foliage toward magenta.
      c.b = mix(c.b, ir * 0.7, v);
    }
    vec3 l2 = linearToOklab(max(c, vec3(0.0)));
    l2.yz *= u_saturation;
    c = oklabToLinear(l2);
  }
  outColor = vec4(linearToSrgb(max(c, vec3(0.0))), 1.0);
}
