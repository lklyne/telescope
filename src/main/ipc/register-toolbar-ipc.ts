import { ipcMain } from 'electron'
import type { Tool, ToolDefaultPatch } from '../../shared/types'
import { applyToolDefaultPatch } from '../runtime/tool-defaults'
import {
  layoutCache,
  pan,
  requestLayout,
  setPan,
  setZoom,
  toolbarView,
  win,
  zoom,
  layoutAllViews,
} from '../runtime/surface-layout'
import {
  focusSelectedPage,
  getSelectedEntityIds,
  openInspectPanel,
  selectedPageId,
  setActiveTool,
  toggleBrowserMode,
  toggleLeftSidebar,
  toggleDevTools,
} from '../runtime/ui-actions'
import { endDevtoolsResize, setDevtoolsWidthFromScreenX } from '../runtime/window-shell'
import { selectBrowserTab } from '../runtime/runtime-core'
import { findPageById, setPendingFocus } from '../runtime/runtime-context'
import { addPageFromSource } from '../workspace-pages'
import { applyNavigationToSelectedPages } from '../navigation-sync'
import { workspaceViewMode as uiWorkspaceViewMode } from '../ui-state'

function recenterBrowserSelectionIfNeeded(): void {
  if (uiWorkspaceViewMode() !== 'browser') return
  focusSelectedPage()
}

export function registerToolbarIpc(): void {
  ipcMain.on('zoom-in', () => {
    setZoom(zoom + 0.1)
    layoutAllViews()
  })

  ipcMain.on('zoom-out', () => {
    setZoom(zoom - 0.1)
    layoutAllViews()
  })

  ipcMain.on('zoom-reset', () => {
    setZoom(1.0)
    if (!focusSelectedPage()) {
      setPan(0, 0)
      layoutAllViews()
    }
  })

  ipcMain.on('zoom-set', (_event, level: number) => {
    setZoom(level)
    if (level === 1.0 && focusSelectedPage()) return
    layoutAllViews()
  })

  ipcMain.on('toolbar-navigate-selection', (_event, url: string) => {
    if (!url) return
    applyNavigationToSelectedPages({ type: 'load-url', url })
  })

  ipcMain.on('toolbar-back-selection', () => {
    if (!getSelectedEntityIds().length) return
    applyNavigationToSelectedPages({ type: 'go-back', fallbackUrl: 'about:blank' })
  })

  ipcMain.on('toolbar-forward-selection', () => {
    if (!getSelectedEntityIds().length) return
    applyNavigationToSelectedPages({ type: 'go-forward', fallbackUrl: 'about:blank' })
  })

  ipcMain.on('toolbar-reload-selection', () => {
    if (!getSelectedEntityIds().length) return
    applyNavigationToSelectedPages({ type: 'reload', fallbackUrl: 'about:blank' })
  })

  ipcMain.on('toolbar-toggle-browser-mode', () => {
    toggleBrowserMode()
  })

  ipcMain.on('toolbar-set-tool', (_event, payload: Tool) => {
    if (!payload || typeof payload !== 'object' || typeof payload.kind !== 'string') return
    // Toolbar-initiated add-page inherits the URL of the currently-selected
    // page; the renderer doesn't know which page is selected.
    const tool: Tool =
      payload.kind === 'add-page' && payload.sourcePageId === undefined
        ? { ...payload, sourcePageId: selectedPageId() ?? undefined }
        : payload
    const result = setActiveTool(tool)
    if (result.kind === 'inspect') openInspectPanel()
  })

  ipcMain.on('tool-defaults-set', (_event, patch: ToolDefaultPatch) => {
    if (!patch || typeof patch !== 'object') return
    if (
      patch.scope !== 'add-text' &&
      patch.scope !== 'add-sticky' &&
      patch.scope !== 'add-shape' &&
      patch.scope !== 'draw'
    ) return
    applyToolDefaultPatch(patch)
  })

  ipcMain.on('toggle-devtools', () => {
    toggleDevTools()
    recenterBrowserSelectionIfNeeded()
  })

  ipcMain.on('toggle-left-sidebar', () => {
    toggleLeftSidebar()
  })

  ipcMain.on('devtools-resize-start', (_event, { screenX }: { screenX: number }) => {
    setDevtoolsWidthFromScreenX(screenX)
    recenterBrowserSelectionIfNeeded()
  })

  ipcMain.on('devtools-resize-move', (_event, { screenX }: { screenX: number }) => {
    setDevtoolsWidthFromScreenX(screenX)
    recenterBrowserSelectionIfNeeded()
  })

  ipcMain.on('devtools-resize-end', () => {
    endDevtoolsResize()
  })

  ipcMain.on('add-browser-page', (_event, presetIndex: number | 'custom') => {
    const result = addPageFromSource({
      presetIndex: typeof presetIndex === 'number' ? presetIndex : 0,
      customSize: presetIndex === 'custom',
      focus: true,
    })
    selectBrowserTab(result.pageId)

    // Focus the address bar after the new page finishes loading.
    // We must wait because Chromium auto-focuses a webContents when
    // its load completes, which would steal focus from the toolbar.
    const page = findPageById(result.pageId)
    if (toolbarView && page) {
      const focusToolbar = () => {
        if (!toolbarView) return
        setPendingFocus({ kind: 'toolbar' })
        requestLayout()
        toolbarView.webContents.send('focus-address-bar')
      }
      const wc = page.pageView.webContents
      if (wc.isLoading()) {
        const onDestroyed = () => wc.removeListener('did-finish-load', focusToolbar)
        wc.once('destroyed', onDestroyed)
        wc.once('did-finish-load', () => {
          wc.removeListener('destroyed', onDestroyed)
          focusToolbar()
        })
      } else {
        focusToolbar()
      }
    }
  })

  ipcMain.on('toolbar-dropdown-open', () => {
    if (!toolbarView || !win) return
    const { width, height } = win.getBounds()
    toolbarView.setBounds({ x: 0, y: 0, width, height })
  })

  ipcMain.on('toolbar-dropdown-close', () => {
    if (!toolbarView || !win) return
    const { width } = win.getBounds()
    toolbarView.setBounds({ x: 0, y: 0, width, height: layoutCache.toolbarHeight })
  })
}
