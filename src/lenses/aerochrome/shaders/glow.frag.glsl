// Adds blurred highlights back (screen blend): the soft bloom of infrared film.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_base;
uniform sampler2D u_glow;
uniform float u_amount;
void main() {
  vec3 b = texture(u_base, v_uv).rgb;
  vec3 g = texture(u_glow, v_uv).rgb * u_amount;
  outColor = vec4(1.0 - (1.0 - b) * (1.0 - g), 1.0);
}
