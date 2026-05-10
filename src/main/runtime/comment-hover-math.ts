/**
 * Pure helpers for the comment tool's page-paints contract (ADR 0006).
 *
 * Lives outside `register-comment-hover-ipc.ts` so it can be unit-tested
 * without standing up Electron's `ipcMain` plumbing.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Intersect a window-coord rect with a page's window-coord screen rect and
 * return the result in page-local coords (origin at the page's top-left).
 * Returns `null` when the rects don't overlap or the page has no area.
 */
export function intersectRegionWithPage(region: Rect, pageBounds: Rect): Rect | null {
  if (pageBounds.width <= 0 || pageBounds.height <= 0) return null
  const left = Math.max(region.x, pageBounds.x)
  const top = Math.max(region.y, pageBounds.y)
  const right = Math.min(region.x + region.width, pageBounds.x + pageBounds.width)
  const bottom = Math.min(region.y + region.height, pageBounds.y + pageBounds.height)
  if (right <= left || bottom <= top) return null
  return {
    x: Math.round(left - pageBounds.x),
    y: Math.round(top - pageBounds.y),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  }
}

/**
 * Map a window-coord pointer onto a page's local coordinate space, or
 * `null` when the pointer falls outside the page's screen rect.
 */
export function pointerInPage(
  windowX: number,
  windowY: number,
  pageBounds: Rect,
): { x: number; y: number } | null {
  if (pageBounds.width <= 0 || pageBounds.height <= 0) return null
  if (
    windowX < pageBounds.x ||
    windowX >= pageBounds.x + pageBounds.width ||
    windowY < pageBounds.y ||
    windowY >= pageBounds.y + pageBounds.height
  ) {
    return null
  }
  return {
    x: Math.round(windowX - pageBounds.x),
    y: Math.round(windowY - pageBounds.y),
  }
}
