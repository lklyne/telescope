import type { LayoutUpdateData } from '../../shared/types'
import { snapToGrid } from '../../shared/gesture-utils'

type DragPageSnapshot = {
  id: string
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  canvasX: number
  canvasY: number
}

type ChromeDragSession = {
  pageId: string
  pages: DragPageSnapshot[]
  totalScreenDx: number
  totalScreenDy: number
  copyMode: boolean
}

type DragCopyPreview = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

function toOverlayRect(
  rect: { left: number; top: number; width: number; height: number },
  layout: LayoutUpdateData,
) {
  return {
    ...rect,
    top: rect.top - layout.canvasOrigin.y,
  }
}

export function unionScreenBounds(
  pages: LayoutUpdateData['entities'],
  selectedEntityIds: string[],
) {
  const selectedPages = pages.filter((page) =>
    selectedEntityIds.includes(page.id),
  )
  if (!selectedPages.length) return null

  const left = Math.min(...selectedPages.map((page) => page.screenX))
  const top = Math.min(...selectedPages.map((page) => page.screenY))
  const right = Math.max(
    ...selectedPages.map((page) => page.screenX + page.screenWidth),
  )
  const bottom = Math.max(
    ...selectedPages.map((page) => page.screenY + page.screenHeight),
  )

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function dragCopyAnchorPoint(
  session: ChromeDragSession,
  layout: LayoutUpdateData,
) {
  const minCanvasX = Math.min(...session.pages.map((page) => page.canvasX))
  const minCanvasY = Math.min(...session.pages.map((page) => page.canvasY))
  return {
    x: snapToGrid(minCanvasX + session.totalScreenDx / layout.zoom),
    y: snapToGrid(minCanvasY + session.totalScreenDy / layout.zoom),
  }
}

function buildDragCopyPreview(
  session: ChromeDragSession,
  layout: LayoutUpdateData,
): DragCopyPreview[] {
  const anchor = dragCopyAnchorPoint(session, layout)
  const minCanvasX = Math.min(...session.pages.map((page) => page.canvasX))
  const minCanvasY = Math.min(...session.pages.map((page) => page.canvasY))

  return session.pages.map((page) => ({
    id: page.id,
    left:
      layout.canvasOrigin.x +
      layout.pan.x +
      (anchor.x + (page.canvasX - minCanvasX)) * layout.zoom,
    top:
      layout.canvasOrigin.y +
      layout.pan.y +
      (anchor.y + (page.canvasY - minCanvasY)) * layout.zoom,
    width: page.screenWidth,
    height: page.screenHeight,
  }))
}
