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
    selectionOwnsFrameContent: false,
    hasSavedDrawings: false,
    frameFocus: null,
  }
}

describe('shouldGateBeOpen — canvas mode (default-open per ADR 0002 Step 7)', () => {
  it('open when idle in select mode', () => {
    expect(shouldGateBeOpen(base())).toBe(true)
  })

  it.each([
    'panning',
    'marquee',
    'dragging-entities',
    'resizing-entity',
    'dragging-edge',
  ] as const)('open when interaction is %s', (kind) => {
    expect(shouldGateBeOpen({ ...base(), interactionKind: kind })).toBe(true)
  })

  it('closed while inline text is being edited (textarea is in bgView)', () => {
    expect(shouldGateBeOpen({ ...base(), interactionKind: 'editing-text' })).toBe(false)
  })

  it.each(['annotate-draw', 'annotate-region-select'] as const)(
    'open when toolMode is %s',
    (toolMode) => {
      expect(shouldGateBeOpen({ ...base(), toolMode })).toBe(true)
    },
  )

  it.each(['inspect', 'annotate-comment'] as const)(
    'closed when toolMode is %s without composer open (frame receives mousemove)',
    (toolMode) => {
      expect(shouldGateBeOpen({ ...base(), toolMode })).toBe(false)
    },
  )

  it.each(['inspect', 'annotate-comment'] as const)(
    'open when toolMode is %s and comment composer is active',
    (toolMode) => {
      expect(
        shouldGateBeOpen({ ...base(), toolMode, commentOverlayActive: true }),
      ).toBe(true)
    },
  )

  it('open with selection in canvas mode', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        selectedEntityIds: ['t1'],
        selectedEntityKinds: ['text'],
      }),
    ).toBe(true)
  })
})

describe('shouldGateBeOpen — browser mode falls through to browserModeNeedsGate', () => {
  it('closed by default in browser mode', () => {
    expect(shouldGateBeOpen({ ...base(), viewMode: 'browser' })).toBe(false)
  })

  it('open when commentOverlayActive in browser mode', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        viewMode: 'browser',
        commentOverlayActive: true,
      }),
    ).toBe(true)
  })

  it('open when marquee visible in browser mode', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        viewMode: 'browser',
        selectionMarqueeVisible: true,
      }),
    ).toBe(true)
  })

  it('closed in browser mode for single-frame selection with saved drawings', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        viewMode: 'browser',
        hasSavedDrawings: true,
        selectedEntityIds: ['f1'],
        selectedEntityKinds: ['frame'],
      }),
    ).toBe(false)
  })

  it('open in browser mode when saved drawings exist and multi-selection includes a frame', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        viewMode: 'browser',
        hasSavedDrawings: true,
        selectedEntityIds: ['f1', 't1'],
        selectedEntityKinds: ['frame', 'text'],
      }),
    ).toBe(true)
  })
})

describe('shouldGateBeOpen — frame focus (PoC: gate-flip retired)', () => {
  // PoC retires the ADR 0001 gate-flip on frameFocus: aboveView stays
  // default-open in canvas mode regardless of focus, and forwards body
  // pointer/wheel into the page from inside aboveView's pointer router.
  it('open when frame is focused and in canvas mode', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        frameFocus: { id: 'frame-1' },
      }),
    ).toBe(true)
  })

  it('open when frame is focused with saved drawings (drawings stay above)', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        frameFocus: { id: 'frame-1' },
        hasSavedDrawings: true,
      }),
    ).toBe(true)
  })

  it('open when frame focus is null and we are in canvas mode', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        frameFocus: null,
      }),
    ).toBe(true)
  })
})
