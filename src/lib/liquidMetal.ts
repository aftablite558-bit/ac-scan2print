// AC Scan2Print — Liquid Metal WebGL2 Math, State Geometry & Shaders
// Adapted from Liquid Metal Login V4 for Obsidian (#111318), Electric Cyan (#25C7D9) & Silver.

export type LiquidMetalStatus = 'idle' | 'loading' | 'success' | 'error';

export type MercuryLoginState =
  | 'idle'
  | 'opening'
  | 'open'
  | 'closing'
  | 'loading'
  | 'wrong'
  | 'done';

export const LIQUID_METAL_RIPPLE_DURATION = 1.15;
export const MERCURY_VIRTUAL_WIDTH = 540;
export const MERCURY_VIRTUAL_HEIGHT = 476;
export const MERCURY_CENTER_X = 270;
export const MERCURY_CENTER_Y = 190;
export const MERCURY_STRETCH = 196;
export const MERCURY_SNAP_DURATION = 0.94;
export const MERCURY_OPEN_SETTLE_DURATION = 0.5;
export const MERCURY_CLOSE_DURATION = 0.38;
export const MERCURY_PILL_HALF_WIDTH = 232;
export const MERCURY_PILL_HALF_HEIGHT = 44;
export const MERCURY_FIELD_HALF_WIDTH = 250;
export const MERCURY_FIELD_HALF_HEIGHT = 44;
export const MERCURY_FIELD_GAP = 22;
export const MERCURY_SPLIT_HALF_HEIGHT = 26;
export const MERCURY_WAIST_INITIAL = 192;

// Dual Liquid Metal action pills inside the open state (single unified WebGL2 stage)
export const MERCURY_ACTION_Y = 404;
export const MERCURY_CANCEL_CENTER_X = 98;
export const MERCURY_CANCEL_HALF_WIDTH = 78;
export const MERCURY_CANCEL_HALF_HEIGHT = 38;
export const MERCURY_AUTH_CENTER_X = 356;
export const MERCURY_AUTH_HALF_WIDTH = 164;
export const MERCURY_AUTH_HALF_HEIGHT = 38;

export function clamp01(x: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, x));
}

export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

export function easeOutCubic(k: number): number {
  return 1 - Math.pow(1 - clamp01(k), 3);
}

export function easeInOutCubic(k: number): number {
  const c = clamp01(k);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export function springResponse(s: number, w: number, z: number): number {
  if (s <= 0) return 0;
  const wd = w * Math.sqrt(Math.max(1e-4, 1 - z * z));
  return (
    1 -
    Math.exp(-z * w * s) *
      (Math.cos(wd * s) + (z / Math.sqrt(Math.max(1e-4, 1 - z * z))) * Math.sin(wd * s))
  );
}

export function shouldUseWebglLiquidMetal(input: {
  hasWebgl2: boolean;
  reducedMotion: boolean;
}): boolean {
  return Boolean(input.hasWebgl2 && !input.reducedMotion);
}

export function computeErrorFlushEnvelope(
  elapsedSec: number,
  durationSec = LIQUID_METAL_RIPPLE_DURATION
): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0 || elapsedSec > durationSec + 0.3) {
    return 0;
  }
  const attack = clamp01(elapsedSec / 0.06);
  const decayK = clamp01((elapsedSec - 0.42) / 0.62);
  const release = 1 - decayK * decayK * (3 - 2 * decayK);
  return attack * release;
}

export function computeLoadingKeyLightX(elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return -0.45;
  return -0.45 + 1.35 * Math.sin((2 * Math.PI * elapsedSec) / 0.94);
}

export function computeButtonPillHalfSize(input: {
  baseHalfWidth: number;
  baseHalfHeight: number;
  pressAmount: number;
  hoverAmount: number;
  errorElapsedSec: number;
}): [number, number] {
  const press = clamp01(input.pressAmount);
  const hover = clamp01(input.hoverAmount);
  let hw = input.baseHalfWidth + 2.5 * press + 1.2 * hover;
  let hh = input.baseHalfHeight - 3.0 * press;

  if (input.errorElapsedSec >= 0 && input.errorElapsedSec < LIQUID_METAL_RIPPLE_DURATION) {
    const gulp = Math.exp(-4.5 * input.errorElapsedSec) * Math.sin(19 * input.errorElapsedSec);
    hw += 4.5 * gulp;
    hh -= 3.2 * gulp;
  }
  return [hw, Math.max(12, hh)];
}

