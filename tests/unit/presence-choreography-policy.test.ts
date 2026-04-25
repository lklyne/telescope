import { describe, expect, it } from 'vitest'
import { defaultPresenceChoreographyPolicy } from '../../src/shared/presence-choreography-policy'
import type { PresenceActivity, PresenceLabelKey } from '../../src/shared/types'
import type { PresenceVisualState } from '../../src/shared/presence-visual-state'

describe('defaultPresenceChoreographyPolicy.pick', () => {
  const DEMO_RECT = { x: 0, y: 0, width: 100, height: 100 }

  const activityCases: Array<{
    activity: PresenceActivity
    labelKey: PresenceLabelKey | null
    targetRect: typeof DEMO_RECT | null
    expected: PresenceVisualState
    name: string
  }> = [
    { name: 'traveling stationary -> idle', activity: 'traveling', labelKey: null, targetRect: null, expected: 'idle' },
    { name: 'acting+click_target stationary -> idle', activity: 'acting', labelKey: 'click_target', targetRect: null, expected: 'idle' },
    { name: 'idle stationary -> idle', activity: 'idle', labelKey: null, targetRect: null, expected: 'idle' },
    { name: 'departing stationary -> idle', activity: 'departing', labelKey: null, targetRect: null, expected: 'idle' },
    { name: 'thinking stationary -> thinking', activity: 'thinking', labelKey: 'thinking', targetRect: null, expected: 'thinking' },
    { name: 'waiting stationary -> waiting', activity: 'waiting', labelKey: null, targetRect: null, expected: 'waiting' },
    { name: 'acting+inspect_page with rect -> inspecting', activity: 'acting', labelKey: 'inspect_page', targetRect: DEMO_RECT, expected: 'inspecting' },
    { name: 'acting+inspect_page without rect -> thinking', activity: 'acting', labelKey: 'inspect_page', targetRect: null, expected: 'thinking' },
  ]

  for (const { name, activity, labelKey, targetRect, expected } of activityCases) {
    it(name, () => {
      expect(
        defaultPresenceChoreographyPolicy.pick({
          isMoving: false,
          activity,
          labelKey,
          targetRect,
        }),
      ).toBe(expected)
    })
  }

  it('moving wins over durable states', () => {
    expect(
      defaultPresenceChoreographyPolicy.pick({
        isMoving: true,
        activity: 'thinking',
        labelKey: 'thinking',
        targetRect: null,
      }),
    ).toBe('moving')
  })

  it('works without raw activity for the playground path', () => {
    expect(
      defaultPresenceChoreographyPolicy.pick({
        isMoving: true,
        targetRect: null,
      }),
    ).toBe('moving')
    expect(
      defaultPresenceChoreographyPolicy.pick({
        isMoving: false,
        targetRect: null,
      }),
    ).toBe('idle')
    expect(
      defaultPresenceChoreographyPolicy.pick({
        isMoving: false,
        targetRect: DEMO_RECT,
      }),
    ).toBe('inspecting')
  })
})
