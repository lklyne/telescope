# Skills Pane: Toggle as Install State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Settings → Skills pane, make each row's toggle reflect actual install state. Flipping a toggle on installs immediately; flipping off uninstalls (CLI + Skill). agent-browser is not removable from the app for now (toggle still reflects state but can't be turned off).

**Architecture:** Add `uninstallSkill` and a no-op-friendly `uninstallAgentBrowser` (returns "not supported"). Add a single `settings:set-component-installed` IPC handler that installs or uninstalls one component on demand and broadcasts progress on the existing channel. Replace the SkillsPane's batch-install UI with per-row toggles wired to that IPC. Leave the onboarding window's batch-install flow untouched — it still uses the shared `SkillInstaller` component as a multi-select form.

**Tech Stack:** Electron main + preload + React renderer (TypeScript). Base UI Switch.

**Out of scope:** changing onboarding window UX; building real `npm uninstall -g` for agent-browser; uninstall confirm dialogs (toggle off is direct — user can re-install if they regret it).

---

## File Map

**Modify:**
- `src/main/skill-install.ts` — add `uninstallSkill(skillId)`
- `src/main/agent-browser-install.ts` — add `uninstallAgentBrowser()` returning a "not supported in-app" failure
- `src/main/skill-install-runner.ts` — add `runComponentToggle(component, installed, broadcast)` that dispatches install vs uninstall per component
- `src/main/ipc/register-settings-ipc.ts` — register `settings:set-component-installed`
- `src/preload/settings.ts` — expose `setComponentInstalled`
- `src/shared/types.ts` — add `setComponentInstalled` to `SettingsElectronAPI`
- `src/renderer/settings/SkillsPane.tsx` — rewrite UI: per-row toggle drives install/uninstall, drop "Install selected" button, drop the "Installed" badge

**Untouched (verify still works):**
- `src/renderer/onboarding/App.tsx` — still uses shared `SkillInstaller` in batch mode
- `src/renderer/shared/SkillInstaller.tsx` — unchanged (used by onboarding)

---

## Task 1: Add `uninstallSkill` in main

**Files:**
- Modify: `src/main/skill-install.ts` (append after `installSkill`)

- [ ] **Step 1: Add `uninstallSkill` function**

Append to `src/main/skill-install.ts`:

```typescript
export function uninstallSkill(skillId: SkillId): SkillInstallResult {
  const dir = installedSkillDir(skillId)
  if (!existsSync(dir)) {
    return { success: true, message: `${skillId} skill was not installed.` }
  }
  try {
    rmSync(dir, { recursive: true, force: true })
    return { success: true, message: `${skillId} skill removed from ${dir}.` }
  } catch (error) {
    return {
      success: false,
      message: `Failed to remove ${skillId} skill: ${(error as Error).message}`,
    }
  }
}
```

Add `rmSync` to the existing `fs` import at the top of the file:

```typescript
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'fs'
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/skill-install.ts
git commit -m "feat(main): add uninstallSkill"
```

---

## Task 2: Add `uninstallAgentBrowser` stub

**Rationale:** agent-browser may have been installed system-wide (e.g. `npm i -g @vercel/agent-browser`) before the app shipped its bundled binary. Removing it from the app shouldn't touch the user's global tool. For now we surface this as a non-removable component — the function exists so the runner has a uniform shape, but always returns failure with a clear reason. The renderer disables the toggle for this row.

**Files:**
- Modify: `src/main/agent-browser-install.ts` (append after `installAgentBrowser`)

- [ ] **Step 1: Add `uninstallAgentBrowser`**

Append to `src/main/agent-browser-install.ts`:

```typescript
export interface AgentBrowserUninstallResult {
  success: boolean
  message: string
}

export async function uninstallAgentBrowser(): Promise<AgentBrowserUninstallResult> {
  return {
    success: false,
    message:
      'agent-browser cannot be removed from inside Specular. Uninstall it from the system if it was installed globally; otherwise the bundled binary ships with the app.',
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/agent-browser-install.ts
git commit -m "feat(main): add uninstallAgentBrowser stub"
```

---

## Task 3: Add per-component toggle runner

**Files:**
- Modify: `src/main/skill-install-runner.ts`

- [ ] **Step 1: Import the new uninstall functions and add the runner**

At the top of `src/main/skill-install-runner.ts`, update imports:

