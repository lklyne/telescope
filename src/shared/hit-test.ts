/**
 * Hit-tester for canvas pointer events arriving from aboveView.
 *
 * Replaces the per-layer onMouseDown / DOM-stacking arbitration in bgView.
 * See docs/adr/0001-click-to-enter-frame-focus.md.
 *
 * Pure: no Electron, no DOM. Selectors derive screen-space HitTargets from
 * the canvas scene; hitTest walks them by priority and returns the winner.
 *
 * Lives in src/shared so the renderer canvas-pointer-router and main-side
 * test routes can share one implementation without an IPC roundtrip.
 */

import { regionContains, type HitRegion, type Point, type Rect } from './hit-regions'
import {
  EDGE_ANCHOR_HIT_ACROSS_PX,
  EDGE_ANCHOR_HIT_ALONG_PX,
  EDGE_ANCHOR_HIT_GAP_PX,
  EDGE_SIDES,
  FRAME_CHROME_HEIGHT_PX,
  RESIZE_HANDLE_HIT_PX,
  scaleEdgeAnchorHitSize,
} from './canvas-hit-geometry'
import type {
  CanvasEntityKind,
  CanvasSceneEntity,
  EdgeSide,
  WorkspaceEdge,
} from './types'
import { HIT_LAYER_ORDER, type HitLayer } from './interaction-priority'

// --- Public types ---

export type ResizeHandle =
  | 'n' | 's' | 'e' | 'w'
  | 'ne' | 'nw' | 'se' | 'sw'

export type HitPayload =
  | { kind: 'resize-handle'; entityId: string; entityKind: CanvasEntityKind; handle: ResizeHandle }
  | { kind: 'chrome'; entityId: string; entityKind: CanvasEntityKind }
  | { kind: 'anchor'; entityId: string; entityKind: CanvasEntityKind; side: EdgeSide }
  | { kind: 'frame-body'; entityId: string }
  | { kind: 'entity-body'; entityId: string; entityKind: CanvasEntityKind }
  | { kind: 'background' }

export interface HitTarget {
  layer: HitLayer
  region: HitRegion
  payload: HitPayload
}

export interface HitInputs {
  entities: readonly CanvasSceneEntity[]
  edges: readonly WorkspaceEdge[]
  selectedEntityIds: readonly string[]
  selectedGroupId?: string | null
  zoom: number
}

// --- Top-level hit-test ---

const BACKGROUND_TARGET: HitTarget = {
  layer: 'background',
  region: { kind: 'rect', rect: { x: -Infinity, y: -Infinity, width: Infinity, height: Infinity } },
  payload: { kind: 'background' },
}

export function hitTest(inputs: HitInputs, point: Point): HitTarget {
  for (const layer of HIT_LAYER_ORDER) {
    const targets = collectLayerTargets(layer, inputs)
    // First registered match wins within a layer. Selectors are responsible
    // for ordering within a layer (e.g. front-to-back z-order for entities).
    for (const target of targets) {
      if (regionContains(target.region, point)) return target
    }
  }
  return BACKGROUND_TARGET
}

// --- Layer collectors ---

function collectLayerTargets(layer: HitLayer, inputs: HitInputs): HitTarget[] {
  switch (layer) {
    case 'resize-handles':
      return collectResizeHandles(inputs)
    case 'chrome':
      return collectChromeTargets(inputs)
    case 'anchors':
      return collectAnchorTargets(inputs)
    case 'body':
      return collectBodyTargets(inputs)
    case 'background':
      return []
  }
}

// --- Selectors ---

function collectResizeHandles(inputs: HitInputs): HitTarget[] {
  const selected = new Set(inputs.selectedEntityIds)
  if (inputs.selectedGroupId) selected.add(inputs.selectedGroupId)
  const out: HitTarget[] = []
  for (const entity of inputs.entities) {
    if (!selected.has(entity.id)) continue
    for (const handle of HANDLES) {
      out.push({
        layer: 'resize-handles',
        region: { kind: 'rect', rect: handleRect(entity, handle) },
        payload: {
          kind: 'resize-handle',
          entityId: entity.id,
          entityKind: entity.kind,
          handle,
        },
      })
    }
  }
  return out
}

function collectChromeTargets(inputs: HitInputs): HitTarget[] {
  const out: HitTarget[] = []
  for (const entity of inputs.entities) {
    if (!entityHasChrome(entity.kind)) continue
    out.push({
      layer: 'chrome',
      region: { kind: 'rect', rect: chromeRect(entity) },
      payload: { kind: 'chrome', entityId: entity.id, entityKind: entity.kind },
    })
  }
  return out
}

