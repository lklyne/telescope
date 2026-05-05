import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFrames,
  deleteFrames,
  enterFrameFocus,
  exitFrameFocus,
  getFrameFocus,
} from './app-client'

/**
 * Frame focus state machine — ADR 0001.
 *
 * Validates the main-process state through the test HTTP routes.
 * Renderer-side focus ring rendering and webContents focus event wiring
 * require a focused OS window; covered by manual exercise of the spike
 * protocol in docs/plans/blur-spike-protocol.md.
 */

const createdFrameIds: string[] = []

beforeEach(async () => {
  await exitFrameFocus('programmatic')
})

afterEach(async () => {
  await exitFrameFocus('programmatic')
  if (createdFrameIds.length) {
    await deleteFrames(createdFrameIds.splice(0))
  }
})

describe('frame focus state', () => {
  it('starts unfocused', async () => {
    const { frameFocus } = await getFrameFocus()
    expect(frameFocus).toBeNull()
  })

  it('enter sets focus to the frame id', async () => {
    const { frameIds } = await createFrames([{ url: 'about:blank' }])
    createdFrameIds.push(...frameIds)
    await enterFrameFocus(frameIds[0])
    const { frameFocus } = await getFrameFocus()
    expect(frameFocus?.id).toBe(frameIds[0])
    expect(typeof frameFocus?.since).toBe('number')
  })

  it('exit clears focus', async () => {
    const { frameIds } = await createFrames([{ url: 'about:blank' }])
    createdFrameIds.push(...frameIds)
    await enterFrameFocus(frameIds[0])
    await exitFrameFocus('escape')
    const { frameFocus } = await getFrameFocus()
    expect(frameFocus).toBeNull()
  })

  it('switching frames swaps focus atomically', async () => {
    const { frameIds } = await createFrames([
      { url: 'about:blank' },
      { url: 'about:blank' },
    ])
    createdFrameIds.push(...frameIds)
    await enterFrameFocus(frameIds[0])
    await enterFrameFocus(frameIds[1])
    const { frameFocus } = await getFrameFocus()
    expect(frameFocus?.id).toBe(frameIds[1])
  })

  it('deleting the focused frame clears focus', async () => {
    const { frameIds } = await createFrames([{ url: 'about:blank' }])
    await enterFrameFocus(frameIds[0])
    await deleteFrames(frameIds)
    const { frameFocus } = await getFrameFocus()
    expect(frameFocus).toBeNull()
  })

  it('deleting an unfocused frame leaves focus alone', async () => {
    const { frameIds } = await createFrames([
      { url: 'about:blank' },
      { url: 'about:blank' },
    ])
    createdFrameIds.push(frameIds[1])
    await enterFrameFocus(frameIds[1])
    await deleteFrames([frameIds[0]])
    const { frameFocus } = await getFrameFocus()
    expect(frameFocus?.id).toBe(frameIds[1])
  })
})
