import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  APP_CONTROL_DISCOVERY_FILE,
  APP_CONTROL_VERSION,
} from '../../shared/constants'

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

interface DiscoveryPayload {
  port: number
  secret: string
  version: string
}

function discoveryFilePath(): string {
  return join(tmpdir(), APP_CONTROL_DISCOVERY_FILE)
}

function loadDiscovery(): DiscoveryPayload {
  try {
    const payload = JSON.parse(
      readFileSync(discoveryFilePath(), 'utf8'),
    ) as DiscoveryPayload
    if (payload.version !== APP_CONTROL_VERSION) {
      throw new Error(
        `App control API version mismatch. Expected ${APP_CONTROL_VERSION}, got ${payload.version}.`,
      )
    }
    return payload
  } catch (error) {
    throw new Error(
      `Telescope app is not available. Launch the app first. ${error instanceof Error ? error.message : ''}`.trim(),
    )
  }
}

// ---------------------------------------------------------------------------
// Session identity
// ---------------------------------------------------------------------------

function resolveSessionId(): string {
  // Explicit override takes priority
  if (process.env.TELESCOPE_SESSION_ID) return process.env.TELESCOPE_SESSION_ID

  // Fixed session file — all CLI calls share one session ID.
  // Server-side 10s expiry clears the cursor after the last call.
  const sessionFile = join(tmpdir(), 'telescope-session.id')
  try {
    return readFileSync(sessionFile, 'utf8').trim()
  } catch {
    const id = randomUUID()
    try { writeFileSync(sessionFile, id, 'utf8') } catch { /* best-effort */ }
    return id
  }
}

export const sessionId = resolveSessionId()
let clientName = 'telescope-mcp'

export function setClientName(name: string): void {
  clientName = name
}

export function getClientName(): string {
  return clientName
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

export async function callApp<T>(path: string, init?: RequestInit): Promise<T> {
  const discovery = loadDiscovery()
  const response = await fetch(`http://127.0.0.1:${discovery.port}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-telescope-secret': discovery.secret,
      'x-telescope-session-id': sessionId,
      'x-telescope-client-name': clientName,
      ...(init?.headers ?? {}),
    },
  })
  const payload = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`)
  }
  return payload
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export async function notifySessionState(
  path: '/mcp/session/open' | '/mcp/session/ping' | '/mcp/session/close',
): Promise<void> {
  try {
    await callApp(path, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        clientName,
      }),
    })
  } catch {
    // Ignore bookkeeping failures so the caller remains usable.
  }
}

let heartbeatTimer: NodeJS.Timeout | null = null

export function startHeartbeat(): void {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    void notifySessionState('/mcp/session/ping')
  }, 5_000)
}

export function stopHeartbeat(): void {
  if (!heartbeatTimer) return
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}
