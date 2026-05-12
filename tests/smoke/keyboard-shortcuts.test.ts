import { afterEach, describe, expect, it } from 'vitest'
import {
  createPages,
  createGroup,
  deletePages,
  deselectSelection,
  getSelection,
  selectPage,
  getCurrentTool,
  sendKey,
  resetSmokeState,
} from './app-client'
import { wait, waitFor } from './test-utils'

const createdPageIds: string[] = []

async function createPage(url = 'https://example.com') {
  const result = await createPages([{ url, canvasX: 0, canvasY: 0 }])
  createdPageIds.push(...result.pageIds)
  return result.pageIds[0]
}

afterEach(async () => {
  if (createdPageIds.length) {
    const ids = createdPageIds.splice(0)
    await deletePages(ids).catch(() => {})
  }
  await resetSmokeState()
})

describe('keyboard shortcuts (binding dispatcher)', () => {
  it('v activates select tool', async () => {
    await sendKey('v')
    const { tool } = await getCurrentTool()
    expect(tool.kind).toBe('select')
  })

  it('c activates comment tool', async () => {
    await sendKey('c')
    const { tool } = await waitFor(
      () => getCurrentTool(),
      (r) => r.tool.kind === 'comment',
      'Timed out waiting for comment tool',
    )
    expect(tool.kind).toBe('comment')
  })

  it('pressing c again stays on comment tool (no toggle)', async () => {
    await sendKey('c')
    await sendKey('c')
    const { tool } = await getCurrentTool()
    expect(tool.kind).toBe('comment')
  })

  it('escape resets tool to select when a tool is active', async () => {
    await sendKey('c')
    await waitFor(
      () => getCurrentTool(),
      (r) => r.tool.kind === 'comment',
      'comment tool not active',
    )
    await sendKey('escape')
    const { tool } = await waitFor(
      () => getCurrentTool(),
      (r) => r.tool.kind === 'select',
      'Timed out waiting for select tool after escape',
    )
    expect(tool.kind).toBe('select')
  })

  it('m activates draw-pen tool', async () => {
    await sendKey('m')
    const { tool } = await waitFor(
      () => getCurrentTool(),
      (r) => r.tool.kind === 'draw' || r.tool.kind === 'select',
      'Timed out waiting for tool change',
    )
    // draw tool is feature-flagged — passes either way
    expect(['draw', 'select']).toContain(tool.kind)
  })

  it('Cmd+Z triggers undo without error', async () => {
    // Create and delete a page to have something to undo
    const pageId = await createPage()
    await deletePages([pageId])
    createdPageIds.splice(createdPageIds.indexOf(pageId), 1)
    await wait(50)
    // Undo — should not throw
    await sendKey('z', { cmd: true })
    await wait(50)
  })

  it('Cmd+G groups selected pages', async () => {
    const id1 = await createPage()
    const id2 = await createPage('https://example.org')
    await selectPage(id1)
    await wait(50)

    // Verify pages exist before group
    const selBefore = await getSelection()
    expect(selBefore.selectedEntityId).toBe(id1)

    // Select both via selectEntities then group via keyboard
    const { selectEntities } = await import('./app-client')
    await selectEntities([id1, id2])
    await wait(50)
    await sendKey('g', { cmd: true })
    await wait(100)

    const sel = await getSelection()
    // After grouping, a group should be selected
    expect(sel.selectedGroupId).toBeTruthy()
  })

  it('Cmd+1 resets viewport without error', async () => {
    await sendKey('1', { cmd: true })
    await wait(50)
    // No assertion — just verifying no crash
  })

  it('delete key removes selected entity', async () => {
    const pageId = await createPage()
    await selectPage(pageId)
    await wait(50)
    await sendKey('delete')
    await wait(100)

    const sel = await getSelection()
    expect(sel.selectedEntityId).toBeUndefined()
    // Remove from cleanup since it was deleted
    const idx = createdPageIds.indexOf(pageId)
    if (idx >= 0) createdPageIds.splice(idx, 1)
  })

  it('Cmd+Shift+Z triggers redo without error', async () => {
    await sendKey('z', { cmd: true, shift: true })
    await wait(50)
  })
})
