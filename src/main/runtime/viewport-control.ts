import { pages, pan, zoom, setPanState, setZoomState, selectedPage } from './runtime-context'
import { win } from './view-refs'
import { requestLayout } from './layout-engine'
import { markDirty } from './layout-dirty'
import {
  boundAvailableCanvasViewportRect as availableCanvasViewportRect,
  boundCanvasOriginX as canvasOriginX,
  boundEffectivePageContentSize as effectivePageContentSize,
} from './runtime-geometry'
import { scheduleWorkspaceAutosave } from './workspace-autosave'
import { safeSend } from './safe-send'
import { clampCanvasZoom } from '../../shared/zoom'
import type { WorkspaceBounds } from '../../shared/types'

export function setZoom(value: number): void {
  const nextZoom = clampCanvasZoom(value)
  if (nextZoom === zoom) return
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
  setPanState({ x, y })
  markDirty('canvas')
  scheduleWorkspaceAutosave()
}

// `requestLayout` lives in layout-engine (co-located with the private
// `layoutAllViews` it schedules); re-exported here so the viewport-control
// import surface stays stable.
export { requestLayout }

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
