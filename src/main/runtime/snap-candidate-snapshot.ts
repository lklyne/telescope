import type { CanvasEntityKind } from '../../shared/types'

export type SnapRect = {
  x: number
  y: number
  width: number
  height: number
}

export type SnapCandidateSnapshotEntity = {
  id: string
  kind: Exclude<CanvasEntityKind, 'edge'>
  canvasX: number
  canvasY: number
  width: number
  height: number
  parentGroupId?: string
}

export type SnapCandidate = {
  id: string
  kind: SnapCandidateSnapshotEntity['kind']
  left: number
  right: number
  top: number
  bottom: number
  hCenter: number
  vCenter: number
}

export function snapCandidateFromRect(
  entity: Pick<SnapCandidateSnapshotEntity, 'id' | 'kind'>,
  rect: SnapRect,
): SnapCandidate {
  return {
    id: entity.id,
    kind: entity.kind,
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height,
    hCenter: rect.y + rect.height / 2,
    vCenter: rect.x + rect.width / 2,
  }
}

function rectsIntersect(a: SnapRect, b: SnapRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

function entityRect(entity: SnapCandidateSnapshotEntity): SnapRect {
  return {
    x: entity.canvasX,
    y: entity.canvasY,
    width: entity.width,
    height: entity.height,
  }
}

export function snapCandidateSnapshot(
  workspaceState: { entities: SnapCandidateSnapshotEntity[] },
  viewportRect: SnapRect,
  excludedIds: Iterable<string>,
): SnapCandidate[] {
  const excluded = new Set(excludedIds)
  const visibleGroupIds = new Set(
    workspaceState.entities
      .filter((entity) => (
        entity.kind === 'group' &&
        !excluded.has(entity.id) &&
        rectsIntersect(entityRect(entity), viewportRect)
      ))
      .map((entity) => entity.id),
  )

  return workspaceState.entities.flatMap((entity) => {
    if (excluded.has(entity.id)) return []
    if (entity.parentGroupId && visibleGroupIds.has(entity.parentGroupId)) return []

    const rect = entityRect(entity)
    if (!rectsIntersect(rect, viewportRect)) return []

    return [snapCandidateFromRect(entity, rect)]
  })
}