export function computeActionPillHalfSize(input: {
  baseHalfWidth: number;
  baseHalfHeight: number;
  pressAmount: number;
  hoverAmount: number;
  appearAmount: number;
}): [number, number] {
  const press = clamp01(input.pressAmount);
  const hover = clamp01(input.hoverAmount);
  const appear = clamp01(input.appearAmount);
  const scale = lerp(0.86, 1, easeOutCubic(appear));
  const hw = (input.baseHalfWidth + 2.4 * press + 1.4 * hover) * scale;
  const hh = Math.max(12, (input.baseHalfHeight - 3.2 * press + 0.6 * hover) * scale);
  return [hw, hh];
}

export interface MercuryGeometryFrame {
  hw: number;
  rest: number;
  gap: number;
  hh: number;
  field: number;
  waist: number;
  patch: number;
  snap: number;
  pillHalf: [number, number];
  flash: number;
  merge: number;
  shiver: number;
  rOut: number;
  rIn: number;
}

export function computeMercuryGeometry(input: {
  state: MercuryLoginState;
  stateElapsedSec: number;
  mergeElapsedSec: number;
  wrongElapsedSec: number;
  pressAmount: number;
}): MercuryGeometryFrame {
  const tau = Math.max(0, input.stateElapsedSec);
  const press = clamp01(input.pressAmount);
  let hw = MERCURY_PILL_HALF_WIDTH;
  let rest = 1;
  let gap = 0;
  let hh = MERCURY_SPLIT_HALF_HEIGHT;
  let field = 0;
  let waist = -1e4;
  let patch = 0;
  let snap = 0;
  let pillHalf: [number, number] = [
    MERCURY_PILL_HALF_WIDTH + 3 * press,
    MERCURY_PILL_HALF_HEIGHT - 4 * press,
  ];
  let flash = 0;
  let merge = 0;
  let shiver = -1;

  if (input.state === 'opening' || input.state === 'open') {
    rest = 0;
    if (tau < MERCURY_SNAP_DURATION) {
      const k = tau / MERCURY_SNAP_DURATION;
      rest = 1 - clamp01(tau / 0.05);
      gap = MERCURY_STRETCH * (1 - (1 - k) * (1 - k));
      hw = lerp(MERCURY_PILL_HALF_WIDTH, MERCURY_FIELD_HALF_WIDTH, easeOutCubic(tau / 0.4));
      hh = MERCURY_SPLIT_HALF_HEIGHT + 2.5 * Math.exp(-8 * tau) * Math.sin(30 * tau);
      waist = Math.max(1.6, 0.72 * MERCURY_WAIST_INITIAL * Math.pow(1 - clamp01(k), 0.66));
      patch = Math.max(waist, lerp(MERCURY_WAIST_INITIAL, 70, easeInOutCubic(k)));
      const rOut = MERCURY_SPLIT_HALF_HEIGHT;
      const rIn = Math.min(hh, 20 * easeOutCubic(tau / 0.15));
      return {
        hw,
        rest,
        gap,
        hh,
        field,
        waist,
        patch,
        snap,
        pillHalf,
        flash,
        merge,
        shiver,
        rOut,
        rIn,
      };
    }

    const u = tau - MERCURY_SNAP_DURATION;
    hw = MERCURY_FIELD_HALF_WIDTH;
    gap = Math.max(
      3,
      MERCURY_STRETCH + (MERCURY_FIELD_GAP - MERCURY_STRETCH) * springResponse(u, 11, 0.72)
    );
    hh =
      lerp(
        MERCURY_SPLIT_HALF_HEIGHT,
        MERCURY_FIELD_HALF_HEIGHT,
        easeInOutCubic((u - 0.12) / 0.5)
      ) +
      3 * Math.exp(-7 * u) * Math.sin(22 * u);
    field = easeInOutCubic((u - 0.22) / 0.45);
    waist = -(gap * 0.5 + 20) * Math.pow(clamp01(u / 0.4), 1.4);
    patch = 70 * (1 - easeOutCubic(u / 0.45));
    snap = clamp01(u / 0.34);
    flash = Math.exp(-u / 0.09);
    shiver = u < 1.2 ? u : -1;
  } else if (input.state === 'closing') {
    const c = clamp01(tau / MERCURY_CLOSE_DURATION);
    rest = easeInOutCubic((c - 0.55) / 0.45);
    gap = MERCURY_FIELD_GAP * (1 - easeInOutCubic(c));
    hw = lerp(MERCURY_FIELD_HALF_WIDTH, MERCURY_PILL_HALF_WIDTH, easeInOutCubic(c));
    hh = lerp(MERCURY_FIELD_HALF_HEIGHT, MERCURY_SPLIT_HALF_HEIGHT, easeInOutCubic(c));
    field = 1 - easeInOutCubic(c / 0.75);
  }

  if (input.state === 'wrong' && input.wrongElapsedSec >= 0) {
    const s = input.wrongElapsedSec;
    const w = Math.exp(-4.5 * s) * Math.sin(19 * s);
    pillHalf = [pillHalf[0] + 5 * w, pillHalf[1] - 4 * w];
  }

  const m = input.mergeElapsedSec;
  if (m >= 0 && m < 1.2) {
    const w = Math.exp(-7 * m) * Math.sin(24 * m);
    merge = Math.exp(-m / 0.12);
    pillHalf = [MERCURY_PILL_HALF_WIDTH - 2 * w, MERCURY_PILL_HALF_HEIGHT + 4.5 * w];
  }

  const rOut = Math.min(hh, lerp(MERCURY_SPLIT_HALF_HEIGHT, 16, field));
  const rIn = Math.min(hh, lerp(20, 16, field));
  return {
    hw,
    rest,
    gap,
    hh,
    field,
    waist,
    patch,
    snap,
    pillHalf,
    flash,
    merge,
    shiver,
    rOut,
    rIn,
  };
}

