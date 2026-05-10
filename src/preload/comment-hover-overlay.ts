/**
 * Page-paints contract for the comment tool (ADR 0006).
 *
 * While the comment tool is active, main broadcasts a per-page snapshot of
 * the pointer state to each page on the canvas. We paint outlines directly
 * in the page's own DOM so they align pixel-perfectly with content and cost
 * zero IPC per frame:
 *
 *   - `regionRect` set → outline for every salient element whose viewport
 *     bbox intersects the rect (multi-page marquee falls out automatically;
 *     each page paints its own contained elements).
 *   - `regionRect` null + `pointer` set → outline for the single deepest
 *     element under the pointer.
 *   - `active === false` → clear all overlays.
 *
 * Outlines render in a top-level overlay layer with `pointer-events: none`
 * so they never interfere with the comment tool's gate-closed input
 * routing.
 */

import { deepElementFromPoint, isInteractiveForSnapshot, isVisibleForSnapshot } from './dom-element-utils'
import type { CommentToolPagePreviewState } from '../shared/types'

const OVERLAY_LAYER_ID = '__canvas-comment-preview-layer'
const OUTLINE_CLASS = '__canvas-comment-preview-outline'

const REGION_ELEMENT_LIMIT = 60

let overlayLayerEl: HTMLDivElement | null = null
let lastState: CommentToolPagePreviewState = {
  active: false,
  pointer: null,
  regionRect: null,
}
let pendingRefresh = 0

function ensureOverlayLayer(): HTMLDivElement {
  if (overlayLayerEl && overlayLayerEl.isConnected) return overlayLayerEl
  const layer = document.createElement('div')
  layer.id = OVERLAY_LAYER_ID
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2147483645',
  })
  document.documentElement.appendChild(layer)
  overlayLayerEl = layer
  return layer
}

function clearOverlay(): void {
  if (!overlayLayerEl) return
  overlayLayerEl.replaceChildren()
}

function buildOutline(rect: DOMRect | { left: number; top: number; width: number; height: number }): HTMLDivElement {
  const outline = document.createElement('div')
  outline.className = OUTLINE_CLASS
  Object.assign(outline.style, {
    position: 'fixed',
    left: `${Math.round(rect.left)}px`,
    top: `${Math.round(rect.top)}px`,
    width: `${Math.max(1, Math.round(rect.width))}px`,
    height: `${Math.max(1, Math.round(rect.height))}px`,
    border: '1px dashed rgba(244, 63, 94, 0.95)',
    background: 'rgba(244, 63, 94, 0.08)',
    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.18) inset',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  })
  return outline
}

function paintPointerElement(x: number, y: number): void {
  const layer = ensureOverlayLayer()
  layer.replaceChildren()
  const target = deepElementFromPoint(x, y)
  if (!target) return
  // Don't outline the overlay itself (or any of our painted children).
  if (target.id === OVERLAY_LAYER_ID || target.closest(`.${OUTLINE_CLASS}`)) return
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  layer.appendChild(buildOutline(rect))
}

function paintRegionIntersection(region: { x: number; y: number; width: number; height: number }): void {
  const layer = ensureOverlayLayer()
  layer.replaceChildren()
  const right = region.x + region.width
  const bottom = region.y + region.height

  const accepted: Element[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as Element
      if (el.id === OVERLAY_LAYER_ID) return NodeFilter.FILTER_REJECT
      if ((el as HTMLElement).classList?.contains(OUTLINE_CLASS)) return NodeFilter.FILTER_REJECT
      if (!isVisibleForSnapshot(el)) return NodeFilter.FILTER_REJECT
      const box = el.getBoundingClientRect()
      if (box.right < region.x || box.left > right || box.bottom < region.y || box.top > bottom) {
        return NodeFilter.FILTER_SKIP
      }
      // Match `query-elements-in-rect`'s "interactive" filter. This keeps the
      // preview from drowning the page in outlines for layout containers.
      if (isInteractiveForSnapshot(el)) return NodeFilter.FILTER_ACCEPT
      return NodeFilter.FILTER_SKIP
    },
  })

  let node: Node | null
  while ((node = walker.nextNode()) && accepted.length < REGION_ELEMENT_LIMIT) {
    accepted.push(node as Element)
  }

  for (const el of accepted) {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    layer.appendChild(buildOutline(rect))
  }
}

function refresh(state: CommentToolPagePreviewState): void {
  if (!state.active) {
    clearOverlay()
    return
  }
  if (state.regionRect) {
    paintRegionIntersection(state.regionRect)
    return
  }
  if (state.pointer) {
    paintPointerElement(state.pointer.x, state.pointer.y)
    return
  }
  clearOverlay()
}

/**
 * Apply the latest broadcast state. The overlay is repainted synchronously
 * — pointer events arrive at native input rate and the work per frame is
 * cheap (one elementFromPoint or one TreeWalker pass + a few DOM nodes).
 */
export function applyCommentHoverOverlay(state: CommentToolPagePreviewState): void {
  lastState = state
  refresh(state)
}

/**
 * Re-run the most recent paint without changing inputs. Page scroll / resize
 * shifts every element's viewport bbox, so the outline needs to follow even
 * when the broadcast hasn't changed.
 */
export function queueRefreshCommentHoverOverlay(): void {
  if (!lastState.active) return
  if (pendingRefresh) return
  pendingRefresh = window.requestAnimationFrame(() => {
    pendingRefresh = 0
    refresh(lastState)
  })
}

export function clearCommentHoverOverlay(): void {
  if (pendingRefresh) {
    window.cancelAnimationFrame(pendingRefresh)
    pendingRefresh = 0
  }
  lastState = { active: false, pointer: null, regionRect: null }
  clearOverlay()
}
