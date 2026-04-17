/**
 * Cursor motion math — pure, side-effect-free.
 *
 * Consumed by:
 *  - `AgentCursorLayer` (canvas-bg + agent-layer renderers) to animate real
 *    agent presence cursors along a 2D cubic Bézier path.
 *  - The debug playground to render ghost trails and preview tuning.
 *  - Main process (`preferences.ts`) for defaults + normalization on read.
 *
 * Two Béziers participate:
 *   1. A 1D timing curve (ease function) maps wall-clock progress → eased t.
 *   2. A 2D spatial curve samples a path from start to end using eased t.
 * They are independent: easing shapes time, controls shape trajectory.
 */

export type Vec2 = { x: number; y: number }

export type EasingPreset =
  | 'linear'
  | 'easeInOutCubic'
  | 'easeOutExpo'
  | 'easeInOutQuart'
  | 'easeOutBack'
  | 'easeInOutSine'

export type EasingSpec =
  | { kind: 'preset'; name: EasingPreset }
  | { kind: 'custom'; x1: number; y1: number; x2: number; y2: number }

export type CurveDirection = 'auto' | 'left' | 'right' | 'alternating'

export interface CursorMotionParams {
  durationMs: number
  easing: EasingSpec
  curveStrength: number
  curveAsymmetry: number
  curveDirection: CurveDirection
}

export const DEFAULT_CURSOR_MOTION: CursorMotionParams = {
  durationMs: 250,
  easing: { kind: 'preset', name: 'easeInOutCubic' },
  curveStrength: 0.25,
  curveAsymmetry: 0,
  curveDirection: 'auto',
}

// --- 1D easing presets (t in [0,1] → [0,1]) -------------------------------

export const CURSOR_MOTION_PRESETS: Record<EasingPreset, (t: number) => number> = {
  linear: (t) => t,
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutQuart: (t) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
  easeOutBack: (t) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
}

// CSS-style cubic-bezier uses P0=(0,0), P3=(1,1). Y at time `t` is found by
// inverting x(u) = 3(1-u)²u·x1 + 3(1-u)u²·x2 + u³ for u, then evaluating y(u).
function cubicBezier1D(p1: number, p2: number, t: number): number {
  return 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t
}

function cubicBezier1DDeriv(p1: number, p2: number, t: number): number {
  return (
    3 * (1 - t) * (1 - t) * p1 +
    6 * (1 - t) * t * (p2 - p1) +
    3 * t * t * (1 - p2)
  )
}

