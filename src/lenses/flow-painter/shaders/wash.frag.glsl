// Underpainting: a heavily blurred wash of the photo over the canvas tone, so gaps between strokes read as paint.
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform float u_lod;
uniform vec3 u_tone;
void main() {
  vec3 c = textureLod(u_src, v_uv, u_lod).rgb;
  outColor = vec4(mix(u_tone, c, 0.8), 1.0);
}
