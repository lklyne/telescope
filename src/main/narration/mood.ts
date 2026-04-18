/**
 * Mood derivation — pure function. Called by the director from signals it
 * already maintains (retry count, time-since-progress, error flags, verb class).
 *
 * The model never has to think about mood. It falls out of mechanical signals
 * the CLI + director already have.
 */

import type { Mood } from '../../shared/narration-event'

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

export interface MoodParams {
  speedMultiplier: number
  splineAlpha: number
  driftRadiusPx: number
  driftFrequencyHz: number
  pulseAmplitude: number
  overshoot: number
}

export function paramsForMood(mood: Mood): MoodParams {
  switch (mood) {
    case 'exploring':
      return {
        speedMultiplier: 1.0,
        splineAlpha: 0.5,
        driftRadiusPx: 0,
        driftFrequencyHz: 0,
        pulseAmplitude: 0,
        overshoot: 0.04,
      }
    case 'committing':
      return {
        speedMultiplier: 1.2,
        splineAlpha: 0.5,
        driftRadiusPx: 0,
        driftFrequencyHz: 0,
        pulseAmplitude: 0,
        overshoot: 0,
      }
    case 'correcting':
      return {
        speedMultiplier: 0.85,
        splineAlpha: 0.75,
        driftRadiusPx: 0.3,
        driftFrequencyHz: 0.8,
        pulseAmplitude: 0.02,
        overshoot: 0,
      }
    case 'waiting':
      return {
        speedMultiplier: 0,
        splineAlpha: 0.5,
        driftRadiusPx: 2,
        driftFrequencyHz: 0.6,
        pulseAmplitude: 0.06,
        overshoot: 0,
      }
    case 'stuck':
      return {
        speedMultiplier: 0,
        splineAlpha: 0.5,
        driftRadiusPx: 4,
        driftFrequencyHz: 0.4,
        pulseAmplitude: 0.1,
        overshoot: 0,
      }
    case 'error':
      return {
        speedMultiplier: 0,
        splineAlpha: 0.5,
        driftRadiusPx: 0,
        driftFrequencyHz: 0,
        pulseAmplitude: 0,
        overshoot: 0,
      }
  }
}
