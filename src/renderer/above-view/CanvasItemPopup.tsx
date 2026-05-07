/**
 * CanvasItemPopup — compound component for selection-state-driven UI anchored
 * to a canvas entity (ADR 0002 §2). Visibility is driven by the `open` prop
 * (typically derived from selection state).
 *
 * Right-click context menus are out of scope (ADR §4) — this is for popups
 * that follow selection.
 */

import { type ReactNode } from 'react'
import { useAnchoredPosition, type AnchorSlot } from './useAnchoredPosition'
import type { LayoutUpdateData } from '../../shared/types'

type Placement = 'above' | 'below' | 'overlay'
type Align = 'stretch' | 'center'

function Root({
  entityId,
  layout,
  open,
  slot = 'body',
  placement = 'below',
  align = 'center',
  offset = 8,
  children,
}: {
  entityId: string
  layout: LayoutUpdateData
  open: boolean
  /** Anchor slot — popup hangs off this rect. Defaults to body. */
  slot?: AnchorSlot
  /** How the popup positions relative to the anchor rect. */
  placement?: Placement
  /**
   * Horizontal alignment for `above`/`below` placements.
   * `center` (default) positions the popup over the anchor's horizontal
   * midpoint at its intrinsic width. `stretch` forces the popup width to
   * match the anchor rect — useful for inline strips. `overlay` ignores this.
   */
  align?: Align
  /** Pixel gap between anchor edge and popup. Ignored for `overlay`. */
  offset?: number
  children: ReactNode
}) {
  const rect = useAnchoredPosition(layout, entityId, slot)
  if (!open || !rect) return null
  const style = popupStyle(rect, placement, align, offset)
  return (
    <div
      data-overlay-ui
      className="pointer-events-auto absolute"
      style={style}
    >
      {children}
    </div>
  )
}

function popupStyle(
  rect: { x: number; y: number; width: number; height: number },
  placement: Placement,
  align: Align,
  offset: number,
): React.CSSProperties {
  if (placement === 'overlay') {
    return { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
  }
  const isAbove = placement === 'above'
  const top = isAbove ? rect.y - offset : rect.y + rect.height + offset
  const verticalTransform = isAbove ? 'translateY(-100%)' : ''
  if (align === 'stretch') {
    return { left: rect.x, top, width: rect.width, transform: verticalTransform || undefined }
  }
  return {
    left: rect.x + rect.width / 2,
    top,
    transform: `translateX(-50%) ${verticalTransform}`.trim(),
  }
}

export const CanvasItemPopup = { Root }
