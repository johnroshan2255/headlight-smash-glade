// The screen passes, written twice: GLSL (WebGL2) and WGSL (WebGPU, no runtime transpiler needed).
// (The world itself is drawn by the side-view silhouette shaders in sil.js.)
//
// Pipeline:
//   1. scene pass   -> low-res RT (one texel per glyph cell, or 2x2 when supersampling)
//                      rgb = lit colour, a = (class * 32 + sub) / 255  (glyph family + variant)
//   3. cell pass    -> runs once per glyph cell: picks the glyph index + colour (edge detect etc.)
//   4. composite    -> full resolution: 2 texel fetches per pixel (cell + glyph atlas)
//
// All render targets use RENDERTARGET_ORIGIN_BOTTOM so memory row 0 is the bottom of the image on
// both backends; that lets every pass address texels with integer fragment coordinates.

import * as pc from 'playcanvas';

export const CLS = { EMPTY: 0, GROUND: 1, GRASS: 2, FOLIAGE: 3, STONE: 4, WATER: 5, CHAR: 6, GLOW: 7 };

// Glyph families. Ramps go dark -> bright.
const SETS = [
  ['blank', ' '],
  ['ground', ' .,:;+*ox%#'],
  ['grass', '\\`(|!i/\')'], // sub 0-2 lean left | 3-5 upright | 6-8 lean right
  ['grassDim', ' .,'],
  ['foliage', ' .:oadbQ08@'],
  ['stone', ' .:-=x#HBWM'],
  ['water', ' .-~=oO0@'],
  ['char', ' .:-+=xX%#@'],
  ['glow', ' .\'*+oO@'],
  ['edge', '|-/\\'],
  ['haze', ' .,:-=+*'],
];

export const GLYPHS = (() => {
  let chars = '';
  const off = {};
  for (const [k, s] of SETS) {
    off[k] = [chars.length, s.length];
    chars += s;
  }
  return { chars, off };
})();

const O = GLYPHS.off;
const RAMPS = [
  [CLS.GROUND, 'ground'], [CLS.FOLIAGE, 'foliage'], [CLS.STONE, 'stone'],
  [CLS.WATER, 'water'], [CLS.CHAR, 'char'], [CLS.GLOW, 'glow'],
];
const rampIfs = (lang) => RAMPS.map(([cls, key], i) => {
  const [o, n] = O[key];
  const kw = i === 0 ? 'if' : 'else if';
  return lang === 'glsl'
    ? `${kw} (cls == ${cls}) { ro = ${o}; rn = ${n}; }`
    : `${kw} (cls == ${cls}) { ro = ${o}; rn = ${n}; }`;
}).join('\n    ');

const f = (n) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

// ---------------------------------------------------------------- shared snippets
const HASH_GLSL = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;
const HASH_WGSL = `
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + vec3f(dot(p3, p3.yzx + vec3f(33.33)));
  return fract((p3.x + p3.y) * p3.z);
}`;

// Wind "gust" field shared by terrain and grass so strokes lean together.
// ---------------------------------------------------------------- full-screen quad vertex
const QUAD_VS_GLSL = `
attribute vec3 vertex_position;
void main(void) {
  gl_Position = vec4(vertex_position.xy, 0.5, 1.0);
}`;
const QUAD_VS_WGSL = `
attribute vertex_position: vec3f;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(input.vertex_position.xy, 0.5, 1.0);
  return output;
}`;

// Grade: uMono = 0 -> muted colour (desaturated, teal shadows, warm light kept strongest)
//        uMono = 1 -> monochrome (everything cold grey except warm light)
const GRADE_GLSL = `
uniform float uMono;
vec3 grade(vec3 c) {
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  float mx = max(c.r, max(c.g, c.b));
  float warm = clamp((c.r - c.b) / max(mx, 0.0001) * 1.8 - 0.45, 0.0, 1.0) * smoothstep(0.015, 0.08, l);
  float amber = smoothstep(0.3, 0.42, c.g / max(c.r, 0.0001)); // flame-coloured, not red
  vec3 mono = mix(vec3(l) * vec3(0.94, 0.97, 1.0), c, warm * amber * 0.9);
  // muted colour: keep ~60% saturation, push shadows slightly teal, keep warm light rich
  vec3 muted = mix(vec3(l), c, 0.62) * mix(vec3(0.9, 1.0, 1.04), vec3(1.0), smoothstep(0.05, 0.45, l));
  muted = mix(muted, c, warm * 0.8);
  return mix(muted, mono, uMono);
}`;
const GRADE_WGSL = `
uniform uMono: f32;
fn grade(c: vec3f) -> vec3f {
  let l = dot(c, vec3f(0.3, 0.59, 0.11));
  let mx = max(c.r, max(c.g, c.b));
  let warm = clamp((c.r - c.b) / max(mx, 0.0001) * 1.8 - 0.45, 0.0, 1.0) * smoothstep(0.015, 0.08, l);
  let amber = smoothstep(0.3, 0.42, c.g / max(c.r, 0.0001));
  let mono = mix(vec3f(l) * vec3f(0.94, 0.97, 1.0), c, warm * amber * 0.9);
  var muted = mix(vec3f(l), c, 0.62) * mix(vec3f(0.9, 1.0, 1.04), vec3f(1.0), smoothstep(0.05, 0.45, l));
  muted = mix(muted, c, warm * 0.8);
  return mix(muted, mono, uniform.uMono);
}`;

