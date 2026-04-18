import { callApp, sessionId, getClientName } from './shared/app-client'

// ---------------------------------------------------------------------------
// Narration intent — replaces the old presence event firing.
// ---------------------------------------------------------------------------
// Every CLI verb fires a single narration intent at dispatch time. Main
// constructs the NarrationEvent server-side (with resolved rects) and pushes
// it onto the director's queue. Fire-and-forget: never blocks the CLI.

/** Verbs that dispatch to agent-browser run the `browse` narration path. */
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
 * Emit a narration intent for the given verb. For browse verbs we expect
 * `handleBrowse` to supply the frameId + targetRef directly (so we get a
 * richer narration). For canvas verbs the `entityIds`/`bridge*` fields drive
 * rect extraction on the server.
 */
export interface NarrationIntentPayload {
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
}

export function emitNarrationIntent(payload: NarrationIntentPayload): void {
  const kind = payload.kind ?? (BROWSE_VERBS.has(payload.verb) ? 'browse' : 'canvas')
  callApp('/session/narration/verb', {
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
