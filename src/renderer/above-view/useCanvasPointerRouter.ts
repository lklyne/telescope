/**
 * Canvas pointer router (ADR 0001 — Phase 2 substrate).
 *
 * Runs the shared `hitTest` against the current layout snapshot on
 * pointerdown and dispatches a typed `CanvasPointerAction` to the existing
 * IPC surface. This is the single arbitration point for canvas pointer
 * events that the plan calls for — hit priority is encoded once, in
 * `src/shared/hit-test.ts`, instead of being scattered across per-layer
 * `onMouseDown` handlers in bgView.
 *
 * Phase 2 wiring strategy: the router is mounted as a parallel path. When
 * the gate predicate keeps aboveView covered (during gestures, marquee,
 * tool modes, etc.), this router intercepts pointerdown at the window
 * level and decides what to do. When the gate is closed (idle canvas with
 * no frame focus today), the bgView per-layer handlers continue to fire
 * unchanged. Phase 3 (demolition) will flip the gate to "always open in
 * canvas mode" and delete the bgView handlers.
 *
 * Hit-test runs purely in the renderer because the layout snapshot it
 * needs (entities, edges, selection, zoom) is already broadcast to
 * aboveView via `layout-update`. An IPC roundtrip per pointerdown adds
 * latency without benefit — see docs/divergence-input-authority.md.
 */

import { useEffect, useRef } from 'react'
import { hitTest, type HitInputs } from '../../shared/hit-test'
import {
  routePointerDown,
  type CanvasPointerAction,
  type CanvasPointerContext,
} from '../../shared/canvas-pointer-actions'
import { isOverlayUiTarget } from '../../shared/gesture-utils'
import type {
  CanvasBgElectronAPI,
  EdgeSide,
  LayoutUpdateData,
  SelectionModifiers,
} from '../../shared/types'

interface UseCanvasPointerRouterOptions {
  api: CanvasBgElectronAPI
  layoutRef: React.MutableRefObject<LayoutUpdateData>
  /** When false, the router does not intercept anything. Useful while
   *  annotations / drawing / region-select own pointer input. */
  enabled: boolean
  /** Hit kinds the router should consume. Other kinds fall through to the
   *  legacy aboveView pointer flow (existing useViewportForwarding hook).
   *  This lets us stage per-layer migration without a flag-day flip. */
  consume: ReadonlySet<CanvasPointerAction['kind']>
  /** Space-modifier state — already tracked by main but mirrored here so
   *  the router can short-circuit pan decisions without an IPC roundtrip. */
  spaceHeldRef: React.MutableRefObject<boolean>
}

const ALL_KINDS: ReadonlySet<CanvasPointerAction['kind']> = new Set<CanvasPointerAction['kind']>([
  'noop',
  'enter-frame-focus',
  'begin-entity-drag',
  'begin-group-drag',
  'begin-resize',
  'begin-edge-drag',
  'toggle-select',
  'background-click',
  'begin-marquee',
  'begin-pan',
])

/** Default consume set for incremental rollout — only the actions whose
 *  legacy bgView handlers have already been migrated. Frame-body focus
 *  enter is the safest first cut since it just programmatically focuses
 *  the page; bgView's existing focus event still works as a backup. */
export const DEFAULT_ROUTER_CONSUME: ReadonlySet<CanvasPointerAction['kind']> = new Set<CanvasPointerAction['kind']>([
  'enter-frame-focus',
])

export const FULL_ROUTER_CONSUME = ALL_KINDS

export function useCanvasPointerRouter(options: UseCanvasPointerRouterOptions): void {
  const { api, layoutRef, enabled, consume, spaceHeldRef } = options
  // Capture refs so the listener doesn't re-attach on every render.
  const apiRef = useRef(api)
  apiRef.current = api
  const consumeRef = useRef(consume)
  consumeRef.current = consume

  useEffect(() => {
    if (!enabled) return

    const handlePointerDown = (event: PointerEvent) => {
      // Don't intercept clicks targeted at floating UI rendered inside
      // aboveView (composers, popovers, FloatingUiLayer chrome).
      if (isOverlayUiTarget(event.target)) return
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return

      const layout = layoutRef.current
      if (layout.viewMode !== 'canvas') return

      // Translate aboveView-local clientY to window-local Y (scene entities
      // use window-relative screenY; aboveView origin sits at canvasOrigin.y).
      const windowY = event.clientY + layout.canvasOrigin.y
      const inputs: HitInputs = {
        entities: layout.entities,
        edges: layout.edges ?? [],
        selectedEntityIds: layout.selectedEntityIds,
        zoom: layout.zoom ?? 1,
      }
      const target = hitTest(inputs, { x: event.clientX, y: windowY })

      const modifiers: SelectionModifiers = {
        shift: event.shiftKey,
        meta: event.metaKey,
        ctrl: event.ctrlKey,
      }
      const context: CanvasPointerContext = {
        selectedEntityIds: layout.selectedEntityIds,
        frameFocused: layout.frameFocus !== null,
        isPrimaryButton: event.button === 0,
        modifiers,
        spaceHeld: spaceHeldRef.current,
      }

      const action = routePointerDown(target, context)
      if (!consumeRef.current.has(action.kind)) return

      const dispatched = dispatch(action, apiRef.current, event)
      if (dispatched) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true } as EventListenerOptions)
    }
  }, [enabled, layoutRef, spaceHeldRef])
}

