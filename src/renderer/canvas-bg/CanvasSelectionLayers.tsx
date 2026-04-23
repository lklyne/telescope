import { useContext, useMemo, useRef } from 'react'
import type {
  CanvasSceneDrawingEntity,
  CanvasSceneFileEntity,
  CanvasSceneFrameEntity,
  CanvasSceneGroupEntity,
  CanvasSceneTextEntity,
} from '../../shared/types'
import { selectionColor } from './canvasBgConstants'
import { EntityHoverValueContext } from './EntityHoverProvider'
import type { EntityResizePatch } from './entityConstants'
import { aspectRatioResizeModeForCanvasFile } from './entityConstants'
import {
  MIN_GROUP_WIDTH,
  MIN_GROUP_HEIGHT,
  MIN_TEXT_WIDTH,
  MIN_TEXT_HEIGHT,
  MIN_FILE_WIDTH,
  MIN_FILE_HEIGHT,
} from './entityConstants'
import { CornerResizeHandle, EdgeResizeHandle } from './ResizeHandles'
import { SelectionResizeGrid } from './SelectionResizeGrid'
import { useMultiCornerResize, useMultiEdgeResize } from './useMultiSelectionResize'
import type { MultiResizeEntity } from './useMultiSelectionResize'
import { useGroupDragGesture } from './useGroupBoundsDrag'

// Re-export for consumers that imported from this file
export type { EntityResizePatch } from './entityConstants'
export { MIN_GROUP_WIDTH, MIN_GROUP_HEIGHT } from './entityConstants'
export { useCornerResize, useEdgeResize } from './useEntityResize'
export { CornerResizeHandle, EdgeResizeHandle } from './ResizeHandles'

// --- Selection overlay components ---

function FrameSelectionOverlay({
  frame,
  interactionsEnabled,
  isDark,
  showResizeHandles,
  onResize,
}: {
  frame: CanvasSceneFrameEntity
  interactionsEnabled: boolean
  isDark: boolean
  showResizeHandles: boolean
  onResize: (id: string, patch: EntityResizePatch) => void
}) {
  const zoom = frame.width > 0 ? frame.screenWidth / frame.width : 1

  return (
    <div
      className="absolute border-2"
      style={{
        left: frame.screenX - 6,
        top: frame.screenY - 6,
        width: frame.screenWidth + 12,
        height: frame.screenHeight + 12,
        borderColor: selectionColor(isDark),
        pointerEvents: interactionsEnabled && showResizeHandles ? 'auto' : 'none',
      }}
      data-overlay-ui
    >
      {interactionsEnabled && showResizeHandles ? (
        <SelectionResizeGrid
          id={frame.id}
          width={frame.width}
          height={frame.height}
          canvasX={frame.canvasX}
          canvasY={frame.canvasY}
          zoom={zoom}
          minWidth={320}
          minHeight={200}
          onResize={onResize}
          isDark={isDark}
        />
      ) : null}
    </div>
  )
}

