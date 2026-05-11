/**
 * Tool defaults — per-tool, persistent app settings (ADR 0006 §9).
 *
 * Stored in the user's preferences file (not in `.canvas`, not in Y.Doc, not
 * in undo/redo). The next entity created by a tool stamps these values; the
 * tool-mode popup reads/writes them.
 *
 * Plain-text color is intentionally absent: plain text inherits canvas
 * foreground / `currentColor` by default. ADR 0006 reserves
 * `add-text.plain.color` for a future override but Step 4 only wires
 * `add-text.sticky.color`.
 */

import type { DrawingBrushType, ShapeKind } from './types'

export interface ToolDefaults {
  'add-text': {
    /** Stamp color for `add-text` style: 'sticky'. CanvasColor preset or hex. */
    'sticky.color': string
    /** Reserved — plain-text override stamp color. */
    'plain.color': string | null
  }
  'add-shape': {
    shapeKind: ShapeKind
    color: string
    strokeWidth: number
  }
  draw: {
    brushType: DrawingBrushType
    color: string
    strokeWidth: number
  }
}

/**
 * First-time-launch defaults. ADR 0006 §"Tool defaults" originally specified
 * shape/draw at black; we shifted both to the red preset so a brand-new canvas
 * draws in colour rather than indistinguishable-from-text black.
 *   sticky yellow, plain transparent/inherit (null),
 *   shape rectangle/red/2px,
 *   draw pen/red/2px.
 */
export const DEFAULT_TOOL_DEFAULTS: ToolDefaults = {
  'add-text': {
    'sticky.color': '3', // yellow preset
    'plain.color': null,
  },
  'add-shape': {
    shapeKind: 'rectangle',
    color: '1', // red preset
    strokeWidth: 2,
  },
  draw: {
    brushType: 'pen',
    color: '1', // red preset
    strokeWidth: 2,
  },
}

/**
 * Merge a partial (possibly malformed) persisted blob over the defaults so
 * older preference files without certain keys still load cleanly.
 */
export function normalizeToolDefaults(
  raw: unknown,
): ToolDefaults {
  if (!raw || typeof raw !== 'object') return cloneToolDefaults(DEFAULT_TOOL_DEFAULTS)
  const merged = cloneToolDefaults(DEFAULT_TOOL_DEFAULTS)
  const obj = raw as Partial<ToolDefaults>
  if (obj['add-text'] && typeof obj['add-text'] === 'object') {
    const t = obj['add-text']
    if (typeof t['sticky.color'] === 'string') merged['add-text']['sticky.color'] = t['sticky.color']
    if (typeof t['plain.color'] === 'string' || t['plain.color'] === null)
      merged['add-text']['plain.color'] = t['plain.color']
  }
  if (obj['add-shape'] && typeof obj['add-shape'] === 'object') {
    const s = obj['add-shape']
    if (s.shapeKind === 'rectangle' || s.shapeKind === 'ellipse' || s.shapeKind === 'diamond')
      merged['add-shape'].shapeKind = s.shapeKind
    if (typeof s.color === 'string') merged['add-shape'].color = s.color
    if (typeof s.strokeWidth === 'number' && Number.isFinite(s.strokeWidth))
      merged['add-shape'].strokeWidth = s.strokeWidth
  }
  if (obj.draw && typeof obj.draw === 'object') {
    const d = obj.draw
    if (d.brushType === 'pen' || d.brushType === 'highlight') merged.draw.brushType = d.brushType
    if (typeof d.color === 'string') merged.draw.color = d.color
    if (typeof d.strokeWidth === 'number' && Number.isFinite(d.strokeWidth))
      merged.draw.strokeWidth = d.strokeWidth
  }
  return merged
}

function cloneToolDefaults(src: ToolDefaults): ToolDefaults {
  return {
    'add-text': { ...src['add-text'] },
    'add-shape': { ...src['add-shape'] },
    draw: { ...src.draw },
  }
}

/**
 * A typed patch for `setToolDefault`. Each variant updates one scope's value.
 * Keeping this discriminated lets IPC carry typed updates and the main-side
 * setter narrow without parsing.
 */
export type ToolDefaultPatch =
  | { scope: 'add-text'; key: 'sticky.color'; value: string }
  | { scope: 'add-text'; key: 'plain.color'; value: string | null }
  | { scope: 'add-shape'; key: 'shapeKind'; value: ShapeKind }
  | { scope: 'add-shape'; key: 'color'; value: string }
  | { scope: 'add-shape'; key: 'strokeWidth'; value: number }
  | { scope: 'draw'; key: 'brushType'; value: DrawingBrushType }
  | { scope: 'draw'; key: 'color'; value: string }
  | { scope: 'draw'; key: 'strokeWidth'; value: number }
