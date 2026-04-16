import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type {
  OnboardingBootstrapData,
  OnboardingComponentId,
  OnboardingComponentStatus,
  OnboardingElectronAPI,
  OnboardingProgressEvent,
  OnboardingStatusSnapshot,
} from '../../shared/types'
import { Installer, type InstallerRowSnapshot, type RowProgress } from './Installer'

type RowProgressMap = Record<OnboardingComponentId, { progress: RowProgress; detail?: string }>

type ProgressAction =
  | { kind: 'reset' }
  | { kind: 'start'; id: OnboardingComponentId }
  | { kind: 'success'; id: OnboardingComponentId; detail?: string }
  | { kind: 'error'; id: OnboardingComponentId; detail: string }

const INITIAL_PROGRESS: RowProgressMap = {
  cli: { progress: 'idle' },
  skill: { progress: 'idle' },
  agentBrowser: { progress: 'idle' },
}

function progressReducer(state: RowProgressMap, action: ProgressAction): RowProgressMap {
  switch (action.kind) {
    case 'reset':
      return INITIAL_PROGRESS
    case 'start':
      return { ...state, [action.id]: { progress: 'installing' } }
    case 'success':
      return { ...state, [action.id]: { progress: 'success', detail: action.detail } }
    case 'error':
      return { ...state, [action.id]: { progress: 'error', detail: action.detail } }
  }
}

function defaultSelected(status: OnboardingComponentStatus): boolean {
  return status.kind !== 'installed'
}

function anyInstallable(
  selections: Record<OnboardingComponentId, boolean>,
): boolean {
  return Object.values(selections).some(Boolean)
}

function allInstalledOrSkipped(
  status: OnboardingStatusSnapshot,
  progress: RowProgressMap,
): boolean {
  const ids: OnboardingComponentId[] = ['cli', 'skill', 'agentBrowser']
  return ids.every(
    (id) => status[id].kind === 'installed' || progress[id].progress === 'success',
  )
}

export default function App({
  api,
  initialData,
}: {
  api: OnboardingElectronAPI
  initialData: OnboardingBootstrapData
}) {
  const [status, setStatus] = useState<OnboardingStatusSnapshot>(initialData.status)
  const [progress, dispatchProgress] = useReducer(progressReducer, INITIAL_PROGRESS)
  const [installing, setInstalling] = useState(false)
  const [selections, setSelections] = useState<Record<OnboardingComponentId, boolean>>({
    cli: defaultSelected(initialData.status.cli),
    skill: defaultSelected(initialData.status.skill),
    agentBrowser: defaultSelected(initialData.status.agentBrowser),
  })

  useEffect(() => {
    return api.onThemeChanged((data) =>
      document.documentElement.classList.toggle('dark', data.isDark),
    )
  }, [api])

  useEffect(() => {
    return api.onProgress((event: OnboardingProgressEvent) => {
      if ('kind' in event && event.kind === 'done') {
        setStatus(event.status)
        setInstalling(false)
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
  }, [api])

  const setSelected = useCallback(
    (id: OnboardingComponentId, selected: boolean) =>
      setSelections((prev) => ({ ...prev, [id]: selected })),
    [],
  )

  const rows = useMemo<Record<OnboardingComponentId, InstallerRowSnapshot>>(
    () => ({
      cli: {
        status: status.cli,
        progress: progress.cli.progress,
        progressDetail: progress.cli.detail,
        selected: selections.cli,
      },
      skill: {
        status: status.skill,
        progress: progress.skill.progress,
        progressDetail: progress.skill.detail,
        selected: selections.skill,
      },
      agentBrowser: {
        status: status.agentBrowser,
        progress: progress.agentBrowser.progress,
        progressDetail: progress.agentBrowser.detail,
        selected: selections.agentBrowser,
      },
    }),
    [status, progress, selections],
  )

  const handleInstall = useCallback(async () => {
    if (installing || !anyInstallable(selections)) return
    setInstalling(true)
    dispatchProgress({ kind: 'reset' })
    try {
      const next = await api.install(selections)
      setStatus(next)
    } finally {
      setInstalling(false)
    }
  }, [api, installing, selections])

  const canFinish = allInstalledOrSkipped(status, progress)
  const primaryLabel = canFinish
    ? 'Continue'
    : installing
      ? 'Installing\u2026'
      : 'Install selected'

  const primaryAction = canFinish ? () => api.complete() : handleInstall

  const showClaudeWarning = !status.claudeDirExists
  const modeTitle = initialData.mode === 'welcome' ? 'Welcome to Telescope' : 'Telescope Setup'
  const modeDescription =
    initialData.mode === 'welcome'
      ? 'Let’s set up Telescope to work with Claude Code. You can change these any time from the Telescope menu.'
      : 'Install or re-check the integrations that let Claude Code drive Telescope.'

  return (
    <div className="flex h-full flex-col">
      <div className="titlebar-drag h-[34px] w-full shrink-0" />
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        <header className="mb-6">
          <h1 className="text-[18px] font-semibold">{modeTitle}</h1>
          <p className="mt-2 text-[13px] leading-snug text-[var(--surface-toolbar-foreground)] opacity-70">
            {modeDescription}
          </p>
        </header>

        {showClaudeWarning ? (
          <div className="mb-4 rounded-[8px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
            {`Claude Code doesn’t seem to be installed (~/.claude not found). You can still install the skills; they’ll activate once Claude Code is set up.`}
          </div>
        ) : null}

        <Installer.Root rows={rows} setSelected={setSelected}>
          <Installer.Row
            id="cli"
            title="Telescope CLI"
            description="Adds the telescope command to your PATH so Claude Code can drive the canvas."
            meta="/usr/local/bin/telescope  →  ~/.local/bin/telescope"
          />
          <Installer.Row
            id="skill"
            title="Telescope skill for Claude Code"
            description="Teaches Claude Code the telescope command vocabulary."
            meta="~/.claude/skills/telescope/SKILL.md"
          />
          <Installer.Row
            id="agentBrowser"
            title="agent-browser"
            description="Lets Telescope capture, inspect, and interact with live web pages inside frames."
            meta="bundled binary + ~/.claude/skills/agent-browser/SKILL.md"
            footer={
              status.agentBrowserUserInstall ? (
                <span className="block text-[11px] text-[var(--surface-toolbar-foreground)] opacity-50">
                  {`Also found ${status.agentBrowserUserInstall.version} at ${status.agentBrowserUserInstall.path}. Telescope uses the bundled copy; set AGENT_BROWSER_PATH to override.`}
                </span>
              ) : null
            }
          />
        </Installer.Root>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--surface-popover-border)] bg-[var(--surface-panel)] px-8 py-4">
        <button
          type="button"
          className="text-[12px] text-[var(--surface-toolbar-foreground)] opacity-70 hover:opacity-100 disabled:opacity-40"
          disabled={installing}
          onClick={() => api.dismiss()}
        >
          {initialData.mode === 'welcome' ? 'Skip for now' : 'Close'}
        </button>
        <button
          type="button"
          className="rounded-[6px] bg-emerald-600 px-4 py-[6px] text-[12px] font-medium text-white shadow-sm enabled:hover:bg-emerald-500 disabled:opacity-50"
          disabled={installing || (!canFinish && !anyInstallable(selections))}
          onClick={primaryAction}
        >
          {primaryLabel}
        </button>
      </footer>
    </div>
  )
}
