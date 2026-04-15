import type { Route } from './types'
import type { CreateEdgesRequest, DeleteGroupsRequest } from '../../shared/types'
import { createEdges, deleteEdges } from '../workspace-edges'
import { createUserGroup, deleteGroups, focusTargets } from '../workspace-groups'
import { ungroupSelectedGroup } from '../runtime/document-commands'
import { selectGroup as selectSelectionGroup } from '../runtime/selection-controller'
import { workspaceGroups } from '../runtime/workspace-model'
import { writeJson } from '../app-control-server'

export const edgesGroupsRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/edges/create',
    async handler({ response, body }) {
      writeJson(response, 200, createEdges(body as CreateEdgesRequest))
    },
  },
  {
    method: 'POST',
    pattern: '/edges/delete',
    async handler({ response, body }) {
      writeJson(response, 200, deleteEdges(body as { edgeIds: string[] }))
    },
  },
  {
    method: 'POST',
    pattern: '/groups/create',
    async handler({ response, body }) {
      const payload = body as { entityIds?: string[]; label?: string }
      const entityIds = payload.entityIds ?? []
      if (!entityIds.length) {
        writeJson(response, 400, { error: 'entityIds is required' })
        return
      }
      const group = createUserGroup(entityIds, payload.label)
      writeJson(response, 200, group)
    },
  },
  {
    method: 'POST',
    pattern: '/groups/delete',
    async handler({ response, body }) {
      writeJson(response, 200, deleteGroups(body as DeleteGroupsRequest))
    },
  },
  {
    method: 'POST',
    pattern: '/groups/ungroup',
    async handler({ response, body }) {
      const payload = body as { groupId?: string }
      if (!payload.groupId) {
        writeJson(response, 400, { error: 'groupId is required' })
        return
      }
      if (!workspaceGroups.some((group) => group.id === payload.groupId)) {
        writeJson(response, 404, { error: 'Group not found' })
        return
      }
      selectSelectionGroup(payload.groupId)
      writeJson(response, 200, { entityIds: ungroupSelectedGroup() ?? [] })
    },
  },
  {
    method: 'POST',
    pattern: '/camera/focus',
    async handler({ response, body }) {
      writeJson(
        response,
        200,
        focusTargets(body as {
          frameIds?: string[]
          groupIds?: string[]
          bounds?: { x: number; y: number; width: number; height: number }
        }),
      )
    },
  },
]
