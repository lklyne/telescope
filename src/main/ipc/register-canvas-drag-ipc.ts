import { ipcMain } from 'electron'
import type { CanvasDragStartSelection, CanvasHoverTarget } from '../../shared/types'
import { pages } from '../runtime/page-runtime'
import {
  applyDragDelta,
  finalizeDrag,
  initializeDrag,
} from '../runtime/document-commands'
import {
  getSelectedEntityIds,
  selectPage,
  setSelectedEntities,
} from '../runtime/ui-actions'
import {
  updateEdgeDragTarget,
  currentInteractionState,
} from '../runtime/interaction-state'
import { tryEnter, commitActive, cancelActive } from '../runtime/interaction-controller'
import { setHoverEntity } from '../runtime/runtime-core'
import type { EdgeSide } from '../../shared/types'
import {
  canvasOrigin,
  layoutAllViews,
  pan,
  requestLayout,
  setPan,
  setZoom,
  win,
  zoom,
} from '../runtime/surface-layout'
import { setSelectionOverlayRect } from '../runtime/window-shell'
import {
  resolveEntityKind,
  selectEntity as selectCanvasEntity,
  selectNone,
  selectPageById as selectCanvasPageById,
  selectedDragEntityIds,
} from '../runtime/selection-controller'
import { createEdges } from '../workspace-edges'
import { deleteEdge, updateEdge } from '../runtime/document-commands'
import {
  copyableFramePayload,
  copyableSelectionPayload,
  pasteEntitiesFromClipboard,
  pasteFramesFromClipboard,
} from '../workspace-clipboard'
import { descendantEntityIdsForGroup } from '../runtime/group-descendants'

const VIEWPORT_EVENT_FRAME_MS = 16

let pendingViewportDelta = {
  zoomDeltaY: 0,
  panDeltaX: 0,
  panDeltaY: 0,
  mouseX: null as number | null,
  mouseY: null as number | null,
}
let pendingViewportTimer: NodeJS.Timeout | null = null

function flushViewportDelta(): void {
  pendingViewportTimer = null

  const { zoomDeltaY, panDeltaX, panDeltaY, mouseX, mouseY } =
    pendingViewportDelta
  pendingViewportDelta = {
    zoomDeltaY: 0,
    panDeltaX: 0,
    panDeltaY: 0,
    mouseX: null,
    mouseY: null,
  }

  if (zoomDeltaY !== 0) {
    const oldZoom = zoom
    setZoom(zoom - zoomDeltaY * 0.002)
    const newZoom = zoom

    if (win && mouseX !== null && mouseY !== null) {
      const contentBounds = win.getContentBounds()
      const mouseClientX = mouseX - contentBounds.x
      const mouseClientY = mouseY - contentBounds.y
      const origin = canvasOrigin()
      const viewportMouseX = mouseClientX - origin.x
      const viewportMouseY = mouseClientY - origin.y
      const canvasX = (viewportMouseX - pan.x) / oldZoom
      const canvasY = (viewportMouseY - pan.y) / oldZoom

      setPan(
        viewportMouseX - canvasX * newZoom,
        viewportMouseY - canvasY * newZoom,
      )
    }
  }

  if (panDeltaX !== 0 || panDeltaY !== 0) {
    setPan(pan.x + panDeltaX, pan.y + panDeltaY)
  }

  requestLayout()
}

function scheduleViewportDelta(): void {
  if (pendingViewportTimer) return
  pendingViewportTimer = setTimeout(flushViewportDelta, VIEWPORT_EVENT_FRAME_MS)
}

function resolveDraggedFrameIds(frameId: string): string[] {
  return selectedDragEntityIds(frameId)
}

function resolveDraggedEntityIds(entityId: string): string[] {
  return selectedDragEntityIds(entityId)
}

let activeDragSession: {
  kind: 'frame' | 'entity' | 'group'
  ids: string[]
} | null = null

function applyDragStartSelection(
  entityId: string,
  selection: CanvasDragStartSelection | undefined,
): void {
  if (!selection || selection.preserveSelection) return
  if (selection.entityKind === 'frame') {
    selectCanvasPageById(entityId, { clearInteraction: false })
    return
  }
  selectCanvasEntity(entityId, selection.entityKind, { clearInteraction: false })
}

