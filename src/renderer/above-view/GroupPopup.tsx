// ADR 0008 — group selection popup. Replaces canvas-bg GroupInlineMenu.

import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
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
