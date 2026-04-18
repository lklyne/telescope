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
  clearFocus,
  clearToolMode,
  focusSelectedEntity,
  focusSelectedPage,
  getSelectedEntityIds,
  openInspectPanel,
  selectedPageId,
  setFocus,
  startPendingPlacement,
  toggleAnnotateMode,
  toggleLeftSidebar,
  toggleDevTools,
  toggleDrawMode,
  toggleRegionSelectMode,
  toggleInspectMode,
} from '../runtime/ui-actions'
import { endDevtoolsResize, setDevtoolsWidthFromScreenX } from '../runtime/window-shell'
import { applyNavigationToSelectedPages } from '../navigation-sync'
import { isFocused as uiIsFocused } from '../ui-state'

function recenterFocusIfNeeded(): void {
  if (!uiIsFocused()) return
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

  ipcMain.on('toolbar-focus-selected-entity', () => {
    focusSelectedEntity()
  })

  ipcMain.on('toolbar-exit-focus', () => {
    clearFocus()
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
    recenterFocusIfNeeded()
  })

  ipcMain.on('toggle-left-sidebar', () => {
    toggleLeftSidebar()
  })

  ipcMain.on('devtools-resize-start', (_event, { screenX }: { screenX: number }) => {
    setDevtoolsWidthFromScreenX(screenX)
    recenterFocusIfNeeded()
  })

  ipcMain.on('devtools-resize-move', (_event, { screenX }: { screenX: number }) => {
    setDevtoolsWidthFromScreenX(screenX)
    recenterFocusIfNeeded()
  })

  ipcMain.on('devtools-resize-end', () => {
    endDevtoolsResize()
  })

  ipcMain.on('add-page', (_event, presetIndex: number | 'custom') => {
    startPendingPlacement({
      sourceFrameId: selectedPageId() ?? undefined,
      presetIndex: typeof presetIndex === 'number' ? presetIndex : undefined,
      customSize: presetIndex === 'custom',
    })
  })

  ipcMain.on('canvas-bg-set-focus', (_event, { entityId, entityKind }: { entityId: string; entityKind: import('../../shared/types').CanvasEntityKind }) => {
    setFocus(entityId, entityKind)
  })

  ipcMain.on('canvas-bg-clear-focus', () => {
    clearFocus()
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

  ipcMain.on('toolbar-add-text-entity', () => {
    startPendingPlacement({
      entityKind: 'text',
    })
  })

  ipcMain.on('toolbar-add-note', () => {
    startPendingPlacement({
      entityKind: 'file',
    })
  })
}
