import { useCallback, useEffect, useRef } from 'react'

interface ScreenPoint {
  x: number
  y: number
}

interface DragHandlers {
  onMove: (dx: number, dy: number, event: MouseEvent) => void
  onEnd?: (event: MouseEvent | FocusEvent) => void
}

export function useWindowScreenDrag() {
  const handlersRef = useRef<DragHandlers | null>(null)
  const lastPointRef = useRef<ScreenPoint | null>(null)

  const stopDrag = useCallback((event?: MouseEvent | FocusEvent) => {
    const handlers = handlersRef.current
    handlersRef.current = null
    lastPointRef.current = null
    handlers?.onEnd?.(event ?? new FocusEvent('blur'))
  }, [])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const handlers = handlersRef.current
      const lastPoint = lastPointRef.current
      if (!handlers || !lastPoint) return
      const dx = event.screenX - lastPoint.x
      const dy = event.screenY - lastPoint.y
      lastPointRef.current = { x: event.screenX, y: event.screenY }
      handlers.onMove(dx, dy, event)
    }

    const handleMouseUp = (event: MouseEvent) => {
      stopDrag(event)
    }

    const handleWindowBlur = (event: FocusEvent) => {
      stopDrag(event)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [stopDrag])

  const startDrag = useCallback((startPoint: ScreenPoint, handlers: DragHandlers) => {
    handlersRef.current = handlers
    lastPointRef.current = startPoint
  }, [])

  const isDragging = useCallback(() => handlersRef.current !== null, [])

  return {
    isDragging,
    startDrag,
    stopDrag,
  }
}
