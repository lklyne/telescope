import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type {
  OnboardingComponentId,
  OnboardingComponentStatus,
  OnboardingProgressEvent,
  OnboardingStatusSnapshot,
  SettingsElectronAPI,
} from '../../shared/types'
import {
  SkillInstaller,
  SKILL_INSTALLER_IDS,
  type InstallerRowSnapshot,
  type RowProgress,
} from '../shared/SkillInstaller'

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

function isMissingOrOutdated(status: OnboardingComponentStatus): boolean {
  return status.kind === 'missing' || status.kind === 'outdated'
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
  const [installing, setInstalling] = useState(false)
  const [selections, setSelections] = useState<Record<OnboardingComponentId, boolean>>({
    cli: isMissingOrOutdated(status.cli),
    skill: isMissingOrOutdated(status.skill),
    agentBrowser: isMissingOrOutdated(status.agentBrowser),
  })

  useEffect(() => {
    return api.onSkillProgress((event: OnboardingProgressEvent) => {
      if ('kind' in event && event.kind === 'done') {
        onStatusChange(event.status)
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
  }, [api, onStatusChange])

  const setSelected = useCallback(
    (id: OnboardingComponentId, selected: boolean) =>
      setSelections((prev) => ({ ...prev, [id]: selected })),
    [],
  )

  const rows = useMemo<Record<OnboardingComponentId, InstallerRowSnapshot>>(() => {
    return Object.fromEntries(
      SKILL_INSTALLER_IDS.map((id) => [
        id,
        {
          status: status[id],
          progress: progress[id].progress,
          progressDetail: progress[id].detail,
          selected: selections[id],
        },
      ]),
    ) as Record<OnboardingComponentId, InstallerRowSnapshot>
  }, [status, progress, selections])

  const anySelected = SKILL_INSTALLER_IDS.some((id) => selections[id])

  const handleInstall = useCallback(async () => {
    if (installing || !anySelected) return
    setInstalling(true)
    dispatchProgress({ kind: 'reset' })
    try {
      const next = await api.installSkills(selections)
      onStatusChange(next)
    } finally {
      setInstalling(false)
    }
  }, [api, installing, anySelected, selections, onStatusChange])

  return (
    <section>
      <header className="mb-4 mt-2">
        <h2 className="text-[15px] font-semibold">Skills</h2>
        <p className="mt-1 text-[12px] leading-snug text-[var(--surface-toolbar-foreground)] opacity-70">
          Install or re-check the integrations that let Claude Code drive Telescope.
        </p>
      </header>

      {!status.claudeDirExists ? (
        <div className="mb-4 rounded-[8px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          {`Claude Code doesn't seem to be installed (~/.claude not found). You can still install the skills; they'll activate once Claude Code is set up.`}
        </div>
      ) : null}

      <SkillInstaller.Root rows={rows} setSelected={setSelected}>
        <SkillInstaller.Row
          id="cli"
          title="Telescope CLI"
          description="Adds the telescope command so agents can interact with the app."
        />
        <SkillInstaller.Row
          id="skill"
          title="Telescope Skill"
          description="Teaches agents how to use the Telescope CLI."
        />
        <SkillInstaller.Row
          id="agentBrowser"
          title="agent-browser"
          description="Telescope uses Vercel's agent-browser to capture and interact with live webpages. You can install it here or at agent-browser.dev."
        />
      </SkillInstaller.Root>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing || !anySelected}
          className="rounded-[6px] bg-emerald-600 px-4 py-[6px] text-[12px] font-medium text-white shadow-sm enabled:hover:bg-emerald-500 disabled:opacity-50"
        >
          {installing ? 'Installing…' : 'Install selected'}
        </button>
      </div>
    </section>
  )
}
