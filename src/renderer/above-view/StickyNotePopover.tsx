/**
 * StickyNotePopover — selection-driven color/duplicate/delete menu for the
 * single-selected sticky-note entity. Anchored above the sticky body via
 * `CanvasItemPopup` (ADR 0002 §2), so it tracks pan/zoom for free along with
 * the rest of aboveView.
 *
 * Replaces the screen-coordinate `StickyNoteInlineMenu` that previously lived
 * in canvas-bg and used `entity.screenX/screenY` directly.
 */

import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import { SELECTED_PAGE_MENU_SHOW_DELAY_MS } from '../../shared/selectedPageMenu'
import type {
  CanvasBgElectronAPI,
  CanvasSceneTextEntity,
  LayoutUpdateData,
} from '../../shared/types'
import {
  deleteButtonClassName,
  iconButtonClassName,
} from '../canvas-bg/InlineEntityMenu'
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
    }, SELECTED_PAGE_MENU_SHOW_DELAY_MS)
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
      <StickyMenuContent
        isDark={isDark}
        note={selectedTextEntity}
        onDuplicate={() => api.duplicateTextEntity(selectedTextEntity.id)}
        onDelete={() => api.deleteTextEntity(selectedTextEntity.id)}
        onSelectColor={(color) =>
          api.updateTextEntity(selectedTextEntity.id, { color })
        }
      />
    </CanvasItemPopup.Root>
  )
}

function StickyMenuContent({
  isDark,
  note,
  onDuplicate,
  onDelete,
  onSelectColor,
}: {
  isDark: boolean
  note: CanvasSceneTextEntity
  onDuplicate: () => void
  onDelete: () => void
  onSelectColor: (color: string) => void
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-[8px] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] px-2 py-1.5 shadow-xs ${
        isDark ? 'text-zinc-100' : 'text-zinc-900'
      }`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        {CANVAS_COLOR_OPTIONS.map((option) => {
          const resolved = resolveCanvasColor(option.id)
          const isActive = resolveCanvasColor(note.color) === resolved
          return (
            <button
              key={option.id}
              type="button"
              aria-label={`Set sticky note color to ${option.label}`}
              className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
                isActive
                  ? isDark
                    ? 'border-white/80 bg-zinc-900'
                    : 'border-zinc-900/80 bg-white'
                  : isDark
                    ? 'border-transparent hover:border-zinc-600'
                    : 'border-transparent hover:border-zinc-300'
              }`}
              onClick={() => onSelectColor(option.id)}
            >
              <span
                className="block h-3.5 w-3.5 rounded-full"
                style={{ background: resolved }}
              />
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={iconButtonClassName(isDark)}
          onClick={onDuplicate}
          title="Duplicate sticky note"
          aria-label="Duplicate sticky note"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className={deleteButtonClassName(isDark)}
          onClick={onDelete}
          title="Delete sticky note"
          aria-label="Delete sticky note"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
