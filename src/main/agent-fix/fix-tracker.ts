/**
 * Tracks which annotations have an in-flight fix so the same comment can't be
 * fixed twice in parallel. Cross-annotation fixes (same repo or not) run
 * concurrently — collisions on the same files are accepted as a rare cost.
 */

type ChangeListener = () => void

const inFlight = new Set<string>()
const inFlightByOrigin = new Map<string, number>()
const listeners = new Set<ChangeListener>()

export function onTrackerChange(fn: ChangeListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify(): void {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.error('fix-tracker listener error:', err) }
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

export function markFixStarted(annotationId: string, origin: string): void {
  inFlight.add(annotationId)
  inFlightByOrigin.set(origin, (inFlightByOrigin.get(origin) ?? 0) + 1)
  notify()
}

export function markFixFinished(annotationId: string, origin: string): void {
  inFlight.delete(annotationId)
  const prev = inFlightByOrigin.get(origin) ?? 0
  if (prev <= 1) inFlightByOrigin.delete(origin)
  else inFlightByOrigin.set(origin, prev - 1)
  notify()
}
