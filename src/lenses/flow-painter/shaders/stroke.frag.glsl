// Bristle texture: streaks across the stroke, soft edges, tapered ends, dry-brush gaps near the tail.
in vec2 v_st;
in vec3 v_color;
flat in float v_seed;
out vec4 outColor;
uniform float u_bristles; // streaks across the stroke

float h1(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }

void main() {
  float across = v_st.y * 0.5 + 0.5;
  float b = floor(across * u_bristles);
  float n = h1(b + v_seed * 97.0);
  float n2 = h1(b * 1.7 + v_seed * 41.0 + 5.0);
  float edge = 1.0 - smoothstep(0.65, 1.0, abs(v_st.y));
  float ends = smoothstep(0.0, 0.1, v_st.x) * (1.0 - smoothstep(0.8, 1.0, v_st.x));
  float dry = step(n2, 0.45 * smoothstep(0.55, 1.0, v_st.x)); // some bristles run out of paint
  float alpha = 0.92 * edge * ends * (1.0 - dry);
  vec3 col = v_color * (0.9 + 0.2 * n);
  outColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
