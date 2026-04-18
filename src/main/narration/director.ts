/**
 * NarrationDirector — per-session state machine that consumes narration events
 * and produces per-frame payloads for the cursor overlay.
 *
 * Design contract:
 *   - The director never blocks the CLI. Events are queued asynchronously;
 *     the director's tick runs on its own clock.
 *   - Recalculation on new events is simple: capture (currentPosition,
 *     currentTangent) from the active spline, rebuild anchors as
 *     [currentPosition, ...remainingWaypoints, ...newWaypoints], refit. No
 *     rollback past the current cursor position.
 *   - Trail carry-over: when a chain completes, the cursor settles at the
 *     last waypoint; the next chain starts there. No re-centering.
 *   - Canvas is one spline space. Waypoints are canvas-space rects; the
 *     layout broadcast layer projects to screen.
 */

import type { Vec2 } from '../../shared/cursor-motion'
import type {
  DirectorActivity,
  Mood,
  NarrationEvent,
  NarrationFramePayload,
  SplineVizPayload,
  Waypoint,
} from '../../shared/narration-event'
import { rectCenter } from '../../shared/narration-event'
import type { CatmullRomSpline } from '../../shared/cursor-spline'
import { foldSpline } from '../../shared/cursor-spline'
import { deriveMood, paramsForMood } from './mood'
import { drainSession } from './event-bus'

/** Default dwell at waypoints that ask for a commit visual. */
const COMMIT_DWELL_MS = 150
/** How long the 'committing' phase holds after the ripple fires. */
const COMMIT_HOLD_MS = 160
/** Error phase freeze duration. */
const ERROR_FREEZE_MS = 800
/** Base arc-length rate in px/s. Mood scales this. */
const BASE_SPEED_PX_S = 600
/** After settling, how long before the cursor transitions to idle. */
const IDLE_TRANSITION_MS = 400
/** Idle → departing removal grace. */
const DEPARTURE_GRACE_MS = 1500

export interface DirectorClock {
  now: () => number
}

export const defaultClock: DirectorClock = {
  now: () => Date.now(),
}

interface PendingLeg {
  waypoint: Waypoint
  /** Arc length at which this waypoint sits along the active spline. */
  arrivalLength: number
}

interface SessionState {
  sessionId: string
  clientName: string
  color: string

  position: Vec2
  tangent: Vec2

  spline: CatmullRomSpline | null
  /** Arc length progress along the active spline. */
  splineProgress: number
  /** Legs remaining on the active spline (by arrival length). */
  legs: PendingLeg[]

  phase: DirectorActivity
  phaseUntil: number

  mood: Mood
  intent: string | null
  verb: string | null
  target: NarrationEvent['target'] | null
  label: string | null

  commitKey: number
  errorKey: number

  /** Last settled position for trail carry-over on a new chain. */
  lastSettlePos: Vec2
  lastEventAt: number
  lastProgressAt: number

  /** Retry detection: last emit fingerprint + retry count. */
  lastFingerprint: string | null
  lastFingerprintAt: number
  retryCount: number

  /** Debug spline viz cache for the current spline. Only populated when on. */
  splineViz: SplineVizPayload | null

  departureScheduledAt: number | null
}

type PhaseTransitionListener = (ev: PhaseTransition) => void

export interface PhaseTransition {
  sessionId: string
  previous: DirectorActivity
  next: DirectorActivity
  mood: Mood
  verb: string | null
  commit: boolean
  timestamp: number
}

const sessions = new Map<string, SessionState>()
const phaseListeners = new Set<PhaseTransitionListener>()
const frameListeners = new Set<() => void>()

let splineVizEnabled = false

export function setSplineVizEnabled(on: boolean): void {
  splineVizEnabled = on
  // Recompute viz payloads on next tick.
  if (on) {
    for (const state of sessions.values()) {
      state.splineViz = buildSplineViz(state)
    }
  } else {
    for (const state of sessions.values()) {
      state.splineViz = null
    }
  }
  notifyFrameListeners()
}

export function isSplineVizEnabled(): boolean {
  return splineVizEnabled
}

export function onPhaseTransition(listener: PhaseTransitionListener): () => void {
  phaseListeners.add(listener)
  return () => {
    phaseListeners.delete(listener)
  }
}

export function onNarrationFrameChanged(listener: () => void): () => void {
  frameListeners.add(listener)
  return () => {
    frameListeners.delete(listener)
  }
}

function notifyFrameListeners(): void {
  for (const l of frameListeners) l()
}

function notifyPhase(transition: PhaseTransition): void {
  for (const l of phaseListeners) l(transition)
}

export interface DirectorDeriveColor {
  (sessionId: string): string
}

export interface DirectorOptions {
  clock?: DirectorClock
  deriveColor: DirectorDeriveColor
}

let currentClock: DirectorClock = defaultClock
let deriveColorFn: DirectorDeriveColor = (id) => `hsl(${(hashStr(id) % 360) + 0}, 70%, 55%)`

