import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CanvasInteractionState,
  CanvasSceneEntity,
  EdgeEnd,
  EdgeSide,
  WorkspaceEdge,
} from '../../shared/types'
import { resolveCanvasColor } from '../../shared/canvas-colors'
import { selectionColor, EDGE_COLOR_DEFAULT } from './canvasBgConstants'

// --- Constants ---

const SIDES: EdgeSide[] = ['top', 'right', 'bottom', 'left']
const DOT_RADIUS = 3
const DOT_HIT_RADIUS = 24
const DOT_OFFSET = 8
const SNAP_DISTANCE = 48
const CONTROL_POINT_MIN = 40
const CONTROL_POINT_MAX = 200

// --- Geometry helpers ---

interface AnchorPoint {
  x: number
  y: number
  side: EdgeSide
}

function getAnchorPoint(entity: CanvasSceneEntity, side: EdgeSide, zoom: number): AnchorPoint {
  const { screenX, screenY, screenWidth, screenHeight } = entity
  const dotOffset = DOT_OFFSET * zoom
  switch (side) {
    case 'top':
      return { x: screenX + screenWidth / 2, y: screenY - dotOffset, side }
    case 'bottom':
      return { x: screenX + screenWidth / 2, y: screenY + screenHeight + dotOffset, side }
    case 'left':
      return { x: screenX - dotOffset, y: screenY + screenHeight / 2, side }
    case 'right':
      return { x: screenX + screenWidth + dotOffset, y: screenY + screenHeight / 2, side }
  }
}

function controlPointOffset(side: EdgeSide, distance: number, zoom: number): { dx: number; dy: number } {
  const offset = Math.min(Math.max(distance * 0.4, CONTROL_POINT_MIN * zoom), CONTROL_POINT_MAX * zoom)
  switch (side) {
    case 'top':
      return { dx: 0, dy: -offset }
    case 'bottom':
      return { dx: 0, dy: offset }
    case 'left':
      return { dx: -offset, dy: 0 }
    case 'right':
      return { dx: offset, dy: 0 }
  }
}

function buildBezierPath(from: AnchorPoint, to: AnchorPoint, zoom: number): string {
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const cp1 = controlPointOffset(from.side, dist, zoom)
  const cp2 = controlPointOffset(to.side, dist, zoom)
  return `M ${from.x} ${from.y} C ${from.x + cp1.dx} ${from.y + cp1.dy}, ${to.x + cp2.dx} ${to.y + cp2.dy}, ${to.x} ${to.y}`
}

function findClosestAnchorTarget(
  entityMap: Map<string, CanvasSceneEntity>,
  fromEntityId: string,
  clientX: number,
  clientY: number,
  snapDistance: number,
  zoom: number,
): { entityId: string; side: EdgeSide; dist: number } | null {
  let bestTarget: { entityId: string; side: EdgeSide; dist: number } | null = null

  for (const [entityId, entity] of entityMap) {
    if (entityId === fromEntityId) continue
    for (const side of SIDES) {
      const pt = getAnchorPoint(entity, side, zoom)
      const dist = Math.hypot(pt.x - clientX, pt.y - clientY)
      if (dist < snapDistance && (!bestTarget || dist < bestTarget.dist)) {
        bestTarget = { entityId, side, dist }
      }
    }
  }

  return bestTarget
}

/** Pick the best sides to connect two entities when sides aren't specified. */
function autoSides(
  from: CanvasSceneEntity,
  to: CanvasSceneEntity,
): { fromSide: EdgeSide; toSide: EdgeSide } {
  const fromCx = from.screenX + from.screenWidth / 2
  const fromCy = from.screenY + from.screenHeight / 2
  const toCx = to.screenX + to.screenWidth / 2
  const toCy = to.screenY + to.screenHeight / 2
  const dx = toCx - fromCx
  const dy = toCy - fromCy
  if (Math.abs(dx) > Math.abs(dy)) {
    return { fromSide: dx > 0 ? 'right' : 'left', toSide: dx > 0 ? 'left' : 'right' }
  }
  return { fromSide: dy > 0 ? 'bottom' : 'top', toSide: dy > 0 ? 'top' : 'bottom' }
}

