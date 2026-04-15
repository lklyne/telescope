import { afterAll, describe, expect, it } from 'vitest'
import {
  createFrames,
  deleteFrames,
  getCdpProxyDebug,
  getFrameCdpTarget,
  getPresence,
  getSelection,
  getSelectionOverlayState,
  deselectSelection,
  openMcpSession,
  postPresence,
} from './app-client'
import { waitFor, openWebSocket, closeWebSocket } from './test-utils'

const createdFrameIds: string[] = []

afterAll(async () => {
  if (createdFrameIds.length) {
    await deleteFrames(createdFrameIds.splice(0))
  }
})

describe('cdp proxy adapter', () => {
  it('reuses a stable proxy url for the same session and frame', async () => {
    const { frameIds } = await createFrames([
      { url: 'data:text/html,<button>proxy reuse</button>', canvasX: 160, canvasY: 160 },
    ])
    const [frameId] = frameIds
    createdFrameIds.push(frameId)

    const first = await waitFor(
      () => getFrameCdpTarget(frameId, 'stable-session', 'stable-client'),
      (value) => Boolean(value.webSocketDebuggerUrl),
      'Timed out waiting for first CDP target',
    )
    const second = await waitFor(
      () => getFrameCdpTarget(frameId, 'stable-session', 'stable-client'),
      (value) => Boolean(value.webSocketDebuggerUrl),
      'Timed out waiting for reused CDP target',
    )

    const debug = await waitFor(
      () => getCdpProxyDebug(),
      (value) =>
        value.registrations.some((item) => item.frameId === frameId && item.sessionId === 'stable-session') &&
        value.metrics.registrationsReused > 0,
      'Timed out waiting for CDP proxy registration reuse metrics',
      { maxAttempts: 40, intervalMs: 150 },
    )
    const registrations = debug.registrations.filter((item) => item.frameId === frameId && item.sessionId === 'stable-session')
    expect(registrations).toHaveLength(1)
    expect(second.frameId).toBe(first.frameId)
    expect(second.targetId).toBe(first.targetId)
    expect(debug.metrics.registrationsReused).toBeGreaterThan(0)
  })

  it('keeps user selection stable while a proxy client is connected', async () => {
    const { frameIds } = await createFrames([
      { url: 'data:text/html,<button>selection target</button>', canvasX: 540, canvasY: 220 },
    ])
    createdFrameIds.push(...frameIds)
    const [proxyFrameId] = frameIds

    await deselectSelection()

    const beforeSelection = await getSelection()
    expect(beforeSelection.selectedEntityId).toBeUndefined()

    const proxyTarget = await waitFor(
      () => getFrameCdpTarget(proxyFrameId, 'selection-session', 'selection-client'),
      (value) => Boolean(value.webSocketDebuggerUrl),
      'Timed out waiting for proxy frame target',
    )
    const socket = await openWebSocket(proxyTarget.webSocketDebuggerUrl)

    const whileConnectedSelection = await waitFor(
      () => getSelection(),
      (value) => value.selectedEntityId === undefined,
      'Timed out waiting for selection to remain clear while proxy client is connected',
    )
    expect(whileConnectedSelection.selectedEntityId).toBeUndefined()

    const overlayWhileConnected = await waitFor(
      () => getSelectionOverlayState(),
      (value) => value.pages.find((page) => page.frameId === proxyFrameId)?.interactive === true,
      'Timed out waiting for proxy frame overlay to become interactive',
    )
    expect(overlayWhileConnected.pages.find((page) => page.frameId === proxyFrameId)?.interactive).toBe(true)

    await closeWebSocket(socket)

    const afterSelection = await waitFor(
      () => getSelection(),
      (value) => value.selectedEntityId === undefined,
      'Timed out waiting for selection to remain clear after proxy client disconnect',
    )
    expect(afterSelection.selectedEntityId).toBeUndefined()

    const overlayAfterClose = await waitFor(
      () => getSelectionOverlayState(),
      (value) => value.pages.find((page) => page.frameId === proxyFrameId)?.interactive === false,
      'Timed out waiting for proxy frame overlay to clear after disconnect',
    )
    expect(overlayAfterClose.pages.find((page) => page.frameId === proxyFrameId)?.interactive).toBe(false)
  })

  it('departs the presence cursor when the CDP transport closes', async () => {
    const { frameIds } = await createFrames([
      { url: 'data:text/html,<button>crash target</button>', canvasX: 880, canvasY: 220 },
    ])
    createdFrameIds.push(...frameIds)
    const [frameId] = frameIds
    const sessionId = 'crash-session'
    const clientName = 'crash-client'

    await openMcpSession(sessionId, clientName)
    await postPresence({
      sessionId,
      clientName,
      eventType: 'act',
      surface: 'frame',
      phase: 'acting',
      frameId,
      coordinates: { frameX: 40, frameY: 40 },
      labelKey: 'click_target',
      taskLabel: 'crash task',
    })

    const seeded = await getPresence()
    expect(seeded.cursors.find((cursor) => cursor.sessionId === sessionId)).toBeDefined()

    const proxyTarget = await waitFor(
      () => getFrameCdpTarget(frameId, sessionId, clientName),
      (value) => Boolean(value.webSocketDebuggerUrl),
      'Timed out waiting for crash-session proxy frame target',
    )
    const socket = await openWebSocket(proxyTarget.webSocketDebuggerUrl)
    await closeWebSocket(socket)

    await waitFor(
      () => getPresence(),
      (value) => value.cursors.find((cursor) => cursor.sessionId === sessionId) === undefined,
      'Timed out waiting for presence cursor to depart after CDP transport close',
      { maxAttempts: 30, intervalMs: 100 },
    )
  })
})
