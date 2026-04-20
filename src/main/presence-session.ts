import type { IncomingMessage } from 'http'
import { endAutomationInteractiveFrame } from './runtime/overlay-manager'

export interface McpClientSession {
  id: string
  clientName: string
  lastSeenAt: number
  /**
   * Frame this session is driving via the automation API. Decoupled from UI
   * selection so CLI-driven agents don't trample on what the user is clicking.
   * Set via `POST /automation/target`; cleared on session close or timeout.
   */
  activeAutomationFrameId?: string | null
}

// --- State ---

export const mcpSessions = new Map<string, McpClientSession>()
export const MCP_SESSION_TIMEOUT_MS = 15_000

// --- Session management ---

export function releaseSessionAutomationFrame(session: McpClientSession): void {
  if (session.activeAutomationFrameId) {
    endAutomationInteractiveFrame(session.activeAutomationFrameId)
    session.activeAutomationFrameId = null
  }
}

export function activeSessions(now = Date.now()): McpClientSession[] {
  const sessions: McpClientSession[] = []
  for (const session of mcpSessions.values()) {
    if (now - session.lastSeenAt <= MCP_SESSION_TIMEOUT_MS) {
      sessions.push(session)
    } else {
      releaseSessionAutomationFrame(session)
      mcpSessions.delete(session.id)
    }
  }
  return sessions
}

export function resolveSession(
  request: IncomingMessage,
  body?: Record<string, unknown>,
): { sessionId: string; session: McpClientSession } | null {
  const headerId = request.headers['x-telescope-session-id'] as string | undefined
  const headerClientName = request.headers['x-telescope-client-name'] as string | undefined
  if (headerId) {
    const existing = mcpSessions.get(headerId)
    if (existing) {
      existing.lastSeenAt = Date.now()
      if (headerClientName) existing.clientName = headerClientName
      return { sessionId: headerId, session: existing }
    }
    const nextSession = {
      id: headerId,
      clientName: headerClientName ?? headerId,
      lastSeenAt: Date.now(),
    }
    mcpSessions.set(headerId, nextSession)
    return { sessionId: headerId, session: nextSession }
  }
  const bodySessionId = typeof body?.sessionId === 'string' ? body.sessionId : undefined
  const bodyClientName = typeof body?.clientName === 'string' ? body.clientName : undefined
  if (bodySessionId) {
    const existing = mcpSessions.get(bodySessionId)
    if (existing) {
      existing.lastSeenAt = Date.now()
      if (bodyClientName) existing.clientName = bodyClientName
      return { sessionId: bodySessionId, session: existing }
    }
    const nextSession = {
      id: bodySessionId,
      clientName: bodyClientName ?? bodySessionId,
      lastSeenAt: Date.now(),
    }
    mcpSessions.set(bodySessionId, nextSession)
    return { sessionId: bodySessionId, session: nextSession }
  }
  const active = activeSessions()
  if (active.length === 0) return null
  const session = active.reduce((a, b) => (a.lastSeenAt >= b.lastSeenAt ? a : b))
  return { sessionId: session.id, session }
}
