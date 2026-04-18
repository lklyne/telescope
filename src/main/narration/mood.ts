/**
 * Mood derivation — pure function. Called by the director from signals it
 * already maintains (retry count, time-since-progress, error flags, verb class).
 *
 * The model never has to think about mood. It falls out of mechanical signals
 * the CLI + director already have.
 *
 * Per-mood physics parameters (`MoodParams`, `paramsForMood`) live in
 * `src/shared/narration-mood-params.ts` so the renderer-side debug playground
 * can mirror director behavior without reaching into main.
 */

import type { Mood } from '../../shared/narration-event'

export { paramsForMood } from '../../shared/narration-mood-params'
export type { MoodParams } from '../../shared/narration-mood-params'

export interface MoodSignals {
  verb: string
  /** Same verb+target repeated within 3 s bumps this. */
  retryCount: number
  /** ms since the last progress-bearing event for this session. */
  timeSinceProgress: number
  /** Handler reported an error on this event or the previous one. */
  hasError: boolean
  /** Passive verbs that wait on external state (wait, screenshot, navigate). */
  isWait: boolean
}

const READ_VERBS = new Set([
  'snapshot',
  'query-elements',
  'workspace',
  'selection',
  'find-placement',
  'annotations',
  'annotation',
  'get',
])

const COMMIT_VERBS = new Set([
  'click',
  'fill',
  'type',
  'select',
  'create',
  'update',
  'upsert',
  'delete',
  'link',
  'unlink',
  'group',
  'ungroup',
  'annotate',
  'breakpoints',
  'ack',
  'resolve',
  'dismiss',
  'reply',
])

export function deriveMood(signals: MoodSignals): Mood {
  if (signals.hasError) return 'error'
  if (signals.retryCount > 0 && signals.timeSinceProgress < 2_000) return 'correcting'
  if (signals.isWait) return 'waiting'
  if (signals.timeSinceProgress > 8_000) return 'stuck'
  if (READ_VERBS.has(signals.verb)) return 'exploring'
  if (COMMIT_VERBS.has(signals.verb)) return 'committing'
  return 'exploring'
}

