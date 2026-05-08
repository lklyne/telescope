/**
 * Canvas layout data builders — payload construction for renderer surfaces.
 *
 * Builds view models consumed by the canvas background, toolbar,
 * left sidebar, and annotation overlay renderers.
 */

import { screen } from 'electron'
import type {
  ActiveCanvasEntitySelection,
  AgentPresenceCursor,
  Annotation,
  AnnotationMode,
  CanvasSceneEntity,
  CanvasScenePageEntity,
  CanvasSceneGroupEntity,
  ComponentTreeNode,
  LayoutUpdateData,
  PendingPlacement,
  ToolbarSelectionData,
} from '../../shared/types'
import { resolvePresencePagePoint } from '../../shared/presence-targeting'
import { isUnresolved } from '../../shared/annotation-utils'
import {
  aboveView,
  cursorOverlayWindow,
  leftSidebarView,
  win,
} from './view-refs'
import { safeSend } from './safe-send'
import { layoutCache } from './layout-cache'
import {
  findPageById,
  hoverTarget,
  interactionState,
  pages,
  pan,
  selectedPage,
  selectedPageId,
  zoom,
} from './runtime-context'
import { activeWorkspaceTabId, workspaceAnnotations, workspaceEdges, workspaceGroups } from './workspace-model'
import {
  activeBrowserPageId as uiActiveBrowserPageId,
  annotationMode as uiAnnotationMode,
  devtoolsOpen as uiDevtoolsOpen,
  devtoolsWidth as uiDevtoolsWidth,
  leftSidebarOpen as uiLeftSidebarOpen,
  pendingPlacement as uiPendingPlacement,
  selectedCanvasTargets as uiSelectedCanvasTargets,
  selectedEntityIds as uiSelectedEntityIds,
  selectedGroupId as uiSelectedGroupId,
  workspaceViewMode as uiWorkspaceViewMode,
} from '../ui-state'
import { LEFT_SIDEBAR_WIDTH } from './runtime-constants'
import { currentKeyboardTargetPageId } from './selection-controller'
import {
  pageContentSize,
  boundEffectivePageContentSize as effectivePageContentSize,
  boundAvailableCanvasViewport as localAvailableCanvasViewport,
  boundCanvasOrigin as localCanvasOrigin,
  boundFillBrowserViewportSize as localFillBrowserViewportSize,
  boundScreenBoundsForPage as screenBoundsForPage,
} from './runtime-geometry'
import { pageDisplayLabel, viewportPresetForIndex } from './runtime-serialization'
import {
  textEntities,
  buildTextEntitySceneEntity,
  DEFAULT_TEXT_WIDTH,
  DEFAULT_TEXT_HEIGHT,
} from './text-entity-state'
import {
  pageUsesCustomSize,
  pageBrowserSizeModeFromMetadata,
  deviceIdFromMetadata,
  deviceOrientationFromMetadata,
  showDeviceFrameFromMetadata,
  useSvgDeviceShellFromMetadata,
} from './runtime-entities'
import {
  fileEntities,
  buildFileEntitySceneEntity,
  DEFAULT_FILE_WIDTH,
  DEFAULT_FILE_HEIGHT,
} from './file-entity-state'
import {
  drawingEntitiesForUi,
  buildDrawingEntitySceneEntity,
} from './drawing-entity-state'
import {
  shapeEntities,
  buildShapeEntitySceneEntity,
  defaultShapeSize,
} from './shape-entity-state'
import { buildGroupSceneEntity } from './group-entity-state'
import type { Page } from './runtime-entities'
import { workspaceTabSummaries } from './workspace-tabs'
import { getPresenceCursors } from '../app-control-server'
import { getFixProgress } from '../agent-fix/fix-progress'

function mainWindowContentBounds(): {
  x: number; y: number; width: number; height: number
} | null {
  if (!win || win.isDestroyed()) return null
  if ('getContentBounds' in win && typeof win.getContentBounds === 'function') {
    return win.getContentBounds()
  }
  return win.getBounds()
}

// --- Exported data builders ---

