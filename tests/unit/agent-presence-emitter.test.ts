import { describe, it, expect } from 'vitest'
import { emitterModeForPresenceCursor } from '../../src/shared/agent-presence'
import type { PresenceActivity } from '../../src/shared/types'

describe('emitterModeForPresenceCursor', () => {
  const cases: Array<[PresenceActivity, 'trail' | 'orbit_sphere']> = [
    ['traveling', 'trail'],
    ['acting', 'trail'],
    ['idle', 'trail'],
    ['departing', 'trail'],
    ['thinking', 'orbit_sphere'],
    ['waiting', 'orbit_sphere'],
  ]

  for (const [activity, expected] of cases) {
    it(`maps ${activity} → ${expected}`, () => {
      expect(emitterModeForPresenceCursor({ activity })).toBe(expected)
    })
  }
})
