// Final pass: lights the paint. Normals come from the paint's thickness, so every ridge, furrow and
// stroke edge catches the light on one side and falls into shade on the other, and wet oil glints.
// Flat paint keeps its color exactly (the shading is divided by flat paint's own lighting).
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_paint;
uniform sampler2D u_height;
uniform vec2 u_texel;
uniform float u_ref;   // px per reference px
uniform float u_unit;  // stored thickness × u_unit = reference px
uniform vec3 u_light;  // toward the light, image space (y down)
uniform float u_gloss; // 0–1
uniform float u_weave; // 0–1 strength of the canvas showing through thin paint

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

/** Canvas weave as a height (reference px), only where the paint is thin. */
float weave(vec2 px) {
  vec2 q = px / (u_ref * 2.2);
  float wx = 0.5 + 0.5 * sin(q.x * 6.2831853);
  float wy = 0.5 + 0.5 * sin(q.y * 6.2831853);
  float over = mod(floor(q.x) + floor(q.y), 2.0) < 1.0 ? wx : wy;
  return over * 0.35 + hash(floor(px / max(u_ref, 1.0))) * 0.1;
}

/** Surface height at an offset in px, in reference px. */
float H(vec2 d) {
  float paint = texture(u_height, v_uv + d * u_texel).r * u_unit;
  return paint + u_weave * weave(gl_FragCoord.xy + d) * (1.0 - smoothstep(0.0, 1.5, paint));
}

void main() {
  vec3 c = texture(u_paint, v_uv).rgb;
  // slope: reference px of height per reference px across (1 px = 1 / u_ref reference px)
  // over 1.5 px each way, which also softens the stair-steps of 8-bit thickness
  float sx = (H(vec2(1.5, 0.0)) - H(vec2(-1.5, 0.0))) / 3.0 * u_ref;
  float sy = (H(vec2(0.0, 1.5)) - H(vec2(0.0, -1.5))) / 3.0 * u_ref;
  vec3 n = normalize(vec3(-sx, -sy, 1.0));
  vec3 L = normalize(u_light);
  float diffuse = max(dot(n, L), 0.0) / L.z;
  float shade = clamp(0.5 + 0.5 * diffuse, 0.55, 1.3);
  // Blinn highlight, measured against flat paint's so only slopes facing the light glint.
  vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = max(0.0, pow(max(dot(n, hv), 0.0), 32.0) - pow(hv.z, 32.0));
  vec3 lit = c * shade + vec3(1.0, 0.98, 0.94) * spec * u_gloss * 0.55;
  outColor = vec4(clamp(lit, 0.0, 1.0), 1.0);
}
