/**
 * Narration protocol — shared between main (director) and renderer (playback).
 *
 * The narration layer is a trailing queue: CLI handlers fire-and-forget
 * `NarrationEvent`s as they dispatch real work, and a per-session director
 * consumes them at presentation speed to drive the cursor. Execution never
 * waits on narration.
 */

import type { Vec2 } from './cursor-motion'

export type Idiom =
  | 'atomic' // focus → locate → commit → settle (click, select, delete)
  | 'composite' // focus → (locate → commit)ⁿ → settle (fill, type)
  | 'scan' // focus → locate₁…ₙ → settle (snapshot, query-elements, workspace)
  | 'bridge' // focus(A) → arc → commit(B) → settle (link, group)
  | 'passive' // focus → dwell with drift → settle (wait, screenshot, scroll)

export type Mood =
  | 'exploring'
  | 'committing'
  | 'correcting'
  | 'waiting'
  | 'stuck'
  | 'error'

export type DirectorActivity =
  | 'traveling'
  | 'dwelling'
  | 'committing'
  | 'waiting'
  | 'thinking'
  | 'idle'
  | 'departing'

export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Waypoint {
  /** Canvas-space rect the director aims for. The renderer transforms to screen. */
  rect: CanvasRect
  /** Extra dwell at this waypoint before advancing, in ms. Default 0. */
  pauseMs?: number
  /** True to fire the ripple + enter 'committing' at this waypoint. */
  commit?: boolean
}

export interface NarrationTarget {
  role?: string | null
  name?: string | null
  value?: string | null
}

export interface NarrationEvent {
  version: 1
  sessionId: string
  /** Stable id; useful for dedupe, spline-viz tagging, and replay logs. */
  eventId: string
  /** Monotonic ms from main's clock when the CLI handler emitted. */
  timestamp: number
  /** Raw CLI verb; used as fallback label when no grammar entry is known. */
  verb: string
  idiom: Idiom
  /** 1..N canvas-space waypoints. Single waypoint = atomic move. */
  waypoints: Waypoint[]
  target?: NarrationTarget
  /** Optional mood override. If absent, director derives from signals. */
  mood?: Mood
  /**
   * Session-level subtitle. `undefined` inherits the current intent.
   * `null` clears the intent. A string sets/replaces it.
   */
  intent?: string | null
  /** Error hint from the handler (retry vs hard failure). */
  errorHint?: 'retry' | 'hard_fail' | null
}

/**
 * Per-frame payload produced by the director and consumed by the renderer.
 * Position/tangent are canvas-space; the layout broadcast layer adds screen
 * coordinates before shipping to the cursor overlay.
 */
export interface NarrationFramePayload {
  sessionId: string
  clientName: string
  color: string
  position: Vec2
  tangent: Vec2
  activity: DirectorActivity
  mood: Mood
  label: string | null
  intent: string | null
  /** Monotonic counter; renderer triggers ripple when value changes. */
  commitKey: number
  /** Monotonic counter; renderer triggers red tint when value changes. */
  errorKey: number
  /** Populated only when the debug flag is on. Zero cost otherwise. */
  splineViz: SplineVizPayload | null
}

export interface SplineVizPayload {
  eventId: string
  polyline: Vec2[]
  waypoints: CanvasRect[]
}

/** Rect center helper. Used ubiquitously for waypoint → sample point. */
export function rectCenter(rect: CanvasRect): Vec2 {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}
