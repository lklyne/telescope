/**
 * Per-mood physics parameters consumed by the CursorDirector and the debug
 * playground. Pure data — no signals, no state.
 *
 * `deriveMood` (the classifier that turns verb + retry + time signals into a
 * Mood) stays in `src/main/presence/mood.ts` because it's only relevant at
 * event time. These params, however, are pure lookups the renderer-side
 * preview needs to mirror the director.
 */

import type { Mood } from './agent-action'

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
