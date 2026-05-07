import { describe, expect, it } from 'vitest'
import { entitiesOverlappingRect } from '../../src/shared/gesture-utils'
import type { CanvasSceneEntity, CanvasSceneFrameEntity } from '../../src/shared/types'

function frame(over: Partial<CanvasSceneFrameEntity> & { id: string }): CanvasSceneFrameEntity {
  return {
    id: over.id,
    kind: 'frame',
    canvasX: 0,
    canvasY: 0,
    width: over.screenWidth ?? 100,
    height: over.screenHeight ?? 100,
    screenX: 0,
    screenY: 0,
    screenWidth: 100,
    screenHeight: 100,
    presetIndex: 0,
    rendererTag: 'web',
    ...over,
  } as CanvasSceneFrameEntity
}

describe('entitiesOverlappingRect', () => {
  const entities: CanvasSceneEntity[] = [
    frame({ id: 'a', screenX: 0, screenY: 0, screenWidth: 100, screenHeight: 100 }),
    frame({ id: 'b', screenX: 200, screenY: 0, screenWidth: 100, screenHeight: 100 }),
    frame({ id: 'c', screenX: 50, screenY: 50, screenWidth: 100, screenHeight: 100 }),
  ]

  it('returns ids of entities the rect overlaps', () => {
    const ids = entitiesOverlappingRect(entities, { left: 40, top: 40, width: 80, height: 80 })
    expect(ids).toEqual(['a', 'c'])
  })

  it('returns all entities when the rect is large enough to enclose them', () => {
    const ids = entitiesOverlappingRect(entities, { left: -10, top: -10, width: 1000, height: 1000 })
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array when the rect misses everything', () => {
    const ids = entitiesOverlappingRect(entities, { left: 500, top: 500, width: 50, height: 50 })
    expect(ids).toEqual([])
  })

  it('treats edge-touching as non-overlap (matches old marquee preview)', () => {
    // Frame a sits at [0,100) × [0,100). A rect starting exactly at x=100 must miss.
    const ids = entitiesOverlappingRect([entities[0]], { left: 100, top: 0, width: 50, height: 50 })
    expect(ids).toEqual([])
  })

  it('preserves entity input order', () => {
    const ids = entitiesOverlappingRect(entities, { left: 0, top: 0, width: 300, height: 300 })
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})