// ---------------------------------------------------------------- cell pass (one fragment per glyph)
// Output: rgb = glyph colour, a = (glyph index + 128 if the cell is a haze cell) / 255.
// Haze cells get a solid grey background in the composite, so fog reads as fog, not as '@'s.
const CELL_FS_GLSL = `
uniform sampler2D uScene;
uniform float uSS;
uniform float uExposure;
uniform float uEdge;
uniform float uTime;
${HASH_GLSL}
${GRADE_GLSL}
float lumOf(vec3 c) { return 1.0 - exp(-dot(c, vec3(0.3, 0.59, 0.11)) * uExposure); }
vec4 fetchS(ivec2 p, ivec2 mx) { return texelFetch(uScene, clamp(p, ivec2(0), mx), 0); }
void main(void) {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  ivec2 mx = textureSize(uScene, 0) - ivec2(1);
  int s = int(uSS + 0.5);
  ivec2 b = cell * s;
  vec4 cc = fetchS(b + ivec2(s / 2), mx);
  vec3 avg = cc.rgb;
  if (s > 1) {
    avg = (fetchS(b, mx).rgb + fetchS(b + ivec2(1, 0), mx).rgb + fetchS(b + ivec2(0, 1), mx).rgb + cc.rgb) * 0.25;
  }
  float L = lumOf(avg);
  float gx = lumOf(fetchS(b + ivec2(s + s / 2, s / 2), mx).rgb) - lumOf(fetchS(b + ivec2(-s + s / 2, s / 2), mx).rgb);
  float gy = lumOf(fetchS(b + ivec2(s / 2, s + s / 2), mx).rgb) - lumOf(fetchS(b + ivec2(s / 2, -s + s / 2), mx).rgb);

  int code = int(cc.a * 255.0 + 0.5);
  int cls = code / 32;
  int sub = code - cls * 32;
  vec2 cuv = (vec2(cell) + 0.5) / vec2((mx + 1) / s);
  vec2 vq = cuv - 0.5;
  float vig = clamp(1.0 - dot(vq, vq) * 1.6, 0.0, 1.0);
  float fogA = (cls == 0) ? 1.0 : ((cls == ${CLS.GRASS} || cls == ${CLS.WATER}) ? 0.0 : float(sub) / 31.0);
  bool haze = fogA > 0.6 || (cls == ${CLS.WATER} && sub == 0);
  int g = 0;
  if (haze) {
    // fog / mirror-water: grey cell with sparse drifting dither glyphs
    float h = hash12(vec2(cell) + vec2(floor(uTime * 5.0), floor(uTime * 3.0) * 7.0));
    int n = ${O.haze[1]};
    if (cls == ${CLS.WATER}) g = ${O.water[0]} + min(4, int(L * 5.0 + h * 1.2));
    else g = ${O.haze[0]} + clamp(int(L * float(n) * 0.55 + (h - 0.5) * 1.6), 0, n - 1);
  } else if (cls == ${CLS.GRASS}) {
    if (L < 0.05) g = 0;
    else if (L < 0.14) g = ${O.grassDim[0]} + 1 + int(step(0.5, hash12(vec2(cell))));
    else g = ${O.grass[0]} + min(sub, 8);
  } else if (cls > 0) {
    int ro = 0; int rn = 1;
    ${rampIfs('glsl')}
    g = ro + min(rn - 1, int(L * float(rn)));
    bool edgy = cls == ${CLS.STONE} || cls == ${CLS.FOLIAGE} || cls == ${CLS.CHAR};
    float ax = abs(gx); float ay = abs(gy);
    if (edgy && L > 0.06 && ax + ay > uEdge) {
      int e = ax > ay * 2.0 ? 0 : (ay > ax * 2.0 ? 1 : (gx * gy > 0.0 ? 3 : 2));
      g = ${O.edge[0]} + e;
    }
  }
  vec3 gc = grade(avg);
  vec3 col;
  if (haze) {
    col = gc * 1.15 * mix(0.55, 1.0, vig);
    g += 128;
  } else {
    vec3 hue = gc / max(max(gc.r, max(gc.g, gc.b)), 0.0001);
    float k = mix(0.3, 1.1, L) * (cls == ${CLS.GLOW} ? 1.3 : 1.0);
    col = hue * k * mix(0.35, 1.0, vig);
  }
  gl_FragColor = vec4(min(col, vec3(1.0)), float(g) / 255.0);
}`;