// --- Anchor dots for a single entity ---

function AnchorDots({
  entity,
  isDark,
  isDragging,
  zoom,
  onDragStart,
  onHoverEntity,
}: {
  entity: CanvasSceneEntity
  isDark: boolean
  isDragging: boolean
  zoom: number
  onDragStart: (entityId: string, side: EdgeSide, x: number, y: number) => void
  onHoverEntity: (entityId: string | null) => void
}) {
  const [hoveredSide, setHoveredSide] = useState<EdgeSide | null>(null)

  useEffect(() => {
    if (!isDragging) setHoveredSide(null)
  }, [isDragging])

  return (
    <>
      {SIDES.map((side) => {
        const pt = getAnchorPoint(entity, side, zoom)
        const showDot = hoveredSide === side
        return (
          <g key={side}>
            {showDot ? (
              <circle
                cx={pt.x}
                cy={pt.y}
                fill="white"
                r={DOT_RADIUS}
                stroke={selectionColor(isDark)}
                strokeWidth={1}
              />
            ) : null}
            {/* Smaller interaction target */}
            <circle
              cx={pt.x}
              cy={pt.y}
              fill="transparent"
              r={DOT_HIT_RADIUS}
              style={{ cursor: 'crosshair', pointerEvents: 'all' }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setHoveredSide(side)
                onDragStart(entity.id, side, e.clientX, e.clientY)
              }}
              onMouseEnter={() => {
                setHoveredSide(side)
                onHoverEntity(entity.id)
              }}
              onMouseLeave={() => {
                if (isDragging) return
                setHoveredSide((current) => (current === side ? null : current))
                onHoverEntity(null)
              }}
            />
          </g>
        )
      })}
    </>
  )
}

// --- Main EdgeLayer ---

