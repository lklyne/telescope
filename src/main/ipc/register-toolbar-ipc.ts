import { ipcMain } from 'electron'
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
  cancelPendingPlacement,
  clearToolMode,
  focusSelectedPage,
  getSelectedEntityIds,
  openInspectPanel,
  selectedPageId,
  startPendingPlacement,
  toggleAnnotateMode,
  toggleBrowserMode,
  toggleLeftSidebar,
  toggleDevTools,
  toggleDrawMode,
  toggleRegionSelectMode,
  toggleInspectMode,
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

  ipcMain.on('toolbar-toggle-inspect', () => {
    if (toggleInspectMode()) {
      openInspectPanel()
    }
  })

  ipcMain.on('toolbar-clear-tool-mode', () => {
    clearToolMode()
  })

  ipcMain.on('toolbar-toggle-annotate', () => {
    toggleAnnotateMode()
  })

  ipcMain.on('toolbar-toggle-draw', () => {
    toggleDrawMode()
  })

  ipcMain.on('toolbar-toggle-region-select', () => {
    toggleRegionSelectMode()
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

  ipcMain.on('add-page', (_event, presetIndex: number | 'custom') => {
    startPendingPlacement({
      sourcePageId: selectedPageId() ?? undefined,
      presetIndex: typeof presetIndex === 'number' ? presetIndex : undefined,
      customSize: presetIndex === 'custom',
    })
  })

  ipcMain.on('add-browser-page', (_event, presetIndex: number | 'custom') => {
    const result = addPageFromSource({
      presetIndex: typeof presetIndex === 'number' ? presetIndex : 0,
      customSize: presetIndex === 'custom',
      mode: 'add_from_toolbar',
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

  ipcMain.on('cancel-pending-placement', () => {
    cancelPendingPlacement()
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

  ipcMain.on(
    'toolbar-add-text',
    (_event, payload: { style: 'plain' | 'sticky' }) => {
      startPendingPlacement({
        entityKind: 'text',
        textStyle: payload?.style ?? 'sticky',
      })
    },
  )

  ipcMain.on('toolbar-add-document', () => {
    startPendingPlacement({
      entityKind: 'file',
    })
  })

  ipcMain.on(
    'toolbar-add-shape',
    (_event, payload: { shapeKind: 'rectangle' | 'ellipse' | 'diamond' }) => {
      startPendingPlacement({
        entityKind: 'shape',
        shapeKind: payload?.shapeKind ?? 'rectangle',
      })
    },
  )
}
