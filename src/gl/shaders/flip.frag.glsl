// Image-space texture (v = 0 at the top) onto a visible canvas (row 0 at the bottom).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
void main() { outColor = vec4(texture(u_tex, vec2(v_uv.x, 1.0 - v_uv.y)).rgb, 1.0); }
