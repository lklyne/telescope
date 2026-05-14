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

export type CanvasGuidesPayload = {
  alignmentGuides: AlignmentGuide[]
}
