import { getStroke } from 'perfect-freehand'
import type { AnnotationDrawing, CanvasSceneEntity, LayoutUpdateData } from '../../shared/types'
import { canvasToScreenX, canvasToScreenY } from '../../shared/gesture-utils'
import { PERFECT_FREEHAND_ENABLED } from '../../shared/featureFlags'
import { pathD } from './annotationMath'

function freehandPathD(points: { x: number; y: number }[], size: number): string {
  const outline = getStroke(
    points.map((p) => [p.x, p.y]),
    {
      size: size * 1.6,
      thinning: 0.5,
      smoothing: 0.8,
      streamline: 0.75,
      last: true,
    },
  )
  if (!outline.length) return ''
  const d = outline.reduce(
    (acc, [x, y], i) => acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`),
    '',
  )
  return d + ' Z'
}

export function DrawingLayer({
  drawing,
  layout,
  active,
  onSelect,
}: {
  drawing: AnnotationDrawing
  layout: LayoutUpdateData
  active?: boolean
  onSelect?: () => void
}) {
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={window.innerWidth}
      height={window.innerHeight}
      viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
      aria-hidden="true"
    >
      {drawing.strokes.map((stroke) => {
        const points = stroke.points.map((point) => ({
          x: canvasToScreenX(layout, point.x),
          y: canvasToScreenY(layout, point.y) - layout.canvasOrigin.y,
        }))
        const visibleWidth = Math.max(1, stroke.width * layout.zoom)
        const hitWidth = Math.max(12, visibleWidth + 10)
        const strokedD = pathD(points)
        const filledD = PERFECT_FREEHAND_ENABLED ? freehandPathD(points, visibleWidth) : ''
        return (
          <g key={stroke.id}>
            {onSelect ? (
              <path
                data-overlay-ui
                d={strokedD}
                fill="none"
                stroke="transparent"
                strokeWidth={hitWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.stopPropagation()
                  onSelect()
                }}
              />
            ) : null}
            {PERFECT_FREEHAND_ENABLED ? (
              <path
                d={filledD}
                fill={stroke.color}
                opacity={active ? 1 : 0.92}
              />
            ) : (
              <path
                d={strokedD}
                fill="none"
                stroke={stroke.color}
                strokeWidth={visibleWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={active ? 1 : 0.92}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function SavedDrawingEntities({
  entities,
  layoutData,
  selectedEntityIds,
  onSelect,
}: {
  entities: CanvasSceneEntity[]
  layoutData: LayoutUpdateData
  selectedEntityIds: string[]
  onSelect?: (id: string) => void
}) {
  const drawings = entities.filter(
    (e): e is import('../../shared/types').CanvasSceneDrawingEntity => e.kind === 'drawing',
  )
  if (drawings.length === 0) return null

  return (
    <>
      {drawings.map((drawing) => {
        const isSelected = selectedEntityIds.includes(drawing.id)
        return (
          <DrawingLayer
            key={drawing.id}
            drawing={{ version: 1, bounds: { x: drawing.canvasX, y: drawing.canvasY, width: drawing.width, height: drawing.height }, strokes: drawing.strokes }}
            layout={layoutData}
            active={isSelected}
            onSelect={onSelect ? () => onSelect(drawing.id) : undefined}
          />
        )
      })}
    </>
  )
}
