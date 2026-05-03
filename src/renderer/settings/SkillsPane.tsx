import { useCallback, useEffect, useReducer, useState } from 'react'
import { Switch } from '@base-ui/react/switch'
import { Loader2 } from 'lucide-react'
import type {
  OnboardingComponentId,
  OnboardingComponentStatus,
  OnboardingProgressEvent,
  OnboardingStatusSnapshot,
  SettingsElectronAPI,
} from '../../shared/types'

type RowProgress = 'idle' | 'installing' | 'success' | 'error'

type RowState = { progress: RowProgress; detail?: string }

type ProgressMap = Record<OnboardingComponentId, RowState>

const INITIAL_PROGRESS: ProgressMap = {
  cli: { progress: 'idle' },
  skill: { progress: 'idle' },
  agentBrowser: { progress: 'idle' },
}

type ProgressAction =
  | { kind: 'reset'; id: OnboardingComponentId }
  | { kind: 'start'; id: OnboardingComponentId }
  | { kind: 'success'; id: OnboardingComponentId; detail?: string }
  | { kind: 'error'; id: OnboardingComponentId; detail: string }

function progressReducer(state: ProgressMap, action: ProgressAction): ProgressMap {
  switch (action.kind) {
    case 'reset':
      return { ...state, [action.id]: { progress: 'idle' } }
    case 'start':
      return { ...state, [action.id]: { progress: 'installing' } }
    case 'success':
      return { ...state, [action.id]: { progress: 'success', detail: action.detail } }
    case 'error':
      return { ...state, [action.id]: { progress: 'error', detail: action.detail } }
  }
}

type RowConfig = {
  id: OnboardingComponentId
  title: string
  description: string
}

const ROWS: RowConfig[] = [
  {
    id: 'cli',
    title: 'Specular CLI',
    description: 'Adds the specular command so agents can interact with the app.',
  },
  {
    id: 'skill',
    title: 'Specular Skill',
    description: 'Teaches agents how to use the Specular CLI.',
  },
  {
    id: 'agentBrowser',
    title: 'agent-browser',
    description:
      "Specular uses Vercel's agent-browser to capture and interact with live webpages. You can install it here or at agent-browser.dev.",
  },
]

function isInstalled(status: OnboardingComponentStatus): boolean {
  return status.kind === 'installed'
}

function statusDetail(status: OnboardingComponentStatus): string | undefined {
  if (status.kind === 'installed') return status.detail
  if (status.kind === 'outdated') return status.detail ?? 'update available'
  if (status.kind === 'blocked') return status.detail
  return undefined
}

export function SkillsPane({
  api,
  status,
  onStatusChange,
}: {
  api: SettingsElectronAPI
  status: OnboardingStatusSnapshot
  onStatusChange: (next: OnboardingStatusSnapshot) => void
}) {
  const [progress, dispatchProgress] = useReducer(progressReducer, INITIAL_PROGRESS)
  const [pending, setPending] = useState<Record<OnboardingComponentId, boolean>>({
    cli: false,
    skill: false,
    agentBrowser: false,
  })

  useEffect(() => {
    return api.onSkillProgress((event: OnboardingProgressEvent) => {
      if ('kind' in event && event.kind === 'done') {
        onStatusChange(event.status)
        return
      }
      if ('component' in event) {
        if (event.state === 'installing') {
          dispatchProgress({ kind: 'start', id: event.component })
        } else if (event.state === 'success') {
          dispatchProgress({ kind: 'success', id: event.component, detail: event.detail })
        } else {
          dispatchProgress({ kind: 'error', id: event.component, detail: event.detail })
        }
      }
    })
  }, [api, onStatusChange])

  const handleToggle = useCallback(
    async (id: OnboardingComponentId, next: boolean) => {
      if (pending[id]) return
      setPending((prev) => ({ ...prev, [id]: true }))
      dispatchProgress({ kind: 'start', id })
      try {
        const snapshot = await api.setComponentInstalled(id, next)
        onStatusChange(snapshot)
      } finally {
        setPending((prev) => ({ ...prev, [id]: false }))
      }
    },
    [api, onStatusChange, pending],
  )

  return (
    <section>
      <header className="mb-4 mt-2">
        <h2 className="text-[15px] font-semibold">Skills</h2>
        <p className="mt-1 text-[12px] leading-snug text-[var(--surface-toolbar-foreground)] opacity-70">
          Toggle the integrations that let Claude Code drive Specular.
        </p>
      </header>

      {!status.claudeDirExists ? (
        <div className="mb-4 rounded-[8px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          {`Claude Code doesn't seem to be installed (~/.claude not found). You can still install the skills; they'll activate once Claude Code is set up.`}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {ROWS.map((row) => {
          const componentStatus = status[row.id]
          const installed = isInstalled(componentStatus)
          const rowProgress = progress[row.id]
          const isPending = pending[row.id] || rowProgress.progress === 'installing'
          const cannotUninstall = row.id === 'agentBrowser' && installed
          const disabled = isPending || cannotUninstall
          const detail = rowProgress.progress === 'error'
            ? rowProgress.detail
            : rowProgress.progress === 'success'
              ? rowProgress.detail
              : statusDetail(componentStatus)
          const detailClass =
            rowProgress.progress === 'error' || componentStatus.kind === 'blocked'
              ? 'mt-1 text-[11px] text-red-600 dark:text-red-400'
              : 'mt-1 text-[11px] text-[var(--surface-toolbar-foreground)] opacity-60'
          const title = cannotUninstall
            ? 'agent-browser cannot be removed from inside Specular.'
            : undefined

          const rowClass = `flex items-start gap-3 rounded-[8px] border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] px-4 py-3 select-none ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`

          return (
            <label key={row.id} className={rowClass} title={title}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{row.title}</span>
                  {isPending ? (
                    <Loader2
                      size={12}
                      className="animate-spin text-[var(--surface-toolbar-foreground)] opacity-70"
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-snug text-[var(--surface-toolbar-foreground)] opacity-70">
                  {row.description}
                </p>
                {detail ? <p className={detailClass}>{detail}</p> : null}
              </div>
              <div className="pt-[2px]">
                <Switch.Root
                  disabled={disabled}
                  checked={installed}
                  onCheckedChange={(checked) => handleToggle(row.id, checked)}
                  className="relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full border border-[var(--surface-popover-border)] bg-[var(--surface-input)] transition-colors data-[checked]:border-transparent data-[checked]:bg-emerald-500 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                >
                  <Switch.Thumb className="block h-[14px] w-[14px] translate-x-[1px] rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-[15px]" />
                </Switch.Root>
              </div>
            </label>
          )
        })}
      </div>
    </section>
  )
}
