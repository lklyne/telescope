import { useEffect } from 'react'
import {
  classifyViewportWheel,
  isOverlayUiTarget,
  middleDragDelta,
  shouldStartMouseViewportPan,
} from '../../../shared/gesture-utils'
import type { CanvasSelectableTarget, SelectionModifiers } from '../../../shared/types'

function selectionModifiersFromEvent(event: MouseEvent): SelectionModifiers {
  return { shift: event.shiftKey, meta: event.metaKey, ctrl: event.ctrlKey }
}

interface ViewportForwardingApi {
  canvasZoom: (deltaY: number, mouseX: number, mouseY: number) => void
  canvasPan: (deltaX: number, deltaY: number) => void
  canvasDeselect?: (modifiers?: SelectionModifiers) => void
  canvasClickAt?: (
    screenX: number,
    screenY: number,
    modifiers?: SelectionModifiers,
  ) => void
  /** Optional left-drag forwarding. When provided, left-button drags are
   *  forwarded through these callbacks instead of immediately firing
   *  canvasClickAt on mousedown. */
  onDragMove?: (
    startClientX: number,
    startClientY: number,
    clientX: number,
    clientY: number,
    modifiers?: SelectionModifiers,
  ) => void
  onDragEnd?: (
    startClientX: number,
    startClientY: number,
    clientX: number,
    clientY: number,
    modifiers?: SelectionModifiers,
  ) => void
  /** Optional renderer-side hit test for selection-owned content or frame
   *  bodies/chrome. When it returns a target, left-button clicks bypass
   *  generic click forwarding and call onEntityPointerDown instead. */
  hitTestEntity?: (clientX: number, clientY: number) => CanvasSelectableTarget | null
  onEntityPointerDown?: (target: CanvasSelectableTarget, event: MouseEvent) => void
}

const DRAG_THRESHOLD = 4

export function useViewportForwarding(
  enabled: boolean,
  api: ViewportForwardingApi,
) {
  useEffect(() => {
    if (!enabled) return

    let middleDrag:
      | {
          screenX: number
          screenY: number
        }
      | null = null

    let leftDrag:
      | {
          startClientX: number
          startClientY: number
          dragging: boolean
        }
      | null = null

    const onWheel = (event: WheelEvent) => {
      if (isOverlayUiTarget(event.target)) return
      event.preventDefault()
      const action = classifyViewportWheel(event)
      if (action.kind === 'zoom') {
        api.canvasZoom(action.deltaY, action.mouseX, action.mouseY)
        return
      }
      api.canvasPan(action.deltaX, action.deltaY)
    }

    const onMouseDown = (event: MouseEvent) => {
      if (isOverlayUiTarget(event.target)) return

      if (shouldStartMouseViewportPan(event)) {
        middleDrag = {
          screenX: event.screenX,
          screenY: event.screenY,
        }
        event.preventDefault()
        return
      }

      if (event.button === 0) {
        if (api.hitTestEntity && api.onEntityPointerDown) {
          const target = api.hitTestEntity(event.clientX, event.clientY)
          if (target) {
            api.onEntityPointerDown(target, event)
            return
          }
        }
        if (api.onDragMove) {
          // Drag forwarding mode: defer click until mouseup
          leftDrag = {
            startClientX: event.clientX,
            startClientY: event.clientY,
            dragging: false,
          }
          event.preventDefault()
        } else if (api.canvasClickAt) {
          api.canvasClickAt(event.clientX, event.clientY, selectionModifiersFromEvent(event))
        } else if (api.canvasDeselect) {
          api.canvasDeselect(selectionModifiersFromEvent(event))
        }
      }
    }

    const onMouseMove = (event: MouseEvent) => {
      if (middleDrag) {
        const delta = middleDragDelta(middleDrag, event)
        middleDrag = {
          screenX: event.screenX,
          screenY: event.screenY,
        }
        api.canvasPan(delta.deltaX, delta.deltaY)
      }

      if (leftDrag && api.onDragMove) {
        const dx = event.clientX - leftDrag.startClientX
        const dy = event.clientY - leftDrag.startClientY
        if (!leftDrag.dragging && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
          return
        }
        leftDrag.dragging = true
        api.onDragMove(
          leftDrag.startClientX,
          leftDrag.startClientY,
          event.clientX,
          event.clientY,
          selectionModifiersFromEvent(event),
        )
      }
    }

    const onMouseUp = (event: MouseEvent) => {
      if (middleDrag && event.button === 1) {
        middleDrag = null
      }

      if (leftDrag && event.button === 0) {
        if (leftDrag.dragging && api.onDragEnd) {
          api.onDragEnd(
            leftDrag.startClientX,
            leftDrag.startClientY,
            event.clientX,
            event.clientY,
            selectionModifiersFromEvent(event),
          )
        } else {
          // Was a click, not a drag
          const modifiers = selectionModifiersFromEvent(event)
          if (api.canvasClickAt) {
            api.canvasClickAt(event.clientX, event.clientY, modifiers)
          } else if (api.canvasDeselect) {
            api.canvasDeselect(modifiers)
          }
        }
        leftDrag = null
      }
    }

    const cleanup = () => {
      middleDrag = null
      if (leftDrag?.dragging && api.onDragEnd) {
        // Cancel the in-progress drag by sending a zero-size end
        api.onDragEnd(leftDrag.startClientX, leftDrag.startClientY, leftDrag.startClientX, leftDrag.startClientY)
      }
      leftDrag = null
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('blur', cleanup)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('blur', cleanup)
      cleanup()
    }
  }, [api, enabled])
}
