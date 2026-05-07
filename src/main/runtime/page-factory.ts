/**
 * Page factory — creation and removal of browser page views.
 */

import { WebContentsView } from 'electron'
import { randomUUID } from 'crypto'
import { preloadPath } from './load-renderer'
import type { PageConfig } from '../../shared/types'
import {
  toolbarView,
  win,
} from './view-refs'
import {
  inspectSelectedNodeIdByFrame,
  pages,
  setPendingFocus,
} from './runtime-context'
import {
  annotationMode as uiAnnotationMode,
  selectedEntityIds as uiSelectedEntityIds,
  selectedPageIndex as uiSelectedPageIndex,
  setSelection as setUiSelection,
  updateSelectionForRemovedEntity,
} from '../ui-state'
import { normalizePresetIndex } from './runtime-serialization'
import type { Page } from './runtime-entities'
import { frameOverridesFromMetadata } from './runtime-entities'
import { markDirty } from './layout-dirty'
import { requestLayout } from './viewport-control'
import {
  clearInspectTargets,
  notifyDevtoolsPanelData,
  syncInspectionState,
} from './inspect-session'
import { clearPendingRequestsForFrame } from './frame-ipc'
import { sendInteractiveState } from './overlay-manager'
import { broadcastCanvasZoomToPages } from './viewport-control'
import { annotationsForPage } from './canvas-layout-data'
import { invalidateAgentSnapshot } from './agent-snapshot-cache'
import {
  isNavigationSuppressed,
  markNavigationSuppressed,
  propagateNavigationFromPage,
} from '../navigation-sync'
import { watchModifierKeys } from './keyboard-shortcuts'
import { breadcrumb } from '../sentry-context'
import {
  areFocusEventsSuppressed,
  enterFrameFocus,
  exitFrameFocus,
  exitFrameFocusIfMatches,
  isFrameFocused,
} from './frame-focus'
import { workspaceViewMode as uiWorkspaceViewMode } from '../ui-state'

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

function isSelectedPage(page: Page): boolean {
  const idx = uiSelectedPageIndex(pages.map((p) => p.id))
  return idx !== null && idx >= 0 && idx < pages.length && pages[idx] === page
}

import {
  CARD_BORDER_RADIUS,
  CHROME_HEADER_HEIGHT,
  selectionDebug,
} from './runtime-constants'

function makePageId(): string {
  return `frame_${randomUUID()}`
}

function frameColor(): string {
  const { nativeTheme } = require('electron')
  const isDark = nativeTheme.shouldUseDarkColors
  // Match --surface-device-border token (stone-400 light, stone-600 dark)
  return isDark ? '#57534e' : '#a8a29e'
}

