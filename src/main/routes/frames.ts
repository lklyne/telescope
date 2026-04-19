import { randomUUID } from 'crypto'
import type { IncomingMessage } from 'http'
import { nativeImage } from 'electron'
import type { Route } from './types'
import type { CreateFramesRequest, DeleteFramesRequest, PageConfig } from '../../shared/types'
import type { CanvasRect } from '../../shared/narration-event'
import {
  LAPTOP_PRESET_INDEX,
  VIEWPORT_PRESETS,
  defaultOrientationForDevice,
  deviceForPresetIndex,
  sizeForOrientation,
} from '../../shared/device-catalog'
import { createFrames } from '../workspace-frames'
import { deleteFrames } from '../workspace-entities'
import { focusTargets } from '../workspace-groups'
import { createFrameAtPosition, setFramePreset, setDeviceOrientation } from '../runtime/document-commands'
import { showDeviceFrameFromMetadata, setShowDeviceFrameMetadata } from '../runtime/runtime-entities'
import { navigateFramePage } from '../navigation-sync'
import { findPageById } from '../runtime/runtime-context'
import {
  takeFrameAgentSnapshot,
  takeFrameScreenshot,
  takeFrameSnapshot,
  queryFrameElements,
} from '../runtime/page-runtime'
import { cacheAgentSnapshot } from '../runtime/agent-snapshot-cache'
import { captureFrameComposited } from '../runtime/frame-compositor'
import { win } from '../runtime/window-shell'
import {
  resolveFrameCdpConnection,
  registerFrameCdpProxy,
  cdpProxyRegistrations,
  pruneExpiredCdpProxyRegistrations,
  summarizeCdpProxyRegistration,
  cdpProxyMetrics,
} from '../cdp-proxy'
import {
  staggerOperation,
  normalizeAgentSnapshot,
  findPresenceTarget,
  resolveSession,
} from '../presence-manager'
import { narrateCanvasVerb } from '../narration/verb-narration'
import { emitNarration, hasCommit } from '../narration/event-bus'
import { waitForNextCommit } from '../narration/director'
import { pushDebugEntry } from '../narration/debug-timeline'
import { writeJson, getServerAddress } from '../app-control-server'

/**
 * Move-then-act cap for frame creates. The global sync cap (300ms) is tuned
 * for short-distance browse verbs; frame placements can land thousands of
 * pixels from the current cursor, so we give the cursor enough time to
 * actually arrive at its waypoint instead of capping mid-flight and firing
 * the create while the cursor is still traveling.
 */
const CREATE_FRAME_SYNC_CAP_MS = 1500

/**
 * Compute the canvas-space rect of a frame-to-be-created from its preset +
 * orientation. Narration uses this to steer the cursor to the exact spot the
 * frame will land BEFORE the frame is rendered — the "move-then-act" cue.
 * Returns null if canvasX/Y aren't set (caller should skip narration).
 */
function frameRectFromCreate(f: PageConfig): CanvasRect | null {
  if (typeof f.canvasX !== 'number' || typeof f.canvasY !== 'number') return null
  const presetIndex = typeof f.presetIndex === 'number' ? f.presetIndex : LAPTOP_PRESET_INDEX
  const preset = VIEWPORT_PRESETS[presetIndex]
  const baseW = preset?.width ?? 1280
  const baseH = preset?.height ?? 800
  const device = deviceForPresetIndex(presetIndex)
  const orientation =
    (f.metadata?.deviceOrientation as 'portrait' | 'landscape' | undefined)
    ?? defaultOrientationForDevice(device)
  const size = sizeForOrientation(baseW, baseH, orientation)
  return { x: f.canvasX, y: f.canvasY, width: size.width, height: size.height }
}

/**
 * Emit an atomic create narration with the resolved placement rect and wait
 * for the director's commit waypoint (bounded by the director's syncCapMs).
 * The wait lets the cursor animate to the drop point before the frame is
 * actually inserted into the workspace.
 */
async function narrateFrameCreate(
  request: IncomingMessage,
  rect: CanvasRect,
): Promise<void> {
  const resolved = resolveSession(request)
  if (!resolved) return
  const event = narrateCanvasVerb({
    sessionId: resolved.sessionId,
    clientName: resolved.session.clientName ?? 'agent',
    verb: 'create',
    explicitRect: rect,
  })
  if (!event) return
  emitNarration(event)
  // Pair with the cli:emit / cli:sync-wait / cli:sync-resolve entries that
  // the /session/narration/verb-sync handler writes, so the create path is
  // visible in the debug timeline's left column.
  pushDebugEntry({
    side: 'cli',
    kind: 'cli:emit',
    sessionId: resolved.sessionId,
    label: `emit ${event.verb}`,
    detail: `canvas · sync ${CREATE_FRAME_SYNC_CAP_MS}ms · ${event.waypoints.length} wp${hasCommit(event) ? ' · commit' : ''}${event.idiom ? ` · ${event.idiom}` : ''}`,
  })
  if (!hasCommit(event)) return
  pushDebugEntry({
    side: 'cli',
    kind: 'cli:sync-wait',
    sessionId: resolved.sessionId,
    label: 'sync wait',
    detail: `${event.verb} · cap ${CREATE_FRAME_SYNC_CAP_MS}ms`,
  })
  const arrival = await waitForNextCommit(resolved.sessionId, CREATE_FRAME_SYNC_CAP_MS)
  pushDebugEntry({
    side: 'cli',
    kind: 'cli:sync-resolve',
    sessionId: resolved.sessionId,
    label: `resolve ${arrival}`,
    detail: `${event.verb}`,
  })
}

