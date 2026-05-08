import { describe, expect, it } from 'vitest'
import {
  pagePointMatchesTargetRect,
  resolvePresencePagePoint,
} from '../../src/shared/presence-targeting'

describe('presence targeting', () => {
  it('prefers page coordinates over target rect centers', () => {
    expect(
      resolvePresencePagePoint({
        pageX: 18,
        pageY: 24,
        targetRect: { x: 100, y: 200, width: 50, height: 20 },
        fallbackX: 0,
        fallbackY: 0,
      }),
    ).toEqual({ x: 18, y: 24 })
  })

  it('hides halos when a rect no longer matches the live cursor point', () => {
    expect(
      pagePointMatchesTargetRect(18, 24, { x: 100, y: 200, width: 50, height: 20 }),
    ).toBe(false)
    expect(
      pagePointMatchesTargetRect(112, 208, { x: 100, y: 200, width: 50, height: 20 }),
    ).toBe(true)
  })
})
