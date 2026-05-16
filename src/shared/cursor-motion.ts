/**
 * Cursor motion math — pure, side-effect-free.
 *
 * Used by:
 * - renderer cursor playback to ease progress along motion paths
 * - the debug playground to visualize candidate curves and sampled points
 * - future motion/presence work that needs stable normalization helpers
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
  curveJitter: number
  distanceScaling: number
}

export const DEFAULT_CURSOR_MOTION: CursorMotionParams = {
  durationMs: 1080,
  easing: { kind: 'preset', name: 'easeInOutCubic' },
  curveStrength: 0.55,
  curveAsymmetry: -0.15,
  curveDirection: 'auto',
  curveJitter: 0.2,
  distanceScaling: 1,
}

export const DISTANCE_SCALE_REFERENCE_PX = 400
const CANDIDATE_COUNT = 6

export interface MotionCandidate {
  p1: Vec2
  p2: Vec2
  side: -1 | 1
}

export function effectiveDurationMs(
  params: CursorMotionParams,
  distance: number,
): number {
  const exp = Math.max(0, Math.min(1, params.distanceScaling))
  if (exp === 0 || distance <= 0) return params.durationMs
  const ratio = distance / DISTANCE_SCALE_REFERENCE_PX
  const scaled = params.durationMs * Math.pow(ratio, exp)
  return Math.max(50, Math.min(3000, scaled))
}

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

  let t = x
  for (let i = 0; i < 8; i++) {
    const currentX = cubicBezier1D(x1, x2, t) - x
    if (Math.abs(currentX) < 1e-6) return t
    const d = cubicBezier1DDeriv(x1, x2, t)
    if (Math.abs(d) < 1e-6) break
    t = t - currentX / d
  }

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

function seededRandom(seed: number, salt: number): number {
  let h = Math.imul(seed | 0, 2654435761) ^ Math.imul(salt | 0, 1597334677)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

function candidateSides(
  direction: CurveDirection,
  sequenceIndex: number,
  count: number,
): (-1 | 1)[] {
  switch (direction) {
    case 'left':
      return Array.from({ length: count }, () => -1 as const)
    case 'right':
      return Array.from({ length: count }, () => 1 as const)
    case 'alternating': {
      const side: -1 | 1 = sequenceIndex % 2 === 0 ? 1 : -1
      return Array.from({ length: count }, () => side)
    }
    case 'auto':
    default: {
      const half = Math.floor(count / 2)
      return Array.from({ length: count }, (_, i) =>
        i < half ? -1 : (1 as -1 | 1),
      )
    }
  }
}

const HANDLE_ROTATION_MAX = Math.PI * 0.75

function rotateAround(point: Vec2, pivot: Vec2, angle: number): Vec2 {
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return {
    x: pivot.x + dx * c - dy * s,
    y: pivot.y + dx * s + dy * c,
  }
}

function candidateFromIndex(
  p0: Vec2,
  p3: Vec2,
  params: CursorMotionParams,
  sequenceIndex: number,
  candidateIndex: number,
  side: -1 | 1,
  dx: number,
  dy: number,
  dist: number,
): MotionCandidate {
  const jitter = Math.max(0, Math.min(1, params.curveJitter))
  const rStrength =
    seededRandom(sequenceIndex, candidateIndex * 7 + 11) * 2 - 1
  const rAsym =
    seededRandom(sequenceIndex, candidateIndex * 7 + 13) * 2 - 1
  const rAngle1 =
    seededRandom(sequenceIndex, candidateIndex * 7 + 15) * 2 - 1
  const rAngle2 =
    seededRandom(sequenceIndex, candidateIndex * 7 + 17) * 2 - 1

  const px = -dy / dist
  const py = dx / dist

  const strengthMul = 1 + rStrength * jitter * 0.6
  const strength = Math.max(0, Math.min(1, params.curveStrength * strengthMul))
  const offset = strength * dist * side

  const asymRaw = params.curveAsymmetry + rAsym * jitter * 0.5
  const asym = Math.max(-1, Math.min(1, asymRaw))

  const t1 = 1 / 3 - asym * (1 / 3)
  const t2 = 2 / 3 - asym * (1 / 3)

  const p1Base: Vec2 = {
    x: p0.x + dx * t1 + px * offset,
    y: p0.y + dy * t1 + py * offset,
  }
  const p2Base: Vec2 = {
    x: p0.x + dx * t2 + px * offset,
    y: p0.y + dy * t2 + py * offset,
  }

  const angle1 = rAngle1 * jitter * HANDLE_ROTATION_MAX
  const angle2 = rAngle2 * jitter * HANDLE_ROTATION_MAX

  return {
    p1: rotateAround(p1Base, p0, angle1),
    p2: rotateAround(p2Base, p3, angle2),
    side,
  }
}

export function deriveCandidatePaths(
  p0: Vec2,
  p3: Vec2,
  params: CursorMotionParams,
  sequenceIndex: number,
  count: number = CANDIDATE_COUNT,
): MotionCandidate[] {
  const dx = p3.x - p0.x
  const dy = p3.y - p0.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-3) {
    return Array.from({ length: count }, () => ({
      p1: { ...p0 },
      p2: { ...p3 },
      side: 1 as const,
    }))
  }

  const sides = candidateSides(params.curveDirection, sequenceIndex, count)
  return sides.map((side, i) =>
    candidateFromIndex(p0, p3, params, sequenceIndex, i, side, dx, dy, dist),
  )
}

export function pickCandidateIndex(
  sequenceIndex: number,
  count: number = CANDIDATE_COUNT,
): number {
  if (count <= 0) return 0
  return Math.floor(seededRandom(sequenceIndex, 9973) * count)
}

export function deriveControlPoints(
  p0: Vec2,
  p3: Vec2,
  params: CursorMotionParams,
  sequenceIndex: number,
): { p1: Vec2; p2: Vec2 } {
  const candidates = deriveCandidatePaths(p0, p3, params, sequenceIndex)
  const picked = candidates[pickCandidateIndex(sequenceIndex, candidates.length)]
  return { p1: picked.p1, p2: picked.p2 }
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

export function normalizeEasing(raw: unknown): EasingSpec {
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
    curveJitter: clamp(
      Number(r.curveJitter ?? DEFAULT_CURSOR_MOTION.curveJitter),
      0,
      1,
    ),
    distanceScaling: clamp(
      Number(r.distanceScaling ?? DEFAULT_CURSOR_MOTION.distanceScaling),
      0,
      1,
    ),
  }
}
