import { beforeEach, describe, expect, it } from 'vitest'
import { consumeDragId, resetDropOwner } from './app-client'

/**
 * DropOwner dedup: a dragId can only be consumed once.
 * Spec docs/interaction-layer.md §4.5, §9.
 *
 * Phase A scaffold validates the dedup primitive. The end-to-end
 * "two overlapping drag targets → one handler fires" test depends on
 * Phase 5 wiring dragId stamping into preload bridges; today only one
 * drop path exists (file → canvas) so the integrated end-to-end test
 * is marked .todo.
 */

beforeEach(async () => {
  await resetDropOwner()
})

describe('DropOwner.consumeDragId', () => {
  it('returns false on first sight, true on subsequent sight', async () => {
    const id = `drag_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const first = await consumeDragId(id)
    expect(first.wasConsumed).toBe(false)
    const second = await consumeDragId(id)
    expect(second.wasConsumed).toBe(true)
  })

  it('treats distinct dragIds independently', async () => {
    const a = `drag_test_a_${Date.now()}`
    const b = `drag_test_b_${Date.now()}`
    expect((await consumeDragId(a)).wasConsumed).toBe(false)
    expect((await consumeDragId(b)).wasConsumed).toBe(false)
    expect((await consumeDragId(a)).wasConsumed).toBe(true)
    expect((await consumeDragId(b)).wasConsumed).toBe(true)
  })

  // Phase 5 wires dragId stamping into preload bridges. When a second
  // drop target exists (per spec §4.5 "currentOwner" expansion), this
  // test should validate that exactly one handler fires for a given
  // dragId across overlapping WCVs.
  it.todo('two overlapping drag targets → exactly one handler fires (Phase D)')
})
