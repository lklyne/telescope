import { describe, it, expect } from 'vitest'
import { defaultAutoPolicy } from '../../src/shared/presence-emitter-policy'
import type { PresenceActivity, PresenceLabelKey } from '../../src/shared/types'

describe('defaultAutoPolicy.pick', () => {
  const DEMO_RECT = { x: 0, y: 0, width: 100, height: 100 }

  const activityCases: Array<{
    activity: PresenceActivity
    labelKey: PresenceLabelKey | null
    targetRect: typeof DEMO_RECT | null
    expected: 'trail' | 'orbit_sphere' | 'orbit_rect'
    name: string
  }> = [
    { name: 'traveling stationary → trail', activity: 'traveling', labelKey: null, targetRect: null, expected: 'trail' },
    { name: 'acting+click_target stationary → trail', activity: 'acting', labelKey: 'click_target', targetRect: null, expected: 'trail' },
    { name: 'idle stationary → trail', activity: 'idle', labelKey: null, targetRect: null, expected: 'trail' },
    { name: 'departing stationary → trail', activity: 'departing', labelKey: null, targetRect: null, expected: 'trail' },
    { name: 'thinking stationary → orbit_sphere', activity: 'thinking', labelKey: 'thinking', targetRect: null, expected: 'orbit_sphere' },
    { name: 'waiting stationary → orbit_sphere', activity: 'waiting', labelKey: null, targetRect: null, expected: 'orbit_sphere' },
    { name: 'acting+inspect_page with rect → orbit_rect', activity: 'acting', labelKey: 'inspect_page', targetRect: DEMO_RECT, expected: 'orbit_rect' },
    { name: 'acting+inspect_page without rect → orbit_sphere', activity: 'acting', labelKey: 'inspect_page', targetRect: null, expected: 'orbit_sphere' },
  ]

  for (const { name, activity, labelKey, targetRect, expected } of activityCases) {
    it(name, () => {
      expect(
        defaultAutoPolicy.pick({ isMoving: false, activity, labelKey, targetRect }),
      ).toBe(expected)
    })
  }

  it('moving overrides thinking → trail', () => {
    expect(
      defaultAutoPolicy.pick({
        isMoving: true,
        activity: 'thinking',
        labelKey: 'thinking',
        targetRect: null,
      }),
    ).toBe('trail')
  })

  it('moving overrides acting+inspect_page → trail', () => {
    expect(
      defaultAutoPolicy.pick({
        isMoving: true,
        activity: 'acting',
        labelKey: 'inspect_page',
        targetRect: DEMO_RECT,
      }),
    ).toBe('trail')
  })

  it('policy works without activity/labelKey (playground path)', () => {
    expect(defaultAutoPolicy.pick({ isMoving: true, targetRect: null })).toBe('trail')
    expect(defaultAutoPolicy.pick({ isMoving: false, targetRect: null })).toBe('orbit_sphere')
    expect(defaultAutoPolicy.pick({ isMoving: false, targetRect: DEMO_RECT })).toBe(
      'orbit_rect',
    )
  })
})
