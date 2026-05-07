/**
 * Page cursor bridge — mirror the focused frame's `cursor-changed` events
 * onto aboveView's `<body>` CSS cursor so the OS shows the right pointer
 * (hand on links, I-beam over text, etc).
 *
 * The OS picks the cursor from the topmost WebContentsView at the pointer
 * location. With aboveView always covering the canvas in canvas mode
 * (PoC `docs/plans/aboveview-interactive-layer-poc.md`), the page's own
 * cursor styling never reaches the OS — so we forward Chromium's chosen
 * cursor type to aboveView and let aboveView drive `document.body.cursor`.
 *
 * Pure plumbing: subscribes to `frame-focus`, attaches a `cursor-changed`
 * listener to the focused page's webContents, broadcasts the cursor type
 * to aboveView via `aboveview-cursor-update`. On exit (or refocus) the
 * previous listener is detached and the cursor is reset.
 */

import { findPageById } from './runtime-context'
import { subscribeFrameFocus } from './frame-focus'
import { aboveView } from './view-refs'
import { safeSend } from './safe-send'

type CursorChangeEvent = (event: Electron.Event, type: string) => void

let installed = false
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

export function installPageCursorBridge(): void {
  if (installed) return
  installed = true

  subscribeFrameFocus((state) => {
    if (!state) {
      detach()
      reset()
      return
    }
    if (state.id === attachedFrameId) return
    detach()
    attach(state.id)
  })
}
