/**
 * Test-only HTTP routes for smoke tests. Exposes minimal hooks into the
 * InteractionController, FocusReconciler, and DropOwner so smoke tests
 * can exercise the integrated state machine without simulating native
 * pointer events. Not for production use.
 *
 * Spec docs/interaction-layer.md §9 (testing strategy).
 */

import { writeJson } from '../app-control-server'
import {
  peek as peekInteractionMode,
  tryEnter,
  commit as commitInteraction,
  cancel as cancelInteraction,
  cancelActive,
  __resetForTests as resetInteractionForTests,
  type TryEnterInput,
} from '../runtime/interaction-controller'
import { currentEditingEntityId } from '../runtime/editing-entity-runtime'
import {
  consumeDragId,
  __resetForTests as resetDropOwnerForTests,
} from '../runtime/drop-owner'
import { setPendingFocus, pages } from '../runtime/runtime-context'
import { markDirty } from '../runtime/layout-dirty'
import { requestLayout } from '../runtime/viewport-control'
import { aboveView, bgView, toolbarView, leftSidebarView } from '../runtime/view-refs'
import type { Route } from './types'
import type { Token, CancelReason, FocusTarget } from '../../shared/interaction-types'
import { activeTool } from '../runtime/tool-mode'
import { clipboard } from 'electron'
import { pasteFromClipboard } from '../clipboard-paste'

function currentlyFocusedKey(): string | null {
  if (bgView?.webContents.isFocused()) return 'bgView'
  if (aboveView?.webContents.isFocused()) return 'aboveView'
  if (toolbarView?.webContents.isFocused()) return 'toolbar'
  if (leftSidebarView?.webContents.isFocused()) return 'sidebar'
  for (const p of pages) {
    if (p.pageView.webContents.isFocused()) return `page:${p.id}`
  }
  return null
}

export const testRoutes: Route[] = [
  // --- InteractionController ---
  {
    method: 'GET',
    pattern: '/test/interaction/mode',
    async handler({ response }) {
      writeJson(response, 200, {
        mode: peekInteractionMode(),
        editingEntityId: currentEditingEntityId(),
      })
    },
  },
  {
    method: 'POST',
    pattern: '/test/interaction/begin',
    async handler({ response, body }) {
      const input = body as TryEnterInput
      const result = tryEnter(input)
      if ('refused' in result) {
        writeJson(response, 409, { refused: true, reason: result.reason })
        return
      }
      writeJson(response, 200, { token: result })
    },
  },
  {
    method: 'POST',
    pattern: '/test/interaction/commit',
    async handler({ response, body }) {
      const { token } = body as { token: Token }
      commitInteraction(token)
      writeJson(response, 200, { ok: true, mode: peekInteractionMode() })
    },
  },
  {
    method: 'POST',
    pattern: '/test/interaction/cancel',
    async handler({ response, body }) {
      const { token, reason } = body as { token: Token; reason: CancelReason }
      cancelInteraction(token, reason)
      writeJson(response, 200, { ok: true, mode: peekInteractionMode() })
    },
  },
  {
    method: 'POST',
    pattern: '/test/interaction/cancel-active',
    async handler({ response, body }) {
      const { reason } = body as { reason: CancelReason }
      cancelActive(reason)
      writeJson(response, 200, { ok: true, mode: peekInteractionMode() })
    },
  },
  {
    method: 'POST',
    pattern: '/test/interaction/reset',
    async handler({ response }) {
      resetInteractionForTests()
      writeJson(response, 200, { ok: true })
    },
  },

  // --- FocusReconciler ---
  {
    method: 'GET',
    pattern: '/test/focus/current',
    async handler({ response }) {
      writeJson(response, 200, { focused: currentlyFocusedKey() })
    },
  },
  {
    method: 'POST',
    pattern: '/test/focus/request',
    async handler({ response, body }) {
      const { target } = body as { target: FocusTarget }
      setPendingFocus(target)
      markDirty('bounds')
      requestLayout()
      writeJson(response, 200, { ok: true })
    },
  },

  // --- DropOwner ---
  {
    method: 'POST',
    pattern: '/test/drop/consume-drag-id',
    async handler({ response, body }) {
      const { dragId } = body as { dragId: string }
      const wasConsumed = consumeDragId(dragId)
      writeJson(response, 200, { wasConsumed })
    },
  },
  {
    method: 'POST',
    pattern: '/test/drop/reset',
    async handler({ response }) {
      resetDropOwnerForTests()
      writeJson(response, 200, { ok: true })
    },
  },

  // --- Tool state ---
  {
    method: 'GET',
    pattern: '/test/tool/current',
    async handler({ response }) {
      writeJson(response, 200, { tool: activeTool() })
    },
  },

  // --- Clipboard simulation ---
  // Tests write text to the system clipboard and trigger smart-paste so they
  // can exercise URL → page, plain text → sticky, etc., without IPC plumbing.
  {
    method: 'POST',
    pattern: '/test/clipboard/paste',
    async handler({ response, body }) {
      const { text, canvasX = 0, canvasY = 0 } = body as {
        text?: string
        canvasX?: number
        canvasY?: number
      }
      if (typeof text === 'string') clipboard.writeText(text)
      pasteFromClipboard({ canvasX, canvasY })
      writeJson(response, 200, { ok: true })
    },
  },

  // --- Keyboard simulation ---
  {
    method: 'POST',
    pattern: '/test/keyboard/send',
    async handler({ response, body }) {
      const {
        key,
        cmd = false,
        shift = false,
        alt = false,
        target = 'aboveView',
        pageId,
      } = body as {
        key: string
        cmd?: boolean
        shift?: boolean
        alt?: boolean
        target?: 'aboveView' | 'bgView' | 'toolbar' | 'page'
        pageId?: string
      }
      let wc: Electron.WebContents | undefined
      if (target === 'page') {
        const page = pages.find((p) => p.id === pageId)
        wc = page?.pageView.webContents
      } else if (target === 'bgView') {
        wc = bgView?.webContents
      } else if (target === 'toolbar') {
        wc = toolbarView?.webContents
      } else {
        wc = aboveView?.webContents
      }
      if (!wc || wc.isDestroyed()) {
        writeJson(response, 500, { error: 'target webContents unavailable' })
        return
      }
      // sendInputEvent triggers before-input-event in the main process, which
      // the binding dispatcher picks up — no actual key is delivered to the page.
      // Use 'meta' for cmd since Electron runs on macOS in this project.
      const modifiers: string[] = []
      if (cmd) modifiers.push('meta')
      if (shift) modifiers.push('shift')
      if (alt) modifiers.push('alt')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers } as any)
      writeJson(response, 200, { ok: true })
    },
  },
]
