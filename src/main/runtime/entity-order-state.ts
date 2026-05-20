import type { SidebarSectionKey } from '../../shared/types'
import {
  enforceGroupContiguity,
  moveBlockBefore,
  replaceSubsequence,
  type MovePosition,
} from '../../shared/entity-order-math'
import { drawingEntities } from './drawing-entity-state'
import { fileEntities } from './file-entity-state'
import { getActiveDoc, DOC_ARRAY_ENTITY_ORDER } from './workspace-doc'
import { markDirty } from './layout-dirty'
import { pages } from './runtime-context'
import { requestLayout } from './viewport-control'
import { shapeEntities } from './shape-entity-state'
import { textEntities } from './text-entity-state'
import { selectedEntityIds as uiSelectedEntityIds, selectedGroupId as uiSelectedGroupId } from '../ui-state'
import { scheduleWorkspaceAutosave } from './workspace-autosave'
import { workspaceGroups } from './workspace-model'

type EntityKindForOrder = 'page' | 'text' | 'file' | 'drawing' | 'shape' | 'group' | 'edge'

function defaultEntityOrder(): string[] {
  return [
    ...pages.map((page) => page.id),
    ...textEntities.map((entity) => entity.id),
    ...fileEntities.map((entity) => entity.id),
    ...drawingEntities.map((entity) => entity.id),
    ...shapeEntities.map((entity) => entity.id),
    ...workspaceGroups.map((group) => group.id),
  ]
}

export function currentEntityIds(): Set<string> {
  return new Set(defaultEntityOrder())
}

export function currentEntityOrder(): string[] {
  const currentIds = currentEntityIds()
  const seen = new Set<string>()
  const order: string[] = []
  for (const id of getActiveDoc().getArray<string>(DOC_ARRAY_ENTITY_ORDER).toArray()) {
    if (!currentIds.has(id) || seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }
  for (const id of defaultEntityOrder()) {
    if (seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }
  return order
}

export function currentEntityOrderRank(): Map<string, number> {
  return new Map(currentEntityOrder().map((id, index) => [id, index]))
}

export function writeEntityOrder(nextOrder: readonly string[]): void {
  const currentIds = currentEntityIds()
  const seen = new Set<string>()
  const sanitized: string[] = []
  for (const id of nextOrder) {
    if (!currentIds.has(id) || seen.has(id)) continue
    seen.add(id)
    sanitized.push(id)
  }
  for (const id of defaultEntityOrder()) {
    if (seen.has(id)) continue
    seen.add(id)
    sanitized.push(id)
  }

  const order = getActiveDoc().getArray<string>(DOC_ARRAY_ENTITY_ORDER)
  if (JSON.stringify(order.toArray()) === JSON.stringify(sanitized)) return
  getActiveDoc().transact(() => {
    order.delete(0, order.length)
    if (sanitized.length) order.push(sanitized)
  }, 'user')
}

function entityKindById(id: string): EntityKindForOrder | null {
  if (pages.some((page) => page.id === id)) return 'page'
  if (textEntities.some((entity) => entity.id === id)) return 'text'
  if (fileEntities.some((entity) => entity.id === id)) return 'file'
  if (drawingEntities.some((entity) => entity.id === id)) return 'drawing'
  if (shapeEntities.some((entity) => entity.id === id)) return 'shape'
  if (workspaceGroups.some((group) => group.id === id)) return 'group'
  return null
}

function parentGroupIdById(id: string): string | null {
  const page = pages.find((entity) => entity.id === id)
  if (page) return page.parentGroupId ?? null
  const text = textEntities.find((entity) => entity.id === id)
  if (text) return text.parentGroupId ?? null
  const file = fileEntities.find((entity) => entity.id === id)
  if (file) return file.parentGroupId ?? null
  const drawing = drawingEntities.find((entity) => entity.id === id)
  if (drawing) return drawing.parentGroupId ?? null
  const shape = shapeEntities.find((entity) => entity.id === id)
  if (shape) return shape.parentGroupId ?? null
  const group = workspaceGroups.find((entity) => entity.id === id)
  if (group) return group.parentGroupId ?? null
  return null
}

function directChildIds(groupId: string): string[] {
  return [
    ...pages.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...textEntities.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...fileEntities.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...drawingEntities.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...shapeEntities.filter((entity) => entity.parentGroupId === groupId).map((entity) => entity.id),
    ...workspaceGroups.filter((group) => group.parentGroupId === groupId).map((group) => group.id),
  ]
}

function descendantIds(groupId: string): string[] {
  const ids: string[] = []
  for (const childId of directChildIds(groupId)) {
    ids.push(childId)
    if (entityKindById(childId) === 'group') ids.push(...descendantIds(childId))
  }
  return ids
}

function groupHasSection(groupId: string, section: SidebarSectionKey): boolean {
  return descendantIds(groupId).some((id) => isInSidebarSection(id, section))
}

export function isInSidebarSection(id: string, section: SidebarSectionKey): boolean {
  const kind = entityKindById(id)
  if (!kind) return false
  if (kind === 'group') return groupHasSection(id, section)
  if (section === 'pages') return kind === 'page'
  return kind === 'text' || kind === 'file' || kind === 'drawing' || kind === 'shape'
}

function selectedBlockForDrag(draggedId: string, section: SidebarSectionKey, parentId: string | null): string[] {
  const selectedIds = uiSelectedEntityIds()
  const groupId = uiSelectedGroupId()
  const selectedBlock = selectedIds.includes(draggedId)
    ? selectedIds
    : groupId === draggedId
      ? [groupId]
      : [draggedId]
  return selectedBlock.filter(
    (id) => isInSidebarSection(id, section) && parentGroupIdById(id) === parentId,
  )
}

function groupsForContiguity() {
  return workspaceGroups.map((group) => ({
    id: group.id,
    parentGroupId: group.parentGroupId ?? null,
    childIds: directChildIds(group.id),
  }))
}

export function reorderSidebarStackOrder(input: {
  section: SidebarSectionKey
  draggedId: string
  anchorId: string | null
  position: MovePosition
  parentId: string | null
}): boolean {
  const { section, draggedId, anchorId, position, parentId } = input
  if (!isInSidebarSection(draggedId, section)) return false
  if (parentGroupIdById(draggedId) !== parentId) return false
  if (anchorId) {
    if (!isInSidebarSection(anchorId, section)) return false
    if (parentGroupIdById(anchorId) !== parentId) return false
  }

  const order = currentEntityOrder()
  const block = selectedBlockForDrag(draggedId, section, parentId)
  if (!block.length) return false
  const eligible = (id: string) => isInSidebarSection(id, section) && parentGroupIdById(id) === parentId
  const sectionOrder = order.filter(eligible)
  const movedSectionOrder = moveBlockBefore(sectionOrder, block, anchorId, position)
  const nextOrder = enforceGroupContiguity(
    replaceSubsequence(order, eligible, movedSectionOrder),
    groupsForContiguity(),
  )
  if (JSON.stringify(order) === JSON.stringify(nextOrder)) return false

  writeEntityOrder(nextOrder)
  markDirty('canvas', 'sidebar')
  scheduleWorkspaceAutosave()
  requestLayout()
  return true
}
