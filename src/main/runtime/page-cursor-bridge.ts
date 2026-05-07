/**
 * Page cursor bridge — mirror the keyboard-target frame's `cursor-changed`
 * events onto aboveView's `<body>` CSS cursor so the OS shows the right
 * pointer (hand on links, I-beam over text, etc).
 *
 * The OS picks the cursor from the topmost WebContentsView at the pointer
 * location. With aboveView always covering the canvas in canvas mode, the
 * page's own cursor styling never reaches the OS — so we forward
 * Chromium's chosen cursor type to aboveView and let aboveView drive
 * `document.body.cursor`.
 *
 * Reconciles per layout pass: compares the predicate-derived keyboard
 * target against the currently-attached frame and (de)attaches the
 * `cursor-changed` listener accordingly. Called from `layoutAllViews()`
 * alongside `reconcileFocus()`.
 */

import { findPageById } from './runtime-context'
import { currentKeyboardTargetFrameId } from './selection-controller'
import { aboveView } from './view-refs'
import { safeSend } from './safe-send'

type CursorChangeEvent = (event: Electron.Event, type: string) => void

let attachedFrameId: string | null = null
let attachedListener: CursorChangeEvent | null = null

function detach(): void {
  if (!attachedFrameId || !attachedListener) {
    attachedFrameId = null
    attachedListener = null
    return
  }
  const page = findPageById(attachedFrameId)
  if (page && !page.pageView.webContents.isDestroyed()) {
    page.pageView.webContents.off('cursor-changed', attachedListener)
  }
  attachedFrameId = null
  attachedListener = null
}

function attach(frameId: string): void {
  const page = findPageById(frameId)
  if (!page || page.pageView.webContents.isDestroyed()) return
  const listener: CursorChangeEvent = (_event, type) => {
    if (!aboveView || aboveView.webContents.isDestroyed()) return
    safeSend(aboveView.webContents, 'aboveview-cursor-update', { type })
  }
  page.pageView.webContents.on('cursor-changed', listener)
  attachedFrameId = frameId
  attachedListener = listener
}

function reset(): void {
  if (!aboveView || aboveView.webContents.isDestroyed()) return
  safeSend(aboveView.webContents, 'aboveview-cursor-update', { type: null })
}

export function reconcilePageCursorBridge(): void {
  const target = currentKeyboardTargetFrameId()
  if (target === attachedFrameId) return
  detach()
  if (target) {
    attach(target)
  } else {
    reset()
  }
}
