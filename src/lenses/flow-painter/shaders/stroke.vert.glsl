// One brush stroke per instance, built as a triangle strip along the flow field.
// No vertex attributes: position, color and shape all come from hashes of the stroke index.
uniform sampler2D u_src;    // mipmapped copy of the photo (image space, v = 0 at top)
uniform sampler2D u_tensor; // smoothed doubled-angle orientation, encoded v · 0.5 + 0.5 (see tensor.frag)
uniform vec2 u_size;        // output px
uniform int u_cols;
uniform int u_count;
uniform int u_prime;
uniform int u_offset;       // first stroke of this batch
uniform int u_layer;
uniform int u_seed;
uniform int u_segments;
uniform float u_cell;       // px
uniform float u_width;      // px
uniform float u_length;     // px
uniform float u_lod;
uniform float u_prevLod;    // < 0: paint everywhere
uniform float u_accept;     // color difference a finer stroke must add
uniform float u_jitter;
uniform float u_edgeStop;   // strokes stop where the color changes by more than this

out vec2 v_st;          // s along the stroke 0–1, t across −1…1
out vec3 v_color;
flat out float v_seed;

uint hash(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(inout uint s) { s = hash(s); return float(s >> 8) / 16777216.0; }

vec2 flowAt(vec2 px) {
  vec2 v = texture(u_tensor, px / u_size).xy * 2.0 - 1.0;
  // |v| combines edge strength and how consistently edges line up; the gradient angle is half of v's.
  float strength = length(v);
  float ang = 0.5 * atan(v.y, v.x);
  vec2 t = vec2(-sin(ang), cos(ang)); // flow runs perpendicular to the gradient
  if (t.x < 0.0) t = -t;
  float w = smoothstep(0.05, 0.25, strength);
  vec2 d = mix(vec2(1.0, 0.0), t, w);
  float len = length(d);
  return len > 1e-4 ? d / len : vec2(1.0, 0.0);
}

void hide() {
  gl_Position = vec4(3.0, 3.0, 0.0, 1.0); // whole strip off-screen: nothing is drawn
  v_st = vec2(0.0);
  v_color = vec3(0.0);
  v_seed = 0.0;
}

void main() {
  int inst = gl_InstanceID + u_offset;
  int idx = (inst * u_prime) % u_count; // inst < count and prime < 8000, so no overflow
  uint s = hash(uint(idx) * 747796405u + uint(u_layer) * 2891336453u + uint(u_seed));
  vec2 cell = vec2(float(idx % u_cols), float(idx / u_cols));
  vec2 p0 = (cell + vec2(rnd(s), rnd(s))) * u_cell;
  vec2 uv0 = p0 / u_size;
  if (uv0.y > 1.0) { hide(); return; }

  vec3 base = textureLod(u_src, uv0, u_lod).rgb;
  float gate = rnd(s);
  if (u_prevLod >= 0.0) {
    vec3 coarse = textureLod(u_src, uv0, u_prevLod).rgb;
    if (length(base - coarse) < u_accept * (0.5 + gate)) { hide(); return; }
  }

  vec3 lab = srgbToOklab(base);
  lab += (vec3(rnd(s), rnd(s), rnd(s)) - 0.5) * vec3(0.09, 0.045, 0.045) * u_jitter;
  vec3 color = oklabToSrgb(lab);

  float len = u_length * (0.7 + 0.6 * rnd(s));
  float halfW = 0.5 * u_width * (0.8 + 0.4 * rnd(s));
  float seed = rnd(s);

  int j = gl_VertexID / 2;
  float side = (gl_VertexID % 2 == 0) ? -1.0 : 1.0;
  int mid = u_segments / 2;
  int steps = abs(j - mid);
  float dirSign = j >= mid ? 1.0 : -1.0;
  float stepLen = len / float(u_segments);

  vec2 d0 = flowAt(p0);
  vec2 p = p0;
  vec2 prev = d0 * dirSign;
  bool alive = true;
  for (int k = 0; k < 8; k++) {
    if (k >= steps || !alive) break;
    vec2 d = flowAt(p);
    if (dot(d, prev) < 0.0) d = -d;
    // Midpoint step for smoother curves.
    vec2 m = flowAt(p + d * stepLen * 0.5);
    if (dot(m, d) < 0.0) m = -m;
    vec2 np = p + m * stepLen;
    vec3 c = textureLod(u_src, np / u_size, u_lod).rgb;
    if ((k >= 2 && length(c - base) > u_edgeStop) || np.x < -u_width || np.y < -u_width || np.x > u_size.x + u_width || np.y > u_size.y + u_width) {
      alive = false;
    } else {
      p = np;
      prev = m;
    }
  }
  vec2 fwd = prev * dirSign; // forward direction keeps the strip from twisting at the centre
  vec2 n = vec2(-fwd.y, fwd.x);
  float sAlong = float(j) / float(u_segments);
  float profile = 0.7 + 0.3 * sin(3.14159265 * sAlong);
  vec2 pos = p + n * side * halfW * profile;

  gl_Position = vec4(pos / u_size * 2.0 - 1.0, 0.0, 1.0);
  v_st = vec2(sAlong, side);
  v_color = color;
  v_seed = seed;
}