export function backgroundPageOverlays(): CanvasScenePageEntity[] {
  const viewMode = uiWorkspaceViewMode()
  const activeBrowserPageId = viewMode === 'browser' ? uiActiveBrowserPageId() : null
  return pages.map((page) => {
    const { width, height } = effectivePageContentSize(page)
    const bounds = screenBoundsForPage(page)
    const deviceId = deviceIdFromMetadata(page.metadata)
    // In browser mode, only show the device shell for the active tab
    const showShell = showDeviceFrameFromMetadata(page.metadata)
      && (viewMode === 'canvas' || page.id === activeBrowserPageId)
    return {
      kind: 'page' as const,
      id: page.id,
      label: pageDisplayLabel(page),
      faviconUrl: page.faviconUrl ?? null,
      url: page.url,
      canGoBack: page.pageView.webContents.canGoBack(),
      canGoForward: page.pageView.webContents.canGoForward(),
      isLoading: page.pageView.webContents.isLoading(),
      isCustomSize: pageUsesCustomSize(page.metadata),
      browserSizeMode: viewMode === 'canvas' ? 'device' : pageBrowserSizeModeFromMetadata(page.metadata),
      canvasX: page.canvasX,
      canvasY: page.canvasY,
      width,
      height,
      presetIndex: page.presetIndex,
      linked: page.linked,
      screenX: showShell ? bounds.shell.x : bounds.page.x,
      screenY: showShell ? bounds.shell.y : bounds.page.y,
      screenWidth: showShell ? bounds.shell.width : bounds.page.width,
      screenHeight: showShell ? bounds.shell.height : bounds.page.height,
      // Device state
      deviceId,
      deviceOrientation: deviceOrientationFromMetadata(page.metadata),
      showDeviceFrame: showShell,
      // Inner content bounds (always the web viewport)
      contentScreenX: bounds.page.x,
      contentScreenY: bounds.page.y,
      contentScreenWidth: bounds.page.width,
      contentScreenHeight: bounds.page.height,
      useSvgDeviceShell: useSvgDeviceShellFromMetadata(page.metadata),
    }
  })
}

function buildLiveBrowserTabSummaries() {
  return pages.map((page) => {
    const { width, height } = pageContentSize(page)
    return {
      id: page.id,
      label: pageDisplayLabel(page),
      name: page.name?.trim() || undefined,
      url: page.url,
      presetIndex: page.presetIndex,
      faviconUrl: page.faviconUrl ?? null,
      width,
      height,
    }
  })
}

export function activeCanvasSelection(): ActiveCanvasEntitySelection | null {
  const selectedPageIds = uiSelectedEntityIds()
  const targets = selectedPageIds
    .map((id) => findPageById(id))
    .filter((p): p is Page => p !== undefined)
  const page = selectedPage() ?? targets[0] ?? null
  if (!page) return null
  const vp = viewportPresetForIndex(page.presetIndex)
  return {
    entityRef: { kind: 'page', id: page.id },
    label: pageDisplayLabel(page),
    width: page.peekWidth ?? vp.width,
    height: page.peekHeight ?? vp.height,
    presetIndex: page.presetIndex,
    linked: targets.length > 0 ? targets.every((target) => target.linked) : page.linked,
  }
}


function canonicalAnnotationUrl(value: string | undefined | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return trimmed
  }
}

export function annotationsForPage(pageId: string): Annotation[] {
  const page = findPageById(pageId)
  const currentPageUrl = canonicalAnnotationUrl(page?.pageView.webContents.getURL() ?? null)
  return workspaceAnnotations.filter((annotation) => {
    if (!isUnresolved(annotation.status)) return false
    if (annotation.anchor.type === 'canvas') return false
    if (annotation.anchor.type === 'region') return false
    if (annotation.anchor.pageId !== pageId) return false
    const annotationPageUrl = canonicalAnnotationUrl(annotation.metadata?.pageUrl)
    if (!annotationPageUrl || !currentPageUrl) return true
    return annotationPageUrl === currentPageUrl
  })
}

