import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeDragId,
  __resetForTests,
  DRAG_ID_TTL_MS,
} from '../../src/main/runtime/drop-owner'
import { newDragId } from '../../src/shared/drag-ids'

describe('DropOwner', () => {
  beforeEach(__resetForTests)

  it('returns false on first sight and true on repeat', () => {
    const id = newDragId()
    expect(consumeDragId(id)).toBe(false)
    expect(consumeDragId(id)).toBe(true)
    expect(consumeDragId(id)).toBe(true)
  })

  it('treats distinct dragIds independently', () => {
    const a = newDragId()
    const b = newDragId()
    expect(consumeDragId(a)).toBe(false)
    expect(consumeDragId(b)).toBe(false)
    expect(consumeDragId(a)).toBe(true)
  })

  it('forgets dragIds after TTL (garbage collection)', () => {
    vi.useFakeTimers()
    try {
      const id = newDragId()
      expect(consumeDragId(id)).toBe(false)
      vi.advanceTimersByTime(DRAG_ID_TTL_MS + 1)
      // advancing the wall clock by hand — consumeDragId calls Date.now()
      vi.setSystemTime(Date.now() + DRAG_ID_TTL_MS + 1)
      expect(consumeDragId(id)).toBe(false) // looks brand new to us
    } finally {
      vi.useRealTimers()
    }
  })

  it('simulates two overlapping WCVs racing on a drop', () => {
    const id = newDragId()
    // Both WCVs fire 'drop' with the same dragId in quick succession.
    const wcv1Fired = !consumeDragId(id)
    const wcv2Fired = !consumeDragId(id)
    expect(wcv1Fired).toBe(true)
    expect(wcv2Fired).toBe(false)
  })
})
