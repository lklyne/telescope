import { describe, it, expect, afterAll, afterEach } from 'vitest'
import {
  createTextEntities,
  deleteTextEntities,
  getTextEntities,
  updateTextEntities,
} from './app-client'
import { assertPersists, assertUndoable } from './test-utils'

const createdIds: string[] = []

afterAll(async () => {
  if (createdIds.length) {
    await deleteTextEntities(createdIds)
  }
})

describe('text entities', () => {
  it('creates a text entity', async () => {
    const result = await createTextEntities([
      { canvasX: 200, canvasY: 200, text: 'Smoke test note' },
    ])
    expect(result.ids).toHaveLength(1)
    createdIds.push(result.ids[0])

    const { textEntities } = await getTextEntities()
    const match = textEntities.find((e) => e.id === createdIds[0])
    expect(match).toBeDefined()
    expect(match!.text).toBe('Smoke test note')
  })

  it('updates a text entity', async () => {
    await updateTextEntities([
      { id: createdIds[0], patch: { text: 'Updated note' } },
    ])

    const { textEntities } = await getTextEntities()
    const match = textEntities.find((e) => e.id === createdIds[0])
    expect(match!.text).toBe('Updated note')
  })

  it('deletes a text entity', async () => {
    const [id] = createdIds.splice(0, 1)
    const result = await deleteTextEntities([id])
    expect(result.deleted).toContain(id)

    const { textEntities } = await getTextEntities()
    expect(textEntities.find((e) => e.id === id)).toBeUndefined()
  })
})

describe('text entities — lifecycle', () => {
  const lifecycleIds: string[] = []

  afterEach(async () => {
    if (lifecycleIds.length) {
      await deleteTextEntities(lifecycleIds.splice(0))
    }
  })

  it('persists a created text entity to disk', async () => {
    await assertPersists(async () => {
      const result = await createTextEntities([
        { canvasX: 320, canvasY: 320, text: 'persisted text' },
      ])
      lifecycleIds.push(...result.ids)
    })
  })

  it('round-trips a created text entity through undo/redo', async () => {
    await assertUndoable(async () => {
      const result = await createTextEntities([
        { canvasX: 360, canvasY: 360, text: 'undoable text' },
      ])
      lifecycleIds.push(...result.ids)
    })
  })
})
