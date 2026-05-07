/**
 * Canvas pointer router — single source of arbitration for canvas pointer
 * input in canvas mode (ADR 0001).
 *
 * Runs the shared `hitTest` against the current layout snapshot on
 * pointerdown and dispatches a typed `CanvasPointerAction` to the existing
 * IPC surface. Replaces the per-layer `onMouseDown` handlers that used to
 * live in bgView (`FrameChromeLayer`, `EdgeLayer`, `ResizeHandles`,
 * `EntityBlockLayers`, `GroupBoundsLayer`, and the old mouse gesture hooks).
 *
 * The router runs entirely in the renderer because the layout snapshot it
 * needs (entities, edges, selection, zoom) is already broadcast to
 * aboveView via `layout-update`. Pure modules carry the logic:
 *
 *   - `src/shared/hit-test.ts` — priority-ordered hit classification.
 *   - `src/shared/canvas-pointer-actions.ts` — action descriptor.
 *   - `src/shared/edge-drag-controller.ts` — edge-drag state machine.
 *   - `src/shared/resize-accumulator.ts` — resize math.
 *
 * The router itself owns only the wiring: window-level pointer listeners,
 * per-action drag-installation, IPC dispatch, and renderer-local visual
 * state for the edge-drag rubber-band.
 */

import { useEffect, useRef } from 'react'
import { hitTest, type HitInputs } from '../../shared/hit-test'
import {
  routePointerDoubleClick,
  routePointerDown,
  type CanvasPointerAction,
  type CanvasPointerContext,
} from '../../shared/canvas-pointer-actions'
import {
  beginEdgeDrag as beginEdgeDragState,
  cancelEdgeDrag as cancelEdgeDragState,
  commitEdgeDrag as commitEdgeDragState,
  EDGE_DRAG_IDLE,
  updateEdgeDragCursor,
  type EdgeDragState,
} from '../../shared/edge-drag-controller'
import {
  applyHandleDelta,
  startResize,
  type AspectRatioResizeMode,
  type ResizeConfig,
} from '../../shared/resize-accumulator'
import {
  entitiesOverlappingRect,
  isOverlayUiTarget,
  normalizeRect,
  screenRectToCanvasRect,
} from '../../shared/gesture-utils'
import { aspectRatioResizeModeForCanvasFile } from '../canvas-bg/entityConstants'
import {
  MIN_FILE_HEIGHT,
  MIN_FILE_WIDTH,
  MIN_GROUP_HEIGHT,
  MIN_GROUP_WIDTH,
  MIN_SHAPE_HEIGHT,
  MIN_SHAPE_WIDTH,
  MIN_TEXT_HEIGHT,
  MIN_TEXT_WIDTH,
} from '../canvas-bg/entityConstants'
import { TOOLBAR_HEIGHT } from '../../shared/constants'
import type {
  CanvasBgElectronAPI,
  CanvasSceneEntity,
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
  /** Hit kinds the router should consume. */
  consume: ReadonlySet<CanvasPointerAction['kind']>
  /** Space-modifier mirror — `useCanvasPointerRouter` reads this on each
   *  pointerdown to decide pan-on-background. */
  spaceHeldRef: React.MutableRefObject<boolean>
  /** Edge-drag visual state setter. The router updates this so
   *  `EdgeDragLayer` can render the rubber-band. */
  setEdgeDragState: (state: EdgeDragState) => void
}

const ALL_KINDS: ReadonlySet<CanvasPointerAction['kind']> = new Set<CanvasPointerAction['kind']>([
  'noop',
  'frame-body-press',
  'forward-pointer-down',
  'begin-entity-drag',
  'begin-group-drag',
  'begin-resize',
  'begin-edge-drag',
  'toggle-select',
  'background-click',
  'begin-marquee',
  'begin-pan',
])

/** All routable kinds — used by tests and any caller that wants full
 *  router authority. Production aboveView passes this, making the router
 *  the canvas-mode authority for selection, drag, resize, marquee, pan,
 *  and edge gestures. */
export const FULL_ROUTER_CONSUME = ALL_KINDS

const GROUP_DRAG_THRESHOLD = 4
const MARQUEE_DRAG_THRESHOLD = 4
const FRAME_BODY_DRAG_THRESHOLD = 4

let pointerAttemptCounter = 0

function capturePointer(event: PointerEvent): (() => void) | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  try {
    target.setPointerCapture(event.pointerId)
  } catch {
    return null
  }
  return () => {
    try {
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* ignore */
    }
  }
}

