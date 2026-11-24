// Side-view silhouette rendering, matching the loading screen: black shapes, layered grey-teal
// fog, a radial misty sky, and only two sources of colour: headlight beams and amber explosions.
// Every material writes alpha = class * 32 + fog (see shaders.js) so the ASCII view keeps working.
import * as pc from 'playcanvas';

export const NHL = 8; // headlights the shaders know about
export const NFL = 4; // explosion flashes

const HASH_GLSL = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
const HASH_WGSL = `
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + vec3f(dot(p3, p3.yzx + vec3f(33.33)));
  return fract((p3.x + p3.y) * p3.z);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2f(1.0, 0.0)), f.x), mix(hash12(i + vec2f(0.0, 1.0)), hash12(i + vec2f(1.0, 1.0)), f.x), f.y);
}`;

// the loading-screen sky: radial-gradient(ellipse 90% 70% at 50% 42%, #66736f, #3f4a47 38%, #1a1f1d 78%, #0a0c0b)
const SKY_GLSL = `
uniform vec2 uRes;
uniform float uMono;
vec3 sky(vec2 uv) {
  float t = length((uv - vec2(0.5, 0.5)) / vec2(0.95, 0.74));
  vec3 c0 = vec3(0.40, 0.45, 0.435), c1 = vec3(0.247, 0.29, 0.278), c2 = vec3(0.102, 0.122, 0.114), c3 = vec3(0.039, 0.047, 0.043);
  vec3 c = t < 0.38 ? mix(c0, c1, t / 0.38) : t < 0.78 ? mix(c1, c2, (t - 0.38) / 0.4) : mix(c2, c3, clamp((t - 0.78) / 0.22, 0.0, 1.0));
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  return mix(c, vec3(l) * vec3(0.98, 1.0, 1.0), uMono);
}`;
const SKY_WGSL = `
uniform uRes: vec2f;
uniform uMono: f32;
fn sky(uv: vec2f) -> vec3f {
  let t = length((uv - vec2f(0.5, 0.5)) / vec2f(0.95, 0.74));
  let c0 = vec3f(0.40, 0.45, 0.435);
  let c1 = vec3f(0.247, 0.29, 0.278);
  let c2 = vec3f(0.102, 0.122, 0.114);
  let c3 = vec3f(0.039, 0.047, 0.043);
  var c = mix(c2, c3, clamp((t - 0.78) / 0.22, 0.0, 1.0));
  if (t < 0.78) { c = mix(c1, c2, (t - 0.38) / 0.4); }
  if (t < 0.38) { c = mix(c0, c1, t / 0.38); }
  let l = dot(c, vec3f(0.3, 0.59, 0.11));
  return mix(c, vec3f(l) * vec3f(0.98, 1.0, 1.0), uniform.uMono);
}`;

const range = (n) => Array.from({ length: n }, (_, i) => i);
const LIGHTS_GLSL = `
uniform float uWorldW;
${range(NHL).map((i) => `uniform vec4 uHL${i};`).join('\n')}
${range(NFL).map((i) => `uniform vec4 uFL${i};`).join('\n')}
// headlight: (x, y, angle, intensity); flash: (x, y, radius, strength)
vec3 beamLight(vec4 H, vec3 w) {
  vec2 d = w.xy - H.xy;
  float l = length(d) + 0.001;
  float c = dot(d / l, vec2(cos(H.z), sin(H.z)));
  float cone = smoothstep(0.972, 0.996, c);
  float att = clamp(1.0 - l / 15.0, 0.0, 1.0);
  return vec3(0.6, 0.47, 0.3) * cone * att * att * H.w;
}
vec3 flashLight(vec4 F, vec3 w) {
  vec2 d = w.xy - F.xy;
  return vec3(1.0, 0.55, 0.18) * F.w * exp(-dot(d, d) / max(F.z * F.z, 0.01));
}
vec3 allLights(vec3 w) {
  vec3 L = vec3(0.0);
  float nearPlane = 1.0 - smoothstep(2.0, 6.0, abs(w.z));
${range(NHL).map((i) => `  L += beamLight(uHL${i}, w) * nearPlane;`).join('\n')}
${range(NFL).map((i) => `  L += flashLight(uFL${i}, w);`).join('\n')}
  return L;
}`;
const LIGHTS_WGSL = `
uniform uWorldW: f32;
${range(NHL).map((i) => `uniform uHL${i}: vec4f;`).join('\n')}
${range(NFL).map((i) => `uniform uFL${i}: vec4f;`).join('\n')}
fn beamLight(H: vec4f, w: vec3f) -> vec3f {
  let d = w.xy - H.xy;
  let l = length(d) + 0.001;
  let c = dot(d / l, vec2f(cos(H.z), sin(H.z)));
  let cone = smoothstep(0.972, 0.996, c);
  let att = clamp(1.0 - l / 15.0, 0.0, 1.0);
  return vec3f(0.6, 0.47, 0.3) * cone * att * att * H.w;
}
fn flashLight(F: vec4f, w: vec3f) -> vec3f {
  let d = w.xy - F.xy;
  return vec3f(1.0, 0.55, 0.18) * F.w * exp(-dot(d, d) / max(F.z * F.z, 0.01));
}
fn allLights(w: vec3f) -> vec3f {
  var L = vec3f(0.0);
  let nearPlane = 1.0 - smoothstep(2.0, 6.0, abs(w.z));
${range(NHL).map((i) => `  L = L + beamLight(uniform.uHL${i}, w) * nearPlane;`).join('\n')}
${range(NFL).map((i) => `  L = L + flashLight(uniform.uFL${i}, w);`).join('\n')}
  return L;
}`;

