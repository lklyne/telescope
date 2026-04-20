import { callApp, sessionId, getClientName } from './shared/app-client'

// ---------------------------------------------------------------------------
// Agent-action intent — fired from every CLI verb at dispatch time.
// ---------------------------------------------------------------------------
// Main constructs the AgentAction server-side (with resolved rects) and pushes
// it onto the CursorDirector's queue. Fire-and-forget: never blocks the CLI.

/** Verbs that dispatch to agent-browser run the `browse` action path. */
const BROWSE_VERBS = new Set<string>([
  'snapshot',
  'click',
  'fill',
  'type',
  'select',
  'hover',
  'screenshot',
  'scroll',
  'wait',
  'get',
  'console',
  'errors',
  'query-elements',
  'navigate',
  'back',
  'forward',
  'reload',
])

/**
 * Emit an action intent for the given verb. For browse verbs we expect
 * `handleBrowse` to supply the frameId + targetRef directly (so we get a
 * richer AgentAction). For canvas verbs the `entityIds`/`bridge*` fields drive
 * rect extraction on the server.
 */
export interface ActionIntentPayload {
  verb: string
  kind?: 'browse' | 'canvas' | 'scan_result'
  frameId?: string | null
  targetRef?: string | null
  targetName?: string | null
  targetRole?: string | null
  targetValue?: string | null
  errorHint?: 'retry' | 'hard_fail' | null
  intent?: string | null
  entityIds?: string[]
  bridgeFrom?: string
  bridgeTo?: string
  rects?: Array<{ x: number; y: number; width: number; height: number }>
  /** Explicit canvas-space rect (e.g. for `create --at`). */
  explicitRect?: { x: number; y: number; width: number; height: number }
}

export function emitActionIntent(payload: ActionIntentPayload): void {
  const kind = payload.kind ?? (BROWSE_VERBS.has(payload.verb) ? 'browse' : 'canvas')
  callApp('/session/presence/verb', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      clientName: getClientName(),
      kind,
      ...payload,
    }),
  }).catch(() => {
    /* fire-and-forget */
  })
}

/**
 * Move-then-act variant: awaits the director's commit-phase signal before
 * resolving. Use for verbs where "cursor arrives at target, then mutation
 * fires" reads better than fire-and-forget.
 *
 * The wait is capped server-side (default 300 ms) so a far-away cursor can
 * never hold up the agent indefinitely. Events without a commit waypoint
 * (scans, passive) short-circuit and return immediately — the server knows
 * there's nothing to wait for.
 *
 * This does NOT violate the queue principle: the agent was already awaiting
 * the verb's completion over HTTP. We're inserting a bounded delay inside a
 * single verb's wall-clock, not gating the agent's thinking between verbs.
 */
export function emitActionIntentSync(
  payload: ActionIntentPayload & { capMs?: number },
): Promise<void> {
  const kind = payload.kind ?? (BROWSE_VERBS.has(payload.verb) ? 'browse' : 'canvas')
  // capMs only goes through when the caller passed one explicitly; otherwise
  // the server defaults from the director's tuning (debug-adjustable).
  return callApp('/session/presence/verb-sync', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      clientName: getClientName(),
      kind,
      ...payload,
    }),
  })
    .catch(() => {
      // Network failure → proceed without the cursor. Silent because we
      // must never break the verb's actual work on a presence hiccup.
    })
    .then(() => undefined)
}
