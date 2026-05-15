// ADR 0008 — group selection popup. Replaces canvas-bg GroupInlineMenu.

import { Copy, Trash2 } from 'lucide-react'
import {
  CANVAS_COLOR_SLOTS,
  resolveCanvasColor,
  slotForStorage,
} from '../../shared/canvas-colors'
import type {
  CanvasBgElectronAPI,
  CanvasSceneGroupEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'
import { POPUP_OFFSET_Y, usePopupDelayedKey } from './usePopupDelayedKey'

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
  const open = usePopupDelayedKey(
    selectedGroup?.id ?? '',
    interactionIdle && selectedGroup !== null,
  )
  if (!selectedGroup) return null
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
          {CANVAS_COLOR_SLOTS.map((slot) => {
            const swatch =
              slot.hex ?? resolveCanvasColor(slot.storage, { role: 'fill', isDark })
            const isActive = slotForStorage(selectedGroup.color) === slot.id
            return (
              <CanvasItemPopup.ColorSwatch
                key={slot.id}
                isDark={isDark}
                active={isActive}
                color={swatch}
                ariaLabel={`Set group color to ${slot.label}`}
                onClick={() =>
                  api.updateGroupEntity(selectedGroup.id, { color: slot.storage })
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
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title="Delete Group"
            ariaLabel="Delete Group"
            onClick={() => api.deleteGroup(selectedGroup.id)}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.IconButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
