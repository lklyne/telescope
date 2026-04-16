import {
  app,
  BaseWindow,
  BrowserWindow,
  screen,
  WebContentsView,
} from 'electron'
import { join } from 'path'
import { loadRenderer, preloadPath } from './load-renderer'
import {
  bgView,
  aboveView,
  devtoolsBackgroundView,
  devtoolsHeaderView,
  devtoolsResizeHandleView,
  leftSidebarView,
  toolbarView,
  win,
  setAboveView,
  setBgView,
  setCursorOverlayWindow,
  setDevtoolsBackgroundView,
  setDevtoolsHeaderView,
  setDevtoolsResizeHandleView,
  setLeftSidebarView,
  setToolbarView,
  setWin,
} from './view-refs'
import { layoutCache } from './layout-cache'
import { markDirty } from './layout-dirty'
import { requestLayout, setZoom, setPan, focusSelectedPage } from './viewport-control'
import {
  contentPanelColor,
  isDark,
  loadPreferences,
} from './preferences'
import {
  ensureWorkspaceTabsInitialized,
} from './workspace-tabs'
import {
  wireMcpEmptyState,
  notifyDevtoolsPanelData,
} from './inspect-session'
import {
  backgroundFrameOverlays,
  activeCanvasSelection,
  buildCanvasLayoutData,
  sendAnnotationLayoutUpdate,
  selectedComponentTreePayload,
  notifyLeftSidebarData,
} from './canvas-layout-data'
import {
  notifyDevtoolsChanged,
} from './devtools-panel'
import { watchModifierKeys, wireKeyboardShortcuts } from './keyboard-shortcuts'
import {
  cancelPendingPlacement,
  clearToolMode,
  toggleAnnotateMode,
  toggleDrawMode,
} from './tool-mode'
import {
  groupSelectedEntities,
  ungroupSelectedGroup,
} from './document-commands'
import {
  APP_CONTROL_DISCOVERY_FILE,
} from '../../shared/constants'
import type {
  DevtoolsPanelData,
} from '../../shared/types'
import {
  mcpConnectionStatus,
} from './runtime-context'
import {
  CONTENT_BORDER_RADIUS,
  TOOLBAR_HEIGHT,
} from './runtime-constants'

function mcpEmptyState() {
  const tools = [
    'get_workspace',
    'get_selection',
    'find_placement',
    'apply_task_layout',
    'upsert_entities',
    'delete_entities',
    'link_frames',
    'unlink_frames',
    'focus_frames',
    'create_group',
    'ungroup_group',
    'delete_groups',
    'register_design_system',
    'get_design_system',
    'layout_component_states',
    'create_annotation',
    'get_annotations',
    'acknowledge_annotation',
    'resolve_annotation',
    'dismiss_annotation',
    'reply_to_annotation',
  ]
  const helperPath = app.isPackaged
    ? join(process.resourcesPath, 'mcp-helper.js')
    : join(process.cwd(), 'out', 'main', 'mcp-helper.js')
  const configPath = join(
    app.getPath('home'),
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json',
  )
  const quotedHelperPath = JSON.stringify(helperPath)
  const command = `node ${quotedHelperPath}`
  const installCommand = `claude mcp add telescope-mcp -- node ${quotedHelperPath}`
  return {
    kind: 'mcp_setup' as const,
    serverName: 'telescope-mcp',
    command,
    installCommand,
    tools,
    configPath,
    discoveryFile: join(app.getPath('temp'), APP_CONTROL_DISCOVERY_FILE),
    status: mcpConnectionStatus,
  }
}

