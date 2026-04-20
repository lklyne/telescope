/**
 * CursorDirector tuning — pure defaults + normalization.
 *
 * These knobs drive the live agent-cursor pacing model in
 * `src/main/presence/director.ts`. The debug window writes them via
 * preferences IPC; the director reads them every tick.
 *
 * Distance scaling mirrors the legacy cursor-motion model: the director is
 * speed-based by default (constant arc-length speed), but a distanceScaling
 * exponent lets short-distance travels slow down so the cursor doesn't
 * teleport between nearby targets. See `distanceSpeedScale` for the math.
 *
 * Easing shapes the *time* axis of each spline: progress is driven by
 * `easeAt(easing, elapsed / splineDurationMs)` rather than accumulating
 * constant arc-length per tick. splineDurationMs is frozen at spline
 * creation from baseSpeed × distance scale.
 */

import { type EasingSpec, normalizeEasing } from './cursor-motion'

export interface CursorTuningParams {
  /** Base arc-length speed before distance scale, in px/s. */
  baseSpeedPxS: number
  /**
   * 0..1 exponent. 1 = constant speed (duration grows with distance).
   * 0 = constant duration regardless of distance.
   * Applied per-spline at creation time against `CURSOR_DISTANCE_REFERENCE_PX`.
   */
  distanceScaling: number
  /**
   * Time-axis easing applied to each spline. Without easing the cursor
   * moves at a dead-constant arc-length speed, which reads as mechanical
   * compared to the legacy cursor-motion system. `easeInOutCubic` matches
   * the legacy default.
   */
  easing: EasingSpec
  /**
   * Upper bound on the move-then-act wait in `/session/presence/verb-sync`.
   * If the cursor arrives at its commit waypoint sooner, the mutation fires
   * immediately. If it takes longer, the cap fires and the mutation proceeds.
   */
  syncCapMs: number
  /** Duration of the 'committing' phase (ripple hold) before advancing. */
  commitHoldMs: number
  /** Default dwell at non-commit waypoints that request a pause. */
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

/** Reference path length at which distanceScaling is a no-op. */
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

/**
 * Per-spline speed multiplier under distance scaling.
 *
 *   exp = 1 (constant speed):    scale = 1
 *   exp = 0 (constant duration): scale = totalLength / referenceLength
 *   0 < exp < 1 interpolates.
 *
 * Multiply the tuning's base speed by this to get the effective speed for
 * a spline of the given length. At length == reference, the scale is
 * always 1, so the base-speed slider maintains intuitive meaning.
 */
export function distanceSpeedScale(
  tuning: CursorTuningParams,
  totalLengthPx: number,
): number {
  const exp = Math.max(0, Math.min(1, tuning.distanceScaling))
  if (exp >= 1 || totalLengthPx <= 0) return 1
  const ratio = totalLengthPx / CURSOR_DISTANCE_REFERENCE_PX
  return Math.pow(ratio, 1 - exp)
}
