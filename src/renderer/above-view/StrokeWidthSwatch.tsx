/**
 * StrokeWidthSwatch — single stroke-width preset rendered as a horizontal line
 * inside an `IconButton`. Shared by the shape and drawing popups.
 */

import { CanvasItemPopup } from './CanvasItemPopup'

export function StrokeWidthSwatch({
  isDark,
  active,
  width,
  onClick,
  ariaLabel,
}: {
  isDark: boolean
  active: boolean
  width: number
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <CanvasItemPopup.IconButton
      isDark={isDark}
      active={active}
      title={ariaLabel}
      ariaLabel={ariaLabel}
      onClick={onClick}
    >
      <span
        className={`block w-4 rounded-full ${isDark ? 'bg-zinc-200' : 'bg-zinc-700'}`}
        style={{ height: width }}
      />
    </CanvasItemPopup.IconButton>
  )
}
