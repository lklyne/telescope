import { describe, expect, it } from 'vitest'
import {
  applyCanvasDrag,
  createTextEntities,
  endCanvasDrag,
  getCanvasGuides,
  getTextEntities,
  startCanvasDrag,
} from './app-client'

async function textEntity(id: string) {
  const { textEntities } = await getTextEntities()
  const entity = textEntities.find((candidate) => candidate.id === id)
  if (!entity) throw new Error(`Missing text entity ${id}`)
  return entity
}

describe('canvas drag affordances', () => {
  it('axis-locks drag movement, emits alignment guides, and clears guides on commit', async () => {
    const { ids: [axisId] } = await createTextEntities([
      { canvasX: 105, canvasY: 107, width: 80, height: 40, text: 'axis' },
    ])

    await startCanvasDrag([axisId])
    await applyCanvasDrag({ entityIds: [axisId], dx: 38, dy: 12, shiftKey: true })
    await endCanvasDrag()

    const axisEntity = await textEntity(axisId)
    expect(axisEntity.canvasY).toBe(107)
    expect(axisEntity.canvasX).toBe(140)

    const { ids: [candidateId] } = await createTextEntities([
      { canvasX: 400, canvasY: 100, width: 80, height: 40, text: 'candidate' },
    ])
    const { ids: [draggedId] } = await createTextEntities([
      { canvasX: 460, canvasY: 200, width: 80, height: 40, text: 'dragged' },
    ])

    await startCanvasDrag([draggedId])
    const { guides } = await applyCanvasDrag({ entityIds: [draggedId], dx: -60, dy: 0 })

    expect(guides.alignmentGuides).toEqual(expect.arrayContaining([
      expect.objectContaining({
        axis: 'vertical',
        candidateId,
        draggedId,
        coordinate: 400,
      }),
    ]))

    await endCanvasDrag()
    expect(await getCanvasGuides()).toEqual({ alignmentGuides: [], distributionGuides: [] })
  })
})