export function useCanvasPointerRouter(options: UseCanvasPointerRouterOptions): void {
  const { api, layoutRef, enabled, consume, spaceHeldRef, setEdgeDragState } = options
  const apiRef = useRef(api)
  apiRef.current = api
  const consumeRef = useRef(consume)
  consumeRef.current = consume
  const setEdgeDragStateRef = useRef(setEdgeDragState)
  setEdgeDragStateRef.current = setEdgeDragState

  useEffect(() => {
    if (!enabled) return

    const handlePointerDown = (event: PointerEvent) => {
      if (isOverlayUiTarget(event.target)) {
        console.warn(`[attempt ?] pointerdown SKIPPED — overlay UI target`, {
          target: (event.target instanceof Element) ? event.target.tagName : null,
        })
        return
      }
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return

      const layout = layoutRef.current
      if (layout.viewMode !== 'canvas') return

      const attemptId = ++pointerAttemptCounter

      // aboveView's WCV starts at canvasOrigin.y; scene entities use
      // window-relative screenY, so add the offset before hit-testing.
      const windowY = event.clientY + layout.canvasOrigin.y
      const inputs: HitInputs = {
        entities: layout.entities,
        edges: layout.edges ?? [],
        selectedEntityIds: layout.selectedEntityIds,
        selectedGroupId: layout.selectedGroupId ?? null,
        hoveredEntityId: layout.hover?.id ?? null,
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
        isPrimaryButton: event.button === 0,
        button: event.button === 1 ? 'middle' : event.button === 2 ? 'right' : 'left',
        modifiers,
        spaceHeld: spaceHeldRef.current,
      }

      const action = routePointerDown(target, context)
      console.warn(`[attempt #${attemptId}] pointerdown`, {
        target: target.payload,
        action: action.kind,
        cursor: { x: event.clientX, y: windowY },
        selected: layout.selectedEntityIds,
        keyboardTarget: layout.keyboardTargetFrameId,
        interaction: layout.interaction.kind,
      })
      if (!consumeRef.current.has(action.kind)) {
        console.warn(`[attempt #${attemptId}] NOT CONSUMED — action=${action.kind} not in consume set`)
        return
      }

      const dispatched = dispatchAction({
        action,
        api: apiRef.current,
        event,
        layoutRef,
        setEdgeDragState: setEdgeDragStateRef.current,
        attemptId,
      })
      if (dispatched) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        console.warn(`[attempt #${attemptId}] dispatchAction returned false`, { action: action.kind })
      }
    }

    const handleDblClick = (event: MouseEvent) => {
      if (isOverlayUiTarget(event.target)) return
      if (event.button !== 0) return
      const layout = layoutRef.current
      if (layout.viewMode !== 'canvas') return
      const windowY = event.clientY + layout.canvasOrigin.y
      const target = hitTest(
        {
          entities: layout.entities,
          edges: layout.edges ?? [],
          selectedEntityIds: layout.selectedEntityIds,
          selectedGroupId: layout.selectedGroupId ?? null,
          hoveredEntityId: layout.hover?.id ?? null,
          zoom: layout.zoom ?? 1,
        },
        { x: event.clientX, y: windowY },
      )
      const action = routePointerDoubleClick(target)
      switch (action.kind) {
        case 'noop':
          return
        case 'enter-shape-edit':
          apiRef.current.requestShapeEdit(action.entityId)
          break
        case 'enter-group':
          apiRef.current.enterGroup(action.groupId)
          break
        case 'enter-group-rename':
          // GroupRenameLabel handles the dblclick directly via the DOM
          // (it's tagged data-overlay-ui so isOverlayUiTarget catches it
          // earlier — this branch only fires if the rename label is hit
          // through the chrome slot via hit-test).
          return
        case 'request-text-edit':
          apiRef.current.requestTextEdit(action.entityId)
          break
      }
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    window.addEventListener('dblclick', handleDblClick, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, {
        capture: true,
      } as EventListenerOptions)
      window.removeEventListener('dblclick', handleDblClick, {
        capture: true,
      } as EventListenerOptions)
    }
  }, [enabled, layoutRef, spaceHeldRef])
}

// --- Dispatch ---

interface DispatchContext {
  action: CanvasPointerAction
  api: CanvasBgElectronAPI
  event: PointerEvent
  layoutRef: React.MutableRefObject<LayoutUpdateData>
  setEdgeDragState: (state: EdgeDragState) => void
  attemptId: number
}

