import { describe, it, expect } from 'vitest'
import { shouldGateBeOpen, type GateInputs } from '../../src/main/runtime/gate-predicate'
import type { Tool } from '../../src/shared/tool'

function base(): GateInputs {
  return {
    interactionKind: 'idle',
    activeTool: { kind: 'select' },
    viewMode: 'canvas',
    commentOverlayActive: false,
    selectionMarqueeVisible: false,
    spaceHeld: false,
    hoveringCanvasChrome: false,
    selectedEntityIds: [],
    selectedEntityKinds: [],
    selectionOwnsPageContent: false,
    hasSavedDrawings: false,
  }
}

describe('shouldGateBeOpen — canvas mode (default-open per ADR 0002 Step 7)', () => {
  it('open when idle in select tool', () => {
    expect(shouldGateBeOpen(base())).toBe(true)
  })

  it.each([
    'panning',
    'marquee',
    'dragging-entities',
    'resizing-entity',
    'resizing-multi-selection',
    'dragging-edge',
  ] as const)('open when interaction is %s', (kind) => {
    expect(shouldGateBeOpen({ ...base(), interactionKind: kind })).toBe(true)
  })

  it('open while inline entity is being edited (post-Phase-C: editor lives in aboveView)', () => {
    expect(shouldGateBeOpen({ ...base(), interactionKind: 'editing-entity' })).toBe(true)
  })

  it.each<Tool>([{ kind: 'draw' }, { kind: 'comment' }])(
    'open when activeTool is %s (aboveView captures the gesture)',
    (activeTool) => {
      expect(shouldGateBeOpen({ ...base(), activeTool })).toBe(true)
    },
  )

  it('closed when activeTool is inspect without composer open (page receives mousemove for the eyedropper)', () => {
    expect(shouldGateBeOpen({ ...base(), activeTool: { kind: 'inspect' } })).toBe(false)
  })

  it('open when activeTool is inspect and comment composer is active', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        activeTool: { kind: 'inspect' },
        commentOverlayActive: true,
      }),
    ).toBe(true)
  })

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

  it('closed in browser mode for single-page selection with saved drawings', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        viewMode: 'browser',
        hasSavedDrawings: true,
        selectedEntityIds: ['f1'],
        selectedEntityKinds: ['page'],
      }),
    ).toBe(false)
  })

  it('open in browser mode when saved drawings exist and multi-selection includes a page', () => {
    expect(
      shouldGateBeOpen({
        ...base(),
        viewMode: 'browser',
        hasSavedDrawings: true,
        selectedEntityIds: ['f1', 't1'],
        selectedEntityKinds: ['page', 'text'],
      }),
    ).toBe(true)
  })
})
