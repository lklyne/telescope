import { describe, it, expect } from 'vitest'
import { emitterModeForPresenceCursor } from '../../src/shared/agent-presence'
import type {
  PresenceActivity,
  PresenceLabelKey,
} from '../../src/shared/types'

describe('emitterModeForPresenceCursor', () => {
  const cases: Array<{
    activity: PresenceActivity
    labelKey: PresenceLabelKey | null
    expected: 'trail' | 'orbit_sphere' | 'orbit_rect'
  }> = [
    { activity: 'traveling', labelKey: null, expected: 'trail' },
    { activity: 'acting', labelKey: 'click_target', expected: 'trail' },
    { activity: 'idle', labelKey: null, expected: 'trail' },
    { activity: 'departing', labelKey: null, expected: 'trail' },
    { activity: 'thinking', labelKey: 'thinking', expected: 'orbit_sphere' },
    { activity: 'waiting', labelKey: null, expected: 'orbit_sphere' },
    { activity: 'acting', labelKey: 'inspect_page', expected: 'orbit_rect' },
  ]

  for (const { activity, labelKey, expected } of cases) {
    it(`maps ${activity} + ${labelKey ?? 'null'} → ${expected}`, () => {
      expect(emitterModeForPresenceCursor({ activity, labelKey })).toBe(expected)
    })
  }
})
