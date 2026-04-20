import { describe, it, expect } from 'vitest'
import { deriveMood, paramsForMood } from '../../src/main/presence/mood'

describe('deriveMood', () => {
  const base = {
    verb: 'click',
    retryCount: 0,
    timeSinceProgress: 0,
    hasError: false,
    isWait: false,
  }

  it('returns error when hasError is set', () => {
    expect(deriveMood({ ...base, hasError: true })).toBe('error')
  })

  it('returns correcting when retrying recently', () => {
    expect(
      deriveMood({ ...base, retryCount: 1, timeSinceProgress: 500 }),
    ).toBe('correcting')
  })

  it('does not return correcting when retry is stale', () => {
    expect(
      deriveMood({ ...base, retryCount: 1, timeSinceProgress: 5_000 }),
    ).not.toBe('correcting')
  })

  it('returns waiting for isWait', () => {
    expect(deriveMood({ ...base, verb: 'wait', isWait: true })).toBe('waiting')
  })

  it('returns stuck when time-since-progress is large', () => {
    expect(
      deriveMood({ ...base, verb: 'click', timeSinceProgress: 10_000 }),
    ).toBe('stuck')
  })

  it('classifies read verbs as exploring', () => {
    expect(deriveMood({ ...base, verb: 'snapshot' })).toBe('exploring')
    expect(deriveMood({ ...base, verb: 'query-elements' })).toBe('exploring')
    expect(deriveMood({ ...base, verb: 'workspace' })).toBe('exploring')
  })

  it('classifies state-changing verbs as committing', () => {
    expect(deriveMood({ ...base, verb: 'click' })).toBe('committing')
    expect(deriveMood({ ...base, verb: 'fill' })).toBe('committing')
    expect(deriveMood({ ...base, verb: 'delete' })).toBe('committing')
    expect(deriveMood({ ...base, verb: 'link' })).toBe('committing')
  })

  it('unknown verbs default to exploring', () => {
    expect(deriveMood({ ...base, verb: 'something-new' })).toBe('exploring')
  })

  it('error beats correcting and stuck', () => {
    expect(
      deriveMood({
        ...base,
        hasError: true,
        retryCount: 5,
        timeSinceProgress: 30_000,
      }),
    ).toBe('error')
  })
})

describe('paramsForMood', () => {
  it('waiting and stuck freeze travel speed but add drift', () => {
    const w = paramsForMood('waiting')
    expect(w.speedMultiplier).toBe(0)
    expect(w.driftRadiusPx).toBeGreaterThan(0)

    const s = paramsForMood('stuck')
    expect(s.speedMultiplier).toBe(0)
    expect(s.driftRadiusPx).toBeGreaterThanOrEqual(w.driftRadiusPx)
  })

  it('committing is faster than exploring', () => {
    expect(paramsForMood('committing').speedMultiplier).toBeGreaterThan(
      paramsForMood('exploring').speedMultiplier,
    )
  })

  it('correcting uses tighter spline alpha', () => {
    expect(paramsForMood('correcting').splineAlpha).toBeGreaterThan(
      paramsForMood('exploring').splineAlpha,
    )
  })

  it('error freezes motion', () => {
    expect(paramsForMood('error').speedMultiplier).toBe(0)
  })
})
