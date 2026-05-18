/**
 * Centripetal Catmull-Rom spline with arc-length reparameterization.
 *
 * Used by renderer cursor playback to animate along a curve at a steady,
 * eased pace, and by the debug surface to render sampled motion paths.
 */

import type { Vec2 } from './cursor-motion'

type Alpha = 0 | 0.5 | 1 | number

export interface SampleResult {
  position: Vec2
  tangent: Vec2
  segmentIndex: number
  localT: number
}

export interface CatmullRomSegment {
  p0: Vec2
  p1: Vec2
  p2: Vec2
  p3: Vec2
  t0: number
  t1: number
  t2: number
  t3: number
  lengthStart: number
  lengthEnd: number
  arcSamples: number[]
}

export interface CatmullRomSpline {
  readonly segments: readonly CatmullRomSegment[]
  readonly totalLength: number
  sample(s: number): SampleResult
  sampleT(u: number): SampleResult
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

function knotSpacing(a: Vec2, b: Vec2, alpha: number): number {
  const d = dist(a, b)
  if (d < 1e-9) return 1e-6
  return Math.pow(d, alpha)
}

function interp(a: Vec2, b: Vec2, u: number): Vec2 {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
}

function crPoint(seg: CatmullRomSegment, t: number): Vec2 {
  const { p0, p1, p2, p3, t0, t1, t2, t3 } = seg
  const a1 = interp(p0, p1, (t - t0) / (t1 - t0))
  const a2 = interp(p1, p2, (t - t1) / (t2 - t1))
  const a3 = interp(p2, p3, (t - t2) / (t3 - t2))
  const b1 = interp(a1, a2, (t - t0) / (t2 - t0))
  const b2 = interp(a2, a3, (t - t1) / (t3 - t1))
  return interp(b1, b2, (t - t1) / (t2 - t1))
}

function crTangent(seg: CatmullRomSegment, t: number): Vec2 {
  const span = seg.t2 - seg.t1
  const eps = Math.max(1e-5, span * 1e-3)
  const lo = Math.max(seg.t1, t - eps)
  const hi = Math.min(seg.t2, t + eps)
  return normalize(sub(crPoint(seg, hi), crPoint(seg, lo)))
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

function reflectPhantom(p: Vec2, neighbor: Vec2): Vec2 {
  return { x: 2 * p.x - neighbor.x, y: 2 * p.y - neighbor.y }
}

export function fitCatmullRom(
  anchors: Vec2[],
  opts: {
    alpha?: number
    startTangent?: Vec2 | null
    endTangent?: Vec2 | null
  } = {},
): CatmullRomSpline {
  if (anchors.length < 2) {
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
  const points = anchors.slice()
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
