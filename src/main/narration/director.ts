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

import { easeAt, type Vec2 } from '../../shared/cursor-motion'
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
import { composeLabel } from '../../shared/narration-grammar'
import { deriveMood, paramsForMood } from './mood'
import { drainSession, hasCommit } from './event-bus'
import { pushDebugEntry } from './debug-timeline'
import {
  DEFAULT_NARRATION_TUNING,
  distanceSpeedScale,
  type NarrationTuningParams,
} from '../../shared/narration-tuning'

/** Error phase freeze duration. */
const ERROR_FREEZE_MS = 800
/** After settling, how long before the cursor transitions to idle. */
const IDLE_TRANSITION_MS = 400
/** Idle → departing removal grace. */
const DEPARTURE_GRACE_MS = 1500

let tuning: NarrationTuningParams = { ...DEFAULT_NARRATION_TUNING }

export function setNarrationTuning(next: NarrationTuningParams): void {
  tuning = { ...next }
}

export function getDirectorTuning(): NarrationTuningParams {
  return tuning
}

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
  /** Per-spline speed scale from distanceScaling. Recomputed on fold. */
  splineSpeedScale: number
  /**
   * Total ease-duration for the active spline, frozen at fold time from
   * baseSpeed × mood × distance scale. Infinity when the effective speed is
   * zero (e.g. waiting/stuck/error moods).
   */
  splineDurationMs: number
  /** Accumulated traveling-phase time along the active spline. */
  splineElapsedMs: number

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

/**
 * Move-then-act arrival waiters.
 *
 * CLI handlers that want "cursor moves to target, then the mutation fires"
 * post their narration intent to /session/narration/verb-sync and await a
 * commit signal here. Each waiter has its own `capMs` timer so a slow or
 * long-distance travel never holds the agent indefinitely.
 *
 * Design decision: we hook arrival on the `traveling → committing` phase
 * transition rather than on the dwell start. The commit phase is when the
 * ripple fires, which is the user-visible "the cursor did the thing" moment.
 * Waking the mutation exactly here means the cursor's ripple and the
 * mutation's first visible effect line up naturally.
 *
 * If the session has no pending commit waypoint (scan / passive events),
 * the route short-circuits and doesn't create a waiter at all — see
 * session.ts's verb-sync handler.
 */
interface ArrivalWaiter {
  resolve: (reason: 'arrived' | 'capped') => void
  timer: NodeJS.Timeout
}
const arrivalWaiters = new Map<string, ArrivalWaiter[]>()

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
    splineSpeedScale: 1,
    splineDurationMs: 0,
    splineElapsedMs: 0,
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

    // Compose the label from grammar. This is deterministic per session so
    // the same session always picks the same synonym.
    state.label = composeLabel(
      event.verb,
      event.target ?? null,
      state.mood,
      state.sessionId,
    )

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
      state.splineSpeedScale = 1
      state.splineDurationMs = 0
      state.splineElapsedMs = 0
      setPhase(state, 'idle', now)
      continue
    }

    // Use mood alpha for tension.
    const moodParams = paramsForMood(state.mood)
    state.spline = foldSpline(currentPos, currentTangent, allAnchors, moodParams.splineAlpha)
    state.splineProgress = 0
    state.legs = []
    state.splineSpeedScale = distanceSpeedScale(tuning, state.spline.totalLength)
    // Freeze the ease duration at fold time — mood changes only take effect
    // on the next event (which also refits), matching legacy behavior.
    const moodMul = tuning.moodSpeedEnabled ? moodParams.speedMultiplier : 1
    const effectiveSpeed = tuning.baseSpeedPxS * moodMul * state.splineSpeedScale
    state.splineDurationMs =
      effectiveSpeed > 0 ? (state.spline.totalLength / effectiveSpeed) * 1000 : Infinity
    state.splineElapsedMs = 0

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

    pushDebugEntry({
      side: 'director',
      kind: 'dir:apply',
      sessionId: state.sessionId,
      label: `apply ${event.verb}`,
      detail: `${event.waypoints.length} wp · ${hasCommit(event) ? 'commit' : 'no-commit'} · mood ${state.mood}`,
    })
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
  pushDebugEntry({
    side: 'director',
    kind: 'dir:phase',
    sessionId: state.sessionId,
    label: `${prev} → ${next}`,
    detail: state.verb ? `${state.verb} · mood ${state.mood}` : `mood ${state.mood}`,
  })
  // Wake any move-then-act waiters when the cursor reaches its commit phase.
  if (next === 'committing') {
    resolveArrivalWaiters(state.sessionId, 'arrived')
  }
}

