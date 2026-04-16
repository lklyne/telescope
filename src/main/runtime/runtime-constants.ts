/**
 * Shared layout and debug constants used across runtime modules.
 */

// --- Layout geometry ---
export const CARD_BORDER_WIDTH = 1
export const CARD_BORDER_RADIUS = 0
export const CHROME_HEADER_HEIGHT = 44
export const CHROME_PAGE_GAP = 0
export { TOOLBAR_HEIGHT } from '../../shared/constants'
export const TOOLBAR_BORDER_LIGHT = '#d4d4d8'
export const TOOLBAR_BORDER_DARK = '#3f3f46'
export const BROWSER_HEADER_HEIGHT = 36
export const LEFT_SIDEBAR_WIDTH = 256

// --- Content panel (Arc-style inset rounded area to the right of sidebar) ---
// The content panel is the opaque, rounded-corner region that holds canvas,
// toolbar, pages, and devtools. It sits inside the window with CONTENT_INSET
// padding on top, right, and bottom (the sidebar itself sits flush to the
// left window edge). The gap between sidebar and content panel is also
// CONTENT_INSET, so the sidebar's translucent vibrancy frames the panel.
export const CONTENT_INSET = 8
export const CONTENT_BORDER_RADIUS = 10

// --- DevTools panel ---
export const DEVTOOLS_DEFAULT_WIDTH = 400
export const DEVTOOLS_MIN_WIDTH = 280
export const DEVTOOLS_MAX_WIDTH = 960
export const DEVTOOLS_RESIZE_HANDLE_WIDTH = 12
export const DEVTOOLS_PANEL_PADDING = 4
export const DEVTOOLS_HEADER_HEIGHT = 34
export const DEVTOOLS_HEADER_GAP = 0

// --- Preferences ---
export const PREFERENCES_FILE = 'preferences.json'

// --- Debug ---
export const SELECTION_DEBUG = process.env.CANVAS_DEBUG_SELECTION === '1'
export const COMMENT_BADGE_DEBUG = process.env.CANVAS_DEBUG_COMMENT_BADGES === '1'
export const DEVTOOLS_PANEL_DEBUG = process.env.CANVAS_DEBUG_DEVTOOLS_PANEL === '1'

export function selectionDebug(event: string, details?: Record<string, unknown>): void {
  if (!SELECTION_DEBUG) return
  console.log('[selection-debug:main]', { ts: Date.now(), event, ...details })
}

export function devtoolsPanelDebug(event: string, details?: Record<string, unknown>): void {
  if (!DEVTOOLS_PANEL_DEBUG) return
  console.log('[devtools-panel-debug:main]', { ts: Date.now(), event, ...details })
}