export function EdgeLayer({
  edges,
  entities,
  hoveredEntityId,
  isDark,
  interaction,
  selectedEdgeId,
  selectedEntityIds,
  zoom,
  onBeginEdgeDrag,
  onCancelEdgeDrag,
  onCommitEdgeDrag,
  onSelectEdge,
  onHoverEntity,
  onUpdateEdgeDragTarget,
}: {
  edges: WorkspaceEdge[]
  entities: CanvasSceneEntity[]
  hoveredEntityId: string | null
  isDark: boolean
  interaction: CanvasInteractionState
  selectedEdgeId: string | null
  selectedEntityIds: string[]
  zoom: number
  onBeginEdgeDrag: (fromEntityId: string, fromSide: EdgeSide) => void
  onCancelEdgeDrag: () => void
  onCommitEdgeDrag: (fromEntityId: string, toEntityId: string, fromSide: EdgeSide, toSide: EdgeSide) => void
  onSelectEdge: (edgeId: string) => void
  onHoverEntity: (entityId: string | null) => void
  onUpdateEdgeDragTarget: (targetEntityId: string | null, targetSide: EdgeSide | null) => void
}) {
  const entityMap = useMemo(() => {
    const map = new Map<string, CanvasSceneEntity>()
    for (const e of entities) map.set(e.id, e)
    return map
  }, [entities])

  // --- Edge creation drag state ---
  const [dragState, setDragState] = useState<{
    fromEntityId: string
    fromSide: EdgeSide
    cursorX: number
    cursorY: number
  } | null>(null)

  const hoveredDragEntityIdRef = useRef<string | null>(null)
  const dragListenersRef = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // Clean up drag listeners on unmount
  useEffect(() => {
    return () => {
      if (dragListenersRef.current) {
        window.removeEventListener('mousemove', dragListenersRef.current.move)
        window.removeEventListener('mouseup', dragListenersRef.current.up)
        dragListenersRef.current = null
      }
    }
  }, [])

  const handleDragStart = useCallback(
    (entityId: string, side: EdgeSide, clientX: number, clientY: number) => {
      setDragState({ fromEntityId: entityId, fromSide: side, cursorX: clientX, cursorY: clientY })
      onBeginEdgeDrag(entityId, side)

      const handleMove = (e: MouseEvent) => {
        const bestTarget = findClosestAnchorTarget(entityMap, entityId, e.clientX, e.clientY, SNAP_DISTANCE, zoomRef.current)
        const nextHoveredEntityId = bestTarget?.entityId ?? null
        if (hoveredDragEntityIdRef.current !== nextHoveredEntityId) {
          hoveredDragEntityIdRef.current = nextHoveredEntityId
          onHoverEntity(nextHoveredEntityId)
          onUpdateEdgeDragTarget(bestTarget?.entityId ?? null, bestTarget?.side ?? null)
        }

        setDragState((prev) =>
          prev ? { ...prev, cursorX: e.clientX, cursorY: e.clientY } : null,
        )
      }

      const handleUp = (e: MouseEvent) => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        dragListenersRef.current = null

        const bestTarget = findClosestAnchorTarget(entityMap, entityId, e.clientX, e.clientY, SNAP_DISTANCE, zoomRef.current)

        if (bestTarget) {
          onCommitEdgeDrag(entityId, bestTarget.entityId, side, bestTarget.side)
        } else {
          onCancelEdgeDrag()
        }

        hoveredDragEntityIdRef.current = null
        onHoverEntity(null)
        onUpdateEdgeDragTarget(null, null)
        setDragState(null)
      }

      dragListenersRef.current = { move: handleMove, up: handleUp }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [entityMap, onBeginEdgeDrag, onCancelEdgeDrag, onCommitEdgeDrag, onHoverEntity, onUpdateEdgeDragTarget],
  )

  // Render existing edges
  const edgePaths = useMemo(() => {
    const paths: Array<{
      id: string
      d: string
      selected: boolean
      fromEnd: EdgeEnd
      toEnd: EdgeEnd
      color?: string
    }> = []

    for (const edge of edges) {
      const fromEntity = entityMap.get(edge.fromEntityId)
      const toEntity = entityMap.get(edge.toEntityId)
      if (!fromEntity || !toEntity) continue

      const { fromSide, toSide } = edge.fromSide && edge.toSide
        ? { fromSide: edge.fromSide, toSide: edge.toSide }
        : autoSides(fromEntity, toEntity)

      const from = getAnchorPoint(fromEntity, fromSide, zoom)
      const to = getAnchorPoint(toEntity, toSide, zoom)
      const d = buildBezierPath(from, to, zoom)
      paths.push({
        id: edge.id,
        d,
        selected: edge.id === selectedEdgeId,
        fromEnd: edge.fromEnd ?? 'none',
        toEnd: edge.toEnd ?? 'arrow',
        color: edge.color,
      })
    }
    return paths
  }, [edges, entityMap, selectedEdgeId, zoom])

  // Temporary drag edge path
  const dragPath = useMemo(() => {
    if (!dragState) return null
    const fromEntity = entityMap.get(dragState.fromEntityId)
    if (!fromEntity) return null
    const from = getAnchorPoint(fromEntity, dragState.fromSide, zoom)
    const to: AnchorPoint = { x: dragState.cursorX, y: dragState.cursorY, side: dragState.fromSide === 'left' ? 'right' : dragState.fromSide === 'right' ? 'left' : dragState.fromSide === 'top' ? 'bottom' : 'top' }
    return buildBezierPath(from, to, zoom)
  }, [dragState, entityMap, zoom])

  // Which entities should show anchor dots: selected + hovered entities, or all during drag
  const anchorEntities = useMemo(() => {
    const ids = new Set<string>()
    if (!selectedEdgeId) {
      for (const id of selectedEntityIds) {
        if (entityMap.has(id)) ids.add(id)
      }
    }
    if (hoveredEntityId && entityMap.has(hoveredEntityId)) ids.add(hoveredEntityId)
    if (dragState || interaction.kind === 'dragging-edge') {
      // During drag, show all entity anchors as potential targets
      for (const eId of entityMap.keys()) ids.add(eId)
    }
    return [...ids].map((id) => entityMap.get(id)!).filter(Boolean)
  }, [selectedEntityIds, selectedEdgeId, hoveredEntityId, dragState, entityMap, interaction.kind])

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 5 }}
    >
      {/* Arrow marker definitions */}
      <defs>
        <marker id="arrow-default" markerHeight={9} markerUnits="userSpaceOnUse" markerWidth={7} orient="auto" refX={7} refY={4.5}>
          <path d="M 0 0 L 7 4.5 L 0 9 Z" fill={EDGE_COLOR_DEFAULT} />
        </marker>
        <marker id="arrow-selected" markerHeight={9} markerUnits="userSpaceOnUse" markerWidth={7} orient="auto" refX={7} refY={4.5}>
          <path d="M 0 0 L 7 4.5 L 0 9 Z" fill={selectionColor(isDark)} />
        </marker>
        <marker id="arrow-start-default" markerHeight={9} markerUnits="userSpaceOnUse" markerWidth={7} orient="auto" refX={0} refY={4.5}>
          <path d="M 7 0 L 0 4.5 L 7 9 Z" fill={EDGE_COLOR_DEFAULT} />
        </marker>
        <marker id="arrow-start-selected" markerHeight={9} markerUnits="userSpaceOnUse" markerWidth={7} orient="auto" refX={0} refY={4.5}>
          <path d="M 7 0 L 0 4.5 L 7 9 Z" fill={selectionColor(isDark)} />
        </marker>
        {/* Per-color markers for colored edges (deduplicated) */}
        {[...new Set(edgePaths.map((p) => p.color).filter(Boolean))].map((color) => {
          const hex = resolveCanvasColor(color!)
          const safeId = hex.replace('#', '')
          return (
            <g key={safeId}>
              <marker id={`arrow-color-${safeId}`} markerHeight={9} markerUnits="userSpaceOnUse" markerWidth={7} orient="auto" refX={7} refY={4.5}>
                <path d="M 0 0 L 7 4.5 L 0 9 Z" fill={hex} />
              </marker>
              <marker id={`arrow-start-color-${safeId}`} markerHeight={9} markerUnits="userSpaceOnUse" markerWidth={7} orient="auto" refX={0} refY={4.5}>
                <path d="M 7 0 L 0 4.5 L 7 9 Z" fill={hex} />
              </marker>
            </g>
          )
        })}
      </defs>

      {/* Existing edges */}
      {edgePaths.map(({ id, d, selected, fromEnd, toEnd, color }) => {
        const resolvedColor = color ? resolveCanvasColor(color) : null
        const edgeColor = selected
          ? selectionColor(isDark)
          : resolvedColor ?? EDGE_COLOR_DEFAULT
        const markerSuffix = selected
          ? 'selected'
          : resolvedColor
            ? `color-${resolvedColor.replace('#', '')}`
            : 'default'
        return (
        <g key={id}>
          <path
            d={d}
            fill="none"
            markerEnd={toEnd === 'arrow' ? `url(#arrow-${markerSuffix})` : undefined}
            markerStart={fromEnd === 'arrow' ? `url(#arrow-start-${markerSuffix})` : undefined}
            stroke={edgeColor}
            strokeWidth={1.5}
          />
          {/* Fat invisible hit target */}
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            onClick={(e) => {
              e.stopPropagation()
              onSelectEdge(id)
            }}
          />
        </g>
        )
      })}

      {/* Temporary drag edge */}
      {dragPath && (
        <path
          d={dragPath}
          fill="none"
          markerEnd="url(#arrow-selected)"
          stroke={selectionColor(isDark)}
          strokeDasharray="6 4"
          strokeWidth={1}
        />
      )}

      {/* Anchor dots */}
      {anchorEntities.map((entity) => (
        <AnchorDots
          key={entity.id}
          entity={entity}
          isDark={isDark}
          isDragging={dragState !== null}
          zoom={zoom}
          onDragStart={handleDragStart}
          onHoverEntity={onHoverEntity}
        />
      ))}
    </svg>
  )
}
