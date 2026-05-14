import { describe, expect, it } from 'vitest'
import {
  snapCandidateSnapshot,
  type SnapCandidateSnapshotEntity,
} from '../../src/main/runtime/snap-candidate-snapshot'

const viewport = { x: 0, y: 0, width: 500, height: 400 }

function entity(
  input: Partial<SnapCandidateSnapshotEntity> & Pick<SnapCandidateSnapshotEntity, 'id'>,
): SnapCandidateSnapshotEntity {
  return {
    kind: 'text',
    canvasX: 40,
    canvasY: 60,
    width: 100,
    height: 80,
    ...input,
  }
}

describe('snapCandidateSnapshot', () => {
  it('includes entities that are fully or partially inside the viewport', () => {
    const candidates = snapCandidateSnapshot({
      entities: [
        entity({ id: 'inside', canvasX: 50, canvasY: 50 }),
        entity({ id: 'partial', canvasX: 450, canvasY: 350 }),
        entity({ id: 'outside', canvasX: 520, canvasY: 20 }),
      ],
    }, viewport, [])

    expect(candidates.map((candidate) => candidate.id)).toEqual(['inside', 'partial'])
  })

  it('excludes the active selection from candidates', () => {
    const candidates = snapCandidateSnapshot({
      entities: [
        entity({ id: 'dragged' }),
        entity({ id: 'neighbor', canvasX: 180 }),
      ],
    }, viewport, ['dragged'])

    expect(candidates.map((candidate) => candidate.id)).toEqual(['neighbor'])
  })

  it('emits page candidates with their full bounds', () => {
    const [candidate] = snapCandidateSnapshot({
      entities: [
        entity({ id: 'page-1', kind: 'page', canvasX: 20, canvasY: 30, width: 320, height: 240 }),
      ],
    }, viewport, [])

    expect(candidate).toEqual({
      id: 'page-1',
      kind: 'page',
      left: 20,
      right: 340,
      top: 30,
      bottom: 270,
      hCenter: 150,
      vCenter: 180,
    })
  })

  it('represents a visible group by its bbox and skips children inside it', () => {
    const candidates = snapCandidateSnapshot({
      entities: [
        entity({ id: 'group-1', kind: 'group', canvasX: 10, canvasY: 20, width: 300, height: 200 }),
        entity({ id: 'child', parentGroupId: 'group-1', canvasX: 40, canvasY: 50 }),
        entity({ id: 'sibling', canvasX: 360, canvasY: 50 }),
      ],
    }, viewport, [])

    expect(candidates.map((candidate) => candidate.id)).toEqual(['group-1', 'sibling'])
  })

  it('returns an empty snapshot for an empty workspace', () => {
    expect(snapCandidateSnapshot({ entities: [] }, viewport, [])).toEqual([])
  })
})
