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
// Faces (plan.ts planFaces): ellipses painted with their own fine brush, blended into the painting with
// no visible edge. A face's weight is 1 inside FACE_INNER (in units of its ellipse) and falls smoothly to
// 0 at FACE_OUTER. Across that band, face strokes thin out and grow toward the regular brushes, regular
// strokes too coarse for the face thin in, and fine regular layers skip the refinement gate in proportion,
// so coverage never dips. Strokes from outside stop only at the core, under the face's full coverage.
uniform int u_faceCount;
uniform vec2 u_faceCentre[8]; // px
uniform vec3 u_faceShape[8];  // radius x, radius y, the face's brush width (px)
uniform int u_face;           // ≥ 0: this draw is that face's own layer, on a grid from u_gridOrigin
uniform vec2 u_gridOrigin;    // px
const float FACE_KEEP_OUT = 2.0; // plan.ts FACE_KEEP_OUT
const float FACE_INNER = 0.7;    // plan.ts FACE_INNER
const float FACE_OUTER = 1.4;    // plan.ts FACE_REACH
const float FACE_EDGE_GROW = 2.0; // face strokes are this much bigger at the blend's outer edge

out vec2 v_st;          // s along the stroke 0–1, t across −1…1
out vec3 v_color;
flat out float v_seed;
flat out float v_run; // how much of its planned length the stroke ran (short dabs don't run dry)

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

/** Where px is relative to face i's ellipse: 0 at the centre, 1 on the ellipse. */
float faceE(vec2 px, int i) {
  return length((px - u_faceCentre[i]) / u_faceShape[i].xy);
}

/** Face i's weight at px: 1 in the core, falling smoothly to 0 across the blend. */
float faceWeight(vec2 px, int i) {
  return 1.0 - smoothstep(FACE_INNER, FACE_OUTER, faceE(px, i));
}

bool inAnyCore(vec2 px) {
  for (int i = 0; i < 8; i++) {
    if (i >= u_faceCount) break;
    if (faceE(px, i) < FACE_INNER) return true;
  }
  return false;
}

/**
 * Follows the flow field from p0 along dir for up to `limit` steps, stopping at a color edge (after 2
 * steps) or past the picture. Returns the steps taken; `at` and `atDir` get the point and direction
 * after `want` steps (or at the end, if the trace stops sooner).
 */
int trace(vec2 p0, vec2 dir, vec3 base, float stepLen, int limit, int want, bool stopAtFaces, out vec2 at, out vec2 atDir) {
  vec2 p = p0;
  vec2 prev = dir;
  at = p0;
  atDir = dir;
  int reached = 0;
  for (int k = 0; k < 8; k++) {
    if (k >= limit) break;
    vec2 d = flowAt(p);
    if (dot(d, prev) < 0.0) d = -d;
    // Midpoint step for smoother curves.
    vec2 m = flowAt(p + d * stepLen * 0.5);
    if (dot(m, d) < 0.0) m = -m;
    vec2 np = p + m * stepLen;
    vec3 c = textureLod(u_src, np / u_size, u_lod).rgb;
    if ((k >= 2 && length(c - base) > u_edgeStop) || np.x < -u_width || np.y < -u_width || np.x > u_size.x + u_width || np.y > u_size.y + u_width) break;
    if (stopAtFaces && inAnyCore(np)) break; // strokes from outside end at a face's core (under its full coverage)
    p = np;
    prev = m;
    reached = k + 1;
    if (reached <= want) {
      at = p;
      atDir = prev;
    }
  }
  return reached;
}

void hide() {
  gl_Position = vec4(3.0, 3.0, 0.0, 1.0); // whole strip off-screen: nothing is drawn
  v_st = vec2(0.0);
  v_color = vec3(0.0);
  v_seed = 0.0;
  v_run = 0.0;
}

