import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock runtime-context so the controller runs in isolation (no Electron).
const state: { interactionState: { kind: string; [k: string]: unknown } } = {
  interactionState: { kind: 'idle' },
}
vi.mock('../../src/main/runtime/runtime-context', () => ({
  get interactionState() { return state.interactionState },
  setInteractionState: (next: typeof state.interactionState) => { state.interactionState = next },
}))
vi.mock('../../src/main/runtime/layout-dirty', () => ({
  markDirty: () => {},
}))

import {
  tryEnter,
  commit,
  cancel,
  cancelActive,
  peek,
  subscribe,
  __resetForTests,
  TOKEN_EXPIRY_MS,
} from '../../src/main/runtime/interaction-controller'

function resetAll() {
  state.interactionState = { kind: 'idle' }
  __resetForTests()
}

describe('InteractionController', () => {
  beforeEach(resetAll)

  it('starts idle', () => {
    expect(peek()).toEqual({ kind: 'idle' })
  })

  it('tryEnter returns a token and transitions mode', () => {
    const tok = tryEnter({ kind: 'panning' })
    expect('refused' in tok).toBe(false)
    expect(state.interactionState.kind).toBe('panning-canvas')
  })

  it('refuses concurrent tryEnter', () => {
    const a = tryEnter({ kind: 'panning' })
    expect('refused' in a).toBe(false)
    const b = tryEnter({ kind: 'marquee' })
    expect('refused' in b).toBe(true)
    if ('refused' in b) expect(b.reason).toMatch(/already/)
  })

  it('commit returns to idle', () => {
    const tok = tryEnter({ kind: 'marquee' })
    if ('refused' in tok) throw new Error('refused')
    commit(tok)
    expect(state.interactionState.kind).toBe('idle')
    const next = tryEnter({ kind: 'panning' })
    expect('refused' in next).toBe(false)
  })

  it('cancel is idempotent', () => {
    const tok = tryEnter({ kind: 'panning' })
    if ('refused' in tok) throw new Error('refused')
    cancel(tok, 'escape')
    cancel(tok, 'escape')
    expect(state.interactionState.kind).toBe('idle')
  })

  it('stale token after commit is a no-op', () => {
    const tok = tryEnter({ kind: 'panning' })
    if ('refused' in tok) throw new Error('refused')
    commit(tok)
    const other = tryEnter({ kind: 'marquee' })
    expect('refused' in other).toBe(false)
    cancel(tok, 'escape') // stale — must not affect current
    expect(state.interactionState.kind).toBe('marquee-select')
  })

  it('token expiry force-cancels', () => {
    vi.useFakeTimers()
    try {
      const tok = tryEnter({ kind: 'panning' })
      expect('refused' in tok).toBe(false)
      vi.advanceTimersByTime(TOKEN_EXPIRY_MS + 1)
      expect(state.interactionState.kind).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancelActive on idle is a no-op', () => {
    cancelActive('external')
    expect(state.interactionState.kind).toBe('idle')
  })

  it('cancelActive cancels whatever is active', () => {
    const tok = tryEnter({ kind: 'marquee' })
    expect('refused' in tok).toBe(false)
    cancelActive('external')
    expect(state.interactionState.kind).toBe('idle')
    const next = tryEnter({ kind: 'panning' })
    expect('refused' in next).toBe(false)
  })

  it('subscribers fire after transition, not during', async () => {
    const calls: string[] = []
    subscribe((m) => calls.push(m.kind))
    tryEnter({ kind: 'panning' })
    // microtask flush
    await Promise.resolve()
    expect(calls).toContain('panning')
  })
})
