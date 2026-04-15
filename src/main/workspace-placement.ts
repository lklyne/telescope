import type {
  BatchPlacementRequest,
  BatchPlacementResult,
  PlacementRequest,
  PlacementResult,
  WorkspaceBounds,
  WorkspaceFrame,
} from '../shared/types'
import {
  ANCHOR_OFFSET_X,
  ANCHOR_OFFSET_Y,
  CLUSTER_HORIZONTAL_GUTTER,
  CLUSTER_OUTER_MARGIN,
  PLACEMENT_SCAN_STEP,
} from '../shared/constants'
import { pages } from './runtime/page-runtime'
import { textEntities } from './runtime/text-entity-state'
import { fileEntities } from './runtime/file-entity-state'
import {
  pageCanvasBounds,
  pageOuterCanvasBounds,
  snapToGrid,
} from './runtime/surface-layout'
import { workspaceGroups } from './runtime/workspace-model'
import { boundsOverlap } from './runtime/runtime-geometry'
import { CHROME_HEADER_HEIGHT } from './runtime/runtime-constants'
import { allWorkspaceFrames, selectionBounds } from './workspace-entities'

// Chrome headers render above each entity's canvasY (see EntityChromeHeader —
// translateY(-100%)). Extend the occupied rect upward so placement treats the
// header band as claimed too. Without this, a new entity's body can land
// flush against the bottom of an entity above, with its own chrome header
// intruding into the visible gutter.
function extendUpwardForChrome(bounds: WorkspaceBounds, headerHeight: number): WorkspaceBounds {
  return {
    x: bounds.x,
    y: bounds.y - headerHeight,
    width: bounds.width,
    height: bounds.height + headerHeight,
  }
}

export function occupiedRegions(): WorkspaceBounds[] {
  return [
    // Frames: use outer bounds (includes device shell) and extend up for chrome.
    ...pages.map((page) =>
      extendUpwardForChrome(pageOuterCanvasBounds(page), page.chromeHeight),
    ),
    ...textEntities.map((entity) => ({
      x: entity.canvasX,
      y: entity.canvasY,
      width: entity.width,
      height: entity.height,
    })),
    // File entities may render a chrome header (markdown/wireframe). Claim the
    // header band unconditionally — a small over-claim on plain files is fine.
    ...fileEntities.map((entity) =>
      extendUpwardForChrome(
        { x: entity.canvasX, y: entity.canvasY, width: entity.width, height: entity.height },
        CHROME_HEADER_HEIGHT,
      ),
    ),
    ...workspaceGroups.map((group) => ({
      x: group.canvasX,
      y: group.canvasY,
      width: group.width,
      height: group.height,
    })),
  ]
}

export function expandBounds(bounds: WorkspaceBounds, padding: number): WorkspaceBounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  }
}

function candidateCollides(
  candidate: WorkspaceBounds,
  regions: WorkspaceBounds[] = occupiedRegions(),
): boolean {
  // Reserve a chrome-header band above the candidate body. We don't know the
  // kind of the entity being placed here, so assume it may have a header —
  // worst case this leaves 44px of extra headroom for a headerless entity.
  const inflated = extendUpwardForChrome(candidate, CHROME_HEADER_HEIGHT)
  return regions.some((bounds) =>
    boundsOverlap(inflated, expandBounds(bounds, CLUSTER_OUTER_MARGIN)),
  )
}

function scanForPlacement(
  width: number,
  height: number,
  startX: number,
  startY: number,
): PlacementResult {
  const frames = allWorkspaceFrames()
  const maxRight = Math.max(
    2000,
    ...frames.map((frame) => frame.canvasX + frame.width + CLUSTER_OUTER_MARGIN),
  )
  const maxBottom = Math.max(
    2000,
    ...frames.map((frame) => frame.canvasY + frame.height + CLUSTER_OUTER_MARGIN),
  )
  const limitX = maxRight + width + 2000
  const limitY = maxBottom + height + 2000
  const regions = occupiedRegions()

  for (let y = snapToGrid(startY); y <= limitY; y += PLACEMENT_SCAN_STEP) {
    const rowStartX = y === snapToGrid(startY) ? snapToGrid(startX) : CLUSTER_OUTER_MARGIN
    for (let x = rowStartX; x <= limitX; x += PLACEMENT_SCAN_STEP) {
      const candidate = { x, y, width, height }
      if (!candidateCollides(candidate, regions)) {
        return {
          canvasX: x,
          canvasY: y,
          fallbackUsed: x !== snapToGrid(startX) || y !== snapToGrid(startY),
          reason: 'scan_fit',
        }
      }
    }
  }

  throw new Error('No legal placement found within scan bounds')
}