// ---------------------------------------------------------------- silhouettes
const SIL_VS_GLSL = `
attribute vec3 vertex_position;
attribute vec4 vertex_color;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
uniform float uTime;
uniform float uSway;
varying vec3 vWorld;
varying float vCls;
void main(void) {
  float code = floor(vertex_color.a * 255.0 + 0.5);
  float cls = floor(code / 32.0);
  float sw = (code - cls * 32.0) / 31.0;
  vec4 wp = matrix_model * vec4(vertex_position, 1.0);
  float w = sw * sw * uSway;
  wp.x += sin(uTime * 1.3 + wp.x * 0.13 + wp.z * 0.3) * w;
  vWorld = wp.xyz;
  vCls = cls;
  gl_Position = matrix_viewProjection * wp;
}`;
const SIL_VS_WGSL = `
attribute vertex_position: vec3f;
attribute vertex_color: vec4f;
uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;
uniform uTime: f32;
uniform uSway: f32;
varying vWorld: vec3f;
varying vCls: f32;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let code = floor(input.vertex_color.a * 255.0 + 0.5);
  let cls = floor(code / 32.0);
  let sw = (code - cls * 32.0) / 31.0;
  var wp = uniform.matrix_model * vec4f(input.vertex_position, 1.0);
  let w = sw * sw * uniform.uSway;
  wp.x = wp.x + sin(uniform.uTime * 1.3 + wp.x * 0.13 + wp.z * 0.3) * w;
  output.vWorld = wp.xyz;
  output.vCls = cls;
  output.position = uniform.matrix_viewProjection * wp;
  return output;
}`;
const SIL_FS_GLSL = `
uniform float uShade;
uniform float uGlow;
uniform float uClsOverride;
varying vec3 vWorld;
varying float vCls;
${HASH_GLSL}
${SKY_GLSL}
${LIGHTS_GLSL}
void main(void) {
  vec2 uv = gl_FragCoord.xy / uRes;
  float depth = max(0.0, -vWorld.z);
  float fogK = 1.0 - exp(-depth / 24.0);
  // the fog walls at both ends of the glade
  fogK = max(fogK, smoothstep(uWorldW - 26.0, uWorldW + 2.0, abs(vWorld.x)) * 0.96);
  vec3 base = vec3(0.016, 0.017, 0.017) * uShade;
  vec3 c = mix(base, sky(uv) * 0.94, fogK * 0.93);
  c += allLights(vWorld) * (0.1 + 0.25 * (1.0 - fogK));
  if (vCls > 6.5) c = mix(c, vec3(1.0, 0.64, 0.28) * uGlow, 1.0 - fogK); // lamps, barrel bands, crate edges
  float cls = uClsOverride > 0.0 ? uClsOverride : vCls;
  float sub = floor(clamp(fogK, 0.0, 1.0) * 31.0);
  gl_FragColor = vec4(c, (cls * 32.0 + sub) / 255.0);
}`;
const SIL_FS_WGSL = `
uniform uShade: f32;
uniform uGlow: f32;
uniform uClsOverride: f32;
varying vWorld: vec3f;
varying vCls: f32;
${HASH_WGSL}
${SKY_WGSL}
${LIGHTS_WGSL}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let uv = input.position.xy / uniform.uRes;
  let uvf = vec2f(uv.x, 1.0 - uv.y);
  let depth = max(0.0, -input.vWorld.z);
  var fogK = 1.0 - exp(-depth / 24.0);
  fogK = max(fogK, smoothstep(uniform.uWorldW - 26.0, uniform.uWorldW + 2.0, abs(input.vWorld.x)) * 0.96);
  let base = vec3f(0.016, 0.017, 0.017) * uniform.uShade;
  var c = mix(base, sky(uvf) * 0.94, fogK * 0.93);
  c = c + allLights(input.vWorld) * (0.1 + 0.25 * (1.0 - fogK));
  if (input.vCls > 6.5) { c = mix(c, vec3f(1.0, 0.64, 0.28) * uniform.uGlow, 1.0 - fogK); }
  var cls = input.vCls;
  if (uniform.uClsOverride > 0.0) { cls = uniform.uClsOverride; }
  let sub = floor(clamp(fogK, 0.0, 1.0) * 31.0);
  output.color = vec4f(c, (cls * 32.0 + sub) / 255.0);
  return output;
}`;

