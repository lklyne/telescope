import { describe, it, expect, afterAll } from 'vitest'
import {
  createFrames,
  deleteFrames,
  findFrameTarget,
  getPresence,
  getWorkspace,
  postPresence,
  takeAgentSnapshot,
  takeScreenshot,
  takeSnapshot,
} from './app-client'

const createdFrameIds: string[] = []

afterAll(async () => {
  if (createdFrameIds.length) {
    await deleteFrames(createdFrameIds)
  }
})

describe('frames', () => {
  it('creates a frame and it appears in the workspace', async () => {
    const result = await createFrames([
      {
        url: 'data:text/html,<main><h1>Smoke</h1><button aria-label="Primary action">Click me</button></main>',
        canvasX: 100,
        canvasY: 100,
        presetIndex: 9,
      },
    ])
    expect(result.frameIds).toHaveLength(1)
    createdFrameIds.push(...result.frameIds)

    const workspace = await getWorkspace()
    const frameIds = workspace.entities.filter((e) => e.kind === 'frame').map((e) => e.id)
    expect(frameIds).toContain(result.frameIds[0])
  })

  it('takes a snapshot of a frame', async () => {
    // Wait briefly for the data URL to load
    await new Promise((r) => setTimeout(r, 2_000))
    const snapshot = await takeSnapshot(createdFrameIds[0])
    expect(typeof snapshot.snapshot).toBe('string')
    expect(snapshot.snapshot.length).toBeGreaterThan(0)
  })

  it('takes a structured agent snapshot with @refs and bounds', async () => {
    const snapshot = await takeAgentSnapshot(createdFrameIds[0])
    expect(snapshot.snapshot.frameId).toBe(createdFrameIds[0])
    expect(snapshot.snapshot.nodes.length).toBeGreaterThan(0)
    expect(snapshot.snapshot.nodes[0].ref).toMatch(/^@e\d+$/)
    expect(snapshot.snapshot.nodes.some((node) => node.interactive)).toBe(true)
    const interactiveNode = snapshot.snapshot.nodes.find((node) => node.interactive)
    expect(interactiveNode?.bounds.width).toBeGreaterThan(0)
    expect(interactiveNode?.bounds.height).toBeGreaterThan(0)
  })

  it('resolves targetRef presence through the structured snapshot cache', async () => {
    const snapshot = await takeAgentSnapshot(createdFrameIds[0])
    const targetNode = snapshot.snapshot.nodes.find((node) => node.interactive)
    expect(targetNode).toBeTruthy()

    await postPresence({
      sessionId: 'smoke-agent',
      clientName: 'smoke-agent',
      surface: 'frame',
      phase: 'acting',
      frameId: createdFrameIds[0],
      labelKey: 'find_target',
      targetRef: targetNode.ref,
      targetRefSource: 'telescope',
      targetName: 'Primary action',
    })

    const presence = await getPresence()
    const cursor = presence.cursors.find((item) => item.sessionId === 'smoke-agent')
    expect(cursor?.targetRef).toBe(targetNode.ref)
    expect(cursor?.targetRefSource).toBe('telescope')
    expect(cursor?.targetRect).toEqual(targetNode.bounds)
  })

  it('finds a target by semantic name and returns explicit rect coordinates', async () => {
    const result = await findFrameTarget({
      frameId: createdFrameIds[0],
      name: 'Click me',
    })
    expect(result.target.targetRefSource).toBe('telescope')
    expect(result.target.targetName).toContain('Click me')
    expect(result.target.targetRect.width).toBeGreaterThan(0)
    expect(result.target.frameX).toBeGreaterThan(0)
    expect(result.target.frameY).toBeGreaterThan(0)
  })

  it('prefers explicit frame coordinates over stale target rect state', async () => {
    const snapshot = await takeAgentSnapshot(createdFrameIds[0])
    const targetNode = snapshot.snapshot.nodes.find((node) => node.interactive)
    expect(targetNode).toBeTruthy()

    await postPresence({
      sessionId: 'smoke-agent-coordinates',
      clientName: 'smoke-agent-coordinates',
      surface: 'frame',
      phase: 'acting',
      frameId: createdFrameIds[0],
      labelKey: 'find_target',
      targetRef: targetNode.ref,
      targetRefSource: 'telescope',
      targetName: 'Primary action',
    })

    await postPresence({
      sessionId: 'smoke-agent-coordinates',
      clientName: 'smoke-agent-coordinates',
      surface: 'frame',
      phase: 'acting',
      frameId: createdFrameIds[0],
      labelKey: 'click_target',
      coordinates: { frameX: 12, frameY: 18 },
      targetRef: null,
      targetRefSource: 'agent-browser',
      targetName: null,
    })

    const presence = await getPresence()
    const cursor = presence.cursors.find((item) => item.sessionId === 'smoke-agent-coordinates')
    expect(cursor?.frameX).toBe(12)
    expect(cursor?.frameY).toBe(18)
    expect(cursor?.targetRef).toBeNull()
    expect(cursor?.targetRefSource).toBe('agent-browser')
    expect(cursor?.targetName).toBeNull()
    expect(cursor?.targetRect).toBeNull()
  })

  it('takes a screenshot of a frame', async () => {
    const screenshot = await takeScreenshot(createdFrameIds[0])
    expect(screenshot.mimeType).toBe('image/png')
    expect(screenshot.base64.length).toBeGreaterThan(100)
  })

  it('deletes a frame and it disappears from the workspace', async () => {
    const [frameId] = createdFrameIds.splice(0, 1)
    const result = await deleteFrames([frameId])
    expect(result.deletedFrameIds).toContain(frameId)

    const workspace = await getWorkspace()
    const frameIds = workspace.entities.filter((e) => e.kind === 'frame').map((e) => e.id)
    expect(frameIds).not.toContain(frameId)
  })
})
