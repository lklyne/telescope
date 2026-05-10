/**
 * Window → page / window → canvas geometry helpers.
 *
 * The renderer dispatches comment-tool clicks in window coordinates (the
 * same space `forwardPointerToPage` already speaks). Main needs to:
 *  1. resolve which page sits under the click (if any), in render order;
 *  2. fall back to a canvas-coord anchor when no page is hit.
 *
 * Pure plumbing on top of `boundScreenBoundsForPage` and the runtime
 * `zoom` / `pan` / `canvasOrigin`. No external state.
 */

import { pages, pan, zoom } from './runtime-context'
import {
  boundCanvasOrigin,
  boundScreenBoundsForPage,
} from './runtime-geometry'

export type PageHit = {
  pageId: string
  /** Page-local x, suitable for `query-element-at-point`. */
  localX: number
  /** Page-local y, suitable for `query-element-at-point`. */
  localY: number
}

/**
 * Returns the topmost page whose `page` rect contains the window-coord
 * (windowX, windowY), or null. Iterates in reverse `pages` order so later
 * entries — which paint on top — win.
 */
export function pageAtWindowPoint(windowX: number, windowY: number): PageHit | null {
  for (let i = pages.length - 1; i >= 0; i--) {
    const page = pages[i]
    if (!page || page.pageView.webContents.isDestroyed()) continue
    const bounds = boundScreenBoundsForPage(page).page
    if (bounds.width <= 0 || bounds.height <= 0) continue
    if (
      windowX < bounds.x ||
      windowX >= bounds.x + bounds.width ||
      windowY < bounds.y ||
      windowY >= bounds.y + bounds.height
    ) {
      continue
    }
    return {
      pageId: page.id,
      localX: Math.round(windowX - bounds.x),
      localY: Math.round(windowY - bounds.y),
    }
  }
  return null
}

/** Inverse of `canvasToScreenPoint` — used for canvas-anchor fallback. */
export function windowPointToCanvasPoint(
  windowX: number,
  windowY: number,
): { x: number; y: number } {
  const origin = boundCanvasOrigin()
  return {
    x: (windowX - origin.x - pan.x) / zoom,
    y: (windowY - origin.y - pan.y) / zoom,
  }
}
