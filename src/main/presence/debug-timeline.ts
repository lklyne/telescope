/**
 * Presence debug timeline ring buffer.
 *
 * Accumulates CLI + director entries in insertion order. The debug window
 * fetches a snapshot on mount and listens for appends. When the debug window
 * isn't open we keep buffering anyway so opening it mid-session still yields
 * useful history.
 */

import type { PresenceDebugEntry } from '../../shared/presence-debug'

const MAX_ENTRIES = 500

let nextId = 1
const buffer: PresenceDebugEntry[] = []
type Listener = (entry: PresenceDebugEntry) => void
const listeners = new Set<Listener>()

export function pushDebugEntry(
  entry: Omit<PresenceDebugEntry, 'id' | 't'>,
): PresenceDebugEntry {
  const full: PresenceDebugEntry = {
    ...entry,
    id: nextId++,
    t: Date.now(),
  }
  buffer.push(full)
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES)
  }
  if (listeners.size > 0) for (const l of listeners) l(full)
  return full
}

export function snapshotDebugTimeline(): PresenceDebugEntry[] {
  return buffer.slice()
}

export function subscribeDebugTimeline(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function __resetDebugTimelineForTest(): void {
  buffer.length = 0
  listeners.clear()
  nextId = 1
}
