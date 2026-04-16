/**
 * User preferences — devtools panel width/tab persistence + onboarding state.
 */

import { app, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type {
  DevtoolsPanelTab,
  OnboardingState,
  OriginBinding,
  OriginBindings,
} from '../../shared/types'
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

type PreferencesFile = {
  devtoolsWidth?: number
  devtoolsPanelTab?: DevtoolsPanelTab | 'elements' | 'devtools'
  onboarding?: OnboardingState
  originBindings?: OriginBindings
}

function readPreferencesFile(): PreferencesFile {
  try {
    const file = preferencesPath()
    if (!existsSync(file)) return {}
    return JSON.parse(readFileSync(file, 'utf8')) as PreferencesFile
  } catch (error) {
    console.error('Failed to read preferences:', error)
    return {}
  }
}

function writePreferencesFile(next: PreferencesFile): void {
  try {
    writeFileSync(preferencesPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to write preferences:', error)
  }
}

export function loadOnboardingState(): OnboardingState {
  const parsed = readPreferencesFile()
  return parsed.onboarding ?? { completed: false }
}

export function saveOnboardingState(next: OnboardingState): void {
  const parsed = readPreferencesFile()
  writePreferencesFile({ ...parsed, onboarding: next })
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

let originBindings: OriginBindings = {}

export function loadPreferences(): void {
  const parsed = readPreferencesFile()
  if (typeof parsed.devtoolsWidth === 'number') {
    setUiDevtoolsWidth(clampDevtoolsWidth(parsed.devtoolsWidth))
  }
  const normalizedTab = normalizeDevtoolsPanelTab(parsed.devtoolsPanelTab)
  if (normalizedTab) {
    setUiDevtoolsPanelTab(normalizedTab)
  }
  if (parsed.originBindings && typeof parsed.originBindings === 'object') {
    originBindings = parsed.originBindings
  }
}

export function savePreferences(): void {
  const parsed = readPreferencesFile()
  writePreferencesFile({
    ...parsed,
    devtoolsWidth: uiDevtoolsWidth(),
    devtoolsPanelTab: uiDevtoolsPanelTab(),
    originBindings,
  })
}

export function getOriginBindings(): OriginBindings {
  return originBindings
}

export function getOriginBinding(origin: string): OriginBinding | undefined {
  return originBindings[origin]
}

export function setOriginBinding(origin: string, binding: OriginBinding): void {
  originBindings = { ...originBindings, [origin]: binding }
  savePreferences()
}

export function removeOriginBinding(origin: string): void {
  if (!(origin in originBindings)) return
  const next = { ...originBindings }
  delete next[origin]
  originBindings = next
  savePreferences()
}

export function isDark(): boolean {
  return nativeTheme.shouldUseDarkColors
}

export function frameColor(): string {
  // Match --surface-device-border token (stone-400 light, stone-600 dark)
  return isDark() ? '#57534e' : '#a8a29e'
}

export function broadcastTheme(): void {
  if (win) win.contentView.setBackgroundColor(isDark() ? '#44403c' : '#f5f5f4')
  const data = { isDark: isDark() }
  if (bgView) bgView.webContents.send('theme-changed', data)
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
