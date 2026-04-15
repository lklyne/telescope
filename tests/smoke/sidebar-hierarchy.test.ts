import { afterEach, describe, expect, it } from 'vitest'
import {
  createFrames,
  createGroup,
  deleteFrames,
  getSidebar,
} from './app-client'

const createdFrameIds: string[] = []

async function createFrame(input: { url: string; canvasX: number; canvasY: number; presetIndex?: number }) {
  const result = await createFrames([input])
  createdFrameIds.push(...result.frameIds)
  return result.frameIds[0]
}

async function cleanupFrames() {
  if (!createdFrameIds.length) return
  const frameIds = createdFrameIds.splice(0, createdFrameIds.length)
  await deleteFrames(frameIds)
}

describe('left sidebar hierarchy', () => {
  afterEach(async () => {
    await cleanupFrames()
  })

  it('serializes nested user groups as nested sidebar items', async () => {
    const innerLeft = await createFrame({
      url: 'https://example.com',
      canvasX: 160,
      canvasY: 120,
    })
    const innerRight = await createFrame({
      url: 'https://example.org',
      canvasX: 520,
      canvasY: 120,
    })
    const outerOnly = await createFrame({
      url: 'https://example.net',
      canvasX: 920,
      canvasY: 120,
    })

    const innerGroup = await createGroup([innerLeft, innerRight], 'Inner group')
    const outerGroup = await createGroup([innerLeft, innerRight, outerOnly], 'Outer group')

    const sidebar = await getSidebar()
    const outerItem = sidebar.items.find((item) => item.id === outerGroup.id)
    expect(outerItem).toMatchObject({
      kind: 'group',
      label: 'Outer group',
      entityCount: 3,
    })

    expect(sidebar.items.some((item) => item.id === innerGroup.id)).toBe(false)

    const outerChildren = Array.isArray(outerItem?.children) ? outerItem.children : []
    expect(outerChildren).toHaveLength(2)
    expect(outerChildren[0]).toMatchObject({
      kind: 'group',
      id: innerGroup.id,
      label: 'Inner group',
      entityCount: 2,
    })
    expect(outerChildren[1]).toMatchObject({
      kind: 'frame',
      id: outerOnly,
    })
  })
})
