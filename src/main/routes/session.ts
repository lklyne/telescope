import type { Route } from './types'
import type { PresenceTargetRect, PresenceTargetRefSource } from '../../shared/types'
import {
  mcpSessions,
  pendingIntents,
  PENDING_INTENT_TTL_MS,
  resolveSession,
  getPresenceCursors,
  coercePresenceLabelKey,
  coercePresenceActivity,
  coercePresenceSurface,
  coercePresenceTargetRefSource,
  resolveCanvasPointForFrame,
  resolvePresenceTargetRect,
  findPresenceTarget,
  upsertPresenceCursor,
  upsertActivePresenceTask,
  clearActivePresenceTask,
  scheduleThinkingState,
  invalidateAgentSnapshot,
  beginPresenceDeparture,
  resetPresenceState,
} from '../presence-manager'
import { cdpProxyRegistrations, resetCdpProxyState } from '../cdp-proxy'
import {
  clearAutomationInteractiveFrameIds,
} from '../runtime/runtime-context'
import { selectNone as clearSelection } from '../runtime/selection-controller'
import { sendInteractiveState } from '../runtime/overlay-manager'
import { setCanvasMode as setUiCanvasMode } from '../ui-state'
import { writeJson, notifyStatusListeners } from '../app-control-server'
import { emitNarration } from '../narration/event-bus'
import {
  narrateBrowseVerb,
  narrateBrowseScanPlaceholder,
  narrateBrowseScanResult,
  narrateCanvasVerb,
} from '../narration/verb-narration'
import {
  getDirectorTuning,
  setSessionIntent,
  waitForNextCommit,
} from '../narration/director'
import { pushDebugEntry } from '../narration/debug-timeline'
import type {
  CanvasRect,
  NarrationEvent,
} from '../../shared/narration-event'

/**
 * Shared helper: build a NarrationEvent from a verb-sync / verb payload and
 * push it onto the director queue. Returns the event so the sync handler
 * can decide whether a commit-wait is worthwhile (non-commit events short-
 * circuit the wait).
 */
function buildAndEmitVerbEvent(
  resolvedSessionId: string,
  resolvedClientName: string,
  payload: Record<string, unknown>,
): NarrationEvent | null {
  const verb = typeof payload.verb === 'string' ? payload.verb : null
  if (!verb) return null

  const kind =
    payload.kind === 'browse' || payload.kind === 'canvas' || payload.kind === 'scan_result'
      ? payload.kind
      : 'canvas'

  const intent =
    payload.intent === null
      ? null
      : typeof payload.intent === 'string'
        ? payload.intent
        : undefined
  if (intent !== undefined) setSessionIntent(resolvedSessionId, intent)

  const frameId = typeof payload.frameId === 'string' ? payload.frameId : null
  const targetRef = typeof payload.targetRef === 'string' ? payload.targetRef : null
  const targetName = typeof payload.targetName === 'string' ? payload.targetName : null
  const targetRole = typeof payload.targetRole === 'string' ? payload.targetRole : null
  const targetValue = typeof payload.targetValue === 'string' ? payload.targetValue : null
  const errorHint =
    payload.errorHint === 'retry' || payload.errorHint === 'hard_fail'
      ? payload.errorHint
      : null
  const bridgeFrom = typeof payload.bridgeFrom === 'string' ? payload.bridgeFrom : null
  const bridgeTo = typeof payload.bridgeTo === 'string' ? payload.bridgeTo : null
  const entityIds = Array.isArray(payload.entityIds)
    ? payload.entityIds.filter((v): v is string => typeof v === 'string')
    : undefined
  const explicitRect = isCanvasRect(payload.explicitRect)
    ? (payload.explicitRect as CanvasRect)
    : undefined

  const ctxBase = {
    sessionId: resolvedSessionId,
    clientName: resolvedClientName,
  }

  let event: NarrationEvent | null = null

  if (kind === 'browse') {
    event = narrateBrowseVerb({
      ...ctxBase,
      verb,
      frameId,
      targetRef,
      targetName,
      targetRole,
      targetValue,
      errorHint,
    })
  } else if (kind === 'scan_result') {
    const rects = Array.isArray(payload.rects)
      ? (payload.rects as unknown[]).filter(isCanvasRect) as CanvasRect[]
      : []
    event = narrateBrowseScanResult(
      {
        ...ctxBase,
        verb,
        frameId,
        targetRef,
        targetName,
        targetRole,
        targetValue,
      },
      rects,
    )
  } else {
    event = narrateCanvasVerb({
      ...ctxBase,
      verb,
      entityIds,
      bridgeFrom: bridgeFrom ?? undefined,
      bridgeTo: bridgeTo ?? undefined,
      explicitRect,
      errorHint,
    })
  }

  if (event) {
    if (intent !== undefined) event.intent = intent
    emitNarration(event)
  }
  return event
}

