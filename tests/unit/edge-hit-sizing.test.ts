import { describe, expect, it } from 'vitest'
import { scaleEdgeHitTargetSize } from '../../src/renderer/canvas-bg/edgeHitSizing'

describe('scaleEdgeHitTargetSize', () => {
  it('preserves the tuned size at 1x zoom', () => {
    expect(scaleEdgeHitTargetSize(24, 1)).toBe(24)
  })

  it('does not enlarge hit targets above their 1x size', () => {
    expect(scaleEdgeHitTargetSize(24, 2)).toBe(24)
  })

  it('shrinks hit targets as the canvas zooms out', () => {
    expect(scaleEdgeHitTargetSize(24, 0.5)).toBe(12)
    expect(scaleEdgeHitTargetSize(48, 0.5)).toBe(24)
  })

  it('clamps the zoomed-out floor so targets stay usable', () => {
    expect(scaleEdgeHitTargetSize(24, 0.02)).toBeCloseTo(8.4)
    expect(scaleEdgeHitTargetSize(14, 0.02)).toBeCloseTo(4.9)
  })
})
