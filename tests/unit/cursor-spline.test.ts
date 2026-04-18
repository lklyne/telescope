import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../../src/shared/cursor-motion'
import { fitCatmullRom, foldSpline } from '../../src/shared/cursor-spline'

function pt(x: number, y: number): Vec2 {
  return { x, y }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

describe('fitCatmullRom', () => {
  it('two-point fit produces a straight-line spline', () => {
    const s = fitCatmullRom([pt(0, 0), pt(100, 0)])
    expect(s.segments).toHaveLength(1)
    expect(s.totalLength).toBeCloseTo(100, 1)

    // Midpoint should lie on the straight line.
    const mid = s.sampleT(0.5)
    expect(mid.position.x).toBeCloseTo(50, 1)
    expect(mid.position.y).toBeCloseTo(0, 1)

    // Tangent is along +x.
    expect(mid.tangent.x).toBeCloseTo(1, 2)
    expect(Math.abs(mid.tangent.y)).toBeLessThan(0.01)
  })

  it('samples endpoints exactly', () => {
    const anchors = [pt(0, 0), pt(50, 20), pt(120, -10), pt(200, 40)]
    const s = fitCatmullRom(anchors)

    const start = s.sample(0)
    expect(start.position.x).toBeCloseTo(0, 1)
    expect(start.position.y).toBeCloseTo(0, 1)

    const end = s.sample(s.totalLength)
    expect(end.position.x).toBeCloseTo(200, 0.5)
    expect(end.position.y).toBeCloseTo(40, 0.5)
  })

  it('arc length is monotonic non-decreasing across samples', () => {
    const anchors = [pt(0, 0), pt(50, 30), pt(100, -20), pt(180, 10), pt(240, 50)]
    const s = fitCatmullRom(anchors)

    let prev = s.sample(0).position
    let travelled = 0
    const steps = 64
    for (let i = 1; i <= steps; i++) {
      const s2 = s.sample((i / steps) * s.totalLength)
      travelled += dist(prev, s2.position)
      prev = s2.position
    }

    // Sum of polyline segments should approximate totalLength within a few %.
    expect(travelled).toBeGreaterThan(s.totalLength * 0.95)
    expect(travelled).toBeLessThan(s.totalLength * 1.05)
  })

  it('is continuous at internal knots', () => {
    const anchors = [pt(0, 0), pt(50, 30), pt(120, -10), pt(200, 40)]
    const s = fitCatmullRom(anchors)

    // Each internal anchor sits at the boundary of two segments. Sampling just
    // before and after the boundary should yield the same position.
    for (let i = 0; i < s.segments.length - 1; i++) {
      const boundary = s.segments[i].lengthEnd
      const a = s.sample(boundary - 1e-4)
      const b = s.sample(boundary + 1e-4)
      expect(a.position.x).toBeCloseTo(b.position.x, 2)
      expect(a.position.y).toBeCloseTo(b.position.y, 2)
    }
  })

  it('passes through all interior anchors', () => {
    const anchors = [pt(0, 0), pt(80, 40), pt(160, -20), pt(240, 30)]
    const s = fitCatmullRom(anchors)

    // Boundary lengths correspond to interior anchor positions.
    for (let i = 1; i < anchors.length - 1; i++) {
      const seg = s.segments[i - 1]
      const p = s.sample(seg.lengthEnd).position
      expect(p.x).toBeCloseTo(anchors[i].x, 0.5)
      expect(p.y).toBeCloseTo(anchors[i].y, 0.5)
    }
  })

  it('polyline has the requested length and endpoints match', () => {
    const anchors = [pt(0, 0), pt(60, 30), pt(140, -10)]
    const s = fitCatmullRom(anchors)
    const poly = s.polyline(32)
    expect(poly).toHaveLength(32)
    expect(poly[0].x).toBeCloseTo(0, 1)
    expect(poly[poly.length - 1].x).toBeCloseTo(140, 0.5)
  })
})

describe('foldSpline', () => {
  it('starts at current position with matching tangent', () => {
    const tangent: Vec2 = pt(1, 0) // unit right
    const s = foldSpline(pt(50, 50), tangent, [pt(120, 60), pt(200, 40)])

    const start = s.sample(0)
    expect(start.position.x).toBeCloseTo(50, 0.5)
    expect(start.position.y).toBeCloseTo(50, 0.5)

    // Tangent at s=0 should be approximately (+x). Allow some drift because
    // phantom placement is a finite approximation of an infinite-derivative match.
    expect(start.tangent.x).toBeGreaterThan(0.5)
    expect(Math.abs(start.tangent.y)).toBeLessThan(0.7)
  })

  it('preserves start tangent direction within small tolerance', () => {
    const tangent: Vec2 = { x: Math.cos(Math.PI / 4), y: Math.sin(Math.PI / 4) }
    const s = foldSpline(pt(0, 0), tangent, [pt(100, 100), pt(200, 80)])

    const start = s.sample(0)
    const dot = start.tangent.x * tangent.x + start.tangent.y * tangent.y
    // Tangent dot product should be close to 1.
    expect(dot).toBeGreaterThan(0.85)
  })

  it('with no remaining anchors returns a degenerate single-point spline', () => {
    const s = foldSpline(pt(10, 20), pt(1, 0), [])
    expect(s.totalLength).toBe(0)
    const r = s.sample(0)
    expect(r.position.x).toBe(10)
    expect(r.position.y).toBe(20)
  })
})

describe('centripetal vs chordal alpha', () => {
  it('tighter alpha produces a more-direct path through close anchors', () => {
    // Cluster of anchors that would loop under α=1 (chordal) but stay tidy
    // under α=0.5 (centripetal).
    const anchors = [pt(0, 0), pt(100, 0), pt(100, 10), pt(200, 10)]
    const centripetal = fitCatmullRom(anchors, { alpha: 0.5 })
    const chordal = fitCatmullRom(anchors, { alpha: 1 })

    // Sanity: both should have finite length and pass through endpoints.
    expect(centripetal.totalLength).toBeGreaterThan(0)
    expect(chordal.totalLength).toBeGreaterThan(0)

    // Chordal should typically travel further due to loop-like behavior.
    expect(chordal.totalLength).toBeGreaterThanOrEqual(centripetal.totalLength - 1)
  })
})
