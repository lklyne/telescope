import { pages, pan, zoom, setPanState, setZoomState, selectedPage } from './runtime-context'
import { textEntities } from './text-entity-state'
import { fileEntities } from './file-entity-state'
import { drawingEntities } from './drawing-entity-state'
import { workspaceGroups } from './workspace-model'
import { win } from './view-refs'
import { layoutCache } from './layout-cache'
import { layoutAllViews } from './layout-engine'
import { markDirty } from './layout-dirty'
import {
  boundAvailableCanvasViewportRect as availableCanvasViewportRect,
  boundCanvasOriginX as canvasOriginX,
  boundEffectivePageContentSize as effectivePageContentSize,
  pageContentSize,
} from './runtime-geometry'
import { scheduleWorkspaceAutosave } from './workspace-autosave'
import { safeSend } from './safe-send'
import type { CanvasEntityKind, WorkspaceBounds } from '../../shared/types'

export function setZoom(value: number): void {
  const nextZoom = Math.max(0.1, Math.min(3.0, value))
  if (nextZoom === zoom) return
  cancelCameraAnimation()
  setZoomState(nextZoom)
  markDirty('canvas', 'toolbar', 'pages')
  broadcastCanvasZoomToPages()
  scheduleWorkspaceAutosave()
}

export function broadcastCanvasZoomToPages(): void {
  for (const page of pages) {
    safeSend(page.pageView.webContents, 'set-canvas-zoom', zoom)
  }
}

export function setPan(x: number, y: number): void {
  if (pan.x === x && pan.y === y) return
  cancelCameraAnimation()
  setPanState({ x, y })
  markDirty('canvas')
  scheduleWorkspaceAutosave()
}

export function requestLayout(): void {
  if (layoutCache.layoutTimer) return
  layoutCache.layoutTimer = setTimeout(() => {
    layoutCache.layoutTimer = null
    layoutAllViews()
  }, 16)
}

// ---------------------------------------------------------------------------
// Camera animation (used by enter/exit focus for seamless transitions)
// ---------------------------------------------------------------------------

const CAMERA_ANIMATION_DURATION_MS = 220
const CAMERA_ANIMATION_FRAME_MS = 16

let cameraAnimationToken = 0

/** easeInOutQuart — strong ease, matches the "flick" feel of focus transitions. */
function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
}

export function cancelCameraAnimation(): void {
  cameraAnimationToken++
}

/**
 * Animate zoom + pan toward target over the given duration.
 * Cancels any in-flight animation before starting.
 */
export function animateCameraTo(
  target: { zoom: number; pan: { x: number; y: number } },
  duration: number = CAMERA_ANIMATION_DURATION_MS,
  onComplete?: () => void,
): void {
  const token = ++cameraAnimationToken
  const startZoom = zoom
  const startPan = { x: pan.x, y: pan.y }
  const startTime = Date.now()

  const clampedZoom = Math.max(0.1, Math.min(3.0, target.zoom))

  const step = () => {
    if (token !== cameraAnimationToken) return
    const elapsed = Date.now() - startTime
    const t = Math.min(1, elapsed / duration)
    const eased = easeInOutQuart(t)

    const nextZoom = startZoom + (clampedZoom - startZoom) * eased
    const nextPanX = startPan.x + (target.pan.x - startPan.x) * eased
    const nextPanY = startPan.y + (target.pan.y - startPan.y) * eased

    setZoomState(nextZoom)
    setPanState({ x: Math.round(nextPanX), y: Math.round(nextPanY) })
    markDirty('canvas', 'pages')
    broadcastCanvasZoomToPages()
    layoutAllViews()

    if (t < 1) {
      setTimeout(step, CAMERA_ANIMATION_FRAME_MS)
    } else {
      scheduleWorkspaceAutosave()
      onComplete?.()
    }
  }

  step()
}

// ---------------------------------------------------------------------------
// Entity bounds helpers (canvas coords)
// ---------------------------------------------------------------------------

function entityCanvasBounds(
  entityId: string,
  entityKind: CanvasEntityKind,
): WorkspaceBounds | null {
  if (entityKind === 'frame') {
    const page = pages.find((p) => p.id === entityId)
    if (!page) return null
    const size = pageContentSize(page)
    return { x: page.canvasX, y: page.canvasY, width: size.width, height: size.height }
  }
  if (entityKind === 'text') {
    const e = textEntities.find((t) => t.id === entityId)
    if (!e) return null
    return { x: e.canvasX, y: e.canvasY, width: e.width, height: e.height }
  }
  if (entityKind === 'file') {
    const e = fileEntities.find((f) => f.id === entityId)
    if (!e) return null
    return { x: e.canvasX, y: e.canvasY, width: e.width, height: e.height }
  }
  if (entityKind === 'drawing') {
    const e = drawingEntities.find((d) => d.id === entityId)
    if (!e) return null
    return { x: e.canvasX, y: e.canvasY, width: e.width, height: e.height }
  }
  if (entityKind === 'group') {
    const g = workspaceGroups.find((candidate) => candidate.id === entityId)
    if (!g) return null
    return { x: g.canvasX, y: g.canvasY, width: g.width, height: g.height }
  }
  return null
}

/**
 * Compute target camera (zoom + pan) that fits the given entity into the
 * available viewport with a small padding.
 */
export function computeFocusCamera(
  entityId: string,
  entityKind: CanvasEntityKind,
): { zoom: number; pan: { x: number; y: number } } | null {
  const bounds = entityCanvasBounds(entityId, entityKind)
  if (!bounds || !win) return null

  const viewport = availableCanvasViewportRect()
  const padding = 64

  const availW = Math.max(100, viewport.width - padding * 2)
  const availH = Math.max(100, viewport.height - padding * 2)
  const targetZoom = Math.max(
    0.1,
    Math.min(3.0, Math.min(availW / bounds.width, availH / bounds.height)),
  )

  const targetPanX = Math.round(
    viewport.x + viewport.width / 2 - canvasOriginX() - (bounds.x + bounds.width / 2) * targetZoom,
  )
  const targetPanY = Math.round(
    viewport.height / 2 - (bounds.y + bounds.height / 2) * targetZoom,
  )

  return { zoom: targetZoom, pan: { x: targetPanX, y: targetPanY } }
}

export function focusCanvasBounds(bounds: WorkspaceBounds): void {
  if (!win) return
  const viewport = availableCanvasViewportRect()
  const targetX = Math.round(
    viewport.x + viewport.width / 2 - canvasOriginX() - (bounds.x + bounds.width / 2) * zoom,
  )
  const targetY = Math.round(
    viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
  )
  setPan(targetX, targetY)
  requestLayout()
}

export function focusSelectedPage(): boolean {
  const page = selectedPage()
  if (!page || !win) return false
  const pageSize = effectivePageContentSize(page)
  const viewport = availableCanvasViewportRect()
  const targetX = Math.round(
    viewport.x + (viewport.width - pageSize.width * zoom) / 2 - canvasOriginX() - page.canvasX * zoom,
  )
  const targetY = Math.round(
    (viewport.height - pageSize.height * zoom) / 2 - page.canvasY * zoom,
  )
  setPan(targetX, targetY)
  requestLayout()
  return true
}
