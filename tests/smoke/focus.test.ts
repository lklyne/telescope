import { afterEach, describe, expect, it } from 'vitest'
import {
  createPages,
  deletePages,
  getCurrentFocus,
  requestFocus,
} from './app-client'
import { waitFor } from './test-utils'

/**
 * FocusReconciler smoke: focus lands correctly after mutations.
 * Spec docs/interaction-layer.md §9.
 *
 * Phase A scaffold: tests the reconciler when it acts on explicit
 * pendingFocus intent (current Phase 3 conservative mode). Phase C
 * flips to unconditional derivation; the .todo tests below validate
 * that focus reconciles after operations that don't set explicit
 * intent today.
 */

const createdPageIds: string[] = []

afterEach(async () => {
  if (createdPageIds.length) {
    await deletePages(createdPageIds.splice(0))
  }
})

describe('FocusReconciler', () => {
  // The reconciler bails when win.isFocused() is false (spec gotcha #6 — focus
  // ratchets storms on macOS). Smoke-test Electron doesn't have OS-level window
  // focus, so we can't verify the actual focus() side-effect end-to-end here.
  // The pure expectedFocus(state) function is unit-tested in
  // tests/unit/focus-reconciler.test.ts; this file validates wiring only.
  it('exposes the current focused-view key (or null in headless)', async () => {
    const { focused } = await getCurrentFocus()
    // In headless smoke focused is typically null; on a focused window it
    // returns the actual key. Either way the route should respond.
    expect(focused === null || typeof focused === 'string').toBe(true)
  })

  it('accepts focus intent without throwing', async () => {
    await requestFocus({ kind: 'aboveView' })
    await requestFocus({ kind: 'bgView' })
    // No assertion on actual focus — see header comment.
  })

  // Phase C flips: focus should land correctly after these operations
  // without requiring explicit setPendingFocus calls. Today the relevant
  // sites (page-factory, page-chrome, etc.) call webContents.focus()
  // imperatively — Phase C migrates them to setPendingFocus + markDirty.
  it.todo('focus lands on bgView after the last page is deleted (Phase C)')
  it.todo('focus lands on selected page after page create (Phase C)')
  it.todo('focus lands on toolbar after address-bar activation (Phase C)')
  it.todo('focus lands on aboveView when entering text-edit mode (Phase C)')
  it.todo('focus reconciles correctly across tab switches (Phase C)')
  it.todo('focus reconciles correctly after window blur/focus cycle (Phase C)')
})