// ---------------------------------------------------------------- sky (full-screen, far plane)
const SKY_VS_GLSL = `
attribute vec3 vertex_position;
void main(void) { gl_Position = vec4(vertex_position.xy, 0.99999, 1.0); }`;
const SKY_VS_WGSL = `
attribute vertex_position: vec3f;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(input.vertex_position.xy, 0.99999, 1.0);
  return output;
}`;
const SKY_FS_GLSL = `
uniform float uTime;
${HASH_GLSL}
${SKY_GLSL}
${LIGHTS_GLSL}
void main(void) {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = sky(uv);
  gl_FragColor = vec4(c, 0.0); // class 0 = haze in the ASCII view
}`;
const SKY_FS_WGSL = `
uniform uTime: f32;
${HASH_WGSL}
${SKY_WGSL}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let uv = input.position.xy / uniform.uRes;
  output.color = vec4f(sky(vec2f(uv.x, 1.0 - uv.y)), 0.0);
  return output;
}`;

// ---------------------------------------------------------------- glow / fog / smoke (blended, keep class alpha)
const COL_VS_GLSL = `
attribute vec3 vertex_position;
attribute vec4 vertex_color;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec3 vWorld;
varying vec4 vCol;
void main(void) {
  vec4 wp = matrix_model * vec4(vertex_position, 1.0);
  vWorld = wp.xyz;
  vCol = vertex_color;
  gl_Position = matrix_viewProjection * wp;
}`;
const COL_VS_WGSL = `
attribute vertex_position: vec3f;
attribute vertex_color: vec4f;
uniform matrix_model: mat4x4f;
uniform matrix_viewProjection: mat4x4f;
varying vWorld: vec3f;
varying vCol: vec4f;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let wp = uniform.matrix_model * vec4f(input.vertex_position, 1.0);
  output.vWorld = wp.xyz;
  output.vCol = input.vertex_color;
  output.position = uniform.matrix_viewProjection * wp;
  return output;
}`;
// additive light: beams, fireballs, sparks
const GLOW_FS_GLSL = `
uniform float uGain;
uniform float uTime;
varying vec3 vWorld;
varying vec4 vCol;
${HASH_GLSL}
void main(void) {
  float n = 0.82 + 0.36 * vnoise(vWorld.xy * 0.9 + vec2(uTime * 0.6, uTime * 0.2));
  gl_FragColor = vec4(vCol.rgb * vCol.a * uGain * n, 1.0);
}`;
const GLOW_FS_WGSL = `
uniform uGain: f32;
uniform uTime: f32;
varying vWorld: vec3f;
varying vCol: vec4f;
${HASH_WGSL}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let n = 0.82 + 0.36 * vnoise(input.vWorld.xy * 0.9 + vec2f(uniform.uTime * 0.6, uniform.uTime * 0.2));
  output.color = vec4f(input.vCol.rgb * input.vCol.a * uniform.uGain * n, 1.0);
  return output;
}`;
// drifting fog banks: sky-coloured, noisy alpha
const FOG_FS_GLSL = `
uniform float uTime;
uniform float uDensity;
varying vec3 vWorld;
varying vec4 vCol;
${HASH_GLSL}
${SKY_GLSL}
${LIGHTS_GLSL}
void main(void) {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vWorld.xy * vec2(0.035, 0.11) + vec2(uTime * 0.012 * (1.0 + vWorld.z * 0.01), 0.0);
  float n = vnoise(p) * 0.65 + vnoise(p * 2.3 + 7.1) * 0.35;
  float a = vCol.a * smoothstep(0.32, 0.8, n) * uDensity;
  vec3 c = sky(uv) * 1.12 + allLights(vWorld) * 0.35;
  gl_FragColor = vec4(c, a);
}`;
const FOG_FS_WGSL = `
uniform uTime: f32;
uniform uDensity: f32;
varying vWorld: vec3f;
varying vCol: vec4f;
${HASH_WGSL}
${SKY_WGSL}
${LIGHTS_WGSL}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let uv = input.position.xy / uniform.uRes;
  let p = input.vWorld.xy * vec2f(0.035, 0.11) + vec2f(uniform.uTime * 0.012 * (1.0 + input.vWorld.z * 0.01), 0.0);
  let n = vnoise(p) * 0.65 + vnoise(p * 2.3 + vec2f(7.1)) * 0.35;
  let a = input.vCol.a * smoothstep(0.32, 0.8, n) * uniform.uDensity;
  let c = sky(vec2f(uv.x, 1.0 - uv.y)) * 1.12 + allLights(input.vWorld) * 0.35;
  output.color = vec4f(c, a);
  return output;
}`;
// smoke / water: plain vertex colour, alpha blended
const TINT_FS_GLSL = `
varying vec3 vWorld;
varying vec4 vCol;
void main(void) { gl_FragColor = vCol; }`;
const TINT_FS_WGSL = `
varying vWorld: vec3f;
varying vCol: vec4f;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  output.color = input.vCol;
  return output;
}`;

