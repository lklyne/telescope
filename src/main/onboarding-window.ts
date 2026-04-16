import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import type { OnboardingMode } from '../shared/types'
import { loadRenderer, preloadPath } from './runtime/load-renderer'
import { isDark } from './runtime/preferences'

let onboardingWindow: BrowserWindow | null = null
let pendingResolver: ((reason: 'complete' | 'dismiss') => void) | null = null
let currentMode: OnboardingMode = 'welcome'

const WINDOW_WIDTH = 560
const WINDOW_HEIGHT = 680

export function isOnboardingWindowOpen(): boolean {
  return onboardingWindow !== null && !onboardingWindow.isDestroyed()
}

export function focusOnboardingWindow(): void {
  if (isOnboardingWindowOpen()) onboardingWindow!.focus()
}

export function getOnboardingWebContents(): WebContents | null {
  if (!isOnboardingWindowOpen()) return null
  return onboardingWindow!.webContents
}

export function getOnboardingMode(): OnboardingMode {
  return currentMode
}

function createOnboardingWindow(mode: OnboardingMode): BrowserWindow {
  currentMode = mode
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Telescope Setup',
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: isDark() ? '#292524' : '#f5f5f4',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : {}),
    webPreferences: {
      preload: preloadPath('onboarding'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  loadRenderer(win, 'onboarding')
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (pendingResolver) {
      pendingResolver('dismiss')
      pendingResolver = null
    }
    onboardingWindow = null
  })
  return win
}

export function showOnboardingWindow(mode: OnboardingMode): Promise<'complete' | 'dismiss'> {
  if (isOnboardingWindowOpen()) {
    onboardingWindow!.focus()
    currentMode = mode
    return new Promise((resolve) => {
      pendingResolver = resolve
    })
  }
  onboardingWindow = createOnboardingWindow(mode)
  return new Promise((resolve) => {
    pendingResolver = resolve
  })
}

export function resolveOnboardingPromise(reason: 'complete' | 'dismiss'): void {
  if (pendingResolver) {
    pendingResolver(reason)
    pendingResolver = null
  }
}

export function closeOnboardingWindow(): void {
  if (isOnboardingWindowOpen()) {
    onboardingWindow!.close()
  }
}
