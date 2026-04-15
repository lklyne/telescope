import { ipcMain } from 'electron'
import { VIEWPORT_PRESETS } from '../../shared/constants'
import type { ScrollSyncData } from '../../shared/types'
import {
  canvasOrigin,
  bgView,
  layoutAllViews,
  layoutCache,
  pan,
  requestLayout,
  screenBoundsForPage,
  snapToGrid,
  zoom,
} from '../runtime/surface-layout'
import { markDirty } from '../runtime/layout-dirty'
import {
  finalizeDrag,
  initializeDrag,
  applyDragDelta,
} from '../runtime/document-commands'
import {
  deselectAll,
  openDevToolsForSelectedPage,
  selectPage,
  setHoverEntity,
  setHoveredFrame,
} from '../runtime/ui-actions'
import {
  interactionBlocksPageHover,
  interactionBlocksPageSelection,
} from '../runtime/interaction-state'
import { tryEnter, commitActive, cancelActive } from '../runtime/interaction-controller'
import {
  findPageByPageView,
  findPageBySender,
  pages,
} from '../runtime/page-runtime'
import { clearCustomFrameSizeMetadata } from '../runtime/runtime-entities'
import { setPendingFocus } from '../runtime/runtime-context'
import { win } from '../runtime/window-shell'
import { scheduleWorkspaceAutosave } from '../runtime/workspace-session'
import {
  isScrollSuppressed,
  markNavigationSuppressed,
  propagateNavigationFromPage,
  propagateScrollFromPage,
  togglePageLinked,
} from '../navigation-sync'
import { deleteFrames, selectEntitiesInRect } from '../workspace-entities'
import { duplicateFrameFromSource } from '../workspace-frames'
import { selectedDragEntityIds } from '../runtime/selection-controller'
import { aboveView } from '../runtime/view-refs'
import { setCommentOverlayActive } from '../runtime/runtime-core'
import { setSelectionOverlayRect } from '../runtime/window-shell'

const SELECTION_DEBUG = process.env.CANVAS_DEBUG_SELECTION === '1'

function selectionDebug(event: string, details?: Record<string, unknown>): void {
  if (!SELECTION_DEBUG) return
  console.log('[selection-debug:ipc]', { ts: Date.now(), event, ...details })
}

function resolveDraggedEntityIds(entityId: string): string[] {
  return selectedDragEntityIds(entityId)
}

