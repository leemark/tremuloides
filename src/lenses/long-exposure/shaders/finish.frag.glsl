// Linear accumulator → sRGB. Ghost mixes in the latest (aligned) frame so moving things leave
// soft trails behind a sharp present.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_acc;   // linear
uniform sampler2D u_last;  // linear (aligned latest frame)
uniform float u_ghost;     // 0–1
void main() {
  vec3 c = mix(texture(u_acc, v_uv).rgb, texture(u_last, v_uv).rgb, u_ghost);
  outColor = vec4(linearToSrgb(c), 1.0);
}