export function pageAnnotationsKey(annotations: Annotation[]): string {
  return annotations
    .map((annotation) => {
      const repliesKey = annotation.replies
        .map((reply) => [reply.author, reply.timestamp, reply.text].join('~'))
        .join(',')
      return [annotation.id, annotation.author, annotation.status, annotation.text, repliesKey].join(':')
    })
    .join('|')
}

export function selectedComponentTreePayload():
  | { pageId: string; tree: ComponentTreeNode[] }
  | null {
  const selectedPageIds = uiSelectedEntityIds()
  if (selectedPageIds.length !== 1) return null
  const pageId = selectedPageIds[0]
  const page = findPageById(pageId)
  if (!page) return null
  return { pageId, tree: page.componentTree ?? [] }
}

export function sendAnnotationLayoutUpdate(data: {
  pages: CanvasScenePageEntity[]
  activeSelection: ActiveCanvasEntitySelection | null
}): void {
  const payload = buildCanvasLayoutData(data.pages, data.activeSelection)
  if (aboveView) safeSend(aboveView.webContents, 'layout-update', payload)
  if (cursorOverlayWindow && !cursorOverlayWindow.isDestroyed()) {
    safeSend(cursorOverlayWindow.webContents, 'layout-update', payload)
  }
}

export function buildFloatingUiUpdatePayload(input: {
  pages: CanvasScenePageEntity[]
  activeSelection: ActiveCanvasEntitySelection | null
  surfaceOrigin: { x: number; y: number }
}) {
  return {
    layoutData: buildCanvasLayoutData(input.pages, input.activeSelection),
    surfaceOrigin: input.surfaceOrigin,
  }
}

function buildUserGroupSceneEntities(
  origin: { x: number; y: number },
): CanvasSceneGroupEntity[] {
  return workspaceGroups
    .map((g) => {
      const entityIds = [
        ...pages.filter((page) => page.parentGroupId === g.id).map((page) => page.id),
        ...textEntities.filter((entity) => entity.parentGroupId === g.id).map((entity) => entity.id),
        ...fileEntities.filter((entity) => entity.parentGroupId === g.id).map((entity) => entity.id),
        ...drawingEntitiesForUi().filter((entity) => entity.parentGroupId === g.id).map((entity) => entity.id),
        ...shapeEntities.filter((entity) => entity.parentGroupId === g.id).map((entity) => entity.id),
        ...workspaceGroups.filter((candidate) => candidate.parentGroupId === g.id).map((group) => group.id),
      ]
      return buildGroupSceneEntity(g, zoom, pan, origin, entityIds)
    })
}