export function registerPageChromeIpc(): void {
  ipcMain.on('page-select', (event) => {
    if (interactionBlocksPageSelection()) {
      selectionDebug('ipc:page-select:suppressed', { senderId: event.sender.id })
      return
    }
    const idx = pages.findIndex((page) => page.pageView.webContents === event.sender)
    selectionDebug('ipc:page-select', { idx, senderId: event.sender.id })
    if (idx !== -1) selectPage(idx)
  })

  ipcMain.on('page-deselect', () => {
    selectionDebug('ipc:page-deselect')
    deselectAll()
  })

  ipcMain.on('frame-hover', (event, hovered: boolean) => {
    if (interactionBlocksPageHover()) return
    const page = pages.find((candidate) => candidate.pageView.webContents === event.sender)
    setHoverEntity(hovered && page ? { id: page.id, kind: 'frame' } : null)
  })

  ipcMain.on('chrome-select', (event) => {
    if (interactionBlocksPageSelection()) {
      selectionDebug('ipc:chrome-select:suppressed', { senderId: event.sender.id })
      return
    }
    const idx = pages.findIndex((page) => page.chromeView.webContents === event.sender)
    selectionDebug('ipc:chrome-select', { idx, senderId: event.sender.id })
    if (idx !== -1) selectPage(idx)
  })

  ipcMain.on('chrome-navigate', (event, url: string) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    markNavigationSuppressed(page)
    page.pageView.webContents.loadURL(url)
    propagateNavigationFromPage(page, { type: 'load-url', url })
  })

  ipcMain.on('chrome-back', (event) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    const fallbackUrl = page.pageView.webContents.getURL()
    if (page.pageView.webContents.canGoBack()) {
      markNavigationSuppressed(page)
      page.pageView.webContents.goBack()
    }
    propagateNavigationFromPage(page, { type: 'go-back', fallbackUrl })
  })

  ipcMain.on('chrome-forward', (event) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    const fallbackUrl = page.pageView.webContents.getURL()
    if (page.pageView.webContents.canGoForward()) {
      markNavigationSuppressed(page)
      page.pageView.webContents.goForward()
    }
    propagateNavigationFromPage(page, { type: 'go-forward', fallbackUrl })
  })

  ipcMain.on('chrome-open-devtools', (event) => {
    const idx = pages.findIndex((page) => page.chromeView.webContents === event.sender)
    if (idx === -1) return
    selectPage(idx)
    openDevToolsForSelectedPage()
  })

  ipcMain.on('chrome-reload', (event) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    const fallbackUrl = page.pageView.webContents.getURL()
    markNavigationSuppressed(page)
    page.pageView.webContents.reload()
    propagateNavigationFromPage(page, { type: 'reload', fallbackUrl })
  })

  ipcMain.on('chrome-toggle-linked', (event) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    togglePageLinked(page)
    layoutAllViews()
  })

  ipcMain.on('chrome-close', (event) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    deleteFrames({ frameIds: [page.id] })
  })

  ipcMain.on('page-scroll-changed', (event, data: ScrollSyncData) => {
    const page = findPageByPageView(event.sender)
    if (!page || !page.linked) return
    if (isScrollSuppressed(page)) return
    propagateScrollFromPage(page, data)
  })

  ipcMain.on('chrome-drag', (event, { dx, dy }: { dx: number; dy: number }) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    page.canvasX = snapToGrid(page.canvasX + dx / zoom)
    page.canvasY = snapToGrid(page.canvasY + dy / zoom)
    requestLayout()
  })

  ipcMain.on('page-group-drag-start', (event) => {
    const page = findPageByPageView(event.sender)
    if (!page) return
    cancelActive('external')
    initializeDrag(resolveDraggedEntityIds(page.id))
  })

  ipcMain.on('page-group-drag', (event, { dx, dy }: { dx: number; dy: number }) => {
    const page = findPageByPageView(event.sender)
    if (!page) return
    applyDragDelta(resolveDraggedEntityIds(page.id), dx, dy)
    requestLayout()
  })

  ipcMain.on('page-group-drag-end', (event) => {
    const page = findPageByPageView(event.sender)
    if (!page) return
    finalizeDrag()
  })

  ipcMain.on(
    'page-marquee-select-overlay',
    (
      event,
      rect: { screenX: number; screenY: number; width: number; height: number } | null,
    ) => {
      const page = findPageByPageView(event.sender)
      if (!page || !win) return

      if (!rect) {
        commitActive()
        setSelectionOverlayRect(null)
        return
      }

      const contentBounds = win.getContentBounds()
      tryEnter({ kind: 'marquee' })
      setSelectionOverlayRect({
        rect: {
          left: rect.screenX - contentBounds.x,
          top: rect.screenY - contentBounds.y - layoutCache.toolbarHeight,
          width: rect.width,
          height: rect.height,
        },
        variant: 'default',
      })
    },
  )

  ipcMain.on(
    'page-marquee-select-commit',
    (
      event,
      rect: { screenX: number; screenY: number; width: number; height: number },
    ) => {
      const page = findPageByPageView(event.sender)
      if (!page || !win) return

      commitActive()
      setSelectionOverlayRect(null)

      if (rect.width < 4 || rect.height < 4) return

      const contentBounds = win.getContentBounds()
      const origin = canvasOrigin()
      const clientX = rect.screenX - contentBounds.x
      const clientY = rect.screenY - contentBounds.y
      selectEntitiesInRect({
        x: (clientX - origin.x - pan.x) / zoom,
        y: (clientY - origin.y - pan.y) / zoom,
        width: rect.width / zoom,
        height: rect.height / zoom,
      })
    },
  )

  ipcMain.on(
    'page-region-select-overlay',
    (
      event,
      rect: { screenX: number; screenY: number; width: number; height: number } | null,
    ) => {
      const page = findPageByPageView(event.sender)
      if (!page || !win) return

      if (!rect) {
        commitActive()
        setSelectionOverlayRect(null)
        return
      }

      const contentBounds = win.getContentBounds()
      tryEnter({ kind: 'marquee' })
      setSelectionOverlayRect({
        rect: {
          left: rect.screenX - contentBounds.x,
          top: rect.screenY - contentBounds.y - layoutCache.toolbarHeight,
          width: rect.width,
          height: rect.height,
        },
        variant: 'region-select',
      })
    },
  )

  ipcMain.on(
    'page-region-select-commit',
    (
      event,
      rect: { screenX: number; screenY: number; width: number; height: number },
    ) => {
      const page = findPageByPageView(event.sender)
      if (!page || !win) return

      commitActive()
      setSelectionOverlayRect(null)

      if (rect.width < 4 || rect.height < 4) return

      const contentBounds = win.getContentBounds()
      const origin = canvasOrigin()
      const clientX = rect.screenX - contentBounds.x
      const clientY = rect.screenY - contentBounds.y
      const canvasRect = {
        x: (clientX - origin.x - pan.x) / zoom,
        y: (clientY - origin.y - pan.y) / zoom,
        width: rect.width / zoom,
        height: rect.height / zoom,
      }

      setCommentOverlayActive(true)
      setPendingFocus({ kind: 'aboveView' })
      layoutAllViews()
      if (aboveView && !aboveView.webContents.isDestroyed()) {
        aboveView.webContents.send('region-select-committed', { canvasRect })
      }
    },
  )

  ipcMain.on('chrome-cycle-preset', (event, direction: number) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    const len = VIEWPORT_PRESETS.length
    page.presetIndex = (page.presetIndex + direction + len) % len
    page.metadata = clearCustomFrameSizeMetadata(page.metadata)
    scheduleWorkspaceAutosave()
    layoutAllViews()
  })

  ipcMain.on('chrome-set-preset', (event, index: number) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    if (index < 0 || index >= VIEWPORT_PRESETS.length) return
    page.presetIndex = index
    page.metadata = clearCustomFrameSizeMetadata(page.metadata)
    scheduleWorkspaceAutosave()
    layoutAllViews()
  })

  ipcMain.on('chrome-dropdown-open', (event) => {
    const page = findPageBySender(event.sender)
    if (!page || !win) return
    const expandedHeight = 400
    const chromeBounds = screenBoundsForPage(page).chrome
    page.chromeView.setBounds({
      x: chromeBounds.x,
      y: chromeBounds.y,
      width: chromeBounds.width,
      height: Math.round(expandedHeight * zoom),
    })
    page.chromeView.webContents.enableDeviceEmulation({
      screenPosition: 'desktop',
      screenSize: { width: chromeBounds.width / zoom, height: expandedHeight },
      viewSize: { width: chromeBounds.width / zoom, height: expandedHeight },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: 1,
      scale: zoom,
    })
    win.contentView.addChildView(page.chromeView)
    markDirty('stack'); requestLayout()
  })

  ipcMain.on('chrome-dropdown-close', () => {
    layoutAllViews()
  })

  ipcMain.on('canvas-bg-dropdown-open', () => {
    if (!bgView || !win) return
    markDirty('stack'); requestLayout()
  })

  ipcMain.on('canvas-bg-dropdown-close', () => {
    markDirty('stack'); requestLayout()
  })

  ipcMain.on('chrome-duplicate', (event) => {
    const page = findPageBySender(event.sender)
    if (!page) return
    duplicateFrameFromSource({
      sourceFrameId: page.id,
      focus: true,
    })
  })

  ipcMain.on('peek-resize-start', (event) => {
    const page = findPageByPageView(event.sender)
    if (!page) return
    const vp = VIEWPORT_PRESETS[page.presetIndex]
    page.peekWidth = vp.width
    page.peekHeight = vp.height
  })

  ipcMain.on('peek-resize-move', (event, { dx, dy }: { dx: number; dy: number }) => {
    const page = findPageByPageView(event.sender)
    if (!page || page.peekWidth === undefined || page.peekHeight === undefined) return
    page.peekWidth = Math.max(320, Math.round(page.peekWidth + dx / zoom))
    page.peekHeight = Math.max(200, Math.round(page.peekHeight + dy / zoom))
    requestLayout()
  })

  ipcMain.on('peek-resize-end', (event) => {
    const page = findPageByPageView(event.sender)
    if (!page) return
    page.peekWidth = undefined
    page.peekHeight = undefined
    layoutAllViews()
  })
}
