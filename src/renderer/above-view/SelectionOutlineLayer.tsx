/**
 * SelectionOutlineLayer — selection outlines, multi-selection bounding box,
 * and resize handles. Lives in aboveView so it paints above page WCVs.
 *
 * Resize hit-tests run in `useCanvasPointerRouter` against entity geometry,
 * so the handles here are visual-only — pointer-events stay off.
 *
 * Coordinates are overlay-local: aboveView's WCV origin sits at
 * `canvasOrigin.y`, so window-space `screenY` is offset by that amount
 * (matching `useAnchoredPosition` and the rest of aboveView).
 */

import { useMemo } from 'react'
import type {
  CanvasSceneDrawingEntity,
  CanvasSceneFileEntity,
  CanvasSceneFrameEntity,
  CanvasSceneGroupEntity,
  CanvasSceneShapeEntity,
  CanvasSceneTextEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { selectionColor } from '../canvas-bg/canvasBgConstants'
import { aspectRatioResizeModeForCanvasFile } from '../canvas-bg/entityConstants'
import {
  MIN_FILE_HEIGHT,
  MIN_FILE_WIDTH,
  MIN_GROUP_HEIGHT,
  MIN_GROUP_WIDTH,
  MIN_SHAPE_HEIGHT,
  MIN_SHAPE_WIDTH,
  MIN_TEXT_HEIGHT,
  MIN_TEXT_WIDTH,
} from '../canvas-bg/entityConstants'
import { CornerResizeHandle, EdgeResizeHandle } from '../canvas-bg/ResizeHandles'
import { SelectionResizeGrid } from '../canvas-bg/SelectionResizeGrid'

interface FrameOutlineProps {
  frame: CanvasSceneFrameEntity
  originY: number
  isDark: boolean
  showResizeHandles: boolean
}

function FrameSelectionOverlay({ frame, originY, isDark, showResizeHandles }: FrameOutlineProps) {
  const zoom = frame.width > 0 ? frame.screenWidth / frame.width : 1
  return (
    <div
      className="absolute border-2"
      style={{
        left: frame.screenX - 6,
        top: frame.screenY - 6 - originY,
        width: frame.screenWidth + 12,
        height: frame.screenHeight + 12,
        borderColor: selectionColor(isDark),
        pointerEvents: 'none',
      }}
      data-overlay-ui
    >
      {showResizeHandles ? (
        <SelectionResizeGrid
          id={frame.id}
          width={frame.width}
          height={frame.height}
          canvasX={frame.canvasX}
          canvasY={frame.canvasY}
          zoom={zoom}
          minWidth={320}
          minHeight={200}
          onResize={() => {
            /* hit-test in router drives resize; visual handles only */
          }}
          isDark={isDark}
        />
      ) : null}
    </div>
  )
}

function FrameHoverOutline({
  frame,
  originY,
  isDark,
}: {
  frame: CanvasSceneFrameEntity
  originY: number
  isDark: boolean
}) {
  return (
    <div
      className="absolute border-2"
      style={{
        left: frame.screenX - 6,
        top: frame.screenY - 6 - originY,
        width: frame.screenWidth + 12,
        height: frame.screenHeight + 12,
        borderColor: selectionColor(isDark),
        pointerEvents: 'none',
      }}
      data-overlay-ui
    />
  )
}

interface EntityOutlineProps {
  entity:
    | CanvasSceneTextEntity
    | CanvasSceneFileEntity
    | CanvasSceneDrawingEntity
    | CanvasSceneShapeEntity
  originY: number
  borderRadius: number
  isDark: boolean
  isSelected: boolean
  showResizeHandles: boolean
}

function EntitySelectionOverlay({
  entity,
  originY,
  borderRadius,
  isDark,
  isSelected,
  showResizeHandles,
}: EntityOutlineProps) {
  const minWidth =
    entity.kind === 'text'
      ? MIN_TEXT_WIDTH
      : entity.kind === 'file'
        ? MIN_FILE_WIDTH
        : entity.kind === 'shape'
          ? MIN_SHAPE_WIDTH
          : 16
  const minHeight =
    entity.kind === 'text'
      ? MIN_TEXT_HEIGHT
      : entity.kind === 'file'
        ? MIN_FILE_HEIGHT
        : entity.kind === 'shape'
          ? MIN_SHAPE_HEIGHT
          : 16
  const aspectRatioResizeMode =
    entity.kind === 'file' ? aspectRatioResizeModeForCanvasFile(entity.file) : 'off'
  const zoom = entity.width > 0 ? entity.screenWidth / entity.width : 1

  return (
    <div
      className="absolute border-2"
      style={{
        left: entity.screenX - 2,
        top: entity.screenY - 2 - originY,
        width: entity.screenWidth + 4,
        height: entity.screenHeight + 4,
        borderColor: selectionColor(isDark),
        borderRadius,
        pointerEvents: 'none',
        cursor: isSelected && entity.kind === 'drawing' ? 'grab' : undefined,
      }}
      data-overlay-ui
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
          onResize={() => {
            /* hit-test in router drives resize; visual handles only */
          }}
          aspectRatioResizeMode={aspectRatioResizeMode}
          isDark={isDark}
        />
      ) : null}
    </div>
  )
}

