import type { Server, ServerResponse } from 'http'

// ── McpConnectionStatus ──────────────────────────────────────────────────────

export interface McpConnectionStatus {
  healthy: boolean
  appServerRunning: boolean
  discoveryFilePresent: boolean
  mcpClientConnected: boolean
  activeClientCount: number
  lastClientSeenAt: string | null
}

// ── Status listener bus ──────────────────────────────────────────────────────
// app-control-server.ts registers the status getter once at startup;
// routes call notifyStatusListeners() without needing to import the server.

const statusListeners = new Set<(status: McpConnectionStatus) => void>()
let _getStatus: (() => McpConnectionStatus) | null = null

export function _registerGetStatus(fn: () => McpConnectionStatus): void {
  _getStatus = fn
}

export function notifyStatusListeners(): void {
  if (!_getStatus) return
  const status = _getStatus()
  for (const listener of statusListeners) {
    listener(status)
  }
}

export function onMcpConnectionStatusChanged(
  listener: (status: McpConnectionStatus) => void,
): () => void {
  statusListeners.add(listener)
  if (_getStatus) listener(_getStatus())
  return () => {
    statusListeners.delete(listener)
  }
}

// ── Server address ───────────────────────────────────────────────────────────
// app-control-server.ts calls _setServerRef after starting/stopping the server.

let _serverRef: Server | null = null

export function _setServerRef(s: Server | null): void {
  _serverRef = s
}

export function getServerAddress(): ReturnType<Server['address']> {
  return _serverRef?.address() ?? null
}

// ── Response helpers ─────────────────────────────────────────────────────────

export function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}