function solveCubicBezierX(x: number, x1: number, x2: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  // Newton-Raphson from t = x (good initial guess for most curves)
  let t = x
  for (let i = 0; i < 8; i++) {
    const currentX = cubicBezier1D(x1, x2, t) - x
    if (Math.abs(currentX) < 1e-6) return t
    const d = cubicBezier1DDeriv(x1, x2, t)
    if (Math.abs(d) < 1e-6) break
    t = t - currentX / d
  }
  // Fallback: bisection
  let lo = 0
  let hi = 1
  t = x
  for (let i = 0; i < 24; i++) {
    const currentX = cubicBezier1D(x1, x2, t)
    if (Math.abs(currentX - x) < 1e-6) return t
    if (currentX < x) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return t
}

export function easeAt(spec: EasingSpec, t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  if (spec.kind === 'preset') {
    const fn = CURSOR_MOTION_PRESETS[spec.name] ?? CURSOR_MOTION_PRESETS.linear
    return fn(t)
  }
  const u = solveCubicBezierX(t, spec.x1, spec.x2)
  return cubicBezier1D(spec.y1, spec.y2, u)
}

// --- 2D cubic Bézier path ------------------------------------------------

export function cubicBezierPoint(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t: number,
): Vec2 {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

/**
 * Derive control points for the 2D path.
 *
 * Base direction: 1 (right of line) if curveDirection is 'right', -1 if 'left',
 * alternating by sequenceIndex parity, or 1 for 'auto'. The perpendicular to
 * the start→end vector is rotated counter-clockwise by 90° (positive side).
 *
 * Offset magnitude = curveStrength · distance · sign.
 *
 * Asymmetry biases the two control points along the travel axis:
 *  - At asymmetry = 0, P1 sits at 1/3 along, P2 at 2/3 along (classic cubic).
 *  - Positive asymmetry pushes both toward the start (front-loaded curve).
 *  - Negative asymmetry pushes both toward the end (back-loaded curve).
 */
export function deriveControlPoints(
  p0: Vec2,
  p3: Vec2,
  params: CursorMotionParams,
  sequenceIndex: number,
): { p1: Vec2; p2: Vec2 } {
  const dx = p3.x - p0.x
  const dy = p3.y - p0.y
  const dist = Math.hypot(dx, dy)

  if (dist < 1e-3) {
    return { p1: { ...p0 }, p2: { ...p3 } }
  }

  let sign: number
  switch (params.curveDirection) {
    case 'left':
      sign = -1
      break
    case 'right':
      sign = 1
      break
    case 'alternating':
      sign = sequenceIndex % 2 === 0 ? 1 : -1
      break
    case 'auto':
    default:
      sign = 1
  }

  // Unit perpendicular (rotate 90° CCW from the travel vector).
  const px = -dy / dist
  const py = dx / dist

  const offset = params.curveStrength * dist * sign
  const asym = Math.max(-1, Math.min(1, params.curveAsymmetry))

  // Along-axis positions: default 1/3 and 2/3; asymmetry shifts both.
  const t1 = 1 / 3 - asym * (1 / 3)
  const t2 = 2 / 3 - asym * (1 / 3)

  return {
    p1: {
      x: p0.x + dx * t1 + px * offset,
      y: p0.y + dy * t1 + py * offset,
    },
    p2: {
      x: p0.x + dx * t2 + px * offset,
      y: p0.y + dy * t2 + py * offset,
    },
  }
}

export function sampleCursorPath(
  p0: Vec2,
  p3: Vec2,
  params: CursorMotionParams,
  sequenceIndex: number,
  t: number,
): Vec2 {
  const easedT = easeAt(params.easing, t)
  const { p1, p2 } = deriveControlPoints(p0, p3, params, sequenceIndex)
  return cubicBezierPoint(p0, p1, p2, p3, easedT)
}

// --- Normalization for persisted / IPC'd values --------------------------

const PRESETS: readonly EasingPreset[] = [
  'linear',
  'easeInOutCubic',
  'easeOutExpo',
  'easeInOutQuart',
  'easeOutBack',
  'easeInOutSine',
]

const DIRECTIONS: readonly CurveDirection[] = ['auto', 'left', 'right', 'alternating']

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function normalizeEasing(raw: unknown): EasingSpec {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (r.kind === 'custom') {
      return {
        kind: 'custom',
        x1: clamp(Number(r.x1), 0, 1),
        y1: Number.isFinite(Number(r.y1)) ? Number(r.y1) : 0,
        x2: clamp(Number(r.x2), 0, 1),
        y2: Number.isFinite(Number(r.y2)) ? Number(r.y2) : 1,
      }
    }
    if (r.kind === 'preset' && typeof r.name === 'string') {
      const name = (PRESETS as readonly string[]).includes(r.name)
        ? (r.name as EasingPreset)
        : DEFAULT_CURSOR_MOTION.easing.kind === 'preset'
          ? DEFAULT_CURSOR_MOTION.easing.name
          : 'easeInOutCubic'
      return { kind: 'preset', name }
    }
  }
  return { ...(DEFAULT_CURSOR_MOTION.easing as EasingSpec) }
}

export function normalizeCursorMotion(raw: unknown): CursorMotionParams {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const dir = typeof r.curveDirection === 'string' &&
    (DIRECTIONS as readonly string[]).includes(r.curveDirection)
    ? (r.curveDirection as CurveDirection)
    : DEFAULT_CURSOR_MOTION.curveDirection
  return {
    durationMs: clamp(
      Number(r.durationMs ?? DEFAULT_CURSOR_MOTION.durationMs),
      50,
      2000,
    ),
    easing: normalizeEasing(r.easing),
    curveStrength: clamp(
      Number(r.curveStrength ?? DEFAULT_CURSOR_MOTION.curveStrength),
      0,
      1,
    ),
    curveAsymmetry: clamp(
      Number(r.curveAsymmetry ?? DEFAULT_CURSOR_MOTION.curveAsymmetry),
      -1,
      1,
    ),
    curveDirection: dir,
  }
}
