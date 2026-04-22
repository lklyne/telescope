import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CanvasBgElectronAPI, LayoutUpdateData } from '../../shared/types'
import {
  buildDragCopyPreview,
  dragCopyAnchorPoint,
  type ChromeDragSession,
  type DragCopyPreview,
} from './canvasGeometry'

export function useFrameChromeDrag({
  api,
  layoutRef,
}: {
  api: CanvasBgElectronAPI
  layoutRef: RefObject<LayoutUpdateData>
}) {
  const chromeDraggingRef = useRef(false)
  const dragFrameIdRef = useRef<string | null>(null)
  const chromeDragSessionRef = useRef<ChromeDragSession | null>(null)
  const chromeLastPosRef = useRef({ x: 0, y: 0 })
  const [dragCopyPreview, setDragCopyPreview] = useState<DragCopyPreview[]>([])
  const [isChromeDragging, setIsChromeDragging] = useState(false)

  const resetDragState = useCallback(() => {
    chromeDraggingRef.current = false
    setIsChromeDragging(false)
    dragFrameIdRef.current = null
    chromeDragSessionRef.current = null
    setDragCopyPreview([])
    api.endDragFrame()
  }, [api])

  const syncChromeDragCopyMode = useCallback(
    (copyMode: boolean) => {
      const session = chromeDragSessionRef.current
      const dragFrameId = dragFrameIdRef.current
      if (!session || session.copyMode === copyMode || !dragFrameId) return

      session.copyMode = copyMode

      if (copyMode) {
        if (session.totalScreenDx !== 0 || session.totalScreenDy !== 0) {
          api.dragFrame(dragFrameId, -session.totalScreenDx, -session.totalScreenDy)
        }
        setDragCopyPreview(buildDragCopyPreview(session, layoutRef.current))
        return
      }

      setDragCopyPreview([])
      if (session.totalScreenDx !== 0 || session.totalScreenDy !== 0) {
        api.dragFrame(dragFrameId, session.totalScreenDx, session.totalScreenDy)
      }
    },
    [api, layoutRef],
  )

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!chromeDraggingRef.current) return
      if (event.buttons === 0) {
        resetDragState()
        return
      }
      const dx = event.screenX - chromeLastPosRef.current.x
      const dy = event.screenY - chromeLastPosRef.current.y
      chromeLastPosRef.current = { x: event.screenX, y: event.screenY }
      const session = chromeDragSessionRef.current
      const dragFrameId = dragFrameIdRef.current
      if (!dragFrameId || !session) return
      if (event.altKey !== session.copyMode) {
        syncChromeDragCopyMode(event.altKey)
      }
      session.totalScreenDx += dx
      session.totalScreenDy += dy
      if (session.copyMode) {
        setDragCopyPreview(buildDragCopyPreview(session, layoutRef.current))
        return
      }
      api.dragFrame(dragFrameId, dx, dy)
    }

    const handleMouseUp = () => {
      const session = chromeDragSessionRef.current
      if (session?.copyMode) {
        const anchor = dragCopyAnchorPoint(session, layoutRef.current)
        api.dragCopyFrame(session.frameId, anchor.x, anchor.y)
      }
      resetDragState()
    }

    const handleWindowBlur = () => {
      // Skip if a drag is actively in progress — blur can fire spuriously
      // when selectFrame IPC triggers focus changes in the main process.
      // The mousemove handler's buttons check will clean up if the user
      // truly released the mouse while the window was blurred.
      if (chromeDraggingRef.current) return
      resetDragState()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [api, layoutRef, resetDragState, syncChromeDragCopyMode])

  const handleChromeMouseDown = useCallback(
    (frameId: string, event: React.MouseEvent | MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const allowTriggerDrag = Boolean(target.closest('[data-frame-drag-trigger]'))
      if (
        !allowTriggerDrag &&
        target.closest(
          'button, [role="combobox"], [data-select]',
        )
      ) {
        return
      }

      const layout = layoutRef.current
      const isAdditive = event.shiftKey || event.metaKey || event.ctrlKey
      if (isAdditive) {
        // Toggle this frame in/out of the selection. A shift/meta-click is a
        // pure selection gesture — do not start a drag.
        api.selectFrame(frameId, {
          shift: event.shiftKey,
          meta: event.metaKey,
          ctrl: event.ctrlKey,
        })
        event.preventDefault()
        return
      }
      if (!layout.selectedEntityIds.includes(frameId)) {
        api.selectFrame(frameId)
      }
      const selectedEntityIds = layout.selectedEntityIds.includes(frameId)
        ? layout.selectedEntityIds
        : [frameId]

      chromeDragSessionRef.current = {
        frameId,
        frames: layout.entities
          .filter((frame) => selectedEntityIds.includes(frame.id))
          .map((frame) => ({
            id: frame.id,
            screenX: frame.screenX,
            screenY: frame.screenY,
            screenWidth: frame.screenWidth,
            screenHeight: frame.screenHeight,
            canvasX: frame.canvasX,
            canvasY: frame.canvasY,
          })),
        totalScreenDx: 0,
        totalScreenDy: 0,
        copyMode: event.altKey,
      }

      api.startDragFrame(frameId)
      chromeDraggingRef.current = true
      setIsChromeDragging(true)
      dragFrameIdRef.current = frameId
      chromeLastPosRef.current = { x: event.screenX, y: event.screenY }

      if (event.altKey && chromeDragSessionRef.current) {
        setDragCopyPreview(
          buildDragCopyPreview(chromeDragSessionRef.current, layoutRef.current),
        )
      } else {
        setDragCopyPreview([])
      }

      event.preventDefault()
    },
    [api, layoutRef],
  )

  return {
    chromeDraggingRef,
    dragCopyPreview,
    handleChromeMouseDown,
    isChromeDragging,
    syncChromeDragCopyMode,
  }
}
