import { useEffect } from 'react'
import {
  classifyViewportWheel,
  isOverlayUiTarget,
  middleDragDelta,
  shouldStartMouseViewportPan,
} from '../../../shared/gesture-utils'

interface ViewportForwardingApi {
  canvasZoom: (deltaY: number, mouseX: number, mouseY: number) => void
  canvasPan: (deltaX: number, deltaY: number) => void
  canvasDeselect?: () => void
  canvasClickAt?: (screenX: number, screenY: number) => void
  /** Optional left-drag forwarding. When provided, left-button drags are
   *  forwarded through these callbacks instead of immediately firing
   *  canvasClickAt on mousedown. */
  onDragMove?: (startClientX: number, startClientY: number, clientX: number, clientY: number) => void
  onDragEnd?: (startClientX: number, startClientY: number, clientX: number, clientY: number) => void
  /** Optional renderer-side hit test: given client coords, return a frame id
   *  if a frame body/chrome was clicked, else null. When provided together
   *  with onFramePointerDown, left-button clicks on a frame bypass click/drag
   *  forwarding and call onFramePointerDown instead. */
  hitTestFrame?: (clientX: number, clientY: number) => string | null
  onFramePointerDown?: (frameId: string, event: MouseEvent) => void
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
        if (api.hitTestFrame && api.onFramePointerDown) {
          const frameId = api.hitTestFrame(event.clientX, event.clientY)
          if (frameId) {
            api.onFramePointerDown(frameId, event)
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
          api.canvasClickAt(event.clientX, event.clientY)
        } else if (api.canvasDeselect) {
          api.canvasDeselect()
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
        api.onDragMove(leftDrag.startClientX, leftDrag.startClientY, event.clientX, event.clientY)
      }
    }

    const onMouseUp = (event: MouseEvent) => {
      if (middleDrag && event.button === 1) {
        middleDrag = null
      }

      if (leftDrag && event.button === 0) {
        if (leftDrag.dragging && api.onDragEnd) {
          api.onDragEnd(leftDrag.startClientX, leftDrag.startClientY, event.clientX, event.clientY)
        } else {
          // Was a click, not a drag
          if (api.canvasClickAt) {
            api.canvasClickAt(event.clientX, event.clientY)
          } else if (api.canvasDeselect) {
            api.canvasDeselect()
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
