/**
 * User preferences — devtools panel width/tab persistence.
 */

import { app, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { DevtoolsPanelTab } from '../../shared/types'
import {
  bgView,
  aboveView,

  devtoolsBackgroundView,
  devtoolsHeaderView,
  devtoolsResizeHandleView,
  leftSidebarView,

  toolbarView,
  win,
} from './view-refs'
import {
  hoverTarget,
  pages,
} from './runtime-context'
import {
  devtoolsPanelTab as uiDevtoolsPanelTab,
  devtoolsWidth as uiDevtoolsWidth,
  selectedEntityIds as uiSelectedEntityIds,
  setDevtoolsPanelTab as setUiDevtoolsPanelTab,
  setDevtoolsWidth as setUiDevtoolsWidth,
} from '../ui-state'

import {
  DEVTOOLS_MAX_WIDTH,
  DEVTOOLS_MIN_WIDTH,
  PREFERENCES_FILE,
} from './runtime-constants'

function preferencesPath(): string {
  return join(app.getPath('userData'), PREFERENCES_FILE)
}

export function normalizeDevtoolsPanelTab(
  tab: DevtoolsPanelTab | 'elements' | 'devtools' | undefined,
): DevtoolsPanelTab | null {
  if (tab === 'elements') return 'inspect'
  if (tab === 'devtools') return 'browser-devtools'
  if (
    tab === 'comments' ||
    tab === 'inspect' ||
    tab === 'browser-devtools' ||
    tab === 'settings'
  ) {
    return tab
  }
  return null
}

export function clampDevtoolsWidth(value: number): number {
  const maxByWindow = win
    ? Math.floor(win.getBounds().width * 0.8)
    : DEVTOOLS_MAX_WIDTH
  return Math.max(
    DEVTOOLS_MIN_WIDTH,
    Math.min(DEVTOOLS_MAX_WIDTH, maxByWindow, Math.round(value)),
  )
}

export function loadPreferences(): void {
  try {
    const file = preferencesPath()
    if (!existsSync(file)) return
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      devtoolsWidth?: number
      devtoolsPanelTab?: DevtoolsPanelTab | 'elements' | 'devtools'
    }
    if (typeof parsed.devtoolsWidth === 'number') {
      setUiDevtoolsWidth(clampDevtoolsWidth(parsed.devtoolsWidth))
    }
    const normalizedTab = normalizeDevtoolsPanelTab(parsed.devtoolsPanelTab)
    if (normalizedTab) {
      setUiDevtoolsPanelTab(normalizedTab)
    }
  } catch (error) {
    console.error('Failed to load preferences:', error)
  }
}

export function savePreferences(): void {
  try {
    writeFileSync(
      preferencesPath(),
      JSON.stringify(
        {
          devtoolsWidth: uiDevtoolsWidth(),
          devtoolsPanelTab: uiDevtoolsPanelTab(),
        },
        null,
        2,
      ),
      'utf8',
    )
  } catch (error) {
    console.error('Failed to save preferences:', error)
  }
}

export function isDark(): boolean {
  return nativeTheme.shouldUseDarkColors
}

export function frameColor(): string {
  // Match --surface-device-border token (stone-400 light, stone-600 dark)
  return isDark() ? '#57534e' : '#a8a29e'
}

/**
 * Opaque background color for the content panel (bgView). Drawn behind the
 * canvas so the rounded-corner inset panel has a solid fill, while the
 * window's vibrancy shows through in the sidebar column and around the panel.
 */
export function contentPanelColor(): string {
  return isDark() ? '#18181b' : '#fafafa'
}

export function broadcastTheme(): void {
  if (win) win.contentView.setBackgroundColor(isDark() ? '#44403c' : '#f5f5f4')
  const data = { isDark: isDark() }
  if (bgView) {
    bgView.setBackgroundColor(contentPanelColor())
    bgView.webContents.send('theme-changed', data)
  }
  if (leftSidebarView) leftSidebarView.webContents.send('theme-changed', data)
  if (toolbarView) toolbarView.webContents.send('theme-changed', data)
  if (aboveView && !aboveView.webContents.isDestroyed()) {
    aboveView.webContents.send('theme-changed', data)
  }
  if (devtoolsHeaderView)
    devtoolsHeaderView.webContents.send('theme-changed', data)
  if (devtoolsBackgroundView) {
    devtoolsBackgroundView.setBackgroundColor(isDark() ? '#18181b' : '#fafafa')
  }
  if (devtoolsResizeHandleView && !devtoolsResizeHandleView.webContents.isDestroyed()) {
    devtoolsResizeHandleView.webContents.send('theme-changed', data)
  }
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    page.frameView.setBackgroundColor(frameColor())
    page.chromeView.webContents.send('theme-changed', data)
  }
}
