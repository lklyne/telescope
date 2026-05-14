import type { SnapCandidate } from './snap-candidate-snapshot'
import type {
  AlignmentAxis,
  AlignmentGuide,
  AlignmentReferenceName,
} from '../../shared/canvas-guides'

export type { AlignmentAxis, AlignmentGuide, AlignmentReferenceName }

export type AlignmentDraggedRect = SnapCandidate & {
  references?: AlignmentReferenceName[]
}

const HORIZONTAL_REFS: AlignmentReferenceName[] = ['top', 'bottom', 'hCenter']
const VERTICAL_REFS: AlignmentReferenceName[] = ['left', 'right', 'vCenter']

function refsForAxis(axis: AlignmentAxis): AlignmentReferenceName[] {
  return axis === 'horizontal' ? HORIZONTAL_REFS : VERTICAL_REFS
}

function refValue(rect: SnapCandidate, ref: AlignmentReferenceName): number {
  return rect[ref]
}

function spanForAxis(axis: AlignmentAxis, dragged: SnapCandidate, candidate: SnapCandidate): {
  start: number
  end: number
} {
  if (axis === 'horizontal') {
    return {
      start: Math.min(dragged.left, candidate.left),
      end: Math.max(dragged.right, candidate.right),
    }
  }
  return {
    start: Math.min(dragged.top, candidate.top),
    end: Math.max(dragged.bottom, candidate.bottom),
  }
}

export function alignmentGuideDetector(
  draggedRects: AlignmentDraggedRect[],
  candidates: SnapCandidate[],
  tolerance = 0.5,
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = []

  for (const dragged of draggedRects) {
    for (const candidate of candidates) {
      if (candidate.id === dragged.id) continue

      for (const axis of ['horizontal', 'vertical'] as const) {
        const draggedRefs = refsForAxis(axis).filter((ref) => (
          !dragged.references || dragged.references.includes(ref)
        ))
        const candidateRefs = refsForAxis(axis)

        for (const draggedReference of draggedRefs) {
          const draggedValue = refValue(dragged, draggedReference)
          for (const candidateReference of candidateRefs) {
            const candidateValue = refValue(candidate, candidateReference)
            if (Math.abs(draggedValue - candidateValue) > tolerance) continue

            const span = spanForAxis(axis, dragged, candidate)
            guides.push({
              axis,
              coordinate: candidateValue,
              start: span.start,
              end: span.end,
              draggedId: dragged.id,
              candidateId: candidate.id,
              draggedReference,
              candidateReference,
            })
          }
        }
      }
    }
  }

  return guides
}
