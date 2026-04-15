import { randomUUID } from 'crypto'
import { webContents } from 'electron'
import { WebSocket, type RawData } from 'ws'
import type { UiSelection } from '../shared/types'
import { activeSessions } from './presence-manager'
import {
  enterGroup as enterSelectionGroup,
  selectEntities as selectSelectionEntities,
  selectEntity as selectSelectionEntity,
  selectNone as clearSelection,
  selectPageById as selectSelectionPageById,
} from './runtime/selection-controller'
import { getUiState } from './ui-state'
import { findPageById } from './runtime/runtime-context'

// --- Constants ---

export const APP_CONTROL_HOST = '127.0.0.1'
const CDP_PROXY_TTL_MS = 5 * 60_000
const REMOTE_DEBUGGING_PORT = Number.parseInt(process.env.TELESCOPE_REMOTE_DEBUGGING_PORT ?? '9229', 10)
const CDP_PROXY_LOG_DEBUG = process.env.TELESCOPE_DEBUG_CDP_PROXY === '1'
const CDP_PROXY_TIMING_DEBUG = process.env.TELESCOPE_DEBUG_CDP_PROXY_TIMING === '1'

// --- Types ---

interface CdpTargetInfo {
  id: string
  type?: string
  url?: string
  title?: string
  webSocketDebuggerUrl?: string
}

interface CdpVersionInfo {
  webSocketDebuggerUrl?: string
}

export interface FrameCdpConnectionInfo {
  frameId: string
  targetId: string
  url: string
  title: string
  browserWebSocketDebuggerUrl: string
}

export interface CdpProxyRegistration {
  token: string
  key: string
  frameId: string
  targetId: string
  url: string
  title: string
  browserWebSocketDebuggerUrl: string
  createdAt: number
  updatedAt: number
  lastResolvedAt: number
  sessionId: string | null
  clientName: string | null
  status: 'idle' | 'connecting' | 'open' | 'recovering' | 'closed'
  lastError: string | null
  upstreamSocket: WebSocket | null
  upstreamQueue: string[]
  activeBridge: CdpClientBridge | null
  connectPromise: Promise<WebSocket> | null
  selectionSnapshot: UiSelection | null
}

export interface CdpClientBridge {
  clientSocket: WebSocket
  connectedAt: number
  pendingMethods: Map<number, string>
  attachTargetIds: Map<number, string>
  allowedSessionIds: Set<string>
}

// --- State ---

export const cdpProxyRegistrations = new Map<string, CdpProxyRegistration>()
export const cdpProxyRegistrationsByKey = new Map<string, string>()
export const cdpProxyMetrics = {
  registrationsCreated: 0,
  registrationsReused: 0,
  upstreamConnects: 0,
  upstreamReconnects: 0,
  interceptedClicks: 0,
  interceptedScrolls: 0,
}

// --- Logging ---

export function cdpProxyLog(
  category: 'lifecycle' | 'intercept' | 'timing',
  event: string,
  details?: Record<string, unknown>,
): void {
  const enabled =
    category === 'timing'
      ? CDP_PROXY_TIMING_DEBUG
      : CDP_PROXY_LOG_DEBUG
  if (!enabled) return
  console.log(`[cdp-proxy:${category}]`, { ts: Date.now(), event, ...details })
}

// --- Utilities ---

export function cdpProxyKey(sessionId: string | null, frameId: string): string {
  return `${sessionId ?? 'anonymous'}::${frameId}`
}

export function closeSocketQuietly(socket: WebSocket | null | undefined): void {
  if (!socket) return
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close()
  }
}

export function summarizeCdpProxyRegistration(registration: CdpProxyRegistration): Record<string, unknown> {
  return {
    token: registration.token,
    key: registration.key,
    frameId: registration.frameId,
    targetId: registration.targetId,
    url: registration.url,
    title: registration.title,
    sessionId: registration.sessionId,
    clientName: registration.clientName,
    status: registration.status,
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt,
    lastResolvedAt: registration.lastResolvedAt,
    lastError: registration.lastError,
    hasActiveClient: registration.activeBridge !== null,
    upstreamReadyState: registration.upstreamSocket?.readyState ?? null,
    queuedMessageCount: registration.upstreamQueue.length,
  }
}

export function disposeCdpProxyRegistration(registration: CdpProxyRegistration): void {
  closeSocketQuietly(registration.activeBridge?.clientSocket)
  registration.activeBridge = null
  closeSocketQuietly(registration.upstreamSocket)
  registration.upstreamSocket = null
  registration.connectPromise = null
  registration.status = 'closed'
  cdpProxyRegistrations.delete(registration.token)
  cdpProxyRegistrationsByKey.delete(registration.key)
}

