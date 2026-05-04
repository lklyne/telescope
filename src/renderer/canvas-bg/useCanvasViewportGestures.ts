import { useEffect, useMemo } from 'react'
import type { RefObject } from 'react'
import type { CanvasBgElectronAPI, LayoutUpdateData, SelectionModifiers, ShapeKind } from '../../shared/types'
import {
  canvasToScreenX,
  canvasToScreenY,
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

function toSelectionModifiers(mods: { shift: boolean; meta: boolean; ctrl: boolean }): SelectionModifiers {
  return { shift: mods.shift, meta: mods.meta, ctrl: mods.ctrl }
}

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
  | { kind: 'place-shape'; startCanvasX: number; startCanvasY: number }

const MIN_SHAPE_DRAG_SIZE = 24

export type ShapePlacementDragPreview = {
  rect: { left: number; top: number; width: number; height: number }
  shapeKind: ShapeKind
}

export function useCanvasViewportGestures({
  api,
  bgRef,
  layoutRef,
  setPlacementCursor,
  onMarqueePreview,
  onShapePlacementPreview,
}: {
  api: CanvasBgElectronAPI
  bgRef: RefObject<HTMLDivElement | null>
  layoutRef: RefObject<LayoutUpdateData>
  setPlacementCursor: React.Dispatch<
    React.SetStateAction<{ clientX: number; clientY: number } | null>
  >
  onMarqueePreview: (ids: Set<string> | null) => void
  onShapePlacementPreview: (preview: ShapePlacementDragPreview | null) => void
}) {
  const stopDragging = useMemo(
    () => () => {
      api.setSelectionOverlayRect(null)
      onMarqueePreview(null)
      onShapePlacementPreview(null)
    },
    [api, onMarqueePreview, onShapePlacementPreview],
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
        if (layout.viewMode === 'browser') return null

        // Pending-placement: shapes support drag-to-size; everything
        // else commits with default size on click.
        if (layout.pendingPlacement) {
          if (layout.pendingPlacement.entityKind === 'shape') {
            const point = screenPointToCanvasPoint(ctx.clientX, ctx.clientY, layout)
            return {
              kind: 'place-shape',
              startCanvasX: point.x,
              startCanvasY: point.y,
            }
          }
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
      if (mode.kind === 'place-shape') {
        const endCanvas = screenPointToCanvasPoint(ctx.clientX, ctx.clientY, layout)
        const minCanvasX = snapToGrid(Math.min(mode.startCanvasX, endCanvas.x))
        const minCanvasY = snapToGrid(Math.min(mode.startCanvasY, endCanvas.y))
        const snappedW = snapToGrid(Math.abs(endCanvas.x - mode.startCanvasX))
        const snappedH = snapToGrid(Math.abs(endCanvas.y - mode.startCanvasY))
        const rect = {
          left: canvasToScreenX(layout, minCanvasX),
          top: canvasToScreenY(layout, minCanvasY),
          width: snappedW * layout.zoom,
          height: snappedH * layout.zoom,
        }
        const shapeKind = layout.pendingPlacement?.shapeKind ?? 'rectangle'
        api.setSelectionOverlayRect({
          rect: toOverlayRect(rect, layout),
          variant: 'place-shape',
          shapeKind,
        })
        onShapePlacementPreview({ rect, shapeKind })
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
      if (mode.kind === 'place-shape') {
        stopDragging()
        const startCanvas = { x: mode.startCanvasX, y: mode.startCanvasY }
        const endCanvas = screenPointToCanvasPoint(ctx.clientX, ctx.clientY, layout)
        const dx = endCanvas.x - startCanvas.x
        const dy = endCanvas.y - startCanvas.y
        const minCanvasX = Math.min(startCanvas.x, endCanvas.x)
        const minCanvasY = Math.min(startCanvas.y, endCanvas.y)
        const w = Math.abs(dx)
        const h = Math.abs(dy)
        if (w >= MIN_SHAPE_DRAG_SIZE && h >= MIN_SHAPE_DRAG_SIZE) {
          api.placePendingShape(snapToGrid(minCanvasX), snapToGrid(minCanvasY), {
            x: snapToGrid(minCanvasX),
            y: snapToGrid(minCanvasY),
            width: snapToGrid(w),
            height: snapToGrid(h),
          })
        } else {
          api.placePendingShape(snapToGrid(startCanvas.x), snapToGrid(startCanvas.y), null)
        }
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
      const modifiers = toSelectionModifiers(ctx.modifiers)
      if (rect.width < 4 || rect.height < 4) {
        if (layout.viewMode === 'canvas') api.canvasDeselect(modifiers)
      } else {
        api.canvasSelectInRect(screenRectToCanvasRect(rect, layout), modifiers)
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
