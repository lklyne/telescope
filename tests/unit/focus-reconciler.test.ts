import { describe, expect, it } from 'vitest'
import { expectedFocus, focusKey, type FocusState } from '../../src/main/runtime/focus-reconciler'

function state(overrides: Partial<FocusState> = {}): FocusState {
  return {
    interactionMode: 'idle',
    editingTextEntityId: null,
    selectedPageId: null,
    focusedFrameId: null,
    commentOverlayActive: false,
    pendingFocus: null,
    ...overrides,
  }
}

describe('expectedFocus', () => {
  it('defaults to bgView with no focus', () => {
    expect(expectedFocus(state())).toEqual({ kind: 'bgView' })
  })

  it('returns the focused page when a frame is focused', () => {
    expect(expectedFocus(state({ focusedFrameId: 'p1', selectedPageId: 'p1' })))
      .toEqual({ kind: 'page', id: 'p1' })
  })

  it('falls back to bgView when focus is on a non-frame entity', () => {
    expect(expectedFocus(state({ focusedFrameId: null })))
      .toEqual({ kind: 'bgView' })
  })

  for (const mode of ['panning', 'marquee', 'dragging-entities', 'resizing-entity', 'dragging-edge'] as const) {
    it(`routes ${mode} to aboveView`, () => {
      expect(expectedFocus(state({ interactionMode: mode }))).toEqual({ kind: 'aboveView' })
    })
  }

  it('editing-text routes to aboveView', () => {
    expect(expectedFocus(state({ interactionMode: 'editing-text', editingTextEntityId: 'e1' })))
      .toEqual({ kind: 'aboveView' })
  })

  it('routes to aboveView when comment overlay is active', () => {
    expect(expectedFocus(state({ commentOverlayActive: true }))).toEqual({ kind: 'aboveView' })
  })

  it('pendingFocus overrides derivation', () => {
    expect(expectedFocus(state({ pendingFocus: { kind: 'toolbar' } })))
      .toEqual({ kind: 'toolbar' })
    expect(expectedFocus(state({
      focusedFrameId: 'p1',
      selectedPageId: 'p1',
      pendingFocus: { kind: 'bgView' },
    }))).toEqual({ kind: 'bgView' })
  })
})

describe('focusKey', () => {
  it('is stable and distinct across targets', () => {
    expect(focusKey({ kind: 'bgView' })).toBe('bgView')
    expect(focusKey({ kind: 'aboveView' })).toBe('aboveView')
    expect(focusKey({ kind: 'page', id: 'p1' })).toBe('page:p1')
    expect(focusKey({ kind: 'page', id: 'p2' })).toBe('page:p2')
  })
})
