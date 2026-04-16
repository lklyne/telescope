/**
 * Serial per-repo fix queue. Cross-repo work runs in parallel;
 * within a single repo, fixes run one at a time to avoid edit collisions.
 */

import type { FixResult } from './claude-spawner'

export interface QueueEntry {
  annotationId: string
  origin: string
  repoPath: string
  run: () => Promise<FixResult>
  onComplete: (result: FixResult | null, error: Error | null) => void
}

interface RepoQueueState {
  pending: QueueEntry[]
  draining: boolean
}

const repoQueues = new Map<string, RepoQueueState>()
const inFlight = new Set<string>()
const inFlightByOrigin = new Map<string, number>()

type ChangeListener = () => void
const listeners = new Set<ChangeListener>()

export function onQueueChange(fn: ChangeListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify(): void {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.error('fix-queue listener error:', err) }
  }
}

export function isAnnotationInFlight(annotationId: string): boolean {
  return inFlight.has(annotationId)
}

export function getInFlightCountByOrigin(): Record<string, number> {
  const snapshot: Record<string, number> = {}
  for (const [origin, count] of inFlightByOrigin.entries()) {
    if (count > 0) snapshot[origin] = count
  }
  return snapshot
}

export function enqueueFix(entry: QueueEntry): boolean {
  if (inFlight.has(entry.annotationId)) return false
  const queue = repoQueues.get(entry.repoPath) ?? { pending: [], draining: false }
  repoQueues.set(entry.repoPath, queue)
  if (queue.pending.some((e) => e.annotationId === entry.annotationId)) return false
  queue.pending.push(entry)
  void drain(entry.repoPath)
  notify()
  return true
}

async function drain(repoPath: string): Promise<void> {
  const queue = repoQueues.get(repoPath)
  if (!queue || queue.draining) return
  queue.draining = true
  try {
    while (queue.pending.length > 0) {
      const entry = queue.pending.shift()!
      inFlight.add(entry.annotationId)
      inFlightByOrigin.set(entry.origin, (inFlightByOrigin.get(entry.origin) ?? 0) + 1)
      notify()
      let result: FixResult | null = null
      let error: Error | null = null
      try {
        result = await entry.run()
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err))
      } finally {
        inFlight.delete(entry.annotationId)
        const prev = inFlightByOrigin.get(entry.origin) ?? 0
        if (prev <= 1) inFlightByOrigin.delete(entry.origin)
        else inFlightByOrigin.set(entry.origin, prev - 1)
      }
      try {
        entry.onComplete(result, error)
      } catch (err) {
        console.error('fix-queue onComplete error:', err)
      }
      notify()
    }
  } finally {
    queue.draining = false
  }
}
