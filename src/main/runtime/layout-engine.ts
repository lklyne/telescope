import { screen, type WebContentsView } from 'electron'
import {
  boundsKey,
  boundApplyEmulation,
  boundEffectivePageContentSize,
  boundIsFillBrowserPage,
  boundScreenBoundsForPage,
  boundSelectedPage,
  boundSelectedPageId,
  boundCanvasOrigin,
} from './runtime-geometry'
import {
  aboveView,
  bgView,
  cursorOverlayWindow,
  devtoolsBackgroundView,
  devtoolsHeaderView,
  devtoolsResizeHandleView,
  devtoolsView,

  leftSidebarView,

  toolbarView,
  win,
} from './view-refs'
import { layoutCache } from './layout-cache'
import { consumeDirty } from './layout-dirty'
import { applyStack } from './layer-stack'
import { reconcileFocus } from './focus-reconciler-runtime'
import {
  automationInteractiveFrameCounts,
  hoverTarget,
  hoveringCanvasChrome,
  pages,
  interactionState,
  selectionOverlayActive,
  spaceModifierHeld,
  pan,
  zoom,
} from './runtime-context'
import { shouldGateBeOpen } from './gate-predicate'
import { getUiState, annotationMode as uiAnnotationMode, selectedCanvasTargets } from '../ui-state'
import { drawingEntities } from './drawing-entity-state'
import {
  devtoolsOpen as uiDevtoolsOpen,
  devtoolsPanelTab as uiDevtoolsPanelTab,
  devtoolsWidth as uiDevtoolsWidth,
  isCommentOverlayVisible as uiCommentOverlayVisible,
  leftSidebarOpen as uiLeftSidebarOpen,
  selectedEntityIds as uiSelectedEntityIds,
  setDevtoolsWidth as setUiDevtoolsWidth,
  workspaceViewMode as uiWorkspaceViewMode,
} from '../ui-state'
import {
  backgroundFrameOverlays,
  activeCanvasSelection,
  buildCanvasLayoutData,
  buildFloatingUiUpdatePayload,
  sendAnnotationLayoutUpdate,
  selectedComponentTreePayload,
  toolbarSelectionData,
  notifyLeftSidebarData,
  annotationsForPage,
  pageAnnotationsKey,
} from './canvas-layout-data'
import { textEntityMenuViewBounds } from '../../shared/selectedFrameMenu'
import { textEntities, buildTextEntitySceneEntity } from './text-entity-state'
import { getPresenceCursors } from '../app-control-server'
import {
  notifyDevtoolsPanelData,
  notifyInspectStateChanged,
  notifyAnnotateStateChanged,
} from './inspect-session'
import { clampDevtoolsWidth, frameColor, isDark } from './preferences'
import { contentCornerRadiusForDevice, safeAreaCssForDevice } from '../../shared/device-catalog'
import { deviceIdFromMetadata, deviceOrientationFromMetadata, showDeviceFrameFromMetadata } from './runtime-entities'

export function setBoundsIfChanged(
  view: WebContentsView,
  bounds: { x: number; y: number; width: number; height: number },
  previousKey: string | undefined | null,
): string {
  const nextKey = boundsKey(bounds)
  if (nextKey !== previousKey) {
    view.setBounds(bounds)
  }
  return nextKey
}

import {
  BROWSER_HEADER_HEIGHT,
  CARD_BORDER_RADIUS,
  CONTENT_INSET,
  DEVTOOLS_HEADER_GAP,
  DEVTOOLS_HEADER_HEIGHT,
  DEVTOOLS_PANEL_PADDING,
  DEVTOOLS_RESIZE_HANDLE_WIDTH,
  LEFT_SIDEBAR_WIDTH,
  DEVTOOLS_PANEL_DEBUG,
  devtoolsPanelDebug,
} from './runtime-constants'
import { boundsOverlap } from './runtime-geometry'

const HIDDEN_BOUNDS = { x: 0, y: 0, width: 0, height: 0 }

