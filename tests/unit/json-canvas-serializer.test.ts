import { describe, it, expect } from 'vitest'
import {
  serializeToJsonCanvas,
  deserializeFromJsonCanvas,
} from '../../src/main/runtime/json-canvas-serializer'
import type {
  PersistedDrawingEntity,
  WorkspaceSnapshot,
} from '../../src/shared/types'

function emptySnapshot(): WorkspaceSnapshot {
  return {
    zoom: 1,
    pan: { x: 0, y: 0 },
    pages: [],
    entities: {},
    entityOrder: [],
    selectedPageIndex: null,
    devtoolsOpen: false,
    devtoolsWidth: 400,
  }
}

describe('json-canvas-serializer drawings', () => {
  const drawing: PersistedDrawingEntity = {
    kind: 'drawing',
    id: 'd1',
    canvasX: 100,
    canvasY: 200,
    width: 300,
    height: 150,
    label: 'sketch',
    strokes: [
      {
        id: 's1',
        color: '#ff0000',
        width: 2,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
      },
    ],
  }

  it('round-trips drawing entities through JSON Canvas', () => {
    const snapshot = emptySnapshot()
    snapshot.entities!['d1'] = drawing
    snapshot.entityOrder = ['d1']

    const doc = serializeToJsonCanvas(snapshot)
    expect(doc.nodes).toHaveLength(1)
    expect(doc.nodes[0]).toMatchObject({ type: 'drawing', id: 'd1' })

    const { snapshot: restored } = deserializeFromJsonCanvas(doc)
    expect(restored.entities?.['d1']).toEqual(drawing)
    expect(restored.entityOrder).toEqual(['d1'])
  })

  it('preserves drawing z-order among other entities', () => {
    const snapshot = emptySnapshot()
    snapshot.entities!['t1'] = {
      kind: 'text',
      id: 't1',
      text: 'hello',
      color: '3',
      canvasX: 0,
      canvasY: 0,
      width: 100,
      height: 50,
    }
    snapshot.entities!['d1'] = drawing
    snapshot.entityOrder = ['t1', 'd1']

    const doc = serializeToJsonCanvas(snapshot)
    expect(doc.nodes.map((n) => n.id)).toEqual(['t1', 'd1'])

    const { snapshot: restored } = deserializeFromJsonCanvas(doc)
    expect(restored.entityOrder).toEqual(['t1', 'd1'])
  })
})