function resolveArrivalWaiters(
  sessionId: string,
  reason: 'arrived' | 'capped',
): void {
  const list = arrivalWaiters.get(sessionId)
  if (!list || list.length === 0) return
  arrivalWaiters.delete(sessionId)
  for (const waiter of list) {
    clearTimeout(waiter.timer)
    waiter.resolve(reason)
  }
}

/**
 * Register a one-shot wait for the next commit on this session.
 *
 * Returns a promise that resolves with:
 *  - `'arrived'`  — the cursor hit a commit waypoint within `capMs`
 *  - `'capped'`   — the cap elapsed first; mutation should proceed anyway
 *  - `'no-session'` — the session isn't tracked; mutation proceeds without delay
 *
 * The promise never rejects and never hangs past `capMs`. This is the
 * "queue stays queued but verbs can politely wait for the cursor to show
 * up" primitive — bounded by the cap so a far-away cursor can't stall the
 * agent beyond a perceptual window.
 */
export function waitForNextCommit(
  sessionId: string,
  capMs: number,
): Promise<'arrived' | 'capped' | 'no-session'> {
  if (!sessions.has(sessionId)) return Promise.resolve('no-session')
  if (capMs <= 0) return Promise.resolve('capped')
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Remove just this waiter; leave siblings in place.
      const list = arrivalWaiters.get(sessionId)
      if (list) {
        const idx = list.findIndex((w) => w.timer === timer)
        if (idx >= 0) list.splice(idx, 1)
        if (list.length === 0) arrivalWaiters.delete(sessionId)
      }
      resolve('capped')
    }, capMs)
    const list = arrivalWaiters.get(sessionId) ?? []
    list.push({ resolve, timer })
    arrivalWaiters.set(sessionId, list)
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

  const dtMs = Math.min(now - (state.lastEventAt || now), 1000 / 30)
  state.lastEventAt = now

  const dur = state.splineDurationMs
  if (!Number.isFinite(dur) || dur <= 0) {
    // Effective speed is zero (waiting/stuck/error). Hold in place.
    return
  }
  state.splineElapsedMs = Math.min(dur, state.splineElapsedMs + dtMs)
  const t = state.splineElapsedMs / dur
  const easedT = easeAt(tuning.easing, t)
  state.splineProgress = easedT * state.spline.totalLength

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
      state.phaseUntil = now + tuning.commitHoldMs
      setPhase(state, 'committing', now)
    } else if ((nextLeg.waypoint.pauseMs ?? 0) > 0) {
      // Tuning overrides the per-waypoint hint so the debug slider actually
      // drives dwell globally.
      state.phaseUntil = now + tuning.commitDwellMs
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
  // Wake any pending arrival waiters before tearing down — they should see
  // `'capped'` rather than hanging on a session that's about to disappear.
  resolveArrivalWaiters(sessionId, 'capped')
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

export function hasNarrationSessions(): boolean {
  return sessions.size > 0
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
  // Clear any outstanding arrival waiters so their timers don't fire against
  // a clean director in later tests.
  for (const list of arrivalWaiters.values()) {
    for (const waiter of list) {
      clearTimeout(waiter.timer)
      waiter.resolve('capped')
    }
  }
  arrivalWaiters.clear()
  sessions.clear()
  phaseListeners.clear()
  frameListeners.clear()
  splineVizEnabled = false
  currentClock = defaultClock
  tuning = { ...DEFAULT_NARRATION_TUNING }
}

export function __getSessionStateForTest(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId)
}
