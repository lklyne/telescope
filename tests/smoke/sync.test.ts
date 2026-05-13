/**
 * Forward/reverse sync smoke tests.
 *
 * Guards the diff-sync pipeline described in src/main/runtime/CLAUDE.md:
 *   mutation → runtime arrays → requestDocSync() → syncRuntimeToDoc
 *   undo     → afterTransaction → syncDocToRuntime (must NOT echo)
 *
 * Mutation-verified by:
 *   - removing the `'user'` transaction origin in syncRuntimeToDoc so the
 *     transaction count assertion below counts the doc transaction PLUS the
 *     echo from the undo observer (it goes from 1 to 2).
 *   - dropping `withSuppressedDocSync()` around the undo-path sync, which
 *     makes the "undo doesn't re-trigger forward sync" assertion fail.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTextEntities,
  deleteTextEntities,
  getTextEntities,
  resetSmokeState,
  undoWorkspace,
} from './app-client'
import { observeYDocTransactions, wait } from './test-utils'

async function cleanupTextEntities(): Promise<void> {
  const { textEntities } = await getTextEntities()
  if (textEntities.length) {
    await deleteTextEntities(textEntities.map((t) => t.id))
    await wait(50)
  }
}

describe('forward/reverse sync', () => {
  beforeEach(async () => {
    await resetSmokeState()
    await cleanupTextEntities()
  })

  afterEach(async () => {
    await cleanupTextEntities()
  })

  it('a single text-entity create produces exactly one Y.Doc transaction', async () => {
    const count = await observeYDocTransactions(async () => {
      await createTextEntities([{ canvasX: 0, canvasY: 0, text: 'one tx' }])
    })
    // Expect exactly 1: the forward-sync transact wrapped in 'user' origin.
    // Two means a forward-sync echo or duplicate scheduling.
    expect(count).toBe(1)
  })

  it('undo does not re-trigger a forward sync (no echo)', async () => {
    const { ids } = await createTextEntities([
      { canvasX: 0, canvasY: 0, text: 'echo me' },
    ])
    await wait(50)

    const count = await observeYDocTransactions(async () => {
      await undoWorkspace()
    })
    // Undo applies a Y.Doc transaction via UndoManager (origin = undoManager).
    // The undo observer's reverse sync must run inside withSuppressedDocSync,
    // so it must NOT add a second 'user' transaction.
    expect(count).toBe(1)
    // Runtime reflects the undo (entity gone).
    const after = await getTextEntities()
    expect(after.textEntities.some((t) => t.id === ids[0])).toBe(false)
  })

  it('mutation count stays bounded across rapid mutations', async () => {
    // Catches a runaway feedback loop: if forward sync were re-triggering
    // itself (e.g. by writing inside an afterTransaction handler with no
    // suppression), the count for two creates would balloon.
    await wait(100)
    const count = await observeYDocTransactions(async () => {
      await createTextEntities([{ canvasX: 0, canvasY: 0, text: 'a' }])
      await createTextEntities([{ canvasX: 100, canvasY: 0, text: 'b' }])
    })
    // Strict upper bound: forward sync (1) per mutation + possibly one
    // workspace-metadata sync when the doc tab/runtime tab disagree. More
    // than that means an echo. Lower bound: at minimum each mutation
    // produced one transaction.
    expect(count).toBeGreaterThanOrEqual(2)
    expect(count).toBeLessThanOrEqual(3)
  })
})
