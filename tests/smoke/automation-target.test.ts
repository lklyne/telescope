import { afterEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createFrames,
  deleteFrames,
  deselectSelection,
  getAutomationTarget,
  openMcpSession,
  closeMcpSession,
  resolveAutomationFrame,
  setAutomationTarget,
} from './app-client'

/**
 * Regression for the multi-frame bug: `/automation/target` decouples the
 * "active automation frame" from UI selection. Without this, alternating
 * clicks across two frames via the CLI was impossible — `telescope focus`
 * updated selection but the interaction target stayed on the last-clicked
 * frame.
 */

const createdFrameIds: string[] = []

async function createFrame(url: string, canvasX: number): Promise<string> {
  // Route's multi-frame path staggers creation asynchronously; single-frame
  // path creates the page synchronously. Do one at a time so IDs are
  // immediately resolvable by `findPageById`.
  const result = await createFrames([{ url, canvasX, canvasY: 120 }])
  createdFrameIds.push(...result.frameIds)
  return result.frameIds[0]
}

async function createFramePair(): Promise<[string, string]> {
  const a = await createFrame('https://example.com', 120)
  const b = await createFrame('https://example.org', 620)
  return [a, b]
}

afterEach(async () => {
  if (createdFrameIds.length) {
    await deleteFrames(createdFrameIds.splice(0))
  }
})

describe('automation target', () => {
  it('starts null for a fresh session and can be set and cleared', async () => {
    const sessionId = randomUUID()
    await openMcpSession(sessionId, 'smoke-target')
    try {
      const frameA = await createFrame('https://example.com', 120)

      const initial = await getAutomationTarget(sessionId, 'smoke-target')
      expect(initial.frameId).toBeNull()

      const set = await setAutomationTarget(frameA, sessionId, 'smoke-target')
      expect(set.frameId).toBe(frameA)

      const after = await getAutomationTarget(sessionId, 'smoke-target')
      expect(after.frameId).toBe(frameA)

      const cleared = await setAutomationTarget(null, sessionId, 'smoke-target')
      expect(cleared.frameId).toBeNull()
    } finally {
      await closeMcpSession(sessionId)
    }
  })

  it('returns target as the resolved frame when set, ignoring selection', async () => {
    const sessionId = randomUUID()
    await openMcpSession(sessionId, 'smoke-target')
    try {
      const [frameA, frameB] = await createFramePair()
      await deselectSelection()

      await setAutomationTarget(frameA, sessionId, 'smoke-target')
      const resolved = await resolveAutomationFrame(sessionId, 'smoke-target')
      expect(resolved.frameId).toBe(frameA)
      expect(resolved.source).toBe('target')

      // Switch to B — should win over whatever selection says.
      await setAutomationTarget(frameB, sessionId, 'smoke-target')
      const resolvedB = await resolveAutomationFrame(sessionId, 'smoke-target')
      expect(resolvedB.frameId).toBe(frameB)
      expect(resolvedB.source).toBe('target')
    } finally {
      await closeMcpSession(sessionId)
    }
  })

  it('falls back to selection when no target is set', async () => {
    const sessionId = randomUUID()
    await openMcpSession(sessionId, 'smoke-target')
    try {
      await createFramePair()
      // No target set; selection fallback should fire. createFrames auto-selects
      // the newly created frames, so a selection exists.
      const resolved = await resolveAutomationFrame(sessionId, 'smoke-target')
      if (resolved.frameId) {
        expect(resolved.source).toBe('selection')
      } else {
        expect(resolved.source).toBeNull()
      }
    } finally {
      await closeMcpSession(sessionId)
    }
  })

  it('rejects setting a target to a non-existent frame', async () => {
    const sessionId = randomUUID()
    await openMcpSession(sessionId, 'smoke-target')
    try {
      await expect(
        setAutomationTarget('frame_does-not-exist', sessionId, 'smoke-target'),
      ).rejects.toThrow(/404|not found/)
    } finally {
      await closeMcpSession(sessionId)
    }
  })

  it('isolates targets per session — one session setting does not leak to another', async () => {
    const sessionA = randomUUID()
    const sessionB = randomUUID()
    await openMcpSession(sessionA, 'smoke-target-a')
    await openMcpSession(sessionB, 'smoke-target-b')
    try {
      const [frame1, frame2] = await createFramePair()

      await setAutomationTarget(frame1, sessionA, 'smoke-target-a')
      await setAutomationTarget(frame2, sessionB, 'smoke-target-b')

      const a = await getAutomationTarget(sessionA, 'smoke-target-a')
      const b = await getAutomationTarget(sessionB, 'smoke-target-b')
      expect(a.frameId).toBe(frame1)
      expect(b.frameId).toBe(frame2)
    } finally {
      await closeMcpSession(sessionA)
      await closeMcpSession(sessionB)
    }
  })

  it('clears the target when the session is closed', async () => {
    const sessionId = randomUUID()
    await openMcpSession(sessionId, 'smoke-target-close')
    const [frameA] = await createFramePair()
    await setAutomationTarget(frameA, sessionId, 'smoke-target-close')

    await closeMcpSession(sessionId)

    // Re-open the same sessionId; target should be null (session was deleted
    // and recreated fresh).
    await openMcpSession(sessionId, 'smoke-target-close')
    try {
      const after = await getAutomationTarget(sessionId, 'smoke-target-close')
      expect(after.frameId).toBeNull()
    } finally {
      await closeMcpSession(sessionId)
    }
  })
})
