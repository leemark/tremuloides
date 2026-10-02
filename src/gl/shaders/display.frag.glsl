in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
uniform vec2 u_scale;     // see fitScale() in fit.ts
uniform vec3 u_background;
void main() {
  // Textures are in image space (v = 0 is the top row); the screen's v = 0 is the bottom.
  vec2 screenUv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 uv = (screenUv - 0.5) * u_scale + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(u_background, 1.0);
    return;
  }
  outColor = vec4(texture(u_tex, uv).rgb, 1.0);
}