function dispatchAction(ctx: DispatchContext): boolean {
  const { action, api, event, layoutRef, setEdgeDragState, attemptId } = ctx
  switch (action.kind) {
    case 'noop':
      return false
    case 'frame-body-press':
      return runFrameBodyPress(action, api, event, attemptId)
    case 'forward-pointer-down':
      return runForwardPointer(action, api, event, layoutRef)
    case 'toggle-select':
      if (action.entityKind === 'frame') {
        api.selectFrame(action.entityId, { shift: true, meta: false, ctrl: false })
      } else if (action.entityKind === 'group') {
        api.selectGroup(action.entityId)
      } else {
        api.selectEntity(action.entityId, action.entityKind, {
          shift: true,
          meta: false,
          ctrl: false,
        })
      }
      return true
    case 'background-click':
      return runBackgroundSelectionGesture(api, event, layoutRef)
    case 'begin-entity-drag':
      return runEntityDrag(action, api, event, attemptId)
    case 'begin-group-drag':
      return runGroupDrag(action, api, event)
    case 'begin-resize':
      return runResize(action, api, event, layoutRef)
    case 'begin-edge-drag':
      return runEdgeDrag(action, api, event, layoutRef, setEdgeDragState)
    case 'begin-marquee':
      return runBackgroundSelectionGesture(api, event, layoutRef)
    case 'begin-pan':
      return runPan(api, event)
  }
}

// --- Per-action handlers ---

function runEntityDrag(
  action: Extract<CanvasPointerAction, { kind: 'begin-entity-drag' }>,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
  attemptId: number,
): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  const selection = {
    entityKind: action.entityKind,
    preserveSelection: action.preserveSelection,
  }
  console.warn(`[attempt #${attemptId}] runEntityDrag start (no threshold)`, {
    entityId: action.entityId.slice(0, 16),
    entityKind: action.entityKind,
    preserveSelection: action.preserveSelection,
    pointerId,
  })
  if (action.entityKind === 'frame') api.startDragFrame(action.entityId, selection)
  else api.startDragEntity(action.entityId, selection)

  let lastScreenX = event.screenX
  let lastScreenY = event.screenY
  let moveCount = 0
  const cleanup = () => {
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  }
  const finish = (reason: string) => {
    console.warn(
      `[attempt #${attemptId}] runEntityDrag finish reason=${reason} moveCount=${moveCount} entity=${action.entityId.slice(0, 16)}`,
    )
    cleanup()
    if (action.entityKind === 'frame') api.endDragFrame()
    else api.endDragEntity()
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const dx = ev.screenX - lastScreenX
    const dy = ev.screenY - lastScreenY
    lastScreenX = ev.screenX
    lastScreenY = ev.screenY
    if (dx === 0 && dy === 0) return
    moveCount += 1
    if (action.entityKind === 'frame') api.dragFrame(action.entityId, dx, dy)
    else api.dragEntity(action.entityId, dx, dy)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    finish('pointerup')
  }
  const onCancel = (ev: Event) => finish(`cancel(${ev.type})`)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  return true
}

