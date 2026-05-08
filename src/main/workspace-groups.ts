import type {
  DeleteGroupsRequest,
  DeleteGroupsResponse,
  WorkspaceBounds,
  WorkspaceGroup,
} from '../shared/types'
import {
  CLUSTER_HORIZONTAL_GUTTER,
  USER_GROUP_PADDING,
} from '../shared/constants'
import {
  createPage,
  findPageById,
  pages,
} from './runtime/page-runtime'
import {
  deselectAll,
  focusCanvasBounds,
  getSelectedGroupId,
  selectPageById,
  setSelectedGroupId,
} from './runtime/ui-actions'
import { textEntities, createTextEntity as createTextEntityInState } from './runtime/text-entity-state'
import { fileEntities, createFileEntity as createFileEntityInState } from './runtime/file-entity-state'
import {
  layoutAllViews,
  requestLayout,
  snapToGrid,
} from './runtime/surface-layout'
import { workspaceEdges, workspaceGroups } from './runtime/workspace-model'
import { scheduleWorkspaceAutosave } from './runtime/workspace-session'
import { markDirty } from './runtime/layout-dirty'
import { makeId, cloneMetadata, pageCurrentUrl } from './workspace-utils'
import {
  deleteFrames,
  entityBoundsById,
  groupBounds,
  groupBoundsForEntityIds,
  groupById,
  groupChildIds,
  groupDescendantIds,
  selectionBounds,
  unionBounds,
  frameBoundsById,
} from './workspace-entities'
import { findDuplicatePlacement } from './workspace-placement'

// --- Entity parent-group helpers ---

function getEntityParentGroupId(entityId: string): string | undefined {
  return (
    findPageById(entityId)?.parentGroupId ??
    textEntities.find((entity) => entity.id === entityId)?.parentGroupId ??
    fileEntities.find((entity) => entity.id === entityId)?.parentGroupId ??
    groupById(entityId)?.parentGroupId
  )
}

function setEntityParentGroupId(entityId: string, parentGroupId: string | undefined): void {
  const page = findPageById(entityId)
  if (page) { page.parentGroupId = parentGroupId; return }
  const textEntity = textEntities.find((entity) => entity.id === entityId)
  if (textEntity) { textEntity.parentGroupId = parentGroupId; return }
  const fileEntity = fileEntities.find((entity) => entity.id === entityId)
  if (fileEntity) { fileEntity.parentGroupId = parentGroupId; return }
  const childGroup = groupById(entityId)
  if (childGroup) childGroup.parentGroupId = parentGroupId
}

// --- Exported group operations ---

export function createUserGroup(entityIds: string[], label?: string): WorkspaceGroup {
  const selectionIds = new Set([...new Set(entityIds)].filter(Boolean))

  let changed = true
  while (changed) {
    changed = false
    for (const group of workspaceGroups) {
      const childIds = groupChildIds(group.id)
      if (!childIds.length) continue
      if (!childIds.every((childId) => selectionIds.has(childId))) continue
      let removedChild = false
      for (const childId of childIds) {
        removedChild = selectionIds.delete(childId) || removedChild
      }
      if (removedChild) {
        selectionIds.add(group.id)
        changed = true
      }
    }
  }

  const normalizedIds = [...selectionIds]
  const roots = normalizedIds.filter((candidateId) => {
    let currentParentId = getEntityParentGroupId(candidateId)
    while (currentParentId) {
      if (normalizedIds.includes(currentParentId)) return false
      currentParentId = groupById(currentParentId)?.parentGroupId
    }
    return true
  })
  const contentBounds = groupBoundsForEntityIds(roots) ?? {
    x: 0,
    y: 0,
    width: USER_GROUP_PADDING * 2,
    height: USER_GROUP_PADDING * 2,
  }
  const parentGroupId = getEntityParentGroupId(roots[0])
  const group: WorkspaceGroup = {
    id: makeId('group'),
    kind: 'group',
    label: label ?? 'Group',
    canvasX: contentBounds.x - USER_GROUP_PADDING,
    canvasY: contentBounds.y - USER_GROUP_PADDING,
    width: Math.max(USER_GROUP_PADDING * 2, contentBounds.width + USER_GROUP_PADDING * 2),
    height: Math.max(USER_GROUP_PADDING * 2, contentBounds.height + USER_GROUP_PADDING * 2),
    parentGroupId,
    layoutMode: 'freeform',
    managedLayout: false,
  }
  workspaceGroups.push(group)
  for (const entityId of roots) {
    setEntityParentGroupId(entityId, group.id)
  }
  markDirty('canvas', 'sidebar')
  scheduleWorkspaceAutosave()
  return group
}

