import { ipcMain } from 'electron'
import type {
  OnboardingComponentId,
  OnboardingProgressEvent,
  OnboardingStatusSnapshot,
} from '../../shared/types'
import { isDark } from '../runtime/preferences'
import { loadOnboardingState, saveOnboardingState } from '../runtime/preferences'
import { getOnboardingStatus } from '../onboarding-status'
import { runSkillInstallSelections } from '../skill-install-runner'
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
      const status = await runSkillInstallSelections(selections, broadcast)
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
