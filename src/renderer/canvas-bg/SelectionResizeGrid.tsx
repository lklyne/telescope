import type { AspectRatioResizeMode, EntityResizePatch } from './entityConstants'
import { CornerResizeHandle, EdgeResizeHandle } from './ResizeHandles'

/**
 * Renders the standard 4-edge + 4-corner resize handle grid around a single
 * selected entity. It is visual-only; canvas resize gestures are routed
 * through aboveView's canvas pointer router.
 */
export function SelectionResizeGrid({
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
  return (
    <>
      <EdgeResizeHandle edge="top" />
      <EdgeResizeHandle edge="right" />
      <EdgeResizeHandle edge="bottom" />
      <EdgeResizeHandle edge="left" />
      <CornerResizeHandle corner="top-left" isDark={isDark} />
      <CornerResizeHandle corner="top-right" isDark={isDark} />
      <CornerResizeHandle corner="bottom-left" isDark={isDark} />
      <CornerResizeHandle corner="bottom-right" isDark={isDark} />
    </>
  )
}
