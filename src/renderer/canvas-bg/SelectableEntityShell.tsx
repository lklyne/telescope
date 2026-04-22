import { useContext, useRef } from 'react'
import { EntityHoverSetterContext } from './EntityHoverProvider'
import { useCornerResize, useEdgeResize } from './useEntityResize'
import { CornerResizeHandle, EdgeResizeHandle } from './ResizeHandles'
import { useDragGesture } from '../shared/useDragGesture'
import type { AspectRatioResizeMode, EntityResizePatch } from './entityConstants'
import type { SelectionModifiers } from '../../shared/types'

// --- Selectable Entity Shell (shared wrapper for text blocks, file blocks, etc.) ---

type DragToken = { lastDx: number; lastDy: number }

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
  onResize,
  onDragStart,
  onDrag,
  onDragEnd,
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
  onResize: (id: string, patch: EntityResizePatch) => void
  onDragStart: (id: string) => void
  onDrag: (id: string, dx: number, dy: number) => void
  onDragEnd: () => void
  shouldStartDrag?: (e: PointerEvent) => boolean
  overflowVisible?: boolean
  showResizeHandles?: boolean
  aspectRatioResizeMode?: AspectRatioResizeMode
  children: React.ReactNode
}) {
  const setHoveredEntityId = useContext(EntityHoverSetterContext)
  const ref = useRef<HTMLDivElement>(null)
  const isSelectedRef = useRef(isSelected)
  isSelectedRef.current = isSelected

  useDragGesture<DragToken>({
    target: ref,
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
      if (!isSelectedRef.current) onSelect(id)
      onDragStart(id)
      return { lastDx: 0, lastDy: 0 }
    },
    onUpdate: (ctx, token) => {
      const dx = ctx.dx - token.lastDx
      const dy = ctx.dy - token.lastDy
      token.lastDx = ctx.dx
      token.lastDy = ctx.dy
      if (dx !== 0 || dy !== 0) onDrag(id, dx, dy)
    },
    onCommit: () => onDragEnd(),
    onCancel: () => onDragEnd(),
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
