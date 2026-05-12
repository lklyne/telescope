/**
 * CanvasItemPopup — compound component for the unified canvas-item popup
 * (ADR 0008). Two anchor modes:
 *
 *   - <CanvasItemPopup.Root> — entity-anchored (selection mode). Tracks an
 *     entity's screen rect via `useAnchoredPosition`, so it follows pan/zoom.
 *
 *   - <CanvasItemPopup.ViewportAnchor> — viewport-anchored (tool mode). Fixed
 *     strip below the toolbar, centered in the canvas area.
 *
 * Composition primitives (`Frame`, `Section`, `ColorSwatch`, `IconButton`,
 * `DestructiveButton`) factor out shared chrome so every kind-specific popup
 * renders with the same panel styling and button affordances.
 *
 * Right-click context menus are out of scope (ADR 0002 §4).
 */

import { type ReactNode } from 'react'
import {
  useAnchoredPosition,
  useMultiAnchoredPosition,
  type AnchorSlot,
} from './useAnchoredPosition'
import type { LayoutUpdateData } from '../../shared/types'

type Placement = 'above' | 'below' | 'overlay'
type Align = 'stretch' | 'center'

type RootProps = {
  layout: LayoutUpdateData
  open: boolean
  /** Anchor slot — popup hangs off this rect. Defaults to body. */
  slot?: AnchorSlot
  /** How the popup positions relative to the anchor rect. */
  placement?: Placement
  /**
   * Horizontal alignment for `above`/`below` placements.
   * `center` (default) positions the popup over the anchor's horizontal
   * midpoint at its intrinsic width. `stretch` keeps the popup centered on
   * the anchor but grows it to at least the anchor's width — letting an
   * inner flex-1 child absorb the extra space on large/zoomed anchors,
   * while still falling back to intrinsic content width on tiny anchors.
   * `overlay` ignores this.
   */
  align?: Align
  /** Pixel gap between anchor edge and popup. Ignored for `overlay`. */
  offset?: number
  children: ReactNode
} & (
  | { entityId: string; entityIds?: undefined }
  | { entityIds: readonly string[]; entityId?: undefined }
)

function Root(props: RootProps) {
  const {
    layout,
    open,
    slot = 'body',
    placement = 'below',
    align = 'center',
    offset = 8,
    children,
  } = props
  const singleRect = useAnchoredPosition(
    layout,
    props.entityId ?? '',
    slot,
  )
  const multiRect = useMultiAnchoredPosition(layout, props.entityIds ?? [], slot)
  const rect = props.entityIds !== undefined ? multiRect : singleRect
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
    return {
      left: rect.x + rect.width / 2,
      top,
      minWidth: rect.width,
      transform: `translateX(-50%) ${verticalTransform}`.trim(),
    }
  }
  return {
    left: rect.x + rect.width / 2,
    top,
    transform: `translateX(-50%) ${verticalTransform}`.trim(),
  }
}

/**
 * Viewport-anchored mode (ADR 0008 §1). Positions a fixed strip below the
 * toolbar, horizontally centered on the toolbar's tool cluster.
 *
 * The popup reads `layout.toolbarCenterX` (window-coord pixels, computed in
 * main from the toolbar's padding constants and current window width).
 * aboveView's left edge sits at x=0 in window coords, so the value is used
 * verbatim as an offset within aboveView — no compensation for the right
 * devtools panel is needed because the toolbar layout, not the visible
 * canvas, is what determines popup placement.
 */
function ViewportAnchor({
  layout,
  open,
  offset = 8,
  children,
}: {
  layout: LayoutUpdateData
  open: boolean
  /** Pixel gap from the toolbar's bottom edge. */
  offset?: number
  children: ReactNode
}) {
  if (!open) return null
  return (
    <>
      {/* Bridge across the gap between the toolbar and the popup. Marked as
          overlay UI so the placement-preview ghost clears while the cursor
          is in this strip, instead of stamping through the gap. */}
      <div
        data-overlay-ui
        aria-hidden
        className="pointer-events-auto absolute left-0 right-0"
        style={{ top: 0, height: offset }}
      />
      <div
        data-overlay-ui
        className="pointer-events-auto absolute"
        style={{
          top: offset,
          left: layout.toolbarCenterX,
          transform: 'translateX(-50%)',
        }}
      >
        {children}
      </div>
    </>
  )
}

/**
 * Frame — the visual chrome (rounded border, panel bg, padding, shadow) that
 * every popup wears. Stops mousedown so clicks inside don't fall through to
 * canvas gestures (marquee/deselect).
 */
function Frame({
  isDark,
  className = '',
  children,
}: {
  isDark: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-[8px] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] px-2 py-1.5 shadow-xs ${
        isDark ? 'text-zinc-100' : 'text-zinc-900'
      } ${className}`.trim()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )
}

/**
 * Section — a horizontal group of related controls inside the Frame. Use one
 * per logical block (color swatches, action buttons, variant pickers).
 * Pass `grow` to make this section absorb extra width when the Frame is
 * stretched wider than its intrinsic content (see `align="stretch"`).
 */
function Section({ children, grow = false }: { children: ReactNode; grow?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5${grow ? ' min-w-0 flex-1' : ''}`}>
      {children}
    </div>
  )
}

function popupIconButtonClass(isDark: boolean, active = false): string {
  if (active) {
    return isDark
      ? 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent bg-zinc-800 text-zinc-100'
      : 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent bg-zinc-100 text-zinc-900'
  }
  return isDark
    ? 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100'
    : 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900'
}

function popupDeleteButtonClass(isDark: boolean): string {
  return isDark
    ? 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent text-zinc-400 transition-colors hover:bg-red-500/12 hover:text-red-400'
    : 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600'
}

function IconButton({
  isDark,
  active = false,
  title,
  ariaLabel,
  onClick,
  children,
}: {
  isDark: boolean
  /** Highlights the button as the currently-selected variant. */
  active?: boolean
  title: string
  ariaLabel: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={popupIconButtonClass(isDark, active)}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

function DestructiveButton({
  isDark,
  title,
  ariaLabel,
  onClick,
  children,
}: {
  isDark: boolean
  title: string
  ariaLabel: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={popupDeleteButtonClass(isDark)}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}

/**
 * ColorSwatch — single color circle. `active` highlights the current
 * selection; pass `active={false}` for all when the selection has mixed
 * colors (per ADR 0008 §4).
 */
function ColorSwatch({
  isDark,
  active,
  color,
  ariaLabel,
  onClick,
}: {
  isDark: boolean
  active: boolean
  /** Resolved CSS color value to render in the circle. */
  color: string
  ariaLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
        active
          ? isDark
            ? 'border-white/80 bg-zinc-900'
            : 'border-zinc-900/80 bg-white'
          : isDark
            ? 'border-transparent hover:border-zinc-600'
            : 'border-transparent hover:border-zinc-300'
      }`}
      onClick={onClick}
    >
      <span
        className="block h-3.5 w-3.5 rounded-full"
        style={{ background: color }}
      />
    </button>
  )
}

export const CanvasItemPopup = {
  Root,
  ViewportAnchor,
  Frame,
  Section,
  IconButton,
  DestructiveButton,
  ColorSwatch,
}
