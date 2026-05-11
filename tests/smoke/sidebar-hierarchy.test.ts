import { afterEach, describe, expect, it } from 'vitest'
import {
  createPages,
  createGroup,
  deletePages,
  getSidebar,
} from './app-client'

const createdPageIds: string[] = []

async function createPage(input: { url: string; canvasX: number; canvasY: number; presetIndex?: number }) {
  const result = await createPages([input])
  createdPageIds.push(...result.pageIds)
  return result.pageIds[0]
}

async function cleanupPages() {
  if (!createdPageIds.length) return
  const pageIds = createdPageIds.splice(0, createdPageIds.length)
  await deletePages(pageIds)
}

describe('left sidebar hierarchy', () => {
  afterEach(async () => {
    await cleanupPages()
  })

  it('serializes nested user groups as nested sidebar items', async () => {
    const innerLeft = await createPage({
      url: 'https://example.com',
      canvasX: 160,
      canvasY: 120,
    })
    const innerRight = await createPage({
      url: 'https://example.org',
      canvasX: 520,
      canvasY: 120,
    })
    const outerOnly = await createPage({
      url: 'https://example.net',
      canvasX: 920,
      canvasY: 120,
    })

    const innerGroup = await createGroup([innerLeft, innerRight], 'Inner group')
    const outerGroup = await createGroup([innerLeft, innerRight, outerOnly], 'Outer group')

    const sidebar = await getSidebar()
    // All three entities are pages — the outer group is a pure-pages group, so
    // it only appears in the Pages section per ADR 0006.
    const pagesSection = sidebar.sections.pages
    const outerItem = pagesSection.find((item) => item.id === outerGroup.id)
    expect(outerItem).toMatchObject({
      kind: 'group',
      label: 'Outer group',
      entityCount: 3,
    })

    expect(pagesSection.some((item) => item.id === innerGroup.id)).toBe(false)
    expect(sidebar.sections.notes.some((item) => item.id === outerGroup.id)).toBe(false)

    const outerChildren = Array.isArray(outerItem?.children) ? outerItem.children : []
    expect(outerChildren).toHaveLength(2)
    expect(outerChildren[0]).toMatchObject({
      kind: 'group',
      id: innerGroup.id,
      label: 'Inner group',
      entityCount: 2,
    })
    expect(outerChildren[1]).toMatchObject({
      kind: 'page',
      id: outerOnly,
    })
  })
})
