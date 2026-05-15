/**
 * StrokeWidthSwatch — single stroke-width preset rendered as a horizontal line
 * inside an `IconButton`. Shared by the shape and drawing popups.
 */

import { CanvasItemPopup } from './CanvasItemPopup'
import { StrokeThickIcon, StrokeThinIcon } from '../shared/CustomIcons'

export function StrokeWidthSwatch({
  isDark,
  active,
  variant,
  ink,
  onClick,
  ariaLabel,
}: {
  isDark: boolean
  active: boolean
  variant: 'thin' | 'thick'
  ink?: string | null
  onClick: () => void
  ariaLabel: string
}) {
  const Icon = variant === 'thin' ? StrokeThinIcon : StrokeThickIcon
  const iconColor = ink ?? (isDark ? '#e4e4e7' : '#3f3f46')
  return (
    <CanvasItemPopup.IconButton
      isDark={isDark}
      active={active}
      title={ariaLabel}
      ariaLabel={ariaLabel}
      onClick={onClick}
    >
      <Icon style={{ color: iconColor }} />
    </CanvasItemPopup.IconButton>
  )
}
