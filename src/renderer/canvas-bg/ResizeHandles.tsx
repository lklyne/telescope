import type { ResizeCorner, ResizeEdge } from './entityConstants'
import { HANDLE_SIZE, CORNER_CURSORS, EDGE_CURSORS } from './entityConstants'
import { selectionColor } from './canvasBgConstants'

export function CornerResizeHandle({
  corner,
  isDark,
  beginResize,
  scaleWithZoom = false,
}: {
  corner: ResizeCorner
  isDark: boolean
  beginResize?: (e: React.PointerEvent) => void
  scaleWithZoom?: boolean
}) {
  const half = scaleWithZoom ? `calc(${HANDLE_SIZE / 2}px / var(--canvas-zoom, 1))` : HANDLE_SIZE / 2
  const negHalf = scaleWithZoom ? `calc(-1 * ${HANDLE_SIZE / 2}px / var(--canvas-zoom, 1))` : -(HANDLE_SIZE / 2)
  const size = scaleWithZoom ? `calc(${HANDLE_SIZE}px / var(--canvas-zoom, 1))` : HANDLE_SIZE
  const borderWidth = scaleWithZoom ? `calc(1px / var(--canvas-zoom, 1))` : '1px'
  const pos: React.CSSProperties =
    corner === 'top-left' ? { top: negHalf, left: negHalf } :
    corner === 'top-right' ? { top: negHalf, right: negHalf } :
    corner === 'bottom-left' ? { bottom: negHalf, left: negHalf } :
    { bottom: negHalf, right: negHalf }

  return (
    <div
      data-resize-handle
      data-overlay-ui={scaleWithZoom ? undefined : true}
      onPointerDown={beginResize}
      style={{
        position: 'absolute',
        ...pos,
        width: size,
        height: size,
        boxSizing: 'border-box',
        background: 'white',
        border: `${borderWidth} solid ${selectionColor(isDark)}`,
        borderRadius: 0,
        cursor: CORNER_CURSORS[corner],
        pointerEvents: 'auto',
        zIndex: 1,
      }}
    />
  )
}

export function EdgeResizeHandle({
  edge,
  beginResize,
  scaleWithZoom = false,
}: {
  edge: ResizeEdge
  beginResize?: (e: React.PointerEvent) => void
  scaleWithZoom?: boolean
}) {
  const half = scaleWithZoom ? `calc(${HANDLE_SIZE / 2}px / var(--canvas-zoom, 1))` : HANDLE_SIZE / 2
  const negHalf = scaleWithZoom ? `calc(-1 * ${HANDLE_SIZE / 2}px / var(--canvas-zoom, 1))` : -(HANDLE_SIZE / 2)
  const size = scaleWithZoom ? `calc(${HANDLE_SIZE}px / var(--canvas-zoom, 1))` : HANDLE_SIZE
  const isHorizontal = edge === 'top' || edge === 'bottom'
  const pos: React.CSSProperties =
    edge === 'top' ? { top: negHalf, left: half, right: half } :
    edge === 'bottom' ? { bottom: negHalf, left: half, right: half } :
    edge === 'left' ? { left: negHalf, top: half, bottom: half } :
    { right: negHalf, top: half, bottom: half }

  return (
    <div
      data-resize-handle
      data-overlay-ui={scaleWithZoom ? undefined : true}
      onPointerDown={beginResize}
      style={{
        position: 'absolute',
        ...pos,
        width: isHorizontal ? undefined : size,
        height: isHorizontal ? size : undefined,
        cursor: EDGE_CURSORS[edge],
        pointerEvents: 'auto',
        zIndex: 1,
      }}
    />
  )
}
