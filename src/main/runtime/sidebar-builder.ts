/**
 * Sidebar tree builder — constructs hierarchical sidebar data for the left panel.
 */

import type {
  LeftSidebarData,
  SidebarCanvasItem,
  SidebarDrawingItem,
  SidebarFileItem,
  SidebarFrameItem,
  SidebarShapeItem,
  SidebarTextItem,
  WorkspaceBounds,
  WorkspaceGroup,
} from '../../shared/types'
import {
  findPageById,
  interactionState,
  pages,
} from './runtime-context'
import { activeWorkspaceTabId, workspaceGroups } from './workspace-model'
import { leftSidebarView } from './view-refs'
import {
  leftSidebarOpen as uiLeftSidebarOpen,
  selectedEntityIds as uiSelectedEntityIds,
  selectedGroupId as uiSelectedGroupId,
  workspaceViewMode as uiWorkspaceViewMode,
} from '../ui-state'
import { textEntities } from './text-entity-state'
import { fileEntities } from './file-entity-state'
import { drawingEntitiesForUi } from './drawing-entity-state'
import { shapeEntities } from './shape-entity-state'
import { frameDisplayLabel } from './runtime-serialization'
import { workspaceTabSummaries } from './workspace-tabs'
import { LEFT_SIDEBAR_WIDTH } from './runtime-constants'

type SidebarLeafItem =
  | SidebarFrameItem
  | SidebarTextItem
  | SidebarFileItem
  | SidebarDrawingItem
  | SidebarShapeItem
type SidebarNodeBuild = {
  group: WorkspaceGroup
  bounds: WorkspaceBounds
  parentId: string | null
  childGroupIds: string[]
}
type SortableSidebarItem = SidebarCanvasItem & {
  sortKey: { y: number; x: number; priority: number }
}

function compareSidebarPositions(
  a: { y: number; x: number; priority: number },
  b: { y: number; x: number; priority: number },
): number {
  if (a.y !== b.y) return a.y - b.y
  if (a.x !== b.x) return a.x - b.x
  return a.priority - b.priority
}

function sortSidebarItems(items: SortableSidebarItem[]): SidebarCanvasItem[] {
  return items
    .sort((a, b) => compareSidebarPositions(a.sortKey, b.sortKey))
    .map(({ sortKey: _sortKey, ...item }) => item)
}

function buildSidebarLeafItem(entityId: string): (SidebarLeafItem & { sortKey: SortableSidebarItem['sortKey'] }) | null {
  const page = findPageById(entityId)
  if (page) {
    return {
      kind: 'frame',
      id: entityId,
      label: frameDisplayLabel(page),
      faviconUrl: page.faviconUrl ?? null,
      width: page.peekWidth,
      height: page.peekHeight,
      sortKey: { y: page.canvasY, x: page.canvasX, priority: 1 },
    }
  }

  const te = textEntities.find((entity) => entity.id === entityId)
  if (te) {
    return {
      kind: 'text',
      id: entityId,
      label: te.label || te.text || 'Text',
      color: te.color,
      sortKey: { y: te.canvasY, x: te.canvasX, priority: 0 },
    }
  }

  const fe = fileEntities.find((entity) => entity.id === entityId)
  if (fe) {
    const fileName = fe.file.split('/').pop() ?? fe.file
    const displayName = fileName
      .replace(/\.wireframe\.json$/i, '')
      .replace(/\.md$/i, '')
    return {
      kind: 'file',
      id: entityId,
      label: displayName,
      file: fe.file,
      sortKey: { y: fe.canvasY, x: fe.canvasX, priority: 0 },
    }
  }

  const de = drawingEntitiesForUi().find((entity) => entity.id === entityId)
  if (de) {
    const defaultLabel = `Drawing (${de.strokes.length} stroke${de.strokes.length === 1 ? '' : 's'})`
    return {
      kind: 'drawing',
      id: entityId,
      label: de.label || defaultLabel,
      strokeCount: de.strokes.length,
      sortKey: { y: de.canvasY, x: de.canvasX, priority: 0 },
    }
  }

  const se = shapeEntities.find((entity) => entity.id === entityId)
  if (se) {
    const trimmed = se.text.trim()
    const defaultLabel =
      se.shapeKind === 'ellipse' ? 'Ellipse' : se.shapeKind === 'diamond' ? 'Diamond' : 'Rectangle'
    return {
      kind: 'shape',
      id: entityId,
      label: se.label || trimmed || defaultLabel,
      shapeKind: se.shapeKind,
      sortKey: { y: se.canvasY, x: se.canvasX, priority: 0 },
    }
  }

  return null
}