/** Translate a CanvasPointerAction into IPC. Returns true if the action
 *  consumed the event; false means the caller should let it fall through. */
function dispatch(
  action: CanvasPointerAction,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
): boolean {
  switch (action.kind) {
    case 'noop':
      return false
    case 'enter-frame-focus':
      api.enterFrameFocus(action.entityId)
      return true
    case 'toggle-select':
      if (action.entityKind === 'frame') {
        api.selectFrame(action.entityId, { shift: true, meta: false, ctrl: false })
      } else if (action.entityKind === 'group') {
        api.selectGroup(action.entityId)
      } else {
        api.selectEntity(action.entityId, action.entityKind, { shift: true, meta: false, ctrl: false })
      }
      return true
    case 'begin-edge-drag':
      api.beginEdgeDrag(action.entityId, action.side as EdgeSide)
      // Edge drag continuation (target-change on move, commit/cancel on up)
      // is handled today by EdgeLayer.tsx's onMouseMove inside bgView. Leave
      // the move/up wiring to the existing path until the anchor layer is
      // fully migrated; this just begins the gesture from the new path.
      return true
    case 'begin-entity-drag':
      return beginEntityDrag(action, api, event)
    case 'begin-group-drag':
      return beginGroupDrag(action, api, event)
    case 'begin-resize':
    case 'begin-marquee':
    case 'background-click':
    case 'begin-pan':
      return false
  }
}

/**
 * Lifted from src/renderer/above-view/App.tsx onEntityPointerDown (non-additive,
 * non-group branch). Selects (unless preserving) and starts a drag with
 * window-level pointermove/pointerup forwarding deltas to main. Drag deltas
 * use screenX/screenY so trackpad fractional motion isn't lost.
 */
function beginEntityDrag(
  action: Extract<CanvasPointerAction, { kind: 'begin-entity-drag' }>,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
): boolean {
  if (!action.preserveSelection) {
    if (action.entityKind === 'frame') api.selectFrame(action.entityId)
    else api.selectEntity(action.entityId, action.entityKind)
  }
  if (action.entityKind === 'frame') api.startDragFrame(action.entityId)
  else api.startDragEntity(action.entityId)

  let lastScreenX = event.screenX
  let lastScreenY = event.screenY
  const onMove = (ev: MouseEvent) => {
    const dx = ev.screenX - lastScreenX
    const dy = ev.screenY - lastScreenY
    lastScreenX = ev.screenX
    lastScreenY = ev.screenY
    if (dx === 0 && dy === 0) return
    if (action.entityKind === 'frame') api.dragFrame(action.entityId, dx, dy)
    else api.dragEntity(action.entityId, dx, dy)
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('blur', onUp)
    if (action.entityKind === 'frame') api.endDragFrame()
    else api.endDragEntity()
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('blur', onUp)
  return true
}

/**
 * Lifted from src/renderer/above-view/App.tsx onEntityPointerDown (group
 * branch). Mirrors the GROUP_DRAG_THRESHOLD click-vs-drag heuristic: under
 * threshold, select the click target; over threshold, treat as group drag.
 */
const GROUP_DRAG_THRESHOLD = 4

function beginGroupDrag(
  action: Extract<CanvasPointerAction, { kind: 'begin-group-drag' }>,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
): boolean {
  let dragging = false
  let lastScreenX = event.screenX
  let lastScreenY = event.screenY
  const startScreenX = event.screenX
  const startScreenY = event.screenY

  const onMove = (ev: MouseEvent) => {
    const totalDx = ev.screenX - startScreenX
    const totalDy = ev.screenY - startScreenY
    if (
      !dragging &&
      Math.abs(totalDx) < GROUP_DRAG_THRESHOLD &&
      Math.abs(totalDy) < GROUP_DRAG_THRESHOLD
    ) {
      return
    }
    if (!dragging) {
      dragging = true
      api.startDragGroup(action.groupId)
    }
    const dx = ev.screenX - lastScreenX
    const dy = ev.screenY - lastScreenY
    lastScreenX = ev.screenX
    lastScreenY = ev.screenY
    if (dx !== 0 || dy !== 0) api.dragGroup(action.groupId, dx, dy)
  }
  const cleanup = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('blur', onCancel)
  }
  const onUp = () => {
    cleanup()
    if (dragging) {
      api.endDragGroup()
      return
    }
    api.selectGroup(action.groupId)
  }
  const onCancel = () => {
    cleanup()
    if (dragging) api.endDragGroup()
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('blur', onCancel)
  return true
}