interface SelectedEntitySpan {
  id: string
  kind: 'frame' | 'text' | 'file' | 'drawing' | 'shape'
  canvasX: number
  canvasY: number
  width: number
  height: number
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
}

function MultiSelectionBoundingBox({
  selectedEntities,
  originY,
  isDark,
}: {
  selectedEntities: SelectedEntitySpan[]
  originY: number
  isDark: boolean
}) {
  const screenBbox = useMemo(() => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const e of selectedEntities) {
      minX = Math.min(minX, e.screenX)
      minY = Math.min(minY, e.screenY)
      maxX = Math.max(maxX, e.screenX + e.screenWidth)
      maxY = Math.max(maxY, e.screenY + e.screenHeight)
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }, [selectedEntities])

  const pad = 8

  return (
    <div
      className="absolute border-2"
      style={{
        left: screenBbox.x - pad,
        top: screenBbox.y - pad - originY,
        width: screenBbox.width + pad * 2,
        height: screenBbox.height + pad * 2,
        borderColor: selectionColor(isDark),
        borderStyle: 'solid',
        pointerEvents: 'none',
      }}
      data-overlay-ui
    >
      <EdgeResizeHandle edge="top" />
      <EdgeResizeHandle edge="right" />
      <EdgeResizeHandle edge="bottom" />
      <EdgeResizeHandle edge="left" />
      <CornerResizeHandle corner="top-left" isDark={isDark} />
      <CornerResizeHandle corner="top-right" isDark={isDark} />
      <CornerResizeHandle corner="bottom-left" isDark={isDark} />
      <CornerResizeHandle corner="bottom-right" isDark={isDark} />
    </div>
  )
}

function GroupSelectionOverlay({
  group,
  originY,
  isDark,
}: {
  group: CanvasSceneGroupEntity
  originY: number
  isDark: boolean
}) {
  const zoom = group.width > 0 ? group.screenWidth / group.width : 1
  return (
    <div
      className="absolute border-2"
      data-overlay-ui
      style={{
        left: group.screenX,
        top: group.screenY - originY,
        width: group.screenWidth,
        height: group.screenHeight,
        borderColor: selectionColor(isDark),
        borderRadius: 2,
        pointerEvents: 'none',
      }}
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
        onResize={() => {
          /* hit-test in router drives resize; visual handles only */
        }}
        isDark={isDark}
      />
    </div>
  )
}

