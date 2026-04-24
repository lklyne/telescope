import type { BaseWindow, BrowserWindow, WebContentsView } from 'electron'

// --- Electron window and view references ---
// These are non-serializable Electron objects used for layout and rendering.

export let win: BaseWindow | null = null
export let bgView: WebContentsView | null = null
export let leftSidebarView: WebContentsView | null = null
export let toolbarView: WebContentsView | null = null
export let devtoolsBackgroundView: WebContentsView | null = null
export let devtoolsHeaderView: WebContentsView | null = null
export let devtoolsView: WebContentsView | null = null
export let devtoolsResizeHandleView: WebContentsView | null = null
/** Consolidated above-pages WCV: input gate + marquee + comments + annotations + drawing + floating-ui.
 *  Agent-presence cursors render in cursorOverlayWindow (below), not here. */
export let aboveView: WebContentsView | null = null
/** Child BrowserWindow sibling of `win` — transparent, frameless, mouse-inert.
 *  Hosts agent-presence cursors only. Lives outside the WCV stack because
 *  Electron 40's WebContentsView has no setIgnoreMouseEvents (electron#23863),
 *  so a WCV can't be click-through. Bounds track win.getContentBounds() +
 *  toolbar inset. Never captures input. See docs/interaction-layer.md §7. */
export let cursorOverlayWindow: BrowserWindow | null = null

export function setWin(value: BaseWindow | null): void {
  win = value
}

export function setBgView(value: WebContentsView | null): void {
  bgView = value
}

export function setLeftSidebarView(value: WebContentsView | null): void {
  leftSidebarView = value
}

export function setToolbarView(value: WebContentsView | null): void {
  toolbarView = value
}

export function setDevtoolsBackgroundView(value: WebContentsView | null): void {
  devtoolsBackgroundView = value
}

export function setDevtoolsHeaderView(value: WebContentsView | null): void {
  devtoolsHeaderView = value
}

export function setDevtoolsView(value: WebContentsView | null): void {
  devtoolsView = value
}

export function setDevtoolsResizeHandleView(value: WebContentsView | null): void {
  devtoolsResizeHandleView = value
}

export function setAboveView(value: WebContentsView | null): void {
  aboveView = value
}

export function setCursorOverlayWindow(value: BrowserWindow | null): void {
  cursorOverlayWindow = value
}