export function ungroupUserGroup(groupId: string): string[] {
  const idx = workspaceGroups.findIndex((g) => g.id === groupId)
  if (idx === -1) return []
  const group = workspaceGroups[idx]
  const freedIds = groupChildIds(groupId)
  for (const entityId of freedIds) {
    setEntityParentGroupId(entityId, group.parentGroupId)
  }
  workspaceGroups.splice(idx, 1)
  markDirty('canvas', 'sidebar')
  scheduleWorkspaceAutosave()
  return freedIds
}

export function removeEntityFromUserGroups(entityId: string): void {
  setEntityParentGroupId(entityId, undefined)
}

export function duplicateGroup(input: {
  groupId: string
  focus?: boolean
}): { groupId: string; entityIds: string[] } {
  const sourceGroup = groupById(input.groupId)
  if (!sourceGroup) {
    throw new Error(`Unknown group: ${input.groupId}`)
  }

  const sourceBounds = groupBounds(sourceGroup)
  const placement = sourceBounds
    ? findDuplicatePlacement(sourceBounds)
    : { canvasX: sourceGroup.canvasX + CLUSTER_HORIZONTAL_GUTTER, canvasY: sourceGroup.canvasY }
  const offsetX = placement.canvasX - sourceGroup.canvasX
  const offsetY = placement.canvasY - sourceGroup.canvasY

  const groupIdMap = new Map<string, string>()
  const entityIdMap = new Map<string, string>()
  const duplicatedEntityIds: string[] = []

  const cloneGroupTree = (group: WorkspaceGroup, parentGroupId?: string): WorkspaceGroup => {
    const childGroups = workspaceGroups.filter((candidate) => candidate.parentGroupId === group.id)
    const clonedGroup: WorkspaceGroup = {
      ...group,
      id: makeId('group'),
      canvasX: snapToGrid(group.canvasX + offsetX),
      canvasY: snapToGrid(group.canvasY + offsetY),
      parentGroupId,
      metadata: cloneMetadata(group.metadata),
    }
    workspaceGroups.push(clonedGroup)
    groupIdMap.set(group.id, clonedGroup.id)

    const childPages = pages.filter((page) => page.parentGroupId === group.id)
    for (const page of childPages) {
      const duplicatedPage = createPage({
        name: page.name,
        url: pageCurrentUrl(page.id) ?? page.url ?? 'about:blank',
        presetIndex: page.presetIndex,
        canvasX: snapToGrid(page.canvasX + offsetX),
        canvasY: snapToGrid(page.canvasY + offsetY),
        linked: false,
        suppressInitialNavigationBroadcast: true,
        source: page.source,
        parentGroupId: clonedGroup.id,
        metadata: cloneMetadata(page.metadata),
      })
      entityIdMap.set(page.id, duplicatedPage.id)
      duplicatedEntityIds.push(duplicatedPage.id)
    }

    const childTextEntities = textEntities.filter((entity) => entity.parentGroupId === group.id)
    for (const entity of childTextEntities) {
      const duplicatedEntity = createTextEntityInState({
        canvasX: snapToGrid(entity.canvasX + offsetX),
        canvasY: snapToGrid(entity.canvasY + offsetY),
        text: entity.text,
        color: entity.color,
        width: entity.width,
        height: entity.height,
        parentGroupId: clonedGroup.id,
      })
      entityIdMap.set(entity.id, duplicatedEntity.id)
      duplicatedEntityIds.push(duplicatedEntity.id)
    }

    const childFileEntities = fileEntities.filter((entity) => entity.parentGroupId === group.id)
    for (const entity of childFileEntities) {
      const duplicatedEntity = createFileEntityInState({
        canvasX: snapToGrid(entity.canvasX + offsetX),
        canvasY: snapToGrid(entity.canvasY + offsetY),
        file: entity.file,
        subpath: entity.subpath,
        width: entity.width,
        height: entity.height,
        parentGroupId: clonedGroup.id,
        presetIndex: entity.presetIndex,
        metadata: entity.metadata ? { ...entity.metadata } : undefined,
        objectFit: entity.objectFit,
      })
      entityIdMap.set(entity.id, duplicatedEntity.id)
      duplicatedEntityIds.push(duplicatedEntity.id)
    }

    for (const childGroup of childGroups) {
      cloneGroupTree(childGroup, clonedGroup.id)
    }

    return clonedGroup
  }

  const duplicatedRootGroup = cloneGroupTree(sourceGroup, sourceGroup.parentGroupId)
  const descendantIds = new Set([sourceGroup.id, ...groupDescendantIds(sourceGroup.id)])
  const sourceEdges = [...workspaceEdges]

  for (const edge of sourceEdges) {
    if (!descendantIds.has(edge.fromEntityId) || !descendantIds.has(edge.toEntityId)) continue
    const fromEntityId = entityIdMap.get(edge.fromEntityId) ?? groupIdMap.get(edge.fromEntityId)
    const toEntityId = entityIdMap.get(edge.toEntityId) ?? groupIdMap.get(edge.toEntityId)
    if (!fromEntityId || !toEntityId) continue
    workspaceEdges.push({
      ...edge,
      id: makeId('edge'),
      fromEntityId,
      toEntityId,
      metadata: cloneMetadata(edge.metadata),
    })
  }

  if (input.focus ?? true) {
    deselectAll()
    setSelectedGroupId(duplicatedRootGroup.id)
  }

  layoutAllViews()
  scheduleWorkspaceAutosave()
  return {
    groupId: duplicatedRootGroup.id,
    entityIds: duplicatedEntityIds,
  }
}

