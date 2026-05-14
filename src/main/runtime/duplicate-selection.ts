import {
  entityKindById,
  groupBoundsForEntityIds,
} from '../workspace-entities'
import { duplicateGroup } from '../workspace-groups'
import { findDuplicatePlacement } from '../workspace-placement'
import { duplicateEntity, duplicatePageFromSource } from '../workspace-pages'
import {
  copyableSelectionPayload,
  pasteEntitiesFromClipboard,
} from '../workspace-clipboard'
import { getSelectedEntityIds } from './runtime-core'

export function duplicateSelection(): void {
  const entityIds = getSelectedEntityIds()
  if (!entityIds.length) return

  if (entityIds.length === 1) {
    const id = entityIds[0]
    const kind = entityKindById(id)
    if (kind === 'group') {
      duplicateGroup({ groupId: id, focus: true })
      return
    }
    if (kind === 'page') {
      duplicatePageFromSource({ sourcePageId: id, focus: true })
      return
    }
    duplicateEntity({ entityId: id, focus: true })
    return
  }

  // Multi-selection: reuse copy/paste machinery so duplicates retain
  // their relative layout and every selected item is included.
  const payload = copyableSelectionPayload()
  if (!payload) return
  const bounds = groupBoundsForEntityIds(entityIds)
  if (!bounds) return
  const placement = findDuplicatePlacement(bounds)
  pasteEntitiesFromClipboard({
    payload,
    canvasX: placement.canvasX,
    canvasY: placement.canvasY,
  })
}
