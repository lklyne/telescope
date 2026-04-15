import type { AspectRatioResizeMode, EntityResizePatch } from './entityConstants'
import { CornerResizeHandle, EdgeResizeHandle } from './ResizeHandles'
import { useCornerResize, useEdgeResize } from './useEntityResize'

/**
 * Renders the standard 4-edge + 4-corner resize handle grid around a single
 * selected entity. Consolidates what used to be repeated in every selection
 * overlay (frame, group, text/file/drawing).
 */
export function SelectionResizeGrid({
  id,
  width,
  height,
  canvasX,
  canvasY,
  zoom,
  minWidth,
  minHeight,
  onResize,
  aspectRatioResizeMode = 'off',
  isDark,
}: {
  id: string
  width: number
  height: number
  canvasX: number
  canvasY: number
  zoom: number
  minWidth: number
  minHeight: number
  onResize: (id: string, patch: EntityResizePatch) => void
  aspectRatioResizeMode?: AspectRatioResizeMode
  isDark: boolean
}) {
  const resizeArgs = {
    id,
    width,
    height,
    canvasX,
    canvasY,
    zoom,
    minWidth,
    minHeight,
    onResize,
    aspectRatioResizeMode,
  }
  const resizeTL = useCornerResize({ ...resizeArgs, corner: 'top-left' })
  const resizeTR = useCornerResize({ ...resizeArgs, corner: 'top-right' })
  const resizeBL = useCornerResize({ ...resizeArgs, corner: 'bottom-left' })
  const resizeBR = useCornerResize({ ...resizeArgs, corner: 'bottom-right' })
  const resizeT = useEdgeResize({ ...resizeArgs, edge: 'top' })
  const resizeR = useEdgeResize({ ...resizeArgs, edge: 'right' })
  const resizeB = useEdgeResize({ ...resizeArgs, edge: 'bottom' })
  const resizeL = useEdgeResize({ ...resizeArgs, edge: 'left' })

  return (
    <>
      <EdgeResizeHandle edge="top" beginResize={resizeT} />
      <EdgeResizeHandle edge="right" beginResize={resizeR} />
      <EdgeResizeHandle edge="bottom" beginResize={resizeB} />
      <EdgeResizeHandle edge="left" beginResize={resizeL} />
      <CornerResizeHandle corner="top-left" isDark={isDark} beginResize={resizeTL} />
      <CornerResizeHandle corner="top-right" isDark={isDark} beginResize={resizeTR} />
      <CornerResizeHandle corner="bottom-left" isDark={isDark} beginResize={resizeBL} />
      <CornerResizeHandle corner="bottom-right" isDark={isDark} beginResize={resizeBR} />
    </>
  )
}
