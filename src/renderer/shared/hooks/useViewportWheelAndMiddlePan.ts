import { useEffect } from 'react'
import {
  classifyViewportWheel,
  isOverlayUiTarget,
  middleDragDelta,
  shouldStartMouseViewportPan,
} from '../../../shared/gesture-utils'

interface ViewportWheelAndMiddlePanApi {
  canvasZoom: (deltaY: number, mouseX: number, mouseY: number) => void
  canvasPan: (deltaX: number, deltaY: number) => void
}

export function useViewportWheelAndMiddlePan(
  enabled: boolean,
  api: ViewportWheelAndMiddlePanApi,
) {
  useEffect(() => {
    if (!enabled) return

    let middleDrag: { screenX: number; screenY: number } | null = null

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
      if (!shouldStartMouseViewportPan(event)) return
      middleDrag = { screenX: event.screenX, screenY: event.screenY }
      event.preventDefault()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!middleDrag) return
      const delta = middleDragDelta(middleDrag, event)
      middleDrag = { screenX: event.screenX, screenY: event.screenY }
      api.canvasPan(delta.deltaX, delta.deltaY)
    }

    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 1) middleDrag = null
    }

    const cleanup = () => {
      middleDrag = null
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
