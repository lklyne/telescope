import { useEffect, useState, type ComponentType } from 'react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import { Laptop, Smartphone, Tablet } from 'lucide-react'

type FrameVisual = {
  id: string
  label: string
  name?: string
  faviconUrl?: string | null
  width?: number
  height?: number
}

interface FrameListItemProps {
  frame: FrameVisual
  active: boolean
  compact?: boolean
  fullBleedCompact?: boolean
  showDimensions?: boolean
  contentPaddingLeft?: number
  contentPaddingRight?: number
  isDark: boolean
  onClick: () => void
  onRename?: (name: string) => void
  onDelete?: () => void
}

function viewportIcon(label: string, width?: number) {
  if (label.startsWith('iPhone')) return Smartphone
  if (label.startsWith('iPad')) return Tablet
  if (typeof width !== 'number') return Laptop
  if (width < 600) return Smartphone
  if (width < 1100) return Tablet
  return Laptop
}

function FrameGlyph({
  faviconUrl,
  Icon,
}: {
  faviconUrl?: string | null
  Icon: ComponentType<{ size?: number; className?: string }>
}) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [faviconUrl])

  if (faviconUrl && !imageFailed) {
    return (
      <img
        alt=""
        aria-hidden="true"
        src={faviconUrl}
        className="h-[14px] w-[14px] shrink-0 rounded-[3px]"
        onError={() => setImageFailed(true)}
      />
    )
  }

  return <Icon size={14} className="shrink-0 text-zinc-500" />
}

export function FrameListItem({
  frame,
  active,
  compact = false,
  fullBleedCompact = false,
  showDimensions = true,
  contentPaddingLeft,
  contentPaddingRight,
  isDark,
  onClick,
  onRename,
  onDelete,
}: FrameListItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingName, setEditingName] = useState(frame.label)
  const Icon = viewportIcon(frame.label, frame.width)
  const canEdit = typeof onRename === 'function'
  const hasContextMenu = canEdit || typeof onDelete === 'function'

  useEffect(() => {
    if (!isEditing) {
      setEditingName(frame.label)
    }
  }, [frame.label, isEditing])

  function startRename() {
    if (!canEdit) return
    setEditingName(frame.label)
    setIsEditing(true)
  }

  function cancelRename() {
    setIsEditing(false)
    setEditingName(frame.label)
  }

  function commitRename() {
    if (!canEdit) return
    const nextName = editingName.trim()
    if (nextName && nextName !== frame.label) {
      onRename(nextName)
    }
    setIsEditing(false)
  }

  const rootClassName = `flex items-center gap-1 text-left text-xs font-normal ${
    compact
      ? `w-full min-w-0 max-w-[240px] ${fullBleedCompact ? 'h-full py-0' : 'py-1.5'} ${
          active
            ? isDark
              ? 'bg-[var(--surface-interactive)] text-zinc-100'
              : 'bg-[var(--surface-interactive)] text-zinc-900'
            : `text-zinc-800 hover:bg-[var(--surface-interactive-hover)] dark:text-zinc-200 dark:hover:bg-[var(--surface-interactive-hover)]`
        }`
      : `w-full py-1.5 ${
          active
            ? isDark
              ? 'bg-[var(--surface-interactive)] text-zinc-100'
              : 'bg-[var(--surface-interactive)] text-zinc-900'
            : 'text-zinc-800 hover:bg-[var(--surface-interactive-hover)] dark:text-zinc-200 dark:hover:bg-[var(--surface-interactive-hover)]'
        }`
  }`
  const horizontalPaddingStyle = {
    paddingLeft: contentPaddingLeft ?? 8,
    paddingRight: contentPaddingRight ?? 8,
  }
  const dividerClassName = isDark ? 'bg-zinc-700' : 'bg-zinc-300'

  const content = isEditing ? (
    <div className={rootClassName} style={horizontalPaddingStyle}>
      <FrameGlyph faviconUrl={frame.faviconUrl} Icon={Icon} />
      <input
        autoFocus
        value={editingName}
        onChange={(event) => setEditingName(event.target.value)}
        onBlur={commitRename}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitRename()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            cancelRename()
          }
        }}
        onFocus={(event) => event.target.select()}
        className={`min-w-0 flex-1 rounded-[4px] ring-1 p-0 text-xs leading-[inherit] font-[inherit] outline-none ${
          isDark
            ? 'ring-zinc-600 bg-zinc-950 text-zinc-100'
            : 'ring-zinc-300 bg-white text-zinc-900'
        }`}
      />
      {showDimensions && frame.width && frame.height ? (
        <span className="ml-auto shrink-0 text-xs text-zinc-400">
          {frame.width}&times;{frame.height}
        </span>
      ) : null}
    </div>
  ) : (
    <div className={fullBleedCompact ? 'relative flex h-full w-full min-w-0 max-w-[240px]' : undefined}>
      <button
        type="button"
        className={`${rootClassName} box-border appearance-none border-0`}
        style={horizontalPaddingStyle}
        onClick={onClick}
        onDoubleClick={startRename}
        title={frame.label}
      >
        <FrameGlyph faviconUrl={frame.faviconUrl} Icon={Icon} />
        <span className="min-w-0 flex-1 truncate">{frame.label}</span>
        {showDimensions && frame.width && frame.height ? (
          <span className="ml-auto shrink-0 text-xs text-zinc-400">
            {frame.width}&times;{frame.height}
          </span>
        ) : null}
      </button>
      {compact && fullBleedCompact ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-0 top-0 h-full w-px ${dividerClassName}`}
        />
      ) : null}
    </div>
  )

  if (!hasContextMenu) return content

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className={compact ? 'block min-w-0 w-full' : 'block w-full'}>
        {content}
      </ContextMenu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6}>
          <Menu.Popup
            className={`z-50 min-w-40 rounded-[10px] border p-1 shadow-xl outline-none ${
              isDark
                ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
                : 'border-zinc-200 bg-white text-zinc-900'
            }`}
          >
            {canEdit ? (
              <Menu.Item
                className={`flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
                  isDark
                    ? 'text-zinc-100 data-[highlighted]:bg-zinc-800'
                    : 'text-zinc-900 data-[highlighted]:bg-zinc-100'
                }`}
                onClick={startRename}
              >
                <span>Rename</span>
              </Menu.Item>
            ) : null}
            {onDelete ? (
              <Menu.Item
                className={`flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
                  isDark
                    ? 'text-zinc-100 data-[highlighted]:bg-zinc-800'
                    : 'text-zinc-900 data-[highlighted]:bg-zinc-100'
                }`}
                onClick={onDelete}
              >
                <span>Delete</span>
              </Menu.Item>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </ContextMenu.Root>
  )
}
