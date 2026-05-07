/**
 * Escape-to-exit-frame-focus fallback.
 *
 * The page-side `before-input-event` Escape branch in keyboard-shortcuts.ts
 * was confirmed flaky during Phase 1 manual testing — some pages or page
 * states swallow the event before the wrapping Electron handler sees it.
 * Registering a `globalShortcut` for Escape only while a frame is focused
 * gives a reliable second path: Escape always exits, regardless of whether
 * the page consumed it.
 *
 * Trade-off: while a frame is focused, the page itself never sees Escape
 * (it's intercepted globally). ADR 0001 explicitly accepts this — page
 * modals that want to close on Escape need to be dismissed from page UI
 * after the user Escapes out of focus first.
 */

import { app, globalShortcut } from 'electron'
import {
  exitFrameFocus,
  subscribeFrameFocus,
  type FrameFocusState,
} from './frame-focus'
import { markDirty } from './layout-dirty'
import { requestLayout } from './viewport-control'

let installed = false

export function installFrameFocusEscapeShortcut(): void {
  if (installed) return
  installed = true

  const ensureRegistered = (state: FrameFocusState): void => {
    if (!app.isReady()) return
    const wantRegistered = state !== null
    const isRegistered = globalShortcut.isRegistered('Escape')
    if (wantRegistered === isRegistered) return
    if (wantRegistered) {
      const ok = globalShortcut.register('Escape', () => {
        exitFrameFocus('escape')
        markDirty('canvas')
        requestLayout()
      })
      if (!ok) {
        console.warn('[frame-focus] failed to register global Escape shortcut')
      }
    } else {
      globalShortcut.unregister('Escape')
    }
  }

  subscribeFrameFocus((state) => {
    ensureRegistered(state)
  })

  app.on('will-quit', () => {
    if (globalShortcut.isRegistered('Escape')) {
      globalShortcut.unregister('Escape')
    }
  })
}