function runFrameBodyPress(
  action: Extract<CanvasPointerAction, { kind: 'frame-body-press' }>,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
  attemptId: number,
): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  const startScreenX = event.screenX
  const startScreenY = event.screenY
  let lastScreenX = event.screenX
  let lastScreenY = event.screenY
  let dragging = false
  let moveCount = 0

  console.warn(`[attempt #${attemptId}] runFrameBodyPress armed (waiting for threshold)`, {
    entityId: action.entityId.slice(0, 16),
    pointerId,
  })

  const cleanup = () => {
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  }

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const totalDx = ev.screenX - startScreenX
    const totalDy = ev.screenY - startScreenY
    if (
      !dragging &&
      Math.abs(totalDx) < FRAME_BODY_DRAG_THRESHOLD &&
      Math.abs(totalDy) < FRAME_BODY_DRAG_THRESHOLD
    ) {
      return
    }
    if (!dragging) {
      console.warn(`[attempt #${attemptId}] runFrameBodyPress threshold crossed → startDragFrame`, {
        entityId: action.entityId.slice(0, 16),
        totalDx,
        totalDy,
      })
      dragging = true
      api.startDragFrame(action.entityId, {
        entityKind: 'frame',
        preserveSelection: action.preserveSelection,
      })
    }
    const dx = ev.screenX - lastScreenX
    const dy = ev.screenY - lastScreenY
    lastScreenX = ev.screenX
    lastScreenY = ev.screenY
    if (dx !== 0 || dy !== 0) {
      moveCount += 1
      api.dragFrame(action.entityId, dx, dy)
    }
  }

  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    console.warn(`[attempt #${attemptId}] runFrameBodyPress up`, {
      entityId: action.entityId.slice(0, 16),
      dragging,
      moveCount,
    })
    cleanup()
    if (dragging) {
      api.endDragFrame()
      return
    }
    api.selectFrame(action.entityId, { shift: false, meta: false, ctrl: false })
  }

  const onCancel = (ev: Event) => {
    // Pre-threshold blur is a phantom: after a previous drag ends,
    // focus reconciliation routes focus from aboveView → bgView on the
    // next layout pass (debounced 16ms). If the user clicks again
    // inside that window, this listener installs first, then the
    // pending reconcile fires and blurs aboveView before any cursor
    // movement. Tearing the armed gesture down here kills the second
    // drag with no recovery. Wait for actual movement instead;
    // pointerup / pointercancel still abort cleanly.
    if (!dragging && ev.type === 'blur') {
      console.warn(
        `[attempt #${attemptId}] runFrameBodyPress IGNORED blur (pre-threshold; gesture stays armed) entity=${action.entityId.slice(0, 16)}`,
      )
      return
    }
    console.warn(
      `[attempt #${attemptId}] runFrameBodyPress cancel reason=${ev.type} dragging=${dragging} moveCount=${moveCount} entity=${action.entityId.slice(0, 16)}`,
    )
    cleanup()
    if (dragging) api.endDragFrame()
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  return true
}

function runGroupDrag(
  action: Extract<CanvasPointerAction, { kind: 'begin-group-drag' }>,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  let dragging = false
  let lastScreenX = event.screenX
  let lastScreenY = event.screenY
  const startScreenX = event.screenX
  const startScreenY = event.screenY

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
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
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
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
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  return true
}

function runResize(
  action: Extract<CanvasPointerAction, { kind: 'begin-resize' }>,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
  layoutRef: React.MutableRefObject<LayoutUpdateData>,
): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  const layout = layoutRef.current
  const entity = layout.entities.find((e) => e.id === action.entityId)
  if (!entity) return false
  const config = resizeConfigForEntity(entity)
  const acc = startResize({
    width: entity.width,
    height: entity.height,
    canvasX: entity.canvasX,
    canvasY: entity.canvasY,
  })
  const zoom = layout.zoom ?? 1
  const dispatchPatch = patchDispatcherForKind(entity.kind, action.entityId, api)
  if (!dispatchPatch) return false

  let lastX = event.screenX
  let lastY = event.screenY
  const cleanup = () => {
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const screenDx = ev.screenX - lastX
    const screenDy = ev.screenY - lastY
    lastX = ev.screenX
    lastY = ev.screenY
    const patch = applyHandleDelta(
      acc,
      action.handle,
      { screenDx, screenDy, zoom, shiftKey: ev.shiftKey },
      config,
    )
    dispatchPatch(patch)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    cleanup()
  }
  const onCancel = () => cleanup()
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  return true
}