function isCanvasRect(r: unknown): r is CanvasRect {
  return (
    !!r &&
    typeof r === 'object' &&
    typeof (r as CanvasRect).x === 'number' &&
    typeof (r as CanvasRect).y === 'number' &&
    typeof (r as CanvasRect).width === 'number' &&
    typeof (r as CanvasRect).height === 'number'
  )
}

function hasCommitWaypoint(event: NarrationEvent | null): boolean {
  return !!event && event.waypoints.some((w) => w.commit === true)
}

function summarizeEventForDebug(
  event: NarrationEvent | null,
  opts: { kind?: string; sync: boolean; capMs?: number },
): string {
  const bits: string[] = []
  if (opts.kind) bits.push(opts.kind)
  bits.push(opts.sync ? `sync${opts.capMs != null ? ` ${opts.capMs}ms` : ''}` : 'async')
  if (event) {
    bits.push(`${event.waypoints.length} wp`)
    if (hasCommitWaypoint(event)) bits.push('commit')
    if (event.idiom) bits.push(event.idiom)
  }
  return bits.join(' · ')
}

function resetSmokeTestState(): void {
  resetPresenceState()
  resetCdpProxyState()
  clearAutomationInteractiveFrameIds()
  clearSelection()
  setUiCanvasMode()
  sendInteractiveState()
}