function beginDragSession(
  kind: 'frame' | 'entity' | 'group',
  entityIds: string[],
): boolean {
  if (!entityIds.length) return false
  if (activeDragSession && currentInteractionState().kind === 'idle') {
    activeDragSession = null
  }
  if (activeDragSession) return false
  const token = tryEnter({ kind: 'dragging-entities', entityIds })
  if ('refused' in token) return false
  activeDragSession = { kind, ids: [...entityIds] }
  initializeDrag(entityIds)
  return true
}

function activeDragIds(
  kind: 'frame' | 'entity' | 'group',
  anchorId: string,
): string[] | null {
  if (!activeDragSession || activeDragSession.kind !== kind) return null
  if (!activeDragSession.ids.includes(anchorId)) return null
  return activeDragSession.ids
}

function endDragSession(kind: 'frame' | 'entity' | 'group'): void {
  if (!activeDragSession || activeDragSession.kind !== kind) return
  activeDragSession = null
  finalizeDrag()
  commitActive()
}

export function registerCanvasDragIpc(): void {
  ipcMain.on(
    'canvas-zoom',
    (_event, data: { deltaY: number; mouseX: number; mouseY: number }) => {
      pendingViewportDelta.zoomDeltaY += data.deltaY
      pendingViewportDelta.mouseX = data.mouseX
      pendingViewportDelta.mouseY = data.mouseY
      scheduleViewportDelta()
    },
  )

  ipcMain.on('canvas-pan', (_event, { deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
    pendingViewportDelta.panDeltaX -= deltaX
    pendingViewportDelta.panDeltaY -= deltaY
    scheduleViewportDelta()
  })

  ipcMain.on('canvas-pan-to', (_event, { x, y }: { x: number; y: number }) => {
    setPan(x, y)
    requestLayout()
  })

  ipcMain.on(
    'canvas-selection-overlay',
    (
      _event,
      overlay: import('../../shared/types').SelectionOverlayPayload | null,
    ) => {
      if (overlay) tryEnter({ kind: 'marquee' })
      else commitActive()
      setSelectionOverlayRect(overlay)
    },
  )

  ipcMain.on(
    'canvas-drag-frame-start',
    (
      _event,
      { frameId, selection }: { frameId: string; selection?: CanvasDragStartSelection },
    ) => {
      // Enter drag mode BEFORE mutating selection. commitSelection calls
      // layoutAllViews() synchronously; while interactionState.kind is 'idle'
      // the focus reconciler routes focus to bgView and aboveView blurs,
      // which the drag's window blur listener treats as a cancel.
      const started = beginDragSession('frame', resolveDraggedFrameIds(frameId))
      if (started) applyDragStartSelection(frameId, selection)
    },
  )

  ipcMain.on(
    'canvas-drag-frame',
    (_event, { frameId, dx, dy }: { frameId: string; dx: number; dy: number }) => {
      const frameIds = activeDragIds('frame', frameId)
      if (!frameIds) return
      if (frameIds.length === 1) {
        const idx = pages.findIndex((candidate) => candidate.id === frameId)
        if (idx !== -1) selectPage(idx)
      }
      applyDragDelta(frameIds, dx, dy)
      requestLayout()
    },
  )

  ipcMain.on('canvas-drag-frame-end', () => {
    endDragSession('frame')
  })

  ipcMain.on(
    'canvas-drag-copy-frame',
    (
      _event,
      { frameId, canvasX, canvasY }: { frameId: string; canvasX: number; canvasY: number },
    ) => {
      const entityIds = resolveDraggedFrameIds(frameId)
      // Use generic entity copy for mixed selections
      const entityPayload = copyableSelectionPayload()
      if (entityPayload) {
        pasteEntitiesFromClipboard({ payload: entityPayload, canvasX, canvasY })
        return
      }
      // Fallback to frame-only copy
      const payload = copyableFramePayload(entityIds)
      if (!payload) return
      pasteFramesFromClipboard({ payload, canvasX, canvasY })
    },
  )

  ipcMain.on(
    'canvas-drag-entity-start',
    (
      _event,
      { entityId, selection }: { entityId: string; selection?: CanvasDragStartSelection },
    ) => {
      // See canvas-drag-frame-start: enter drag mode before applying selection
      // so the focus reconciler keeps aboveView focused through layoutAllViews.
      const started = beginDragSession('entity', resolveDraggedEntityIds(entityId))
      if (started) applyDragStartSelection(entityId, selection)
    },
  )

  ipcMain.on(
    'canvas-drag-entity',
    (_event, { entityId, dx, dy }: { entityId: string; dx: number; dy: number }) => {
      const entityIds = activeDragIds('entity', entityId)
      if (!entityIds) return
      applyDragDelta(entityIds, dx, dy)
      requestLayout()
    },
  )

  ipcMain.on('canvas-drag-entity-end', () => {
    endDragSession('entity')
  })

  ipcMain.on('canvas-drag-group-start', (_event, { groupId }: { groupId: string }) => {
    const entityIds = [groupId, ...descendantEntityIdsForGroup(groupId)]
    beginDragSession('group', entityIds)
  })

  ipcMain.on(
    'canvas-drag-group',
    (_event, { groupId, dx, dy }: { groupId: string; dx: number; dy: number }) => {
      const entityIds = activeDragIds('group', groupId)
      if (!entityIds) return
      applyDragDelta(entityIds, dx, dy)
      requestLayout()
    },
  )

  ipcMain.on('canvas-drag-group-end', () => {
    endDragSession('group')
    layoutAllViews()
  })

  ipcMain.on(
    'canvas-resize-begin',
    (
      _event,
      { entityId, entityKind }: { entityId: string; entityKind: import('../../shared/types').CanvasEntityKind },
    ) => {
      // Resize gesture begin. The renderer dispatches this BEFORE its first
      // entity-bounds mutation so the layout pass triggered by that mutation
      // sees `interactionState.kind === 'resizing-entity'` instead of `'idle'`.
      // Without it the focus reconciler routes focus to the selected page on
      // the first move tick, aboveView blurs, and the renderer's window-blur
      // listener cancels the gesture after one pixel. Same gotcha as the
      // drag-start ordering — see runtime/CLAUDE.md.
      tryEnter({ kind: 'resizing-entity', target: { id: entityId, kind: entityKind } })
    },
  )

  ipcMain.on('canvas-resize-end', () => {
    commitActive()
  })

  ipcMain.on(
    'canvas-edge-drag-begin',
    (
      _event,
      { fromEntityId, fromSide }: { fromEntityId: string; fromSide: EdgeSide },
    ) => {
      tryEnter({
        kind: 'dragging-edge',
        from: { id: fromEntityId, kind: resolveEntityKind(fromEntityId) },
        fromSide,
      })
      setHoverEntity(null)
      layoutAllViews()
    },
  )

  ipcMain.on(
    'canvas-edge-drag-target-change',
    (
      _event,
      {
        targetEntityId,
        targetSide,
      }: { targetEntityId: string | null; targetSide: EdgeSide | null },
    ) => {
      const target: CanvasHoverTarget =
        targetEntityId && targetSide
          ? { id: targetEntityId, kind: resolveEntityKind(targetEntityId) }
          : null
      updateEdgeDragTarget(target, targetSide)
      layoutAllViews()
    },
  )

  ipcMain.on('canvas-edge-drag-cancel', () => {
    cancelActive('escape')
    setHoverEntity(null)
    layoutAllViews()
  })

  ipcMain.on(
    'canvas-edge-drag-commit',
    (
      _event,
      {
        fromEntityId,
        toEntityId,
        fromSide,
        toSide,
      }: {
        fromEntityId: string
        toEntityId: string
        fromSide: EdgeSide
        toSide: EdgeSide
      },
    ) => {
      const previousSelectedEntityIds = getSelectedEntityIds()
      createEdges({
        edges: [
          {
            fromEntityId,
            toEntityId,
            fromSide,
            toSide,
            toEnd: 'arrow',
            kind: 'connection',
          },
        ],
      })
      commitActive()
      setHoverEntity(null)
      if (previousSelectedEntityIds.includes(fromEntityId)) {
        setSelectedEntities(previousSelectedEntityIds)
        return
      }
      selectNone()
    },
  )

  ipcMain.on(
    'canvas-edge-edit-commit',
    (
      _event,
      {
        edgeId,
        movingEnd,
        targetEntityId,
        targetSide,
      }: {
        edgeId: string
        movingEnd: 'from' | 'to'
        targetEntityId: string
        targetSide: EdgeSide
      },
    ) => {
      if (movingEnd === 'from') {
        updateEdge(edgeId, { fromEntityId: targetEntityId, fromSide: targetSide })
      } else {
        updateEdge(edgeId, { toEntityId: targetEntityId, toSide: targetSide })
      }
      commitActive()
      setHoverEntity(null)
      layoutAllViews()
    },
  )

  ipcMain.on(
    'canvas-edge-edit-discard',
    (_event, { edgeId }: { edgeId: string }) => {
      deleteEdge(edgeId)
      cancelActive('escape')
      setHoverEntity(null)
      layoutAllViews()
    },
  )
}
