// fallow-ignore-file circular-dependencies
// Suppressed: see #141. workspace-autosave → workspace-observers import viewport-control back
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
import { selectedCanvasTargets as uiSelectedCanvasTargets } from '../ui-state'
import { textEntities } from './text-entity-state'
import { fileEntities } from './file-entity-state'
import { drawingEntities } from './drawing-entity-state'
import { shapeEntities } from './shape-entity-state'
import { workspaceGroups, workspaceEdges } from './workspace-model'

export function setZoom(value: number): void {
  const nextZoom = clampCanvasZoom(value)
  if (nextZoom === zoom) return
  setZoomState(nextZoom)
  markDirty('canvas', 'toolbar')
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

function resolveEntityBounds(entityId: string): WorkspaceBounds | null {
  const page = pages.find((p) => p.id === entityId)
  if (page) {
    const size = effectivePageContentSize(page)
    return { x: page.canvasX, y: page.canvasY, width: size.width, height: size.height }
  }
  const text = textEntities.find((e) => e.id === entityId)
  if (text) return { x: text.canvasX, y: text.canvasY, width: text.width, height: text.height }
  const file = fileEntities.find((e) => e.id === entityId)
  if (file) return { x: file.canvasX, y: file.canvasY, width: file.width, height: file.height }
  const drawing = drawingEntities.find((e) => e.id === entityId)
  if (drawing) return { x: drawing.canvasX, y: drawing.canvasY, width: drawing.width, height: drawing.height }
  const shape = shapeEntities.find((e) => e.id === entityId)
  if (shape) return { x: shape.canvasX, y: shape.canvasY, width: shape.width, height: shape.height }
  const group = workspaceGroups.find((g) => g.id === entityId)
  if (group) return { x: group.canvasX, y: group.canvasY, width: group.width, height: group.height }
  return null
}

function unionBounds(boundsArr: WorkspaceBounds[]): WorkspaceBounds | null {
  if (!boundsArr.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const b of boundsArr) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function focusSelection(): boolean {
  if (!win) return false
  const targets = uiSelectedCanvasTargets()
  if (!targets.length) return false

  const allBounds: WorkspaceBounds[] = []
  for (const { id, kind } of targets) {
    if (kind === 'edge') {
      const edge = workspaceEdges.find((e) => e.id === id)
      if (edge) {
        const fromBounds = resolveEntityBounds(edge.fromEntityId)
        const toBounds = resolveEntityBounds(edge.toEntityId)
        if (fromBounds) allBounds.push(fromBounds)
        if (toBounds) allBounds.push(toBounds)
      }
      continue
    }
    const bounds = resolveEntityBounds(id)
    if (bounds) allBounds.push(bounds)
  }

  const combined = unionBounds(allBounds)
  if (!combined) return false

  focusCanvasBounds(combined)
  return true
}
