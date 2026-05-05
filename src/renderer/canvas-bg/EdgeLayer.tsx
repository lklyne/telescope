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
import { scaleEdgeHitTargetSize } from './edgeHitSizing'

// --- Constants ---

const SIDES: EdgeSide[] = ['top', 'right', 'bottom', 'left']
const DOT_RADIUS = 3
const EDGE_HIT_ALONG = 56
const EDGE_HIT_ACROSS = 24
const EDGE_HIT_GAP = 4
const EDGE_HIT_CORNER = 2
const DOT_OFFSET = 8
const SNAP_DISTANCE = 48
const CONTROL_POINT_MIN = 40
const CONTROL_POINT_MAX = 200
const EDGE_SELECTION_HIT_WIDTH = 14

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

function getAnchorHitRect(
  entity: CanvasSceneEntity,
  side: EdgeSide,
  zoom: number,
): { x: number; y: number; width: number; height: number } {
  const { screenX, screenY, screenWidth, screenHeight } = entity
  const along = scaleEdgeHitTargetSize(EDGE_HIT_ALONG, zoom)
  const across = scaleEdgeHitTargetSize(EDGE_HIT_ACROSS, zoom)
  const horizontal = side === 'top' || side === 'bottom'
  const width = horizontal ? along : across
  const height = horizontal ? across : along
  const cx = screenX + screenWidth / 2
  const cy = screenY + screenHeight / 2
  switch (side) {
    case 'top':
      return { x: cx - width / 2, y: screenY - EDGE_HIT_GAP - height, width, height }
    case 'bottom':
      return { x: cx - width / 2, y: screenY + screenHeight + EDGE_HIT_GAP, width, height }
    case 'left':
      return { x: screenX - EDGE_HIT_GAP - width, y: cy - height / 2, width, height }
    case 'right':
      return { x: screenX + screenWidth + EDGE_HIT_GAP, y: cy - height / 2, width, height }
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

/**
 * Find an edge whose endpoint sits at the given anchor (entity + side).
 * Used to detect when an anchor-dot grab should edit an existing edge
 * rather than start a new one. Auto-side edges are matched against their
 * resolved sides so their visible endpoints behave the same way.
 */
function findEdgeAtAnchor(
  edges: WorkspaceEdge[],
  entityMap: Map<string, CanvasSceneEntity>,
  entityId: string,
  side: EdgeSide,
): {
  edgeId: string
  movingEnd: 'from' | 'to'
  fixedEntityId: string
  fixedSide: EdgeSide
} | null {
  for (const edge of edges) {
    const fromEntity = entityMap.get(edge.fromEntityId)
    const toEntity = entityMap.get(edge.toEntityId)
    if (!fromEntity || !toEntity) continue
    const { fromSide, toSide } = edge.fromSide && edge.toSide
      ? { fromSide: edge.fromSide, toSide: edge.toSide }
      : autoSides(fromEntity, toEntity)
    if (edge.toEntityId === entityId && toSide === side) {
      return {
        edgeId: edge.id,
        movingEnd: 'to',
        fixedEntityId: edge.fromEntityId,
        fixedSide: fromSide,
      }
    }
    if (edge.fromEntityId === entityId && fromSide === side) {
      return {
        edgeId: edge.id,
        movingEnd: 'from',
        fixedEntityId: edge.toEntityId,
        fixedSide: toSide,
      }
    }
  }
  return null
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
        const hitRect = getAnchorHitRect(entity, side, zoom)
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
            <rect
              x={hitRect.x}
              y={hitRect.y}
              width={hitRect.width}
              height={hitRect.height}
              rx={EDGE_HIT_CORNER}
              ry={EDGE_HIT_CORNER}
              fill="transparent"
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
  selectedEdgeIds,
  selectedEntityIds,
  zoom,
  onBeginEdgeDrag,
  onCancelEdgeDrag,
  onCommitEdgeDrag,
  onCommitEdgeEdit,
  onDiscardEdgeEdit,
  onSelectEdge,
  onHoverEntity,
  onUpdateEdgeDragTarget,
}: {
  edges: WorkspaceEdge[]
  entities: CanvasSceneEntity[]
  hoveredEntityId: string | null
  isDark: boolean
  interaction: CanvasInteractionState
  selectedEdgeIds: ReadonlySet<string>
  selectedEntityIds: string[]
  zoom: number
  onBeginEdgeDrag: (fromEntityId: string, fromSide: EdgeSide) => void
  onCancelEdgeDrag: () => void
  onCommitEdgeDrag: (fromEntityId: string, toEntityId: string, fromSide: EdgeSide, toSide: EdgeSide) => void
  onCommitEdgeEdit: (
    edgeId: string,
    movingEnd: 'from' | 'to',
    targetEntityId: string,
    targetSide: EdgeSide,
  ) => void
  onDiscardEdgeEdit: (edgeId: string) => void
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
  // 'create' = new edge from this anchor; 'edit' = re-route or delete an
  // existing edge whose endpoint sits at this anchor.
  type DragState =
    | {
        mode: 'create'
        fromEntityId: string
        fromSide: EdgeSide
        cursorX: number
        cursorY: number
      }
    | {
        mode: 'edit'
        edgeId: string
        movingEnd: 'from' | 'to'
        fixedEntityId: string
        fixedSide: EdgeSide
        cursorX: number
        cursorY: number
      }
  const [dragState, setDragState] = useState<DragState | null>(null)

  const hoveredDragEntityIdRef = useRef<string | null>(null)
  const dragListenersRef = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const edgeSelectionHitWidth = scaleEdgeHitTargetSize(EDGE_SELECTION_HIT_WIDTH, zoom)

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
      // Grabbing an anchor that already hosts an edge endpoint re-routes (or
      // deletes) that edge instead of starting a new one.
      const existing = findEdgeAtAnchor(edges, entityMap, entityId, side)
      const initialDrag: DragState = existing
        ? {
            mode: 'edit',
            edgeId: existing.edgeId,
            movingEnd: existing.movingEnd,
            fixedEntityId: existing.fixedEntityId,
            fixedSide: existing.fixedSide,
            cursorX: clientX,
            cursorY: clientY,
          }
        : {
            mode: 'create',
            fromEntityId: entityId,
            fromSide: side,
            cursorX: clientX,
            cursorY: clientY,
          }
      setDragState(initialDrag)

      const dragOriginEntityId =
        initialDrag.mode === 'edit' ? initialDrag.fixedEntityId : entityId
      const dragOriginSide =
        initialDrag.mode === 'edit' ? initialDrag.fixedSide : side
      onBeginEdgeDrag(dragOriginEntityId, dragOriginSide)

      const handleMove = (e: MouseEvent) => {
        const bestTarget = findClosestAnchorTarget(
          entityMap,
          dragOriginEntityId,
          e.clientX,
          e.clientY,
          scaleEdgeHitTargetSize(SNAP_DISTANCE, zoomRef.current),
          zoomRef.current,
        )
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

        const bestTarget = findClosestAnchorTarget(
          entityMap,
          dragOriginEntityId,
          e.clientX,
          e.clientY,
          scaleEdgeHitTargetSize(SNAP_DISTANCE, zoomRef.current),
          zoomRef.current,
        )

        if (initialDrag.mode === 'edit') {
          if (bestTarget) {
            onCommitEdgeEdit(
              initialDrag.edgeId,
              initialDrag.movingEnd,
              bestTarget.entityId,
              bestTarget.side,
            )
          } else {
            onDiscardEdgeEdit(initialDrag.edgeId)
          }
        } else if (bestTarget) {
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
    [
      edges,
      entityMap,
      onBeginEdgeDrag,
      onCancelEdgeDrag,
      onCommitEdgeDrag,
      onCommitEdgeEdit,
      onDiscardEdgeEdit,
      onHoverEntity,
      onUpdateEdgeDragTarget,
    ],
  )

  const editingEdgeId = dragState?.mode === 'edit' ? dragState.edgeId : null

  // Render existing edges (skip the one being re-routed — the dashed drag
  // path stands in for it).
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
      if (edge.id === editingEdgeId) continue
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
        selected: selectedEdgeIds.has(edge.id),
        fromEnd: edge.fromEnd ?? 'none',
        toEnd: edge.toEnd ?? 'arrow',
        color: edge.color,
      })
    }
    return paths
  }, [edges, entityMap, selectedEdgeIds, zoom, editingEdgeId])

  // Temporary drag edge path: in 'create' mode it grows from the grabbed
  // anchor; in 'edit' mode it grows from the fixed (non-moving) endpoint.
  const dragPath = useMemo(() => {
    if (!dragState) return null
    const anchorEntityId =
      dragState.mode === 'create' ? dragState.fromEntityId : dragState.fixedEntityId
    const anchorSide =
      dragState.mode === 'create' ? dragState.fromSide : dragState.fixedSide
    const anchorEntity = entityMap.get(anchorEntityId)
    if (!anchorEntity) return null
    const from = getAnchorPoint(anchorEntity, anchorSide, zoom)
    const to: AnchorPoint = {
      x: dragState.cursorX,
      y: dragState.cursorY,
      side:
        anchorSide === 'left'
          ? 'right'
          : anchorSide === 'right'
            ? 'left'
            : anchorSide === 'top'
              ? 'bottom'
              : 'top',
    }
    return buildBezierPath(from, to, zoom)
  }, [dragState, entityMap, zoom])

  // Which entities should show anchor dots: selected + hovered entities, or all during drag
  const anchorEntities = useMemo(() => {
    const ids = new Set<string>()
    if (selectedEdgeIds.size === 0) {
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
  }, [selectedEntityIds, selectedEdgeIds, hoveredEntityId, dragState, entityMap, interaction.kind])

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
          {/* Zoom-scaled invisible hit target */}
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={edgeSelectionHitWidth}
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
