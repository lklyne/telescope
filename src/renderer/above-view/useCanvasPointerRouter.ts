/**
 * Canvas pointer router — single source of arbitration for canvas pointer
 * input in canvas mode (ADR 0001).
 *
 * Runs the shared `hitTest` against the current layout snapshot on
 * pointerdown and dispatches a typed `CanvasPointerAction` to the existing
 * IPC surface. Replaces the per-layer `onMouseDown` handlers that used to
 * live in bgView (`FrameChromeLayer`, `EdgeLayer`, `ResizeHandles`,
 * `EntityBlockLayers`, `GroupBoundsLayer`, `useFrameChromeDrag`,
 * `useGroupBoundsDrag`, `useEntityResize`, `useMultiSelectionResize`).
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
import { isOverlayUiTarget, normalizeRect, screenRectToCanvasRect } from '../../shared/gesture-utils'
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
  'enter-frame-focus',
  'frame-body-press',
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
 *  router authority once the bgView interactive surfaces (chrome buttons,
 *  group rename label, inline edit triggers, etc.) have been migrated. */
export const FULL_ROUTER_CONSUME = ALL_KINDS

/**
 * Default consume set: only `enter-frame-focus`. The router intercepts
 * pointerdown only when the gate is already open (active gestures, tool
 * modes, marquee). In those cases the legacy aboveView handlers
 * (`useViewportForwarding`) keep firing for the gestures they own; the
 * router's job today is to add the priority-ordered hit-test arbitration
 * layer (#41 fix) and to handle frame-body → focus promotion when the
 * gate happens to be open. Per-action consume expansion + the
 * gate-default-open flip are tracked in
 * `docs/divergence-input-authority.md`.
 */
export const DEFAULT_ROUTER_CONSUME: ReadonlySet<CanvasPointerAction['kind']> =
  new Set<CanvasPointerAction['kind']>(['enter-frame-focus'])

const GROUP_DRAG_THRESHOLD = 4
const MARQUEE_DRAG_THRESHOLD = 4
const FRAME_BODY_DRAG_THRESHOLD = 4

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
      if (isOverlayUiTarget(event.target)) return
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return

      const layout = layoutRef.current
      if (layout.viewMode !== 'canvas') return

      // aboveView's WCV starts at canvasOrigin.y; scene entities use
      // window-relative screenY, so add the offset before hit-testing.
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

      const dispatched = dispatchAction({
        action,
        api: apiRef.current,
        event,
        layoutRef,
        setEdgeDragState: setEdgeDragStateRef.current,
      })
      if (dispatched) {
        event.preventDefault()
        event.stopPropagation()
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
}

function dispatchAction(ctx: DispatchContext): boolean {
  const { action, api, event, layoutRef, setEdgeDragState } = ctx
  switch (action.kind) {
    case 'noop':
      return false
    case 'enter-frame-focus':
      api.enterFrameFocus(action.entityId)
      return true
    case 'frame-body-press':
      return runFrameBodyPress(action, api, event)
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
      return runEntityDrag(action, api, event)
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
): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  if (!action.preserveSelection) {
    if (action.entityKind === 'frame') api.selectFrame(action.entityId)
    else api.selectEntity(action.entityId, action.entityKind)
  }
  if (action.entityKind === 'frame') api.startDragFrame(action.entityId)
  else api.startDragEntity(action.entityId)

  let lastScreenX = event.screenX
  let lastScreenY = event.screenY
  const cleanup = () => {
    releasePointer?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  }
  const finish = () => {
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
    if (action.entityKind === 'frame') api.dragFrame(action.entityId, dx, dy)
    else api.dragEntity(action.entityId, dx, dy)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    finish()
  }
  const onCancel = () => finish()
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
): boolean {
  const pointerId = event.pointerId
  const releasePointer = capturePointer(event)
  const startScreenX = event.screenX
  const startScreenY = event.screenY
  let lastScreenX = event.screenX
  let lastScreenY = event.screenY
  let dragging = false

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
      dragging = true
      if (!action.preserveSelection) api.selectFrame(action.entityId)
      api.startDragFrame(action.entityId)
    }
    const dx = ev.screenX - lastScreenX
    const dy = ev.screenY - lastScreenY
    lastScreenX = ev.screenX
    lastScreenY = ev.screenY
    if (dx !== 0 || dy !== 0) api.dragFrame(action.entityId, dx, dy)
  }

  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    cleanup()
    if (dragging) {
      api.endDragFrame()
      return
    }
    api.enterFrameFocus(action.entityId)
  }

  const onCancel = () => {
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
 * Background drag → marquee. Ports `App.tsx onMarqueeMove`/`onMarqueeEnd`
 * so the gesture works without depending on `hasSavedDrawings` to enable
 * the legacy `useViewportForwarding` path.
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
    api.setSelectionOverlayRect({
      rect: {
        ...rect,
        top: rect.top + (layout.canvasOrigin.y - TOOLBAR_HEIGHT),
      },
      variant: 'default',
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
