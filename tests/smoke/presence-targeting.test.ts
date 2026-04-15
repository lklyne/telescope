import { describe, expect, it } from 'vitest'
import {
  framePointMatchesTargetRect,
  resolvePresenceFramePoint,
} from '../../src/shared/presence-targeting'

describe('presence targeting', () => {
  it('prefers frame coordinates over target rect centers', () => {
    expect(
      resolvePresenceFramePoint({
        frameX: 18,
        frameY: 24,
        targetRect: { x: 100, y: 200, width: 50, height: 20 },
        fallbackX: 0,
        fallbackY: 0,
      }),
    ).toEqual({ x: 18, y: 24 })
  })

  it('hides halos when a rect no longer matches the live cursor point', () => {
    expect(
      framePointMatchesTargetRect(18, 24, { x: 100, y: 200, width: 50, height: 20 }),
    ).toBe(false)
    expect(
      framePointMatchesTargetRect(112, 208, { x: 100, y: 200, width: 50, height: 20 }),
    ).toBe(true)
  })
})
