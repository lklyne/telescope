/**
 * StickyNotePopover — selection-driven popup for text entities (plain and
 * sticky styles). Anchored above the body via `CanvasItemPopup.Root` (ADR
 * 0002 §2, ADR 0006), so it tracks pan/zoom for free along with the rest of
 * aboveView.
 *
 * Mounts on single OR same-kind multi-select (ADR 0006 §4). Per §4 plain and
 * sticky text count as same kind for color, so the popup applies color
 * uniformly across both styles when present in the same multi-selection.
 */

import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import { POPUP_SHOW_DELAY_MS } from '../../shared/popupTiming'
import type {
  CanvasBgElectronAPI,
  CanvasSceneTextEntity,
  LayoutUpdateData,
} from '../../shared/types'
import { CanvasItemPopup } from './CanvasItemPopup'

const POPUP_OFFSET_Y = 14

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
  // Stable id signature so the delay timer only fires when the selection
  // identity actually changes — not on every layout broadcast.
  const ids = selectedTextEntities.map((e) => e.id).join('|')
  const shouldQueue = interactionIdle && count > 0
  const [delayedKey, setDelayedKey] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldQueue) {
      setDelayedKey(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedKey(ids)
    }, POPUP_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [shouldQueue, ids])
  if (count === 0) return null
  const open = delayedKey === ids

  // Shared color across all selected entities, or null when mixed (ADR §4).
  const colors = selectedTextEntities.map((e) => resolveCanvasColor(e.color))
  const sharedColor = colors.every((c) => c === colors[0]) ? colors[0] : null

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
