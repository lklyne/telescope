/**
 * Shared visual helpers for popup variant pickers (ADR 0008 §5).
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
 * Stroke-width presets shown in popup pickers. Shapes and pen-brush drawings
 * share the thin set; the highlighter uses a thicker set so it reads as a
 * marker rather than a colored line. Keep ordered thin → thick.
 */
export const STROKE_WIDTH_PRESETS = [2, 8] as const
const HIGHLIGHT_STROKE_WIDTH_PRESETS = [8, 16] as const

export function strokeWidthPresetsFor(
  brushType: DrawingBrushType | undefined,
): readonly number[] {
  return brushType === 'highlight' ? HIGHLIGHT_STROKE_WIDTH_PRESETS : STROKE_WIDTH_PRESETS
}

/** Closest preset to a given width — used to highlight the current swatch. */
export function nearestStrokeWidthPreset(
  value: number,
  presets: readonly number[] = STROKE_WIDTH_PRESETS,
): number {
  let best = presets[0]
  let bestDist = Math.abs(value - best)
  for (const preset of presets) {
    const dist = Math.abs(value - preset)
    if (dist < bestDist) {
      best = preset
      bestDist = dist
    }
  }
  return best
}
