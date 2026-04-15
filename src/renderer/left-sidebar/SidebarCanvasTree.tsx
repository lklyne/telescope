import { useEffect, useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import { ChevronDown, ChevronRight, FolderOpen, Image, PenLine, StickyNote } from 'lucide-react'
import type { LeftSidebarElectronAPI, SidebarCanvasItem, SidebarFileItem, SidebarFrameItem, SidebarGroupItem, SidebarTextItem } from '../../shared/types'
import { FrameListItem } from '../shared/frameListItem'

const LIST_OUTER_LEFT_PADDING = 14
const LIST_OUTER_RIGHT_PADDING = 8
const LIST_ROW_INNER_X_PADDING = 8
const TREE_DEPTH_STEP = 14

function EntityListItem({
  icon,
  label,
  active,
  isDark,
  onClick,
  onDelete,
  deleteLabel = 'Delete',
  depth,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  isDark: boolean
  onClick: () => void
  onDelete: () => void
  deleteLabel?: string
  depth: number
}) {
  const rootClassName = `flex w-full items-center gap-1 py-1.5 text-left text-xs font-normal ${
    active
      ? isDark
        ? 'bg-[var(--surface-interactive)] text-zinc-100'
        : 'bg-[var(--surface-interactive)] text-zinc-900'
      : isDark
        ? 'text-zinc-200 hover:bg-[var(--surface-interactive-hover)]'
        : 'text-zinc-800 hover:bg-[var(--surface-interactive-hover)]'
  }`

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className="block w-full">
        <button
          type="button"
          className={rootClassName}
          style={{
            paddingLeft: LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING + depth * TREE_DEPTH_STEP,
            paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
          }}
          onClick={onClick}
          title={label}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
      </ContextMenu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6}>
          <Menu.Popup
            className={`z-50 min-w-40 rounded-[10px] border p-1 shadow-xl outline-none ${
              isDark
                ? 'border-[var(--surface-popover-border)] bg-[var(--surface-popover)] text-zinc-100'
                : 'border-[var(--surface-popover-border)] bg-[var(--surface-popover)] text-zinc-900'
            }`}
          >
            <Menu.Item
              className={`flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
                isDark
                  ? 'text-zinc-100 data-[highlighted]:bg-zinc-800'
                  : 'text-zinc-900 data-[highlighted]:bg-zinc-100'
              }`}
              onClick={onDelete}
            >
              <span>{deleteLabel}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </ContextMenu.Root>
  )
}

function GroupTreeItem({
  group,
  depth,
  selectedEntityIds,
  selectedGroupId,
  isDark,
  api,
}: {
  group: SidebarGroupItem
  depth: number
  selectedEntityIds: string[]
  selectedGroupId: string | null
  isDark: boolean
  api: LeftSidebarElectronAPI
}) {
  const [expanded, setExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingName, setEditingName] = useState(group.label)
  const isSelected = selectedGroupId === group.id

  useEffect(() => {
    if (!isEditing) {
      setEditingName(group.label)
    }
  }, [group.label, isEditing])

  function startRename() {
    setEditingName(group.label)
    setIsEditing(true)
  }

  function cancelRename() {
    setIsEditing(false)
    setEditingName(group.label)
  }

  function commitRename() {
    const nextName = editingName.trim()
    if (nextName && nextName !== group.label) {
      api.renameGroup(group.id, nextName)
    }
    setIsEditing(false)
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className="block w-full">
        <Collapsible.Root open={expanded} onOpenChange={setExpanded}>
          <div>
            {isEditing ? (
              <div
                className={`flex w-full items-center gap-1 py-1.5 text-left text-xs font-normal ${
                  isSelected
                    ? isDark
                      ? 'bg-[var(--surface-interactive)] text-zinc-100'
                      : 'bg-[var(--surface-interactive)] text-zinc-900'
                    : isDark
                      ? 'text-zinc-200 hover:bg-[var(--surface-interactive-hover)]'
                      : 'text-zinc-800 hover:bg-[var(--surface-interactive-hover)]'
                }`}
                style={{
                  paddingLeft: LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING + depth * TREE_DEPTH_STEP,
                  paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
                }}
              >
                <FolderOpen size={14} className="shrink-0 text-zinc-500" />
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
                  className={`min-w-0 flex-1 rounded-[4px] border px-0.5 text-xs outline-none ${
                    isDark
                      ? 'border-zinc-600 bg-zinc-950 text-zinc-100'
                      : 'border-zinc-300 bg-white text-zinc-900'
                  }`}
                />
                <button
                  type="button"
                  className="flex shrink-0 items-center justify-center text-zinc-500"
                  onClick={(event) => {
                    event.stopPropagation()
                    setExpanded((value) => !value)
                  }}
                >
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <span className="ml-auto shrink-0 text-xs text-zinc-400">{group.entityCount}</span>
              </div>
            ) : (
              <button
                type="button"
                className={`flex w-full items-center gap-1 py-1.5 text-left text-xs font-normal ${
                  isSelected
                    ? isDark
                      ? 'bg-[var(--surface-interactive)] text-zinc-100'
                      : 'bg-[var(--surface-interactive)] text-zinc-900'
                    : isDark
                      ? 'text-zinc-200 hover:bg-[var(--surface-interactive-hover)]'
                      : 'text-zinc-800 hover:bg-[var(--surface-interactive-hover)]'
                }`}
                style={{
                  paddingLeft: LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING + depth * TREE_DEPTH_STEP,
                  paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
                }}
                onClick={() => api.revealGroup(group.id)}
                onDoubleClick={startRename}
                title={group.label}
              >
                <FolderOpen size={14} className="shrink-0 text-zinc-500" />
                <span className="min-w-0 truncate">{group.label}</span>
                <Collapsible.Trigger
                  className="flex shrink-0 items-center justify-center text-zinc-500"
                  onClick={(event) => event.stopPropagation()}
                >
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </Collapsible.Trigger>
                <span className="ml-auto shrink-0 text-xs text-zinc-400">{group.entityCount}</span>
              </button>
            )}
          </div>
          <Collapsible.Panel>
            {group.children.map((child) => (
              <SidebarCanvasTreeItem
                key={child.id}
                item={child}
                depth={depth + 1}
                selectedEntityIds={selectedEntityIds}
                selectedGroupId={selectedGroupId}
                isDark={isDark}
                api={api}
              />
            ))}
          </Collapsible.Panel>
        </Collapsible.Root>
      </ContextMenu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6}>
          <Menu.Popup
            className={`z-50 min-w-40 rounded-[10px] border p-1 shadow-xl outline-none ${
              isDark
                ? 'border-[var(--surface-popover-border)] bg-[var(--surface-popover)] text-zinc-100'
                : 'border-[var(--surface-popover-border)] bg-[var(--surface-popover)] text-zinc-900'
            }`}
          >
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
            <Menu.Item
              className={`flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
                isDark
                  ? 'text-zinc-100 data-[highlighted]:bg-zinc-800'
                  : 'text-zinc-900 data-[highlighted]:bg-zinc-100'
              }`}
              onClick={() => api.ungroupGroup(group.id)}
            >
              <span>Ungroup</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </ContextMenu.Root>
  )
}

