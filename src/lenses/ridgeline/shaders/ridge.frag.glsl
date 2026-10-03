// Draws the traced skyline and the sampled note points over the photo.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform sampler2D u_ridge;   // cols×1, y packed 16-bit in R/G (nearest)
uniform float u_cols;
uniform vec2 u_outSize;
uniform float u_ref;
uniform vec3 u_pts[64];      // x, y (0–1, image space), 1 = sparkle
uniform int u_count;
uniform float u_markers;

float ridgeY(float u) {
  float f = clamp(u * u_cols - 0.5, 0.0, u_cols - 1.0);
  float i = floor(f);
  vec4 a = texelFetch(u_ridge, ivec2(int(i), 0), 0);
  vec4 b = texelFetch(u_ridge, ivec2(int(min(i + 1.0, u_cols - 1.0)), 0), 0);
  float ya = (floor(a.r * 255.0 + 0.5) * 256.0 + floor(a.g * 255.0 + 0.5)) / 65535.0;
  float yb = (floor(b.r * 255.0 + 0.5) * 256.0 + floor(b.g * 255.0 + 0.5)) / 65535.0;
  return mix(ya, yb, f - i);
}

void main() {
  vec3 col = texture(u_input, v_uv).rgb;
  float px = 1.0 / u_outSize.x;
  float y = ridgeY(v_uv.x);
  float slope = (ridgeY(v_uv.x + px) - ridgeY(v_uv.x - px)) * u_outSize.y / 2.0; // px per px
  float d = abs(v_uv.y - y) * u_outSize.y / sqrt(1.0 + slope * slope);
  float halo = 1.0 - smoothstep(2.2 * u_ref, 3.4 * u_ref, d);
  float core = 1.0 - smoothstep(0.9 * u_ref, 1.6 * u_ref, d);
  col = mix(col, col * 0.35, halo * 0.6);
  col = mix(col, vec3(0.913, 0.722, 0.145), core);

  if (u_markers > 0.5) {
    vec2 p = v_uv * u_outSize;
    for (int k = 0; k < 64; k++) {
      if (k >= u_count) break;
      vec3 pt = u_pts[k];
      float r = distance(p, pt.xy * u_outSize);
      float R = (pt.z > 0.5 ? 6.5 : 5.0) * u_ref;
      float ring = 1.0 - smoothstep(R - 1.2 * u_ref, R, r);
      float fill = 1.0 - smoothstep(R - 2.6 * u_ref, R - 1.4 * u_ref, r);
      col = mix(col, vec3(0.913, 0.722, 0.145), ring);
      col = mix(col, pt.z > 0.5 ? vec3(1.0, 0.93, 0.78) : vec3(0.95), fill);
    }
  }
  outColor = vec4(col, 1.0);
}
