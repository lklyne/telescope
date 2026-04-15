import { contextBridge, ipcRenderer } from 'electron'
import type { ChromeHeaderElectronAPI, ChromeUpdateData } from '../shared/types'

function serializeDebugArg(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value
  }
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

function debugLog(level: 'log' | 'warn' | 'error', ...args: unknown[]): void {
  ipcRenderer.send('debug-log', {
    source: 'chrome-header',
    level,
    args: args.map(serializeDebugArg),
  })
}

const api: ChromeHeaderElectronAPI = {
  navigate: (url) => ipcRenderer.send('chrome-navigate', url),
  goBack: () => ipcRenderer.send('chrome-back'),
  goForward: () => ipcRenderer.send('chrome-forward'),
  openDevTools: () => ipcRenderer.send('chrome-open-devtools'),
  duplicate: () => ipcRenderer.send('chrome-duplicate'),
  reload: () => ipcRenderer.send('chrome-reload'),
  toggleLinked: () => ipcRenderer.send('chrome-toggle-linked'),
  debugLog: (...args) => debugLog('log', ...args),
  close: () => ipcRenderer.send('chrome-close'),
  drag: (dx, dy) => ipcRenderer.send('chrome-drag', { dx, dy }),
  select: () => ipcRenderer.send('chrome-select'),
  cyclePreset: (direction) => ipcRenderer.send('chrome-cycle-preset', direction),
  setPreset: (index) => ipcRenderer.send('chrome-set-preset', index),
  dropdownOpen: () => ipcRenderer.send('chrome-dropdown-open'),
  dropdownClose: () => ipcRenderer.send('chrome-dropdown-close'),
  getInitialData: () => ipcRenderer.invoke('get-theme-bootstrap'),
  onChromeUpdate: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ChromeUpdateData) => callback(data)
    ipcRenderer.on('chrome-update', handler)
    return () => ipcRenderer.removeListener('chrome-update', handler)
  },
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { isDark: boolean }) =>
      callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

window.addEventListener('error', (event) => {
  debugLog('error', event.message, event.filename, event.lineno, event.colno)
})

window.addEventListener('unhandledrejection', (event) => {
  debugLog('error', 'unhandledrejection', event.reason)
})

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

console.log = (...args: unknown[]) => {
  originalConsole.log(...args)
  debugLog('log', ...args)
}

console.warn = (...args: unknown[]) => {
  originalConsole.warn(...args)
  debugLog('warn', ...args)
}

console.error = (...args: unknown[]) => {
  originalConsole.error(...args)
  debugLog('error', ...args)
}

// Intercept wheel events on chrome headers and forward to canvas operations.
// Chrome headers don't need their own scrolling, so all wheel events become canvas ops.
window.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault()
    if (e.metaKey || e.ctrlKey) {
      ipcRenderer.send('canvas-zoom', {
        deltaY: e.deltaY,
        mouseX: e.screenX,
        mouseY: e.screenY,
      })
    } else {
      ipcRenderer.send('canvas-pan', { deltaX: e.deltaX, deltaY: e.deltaY })
    }
  },
  { passive: false, capture: true }
)
