import type { IncomingMessage } from 'http'

export interface McpClientSession {
  id: string
  clientName: string
  lastSeenAt: number
}

// --- State ---

export const mcpSessions = new Map<string, McpClientSession>()
export const MCP_SESSION_TIMEOUT_MS = 15_000

// --- Session management ---

export function activeSessions(now = Date.now()): McpClientSession[] {
  const sessions: McpClientSession[] = []
  for (const session of mcpSessions.values()) {
    if (now - session.lastSeenAt <= MCP_SESSION_TIMEOUT_MS) {
      sessions.push(session)
    } else {
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
    const session = mcpSessions.get(headerId)
    if (session) return { sessionId: headerId, session }
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
