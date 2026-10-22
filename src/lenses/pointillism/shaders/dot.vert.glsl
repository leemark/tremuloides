// One dot per instance, a quad built from gl_VertexID: no vertex buffers. Its place, size, shape and
// pigment all come from hashes of the dot's cell, so any window of the picture paints the same dots.
uniform sampler2D u_src;    // mipmapped copy of the photo (image space, v = 0 at top)
uniform vec2 u_size;        // output px
uniform int u_cols;
uniform int u_count;
uniform int u_prime;
uniform int u_offset;       // first dot of this batch
uniform int u_layer;
uniform int u_seed;
uniform float u_cell;       // px
uniform float u_dot;        // dot diameter, px
uniform float u_lod;
uniform float u_prevLod;    // < 0: paint everywhere
uniform float u_accept;     // color difference a fine dot must add
uniform vec2 u_gridOrigin;  // px
// Pigments (Oklab); 0 pigments: the photo's own colors
uniform int u_pigmentCount;
uniform vec3 u_pigments[24];
uniform float u_separation; // 0–1: how far dots stray from the photo's color, and how pure they are
// Faces (plan.ts planFaces, Flow Painter's ellipses and blend)
uniform int u_faceCount;
uniform vec2 u_faceCentre[8]; // px
uniform vec3 u_faceShape[8];  // radius x, radius y, the face's dot size (px)
uniform int u_face;           // ≥ 0: this draw is that face's own layer
const float FACE_INNER = 0.7;    // plan.ts FACE_INNER
const float FACE_OUTER = 1.4;    // plan.ts FACE_REACH
const float FACE_KEEP_OUT = 1.6; // plan.ts FACE_KEEP_OUT

out vec2 v_uv;    // −1…1 across the dot
out vec3 v_color;
flat out float v_seed;

uint hash(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(inout uint s) { s = hash(s); return float(s >> 8) / 16777216.0; }

float faceE(vec2 px, int i) { return length((px - u_faceCentre[i]) / u_faceShape[i].xy); }

void hide() {
  gl_Position = vec4(3.0, 3.0, 0.0, 1.0);
  v_uv = vec2(0.0);
  v_color = vec3(0.0);
  v_seed = 0.0;
}

void main() {
  int inst = gl_InstanceID + u_offset;
  // (inst · prime) mod count without overflowing 32 bits (as Flow Painter's strokes)
  int idxA = (inst * (u_prime / 64)) % u_count;
  int idx = (idxA * 64 + inst * (u_prime % 64)) % u_count;
  uint s = hash(uint(idx) * 747796405u + uint(u_layer) * 2891336453u + uint(u_seed));
  vec2 cell = vec2(float(idx % u_cols), float(idx / u_cols));
  vec2 p0 = u_gridOrigin + (cell + vec2(rnd(s), rnd(s))) * u_cell;
  vec2 uv0 = p0 / u_size;
  if (uv0.x > 1.02 || uv0.y > 1.02) { hide(); return; }

  float size = u_dot * (0.8 + 0.4 * rnd(s));
  float faceRnd = rnd(s);
  bool nearFace = false;
  if (u_face >= 0) {
    // a face's own dots: all of the core, thinning out across the blend and growing toward the regular dots
    float e = faceE(p0, u_face);
    float w = 1.0 - smoothstep(FACE_INNER, FACE_OUTER, e);
    if (faceRnd >= w) { hide(); return; }
    size *= mix(1.0, 1.6, 1.0 - w);
  } else {
    for (int i = 0; i < 8; i++) {
      if (i >= u_faceCount) break;
      float w = 1.0 - smoothstep(FACE_INNER, FACE_OUTER, faceE(p0, i));
      if (u_dot > FACE_KEEP_OUT * u_faceShape[i].z) {
        if (faceRnd < w) { hide(); return; } // too coarse for this face
      } else if (faceRnd < w) {
        nearFace = true;
      }
    }
  }

  vec3 base = textureLod(u_src, uv0, u_lod).rgb;
  float gate = rnd(s);
  if (u_prevLod >= 0.0 && !nearFace) {
    vec3 coarse = textureLod(u_src, uv0, u_prevLod).rgb;
    if (length(base - coarse) < u_accept * (0.5 + gate)) { hide(); return; }
  }

  // Divisionism: push the color at random, then take the nearest pigment's hue. Neighbouring dots land
  // on different pigments around the photo's color and blend back to it at a distance. Each dot keeps
  // the photo's lightness (pigment mixed with white, or deepened), so faces and forms still read.
  vec3 lab = srgbToOklab(base);
  // dull colors get smaller pushes in hue, so greys and skin don't turn into confetti
  float chroma = length(lab.yz);
  vec3 push = (vec3(rnd(s), rnd(s), rnd(s)) - 0.5) * vec3(0.2, 0.2, 0.2) * mix(vec3(1.0, 0.6, 0.6), vec3(1.0), smoothstep(0.02, 0.12, chroma)) * u_separation;
  lab.yz *= 1.0 + 0.25 * u_separation; // pure pigments are more vivid than the photo
  vec3 want = lab + push;
  vec3 col;
  if (u_pigmentCount > 0) {
    vec3 best = u_pigments[0];
    float bestD = 1e9;
    for (int i = 0; i < 24; i++) {
      if (i >= u_pigmentCount) break;
      vec3 d = (u_pigments[i] - want) * vec3(0.35, 1.0, 1.0); // hue and chroma decide; lightness a little
      float dd = dot(d, d);
      if (dd < bestD) { bestD = dd; best = u_pigments[i]; }
    }
    // pure pigment hue at full separation; toward the photo's own color below it
    col = oklabToSrgb(mix(lab + push * 0.5, vec3(want.x, best.yz), u_separation));
  } else {
    col = oklabToSrgb(lab + push * vec3(0.8, 1.2, 1.2));
  }

  float ang = rnd(s) * 6.2831853;
  float aspect = 1.0 + 0.35 * rnd(s);
  v_seed = rnd(s);
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vec2 ax = vec2(cos(ang), sin(ang));
  vec2 ay = vec2(-ax.y, ax.x);
  vec2 pos = p0 + (ax * corner.x * aspect + ay * corner.y) * 0.5 * size;
  gl_Position = vec4(pos / u_size * 2.0 - 1.0, 0.0, 1.0);
  v_uv = corner;
  v_color = clamp(col, 0.0, 1.0);
}
