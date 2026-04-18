/**
 * Narration debug timeline ring buffer.
 *
 * Accumulates CLI + director entries in insertion order. The debug window
 * fetches a snapshot on mount and listens for appends. When the debug window
 * isn't open we keep buffering anyway so opening it mid-session still yields
 * useful history.
 */

import type { NarrationDebugEntry } from '../../shared/narration-debug'

const MAX_ENTRIES = 500

let nextId = 1
const buffer: NarrationDebugEntry[] = []
type Listener = (entry: NarrationDebugEntry) => void
const listeners = new Set<Listener>()

export function pushDebugEntry(
  entry: Omit<NarrationDebugEntry, 'id' | 't'>,
): NarrationDebugEntry {
  const full: NarrationDebugEntry = {
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

export function snapshotDebugTimeline(): NarrationDebugEntry[] {
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
