// Contour lines at L = k / levels over a paper ground with optional hillshade.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_field; // r = smoothed lightness, g = smoothed sky mask
uniform vec2 u_texel;      // one field texel in uv
uniform float u_levels;
uniform float u_lineHalf;  // half line width in output px
uniform float u_hillshade; // 0–1
uniform float u_relief;    // gradient → normal steepness
uniform float u_skyTint;   // 0–1
uniform vec3 u_paper;
uniform vec3 u_line;
uniform vec3 u_index;
uniform vec3 u_sky;

void main() {
  vec4 f = texture(u_field, v_uv);
  float h = f.r * u_levels;
  float k = floor(h + 0.5);
  float d = abs(h - k) / max(fwidth(h), 1e-5); // distance to the nearest contour in px
  bool isIndex = mod(k, 5.0) < 0.5;
  float halfW = u_lineHalf * (isIndex ? 1.9 : 1.0);
  float ink = 1.0 - smoothstep(halfW - 0.6, halfW + 0.6, d);
  if (k < 0.5 || k > u_levels - 0.5) ink = 0.0;

  vec3 paper = mix(u_paper, u_sky, clamp(f.g, 0.0, 1.0) * u_skyTint);

  // Hillshade: lightness as elevation, lit from the upper left (north-west on a map).
  float gx = texture(u_field, v_uv + vec2(u_texel.x, 0.0)).r - texture(u_field, v_uv - vec2(u_texel.x, 0.0)).r;
  float gy = texture(u_field, v_uv + vec2(0.0, u_texel.y)).r - texture(u_field, v_uv - vec2(0.0, u_texel.y)).r;
  vec3 n = normalize(vec3(-gx * u_relief, -gy * u_relief, 1.0));
  vec3 light = normalize(vec3(-1.0, -1.0, 1.6));
  float shade = clamp(dot(n, light) / light.z, 0.72, 1.1);
  paper *= mix(1.0, shade, u_hillshade);

  vec3 col = mix(paper, isIndex ? u_index : u_line, ink);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
