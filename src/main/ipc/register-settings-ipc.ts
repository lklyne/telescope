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
  isDark,
  setFixConfig,
} from '../runtime/preferences'
import { listRepos, removeBindingByOrigin } from '../runtime/dev-server-manager'
import { getOnboardingStatus } from '../onboarding-status'
import {
  runComponentToggle,
  runSkillInstallSelections,
} from '../skill-install-runner'
import { refreshAppMenu } from '../runtime/app-menu'
import { notifyDevtoolsPanelData } from '../runtime/inspect-session'
import {
  closeSettingsWindow,
  getSettingsWebContents,
} from '../settings-window'

function sendToSettings(channel: string, payload: unknown): void {
  const wc = getSettingsWebContents()
  if (!wc || wc.isDestroyed()) return
  wc.send(channel, payload)
}

function broadcastProgress(event: OnboardingProgressEvent): void {
  sendToSettings('settings:skill-progress', event)
}

function broadcastFixConfig(): void {
  sendToSettings('settings:fix-config-changed', getFixConfig())
}

export function registerSettingsIpc(): void {
  ipcMain.handle(
    'settings:get-initial-data',
    async (): Promise<SettingsBootstrapData> => ({
      theme: { isDark: isDark() },
      status: await getOnboardingStatus(),
      fixConfig: getFixConfig(),
      connectedRepos: listRepos(),
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
      if (removeBindingByOrigin(trimmed)) notifyDevtoolsPanelData()
    },
  )

  ipcMain.on('settings:close', () => {
    closeSettingsWindow()
  })
}
