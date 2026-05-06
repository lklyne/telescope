import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { CanvasBgElectronAPI, LayoutUpdateData, ShapeKind } from '../../shared/types'
import {
  classifyViewportWheel,
  isOverlayUiTarget,
  middleDragDelta,
  screenPointToCanvasPoint,
  snapToGrid,
} from '../../shared/gesture-utils'

/**
 * Canvas-bg viewport gestures.
 *
 * bgView is visual-only for canvas gestures in canvas mode. It still forwards
 * non-left-button viewport affordances (wheel zoom/pan, middle-button pan)
 * and accepts OS file drops; left-button selection, placement, drag, resize,
 * marquee, and edge gestures enter through aboveView.
 */

export type ShapePlacementDragPreview = {
  rect: { left: number; top: number; width: number; height: number }
  shapeKind: ShapeKind
}

export function useCanvasViewportGestures({
  api,
  bgRef,
  layoutRef,
  setPlacementCursor,
  onShapePlacementPreview,
}: {
  api: CanvasBgElectronAPI
  bgRef: RefObject<HTMLDivElement | null>
  layoutRef: RefObject<LayoutUpdateData>
  setPlacementCursor: React.Dispatch<
    React.SetStateAction<{ clientX: number; clientY: number } | null>
  >
  onShapePlacementPreview: (preview: ShapePlacementDragPreview | null) => void
}) {
  useEffect(() => {
    const el = bgRef.current
    if (!el) return
    onShapePlacementPreview(null)

    // Wheel zoom/pan — document-level so it works over entities too.
    const handleWheel = (event: WheelEvent) => {
      if (isOverlayUiTarget(event.target)) return
      if (
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLInputElement
      ) {
        return
      }
      event.preventDefault()
      const action = classifyViewportWheel(event)
      if (action.kind === 'zoom') {
        api.canvasZoom(action.deltaY, action.mouseX, action.mouseY)
        return
      }
      api.canvasPan(action.deltaX, action.deltaY)
    }

    // Placement cursor + annotate-hover clear — plain pointer tracking,
    // not a drag gesture.
    const handlePointerMove = (event: PointerEvent) => {
      const layout = layoutRef.current
      if (
        layout.pendingPlacement &&
        event.clientY >= layout.canvasOrigin.y &&
        !isOverlayUiTarget(event.target)
      ) {
        setPlacementCursor({ clientX: event.clientX, clientY: event.clientY })
      }
    }

    const handlePointerEnter = () => {
      const layout = layoutRef.current
      if (layout.annotationMode !== 'comment') return
      api.clearAnnotateHover()
    }

    // Document-level middle-click pan (works over entities).
    let middleDrag: { screenX: number; screenY: number } | null = null

    const handleMiddleMouseDown = (event: MouseEvent) => {
      const layout = layoutRef.current
      if (event.button !== 1) return
      if (layout.viewMode === 'browser') return
      if (isOverlayUiTarget(event.target)) return
      if (event.clientY < layout.canvasOrigin.y) return
      middleDrag = { screenX: event.screenX, screenY: event.screenY }
      event.preventDefault()
    }

    const handleMiddleMouseMove = (event: MouseEvent) => {
      if (!middleDrag) return
      const delta = middleDragDelta(middleDrag, event)
      middleDrag = { screenX: event.screenX, screenY: event.screenY }
      api.canvasPan(delta.deltaX, delta.deltaY)
    }

    const handleMiddleMouseUp = () => {
      middleDrag = null
    }

    const handleWindowBlur = () => {
      middleDrag = null
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') middleDrag = null
    }

    // File drag/drop onto the canvas.
    const handleDragOver = (event: DragEvent) => {
      const layout = layoutRef.current
      if (layout.viewMode === 'browser') return
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (event: DragEvent) => {
      const layout = layoutRef.current
      if (layout.viewMode === 'browser') return
      if (!event.dataTransfer?.files.length) return
      event.preventDefault()
      event.stopImmediatePropagation()

      const point = screenPointToCanvasPoint(event.clientX, event.clientY, layout)
      const canvasX = snapToGrid(point.x)
      const canvasY = snapToGrid(point.y)

      Array.from(event.dataTransfer.files).forEach((file, i) => {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
        if (ext === 'tsx' || ext === 'jsx') {
          api.dropComponentFile(file, canvasX + i * 20, canvasY + i * 20)
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          if (!reader.result) return
          const buffer = new Uint8Array(reader.result as ArrayBuffer)
          api.dropFileBuffer(buffer, ext, canvasX + i * 20, canvasY + i * 20)
        }
        reader.readAsArrayBuffer(file)
      })
    }

    document.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('mousedown', handleMiddleMouseDown)
    document.addEventListener('mousemove', handleMiddleMouseMove)
    document.addEventListener('mouseup', handleMiddleMouseUp)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('pointerenter', handlePointerEnter)
    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('wheel', handleWheel)
      document.removeEventListener('mousedown', handleMiddleMouseDown)
      document.removeEventListener('mousemove', handleMiddleMouseMove)
      document.removeEventListener('mouseup', handleMiddleMouseUp)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('pointerenter', handlePointerEnter)
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [api, bgRef, layoutRef, setPlacementCursor])
}
