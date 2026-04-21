import { describe, expect, it } from 'vitest'
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

    const mid = s.sampleT(0.5)
    expect(mid.position.x).toBeCloseTo(50, 1)
    expect(mid.position.y).toBeCloseTo(0, 1)
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

  it('arc length is monotonic across samples', () => {
    const anchors = [pt(0, 0), pt(50, 30), pt(100, -20), pt(180, 10), pt(240, 50)]
    const s = fitCatmullRom(anchors)

    let prev = s.sample(0).position
    let travelled = 0
    const steps = 64
    for (let i = 1; i <= steps; i++) {
      const sample = s.sample((i / steps) * s.totalLength)
      travelled += dist(prev, sample.position)
      prev = sample.position
    }

    expect(travelled).toBeGreaterThan(s.totalLength * 0.95)
    expect(travelled).toBeLessThan(s.totalLength * 1.05)
  })

  it('passes through all interior anchors', () => {
    const anchors = [pt(0, 0), pt(80, 40), pt(160, -20), pt(240, 30)]
    const s = fitCatmullRom(anchors)

    for (let i = 1; i < anchors.length - 1; i++) {
      const seg = s.segments[i - 1]
      const p = s.sample(seg.lengthEnd).position
      expect(p.x).toBeCloseTo(anchors[i].x, 0.5)
      expect(p.y).toBeCloseTo(anchors[i].y, 0.5)
    }
  })
})

describe('foldSpline', () => {
  it('starts at current position with matching tangent', () => {
    const tangent: Vec2 = pt(1, 0)
    const s = foldSpline(pt(50, 50), tangent, [pt(120, 60), pt(200, 40)])

    const start = s.sample(0)
    expect(start.position.x).toBeCloseTo(50, 0.5)
    expect(start.position.y).toBeCloseTo(50, 0.5)
    expect(start.tangent.x).toBeGreaterThan(0.5)
    expect(Math.abs(start.tangent.y)).toBeLessThan(0.7)
  })

  it('with no remaining anchors returns a degenerate spline', () => {
    const s = foldSpline(pt(10, 20), pt(1, 0), [])
    expect(s.totalLength).toBe(0)
    const r = s.sample(0)
    expect(r.position.x).toBe(10)
    expect(r.position.y).toBe(20)
  })
})
