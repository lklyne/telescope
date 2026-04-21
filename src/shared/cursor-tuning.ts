/**
 * Cursor tuning defaults + normalization.
 *
 * In this branch the values are used by the debug presence playground only;
 * they do not drive production cursor playback yet.
 */

import { type EasingSpec, normalizeEasing } from './cursor-motion'

export interface CursorTuningParams {
  baseSpeedPxS: number
  distanceScaling: number
  easing: EasingSpec
  syncCapMs: number
  commitHoldMs: number
  commitDwellMs: number
}

export const DEFAULT_CURSOR_TUNING: CursorTuningParams = {
  baseSpeedPxS: 600,
  distanceScaling: 1,
  easing: { kind: 'preset', name: 'easeInOutCubic' },
  syncCapMs: 300,
  commitHoldMs: 160,
  commitDwellMs: 150,
}

export const CURSOR_DISTANCE_REFERENCE_PX = 400

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}

export function normalizeCursorTuning(raw: unknown): CursorTuningParams {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_CURSOR_TUNING
  return {
    baseSpeedPxS: clamp(Number(r.baseSpeedPxS ?? d.baseSpeedPxS), 50, 2000, d.baseSpeedPxS),
    distanceScaling: clamp(Number(r.distanceScaling ?? d.distanceScaling), 0, 1, d.distanceScaling),
    easing: normalizeEasing(r.easing),
    syncCapMs: clamp(Number(r.syncCapMs ?? d.syncCapMs), 0, 1000, d.syncCapMs),
    commitHoldMs: clamp(Number(r.commitHoldMs ?? d.commitHoldMs), 0, 1000, d.commitHoldMs),
    commitDwellMs: clamp(Number(r.commitDwellMs ?? d.commitDwellMs), 0, 1000, d.commitDwellMs),
  }
}

export function distanceSpeedScale(
  tuning: CursorTuningParams,
  totalLengthPx: number,
): number {
  const exp = Math.max(0, Math.min(1, tuning.distanceScaling))
  if (exp >= 1 || totalLengthPx <= 0) return 1
  const ratio = totalLengthPx / CURSOR_DISTANCE_REFERENCE_PX
  return Math.pow(ratio, 1 - exp)
}
