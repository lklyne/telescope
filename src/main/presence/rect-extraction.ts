/**
 * Canvas-space rect helpers for AgentAction waypoint construction.
 *
 * Every AgentAction carries rects in canvas space. The renderer projects
 * them to screen via the current zoom/pan transform, which means canvas and
 * frame surfaces are unified — cursors curve through frame chrome naturally.
 */

import type { CanvasRect } from '../../shared/agent-action'
import { pages } from '../runtime/runtime-context'
import {
  pageCanvasBounds,
  pageOuterCanvasBounds,
} from '../runtime/runtime-geometry'
import {
  getTextEntities,
  getFileEntities,
} from '../runtime/document-commands'
import { resolvePresenceTargetRect } from '../presence-manager'
import type { PresenceTargetRefSource } from '../../shared/types'

/** Default rect size for point-based entities (text/file nodes, canvas points). */
const DEFAULT_ENTITY_RECT_SIZE = 240

/** Canvas origin fallback when there is literally nothing to point at. */
const CANVAS_FALLBACK_RECT: CanvasRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
}

export function rectForFrame(frameId: string): CanvasRect | null {
  const page = pages.find((p) => p.id === frameId)
  if (!page) return null
  const inner = pageCanvasBounds(page)
  // `pageCanvasBounds` anchors at `canvasY` (top of the chrome band) with
  // content-only dimensions — a legacy quirk. For cursor waypoints we
  // want the full visible frame (chrome + content) so the cursor drifts
  // across what the user perceives as "the site". Device-shell insets are
  // excluded; those belong to `rectForFrameOuter`.
  return {
    x: inner.x,
    y: inner.y,
    width: inner.width,
    height: inner.height + page.chromeHeight,
  }
}

export function rectForFrameOuter(frameId: string): CanvasRect | null {
  const page = pages.find((p) => p.id === frameId)
  if (!page) return null
  const bounds = pageOuterCanvasBounds(page)
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

/**
 * Resolve a browse-target ref (e.g. agent-browser node id) to a canvas-space
 * rect by combining the frame's canvas position with the target's in-frame
 * bounds. Returns null if the target can't be resolved — the caller should
 * fall back to the frame rect in that case.
 */
export function rectForBrowseTarget(
  frameId: string | null,
  targetRef: string | null,
  source: PresenceTargetRefSource | null = 'agent-browser',
): CanvasRect | null {
  if (!frameId || !targetRef) return null
  const page = pages.find((p) => p.id === frameId)
  if (!page) return null

  const local = resolvePresenceTargetRect(frameId, targetRef, source, null)
  if (!local) {
    // Agent-browser refs are only resolvable once we've captured a snapshot.
    // Fall back to the frame's content area center so the cursor still
    // moves into the right frame.
    return rectForFrame(frameId)
  }

  // `local` is viewport-local (0,0 = top-left of the webview content). The
  // webview content sits at `(canvasX, canvasY + chromeHeight)` regardless of
  // whether the device shell is on — shell insets expand the *outer* bounds
  // outward from the content, they don't shift the content itself. So anchor
  // off the page directly, not `frameBoundsById` (which returns outer).
  return {
    x: page.canvasX + local.x,
    y: page.canvasY + page.chromeHeight + local.y,
    width: local.width,
    height: local.height,
  }
}

/**
 * Convert a frame-local rect (e.g. from agent-browser `get box --json`,
 * which returns viewport-local pixel coords inside the webview) into a
 * canvas-space rect. Webview content is always at `(canvasX, canvasY +
 * chromeHeight)` — device-shell insets grow the outer bounds, not the
 * content, so don't pull through `frameBoundsById` here.
 */
export function frameLocalRectToCanvas(
  frameId: string,
  local: { x: number; y: number; width: number; height: number },
): CanvasRect | null {
  const page = pages.find((p) => p.id === frameId)
  if (!page) return null
  return {
    x: page.canvasX + local.x,
    y: page.canvasY + page.chromeHeight + local.y,
    width: local.width,
    height: local.height,
  }
}

export function rectForEntity(entityId: string): CanvasRect | null {
  // Pages/frames are the largest entity kind with explicit bounds.
  const frame = rectForFrame(entityId)
  if (frame) return frame

  const text = getTextEntities().find((t) => t.id === entityId)
  if (text) {
    return {
      x: text.canvasX,
      y: text.canvasY,
      width: DEFAULT_ENTITY_RECT_SIZE,
      height: DEFAULT_ENTITY_RECT_SIZE / 2,
    }
  }

  const file = getFileEntities().find((f) => f.id === entityId)
  if (file) {
    return {
      x: file.canvasX,
      y: file.canvasY,
      width: DEFAULT_ENTITY_RECT_SIZE,
      height: DEFAULT_ENTITY_RECT_SIZE,
    }
  }

  return null
}

export function rectsForEntities(entityIds: string[]): CanvasRect[] {
  const out: CanvasRect[] = []
  for (const id of entityIds) {
    const rect = rectForEntity(id)
    if (rect) out.push(rect)
  }
  return out
}

/**
 * Canvas-space rects for every entity in the workspace, sorted top-to-bottom.
 * Used by scan-idiom verbs (workspace, selection, find-placement, annotations)
 * so the cursor hops across the workspace.
 */
export function rectsForScan(maxRects: number = 8): CanvasRect[] {
  const rects: CanvasRect[] = []
  for (const page of pages) {
    const r = rectForFrame(page.id)
    if (r) rects.push(r)
  }
  for (const te of getTextEntities()) {
    rects.push({
      x: te.canvasX,
      y: te.canvasY,
      width: DEFAULT_ENTITY_RECT_SIZE,
      height: DEFAULT_ENTITY_RECT_SIZE / 2,
    })
  }
  for (const fe of getFileEntities()) {
    rects.push({
      x: fe.canvasX,
      y: fe.canvasY,
      width: DEFAULT_ENTITY_RECT_SIZE,
      height: DEFAULT_ENTITY_RECT_SIZE,
    })
  }
  rects.sort((a, b) => a.y - b.y || a.x - b.x)
  return rects.slice(0, maxRects)
}

/**
 * Last-resort rect when nothing else resolves. Prefer the first frame; fall
 * back to the canvas origin.
 */
export function rectForWorkspaceFallback(): CanvasRect {
  if (pages.length > 0) {
    const r = rectForFrame(pages[0].id)
    if (r) return r
  }
  return CANVAS_FALLBACK_RECT
}