const CELL_FS_WGSL = `
var uScene: texture_2d<f32>;
var uScene_sampler: sampler;
uniform uSS: f32;
uniform uExposure: f32;
uniform uEdge: f32;
uniform uTime: f32;
${HASH_WGSL}
${GRADE_WGSL}
fn lumOf(c: vec3f) -> f32 { return 1.0 - exp(-dot(c, vec3f(0.3, 0.59, 0.11)) * uniform.uExposure); }
fn fetchS(p: vec2i, mx: vec2i) -> vec4f { return textureLoad(uScene, clamp(p, vec2i(0), mx), 0); }
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let cell = vec2i(input.position.xy);
  let mx = vec2i(textureDimensions(uScene, 0)) - vec2i(1);
  let s = i32(uniform.uSS + 0.5);
  let h2 = s / 2;
  let b = cell * s;
  let cc = fetchS(b + vec2i(h2, h2), mx);
  var avg = cc.rgb;
  if (s > 1) {
    avg = (fetchS(b, mx).rgb + fetchS(b + vec2i(1, 0), mx).rgb + fetchS(b + vec2i(0, 1), mx).rgb + cc.rgb) * 0.25;
  }
  let L = lumOf(avg);
  let gx = lumOf(fetchS(b + vec2i(s + h2, h2), mx).rgb) - lumOf(fetchS(b + vec2i(-s + h2, h2), mx).rgb);
  let gy = lumOf(fetchS(b + vec2i(h2, s + h2), mx).rgb) - lumOf(fetchS(b + vec2i(h2, -s + h2), mx).rgb);

  let code = i32(cc.a * 255.0 + 0.5);
  let cls = code / 32;
  let sub = code - cls * 32;
  let cellf = vec2f(cell);
  let cuv = (cellf + vec2f(0.5)) / vec2f((mx + vec2i(1)) / s);
  let vq = cuv - vec2f(0.5);
  let vig = clamp(1.0 - dot(vq, vq) * 1.6, 0.0, 1.0);
  var fogA = f32(sub) / 31.0;
  if (cls == ${CLS.GRASS} || cls == ${CLS.WATER}) { fogA = 0.0; }
  if (cls == 0) { fogA = 1.0; }
  let haze = fogA > 0.6 || (cls == ${CLS.WATER} && sub == 0);
  var g: i32 = 0;
  if (haze) {
    let h = hash12(cellf + vec2f(floor(uniform.uTime * 5.0), floor(uniform.uTime * 3.0) * 7.0));
    let n = ${O.haze[1]};
    if (cls == ${CLS.WATER}) { g = ${O.water[0]} + min(4, i32(L * 5.0 + h * 1.2)); }
    else { g = ${O.haze[0]} + clamp(i32(L * f32(n) * 0.55 + (h - 0.5) * 1.6), 0, n - 1); }
  } else if (cls == ${CLS.GRASS}) {
    if (L < 0.05) { g = 0; }
    else if (L < 0.14) { g = ${O.grassDim[0]} + 1 + i32(step(0.5, hash12(cellf))); }
    else { g = ${O.grass[0]} + min(sub, 8); }
  } else if (cls > 0) {
    var ro: i32 = 0;
    var rn: i32 = 1;
    ${rampIfs('wgsl')}
    g = ro + min(rn - 1, i32(L * f32(rn)));
    let edgy = cls == ${CLS.STONE} || cls == ${CLS.FOLIAGE} || cls == ${CLS.CHAR};
    let ax = abs(gx);
    let ay = abs(gy);
    if (edgy && L > 0.06 && ax + ay > uniform.uEdge) {
      var e: i32 = 2;
      if (ax > ay * 2.0) { e = 0; }
      else if (ay > ax * 2.0) { e = 1; }
      else if (gx * gy > 0.0) { e = 3; }
      g = ${O.edge[0]} + e;
    }
  }
  let gc = grade(avg);
  var col: vec3f;
  if (haze) {
    col = gc * 1.15 * mix(0.55, 1.0, vig);
    g = g + 128;
  } else {
    let hue = gc / max(max(gc.r, max(gc.g, gc.b)), 0.0001);
    let k = mix(0.3, 1.1, L) * select(1.0, 1.3, cls == ${CLS.GLOW});
    col = hue * k * mix(0.35, 1.0, vig);
  }
  output.color = vec4f(min(col, vec3f(1.0)), f32(g) / 255.0);
  return output;
}`;