export const sessionRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/session/presence',
    async handler({ response }) {
      writeJson(response, 200, { cursors: getPresenceCursors() })
    },
  },
  {
    method: 'POST',
    pattern: '/session/presence',
    async handler({ request, response, body }) {
      const payload = body as Record<string, unknown>
      const eventType =
        payload.eventType === 'start' ||
        payload.eventType === 'surface' ||
        payload.eventType === 'act' ||
        payload.eventType === 'think' ||
        payload.eventType === 'done'
          ? payload.eventType
          : null
      const surface = coercePresenceSurface(payload.surface)
      const activity = coercePresenceActivity(payload.phase)
      if (eventType === 'done') {
        clearActivePresenceTask(request, payload)
        writeJson(response, 200, { ok: true })
        return
      }
      if (!surface || !activity) {
        writeJson(response, 400, { error: 'surface and phase are required' })
        return
      }
      const coordinates =
        payload.coordinates && typeof payload.coordinates === 'object'
          ? (payload.coordinates as Record<string, unknown>)
          : {}
      const frameId = typeof payload.frameId === 'string' ? payload.frameId : null
      const targetRef = typeof payload.targetRef === 'string' ? payload.targetRef : null
      const targetRefSource = coercePresenceTargetRefSource(payload.targetRefSource)
      const frameX = typeof coordinates.frameX === 'number' ? coordinates.frameX : null
      const frameY = typeof coordinates.frameY === 'number' ? coordinates.frameY : null
      const explicitTargetRect =
        coordinates.targetRect &&
        typeof coordinates.targetRect === 'object' &&
        typeof (coordinates.targetRect as Record<string, unknown>).x === 'number' &&
        typeof (coordinates.targetRect as Record<string, unknown>).y === 'number' &&
        typeof (coordinates.targetRect as Record<string, unknown>).width === 'number' &&
        typeof (coordinates.targetRect as Record<string, unknown>).height === 'number'
          ? (coordinates.targetRect as PresenceTargetRect)
          : null
      const targetRect = resolvePresenceTargetRect(frameId, targetRef, targetRefSource, explicitTargetRect)
      const framePosition =
        surface === 'frame' && frameId
          ? resolveCanvasPointForFrame(frameId, { frameX, frameY, targetRect })
          : null
      const taskLabel = typeof payload.taskLabel === 'string' ? payload.taskLabel : null
      const labelHint = typeof payload.labelHint === 'string' ? payload.labelHint.trim().slice(0, 48) : null
      if (eventType === 'start' || eventType === 'surface' || eventType === 'act' || eventType === 'think') {
        upsertActivePresenceTask(request, {
          body: payload,
          taskLabel,
          surface,
          frameId,
          frameX,
          frameY,
          canvasX:
            typeof coordinates.canvasX === 'number'
              ? coordinates.canvasX
              : framePosition?.canvasX ?? null,
          canvasY:
            typeof coordinates.canvasY === 'number'
              ? coordinates.canvasY
              : framePosition?.canvasY ?? null,
          targetName: typeof payload.targetName === 'string' ? payload.targetName : null,
          targetRect,
          labelHint,
        })
      }
      upsertPresenceCursor(request, {
        body: payload,
        canvasX:
          typeof coordinates.canvasX === 'number'
            ? coordinates.canvasX
            : framePosition?.canvasX,
        canvasY:
          typeof coordinates.canvasY === 'number'
            ? coordinates.canvasY
            : framePosition?.canvasY,
        surface,
        activity: eventType === 'think' ? 'thinking' : activity,
        frameId,
        frameX,
        frameY,
        labelKey:
          eventType === 'think'
            ? 'thinking'
            : coercePresenceLabelKey(payload.labelKey),
        taskLabel,
        labelHint,
        labelParams:
          payload.labelParams && typeof payload.labelParams === 'object'
            ? (payload.labelParams as Record<string, string | number | boolean>)
            : null,
        targetRef,
        targetRefSource,
        targetName: typeof payload.targetName === 'string' ? payload.targetName : null,
        targetRect,
      })
      if (frameId && targetRef && ['click_target', 'type_text', 'wait_page'].includes(String(payload.labelKey))) {
        invalidateAgentSnapshot(frameId)
      }
      scheduleThinkingState(request)
      writeJson(response, 200, { ok: true })
    },
  },
  {
    /**
     * Narration event emit — fire-and-forget. The CLI posts verb-level intent
     * here and main builds a NarrationEvent with resolved rects via
     * verb-narration.ts, then pushes onto the director's queue. The CLI
     * does NOT wait on director state; this is the default path for reads,
     * scans, and anything where move-then-act isn't needed.
     */
    method: 'POST',
    pattern: '/session/narration/verb',
    async handler({ request, response, body }) {
      const payload = body as Record<string, unknown>
      const resolved = resolveSession(request, payload)
      if (!resolved) {
        writeJson(response, 400, { error: 'session required' })
        return
      }
      if (typeof payload.verb !== 'string') {
        writeJson(response, 400, { error: 'verb is required' })
        return
      }
      const emitted = buildAndEmitVerbEvent(
        resolved.sessionId,
        resolved.session.clientName ?? 'agent',
        payload,
      )
      pushDebugEntry({
        side: 'cli',
        kind: 'cli:emit',
        sessionId: resolved.sessionId,
        label: `emit ${payload.verb as string}`,
        detail: summarizeEventForDebug(emitted, {
          kind: typeof payload.kind === 'string' ? (payload.kind as string) : undefined,
          sync: false,
        }),
      })
      writeJson(response, 200, { ok: true })
    },
  },
  {
    /**
     * Move-then-act narration. Emits the NarrationEvent exactly like /verb,
     * then awaits the director's next commit phase (up to `capMs`) before
     * returning. The CLI handler that calls this will block on the HTTP
     * response, which is exactly what we want for verbs that want "cursor
     * moves to target, then mutation fires."
     *
     * The cap (default 300ms) keeps the wait bounded: if the cursor is far
     * away or the mood is 'stuck', the mutation proceeds anyway rather than
     * holding the agent. Events without any `commit: true` waypoint (scans
     * and passive idioms) short-circuit and return immediately — there's
     * nothing to wait for.
     *
     * Response shape: `{ ok: true, arrival: 'arrived' | 'capped' | 'no-commit' | 'no-session' }`
     */
    method: 'POST',
    pattern: '/session/narration/verb-sync',
    async handler({ request, response, body }) {
      const payload = body as Record<string, unknown>
      const resolved = resolveSession(request, payload)
      if (!resolved) {
        writeJson(response, 400, { error: 'session required' })
        return
      }
      if (typeof payload.verb !== 'string') {
        writeJson(response, 400, { error: 'verb is required' })
        return
      }
      const capMs =
        typeof payload.capMs === 'number' && isFinite(payload.capMs)
          ? Math.min(1000, Math.max(0, Math.round(payload.capMs)))
          : getDirectorTuning().syncCapMs

      const event = buildAndEmitVerbEvent(
        resolved.sessionId,
        resolved.session.clientName ?? 'agent',
        payload,
      )
      pushDebugEntry({
        side: 'cli',
        kind: 'cli:emit',
        sessionId: resolved.sessionId,
        label: `emit ${payload.verb as string}`,
        detail: summarizeEventForDebug(event, {
          kind: typeof payload.kind === 'string' ? (payload.kind as string) : undefined,
          sync: true,
          capMs,
        }),
      })

      if (!hasCommitWaypoint(event)) {
        pushDebugEntry({
          side: 'cli',
          kind: 'cli:sync-resolve',
          sessionId: resolved.sessionId,
          label: `resolve no-commit`,
          detail: `${payload.verb as string}`,
        })
        writeJson(response, 200, { ok: true, arrival: 'no-commit' })
        return
      }

      pushDebugEntry({
        side: 'cli',
        kind: 'cli:sync-wait',
        sessionId: resolved.sessionId,
        label: `sync wait`,
        detail: `${payload.verb as string} · cap ${capMs}ms`,
      })
      const arrival = await waitForNextCommit(resolved.sessionId, capMs)
      pushDebugEntry({
        side: 'cli',
        kind: 'cli:sync-resolve',
        sessionId: resolved.sessionId,
        label: `resolve ${arrival}`,
        detail: `${payload.verb as string}`,
      })
      writeJson(response, 200, { ok: true, arrival })
    },
  },
  {
    method: 'POST',
    pattern: '/session/narration/placeholder',
    async handler({ request, response, body }) {
      const payload = body as Record<string, unknown>
      const resolved = resolveSession(request, payload)
      if (!resolved) {
        writeJson(response, 400, { error: 'session required' })
        return
      }
      const verb = typeof payload.verb === 'string' ? payload.verb : null
      const frameId = typeof payload.frameId === 'string' ? payload.frameId : null
      if (!verb) {
        writeJson(response, 400, { error: 'verb is required' })
        return
      }
      const event = narrateBrowseScanPlaceholder({
        sessionId: resolved.sessionId,
        clientName: resolved.session.clientName ?? 'agent',
        verb,
        frameId,
      })
      if (event) emitNarration(event)
      writeJson(response, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: '/mcp/session/open',
    async handler({ response, body }) {
      const payload = body as { sessionId?: string; clientName?: string }
      if (!payload.sessionId) {
        writeJson(response, 400, { error: 'sessionId is required' })
        return
      }
      mcpSessions.set(payload.sessionId, {
        id: payload.sessionId,
        clientName: payload.clientName ?? 'telescope-mcp',
        lastSeenAt: Date.now(),
      })
      notifyStatusListeners()
      writeJson(response, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: '/mcp/session/ping',
    async handler({ response, body }) {
      const payload = body as { sessionId?: string; clientName?: string }
      if (!payload.sessionId) {
        writeJson(response, 400, { error: 'sessionId is required' })
        return
      }
      const existing = mcpSessions.get(payload.sessionId)
      mcpSessions.set(payload.sessionId, {
        id: payload.sessionId,
        clientName: payload.clientName ?? existing?.clientName ?? 'telescope-mcp',
        lastSeenAt: Date.now(),
      })
      notifyStatusListeners()
      writeJson(response, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: '/mcp/session/close',
    async handler({ response, body }) {
      const payload = body as { sessionId?: string }
      if (!payload.sessionId) {
        writeJson(response, 400, { error: 'sessionId is required' })
        return
      }
      mcpSessions.delete(payload.sessionId)
      notifyStatusListeners()
      beginPresenceDeparture(payload.sessionId)
      writeJson(response, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: '/test/reset-state',
    async handler({ response }) {
      resetSmokeTestState()
      writeJson(response, 200, { ok: true })
    },
  },
]
