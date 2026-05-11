/**
 * Tool defaults runtime — mediator between the persisted defaults in
 * `preferences.ts` and the rest of the app (ADR 0006 §9).
 *
 * Creation paths (e.g. `register-canvas-entity-ipc.ts` for `add-text`,
 * `add-shape`; `useAnnotationDrawingGestures` for draw) read these via
 * `getToolDefault*` helpers when stamping new entities. The tool-mode popup
 * writes patches through `applyToolDefaultPatch`, which persists and triggers
 * a layout broadcast so the renderer's swatch state and `layoutRef` (read by
 * the draw gesture at stroke-start) both pick up the new value.
 *
 * Per ADR: not in Y.Doc, not in `.canvas`, not in undo/redo — user
 * preferences only.
 */

import {
  getToolDefaults as readToolDefaults,
  saveToolDefaults,
} from './preferences'
import { markDirty } from './layout-dirty'
import { requestLayout } from './surface-layout'
import type { ToolDefaults, ToolDefaultPatch } from '../../shared/tool-defaults'

export function getToolDefaults(): ToolDefaults {
  return readToolDefaults()
}

export function getStickyDefaultColor(): string {
  return readToolDefaults()['add-text']['sticky.color']
}

export function getPlainTextDefaultColor(): string | null {
  return readToolDefaults()['add-text']['plain.color']
}

export function getShapeDefaults(): ToolDefaults['add-shape'] {
  return readToolDefaults()['add-shape']
}

export function getDrawDefaults(): ToolDefaults['draw'] {
  return readToolDefaults().draw
}

/**
 * Apply a single typed patch. Persists to disk and marks the canvas surface
 * dirty so the renderer (which carries tool-defaults in its layout broadcast)
 * sees the new value on the next layout pass. `'floating-ui'` would be the
 * natural channel, but it's been retired in layout-engine — `'canvas'` is the
 * only flag that actually broadcasts `layout-update` to bg + above views.
 */
export function applyToolDefaultPatch(patch: ToolDefaultPatch): void {
  const current = readToolDefaults()
  if (currentValueFor(current, patch) === patch.value) return
  const next: ToolDefaults = {
    'add-text': { ...current['add-text'] },
    'add-shape': { ...current['add-shape'] },
    draw: { ...current.draw },
  }
  switch (patch.scope) {
    case 'add-text':
      if (patch.key === 'sticky.color') next['add-text']['sticky.color'] = patch.value
      else next['add-text']['plain.color'] = patch.value
      break
    case 'add-shape':
      if (patch.key === 'shapeKind') next['add-shape'].shapeKind = patch.value
      else if (patch.key === 'color') next['add-shape'].color = patch.value
      else next['add-shape'].strokeWidth = patch.value
      break
    case 'draw':
      if (patch.key === 'brushType') next.draw.brushType = patch.value
      else if (patch.key === 'color') next.draw.color = patch.value
      else next.draw.strokeWidth = patch.value
      break
  }
  saveToolDefaults(next)
  markDirty('canvas')
  requestLayout()
}

function currentValueFor(
  current: ToolDefaults,
  patch: ToolDefaultPatch,
): ToolDefaultPatch['value'] {
  switch (patch.scope) {
    case 'add-text':
      return patch.key === 'sticky.color'
        ? current['add-text']['sticky.color']
        : current['add-text']['plain.color']
    case 'add-shape':
      if (patch.key === 'shapeKind') return current['add-shape'].shapeKind
      if (patch.key === 'color') return current['add-shape'].color
      return current['add-shape'].strokeWidth
    case 'draw':
      if (patch.key === 'brushType') return current.draw.brushType
      if (patch.key === 'color') return current.draw.color
      return current.draw.strokeWidth
  }
}
