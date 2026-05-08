import { afterAll, describe, expect, it } from 'vitest'
import {
  createPages,
  deletePages,
  getCdpProxyDebug,
  getPageCdpTarget,
  getPresence,
  getSelection,
  getSelectionOverlayState,
  deselectSelection,
  openMcpSession,
  postPresence,
} from './app-client'
import { waitFor, openWebSocket, closeWebSocket } from './test-utils'

const createdPageIds: string[] = []

afterAll(async () => {
  if (createdPageIds.length) {
    await deletePages(createdPageIds.splice(0))
  }
})

describe('cdp proxy adapter', () => {
  it('reuses a stable proxy url for the same session and page', async () => {
    const { pageIds } = await createPages([
      { url: 'data:text/html,<button>proxy reuse</button>', canvasX: 160, canvasY: 160 },
    ])
    const [pageId] = pageIds
    createdPageIds.push(pageId)

    const first = await waitFor(
      () => getPageCdpTarget(pageId, 'stable-session', 'stable-client'),
      (value) => Boolean(value.webSocketDebuggerUrl),
      'Timed out waiting for first CDP target',
    )
    const second = await waitFor(
      () => getPageCdpTarget(pageId, 'stable-session', 'stable-client'),
      (value) => Boolean(value.webSocketDebuggerUrl),
      'Timed out waiting for reused CDP target',
    )

    const debug = await waitFor(
      () => getCdpProxyDebug(),
      (value) =>
        value.registrations.some((item) => item.pageId === pageId && item.sessionId === 'stable-session') &&
        value.metrics.registrationsReused > 0,
      'Timed out waiting for CDP proxy registration reuse metrics',
      { maxAttempts: 40, intervalMs: 150 },
    )
    const registrations = debug.registrations.filter((item) => item.pageId === pageId && item.sessionId === 'stable-session')
    expect(registrations).toHaveLength(1)
    expect(second.pageId).toBe(first.pageId)
    expect(second.targetId).toBe(first.targetId)
    expect(debug.metrics.registrationsReused).toBeGreaterThan(0)
  })

  it('keeps user selection stable while a proxy client is connected', async () => {
    const { pageIds } = await createPages([
      { url: 'data:text/html,<button>selection target</button>', canvasX: 540, canvasY: 220 },
    ])
    createdPageIds.push(...pageIds)
    const [proxyPageId] = pageIds

    await deselectSelection()

    const beforeSelection = await getSelection()
    expect(beforeSelection.selectedEntityId).toBeUndefined()

    const proxyTarget = await waitFor(
      () => getPageCdpTarget(proxyPageId, 'selection-session', 'selection-client'),
      (value) => Boolean(value.webSocketDebuggerUrl),
      'Timed out waiting for proxy page target',
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
      (value) => value.pages.find((page) => page.pageId === proxyPageId)?.interactive === true,
      'Timed out waiting for proxy page overlay to become interactive',
    )
    expect(overlayWhileConnected.pages.find((page) => page.pageId === proxyPageId)?.interactive).toBe(true)

    await closeWebSocket(socket)

    const afterSelection = await waitFor(
      () => getSelection(),
      (value) => value.selectedEntityId === undefined,
      'Timed out waiting for selection to remain clear after proxy client disconnect',
    )
    expect(afterSelection.selectedEntityId).toBeUndefined()

    const overlayAfterClose = await waitFor(
      () => getSelectionOverlayState(),
      (value) => value.pages.find((page) => page.pageId === proxyPageId)?.interactive === false,
      'Timed out waiting for proxy page overlay to clear after disconnect',
    )
    expect(overlayAfterClose.pages.find((page) => page.pageId === proxyPageId)?.interactive).toBe(false)
  })

  it('departs the presence cursor when the CDP transport closes', async () => {
    const { pageIds } = await createPages([
      { url: 'data:text/html,<button>crash target</button>', canvasX: 880, canvasY: 220 },
    ])
    createdPageIds.push(...pageIds)
    const [pageId] = pageIds
    const sessionId = 'crash-session'
    const clientName = 'crash-client'

    await openMcpSession(sessionId, clientName)
    await postPresence({
      sessionId,
      clientName,
      eventType: 'act',
      surface: 'page',
      phase: 'acting',
      pageId,
      coordinates: { pageX: 40, pageY: 40 },
      labelKey: 'click_target',
      taskLabel: 'crash task',
    })

    const seeded = await getPresence()
    expect(seeded.cursors.find((cursor) => cursor.sessionId === sessionId)).toBeDefined()

    const proxyTarget = await waitFor(
      () => getPageCdpTarget(pageId, sessionId, clientName),
      (value) => Boolean(value.webSocketDebuggerUrl),
      'Timed out waiting for crash-session proxy page target',
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
