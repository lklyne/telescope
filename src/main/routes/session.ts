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
import { setSessionIntent } from '../narration/director'
import type { CanvasRect } from '../../shared/narration-event'

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
     * Narration event emit — the CLI posts verb-level intent here and main
     * builds a NarrationEvent with resolved rects via verb-narration.ts,
     * then pushes onto the director's queue. Fire-and-forget: the CLI does
     * not wait on director state.
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

      const verb = typeof payload.verb === 'string' ? payload.verb : null
      if (!verb) {
        writeJson(response, 400, { error: 'verb is required' })
        return
      }

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
      if (intent !== undefined) setSessionIntent(resolved.sessionId, intent)

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

      const ctxBase = {
        sessionId: resolved.sessionId,
        clientName: resolved.session.clientName ?? 'agent',
      }

      let event: Parameters<typeof emitNarration>[0] | null = null

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
          ? (payload.rects as unknown[]).filter(
              (r): r is CanvasRect =>
                !!r &&
                typeof r === 'object' &&
                typeof (r as CanvasRect).x === 'number' &&
                typeof (r as CanvasRect).y === 'number' &&
                typeof (r as CanvasRect).width === 'number' &&
                typeof (r as CanvasRect).height === 'number',
            )
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
          errorHint,
        })
      }

      if (event) {
        if (intent !== undefined) event.intent = intent
        emitNarration(event)
      }

      writeJson(response, 200, { ok: true })
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
