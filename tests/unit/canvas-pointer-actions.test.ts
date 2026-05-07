import { describe, expect, it } from 'vitest'
import { hitTest, type HitInputs } from '../../src/shared/hit-test'
import {
  routePointerDown,
  type CanvasPointerContext,
} from '../../src/shared/canvas-pointer-actions'
import type {
  CanvasSceneEntity,
  CanvasSceneFrameEntity,
  CanvasSceneTextEntity,
} from '../../src/shared/types'

function frame(over: Partial<CanvasSceneFrameEntity> = {}): CanvasSceneFrameEntity {
  return {
    id: 'f1',
    kind: 'frame',
    canvasX: 0,
    canvasY: 0,
    width: 800,
    height: 600,
    screenX: 100,
    screenY: 100,
    screenWidth: 800,
    screenHeight: 600,
    presetIndex: 0,
    rendererTag: 'web',
    ...over,
  } as CanvasSceneFrameEntity
}

function text(over: Partial<CanvasSceneTextEntity> = {}): CanvasSceneTextEntity {
  return {
    id: 't1',
    kind: 'text',
    canvasX: 0,
    canvasY: 0,
    width: 200,
    height: 80,
    screenX: 1100,
    screenY: 100,
    screenWidth: 200,
    screenHeight: 80,
    text: 'hi',
    ...over,
  } as CanvasSceneTextEntity
}

function inputs(entities: CanvasSceneEntity[], selected: string[] = []): HitInputs {
  return { entities, edges: [], selectedEntityIds: selected, zoom: 1 }
}

const baseCtx: CanvasPointerContext = {
  selectedEntityIds: [],
  frameFocused: false,
  isPrimaryButton: true,
  button: 'left',
  modifiers: { shift: false, meta: false, ctrl: false },
  spaceHeld: false,
}

describe('routePointerDown', () => {
  it('frame body pointerdown → frame-body-press', () => {
    const f = frame()
    const target = hitTest(inputs([f]), { x: 500, y: 400 })
    const action = routePointerDown(target, baseCtx)
    expect(action).toEqual({ kind: 'frame-body-press', entityId: 'f1', preserveSelection: false })
  })

  it('frame body pointerdown on single-selected frame → forward-pointer-down', () => {
    const f = frame()
    const target = hitTest(inputs([f], ['f1']), { x: 500, y: 400 })
    const action = routePointerDown(target, { ...baseCtx, selectedEntityIds: ['f1'] })
    expect(action).toEqual({ kind: 'forward-pointer-down', entityId: 'f1', button: 'left' })
  })

  it('right-click on single-selected frame body → forward-pointer-down (right)', () => {
    const f = frame()
    const target = hitTest(inputs([f], ['f1']), { x: 500, y: 400 })
    const action = routePointerDown(target, {
      ...baseCtx,
      selectedEntityIds: ['f1'],
      isPrimaryButton: false,
      button: 'right',
    })
    expect(action).toEqual({ kind: 'forward-pointer-down', entityId: 'f1', button: 'right' })
  })

  it('frame body pointerdown when frame is in multi-selection → frame-body-press (drag)', () => {
    const f = frame()
    const t = text()
    const target = hitTest(inputs([f, t], ['f1', 't1']), { x: 500, y: 400 })
    const action = routePointerDown(target, {
      ...baseCtx,
      selectedEntityIds: ['f1', 't1'],
    })
    expect(action).toMatchObject({ kind: 'frame-body-press', entityId: 'f1' })
  })

  it('chrome click on frame → begin-entity-drag', () => {
    const f = frame()
    // Chrome is the 36px strip above screenY.
    const target = hitTest(inputs([f]), { x: 500, y: f.screenY - 10 })
    const action = routePointerDown(target, baseCtx)
    expect(action).toMatchObject({ kind: 'begin-entity-drag', entityId: 'f1', entityKind: 'frame' })
  })

  it('shift-click chrome → toggle-select (no drag)', () => {
    const f = frame()
    const target = hitTest(inputs([f]), { x: 500, y: f.screenY - 10 })
    const action = routePointerDown(target, {
      ...baseCtx,
      modifiers: { shift: true, meta: false, ctrl: false },
    })
    expect(action).toEqual({ kind: 'toggle-select', entityId: 'f1', entityKind: 'frame' })
  })

  it('anchor click → begin-edge-drag', () => {
    const f = frame()
    const target = hitTest(
      inputs([f], ['f1']),
      // Right-side anchor sits past screenX + screenWidth
      { x: f.screenX + f.screenWidth + 10, y: f.screenY + f.screenHeight / 2 },
    )
    const action = routePointerDown(target, { ...baseCtx, selectedEntityIds: ['f1'] })
    expect(action).toMatchObject({ kind: 'begin-edge-drag', entityId: 'f1', side: 'right' })
  })

  it('resize handle (selected entity) → begin-resize', () => {
    const f = frame()
    const target = hitTest(
      inputs([f], ['f1']),
      { x: f.screenX, y: f.screenY }, // nw handle
    )
    const action = routePointerDown(target, { ...baseCtx, selectedEntityIds: ['f1'] })
    expect(action).toMatchObject({ kind: 'begin-resize', entityId: 'f1', handle: 'nw' })
  })

  it('background click (no modifiers) → background-click', () => {
    const target = hitTest(inputs([]), { x: 50, y: 50 })
    const action = routePointerDown(target, baseCtx)
    expect(action).toEqual({ kind: 'background-click' })
  })

  it('shift on background → background-click (additive deselect/no-op)', () => {
    const target = hitTest(inputs([]), { x: 50, y: 50 })
    const action = routePointerDown(target, {
      ...baseCtx,
      modifiers: { shift: true, meta: false, ctrl: false },
    })
    expect(action).toEqual({ kind: 'background-click' })
  })

  it('space-held + background → begin-pan', () => {
    const target = hitTest(inputs([]), { x: 50, y: 50 })
    const action = routePointerDown(target, { ...baseCtx, spaceHeld: true })
    expect(action).toEqual({ kind: 'begin-pan' })
  })

  it('text body click → begin-entity-drag', () => {
    const t = text()
    const target = hitTest(inputs([t]), { x: t.screenX + 50, y: t.screenY + 30 })
    const action = routePointerDown(target, baseCtx)
    expect(action).toMatchObject({ kind: 'begin-entity-drag', entityId: 't1', entityKind: 'text' })
  })

  it('non-primary button on background → noop', () => {
    const target = hitTest(inputs([]), { x: 50, y: 50 })
    const action = routePointerDown(target, { ...baseCtx, isPrimaryButton: false })
    expect(action).toEqual({ kind: 'noop' })
  })

  // --- Issue #41 regression: chrome wins over anchor in their overlap zone ---
  it('issue #41: click at the chrome/top-anchor overlap zone goes to chrome, not anchor', () => {
    // Chrome strip is the 36px band above screenY: x=[100,900], y=[64,100].
    // Top anchor (when selected) is centred above the frame midpoint, with a
    // 4px gap. At zoom=1 it's 56×24, centred at (500, 84): x=[472,528],
    // y=[72,96]. The anchor's hit ring dips into the chrome y-range — that's
    // the #41 bug class. Per ADR 0001's priority table, chrome wins.
    const f = frame()
    const target = hitTest(inputs([f], ['f1']), { x: 500, y: 84 })
    expect(target.payload.kind).toBe('chrome')
    const action = routePointerDown(target, { ...baseCtx, selectedEntityIds: ['f1'] })
    expect(action.kind).toBe('begin-entity-drag')
  })
})
