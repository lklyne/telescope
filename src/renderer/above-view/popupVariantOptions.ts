/**
 * Shared visual helpers for popup variant pickers (ADR 0006 §5).
 *
 * The shape popup (selection + tool mode) and drawing popup share these so
 * the toolbar, popups, and sidebar all render the same shapeKind / brushType /
 * strokeWidth affordances.
 */

import { Circle, Diamond, Highlighter, PencilLine, Square } from 'lucide-react'
import type { ComponentType } from 'react'
import type { DrawingBrushType, ShapeKind } from '../../shared/types'

export const SHAPE_VARIANT_OPTIONS: Array<{
  kind: ShapeKind
  label: string
  Icon: ComponentType<{ size?: number }>
}> = [
  { kind: 'rectangle', label: 'Rectangle', Icon: Square },
  { kind: 'ellipse', label: 'Ellipse', Icon: Circle },
  { kind: 'diamond', label: 'Diamond', Icon: Diamond },
]

export const BRUSH_VARIANT_OPTIONS: Array<{
  kind: DrawingBrushType
  label: string
  Icon: ComponentType<{ size?: number }>
}> = [
  { kind: 'pen', label: 'Pen', Icon: PencilLine },
  { kind: 'highlight', label: 'Highlighter', Icon: Highlighter },
]

/**
 * Stroke-width presets shown in popup pickers. Same set for shapes and
 * drawings; the user picks per tool. Keep ordered thin → thick.
 */
export const STROKE_WIDTH_PRESETS = [1, 2, 4, 8] as const

/** Closest preset to a given width — used to highlight the current swatch. */
export function nearestStrokeWidthPreset(value: number): number {
  let best: number = STROKE_WIDTH_PRESETS[0]
  let bestDist = Math.abs(value - best)
  for (const preset of STROKE_WIDTH_PRESETS) {
    const dist = Math.abs(value - preset)
    if (dist < bestDist) {
      best = preset
      bestDist = dist
    }
  }
  return best
}