function GroupSelectionOverlay({
  group,
  isDark,
  onResize,
  onStartDragGroup,
  onDragGroup,
  onEndDragGroup,
}: {
  group: CanvasSceneGroupEntity
  isDark: boolean
  onResize: (id: string, patch: EntityResizePatch) => void
  onStartDragGroup: (groupId: string) => void
  onDragGroup: (groupId: string, dx: number, dy: number) => void
  onEndDragGroup: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const zoom = group.width > 0 ? group.screenWidth / group.width : 1
  useGroupDragGesture({
    target: ref,
    groupId: group.id,
    selectOnBegin: false,
    onStartDragGroup,
    onDragGroup,
    onEndDragGroup,
  })

  return (
    <div
      ref={ref}
      className="absolute border-2"
      style={{
        left: group.screenX,
        top: group.screenY,
        width: group.screenWidth,
        height: group.screenHeight,
        borderColor: selectionColor(isDark),
        borderRadius: 2,
        pointerEvents: 'auto',
      }}
      data-overlay-ui
    >
      <SelectionResizeGrid
        id={group.id}
        width={group.width}
        height={group.height}
        canvasX={group.canvasX}
        canvasY={group.canvasY}
        zoom={zoom}
        minWidth={MIN_GROUP_WIDTH}
        minHeight={MIN_GROUP_HEIGHT}
        onResize={onResize}
        isDark={isDark}
      />
    </div>
  )
}

function EntitySelectionOverlay({
  entity,
  borderRadius,
  isDark,
  isSelected,
  showResizeHandles,
  onResize,
  onMouseDown,
}: {
  entity: CanvasSceneTextEntity | CanvasSceneFileEntity | CanvasSceneDrawingEntity
  borderRadius: number
  isDark: boolean
  isSelected: boolean
  showResizeHandles: boolean
  onResize: (id: string, patch: EntityResizePatch) => void
  onMouseDown?: (id: string, event: React.MouseEvent) => void
}) {
  const minWidth =
    entity.kind === 'text' ? MIN_TEXT_WIDTH : entity.kind === 'file' ? MIN_FILE_WIDTH : 16
  const minHeight =
    entity.kind === 'text' ? MIN_TEXT_HEIGHT : entity.kind === 'file' ? MIN_FILE_HEIGHT : 16
  const aspectRatioResizeMode =
    entity.kind === 'file' ? aspectRatioResizeModeForCanvasFile(entity.file) : 'off'
  const zoom = entity.width > 0 ? entity.screenWidth / entity.width : 1

  return (
    <div
      className="absolute border-2"
      style={{
        left: entity.screenX - 2,
        top: entity.screenY - 2,
        width: entity.screenWidth + 4,
        height: entity.screenHeight + 4,
        borderColor: selectionColor(isDark),
        borderRadius,
        pointerEvents: isSelected ? 'auto' : 'none',
        cursor: isSelected && entity.kind === 'drawing' ? 'grab' : undefined,
      }}
      data-overlay-ui
      onMouseDown={(event) => {
        if (!isSelected || !onMouseDown) return
        if (event.target !== event.currentTarget) return
        onMouseDown(entity.id, event)
      }}
    >
      {isSelected && showResizeHandles ? (
        <SelectionResizeGrid
          id={entity.id}
          width={entity.width}
          height={entity.height}
          canvasX={entity.canvasX}
          canvasY={entity.canvasY}
          zoom={zoom}
          minWidth={minWidth}
          minHeight={minHeight}
          onResize={onResize}
          aspectRatioResizeMode={aspectRatioResizeMode}
          isDark={isDark}
        />
      ) : null}
    </div>
  )
}

// --- Multi-Selection Bounding Box ---

function MultiSelectionBoundingBox({
  selectedEntities,
  zoom,
  isDark,
  onResizeMulti,
}: {
  selectedEntities: Array<{ id: string; kind: 'frame' | 'text' | 'file' | 'drawing'; canvasX: number; canvasY: number; width: number; height: number; screenX: number; screenY: number; screenWidth: number; screenHeight: number }>
  zoom: number
  isDark: boolean
  onResizeMulti: (entries: Array<{ id: string; kind: 'frame' | 'text' | 'file' | 'drawing'; width: number; height: number; canvasX: number; canvasY: number }>) => void
}) {
  const screenBbox = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const e of selectedEntities) {
      minX = Math.min(minX, e.screenX)
      minY = Math.min(minY, e.screenY)
      maxX = Math.max(maxX, e.screenX + e.screenWidth)
      maxY = Math.max(maxY, e.screenY + e.screenHeight)
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }, [selectedEntities])

  const canvasBbox = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const e of selectedEntities) {
      minX = Math.min(minX, e.canvasX)
      minY = Math.min(minY, e.canvasY)
      maxX = Math.max(maxX, e.canvasX + e.width)
      maxY = Math.max(maxY, e.canvasY + e.height)
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }, [selectedEntities])

  const multiEntities: MultiResizeEntity[] = useMemo(
    () => selectedEntities.map((e) => ({ id: e.id, kind: e.kind, canvasX: e.canvasX, canvasY: e.canvasY, width: e.width, height: e.height })),
    [selectedEntities],
  )

  const resizeArgs = { entities: multiEntities, canvasBbox, zoom, onResize: onResizeMulti }
  const resizeTL = useMultiCornerResize({ ...resizeArgs, corner: 'top-left' })
  const resizeTR = useMultiCornerResize({ ...resizeArgs, corner: 'top-right' })
  const resizeBL = useMultiCornerResize({ ...resizeArgs, corner: 'bottom-left' })
  const resizeBR = useMultiCornerResize({ ...resizeArgs, corner: 'bottom-right' })
  const resizeT = useMultiEdgeResize({ ...resizeArgs, edge: 'top' })
  const resizeR = useMultiEdgeResize({ ...resizeArgs, edge: 'right' })
  const resizeB = useMultiEdgeResize({ ...resizeArgs, edge: 'bottom' })
  const resizeL = useMultiEdgeResize({ ...resizeArgs, edge: 'left' })

  const pad = 8

  return (
    <div
      className="absolute border-2"
      style={{
        left: screenBbox.x - pad,
        top: screenBbox.y - pad,
        width: screenBbox.width + pad * 2,
        height: screenBbox.height + pad * 2,
        borderColor: selectionColor(isDark),
        borderStyle: 'solid',
        pointerEvents: 'auto',
      }}
      data-overlay-ui
    >
      <EdgeResizeHandle edge="top" beginResize={resizeT} />
      <EdgeResizeHandle edge="right" beginResize={resizeR} />
      <EdgeResizeHandle edge="bottom" beginResize={resizeB} />
      <EdgeResizeHandle edge="left" beginResize={resizeL} />
      <CornerResizeHandle corner="top-left" isDark={isDark} beginResize={resizeTL} />
      <CornerResizeHandle corner="top-right" isDark={isDark} beginResize={resizeTR} />
      <CornerResizeHandle corner="bottom-left" isDark={isDark} beginResize={resizeBL} />
      <CornerResizeHandle corner="bottom-right" isDark={isDark} beginResize={resizeBR} />
    </div>
  )
}