function runEdgeDrag(
  action: Extract<CanvasPointerAction, { kind: 'begin-edge-drag' }>,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
  layoutRef: React.MutableRefObject<LayoutUpdateData>,
  setEdgeDragState: (state: EdgeDragState) => void,
): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  const layout = layoutRef.current
  const windowY = event.clientY + layout.canvasOrigin.y
  const entityMap = new Map<string, CanvasSceneEntity>()
  for (const e of layout.entities) entityMap.set(e.id, e)
  let state = beginEdgeDragState(
    action.entityId,
    action.side as EdgeSide,
    event.clientX,
    windowY,
    layout.edges ?? [],
    entityMap,
  )
  setEdgeDragState(state)

  // Tell main about the gesture begin so its interaction-controller is in
  // the right mode — this is what `EdgeLayer.tsx` used to call.
  const dragOriginEntityId =
    state.kind === 'edit' ? state.fixedEntityId : action.entityId
  const dragOriginSide =
    state.kind === 'edit' ? state.fixedSide : (action.side as EdgeSide)
  api.beginEdgeDrag(dragOriginEntityId, dragOriginSide)

  let lastSnap: string | null = null
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const cur = layoutRef.current
    const snapMap = new Map<string, CanvasSceneEntity>()
    for (const e of cur.entities) snapMap.set(e.id, e)
    const winY = ev.clientY + cur.canvasOrigin.y
    state = updateEdgeDragCursor(state, ev.clientX, winY, snapMap, cur.zoom ?? 1)
    setEdgeDragState(state)
    const snapKey = state.kind !== 'idle' && state.snap
      ? `${state.snap.entityId}:${state.snap.side}`
      : null
    if (snapKey !== lastSnap) {
      lastSnap = snapKey
      const target =
        state.kind !== 'idle' && state.snap
          ? { entityId: state.snap.entityId, side: state.snap.side }
          : null
      api.updateEdgeDragTarget(target?.entityId ?? null, target?.side ?? null)
    }
  }

  const finish = (mode: 'commit' | 'cancel') => {
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
    const outcome =
      mode === 'commit' ? commitEdgeDragState(state) : cancelEdgeDragState(state)
    switch (outcome.kind) {
      case 'create-edge':
        api.commitEdgeDrag(
          outcome.fromEntityId,
          outcome.toEntityId,
          outcome.fromSide,
          outcome.toSide,
        )
        break
      case 'edit-edge':
        api.commitEdgeEdit(
          outcome.edgeId,
          outcome.movingEnd,
          outcome.targetEntityId,
          outcome.targetSide,
        )
        break
      case 'discard-edge':
        api.discardEdgeEdit(outcome.edgeId)
        break
      case 'noop':
        api.cancelEdgeDrag()
        break
    }
    api.updateEdgeDragTarget(null, null)
    setEdgeDragState(EDGE_DRAG_IDLE)
  }

  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    finish('commit')
  }
  const onCancel = () => finish('cancel')
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  return true
}

/**
 * Background drag → marquee.
 */
function runBackgroundSelectionGesture(
  api: CanvasBgElectronAPI,
  event: PointerEvent,
  layoutRef: React.MutableRefObject<LayoutUpdateData>,
): boolean {
  const startClientX = event.clientX
  const startClientY = event.clientY
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  let dragged = false

  const cleanup = () => {
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  }

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    if (!dragged) {
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      if (Math.abs(dx) < MARQUEE_DRAG_THRESHOLD && Math.abs(dy) < MARQUEE_DRAG_THRESHOLD) return
      dragged = true
    }
    const layout = layoutRef.current
    const rect = normalizeRect(startClientX, startClientY, ev.clientX, ev.clientY)
    const windowRect = {
      left: rect.left,
      top: rect.top + layout.canvasOrigin.y,
      width: rect.width,
      height: rect.height,
    }
    const entityIds = entitiesOverlappingRect(layout.entities, windowRect)
    api.setSelectionOverlayRect({
      rect: {
        ...rect,
        top: rect.top + (layout.canvasOrigin.y - TOOLBAR_HEIGHT),
      },
      variant: 'default',
      entityIds,
    })
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    cleanup()
    api.setSelectionOverlayRect(null)
    const layout = layoutRef.current
    const modifiers: SelectionModifiers = {
      shift: ev.shiftKey,
      meta: ev.metaKey,
      ctrl: ev.ctrlKey,
    }
    if (!dragged) {
      api.canvasDeselect(modifiers)
      return
    }
    const rect = normalizeRect(startClientX, startClientY, ev.clientX, ev.clientY)
    if (rect.width < 4 || rect.height < 4) {
      api.canvasDeselect(modifiers)
      return
    }
    const windowRect = { ...rect, top: rect.top + layout.canvasOrigin.y }
    api.canvasSelectInRect(screenRectToCanvasRect(windowRect, layout), modifiers)
  }
  const onCancel = () => {
    cleanup()
    api.setSelectionOverlayRect(null)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  return true
}

