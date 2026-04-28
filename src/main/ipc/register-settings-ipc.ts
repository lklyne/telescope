import { ipcMain } from 'electron'
import type {
  FixModel,
  FixPermissions,
  OnboardingComponentId,
  OnboardingProgressEvent,
  OnboardingStatusSnapshot,
  SettingsBootstrapData,
} from '../../shared/types'
import {
  getFixConfig,
  getOriginBindings,
  isDark,
  removeOriginBinding,
  setFixConfig,
} from '../runtime/preferences'
import { getOnboardingStatus } from '../onboarding-status'
import { runSkillInstallSelections } from '../skill-install-runner'
import { refreshAppMenu } from '../runtime/app-menu'
import { notifyDevtoolsPanelData } from '../runtime/inspect-session'
import {
  closeSettingsWindow,
  getSettingsWebContents,
} from '../settings-window'

function broadcastProgress(event: OnboardingProgressEvent): void {
  const wc = getSettingsWebContents()
  if (!wc || wc.isDestroyed()) return
  wc.send('settings:skill-progress', event)
}

function broadcastFixConfig(): void {
  const wc = getSettingsWebContents()
  if (!wc || wc.isDestroyed()) return
  wc.send('settings:fix-config-changed', getFixConfig())
}

function broadcastOriginBindings(): void {
  const wc = getSettingsWebContents()
  if (!wc || wc.isDestroyed()) return
  wc.send('settings:origin-bindings-changed', getOriginBindings())
}

export function registerSettingsIpc(): void {
  ipcMain.handle(
    'settings:get-initial-data',
    async (): Promise<SettingsBootstrapData> => ({
      theme: { isDark: isDark() },
      status: await getOnboardingStatus(),
      fixConfig: getFixConfig(),
      originBindings: getOriginBindings(),
    }),
  )

  ipcMain.handle('settings:refresh-status', async (): Promise<OnboardingStatusSnapshot> => {
    return await getOnboardingStatus()
  })

  ipcMain.handle(
    'settings:install-skills',
    async (
      _event,
      selections: Record<OnboardingComponentId, boolean>,
    ): Promise<OnboardingStatusSnapshot> => {
      const status = await runSkillInstallSelections(selections, broadcastProgress)
      refreshAppMenu()
      return status
    },
  )

  ipcMain.on(
    'settings:set-fix-config',
    (_event, payload: { model?: FixModel; permissions?: FixPermissions } | undefined) => {
      if (!payload) return
      setFixConfig(payload)
      broadcastFixConfig()
      notifyDevtoolsPanelData()
    },
  )

  ipcMain.on(
    'settings:remove-origin-binding',
    (_event, origin: unknown) => {
      const trimmed = typeof origin === 'string' ? origin.trim() : ''
      if (!trimmed) return
      removeOriginBinding(trimmed)
      broadcastOriginBindings()
      notifyDevtoolsPanelData()
    },
  )

  ipcMain.on('settings:close', () => {
    closeSettingsWindow()
  })
}
