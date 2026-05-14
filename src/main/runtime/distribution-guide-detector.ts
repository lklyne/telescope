import type { SnapCandidate } from './snap-candidate-snapshot'
import type { AlignmentAxis, DistributionGuide } from '../../shared/canvas-guides'

export type { DistributionGuide }

type DistributionItem = {
  id: string
  start: number
  end: number
  crossStart: number
  crossEnd: number
  isDragged: boolean
}

function itemForAxis(rect: SnapCandidate, axis: AlignmentAxis, isDragged: boolean): DistributionItem {
  if (axis === 'horizontal') {
    return {
      id: rect.id,
      start: rect.left,
      end: rect.right,
      crossStart: rect.top,
      crossEnd: rect.bottom,
      isDragged,
    }
  }

  return {
    id: rect.id,
    start: rect.top,
    end: rect.bottom,
    crossStart: rect.left,
    crossEnd: rect.right,
    isDragged,
  }
}

function nearlyEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance
}

function chainKey(items: DistributionItem[]): string {
  return items.map((item) => item.id).join('\0')
}

function guideFromChain(
  draggedId: string,
  axis: AlignmentAxis,
  items: DistributionItem[],
): DistributionGuide {
  const gaps = items.slice(0, -1).map((item, index) => {
    const next = items[index + 1]
    return {
      start: item.end,
      end: next.start,
      cross: (Math.max(item.crossStart, next.crossStart) + Math.min(item.crossEnd, next.crossEnd)) / 2,
    }
  })

  return {
    axis,
    gap: gaps[0].end - gaps[0].start,
    draggedId,
    candidateIds: items.filter((item) => !item.isDragged).map((item) => item.id),
    spanStart: items[0].start,
    spanEnd: items[items.length - 1].end,
    crossStart: Math.min(...items.map((item) => item.crossStart)),
    crossEnd: Math.max(...items.map((item) => item.crossEnd)),
    gaps,
  }
}

export function distributionGuideDetector(
  draggedRect: SnapCandidate,
  candidates: SnapCandidate[],
  axis: AlignmentAxis,
  tolerance = 0.5,
): DistributionGuide[] {
  const items = [
    itemForAxis(draggedRect, axis, true),
    ...candidates
      .filter((candidate) => candidate.id !== draggedRect.id)
      .map((candidate) => itemForAxis(candidate, axis, false)),
  ].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))

  const draggedIndex = items.findIndex((item) => item.isDragged)
  if (draggedIndex === -1) return []

  const adjacentGaps = items.slice(0, -1).map((item, index) => ({
    index,
    gap: items[index + 1].start - item.end,
  }))
  const guides: DistributionGuide[] = []
  const seen = new Set<string>()

  for (const anchor of adjacentGaps) {
    if (anchor.gap < 0) continue

    let firstGapIndex = anchor.index
    while (
      firstGapIndex > 0 &&
      adjacentGaps[firstGapIndex - 1].gap >= 0 &&
      nearlyEqual(adjacentGaps[firstGapIndex - 1].gap, anchor.gap, tolerance)
    ) {
      firstGapIndex -= 1
    }

    let lastGapIndex = anchor.index
    while (
      lastGapIndex < adjacentGaps.length - 1 &&
      adjacentGaps[lastGapIndex + 1].gap >= 0 &&
      nearlyEqual(adjacentGaps[lastGapIndex + 1].gap, anchor.gap, tolerance)
    ) {
      lastGapIndex += 1
    }

    if (lastGapIndex - firstGapIndex + 1 < 2) continue
    if (draggedIndex < firstGapIndex || draggedIndex > lastGapIndex + 1) continue

    const chain = items.slice(firstGapIndex, lastGapIndex + 2)
    if (chain.filter((item) => !item.isDragged).length < 2) continue

    const key = chainKey(chain)
    if (seen.has(key)) continue
    seen.add(key)
    guides.push(guideFromChain(draggedRect.id, axis, chain))
  }

  return guides
}
