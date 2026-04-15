/**
 * Shared compositing helper — captures a frame's page content with its
 * comment/annotation overlay alpha-blended on top.
 *
 * Used by video-recorder.ts (per-frame capture loop) and
 * app-control-server.ts (/frames/screenshot-composite endpoint).
 */

import { screen as electronScreen } from 'electron'
import type { NativeImage, WebContentsView } from 'electron'
import { aboveView } from './view-refs'
import type { Page } from './runtime-entities'
import { win } from './window-shell'
import { boundScreenBoundsForPage } from './runtime-geometry'

export interface CompositedCapture {
  bitmap: Buffer
  width: number // physical pixels
  height: number // physical pixels
}

/**
 * Capture a single frame with its overlay composited on top.
 *
 * Returns null if the capture fails (destroyed webContents, empty image, etc.).
 * Callers that need a specific DPR can pass it in opts to avoid re-querying
 * the display (useful in hot loops like video recording).
 */
export async function captureFrameComposited(
  page: Page,
  opts?: { dpr?: number },
): Promise<CompositedCapture | null> {
  if (page.pageView.webContents.isDestroyed()) return null

  const pageImage = await page.pageView.webContents.capturePage()
  if (pageImage.isEmpty()) return null

  const pageSize = pageImage.getSize()
  if (pageSize.width === 0 || pageSize.height === 0) return null

  // Resolve device pixel ratio.
  const dpr =
    opts?.dpr ??
    (win && !win.isDestroyed()
      ? electronScreen.getDisplayMatching(win.getBounds()).scaleFactor
      : 1)

  // Capture and crop the overlay (cursor, annotations) to the page region.
  let croppedOverlay: NativeImage | null = null
  const overlayWc = aboveView?.webContents
  if (overlayWc && !overlayWc.isDestroyed() && win && !win.isDestroyed()) {
    const bounds = boundScreenBoundsForPage(page)
    const overlayBounds = aboveView!.getBounds()
    const cropX = Math.round(Math.max(0, bounds.page.x - overlayBounds.x) * dpr)
    const cropY = Math.round(Math.max(0, bounds.page.y - overlayBounds.y) * dpr)
    const cropW = Math.round(
      Math.min(bounds.page.width, overlayBounds.width - (bounds.page.x - overlayBounds.x)) * dpr,
    )
    const cropH = Math.round(
      Math.min(bounds.page.height, overlayBounds.height - (bounds.page.y - overlayBounds.y)) * dpr,
    )
    if (cropW > 0 && cropH > 0) {
      const fullOverlay = await overlayWc.capturePage()
      if (!fullOverlay.isEmpty()) {
        const fullSize = fullOverlay.getSize()
        const safeW = Math.min(cropW, fullSize.width - cropX)
        const safeH = Math.min(cropH, fullSize.height - cropY)
        if (safeW > 0 && safeH > 0) {
          croppedOverlay = fullOverlay.crop({
            x: cropX,
            y: cropY,
            width: safeW,
            height: safeH,
          })
        }
      }
    }
  }

  // Alpha-blend overlay onto page content.
  const baseBitmap = pageImage.toBitmap()
  if (croppedOverlay && !croppedOverlay.isEmpty()) {
    const overlaySize = croppedOverlay.getSize()
    if (overlaySize.width === pageSize.width && overlaySize.height === pageSize.height) {
      const overBitmap = croppedOverlay.toBitmap()
      for (let i = 0; i < baseBitmap.length; i += 4) {
        const alpha = overBitmap[i + 3] / 255
        if (alpha === 0) continue
        baseBitmap[i] = Math.round(overBitmap[i] * alpha + baseBitmap[i] * (1 - alpha))
        baseBitmap[i + 1] = Math.round(
          overBitmap[i + 1] * alpha + baseBitmap[i + 1] * (1 - alpha),
        )
        baseBitmap[i + 2] = Math.round(
          overBitmap[i + 2] * alpha + baseBitmap[i + 2] * (1 - alpha),
        )
        baseBitmap[i + 3] = Math.max(baseBitmap[i + 3], overBitmap[i + 3])
      }
    }
  }

  return { bitmap: baseBitmap, width: pageSize.width, height: pageSize.height }
}

/**
 * Capture a rectangular region from an arbitrary WebContentsView.
 *
 * Captures the full view, then crops to the specified screen-coordinate rect.
 * Useful for capturing bgView (text notes, frame chrome, grid) or any overlay.
 */
export async function captureViewRegion(
  view: WebContentsView,
  screenRect: { x: number; y: number; width: number; height: number },
  opts?: { dpr?: number },
): Promise<CompositedCapture | null> {
  if (view.webContents.isDestroyed()) return null

  const dpr =
    opts?.dpr ??
    (win && !win.isDestroyed()
      ? electronScreen.getDisplayMatching(win.getBounds()).scaleFactor
      : 1)

  const fullImage = await view.webContents.capturePage()
  if (fullImage.isEmpty()) return null

  const viewBounds = view.getBounds()
  const cropX = Math.round(Math.max(0, screenRect.x - viewBounds.x) * dpr)
  const cropY = Math.round(Math.max(0, screenRect.y - viewBounds.y) * dpr)
  const cropW = Math.round(screenRect.width * dpr)
  const cropH = Math.round(screenRect.height * dpr)

  if (cropW <= 0 || cropH <= 0) return null

  const fullSize = fullImage.getSize()
  const safeW = Math.min(cropW, fullSize.width - cropX)
  const safeH = Math.min(cropH, fullSize.height - cropY)
  if (safeW <= 0 || safeH <= 0) return null

  const cropped = fullImage.crop({ x: cropX, y: cropY, width: safeW, height: safeH })
  return { bitmap: cropped.toBitmap(), width: safeW, height: safeH }
}
