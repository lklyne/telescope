/**
 * StickyNotePopover — selection-driven popup for the single-selected text
 * entity (plain and sticky styles). Anchored above the body via
 * `CanvasItemPopup.Root` (ADR 0002 §2, ADR 0006), so it tracks pan/zoom for
 * free along with the rest of aboveView.
 *
 * Restructured around the generalized `CanvasItemPopup` compound primitives
 * (Step 1 of ADR 0006 migration). Contents remain unchanged: color swatches,
 * duplicate, delete.
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
  selectedTextEntity,
  interactionIdle,
}: {
  api: Pick<
    CanvasBgElectronAPI,
    'duplicateTextEntity' | 'deleteTextEntity' | 'updateTextEntity'
  >
  isDark: boolean
  layout: LayoutUpdateData
  selectedTextEntity: CanvasSceneTextEntity | null
  interactionIdle: boolean
}) {
  const shouldQueue = interactionIdle && selectedTextEntity !== null
  const [delayedId, setDelayedId] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldQueue || !selectedTextEntity) {
      setDelayedId(null)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setDelayedId(selectedTextEntity.id)
    }, POPUP_SHOW_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [shouldQueue, selectedTextEntity])
  if (!selectedTextEntity) return null
  const open = delayedId === selectedTextEntity.id
  return (
    <CanvasItemPopup.Root
      entityId={selectedTextEntity.id}
      layout={layout}
      open={open}
      placement="above"
      offset={POPUP_OFFSET_Y}
    >
      <CanvasItemPopup.Frame isDark={isDark}>
        <CanvasItemPopup.Section>
          {CANVAS_COLOR_OPTIONS.map((option) => {
            const resolved = resolveCanvasColor(option.id)
            const isActive = resolveCanvasColor(selectedTextEntity.color) === resolved
            return (
              <CanvasItemPopup.ColorSwatch
                key={option.id}
                isDark={isDark}
                active={isActive}
                color={resolved}
                ariaLabel={`Set sticky note color to ${option.label}`}
                onClick={() =>
                  api.updateTextEntity(selectedTextEntity.id, { color: option.id })
                }
              />
            )
          })}
        </CanvasItemPopup.Section>
        <CanvasItemPopup.Section>
          <CanvasItemPopup.IconButton
            isDark={isDark}
            title="Duplicate sticky note"
            ariaLabel="Duplicate sticky note"
            onClick={() => api.duplicateTextEntity(selectedTextEntity.id)}
          >
            <Copy size={14} />
          </CanvasItemPopup.IconButton>
          <CanvasItemPopup.DestructiveButton
            isDark={isDark}
            title="Delete sticky note"
            ariaLabel="Delete sticky note"
            onClick={() => api.deleteTextEntity(selectedTextEntity.id)}
          >
            <Trash2 size={14} />
          </CanvasItemPopup.DestructiveButton>
        </CanvasItemPopup.Section>
      </CanvasItemPopup.Frame>
    </CanvasItemPopup.Root>
  )
}
