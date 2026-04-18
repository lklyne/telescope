/**
 * Verb → NarrationEvent mapping.
 *
 * Replaces `VERB_PRESENCE` in cli-presence.ts and `COMMAND_LABELS` in
 * browse-handler.ts. Each CLI verb maps to one of the five narration idioms
 * with waypoint rects pulled from the main-process runtime.
 *
 * Callers:
 *  - Browse HTTP handler (main): `narrateBrowseVerb` before and after the
 *    actual agent-browser call. Scan verbs use `narrateBrowseScanPlaceholder`
 *    at start and `narrateBrowseScanResult` once rects arrive.
 *  - Canvas HTTP handlers (main): `narrateCanvasVerb` after mutation.
 *  - Debugging: the narration event carries the raw verb so unknown verbs
 *    are renderable as "Running {verb}" without a code change.
 */

import type {
  CanvasRect,
  Idiom,
  NarrationEvent,
  NarrationTarget,
  Waypoint,
} from '../../shared/narration-event'
import {
  rectForBrowseTarget,
  rectForEntity,
  rectForFrame,
  rectForFrameOuter,
  rectForWorkspaceFallback,
  rectsForEntities,
  rectsForScan,
} from './rect-extraction'

let eventCounter = 0
function nextEventId(sessionId: string): string {
  eventCounter = (eventCounter + 1) | 0
  return `${sessionId}:${Date.now()}:${eventCounter}`
}

export interface NarrationContext {
  sessionId: string
  clientName?: string
  timestamp?: number
}

// ---------------------------------------------------------------------------
// Browse (agent-browser) verbs
// ---------------------------------------------------------------------------

export interface BrowseVerbContext extends NarrationContext {
  verb: string
  frameId: string | null
  targetRef?: string | null
  targetName?: string | null
  targetRole?: string | null
  targetValue?: string | null
  errorHint?: 'retry' | 'hard_fail' | null
}

const BROWSE_COMMIT_VERBS = new Set([
  'click',
  'fill',
  'type',
  'select',
  'hover',
  'press',
  'submit',
])

const BROWSE_SCAN_VERBS = new Set([
  'snapshot',
  'query-elements',
  'get',
  'console',
  'errors',
])

const BROWSE_PASSIVE_VERBS = new Set([
  'wait',
  'screenshot',
  'scroll',
  'scrollintoview',
  'navigate',
  'back',
  'forward',
  'reload',
])

function browseIdiom(verb: string): Idiom {
  if (BROWSE_COMMIT_VERBS.has(verb)) return 'atomic'
  if (BROWSE_SCAN_VERBS.has(verb)) return 'scan'
  if (BROWSE_PASSIVE_VERBS.has(verb)) return 'passive'
  // Unknown verbs default to passive so the cursor drifts on the frame instead
  // of racing to an uncomputed point.
  return 'passive'
}

function browseTarget(ctx: BrowseVerbContext): NarrationTarget | undefined {
  if (!ctx.targetRef && !ctx.targetName && !ctx.targetValue) return undefined
  return {
    role: ctx.targetRole ?? null,
    name: ctx.targetName ?? ctx.targetRef ?? null,
    value: ctx.targetValue ?? null,
  }
}

/**
 * Build the narration event for a browse verb before the child process is
 * spawned. For commit verbs we already know the target ref (from CLI args);
 * the rect is resolved from the snapshot cache if available, else from the
 * frame bounds (the cursor still moves toward the right frame).
 */
export function narrateBrowseVerb(ctx: BrowseVerbContext): NarrationEvent | null {
  if (!ctx.frameId) return null

  const idiom = browseIdiom(ctx.verb)

  if (idiom === 'scan') {
    return narrateBrowseScanPlaceholder(ctx)
  }

  const frameRect = rectForFrame(ctx.frameId)
  if (!frameRect) return null

  let waypoints: Waypoint[]
  if (idiom === 'atomic' && ctx.targetRef) {
    const targetRect =
      rectForBrowseTarget(ctx.frameId, ctx.targetRef, 'agent-browser') ?? frameRect
    waypoints = [{ rect: targetRect, commit: true, pauseMs: 150 }]
  } else if (idiom === 'atomic') {
    // Commit verb without a ref — rare; animate to frame center.
    waypoints = [{ rect: frameRect, commit: true, pauseMs: 150 }]
  } else {
    // Passive: drift over the frame.
    waypoints = [{ rect: frameRect }]
  }

  return {
    version: 1,
    sessionId: ctx.sessionId,
    eventId: nextEventId(ctx.sessionId),
    timestamp: ctx.timestamp ?? Date.now(),
    verb: ctx.verb,
    idiom,
    waypoints,
    target: browseTarget(ctx),
    errorHint: ctx.errorHint ?? null,
  }
}

/**
 * Placeholder event fired at scan start. The cursor drifts on the frame
 * while agent-browser runs. The real rects arrive via `narrateBrowseScanResult`.
 */
