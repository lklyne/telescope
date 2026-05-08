/**
 * Edit mode — single runtime arbiter for inline canvas-item editing
 * (sticky/text bodies, shape labels, group rename labels).
 *
 * One `InteractionMode` (`editing-entity`), one runtime variable
 * (`editingEntityId`, derived from interactionState), one IPC vocabulary
 * (`canvas-request-entity-edit` / `canvas-commit-entity-edit` /
 * `canvas-cancel-entity-edit`). Main is the sole token holder —
 * renderers never see the token, only the broadcast.
 *
 * Lifecycle:
 *   - begin: select the entity, `tryEnter({ kind: 'editing-entity' })`,
 *     stash the token.
 *   - commit: close the token via `commit()`.
 *   - cancel: close the token via `cancel()`.
 *   - external interruption (`cancelActive`, selection change, undo,
 *     tab switch, entity delete): the controller's clear path runs;
 *     `editingEntityId` derives from interactionState so it follows
 *     automatically.
 */

import type { Token } from '../../shared/interaction-types'
import {
  cancel as cancelInteraction,
  commit as commitInteraction,
  tryEnter,
} from './interaction-controller'
import { getEditingEntityId } from './runtime-context'

let activeToken: Token | null = null

function syncTokenWithMode(): void {
  // If something other than us flipped the controller out of
  // editing-entity (e.g. cancelActive from undo / tab switch /
  // selection change), drop the token so subsequent commit/cancel
  // calls are clean no-ops.
  if (getEditingEntityId() === null) activeToken = null
}

export function isEditingEntity(): boolean {
  return getEditingEntityId() !== null
}

export function currentEditingEntityId(): string | null {
  return getEditingEntityId()
}

/**
 * Enter edit mode for the given entity. Returns true on success, false
 * if the controller refused (another gesture is in flight). Caller is
 * responsible for selecting the entity beforehand.
 */
export function beginEditingEntity(entityId: string): boolean {
  syncTokenWithMode()
  // Re-entering on the same entity is a no-op (idempotent).
  if (activeToken && getEditingEntityId() === entityId) return true

  const result = tryEnter({ kind: 'editing-entity', entityId })
  if ('refused' in result) return false
  activeToken = result
  return true
}

/**
 * Commit the active edit, if any. Idempotent: a no-op when not editing.
 */
export function commitEditingEntity(): void {
  syncTokenWithMode()
  if (!activeToken) return
  const token = activeToken
  activeToken = null
  commitInteraction(token)
}

/**
 * Cancel the active edit, if any. Idempotent: a no-op when not editing.
 */
export function cancelEditingEntity(reason: 'escape' | 'external' = 'escape'): void {
  syncTokenWithMode()
  if (!activeToken) return
  const token = activeToken
  activeToken = null
  cancelInteraction(token, reason)
}

/**
 * Cancel the edit only if the target entity is the one currently being
 * edited. Idempotent. Used by entity-delete paths so deleting the entity
 * mid-edit drops the editor cleanly.
 */
export function cancelEditingEntityIfMatches(entityId: string): void {
  if (getEditingEntityId() !== entityId) return
  cancelEditingEntity('external')
}

/** Testing hook. Resets module-local state without touching the controller. */
export function __resetEditingEntityForTests(): void {
  activeToken = null
}
