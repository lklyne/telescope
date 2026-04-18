import { useEffect, useMemo } from 'react'
import type { RefObject } from 'react'
import type { CanvasBgElectronAPI, LayoutUpdateData } from '../../shared/types'
import {
  classifyViewportWheel,
  isOverlayUiTarget,
  middleDragDelta,
  normalizeRect,
  screenPointToCanvasPoint,
  screenRectToCanvasRect,
  snapToGrid,
} from '../../shared/gesture-utils'
import { useDragGesture } from '../shared/useDragGesture'
import { toOverlayRect } from './canvasGeometry'

/**
 * Canvas-bg viewport gestures.
 *
 * The bgRef element hosts three mutually-exclusive drag modes selected at
 * pointerdown from layout state + pointer metadata:
 *   - region-select (annotation mode 'region_select', mouse left)
 *   - marquee select (default, mouse left)
 *   - touch-pan (non-mouse primary pointer)
 *
 * A fourth handled-at-pointerdown case is pending-placement click: when
 * the user is placing a pending entity, the first left-click commits the
 * placement with no drag to track. onBegin triggers the side effect and
 * returns null; useDragGesture declines the gesture cleanly.
 *
 * Wheel (zoom/pan), middle-click pan (works over entities), and file
 * drag/drop remain raw listeners because they aren't drag gestures in
 * the pointer-capture sense — they operate on document level or respond
 * to non-pointer events.
 */

type DragMode =
  | { kind: 'pan'; startPanX: number; startPanY: number }
  | { kind: 'region-select' }
  | { kind: 'marquee' }

export function useCanvasViewportGestures({
  api,
  bgRef,
  layoutRef,
  setPlacementCursor,
  onMarqueePreview,
}: {
  api: CanvasBgElectronAPI
  bgRef: RefObject<HTMLDivElement | null>
  layoutRef: RefObject<LayoutUpdateData>
  setPlacementCursor: React.Dispatch<
    React.SetStateAction<{ clientX: number; clientY: number } | null>
  >
  onMarqueePreview: (ids: Set<string> | null) => void
}) {
  const stopDragging = useMemo(
    () => () => {
      api.setSelectionOverlayRect(null)
      onMarqueePreview(null)
    },
    [api, onMarqueePreview],
  )

  useDragGesture<DragMode>({
    target: bgRef,
    onBegin: (ctx) => {
      const layout = layoutRef.current
      const el = bgRef.current
      if (!el) return null
      if (ctx.clientY < layout.canvasOrigin.y) return null

      // Mouse left-button gestures.
      if (ctx.pointerType === 'mouse' && ctx.button === 0) {
        if (layout.focusedEntityId !== null) return null

        // Pending-placement click: commit the placement and decline the
        // gesture. Returning null cleanly releases capture.
        if (layout.pendingPlacement) {
          const point = screenPointToCanvasPoint(ctx.clientX, ctx.clientY, layout)
          api.placePendingEntity(snapToGrid(point.x), snapToGrid(point.y))
          return null
        }

        if (layout.annotationMode === 'draw') return null

        el.focus()

        if (layout.annotationMode === 'region_select') {
          return { kind: 'region-select' }
        }
        return { kind: 'marquee' }
      }

      // Touch / pen primary pointer: pan.
      if (ctx.pointerType !== 'mouse') {
        return { kind: 'pan', startPanX: layout.pan.x, startPanY: layout.pan.y }
      }

      return null
    },
    onUpdate: (ctx, mode) => {
      const layout = layoutRef.current
      if (mode.kind === 'pan') {
        api.canvasPanTo(mode.startPanX + ctx.dx, mode.startPanY + ctx.dy)
        return
      }
      const rect = normalizeRect(ctx.startClientX, ctx.startClientY, ctx.clientX, ctx.clientY)
      if (mode.kind === 'region-select') {
        api.setSelectionOverlayRect({
          rect: toOverlayRect(rect, layout),
          variant: 'region-select',
        })
        return
      }
      api.setSelectionOverlayRect({
        rect: toOverlayRect(rect, layout),
        variant: 'default',
      })
      const ids = new Set<string>()
      for (const entity of layout.entities) {
        if (
          rect.left < entity.screenX + entity.screenWidth &&
          rect.left + rect.width > entity.screenX &&
          rect.top < entity.screenY + entity.screenHeight &&
          rect.top + rect.height > entity.screenY
        ) {
          ids.add(entity.id)
        }
      }
      onMarqueePreview(ids.size > 0 ? ids : null)
    },
    onCommit: (ctx, mode) => {
      const layout = layoutRef.current
      if (mode.kind === 'pan') {
        stopDragging()
        return
      }
      const rect = normalizeRect(ctx.startClientX, ctx.startClientY, ctx.clientX, ctx.clientY)
      if (mode.kind === 'region-select') {
        stopDragging()
        if (rect.width >= 4 && rect.height >= 4) {
          api.commitRegionSelect(screenRectToCanvasRect(rect, layout))
        }
        return
      }
      // marquee
      if (rect.width < 4 || rect.height < 4) {
        if (layout.focusedEntityId === null) api.canvasDeselect()
      } else {
        api.canvasSelectInRect(screenRectToCanvasRect(rect, layout))
      }
      stopDragging()
    },
    onCancel: () => {
      stopDragging()
    },
  })

  useEffect(() => {
    const el = bgRef.current
    if (!el) return

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
      if (layout.focusedEntityId !== null) return
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
      if (layout.focusedEntityId !== null) return
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (event: DragEvent) => {
      const layout = layoutRef.current
      if (layout.focusedEntityId !== null) return
      if (!event.dataTransfer?.files.length) return
      event.preventDefault()
      event.stopImmediatePropagation()

      const point = screenPointToCanvasPoint(event.clientX, event.clientY, layout)
      const canvasX = snapToGrid(point.x)
      const canvasY = snapToGrid(point.y)

      Array.from(event.dataTransfer.files).forEach((file, i) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (!reader.result) return
          const buffer = new Uint8Array(reader.result as ArrayBuffer)
          const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
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
