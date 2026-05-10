/**
 * Comment tool's page-paints contract + live-bbox round-trip (ADR 0006).
 *
 * Pointer state lifecycle:
 *
 *   renderer (above-view) ─send─▶ main (this module)
 *      ─throttle to ~60 Hz─▶ each page (intersected to page-local coords)
 *
 * The page paints outlines directly in its own DOM. When the comment tool
 * deactivates or the renderer reports a null state, every page receives an
 * `active: false` snapshot that clears its overlay.
 *
 * Live-bbox lifecycle:
 *
 *   renderer ─setAnnotationBboxSubscriptions(pageId, subs)─▶ main (this module)
 *      ─forward─▶ specific page
 *   page (on scroll/resize) ─annotation-bbox-update─▶ main
 *      ─forward─▶ above-view
 */

import { ipcMain } from 'electron'
import type { AnnotationBboxSubscription, AnnotationLiveBboxUpdate } from '../../shared/types'
import { aboveView } from '../runtime/view-refs'
import { pages } from '../runtime/page-runtime'
import { findPageByPageView } from '../runtime/runtime-context'
import { boundScreenBoundsForPage } from '../runtime/runtime-geometry'
import { intersectRegionWithPage, pointerInPage } from '../runtime/comment-hover-math'
import { safeSend } from '../runtime/safe-send'

const POINTER_BROADCAST_INTERVAL_MS = 16

type PointerStateInput =
  | {
      windowX: number
      windowY: number
      regionRect: { x: number; y: number; width: number; height: number } | null
    }
  | null

let latestPointerState: PointerStateInput = null
let lastBroadcastAt = 0
let scheduledFlush: NodeJS.Timeout | null = null
let activeBroadcastInFlight = false
// Tracks whether we last broadcast an "active" frame to pages so we can emit
// a single trailing `active: false` clear when the tool deactivates.
let lastActiveFrame = false

function broadcastPointerState(state: PointerStateInput): void {
  if (!state) {
    if (!lastActiveFrame) return
    lastActiveFrame = false
    for (const page of pages) {
      if (page.pageView.webContents.isDestroyed()) continue
      safeSend(page.pageView.webContents, 'comment-tool-page-preview', {
        active: false,
        pointer: null,
        regionRect: null,
      })
    }
    return
  }

  lastActiveFrame = true
  for (const page of pages) {
    if (page.pageView.webContents.isDestroyed()) continue
    const screen = boundScreenBoundsForPage(page).page
    if (screen.width <= 0 || screen.height <= 0) {
      safeSend(page.pageView.webContents, 'comment-tool-page-preview', {
        active: true,
        pointer: null,
        regionRect: null,
      })
      continue
    }
    const pointer = pointerInPage(state.windowX, state.windowY, screen)
    const regionRect = state.regionRect
      ? intersectRegionWithPage(state.regionRect, screen)
      : null
    safeSend(page.pageView.webContents, 'comment-tool-page-preview', {
      active: true,
      pointer,
      regionRect,
    })
  }
}

function flushPointerState(): void {
  scheduledFlush = null
  if (activeBroadcastInFlight) return
  activeBroadcastInFlight = true
  try {
    broadcastPointerState(latestPointerState)
    lastBroadcastAt = Date.now()
  } finally {
    activeBroadcastInFlight = false
  }
}

function schedulePointerFlush(): void {
  if (scheduledFlush) return
  const elapsed = Date.now() - lastBroadcastAt
  const wait = Math.max(0, POINTER_BROADCAST_INTERVAL_MS - elapsed)
  scheduledFlush = setTimeout(flushPointerState, wait)
}

export function registerCommentHoverIpc(): void {
  ipcMain.on(
    'comment-tool-pointer-state',
    (
      _event,
      payload:
        | {
            windowX?: number
            windowY?: number
            regionRect?: { x: number; y: number; width: number; height: number } | null
          }
        | null
        | undefined,
    ) => {
      if (
        !payload ||
        typeof payload.windowX !== 'number' ||
        typeof payload.windowY !== 'number'
      ) {
        latestPointerState = null
      } else {
        latestPointerState = {
          windowX: payload.windowX,
          windowY: payload.windowY,
          regionRect: payload.regionRect ?? null,
        }
      }
      schedulePointerFlush()
    },
  )

  ipcMain.on(
    'comment-tool-bbox-subscriptions',
    (
      _event,
      payload: { pageId?: string; subscriptions?: AnnotationBboxSubscription[] } | undefined,
    ) => {
      const pageId = typeof payload?.pageId === 'string' ? payload.pageId : null
      if (!pageId) return
      const page = pages.find((candidate) => candidate.id === pageId)
      if (!page || page.pageView.webContents.isDestroyed()) return
      safeSend(page.pageView.webContents, 'annotation-bbox-subscriptions', {
        subscriptions: Array.isArray(payload?.subscriptions) ? payload.subscriptions : [],
      })
    },
  )

  ipcMain.on(
    'annotation-bbox-update',
    (
      event,
      payload: {
        updates?: Array<{
          annotationId?: string
          boundingBox?: AnnotationLiveBboxUpdate['boundingBox']
        }>
      } | undefined,
    ) => {
      const page = findPageByPageView(event.sender)
      if (!page) return
      const updates = Array.isArray(payload?.updates) ? payload.updates : []
      if (!updates.length) return
      if (!aboveView || aboveView.webContents.isDestroyed()) return
      for (const update of updates) {
        if (typeof update?.annotationId !== 'string') continue
        safeSend(aboveView.webContents, 'annotation-live-bbox', {
          pageId: page.id,
          annotationId: update.annotationId,
          boundingBox: update.boundingBox ?? null,
        })
      }
    },
  )
}
