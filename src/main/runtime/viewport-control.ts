import { pages, pan, zoom, setPanState, setZoomState, selectedPage } from './runtime-context'
import { win } from './view-refs'
import { layoutCache } from './layout-cache'
import { layoutAllViews } from './layout-engine'
import { markDirty } from './layout-dirty'
import {
  boundAvailableCanvasViewportRect as availableCanvasViewportRect,
  boundCanvasOriginX as canvasOriginX,
  boundEffectivePageContentSize as effectivePageContentSize,
} from './runtime-geometry'
import { scheduleWorkspaceAutosave } from './workspace-autosave'
import { safeSend } from './safe-send'
import type { WorkspaceBounds } from '../../shared/types'

export function setZoom(value: number): void {
  const nextZoom = Math.max(0.1, Math.min(3.0, value))
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

export function requestLayout(): void {
  if (layoutCache.layoutTimer) return
  layoutCache.layoutTimer = setTimeout(() => {
    layoutCache.layoutTimer = null
    layoutAllViews()
  }, 16)
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
