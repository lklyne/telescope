import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type {
  LeftSidebarData,
  LeftSidebarElectronAPI,
  SidebarCanvasItem,
  ThemeData,
} from '../../shared/types'
import { SidebarCanvasTree } from './SidebarCanvasTree'
import { ProjectSection } from './ProjectSection'
import { ConnectProjectRow } from './ConnectProjectRow'
import { findGloballyActiveCanvas } from './sectioned-data'
import { useReportTextEditing } from '../shared/hooks/useReportTextEditing'
import { useTheme } from '../shared/hooks/useTheme'

const SCRATCHPAD_PROJECT_ID = 'scratchpad'

const api = (window as unknown as { electronAPI: LeftSidebarElectronAPI }).electronAPI

function findSidebarItemById(
  items: SidebarCanvasItem[],
  targetId: string,
): SidebarCanvasItem | null {
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
  const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null)
  const previousActiveFrameCountRef = useRef<number | null>(null)
  const isDark = useTheme(initialTheme, api.onThemeChanged)
  useReportTextEditing(api.setTextEditing)

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
    if (!editingCanvasId) return
    if (!sidebarData.tabs.some((tab) => tab.id === editingCanvasId)) {
      setEditingCanvasId(null)
    }
  }, [editingCanvasId, sidebarData.tabs])

  const activeTab = sidebarData.tabs.find((tab) => tab.id === sidebarData.activeTabId) ?? null
  const headerLabel = pagesExpanded ? 'Canvases' : activeTab?.name ?? 'Canvases'

  useEffect(() => {
    const nextCount = activeTab?.frames.length ?? 0
    const previousCount = previousActiveFrameCountRef.current
    if (previousCount !== null && nextCount > previousCount) {
      setPagesExpanded(true)
    }
    previousActiveFrameCountRef.current = nextCount
  }, [activeTab?.id, activeTab?.frames.length])

  const sections = sidebarData.sections ?? []
  const activeRef = findGloballyActiveCanvas(sidebarData)
  const activeProjectIdForCreate =
    sidebarData.activeProjectId ?? activeRef?.projectId ?? SCRATCHPAD_PROJECT_ID

  function startRenameCanvas(canvasId: string) {
    setEditingCanvasId(canvasId)
  }

  function cancelRenameCanvas() {
    setEditingCanvasId(null)
  }

  function commitRenameCanvas(canvasId: string, currentName: string, nextName: string) {
    if (nextName && nextName !== currentName) api.renameTab(canvasId, nextName)
    cancelRenameCanvas()
  }

  const treeNode = (
    <SidebarCanvasTree
      items={sidebarData.items}
      selectedEntityIds={sidebarData.selectedEntityIds}
      selectedGroupId={sidebarData.selectedGroupId ?? null}
      isDark={isDark}
      api={api}
    />
  )

  return (
    <aside
      className={`flex h-screen w-screen flex-col overflow-hidden ${
        isDark
          ? 'border-r border-[var(--surface-chrome-border)] bg-[var(--surface-panel)] text-zinc-100'
          : 'border-r border-[var(--surface-chrome-border)] bg-[var(--surface-panel)] text-zinc-900'
      }`}
    >
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
            title={headerLabel}
          >
            <span className="truncate text-[12px] font-medium">{headerLabel}</span>
            {pagesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <button
            type="button"
            className={`rounded-[8px] border border-transparent p-1.5 ${
              isDark
                ? 'bg-transparent text-zinc-300 hover:bg-zinc-700/70 hover:text-zinc-100'
                : 'bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200'
            }`}
            onClick={() => {
              void api.createCanvasInProject(activeProjectIdForCreate)
            }}
            title="new canvas"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
        {pagesExpanded ? (
          <div className="pt-0.5 pb-2">
            {sections.map((section) => (
              <ProjectSection
                key={section.id}
                section={section}
                isDark={isDark}
                api={api}
                editingCanvasId={editingCanvasId}
                onStartRenameCanvas={startRenameCanvas}
                onCancelRenameCanvas={cancelRenameCanvas}
                onCommitRenameCanvas={commitRenameCanvas}
                treeSlot={
                  activeRef && section.id === activeRef.projectId ? (
                    <div className="py-1">{treeNode}</div>
                  ) : null
                }
              />
            ))}
            <div
              className={`mt-1 border-t pt-1 ${
                isDark ? 'border-zinc-700/50' : 'border-gray-200/80'
              }`}
            >
              <ConnectProjectRow isDark={isDark} api={api} />
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
