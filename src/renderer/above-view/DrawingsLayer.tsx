import { getStroke } from 'perfect-freehand'
import type {
  AnnotationDrawing,
  AnnotationDrawingStroke,
  CanvasSceneEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { canvasToScreenX, canvasToScreenY } from '../../shared/gesture-utils'
import { PERFECT_FREEHAND_ENABLED } from '../../shared/featureFlags'
import { pathD } from './annotationMath'

function freehandPathD(points: { x: number; y: number }[], size: number): string {
  const outline = getStroke(
    points.map((p) => [p.x, p.y]),
    {
      size: size * 1.6,
      thinning: 0,
      smoothing: 0.8,
      streamline: 0.75,
      simulatePressure: false,
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

// Parse '#rgb' or '#rrggbb' to {r,g,b}. Returns null if not a hex color.
function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  if (m3) {
    return {
      r: parseInt(m3[1] + m3[1], 16),
      g: parseInt(m3[2] + m3[2], 16),
      b: parseInt(m3[3] + m3[3], 16),
    }
  }
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (m6) {
    return {
      r: parseInt(m6[1], 16),
      g: parseInt(m6[2], 16),
      b: parseInt(m6[3], 16),
    }
  }
  return null
}

function rgba(color: string, alpha: number): string {
  const rgb = hexToRgb(color)
  if (!rgb) return color
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

// Stops mirror the agentation.com highlight: denser at the ends, lighter in the
// middle, applied along the stroke's first→last direction.
const HIGHLIGHT_ALPHA_STOPS: Array<{ offset: string; alpha: number }> = [
  { offset: '0%', alpha: 0.5 },
  { offset: '4%', alpha: 0.15 },
  { offset: '96%', alpha: 0.3 },
  { offset: '100%', alpha: 0.6 },
]

// Future: try `mix-blend-mode: multiply` so crossing strokes darken naturally,
// and a wider blurred under-pass for a paper-bleed look.

function HighlightStroke({
  stroke,
  points,
  visibleWidth,
  active,
  filterId,
}: {
  stroke: AnnotationDrawingStroke
  points: { x: number; y: number }[]
  visibleWidth: number
  active: boolean
  filterId: string
}) {
  if (points.length === 0) return null
  const first = points[0]
  const last = points[points.length - 1]
  // If the stroke is essentially a dot, nudge the gradient axis so it still
  // renders something instead of degenerating to a point.
  const dx = last.x - first.x
  const dy = last.y - first.y
  const len = Math.hypot(dx, dy)
  const x1 = first.x
  const y1 = first.y
  const x2 = len < 1 ? first.x + 1 : last.x
  const y2 = len < 1 ? first.y : last.y
  const gradientId = `hl-grad-${stroke.id}`
  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        >
          {HIGHLIGHT_ALPHA_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={rgba(stroke.color, s.alpha)} />
          ))}
        </linearGradient>
      </defs>
      <path
        d={pathD(points)}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={visibleWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${filterId})`}
        opacity={active ? 1 : 0.95}
      />
    </>
  )
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
  const grainFilterId = 'highlight-grain'
  const hasHighlight = drawing.strokes.some((s) => s.brushType === 'highlight')
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={window.innerWidth}
      height={window.innerHeight}
      viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
      aria-hidden="true"
    >
      {hasHighlight ? (
        <defs>
          <filter
            id={grainFilterId}
            x="-5%"
            y="-5%"
            width="110%"
            height="110%"
            filterUnits="objectBoundingBox"
            primitiveUnits="userSpaceOnUse"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves={2}
              seed={4}
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0.35 0 0 0 0.78"
              result="noiseAlpha"
            />
            <feComposite in="SourceGraphic" in2="noiseAlpha" operator="in" />
          </filter>
        </defs>
      ) : null}
      {drawing.strokes.map((stroke) => {
        const points = stroke.points.map((point) => ({
          x: canvasToScreenX(layout, point.x),
          y: canvasToScreenY(layout, point.y) - layout.canvasOrigin.y,
        }))
        const visibleWidth = Math.max(1, stroke.width * layout.zoom)
        const hitWidth = Math.max(12, visibleWidth + 10)
        const strokedD = pathD(points)
        const isHighlight = stroke.brushType === 'highlight'
        const filledD =
          PERFECT_FREEHAND_ENABLED && !isHighlight ? freehandPathD(points, visibleWidth) : ''
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
            {isHighlight ? (
              <HighlightStroke
                stroke={stroke}
                points={points}
                visibleWidth={visibleWidth}
                active={active ?? false}
                filterId={grainFilterId}
              />
            ) : PERFECT_FREEHAND_ENABLED ? (
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
