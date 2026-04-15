export const SELECTED_FRAME_MENU_SHOW_DELAY_MS = 150

const INLINE_MENU_OFFSET_Y = 14
const TEXT_ENTITY_MENU_WIDTH = 340
const TEXT_ENTITY_MENU_BAR_HEIGHT = 44
const TEXT_ENTITY_MENU_VERTICAL_PADDING = 12
const TEXT_ENTITY_MENU_HORIZONTAL_PADDING = 16

/** Tight bounds for the inline text-entity (sticky note) menu.
 *  Positioned centered above the entity, no dropdown expansion. */
export function textEntityMenuViewBounds(
  entity: { screenX: number; screenY: number; screenWidth: number },
  viewport: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const barHeight = TEXT_ENTITY_MENU_BAR_HEIGHT + TEXT_ENTITY_MENU_VERTICAL_PADDING * 2
  const anchorY = Math.max(8, entity.screenY - INLINE_MENU_OFFSET_Y)
  const topY = Math.round(anchorY - barHeight + TEXT_ENTITY_MENU_VERTICAL_PADDING)

  const padding = TEXT_ENTITY_MENU_HORIZONTAL_PADDING
  const width = Math.min(viewport.width, TEXT_ENTITY_MENU_WIDTH + padding * 2)
  const centerX = entity.screenX + entity.screenWidth / 2
  const desiredX = Math.round(centerX - width / 2)
  const x = clamp(desiredX, 0, Math.max(0, viewport.width - width))

  return { x, y: topY, width, height: barHeight }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