export function buildCanvasLayoutData(
  pages: CanvasScenePageEntity[],
  activeSelection: ActiveCanvasEntitySelection | null,
): LayoutUpdateData {
  const fillViewport = localFillBrowserViewportSize()
  const pending = uiPendingPlacement()
  const viewMode = uiWorkspaceViewMode()
  const origin = localCanvasOrigin()
  const pendingPlacementData: PendingPlacement | null =
    pending
      ? (() => {
          const isText = pending.entityKind === 'text'
          const isFile = pending.entityKind === 'file'
          const isShape = pending.entityKind === 'shape'
          const sourcePage = pending.sourcePageId ? findPageById(pending.sourcePageId) : null
          const preset = (isText || isFile || isShape) ? null : viewportPresetForIndex(pending.presetIndex ?? 0)
          const customSize = sourcePage ? pageContentSize(sourcePage) : localFillBrowserViewportSize()
          const contentBounds = mainWindowContentBounds()
          const cursor = screen.getCursorScreenPoint()
          const initialClientX =
            contentBounds &&
            cursor.x >= contentBounds.x &&
            cursor.x <= contentBounds.x + contentBounds.width
              ? cursor.x - contentBounds.x
              : null
          const initialClientY =
            contentBounds &&
            cursor.y >= contentBounds.y &&
            cursor.y <= contentBounds.y + contentBounds.height
              ? cursor.y - contentBounds.y
              : null
          const shapeDefault = isShape
            ? defaultShapeSize(pending.shapeKind ?? 'rectangle')
            : null
          return {
            entityKind: pending.entityKind,
            presetIndex: pending.presetIndex,
            shapeKind: pending.shapeKind,
            width: isText
              ? DEFAULT_TEXT_WIDTH
              : isFile
                ? DEFAULT_FILE_WIDTH
                : shapeDefault
                  ? shapeDefault.width
                  : pending.customSize
                    ? customSize.width
                    : (preset?.width ?? 0),
            height: isText
              ? DEFAULT_TEXT_HEIGHT
              : isFile
                ? DEFAULT_FILE_HEIGHT
                : shapeDefault
                  ? shapeDefault.height
                  : pending.customSize
                    ? customSize.height
                    : (preset?.height ?? 0),
            initialClientX,
            initialClientY,
          }
        })()
      : null
  const groupEntities = buildUserGroupSceneEntities(origin)
  return {
    zoom,
    pan,
    canvasOrigin: origin,
    leftChromeWidth: uiLeftSidebarOpen() ? LEFT_SIDEBAR_WIDTH : 0,
    entities: [
      ...pages,
      ...textEntities.map((te) =>
        buildTextEntitySceneEntity(te, zoom, pan, origin)
      ),
      ...fileEntities.map((fe) =>
        buildFileEntitySceneEntity(fe, zoom, pan, origin)
      ),
      ...drawingEntitiesForUi().map((de) =>
        buildDrawingEntitySceneEntity(de, zoom, pan, origin)
      ),
      ...shapeEntities.map((se) =>
        buildShapeEntitySceneEntity(se, zoom, pan, origin)
      ),
      ...groupEntities,
    ] as CanvasSceneEntity[],
    browserTabs: buildLiveBrowserTabSummaries(),
    browserFillViewport: fillViewport,
    selectedEntityIds: uiSelectedEntityIds(),
    selection: uiSelectedCanvasTargets(),
    activeSelection,
    annotationMode: uiAnnotationMode(),
    annotations: [...workspaceAnnotations],
    fixProgress: getFixProgress(),
    viewMode,
    activeBrowserTabId:
      viewMode === 'browser'
        ? selectedPageId()
        : null,
    activeBrowserPageId: uiActiveBrowserPageId(),
    selectedGroupId: uiSelectedGroupId(),
    hover: hoverTarget,
    interaction: interactionState,
    pendingPlacement: pendingPlacementData,
    devtoolsOpen: uiDevtoolsOpen(),
    devtoolsWidth: uiDevtoolsWidth(),
    edges: [...workspaceEdges],
    groups: groupEntities,
    presenceCursors: getPresenceCursors()
    .filter((c) => {
      // In browser mode, hide cursors that explicitly target a different page.
      if (viewMode !== 'browser') return true
      const activePageId = uiActiveBrowserPageId()
      if (c.surface === 'page' && c.pageId && c.pageId !== activePageId) return false
      return true
    })
    .map((c): AgentPresenceCursor => ({
      ...(function resolvePresencePosition() {
        if (c.surface === 'page' && c.pageId) {
          const page = pages.find((candidate) => candidate.id === c.pageId)
          if (page) {
            const point = resolvePresencePagePoint({
              pageX: c.pageX,
              pageY: c.pageY,
              targetRect: c.targetRect ?? null,
              fallbackX: page.width / 2,
              fallbackY: page.height / 2,
            })
            // Clamp to the page's visible area so the cursor doesn't
            // render outside the page when targeting off-screen elements.
            const clampedX = Math.max(0, Math.min(point.x, page.width))
            const clampedY = Math.max(0, Math.min(point.y, page.height))
            const pageWcv = findPageById(page.id)
            const chromeHeight = pageWcv?.chromeHeight ?? 0
            return {
              canvasX: page.canvasX + clampedX,
              canvasY: page.canvasY + chromeHeight + clampedY,
            }
          }
        }
        // In browser mode, place canvas-surface cursors on the active page
        // so they remain visible instead of mapping to off-screen canvas coords.
        if (viewMode === 'browser') {
          const activePageId = uiActiveBrowserPageId()
          const page = activePageId
            ? pages.find((candidate) => candidate.id === activePageId)
            : null
          if (page) {
            return {
              canvasX: page.canvasX + page.width / 2,
              canvasY: page.canvasY + page.height / 2,
            }
          }
        }
        return { canvasX: c.canvasX, canvasY: c.canvasY }
      })(),
      sessionId: c.sessionId,
      clientName: c.clientName,
      color: c.color,
      surface: c.surface,
      activity: c.activity,
      pageId: c.pageId,
      pageX: c.pageX,
      pageY: c.pageY,
      labelKey: c.labelKey,
      taskLabel: c.taskLabel,
      labelHint: c.labelHint,
      labelParams: c.labelParams,
      targetRef: c.targetRef,
      targetRefSource: c.targetRefSource,
      targetName: c.targetName,
      targetRect: c.targetRect,
      updatedAt: c.updatedAt,
    })),
    keyboardTargetPageId: currentKeyboardTargetPageId(),
  } as LayoutUpdateData
}

