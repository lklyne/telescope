/**
 * Frame-focus → selection mirror.
 *
 * ADR 0001 introduces frame focus as the gate-closer that lets a focused
 * page receive native input. Selection is a separate concept (canvas-level
 * visual state: chrome, resize handles, frame border, page interactive
 * flag in `overlay-manager.ts`). They are coupled for frames: when the
 * user focuses a frame, the user has selected it; when the user exits
 * focus by clicking outside or pressing Escape, the user has deselected.
 *
 * This subscriber is the single place that performs the coupling so every
 * focus entry path (router IPC, page webContents `focus`, programmatic
 * page-creation focus, test routes) yields the same selection state.
 *
 * Exit reasons handled:
 *   - blur, escape  → user-driven; clear selection if it still points at
 *                     the previously-focused frame.
 *   - tab-switch, view-mode-switch, frame-deleted, programmatic →
 *                     leave selection alone; those flows manage selection
 *                     themselves or are about to enter focus on another
 *                     frame.
 */

import { subscribeFrameFocus } from './frame-focus'
import { selectNone, selectPageById } from './selection-controller'
import { getUiState } from '../ui-state'

let installed = false

export function installFrameFocusSelectionMirror(): void {
  if (installed) return
  installed = true

  subscribeFrameFocus((_state, transition) => {
    if (transition.kind === 'enter') {
      selectPageById(transition.id)
      return
    }
    if (transition.reason !== 'blur' && transition.reason !== 'escape') return
    const selection = getUiState().selection
    if (
      selection.kind === 'single-entity' &&
      selection.entityKind === 'frame' &&
      selection.entityId === transition.id
    ) {
      selectNone()
    }
  })
}
