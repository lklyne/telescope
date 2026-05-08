import type { Route } from './types'
import type { CreateEdgesRequest, DeleteGroupsRequest } from '../../shared/types'
import { createEdges, deleteEdges } from '../workspace-edges'
import { createUserGroup, deleteGroups, focusTargets } from '../workspace-groups'
import { ungroupSelectedGroup } from '../runtime/document-commands'
import { selectGroup as selectSelectionGroup } from '../runtime/selection-controller'
import { workspaceEdges, workspaceGroups } from '../runtime/workspace-model'
import { findEntityPosition, movePresenceCursorTo } from '../presence-manager'
import { writeJson } from '../app-control-server'

export const edgesGroupsRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/edges/create',
    async handler({ request, response, body }) {
      const payload = body as CreateEdgesRequest
      const firstTarget = payload.edges?.find((e) => findEntityPosition(e.toEntityId) !== null)
      if (firstTarget) {
        const pos = findEntityPosition(firstTarget.toEntityId)!
        movePresenceCursorTo(request, pos.x, pos.y, null)
      }
      writeJson(response, 200, createEdges(payload))
    },
  },
  {
    method: 'POST',
    pattern: '/edges/delete',
    async handler({ request, response, body }) {
      const payload = body as { edgeIds: string[] }
      const firstEdge = payload.edgeIds
        ?.map((id) => workspaceEdges.find((e) => e.id === id))
        .find((e): e is NonNullable<typeof e> => Boolean(e))
      if (firstEdge) {
        const pos = findEntityPosition(firstEdge.toEntityId)
        if (pos) movePresenceCursorTo(request, pos.x, pos.y, null)
      }
      writeJson(response, 200, deleteEdges(payload))
    },
  },
  {
    method: 'POST',
    pattern: '/groups/create',
    async handler({ request, response, body }) {
      const payload = body as { entityIds?: string[]; label?: string }
      const entityIds = payload.entityIds ?? []
      if (!entityIds.length) {
        writeJson(response, 400, { error: 'entityIds is required' })
        return
      }
      const firstPos = entityIds
        .map((id) => findEntityPosition(id))
        .find((p): p is NonNullable<typeof p> => p !== null)
      if (firstPos) movePresenceCursorTo(request, firstPos.x, firstPos.y, null)
      const group = createUserGroup(entityIds, payload.label)
      writeJson(response, 200, group)
    },
  },
  {
    method: 'POST',
    pattern: '/groups/delete',
    async handler({ request, response, body }) {
      const payload = body as DeleteGroupsRequest
      const firstGroup = payload.groupIds
        ?.map((id) => workspaceGroups.find((g) => g.id === id))
        .find((g): g is NonNullable<typeof g> => Boolean(g))
      if (firstGroup) movePresenceCursorTo(request, firstGroup.canvasX, firstGroup.canvasY, null)
      writeJson(response, 200, deleteGroups(payload))
    },
  },
  {
    method: 'POST',
    pattern: '/groups/ungroup',
    async handler({ request, response, body }) {
      const payload = body as { groupId?: string }
      if (!payload.groupId) {
        writeJson(response, 400, { error: 'groupId is required' })
        return
      }
      const group = workspaceGroups.find((g) => g.id === payload.groupId)
      if (!group) {
        writeJson(response, 404, { error: 'Group not found' })
        return
      }
      movePresenceCursorTo(request, group.canvasX, group.canvasY, null)
      selectSelectionGroup(payload.groupId)
      writeJson(response, 200, { entityIds: ungroupSelectedGroup() ?? [] })
    },
  },
  {
    method: 'POST',
    pattern: '/camera/focus',
    async handler({ request, response, body }) {
      const payload = body as {
        pageIds?: string[]
        groupIds?: string[]
        bounds?: { x: number; y: number; width: number; height: number }
      }
      const firstId = payload.pageIds?.[0] ?? payload.groupIds?.[0]
      if (firstId) {
        const pos = findEntityPosition(firstId)
        if (pos) movePresenceCursorTo(request, pos.x, pos.y, null)
      } else if (payload.bounds) {
        movePresenceCursorTo(
          request,
          payload.bounds.x + payload.bounds.width / 2,
          payload.bounds.y + payload.bounds.height / 2,
          null,
        )
      }
      writeJson(response, 200, focusTargets(payload))
    },
  },
]
