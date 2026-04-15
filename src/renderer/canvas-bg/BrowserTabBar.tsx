import { Plus } from 'lucide-react'
import type { WorkspaceTabFrameSummary } from '../../shared/types'
import { LAPTOP_PRESET_INDEX } from '../../shared/constants'
import { FrameListItem } from '../shared/frameListItem'

export function BrowserTabBar({
  activeBrowserTabId,
  leftInset,
  browserTabs,
  isDark,
  onAddBrowserFrame,
  onDeleteFrame,
  onRenameFrame,
  onSelectBrowserTab,
}: {
  activeBrowserTabId: string | null
  leftInset: number
  browserTabs: WorkspaceTabFrameSummary[]
  isDark: boolean
  onAddBrowserFrame: (presetIndex: number | 'custom') => void
  onDeleteFrame: (frameId: string) => void
  onRenameFrame: (frameId: string, name: string) => void
  onSelectBrowserTab: (frameId: string) => void
}) {
  return (
    <div
      className={`absolute top-[44px] z-[50] flex h-9 items-center gap-1.5 border-b border-[var(--surface-panel-border)] ${
        isDark
          ? 'bg-[var(--surface-panel)] text-zinc-100'
          : 'bg-[var(--surface-panel)] text-zinc-900'
      }`}
      style={{
        left: leftInset,
        right: 0,
      }}
      data-overlay-ui
    >
      <div className="min-w-0 flex flex-1 items-center gap-1.5">
        <div className="browser-tab-strip-scroll min-w-0 max-w-full flex-[0_1_auto] overflow-x-auto">
          <div className="flex h-9 min-w-0 items-stretch">
            {browserTabs.map((frame) => (
              <div
                key={frame.id}
                className="flex h-full w-[240px] min-w-[88px] max-w-[240px] shrink"
              >
                <FrameListItem
                  frame={frame}
                  active={activeBrowserTabId === frame.id}
                  compact
                  fullBleedCompact
                  showDimensions={false}
                  isDark={isDark}
                  onClick={() => onSelectBrowserTab(frame.id)}
                  onRename={(name) => onRenameFrame(frame.id, name)}
                  onDelete={() => onDeleteFrame(frame.id)}
                />
              </div>
            ))}
          </div>
        </div>
        <button
          className={`flex h-7 shrink-0 items-center rounded-[8px] border border-transparent px-2 text-xs [-webkit-app-region:no-drag] ${
            isDark
              ? 'bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
              : 'bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
          }`}
          onClick={() => onAddBrowserFrame(LAPTOP_PRESET_INDEX)}
          title="New Tab"
          type="button"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}
