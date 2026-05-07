/**
 * Frame focus — main-process state for "the user is currently interacting
 * with frame X's content."
 *
 * See docs/adr/0001-click-to-enter-frame-focus.md.
 *
 * Pure module: state + transitions + subscribers. Uses no Electron APIs
 * directly so the state machine stays unit-testable. Side effects (IPC,
 * keyboard hooks, page lifecycle) live at call sites.
 */

export type FrameFocusState = { id: string; since: number } | null

export type FrameFocusEnterReason = 'click' | 'programmatic'
export type FrameFocusExitReason =
  | 'blur'
  | 'escape'
  | 'frame-deleted'
  | 'tab-switch'
  | 'view-mode-switch'
  | 'programmatic'

export type FrameFocusTransition =
  | { kind: 'enter'; id: string; reason: FrameFocusEnterReason; since: number }
  | { kind: 'exit'; id: string; reason: FrameFocusExitReason }

type Listener = (state: FrameFocusState, transition: FrameFocusTransition) => void

let state: FrameFocusState = null
const listeners = new Set<Listener>()

// While true, focus events from page webContents are ignored. Set by the
// FocusReconciler runtime around programmatic focus() calls so they don't
// flip frameFocus into "user clicked into the frame."
let suppressFocusEvents = false

export function currentFrameFocus(): FrameFocusState {
  return state
}

export function isFrameFocused(id: string): boolean {
  return state?.id === id
}

export function focusedFrameId(): string | null {
  return state?.id ?? null
}

/**
 * Promote a frame to focused. Idempotent: re-entering the same frame is a
 * no-op. Switching to a different frame fires exit('programmatic') for the
 * previous frame followed by enter for the new one.
 */
export function enterFrameFocus(id: string, reason: FrameFocusEnterReason = 'click', now: number = Date.now()): void {
  if (state?.id === id) return
  if (state) exitFrameFocus('programmatic')
  state = { id, since: now }
  notify({ kind: 'enter', id, reason, since: now })
}

/**
 * Clear focus. No-op when nothing is focused. Always safe to call.
 */
export function exitFrameFocus(reason: FrameFocusExitReason): void {
  if (!state) return
  const id = state.id
  state = null
  notify({ kind: 'exit', id, reason })
}

/**
 * Clear focus only if the focused frame matches. Used by frame-deleted
 * handlers that don't care when a different frame is focused.
 */
export function exitFrameFocusIfMatches(id: string, reason: FrameFocusExitReason): void {
  if (state?.id !== id) return
  exitFrameFocus(reason)
}

export function subscribeFrameFocus(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Run `fn` with focus events suppressed. Used to wrap programmatic focus()
 * calls so the resulting webContents `focus` event doesn't get classified
 * as a user click-to-enter. The suppression flag is restored even if `fn`
 * throws.
 */
export function withFocusEventsSuppressed<T>(fn: () => T): T {
  const previous = suppressFocusEvents
  suppressFocusEvents = true
  try {
    return fn()
  } finally {
    suppressFocusEvents = previous
  }
}

export function areFocusEventsSuppressed(): boolean {
  return suppressFocusEvents
}

/** Test-only reset. */
export function _resetFrameFocusForTests(): void {
  state = null
  suppressFocusEvents = false
  listeners.clear()
}

function notify(transition: FrameFocusTransition): void {
  for (const listener of listeners) {
    try {
      listener(state, transition)
    } catch (error) {
      console.error('[frame-focus] listener threw', error)
    }
  }
}