// ---------------------------------------------------------------- normal-view display (no ASCII)
const BLIT_VS_GLSL = `
attribute vec3 vertex_position;
void main(void) { gl_Position = vec4(vertex_position.xy, 0.5, 1.0); }`;
const BLIT_VS_WGSL = `
attribute vertex_position: vec3f;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(input.vertex_position.xy, 0.5, 1.0);
  return output;
}`;
const BLIT_FS_GLSL = `
uniform sampler2D uScene;
uniform vec2 uScreen;
uniform float uTime;
${HASH_GLSL}
void main(void) {
  vec2 uv = gl_FragCoord.xy / uScreen;
  vec3 c = texture2D(uScene, uv).rgb;
  vec2 q = (uv - vec2(0.5, 0.54)) * vec2(uScreen.x / uScreen.y, 1.0);
  float vig = 1.0 - smoothstep(0.45, 1.25, length(q) * (uScreen.x > uScreen.y ? 1.0 : 1.4));
  c *= mix(0.28, 1.0, vig);
  float grain = (hash12(floor(gl_FragCoord.xy) + fract(uTime * 7.31) * 811.0) - 0.5) * 0.045;
  gl_FragColor = vec4(max(c + grain, vec3(0.0)), 1.0);
}`;
const BLIT_FS_WGSL = `
var uScene: texture_2d<f32>;
var uScene_sampler: sampler;
uniform uScreen: vec2f;
uniform uTime: f32;
${HASH_WGSL}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  // WebGPU framebuffer origin is top-left; the scene target is bottom-origin
  let fc = vec2f(input.position.x, uniform.uScreen.y - input.position.y);
  let uv = fc / uniform.uScreen;
  var c = textureSampleLevel(uScene, uScene_sampler, uv, 0.0).rgb;
  let q = (uv - vec2f(0.5, 0.54)) * vec2f(uniform.uScreen.x / uniform.uScreen.y, 1.0);
  var portrait = 1.0;
  if (uniform.uScreen.x <= uniform.uScreen.y) { portrait = 1.4; }
  let vig = 1.0 - smoothstep(0.45, 1.25, length(q) * portrait);
  c = c * mix(0.28, 1.0, vig);
  let grain = (hash12(floor(input.position.xy) + vec2f(fract(uniform.uTime * 7.31) * 811.0)) - 0.5) * 0.045;
  output.color = vec4f(max(c + vec3f(grain), vec3f(0.0)), 1.0);
  return output;
}`;