function countSidebarLeafDescendants(groupId: string): number {
  const directLeafCount =
    pages.filter((page) => page.parentGroupId === groupId).length +
    textEntities.filter((entity) => entity.parentGroupId === groupId).length +
    fileEntities.filter((entity) => entity.parentGroupId === groupId).length +
    drawingEntitiesForUi().filter((entity) => entity.parentGroupId === groupId).length +
    shapeEntities.filter((entity) => entity.parentGroupId === groupId).length

  const nestedLeafCount = workspaceGroups
    .filter((group) => group.parentGroupId === groupId)
    .reduce((total, group) => total + countSidebarLeafDescendants(group.id), 0)

  return directLeafCount + nestedLeafCount
}

export function buildSidebarItems(): SidebarCanvasItem[] {
  const userGroups = workspaceGroups

  const nodeById = new Map<string, SidebarNodeBuild>(
    userGroups.map((group) => [
      group.id,
      {
        group,
        bounds: { x: group.canvasX, y: group.canvasY, width: group.width, height: group.height },
        parentId: group.parentGroupId ?? null,
        childGroupIds: [],
      },
    ]),
  )

  const groupNodes = Array.from(nodeById.values())
  for (const node of groupNodes) {
    if (node.parentId) {
      const parent = nodeById.get(node.parentId)
      if (parent) {
        parent.childGroupIds.push(node.group.id)
      }
    }
  }

  function buildGroupItem(groupId: string): SortableSidebarItem | null {
    const node = nodeById.get(groupId)
    if (!node) return null

    const childGroups = node.childGroupIds
      .map(buildGroupItem)
      .filter((item): item is SortableSidebarItem => Boolean(item))
    const directLeafItems = [
      ...pages.filter((page) => page.parentGroupId === node.group.id).map((page) => page.id),
      ...textEntities.filter((entity) => entity.parentGroupId === node.group.id).map((entity) => entity.id),
      ...fileEntities.filter((entity) => entity.parentGroupId === node.group.id).map((entity) => entity.id),
      ...drawingEntitiesForUi().filter((entity) => entity.parentGroupId === node.group.id).map((entity) => entity.id),
      ...shapeEntities.filter((entity) => entity.parentGroupId === node.group.id).map((entity) => entity.id),
    ]
      .map(buildSidebarLeafItem)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    return {
      kind: 'group',
      id: node.group.id,
      label: node.group.label,
      entityCount: countSidebarLeafDescendants(node.group.id),
      children: sortSidebarItems([...childGroups, ...directLeafItems]),
      sortKey: { y: node.bounds.y, x: node.bounds.x, priority: 2 },
    }
  }

  const groupedEntityIds = new Set<string>([
    ...pages.filter((page) => page.parentGroupId).map((page) => page.id),
    ...textEntities.filter((entity) => entity.parentGroupId).map((entity) => entity.id),
    ...fileEntities.filter((entity) => entity.parentGroupId).map((entity) => entity.id),
    ...drawingEntitiesForUi().filter((entity) => entity.parentGroupId).map((entity) => entity.id),
    ...shapeEntities.filter((entity) => entity.parentGroupId).map((entity) => entity.id),
  ])
  const rootLeafItems = [
    ...pages
      .filter((page) => !groupedEntityIds.has(page.id))
      .map((page) => buildSidebarLeafItem(page.id)),
    ...textEntities
      .filter((entity) => !groupedEntityIds.has(entity.id))
      .map((entity) => buildSidebarLeafItem(entity.id)),
    ...fileEntities
      .filter((entity) => !groupedEntityIds.has(entity.id))
      .map((entity) => buildSidebarLeafItem(entity.id)),
    ...drawingEntitiesForUi()
      .filter((entity) => !groupedEntityIds.has(entity.id))
      .map((entity) => buildSidebarLeafItem(entity.id)),
    ...shapeEntities
      .filter((entity) => !groupedEntityIds.has(entity.id))
      .map((entity) => buildSidebarLeafItem(entity.id)),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))

  const rootGroupItems = groupNodes
    .filter((node) => !node.parentId)
    .map((node) => buildGroupItem(node.group.id))
    .filter((item): item is SortableSidebarItem => Boolean(item))

  return sortSidebarItems([...rootLeafItems, ...rootGroupItems])
}

export function buildLeftSidebarData(): LeftSidebarData {
  return {
    width: uiLeftSidebarOpen() ? LEFT_SIDEBAR_WIDTH : 0,
    selectedEntityIds: uiSelectedEntityIds(),
    selectedGroupId: uiSelectedGroupId(),
    tabs: workspaceTabSummaries(),
    activeTabId: activeWorkspaceTabId,
    viewMode: uiWorkspaceViewMode(),
    hasFrames: pages.length > 0,
    items: buildSidebarItems(),
  }
}

export function getLeftSidebarData(): LeftSidebarData {
  return buildLeftSidebarData()
}

export function notifyLeftSidebarData(): void {
  if (!leftSidebarView) return
  const wc = leftSidebarView.webContents
  if (wc.isDestroyed()) return
  if (interactionState.kind === 'dragging-entities') return
  wc.send('left-sidebar-data', buildLeftSidebarData())
}