export function findPlacement(request: PlacementRequest): PlacementResult {
  const width = snapToGrid(request.width)
  const height = snapToGrid(request.height)

  if (request.anchor === 'selection_or_empty_region') {
    const anchor = selectionBounds()
    if (anchor) {
      const initialX = snapToGrid(anchor.x + anchor.width + ANCHOR_OFFSET_X)
      const initialY = snapToGrid(anchor.y + ANCHOR_OFFSET_Y)
      const candidate = { x: initialX, y: initialY, width, height }
      if (!candidateCollides(candidate)) {
        return {
          canvasX: initialX,
          canvasY: initialY,
          fallbackUsed: false,
          reason: 'selection_anchor',
        }
      }
      return scanForPlacement(width, height, initialX, initialY)
    }
  }

  return scanForPlacement(width, height, CLUSTER_OUTER_MARGIN, CLUSTER_OUTER_MARGIN)
}

/**
 * Find non-overlapping positions for a batch of items, laid out as a group.
 * Computes the bounding box for the entire batch, calls findPlacement() once,
 * then positions children sequentially with uniform gaps.
 */
export function findBatchPlacement(request: BatchPlacementRequest): BatchPlacementResult {
  const gap = snapToGrid(request.gap ?? CLUSTER_HORIZONTAL_GUTTER)
  const layout = request.layout ?? 'row'
  const items = request.items.map((i) => ({
    width: snapToGrid(i.width),
    height: snapToGrid(i.height),
  }))

  if (items.length === 0) return { positions: [] }

  // Grid metrics used for both bounding box and position phases
  const gridCols = layout === 'grid' ? Math.ceil(Math.sqrt(items.length)) : 0
  const gridMaxW = layout === 'grid' ? Math.max(...items.map((i) => i.width)) : 0
  const gridMaxH = layout === 'grid' ? Math.max(...items.map((i) => i.height)) : 0

  let bbWidth: number
  let bbHeight: number

  if (layout === 'column') {
    bbWidth = Math.max(...items.map((i) => i.width))
    bbHeight = items.reduce((s, i) => s + i.height, 0) + (items.length - 1) * gap
  } else if (layout === 'grid') {
    const rows = Math.ceil(items.length / gridCols)
    bbWidth = gridCols * gridMaxW + (gridCols - 1) * gap
    bbHeight = rows * gridMaxH + (rows - 1) * gap
  } else {
    bbWidth = items.reduce((s, i) => s + i.width, 0) + (items.length - 1) * gap
    bbHeight = Math.max(...items.map((i) => i.height))
  }

  const placement = findPlacement({
    width: bbWidth,
    height: bbHeight,
    anchor: request.anchor ?? 'selection_or_empty_region',
  })

  const positions: Array<{ canvasX: number; canvasY: number }> = []

  if (layout === 'column') {
    let cursorY = placement.canvasY
    for (const item of items) {
      positions.push({ canvasX: placement.canvasX, canvasY: cursorY })
      cursorY += item.height + gap
    }
  } else if (layout === 'grid') {
    for (let idx = 0; idx < items.length; idx++) {
      positions.push({
        canvasX: placement.canvasX + (idx % gridCols) * (gridMaxW + gap),
        canvasY: placement.canvasY + Math.floor(idx / gridCols) * (gridMaxH + gap),
      })
    }
  } else {
    let cursorX = placement.canvasX
    for (const item of items) {
      positions.push({ canvasX: cursorX, canvasY: placement.canvasY })
      cursorX += item.width + gap
    }
  }

  return { positions }
}

/**
 * Find a non-overlapping position for a duplicated entity.
 * Tries placing to the right of the source first, then below, then falls back
 * to the general scan algorithm.
 */
export function findDuplicatePlacement(source: WorkspaceBounds): { canvasX: number; canvasY: number } {
  const width = snapToGrid(source.width)
  const height = snapToGrid(source.height)
  // candidateCollides() expands occupied regions by CLUSTER_OUTER_MARGIN,
  // which is the shared visual gap between placed entities.
  const gap = CLUSTER_OUTER_MARGIN

  // 1. Try to the right of the source
  const rightX = snapToGrid(source.x + source.width + gap)
  const rightY = snapToGrid(source.y)
  const rightCandidate = { x: rightX, y: rightY, width, height }
  if (!candidateCollides(rightCandidate)) {
    return { canvasX: rightX, canvasY: rightY }
  }

  // 2. Try below the source
  const belowX = snapToGrid(source.x)
  const belowY = snapToGrid(source.y + source.height + gap)
  const belowCandidate = { x: belowX, y: belowY, width, height }
  if (!candidateCollides(belowCandidate)) {
    return { canvasX: belowX, canvasY: belowY }
  }

  // 3. Fall back to scan starting from the right candidate position
  const result = scanForPlacement(width, height, rightX, rightY)
  return { canvasX: result.canvasX, canvasY: result.canvasY }
}
