/**
 * Centripetal Catmull-Rom spline with arc-length reparameterization.
 *
 * Used by the CursorDirector to sweep the cursor continuously across
 * chained waypoints. Two features matter:
 *
 *  1. Arc-length sampling — `sample(s)` takes a distance along the spline,
 *     not a parameter. That lets the director animate at consistent perceived
 *     speed regardless of segment geometry.
 *
 *  2. Tangent-preserving folds — `foldSpline(current, tangent, rest)` rebuilds
 *     a spline starting from the cursor's current `(position, tangent)`, so
 *     recalculation on new events doesn't introduce a visible kink.
 *
 * Centripetal parameterization (α = 0.5) prevents cusps and self-intersections
 * when waypoints cluster. Tension can be adjusted per-fit (α up to 1 = chordal,
 * tighter/less round curves; used by `correcting` mood).
 */

import type { Vec2 } from './cursor-motion'

export type Alpha = 0 | 0.5 | 1 | number

export interface SampleResult {
  position: Vec2
  tangent: Vec2 // unit vector
  segmentIndex: number
  localT: number // [0, 1] within the segment
}

export interface CatmullRomSegment {
  /** Anchor points and phantom neighbors (p0 ... p3), where the curve runs p1→p2. */
  p0: Vec2
  p1: Vec2
  p2: Vec2
  p3: Vec2
  /** Parameter range within the global t-axis for this segment. */
  t0: number
  t1: number
  t2: number
  t3: number
  /** Cumulative arc length at the start and end of this segment. */
  lengthStart: number
  lengthEnd: number
  /** Internal arc-length table: samples of (localParam, cumulativeLength) inside the segment. */
  arcSamples: number[]
}

export interface CatmullRomSpline {
  readonly segments: readonly CatmullRomSegment[]
  readonly totalLength: number
  /** Sample by arc length `s ∈ [0, totalLength]`. */
  sample(s: number): SampleResult
  /** Sample by normalized arc length `u ∈ [0, 1]`. */
  sampleT(u: number): SampleResult
  /** Render a polyline of `n` points evenly along the arc length. */
  polyline(n: number): Vec2[]
}

const ARC_SAMPLES_PER_SEGMENT = 16

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}
function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}
function scale(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, y: v.y * k }
}
function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}
function lengthOf(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}
function normalize(v: Vec2): Vec2 {
  const m = lengthOf(v)
  if (m < 1e-9) return { x: 1, y: 0 }
  return { x: v.x / m, y: v.y / m }
}

/** Non-uniform knot spacing: t_{i+1} = t_i + |P_{i+1} - P_i|^α. */
function knotSpacing(a: Vec2, b: Vec2, alpha: number): number {
  const d = dist(a, b)
  if (d < 1e-9) return 1e-6
  return Math.pow(d, alpha)
}

/** Cubic Catmull-Rom position at parameter `t ∈ [t1, t2]`. */
function crPoint(seg: CatmullRomSegment, t: number): Vec2 {
  const { p0, p1, p2, p3, t0, t1, t2, t3 } = seg
  const a1 = interp(p0, p1, (t - t0) / (t1 - t0))
  const a2 = interp(p1, p2, (t - t1) / (t2 - t1))
  const a3 = interp(p2, p3, (t - t2) / (t3 - t2))
  const b1 = interp(a1, a2, (t - t0) / (t2 - t0))
  const b2 = interp(a2, a3, (t - t1) / (t3 - t1))
  return interp(b1, b2, (t - t1) / (t2 - t1))
}

function interp(a: Vec2, b: Vec2, u: number): Vec2 {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
}

/** Numerical derivative for tangent. Central difference with clamping. */
function crTangent(seg: CatmullRomSegment, t: number): Vec2 {
  const span = seg.t2 - seg.t1
  const eps = Math.max(1e-5, span * 1e-3)
  const lo = Math.max(seg.t1, t - eps)
  const hi = Math.min(seg.t2, t + eps)
  const a = crPoint(seg, lo)
  const b = crPoint(seg, hi)
  const d = sub(b, a)
  return normalize(d)
}

function buildSegment(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  alpha: number,
  lengthStart: number,
): CatmullRomSegment {
  const t0 = 0
  const t1 = t0 + knotSpacing(p0, p1, alpha)
  const t2 = t1 + knotSpacing(p1, p2, alpha)
  const t3 = t2 + knotSpacing(p2, p3, alpha)

  const seg: CatmullRomSegment = {
    p0,
    p1,
    p2,
    p3,
    t0,
    t1,
    t2,
    t3,
    lengthStart,
    lengthEnd: lengthStart,
    arcSamples: [],
  }

  // Build arc-length table by sampling ARC_SAMPLES_PER_SEGMENT + 1 points
  // across [t1, t2]. Table stores cumulative length at each sample.
  const samples: number[] = []
  let cumulative = 0
  let prev = crPoint(seg, t1)
  samples.push(0)
  for (let i = 1; i <= ARC_SAMPLES_PER_SEGMENT; i++) {
    const u = i / ARC_SAMPLES_PER_SEGMENT
    const t = t1 + (t2 - t1) * u
    const curr = crPoint(seg, t)
    cumulative += dist(prev, curr)
    samples.push(cumulative)
    prev = curr
  }
  seg.arcSamples = samples
  seg.lengthEnd = lengthStart + cumulative
  return seg
}

