import { useEffect, useRef, useState } from 'react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import { Tabs } from '@base-ui/react/tabs'
import { Check, ChevronDown, ChevronRight, File, LayoutTemplate, PanelRight, PanelTop, Plus } from 'lucide-react'
import type {
  LeftSidebarData,
  LeftSidebarElectronAPI,
  SidebarCanvasItem,
  ThemeData,
} from '../../shared/types'
import { SidebarCanvasTree } from './SidebarCanvasTree'
import { useReportTextEditing } from '../shared/hooks/useReportTextEditing'
import { useTheme } from '../shared/hooks/useTheme'
import { useDragReorder } from './useDragReorder'

const LIST_OUTER_LEFT_PADDING = 14
const LIST_OUTER_RIGHT_PADDING = 8
const LIST_ROW_INNER_X_PADDING = 8

const api = (window as unknown as { electronAPI: LeftSidebarElectronAPI }).electronAPI

function findSidebarItemById(items: SidebarCanvasItem[], targetId: string): SidebarCanvasItem | null {
  for (const item of items) {
    if (item.id === targetId) return item
    if (item.kind !== 'group') continue
    const childMatch = findSidebarItemById(item.children, targetId)
    if (childMatch) return childMatch
  }
  return null
}

export default function App({
  initialSidebarData,
  initialTheme,
}: {
  initialSidebarData: LeftSidebarData
  initialTheme: ThemeData
}) {
  const [sidebarData, setSidebarData] = useState<LeftSidebarData>(initialSidebarData)
  const [pagesExpanded, setPagesExpanded] = useState(true)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTabName, setEditingTabName] = useState('')
  const previousActiveFrameCountRef = useRef<number | null>(null)
  const isDark = useTheme(initialTheme, api.onThemeChanged)
  useReportTextEditing(api.setTextEditing)

  const drag = useDragReorder(sidebarData.tabs.length, (tabId, toIndex) =>
    api.reorderTab(tabId, toIndex),
  )

  useEffect(() => api.onSidebarData((data) => setSidebarData(data)), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!document.hasFocus()) return
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (!sidebarData.selectedEntityIds.length) return

      let deletedAny = false
      for (const entityId of sidebarData.selectedEntityIds) {
        const item = findSidebarItemById(sidebarData.items, entityId)
        if (!item || item.kind === 'group') continue
        if (item.kind === 'frame') {
          api.deleteFrame(item.id)
        } else {
          api.deleteEntity(item.id, item.kind)
        }
        deletedAny = true
      }

      if (!deletedAny) return
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarData.items, sidebarData.selectedEntityIds])

  useEffect(() => {
    if (!editingTabId) return
    if (!sidebarData.tabs.some((tab) => tab.id === editingTabId)) {
      setEditingTabId(null)
      setEditingTabName('')
    }
  }, [editingTabId, sidebarData.tabs])

  const activeTab = sidebarData.tabs.find((tab) => tab.id === sidebarData.activeTabId) ?? null
  const pagesHeaderLabel = pagesExpanded ? 'Spaces' : activeTab?.name ?? 'Spaces'

  useEffect(() => {
    const nextCount = activeTab?.frames.length ?? 0
    const previousCount = previousActiveFrameCountRef.current
    if (previousCount !== null && nextCount > previousCount) {
      setPagesExpanded(true)
    }
    previousActiveFrameCountRef.current = nextCount
  }, [activeTab?.id, activeTab?.frames.length])

  function startRenameTab(tabId: string, currentName: string) {
    setEditingTabId(tabId)
    setEditingTabName(currentName)
  }

  function cancelRenameTab() {
    setEditingTabId(null)
    setEditingTabName('')
  }

  function commitRenameTab(tabId: string, currentName: string) {
    const nextName = editingTabName.trim()
    if (nextName && nextName !== currentName) api.renameTab(tabId, nextName)
    cancelRenameTab()
  }

  return (
    <aside
      className={`flex h-screen w-screen flex-col overflow-hidden bg-transparent ${
        isDark ? 'text-zinc-100' : 'text-zinc-900'
      }`}
    >
      {/*
        Traffic-light header. Matches toolbar height so the sidebar's
        first content row aligns horizontally with the toolbar's baseline.
        The whole strip is window-draggable (behaves like a native titlebar);
        interactive controls opt out with [-webkit-app-region:no-drag].
        The left 78px is reserved for the macOS traffic-light buttons.
      */}
      <SidebarHeader
        isDark={isDark}
        leftSidebarOpen
        viewMode={sidebarData.viewMode}
        hasFrames={sidebarData.hasFrames}
        onToggleLeftSidebar={api.toggleLeftSidebar}
        onToggleBrowserMode={api.toggleBrowserMode}
      />
      <div
        className={
          pagesExpanded
            ? 'flex h-9 items-center px-3'
            : 'flex h-9 items-center border-b border-[var(--surface-panel-border)] px-3'
        }
      >
        <div className="flex w-full items-center gap-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onClick={() => setPagesExpanded((value) => !value)}
            title={pagesHeaderLabel}
          >
            <span className="truncate text-[12px] font-medium">{pagesHeaderLabel}</span>
            {pagesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <button
            type="button"
            className={`rounded-[8px] border border-transparent p-1.5 ${
              isDark
                ? 'bg-transparent text-zinc-300 hover:bg-zinc-700/70 hover:text-zinc-100'
                : 'bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200'
            }`}
            onClick={() => api.createTab()}
            title="Add space"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
        {pagesExpanded ? (
          <div className="pt-0.5 pb-2" {...drag.containerProps}>
            {sidebarData.tabs.map((tab, tabIndex) => (
              <div
                key={tab.id}
                {...drag.itemProps(tab.id, tabIndex, editingTabId === tab.id)}
              >
                <ContextMenu.Root>
                  <ContextMenu.Trigger className="block w-full">
                    {editingTabId === tab.id ? (
                      <div
                        className={`flex w-full items-center gap-1 py-1.5 text-xs font-normal ${
                          isDark
                            ? 'text-zinc-100 hover:bg-[var(--surface-interactive-hover)]'
                            : 'text-zinc-900 hover:bg-[var(--surface-interactive-hover)]'
                        } ${tab.isActive ? '' : isDark ? 'text-zinc-200' : 'text-zinc-800'}`}
                        style={{
                          paddingLeft: LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING,
                          paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
                        }}
                      >
                        <File size={14} className="shrink-0 text-zinc-500" />
                        <input
                          autoFocus
                          value={editingTabName}
                          onChange={(e) => setEditingTabName(e.target.value)}
                          onBlur={() => commitRenameTab(tab.id, tab.name)}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitRenameTab(tab.id, tab.name)
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelRenameTab()
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className={`min-w-0 flex-1 self-stretch rounded-[4px] border px-0.5 text-xs outline-none ${
                            isDark
                              ? 'border-zinc-600 bg-zinc-950 text-zinc-100'
                              : 'border-zinc-300 bg-white text-zinc-900'
                          }`}
                        />
                        {tab.isActive ? <Check size={14} className="ml-auto shrink-0" /> : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`flex w-full items-center gap-1 py-1.5 text-left text-xs font-normal ${
                          isDark
                            ? 'text-zinc-100 hover:bg-[var(--surface-interactive-hover)]'
                            : 'text-zinc-900 hover:bg-[var(--surface-interactive-hover)]'
                        } ${tab.isActive ? '' : isDark ? 'text-zinc-200' : 'text-zinc-800'}`}
                        style={{
                          paddingLeft: LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING,
                          paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
                        }}
                        onClick={() => api.selectTab(tab.id)}
                        onDoubleClick={() => startRenameTab(tab.id, tab.name)}
                        title={tab.name}
                      >
                        <File size={14} className="shrink-0 text-zinc-500" />
                        <span className="truncate">{tab.name}</span>
                        {tab.isActive ? <Check size={14} className="ml-auto shrink-0" /> : null}
                      </button>
                    )}
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
                          onClick={() => startRenameTab(tab.id, tab.name)}
                        >
                          <span>Rename space</span>
                        </Menu.Item>
                        <Menu.Item
                          className={`flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
                            isDark
                              ? 'text-zinc-100 data-[highlighted]:bg-zinc-800'
                              : 'text-zinc-900 data-[highlighted]:bg-zinc-100'
                          }`}
                          onClick={() => api.deleteTab(tab.id)}
                        >
                          <span>Delete space</span>
                        </Menu.Item>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </ContextMenu.Root>
              </div>
            ))}
          </div>
        ) : null}

        <div className={isDark ? 'border-t border-zinc-700/50' : 'border-t border-gray-200/80'} />

        <div className="py-2">
          <SidebarCanvasTree
            items={sidebarData.items}
            selectedEntityIds={sidebarData.selectedEntityIds}
            selectedGroupId={sidebarData.selectedGroupId ?? null}
            isDark={isDark}
            api={api}
          />

          {!sidebarData.items.length ? (
            <div
              className="py-1 text-[11px] text-zinc-500"
              style={{
                paddingLeft: LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING,
                paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
              }}
            >
              No items
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

interface SidebarHeaderProps {
  isDark: boolean
  leftSidebarOpen: boolean
  viewMode: LeftSidebarData['viewMode']
  hasFrames: boolean
  onToggleLeftSidebar: () => void
  onToggleBrowserMode: () => void
}

function SidebarHeader({
  isDark,
  leftSidebarOpen,
  viewMode,
  hasFrames,
  onToggleLeftSidebar,
  onToggleBrowserMode,
}: SidebarHeaderProps) {
  const iconButtonClass = isDark
    ? 'flex items-center justify-center rounded-[8px] border border-transparent bg-transparent p-1.5 text-zinc-300 hover:bg-zinc-700/70 hover:text-zinc-100 active:bg-zinc-700'
    : 'flex items-center justify-center rounded-[8px] border border-transparent bg-transparent p-1.5 text-zinc-600 hover:bg-black/5 hover:text-zinc-900 active:bg-black/10'

  const modeTabClass = isDark
    ? 'relative z-10 flex items-center justify-center rounded-[8px] border-0 bg-transparent p-1.5 text-zinc-300 opacity-60 outline-none transition-[color,opacity] select-none hover:text-zinc-100 hover:opacity-100 data-[active]:text-zinc-100 data-[active]:opacity-100 disabled:pointer-events-none disabled:opacity-45'
    : 'relative z-10 flex items-center justify-center rounded-[8px] border-0 bg-transparent p-1.5 text-zinc-600 opacity-60 outline-none transition-[color,opacity] select-none hover:text-zinc-900 hover:opacity-100 data-[active]:text-zinc-900 data-[active]:opacity-100 disabled:pointer-events-none disabled:opacity-45'

  const modeTabIndicatorClass =
    'absolute top-1/2 left-0 z-[-1] h-[var(--active-tab-height)] w-[var(--active-tab-width)] -translate-y-1/2 translate-x-[var(--active-tab-left)] rounded-[8px] bg-[var(--surface-interactive)] transition-all duration-200 ease-in-out'

  const isBrowserMode = viewMode === 'browser'

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 pl-[78px] pr-2 [-webkit-app-region:drag]">
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        <button
          type="button"
          onClick={onToggleLeftSidebar}
          className={iconButtonClass}
          title={leftSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <PanelRight
            size={14}
            className={leftSidebarOpen ? '' : 'opacity-60'}
            style={{ transform: 'scaleX(-1)' }}
          />
        </button>

        <Tabs.Root
          value={isBrowserMode ? 'browser' : 'canvas'}
          onValueChange={(value) => {
            if ((value === 'browser') !== isBrowserMode) onToggleBrowserMode()
          }}
        >
          <Tabs.List className="relative z-0 flex items-center gap-1" aria-label="View mode">
            <Tabs.Tab className={modeTabClass} value="canvas" title="Canvas">
              <LayoutTemplate size={14} />
            </Tabs.Tab>
            <Tabs.Tab
              className={modeTabClass}
              disabled={!hasFrames}
              value="browser"
              title="Browser"
            >
              <PanelTop size={14} />
            </Tabs.Tab>
            <Tabs.Indicator className={modeTabIndicatorClass} />
          </Tabs.List>
        </Tabs.Root>
      </div>
    </div>
  )
}
