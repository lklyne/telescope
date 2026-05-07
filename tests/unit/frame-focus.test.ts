import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetFrameFocusForTests,
  areFocusEventsSuppressed,
  currentFrameFocus,
  enterFrameFocus,
  exitFrameFocus,
  exitFrameFocusIfMatches,
  focusedFrameId,
  isFrameFocused,
  subscribeFrameFocus,
  withFocusEventsSuppressed,
  type FrameFocusTransition,
} from '../../src/main/runtime/frame-focus'

beforeEach(() => _resetFrameFocusForTests())

describe('frame-focus state', () => {
  it('starts with no focus', () => {
    expect(currentFrameFocus()).toBeNull()
    expect(focusedFrameId()).toBeNull()
  })

  it('enter sets focus and records timestamp', () => {
    enterFrameFocus('f1', 'click', 100)
    expect(currentFrameFocus()).toEqual({ id: 'f1', since: 100 })
    expect(isFrameFocused('f1')).toBe(true)
    expect(isFrameFocused('f2')).toBe(false)
  })

  it('enter on the same frame is idempotent', () => {
    const seen: FrameFocusTransition[] = []
    subscribeFrameFocus((_, t) => seen.push(t))
    enterFrameFocus('f1', 'click', 100)
    enterFrameFocus('f1', 'click', 200)
    expect(currentFrameFocus()).toEqual({ id: 'f1', since: 100 })
    expect(seen).toHaveLength(1)
  })

  it('switching frames exits the previous and enters the new', () => {
    const seen: FrameFocusTransition[] = []
    subscribeFrameFocus((_, t) => seen.push(t))
    enterFrameFocus('f1', 'click', 100)
    enterFrameFocus('f2', 'click', 200)
    expect(seen).toEqual([
      { kind: 'enter', id: 'f1', reason: 'click', since: 100 },
      { kind: 'exit', id: 'f1', reason: 'programmatic' },
      { kind: 'enter', id: 'f2', reason: 'click', since: 200 },
    ])
    expect(currentFrameFocus()).toEqual({ id: 'f2', since: 200 })
  })

  it('exit clears focus and notifies', () => {
    const listener = vi.fn()
    enterFrameFocus('f1', 'click', 100)
    subscribeFrameFocus(listener)
    exitFrameFocus('blur')
    expect(currentFrameFocus()).toBeNull()
    expect(listener).toHaveBeenCalledWith(null, { kind: 'exit', id: 'f1', reason: 'blur' })
  })

  it('exit when nothing is focused is a no-op', () => {
    const listener = vi.fn()
    subscribeFrameFocus(listener)
    exitFrameFocus('blur')
    expect(listener).not.toHaveBeenCalled()
  })

  it('exitIfMatches only fires when ids match', () => {
    enterFrameFocus('f1', 'click', 100)
    exitFrameFocusIfMatches('f2', 'frame-deleted')
    expect(currentFrameFocus()?.id).toBe('f1')
    exitFrameFocusIfMatches('f1', 'frame-deleted')
    expect(currentFrameFocus()).toBeNull()
  })

  it('subscribe returns an unsubscriber', () => {
    const listener = vi.fn()
    const unsub = subscribeFrameFocus(listener)
    enterFrameFocus('f1', 'click', 100)
    unsub()
    enterFrameFocus('f2', 'click', 200)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('focus event suppression', () => {
  it('starts un-suppressed', () => {
    expect(areFocusEventsSuppressed()).toBe(false)
  })

  it('withFocusEventsSuppressed sets and restores the flag', () => {
    let inner = false
    withFocusEventsSuppressed(() => {
      inner = areFocusEventsSuppressed()
    })
    expect(inner).toBe(true)
    expect(areFocusEventsSuppressed()).toBe(false)
  })

  it('restores even when the callback throws', () => {
    expect(() =>
      withFocusEventsSuppressed(() => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(areFocusEventsSuppressed()).toBe(false)
  })

  it('nested calls preserve outer suppression', () => {
    withFocusEventsSuppressed(() => {
      withFocusEventsSuppressed(() => {})
      expect(areFocusEventsSuppressed()).toBe(true)
    })
    expect(areFocusEventsSuppressed()).toBe(false)
  })
})