export function configureDirector(opts: DirectorOptions): void {
  currentClock = opts.clock ?? defaultClock
  deriveColorFn = opts.deriveColor
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return ((h % 360) + 360) % 360
}

function ensureSession(sessionId: string, clientName: string): SessionState {
  let state = sessions.get(sessionId)
  if (state) {
    state.clientName = clientName
    return state
  }
  state = {
    sessionId,
    clientName,
    color: deriveColorFn(sessionId),
    position: { x: 0, y: 0 },
    tangent: { x: 1, y: 0 },
    spline: null,
    splineProgress: 0,
    legs: [],
    phase: 'idle',
    phaseUntil: 0,
    mood: 'exploring',
    intent: null,
    verb: null,
    target: null,
    label: null,
    commitKey: 0,
    errorKey: 0,
    lastSettlePos: { x: 0, y: 0 },
    lastEventAt: 0,
    lastProgressAt: 0,
    lastFingerprint: null,
    lastFingerprintAt: 0,
    retryCount: 0,
    splineViz: null,
    departureScheduledAt: null,
  }
  sessions.set(sessionId, state)
  return state
}

/**
 * Fold queued events for `sessionId` into the active spline. Called by the
 * tick loop before advancing. Any number of events may be pending; they're
 * applied in order.
 */
function applyEvents(state: SessionState, events: readonly NarrationEvent[]): void {
  if (events.length === 0) return
  const now = currentClock.now()

  for (const event of events) {
    // Intent: undefined inherits, null clears, string sets.
    if (event.intent === null) state.intent = null
    else if (typeof event.intent === 'string') state.intent = event.intent

    state.verb = event.verb
    state.target = event.target ?? null

    // Retry detection: same (verb, target.ref) within 3 s.
    const fingerprint = `${event.verb}:${event.target?.name ?? ''}:${event.target?.role ?? ''}`
    if (
      state.lastFingerprint === fingerprint &&
      now - state.lastFingerprintAt < 3_000
    ) {
      state.retryCount += 1
    } else {
      state.retryCount = 0
    }
    state.lastFingerprint = fingerprint
    state.lastFingerprintAt = now

    // Mood: explicit override wins, else derive from signals.
    const derivedMood = deriveMood({
      verb: event.verb,
      retryCount: state.retryCount,
      timeSinceProgress: now - state.lastProgressAt,
      hasError: event.errorHint != null,
      isWait: event.idiom === 'passive' || event.verb === 'wait',
    })
    const nextMood = event.mood ?? derivedMood

    if (nextMood === 'error' && state.mood !== 'error') {
      state.errorKey += 1
      state.phaseUntil = now + ERROR_FREEZE_MS
      setPhase(state, 'idle', now)
    }
    state.mood = nextMood

    // Fold new waypoints onto the active spline. We capture current state
    // right here so tangent preservation is exact.
    const newAnchors = event.waypoints.map((w) => rectCenter(w.rect))
    const currentPos = state.position
    const currentTangent = state.tangent

    // Residual legs past the current progress (not yet arrived).
    const remainingLegs = state.legs.filter(
      (leg) => leg.arrivalLength > state.splineProgress + 1e-3,
    )
    const remainingAnchors = remainingLegs.map((leg) => rectCenter(leg.waypoint.rect))
    const remainingWaypoints = remainingLegs.map((leg) => leg.waypoint)

    const allAnchors = [...remainingAnchors, ...newAnchors]
    const allWaypoints = [...remainingWaypoints, ...event.waypoints]

    if (allAnchors.length === 0) {
      // Nothing to travel; settle in place.
      state.spline = null
      state.legs = []
      state.splineProgress = 0
      setPhase(state, 'idle', now)
      continue
    }

    // Use mood alpha for tension.
    const alpha = paramsForMood(state.mood).splineAlpha
    state.spline = foldSpline(currentPos, currentTangent, allAnchors, alpha)
    state.splineProgress = 0
    state.legs = []

    // Compute arrival arc-length per leg by walking the spline and sampling
    // each anchor's closest arc position. Simpler + close enough: use segment
    // ends, since fitCatmullRom produces one segment per input anchor.
    const segs = state.spline.segments
    for (let i = 0; i < allWaypoints.length && i < segs.length; i++) {
      state.legs.push({
        waypoint: allWaypoints[i],
        arrivalLength: segs[i].lengthEnd,
      })
    }

    state.lastEventAt = now
    state.lastProgressAt = now
    setPhase(state, 'traveling', now)
  }

  state.splineViz = splineVizEnabled ? buildSplineViz(state) : null
}

function setPhase(state: SessionState, next: DirectorActivity, now: number): void {
  if (state.phase === next) return
  const prev = state.phase
  state.phase = next
  notifyPhase({
    sessionId: state.sessionId,
    previous: prev,
    next,
    mood: state.mood,
    verb: state.verb,
    commit: next === 'committing',
    timestamp: now,
  })
}

