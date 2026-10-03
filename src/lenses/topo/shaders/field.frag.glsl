// Elevation field: r = Oklab lightness, g = blue-sky mask (tints the paper in USGS style).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
void main() {
  vec3 lab = srgbToOklab(texture(u_input, v_uv).rgb);
  float sky = smoothstep(-0.015, -0.04, lab.z) * smoothstep(0.45, 0.55, lab.x) * (1.0 - smoothstep(0.02, 0.05, lab.y));
  outColor = vec4(lab.x, sky, 0.0, 1.0);
}
