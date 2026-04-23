import { useCallback } from 'react'
import type {
  AspectRatioResizeMode,
  EntityResizePatch,
  ResizeCorner,
  ResizeEdge,
} from './entityConstants'

function constrainAspectThisMove(mode: AspectRatioResizeMode, shiftKey: boolean): boolean {
  if (mode === 'off') return false
  if (mode === 'shift-unlocks') return !shiftKey
  return shiftKey
}

function roundWithAspect(
  w: number,
  h: number,
  aspect: number,
  lock: boolean,
  primary: 'w' | 'h',
): { roundedW: number; roundedH: number } {
  if (!lock) return { roundedW: Math.round(w), roundedH: Math.round(h) }
  if (primary === 'w') {
    const rw = Math.round(w)
    return { roundedW: rw, roundedH: rw / aspect }
  }
  const rh = Math.round(h)
  return { roundedW: rh * aspect, roundedH: rh }
}

export function useCornerResize({
  id,
  width,
  height,
  canvasX,
  canvasY,
  zoom,
  minWidth,
  minHeight,
  corner,
  onResize,
  aspectRatioResizeMode = 'off',
}: {
  id: string
  width: number
  height: number
  canvasX: number
  canvasY: number
  zoom: number
  minWidth: number
  minHeight: number
  corner: ResizeCorner
  onResize: (id: string, patch: EntityResizePatch) => void
  aspectRatioResizeMode?: AspectRatioResizeMode
}) {
  return useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      let lastX = e.screenX
      let lastY = e.screenY
      let accW = width
      let accH = height
      let accCX = canvasX
      let accCY = canvasY
      const aspect = width / height
      const flipX = corner === 'top-left' || corner === 'bottom-left' ? -1 : 1
      const flipY = corner === 'top-left' || corner === 'top-right' ? -1 : 1
      let lastButtons = e.buttons || 1
      const handleMouseMove = (moveEvent: MouseEvent) => {
        lastButtons = moveEvent.buttons
        if (lastButtons === 0) {
          finishResize()
          return
        }
        const dx = (moveEvent.screenX - lastX) / zoom
        const dy = (moveEvent.screenY - lastY) / zoom
        lastX = moveEvent.screenX
        lastY = moveEvent.screenY
        let newW = Math.max(minWidth, accW + dx * flipX)
        let newH = Math.max(minHeight, accH + dy * flipY)
        const aspectLock = constrainAspectThisMove(aspectRatioResizeMode, moveEvent.shiftKey)
        if (aspectLock) {
          const dxAbs = Math.abs(newW - accW)
          const dyAbs = Math.abs(newH - accH)
          if (dxAbs >= dyAbs) {
            newH = Math.max(minHeight, newW / aspect)
            newW = newH * aspect
          } else {
            newW = Math.max(minWidth, newH * aspect)
            newH = newW / aspect
          }
        }
        const clampedDx = (newW - accW) * flipX
        const clampedDy = (newH - accH) * flipY
        accW = newW
        accH = newH
        if (flipX === -1) accCX += clampedDx
        if (flipY === -1) accCY += clampedDy
        const { roundedW, roundedH } = roundWithAspect(accW, accH, aspect, aspectLock, 'w')
        const patch: EntityResizePatch = {
          width: roundedW,
          height: roundedH,
        }
        if (flipX === -1) patch.canvasX = Math.round(accCX)
        if (flipY === -1) patch.canvasY = Math.round(accCY)
        onResize(id, patch)
      }
      const finishResize = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('blur', handleBlur)
      }
      const handleMouseUp = () => {
        lastButtons = 0
        finishResize()
      }
      const handleBlur = () => {
        if (lastButtons === 0) finishResize()
      }
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('blur', handleBlur)
    },
    [id, width, height, canvasX, canvasY, zoom, minWidth, minHeight, corner, onResize, aspectRatioResizeMode],
  )
}

export function useEdgeResize({
  id,
  width,
  height,
  canvasX,
  canvasY,
  zoom,
  minWidth,
  minHeight,
  edge,
  onResize,
  aspectRatioResizeMode = 'off',
}: {
  id: string
  width: number
  height: number
  canvasX: number
  canvasY: number
  zoom: number
  minWidth: number
  minHeight: number
  edge: ResizeEdge
  onResize: (id: string, patch: EntityResizePatch) => void
  aspectRatioResizeMode?: AspectRatioResizeMode
}) {
  return useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      let lastX = e.screenX
      let lastY = e.screenY
      let accW = width
      let accH = height
      let accCX = canvasX
      let accCY = canvasY
      const aspect = width / height
      const isHorizontal = edge === 'left' || edge === 'right'
      const flip = edge === 'left' || edge === 'top' ? -1 : 1
      let lastButtons = e.buttons || 1
      const handleMouseMove = (moveEvent: MouseEvent) => {
        lastButtons = moveEvent.buttons
        if (lastButtons === 0) {
          finishResize()
          return
        }
        const dx = (moveEvent.screenX - lastX) / zoom
        const dy = (moveEvent.screenY - lastY) / zoom
        lastX = moveEvent.screenX
        lastY = moveEvent.screenY
        const delta = isHorizontal ? dx : dy
        const aspectLock = constrainAspectThisMove(aspectRatioResizeMode, moveEvent.shiftKey)
        let newW: number, newH: number
        if (isHorizontal) {
          newW = Math.max(minWidth, accW + delta * flip)
          newH = aspectLock ? newW / aspect : accH
        } else {
          newH = Math.max(minHeight, accH + delta * flip)
          newW = aspectLock ? newH * aspect : accW
        }
        newW = Math.max(minWidth, newW)
        newH = Math.max(minHeight, newH)
        const dw = newW - accW
        const dh = newH - accH
        accW = newW
        accH = newH
        if (edge === 'left') accCX -= dw
        if (edge === 'top') accCY -= dh
        const { roundedW, roundedH } = roundWithAspect(accW, accH, aspect, aspectLock, isHorizontal ? 'w' : 'h')
        const patch: EntityResizePatch = {
          width: roundedW,
          height: roundedH,
        }
        if (edge === 'left') patch.canvasX = Math.round(accCX)
        if (edge === 'top') patch.canvasY = Math.round(accCY)
        onResize(id, patch)
      }
      const finishResize = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('blur', handleBlur)
      }
      const handleMouseUp = () => {
        lastButtons = 0
        finishResize()
      }
      const handleBlur = () => {
        if (lastButtons === 0) finishResize()
      }
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('blur', handleBlur)
    },
    [id, width, height, canvasX, canvasY, zoom, minWidth, minHeight, edge, onResize, aspectRatioResizeMode],
  )
}
