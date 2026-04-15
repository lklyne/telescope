import { useCallback } from 'react'
import type { ResizeCorner, ResizeEdge } from './entityConstants'

export interface MultiResizeEntity {
  id: string
  kind: 'frame' | 'text' | 'file' | 'drawing'
  canvasX: number
  canvasY: number
  width: number
  height: number
}

interface CanvasBBox {
  x: number
  y: number
  width: number
  height: number
}

const MIN_MULTI_BBOX = 20

function applyProportional(
  initialEntities: MultiResizeEntity[],
  initialBbox: CanvasBBox,
  accX: number,
  accY: number,
  accW: number,
  accH: number,
  onResize: (entries: Array<{ id: string; kind: 'frame' | 'text' | 'file' | 'drawing'; width: number; height: number; canvasX: number; canvasY: number }>) => void,
) {
  const scaleX = initialBbox.width > 0 ? accW / initialBbox.width : 1
  const scaleY = initialBbox.height > 0 ? accH / initialBbox.height : 1

  const entries = initialEntities.map((entity) => ({
    id: entity.id,
    kind: entity.kind,
    width: Math.round(Math.max(1, entity.width * scaleX)),
    height: Math.round(Math.max(1, entity.height * scaleY)),
    canvasX: Math.round(accX + (entity.canvasX - initialBbox.x) * scaleX),
    canvasY: Math.round(accY + (entity.canvasY - initialBbox.y) * scaleY),
  }))
  onResize(entries)
}

export function useMultiCornerResize({
  entities,
  canvasBbox,
  zoom,
  corner,
  onResize,
}: {
  entities: MultiResizeEntity[]
  canvasBbox: CanvasBBox
  zoom: number
  corner: ResizeCorner
  onResize: (entries: Array<{ id: string; kind: 'frame' | 'text' | 'file' | 'drawing'; width: number; height: number; canvasX: number; canvasY: number }>) => void
}): (e: React.MouseEvent) => void {
  return useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()

      const initialBbox = { ...canvasBbox }
      const initialEntities = entities.map((ent) => ({ ...ent }))

      let lastX = e.screenX
      let lastY = e.screenY
      let accW = canvasBbox.width
      let accH = canvasBbox.height
      let accCX = canvasBbox.x
      let accCY = canvasBbox.y
      const flipX = corner === 'top-left' || corner === 'bottom-left' ? -1 : 1
      const flipY = corner === 'top-left' || corner === 'top-right' ? -1 : 1

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = (moveEvent.screenX - lastX) / zoom
        const dy = (moveEvent.screenY - lastY) / zoom
        lastX = moveEvent.screenX
        lastY = moveEvent.screenY

        const newW = Math.max(MIN_MULTI_BBOX, accW + dx * flipX)
        const newH = Math.max(MIN_MULTI_BBOX, accH + dy * flipY)
        const clampedDx = (newW - accW) * flipX
        const clampedDy = (newH - accH) * flipY
        accW = newW
        accH = newH
        if (flipX === -1) accCX += clampedDx
        if (flipY === -1) accCY += clampedDy

        applyProportional(initialEntities, initialBbox, accCX, accCY, accW, accH, onResize)
      }

      const finishResize = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', finishResize)
        window.removeEventListener('blur', finishResize)
      }
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', finishResize)
      window.addEventListener('blur', finishResize)
    },
    [entities, canvasBbox, zoom, corner, onResize],
  )
}

export function useMultiEdgeResize({
  entities,
  canvasBbox,
  zoom,
  edge,
  onResize,
}: {
  entities: MultiResizeEntity[]
  canvasBbox: CanvasBBox
  zoom: number
  edge: ResizeEdge
  onResize: (entries: Array<{ id: string; kind: 'frame' | 'text' | 'file' | 'drawing'; width: number; height: number; canvasX: number; canvasY: number }>) => void
}): (e: React.MouseEvent) => void {
  return useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()

      const initialBbox = { ...canvasBbox }
      const initialEntities = entities.map((ent) => ({ ...ent }))

      let lastX = e.screenX
      let lastY = e.screenY
      let accW = canvasBbox.width
      let accH = canvasBbox.height
      let accCX = canvasBbox.x
      let accCY = canvasBbox.y
      const isHorizontal = edge === 'left' || edge === 'right'
      const flip = edge === 'left' || edge === 'top' ? -1 : 1

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = (moveEvent.screenX - lastX) / zoom
        const dy = (moveEvent.screenY - lastY) / zoom
        lastX = moveEvent.screenX
        lastY = moveEvent.screenY

        const delta = isHorizontal ? dx : dy
        if (isHorizontal) {
          const newW = Math.max(MIN_MULTI_BBOX, accW + delta * flip)
          const dw = newW - accW
          accW = newW
          if (edge === 'left') accCX -= dw
        } else {
          const newH = Math.max(MIN_MULTI_BBOX, accH + delta * flip)
          const dh = newH - accH
          accH = newH
          if (edge === 'top') accCY -= dh
        }

        applyProportional(initialEntities, initialBbox, accCX, accCY, accW, accH, onResize)
      }

      const finishResize = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', finishResize)
        window.removeEventListener('blur', finishResize)
      }
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', finishResize)
      window.addEventListener('blur', finishResize)
    },
    [entities, canvasBbox, zoom, edge, onResize],
  )
}
