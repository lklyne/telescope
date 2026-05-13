import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  createPages,
  deletePages,
  findPageTarget,
  getPresence,
  getWorkspace,
  postPresence,
  takeAgentSnapshot,
  takeScreenshot,
  takeSnapshot,
} from './app-client'
import { assertPersists, assertUndoable } from './test-utils'

const createdPageIds: string[] = []

afterAll(async () => {
  if (createdPageIds.length) {
    await deletePages(createdPageIds)
  }
})

describe('pages', () => {
  it('creates a page and it appears in the workspace', async () => {
    const result = await createPages([
      {
        url: 'data:text/html,<main><h1>Smoke</h1><button aria-label="Primary action">Click me</button></main>',
        canvasX: 100,
        canvasY: 100,
        presetIndex: 9,
      },
    ])
    expect(result.pageIds).toHaveLength(1)
    createdPageIds.push(...result.pageIds)

    const workspace = await getWorkspace()
    const pageIds = workspace.entities.filter((e) => e.kind === 'page').map((e) => e.id)
    expect(pageIds).toContain(result.pageIds[0])
  })

  it('takes a snapshot of a page', async () => {
    // Wait briefly for the data URL to load
    await new Promise((r) => setTimeout(r, 2_000))
    const snapshot = await takeSnapshot(createdPageIds[0])
    expect(typeof snapshot.snapshot).toBe('string')
    expect(snapshot.snapshot.length).toBeGreaterThan(0)
  })

  it('takes a structured agent snapshot with @refs and bounds', async () => {
    const snapshot = await takeAgentSnapshot(createdPageIds[0])
    expect(snapshot.snapshot.pageId).toBe(createdPageIds[0])
    expect(snapshot.snapshot.nodes.length).toBeGreaterThan(0)
    expect(snapshot.snapshot.nodes[0].ref).toMatch(/^@e\d+$/)
    expect(snapshot.snapshot.nodes.some((node) => node.interactive)).toBe(true)
    const interactiveNode = snapshot.snapshot.nodes.find((node) => node.interactive)
    expect(interactiveNode?.bounds.width).toBeGreaterThan(0)
    expect(interactiveNode?.bounds.height).toBeGreaterThan(0)
  })

  it('resolves targetRef presence through the structured snapshot cache', async () => {
    const snapshot = await takeAgentSnapshot(createdPageIds[0])
    const targetNode = snapshot.snapshot.nodes.find((node) => node.interactive)
    expect(targetNode).toBeTruthy()

    await postPresence({
      sessionId: 'smoke-agent',
      clientName: 'smoke-agent',
      surface: 'page',
      phase: 'acting',
      pageId: createdPageIds[0],
      labelKey: 'find_target',
      targetRef: targetNode.ref,
      targetRefSource: 'specular',
      targetName: 'Primary action',
    })

    const presence = await getPresence()
    const cursor = presence.cursors.find((item) => item.sessionId === 'smoke-agent')
    expect(cursor?.targetRef).toBe(targetNode.ref)
    expect(cursor?.targetRefSource).toBe('specular')
    expect(cursor?.targetRect).toEqual(targetNode.bounds)
  })

  it('finds a target by semantic name and returns explicit rect coordinates', async () => {
    const result = await findPageTarget({
      pageId: createdPageIds[0],
      name: 'Click me',
    })
    expect(result.target.targetRefSource).toBe('specular')
    expect(result.target.targetName).toContain('Click me')
    expect(result.target.targetRect.width).toBeGreaterThan(0)
    expect(result.target.pageX).toBeGreaterThan(0)
    expect(result.target.pageY).toBeGreaterThan(0)
  })

  it('prefers explicit page coordinates over stale target rect state', async () => {
    const snapshot = await takeAgentSnapshot(createdPageIds[0])
    const targetNode = snapshot.snapshot.nodes.find((node) => node.interactive)
    expect(targetNode).toBeTruthy()

    await postPresence({
      sessionId: 'smoke-agent-coordinates',
      clientName: 'smoke-agent-coordinates',
      surface: 'page',
      phase: 'acting',
      pageId: createdPageIds[0],
      labelKey: 'find_target',
      targetRef: targetNode.ref,
      targetRefSource: 'specular',
      targetName: 'Primary action',
    })

    await postPresence({
      sessionId: 'smoke-agent-coordinates',
      clientName: 'smoke-agent-coordinates',
      surface: 'page',
      phase: 'acting',
      pageId: createdPageIds[0],
      labelKey: 'click_target',
      coordinates: { pageX: 12, pageY: 18 },
      targetRef: null,
      targetRefSource: 'agent-browser',
      targetName: null,
    })

    const presence = await getPresence()
    const cursor = presence.cursors.find((item) => item.sessionId === 'smoke-agent-coordinates')
    expect(cursor?.pageX).toBe(12)
    expect(cursor?.pageY).toBe(18)
    expect(cursor?.targetRef).toBeNull()
    expect(cursor?.targetRefSource).toBe('agent-browser')
    expect(cursor?.targetName).toBeNull()
    expect(cursor?.targetRect).toBeNull()
  })

  it('takes a screenshot of a page', async () => {
    const screenshot = await takeScreenshot(createdPageIds[0])
    expect(screenshot.mimeType).toBe('image/png')
    expect(screenshot.base64.length).toBeGreaterThan(100)
  })

  it('deletes a page and it disappears from the workspace', async () => {
    const [pageId] = createdPageIds.splice(0, 1)
    const result = await deletePages([pageId])
    expect(result.deletedPageIds).toContain(pageId)

    const workspace = await getWorkspace()
    const pageIds = workspace.entities.filter((e) => e.kind === 'page').map((e) => e.id)
    expect(pageIds).not.toContain(pageId)
  })
})

describe('pages — lifecycle', () => {
  const lifecycleIds: string[] = []

  afterEach(async () => {
    if (lifecycleIds.length) {
      await deletePages(lifecycleIds.splice(0))
    }
  })

  it('persists a created page to disk', async () => {
    await assertPersists(async () => {
      const result = await createPages([
        {
          url: 'data:text/html,<p>persist</p>',
          canvasX: 800,
          canvasY: 100,
          presetIndex: 9,
        },
      ])
      lifecycleIds.push(...result.pageIds)
    })
  })

  it('round-trips a created page through undo/redo', async () => {
    await assertUndoable(async () => {
      const result = await createPages([
        {
          url: 'data:text/html,<p>undoable</p>',
          canvasX: 900,
          canvasY: 100,
          presetIndex: 9,
        },
      ])
      lifecycleIds.push(...result.pageIds)
    })
  })
})
