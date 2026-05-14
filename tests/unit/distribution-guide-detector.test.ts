import { describe, expect, it } from 'vitest'
import { distributionGuideDetector } from '../../src/main/runtime/distribution-guide-detector'
import type { SnapCandidate } from '../../src/main/runtime/snap-candidate-snapshot'

function rect(input: {
  id: string
  left: number
  top: number
  width: number
  height: number
}): SnapCandidate {
  return {
    id: input.id,
    kind: 'text',
    left: input.left,
    right: input.left + input.width,
    top: input.top,
    bottom: input.top + input.height,
    hCenter: input.top + input.height / 2,
    vCenter: input.left + input.width / 2,
  }
}

describe('distributionGuideDetector', () => {
  it('detects an equal-gap horizontal triple around the dragged rect', () => {
    const dragged = rect({ id: 'dragged', left: 40, top: 20, width: 20, height: 20 })
    const left = rect({ id: 'left', left: 0, top: 20, width: 20, height: 20 })
    const right = rect({ id: 'right', left: 80, top: 20, width: 20, height: 20 })

    expect(distributionGuideDetector(dragged, [left, right], 'horizontal')).toEqual([
      expect.objectContaining({
        axis: 'horizontal',
        gap: 20,
        draggedId: 'dragged',
        candidateIds: ['left', 'right'],
        spanStart: 0,
        spanEnd: 100,
        gaps: [
          { start: 20, end: 40, cross: 30 },
          { start: 60, end: 80, cross: 30 },
        ],
      }),
    ])
  })

  it('honors the gap tolerance boundary', () => {
    const dragged = rect({ id: 'dragged', left: 40, top: 20, width: 20, height: 20 })
    const left = rect({ id: 'left', left: 0, top: 20, width: 20, height: 20 })
    const inside = rect({ id: 'inside', left: 80.5, top: 20, width: 20, height: 20 })
    const outside = rect({ id: 'outside', left: 80.51, top: 20, width: 20, height: 20 })

    expect(distributionGuideDetector(dragged, [left, inside], 'horizontal')).toHaveLength(1)
    expect(distributionGuideDetector(dragged, [left, outside], 'horizontal')).toEqual([])
  })

  it('emits one chain for four entities with three equal gaps', () => {
    const dragged = rect({ id: 'dragged', left: 40, top: 20, width: 20, height: 20 })
    const first = rect({ id: 'first', left: 0, top: 20, width: 20, height: 20 })
    const third = rect({ id: 'third', left: 80, top: 20, width: 20, height: 20 })
    const fourth = rect({ id: 'fourth', left: 120, top: 20, width: 20, height: 20 })

    expect(distributionGuideDetector(dragged, [third, fourth, first], 'horizontal')).toEqual([
      expect.objectContaining({
        candidateIds: ['first', 'third', 'fourth'],
        spanStart: 0,
        spanEnd: 140,
        gaps: [
          { start: 20, end: 40, cross: 30 },
          { start: 60, end: 80, cross: 30 },
          { start: 100, end: 120, cross: 30 },
        ],
      }),
    ])
  })

  it('detects vertical chains independently from horizontal chains', () => {
    const dragged = rect({ id: 'dragged', left: 20, top: 40, width: 20, height: 20 })
    const top = rect({ id: 'top', left: 20, top: 0, width: 20, height: 20 })
    const bottom = rect({ id: 'bottom', left: 20, top: 80, width: 20, height: 20 })

    expect(distributionGuideDetector(dragged, [top, bottom], 'vertical')).toEqual([
      expect.objectContaining({
        axis: 'vertical',
        gap: 20,
        gaps: [
          { start: 20, end: 40, cross: 30 },
          { start: 60, end: 80, cross: 30 },
        ],
      }),
    ])
    expect(distributionGuideDetector(dragged, [top, bottom], 'horizontal')).toEqual([])
  })
})
