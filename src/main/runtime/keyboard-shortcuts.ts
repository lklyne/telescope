/**
 * Keyboard shortcuts — modifier key detection and single-key tool shortcuts.
 */

import type { WebContents } from 'electron'
import { DRAWING_FEATURE_ENABLED } from '../../shared/featureFlags'
import { arrowNavigationLocked, setArrowNavigationLocked, setSpaceModifierHeld } from './runtime-context'
import { undo, redo, canUndo, canRedo } from './workspace-undo'
import { pendingPlacement as uiPendingPlacement } from '../ui-state'
import { selectAdjacentPage } from './selection-state'
import { layoutAllViews } from './layout-engine'

type ArrowDirection = 'left' | 'right' | 'up' | 'down'

const modifierKeyWatchers = new WeakSet<WebContents>()

// Track text-editing state per webContents so renderers don't clobber each
// other's flag. Any one source being active is enough to suppress shortcuts.
const textEditingByWebContents = new WeakMap<WebContents, boolean>()
let textEditingActiveCount = 0

export function setTextEditingActive(webContents: WebContents, active: boolean): void {
  const prev = textEditingByWebContents.get(webContents) ?? false
  if (prev === active) return
  textEditingByWebContents.set(webContents, active)
  textEditingActiveCount += active ? 1 : -1
  if (textEditingActiveCount < 0) textEditingActiveCount = 0
}

function isTextEditingActive(): boolean {
  return textEditingActiveCount > 0
}

// Late-bound references to runtime-core functions
let _cancelPendingPlacement: () => void = () => {}
let _clearToolMode: () => void = () => {}
let _toggleAnnotateMode: () => boolean = () => false
let _toggleDrawMode: () => boolean = () => false
let _setZoom: (value: number) => void = () => {}
let _setPan: (x: number, y: number) => void = () => {}
let _focusSelectedPage: () => boolean = () => false
let _groupSelectedEntities: () => unknown = () => null
let _ungroupSelectedGroup: () => unknown = () => null

export function wireKeyboardShortcuts(fns: {
  cancelPendingPlacement: () => void
  clearToolMode: () => void
  toggleAnnotateMode: () => boolean
  toggleDrawMode: () => boolean
  setZoom: (value: number) => void
  setPan: (x: number, y: number) => void
  focusSelectedPage: () => boolean
  groupSelectedEntities: () => unknown
  ungroupSelectedGroup: () => unknown
}): void {
  _cancelPendingPlacement = fns.cancelPendingPlacement
  _clearToolMode = fns.clearToolMode
  _toggleAnnotateMode = fns.toggleAnnotateMode
  _toggleDrawMode = fns.toggleDrawMode
  _setZoom = fns.setZoom
  _setPan = fns.setPan
  _focusSelectedPage = fns.focusSelectedPage
  _groupSelectedEntities = fns.groupSelectedEntities
  _ungroupSelectedGroup = fns.ungroupSelectedGroup
}

function selectAdjacentPageOnce(direction: ArrowDirection): boolean {
  if (arrowNavigationLocked) return false
  const changed = selectAdjacentPage(direction)
  if (!changed) return false
  setArrowNavigationLocked(true)
  setTimeout(() => {
    setArrowNavigationLocked(false)
  }, 0)
  return true
}

export function watchModifierKeys(webContents: WebContents, { handleShortcuts = true } = {}): void {
  if (modifierKeyWatchers.has(webContents)) return
  modifierKeyWatchers.add(webContents)

  webContents.on('destroyed', () => {
    if (textEditingByWebContents.get(webContents)) {
      textEditingActiveCount = Math.max(0, textEditingActiveCount - 1)
    }
    textEditingByWebContents.delete(webContents)
  })

  webContents.on('before-input-event', (event, input) => {
    // Track Space modifier regardless of editing state — space-to-pan needs
    // to stay in sync even if focus is in an unrelated input that doesn't
    // consume Space (and inputs that do consume Space will preventDefault
    // natively, which we respect).
    if (input.key === ' ' || input.code === 'Space') {
      setSpaceModifierHeld(input.type === 'keyDown')
    }

    // When a renderer-owned input or contenteditable is focused, let every
    // keystroke pass through to it natively — including Cmd+Z/Cmd+Shift+Z
    // (text undo), Cmd+1, arrows, and single-letter tool shortcuts.
    if (isTextEditingActive()) {
      return
    }

    if (
      input.type === 'keyDown' &&
      input.key === 'Escape' &&
      !input.shift &&
      !input.meta &&
      !input.control &&
      !input.alt &&
      uiPendingPlacement()
    ) {
      event.preventDefault()
      _cancelPendingPlacement()
      return
    }

    // Undo: Cmd+Z
    if (
      input.type === 'keyDown' &&
      input.meta &&
      input.key.toLowerCase() === 'z' &&
      !input.shift &&
      !input.control &&
      !input.alt
    ) {
      if (canUndo()) {
        event.preventDefault()
        undo()
        return
      }
    }

    // Redo: Cmd+Shift+Z
    if (
      input.type === 'keyDown' &&
      input.meta &&
      input.shift &&
      input.key.toLowerCase() === 'z' &&
      !input.control &&
      !input.alt
    ) {
      if (canRedo()) {
        event.preventDefault()
        redo()
        return
      }
    }

    if (input.type === 'keyDown' && input.meta && input.key === '1') {
      event.preventDefault()
      _setZoom(1.0)
      if (!_focusSelectedPage()) {
        _setPan(0, 0)
        layoutAllViews()
      }
      return
    }

    if (input.type === 'keyDown') {
      if (input.key === 'ArrowLeft' && selectAdjacentPageOnce('left')) {
        event.preventDefault()
        return
      }
      if (input.key === 'ArrowRight' && selectAdjacentPageOnce('right')) {
        event.preventDefault()
        return
      }
      if (input.key === 'ArrowUp' && selectAdjacentPageOnce('up')) {
        event.preventDefault()
        return
      }
      if (input.key === 'ArrowDown' && selectAdjacentPageOnce('down')) {
        event.preventDefault()
        return
      }
    }

    if (
      handleShortcuts &&
      input.type === 'keyDown' &&
      input.key.toLowerCase() === 'v' &&
      !input.shift &&
      !input.meta &&
      !input.control &&
      !input.alt
    ) {
      event.preventDefault()
      _clearToolMode()
      return
    }

    if (
      handleShortcuts &&
      input.type === 'keyDown' &&
      input.key.toLowerCase() === 'c' &&
      !input.shift &&
      !input.meta &&
      !input.control &&
      !input.alt
    ) {
      event.preventDefault()
      _toggleAnnotateMode()
      return
    }

    if (
      DRAWING_FEATURE_ENABLED &&
      handleShortcuts &&
      input.type === 'keyDown' &&
      input.key.toLowerCase() === 'd' &&
      !input.shift &&
      !input.meta &&
      !input.control &&
      !input.alt
    ) {
      event.preventDefault()
      _toggleDrawMode()
      return
    }

    if (
      input.type === 'keyDown' &&
      input.meta &&
      input.key.toLowerCase() === 'g' &&
      !input.shift &&
      !input.control &&
      !input.alt
    ) {
      event.preventDefault()
      _groupSelectedEntities()
      return
    }

    if (
      input.type === 'keyDown' &&
      input.meta &&
      input.shift &&
      input.key.toLowerCase() === 'g' &&
      !input.control &&
      !input.alt
    ) {
      event.preventDefault()
      _ungroupSelectedGroup()
      return
    }
  })
}
