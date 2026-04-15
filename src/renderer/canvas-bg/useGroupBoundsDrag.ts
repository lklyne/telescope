import { useCallback } from 'react'
import type { CanvasBgElectronAPI } from '../../shared/types'

const GROUP_DRAG_THRESHOLD_PX = 3

/**
 * Pointer-down handler for group bounds: selects the group, then promotes the
 * gesture to a drag once the cursor moves past a small threshold. Drag is
 * routed back through the IPC API (start/drag/end).
 *
 * Returns a stable callback suitable for `<GroupBoundsLayer onPointerDown>`.
 */
export function useGroupBoundsDrag(
  api: CanvasBgElectronAPI,
): (groupId: string, e: React.PointerEvent) => void {
  return useCallback(
    (groupId, e) => {
      e.stopPropagation()
      api.selectGroup(groupId)
      const target = e.currentTarget as HTMLElement
      const pointerId = e.pointerId
      const startX = e.clientX
      const startY = e.clientY
      let dragging = false
      try { target.setPointerCapture(pointerId) } catch { /* ignore */ }
      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        if (!dragging) {
          const dx = moveEvent.clientX - startX
          const dy = moveEvent.clientY - startY
          if (Math.abs(dx) < GROUP_DRAG_THRESHOLD_PX && Math.abs(dy) < GROUP_DRAG_THRESHOLD_PX) return
          dragging = true
          api.startDragGroup(groupId)
        }
        api.dragGroup(groupId, moveEvent.movementX, moveEvent.movementY)
      }
      const cleanup = () => {
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
        target.removeEventListener('pointercancel', onCancel)
        target.removeEventListener('lostpointercapture', onCancel)
        if (target.hasPointerCapture?.(pointerId)) {
          try { target.releasePointerCapture(pointerId) } catch { /* ignore */ }
        }
      }
      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return
        if (dragging) api.endDragGroup()
        cleanup()
      }
      const onCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== pointerId) return
        if (dragging) api.endDragGroup()
        cleanup()
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onCancel)
      target.addEventListener('lostpointercapture', onCancel)
    },
    [api],
  )
}
