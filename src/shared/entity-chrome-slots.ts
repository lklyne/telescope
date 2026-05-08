/**
 * Per-kind chrome slot geometry.
 *
 * Per ADR 0002, an entity rect is one layout unit: body + chrome stacked.
 * Chrome lives in named slots whose rects are derived at runtime from the
 * entity rect — they are not persisted in the .canvas schema.
 *
 * This module is pure (no DOM, no Electron, no React). Consumers:
 *   - aboveView's CanvasItemChrome → positions overlay UI in slot rects.
 *   - hit-test.ts → eventually reads slot rects instead of its own constant.
 *   - layout / resize / drag → read body rect to operate on the body sub-rect.
 *
 * Coordinate system is whatever the caller passes in (canvas or screen);
 * this module only does subtraction.
 */

import type { Rect } from './hit-regions'
import type { CanvasEntityKind } from './types'

export const CHROME_HEADER_HEIGHT = 36

export type ChromeSlotName = 'header'

export interface ChromeSlot {
  name: ChromeSlotName
  rect: Rect
}

export interface EntityLayout {
  /** Body sub-rect: the part of the entity rect occupied by content. */
  body: Rect
  /** Chrome slots in stacking order (currently always 0 or 1 entry). */
  slots: ChromeSlot[]
}

/**
 * Returns the body sub-rect and chrome slots for an entity rect.
 *
 * Today only page/file/group have a header slot. text/shape/drawing have
 * no chrome — body equals the entity rect.
 *
 * Degenerate input (entity rect shorter than the chrome slot) collapses
 * the body to zero height rather than producing a negative rect.
 */
export function entityChromeSlots(kind: CanvasEntityKind, entityRect: Rect): EntityLayout {
  if (!kindHasHeaderChrome(kind)) {
    return { body: entityRect, slots: [] }
  }
  const header: Rect = {
    x: entityRect.x,
    y: entityRect.y,
    width: entityRect.width,
    height: Math.min(CHROME_HEADER_HEIGHT, entityRect.height),
  }
  const body: Rect = {
    x: entityRect.x,
    y: entityRect.y + header.height,
    width: entityRect.width,
    height: entityRect.height - header.height,
  }
  return { body, slots: [{ name: 'header', rect: header }] }
}

function kindHasHeaderChrome(kind: CanvasEntityKind): boolean {
  return kind === 'page' || kind === 'file' || kind === 'group'
}
