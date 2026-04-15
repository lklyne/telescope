import type {
  DeleteFramesRequest,
  DeleteFramesResponse,
  WorkspaceBounds,
  WorkspaceFrame,
  WorkspaceGraph,
  WorkspaceSelection,
} from '../shared/types'
import {
  findPageById,
  pages,
  removePageById,
} from './runtime/page-runtime'
import {
  deselectAll,
  focusCanvasBounds,
  getSelectedEntityIds,
  getSelectedGroupId,
  selectedPageId,
  selectPageById,
  setSelectedEntities,
  setSelectedFrames,
  setSelectedGroupId,
} from './runtime/ui-actions'
import { textEntities } from './runtime/text-entity-state'
import { fileEntities } from './runtime/file-entity-state'
import { drawingEntities } from './runtime/drawing-entity-state'
import {
  pageOuterCanvasBounds,
  pageContentSize,
  pan,
  requestLayout,
  zoom,
} from './runtime/surface-layout'
import { workspaceEdges, workspaceGroups } from './runtime/workspace-model'
import { scheduleWorkspaceAutosave } from './runtime/workspace-session'
import { boundsOverlap } from './runtime/runtime-geometry'
import { cloneMetadata } from './workspace-utils'
import { removeEdgesTouchingEntities } from './workspace-edges'
import { occupiedRegions } from './workspace-placement'

// --- Bounds helpers ---

export function frameBoundsById(frameId: string): WorkspaceBounds | null {
  const page = findPageById(frameId)
  return page ? pageOuterCanvasBounds(page) : null
}

export function frameSelectableBounds(
  page: Exclude<ReturnType<typeof findPageById>, undefined>,
): WorkspaceBounds {
  const outer = pageOuterCanvasBounds(page)
  return {
    x: outer.x,
    y: outer.y,
    width: outer.width,
    height: outer.height + page.chromeHeight,
  }
}

