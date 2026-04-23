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
import {
  getUiState,
  annotationMode as uiAnnotationMode,
  selectedCanvasTargets,
} from '../ui-state'
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

  if (devtoolsView && win) {
    if (devtoolsOpen && boundSelectedPage() && devtoolsPanelTab === 'browser-devtools') {
      const { width, height } = win.getBounds()
      const panelWidth = clampDevtoolsWidth(devtoolsWidth)
      setUiDevtoolsWidth(panelWidth)
      const panelX = width - panelWidth
      const panelY = layoutCache.toolbarHeight
      const panelHeight = height - layoutCache.toolbarHeight
      const contentX = panelX
      const contentY = panelY + DEVTOOLS_HEADER_HEIGHT + DEVTOOLS_HEADER_GAP
      const contentWidth = panelWidth
      const contentHeight = Math.max(
        0,
        panelHeight -
          DEVTOOLS_HEADER_HEIGHT -
          DEVTOOLS_HEADER_GAP,
      )
      layoutCache.lastDevtoolsViewBoundsKey = setBoundsIfChanged(
          devtoolsView,
          { x: contentX, y: contentY, width: contentWidth, height: contentHeight },
          layoutCache.lastDevtoolsViewBoundsKey,
        )
    } else {
      layoutCache.lastDevtoolsViewBoundsKey = setBoundsIfChanged(devtoolsView, { x: 0, y: 0, width: 0, height: 0 }, layoutCache.lastDevtoolsViewBoundsKey)
    }
  }

  if (devtoolsBackgroundView && win) {
    const { width, height } = win.getBounds()
    const hiddenBounds = HIDDEN_BOUNDS
    if (devtoolsOpen) {
      layoutCache.lastDevtoolsBackgroundBoundsKey = setBoundsIfChanged(
        devtoolsBackgroundView,
        { x: width - devtoolsWidth, y: layoutCache.toolbarHeight, width: devtoolsWidth, height: height - layoutCache.toolbarHeight },
        layoutCache.lastDevtoolsBackgroundBoundsKey,
      )
    } else {
      layoutCache.lastDevtoolsBackgroundBoundsKey = setBoundsIfChanged(devtoolsBackgroundView, hiddenBounds, layoutCache.lastDevtoolsBackgroundBoundsKey)
    }
  }

  if (devtoolsHeaderView && win) {
    const { width, height } = win.getBounds()
    const hiddenBounds = HIDDEN_BOUNDS
    if (devtoolsOpen) {
      const showCustomPanel =
        boundSelectedPage() === null || devtoolsPanelTab !== 'browser-devtools'
      layoutCache.lastDevtoolsHeaderBoundsKey = setBoundsIfChanged(
        devtoolsHeaderView,
        showCustomPanel
          ? {
              x: width - devtoolsWidth,
              y: layoutCache.toolbarHeight,
              width: devtoolsWidth,
              height: Math.max(0, height - layoutCache.toolbarHeight),
            }
          : {
              x: width - devtoolsWidth,
              y: layoutCache.toolbarHeight,
              width: devtoolsWidth,
              height: DEVTOOLS_HEADER_HEIGHT,
            },
        layoutCache.lastDevtoolsHeaderBoundsKey,
      )
      notifyDevtoolsPanelData()
    } else {
      layoutCache.lastDevtoolsHeaderBoundsKey = setBoundsIfChanged(devtoolsHeaderView, hiddenBounds, layoutCache.lastDevtoolsHeaderBoundsKey)
    }
  }

  if (devtoolsResizeHandleView && win) {
    const { height } = win.getBounds()
    const hiddenBounds = HIDDEN_BOUNDS
    if (devtoolsOpen) {
      const { width, height } = win.getBounds()
      layoutCache.lastDevtoolsResizeBoundsKey = setBoundsIfChanged(
        devtoolsResizeHandleView,
        {
          x: width - devtoolsWidth,
          y: layoutCache.toolbarHeight,
          width: DEVTOOLS_RESIZE_HANDLE_WIDTH,
          height: height - layoutCache.toolbarHeight,
        },
        layoutCache.lastDevtoolsResizeBoundsKey,
      )
    } else {
      layoutCache.lastDevtoolsResizeBoundsKey = setBoundsIfChanged(devtoolsResizeHandleView, hiddenBounds, layoutCache.lastDevtoolsResizeBoundsKey)
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
  const contentTopInset = layoutCache.toolbarHeight + (viewMode === 'browser' ? BROWSER_HEADER_HEIGHT : 0)

  const frameOverlays = backgroundFrameOverlays()
  const nextActiveSelection = activeCanvasSelection()

  // --- Canvas background + annotation overlay ---
  if (bgView && win) {
    const { width, height } = win.getBounds()
    const bgWidth = Math.max(0, width - (devtoolsOpen ? devtoolsWidth : 0))
    layoutCache.lastBackgroundBoundsKey = setBoundsIfChanged(bgView, { x: 0, y: 0, width: bgWidth, height }, layoutCache.lastBackgroundBoundsKey)
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
  if (leftSidebarView && win) {
    const { height } = win.getBounds()
    const showLeftSidebar = uiLeftSidebarOpen()
    leftSidebarView.setVisible(showLeftSidebar)
    layoutCache.lastLeftSidebarBoundsKey = setBoundsIfChanged(
      leftSidebarView,
      showLeftSidebar
        ? {
            x: 0,
            y: layoutCache.toolbarHeight,
            width: LEFT_SIDEBAR_WIDTH,
            height: Math.max(0, height - layoutCache.toolbarHeight),
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
    const { width, height } = win.getBounds()
    const selectedTargets = selectedCanvasTargets()
    const selectionOwnsFrameContent =
      selectedTargets.length > 1 &&
      selectedTargets.some((target) => target.kind === 'frame')
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
      selectionOwnsFrameContent,
      hasSavedDrawings: drawingEntities.length > 0,
    })
    const bounds = shouldCover
          ? {
              x: 0,
              y: contentTopInset,
              width: Math.max(0, width - (devtoolsOpen ? devtoolsWidth : 0)),
              height: Math.max(0, height - contentTopInset),
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
  // content bounds + the toolbar inset. Shown only when cursors exist.
  if (cursorOverlayWindow && !cursorOverlayWindow.isDestroyed() && win) {
    const hasCursors = getPresenceCursors().length > 0
    if (!hasCursors) {
      if (cursorOverlayWindow.isVisible()) cursorOverlayWindow.hide()
      layoutCache.lastCursorOverlayBoundsKey = null
    } else {
      const contentBounds = win.getContentBounds()
      const overlayBounds = {
        x: contentBounds.x,
        y: contentBounds.y + contentTopInset,
        width: Math.max(1, contentBounds.width - (devtoolsOpen ? devtoolsWidth : 0)),
        height: Math.max(1, contentBounds.height - contentTopInset),
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
  if (toolbarView && win) {
    const { width } = win.getBounds()
    layoutCache.lastToolbarBoundsKey = setBoundsIfChanged(
      toolbarView,
      { x: 0, y: 0, width, height: layoutCache.toolbarHeight },
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
