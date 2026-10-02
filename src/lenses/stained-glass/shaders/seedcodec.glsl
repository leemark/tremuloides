// Seed positions in 16-bit fixed point packed into RGBA8 (see seeds.ts). x = 0 means empty.
vec2 decodeSeed(vec4 c) {
  vec4 b = floor(c * 255.0 + 0.5);
  float x = b.r * 256.0 + b.g;
  float y = b.b * 256.0 + b.a;
  if (x < 0.5) return vec2(-1.0);
  return vec2((x - 1.0) / 65534.0, (y - 1.0) / 65534.0);
}
