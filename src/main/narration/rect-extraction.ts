/**
 * Canvas-space rect helpers for narration waypoint construction.
 *
 * Every NarrationEvent carries rects in canvas space. The renderer projects
 * them to screen via the current zoom/pan transform, which means canvas and
 * frame surfaces are unified — cursors curve through frame chrome naturally.
 */

import type { CanvasRect } from '../../shared/narration-event'
import { pages } from '../runtime/runtime-context'
import {
  pageCanvasBounds,
  pageOuterCanvasBounds,
} from '../runtime/runtime-geometry'
import { frameBoundsById } from '../workspace-entities'
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
  const bounds = pageCanvasBounds(page)
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
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
  const frameBounds = frameBoundsById(frameId)
  if (!frameBounds) return null

  const page = pages.find((p) => p.id === frameId)
  if (!page) return null

  const local = resolvePresenceTargetRect(frameId, targetRef, source, null)
  if (!local) {
    // Agent-browser refs are only resolvable once we've captured a snapshot.
    // Fall back to the frame's content area center so the cursor still
    // moves into the right frame.
    return rectForFrame(frameId)
  }

  // local is frame-local (0,0 = top-left of page content). Offset by frame
  // position + chrome height so rects project into canvas space.
  return {
    x: frameBounds.x + local.x,
    y: frameBounds.y + page.chromeHeight + local.y,
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
