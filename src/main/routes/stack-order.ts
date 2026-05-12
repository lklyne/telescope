import type { Route } from './types'
import {
  bringEntitiesToFront,
  getEntityOrder,
  getEntityOrderRuntime,
  moveEntitiesBackward,
  moveEntitiesForward,
  sendEntitiesToBack,
} from '../runtime/entity-order-state'
import { scheduleWorkspaceAutosave } from '../runtime/workspace-autosave'
import { markUndoBoundary } from '../runtime/workspace-undo'
import { requestLayout } from '../runtime/viewport-control'
import { writeJson } from '../app-control-server'

type Mutation = (ids: readonly string[]) => boolean

function applyMutation(mutation: Mutation, ids: readonly string[]): boolean {
  const changed = mutation(ids)
  if (changed) {
    scheduleWorkspaceAutosave()
    requestLayout()
    markUndoBoundary()
  }
  return changed
}

function readIds(body: unknown): string[] | null {
  const payload = body as { ids?: unknown; id?: unknown }
  if (typeof payload?.id === 'string') return [payload.id]
  if (Array.isArray(payload?.ids)) {
    const ids = (payload.ids as unknown[]).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    )
    return ids
  }
  return null
}

function route(pattern: string, mutation: Mutation): Route {
  return {
    method: 'POST',
    pattern,
    async handler({ response, body }) {
      const ids = readIds(body)
      if (!ids || ids.length === 0) {
        writeJson(response, 400, { error: 'ids is required (non-empty string array)' })
        return
      }
      const changed = applyMutation(mutation, ids)
      writeJson(response, 200, { changed, entityOrder: [...getEntityOrderRuntime()] })
    },
  }
}

export const stackOrderRoutes: Route[] = [
  // Returns the current stack order back-to-front. Useful for tests and
  // tooling that wants to assert reorderings without parsing internal state.
  {
    method: 'GET',
    pattern: '/stack-order',
    async handler({ response }) {
      writeJson(response, 200, { entityOrder: [...getEntityOrder()] })
    },
  },
  route('/stack-order/bring-to-front', bringEntitiesToFront),
  route('/stack-order/send-to-back', sendEntitiesToBack),
  route('/stack-order/bring-forward', moveEntitiesForward),
  route('/stack-order/send-backward', moveEntitiesBackward),
]
