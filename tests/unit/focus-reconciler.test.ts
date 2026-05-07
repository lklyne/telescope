import { describe, expect, it } from 'vitest'
import { expectedFocus, focusKey, type FocusState } from '../../src/main/runtime/focus-reconciler'

function state(overrides: Partial<FocusState> = {}): FocusState {
  return {
    interactionMode: 'idle',
    editingTextEntityId: null,
    selectedPageId: null,
    workspaceViewMode: 'canvas',
    commentOverlayActive: false,
    pendingFocus: null,
    focusedFrameId: null,
    ...overrides,
  }
}

describe('expectedFocus', () => {
  it('defaults to bgView in idle canvas mode', () => {
    expect(expectedFocus(state())).toEqual({ kind: 'bgView' })
  })

  it('returns the selected page in browser mode', () => {
    expect(expectedFocus(state({ workspaceViewMode: 'browser', selectedPageId: 'p1' })))
      .toEqual({ kind: 'page', id: 'p1' })
  })

  it('falls back to bgView in browser mode without a selected page', () => {
    expect(expectedFocus(state({ workspaceViewMode: 'browser' })))
      .toEqual({ kind: 'bgView' })
  })

  for (const mode of ['panning', 'marquee', 'dragging-entities', 'resizing-entity', 'dragging-edge'] as const) {
    it(`routes ${mode} to aboveView`, () => {
      expect(expectedFocus(state({ interactionMode: mode }))).toEqual({ kind: 'aboveView' })
    })
  }

  it('editing-text routes to bgView', () => {
    expect(expectedFocus(state({ interactionMode: 'editing-text', editingTextEntityId: 'e1' })))
      .toEqual({ kind: 'bgView' })
  })

  it('routes to aboveView when comment overlay is active', () => {
    expect(expectedFocus(state({ commentOverlayActive: true }))).toEqual({ kind: 'aboveView' })
  })

  describe('focusedFrameId (predicate-derived keyboard target)', () => {
    it('routes to the target page in idle canvas mode', () => {
      expect(expectedFocus(state({ focusedFrameId: 'f1' })))
        .toEqual({ kind: 'page', id: 'f1' })
    })
    it('yields to active gestures', () => {
      expect(expectedFocus(state({ focusedFrameId: 'f1', interactionMode: 'panning' })))
        .toEqual({ kind: 'aboveView' })
    })
    it('yields to comment overlay', () => {
      expect(expectedFocus(state({ focusedFrameId: 'f1', commentOverlayActive: true })))
        .toEqual({ kind: 'aboveView' })
    })
    it('yields to explicit pendingFocus', () => {
      expect(expectedFocus(state({ focusedFrameId: 'f1', pendingFocus: { kind: 'toolbar' } })))
        .toEqual({ kind: 'toolbar' })
    })
  })

  it('pendingFocus overrides derivation', () => {
    expect(expectedFocus(state({ pendingFocus: { kind: 'toolbar' } })))
      .toEqual({ kind: 'toolbar' })
    expect(expectedFocus(state({
      workspaceViewMode: 'browser',
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
