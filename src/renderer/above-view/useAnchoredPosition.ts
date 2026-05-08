/**
 * useAnchoredPosition — turn (entityId, slot) into overlay-local screen coords.
 *
 * Per ADR 0002 §2, all canvas-anchored overlay UI in aboveView positions
 * itself through this hook. The hook reads geometry from the layout broadcast
 * aboveView already subscribes to and applies the per-kind chrome slot
 * geometry from `entity-chrome-slots`.
 *
 * Coords returned are **overlay-local**: aboveView's WCV origin sits at
 * `canvasOrigin.y` (below the toolbar), so we subtract that from window-space
 * `screenY`. Consumers can drop the rect straight into `style.left/top/...`.
 *
 * Today's scene entities expose `screenX/screenY/screenWidth/screenHeight`
 * representing the **body** rect; chrome lives above. ADR §1 unifies this
 * (entity rect = body + chrome stacked). When that migration lands, only
 * `entityRectFor` below changes — every consumer keeps working.
 */

import { useMemo } from 'react'
import {
  CHROME_HEADER_HEIGHT,
  entityChromeSlots,
  type ChromeSlotName,
} from '../../shared/entity-chrome-slots'
import type { Rect } from '../../shared/hit-regions'
import type {
  CanvasSceneEntity,
  LayoutUpdateData,
} from '../../shared/types'

export type AnchorSlot = ChromeSlotName | 'body'

export interface AnchoredRect extends Rect {}

export function anchoredSlotRect(
  layout: LayoutUpdateData,
  entityId: string,
  slot: AnchorSlot,
): AnchoredRect | null {
  const entity = findEntity(layout, entityId)
  if (!entity) return null
  const entityRect = entityRectFor(entity)
  const layoutResult = entityChromeSlots(entity.kind, entityRect)
  const rect =
    slot === 'body'
      ? layoutResult.body
      : layoutResult.slots.find((s) => s.name === slot)?.rect
  if (!rect) return null
  return toOverlayLocal(rect, layout)
}

export function useAnchoredPosition(
  layout: LayoutUpdateData,
  entityId: string,
  slot: AnchorSlot,
): AnchoredRect | null {
  return useMemo(() => anchoredSlotRect(layout, entityId, slot), [layout, entityId, slot])
}

function findEntity(layout: LayoutUpdateData, id: string): CanvasSceneEntity | undefined {
  return layout.entities.find((e) => e.id === id)
}

/**
 * Returns the unified entity rect (body + chrome) in window-space coords.
 *
 * Today scene entities encode body-only geometry, so we extend upward by
 * `CHROME_HEADER_HEIGHT` for kinds that have chrome. After ADR 0002's rect
 * unification this becomes a one-liner returning the entity rect as-is.
 */
function entityRectFor(entity: CanvasSceneEntity): Rect {
  const hasHeader = entity.kind === 'page' || entity.kind === 'file' || entity.kind === 'group'
  const headerExtension = hasHeader ? CHROME_HEADER_HEIGHT : 0
  return {
    x: entity.screenX,
    y: entity.screenY - headerExtension,
    width: entity.screenWidth,
    height: entity.screenHeight + headerExtension,
  }
}

function toOverlayLocal(rect: Rect, layout: LayoutUpdateData): Rect {
  return {
    x: rect.x,
    y: rect.y - layout.canvasOrigin.y,
    width: rect.width,
    height: rect.height,
  }
}
