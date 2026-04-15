import { randomUUID } from 'crypto'
import { nativeImage } from 'electron'
import type { Route } from './types'
import type { CreateFramesRequest, DeleteFramesRequest } from '../../shared/types'
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
import { writeJson, getServerAddress } from '../app-control-server'

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
      if (frames.length <= 1) {
        writeJson(response, 200, createFrames(payload))
        return
      }
      const frameIds = frames.map((f) => f.id ?? `frame_${randomUUID()}`)
      frames.forEach((f, i) => { f.id = frameIds[i] })
      writeJson(response, 200, { frameIds })
      staggerOperation(
        request,
        frames.map((f) => ({ x: f.canvasX, y: f.canvasY })),
        'create_frame',
        (i) => createFrames({ frames: [frames[i]] }),
      )
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