export function layoutDevtoolsViews(): void {
  const devtoolsOpen = uiDevtoolsOpen()
  const devtoolsWidth = uiDevtoolsWidth()
  const devtoolsPanelTab = uiDevtoolsPanelTab()

  if (!win) return

  // Recompute content rect here — same formula as in layoutAllViews —
  // so devtools positioning stays inside the rounded content panel.
  const { width: winWidth, height: winHeight } = win.getBounds()
  const sidebarWidth = uiLeftSidebarOpen() ? LEFT_SIDEBAR_WIDTH : 0
  const contentX = sidebarWidth + CONTENT_INSET
  const contentY = CONTENT_INSET
  const contentWidth = Math.max(0, winWidth - sidebarWidth - 2 * CONTENT_INSET)
  const contentHeight = Math.max(0, winHeight - 2 * CONTENT_INSET)

  // Right-anchor devtools inside the content rect.
  const devtoolsX = contentX + contentWidth - devtoolsWidth
  const devtoolsY = contentY + layoutCache.toolbarHeight
  const devtoolsAreaHeight = Math.max(0, contentHeight - layoutCache.toolbarHeight)

  if (devtoolsView) {
    if (devtoolsOpen && boundSelectedPage() && devtoolsPanelTab === 'browser-devtools') {
      const panelWidth = clampDevtoolsWidth(devtoolsWidth)
      setUiDevtoolsWidth(panelWidth)
      const innerX = contentX + contentWidth - panelWidth
      const innerY = devtoolsY + DEVTOOLS_HEADER_HEIGHT + DEVTOOLS_HEADER_GAP
      const innerWidth = panelWidth
      const innerHeight = Math.max(
        0,
        devtoolsAreaHeight - DEVTOOLS_HEADER_HEIGHT - DEVTOOLS_HEADER_GAP,
      )
      layoutCache.lastDevtoolsViewBoundsKey = setBoundsIfChanged(
          devtoolsView,
          { x: innerX, y: innerY, width: innerWidth, height: innerHeight },
          layoutCache.lastDevtoolsViewBoundsKey,
        )
    } else {
      layoutCache.lastDevtoolsViewBoundsKey = setBoundsIfChanged(devtoolsView, { x: 0, y: 0, width: 0, height: 0 }, layoutCache.lastDevtoolsViewBoundsKey)
    }
  }

  if (devtoolsBackgroundView) {
    if (devtoolsOpen) {
      layoutCache.lastDevtoolsBackgroundBoundsKey = setBoundsIfChanged(
        devtoolsBackgroundView,
        { x: devtoolsX, y: devtoolsY, width: devtoolsWidth, height: devtoolsAreaHeight },
        layoutCache.lastDevtoolsBackgroundBoundsKey,
      )
    } else {
      layoutCache.lastDevtoolsBackgroundBoundsKey = setBoundsIfChanged(devtoolsBackgroundView, HIDDEN_BOUNDS, layoutCache.lastDevtoolsBackgroundBoundsKey)
    }
  }

  if (devtoolsHeaderView) {
    if (devtoolsOpen) {
      const showCustomPanel =
        boundSelectedPage() === null || devtoolsPanelTab !== 'browser-devtools'
      layoutCache.lastDevtoolsHeaderBoundsKey = setBoundsIfChanged(
        devtoolsHeaderView,
        showCustomPanel
          ? {
              x: devtoolsX,
              y: devtoolsY,
              width: devtoolsWidth,
              height: devtoolsAreaHeight,
            }
          : {
              x: devtoolsX,
              y: devtoolsY,
              width: devtoolsWidth,
              height: DEVTOOLS_HEADER_HEIGHT,
            },
        layoutCache.lastDevtoolsHeaderBoundsKey,
      )
      notifyDevtoolsPanelData()
    } else {
      layoutCache.lastDevtoolsHeaderBoundsKey = setBoundsIfChanged(devtoolsHeaderView, HIDDEN_BOUNDS, layoutCache.lastDevtoolsHeaderBoundsKey)
    }
  }

  if (devtoolsResizeHandleView) {
    if (devtoolsOpen) {
      layoutCache.lastDevtoolsResizeBoundsKey = setBoundsIfChanged(
        devtoolsResizeHandleView,
        {
          x: devtoolsX,
          y: devtoolsY,
          width: DEVTOOLS_RESIZE_HANDLE_WIDTH,
          height: devtoolsAreaHeight,
        },
        layoutCache.lastDevtoolsResizeBoundsKey,
      )
    } else {
      layoutCache.lastDevtoolsResizeBoundsKey = setBoundsIfChanged(devtoolsResizeHandleView, HIDDEN_BOUNDS, layoutCache.lastDevtoolsResizeBoundsKey)
    }
  }
}

