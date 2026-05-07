import { describe, expect, it } from 'vitest'
import {
  inflateRect,
  rectContains,
  regionContains,
  type HitRegion,
} from '../../src/shared/hit-regions'

describe('rectContains', () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 }
  it('contains points strictly inside', () => {
    expect(rectContains(rect, { x: 50, y: 40 })).toBe(true)
  })
  it('contains points on the edge', () => {
    expect(rectContains(rect, { x: 10, y: 20 })).toBe(true)
    expect(rectContains(rect, { x: 110, y: 70 })).toBe(true)
  })
  it('rejects points outside', () => {
    expect(rectContains(rect, { x: 9, y: 40 })).toBe(false)
    expect(rectContains(rect, { x: 50, y: 71 })).toBe(false)
  })
})

describe('regionContains — disc', () => {
  const region: HitRegion = { kind: 'disc', cx: 100, cy: 100, radius: 24 }
  it('contains the center', () => {
    expect(regionContains(region, { x: 100, y: 100 })).toBe(true)
  })
  it('contains points within the radius', () => {
    expect(regionContains(region, { x: 120, y: 100 })).toBe(true)
    expect(regionContains(region, { x: 100, y: 124 })).toBe(true)
  })
  it('rejects points outside the radius', () => {
    expect(regionContains(region, { x: 125, y: 100 })).toBe(false)
    expect(regionContains(region, { x: 100, y: 125 })).toBe(false)
  })
})

describe('regionContains — stroke', () => {
  const region: HitRegion = {
    kind: 'stroke',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
    thickness: 8,
  }
  it('contains points on the line', () => {
    expect(regionContains(region, { x: 50, y: 0 })).toBe(true)
  })
  it('contains points within the half-thickness perpendicular', () => {
    expect(regionContains(region, { x: 50, y: 3 })).toBe(true)
    expect(regionContains(region, { x: 50, y: -3 })).toBe(true)
  })
  it('rejects points beyond the half-thickness', () => {
    expect(regionContains(region, { x: 50, y: 5 })).toBe(false)
  })
  it('rejects points past the segment endpoints', () => {
    expect(regionContains(region, { x: 110, y: 0 })).toBe(false)
    expect(regionContains(region, { x: -10, y: 0 })).toBe(false)
  })
  it('handles a degenerate zero-length stroke as a disc', () => {
    const point: HitRegion = {
      kind: 'stroke',
      from: { x: 5, y: 5 },
      to: { x: 5, y: 5 },
      thickness: 4,
    }
    expect(regionContains(point, { x: 6, y: 6 })).toBe(true)
    expect(regionContains(point, { x: 8, y: 8 })).toBe(false)
  })
})

describe('inflateRect', () => {
  it('expands symmetrically by dx/dy', () => {
    expect(inflateRect({ x: 10, y: 20, width: 100, height: 50 }, 5, 10)).toEqual({
      x: 5,
      y: 10,
      width: 110,
      height: 70,
    })
  })
})
