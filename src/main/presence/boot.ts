/**
 * CursorDirector boot — called once from main's startup sequence.
 *
 * Responsibilities:
 *  - Configure the director's clock and color derivation.
 *  - Subscribe the event bus so event arrivals wake the session and trigger
 *    immediate tick scheduling.
 *  - Run the director tick on a ~16 ms interval whenever there is work.
 *  - Pipe the director's `onCursorFrameChanged` signal into the existing
 *    layout dirty/rebuild pipeline so cursor frames ship to the renderer.
 */

import { markDirty } from '../runtime/layout-dirty'
import { requestLayout } from '../runtime/surface-layout'
import { beginPresenceDeparture, deriveColor } from '../presence-cursor'
import { getCursorSplineViz, getCursorTuning } from '../runtime/preferences'
import {
  configureDirector,
  notifyEventPosted,
  onCursorFrameChanged,
  setCursorTuning,
  setSplineVizEnabled,
  tick,
} from './director'
import { hasPending, subscribe } from './event-bus'

const TICK_INTERVAL_MS = 16

let tickTimer: NodeJS.Timeout | null = null
let booted = false

function ensureTicking(): void {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    tick()
    if (!hasPending()) {
      // No queued work. Keep ticking for a few frames to animate in-flight
      // splines to their settled state; the advance() loop itself stops
      // producing changes once everything is idle.
      // (Simplest thing: always tick. The overhead at 60 Hz is trivial.)
    }
  }, TICK_INTERVAL_MS)
}

export function initializeCursorDirector(): void {
  if (booted) return
  booted = true

  configureDirector({
    deriveColor,
    // When the director retires an idle session, also fade out the toolbar
    // presence cursor so the three visual cues (canvas cursor, pink frame
    // highlight, toolbar icon) clear together instead of staggering by the
    // MCP-session timeout.
    onSessionRetired: beginPresenceDeparture,
  })

  setSplineVizEnabled(getCursorSplineViz())
  setCursorTuning(getCursorTuning())

  subscribe((sessionId) => {
    // The event-bus subscription fires as soon as an AgentAction is
    // enqueued. We make sure the director has a session record and kick the
    // tick loop so the event is drained within one frame.
    notifyEventPosted(sessionId, 'agent')
    ensureTicking()
  })

  onCursorFrameChanged(() => {
    markDirty('canvas', 'toolbar')
    requestLayout()
  })

  ensureTicking()
}
