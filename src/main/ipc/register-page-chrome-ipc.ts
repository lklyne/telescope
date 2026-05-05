import { ipcMain } from 'electron'
import { VIEWPORT_PRESETS } from '../../shared/constants'
import type { ScrollSyncData, SelectionModifiers } from '../../shared/types'
import {
  isAdditiveSelection,
  selectionMutationMode,
} from '../../shared/selection-modifiers'
import {
  canvasOrigin,
  bgView,
  layoutAllViews,
  layoutCache,
  pan,
  zoom,
} from '../runtime/surface-layout'
import { markDirty } from '../runtime/layout-dirty'
import { requestLayout } from '../runtime/viewport-control'
import {
  finalizeDrag,
  initializeDrag,
  applyDragDelta,
} from '../runtime/document-commands'
import {
  deselectAll,
  selectPage,
  setHoverEntity,
} from '../runtime/ui-actions'
import {
  interactionBlocksPageHover,
  interactionBlocksPageSelection,
} from '../runtime/interaction-state'
import { annotationMode as uiAnnotationMode } from '../ui-state'
import { tryEnter, commitActive, cancelActive } from '../runtime/interaction-controller'
import {
  findPageByPageView,
  pages,
} from '../runtime/page-runtime'
import { setPendingFocus } from '../runtime/runtime-context'
import { win } from '../runtime/window-shell'
import {
  isScrollSuppressed,
  propagateScrollFromPage,
} from '../navigation-sync'
import { selectEntitiesInRect } from '../workspace-entities'
import {
  applyEntitySelectionMutation,
  selectedDragEntityIds,
} from '../runtime/selection-controller'
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
  ipcMain.on(
    'page-select',
    (event, payload?: { modifiers?: SelectionModifiers }) => {
      if (interactionBlocksPageSelection()) {
        selectionDebug('ipc:page-select:suppressed', { senderId: event.sender.id })
        return
      }
      const page = pages.find((candidate) => candidate.pageView.webContents === event.sender)
      if (!page) return
      const mode = selectionMutationMode(payload?.modifiers)
      selectionDebug('ipc:page-select', { pageId: page.id, senderId: event.sender.id, mode })
      if (mode === 'replace') {
        const idx = pages.indexOf(page)
        if (idx !== -1) selectPage(idx)
        return
      }
      applyEntitySelectionMutation([page.id], mode)
    },
  )

  ipcMain.on(
    'page-deselect',
    (_event, payload?: { modifiers?: SelectionModifiers }) => {
      // Additive modifiers (shift/meta/ctrl) preserve the existing selection
      // so clicking on empty space with a modifier held does not wipe it.
      if (isAdditiveSelection(payload?.modifiers)) {
        selectionDebug('ipc:page-deselect:suppressed-additive')
        return
      }
      selectionDebug('ipc:page-deselect')
      deselectAll()
    },
  )

  ipcMain.on('frame-hover', (event, hovered: boolean) => {
    if (interactionBlocksPageHover()) return
    if (uiAnnotationMode() === 'region_select') return
    const page = pages.find((candidate) => candidate.pageView.webContents === event.sender)
    setHoverEntity(hovered && page ? { id: page.id, kind: 'frame' } : null)
  })

  ipcMain.on('page-scroll-changed', (event, data: ScrollSyncData) => {
    const page = findPageByPageView(event.sender)
    if (!page || !page.linked) return
    if (isScrollSuppressed(page)) return
    propagateScrollFromPage(page, data)
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
      rect: {
        screenX: number
        screenY: number
        width: number
        height: number
        modifiers?: SelectionModifiers
      },
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
      selectEntitiesInRect(
        {
          x: (clientX - origin.x - pan.x) / zoom,
          y: (clientY - origin.y - pan.y) / zoom,
          width: rect.width / zoom,
          height: rect.height / zoom,
        },
        { mode: selectionMutationMode(rect.modifiers) },
      )
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

  ipcMain.on('canvas-bg-dropdown-open', () => {
    if (!bgView || !win) return
    markDirty('stack'); requestLayout()
  })

  ipcMain.on('canvas-bg-dropdown-close', () => {
    markDirty('stack'); requestLayout()
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
