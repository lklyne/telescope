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

function Root({
  entityId,
  layout,
  open,
  slot = 'body',
  placement = 'below',
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
  /** Pixel gap between anchor edge and popup. Ignored for `overlay`. */
  offset?: number
  children: ReactNode
}) {
  const rect = useAnchoredPosition(layout, entityId, slot)
  if (!open || !rect) return null
  const style = popupStyle(rect, placement, offset)
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
  offset: number,
): React.CSSProperties {
  switch (placement) {
    case 'above':
      return { left: rect.x, top: rect.y - offset, width: rect.width, transform: 'translateY(-100%)' }
    case 'below':
      return { left: rect.x, top: rect.y + rect.height + offset, width: rect.width }
    case 'overlay':
      return { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
  }
}

export const CanvasItemPopup = { Root }
