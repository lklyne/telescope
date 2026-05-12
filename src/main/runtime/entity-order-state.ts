/**
 * Runtime wrapper around `entityOrder` — the back-to-front paint order of
 * canvas items (entities, groups, and eventually edges). See ADR 0006 for
 * invariants.
 *
 * Why a runtime mirror at all? Pre-ADR, `entityOrder` was regenerated on every
 * diff-sync by concatenating runtime kind buckets (pages, text, file, ...) in
 * a fixed order. That was fine when no user-driven reorder existed, but
 * destroys any explicit stack order the moment we add mutations. The runtime
 * mirror is the single source of truth at runtime:
 *
 *   - Writes (mutations, reorder) update `entityOrderRuntime` and schedule a
 *     diff-sync.
 *   - Reads (sidebar, paint order, hit test) go through `getEntityOrderRuntime`.
 *   - The diff-sync writes the mirror to Y.Doc verbatim.
 *   - Undo / redo overwrites the mirror from Y.Doc.
 *   - Restore seeds the mirror from `snapshot.entityOrder`.
 *
 * The reconciler (`reconcileEntityOrder`) absorbs entity creation / deletion
 * without invasive call-site changes: any id in the runtime entity arrays
 * that's missing from the mirror gets appended at the top (per ADR §8); any
 * id in the mirror that no longer corresponds to an entity is dropped.
 */

import {
  bringToFront as bringToFrontPure,
  sendToBack as sendToBackPure,
  moveForward as moveForwardPure,
  moveBackward as moveBackwardPure,
  type GroupRun,
} from '../../shared/entity-order-math'
import { drawingEntities } from './drawing-entity-state'
import { fileEntities } from './file-entity-state'
import { shapeEntities } from './shape-entity-state'
import { textEntities } from './text-entity-state'
import { pages } from './runtime-context'
import { workspaceGroups } from './workspace-model'
import { descendantEntityIdsForGroup } from './group-descendants'
import { markDirty } from './layout-dirty'

/**
 * The canonical runtime stack order. `[0]` is the backmost slot;
 * `[length - 1]` is the frontmost. Mutate via the functions in this module.
 */
const entityOrderRuntime: string[] = []

/** Snapshot of the runtime mirror. Callers must not mutate. */
export function getEntityOrderRuntime(): readonly string[] {
  return entityOrderRuntime
}

/**
 * Reconciled snapshot of the runtime mirror — the canonical accessor for the
 * sidebar, paint order, and layout-data builders. Reconciliation is cheap
 * (O(entities)) and idempotent.
 */
export function getEntityOrder(): readonly string[] {
  reconcileEntityOrder()
  return entityOrderRuntime
}

/**
 * Replace the runtime mirror with `ids`. Used by the workspace restore path
 * and the Y.Doc → runtime sync on undo / redo. Callers are responsible for
 * ensuring `ids` matches the entities that exist in the runtime arrays.
 */
export function setEntityOrderRuntime(ids: readonly string[]): void {
  entityOrderRuntime.length = 0
  entityOrderRuntime.push(...ids)
}

/** All ids that should appear in `entityOrder`. */
function liveEntityIds(): Set<string> {
  const ids = new Set<string>()
  for (const p of pages) ids.add(p.id)
  for (const e of textEntities) ids.add(e.id)
  for (const e of fileEntities) ids.add(e.id)
  for (const e of drawingEntities) ids.add(e.id)
  for (const e of shapeEntities) ids.add(e.id)
  for (const g of workspaceGroups) ids.add(g.id)
  return ids
}

/**
 * Reconcile the runtime mirror against the current entity arrays:
 *   - drop ids that no longer correspond to an entity
 *   - append ids that exist as entities but aren't in the mirror, at the top
 *     (frontmost), preserving the order in which they appear in the runtime
 *     arrays (pages, text, file, drawing, shape, groups)
 *
 * Idempotent. Run before every read that needs to be authoritative, and
 * before every mutation.
 */
export function reconcileEntityOrder(): void {
  const live = liveEntityIds()
  // Drop stale ids.
  for (let i = entityOrderRuntime.length - 1; i >= 0; i--) {
    if (!live.has(entityOrderRuntime[i]!)) entityOrderRuntime.splice(i, 1)
  }
  // Append new ids at the top, preserving runtime-array order.
  const seen = new Set(entityOrderRuntime)
  const appendIfNew = (id: string) => {
    if (!seen.has(id)) {
      entityOrderRuntime.push(id)
      seen.add(id)
    }
  }
  for (const p of pages) appendIfNew(p.id)
  for (const e of textEntities) appendIfNew(e.id)
  for (const e of fileEntities) appendIfNew(e.id)
  for (const e of drawingEntities) appendIfNew(e.id)
  for (const e of shapeEntities) appendIfNew(e.id)
  for (const g of workspaceGroups) appendIfNew(g.id)
}

/**
 * Build the `GroupRun` array the pure helpers expect. Each entry expands a
 * group to its recursive descendants.
 */
function buildGroupRuns(): GroupRun[] {
  return workspaceGroups.map((g) => ({
    groupId: g.id,
    descendantIds: descendantEntityIdsForGroup(g.id),
  }))
}

function commitOrder(next: readonly string[]): boolean {
  if (next.length === entityOrderRuntime.length) {
    let same = true
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== entityOrderRuntime[i]) { same = false; break }
    }
    if (same) return false
  }
  entityOrderRuntime.length = 0
  entityOrderRuntime.push(...next)
  // 'stack' triggers applyStack() for page WCV restack; 'canvas' + 'sidebar'
  // refresh the paint order in the renderer.
  markDirty('canvas', 'sidebar', 'stack')
  return true
}

/**
 * Move every id in `selection` to the frontmost slots, preserving relative
 * order. Group ids drag their full run. Returns true if the order changed.
 */
export function bringEntitiesToFront(selection: readonly string[]): boolean {
  reconcileEntityOrder()
  const next = bringToFrontPure(entityOrderRuntime, selection, buildGroupRuns())
  return commitOrder(next)
}

/**
 * Move every id in `selection` to the backmost slots, preserving relative
 * order. Group ids drag their full run. Returns true if the order changed.
 */
export function sendEntitiesToBack(selection: readonly string[]): boolean {
  reconcileEntityOrder()
  const next = sendToBackPure(entityOrderRuntime, selection, buildGroupRuns())
  return commitOrder(next)
}

/**
 * Move every contiguous run of selected ids forward by one slot. Group ids
 * drag their full run. Returns true if the order changed.
 */
export function moveEntitiesForward(selection: readonly string[]): boolean {
  reconcileEntityOrder()
  const next = moveForwardPure(entityOrderRuntime, selection, buildGroupRuns())
  return commitOrder(next)
}

/**
 * Move every contiguous run of selected ids backward by one slot. Group ids
 * drag their full run. Returns true if the order changed.
 */
export function moveEntitiesBackward(selection: readonly string[]): boolean {
  reconcileEntityOrder()
  const next = moveBackwardPure(entityOrderRuntime, selection, buildGroupRuns())
  return commitOrder(next)
}