export function CanvasSelectionOutlineLayer({
  frames,
  allTextEntities,
  allFileEntities,
  allDrawingEntities,
  frameInteractionsEnabled,
  isDark,
  zoom,
  selectedIdSet,
  marqueePreviewIds,
  hoveredEntityId,
  onFrameMouseDown,
  onResizeFrame,
  onResizeTextEntity,
  onResizeFileEntity,
  onResizeDrawingEntity,
  onResizeMulti,
  onDrawingMouseDown,
}: {
  frames: CanvasSceneFrameEntity[]
  allTextEntities: CanvasSceneTextEntity[]
  allFileEntities: CanvasSceneFileEntity[]
  allDrawingEntities: CanvasSceneDrawingEntity[]
  frameInteractionsEnabled: boolean
  isDark: boolean
  zoom: number
  selectedIdSet: Set<string>
  marqueePreviewIds: Set<string> | null
  /** Main-authoritative hover id from layoutData.hover. Used as a fallback
   *  when SelectableEntityShell's mouseenter/leave can't fire (e.g. when
   *  above-view is covering the canvas because saved drawings are visible). */
  hoveredEntityId: string | null
  onFrameMouseDown: (frameId: string, event: React.MouseEvent) => void
  onResizeFrame: (id: string, patch: EntityResizePatch) => void
  onResizeTextEntity: (id: string, patch: EntityResizePatch) => void
  onResizeFileEntity: (id: string, patch: EntityResizePatch) => void
  onResizeDrawingEntity: (id: string, patch: EntityResizePatch) => void
  onResizeMulti: (entries: Array<{ id: string; kind: 'frame' | 'text' | 'file' | 'drawing'; width: number; height: number; canvasX: number; canvasY: number }>) => void
  onDrawingMouseDown: (drawingId: string, event: React.MouseEvent) => void
}) {
  const localHoverId = useContext(EntityHoverValueContext)
  const entityHoverId = localHoverId ?? hoveredEntityId
  const isMultiSelect = selectedIdSet.size > 1
  const entities = useMemo(
    () => [...allTextEntities, ...allFileEntities, ...allDrawingEntities].filter(
      (e) => selectedIdSet.has(e.id) || e.id === entityHoverId || marqueePreviewIds?.has(e.id),
    ),
    [allDrawingEntities, allFileEntities, allTextEntities, selectedIdSet, entityHoverId, marqueePreviewIds],
  )

  const allSelectedEntities = useMemo(() => {
    if (!isMultiSelect) return []
    const selected: Array<{ id: string; kind: 'frame' | 'text' | 'file' | 'drawing'; canvasX: number; canvasY: number; width: number; height: number; screenX: number; screenY: number; screenWidth: number; screenHeight: number }> = []
    for (const f of frames) {
      if (selectedIdSet.has(f.id)) selected.push(f)
    }
    for (const e of allTextEntities) {
      if (selectedIdSet.has(e.id)) selected.push(e)
    }
    for (const e of allFileEntities) {
      if (selectedIdSet.has(e.id)) selected.push(e)
    }
    for (const e of allDrawingEntities) {
      if (selectedIdSet.has(e.id)) selected.push(e)
    }
    return selected
  }, [isMultiSelect, frames, allTextEntities, allFileEntities, allDrawingEntities, selectedIdSet])

  return (
    <>
      {isMultiSelect && allSelectedEntities.length > 1 ? (
        <MultiSelectionBoundingBox
          selectedEntities={allSelectedEntities}
          zoom={zoom}
          isDark={isDark}
          onResizeMulti={onResizeMulti}
        />
      ) : null}
      {frames.map((frame) => {
        const isSelected = selectedIdSet.has(frame.id)
        if (isSelected) {
          return (
            <FrameSelectionOverlay
              key={`selection-outline-${frame.id}`}
              frame={frame}
              interactionsEnabled={frameInteractionsEnabled}
              isDark={isDark}
              showResizeHandles={!isMultiSelect}
              onResize={onResizeFrame}
            />
          )
        }
        return (
          <div
            key={`selection-outline-${frame.id}`}
            className="absolute border-2"
            style={{
              left: frame.screenX - 6,
              top: frame.screenY - 6,
              width: frame.screenWidth + 12,
              height: frame.screenHeight + 12,
              borderColor: selectionColor(isDark),
              pointerEvents: frameInteractionsEnabled && !isSelected ? 'auto' : 'none',
              cursor: frameInteractionsEnabled && !isSelected ? 'grab' : undefined,
            }}
            data-overlay-ui
            onMouseDown={
              frameInteractionsEnabled && !isSelected
                ? (e) => onFrameMouseDown(frame.id, e)
                : undefined
            }
          />
        )
      })}
      {entities.map((entity) => {
        const isSelected = selectedIdSet.has(entity.id)
        const borderRadius = entity.kind === 'text' ? 0 : 4
        return (
          <EntitySelectionOverlay
            key={`selection-outline-${entity.id}`}
            entity={entity}
            borderRadius={borderRadius}
            isDark={isDark}
            isSelected={isSelected}
            showResizeHandles={!isMultiSelect}
            onResize={
              entity.kind === 'text'
                ? onResizeTextEntity
                : entity.kind === 'file'
                  ? onResizeFileEntity
                  : onResizeDrawingEntity
            }
            onMouseDown={entity.kind === 'drawing' ? onDrawingMouseDown : undefined}
          />
        )
      })}
    </>
  )
}

export function GroupSelectionOverlayLayer({
  groups,
  isDark,
  selectedGroupId,
  suppressOverlay = false,
  onResizeGroup,
  onStartDragGroup,
  onDragGroup,
  onEndDragGroup,
}: {
  groups: CanvasSceneGroupEntity[]
  isDark: boolean
  selectedGroupId: string | null
  suppressOverlay?: boolean
  onResizeGroup: (id: string, patch: EntityResizePatch) => void
  onStartDragGroup: (groupId: string) => void
  onDragGroup: (groupId: string, dx: number, dy: number) => void
  onEndDragGroup: () => void
}) {
  if (suppressOverlay) return null
  if (!selectedGroupId) return null
  const group = groups.find((candidate) => candidate.id === selectedGroupId)
  if (!group) return null

  return (
    <GroupSelectionOverlay
      group={group}
      isDark={isDark}
      onResize={onResizeGroup}
      onStartDragGroup={onStartDragGroup}
      onDragGroup={onDragGroup}
      onEndDragGroup={onEndDragGroup}
    />
  )
}