export const frameRoutes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/frames\/([^/]+)\/cdp-target$/,
    async handler({ request, response, params }) {
      try {
        const connection = await resolveFrameCdpConnection(decodeURIComponent(params[0]))
        const address = getServerAddress()
        if (!address || typeof address === 'string') {
          throw new Error('CDP proxy server is unavailable')
        }
        const resolved = resolveSession(request)
        writeJson(response, 200, registerFrameCdpProxy(connection, address.port, {
          sessionId: resolved?.sessionId ?? null,
          clientName: resolved?.session.clientName ?? null,
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to resolve CDP target'
        const status =
          message === 'Frame not found'
            ? 404
            : message === 'CDP target not found for frame' || message === 'CDP browser target not found'
              ? 404
            : 502
        writeJson(response, status, { error: message })
      }
    },
  },
  {
    method: 'GET',
    pattern: '/debug/cdp-proxy',
    async handler({ response }) {
      pruneExpiredCdpProxyRegistrations()
      writeJson(response, 200, {
        registrations: [...cdpProxyRegistrations.values()].map(summarizeCdpProxyRegistration),
        metrics: cdpProxyMetrics,
      })
    },
  },
  {
    method: 'POST',
    pattern: '/frames/create',
    async handler({ request, response, body }) {
      const payload = body as CreateFramesRequest
      const frames = payload.frames ?? []
      if (frames.length === 0) {
        writeJson(response, 200, createFrames(payload))
        return
      }
      if (frames.length === 1) {
        // Move-then-act: animate cursor to the resolved placement rect, then
        // commit the create. Single-frame path blocks the HTTP response so
        // the CLI's wall-clock reflects the cursor arrival.
        const rect = frameRectFromCreate(frames[0])
        if (rect) await narrateFrameCreate(request, rect)
        writeJson(response, 200, createFrames(payload))
        return
      }
      // Batch: assign IDs up-front so the client gets them immediately, then
      // narrate + create one frame at a time in the background. Each frame's
      // cursor animation completes (or caps) before the next insert fires.
      const frameIds = frames.map((f) => f.id ?? `frame_${randomUUID()}`)
      frames.forEach((f, i) => { f.id = frameIds[i] })
      writeJson(response, 200, { frameIds })
      void (async () => {
        for (const frame of frames) {
          const rect = frameRectFromCreate(frame)
          if (rect) await narrateFrameCreate(request, rect)
          createFrames({ frames: [frame] })
        }
      })()
    },
  },
  {
    method: 'POST',
    pattern: '/frames/update',
    async handler({ response, body }) {
      const payload = body as {
        frames: Array<{
          id: string
          presetIndex?: number
          orientation?: 'portrait' | 'landscape'
          showDeviceFrame?: boolean
          url?: string
          canvasX?: number
          canvasY?: number
        }>
      }
      const updated: string[] = []
      for (const f of payload.frames) {
        const page = findPageById(f.id)
        if (!page) continue
        if (f.presetIndex !== undefined) setFramePreset(page.id, f.presetIndex)
        if (f.orientation !== undefined) setDeviceOrientation(page.id, f.orientation)
        if (f.showDeviceFrame !== undefined) {
          const current = showDeviceFrameFromMetadata(page.metadata)
          if (current !== f.showDeviceFrame) {
            page.metadata = setShowDeviceFrameMetadata(page.metadata, f.showDeviceFrame)
          }
        }
        if (f.url !== undefined && f.url !== page.url) {
          navigateFramePage(page, { type: 'load-url', url: f.url })
        }
        if (f.canvasX !== undefined) page.canvasX = f.canvasX
        if (f.canvasY !== undefined) page.canvasY = f.canvasY
        updated.push(page.id)
      }
      writeJson(response, 200, { updated })
    },
  },
  {
    method: 'POST',
    pattern: '/frames/create-at-position',
    async handler({ response, body }) {
      const payload = body as {
        sourceFrameId?: string
        presetIndex?: number
        canvasX?: number
        canvasY?: number
      }
      if (typeof payload.canvasX !== 'number' || typeof payload.canvasY !== 'number') {
        writeJson(response, 400, { error: 'canvasX and canvasY are required numbers' })
        return
      }
      writeJson(
        response,
        200,
        createFrameAtPosition({
          sourceFrameId: payload.sourceFrameId,
          presetIndex: payload.presetIndex ?? 0,
          canvasX: payload.canvasX,
          canvasY: payload.canvasY,
          mode: 'add_from_toolbar',
          focus: true,
        }),
      )
    },
  },
  {
    method: 'POST',
    pattern: '/frames/delete',
    async handler({ request, response, body }) {
      const payload = body as DeleteFramesRequest
      const frameIds = payload.frameIds ?? []
      if (frameIds.length <= 1) {
        writeJson(response, 200, deleteFrames(payload))
        return
      }
      const itemsToDelete = frameIds
        .map((id) => { const p = findPageById(id); return p ? { id, x: p.canvasX, y: p.canvasY } : null })
        .filter((p): p is NonNullable<typeof p> => p !== null)
      writeJson(response, 200, { deletedFrameIds: frameIds, deletedEdgeIds: [], deletedGroupIds: [], missingFrameIds: [], warnings: [] })
      staggerOperation(request, itemsToDelete, null, (i) => deleteFrames({ frameIds: [itemsToDelete[i].id] }))
    },
  },
  {
    method: 'POST',
    pattern: '/frames/snapshot',
    async handler({ response, body }) {
      const payload = body as { frameId?: string; maxDepth?: number }
      const snapshot = await takeFrameSnapshot(payload.frameId, payload.maxDepth)
      writeJson(response, 200, { snapshot })
    },
  },
  {
    method: 'POST',
    pattern: '/frames/agent-snapshot',
    async handler({ response, body }) {
      const payload = body as { frameId?: string; maxDepth?: number }
      const frameId = typeof payload.frameId === 'string' ? payload.frameId : undefined
      if (!frameId) {
        writeJson(response, 400, { error: 'frameId is required' })
        return
      }
      const rawSnapshot = await takeFrameAgentSnapshot(frameId, payload.maxDepth)
      const snapshot = normalizeAgentSnapshot(frameId, rawSnapshot)
      cacheAgentSnapshot(snapshot)
      writeJson(response, 200, { snapshot })
    },
  },
  {
    method: 'POST',
    pattern: '/frames/screenshot',
    async handler({ response, body }) {
      const payload = body as { frameId?: string }
      const base64 = await takeFrameScreenshot(payload.frameId)
      writeJson(response, 200, { base64, mimeType: 'image/png' })
    },
  },
  {
    method: 'POST',
    pattern: '/frames/screenshot-composite',
    async handler({ response, body }) {
      const payload = body as { frameId?: string; padding?: number }
      const frameId = payload.frameId
      if (!frameId) {
        writeJson(response, 400, { error: 'frameId is required' })
        return
      }
      const page = findPageById(frameId)
      if (!page) {
        writeJson(response, 404, { error: `Frame not found: ${frameId}` })
        return
      }
      if (!win || win.isDestroyed()) {
        writeJson(response, 500, { error: 'Window not available' })
        return
      }
      try {
        focusTargets({ frameIds: [frameId] })
        await new Promise((r) => setTimeout(r, 400))

        const result = await captureFrameComposited(page)
        if (!result) {
          writeJson(response, 500, { error: 'Frame capture failed (destroyed or empty)' })
          return
        }

        const composited = nativeImage.createFromBitmap(result.bitmap, { width: result.width, height: result.height })
        const base64 = composited.toPNG().toString('base64')
        writeJson(response, 200, { base64, mimeType: 'image/png', width: result.width, height: result.height })
      } catch (error) {
        writeJson(response, 500, { error: error instanceof Error ? error.message : 'Screenshot failed' })
      }
    },
  },
  {
    method: 'POST',
    pattern: '/frames/query-elements',
    async handler({ response, body }) {
      const payload = body as { frameId?: string; selector?: string; maxResults?: number }
      const elements = await queryFrameElements(payload.frameId, payload.selector, payload.maxResults)
      writeJson(response, 200, { elements })
    },
  },
  {
    method: 'POST',
    pattern: '/frames/find-target',
    async handler({ response, body }) {
      const payload = body as {
        frameId?: string
        selector?: string
        name?: string
        text?: string
        elementPath?: string
        fullPath?: string
        interactiveOnly?: boolean
        maxResults?: number
      }
      if (!payload.frameId) {
        writeJson(response, 400, { error: 'frameId is required' })
        return
      }
      const target = await findPresenceTarget(payload.frameId, {
        selector: typeof payload.selector === 'string' ? payload.selector : null,
        name: typeof payload.name === 'string' ? payload.name : null,
        text: typeof payload.text === 'string' ? payload.text : null,
        elementPath: typeof payload.elementPath === 'string' ? payload.elementPath : null,
        fullPath: typeof payload.fullPath === 'string' ? payload.fullPath : null,
        interactiveOnly: payload.interactiveOnly !== false,
        maxResults: typeof payload.maxResults === 'number' ? payload.maxResults : undefined,
      })
      if (!target) {
        writeJson(response, 404, { error: 'No matching target found' })
        return
      }
      writeJson(response, 200, { target })
    },
  },
]