// --- Selection restoration ---

function restoreSelectionSnapshot(snapshot: UiSelection): void {
  if (snapshot.kind === 'none') {
    clearSelection()
    return
  }
  if (snapshot.kind === 'single-entity') {
    if (snapshot.entityKind === 'frame') {
      selectSelectionPageById(snapshot.entityId)
      return
    }
    selectSelectionEntity(snapshot.entityId, snapshot.entityKind)
    return
  }
  selectSelectionEntities(snapshot.entityIds)
}

export function restoreAutomationSelectionIfNeeded(registration: CdpProxyRegistration): void {
  const snapshot = registration.selectionSnapshot
  if (!snapshot) return
  registration.selectionSnapshot = null

  const current = getUiState().selection
  const currentIsAutomationFrame =
    current.kind === 'single-entity' &&
    current.entityKind === 'frame' &&
    current.entityId === registration.frameId

  if (!currentIsAutomationFrame && current.kind !== 'none') {
    return
  }

  restoreSelectionSnapshot(snapshot)
}

// --- Target resolution ---

async function fetchCdpTargets(): Promise<CdpTargetInfo[]> {
  const response = await fetch(`http://${APP_CONTROL_HOST}:${REMOTE_DEBUGGING_PORT}/json`)
  if (!response.ok) {
    throw new Error(`CDP target listing failed with ${response.status}`)
  }
  return await response.json() as CdpTargetInfo[]
}

async function fetchBrowserCdpVersion(): Promise<CdpVersionInfo> {
  const response = await fetch(`http://${APP_CONTROL_HOST}:${REMOTE_DEBUGGING_PORT}/json/version`)
  if (!response.ok) {
    throw new Error(`CDP browser version lookup failed with ${response.status}`)
  }
  return await response.json() as CdpVersionInfo
}

export async function resolveFrameCdpConnection(frameId: string): Promise<FrameCdpConnectionInfo> {
  const page = findPageById(frameId)
  if (!page) {
    throw new Error('Frame not found')
  }

  const frameWebContentsId = page.pageView.webContents.id
  const targets = await fetchCdpTargets()
  const target = targets.find((candidate) => {
    if (!candidate.id || !candidate.webSocketDebuggerUrl) return false
    return webContents.fromDevToolsTargetId(candidate.id)?.id === frameWebContentsId
  })

  if (!target?.webSocketDebuggerUrl) {
    throw new Error('CDP target not found for frame')
  }

  const browserVersion = await fetchBrowserCdpVersion()
  if (!browserVersion.webSocketDebuggerUrl) {
    throw new Error('CDP browser target not found')
  }

  return {
    frameId,
    targetId: target.id,
    url: target.url ?? page.pageView.webContents.getURL() ?? 'about:blank',
    title: target.title ?? page.pageView.webContents.getTitle() ?? '',
    browserWebSocketDebuggerUrl: browserVersion.webSocketDebuggerUrl,
  }
}

// --- Registration management ---

export async function refreshCdpProxyRegistration(
  registration: CdpProxyRegistration,
): Promise<CdpProxyRegistration> {
  const next = await resolveFrameCdpConnection(registration.frameId)
  const browserTargetChanged =
    registration.browserWebSocketDebuggerUrl !== next.browserWebSocketDebuggerUrl
  registration.targetId = next.targetId
  registration.url = next.url
  registration.title = next.title
  registration.browserWebSocketDebuggerUrl = next.browserWebSocketDebuggerUrl
  registration.lastResolvedAt = Date.now()
  registration.updatedAt = registration.lastResolvedAt
  registration.lastError = null
  if (browserTargetChanged) {
    cdpProxyLog('lifecycle', 'browser-target-changed', {
      token: registration.token,
      frameId: registration.frameId,
    })
    closeSocketQuietly(registration.upstreamSocket)
    registration.upstreamSocket = null
    // Wait for any in-flight connection to complete before clearing the promise.
    // This prevents concurrent ensureCdpProxyUpstream calls from creating a second socket.
    if (registration.connectPromise) {
      await registration.connectPromise.catch(() => {})
    }
    registration.connectPromise = null
    registration.status = 'recovering'
  }
  return registration
}