export function layoutAllViews(): void {
  if (!win || win.isDestroyed()) return
  const layoutStart = DEVTOOLS_PANEL_DEBUG ? Date.now() : 0
  if (consumeDirty('stack')) applyStack()
  const viewMode = uiWorkspaceViewMode()

  const devtoolsOpen = uiDevtoolsOpen()
  const devtoolsWidth = uiDevtoolsWidth()
  const devtoolsPanelTab = uiDevtoolsPanelTab()
  const selectedFrameIds = uiSelectedEntityIds()

  // --- Content panel rect ---
  // The opaque, rounded content area to the right of the sidebar. Toolbar,
  // canvas (bgView), pages, above-view, and devtools all live inside this
  // rect. The sidebar column (when open) and the CONTENT_INSET padding
  // around the panel show the window's native vibrancy.
  const { width: winWidth, height: winHeight } = win.getBounds()
  const sidebarOpen = uiLeftSidebarOpen()
  const sidebarWidth = sidebarOpen ? LEFT_SIDEBAR_WIDTH : 0
  const contentX = sidebarWidth + CONTENT_INSET
  const contentY = CONTENT_INSET
  const contentWidth = Math.max(0, winWidth - sidebarWidth - 2 * CONTENT_INSET)
  const contentHeight = Math.max(0, winHeight - 2 * CONTENT_INSET)
  const contentTopInset = layoutCache.toolbarHeight + (viewMode === 'browser' ? BROWSER_HEADER_HEIGHT : 0)

  const frameOverlays = backgroundFrameOverlays()
  const nextActiveSelection = activeCanvasSelection()

  // --- Canvas background + annotation overlay ---
  // bgView is the opaque, rounded "content panel" fill. It spans the full
  // content area minus the devtools column on the right.
  if (bgView && win) {
    const bgWidth = Math.max(0, contentWidth - (devtoolsOpen ? devtoolsWidth : 0))
    layoutCache.lastBackgroundBoundsKey = setBoundsIfChanged(
      bgView,
      { x: contentX, y: contentY, width: bgWidth, height: contentHeight },
      layoutCache.lastBackgroundBoundsKey,
    )
    if (consumeDirty('canvas')) {
      bgView.webContents.send(
        'layout-update',
        buildCanvasLayoutData(frameOverlays, nextActiveSelection),
      )
      sendAnnotationLayoutUpdate({
        frames: frameOverlays,
        activeSelection: nextActiveSelection,
      })
      bgView.webContents.send('component-tree-data', selectedComponentTreePayload())
    }
  }

  // --- Left sidebar ---
  // Full-height: sits at y=0 so native macOS vibrancy fills the entire
  // left column, including behind the traffic lights. The sidebar renderer
  // adds top padding to clear the traffic lights.
  if (leftSidebarView && win) {
    leftSidebarView.setVisible(sidebarOpen)
    layoutCache.lastLeftSidebarBoundsKey = setBoundsIfChanged(
      leftSidebarView,
      sidebarOpen
        ? {
            x: 0,
            y: 0,
            width: LEFT_SIDEBAR_WIDTH,
            height: Math.max(0, winHeight),
          }
        : { x: 0, y: 0, width: 0, height: 0 },
      layoutCache.lastLeftSidebarBoundsKey,
    )
    if (consumeDirty('sidebar')) {
      notifyLeftSidebarData()
    }
  }

  // --- Above-view bounds ---
  // Main-authoritative cover: shouldGateBeOpen() derives the predicate
  // from interaction + tool mode + modifiers + chrome-hover + presence +
  // marquee + floating menu + saved drawings. The renderer no longer
  // drives this; it only renders what it's told to render.
  if (aboveView && win) {
    const selectedTargets = selectedCanvasTargets()
    const shouldCover = shouldGateBeOpen({
      interactionKind: interactionState.kind === 'idle' ? 'idle'
        : interactionState.kind === 'panning-canvas' ? 'panning'
        : interactionState.kind === 'marquee-select' ? 'marquee'
        : interactionState.kind === 'resizing-entity' ? 'resizing-entity'
        : interactionState.kind === 'editing-text' ? 'editing-text'
        : interactionState.kind,
      toolMode: getUiState().toolMode,
      viewMode: uiWorkspaceViewMode(),
      commentOverlayActive: uiCommentOverlayVisible(),
      selectionMarqueeVisible: selectionOverlayActive,
      spaceHeld: spaceModifierHeld,
      hoveringCanvasChrome,
      selectedEntityIds: selectedTargets.map((t) => t.id),
      selectedEntityKinds: selectedTargets.map((t) => t.kind),
      hasSavedDrawings: drawingEntities.length > 0,
    })
    const bounds = shouldCover
          ? {
              x: contentX,
              y: contentY + contentTopInset,
              width: Math.max(0, contentWidth - (devtoolsOpen ? devtoolsWidth : 0)),
              height: Math.max(0, contentHeight - contentTopInset),
            }
          : { x: 0, y: 0, width: 0, height: 0 }
    layoutCache.lastCommentOverlayBoundsKey = setBoundsIfChanged(
      aboveView,
      bounds,
      layoutCache.lastCommentOverlayBoundsKey,
    )
  }

  // --- Cursor overlay window bounds ---
  // Child BrowserWindow for agent-presence cursors. Bounds are in screen
  // coordinates (not win-relative), derived from the main window's
  // content bounds + the content-panel offset + toolbar/browser inset.
  // Shown only when cursors exist.
  if (cursorOverlayWindow && !cursorOverlayWindow.isDestroyed() && win) {
    const hasCursors = getPresenceCursors().length > 0
    if (!hasCursors) {
      if (cursorOverlayWindow.isVisible()) cursorOverlayWindow.hide()
      layoutCache.lastCursorOverlayBoundsKey = null
    } else {
      const contentBounds = win.getContentBounds()
      const overlayBounds = {
        x: contentBounds.x + contentX,
        y: contentBounds.y + contentY + contentTopInset,
        width: Math.max(1, contentWidth - (devtoolsOpen ? devtoolsWidth : 0)),
        height: Math.max(1, contentHeight - contentTopInset),
      }
      const key = `${overlayBounds.x},${overlayBounds.y},${overlayBounds.width},${overlayBounds.height}`
      if (layoutCache.lastCursorOverlayBoundsKey !== key) {
        cursorOverlayWindow.setBounds(overlayBounds)
        layoutCache.lastCursorOverlayBoundsKey = key
      }
      if (!cursorOverlayWindow.isVisible()) cursorOverlayWindow.showInactive()
    }
  }

  // Floating UI bundle retired in Phase 5c-floating-ui. The inline menu
  // for selected text/drawing entities now renders inside above-view via
  // FloatingUiLayer, reading layoutData directly.
  consumeDirty('floating-ui')

  const winBounds = win.getBounds()
  const windowRect = { x: 0, y: 0, width: winBounds.width, height: winBounds.height }

  // --- Per-page bounds, emulation, annotations ---
  const visibleBrowserPageId = boundSelectedPageId()
  for (const page of pages) {
    const pageStart = DEVTOOLS_PANEL_DEBUG ? Date.now() : 0
    const isVisibleInCurrentMode = viewMode === 'canvas' || page.id === visibleBrowserPageId
    if (!isVisibleInCurrentMode) {
      page.lastFrameBoundsKey = setBoundsIfChanged(page.frameView, HIDDEN_BOUNDS, page.lastFrameBoundsKey)
      page.lastPageBoundsKey = setBoundsIfChanged(page.pageView, HIDDEN_BOUNDS, page.lastPageBoundsKey)
      page.lastChromeBoundsKey = setBoundsIfChanged(page.chromeView, HIDDEN_BOUNDS, page.lastChromeBoundsKey)
      continue
    }
    const bounds = boundScreenBoundsForPage(page)

    // Viewport culling — off-screen frames get hidden bounds.
    // Skip culling during drag and for frames in automation-interactive mode
    // (agents need non-zero bounds to interact with off-screen frames).
    const isOnScreen = boundsOverlap(bounds.page, windowRect)
    const isAutomationActive = automationInteractiveFrameCounts.has(page.id)
    if (!isOnScreen && interactionState.kind !== 'dragging-entities' && !isAutomationActive) {
      page.lastFrameBoundsKey = setBoundsIfChanged(page.frameView, HIDDEN_BOUNDS, page.lastFrameBoundsKey)
      page.lastPageBoundsKey = setBoundsIfChanged(page.pageView, HIDDEN_BOUNDS, page.lastPageBoundsKey)
      page.lastChromeBoundsKey = setBoundsIfChanged(page.chromeView, HIDDEN_BOUNDS, page.lastChromeBoundsKey)
      devtoolsPanelDebug('layout:page', {
        pageId: page.id,
        durationMs: Date.now() - pageStart,
        visible: false,
        culled: true,
        isSelected: selectedFrameIds.includes(page.id),
        devtoolsOpen,
      })
      continue
    }

    const isFillBrowser = boundIsFillBrowserPage(page)
    const deviceId = deviceIdFromMetadata(page.metadata)
    const showShell = showDeviceFrameFromMetadata(page.metadata)
    const borderRadius = isFillBrowser
      ? 0
      : deviceId && showShell
        ? Math.round(contentCornerRadiusForDevice(deviceId, deviceOrientationFromMetadata(page.metadata)) * zoom)
        : CARD_BORDER_RADIUS
    page.frameView.setBorderRadius(borderRadius)
    page.pageView.setBorderRadius(borderRadius)
    page.lastFrameBoundsKey = setBoundsIfChanged(page.frameView, bounds.frame, page.lastFrameBoundsKey)
    page.lastPageBoundsKey = setBoundsIfChanged(page.pageView, bounds.page, page.lastPageBoundsKey)
    page.lastChromeBoundsKey = setBoundsIfChanged(page.chromeView, { x: 0, y: 0, width: 0, height: 0 }, page.lastChromeBoundsKey)

    const { width: emulatedWidth, height: emulatedHeight } = boundEffectivePageContentSize(page)
    const nativeScale = screen.getPrimaryDisplay().scaleFactor
    const pageScale = isFillBrowser ? 1 : zoom
    const pageEmulationKey = `${emulatedWidth}:${emulatedHeight}:${pageScale}:${nativeScale}:${viewMode}:${devtoolsOpen ? devtoolsWidth : 0}`
    if (pageEmulationKey !== page.lastPageEmulationKey) {
      const emulationStart = DEVTOOLS_PANEL_DEBUG ? Date.now() : 0
      boundApplyEmulation(page.pageView.webContents, page.presetIndex, page)
      page.lastPageEmulationKey = pageEmulationKey
      devtoolsPanelDebug('layout:apply-emulation', {
        pageId: page.id,
        durationMs: Date.now() - emulationStart,
        emulatedWidth,
        emulatedHeight,
        viewMode,

        devtoolsOpen,
      })
    }

    // Inject or remove safe-area CSS padding when the device shell is active
    const orientation = deviceOrientationFromMetadata(page.metadata)
    const safeAreaCss = deviceId && showShell && !isFillBrowser
      ? safeAreaCssForDevice(deviceId, orientation)
      : null
    const safeAreaKey = safeAreaCss ?? ''
    if (safeAreaKey !== (page.lastSafeAreaCssKey ?? '')) {
      if (page.lastSafeAreaCssId) {
        page.pageView.webContents.removeInsertedCSS(page.lastSafeAreaCssId).catch(() => {})
        page.lastSafeAreaCssId = undefined
      }
      if (safeAreaCss) {
        page.pageView.webContents.insertCSS(safeAreaCss).then((id) => {
          page.lastSafeAreaCssId = id
        }).catch(() => {})
      }
      page.lastSafeAreaCssKey = safeAreaKey
    }

    const themeKey = isDark()
    if (page.lastSelected !== themeKey) {
      page.frameView.setBackgroundColor(frameColor())
      page.lastSelected = themeKey
    }

    const pageAnnotations = annotationsForPage(page.id)
    const nextPageAnnotationsKey = pageAnnotationsKey(pageAnnotations)
    if (nextPageAnnotationsKey !== page.lastPageAnnotationsKey) {
      page.pageView.webContents.send('page-annotations-update', {
        annotations: pageAnnotations,
      })
      page.lastPageAnnotationsKey = nextPageAnnotationsKey
    }
    devtoolsPanelDebug('layout:page', {
      pageId: page.id,
      durationMs: Date.now() - pageStart,
      visible: true,
      isSelected: selectedFrameIds.includes(page.id),
      devtoolsOpen,
    })
  }

  // (above-view bounds are now handled in the consolidated block above)

  // --- Devtools ---
  layoutDevtoolsViews()

  // --- Toolbar ---
  // Sits at the top of the content panel (not spanning full window width).
  // Renderer applies CSS `border-radius: 10px 10px 0 0` so the top corners
  // match the content panel's rounded corners.
  if (toolbarView && win) {
    layoutCache.lastToolbarBoundsKey = setBoundsIfChanged(
      toolbarView,
      { x: contentX, y: contentY, width: contentWidth, height: layoutCache.toolbarHeight },
      layoutCache.lastToolbarBoundsKey,
    )
    if (consumeDirty('toolbar')) {
      toolbarView.webContents.send('zoom-changed', Math.round(zoom * 100))
      toolbarView.webContents.send('toolbar-selection-changed', toolbarSelectionData())
      toolbarView.webContents.send('left-sidebar-changed', uiLeftSidebarOpen())
      notifyInspectStateChanged()
      notifyAnnotateStateChanged()
      toolbarView.webContents.send('agent-presence-changed', getPresenceCursors())
    }
  }

  // Consume any remaining flags that weren't consumed above
  consumeDirty('bounds')
  consumeDirty('pages')
  consumeDirty('devtools')

  // Post-layout: reconcile focus once against the post-mutation world.
  reconcileFocus()

  devtoolsPanelDebug('layout:all-views-complete', {
    durationMs: Date.now() - layoutStart,
    pageCount: pages.length,
    devtoolsOpen,
    selectedFrameIds,
    activeTab: devtoolsPanelTab,
  })
}
