import { screen } from 'electron'
import type { WebContents } from 'electron'
import type { WorkspaceBounds } from '../../shared/types'
import type { Page } from './runtime-entities'
import {
  CARD_BORDER_WIDTH,
  CHROME_HEADER_HEIGHT,
  CHROME_PAGE_GAP,
  FOCUS_CHROME_BOTTOM_GAP,
  FOCUS_CHROME_TOP_OFFSET,
  LEFT_SIDEBAR_WIDTH,
  devtoolsPanelDebug,
} from './runtime-constants'

/** Total vertical space reserved for the pinned focus chrome (offset + height + gap). */
export const FOCUS_CHROME_INSET =
  FOCUS_CHROME_TOP_OFFSET + CHROME_HEADER_HEIGHT + FOCUS_CHROME_BOTTOM_GAP
import {
  frameCustomSizeFromMetadata,
  frameSizeModeFromMetadata,
  deviceIdFromMetadata,
  deviceOrientationFromMetadata,
  showDeviceFrameFromMetadata,
} from './runtime-entities'
import { CUSTOM_SHELL_INSETS, shellInsetsForDevice, sizeForOrientation } from '../../shared/device-catalog'
import { win } from './view-refs'
import { layoutCache } from './layout-cache'
import { pages, pan, zoom } from './runtime-context'
import {
  devtoolsOpen as uiDevtoolsOpen,
  devtoolsWidth as uiDevtoolsWidth,
  focusedFrameId as uiFocusedFrameId,
  leftSidebarOpen as uiLeftSidebarOpen,
  selectedPageIndex as uiSelectedPageIndex,
} from '../ui-state'
import { viewportPresetForIndex } from './runtime-serialization'

type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

