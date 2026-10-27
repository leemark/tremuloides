// The ground: the canvas tone with a faint, heavily blurred wash of the photo, so gaps between dots
// read as light, not as holes.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform float u_lod;
uniform vec3 u_tone;
uniform float u_wash; // 0–1: how much of the photo's color is in the ground
void main() {
  vec3 c = textureLod(u_src, v_uv, u_lod).rgb;
  outColor = vec4(mix(u_tone, c, u_wash), 1.0);
}
