// Highlights only, for IR halation.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  outColor = vec4(c * smoothstep(0.55, 0.95, y), 1.0);
}
