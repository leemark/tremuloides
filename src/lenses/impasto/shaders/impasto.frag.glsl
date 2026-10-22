// Impasto stroke: Flow Painter's bristle color (stroke.frag) plus the thickness of the paint it leaves.
// Attachment 0 is the paint, attachment 1 its thickness. Both blend "over", so a stroke covers the ridges
// beneath it, and its own edges stand up from them.
in vec2 v_st;
in vec3 v_color;
flat in float v_seed;
flat in float v_run;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outHeight;
uniform float u_bristles; // streaks across the stroke
uniform float u_dry;      // how many bristles run dry toward the tail
uniform float u_thick;    // height of a full bead of paint (reference px / HEIGHT_UNIT)

float h1(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }

void main() {
  float across = v_st.y * 0.5 + 0.5;
  float b = floor(across * u_bristles);
  float n = h1(b + v_seed * 97.0);
  float n2 = h1(b * 1.7 + v_seed * 41.0 + 5.0);
  float edge = 1.0 - smoothstep(0.65, 1.0, abs(v_st.y));
  float ends = smoothstep(0.0, 0.1, v_st.x) * (1.0 - smoothstep(0.8, 1.0, v_st.x));
  float dry = step(n2, u_dry * smoothstep(0.5, 1.0, v_run) * smoothstep(0.55, 1.0, v_st.x));
  float alpha = 0.92 * edge * ends * (1.0 - dry);
  vec3 col = v_color * (0.9 + 0.2 * n);
  outColor = vec4(clamp(col, 0.0, 1.0), alpha);

  // A rounded bead of paint across the stroke, combed into furrows by the bristles.
  float t = abs(v_st.y);
  float bead = sqrt(max(0.0, 1.0 - t * t));
  // each bristle leaves its own ridge height, blended smoothly into its neighbours'
  float fb = across * u_bristles - 0.5;
  float r0 = h1(floor(fb) + v_seed * 53.0);
  float r1 = h1(floor(fb) + 1.0 + v_seed * 53.0);
  float furrows = 0.8 + 0.2 * mix(r0, r1, smoothstep(0.0, 1.0, fract(fb)));
  // Along it: loaded and thick where the brush lands, thinning as it drags, with a lip of paint where it lifts.
  float s = v_st.x;
  float along = mix(1.0, 0.55, s) + 0.45 * exp(-pow((s - 0.86) / 0.07, 2.0));
  along *= sqrt(ends);
  // short dabs keep all their paint; dry bristles leave only a scrape
  float h = u_thick * bead * furrows * along * mix(0.75, 1.0, 1.0 - v_run) * (1.0 - 0.8 * dry);
  // covers what's beneath as firmly as the paint does, a little more in the middle of the stroke
  float cover = clamp(alpha * 1.08, 0.0, 1.0);
  outHeight = vec4(h, 0.0, 0.0, cover);
}
