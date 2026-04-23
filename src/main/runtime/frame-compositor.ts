/**
 * Shared compositing helper — captures a frame's page content with its
 * overlays alpha-blended on top, in z-order:
 *   1. page webContents
 *   2. aboveView (comments, annotations, drawing, marquee, floating UI)
 *   3. cursorOverlayWindow (agent presence cursors + particle trails)
 *
 * Used by video-recorder.ts (per-frame capture loop) and
 * app-control-server.ts (/frames/screenshot-composite endpoint).
 */

import { screen as electronScreen } from 'electron'
import type { NativeImage, WebContents, WebContentsView } from 'electron'
import { aboveView, cursorOverlayWindow } from './view-refs'
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

  // Capture the annotations/comments overlay (aboveView WCV) and the agent
  // presence cursor overlay (a child BrowserWindow — lives outside the WCV
  // stack for click-through, see view-refs.ts). Crop each to the page region
  // and alpha-blend in z-order: page < aboveView < cursor overlay.
  const baseBitmap = pageImage.toBitmap()
  const canCapture = win && !win.isDestroyed()
  const aboveCursor =
    canCapture && aboveView && !aboveView.webContents.isDestroyed()
      ? await captureAndCropToPage(aboveView.webContents, aboveView.getBounds(), page, dpr)
      : null
  blendOnto(baseBitmap, aboveCursor, pageSize)

  const cursorWc = cursorOverlayWindow?.webContents
  const cursorOverlay =
    canCapture && cursorWc && !cursorWc.isDestroyed() && cursorOverlayWindow
      ? await captureAndCropToPage(cursorWc, cursorOverlayWindow.getBounds(), page, dpr)
      : null
  blendOnto(baseBitmap, cursorOverlay, pageSize)

  return { bitmap: baseBitmap, width: pageSize.width, height: pageSize.height }
}

/**
 * Capture an overlay WebContents and crop the result to the given page's
 * on-screen rect. Works for both WebContentsView overlays (aboveView) and
 * child BrowserWindow overlays (cursorOverlayWindow) — both expose getBounds()
 * in the same window coordinate space.
 */
async function captureAndCropToPage(
  wc: WebContents,
  overlayBounds: { x: number; y: number; width: number; height: number },
  page: Page,
  dpr: number,
): Promise<NativeImage | null> {
  const bounds = boundScreenBoundsForPage(page)
  const cropX = Math.round(Math.max(0, bounds.page.x - overlayBounds.x) * dpr)
  const cropY = Math.round(Math.max(0, bounds.page.y - overlayBounds.y) * dpr)
  const cropW = Math.round(
    Math.min(bounds.page.width, overlayBounds.width - (bounds.page.x - overlayBounds.x)) * dpr,
  )
  const cropH = Math.round(
    Math.min(bounds.page.height, overlayBounds.height - (bounds.page.y - overlayBounds.y)) * dpr,
  )
  if (cropW <= 0 || cropH <= 0) return null

  const full = await wc.capturePage()
  if (full.isEmpty()) return null
  const fullSize = full.getSize()
  const safeW = Math.min(cropW, fullSize.width - cropX)
  const safeH = Math.min(cropH, fullSize.height - cropY)
  if (safeW <= 0 || safeH <= 0) return null
  return full.crop({ x: cropX, y: cropY, width: safeW, height: safeH })
}

function blendOnto(
  baseBitmap: Buffer,
  overlay: NativeImage | null,
  pageSize: { width: number; height: number },
): void {
  if (!overlay || overlay.isEmpty()) return
  const overlaySize = overlay.getSize()
  if (overlaySize.width !== pageSize.width || overlaySize.height !== pageSize.height) return
  const overBitmap = overlay.toBitmap()
  for (let i = 0; i < baseBitmap.length; i += 4) {
    const alpha = overBitmap[i + 3] / 255
    if (alpha === 0) continue
    baseBitmap[i] = Math.round(overBitmap[i] * alpha + baseBitmap[i] * (1 - alpha))
    baseBitmap[i + 1] = Math.round(overBitmap[i + 1] * alpha + baseBitmap[i + 1] * (1 - alpha))
    baseBitmap[i + 2] = Math.round(overBitmap[i + 2] * alpha + baseBitmap[i + 2] * (1 - alpha))
    baseBitmap[i + 3] = Math.max(baseBitmap[i + 3], overBitmap[i + 3])
  }
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
