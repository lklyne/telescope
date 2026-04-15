import { describe, it, expect } from 'vitest'
import { shouldGateBeOpen, type GateInputs } from '../../src/main/runtime/gate-predicate'

function base(): GateInputs {
  return {
    interactionKind: 'idle',
    toolMode: 'select',
    viewMode: 'canvas',
    commentOverlayActive: false,
    selectionMarqueeVisible: false,
    spaceHeld: false,
    hoveringCanvasChrome: false,
    selectedEntityIds: [],
    selectedEntityKinds: [],
    hasSavedDrawings: false,
  }
}

describe('shouldGateBeOpen', () => {
  it('closed when idle in select mode with nothing else', () => {
    expect(shouldGateBeOpen(base())).toBe(false)
  })

  it.each([
    'panning',
    'marquee',
    'dragging-entities',
    'resizing-entity',
    'dragging-edge',
    'editing-text',
  ] as const)('open when interaction is %s', (kind) => {
    expect(shouldGateBeOpen({ ...base(), interactionKind: kind })).toBe(true)
  })

  it.each(['annotate-draw', 'annotate-region-select'] as const)(
    'open when toolMode is %s',
    (toolMode) => {
      expect(shouldGateBeOpen({ ...base(), toolMode })).toBe(true)
    },
  )

  it.each(['inspect', 'annotate-comment'] as const)(
    'closed when toolMode is %s (frame receives mousemove for eyedropper)',
    (toolMode) => {
      expect(shouldGateBeOpen({ ...base(), toolMode })).toBe(false)
    },
  )

  it('open when space held', () => {
    expect(shouldGateBeOpen({ ...base(), spaceHeld: true })).toBe(true)
  })

  it('open when hovering canvas chrome', () => {
    expect(shouldGateBeOpen({ ...base(), hoveringCanvasChrome: true })).toBe(true)
  })

  it('open when commentOverlayActive', () => {
    expect(shouldGateBeOpen({ ...base(), commentOverlayActive: true })).toBe(true)
  })

  it('open when marquee visible', () => {
    expect(shouldGateBeOpen({ ...base(), selectionMarqueeVisible: true })).toBe(true)
  })

  it('open for single text selection (floating menu)', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        selectedEntityIds: ['t1'],
        selectedEntityKinds: ['text'],
      }),
    ).toBe(true)
  })

  it('open for single drawing selection (floating menu)', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        selectedEntityIds: ['d1'],
        selectedEntityKinds: ['drawing'],
      }),
    ).toBe(true)
  })

  it('closed for single frame selection (no menu)', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        selectedEntityIds: ['f1'],
        selectedEntityKinds: ['frame'],
      }),
    ).toBe(false)
  })

  it('closed for multi-entity selection (no single-entity menu)', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        selectedEntityIds: ['t1', 't2'],
        selectedEntityKinds: ['text', 'text'],
      }),
    ).toBe(false)
  })

  it('closed in browser viewMode even with text selection', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        viewMode: 'browser',
        selectedEntityIds: ['t1'],
        selectedEntityKinds: ['text'],
      }),
    ).toBe(false)
  })

  it('open when saved drawings exist and no frame is selected', () => {
    expect(shouldGateBeOpen({ ...base(), hasSavedDrawings: true })).toBe(true)
  })

  it('closed when saved drawings exist but a frame is selected', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        hasSavedDrawings: true,
        selectedEntityIds: ['f1'],
        selectedEntityKinds: ['frame'],
      }),
    ).toBe(false)
  })
})
