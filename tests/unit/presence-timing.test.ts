import { describe, it, expect } from 'vitest'
import {
  PRESENCE_TRAVEL_MS,
  PRESENCE_DWELL_MS,
  PRESENCE_STEP_DELAY_MS,
  PRESENCE_THINKING_DELAY_MS,
  PRESENCE_INTENT_TTL_MS,
} from '../../src/shared/presence-timing'

describe('presence timing constants', () => {
  it('step delay equals travel + dwell', () => {
    expect(PRESENCE_STEP_DELAY_MS).toBe(PRESENCE_TRAVEL_MS + PRESENCE_DWELL_MS)
  })

  it('thinking delay is longer than step delay', () => {
    expect(PRESENCE_THINKING_DELAY_MS).toBeGreaterThan(PRESENCE_STEP_DELAY_MS)
  })

  it('intent TTL is shorter than thinking delay', () => {
    expect(PRESENCE_INTENT_TTL_MS).toBeLessThan(PRESENCE_THINKING_DELAY_MS)
  })

})
