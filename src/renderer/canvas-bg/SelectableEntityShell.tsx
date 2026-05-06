import { useContext } from 'react'
import { EntityHoverSetterContext } from './EntityHoverProvider'
import { CornerResizeHandle, EdgeResizeHandle } from './ResizeHandles'
import type { AspectRatioResizeMode, EntityResizePatch } from './entityConstants'
import type { SelectionModifiers } from '../../shared/types'

// --- Selectable Entity Shell (shared wrapper for text blocks, file blocks, etc.) ---

export function SelectableEntityShell({
  id,
  canvasX,
  canvasY,
  width,
  height,
  isDark,
  isSelected,
  background,
  borderRadius,
  showCardShadow = true,
  onDoubleClick,
  overflowVisible = false,
  showResizeHandles = true,
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

  return (
    <div
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
          <EdgeResizeHandle edge="top" scaleWithZoom />
          <EdgeResizeHandle edge="right" scaleWithZoom />
          <EdgeResizeHandle edge="bottom" scaleWithZoom />
          <EdgeResizeHandle edge="left" scaleWithZoom />
          <CornerResizeHandle corner="top-left" isDark={isDark} scaleWithZoom />
          <CornerResizeHandle corner="top-right" isDark={isDark} scaleWithZoom />
          <CornerResizeHandle corner="bottom-left" isDark={isDark} scaleWithZoom />
          <CornerResizeHandle corner="bottom-right" isDark={isDark} scaleWithZoom />
        </>
      )}
    </div>
  )
}