export function deleteGroups(input: DeleteGroupsRequest): DeleteGroupsResponse {
  const deletedGroupIds: string[] = []
  const deletedFrameIds: string[] = []
  const deletedEdgeIds: string[] = []
  const missingGroupIds: string[] = []

  for (const groupId of input.groupIds) {
    const idx = workspaceGroups.findIndex((group) => group.id === groupId)
    if (idx === -1) {
      missingGroupIds.push(groupId)
      continue
    }
    const group = workspaceGroups[idx]
    if (input.deleteMemberFrames ?? true) {
      const frameDeletion = deleteFrames({
        frameIds: pages.filter((page) => page.parentGroupId === group.id).map((page) => page.id),
      })
      deletedFrameIds.push(...frameDeletion.deletedFrameIds)
      deletedEdgeIds.push(...frameDeletion.deletedEdgeIds)
    } else {
      for (const frameId of pages.filter((page) => page.parentGroupId === group.id).map((page) => page.id)) {
        const page = findPageById(frameId)
        if (page) {
          page.parentGroupId = undefined
          page.groupId = undefined
        }
      }
    }
    const existingIdx = workspaceGroups.findIndex((candidate) => candidate.id === groupId)
    if (existingIdx !== -1) {
      workspaceGroups.splice(existingIdx, 1)
    }
    deletedGroupIds.push(groupId)
  }
  if (deletedGroupIds.includes(getSelectedGroupId() ?? '')) {
    setSelectedGroupId(null)
  }

  if (input.focusAfter) {
    const bounds = selectionBounds()
    if (bounds) focusCanvasBounds(bounds)
  } else {
    requestLayout()
  }

  if (deletedGroupIds.length || deletedFrameIds.length || deletedEdgeIds.length) {
    scheduleWorkspaceAutosave()
  }

  return {
    deletedGroupIds,
    deletedFrameIds,
    deletedEdgeIds,
    missingGroupIds,
    warnings: missingGroupIds.length
      ? [`Missing group IDs: ${missingGroupIds.join(', ')}`]
      : [],
  }
}

export function focusTargets(input: {
  frameIds?: string[]
  groupIds?: string[]
  bounds?: WorkspaceBounds
}): { focused: boolean } {
  if (input.bounds) {
    focusCanvasBounds(input.bounds)
    scheduleWorkspaceAutosave()
    return { focused: true }
  }

  if (input.groupIds?.length) {
    const groups = input.groupIds
      .map(groupById)
      .filter((group): group is WorkspaceGroup => Boolean(group))
    const bounds = unionBounds(
      groups
        .map((group) => groupBounds(group))
        .filter((item): item is WorkspaceBounds => item !== null),
    )
    if (bounds) {
      setSelectedGroupId(groups[0].id)
      focusCanvasBounds(bounds)
      scheduleWorkspaceAutosave()
      return { focused: true }
    }
  }

  if (input.frameIds?.length) {
    const bounds = unionBounds(
      input.frameIds
        .map(frameBoundsById)
        .filter((item): item is WorkspaceBounds => item !== null),
    )
    if (bounds) {
      selectPageById(input.frameIds[0])
      focusCanvasBounds(bounds)
      scheduleWorkspaceAutosave()
      return { focused: true }
    }
  }

  return { focused: false }
}
