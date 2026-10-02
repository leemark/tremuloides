// Time displacement: each pixel shows the frame from `delay` frames ago, where the
// delay varies across the image by mode. Textures are image space (v = 0 is the top).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;              // the live frame
uniform highp sampler2DArray u_history; // ring buffer of past frames
uniform int u_frames;   // capacity
uniform int u_count;    // filled
uniform int u_head;     // newest layer
uniform int u_mode;     // 0 rows, 1 columns, 2 radial, 3 luma, 4 slit-scan (live view)
uniform float u_span;   // max delay in frames
uniform float u_reverse;
uniform float u_smooth;
uniform float u_mix;
uniform float u_aspect; // width / height
uniform float u_lineHalf;

vec3 frameBack(int back, vec2 uv) {
  int layer = u_head - back;
  layer = ((layer % u_frames) + u_frames) % u_frames;
  return texture(u_history, vec3(uv, float(layer))).rgb;
}

vec3 delayed(vec2 uv, float d) {
  float maxd = float(max(u_count - 1, 0));
  d = clamp(d, 0.0, maxd);
  int d0 = int(floor(d));
  float f = d - float(d0);
  vec3 a = frameBack(d0, uv);
  if (u_smooth < 0.5 || f < 0.001 || float(d0 + 1) > maxd) return a;
  return mix(a, frameBack(d0 + 1, uv), f);
}

void main() {
  vec3 live = texture(u_input, v_uv).rgb;
  if (u_mode == 4) {
    float dx = abs(v_uv.x - 0.5);
    float line = 1.0 - smoothstep(u_lineHalf, u_lineHalf * 1.8, dx);
    outColor = vec4(mix(live, vec3(0.913, 0.722, 0.145), line * 0.85), 1.0);
    return;
  }
  if (u_count < 1) {
    outColor = vec4(live, 1.0);
    return;
  }
  float t;
  if (u_mode == 0) t = 1.0 - v_uv.y;        // top rows are oldest
  else if (u_mode == 1) t = 1.0 - v_uv.x;   // left columns are oldest
  else if (u_mode == 2) {
    vec2 p = (v_uv - 0.5) * vec2(u_aspect, 1.0);
    t = clamp(length(p) / (0.5 * length(vec2(u_aspect, 1.0))), 0.0, 1.0); // centre is now
  } else {
    float L = dot(live, vec3(0.2126, 0.7152, 0.0722));
    t = smoothstep(0.25, 0.9, L);           // bright (sunlit leaves) lag most
  }
  if (u_reverse > 0.5) t = 1.0 - t;
  vec3 c = delayed(v_uv, t * u_span);
  outColor = vec4(mix(c, live, u_mix), 1.0);
}