export function unionBounds(boundsList: WorkspaceBounds[]): WorkspaceBounds | null {
  if (!boundsList.length) return null
  let left = boundsList[0].x
  let top = boundsList[0].y
  let right = left + boundsList[0].width
  let bottom = top + boundsList[0].height
  for (let i = 1; i < boundsList.length; i++) {
    const b = boundsList[i]
    if (b.x < left) left = b.x
    if (b.y < top) top = b.y
    if (b.x + b.width > right) right = b.x + b.width
    if (b.y + b.height > bottom) bottom = b.y + b.height
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function entityBoundsById(entityId: string): WorkspaceBounds | null {
  return entityBoundsByIdWithVisited(entityId, new Set<string>())
}

function entityBoundsByIdWithVisited(
  entityId: string,
  visited: Set<string>,
): WorkspaceBounds | null {
  if (visited.has(entityId)) return null
  const nextVisited = new Set(visited)
  nextVisited.add(entityId)

  const page = findPageById(entityId)
  if (page) {
    return frameSelectableBounds(page)
  }
  const te = textEntities.find((t) => t.id === entityId)
  if (te) return { x: te.canvasX, y: te.canvasY, width: te.width, height: te.height }
  const fe = fileEntities.find((f) => f.id === entityId)
  if (fe) return { x: fe.canvasX, y: fe.canvasY, width: fe.width, height: fe.height }
  const group = workspaceGroups.find((candidate) => candidate.id === entityId)
  if (group) {
    return {
      x: group.canvasX,
      y: group.canvasY,
      width: group.width,
      height: group.height,
    }
  }
  return null
}

export function groupBoundsForEntityIds(entityIds: string[]): WorkspaceBounds | null {
  return groupBoundsForEntityIdsWithVisited(entityIds, new Set<string>())
}

function groupBoundsForEntityIdsWithVisited(
  entityIds: string[],
  visited: Set<string>,
): WorkspaceBounds | null {
  const bounds = entityIds
    .map((entityId) => entityBoundsByIdWithVisited(entityId, visited))
    .filter((b): b is WorkspaceBounds => b !== null)
  return unionBounds(bounds)
}

// --- Group child helpers (needed by many modules) ---

export function groupById(groupId: string): import('../shared/types').WorkspaceGroup | undefined {
  return workspaceGroups.find((group) => group.id === groupId)
}

export function groupChildIds(groupId: string): string[] {
  return [
    ...pages.filter((page) => page.parentGroupId === groupId).map((page) => page.id),
    ...textEntities.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...fileEntities.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...workspaceGroups.filter((group) => group.parentGroupId === groupId).map((group) => group.id),
  ]
}

export function groupDescendantIds(groupId: string): string[] {
  const ids: string[] = []
  const visit = (parentId: string) => {
    for (const childId of groupChildIds(parentId)) {
      ids.push(childId)
      if (groupById(childId)) visit(childId)
    }
  }
  visit(groupId)
  return ids
}

export function groupBounds(group: import('../shared/types').WorkspaceGroup): WorkspaceBounds | null {
  const bounds = groupChildIds(group.id)
    .map(entityBoundsById)
    .filter((item): item is WorkspaceBounds => item !== null)
  return unionBounds(bounds)
}

// --- Selection helpers ---

export function selectionBounds(): WorkspaceBounds | null {
  const selectedIds = getSelectedEntityIds()
  if (selectedIds.length) {
    return unionBounds(
      selectedIds
        .map(frameBoundsById)
        .filter((item): item is WorkspaceBounds => item !== null),
    )
  }

  const activeGroupId = getSelectedGroupId()
  if (!activeGroupId) return null
  const group = groupById(activeGroupId)
  return group ? groupBounds(group) : null
}

export function currentSelection(): WorkspaceSelection {
  const selectedGroupId = getSelectedGroupId()
  if (selectedGroupId) {
    return {
      selectedGroupId,
    }
  }

  const selectedEntityIds = getSelectedEntityIds()
  const selectedFrame = selectedPageId() ?? selectedEntityIds[0]
  return {
    selectedEntityId: selectedFrame,
    selectedEntityIds: selectedEntityIds.length ? selectedEntityIds : undefined,
  }
}

// --- Empty group cleanup ---

export function removeEmptyGroups(): string[] {
  const deletedGroupIds: string[] = []
  for (let idx = workspaceGroups.length - 1; idx >= 0; idx--) {
    const g = workspaceGroups[idx]
    const isEmpty = groupChildIds(g.id).length === 0
    if (isEmpty) {
      deletedGroupIds.push(workspaceGroups[idx].id)
      workspaceGroups.splice(idx, 1)
    }
  }
  if (deletedGroupIds.includes(getSelectedGroupId() ?? '')) {
    setSelectedGroupId(null)
  }
  return deletedGroupIds
}

// --- Delete frames ---

export function deleteFrames(input: DeleteFramesRequest): DeleteFramesResponse {
  const deletedFrameIds: string[] = []
  const missingFrameIds: string[] = []

  for (const frameId of input.frameIds) {
    const removed = removePageById(frameId)
    if (!removed) {
      missingFrameIds.push(frameId)
      continue
    }
    deletedFrameIds.push(frameId)
  }

  const deletedEdgeIds = removeEdgesTouchingEntities(new Set(deletedFrameIds))
  const deletedGroupIds = removeEmptyGroups()

  if (!selectedPageId() && !getSelectedGroupId()) {
    deselectAll()
  }

  if (input.focusAfter) {
    const bounds = selectionBounds()
    if (bounds) focusCanvasBounds(bounds)
  } else {
    requestLayout()
  }

  if (deletedFrameIds.length || deletedEdgeIds.length || deletedGroupIds.length) {
    scheduleWorkspaceAutosave()
  }

  return {
    deletedFrameIds,
    deletedEdgeIds,
    deletedGroupIds,
    missingFrameIds,
    warnings: missingFrameIds.length
      ? [`Missing frame IDs: ${missingFrameIds.join(', ')}`]
      : [],
  }
}

// --- Selection in rect ---

export function selectEntitiesInRect(
  bounds: WorkspaceBounds,
  options: { includeDrawings?: boolean } = {},
): { entityIds: string[] } {
  const includeDrawings = options.includeDrawings ?? true
  const frameIds = pages
    .filter((page) => boundsOverlap(frameSelectableBounds(page), bounds))
    .map((page) => page.id)
  const textIds = textEntities
    .filter((note) =>
      boundsOverlap(
        {
          x: note.canvasX,
          y: note.canvasY,
          width: note.width,
          height: note.height,
        },
        bounds,
      ),
    )
    .map((note) => note.id)
  const fileIds = fileEntities
    .filter((fe) =>
      boundsOverlap(
        {
          x: fe.canvasX,
          y: fe.canvasY,
          width: fe.width,
          height: fe.height,
        },
        bounds,
      ),
    )
    .map((fe) => fe.id)
  const drawingIds = !includeDrawings ? [] : drawingEntities
    .filter((de) =>
      boundsOverlap(
        {
          x: de.canvasX,
          y: de.canvasY,
          width: de.width,
          height: de.height,
        },
        bounds,
      ),
    )
    .map((de) => de.id)

  const entityIds = [...frameIds, ...textIds, ...fileIds, ...drawingIds]

  if (!entityIds.length) {
    deselectAll()
    return { entityIds: [] }
  }

  if (!textIds.length && !fileIds.length && !drawingIds.length) {
    if (frameIds.length === 1) {
      selectPageById(frameIds[0])
    } else {
      setSelectedFrames(frameIds)
    }
    return { entityIds: frameIds }
  }

  setSelectedEntities(entityIds)
  return { entityIds }
}

// --- Workspace graph ---

export function toWorkspaceFrame(frameId: string): WorkspaceFrame | null {
  const page = findPageById(frameId)
  if (!page) return null
  const size = pageContentSize(page)
  return {
    id: page.id,
    kind: 'frame',
    name: page.name?.trim() || undefined,
    url: page.pageView.webContents.getURL() || 'about:blank',
    presetIndex: page.presetIndex,
    canvasX: page.canvasX,
    canvasY: page.canvasY,
    width: size.width,
    height: size.height,
    linkedBrowsing: page.linked,
    source: page.source,
    parentGroupId: page.parentGroupId,
    groupId: page.parentGroupId,
    metadata: cloneMetadata(page.metadata),
  }
}

export function allWorkspaceFrames(): WorkspaceFrame[] {
  return pages
    .map((page) => toWorkspaceFrame(page.id))
    .filter((frame): frame is WorkspaceFrame => frame !== null)
}

export function getWorkspaceGraph(): WorkspaceGraph {
  return {
    entities: [
      ...allWorkspaceFrames(),
      ...textEntities.map((entity) => ({
        id: entity.id,
        kind: 'text' as const,
        preview: entity.text.slice(0, 80) + (entity.text.length > 80 ? '…' : ''),
        color: entity.color,
        canvasX: entity.canvasX,
        canvasY: entity.canvasY,
        width: entity.width,
        height: entity.height,
        parentGroupId: entity.parentGroupId,
      })),
      ...fileEntities.map((entity) => ({
        id: entity.id,
        kind: 'file' as const,
        file: entity.file,
        subpath: entity.subpath,
        canvasX: entity.canvasX,
        canvasY: entity.canvasY,
        width: entity.width,
        height: entity.height,
        parentGroupId: entity.parentGroupId,
      })),
      ...workspaceGroups.map((group) => ({
        ...group,
        kind: 'group' as const,
        metadata: cloneMetadata(group.metadata),
      })),
    ],
    edges: workspaceEdges.map((edge) => ({
      ...edge,
      metadata: cloneMetadata(edge.metadata),
    })),
    selection: currentSelection(),
    camera: {
      zoom,
      panX: pan.x,
      panY: pan.y,
    },
    occupiedRegions: occupiedRegions(),
  }
}

export function getSelectionState(): WorkspaceSelection {
  return currentSelection()
}
