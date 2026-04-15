import type { LayoutUpdateData } from '../../shared/types'
import { snapToGrid } from '../../shared/gesture-utils'

type DragFrameSnapshot = {
  id: string
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  canvasX: number
  canvasY: number
}

export type ChromeDragSession = {
  frameId: string
  frames: DragFrameSnapshot[]
  totalScreenDx: number
  totalScreenDy: number
  copyMode: boolean
}

export type DragCopyPreview = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export function toOverlayRect(
  rect: { left: number; top: number; width: number; height: number },
  layout: LayoutUpdateData,
) {
  return {
    ...rect,
    top: rect.top - layout.canvasOrigin.y,
  }
}

export function unionScreenBounds(
  frames: LayoutUpdateData['entities'],
  selectedEntityIds: string[],
) {
  const selectedFrames = frames.filter((frame) =>
    selectedEntityIds.includes(frame.id),
  )
  if (!selectedFrames.length) return null

  const left = Math.min(...selectedFrames.map((frame) => frame.screenX))
  const top = Math.min(...selectedFrames.map((frame) => frame.screenY))
  const right = Math.max(
    ...selectedFrames.map((frame) => frame.screenX + frame.screenWidth),
  )
  const bottom = Math.max(
    ...selectedFrames.map((frame) => frame.screenY + frame.screenHeight),
  )

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

export function dragCopyAnchorPoint(
  session: ChromeDragSession,
  layout: LayoutUpdateData,
) {
  const minCanvasX = Math.min(...session.frames.map((frame) => frame.canvasX))
  const minCanvasY = Math.min(...session.frames.map((frame) => frame.canvasY))
  return {
    x: snapToGrid(minCanvasX + session.totalScreenDx / layout.zoom),
    y: snapToGrid(minCanvasY + session.totalScreenDy / layout.zoom),
  }
}

export function buildDragCopyPreview(
  session: ChromeDragSession,
  layout: LayoutUpdateData,
): DragCopyPreview[] {
  const anchor = dragCopyAnchorPoint(session, layout)
  const minCanvasX = Math.min(...session.frames.map((frame) => frame.canvasX))
  const minCanvasY = Math.min(...session.frames.map((frame) => frame.canvasY))

  return session.frames.map((frame) => ({
    id: frame.id,
    left:
      layout.canvasOrigin.x +
      layout.pan.x +
      (anchor.x + (frame.canvasX - minCanvasX)) * layout.zoom,
    top:
      layout.canvasOrigin.y +
      layout.pan.y +
      (anchor.y + (frame.canvasY - minCanvasY)) * layout.zoom,
    width: frame.screenWidth,
    height: frame.screenHeight,
  }))
}