export function SelectionOutlineLayer({
  layoutData,
  isDark,
  marqueePreviewIds,
}: {
  layoutData: LayoutUpdateData
  isDark: boolean
  marqueePreviewIds: Set<string> | null
}) {
  const originY = layoutData.canvasOrigin.y
  const selectedIdSet = useMemo(
    () => new Set(layoutData.selectedEntityIds),
    [layoutData.selectedEntityIds],
  )
  const isMultiSelect = selectedIdSet.size > 1
  const hoveredEntityId = layoutData.hover?.id ?? null

  const frames = useMemo(
    () =>
      layoutData.entities.filter(
        (e): e is CanvasSceneFrameEntity => e.kind === 'frame',
      ),
    [layoutData.entities],
  )
  const textEntities = useMemo(
    () =>
      layoutData.entities.filter(
        (e): e is CanvasSceneTextEntity => e.kind === 'text',
      ),
    [layoutData.entities],
  )
  const fileEntities = useMemo(
    () =>
      layoutData.entities.filter(
        (e): e is CanvasSceneFileEntity => e.kind === 'file',
      ),
    [layoutData.entities],
  )
  const drawingEntities = useMemo(
    () =>
      layoutData.entities.filter(
        (e): e is CanvasSceneDrawingEntity => e.kind === 'drawing',
      ),
    [layoutData.entities],
  )
  const shapeEntities = useMemo(
    () =>
      layoutData.entities.filter(
        (e): e is CanvasSceneShapeEntity => e.kind === 'shape',
      ),
    [layoutData.entities],
  )

  // Frames render outline if selected, hovered, or in marquee preview.
  const visibleFrames = useMemo(
    () =>
      frames.filter(
        (f) =>
          selectedIdSet.has(f.id) ||
          f.id === hoveredEntityId ||
          marqueePreviewIds?.has(f.id),
      ),
    [frames, selectedIdSet, hoveredEntityId, marqueePreviewIds],
  )

  // Non-frame entities render outline if selected, hovered, or in marquee preview.
  const visibleEntities = useMemo(
    () =>
      [...textEntities, ...fileEntities, ...drawingEntities, ...shapeEntities].filter(
        (e) =>
          selectedIdSet.has(e.id) ||
          e.id === hoveredEntityId ||
          marqueePreviewIds?.has(e.id),
      ),
    [textEntities, fileEntities, drawingEntities, shapeEntities, selectedIdSet, hoveredEntityId, marqueePreviewIds],
  )

  // Multi-select bounding box: aggregate all selected entities' rects.
  const allSelectedEntities: SelectedEntitySpan[] = useMemo(() => {
    if (!isMultiSelect) return []
    const out: SelectedEntitySpan[] = []
    for (const f of frames) if (selectedIdSet.has(f.id)) out.push(f)
    for (const e of textEntities) if (selectedIdSet.has(e.id)) out.push(e)
    for (const e of fileEntities) if (selectedIdSet.has(e.id)) out.push(e)
    for (const e of drawingEntities) if (selectedIdSet.has(e.id)) out.push(e)
    for (const e of shapeEntities) if (selectedIdSet.has(e.id)) out.push(e)
    return out
  }, [isMultiSelect, frames, textEntities, fileEntities, drawingEntities, shapeEntities, selectedIdSet])

  // Group selection overlay — render whenever a group is selected. The
  // canvas-bg `GroupSelectionOverlayLayer` used to suppress this when the
  // group had a descendant frame (handing off to the legacy aboveView path);
  // now aboveView owns it unconditionally, so we render in both cases.
  const selectedGroupId = layoutData.selectedGroupId ?? null
  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return null
    return (layoutData.groups ?? []).find((g) => g.id === selectedGroupId) ?? null
  }, [selectedGroupId, layoutData.groups])

  return (
    <>
      {isMultiSelect && allSelectedEntities.length > 1 ? (
        <MultiSelectionBoundingBox
          selectedEntities={allSelectedEntities}
          originY={originY}
          isDark={isDark}
        />
      ) : null}
      {visibleFrames.map((frame) => {
        const isSelected = selectedIdSet.has(frame.id)
        if (isSelected) {
          return (
            <FrameSelectionOverlay
              key={`selection-outline-${frame.id}`}
              frame={frame}
              originY={originY}
              isDark={isDark}
              showResizeHandles={!isMultiSelect}
            />
          )
        }
        return (
          <FrameHoverOutline
            key={`selection-outline-${frame.id}`}
            frame={frame}
            originY={originY}
            isDark={isDark}
          />
        )
      })}
      {visibleEntities.map((entity) => {
        const isSelected = selectedIdSet.has(entity.id)
        const borderRadius = entity.kind === 'text' ? 0 : 4
        return (
          <EntitySelectionOverlay
            key={`selection-outline-${entity.id}`}
            entity={entity}
            originY={originY}
            borderRadius={borderRadius}
            isDark={isDark}
            isSelected={isSelected}
            showResizeHandles={!isMultiSelect}
          />
        )
      })}
      {selectedGroup ? (
        <GroupSelectionOverlay
          group={selectedGroup}
          originY={originY}
          isDark={isDark}
        />
      ) : null}
    </>
  )
}