export function narrateBrowseScanPlaceholder(
  ctx: BrowseVerbContext,
): NarrationEvent | null {
  if (!ctx.frameId) return null
  const frameRect = rectForFrame(ctx.frameId)
  if (!frameRect) return null
  return {
    version: 1,
    sessionId: ctx.sessionId,
    eventId: nextEventId(ctx.sessionId),
    timestamp: ctx.timestamp ?? Date.now(),
    verb: ctx.verb,
    idiom: 'passive',
    waypoints: [{ rect: frameRect }],
    target: browseTarget(ctx),
  }
}

/**
 * Scan-result event: actual rects discovered by agent-browser. The director
 * folds these onto the current spline, so the placeholder's drift smoothly
 * becomes a chain of waypoint hops.
 */
export function narrateBrowseScanResult(
  ctx: BrowseVerbContext,
  rects: CanvasRect[],
): NarrationEvent | null {
  if (!ctx.frameId) return null
  if (rects.length === 0) return null
  return {
    version: 1,
    sessionId: ctx.sessionId,
    eventId: nextEventId(ctx.sessionId),
    timestamp: ctx.timestamp ?? Date.now(),
    verb: ctx.verb,
    idiom: 'scan',
    waypoints: rects.map((rect) => ({ rect })),
    target: browseTarget(ctx),
  }
}

// ---------------------------------------------------------------------------
// Canvas verbs
// ---------------------------------------------------------------------------

export interface CanvasVerbContext extends NarrationContext {
  verb: string
  /** Entity ids the verb operates on. */
  entityIds?: string[]
  /** Two-endpoint verbs (link/group) supply source + target entity ids. */
  bridgeFrom?: string
  bridgeTo?: string
  errorHint?: 'retry' | 'hard_fail' | null
}

const CANVAS_SCAN_VERBS = new Set([
  'workspace',
  'selection',
  'find-placement',
  'annotations',
  'annotation',
])

const CANVAS_COMMIT_VERBS = new Set([
  'create',
  'update',
  'upsert',
  'delete',
  'focus',
  'annotate',
  'breakpoints',
  'ack',
  'resolve',
  'dismiss',
  'reply',
  'record',
])

const CANVAS_BRIDGE_VERBS = new Set(['link', 'unlink', 'group', 'ungroup'])

const CANVAS_PASSIVE_VERBS = new Set([
  'design-system',
  'register-design-system',
  'component-states',
])

function canvasIdiom(verb: string): Idiom | null {
  if (CANVAS_SCAN_VERBS.has(verb)) return 'scan'
  if (CANVAS_BRIDGE_VERBS.has(verb)) return 'bridge'
  if (CANVAS_COMMIT_VERBS.has(verb)) return 'atomic'
  if (CANVAS_PASSIVE_VERBS.has(verb)) return 'passive'
  return null
}

export function narrateCanvasVerb(ctx: CanvasVerbContext): NarrationEvent | null {
  const idiom = canvasIdiom(ctx.verb)
  if (!idiom) return null

  let waypoints: Waypoint[]
  switch (idiom) {
    case 'scan':
      waypoints = rectsForScan().map((rect) => ({ rect }))
      if (waypoints.length === 0) {
        waypoints = [{ rect: rectForWorkspaceFallback() }]
      }
      break
    case 'bridge': {
      const from = ctx.bridgeFrom ? rectForEntity(ctx.bridgeFrom) : null
      const to = ctx.bridgeTo ? rectForEntity(ctx.bridgeTo) : null
      if (from && to) {
        waypoints = [{ rect: from }, { rect: to, commit: true, pauseMs: 150 }]
      } else if (from) {
        waypoints = [{ rect: from, commit: true, pauseMs: 150 }]
      } else if (to) {
        waypoints = [{ rect: to, commit: true, pauseMs: 150 }]
      } else {
        waypoints = [{ rect: rectForWorkspaceFallback(), commit: true, pauseMs: 150 }]
      }
      break
    }
    case 'atomic': {
      const rects = ctx.entityIds ? rectsForEntities(ctx.entityIds) : []
      if (rects.length > 0) {
        // Multiple targets: hit each in sequence, commit on the last.
        waypoints = rects.map((rect, i) => ({
          rect,
          commit: i === rects.length - 1,
          pauseMs: 150,
        }))
      } else if (ctx.entityIds && ctx.entityIds[0]) {
        // Entity id provided but not yet resolvable (just-created entities,
        // for instance). Use the frame-outer rect if possible.
        const outer = rectForFrameOuter(ctx.entityIds[0])
        waypoints = [
          { rect: outer ?? rectForWorkspaceFallback(), commit: true, pauseMs: 150 },
        ]
      } else {
        waypoints = [{ rect: rectForWorkspaceFallback(), commit: true, pauseMs: 150 }]
      }
      break
    }
    case 'passive':
    default:
      waypoints = [{ rect: rectForWorkspaceFallback() }]
      break
  }

  return {
    version: 1,
    sessionId: ctx.sessionId,
    eventId: nextEventId(ctx.sessionId),
    timestamp: ctx.timestamp ?? Date.now(),
    verb: ctx.verb,
    idiom,
    waypoints,
    errorHint: ctx.errorHint ?? null,
  }
}

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

export function __resetVerbNarrationForTest(): void {
  eventCounter = 0
}