void main() {
  int inst = gl_InstanceID + u_offset;
  // (inst · prime) mod count, split so it never overflows 32 bits: a fine layer can have ~900k strokes,
  // and 900k × 7919 doesn't fit. (prime / 64) · inst stays under 2³¹ for count < 17M.
  int idxA = (inst * (u_prime / 64)) % u_count;
  int idx = (idxA * 64 + inst * (u_prime % 64)) % u_count;
  uint s = hash(uint(idx) * 747796405u + uint(u_layer) * 2891336453u + uint(u_seed));
  vec2 cell = vec2(float(idx % u_cols), float(idx / u_cols));
  vec2 p0 = u_gridOrigin + (cell + vec2(rnd(s), rnd(s))) * u_cell;
  vec2 uv0 = p0 / u_size;
  if (uv0.y > 1.0) { hide(); return; }

  // Faces. A separate random number, so pictures without faces paint exactly as before.
  float faceRnd = float(hash(s ^ 0x68bc21ebu) >> 8) / 16777216.0;
  float faceGrow = 1.0;
  bool nearFace = false;
  bool startsInFace = false;
  if (u_face >= 0) {
    // a face's own layer: all of the core, thinning out across the blend with strokes growing
    float e = faceE(p0, u_face);
    if (faceRnd >= 1.0 - smoothstep(FACE_INNER, FACE_OUTER, e)) { hide(); return; }
    faceGrow = mix(1.0, FACE_EDGE_GROW, smoothstep(FACE_INNER, FACE_OUTER, e));
    startsInFace = true;
  } else {
    for (int i = 0; i < 8; i++) {
      if (i >= u_faceCount) break;
      float w = faceWeight(p0, i);
      if (faceE(p0, i) < FACE_INNER) startsInFace = true;
      if (u_width > FACE_KEEP_OUT * u_faceShape[i].z) {
        // too coarse for this face: thins in across the blend, none in the core
        if (faceRnd < w) { hide(); return; }
      } else if (faceRnd < w) {
        nearFace = true; // fine enough: paints regardless of the refinement gate, as much as the face weighs
      }
    }
  }

  vec3 base = textureLod(u_src, uv0, u_lod).rgb;
  float gate = rnd(s);
  if (u_prevLod >= 0.0 && !nearFace) {
    vec3 coarse = textureLod(u_src, uv0, u_prevLod).rgb;
    if (length(base - coarse) < u_accept * (0.5 + gate)) { hide(); return; }
  }

  vec3 lab = srgbToOklab(base);
  lab += (vec3(rnd(s), rnd(s), rnd(s)) - 0.5) * vec3(0.09, 0.045, 0.045) * u_jitter;
  vec3 color = oklabToSrgb(lab);

  float len = u_length * (0.7 + 0.6 * rnd(s)) * faceGrow;
  float halfW = 0.5 * u_width * (0.8 + 0.4 * rnd(s)) * faceGrow;
  float seed = rnd(s);

  int j = gl_VertexID / 2;
  float side = (gl_VertexID % 2 == 0) ? -1.0 : 1.0;
  int mid = u_segments / 2;
  int steps = abs(j - mid);
  float dirSign = j >= mid ? 1.0 : -1.0;
  float stepLen = len / float(u_segments);

  vec2 d0 = flowAt(p0);
  // Trace both sides of the spine to where they really end. A stroke that stops early at a color edge
  // keeps its tapered, narrower tips at its real ends, and is never wider than half its length: a
  // short stroke is a small dab, as a painter would make it. (Measured from the planned length, early
  // stops were only their square-ended middles: the "bricks" in busy textures.)
  vec2 mine = p0;
  vec2 minePrev = d0 * dirSign;
  bool stopAtFaces = !startsInFace && u_faceCount > 0;
  int reached = trace(p0, d0 * dirSign, base, stepLen, mid, steps, stopAtFaces, mine, minePrev);
  vec2 unused0, unused1;
  int other = trace(p0, -d0 * dirSign, base, stepLen, mid, 0, stopAtFaces, unused0, unused1);
  float spine = float(reached + other) * stepLen;
  halfW = min(halfW, max(0.25 * spine, 0.4 * halfW));
  vec2 fwd = minePrev * dirSign; // forward direction keeps the strip from twisting at the centre
  vec2 n = vec2(-fwd.y, fwd.x);
  // 0 and 1 at the real tips, 0.5 at the centre (j / segments when the stroke runs its full length)
  float sAlong = steps > 0 && reached > 0 ? 0.5 + 0.5 * dirSign * float(min(steps, reached)) / float(reached) : 0.5;
  float profile = 0.7 + 0.3 * sin(3.14159265 * sAlong);
  vec2 pos = mine + n * side * halfW * profile;

  gl_Position = vec4(pos / u_size * 2.0 - 1.0, 0.0, 1.0);
  v_st = vec2(sAlong, side);
  v_color = color;
  v_seed = seed;
  v_run = clamp(spine / len, 0.0, 1.0);
}