// ---------------------------------------------------------------- composite (full resolution)
const COMP_FS_GLSL = `
uniform sampler2D uCells;
uniform sampler2D uAtlas;
uniform vec2 uCell;
uniform float uBgMix;
uniform vec3 uBg;
void main(void) {
  ivec2 px = ivec2(gl_FragCoord.xy);
  ivec2 cs = ivec2(uCell + 0.5);
  ivec2 cell = min(px / cs, textureSize(uCells, 0) - ivec2(1));
  ivec2 lp = px - cell * cs;
  vec4 c = texelFetch(uCells, cell, 0);
  int g = int(c.a * 255.0 + 0.5);
  float bg = uBgMix;
  if (g >= 128) { g -= 128; bg = 0.6; }
  float m = texelFetch(uAtlas, ivec2(g * cs.x + lp.x, cs.y - 1 - lp.y), 0).r;
  vec3 col = bg > 0.5 ? c.rgb * (0.26 + m * 0.75) : c.rgb * (m + bg);
  gl_FragColor = vec4(col + uBg, 1.0);
}`;
const COMP_FS_WGSL = `
var uCells: texture_2d<f32>;
var uCells_sampler: sampler;
var uAtlas: texture_2d<f32>;
var uAtlas_sampler: sampler;
uniform uCell: vec2f;
uniform uBgMix: f32;
uniform uBg: vec3f;
uniform uScreenH: f32;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  // WebGPU framebuffer origin is top-left: convert to bottom-left to match the cell texture.
  let px = vec2i(i32(input.position.x), i32(uniform.uScreenH) - 1 - i32(input.position.y));
  let cs = vec2i(uniform.uCell + vec2f(0.5));
  let cell = min(px / cs, vec2i(textureDimensions(uCells, 0)) - vec2i(1));
  let lp = px - cell * cs;
  let c = textureLoad(uCells, cell, 0);
  var g = i32(c.a * 255.0 + 0.5);
  var hazeCell = false;
  if (g >= 128) { g = g - 128; hazeCell = true; }
  let m = textureLoad(uAtlas, vec2i(g * cs.x + lp.x, cs.y - 1 - lp.y), 0).r;
  var col = c.rgb * (m + uniform.uBgMix);
  if (hazeCell) { col = c.rgb * (0.26 + m * 0.75); }
  output.color = vec4f(col + uniform.uBg, 1.0);
  return output;
}`;

