import type { RefObject } from 'react'
import { useDragGesture } from '../shared/useDragGesture'

const GROUP_DRAG_THRESHOLD_PX = 3

type GroupDragToken = {
  lastDx: number
  lastDy: number
}

export function useGroupDragGesture({
  target,
  groupId,
  enabled = true,
  selectOnBegin = true,
  selectOnPointerDown = false,
  onSelectGroup,
  onStartDragGroup,
  onDragGroup,
  onEndDragGroup,
  filter,
}: {
  target: RefObject<HTMLElement | null>
  groupId: string
  enabled?: boolean
  selectOnBegin?: boolean
  selectOnPointerDown?: boolean
  onSelectGroup?: (groupId: string) => void
  onStartDragGroup: (groupId: string) => void
  onDragGroup: (groupId: string, dx: number, dy: number) => void
  onEndDragGroup: () => void
  filter?: (event: PointerEvent) => boolean
}): void {
  useDragGesture<GroupDragToken>({
    target,
    threshold: GROUP_DRAG_THRESHOLD_PX,
    stopPropagation: true,
    filter: (event) => {
      if (!enabled) return false
      if (event.button !== 0) return false
      const targetElement = event.target as HTMLElement | null
      if (targetElement?.closest('[data-resize-handle], input, textarea, button')) {
        return false
      }
      if (filter && !filter(event)) return false
      return true
    },
    onPointerDown: () => {
      if (selectOnPointerDown) onSelectGroup?.(groupId)
    },
    onBegin: (ctx) => {
      if (selectOnBegin && !selectOnPointerDown) onSelectGroup?.(groupId)
      onStartDragGroup(groupId)
      if (ctx.dx !== 0 || ctx.dy !== 0) onDragGroup(groupId, ctx.dx, ctx.dy)
      return { lastDx: ctx.dx, lastDy: ctx.dy }
    },
    onUpdate: (ctx, token) => {
      const dx = ctx.dx - token.lastDx
      const dy = ctx.dy - token.lastDy
      token.lastDx = ctx.dx
      token.lastDy = ctx.dy
      if (dx !== 0 || dy !== 0) onDragGroup(groupId, dx, dy)
    },
    onCommit: () => onEndDragGroup(),
    onCancel: () => onEndDragGroup(),
  })
}
