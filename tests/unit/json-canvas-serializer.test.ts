import { describe, it, expect } from 'vitest'
import {
  serializeToJsonCanvas,
  deserializeFromJsonCanvas,
} from '../../src/main/runtime/json-canvas-serializer'
import type {
  PersistedDrawingEntity,
  PersistedFileEntity,
  PersistedShapeEntity,
  PersistedTextEntity,
  WorkspaceSnapshot,
} from '../../src/shared/types'
import type { JsonCanvasDocument } from '../../src/shared/json-canvas-types'

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

  it('round-trips file entities with metadata, presetIndex, and objectFit', () => {
    const file: PersistedFileEntity = {
      kind: 'file',
      id: 'f1',
      file: 'src/Button.tsx',
      canvasX: 50,
      canvasY: 75,
      width: 320,
      height: 240,
      objectFit: 'contain',
      presetIndex: 2,
      metadata: {
        componentRender: {
          repoId: 'repo-abc',
          repoRelativePath: 'src/Button.tsx',
          lastKnownGoodUrl: 'http://localhost:5173/__specular?path=src/Button.tsx',
        },
      },
    }
    const snapshot = emptySnapshot()
    snapshot.entities!['f1'] = file
    snapshot.entityOrder = ['f1']

    const doc = serializeToJsonCanvas(snapshot)
    expect(doc.nodes).toHaveLength(1)
    expect(doc.nodes[0]).toMatchObject({
      type: 'file',
      id: 'f1',
      file: 'src/Button.tsx',
      objectFit: 'contain',
      presetIndex: 2,
    })

    const { snapshot: restored } = deserializeFromJsonCanvas(doc)
    expect(restored.entities?.['f1']).toEqual(file)
  })

  it('round-trips shape entities with all optional fields', () => {
    const shape: PersistedShapeEntity = {
      kind: 'shape',
      id: 'sh1',
      shapeKind: 'diamond',
      text: 'Approve?',
      color: '2',
      strokeWidth: 3,
      canvasX: 10,
      canvasY: 20,
      width: 200,
      height: 120,
    }
    const snapshot = emptySnapshot()
    snapshot.entities!['sh1'] = shape
    snapshot.entityOrder = ['sh1']

    const doc = serializeToJsonCanvas(snapshot)
    expect(doc.nodes).toHaveLength(1)
    expect(doc.nodes[0]).toMatchObject({
      type: 'shape',
      id: 'sh1',
      shapeKind: 'diamond',
      text: 'Approve?',
      color: '2',
      strokeWidth: 3,
    })

    const { snapshot: restored } = deserializeFromJsonCanvas(doc)
    expect(restored.entities?.['sh1']).toEqual(shape)
    expect(restored.entityOrder).toEqual(['sh1'])
  })

  it('round-trips a minimal shape entity (no color, no stroke)', () => {
    const shape: PersistedShapeEntity = {
      kind: 'shape',
      id: 'sh2',
      shapeKind: 'rectangle',
      text: '',
      canvasX: 0,
      canvasY: 0,
      width: 200,
      height: 120,
    }
    const snapshot = emptySnapshot()
    snapshot.entities!['sh2'] = shape
    snapshot.entityOrder = ['sh2']

    const doc = serializeToJsonCanvas(snapshot)
    const { snapshot: restored } = deserializeFromJsonCanvas(doc)
    expect(restored.entities?.['sh2']).toEqual(shape)
  })

  it('round-trips a plain text entity via specular.textStyle', () => {
    const text: PersistedTextEntity = {
      kind: 'text',
      id: 't-plain',
      text: 'Heading',
      color: '#FFE18E',
      textStyle: 'plain',
      canvasX: 10,
      canvasY: 20,
      width: 200,
      height: 60,
    }
    const snapshot = emptySnapshot()
    snapshot.entities!['t-plain'] = text
    snapshot.entityOrder = ['t-plain']

    const doc = serializeToJsonCanvas(snapshot)
    expect(doc.nodes).toHaveLength(1)
    expect(doc.nodes[0]).toMatchObject({
      type: 'text',
      id: 't-plain',
      text: 'Heading',
      specular: { textStyle: 'plain' },
    })

    const { snapshot: restored } = deserializeFromJsonCanvas(doc)
    expect(restored.entities?.['t-plain']).toEqual(text)
  })

  it('round-trips a sticky text entity via specular.textStyle', () => {
    const text: PersistedTextEntity = {
      kind: 'text',
      id: 't-sticky',
      text: 'remember this',
      color: '#FFE18E',
      textStyle: 'sticky',
      canvasX: 0,
      canvasY: 0,
      width: 200,
      height: 200,
    }
    const snapshot = emptySnapshot()
    snapshot.entities!['t-sticky'] = text
    snapshot.entityOrder = ['t-sticky']

    const doc = serializeToJsonCanvas(snapshot)
    expect(doc.nodes[0]).toMatchObject({
      type: 'text',
      id: 't-sticky',
      specular: { textStyle: 'sticky' },
    })

    const { snapshot: restored } = deserializeFromJsonCanvas(doc)
    expect(restored.entities?.['t-sticky']).toEqual(text)
  })

  it('defaults legacy text nodes (no specular field) to textStyle: sticky', () => {
    const legacyDoc: JsonCanvasDocument = {
      nodes: [
        {
          id: 't-legacy',
          type: 'text',
          x: 5,
          y: 6,
          width: 100,
          height: 50,
          text: 'old note',
          color: '3',
        },
      ],
      edges: [],
    }

    const { snapshot: restored } = deserializeFromJsonCanvas(legacyDoc)
    expect(restored.entities?.['t-legacy']).toMatchObject({
      kind: 'text',
      id: 't-legacy',
      textStyle: 'sticky',
    })
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