function runForwardPointer(
  action: Extract<CanvasPointerAction, { kind: 'forward-pointer-down' }>,
  api: CanvasBgElectronAPI,
  event: PointerEvent,
  layoutRef: React.MutableRefObject<LayoutUpdateData>,
): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  const { entityId, button } = action
  let lastWindowX = event.clientX
  let lastWindowY = event.clientY + layoutRef.current.canvasOrigin.y
  api.forwardPointerToFrame(entityId, {
    kind: 'down',
    windowX: lastWindowX,
    windowY: lastWindowY,
    button,
    clickCount: event.detail || 1,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  })

  // Important: do NOT register a window `blur` listener here. Forwarding
  // `mouseDown` causes the focus-reconciler to move webContents focus to the
  // target page, which fires `blur` on aboveView. If we treated that as a
  // cancel, we'd tear down the gesture before `pointerup` arrives — leaving
  // the page stuck with a phantom mouseDown and the next click looking like
  // a release+drag rather than a fresh click.
  const cleanup = () => {
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    lastWindowX = ev.clientX
    lastWindowY = ev.clientY + layoutRef.current.canvasOrigin.y
    api.forwardPointerToFrame(entityId, {
      kind: 'move',
      windowX: lastWindowX,
      windowY: lastWindowY,
      button,
      shiftKey: ev.shiftKey,
      ctrlKey: ev.ctrlKey,
      altKey: ev.altKey,
      metaKey: ev.metaKey,
    })
  }
  const sendUp = (ev: PointerEvent | null) => {
    const winX = ev ? ev.clientX : lastWindowX
    const winY = ev ? ev.clientY + layoutRef.current.canvasOrigin.y : lastWindowY
    api.forwardPointerToFrame(entityId, {
      kind: 'up',
      windowX: winX,
      windowY: winY,
      button,
      clickCount: ev?.detail || 1,
      shiftKey: ev?.shiftKey ?? false,
      ctrlKey: ev?.ctrlKey ?? false,
      altKey: ev?.altKey ?? false,
      metaKey: ev?.metaKey ?? false,
    })
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    cleanup()
    sendUp(ev)
  }
  const onCancel = () => {
    cleanup()
    // Always release the page's mouseDown state so a canceled gesture
    // doesn't leak a stuck button.
    sendUp(null)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  return true
}

function runPan(api: CanvasBgElectronAPI, event: PointerEvent): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  let lastScreenX = event.screenX
  let lastScreenY = event.screenY
  const cleanup = () => {
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const dx = ev.screenX - lastScreenX
    const dy = ev.screenY - lastScreenY
    lastScreenX = ev.screenX
    lastScreenY = ev.screenY
    if (dx !== 0 || dy !== 0) api.canvasPan(dx, dy)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    cleanup()
  }
  const onCancel = () => cleanup()
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  return true
}

// --- Per-kind helpers ---

function resizeConfigForEntity(entity: CanvasSceneEntity): ResizeConfig {
  switch (entity.kind) {
    case 'frame':
      return { minWidth: 320, minHeight: 200, aspectRatioResizeMode: 'off' }
    case 'group':
      return {
        minWidth: MIN_GROUP_WIDTH,
        minHeight: MIN_GROUP_HEIGHT,
        aspectRatioResizeMode: 'off',
      }
    case 'text':
      return {
        minWidth: MIN_TEXT_WIDTH,
        minHeight: MIN_TEXT_HEIGHT,
        aspectRatioResizeMode: 'off',
      }
    case 'file': {
      const aspect: AspectRatioResizeMode =
        'file' in entity && typeof entity.file === 'string'
          ? aspectRatioResizeModeForCanvasFile(entity.file)
          : 'off'
      return { minWidth: MIN_FILE_WIDTH, minHeight: MIN_FILE_HEIGHT, aspectRatioResizeMode: aspect }
    }
    case 'shape':
      return {
        minWidth: MIN_SHAPE_WIDTH,
        minHeight: MIN_SHAPE_HEIGHT,
        aspectRatioResizeMode: 'shift-locks',
      }
    case 'drawing':
      return { minWidth: 16, minHeight: 16, aspectRatioResizeMode: 'off' }
  }
}

function patchDispatcherForKind(
  kind: CanvasSceneEntity['kind'],
  id: string,
  api: CanvasBgElectronAPI,
): ((patch: { width: number; height: number; canvasX?: number; canvasY?: number }) => void) | null {
  switch (kind) {
    case 'frame':
      return (patch) => api.updateFrameBounds(id, patch)
    case 'group':
      return (patch) => api.updateGroupEntity(id, patch)
    case 'text':
      return (patch) => api.updateTextEntity(id, patch)
    case 'file':
      return (patch) => api.updateFileEntity(id, patch)
    case 'shape':
      return (patch) => api.updateShapeEntity(id, patch)
    case 'drawing':
      return (patch) => api.updateDrawingEntity(id, patch)
    default:
      return null
  }
}