export function initWindow(): void {
  wireMcpEmptyState(mcpEmptyState)
  wireKeyboardShortcuts({
    cancelPendingPlacement,
    clearToolMode,
    toggleAnnotateMode,
    toggleDrawMode,
    setZoom,
    setPan,
    focusSelectedPage,
    groupSelectedEntities,
    ungroupSelectedGroup,
  })
  loadPreferences()
  ensureWorkspaceTabsInitialized()
  layoutCache.toolbarHeight = TOOLBAR_HEIGHT

  setWin(new BaseWindow({
    width: 1600,
    height: 1000,
    title: 'Telescope',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? {
          trafficLightPosition: { x: 14, y: 16 },
          vibrancy: 'sidebar',
          visualEffectState: 'active',
        }
      : {}),
  }))
  const currentWin = win
  if (!currentWin) return

  currentWin.on('resize', () => { markDirty('canvas', 'bounds'); requestLayout() })
  currentWin.on('move', () => { markDirty('canvas'); requestLayout() })

  currentWin.contentView.setBackgroundColor(isDark() ? '#44403c' : '#f5f5f4')

  // 1. Background view — serves as the opaque, rounded "content panel"
  // that sits inset from the sidebar and window edges. Canvas React app
  // renders on top of this opaque fill.
  setBgView(new WebContentsView({
    webPreferences: {
      preload: preloadPath('canvas-bg'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }))
  const currentBgView = bgView
  if (!currentBgView) return
  currentBgView.setBackgroundColor(contentPanelColor())
  currentBgView.setBorderRadius(CONTENT_BORDER_RADIUS)
  // Strip cross-origin-resource-policy from image responses in UI renderers
  // (canvas-bg, sidebar) so they can load favicon images from any origin.
  // Scoped to UI view webContents only — page views are left untouched.
  const uiWebContentsIds = new Set<number>()
  const registerUiWebContents = (wc: Electron.WebContents) => uiWebContentsIds.add(wc.id)
  registerUiWebContents(currentBgView.webContents)
  currentBgView.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      if (details.resourceType === 'image' && details.webContentsId !== undefined && uiWebContentsIds.has(details.webContentsId)) {
        const headers = { ...details.responseHeaders }
        delete headers['cross-origin-resource-policy']
        delete headers['Cross-Origin-Resource-Policy']
        callback({ responseHeaders: headers })
        return
      }
      callback({ cancel: false })
    }
  )
  loadRenderer(currentBgView, 'canvas-bg')
  currentWin.contentView.addChildView(currentBgView)

  currentBgView.webContents.once('did-finish-load', () => {
    currentBgView.webContents.send('theme-changed', { isDark: isDark() })
    const frameOverlays = backgroundFrameOverlays()
    const nextActiveSelection = activeCanvasSelection()
    currentBgView.webContents.send('layout-update', buildCanvasLayoutData(frameOverlays, nextActiveSelection))
    sendAnnotationLayoutUpdate({
      frames: frameOverlays,
      activeSelection: nextActiveSelection,
    })
    currentBgView.webContents.send('component-tree-data', selectedComponentTreePayload())
    // The renderer subscribes to layout updates during mount, so send one more
    // pass on the next tick to avoid dropping the initial browser-mode tabs.
    markDirty('canvas')
    requestLayout()
  })
  setLeftSidebarView(new WebContentsView({
    webPreferences: {
      preload: preloadPath('left-sidebar'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }))
  const currentLeftSidebarView = leftSidebarView
  if (!currentLeftSidebarView) return
  registerUiWebContents(currentLeftSidebarView.webContents)
  currentLeftSidebarView.setBackgroundColor('#00000000')
  loadRenderer(currentLeftSidebarView, 'left-sidebar')
  currentLeftSidebarView.webContents.once('did-finish-load', () => {
    if (currentLeftSidebarView.webContents.isDestroyed()) return
    currentLeftSidebarView.webContents.send('theme-changed', { isDark: isDark() })
    notifyLeftSidebarData()
  })
  currentWin.contentView.addChildView(currentLeftSidebarView)
  currentLeftSidebarView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  watchModifierKeys(currentLeftSidebarView.webContents, { handleShortcuts: false })

  // Consolidated above-pages WCV. Loads the merged 'above-view' bundle
  // (marquee + comments + presence + annotations + drawing + floating-ui).
  const aboveWcv = new WebContentsView({
    webPreferences: {
      preload: preloadPath('canvas-bg'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  setAboveView(aboveWcv)
  const currentAboveView = aboveWcv
  currentAboveView.setBackgroundColor('#00000000')
  loadRenderer(currentAboveView, 'above-view')
  currentAboveView.webContents.once('did-finish-load', () => {
    if (currentAboveView.webContents.isDestroyed()) return
    currentAboveView.webContents.send('theme-changed', { isDark: isDark() })
    const frameOverlays = backgroundFrameOverlays()
    const nextActiveSelection = activeCanvasSelection()
    sendAnnotationLayoutUpdate({
      frames: frameOverlays,
      activeSelection: nextActiveSelection,
    })
    layoutCache.lastCommentOverlayBoundsKey = null
    requestLayout()
  })
  currentWin.contentView.addChildView(currentAboveView)
  currentAboveView.setBounds({ x: 0, y: 0, width: 0, height: 0 })

  // Agent-presence cursor overlay. A child BrowserWindow — not a WCV —
  // because Electron 40's WebContentsView has no setIgnoreMouseEvents
  // (electron#23863), and we need true native click-through so users can
  // watch agents work without blocking their own input. Bounds are
  // synced from layoutAllViews(); never focusable, never in the window
  // switcher, never captures pointer events. forward:false avoids known
  // macOS mousemove-forward bugs (#30808, #33281) — we don't need hover
  // since the layer is paint-only.
  const overlayWin = new BrowserWindow({
    parent: currentWin,
    transparent: true,
    frame: false,
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: preloadPath('canvas-bg'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  setCursorOverlayWindow(overlayWin)
  overlayWin.setIgnoreMouseEvents(true, { forward: false })
  registerUiWebContents(overlayWin.webContents)
  loadRenderer(overlayWin, 'agent-layer')
  overlayWin.webContents.once('did-finish-load', () => {
    if (overlayWin.webContents.isDestroyed()) return
    overlayWin.webContents.send('theme-changed', { isDark: isDark() })
    requestLayout()
  })
  const syncOverlayOnDisplayChange = () => { markDirty('canvas'); requestLayout() }
  screen.on('display-metrics-changed', syncOverlayOnDisplayChange)
  screen.on('display-added', syncOverlayOnDisplayChange)
  screen.on('display-removed', syncOverlayOnDisplayChange)
  currentWin.on('enter-full-screen', syncOverlayOnDisplayChange)
  currentWin.on('leave-full-screen', syncOverlayOnDisplayChange)
  currentWin.on('closed', () => {
    if (!overlayWin.isDestroyed()) overlayWin.destroy()
    setCursorOverlayWindow(null)
    screen.off('display-metrics-changed', syncOverlayOnDisplayChange)
    screen.off('display-added', syncOverlayOnDisplayChange)
    screen.off('display-removed', syncOverlayOnDisplayChange)
  })

  // floatingUiView retired in Phase 5c-floating-ui; menus render inside
  // above-view via FloatingUiLayer.

  // 2. Toolbar view
  setToolbarView(new WebContentsView({
    webPreferences: {
      preload: preloadPath('toolbar'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }))
  const currentToolbarView = toolbarView
  if (!currentToolbarView) return
  currentToolbarView.setBackgroundColor('#00000000')
  loadRenderer(currentToolbarView, 'toolbar')
  currentWin.contentView.addChildView(currentToolbarView)

  currentToolbarView.webContents.once('did-finish-load', () => {
    currentToolbarView.webContents.send('theme-changed', { isDark: isDark() })
    notifyDevtoolsChanged()
    markDirty('toolbar')
    requestLayout()
  })

  // interaction-overlay retired in Phase 5d — above-view owns input gate.

  // Keep the panel renderers alive offscreen so the first visible open does not
  // pay the renderer startup and first-paint cost on the user's click.
  const devtoolsPrewarmBounds = { x: -10_000, y: 0, width: 1, height: 1 }

  setDevtoolsBackgroundView(new WebContentsView())
  const currentDevtoolsBackgroundView = devtoolsBackgroundView
  if (!currentDevtoolsBackgroundView) return
  currentDevtoolsBackgroundView.setBackgroundColor(isDark() ? '#18181b' : '#fafafa')
  currentDevtoolsBackgroundView.setBorderRadius(CONTENT_BORDER_RADIUS)
  currentDevtoolsBackgroundView.webContents.loadURL('about:blank')
  currentWin.contentView.addChildView(currentDevtoolsBackgroundView)
  currentDevtoolsBackgroundView.setBounds(devtoolsPrewarmBounds)

  setDevtoolsHeaderView(new WebContentsView({
    webPreferences: {
      preload: preloadPath('right-details-panel'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }))
  const currentDevtoolsHeaderView = devtoolsHeaderView
  if (!currentDevtoolsHeaderView) return
  currentDevtoolsHeaderView.setBackgroundColor('#00000000')
  loadRenderer(currentDevtoolsHeaderView, 'right-details-panel')
  currentDevtoolsHeaderView.webContents.once('did-finish-load', () => {
    console.log('[devtools-panel-debug:main]', {
      ts: Date.now(),
      event: 'panel-webcontents:did-finish-load',
    })
    currentDevtoolsHeaderView.webContents.send('theme-changed', { isDark: isDark() })
    notifyDevtoolsPanelData()
  })
  currentWin.contentView.addChildView(currentDevtoolsHeaderView)
  currentDevtoolsHeaderView.setBounds(devtoolsPrewarmBounds)

  setDevtoolsResizeHandleView(new WebContentsView({
    webPreferences: {
      preload: preloadPath('devtools-resize-handle'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }))
  const currentDevtoolsResizeHandleView = devtoolsResizeHandleView
  if (!currentDevtoolsResizeHandleView) return
  currentDevtoolsResizeHandleView.setBackgroundColor('#00000000')
  loadRenderer(currentDevtoolsResizeHandleView, 'devtools-resize-handle')
  currentDevtoolsResizeHandleView.webContents.once('did-finish-load', () => {
    currentDevtoolsResizeHandleView.webContents.send('theme-changed', { isDark: isDark() })
  })
  currentWin.contentView.addChildView(currentDevtoolsResizeHandleView)
  currentDevtoolsResizeHandleView.setBounds(devtoolsPrewarmBounds)

  // Register modifier key detection on all initial views
  watchModifierKeys(currentBgView.webContents)
  watchModifierKeys(currentToolbarView.webContents, { handleShortcuts: false })
  watchModifierKeys(currentAboveView.webContents)
  watchModifierKeys(currentDevtoolsHeaderView.webContents, { handleShortcuts: false })
  watchModifierKeys(currentDevtoolsResizeHandleView.webContents, { handleShortcuts: false })

  markDirty('stack'); requestLayout()
}
