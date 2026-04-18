/**
 * Per-session narration event bus.
 *
 * Narration events are fire-and-forget pushes from CLI handlers onto a FIFO
 * queue per session. The director drains a session's queue each tick. The
 * bus is bounded: at the soft cap, non-commit passive/scan events are dropped
 * first so that ordering and commits are preserved under bursty load.
 */

import type { NarrationEvent } from '../../shared/narration-event'
import { pushDebugEntry } from './debug-timeline'

const MAX_QUEUE_DEPTH = 200

type Listener = (sessionId: string) => void

const queues = new Map<string, NarrationEvent[]>()
const listeners = new Set<Listener>()

export function emitNarration(event: NarrationEvent): void {
  const queue = queues.get(event.sessionId) ?? []
  if (queue.length >= MAX_QUEUE_DEPTH) {
    dropNonCritical(queue, event.sessionId)
  }
  queue.push(event)
  queues.set(event.sessionId, queue)
  for (const listener of listeners) {
    listener(event.sessionId)
  }
}

export function drainSession(sessionId: string): NarrationEvent[] {
  const queue = queues.get(sessionId)
  if (!queue || queue.length === 0) return []
  queues.delete(sessionId)
  return queue
}

export function peekSession(sessionId: string): readonly NarrationEvent[] {
  return queues.get(sessionId) ?? []
}

export function clearSession(sessionId: string): void {
  queues.delete(sessionId)
}

export function hasPending(): boolean {
  for (const queue of queues.values()) {
    if (queue.length > 0) return true
  }
  return false
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * When the queue is full, drop the oldest non-commit event. If every event
 * carries a commit waypoint, drop the oldest anyway: preserving order matters
 * more than preserving every commit. In practice the cap of 200 is generous
 * enough that this rarely triggers.
 */
function dropNonCritical(queue: NarrationEvent[], sessionId: string): void {
  const idx = queue.findIndex((e) => !hasCommit(e))
  if (idx >= 0) {
    const [dropped] = queue.splice(idx, 1)
    pushDebugEntry({
      side: 'director',
      kind: 'dir:drop',
      sessionId,
      label: `drop ${dropped.verb}`,
      detail: `queue cap (non-commit)`,
    })
    return
  }
  const dropped = queue.shift()
  if (dropped) {
    pushDebugEntry({
      side: 'director',
      kind: 'dir:drop',
      sessionId,
      label: `drop ${dropped.verb}`,
      detail: `queue cap (oldest)`,
    })
  }
}

function hasCommit(event: NarrationEvent): boolean {
  return event.waypoints.some((w) => w.commit === true)
}

// --- Test helpers (not exported to production code) ---

export function __resetEventBusForTest(): void {
  queues.clear()
  listeners.clear()
}