function collectAnchorTargets(inputs: HitInputs): HitTarget[] {
  const selected = new Set(inputs.selectedEntityIds)
  if (inputs.selectedGroupId) selected.add(inputs.selectedGroupId)
  const out: HitTarget[] = []
  for (const entity of inputs.entities) {
    if (!entityHasAnchors(entity.kind)) continue
    // Mirror EdgeLayer's policy: anchors show on selected + hovered entities.
    // For hit-test purposes we expose anchors on selected entities; hover
    // is renderer-only ephemera.
    if (!selected.has(entity.id)) continue
    for (const side of EDGE_SIDES) {
      out.push({
        layer: 'anchors',
        region: { kind: 'rect', rect: anchorRect(entity, side, inputs.zoom) },
        payload: { kind: 'anchor', entityId: entity.id, entityKind: entity.kind, side },
      })
    }
  }
  return out
}

function collectBodyTargets(inputs: HitInputs): HitTarget[] {
  // Front-to-back: groups are containers; their members render on top and
  // should hit first. We approximate front-to-back by reversing the entity
  // order with non-group entities ahead of groups. The full solution reads
  // entityOrder from the workspace; for now, non-group-before-group is
  // sufficient to satisfy the "click inside group selects inner" rule.
  const groups: HitTarget[] = []
  const others: HitTarget[] = []
  for (const entity of inputs.entities) {
    const target: HitTarget = {
      layer: 'body',
      region: { kind: 'rect', rect: bodyRect(entity) },
      payload:
        entity.kind === 'frame'
          ? { kind: 'frame-body', entityId: entity.id }
          : { kind: 'entity-body', entityId: entity.id, entityKind: entity.kind },
    }
    if (entity.kind === 'group') groups.push(target)
    else others.push(target)
  }
  return [...others, ...groups]
}

// --- Geometry helpers ---

const HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function handleRect(entity: CanvasSceneEntity, handle: ResizeHandle): Rect {
  const half = RESIZE_HANDLE_HIT_PX / 2
  const { x, y } = handleAnchor(entity, handle)
  return { x: x - half, y: y - half, width: RESIZE_HANDLE_HIT_PX, height: RESIZE_HANDLE_HIT_PX }
}

function handleAnchor(entity: CanvasSceneEntity, handle: ResizeHandle): Point {
  const { screenX: x, screenY: y, screenWidth: w, screenHeight: h } = entity
  const cx = x + w / 2
  const cy = y + h / 2
  switch (handle) {
    case 'nw': return { x, y }
    case 'n':  return { x: cx, y }
    case 'ne': return { x: x + w, y }
    case 'e':  return { x: x + w, y: cy }
    case 'se': return { x: x + w, y: y + h }
    case 's':  return { x: cx, y: y + h }
    case 'sw': return { x, y: y + h }
    case 'w':  return { x, y: cy }
  }
}

function chromeRect(entity: CanvasSceneEntity): Rect {
  return {
    x: entity.screenX,
    y: entity.screenY - FRAME_CHROME_HEIGHT_PX,
    width: entity.screenWidth,
    height: FRAME_CHROME_HEIGHT_PX,
  }
}

function bodyRect(entity: CanvasSceneEntity): Rect {
  return {
    x: entity.screenX,
    y: entity.screenY,
    width: entity.screenWidth,
    height: entity.screenHeight,
  }
}

function anchorRect(entity: CanvasSceneEntity, side: EdgeSide, zoom: number): Rect {
  const along = scaleEdgeAnchorHitSize(EDGE_ANCHOR_HIT_ALONG_PX, zoom)
  const across = scaleEdgeAnchorHitSize(EDGE_ANCHOR_HIT_ACROSS_PX, zoom)
  const horizontal = side === 'top' || side === 'bottom'
  const w = horizontal ? along : across
  const h = horizontal ? across : along
  const cx = entity.screenX + entity.screenWidth / 2
  const cy = entity.screenY + entity.screenHeight / 2
  switch (side) {
    case 'top':
      return { x: cx - w / 2, y: entity.screenY - EDGE_ANCHOR_HIT_GAP_PX - h, width: w, height: h }
    case 'bottom':
      return { x: cx - w / 2, y: entity.screenY + entity.screenHeight + EDGE_ANCHOR_HIT_GAP_PX, width: w, height: h }
    case 'left':
      return { x: entity.screenX - EDGE_ANCHOR_HIT_GAP_PX - w, y: cy - h / 2, width: w, height: h }
    case 'right':
      return { x: entity.screenX + entity.screenWidth + EDGE_ANCHOR_HIT_GAP_PX, y: cy - h / 2, width: w, height: h }
  }
}

function entityHasChrome(kind: CanvasEntityKind): boolean {
  // Frames and files have chrome strips above them; text/shape/drawing/group
  // do not (text/shape have inline editors when selected, not chrome).
  return kind === 'frame' || kind === 'file'
}

function entityHasAnchors(kind: CanvasEntityKind): boolean {
  // Drawings don't get anchors today; CanvasSceneEntity has no edge variant
  // (edges live in inputs.edges, not inputs.entities).
  return kind !== 'drawing'
}
