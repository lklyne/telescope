/**
 * Persistence smoke tests.
 *
 * Covers the autosave + .canvas-file path in src/main/runtime/workspace-*.ts.
 * Each test mutates the workspace through the HTTP surface, then asserts on
 * the file the renderer is allowed to round-trip from on next launch.
 *
 * Mutation-verified by commenting out `scheduleWorkspaceAutosave()` in
 * src/main/runtime/text-entity-state.ts and confirming the disk snapshot
 * stays empty after the autosave window.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTextEntities,
  deleteTextEntities,
  getTextEntities,
  resetSmokeState,
} from './app-client'
import {
  flushAndReadDiskSnapshot,
  waitForAutosave,
} from './test-utils'

async function cleanupTextEntities(): Promise<void> {
  const { textEntities } = await getTextEntities()
  if (textEntities.length) {
    await deleteTextEntities(textEntities.map((t) => t.id))
  }
}

describe('persistence', () => {
  beforeEach(async () => {
    await resetSmokeState()
    await cleanupTextEntities()
  })

  afterEach(async () => {
    await cleanupTextEntities()
  })

  it('autosave writes a mutation to the .canvas file on disk', async () => {
    const before = await flushAndReadDiskSnapshot()
    const beforeIds = new Set(
      (before.doc?.nodes ?? []).filter((n) => n.type === 'text').map((n) => n.id),
    )

    const { ids } = await createTextEntities([
      { canvasX: 120, canvasY: 240, text: 'persisted text' },
    ])
    const newId = ids[0]

    // Wait past the 350ms debounce — no explicit flush.
    const after = await waitForAutosave()
    const textNodes = (after.doc?.nodes ?? []).filter((n) => n.type === 'text')
    expect(textNodes.some((n) => n.id === newId)).toBe(true)
    expect(beforeIds.has(newId)).toBe(false)
  })

  it('flush triggers an immediate write (no debounce wait needed)', async () => {
    const { ids } = await createTextEntities([
      { canvasX: 5, canvasY: 5, text: 'flush me' },
    ])
    const newId = ids[0]

    // Flush synchronously rather than waiting.
    const snapshot = await flushAndReadDiskSnapshot()
    const textNodes = (snapshot.doc?.nodes ?? []).filter((n) => n.type === 'text')
    expect(textNodes.some((n) => n.id === newId)).toBe(true)
  })

  it('in-memory state matches on-disk snapshot after flush', async () => {
    // Single-item creates run synchronously inside the request handler.
    // The batch path runs through staggerOperation across multiple ticks,
    // so a flush mid-stagger could disagree with a later getTextEntities().
    await createTextEntities([{ canvasX: 0, canvasY: 0, text: 'one' }])
    await createTextEntities([{ canvasX: 200, canvasY: 0, text: 'two' }])

    const disk = await flushAndReadDiskSnapshot()
    const runtime = await getTextEntities()

    const diskTextIds = new Set(
      (disk.doc?.nodes ?? []).filter((n) => n.type === 'text').map((n) => n.id),
    )
    const runtimeIds = new Set(runtime.textEntities.map((t) => t.id))

    expect(diskTextIds.size).toBe(runtimeIds.size)
    for (const id of runtimeIds) {
      expect(diskTextIds.has(id)).toBe(true)
    }
  })

  it('deletion removes the entity from the .canvas file after flush', async () => {
    const { ids } = await createTextEntities([
      { canvasX: 10, canvasY: 10, text: 'temporary' },
    ])
    const newId = ids[0]
    await flushAndReadDiskSnapshot()

    await deleteTextEntities([newId])
    const after = await flushAndReadDiskSnapshot()
    const textIds = new Set(
      (after.doc?.nodes ?? []).filter((n) => n.type === 'text').map((n) => n.id),
    )
    expect(textIds.has(newId)).toBe(false)
  })
})
