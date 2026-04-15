/**
 * DropOwner — single authority over drag/drop routing across overlapping WCVs.
 *
 * Spec §4.5. Electron dispatches drop events to every overlapping
 * WebContentsView (gotcha #9, issues #2897, #18226). Traditional
 * payload-hash + timeout dedup is fragile: slow filesystems, identical
 * content dropped twice intentionally, and off-by-500ms all bite.
 *
 * The spec's fix: stamp a unique `dragId` on `dragstart` (renderer-side,
 * from src/shared/drag-ids.ts), forward it through the drop IPC
 * payload, and let main mark it consumed on first receipt. Subsequent
 * deliveries of the same dragId are dropped.
 *
 * Phase 4 scope: module + dedup API. Renderers stamp dragIds in Phase 5
 * when preload bridges get revisited. Until then, call sites that
 * haven't migrated fall back to their legacy dedup.
 */

import type { DragId } from '../../shared/drag-ids'

/** Window after which a dragId is considered "stale enough" to forget. */
export const DRAG_ID_TTL_MS = 10_000

type ConsumedEntry = { consumedAt: number }

const consumed = new Map<string, ConsumedEntry>()

function gc(now: number): void {
  // Lazy cleanup — called on every check.
  for (const [id, entry] of consumed) {
    if (now - entry.consumedAt > DRAG_ID_TTL_MS) consumed.delete(id)
  }
}

/**
 * Returns true if this dragId was previously consumed (caller must ignore
 * the drop). Returns false on first sight and marks it consumed.
 */
export function consumeDragId(dragId: DragId | string): boolean {
  const now = Date.now()
  gc(now)
  if (consumed.has(dragId)) return true
  consumed.set(dragId, { consumedAt: now })
  return false
}

/** Testing hook. */
export function __resetForTests(): void {
  consumed.clear()
}
