import { ipcMain } from 'electron'
import { VIEWPORT_PRESETS } from '../../shared/constants'
import type { ScrollSyncData, SelectionModifiers } from '../../shared/types'
import { isAdditiveSelection } from '../../shared/selection-modifiers'
import {
  bgView,
  layoutAllViews,
  zoom,
} from '../runtime/surface-layout'
import { markDirty } from '../runtime/layout-dirty'
import { requestLayout } from '../runtime/viewport-control'
import {
  deselectAll,
  setHoverEntity,
} from '../runtime/ui-actions'
import { interactionBlocksPageHover } from '../runtime/interaction-state'
import { annotationMode as uiAnnotationMode } from '../ui-state'
import {
  findPageByPageView,
  pages,
} from '../runtime/page-runtime'
import { win } from '../runtime/window-shell'
import {
  isScrollSuppressed,
  propagateScrollFromPage,
} from '../navigation-sync'

const SELECTION_DEBUG = process.env.CANVAS_DEBUG_SELECTION === '1'

function selectionDebug(event: string, details?: Record<string, unknown>): void {
  if (!SELECTION_DEBUG) return
  console.log('[selection-debug:ipc]', { ts: Date.now(), event, ...details })
}

export function registerPageChromeIpc(): void {
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