export function boundsKey(bounds: Bounds): string {
  return `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function pageContentSize(page: Pick<Page, 'presetIndex' | 'peekWidth' | 'peekHeight' | 'metadata'>): {
  width: number
  height: number
} {
  const vp = viewportPresetForIndex(page.presetIndex)
  const customSize = frameCustomSizeFromMetadata(page.metadata)
  const baseW = page.peekWidth ?? customSize?.width ?? vp.width
  const baseH = page.peekHeight ?? customSize?.height ?? vp.height
  if (customSize || page.peekWidth) return { width: baseW, height: baseH }
  return sizeForOrientation(baseW, baseH, deviceOrientationFromMetadata(page.metadata))
}

export function pageCanvasBounds(
  page: Pick<Page, 'presetIndex' | 'canvasX' | 'canvasY' | 'peekWidth' | 'peekHeight' | 'metadata'>,
): WorkspaceBounds {
  const size = pageContentSize(page)
  return {
    x: page.canvasX,
    y: page.canvasY,
    width: size.width,
    height: size.height,
  }
}

function pageShellInsets(
  page: Pick<Page, 'metadata'>,
): { top: number; right: number; bottom: number; left: number } | null {
  const show = showDeviceFrameFromMetadata(page.metadata)
  if (!show) return null
  const deviceId = deviceIdFromMetadata(page.metadata)
  if (!deviceId) return CUSTOM_SHELL_INSETS
  const orientation = deviceOrientationFromMetadata(page.metadata)
  return shellInsetsForDevice(deviceId, orientation)
}

export function pageOuterCanvasBounds(
  page: Pick<Page, 'presetIndex' | 'canvasX' | 'canvasY' | 'peekWidth' | 'peekHeight' | 'metadata'>,
): WorkspaceBounds {
  const inner = pageCanvasBounds(page)
  const insets = pageShellInsets(page)
  if (!insets) return inner
  return {
    x: inner.x - insets.left,
    y: inner.y - insets.top,
    width: inner.width + insets.left + insets.right,
    height: inner.height + insets.top + insets.bottom,
  }
}

// ---------------------------------------------------------------------------
// Pure computation functions (parameterized — no runtime state)
// ---------------------------------------------------------------------------

export function computeCanvasOrigin(input: {
  toolbarHeight: number
  leftSidebarWidth: number
}): { x: number; y: number } {
  return {
    x: input.leftSidebarWidth,
    y: input.toolbarHeight,
  }
}

export function computeAvailableCanvasViewport(input: {
  win: { getBounds(): { width: number; height: number } } | null
  currentDevtoolsOpen: () => boolean
  currentDevtoolsWidth: () => number
  toolbarHeight: number
  leftSidebarWidth: number
}): { width: number; height: number } {
  const viewport = computeAvailableCanvasViewportRect(input)
  return { width: viewport.width, height: viewport.height }
}

export function computeAvailableCanvasViewportRect(input: {
  win: { getBounds(): { width: number; height: number } } | null
  currentDevtoolsOpen: () => boolean
  currentDevtoolsWidth: () => number
  toolbarHeight: number
  leftSidebarWidth: number
}): { x: number; y: number; width: number; height: number } {
  const { width = 0, height = 0 } = input.win?.getBounds() ?? {}
  const leftInset = input.leftSidebarWidth
  const topInset = input.toolbarHeight
  return {
    x: leftInset,
    y: topInset,
    width: Math.max(
      0,
      width - (input.currentDevtoolsOpen() ? input.currentDevtoolsWidth() : 0) - leftInset,
    ),
    height: Math.max(0, height - topInset),
  }
}

function computeFocusFillViewportSize(input: {
  availableCanvasViewport: () => { width: number; height: number }
}): { width: number; height: number } {
  const viewport = input.availableCanvasViewport()
  return {
    width: Math.max(0, Math.round(viewport.width)),
    height: Math.max(0, Math.round(viewport.height)),
  }
}

/**
 * True when the frame is the focused entity AND its size mode is 'fill' —
 * the frame should be drawn at viewport dimensions (not canvas position).
 */
export function computeIsFocusFillFrame(input: {
  page: Pick<Page, 'id' | 'metadata'>
  focusedFrameId: () => string | null
}): boolean {
  return (
    input.focusedFrameId() === input.page.id &&
    frameSizeModeFromMetadata(input.page.metadata) === 'fill'
  )
}

export function computeEffectivePageContentSize(input: {
  page: Pick<Page, 'id' | 'presetIndex' | 'peekWidth' | 'peekHeight' | 'metadata'>
  isFocusFillFrame: (page: Pick<Page, 'id' | 'metadata'>) => boolean
  focusFillViewportSize: () => { width: number; height: number }
}): { width: number; height: number } {
  if (input.isFocusFillFrame(input.page)) {
    return input.focusFillViewportSize()
  }
  return pageContentSize(input.page)
}

export function computeScreenBoundsForPage(input: {
  page: Page
  effectivePageContentSize: (page: Pick<Page, 'id' | 'presetIndex' | 'peekWidth' | 'peekHeight' | 'metadata'>) => { width: number; height: number }
  availableCanvasViewportRect: () => { x: number; y: number; width: number; height: number }
  focusedFrameId: () => string | null
  isFocusFillFrame: (page: Pick<Page, 'id' | 'metadata'>) => boolean
  zoom: number
  pan: { x: number; y: number }
  toolbarHeight: number
  chromePageGap: number
  cardBorderWidth: number
  focusChromeInset: number
}): {
  frame: { x: number; y: number; width: number; height: number }
  chrome: { x: number; y: number; width: number; height: number }
  page: { x: number; y: number; width: number; height: number }
  shell: { x: number; y: number; width: number; height: number }
} {
  const { width: w, height: h } = input.effectivePageContentSize(input.page)
  const bw = input.cardBorderWidth
  const isFocusFillActive = input.isFocusFillFrame(input.page)
  const displayZoom = isFocusFillActive ? 1 : input.zoom
  const chromeH = Math.round(input.page.chromeHeight * input.zoom)
  const gap = Math.round(input.chromePageGap * input.zoom)
  const contentW = Math.round(w * displayZoom)
  const fullPageH = Math.round(h * displayZoom)
  const viewport = input.availableCanvasViewportRect()
  const viewportTop = input.toolbarHeight
  const viewportHeight = viewport.height
  // In focus-fill mode the pinned chrome sits between the toolbar and the
  // content; content starts below the chrome inset and fills the remainder.
  const fillContentTop = viewportTop + input.focusChromeInset
  const fillContentHeight = Math.max(0, viewportHeight - input.focusChromeInset)
  const pageH = isFocusFillActive ? fillContentHeight : fullPageH
  const rawChromeX = isFocusFillActive
    ? viewport.x
    : Math.round(viewport.x + input.page.canvasX * input.zoom + input.pan.x)
  const pageY = isFocusFillActive
    ? fillContentTop
    : Math.round(input.page.canvasY * input.zoom + input.pan.y) + input.toolbarHeight + chromeH + gap
  const chromeY = isFocusFillActive
    ? fillContentTop
    : Math.round(input.page.canvasY * input.zoom + input.pan.y) + input.toolbarHeight
  // Compute shell rect (device frame bezel) — skip in focus-fill mode
  const insets = pageShellInsets(input.page)
  const shellRect = insets && !isFocusFillActive
    ? {
        x: rawChromeX - Math.round(insets.left * displayZoom),
        y: pageY - Math.round(insets.top * displayZoom),
        width: contentW + Math.round((insets.left + insets.right) * displayZoom),
        height: pageH + Math.round((insets.top + insets.bottom) * displayZoom),
      }
    : {
        x: rawChromeX - bw,
        y: pageY - bw,
        width: contentW + 2 * bw,
        height: pageH + 2 * bw,
      }

  return {
    frame: {
      x: rawChromeX - bw,
      y: pageY - bw,
      width: contentW + 2 * bw,
      height: pageH + 2 * bw,
    },
    chrome: {
      x: rawChromeX,
      y: chromeY,
      width: contentW,
      height: chromeH,
    },
    page: {
      x: rawChromeX,
      y: pageY,
      width: contentW,
      height: pageH,
    },
    shell: shellRect,
  }
}

export function computeApplyEmulation(input: {
  webContents: WebContents
  presetIndex: number
  page?: Page
  zoom: number
  effectivePageContentSize: (page: Pick<Page, 'id' | 'presetIndex' | 'peekWidth' | 'peekHeight' | 'metadata'>) => { width: number; height: number }
  isFocusFillFrame: (page: Pick<Page, 'id' | 'metadata'>) => boolean
  viewportPresetForIndex: (presetIndex: number) => { width: number; height: number }
}): void {
  const start = Date.now()
  const vp = input.viewportPresetForIndex(input.presetIndex)
  const nativeScale = screen.getPrimaryDisplay().scaleFactor
  const fillScale = input.page && input.isFocusFillFrame(input.page) ? 1 : input.zoom
  const size = input.page
    ? input.effectivePageContentSize(input.page)
    : { width: vp.width, height: vp.height }
  input.webContents.enableDeviceEmulation({
    screenPosition: 'desktop',
    screenSize: { width: size.width, height: size.height },
    viewSize: { width: size.width, height: size.height },
    viewPosition: { x: 0, y: 0 },
    deviceScaleFactor: nativeScale,
    scale: fillScale,
  })
  devtoolsPanelDebug('geometry:enable-device-emulation', {
    pageId: input.page?.id ?? null,
    durationMs: Date.now() - start,
    width: size.width,
    height: size.height,
    fillScale,
  })
}

// ---------------------------------------------------------------------------
// Bound convenience functions (close over runtime state)
// ---------------------------------------------------------------------------

export function boundSelectedPage(): Page | null {
  const selectedIndex = uiSelectedPageIndex(pages.map((p) => p.id))
  if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= pages.length) {
    return null
  }
  return pages[selectedIndex]
}

export function boundSelectedPageId(): string | null {
  const page = boundSelectedPage()
  return page?.id ?? null
}

export function boundIsFocusFillFrame(page: Pick<Page, 'id' | 'metadata'>): boolean {
  return computeIsFocusFillFrame({
    page,
    focusedFrameId: uiFocusedFrameId,
  })
}

export function boundAvailableCanvasViewport(): { width: number; height: number } {
  return computeAvailableCanvasViewport({
    win,
    currentDevtoolsOpen: uiDevtoolsOpen,
    currentDevtoolsWidth: uiDevtoolsWidth,
    toolbarHeight: layoutCache.toolbarHeight,
    leftSidebarWidth: uiLeftSidebarOpen() ? LEFT_SIDEBAR_WIDTH : 0,
  })
}

export function boundAvailableCanvasViewportRect(): { x: number; y: number; width: number; height: number } {
  return computeAvailableCanvasViewportRect({
    win,
    currentDevtoolsOpen: uiDevtoolsOpen,
    currentDevtoolsWidth: uiDevtoolsWidth,
    toolbarHeight: layoutCache.toolbarHeight,
    leftSidebarWidth: uiLeftSidebarOpen() ? LEFT_SIDEBAR_WIDTH : 0,
  })
}

export function boundFocusFillViewportSize(): { width: number; height: number } {
  return computeFocusFillViewportSize({
    availableCanvasViewport: boundAvailableCanvasViewport,
  })
}

export function boundEffectivePageContentSize(
  page: Pick<Page, 'id' | 'presetIndex' | 'peekWidth' | 'peekHeight' | 'metadata'>,
): { width: number; height: number } {
  return computeEffectivePageContentSize({
    page,
    isFocusFillFrame: boundIsFocusFillFrame,
    focusFillViewportSize: boundFocusFillViewportSize,
  })
}

export function boundCanvasOrigin(): { x: number; y: number } {
  return computeCanvasOrigin({
    toolbarHeight: layoutCache.toolbarHeight,
    leftSidebarWidth: uiLeftSidebarOpen() ? LEFT_SIDEBAR_WIDTH : 0,
  })
}

export function boundCanvasOriginX(): number {
  return boundCanvasOrigin().x
}

export function boundScreenBoundsForPage(page: Page) {
  return computeScreenBoundsForPage({
    page,
    effectivePageContentSize: boundEffectivePageContentSize,
    availableCanvasViewportRect: boundAvailableCanvasViewportRect,
    focusedFrameId: uiFocusedFrameId,
    isFocusFillFrame: boundIsFocusFillFrame,
    zoom,
    pan,
    toolbarHeight: layoutCache.toolbarHeight,
    chromePageGap: CHROME_PAGE_GAP,
    cardBorderWidth: CARD_BORDER_WIDTH,
    focusChromeInset: FOCUS_CHROME_INSET,
  })
}

export function boundApplyEmulation(webContents: WebContents, presetIndex: number, page?: Page): void {
  computeApplyEmulation({
    webContents,
    presetIndex,
    page,
    zoom,
    effectivePageContentSize: boundEffectivePageContentSize,
    isFocusFillFrame: boundIsFocusFillFrame,
    viewportPresetForIndex,
  })
}
