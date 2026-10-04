// Structure tensor of Oklab lightness (Sobel), with gradients in L per reference px.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_texel;    // one field texel in uv
uniform float u_lod;     // mip level matching the field resolution
uniform float u_gradScale;
float lum(vec2 o) { return srgbToOklab(textureLod(u_src, v_uv + o * u_texel, u_lod).rgb).x; }
void main() {
  float tl = lum(vec2(-1.0, -1.0)), tc = lum(vec2(0.0, -1.0)), tr = lum(vec2(1.0, -1.0));
  float ml = lum(vec2(-1.0, 0.0)), mr = lum(vec2(1.0, 0.0));
  float bl = lum(vec2(-1.0, 1.0)), bc = lum(vec2(0.0, 1.0)), br = lum(vec2(1.0, 1.0));
  float gx = ((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl)) / 8.0 * u_gradScale;
  float gy = ((bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr)) / 8.0 * u_gradScale;
  outColor = vec4(gx * gx, gy * gy, gx * gy, 1.0);
}