```typescript
import type {
  OnboardingComponentId,
  OnboardingProgressEvent,
  OnboardingStatusSnapshot,
} from '../shared/types'
import { getOnboardingStatus } from './onboarding-status'
import { installCli, uninstallCli } from './cli-install'
import { installSkill, uninstallSkill } from './skill-install'
import { installAgentBrowser, uninstallAgentBrowser } from './agent-browser-install'
import { recordInstalledSkillHash } from './skill-auto-update'
```

Append at the end of the file:

```typescript
async function runInstall(
  component: OnboardingComponentId,
): Promise<{ success: boolean; message: string }> {
  switch (component) {
    case 'cli':
      return installCli()
    case 'skill': {
      const result = installSkill('specular')
      if (result.success) recordInstalledSkillHash('specular')
      return result
    }
    case 'agentBrowser': {
      const result = await installAgentBrowser()
      if (result.success) recordInstalledSkillHash('agent-browser')
      return result
    }
  }
}

async function runUninstall(
  component: OnboardingComponentId,
): Promise<{ success: boolean; message: string }> {
  switch (component) {
    case 'cli':
      return uninstallCli()
    case 'skill':
      return uninstallSkill('specular')
    case 'agentBrowser':
      return uninstallAgentBrowser()
  }
}

export async function runComponentToggle(
  component: OnboardingComponentId,
  installed: boolean,
  broadcast: ProgressBroadcaster,
): Promise<OnboardingStatusSnapshot> {
  broadcast({ component, state: 'installing' })
  try {
    const result = installed ? await runInstall(component) : await runUninstall(component)
    if (result.success) {
      broadcast({ component, state: 'success', detail: result.message })
    } else {
      broadcast({ component, state: 'error', detail: result.message })
    }
  } catch (error) {
    broadcast({
      component,
      state: 'error',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
  const status = await getOnboardingStatus()
  broadcast({ kind: 'done', status })
  return status
}
```

Note the `broadcast({ component, state: 'installing' })` is reused for both directions; the renderer interprets it as "in flight." That's deliberate — keeps the existing progress event union unchanged.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/skill-install-runner.ts
git commit -m "feat(main): add runComponentToggle for per-row install/uninstall"
```

---

## Task 4: IPC handler

**Files:**
- Modify: `src/main/ipc/register-settings-ipc.ts`

- [ ] **Step 1: Update imports**

Replace the existing import line:

```typescript
import { runSkillInstallSelections } from '../skill-install-runner'
```

with:

```typescript
import {
  runComponentToggle,
  runSkillInstallSelections,
} from '../skill-install-runner'
```

- [ ] **Step 2: Register the new handler**

Inside `registerSettingsIpc()`, after the existing `'settings:install-skills'` handler block, add:

```typescript
  ipcMain.handle(
    'settings:set-component-installed',
    async (
      _event,
      payload: { component: OnboardingComponentId; installed: boolean },
    ): Promise<OnboardingStatusSnapshot> => {
      const status = await runComponentToggle(
        payload.component,
        payload.installed,
        broadcastProgress,
      )
      refreshAppMenu()
      return status
    },
  )
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/register-settings-ipc.ts
git commit -m "feat(ipc): add settings:set-component-installed handler"
```

---

## Task 5: Preload bridge + types

**Files:**
- Modify: `src/shared/types.ts` (the `SettingsElectronAPI` interface around line 612)
- Modify: `src/preload/settings.ts`

- [ ] **Step 1: Extend `SettingsElectronAPI`**

In `src/shared/types.ts`, add a new method to `SettingsElectronAPI` right under `installSkills`:

```typescript
  setComponentInstalled: (
    component: OnboardingComponentId,
    installed: boolean,
  ) => Promise<OnboardingStatusSnapshot>