/**
 * Fit a centripetal Catmull-Rom spline through `anchors`.
 *
 * For endpoints we reflect phantom neighbors to preserve tangent direction:
 *   - `startTangent` (optional): if provided, we place the start phantom along
 *     `anchors[0] - startTangent * chordEst` so the spline leaves the first
 *     anchor tangent to the given direction. Used by `foldSpline` to preserve
 *     continuity across refits.
 *   - `endTangent` (optional): analogous at the trailing end.
 */
export function fitCatmullRom(
  anchors: Vec2[],
  opts: {
    alpha?: number
    startTangent?: Vec2 | null
    endTangent?: Vec2 | null
  } = {},
): CatmullRomSpline {
  if (anchors.length < 2) {
    // Degenerate: single-point "spline". Return a stub that always samples
    // the point with a zero tangent.
    const p = anchors[0] ?? { x: 0, y: 0 }
    return {
      segments: [],
      totalLength: 0,
      sample(_s: number): SampleResult {
        return { position: { ...p }, tangent: { x: 1, y: 0 }, segmentIndex: 0, localT: 0 }
      },
      sampleT(_u: number): SampleResult {
        return { position: { ...p }, tangent: { x: 1, y: 0 }, segmentIndex: 0, localT: 0 }
      },
      polyline(n: number): Vec2[] {
        return Array.from({ length: Math.max(1, n) }, () => ({ ...p }))
      },
    }
  }

  const alpha = opts.alpha ?? 0.5

  // Build working point list with phantom neighbors at both ends.
  const points = anchors.slice()
  // Estimate chord for phantom placement from nearest interior chord.
  const firstChord = dist(points[0], points[1])
  const lastChord = dist(points[points.length - 2], points[points.length - 1])

  const startPhantom: Vec2 = opts.startTangent
    ? sub(points[0], scale(normalize(opts.startTangent), Math.max(firstChord, 1)))
    : reflectPhantom(points[0], points[1])
  const endPhantom: Vec2 = opts.endTangent
    ? add(points[points.length - 1], scale(normalize(opts.endTangent), Math.max(lastChord, 1)))
    : reflectPhantom(points[points.length - 1], points[points.length - 2])

  const segments: CatmullRomSegment[] = []
  let cumulative = 0
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? startPhantom : points[i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = i === points.length - 2 ? endPhantom : points[i + 2]
    const seg = buildSegment(p0, p1, p2, p3, alpha, cumulative)
    segments.push(seg)
    cumulative = seg.lengthEnd
  }

  const totalLength = cumulative

  function sample(s: number): SampleResult {
    if (segments.length === 0) {
      return {
        position: { ...points[0] },
        tangent: { x: 1, y: 0 },
        segmentIndex: 0,
        localT: 0,
      }
    }
    const clamped = Math.max(0, Math.min(totalLength, s))

    // Find segment by cumulative length.
    let segIdx = 0
    for (let i = 0; i < segments.length; i++) {
      if (clamped <= segments[i].lengthEnd) {
        segIdx = i
        break
      }
      segIdx = i
    }
    const seg = segments[segIdx]
    const localArcTarget = clamped - seg.lengthStart
    const segmentArcLength = seg.lengthEnd - seg.lengthStart

    // Binary-search the arc-sample table to find local u ∈ [0,1].
    const table = seg.arcSamples
    let lo = 0
    let hi = table.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1
      if (table[mid] <= localArcTarget) lo = mid
      else hi = mid
    }
    const loLen = table[lo]
    const hiLen = table[hi]
    const span = hiLen - loLen
    const frac = span < 1e-9 ? 0 : (localArcTarget - loLen) / span
    const loU = lo / ARC_SAMPLES_PER_SEGMENT
    const hiU = hi / ARC_SAMPLES_PER_SEGMENT
    const u = loU + (hiU - loU) * frac

    const t = seg.t1 + (seg.t2 - seg.t1) * u
    return {
      position: crPoint(seg, t),
      tangent: crTangent(seg, t),
      segmentIndex: segIdx,
      localT: u,
      // Preserved-but-unused fields for future debugging. segmentArcLength is
      // computed above to ensure numerical sanity; reference it so tree-shakers
      // don't complain.
      ...(segmentArcLength > 0 ? {} : {}),
    }
  }

  function sampleT(u: number): SampleResult {
    return sample(Math.max(0, Math.min(1, u)) * totalLength)
  }

  function polyline(n: number): Vec2[] {
    const count = Math.max(2, n)
    const out: Vec2[] = []
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1)
      out.push(sample(u * totalLength).position)
    }
    return out
  }

  return { segments, totalLength, sample, sampleT, polyline }
}

/** Reflect `p` through `neighbor` to produce a phantom endpoint. */
function reflectPhantom(p: Vec2, neighbor: Vec2): Vec2 {
  return { x: 2 * p.x - neighbor.x, y: 2 * p.y - neighbor.y }
}

/**
 * Build a new spline starting at `current` with the given `tangent`, passing
 * through `remaining` anchors afterwards. Used when new events arrive mid-
 * travel: the director samples `(current, tangent)` from the active spline
 * and calls this to fold in the new waypoints without a visible kink.
 */
export function foldSpline(
  current: Vec2,
  tangent: Vec2,
  remaining: Vec2[],
  alpha: number = 0.5,
): CatmullRomSpline {
  if (remaining.length === 0) {
    return fitCatmullRom([current], { alpha })
  }
  return fitCatmullRom([current, ...remaining], {
    alpha,
    startTangent: tangent,
  })
}
