/**
 * Returns the page id that should hold keyboard input and receive forwarded
 * pointer/wheel events, or null when canvas-level UI (aboveView, an inline
 * editor, a tool gesture) owns keyboard instead.
 *
 * Selection — not a separate "focus" state — drives forwarding. The four
 * divergence cases from the plan are baked in:
 *
 *   1. Inline text editor active over a single-selected page
 *      (`interactionKind === 'editing-text'`) — keystrokes go to the
 *      editor's contenteditable, not the page.
 *   2. `toolMode === 'annotate-draw'` with a page selected — strokes are
 *      canvas-bound; the page must not capture keys.
 *   3. Active drag of a single-selected page
 *      (`interactionKind === 'dragging-entities'`) — Escape and arrow
 *      handling stay with the canvas.
 *   4. `toolMode === 'inspect'` or `'annotate-comment'` with a page
 *      selected — keyboard goes to the canvas (Escape exits the mode).
 *      When the comment composer opens, `commentOverlayActive` flips and
 *      keeps the predicate at null.
 */

import type { CanvasEntityKind } from './types'
import type { InteractionMode } from './interaction-types'

export type FocusToolMode =
  | 'select'
  | 'inspect'
  | 'annotate-comment'
  | 'annotate-draw'
  | 'annotate-region-select'

export type FocusSelectionInput =
  | { kind: 'none' }
  | { kind: 'single-entity'; entityId: string; entityKind: CanvasEntityKind }
  | { kind: 'multi-entity'; entityIds: readonly string[] }

export type ShouldFocusSelectedPageInputs = {
  selection: FocusSelectionInput
  interactionKind: InteractionMode['kind']
  toolMode: FocusToolMode
  commentOverlayActive: boolean
}

export function shouldFocusSelectedPage(
  inputs: ShouldFocusSelectedPageInputs,
): string | null {
  if (inputs.selection.kind !== 'single-entity') return null
  if (inputs.selection.entityKind !== 'page') return null
  if (inputs.interactionKind !== 'idle') return null
  if (inputs.toolMode !== 'select') return null
  if (inputs.commentOverlayActive) return null
  return inputs.selection.entityId
}