function flushCdpProxyQueue(registration: CdpProxyRegistration): void {
  if (!registration.upstreamSocket || registration.upstreamSocket.readyState !== WebSocket.OPEN) return
  for (const message of registration.upstreamQueue.splice(0)) {
    registration.upstreamSocket.send(message)
  }
}

export async function ensureCdpProxyUpstream(
  registration: CdpProxyRegistration,
): Promise<WebSocket> {
  if (registration.upstreamSocket?.readyState === WebSocket.OPEN) return registration.upstreamSocket
  if (registration.connectPromise) return registration.connectPromise

  registration.status = registration.upstreamSocket ? 'recovering' : 'connecting'
  registration.lastError = null
  const startedAt = Date.now()
  const existingSocket = registration.upstreamSocket
  if (existingSocket && existingSocket.readyState !== WebSocket.CLOSED) {
    closeSocketQuietly(existingSocket)
  }

  registration.connectPromise = new Promise<WebSocket>((resolve, reject) => {
    const upstreamSocket = new WebSocket(registration.browserWebSocketDebuggerUrl)
    registration.upstreamSocket = upstreamSocket
    if (registration.status === 'recovering') cdpProxyMetrics.upstreamReconnects += 1
    else cdpProxyMetrics.upstreamConnects += 1

    upstreamSocket.once('open', () => {
      registration.status = 'open'
      registration.updatedAt = Date.now()
      registration.connectPromise = null
      flushCdpProxyQueue(registration)
      cdpProxyLog('timing', 'upstream-open', {
        token: registration.token,
        frameId: registration.frameId,
        durationMs: Date.now() - startedAt,
      })
      resolve(upstreamSocket)
    })

    upstreamSocket.on('message', (rawMessage: RawData) => {
      registration.updatedAt = Date.now()
      const bridge = registration.activeBridge
      if (!bridge || bridge.clientSocket.readyState !== WebSocket.OPEN) return
      const text = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString()

      let payload: Record<string, unknown> | null = null
      try {
        payload = JSON.parse(text) as Record<string, unknown>
      } catch {
        bridge.clientSocket.send(text)
        return
      }

      const id = typeof payload.id === 'number' ? payload.id : null
      const method = typeof payload.method === 'string' ? payload.method : null
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null
      if (sessionId && !bridge.allowedSessionIds.has(sessionId)) return
      if (method && payload.params && typeof payload.params === 'object') {
        const params = payload.params as Record<string, unknown>
        if (!allowCdpTargetEvent(method, params, registration.targetId, bridge.allowedSessionIds)) {
          return
        }
      }

      if (id !== null) {
        const pendingMethod = bridge.pendingMethods.get(id)
        bridge.pendingMethods.delete(id)
        if (pendingMethod === 'Target.getTargets') {
          const result = payload.result as Record<string, unknown> | undefined
          const targetInfos = Array.isArray(result?.targetInfos)
            ? result.targetInfos.filter((item) => {
              const targetInfo = item as Record<string, unknown>
              return targetInfo.targetId === registration.targetId
            })
            : []
          payload = {
            ...payload,
            result: {
              ...(result ?? {}),
              targetInfos,
            },
          }
        }
        if (pendingMethod === 'Target.attachToTarget') {
          const attachedSession = (payload.result as Record<string, unknown> | undefined)?.sessionId
          if (typeof attachedSession === 'string') {
            bridge.allowedSessionIds.add(attachedSession)
          }
        }
      }

      bridge.clientSocket.send(JSON.stringify(payload))
    })

    upstreamSocket.once('close', () => {
      registration.updatedAt = Date.now()
      registration.upstreamSocket = null
      registration.connectPromise = null
      if (registration.status !== 'closed') {
        registration.status = 'recovering'
      }
      cdpProxyLog('lifecycle', 'upstream-closed', {
        token: registration.token,
        frameId: registration.frameId,
        hasActiveClient: registration.activeBridge !== null,
      })
    })

    upstreamSocket.once('error', (error) => {
      registration.lastError = error.message
      registration.connectPromise = null
      registration.status = 'recovering'
      cdpProxyLog('lifecycle', 'upstream-error', {
        token: registration.token,
        frameId: registration.frameId,
        message: error.message,
      })
      reject(error)
    })
  })

  return registration.connectPromise
}

// --- Pruning ---

