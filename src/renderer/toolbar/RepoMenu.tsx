import { useEffect, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Plug, Plus, Trash2 } from 'lucide-react'
import type { ConnectedRepo, RepoStatus } from '../../shared/types'
import { toolbarApi } from './toolbarApi'

interface RepoMenuProps {
  isDark: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_COPY: Record<RepoStatus, string> = {
  stopped: 'idle',
  starting: 'starting',
  running: 'running',
  errored: 'error',
}

const STATUS_DOT: Record<RepoStatus, string> = {
  stopped: 'bg-zinc-400',
  starting: 'bg-amber-400',
  running: 'bg-emerald-500',
  errored: 'bg-red-500',
}

export function RepoMenu({ isDark, onOpenChange }: RepoMenuProps) {
  const [repos, setRepos] = useState<ConnectedRepo[]>([])

  useEffect(() => {
    let cancelled = false
    toolbarApi.repoList().then((list) => {
      if (!cancelled) setRepos(list)
    })
    const unsubscribe = toolbarApi.onReposChanged((list) => setRepos(list))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const triggerClassName = isDark
    ? 'toolbar-squircle-btn flex items-center gap-1 rounded-[8px] border border-transparent bg-transparent p-1.5 text-zinc-300 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-100'
    : 'toolbar-squircle-btn flex items-center gap-1 rounded-[8px] border border-transparent bg-transparent p-1.5 text-zinc-600 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-900'

  const popupClassName = `z-50 min-w-[260px] rounded-[10px] border p-1 shadow-xl outline-none ${
    isDark
      ? 'border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] text-zinc-100'
      : 'border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] text-zinc-900'
  }`
  const itemClassName = `flex cursor-default items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-xs outline-none ${
    isDark
      ? 'text-zinc-100 data-[highlighted]:bg-[var(--surface-popover)]'
      : 'text-zinc-900 data-[highlighted]:bg-[var(--surface-popover)]'
  }`

  const runningCount = repos.filter((r) => r.status === 'running').length
  const showBadge = runningCount > 0

  return (
    <Menu.Root onOpenChange={onOpenChange}>
      <Menu.Trigger className={triggerClassName} title="Connected repos">
        <Plug size={14} />
        {showBadge ? (
          <span className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        ) : null}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6}>
          <Menu.Popup className={popupClassName}>
            <Menu.Item
              className={itemClassName}
              onClick={async () => {
                await toolbarApi.repoConnectViaPicker()
              }}
            >
              <Plus size={12} />
              <span>connect repo…</span>
            </Menu.Item>
            {repos.length > 0 ? (
              <div
                className={`my-1 h-px ${
                  isDark ? 'bg-zinc-700' : 'bg-zinc-200'
                }`}
              />
            ) : null}
            {repos.map((repo) => (
              <Menu.Item
                key={repo.id}
                className={`${itemClassName} justify-between`}
                onClick={(event) => {
                  // Keep menu open when clicking the disconnect affordance.
                  event.preventDefault()
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[repo.status]}`}
                    title={repo.lastError ?? STATUS_COPY[repo.status]}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{repo.label}</span>
                    <span
                      className={`truncate text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}
                    >
                      {repo.baseUrl ?? repo.absolutePath}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  title="disconnect"
                  onClick={async (event) => {
                    event.stopPropagation()
                    await toolbarApi.repoDisconnect(repo.id)
                  }}
                  className={`shrink-0 rounded-[6px] p-1 ${
                    isDark
                      ? 'text-zinc-400 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-100'
                      : 'text-zinc-500 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-900'
                  }`}
                >
                  <Trash2 size={12} />
                </button>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