export function shouldShowCredentialsForm(state: MercuryLoginState): boolean {
  return state === 'opening' || state === 'open' || state === 'closing';
}

export function shouldRenderIdleButton(state: MercuryLoginState): boolean {
  return state === 'idle' || state === 'loading' || state === 'wrong' || state === 'done';
}

export const LIQUID_METAL_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Standalone single-button shader (used by LiquidMetalButton for Forgot Password action)
export const LIQUID_METAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform vec2 u_center;
uniform vec2 u_half;
uniform vec2 u_hit;
uniform vec3 u_key;
uniform vec4 u_err;
uniform float u_scale;
uniform float u_hover;
uniform float u_win;
uniform float u_disabled;

out vec4 outColor;

const vec3 VIEW = vec3(0.0, 0.0, 1.0);
const vec3 CYAN_ACCENT = vec3(0.145, 0.78, 0.851); // #25C7D9
const vec3 CYAN_WIN = vec3(0.32, 0.96, 1.0);
const vec3 SILVER_RIM = vec3(0.84, 0.91, 0.98);
const vec3 RED_ERR = vec3(1.0, 0.25, 0.30);

float roundedBoxSdf(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float rippleWave(vec2 p) {
  if (u_err.x < 0.0) return 0.0;
  vec2 q = (p - u_err.zw) / vec2(1.0, 0.65);
  float run = length(q) - 185.0 * u_err.x;
  return cos(run * 0.12) * exp(-run * run / 1800.0) * exp(-u_err.x * 1.65);
}

vec2 pillSdf(vec2 p) {
  float r = u_half.y;
  float d = roundedBoxSdf(p - u_center, u_half, r) - 2.0 * rippleWave(p);
  return vec2(d, r);
}

vec3 computeNormal(vec2 p, float s) {
  vec2 e = vec2(0.45, 0.0);
  vec2 g = vec2(
    pillSdf(p + e.xy).x - pillSdf(p - e.xy).x,
    pillSdf(p + e.yx).x - pillSdf(p - e.yx).x
  );
  float slope = min((1.0 - s) / sqrt(max(1.0 - (1.0 - s) * (1.0 - s), 1e-4)), 13.0);
  vec2 dome = vec2((p.x - u_center.x) / max(u_half.x, 1.0) * 0.28, (p.y - u_center.y) / max(u_half.y, 1.0) * 0.12);
  vec2 rip = vec2(
    rippleWave(p + e.xy) - rippleWave(p - e.xy),
    rippleWave(p + e.yx) - rippleWave(p - e.yx)
  ) / (2.0 * e.x);
  return normalize(vec3(normalize(g + 1e-6) * slope + dome - rip * 8.0, 1.0));
}

float fresnel(float nz) {
  return mix(0.78, 1.0, pow(1.0 - clamp(nz, 0.0, 1.0), 4.5));
}

vec3 envStudio(vec3 r) {
  float el = asin(clamp(-r.y, -1.0, 1.0));
  float az = atan(r.x, r.z);
  float h = el + 0.78;

  vec3 sky = mix(vec3(0.68, 0.78, 0.86), vec3(0.95, 0.98, 1.02), smoothstep(-0.1, 0.75, h));
  sky = mix(sky, vec3(0.42, 0.52, 0.62), smoothstep(0.70, 0.88, el) * smoothstep(1.10, 0.98, el));
  sky = mix(sky, vec3(0.62, 0.74, 0.84), smoothstep(1.26, 1.44, el));

  vec3 grd = mix(vec3(0.42, 0.53, 0.62), vec3(0.18, 0.25, 0.33), smoothstep(0.0, 0.65, -h));
  vec3 c = mix(grd, sky, smoothstep(-0.08, 0.08, h)) + vec3(0.28) * exp(-abs(h) * 26.0);
  c += vec3(0.85) * smoothstep(0.94, 1.0, el) * smoothstep(1.30, 1.24, el);

  c += CYAN_ACCENT * (0.95 + 0.35 * u_hover) * exp(-pow((az - 1.60) * 1.85, 2.0)) * exp(-pow((el - 0.08) * 2.4, 2.0));
  c += SILVER_RIM * 0.68 * exp(-pow((az + 1.60) * 1.85, 2.0)) * exp(-pow((el - 0.12) * 2.4, 2.0));

  float pointerSweep = exp(-pow((r.x - ((u_hit.x - u_center.x) / max(u_half.x, 1.0)) * 0.45) * 3.0, 2.0));
  c += CYAN_ACCENT * (0.30 * u_hover) * pointerSweep;

  return c;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / max(u_scale, 0.1);
  vec2 d = pillSdf(p);
  float s = clamp(-d.x / max(d.y, 1.0), 0.0, 1.0);
  vec3 n = computeNormal(p, s);
  vec3 r = reflect(-VIEW, n);

  vec3 col = envStudio(r) * fresnel(n.z);
  col += vec3(0.85, 0.96, 1.0) * pow(max(dot(r, u_key), 0.0), 26.0) * (0.75 + 0.35 * u_hover);

  float centerPlate = smoothstep(0.22, 0.82, s);
  col = mix(col, mix(vec3(0.74, 0.91, 0.96), vec3(0.88, 0.96, 0.99), 0.45 + 0.35 * u_hover), centerPlate * 0.52);

  col = mix(col, col * vec3(0.88, 0.98, 1.0), 0.32);
  col = mix(col, col * CYAN_WIN, u_win);
  col = mix(col, mix(col * RED_ERR, RED_ERR * 0.72, 0.42), u_err.y);
  col = mix(col, vec3(0.18, 0.22, 0.28), u_disabled * 0.78);

  float alpha = clamp(0.5 - d.x * u_scale, 0.0, 1.0);
  float edgeFade = smoothstep(8.5, 0.5, max(d.x, 0.0));
  float glow = (0.14 + 0.16 * u_hover + 0.22 * u_win) * (1.0 - u_disabled) * exp(-max(d.x, 0.0) / 5.5) * edgeFade;
  float errGlow = u_err.y * 0.42 * exp(-max(d.x, 0.0) / 6.5) * edgeFade;
  vec3 outerLight = CYAN_ACCENT * glow + RED_ERR * errGlow;

  outColor = vec4(
    clamp(col, 0.0, 1.0) * alpha + outerLight * (1.0 - alpha),
    alpha + clamp(glow + errGlow, 0.0, 1.0) * (1.0 - alpha)
  );
}`;

// Unified Liquid Metal V4 Morphing Shader
// Renders:
//   1. Closed pill -> stretch/snap -> twin dark-glass credential frames -> close -> loading/wrong/done
//   2. Dual metallic action pills ("Cancel" + "Authenticate & Sign In") inside the same single WebGL2 pass
export const MERCURY_V4_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 A, B, NECK, FX, ERR;
uniform vec3 KEY;
uniform vec2 RAD, P, ACT, RES;
uniform float THICK, rest, waist, snap, win, field, SCALE, u_disabled;
uniform vec4 u_cancelBox; // x: cx, y: cy, z: hw, w: hh
uniform vec4 u_authBox;   // x: cx, y: cy, z: hw, w: hh
uniform vec4 u_btnState;  // x: cancelHover, y: cancelPress, z: authHover, w: authPress
uniform vec4 u_btnRipple; // x: cancelRipElapsed (<0 off), y: authRipElapsed (<0 off), z: hitX, w: hitY
uniform vec2 u_btnMeta;   // x: actionAppear (0..1), y: authKeySweepX

out vec4 o;

const float MELT = 24.0;
const vec3 VIEW = vec3(0.0, 0.0, 1.0);
const vec3 TINT = vec3(0.32, 0.94, 1.0);
const vec3 ACCENT = vec3(0.145, 0.78, 0.851); // #25C7D9
const vec3 SILVER = vec3(0.84, 0.91, 0.98);
const vec3 RED = vec3(1.0, 0.26, 0.30);
const vec2 C = vec2(270.0, 190.0);

float box(vec2 p, vec2 b, vec4 r) {
  r.xy = p.x > 0.0 ? r.xy : r.zw;
  r.x = p.y > 0.0 ? r.x : r.y;
  vec2 q = abs(p) - b + r.x;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

float ripple(vec2 p) {
  vec2 q = (p - ERR.zw) / vec2(1.0, 0.6);
  float run = length(q) - 190.0 * ERR.x;
  return cos(run * 0.12) * exp(-run * run / 1800.0) * exp(-ERR.x * 1.6) * step(0.0, ERR.x);
}

float actionRippleWave(vec2 p, vec2 origin, float elapsed) {
  if (elapsed < 0.0 || elapsed > 0.9) return 0.0;
  vec2 q = (p - origin) / vec2(1.0, 0.65);
  float run = length(q) - 210.0 * elapsed;
  return cos(run * 0.13) * exp(-run * run / 1400.0) * exp(-elapsed * 2.4);
}

vec2 pill(vec2 p) {
  return vec2(box(p - C, P, vec4(P.y)) - 2.2 * rest * ripple(p), P.y);
}

vec2 topHalf(vec2 p) {
  return mix(vec2(box(p - A.xy, A.zw, RAD.yxyx), THICK), pill(p), rest);
}

vec2 botHalf(vec2 p) {
  return mix(vec2(box(p - B.xy, B.zw, RAD.xyxy), THICK), pill(p), rest);
}

vec2 joinSdf(vec2 a, vec2 b) {
  return a.x < b.x ? a : b;
}

vec2 smin(vec2 a, vec2 b, float k) {
  float h = clamp(0.5 + 0.5 * (b.x - a.x) / k, 0.0, 1.0);
  return vec2(mix(b.x, a.x, h) - k * h * (1.0 - h), mix(b.y, a.y, h));
}

vec2 neck(vec2 p, float w) {
  if (max(NECK.z, w) <= 0.0) return vec2(1e5, 1.0);
  float y0 = NECK.x - A.w;
  float y1 = NECK.y + B.w;
  float len = max(y1 - y0, 1.0);
  float u = abs(2.0 * (p.y - y0) / len - 1.0);
  float rad = w + (NECK.z - w) * u * u;
  float k = 4.0 * (NECK.z - w) * u / len;
  float d = max((abs(p.x - C.x) - rad) / sqrt(1.0 + k * k), abs(p.y - (y0 + y1) * 0.5) - len * 0.5);
  return vec2(d, max(rad, 1.5));
}

vec2 drops(vec2 p, float s) {
  if (s <= 0.0 || s >= 1.0) return vec2(1e5, 1.0);
  float k = s * s * (3.0 - 2.0 * s);
  float mid = (NECK.x + NECK.y) * 0.5;
  float r = 6.0 * (1.0 - 0.6 * s);
  float a = length(p - vec2(C.x - 2.0, mix(mid - 6.0, NECK.x, k))) - r;
  float b = length(p - vec2(C.x + 2.0, mix(mid + 6.0, NECK.y, k))) - r * 0.8;
  return vec2(min(a, b), r);
}

vec2 shape(vec2 p) {
  vec2 d = joinSdf(topHalf(p), botHalf(p));
  d = smin(d, neck(p, waist), MELT);
  d = smin(d, drops(p, snap), MELT);
  return d;
}

float shiver(vec2 p) {
  float run = abs(p.x - C.x) - 260.0 * FX.w;
  float edge = min(abs(p.y - NECK.x), abs(p.y - NECK.y));
  return cos(run * 0.1) * exp(-run * run / 1400.0) * exp(-FX.w * 2.4)
    * exp(-edge * edge / 900.0) * step(0.0, FX.w);
}

vec4 columnNormal(vec2 p) {
  if (max(NECK.z, waist) <= 0.0 || p.y < NECK.x || p.y > NECK.y) return vec4(0.0);
  float y0 = NECK.x - A.w;
  float y1 = NECK.y + B.w;
  float len = max(y1 - y0, 1.0);
  float v = 2.0 * (p.y - y0) / len - 1.0;
  float rad = max(waist + (NECK.z - waist) * v * v, 1.5);
  float slope = 4.0 * (NECK.z - waist) * v / len;
  float sx = clamp((p.x - C.x) / rad, -1.0, 1.0);
  vec3 n = normalize(vec3(sx, -slope, sqrt(max(1.0 - sx * sx, 0.0))));
  float edge = min(p.y - NECK.x, NECK.y - p.y);
  return vec4(n, smoothstep(-2.0, 5.0, edge) * smoothstep(1.5, -1.5, abs(p.x - C.x) - rad) * (1.0 - field));
}

vec3 normal(vec2 p, float s) {
  vec2 e = vec2(0.4, 0.0);
  vec2 g = vec2(shape(p + e.xy).x - shape(p - e.xy).x, shape(p + e.yx).x - shape(p - e.yx).x);
  float slope = min((1.0 - s) / sqrt(max(1.0 - (1.0 - s) * (1.0 - s), 1e-4)), 14.0);
  vec2 dome = vec2((p.x - C.x) / max(P.x, 1.0) * 0.30 * (1.0 - field), 0.0);
  vec2 h = vec2(ripple(p + e.xy) - ripple(p - e.xy), ripple(p + e.yx) - ripple(p - e.yx)) / (2.0 * e.x);
  vec2 v = vec2(shiver(p + e.xy) - shiver(p - e.xy), shiver(p + e.yx) - shiver(p - e.yx)) / (2.0 * e.x);
  vec3 n = normalize(vec3(normalize(g + 1e-6) * slope + dome - h * 9.0 * rest - v * 7.0 * (1.0 - field), 1.0));
  vec4 c = columnNormal(p);
  return normalize(mix(n, c.xyz, c.w));
}

float fresnel(float c) {
  return mix(0.8, 1.0, pow(1.0 - c, 5.0));
}

vec3 env(vec3 r) {
  float el = asin(clamp(-r.y, -1.0, 1.0));
  float az = atan(r.x, r.z);
  float h = el + 0.72;
  vec3 sky = mix(vec3(0.66, 0.76, 0.85), vec3(0.95, 0.98, 1.03), smoothstep(-0.1, 0.78, h));
  sky = mix(sky, vec3(0.32, 0.40, 0.50), smoothstep(0.68, 0.86, el) * smoothstep(1.08, 0.96, el));
  sky = mix(sky, vec3(0.56, 0.68, 0.78), smoothstep(1.26, 1.44, el));
  vec3 grd = mix(vec3(0.36, 0.46, 0.55), vec3(0.14, 0.20, 0.27), smoothstep(0.0, 0.65, -h));
  vec3 c = mix(grd, sky, smoothstep(-0.08, 0.08, h)) + vec3(0.32) * exp(-abs(h) * 26.0);
  c += vec3(0.95) * smoothstep(0.94, 1.0, el) * smoothstep(1.30, 1.24, el);
  c += SILVER * 0.75 * exp(-pow((az + 1.65) * 1.8, 2.0)) * exp(-pow((el - 0.12) * 2.5, 2.0));
  c += ACCENT * 1.15 * exp(-pow((az - 1.65) * 1.8, 2.0)) * exp(-pow((el - 0.06) * 2.5, 2.0));
  return c;
}

float actionPillSdf(vec2 p, vec4 bx, float ripElapsed, vec2 ripOrigin) {
  float rip = actionRippleWave(p, ripOrigin, ripElapsed);
  return box(p - bx.xy, bx.zw, vec4(bx.w)) - 1.8 * rip;
}

vec4 shadeActionPill(
  vec2 p,
  vec4 bx,
  float hoverAmt,
  float pressAmt,
  float ripElapsed,
  vec2 ripOrigin,
  float cyanWeight,
  vec3 specDir,
  float appear
) {
  if (appear <= 0.01) return vec4(0.0);
  float d = actionPillSdf(p, bx, ripElapsed, ripOrigin);
  float s = clamp(-d / max(bx.w, 1.0), 0.0, 1.0);

  vec2 e = vec2(0.45, 0.0);
  vec2 g = vec2(
    actionPillSdf(p + e.xy, bx, ripElapsed, ripOrigin) - actionPillSdf(p - e.xy, bx, ripElapsed, ripOrigin),
    actionPillSdf(p + e.yx, bx, ripElapsed, ripOrigin) - actionPillSdf(p - e.yx, bx, ripElapsed, ripOrigin)
  );
  float slope = min((1.0 - s) / sqrt(max(1.0 - (1.0 - s) * (1.0 - s), 1e-4)), 13.0);
  vec2 dome = vec2((p.x - bx.x) / max(bx.z, 1.0) * 0.28, (p.y - bx.y) / max(bx.w, 1.0) * 0.14);
  vec2 ripGrad = vec2(
    actionRippleWave(p + e.xy, ripOrigin, ripElapsed) - actionRippleWave(p - e.xy, ripOrigin, ripElapsed),
    actionRippleWave(p + e.yx, ripOrigin, ripElapsed) - actionRippleWave(p - e.yx, ripOrigin, ripElapsed)
  ) / (2.0 * e.x);
  vec3 n = normalize(vec3(normalize(g + 1e-6) * slope + dome - ripGrad * 7.5, 1.0));
  vec3 r = reflect(-VIEW, n);

  vec3 col = env(r) * fresnel(n.z);
  col += vec3(0.88, 0.97, 1.0) * pow(max(dot(r, specDir), 0.0), 22.0) * (0.65 + 0.45 * hoverAmt);

  // Pointer-responsive moving specular highlight
  float hitNorm = clamp((u_btnRipple.z - bx.x) / max(bx.z, 1.0), -1.0, 1.0);
  float ptrSweep = exp(-pow((r.x - hitNorm * 0.48) * 3.0, 2.0));
  col += mix(SILVER, ACCENT, cyanWeight) * (0.24 + 0.34 * hoverAmt) * ptrSweep;

  // Smooth metallic face behind label text while keeping liquid chrome depth around edges
  float plate = smoothstep(0.20, 0.80, s);
  vec3 silverFace = mix(vec3(0.76, 0.82, 0.89), vec3(0.89, 0.94, 0.98), 0.42 + 0.35 * hoverAmt);
  vec3 cyanFace = mix(vec3(0.68, 0.90, 0.95), vec3(0.84, 0.96, 0.99), 0.45 + 0.38 * hoverAmt);
  col = mix(col, mix(silverFace, cyanFace, cyanWeight), plate * (0.50 + 0.08 * cyanWeight));

  // Subtle Electric Cyan edge rim reflection
  float rimFactor = smoothstep(0.45, 0.02, s);
  col += ACCENT * rimFactor * (0.14 + 0.28 * cyanWeight + 0.22 * hoverAmt);
  col = mix(col, col * vec3(0.92, 0.97, 1.0), pressAmt * 0.18);
  col = mix(col, vec3(0.18, 0.22, 0.28), u_disabled * cyanWeight * 0.72);

  float a = clamp(0.5 - d * SCALE, 0.0, 1.0) * appear;
  float edgeFade = smoothstep(18.0, 0.5, max(d, 0.0));
  float glowAmt = (0.08 + 0.14 * cyanWeight + 0.18 * hoverAmt) * (1.0 - u_disabled * cyanWeight) * exp(-max(d, 0.0) / 8.5) * edgeFade * appear;
  vec3 outer = mix(SILVER, ACCENT, 0.35 + 0.65 * cyanWeight) * glowAmt;

  return vec4(clamp(col, 0.0, 1.0) * a + outer * (1.0 - a), a + clamp(glowAmt, 0.0, 1.0) * (1.0 - a));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, RES.y - gl_FragCoord.y) / max(SCALE, 0.1);
  vec2 d = shape(p);
  float s = clamp(-d.x / max(d.y, 1.0), 0.0, 1.0);
  vec3 n = normal(p, s);
  vec3 r = reflect(-VIEW, n);
  vec3 col = env(r) * fresnel(n.z);
  col += vec3(0.86, 0.96, 1.0) * pow(max(dot(r, KEY), 0.0), 28.0);

  // Smooth luminous plate on closed pill center so button label stays crisp across the entire pill
  float centerPlate = smoothstep(0.22, 0.82, s) * rest;
  col = mix(col, vec3(0.80, 0.94, 0.98), centerPlate * 0.54);

  col = mix(col, col * TINT, win);
  col = mix(col, mix(col * RED, RED * 0.74, 0.42), ERR.y);
  col = mix(col, vec3(0.18, 0.22, 0.28), u_disabled * 0.78);

  // Dark Obsidian glass interiors when halves separate into Email & Password containers
  float deep = field * smoothstep(THICK - 0.5, THICK + 1.5, -d.x);
  vec3 glass = vec3(0.058, 0.072, 0.095) + 0.045 * smoothstep(40.0, -40.0, p.y - (p.y < C.y ? A.y : B.y));
  col = mix(col, glass, deep);

  // Electric Cyan focus ring on active input field
  float focus = p.y < C.y ? ACT.x : ACT.y;
  col = mix(col, ACCENT, focus * field * smoothstep(1.8, 0.0, abs(-d.x - THICK)));

  // Neck snap glow & merge flash
  float mid = (NECK.x + NECK.y) * 0.5;
  col += vec3(0.75, 0.95, 1.0) * FX.x * 0.22 * exp(-length(p - vec2(C.x, mid)) / 14.0);
  col += vec3(0.75, 0.98, 1.0) * FX.y * exp(-abs(p.y - C.y) / 4.0) * smoothstep(0.0, -30.0, d.x);

  float a = clamp(0.5 - d.x * SCALE, 0.0, 1.0);
  float edgeFade = smoothstep(22.0, 1.0, max(d.x, 0.0));
  float glow = (0.14 + FX.z * 0.42 + focus * field * 0.42) * (1.0 - u_disabled) * exp(-max(d.x, 0.0) / 10.0) * edgeFade;
  float flash = FX.x * 0.14 * exp(-length(p - vec2(C.x, mid)) / 18.0);
  float alarm = ERR.y * 0.50 * exp(-max(d.x, 0.0) / 14.0) * edgeFade;
  vec3 light = ACCENT * glow + vec3(0.82, 0.96, 1.0) * flash + RED * alarm;

  vec4 mainLayer = vec4(
    clamp(col, 0.0, 1.0) * a + light * (1.0 - a),
    a + clamp(glow + flash + alarm, 0.0, 1.0) * (1.0 - a)
  );

  // Dual open-state Liquid Metal action pills ("Cancel" & "Authenticate & Sign In")
  if (u_btnMeta.x > 0.01) {
    vec3 authSpec = normalize(vec3(u_btnMeta.y, -0.72, 0.68));
    vec3 cancelSpec = normalize(vec3(-0.35 + u_btnMeta.y * 0.35, -0.75, 0.68));
    vec2 cancelOrigin = u_btnState.x > 0.05 ? u_btnRipple.zw : u_cancelBox.xy;
    vec2 authOrigin = u_btnState.z > 0.05 ? u_btnRipple.zw : u_authBox.xy;

    vec4 cancelLayer = shadeActionPill(
      p, u_cancelBox, u_btnState.x, u_btnState.y, u_btnRipple.x, cancelOrigin, 0.18, cancelSpec, u_btnMeta.x
    );
    vec4 authLayer = shadeActionPill(
      p, u_authBox, u_btnState.z, u_btnState.w, u_btnRipple.y, authOrigin, 0.85, authSpec, u_btnMeta.x
    );

    mainLayer = mainLayer * (1.0 - cancelLayer.a) + cancelLayer;
    mainLayer = mainLayer * (1.0 - authLayer.a) + authLayer;
  }

  o = mainLayer;
}`;
