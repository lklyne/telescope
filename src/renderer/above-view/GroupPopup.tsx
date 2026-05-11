/**
 * GroupPopup — selection-driven popup for the single-selected group (ADR 0006).
 * Anchored above the group body via `CanvasItemPopup.Root`, tracks pan/zoom
 * with the rest of aboveView. Replaces the screen-coords `GroupInlineMenu`
 * that previously lived in canvas-bg.
 *
 * Contents unchanged: color swatches, duplicate, delete.
 */

import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import { SELECTED_PAGE_MENU_SHOW_DELAY_MS } from '../../shared/selectedPageMenu'
import type {
  CanvasBgElectronAPI,
  CanvasSceneGroupEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'

const POPUP_OFFSET_Y = 14

export function GroupPopup({
  api,
  isDark,
  layout,
  selectedGroup,
  interactionIdle,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    'duplicateGroup' | 'deleteGroup' | 'updateGroupEntity'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedGroup: CanvasSceneGroupEntity | null
  interactionIdle: boolean
}) {
  const shouldQueue = interactionIdle && selectedGroup !== null
  const [delayedId, setDelayedId] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldQueue || !selectedGroup) {
      setDelayedId(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedId(selectedGroup.id)
    }, SELECTED_PAGE_MENU_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [shouldQueue, selectedGroup])
  if (!selectedGroup) return null
  const open = delayedId === selectedGroup.id
  return (
    <CanvasItemPopup.Root
      entityId={selectedGroup.id}
      layout={layout}
      open={open}
      placement="above"
      offset={POPUP_OFFSET_Y}
    >
      <CanvasItemPopup.Frame isDark={isDark}>
        <CanvasItemPopup.Section>
          {CANVAS_COLOR_OPTIONS.map((option) => {
            const resolved = resolveCanvasColor(option.id)
            const isActive = resolveCanvasColor(selectedGroup.color ?? '') === resolved
            return (
              <CanvasItemPopup.ColorSwatch
                key={option.id}
                isDark={isDark}
                active={isActive}
                color={resolved}
                ariaLabel={`Set group color to ${option.label}`}
                onClick={() =>
                  api.updateGroupEntity(selectedGroup.id, { color: option.id })
                }
              />
            )
          })}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title="Duplicate Group"
            ariaLabel="Duplicate Group"
            onClick={() => api.duplicateGroup(selectedGroup.id)}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title="Delete Group"
            ariaLabel="Delete Group"
            onClick={() => api.deleteGroup(selectedGroup.id)}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
