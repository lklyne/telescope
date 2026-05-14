export type AlignmentAxis = 'horizontal' | 'vertical'
export type AlignmentReferenceName = 'top' | 'bottom' | 'hCenter' | 'left' | 'right' | 'vCenter'

export type AlignmentGuide = {
  axis: AlignmentAxis
  coordinate: number
  start: number
  end: number
  draggedId: string
  candidateId: string
  draggedReference: AlignmentReferenceName
  candidateReference: AlignmentReferenceName
}

export type DistributionGuideGap = {
  start: number
  end: number
  cross: number
}

export type DistributionGuide = {
  axis: AlignmentAxis
  gap: number
  draggedId: string
  candidateIds: string[]
  spanStart: number
  spanEnd: number
  crossStart: number
  crossEnd: number
  gaps: DistributionGuideGap[]
}

export type CanvasGuidesPayload = {
  alignmentGuides: AlignmentGuide[]
  distributionGuides: DistributionGuide[]
}