// ---------------------------------------------------------------- factories
const ATTR_PC = { vertex_position: pc.SEMANTIC_POSITION, vertex_color: pc.SEMANTIC_COLOR };
const keepAlpha = (src, dst) => new pc.BlendState(true, pc.BLENDEQUATION_ADD, src, dst, pc.BLENDEQUATION_ADD, pc.BLENDMODE_ZERO, pc.BLENDMODE_ONE);

export function silMaterial({ sway = 0, shade = 1, cls = 0, glow = 0.9, doubleSided = true } = {}) {
  const mat = new pc.ShaderMaterial({ uniqueName: 'sil', vertexGLSL: SIL_VS_GLSL, fragmentGLSL: SIL_FS_GLSL, vertexWGSL: SIL_VS_WGSL, fragmentWGSL: SIL_FS_WGSL, attributes: ATTR_PC });
  mat.setParameter('uSway', sway);
  mat.setParameter('uShade', shade);
  mat.setParameter('uClsOverride', cls);
  mat.setParameter('uGlow', glow);
  mat.cull = doubleSided ? pc.CULLFACE_NONE : pc.CULLFACE_BACK;
  mat.update();
  return mat;
}

export function skyMaterial() {
  const mat = new pc.ShaderMaterial({ uniqueName: 'sky2d', vertexGLSL: SKY_VS_GLSL, fragmentGLSL: SKY_FS_GLSL, vertexWGSL: SKY_VS_WGSL, fragmentWGSL: SKY_FS_WGSL, attributes: { vertex_position: pc.SEMANTIC_POSITION } });
  mat.cull = pc.CULLFACE_NONE;
  mat.depthWrite = false;
  mat.update();
  return mat;
}

export function glowMaterial(gain = 1) {
  const mat = new pc.ShaderMaterial({ uniqueName: 'glow2d', vertexGLSL: COL_VS_GLSL, fragmentGLSL: GLOW_FS_GLSL, vertexWGSL: COL_VS_WGSL, fragmentWGSL: GLOW_FS_WGSL, attributes: ATTR_PC });
  mat.blendState = keepAlpha(pc.BLENDMODE_ONE, pc.BLENDMODE_ONE);
  mat.depthWrite = false;
  mat.cull = pc.CULLFACE_NONE;
  mat.setParameter('uGain', gain);
  mat.update();
  return mat;
}

export function fogMaterial(density = 1) {
  const mat = new pc.ShaderMaterial({ uniqueName: 'fog2d', vertexGLSL: COL_VS_GLSL, fragmentGLSL: FOG_FS_GLSL, vertexWGSL: COL_VS_WGSL, fragmentWGSL: FOG_FS_WGSL, attributes: ATTR_PC });
  mat.blendState = keepAlpha(pc.BLENDMODE_SRC_ALPHA, pc.BLENDMODE_ONE_MINUS_SRC_ALPHA);
  mat.depthWrite = false;
  mat.cull = pc.CULLFACE_NONE;
  mat.setParameter('uDensity', density);
  mat.update();
  return mat;
}

export function tintMaterial() {
  const mat = new pc.ShaderMaterial({ uniqueName: 'tint2d', vertexGLSL: COL_VS_GLSL, fragmentGLSL: TINT_FS_GLSL, vertexWGSL: COL_VS_WGSL, fragmentWGSL: TINT_FS_WGSL, attributes: ATTR_PC });
  mat.blendState = keepAlpha(pc.BLENDMODE_SRC_ALPHA, pc.BLENDMODE_ONE_MINUS_SRC_ALPHA);
  mat.depthWrite = false;
  mat.cull = pc.CULLFACE_NONE;
  mat.update();
  return mat;
}

export function blit2dMaterial() {
  const mat = new pc.ShaderMaterial({ uniqueName: 'blit2d', vertexGLSL: BLIT_VS_GLSL, fragmentGLSL: BLIT_FS_GLSL, vertexWGSL: BLIT_VS_WGSL, fragmentWGSL: BLIT_FS_WGSL, attributes: { vertex_position: pc.SEMANTIC_POSITION } });
  mat.cull = pc.CULLFACE_NONE;
  mat.depthTest = false;
  mat.depthWrite = false;
  mat.update();
  return mat;
}
