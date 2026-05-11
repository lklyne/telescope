/**
 * StickyNotePopover — selection-driven popup for text entities (plain and
 * sticky styles). Anchored above the body via `CanvasItemPopup.Root` (ADR
 * 0002 §2, ADR 0008), so it tracks pan/zoom for free along with the rest of
 * aboveView.
 *
 * Mounts on single OR same-kind multi-select (ADR 0008 §4). Per §4 plain and
 * sticky text count as same kind for color, so the popup applies color
 * uniformly across both styles when present in the same multi-selection.
 */

import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import type {
  CanvasBgElectronAPI,
  CanvasSceneTextEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'
import { POPUP_OFFSET_Y, sharedValue, usePopupDelayedKey } from './usePopupDelayedKey'

export function StickyNotePopover({
  api,
  isDark,
  layout,
  selectedTextEntities,
  interactionIdle,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    'duplicateTextEntity' | 'deleteTextEntity' | 'updateTextEntity'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedTextEntities: CanvasSceneTextEntity[]
  interactionIdle: boolean
}) {
  const count = selectedTextEntities.length
  const ids = selectedTextEntities.map((e) => e.id).join('|')
  const open = usePopupDelayedKey(ids, interactionIdle && count > 0)
  if (count === 0) return null

  const sharedColor = sharedValue(
    selectedTextEntities.map((e) => resolveCanvasColor(e.color)),
  )

  const entityIds = selectedTextEntities.map((e) => e.id)
  const noun = count === 1 ? 'sticky note' : `${count} text entities`

  return (
    <CanvasItemPopup.Root
      entityIds={entityIds}
      layout={layout}
      open={open}
      placement="above"
      offset={POPUP_OFFSET_Y}
    >
      <CanvasItemPopup.Frame isDark={isDark}>
        <CanvasItemPopup.Section>
          {CANVAS_COLOR_OPTIONS.map((option) => {
            const resolved = resolveCanvasColor(option.id)
            return (
              <CanvasItemPopup.ColorSwatch
                key={option.id}
                isDark={isDark}
                active={sharedColor === resolved}
                color={resolved}
                ariaLabel={`Set color to ${option.label}`}
                onClick={() => {
                  for (const e of selectedTextEntities) {
                    api.updateTextEntity(e.id, { color: option.id })
                  }
                }}
              />
            )
          })}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title={`Duplicate ${noun}`}
            ariaLabel={`Duplicate ${noun}`}
            onClick={() => {
              for (const e of selectedTextEntities) api.duplicateTextEntity(e.id)
            }}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title={`Delete ${noun}`}
            ariaLabel={`Delete ${noun}`}
            onClick={() => {
              for (const e of selectedTextEntities) api.deleteTextEntity(e.id)
            }}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