function SidebarCanvasTreeItem({
  item,
  depth,
  selectedEntityIds,
  selectedGroupId,
  isDark,
  api,
}: {
  item: SidebarCanvasItem
  depth: number
  selectedEntityIds: string[]
  selectedGroupId: string | null
  isDark: boolean
  api: LeftSidebarElectronAPI
}) {
  if (item.kind === 'group') {
    return (
      <GroupTreeItem
        group={item}
        depth={depth}
        selectedEntityIds={selectedEntityIds}
        selectedGroupId={selectedGroupId}
        isDark={isDark}
        api={api}
      />
    )
  }

  const isSelected = selectedEntityIds.includes(item.id)
  if (item.kind === 'frame') {
    return (
      <div>
        <FrameListItem
          frame={item}
          active={isSelected}
          isDark={isDark}
          contentPaddingLeft={LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING + depth * TREE_DEPTH_STEP}
          contentPaddingRight={LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING}
          onClick={() => api.revealFrame(item.id)}
          onRename={(name) => api.renameFrame(item.id, name)}
          onDelete={() => api.deleteFrame(item.id)}
        />
      </div>
    )
  }

  if (item.kind === 'text') {
    return (
      <div>
        <EntityListItem
          icon={<StickyNote size={14} className="shrink-0 text-zinc-500" />}
          label={item.label}
          active={isSelected}
          isDark={isDark}
          depth={depth}
          onClick={() => api.revealEntity(item.id, 'text')}
          onDelete={() => api.deleteEntity(item.id, 'text')}
        />
      </div>
    )
  }

  if (item.kind === 'drawing') {
    return (
      <div>
        <EntityListItem
          icon={<PenLine size={14} className="shrink-0 text-zinc-500" />}
          label={item.label}
          active={isSelected}
          isDark={isDark}
          depth={depth}
          onClick={() => api.revealEntity(item.id, 'drawing')}
          onDelete={() => api.deleteEntity(item.id, 'drawing')}
          deleteLabel="Delete Drawing"
        />
      </div>
    )
  }

  return (
    <div>
      <EntityListItem
        icon={<Image size={14} className="shrink-0 text-zinc-500" />}
        label={item.label}
        active={isSelected}
        isDark={isDark}
        depth={depth}
        onClick={() => api.revealEntity(item.id, 'file')}
        onDelete={() => api.deleteEntity(item.id, 'file')}
      />
    </div>
  )
}

export function SidebarCanvasTree({
  items,
  selectedEntityIds,
  selectedGroupId,
  isDark,
  api,
}: {
  items: SidebarCanvasItem[]
  selectedEntityIds: string[]
  selectedGroupId: string | null
  isDark: boolean
  api: LeftSidebarElectronAPI
}) {
  return (
    <>
      {items.map((item) => (
        <SidebarCanvasTreeItem
          key={item.id}
          item={item}
          depth={0}
          selectedEntityIds={selectedEntityIds}
          selectedGroupId={selectedGroupId}
          isDark={isDark}
          api={api}
        />
      ))}
    </>
  )
}