// ---------------------------------------------------------------- normal (non-ASCII) display
// Old-film look: tone curve, near-monochrome grade, S-curve contrast, tilt-shift blur at the top
// and bottom (miniature / dollhouse feel), heavy vignette, animated grain and light flicker.
const BLIT_FS_GLSL = `
uniform sampler2D uScene;
uniform vec2 uScreen;
uniform float uTime;
uniform float uBlur;
uniform vec4 uGlow;
${HASH_GLSL}
${GRADE_GLSL}
void main(void) {
  vec2 uv = gl_FragCoord.xy / uScreen;
  vec3 c = texture2D(uScene, uv).rgb;
  float band = smoothstep(0.18, 0.5, abs(uv.y - 0.42));
  if (uBlur > 0.0 && band > 0.01) {
    vec2 o = vec2(uBlur * band) * vec2(uScreen.y / uScreen.x, 1.0); // uBlur = fraction of screen height
    c = (c * 2.0 + texture2D(uScene, uv + vec2(o.x, o.y)).rgb + texture2D(uScene, uv + vec2(-o.x, o.y)).rgb
       + texture2D(uScene, uv + vec2(o.x, -o.y)).rgb + texture2D(uScene, uv + vec2(-o.x, -o.y)).rgb) / 6.0;
  }
  float l0 = dot(c, vec3(0.3, 0.59, 0.11));
  c *= (1.0 - exp(-l0 * 2.4)) / max(l0, 0.0001);
  c = min(grade(c), vec3(1.0));
  vec3 sc = c * c * (3.0 - 2.0 * c);
  c = mix(c, sc, 0.65);
  vec2 gq = (uv - uGlow.xy) * vec2(uScreen.x / uScreen.y, 1.0);
  c += vec3(1.0, 0.52, 0.18) * exp(-dot(gq, gq) / max(uGlow.z * uGlow.z, 0.00001)) * uGlow.w;
  vec2 q = (uv - 0.5) * vec2(uScreen.x / uScreen.y, 1.0);
  float vig = 1.0 - smoothstep(0.25, 1.05, length(q) * (uScreen.x > uScreen.y ? 1.0 : 1.35));
  c *= mix(0.12, 1.0, vig);
  float flick = 1.0 + (hash12(vec2(floor(uTime * 14.0), 3.7)) - 0.5) * 0.035;
  float grain = (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 811.0) - 0.5) * 0.07;
  c = c * flick + grain;
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
}`;
const BLIT_FS_WGSL = `
var uScene: texture_2d<f32>;
var uScene_sampler: sampler;
uniform uScreen: vec2f;
uniform uTime: f32;
uniform uBlur: f32;
uniform uGlow: vec4f;
${HASH_WGSL}
${GRADE_WGSL}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  // WebGPU framebuffer origin is top-left; the scene target is bottom-origin
  let fc = vec2f(input.position.x, uniform.uScreen.y - input.position.y);
  let uv = fc / uniform.uScreen;
  var c = textureSampleLevel(uScene, uScene_sampler, uv, 0.0).rgb;
  let band = smoothstep(0.18, 0.5, abs(uv.y - 0.42));
  if (uniform.uBlur > 0.0 && band > 0.01) {
    let o = vec2f(uniform.uBlur * band) * vec2f(uniform.uScreen.y / uniform.uScreen.x, 1.0);
    c = (c * 2.0 + textureSampleLevel(uScene, uScene_sampler, uv + vec2f(o.x, o.y), 0.0).rgb
       + textureSampleLevel(uScene, uScene_sampler, uv + vec2f(-o.x, o.y), 0.0).rgb
       + textureSampleLevel(uScene, uScene_sampler, uv + vec2f(o.x, -o.y), 0.0).rgb
       + textureSampleLevel(uScene, uScene_sampler, uv + vec2f(-o.x, -o.y), 0.0).rgb) / 6.0;
  }
  let l0 = dot(c, vec3f(0.3, 0.59, 0.11));
  c = c * ((1.0 - exp(-l0 * 2.4)) / max(l0, 0.0001));
  c = min(grade(c), vec3f(1.0));
  let sc = c * c * (vec3f(3.0) - 2.0 * c);
  c = mix(c, sc, 0.65);
  let gq = (uv - uniform.uGlow.xy) * vec2f(uniform.uScreen.x / uniform.uScreen.y, 1.0);
  c = c + vec3f(1.0, 0.52, 0.18) * exp(-dot(gq, gq) / max(uniform.uGlow.z * uniform.uGlow.z, 0.00001)) * uniform.uGlow.w;
  let q = (uv - vec2f(0.5)) * vec2f(uniform.uScreen.x / uniform.uScreen.y, 1.0);
  let vig = 1.0 - smoothstep(0.25, 1.05, length(q) * select(1.35, 1.0, uniform.uScreen.x > uniform.uScreen.y));
  c = c * mix(0.12, 1.0, vig);
  let flick = 1.0 + (hash12(vec2f(floor(uniform.uTime * 14.0), 3.7)) - 0.5) * 0.035;
  let grain = (hash12(fc + vec2f(fract(uniform.uTime * 7.31) * 811.0)) - 0.5) * 0.07;
  c = c * flick + vec3f(grain);
  output.color = vec4f(max(c, vec3f(0.0)), 1.0);
  return output;
}`;

// ---------------------------------------------------------------- material factories
function quadMaterial(name, fsGLSL, fsWGSL) {
  const mat = new pc.ShaderMaterial({
    uniqueName: name,
    vertexGLSL: QUAD_VS_GLSL,
    fragmentGLSL: fsGLSL,
    vertexWGSL: QUAD_VS_WGSL,
    fragmentWGSL: fsWGSL,
    attributes: { vertex_position: pc.SEMANTIC_POSITION },
  });
  mat.cull = pc.CULLFACE_NONE;
  mat.depthTest = false;
  mat.depthWrite = false;
  mat.update();
  return mat;
}

export const cellMaterial = () => quadMaterial('asciiCell', CELL_FS_GLSL, CELL_FS_WGSL);
export const compositeMaterial = () => quadMaterial('asciiComposite', COMP_FS_GLSL, COMP_FS_WGSL);
export const blitMaterial = () => quadMaterial('normalBlit', BLIT_FS_GLSL, BLIT_FS_WGSL);
