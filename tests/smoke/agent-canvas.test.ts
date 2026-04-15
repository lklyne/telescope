import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeMcpSession,
  getPresence,
  openMcpSession,
  postPresence,
  resetSmokeState,
} from './app-client'
import { waitFor } from './test-utils'

function cursorFor(sessionId: string, cursors: Awaited<ReturnType<typeof getPresence>>['cursors']) {
  return cursors.find((cursor) => cursor.sessionId === sessionId)
}

async function seedCursor(sessionId: string, clientName: string): Promise<void> {
  await postPresence({
    sessionId,
    clientName,
    eventType: 'act',
    surface: 'canvas',
    phase: 'acting',
    coordinates: { canvasX: 200, canvasY: 200 },
    labelKey: 'scan_workspace',
    taskLabel: 'smoke task',
  })
}

describe('agent canvas presence cleanup', () => {
  beforeEach(async () => {
    await resetSmokeState()
  })

  afterAll(async () => {
    await resetSmokeState()
  })

  it('departs and removes the cursor after /mcp/session/close', async () => {
    const sessionId = 'close-session'
    await openMcpSession(sessionId, 'close-client')
    await seedCursor(sessionId, 'close-client')

    const seeded = await getPresence()
    expect(cursorFor(sessionId, seeded.cursors)).toBeDefined()

    await closeMcpSession(sessionId)

    await waitFor(
      () => getPresence(),
      (value) => cursorFor(sessionId, value.cursors)?.activity === 'departing',
      'Timed out waiting for cursor to enter departing state',
      { maxAttempts: 10, intervalMs: 100 },
    )

    await waitFor(
      () => getPresence(),
      (value) => cursorFor(sessionId, value.cursors) === undefined,
      'Timed out waiting for cursor to be removed after close',
      { maxAttempts: 30, intervalMs: 100 },
    )
  })

  it('removes the cursor once the MCP session expires without heartbeats', async () => {
    const sessionId = 'idle-session'
    await openMcpSession(sessionId, 'idle-client')
    await seedCursor(sessionId, 'idle-client')

    const seeded = await getPresence()
    expect(cursorFor(sessionId, seeded.cursors)).toBeDefined()

    // MCP_SESSION_TIMEOUT_MS is 15s; the expiry sweep runs every ~2s and
    // triggers a 1.5s departure grace before removal. Wait up to ~22s.
    await waitFor(
      () => getPresence(),
      (value) => cursorFor(sessionId, value.cursors) === undefined,
      'Timed out waiting for idle MCP session cursor to be removed',
      { maxAttempts: 110, intervalMs: 200 },
    )
  }, 30_000)
})