```

- [ ] **Step 2: Implement it in the preload bridge**

In `src/preload/settings.ts`, add to the `api` object right under `installSkills`:

```typescript
  setComponentInstalled: (component, installed) =>
    ipcRenderer.invoke('settings:set-component-installed', { component, installed }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: passes (the renderer doesn't yet call the new method; that happens in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/preload/settings.ts
git commit -m "feat(preload): expose setComponentInstalled"
```

---

## Task 6: Rewrite SkillsPane to use per-row toggles

**Behavior summary:**
- Each row shows: title, description, status detail (path, version, error), a toggle.
- Toggle initial state mirrors `status[id].kind === 'installed'`.
- Flipping the toggle calls `setComponentInstalled` immediately; the toggle is disabled while a request is in flight; the row shows a small spinner; on completion the toggle reflects the returned `OnboardingStatusSnapshot`.
- The agentBrowser toggle is disabled when `status.agentBrowser.kind === 'installed'` (we can't uninstall it). Hover/title text explains why.
- Drop the "Installed" badge — the toggle position is the source of truth. Keep the small status detail line under the description (path, version, error message).
- Drop the "Install selected" button entirely.

**Files:**
- Modify: `src/renderer/settings/SkillsPane.tsx` (full rewrite)

- [ ] **Step 1: Replace the file with the new implementation**

Replace the entire contents of `src/renderer/settings/SkillsPane.tsx` with:

```tsx
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

          return (
            <div
              key={row.id}
              className="flex items-start gap-3 rounded-[8px] border border-[var(--surface-popover-border)] bg-[var(--surface-popover-subtle)] px-4 py-3"
            >
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
              <div className="pt-[2px]" title={title}>
                <Switch.Root
                  disabled={disabled}
                  checked={installed}
                  onCheckedChange={(checked) => handleToggle(row.id, checked)}
                  className="relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full border border-[var(--surface-popover-border)] bg-[var(--surface-input)] transition-colors data-[checked]:border-transparent data-[checked]:bg-emerald-500 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                >
                  <Switch.Thumb className="block h-[14px] w-[14px] translate-x-[1px] rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-[15px]" />
                </Switch.Root>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/settings/SkillsPane.tsx
git commit -m "feat(settings): make Skills toggles install/uninstall on flip"
```

---

## Task 7: Manual verification

The renderer is hard to unit-test and the install/uninstall paths touch real disk and PATH. Verify by hand.

- [ ] **Step 1: Start the dev app**

Run: `pnpm dev`
Open: Settings (the one that includes the Skills pane).

- [ ] **Step 2: Verify the Skills pane initial state**

Each row shows a toggle. The position matches install state: rows for components already installed are ON, missing components are OFF. There is no "Installed" badge and no "Install selected" button.

- [ ] **Step 3: Install via toggle**

Toggle "Specular CLI" off → on if currently off, or off → on after first toggling it off.
Expected: spinner appears next to the title, toggle disables briefly, then settles ON. Detail line shows the install path (`Installed at /usr/local/bin/specular` or fallback).

Repeat for "Specular Skill". Expected: settles ON, detail shows installed path under `~/.claude/skills/specular/SKILL.md`.

- [ ] **Step 4: Uninstall via toggle**

Toggle "Specular CLI" off.
Expected: spinner, then toggle settles OFF. Detail line clears (or shows "command was not installed" briefly via the success path — fine either way).
Verify in a terminal: `which specular` returns nothing (or only finds an unrelated copy).

Toggle "Specular Skill" off.
Expected: settles OFF. Verify: `ls ~/.claude/skills/specular` returns "No such file or directory".

- [ ] **Step 5: Verify agent-browser is non-removable when installed**

Hover the agent-browser toggle while it is ON.
Expected: the toggle is disabled, cursor shows not-allowed, tooltip explains it can't be removed from inside Specular.

If agent-browser is OFF, toggling it ON should install (binary or skill, depending on what was missing) and then become disabled in the ON state.

- [ ] **Step 6: Verify the onboarding window still works**

Quit the app. Move `~/.claude/skills/specular/` aside (or just trust that nothing changed in onboarding code). Relaunch with first-run state if practical, or open the onboarding window from the dev menu if available.
Expected: the welcome onboarding still uses the multi-select + "Install" button flow. No regression.

- [ ] **Step 7: Run unit + smoke tests**

Run: `pnpm test:unit`
Expected: passes.

Run: `pnpm test:smoke`
Expected: passes (no smoke test exercises the Skills pane today, but this catches IPC registration / type breakage).

- [ ] **Step 8: Commit anything that needed touching during verification**

If the verification turned up nothing to fix, skip. Otherwise stage the fix and commit with a clear message.

---

## Self-Review Notes

- **Spec coverage:** install-on-toggle (Task 6 + 4), uninstall-on-toggle for CLI + Skill (Tasks 1, 3, 4, 6), agent-browser stays non-removable (Tasks 2 + 6 disabled-toggle branch), drop "Installed" badge and "Install selected" button (Task 6). Status detail (path/version/error) preserved in Task 6.
- **Onboarding regression risk:** the shared `SkillInstaller` component is left untouched; only `SkillsPane` stops importing it. Verified by Step 6.
- **Type consistency:** `setComponentInstalled` signature is `(component: OnboardingComponentId, installed: boolean) => Promise<OnboardingStatusSnapshot>` everywhere it appears (types, preload, IPC payload mapping, renderer caller).
- **No placeholders:** every step shows the actual code or command.
