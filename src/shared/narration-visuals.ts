/**
 * Mood → renderer visual modifier table.
 *
 * The director carries mood in every frame payload; this module translates it
 * into values the renderer applies (tint overrides, pulse amplitude, etc.).
 * Kept in shared/ so the debug playground can render ghosts with the same
 * visual language without duplicating.
 */

import type { Mood } from './narration-event'

export interface MoodVisual {
  /** Optional tint override for cursor + label. Null = use session color. */
  tint: string | null
  /** CSS opacity for the cursor body. */
  opacity: number
  /** Pulse animation name ('' = no pulse). */
  pulse: 'none' | 'gentle' | 'strong'
  /** Scale applied to the whole cursor. */
  scale: number
  /** Label background opacity 0–1. */
  labelBgAlpha: number
  /** Multiplier on halo intensity (0 = no halo). */
  halo: number
}

export const MOOD_VISUALS: Record<Mood, MoodVisual> = {
  exploring: {
    tint: null,
    opacity: 1,
    pulse: 'none',
    scale: 1,
    labelBgAlpha: 0.9,
    halo: 0.6,
  },
  committing: {
    tint: null,
    opacity: 1,
    pulse: 'none',
    scale: 1.02,
    labelBgAlpha: 1,
    halo: 1,
  },
  correcting: {
    tint: null,
    opacity: 1,
    pulse: 'none',
    scale: 0.98,
    labelBgAlpha: 0.9,
    halo: 0.7,
  },
  waiting: {
    tint: null,
    opacity: 1,
    pulse: 'none',
    scale: 1,
    labelBgAlpha: 0.85,
    halo: 0.4,
  },
  stuck: {
    tint: null,
    opacity: 1,
    pulse: 'none',
    scale: 0.96,
    labelBgAlpha: 0.85,
    halo: 0.4,
  },
  error: {
    tint: '#ef4444', // red-500
    opacity: 1,
    pulse: 'none',
    scale: 1.04,
    labelBgAlpha: 1,
    halo: 1,
  },
}
