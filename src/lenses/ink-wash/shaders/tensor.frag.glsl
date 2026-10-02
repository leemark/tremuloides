// Pass 1: structure tensor from Sobel gradients of Oklab lightness.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_texel; // one tensor-target pixel in uv
float lum(vec2 o) { return srgbToOklab(texture(u_input, v_uv + o * u_texel).rgb).x; }
void main() {
  float tl = lum(vec2(-1, -1)), t = lum(vec2(0, -1)), tr = lum(vec2(1, -1));
  float l = lum(vec2(-1, 0)), r = lum(vec2(1, 0));
  float bl = lum(vec2(-1, 1)), b = lum(vec2(0, 1)), br = lum(vec2(1, 1));
  float gx = (tr + 2.0 * r + br - tl - 2.0 * l - bl) * 0.25;
  float gy = (bl + 2.0 * b + br - tl - 2.0 * t - tr) * 0.25;
  outColor = encodeTensor(vec3(gx * gx, gx * gy, gy * gy));
}
