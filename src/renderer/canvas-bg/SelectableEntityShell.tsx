import { useContext, useRef } from 'react'
import { EntityHoverSetterContext } from './EntityHoverProvider'
import { useCornerResize, useEdgeResize } from './useEntityResize'
import { CornerResizeHandle, EdgeResizeHandle } from './ResizeHandles'
import { useDragGesture } from '../shared/useDragGesture'
import type { AspectRatioResizeMode, EntityResizePatch } from './entityConstants'
import type { SelectionModifiers } from '../../shared/types'

// --- Selectable Entity Shell (shared wrapper for text blocks, file blocks, etc.) ---

type DragToken = { lastDx: number; lastDy: number }
type DragTarget =
  | { kind: 'entity'; id: string }
  | { kind: 'group'; id: string }

type EntityDragToken = DragToken & {
  target: DragTarget
}

const GROUP_CHILD_DRAG_THRESHOLD_PX = 3

export function SelectableEntityShell({
  id,
  canvasX,
  canvasY,
  width,
  height,
  getZoom,
  minWidth,
  minHeight,
  isDark,
  isSelected,
  isMarqueePreview,
  background,
  borderRadius,
  showCardShadow = true,
  onSelect,
  onDoubleClick,
  onResize,
  onDragStart,
  onDrag,
  onDragEnd,
  selectedGroupDragTargetId = null,
  onGroupDragStart,
  onGroupDrag,
  onGroupDragEnd,
  shouldStartDrag,
  overflowVisible = false,
  showResizeHandles = true,
  aspectRatioResizeMode = 'off',
  children,
}: {
  id: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  getZoom: () => number
  minWidth: number
  minHeight: number
  isDark: boolean
  isSelected: boolean
  isMarqueePreview: boolean
  background: string
  borderRadius?: number
  showCardShadow?: boolean
  onSelect: (id: string, modifiers?: SelectionModifiers) => void
  onDoubleClick?: (id: string, event: React.MouseEvent<HTMLDivElement>) => void
  onResize: (id: string, patch: EntityResizePatch) => void
  onDragStart: (id: string) => void
  onDrag: (id: string, dx: number, dy: number) => void
  onDragEnd: () => void
  selectedGroupDragTargetId?: string | null
  onGroupDragStart?: (groupId: string) => void
  onGroupDrag?: (groupId: string, dx: number, dy: number) => void
  onGroupDragEnd?: () => void
  shouldStartDrag?: (e: PointerEvent) => boolean
  overflowVisible?: boolean
  showResizeHandles?: boolean
  aspectRatioResizeMode?: AspectRatioResizeMode
  children: React.ReactNode
}) {
  const setHoveredEntityId = useContext(EntityHoverSetterContext)
  const ref = useRef<HTMLDivElement>(null)
  const isSelectedRef = useRef(isSelected)
  const selectedGroupDragTargetIdRef = useRef(selectedGroupDragTargetId)
  const suppressNextGroupClickRef = useRef(false)
  isSelectedRef.current = isSelected
  selectedGroupDragTargetIdRef.current = selectedGroupDragTargetId

  const clearSuppressedGroupClick = () => {
    window.setTimeout(() => {
      suppressNextGroupClickRef.current = false
    }, 0)
  }

  useDragGesture<EntityDragToken>({
    target: ref,
    threshold: selectedGroupDragTargetId ? GROUP_CHILD_DRAG_THRESHOLD_PX : 0,
    stopPropagation: true,
    filter: (event) => {
      if (event.button !== 0) return false
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-resize-handle]')) return false
      if (shouldStartDrag && !shouldStartDrag(event)) return false
      return true
    },
    onBegin: (ctx) => {
      const { shift, meta, ctrl } = ctx.modifiers
      if (shift || meta || ctrl) {
        // Additive click: toggle this entity's selection without starting a drag.
        onSelect(id, { shift, meta, ctrl })
        return null
      }
      const groupDragTargetId = selectedGroupDragTargetIdRef.current
      if (groupDragTargetId && onGroupDragStart && onGroupDrag && onGroupDragEnd) {
        suppressNextGroupClickRef.current = true
        onGroupDragStart(groupDragTargetId)
        if (ctx.dx !== 0 || ctx.dy !== 0) onGroupDrag(groupDragTargetId, ctx.dx, ctx.dy)
        return {
          lastDx: ctx.dx,
          lastDy: ctx.dy,
          target: { kind: 'group', id: groupDragTargetId },
        }
      }
      if (!isSelectedRef.current) onSelect(id)
      onDragStart(id)
      return { lastDx: 0, lastDy: 0, target: { kind: 'entity', id } }
    },
    onUpdate: (ctx, token) => {
      const dx = ctx.dx - token.lastDx
      const dy = ctx.dy - token.lastDy
      token.lastDx = ctx.dx
      token.lastDy = ctx.dy
      if (dx === 0 && dy === 0) return
      if (token.target.kind === 'group') {
        onGroupDrag?.(token.target.id, dx, dy)
        return
      }
      onDrag(id, dx, dy)
    },
    onCommit: (_ctx, token) => {
      if (token.target.kind === 'group') {
        onGroupDragEnd?.()
        clearSuppressedGroupClick()
        return
      }
      onDragEnd()
    },
    onCancel: (token) => {
      if (token.target.kind === 'group') {
        onGroupDragEnd?.()
        clearSuppressedGroupClick()
        return
      }
      onDragEnd()
    },
  })

  const zoom = getZoom()
  const resizeArgs = { id, width, height, canvasX, canvasY, zoom, minWidth, minHeight, onResize, aspectRatioResizeMode }
  const resizeTL = useCornerResize({ ...resizeArgs, corner: 'top-left' })
  const resizeTR = useCornerResize({ ...resizeArgs, corner: 'top-right' })
  const resizeBL = useCornerResize({ ...resizeArgs, corner: 'bottom-left' })
  const resizeBR = useCornerResize({ ...resizeArgs, corner: 'bottom-right' })
  const resizeT = useEdgeResize({ ...resizeArgs, edge: 'top' })
  const resizeR = useEdgeResize({ ...resizeArgs, edge: 'right' })
  const resizeB = useEdgeResize({ ...resizeArgs, edge: 'bottom' })
  const resizeL = useEdgeResize({ ...resizeArgs, edge: 'left' })

  return (
    <div
      ref={ref}
      className="absolute pointer-events-auto"
      style={{
        left: canvasX,
        top: canvasY,
        width,
        height,
        background,
        boxShadow: showCardShadow ? (isDark ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.08)') : undefined,
        overflow: isSelected || overflowVisible ? 'visible' : 'hidden',
        cursor: 'default',
        borderRadius,
        touchAction: 'none',
      }}
      onMouseEnter={() => setHoveredEntityId(id)}
      onMouseLeave={() => setHoveredEntityId(null)}
      onClick={(event) => {
        const groupDragTargetId = selectedGroupDragTargetIdRef.current
        if (!groupDragTargetId) return
        if (suppressNextGroupClickRef.current) {
          event.preventDefault()
          event.stopPropagation()
          suppressNextGroupClickRef.current = false
          return
        }
        const target = event.target as HTMLElement | null
        if (target?.closest('[data-resize-handle], button, input, textarea')) return
        onSelect(id, {
          shift: event.shiftKey,
          meta: event.metaKey,
          ctrl: event.ctrlKey,
        })
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        if (!onDoubleClick) return
        const target = event.target as HTMLElement | null
        if (target?.closest('[data-resize-handle], button, input, textarea')) return
        onDoubleClick(id, event)
      }}
    >
      {children}
      {isSelected && showResizeHandles && (
        <>
          <EdgeResizeHandle edge="top" beginResize={resizeT} scaleWithZoom />
          <EdgeResizeHandle edge="right" beginResize={resizeR} scaleWithZoom />
          <EdgeResizeHandle edge="bottom" beginResize={resizeB} scaleWithZoom />
          <EdgeResizeHandle edge="left" beginResize={resizeL} scaleWithZoom />
          <CornerResizeHandle corner="top-left" isDark={isDark} beginResize={resizeTL} scaleWithZoom />
          <CornerResizeHandle corner="top-right" isDark={isDark} beginResize={resizeTR} scaleWithZoom />
          <CornerResizeHandle corner="bottom-left" isDark={isDark} beginResize={resizeBL} scaleWithZoom />
          <CornerResizeHandle corner="bottom-right" isDark={isDark} beginResize={resizeBR} scaleWithZoom />
        </>
      )}
    </div>
  )
}
