import type { CanvasSceneGroupEntity, LayoutUpdateData } from '../../shared/types'

export function descendantIdsForGroup(
  groups: readonly CanvasSceneGroupEntity[],
  groupId: string,
): Set<string> {
  const descendants = new Set<string>()
  const groupsById = new Map(groups.map((group) => [group.id, group]))

  const visit = (currentGroupId: string) => {
    const group = groupsById.get(currentGroupId)
    if (!group) return

    for (const entityId of group.entityIds) {
      if (descendants.has(entityId)) continue
      descendants.add(entityId)
      if (groupsById.has(entityId)) visit(entityId)
    }
  }

  visit(groupId)
  return descendants
}

export function selectedGroupDragTargetId(
  layout: Pick<LayoutUpdateData, 'groups' | 'selectedGroupId'>,
  entityId: string,
): string | null {
  const selectedGroupId = layout.selectedGroupId ?? null
  if (!selectedGroupId) return null
  if (entityId === selectedGroupId) return selectedGroupId
  return descendantIdsForGroup(layout.groups ?? [], selectedGroupId).has(entityId)
    ? selectedGroupId
    : null
}

export function selectedGroupHasDescendantPage(
  layout: Pick<LayoutUpdateData, 'entities' | 'groups' | 'selectedGroupId'>,
): boolean {
  const selectedGroupId = layout.selectedGroupId ?? null
  if (!selectedGroupId) return false

  const descendantIds = descendantIdsForGroup(layout.groups ?? [], selectedGroupId)
  return layout.entities.some((entity) => entity.kind === 'page' && descendantIds.has(entity.id))
}
