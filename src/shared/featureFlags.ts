import type { AnnotationMode, CanvasEntityKind } from './types'

export const DRAWING_FEATURE_ENABLED = true
export const PERFECT_FREEHAND_ENABLED = true

export function isCanvasEntityKindEnabled(kind: CanvasEntityKind): boolean {
  if (kind === 'drawing') return DRAWING_FEATURE_ENABLED
  return true
}

export function isAnnotationModeEnabled(mode: AnnotationMode): boolean {
  if (mode === 'draw') return DRAWING_FEATURE_ENABLED
  return true
}
