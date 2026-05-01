import { Plus } from 'lucide-react'
import type { LeftSidebarElectronAPI } from '../../shared/types'

const LIST_OUTER_LEFT_PADDING = 14
const LIST_OUTER_RIGHT_PADDING = 8
const LIST_ROW_INNER_X_PADDING = 8

export function ConnectProjectRow({
  isDark,
  api,
}: {
  isDark: boolean
  api: LeftSidebarElectronAPI
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-1.5 py-1.5 text-left text-xs font-normal ${
        isDark
          ? 'text-zinc-400 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-100'
          : 'text-zinc-500 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-900'
      }`}
      style={{
        paddingLeft: LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING,
        paddingRight: LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING,
      }}
      onClick={() => {
        void api.connectProjectViaPicker()
      }}
      title="connect a project folder"
    >
      <Plus size={14} className="shrink-0" />
      <span className="truncate">connect project</span>
    </button>
  )
}