export function createPage(config: PageConfig): Page {
  if (!win || !toolbarView) throw new Error('Window not initialized')
  breadcrumb('page', 'create', { host: hostOf(config.url), preset: config.presetIndex })
  const presetIndex = normalizePresetIndex(config.presetIndex)

  const frameView = new WebContentsView()
  frameView.setBackgroundColor(frameColor())
  frameView.setBorderRadius(CARD_BORDER_RADIUS)
  frameView.webContents.loadURL('about:blank')
  win.contentView.addChildView(frameView)

  const pageView = new WebContentsView({
    webPreferences: {
      preload: preloadPath('page-content'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  pageView.setBorderRadius(CARD_BORDER_RADIUS)
  win.contentView.addChildView(pageView)

  const page: Page = {
    id: config.id ?? makePageId(),
    name: config.name?.trim() || undefined,
    title: config.name?.trim() || undefined,
    url: config.url,
    faviconUrl: null,
    frameView,
    pageView,
    devtoolsHostAttached: false,
    presetIndex,
    canvasX: config.canvasX,
    canvasY: config.canvasY,
    chromeHeight: CHROME_HEADER_HEIGHT,
    linked: config.linked ?? false,
    source: config.source ?? 'manual',
    parentGroupId: config.parentGroupId ?? config.groupId,
    groupId: config.parentGroupId ?? config.groupId,
    metadata: config.metadata,
    syncState: {
      suppressNavigationBroadcastUntil: 0,
      suppressNextScrollBroadcastUntil: 0,
    },
  }
  pages.push(page)
  markDirty('canvas', 'sidebar', 'toolbar', 'pages')

  page.pageView.webContents.on('page-title-updated', () => {
    page.title = page.pageView.webContents.getTitle() || undefined
    requestLayout()
    if (isSelectedPage(page)) notifyDevtoolsPanelData()
  })
  page.pageView.webContents.on('page-favicon-updated', (_event, favicons) => {
    page.faviconUrl = favicons[0] ?? null
    requestLayout()
  })
  page.pageView.webContents.on('did-start-loading', () => {
    selectionDebug('page:did-start-loading', { pageId: page.id, url: page.pageView.webContents.getURL() })
    page.crashedAt = undefined
    page.crashReason = undefined
    requestLayout()
  })
  page.pageView.webContents.on('render-process-gone', (_event, details) => {
    page.crashedAt = Date.now()
    page.crashReason = details.reason
    breadcrumb('page', 'render-process-gone', {
      host: hostOf(page.url),
      reason: details.reason,
      exitCode: details.exitCode,
    })
    selectionDebug('page:render-process-gone', { pageId: page.id, ...details })
  })
  page.pageView.webContents.on('unresponsive', () => {
    breadcrumb('page', 'unresponsive', { host: hostOf(page.url) })
    selectionDebug('page:unresponsive', { pageId: page.id })
  })
  page.pageView.webContents.on('did-stop-loading', () => {
    selectionDebug('page:did-stop-loading', { pageId: page.id, url: page.pageView.webContents.getURL() })
    requestLayout()
  })
  page.pageView.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    selectionDebug('page:did-fail-load', { pageId: page.id, errorCode, errorDescription, validatedURL })
  })
  page.pageView.webContents.on('did-finish-load', () => {
    selectionDebug('page:did-finish-load', { pageId: page.id, url: page.pageView.webContents.getURL() })
    page.title = page.pageView.webContents.getTitle() || undefined
    page.url = page.pageView.webContents.getURL() || page.url
    // Fallback favicon extraction: if page-favicon-updated didn't fire,
    // query the DOM for <link rel="icon"> and fall back to /favicon.ico
    if (!page.faviconUrl) {
      const faviconTimeout = setTimeout(() => {
        page.pageView.webContents.ipc.removeAllListeners('query-favicon-result')
      }, 5000)
      page.pageView.webContents.ipc.once(
        'query-favicon-result',
        (_event: Electron.IpcMainEvent, href: string | null) => {
          clearTimeout(faviconTimeout)
          if (page.faviconUrl) return
          let resolvedHref = href
          if (!resolvedHref) {
            try {
              resolvedHref =
                new URL(page.pageView.webContents.getURL()).origin +
                '/favicon.ico'
            } catch {
              return
            }
          }
          page.faviconUrl = resolvedHref
          requestLayout()
        },
      )
      page.pageView.webContents.send('query-favicon')
    }
    invalidateAgentSnapshot(page.id)
    page.lastPageEmulationKey = undefined
    page.lastPageAnnotationsKey = undefined
    page.lastSafeAreaCssKey = undefined
    page.lastSafeAreaCssId = undefined
    if (isSelectedPage(page)) clearInspectTargets()
    if (isSelectedPage(page)) notifyDevtoolsPanelData()
    syncInspectionState()
    page.pageView.webContents.send('set-annotate-mode', {
      enabled: uiAnnotationMode() === 'comment',
      mode: uiAnnotationMode(),
    })
    sendInteractiveState()
    broadcastCanvasZoomToPages()
    const overrides = frameOverridesFromMetadata(page.metadata)
    if (overrides) {
      page.pageView.webContents.send('apply-frame-overrides', overrides)
    }
    page.pageView.webContents.send('page-annotations-update', {
      annotations: annotationsForPage(page.id),
    })
  })
  page.pageView.webContents.on('did-navigate', (_event, url) => {
    selectionDebug('page:did-navigate', { pageId: page.id, url })
    breadcrumb('navigation', 'did-navigate', { host: hostOf(url) })
    page.url = url
    requestLayout()
    invalidateAgentSnapshot(page.id)
    if (isSelectedPage(page)) clearInspectTargets()
    if (isSelectedPage(page)) notifyDevtoolsPanelData()
    if (isNavigationSuppressed(page)) return
    if (!page.linked) return
    propagateNavigationFromPage(page, { type: 'load-url', url })
  })
  page.pageView.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    selectionDebug('page:did-navigate-in-page', { pageId: page.id, url, isMainFrame })
    if (isMainFrame) page.url = url
    if (isMainFrame) requestLayout()
    if (isMainFrame) invalidateAgentSnapshot(page.id)
    if (isSelectedPage(page)) clearInspectTargets()
    if (isSelectedPage(page)) notifyDevtoolsPanelData()
    if (!isMainFrame) return
    if (isNavigationSuppressed(page)) return
    if (!page.linked) return
    propagateNavigationFromPage(page, { type: 'in-page', url })
  })

  if (config.suppressInitialNavigationBroadcast) {
    markNavigationSuppressed(page)
  }
  page.pageView.webContents.loadURL(config.url).catch(() => {})

  // Frame focus (ADR 0001): when a page's webContents gains focus from a
  // user click in canvas mode, promote it to focused. When it loses focus,
  // exit. Programmatic focus() calls (FocusReconciler, did-finish-load focus
  // theft) are wrapped in withFocusEventsSuppressed and are ignored here.
  page.pageView.webContents.on('focus', () => {
    if (areFocusEventsSuppressed()) return
    if (uiWorkspaceViewMode() !== 'canvas') return
    // Skip focus events fired during page load — those are
    // did-finish-load focus theft (Electron #42578), not user clicks.
    if (page.pageView.webContents.isLoading()) return
    enterFrameFocus(page.id, 'click')
    markDirty('canvas')
    requestLayout()
  })
  page.pageView.webContents.on('blur', () => {
    // Blur is the exit signal; we never suppress it. Programmatic focus
    // moves cascade through here naturally (e.g. reconciler focuses bgView
    // → focused page blurs → exitFrameFocus).
    if (!isFrameFocused(page.id)) return
    exitFrameFocus('blur')
    markDirty('canvas')
    requestLayout()
  })

  // Spike: webContents focus/blur reliability for ADR 0001 (frame focus
  // model). Enable with `BLUR_SPIKE=1 pnpm dev`. Logs every focus/blur and
  // devtools-open/close on this page's webContents so we can manually
  // exercise DevTools attach, native dialogs, and programmatic focus moves
  // and observe whether blur fires reliably.
  if (process.env.BLUR_SPIKE === '1') {
    const tag = '[blur-spike]'
    const log = (event: string, extra?: Record<string, unknown>) => {
      console.log(tag, event, { pageId: page.id, host: hostOf(page.url), ...extra })
    }
    page.pageView.webContents.on('focus', () => log('page:focus'))
    page.pageView.webContents.on('blur', () => log('page:blur'))
    page.pageView.webContents.on('devtools-opened', () => log('page:devtools-opened'))
    page.pageView.webContents.on('devtools-closed', () => log('page:devtools-closed'))
    page.pageView.webContents.on('devtools-focused', () => log('page:devtools-focused'))
  }

  watchModifierKeys(pageView.webContents, { handleShortcuts: false })

  markDirty('stack'); requestLayout()

  return page
}

