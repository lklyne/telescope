import { describe, expect, it } from 'vitest'
import { axisLockProjector } from '../../src/shared/axis-lock-projector'

describe('axisLockProjector', () => {
  it('passes raw deltas through when shift is not held', () => {
    expect(axisLockProjector({ x: 24, y: -15 }, { x: 100, y: 1 }, false)).toEqual({
      x: 24,
      y: -15,
    })
  })

  it('chooses horizontal movement across the left and right octants', () => {
    const rawDelta = { x: 80, y: 30 }
    const offsets = [
      { x: 90, y: 10 },
      { x: 90, y: 60 },
      { x: -90, y: 10 },
      { x: -90, y: 60 },
      { x: 90, y: -10 },
      { x: 90, y: -60 },
      { x: -90, y: -10 },
      { x: -90, y: -60 },
    ]

    for (const offset of offsets) {
      expect(axisLockProjector(rawDelta, offset, true)).toEqual({ x: 80, y: 0 })
    }
  })

  it('chooses vertical movement across the top and bottom octants', () => {
    const rawDelta = { x: 30, y: 80 }
    const offsets = [
      { x: 10, y: 90 },
      { x: 60, y: 90 },
      { x: -10, y: 90 },
      { x: -60, y: 90 },
      { x: 10, y: -90 },
      { x: 60, y: -90 },
      { x: -10, y: -90 },
      { x: -60, y: -90 },
    ]

    for (const offset of offsets) {
      expect(axisLockProjector(rawDelta, offset, true)).toEqual({ x: 0, y: 80 })
    }
  })

  it('flips live as the cursor crosses the 45 degree boundary', () => {
    const rawDelta = { x: 64, y: 48 }

    expect(axisLockProjector(rawDelta, { x: 65, y: 40 }, true)).toEqual({ x: 64, y: 0 })
    expect(axisLockProjector(rawDelta, { x: 40, y: 65 }, true)).toEqual({ x: 0, y: 48 })
  })

  it('resolves exact 45 degree ties horizontally', () => {
    expect(axisLockProjector({ x: 20, y: 20 }, { x: -10, y: 10 }, true)).toEqual({
      x: 20,
      y: 0,
    })
  })

  it('returns one uniform projected delta for callers to apply to any selection size', () => {
    const projected = axisLockProjector({ x: -37, y: 112 }, { x: -2, y: 12 }, true)

    expect([projected, projected, projected]).toEqual([
      { x: 0, y: 112 },
      { x: 0, y: 112 },
      { x: 0, y: 112 },
    ])
  })
})
