import { ipcMain } from 'electron'
import type {
  OnboardingComponentId,
  OnboardingProgressEvent,
  OnboardingStatusSnapshot,
} from '../../shared/types'
import { isDark } from '../runtime/preferences'
import { loadOnboardingState, saveOnboardingState } from '../runtime/preferences'
import { getOnboardingStatus } from '../onboarding-status'
import { installCli } from '../cli-install'
import { installSkill } from '../skill-install'
import { installAgentBrowser } from '../agent-browser-install'
import { recordInstalledSkillHash } from '../skill-auto-update'
import { refreshAppMenu } from '../runtime/app-menu'
import {
  closeAndResolve,
  getOnboardingMode,
  getOnboardingWebContents,
} from '../onboarding-window'

function broadcast(event: OnboardingProgressEvent): void {
  const wc = getOnboardingWebContents()
  if (!wc || wc.isDestroyed()) return
  wc.send('onboarding:progress', event)
}

async function runInstall(
  component: OnboardingComponentId,
  selected: boolean,
  run: () => Promise<{ success: boolean; message: string }> | { success: boolean; message: string },
): Promise<void> {
  if (!selected) return
  broadcast({ component, state: 'installing' })
  try {
    const result = await run()
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
}

export function registerOnboardingIpc(): void {
  ipcMain.handle('onboarding:get-initial-data', async () => ({
    theme: { isDark: isDark() },
    status: await getOnboardingStatus(),
    mode: getOnboardingMode(),
  }))

  ipcMain.handle('onboarding:refresh-status', async (): Promise<OnboardingStatusSnapshot> => {
    return await getOnboardingStatus()
  })

  ipcMain.handle(
    'onboarding:install',
    async (
      _event,
      selections: Record<OnboardingComponentId, boolean>,
    ): Promise<OnboardingStatusSnapshot> => {
      await runInstall('cli', selections.cli, () => installCli())
      await runInstall('skill', selections.skill, () => {
        const result = installSkill('specular')
        if (result.success) recordInstalledSkillHash('specular')
        return result
      })
      await runInstall('agentBrowser', selections.agentBrowser, async () => {
        const result = await installAgentBrowser()
        if (result.success) recordInstalledSkillHash('agent-browser')
        return result
      })
      const status = await getOnboardingStatus()
      broadcast({ kind: 'done', status })
      refreshAppMenu()
      return status
    },
  )

  ipcMain.on('onboarding:complete', () => {
    const prev = loadOnboardingState()
    saveOnboardingState({ ...prev, completed: true, completedAt: Date.now() })
    closeAndResolve('complete')
    refreshAppMenu()
  })

  ipcMain.on('onboarding:dismiss', () => {
    const prev = loadOnboardingState()
    saveOnboardingState({ ...prev, dismissedAt: Date.now() })
    closeAndResolve('dismiss')
    refreshAppMenu()
  })
}