function advance(state: SessionState, now: number): void {
  // If a phase has a fixed end time, check for completion first.
  if (state.phase === 'dwelling' || state.phase === 'committing') {
    if (now >= state.phaseUntil) {
      // Complete this leg; advance to next.
      state.legs.shift()
      if (state.legs.length === 0 || state.spline == null) {
        // Entire chain complete.
        state.lastSettlePos = { ...state.position }
        setPhase(state, 'idle', now)
        state.phaseUntil = now + IDLE_TRANSITION_MS
      } else {
        setPhase(state, 'traveling', now)
      }
    }
    return
  }

  if (state.phase === 'idle' && state.legs.length === 0) {
    // Stable idle. Nothing to do.
    return
  }

  if (state.phase !== 'traveling' || state.spline == null) return

  const params = paramsForMood(state.mood)
  const speed = BASE_SPEED_PX_S * params.speedMultiplier
  const dtMs = Math.min(now - (state.lastEventAt || now), 1000 / 30)
  state.lastEventAt = now
  if (speed <= 0) return

  state.splineProgress = Math.min(
    state.spline.totalLength,
    state.splineProgress + (speed * dtMs) / 1000,
  )

  const sample = state.spline.sample(state.splineProgress)
  state.position = sample.position
  state.tangent = sample.tangent
  state.lastProgressAt = now

  // Check if we've reached the next waypoint.
  const nextLeg = state.legs[0]
  if (!nextLeg) {
    // No legs left but still traveling — shouldn't happen, settle.
    setPhase(state, 'idle', now)
    state.lastSettlePos = { ...state.position }
    return
  }

  if (state.splineProgress >= nextLeg.arrivalLength - 0.5) {
    // Arrived.
    if (nextLeg.waypoint.commit === true) {
      state.commitKey += 1
      state.phaseUntil = now + COMMIT_HOLD_MS
      setPhase(state, 'committing', now)
    } else if ((nextLeg.waypoint.pauseMs ?? 0) > 0) {
      state.phaseUntil = now + (nextLeg.waypoint.pauseMs ?? 0)
      setPhase(state, 'dwelling', now)
    } else {
      // Pass through without dwelling.
      state.legs.shift()
      if (state.legs.length === 0) {
        state.lastSettlePos = { ...state.position }
        setPhase(state, 'idle', now)
      }
    }
  }
}

function buildSplineViz(state: SessionState): SplineVizPayload | null {
  if (!state.spline || state.spline.totalLength <= 0) return null
  return {
    eventId: `${state.sessionId}:${state.commitKey}:${state.splineProgress.toFixed(0)}`,
    polyline: state.spline.polyline(48),
    waypoints: state.legs.map((leg) => leg.waypoint.rect),
  }
}

/** One director tick: drain events, advance physics, broadcast. */
export function tick(): void {
  const now = currentClock.now()
  for (const sessionId of Array.from(sessions.keys())) {
    const state = sessions.get(sessionId)
    if (!state) continue

    const events = drainSession(sessionId)
    if (events.length > 0) applyEvents(state, events)

    advance(state, now)
  }
  notifyFrameListeners()
}

/**
 * Called by the event bus subscription so the director stays ready to drain.
 * In production we run `tick()` on a ~16 ms interval; in tests we drive it
 * manually through an injected clock.
 */
export function notifyEventPosted(sessionId: string, clientName: string): void {
  ensureSession(sessionId, clientName)
}

export function endNarration(sessionId: string): void {
  const state = sessions.get(sessionId)
  if (!state) return
  state.departureScheduledAt = currentClock.now()
  setPhase(state, 'departing', currentClock.now())
  setTimeout(() => {
    sessions.delete(sessionId)
    notifyFrameListeners()
  }, DEPARTURE_GRACE_MS)
}

export function setSessionIntent(sessionId: string, intent: string | null): void {
  const state = sessions.get(sessionId)
  if (!state) return
  state.intent = intent
}

export function getNarrationFrames(): NarrationFramePayload[] {
  const out: NarrationFramePayload[] = []
  for (const state of sessions.values()) {
    out.push({
      sessionId: state.sessionId,
      clientName: state.clientName,
      color: state.color,
      position: { ...state.position },
      tangent: { ...state.tangent },
      activity: state.phase,
      mood: state.mood,
      label: state.label,
      intent: state.intent,
      commitKey: state.commitKey,
      errorKey: state.errorKey,
      splineViz: state.splineViz,
    })
  }
  return out
}

// --- Test-only helpers ---

export function __resetDirectorForTest(): void {
  sessions.clear()
  phaseListeners.clear()
  frameListeners.clear()
  splineVizEnabled = false
  currentClock = defaultClock
}

export function __getSessionStateForTest(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId)
}
