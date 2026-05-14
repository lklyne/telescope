import { describe, expect, it } from 'vitest'
import {
  alignmentGuideDetector,
  type AlignmentDraggedRect,
} from '../../src/main/runtime/alignment-guide-detector'
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

describe('alignmentGuideDetector', () => {
  it('detects all top, bottom, and horizontal-center reference alignments', () => {
    const dragged = rect({ id: 'dragged', left: 200, top: 100, width: 80, height: 40 })
    const candidate = rect({ id: 'candidate', left: 20, top: 100, width: 100, height: 40 })

    const refs = alignmentGuideDetector([dragged], [candidate])
      .filter((guide) => guide.axis === 'horizontal')
      .map((guide) => `${guide.draggedReference}:${guide.candidateReference}`)

    expect(refs).toEqual(['top:top', 'bottom:bottom', 'hCenter:hCenter'])
  })

  it('detects all left, right, and vertical-center reference alignments', () => {
    const dragged = rect({ id: 'dragged', left: 100, top: 180, width: 80, height: 40 })
    const candidate = rect({ id: 'candidate', left: 100, top: 20, width: 80, height: 100 })

    const refs = alignmentGuideDetector([dragged], [candidate])
      .filter((guide) => guide.axis === 'vertical')
      .map((guide) => `${guide.draggedReference}:${guide.candidateReference}`)

    expect(refs).toEqual(['left:left', 'right:right', 'vCenter:vCenter'])
  })

  it('honors the 0.5 px tolerance boundary', () => {
    const draggedInside = rect({ id: 'inside', left: 100.5, top: 10, width: 20, height: 20 })
    const draggedOutside = rect({ id: 'outside', left: 100.51, top: 40, width: 20, height: 20 })
    const candidate = rect({ id: 'candidate', left: 100, top: 100, width: 20, height: 20 })

    expect(alignmentGuideDetector([draggedInside], [candidate]))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ axis: 'vertical', draggedReference: 'left', candidateReference: 'left' }),
      ]))
    expect(alignmentGuideDetector([draggedOutside], [candidate]))
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ axis: 'vertical', draggedReference: 'left', candidateReference: 'left' }),
      ]))
  })

  it('returns no guides when no references align', () => {
    expect(alignmentGuideDetector(
      [rect({ id: 'dragged', left: 13, top: 17, width: 30, height: 30 })],
      [rect({ id: 'candidate', left: 100, top: 200, width: 40, height: 40 })],
    )).toEqual([])
  })

  it('spans the dragged and candidate rects on the guide axis', () => {
    const [horizontal] = alignmentGuideDetector(
      [rect({ id: 'dragged', left: 200, top: 100, width: 80, height: 40 })],
      [rect({ id: 'candidate', left: 20, top: 100, width: 100, height: 80 })],
    )

    expect(horizontal).toEqual(expect.objectContaining({
      axis: 'horizontal',
      coordinate: 100,
      start: 20,
      end: 280,
    }))
  })

  it('can limit dragged references for resize adapters', () => {
    const dragged: AlignmentDraggedRect = {
      ...rect({ id: 'dragged', left: 100, top: 100, width: 80, height: 40 }),
      references: ['right'],
    }
    const candidate = rect({ id: 'candidate', left: 20, top: 40, width: 160, height: 80 })

    expect(alignmentGuideDetector([dragged], [candidate])).toEqual([
      expect.objectContaining({
        axis: 'vertical',
        draggedReference: 'right',
        candidateReference: 'right',
      }),
    ])
  })
})
