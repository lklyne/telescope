import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import {
  Check,
  ChevronDown,
  ChevronRight,
  File,
  MoreHorizontal,
  Plus,
} from 'lucide-react'
import type {
  LeftSidebarElectronAPI,
  SidebarCanvasEntry,
  SidebarProjectSection,
} from '../../shared/types'
import { InlineEditLabel } from '../shared/InlineEditLabel'

const LIST_OUTER_LEFT_PADDING = 14
const LIST_OUTER_RIGHT_PADDING = 8
const LIST_ROW_INNER_X_PADDING = 8
const CANVAS_ROW_INDENT = 14

interface ProjectSectionProps {
  section: SidebarProjectSection
  isDark: boolean
  api: LeftSidebarElectronAPI
  editingCanvasId: string | null
  onStartRenameCanvas: (canvasId: string) => void
  onCancelRenameCanvas: () => void
  onCommitRenameCanvas: (canvasId: string, oldName: string, nextName: string) => void
  treeSlot: ReactNode
}

export function ProjectSection({
  section,
  isDark,
  api,
  editingCanvasId,
  onStartRenameCanvas,
  onCancelRenameCanvas,
  onCommitRenameCanvas,
  treeSlot,
}: ProjectSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const [editingHeader, setEditingHeader] = useState(false)
  const [urlDraft, setUrlDraft] = useState(section.url ?? '')

  const broken = section.health === 'broken'

  const headerRowClass = `group flex w-full items-center gap-1 py-1 text-xs font-medium ${
    isDark
      ? 'text-zinc-200 hover:bg-[var(--surface-interactive-hover)]'
      : 'text-zinc-800 hover:bg-[var(--surface-interactive-hover)]'
  } ${broken ? 'opacity-60' : ''}`

  const iconBtnClass = `rounded-[6px] p-1 ${
    isDark
      ? 'text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-100'
      : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900'
  }`

  const popupClass = `z-50 min-w-44 rounded-[10px] border p-1 shadow-xl outline-none ${
    isDark
      ? 'border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] text-zinc-100'
      : 'border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] text-zinc-900'
  }`

  const itemClass = `flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
    isDark
      ? 'text-zinc-100 data-[highlighted]:bg-[var(--surface-popover)]'
      : 'text-zinc-900 data-[highlighted]:bg-[var(--surface-popover)]'
  }`

  const destructiveItemClass = `flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
    isDark
      ? 'text-red-400 data-[highlighted]:bg-[var(--surface-popover)] data-[highlighted]:text-red-300'
      : 'text-red-600 data-[highlighted]:bg-[var(--surface-popover)] data-[highlighted]:text-red-700'
  }`

  function commitHeaderRename(next: string) {
    setEditingHeader(false)
    if (!next || next === section.label) return
    void api.renameProject(section.id, next)
  }

  function submitUrl() {
    const value = urlDraft.trim()
    void api.setProjectUrl(section.id, value === '' ? null : value)
  }

  function onUrlKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      submitUrl()
    }
  }

  return (
    <div className="pb-1">
      <div
        className={headerRowClass}
        style={{
          paddingLeft: LIST_OUTER_LEFT_PADDING,
          paddingRight: LIST_OUTER_RIGHT_PADDING,
        }}
      >
        <button
          type="button"
          className="flex shrink-0 items-center justify-center p-0.5"
          onClick={() => setExpanded((value) => !value)}
          title={expanded ? 'collapse section' : 'expand section'}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {editingHeader && !section.isScratchpad ? (
          <InlineEditLabel
            value={section.label}
            isEditing
            onCommit={(next) => commitHeaderRename(next)}
            onCancel={() => setEditingHeader(false)}
            variant="sidebar-row"
            isDark={isDark}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => setExpanded((value) => !value)}
            onDoubleClick={() => {
              if (!section.isScratchpad) setEditingHeader(true)
            }}
            title={section.codebasePath ?? section.label}
          >
            {section.label}
          </button>
        )}

        {broken ? (
          <button
            type="button"
            className={`shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] ${
              isDark
                ? 'border border-red-500/40 text-red-300 hover:bg-red-500/10'
                : 'border border-red-500/40 text-red-600 hover:bg-red-500/10'
            }`}
            onClick={() => {
              void api.relinkProject(section.id)
            }}
            title="locate the codebase folder"
          >
            locate folder…
          </button>
        ) : null}

        {!section.isScratchpad ? (
          <Menu.Root>
            <Menu.Trigger
              className={iconBtnClass}
              title="project options"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal size={14} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={6}>
                <Menu.Popup className={popupClass}>
                  <Menu.Item
                    className={itemClass}
                    onClick={() => setEditingHeader(true)}
                  >
                    <span>Rename</span>
                  </Menu.Item>
                  <div
                    className={`flex flex-col gap-1 rounded-[7px] px-2.5 py-1.5 text-xs ${
                      isDark ? 'text-zinc-200' : 'text-zinc-800'
                    }`}
                    onKeyDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
                      Dev URL
                    </span>
                    <input
                      type="text"
                      value={urlDraft}
                      onChange={(event) => setUrlDraft(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        onUrlKeyDown(event)
                      }}
                      onBlur={() => submitUrl()}
                      placeholder="http://localhost:3000"
                      spellCheck={false}
                      className={`w-full rounded-[6px] border px-1.5 py-1 text-[11px] outline-none ${
                        isDark
                          ? 'border-zinc-700 bg-zinc-900 text-zinc-100 focus:border-amber-500'
                          : 'border-zinc-300 bg-white text-zinc-900 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <Menu.Item
                    className={itemClass}
                    onClick={() => {
                      void api.revealProjectFolder(section.id)
                    }}
                  >
                    <span>Show in Finder</span>
                  </Menu.Item>
                  <Menu.Item
                    className={itemClass}
                    onClick={() => {
                      void api.revealCodebase(section.id)
                    }}
                  >
                    <span>Reveal Codebase in Finder</span>
                  </Menu.Item>
                  <div
                    className={`my-1 h-px ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}
                  />
                  <Menu.Item
                    className={destructiveItemClass}
                    onClick={() => {
                      void api.deleteProject(section.id)
                    }}
                  >
                    <span>Delete Project…</span>
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : null}

        <button
          type="button"
          className={iconBtnClass}
          onClick={() => {
            void api.createCanvasInProject(section.id)
          }}
          title="new canvas in this section"
        >
          <Plus size={14} />
        </button>
      </div>

      {expanded ? (
        <div>
          {section.canvases.map((canvas) => (
            <CanvasRow
              key={canvas.id}
              canvas={canvas}
              projectId={section.id}
              isDark={isDark}
              api={api}
              isEditing={editingCanvasId === canvas.id}
              onStartRename={() => onStartRenameCanvas(canvas.id)}
              onCancelRename={onCancelRenameCanvas}
              onCommitRename={(next) =>
                onCommitRenameCanvas(canvas.id, canvas.name, next)
              }
              treeSlot={canvas.isActive ? treeSlot : null}
            />
          ))}
          {section.canvases.length === 0 ? (
            <div
              className={`py-1 text-[11px] ${
                isDark ? 'text-zinc-500' : 'text-zinc-400'
              }`}
              style={{
                paddingLeft:
                  LIST_OUTER_LEFT_PADDING +
                  LIST_ROW_INNER_X_PADDING +
                  CANVAS_ROW_INDENT,
                paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
              }}
            >
              no canvases yet
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function CanvasRow({
  canvas,
  projectId,
  isDark,
  api,
  isEditing,
  onStartRename,
  onCancelRename,
  onCommitRename,
  treeSlot,
}: {
  canvas: SidebarCanvasEntry
  projectId: string
  isDark: boolean
  api: LeftSidebarElectronAPI
  isEditing: boolean
  onStartRename: () => void
  onCancelRename: () => void
  onCommitRename: (next: string) => void
  treeSlot: ReactNode
}) {
  const rowClass = `flex w-full items-center gap-1 py-1.5 text-left text-xs font-normal ${
    isDark
      ? 'text-zinc-100 hover:bg-[var(--surface-interactive-hover)]'
      : 'text-zinc-900 hover:bg-[var(--surface-interactive-hover)]'
  } ${canvas.isActive ? '' : isDark ? 'text-zinc-200' : 'text-zinc-800'}`

  const padding = {
    paddingLeft:
      LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING + CANVAS_ROW_INDENT,
    paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
  }

  const popupClass = `z-50 min-w-40 rounded-[10px] border p-1 shadow-xl outline-none ${
    isDark
      ? 'border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] text-zinc-100'
      : 'border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] text-zinc-900'
  }`

  const menuItemClass = `flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
    isDark
      ? 'text-zinc-100 data-[highlighted]:bg-[var(--surface-popover)]'
      : 'text-zinc-900 data-[highlighted]:bg-[var(--surface-popover)]'
  }`

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger className="block w-full">
          {isEditing ? (
            <div className={rowClass} style={padding}>
              <File size={14} className="shrink-0 text-zinc-500" />
              <InlineEditLabel
                value={canvas.name}
                isEditing
                onCommit={onCommitRename}
                onCancel={onCancelRename}
                variant="sidebar-row"
                isDark={isDark}
              />
              {canvas.isActive ? <Check size={14} className="ml-auto shrink-0" /> : null}
            </div>
          ) : (
            <button
              type="button"
              className={rowClass}
              style={padding}
              onClick={() => {
                api.selectTab(canvas.id)
                void api.setActiveProject(projectId)
              }}
              onDoubleClick={onStartRename}
              onKeyDown={(event) => {
                if (event.key === 'F2') {
                  event.preventDefault()
                  onStartRename()
                }
              }}
              title={canvas.name}
            >
              <File size={14} className="shrink-0 text-zinc-500" />
              <span className="truncate">{canvas.name}</span>
              {canvas.isActive ? <Check size={14} className="ml-auto shrink-0" /> : null}
            </button>
          )}
        </ContextMenu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6}>
            <Menu.Popup className={popupClass}>
              <Menu.Item className={menuItemClass} onClick={onStartRename}>
                <span>rename</span>
              </Menu.Item>
              <Menu.Item
                className={menuItemClass}
                onClick={() => api.deleteTab(canvas.id)}
              >
                <span>delete</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </ContextMenu.Root>
      {treeSlot}
    </>
  )
}
