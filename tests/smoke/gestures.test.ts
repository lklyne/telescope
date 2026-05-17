import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  beginInteraction,
  cancelActiveInteraction,
  cancelInteraction,
  commitInteraction,
  createPages,
  deletePages,
  getInteractionMode,
  resetInteraction,
  type CancelReason,
  type InteractionToken,
  type TryEnterInput,
} from './app-client'

/**
 * Per-mode begin/commit/cancel matrix for the InteractionController.
 * Spec docs/interaction-layer.md §9.
 *
 * Tests validate the controller's state machine via the test HTTP routes.
 */

const createdPageIds: string[] = []

async function createPage(): Promise<string> {
  const result = await createPages([{ url: 'https://example.com', canvasX: 120, canvasY: 120 }])
  createdPageIds.push(...result.pageIds)
  return result.pageIds[0]
}

async function cleanupPages() {
  if (!createdPageIds.length) return
  await deletePages(createdPageIds.splice(0))
}

beforeEach(async () => {
  await resetInteraction()
})

afterEach(async () => {
  await resetInteraction()
  await cleanupPages()
})

const modes: Array<{ label: string; build: () => Promise<TryEnterInput> | TryEnterInput }> = [
  { label: 'panning', build: () => ({ kind: 'panning' }) },
  { label: 'marquee', build: () => ({ kind: 'marquee' }) },
  {
    label: 'dragging-entities',
    build: async () => ({ kind: 'dragging-entities', entityIds: [await createPage()] }),
  },
  {
    label: 'resizing-entity',
    build: async () => ({ kind: 'resizing-entity', target: { kind: 'page', id: await createPage() } }),
  },
  {
    label: 'editing-entity',
    build: async () => ({ kind: 'editing-entity', entityId: await createPage() }),
  },
  {
    label: 'dragging-edge',
    build: async () => ({
      kind: 'dragging-edge',
      from: { kind: 'page', id: await createPage() },
      fromSide: 'right',
    }),
  },
]

describe('InteractionController state machine', () => {
  it('starts idle', async () => {
    const { mode } = await getInteractionMode()
    expect(mode.kind).toBe('idle')
  })

  for (const { label, build } of modes) {
    describe(`mode: ${label}`, () => {
      it('tryEnter → commit returns to idle', async () => {
        const input = await build()
        const token = await beginInteraction(input)
        expect('refused' in token).toBe(false)
        const t = token as InteractionToken
        const { mode } = await getInteractionMode()
        expect(mode.kind).not.toBe('idle')
        await commitInteraction(t)
        const after = await getInteractionMode()
        expect(after.mode.kind).toBe('idle')
      })

      const reasons: CancelReason[] = ['blur', 'escape', 'undo', 'tab-switch', 'external']
      for (const reason of reasons) {
        it(`tryEnter → cancel(${reason}) returns to idle`, async () => {
          const input = await build()
          const token = await beginInteraction(input)
          const t = token as InteractionToken
          await cancelInteraction(t, reason)
          const after = await getInteractionMode()
          expect(after.mode.kind).toBe('idle')
        })
      }

      it('tryEnter → cancelActive returns to idle', async () => {
        const input = await build()
        await beginInteraction(input)
        await cancelActiveInteraction('external')
        const after = await getInteractionMode()
        expect(after.mode.kind).toBe('idle')
      })
    })
  }

  it('refuses concurrent tryEnter while a gesture is active', async () => {
    await beginInteraction({ kind: 'panning' })
    const second = await beginInteraction({ kind: 'marquee' })
    expect('refused' in second).toBe(true)
  })

  it('cancel with stale token is a no-op', async () => {
    const a = (await beginInteraction({ kind: 'panning' })) as InteractionToken
    await commitInteraction(a)
    // Cancel the now-stale token; controller should not throw or affect state.
    await cancelInteraction(a, 'external')
    const after = await getInteractionMode()
    expect(after.mode.kind).toBe('idle')
  })

})