export function removePageAtIndex(idx: number): Page | null {
  if (!win || idx < 0 || idx >= pages.length) return null
  const page = pages[idx]
  breadcrumb('page', 'remove', { host: hostOf(page.url) })
  clearPendingRequestsForFrame(page.id)
  exitFrameFocusIfMatches(page.id, 'frame-deleted')
  win.contentView.removeChildView(page.frameView)
  win.contentView.removeChildView(page.pageView)
  if (page.devtoolsHostView) {
    win.contentView.removeChildView(page.devtoolsHostView)
  }
  page.frameView.webContents.close()
  page.pageView.webContents.close()
  page.devtoolsHostView?.webContents.close()
  // Transfer focus to bgView so keyboard shortcuts (including undo) keep
  // working after the deleted page's webContents is destroyed. The actual
  // focus() call lands at the end of the next layout pass via reconcileFocus.
  setPendingFocus({ kind: 'bgView' })
  pages.splice(idx, 1)
  markDirty('canvas', 'sidebar', 'toolbar', 'pages')
  invalidateAgentSnapshot(page.id)
  const previousSelectedIndex = uiSelectedPageIndex(pages.map((p) => p.id))
  updateSelectionForRemovedEntity(page.id)
  inspectSelectedNodeIdByFrame.delete(page.id)

  if (previousSelectedIndex === idx) {
    clearInspectTargets()
  }

  if (!uiSelectedEntityIds().length) {
    setUiSelection({ kind: 'none' })
  }

  sendInteractiveState()
  syncInspectionState()
  return page
}

export function removePageById(id: string): Page | null {
  const idx = pages.findIndex((page) => page.id === id)
  if (idx === -1) return null
  return removePageAtIndex(idx)
}
