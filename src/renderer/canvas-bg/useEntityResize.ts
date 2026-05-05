import { useCallback } from 'react'
import {
  applyCornerDelta,
  applyEdgeDelta,
  startResize,
  type AspectRatioResizeMode,
  type EntityResizePatch,
  type ResizeAccumulator,
  type ResizeCorner,
  type ResizeEdge,
} from '../../shared/resize-accumulator'

/**
 * Per-corner / per-edge resize gesture hooks for bgView entity overlays.
 *
 * The pixel math (aspect lock, corner flip, delta accumulation, min-size
 * clamping) lives in `src/shared/resize-accumulator.ts` so the canvas-pointer-
 * router can dispatch resize gestures using the same arithmetic without
 * re-implementing it.
 *
 * These hooks own only the React closure and the window-level pointer
 * listeners; they delegate every numeric step to the accumulator.
 */

interface CornerArgs {
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
}

interface EdgeArgs {
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
}

export function useCornerResize(args: CornerArgs) {
  const {
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
  } = args

  return useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const acc = startResize({ width, height, canvasX, canvasY })
      const cleanup = installResizeDrag(e, acc, (delta) => {
        const patch = applyCornerDelta(acc, corner, delta, {
          minWidth,
          minHeight,
          aspectRatioResizeMode,
        })
        onResize(id, patch)
      }, zoom)
      void cleanup
    },
    [id, width, height, canvasX, canvasY, zoom, minWidth, minHeight, corner, onResize, aspectRatioResizeMode],
  )
}

export function useEdgeResize(args: EdgeArgs) {
  const {
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
  } = args

  return useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const acc = startResize({ width, height, canvasX, canvasY })
      const cleanup = installResizeDrag(e, acc, (delta) => {
        const patch = applyEdgeDelta(acc, edge, delta, {
          minWidth,
          minHeight,
          aspectRatioResizeMode,
        })
        onResize(id, patch)
      }, zoom)
      void cleanup
    },
    [id, width, height, canvasX, canvasY, zoom, minWidth, minHeight, edge, onResize, aspectRatioResizeMode],
  )
}

/**
 * Install window-level mousemove/up listeners for the lifetime of the drag.
 * Tracks per-tick screen deltas, dispatches to the supplied callback, and
 * tears down on mouseup, button release, or blur (whichever comes first).
 */
function installResizeDrag(
  startEvent: React.MouseEvent,
  _acc: ResizeAccumulator,
  onTick: (delta: { screenDx: number; screenDy: number; zoom: number; shiftKey: boolean }) => void,
  zoom: number,
): () => void {
  let lastX = startEvent.screenX
  let lastY = startEvent.screenY
  let lastButtons = startEvent.buttons || 1

  const handleMouseMove = (moveEvent: MouseEvent) => {
    lastButtons = moveEvent.buttons
    if (lastButtons === 0) {
      cleanup()
      return
    }
    const screenDx = moveEvent.screenX - lastX
    const screenDy = moveEvent.screenY - lastY
    lastX = moveEvent.screenX
    lastY = moveEvent.screenY
    onTick({ screenDx, screenDy, zoom, shiftKey: moveEvent.shiftKey })
  }

  const cleanup = () => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    window.removeEventListener('blur', handleBlur)
  }

  const handleMouseUp = () => {
    lastButtons = 0
    cleanup()
  }

  const handleBlur = () => {
    if (lastButtons === 0) cleanup()
  }

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
  window.addEventListener('blur', handleBlur)
  return cleanup
}