export function pruneExpiredCdpProxyRegistrations(now = Date.now()): void {
  const activeSessionIds = new Set(activeSessions(now).map((session) => session.id))
  for (const registration of cdpProxyRegistrations.values()) {
    const expired = now - registration.updatedAt > CDP_PROXY_TTL_MS
    const sessionExpired = registration.sessionId !== null && !activeSessionIds.has(registration.sessionId)
    const frameMissing = !findPageById(registration.frameId)
    if (expired || sessionExpired || frameMissing) {
      cdpProxyLog('lifecycle', 'dispose-registration', {
        token: registration.token,
        frameId: registration.frameId,
        reason: expired ? 'ttl' : sessionExpired ? 'session-expired' : 'frame-missing',
      })
      disposeCdpProxyRegistration(registration)
    }
  }
}

export function registerFrameCdpProxy(
  connection: FrameCdpConnectionInfo,
  port: number,
  session: { sessionId: string | null; clientName: string | null },
): {
  frameId: string
  targetId: string
  webSocketDebuggerUrl: string
  url: string
  title: string
} {
  pruneExpiredCdpProxyRegistrations()
  const now = Date.now()
  const key = cdpProxyKey(session.sessionId, connection.frameId)
  const existingToken = cdpProxyRegistrationsByKey.get(key)
  const existing = existingToken ? cdpProxyRegistrations.get(existingToken) : null
  if (existing) {
    existing.targetId = connection.targetId
    existing.url = connection.url
    existing.title = connection.title
    existing.browserWebSocketDebuggerUrl = connection.browserWebSocketDebuggerUrl
    existing.updatedAt = now
    existing.lastResolvedAt = now
    existing.sessionId = session.sessionId
    existing.clientName = session.clientName
    cdpProxyMetrics.registrationsReused += 1
    cdpProxyLog('lifecycle', 'reuse-registration', {
      token: existing.token,
      frameId: existing.frameId,
      sessionId: existing.sessionId,
    })
    return {
      frameId: existing.frameId,
      targetId: existing.targetId,
      webSocketDebuggerUrl: `ws://${APP_CONTROL_HOST}:${port}/cdp/frame/${existing.token}`,
      url: existing.url,
      title: existing.title,
    }
  }

  const token = randomUUID()
  const registration: CdpProxyRegistration = {
    token,
    key,
    ...connection,
    createdAt: now,
    updatedAt: now,
    lastResolvedAt: now,
    sessionId: session.sessionId,
    clientName: session.clientName,
    status: 'idle',
    lastError: null,
    upstreamSocket: null,
    upstreamQueue: [],
    activeBridge: null,
    connectPromise: null,
    selectionSnapshot: null,
  }
  cdpProxyRegistrations.set(token, registration)
  cdpProxyRegistrationsByKey.set(key, token)
  cdpProxyMetrics.registrationsCreated += 1
  cdpProxyLog('lifecycle', 'create-registration', {
    token,
    frameId: connection.frameId,
    sessionId: session.sessionId,
  })
  return {
    frameId: connection.frameId,
    targetId: connection.targetId,
    webSocketDebuggerUrl: `ws://${APP_CONTROL_HOST}:${port}/cdp/frame/${token}`,
    url: connection.url,
    title: connection.title,
  }
}

export function allowCdpTargetEvent(method: string, params: Record<string, unknown>, targetId: string, sessionIds: Set<string>): boolean {
  if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
    const targetInfo = params.targetInfo as Record<string, unknown> | undefined
    return targetInfo?.targetId === targetId
  }
  if (method === 'Target.targetDestroyed') {
    return params.targetId === targetId
  }
  if (method === 'Target.attachedToTarget') {
    const targetInfo = params.targetInfo as Record<string, unknown> | undefined
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : null
    if (targetInfo?.targetId !== targetId || !sessionId) return false
    sessionIds.add(sessionId)
    return true
  }
  if (method === 'Target.detachedFromTarget') {
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : null
    if (!sessionId) return false
    const allow = sessionIds.has(sessionId)
    sessionIds.delete(sessionId)
    return allow
  }
  return true
}

// --- Reset ---

export function resetCdpProxyState(): void {
  for (const registration of [...cdpProxyRegistrations.values()]) {
    registration.selectionSnapshot = null
    disposeCdpProxyRegistration(registration)
  }
  cdpProxyRegistrations.clear()
  cdpProxyRegistrationsByKey.clear()
  cdpProxyMetrics.registrationsCreated = 0
  cdpProxyMetrics.registrationsReused = 0
  cdpProxyMetrics.upstreamConnects = 0
  cdpProxyMetrics.upstreamReconnects = 0
  cdpProxyMetrics.interceptedClicks = 0
  cdpProxyMetrics.interceptedScrolls = 0
}