export function getCanvasLayoutData(): LayoutUpdateData {
  return buildCanvasLayoutData(backgroundPageOverlays(), activeCanvasSelection())
}

// Re-export sidebar builders from their dedicated module
export { buildLeftSidebarData, getLeftSidebarData, notifyLeftSidebarData } from './sidebar-builder'

export function toolbarSelectionData(): ToolbarSelectionData {
  const selectedPageIds = uiSelectedEntityIds()
  const targets = selectedPageIds
    .map((id) => findPageById(id))
    .filter((p): p is Page => p !== undefined)
  const activePage = selectedPage() ?? targets[0] ?? null
  const availablePageCount = pages.length
  const activeTabName =
    workspaceTabSummaries().find((t) => t.isActive)?.name ?? null

  if (!targets.length || !activePage) {
    return {
      activePageId: null,
      selectedEntityIds: [],
      selectionCount: 0,
      availablePageCount,
      displayUrl: '',
      placeholder: '',
      canGoBack: false,
      canGoForward: false,
      isLoadingActivePage: false,
      loadingPageCount: 0,
      isLoadingAnySelected: false,
      loadingPhase: 'idle',
      activeTabId: activeWorkspaceTabId,
      activeTabName,
      viewMode: uiWorkspaceViewMode(),
      pendingPlacementActive: uiPendingPlacement() !== null,
    }
  }

  const distinctUrls = [...new Set(targets.map((page) => page.pageView.webContents.getURL()))]
  const selectionCount = targets.length
  const loadingPageCount = targets.filter((page) => page.pageView.webContents.isLoadingMainFrame()).length
  const isLoadingAnySelected = loadingPageCount > 0
  const isLoadingActivePage = activePage.pageView.webContents.isLoadingMainFrame()
  const isWaitingForResponse =
    typeof activePage.pageView.webContents.isWaitingForResponse === 'function' &&
    activePage.pageView.webContents.isWaitingForResponse()
  const loadingPhase: ToolbarSelectionData['loadingPhase'] = isLoadingActivePage
    ? isWaitingForResponse
      ? 'waiting-response'
      : 'loading'
    : 'idle'

  return {
    activePageId: activePage.id,
    selectedEntityIds: targets.map((page) => page.id),
    selectionCount,
    availablePageCount,
    displayUrl: distinctUrls.length === 1 ? distinctUrls[0] ?? '' : '',
    placeholder:
      selectionCount > 1 ? `${selectionCount} pages selected` : 'Enter URL',
    canGoBack: targets.some((page) => page.pageView.webContents.navigationHistory.canGoBack()),
    canGoForward: targets.some((page) => page.pageView.webContents.navigationHistory.canGoForward()),
    isLoadingActivePage,
    loadingPageCount,
    isLoadingAnySelected,
    loadingPhase,
    activeTabId: activeWorkspaceTabId,
    activeTabName,
    viewMode: uiWorkspaceViewMode(),
    pendingPlacementActive: uiPendingPlacement() !== null,
  }
}
