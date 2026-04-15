import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { CANVAS_COLOR_OPTIONS, resolveCanvasColor } from '../../shared/canvas-colors'
import type { CanvasSceneGroupEntity, CanvasSceneTextEntity } from '../../shared/types'

const MENU_OFFSET_Y = 14

export function deleteButtonClassName(isDark: boolean) {
  return isDark
    ? 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent text-zinc-400 transition-colors hover:bg-red-500/12 hover:text-red-400'
    : 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600'
}

export function iconButtonClassName(isDark: boolean) {
  return isDark
    ? 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100'
    : 'flex h-7 w-7 items-center justify-center rounded-[7px] border border-transparent text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900'
}

function buildInlineMenuStyle(entity: {
  screenX: number
  screenY: number
  screenWidth: number
}) {
  return {
    left: entity.screenX + entity.screenWidth / 2,
    top: Math.max(8, entity.screenY - MENU_OFFSET_Y),
    transform: 'translate(-50%, -100%)',
  } as const
}

export function InlineEntityMenu({
  children,
  entity,
  isDark,
  className = '',
  onMouseDown,
  onMouseEnter,
  style,
}: {
  children: ReactNode
  entity: { screenX: number; screenY: number; screenWidth: number }
  isDark: boolean
  className?: string
  onMouseDown?: MouseEventHandler<HTMLDivElement>
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  style?: CSSProperties
}) {
  return (
    <div
      className={`pointer-events-auto fixed z-[80] flex items-center gap-1.5 rounded-[8px] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] px-2 py-1.5 shadow-xs ${
        isDark
          ? 'text-zinc-100'
          : 'text-zinc-900'
      } ${className}`}
      data-overlay-ui
      style={{
        ...buildInlineMenuStyle(entity),
        ...style,
      }}
      onMouseDown={(event) => {
        event.stopPropagation()
        onMouseDown?.(event)
      }}
      onMouseEnter={onMouseEnter}
    >
      {children}
    </div>
  )
}

export function StickyNoteInlineMenu({
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
    <InlineEntityMenu entity={note} isDark={isDark}>
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
          title="Duplicate Text"
          aria-label="Duplicate Text"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className={deleteButtonClassName(isDark)}
          onClick={onDelete}
          title="Delete Text"
          aria-label="Delete Text"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </InlineEntityMenu>
  )
}

export function GroupInlineMenu({
  group,
  isDark,
  onDuplicate,
  onDelete,
  onSelectColor,
}: {
  group: CanvasSceneGroupEntity
  isDark: boolean
  onDuplicate: () => void
  onDelete: () => void
  onSelectColor: (color: string) => void
}) {
  return (
    <InlineEntityMenu entity={group} isDark={isDark}>
      <div className="flex items-center gap-1.5">
        {CANVAS_COLOR_OPTIONS.map((option) => {
          const resolved = resolveCanvasColor(option.id)
          const isActive = resolveCanvasColor(group.color ?? '') === resolved
          return (
            <button
              key={option.id}
              type="button"
              aria-label={`Set group color to ${option.label}`}
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
          title="Duplicate Group"
          aria-label="Duplicate Group"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className={deleteButtonClassName(isDark)}
          onClick={onDelete}
          title="Delete Group"
          aria-label="Delete Group"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </InlineEntityMenu>
  )
}
