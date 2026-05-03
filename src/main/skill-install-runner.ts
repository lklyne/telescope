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

export type ProgressBroadcaster = (event: OnboardingProgressEvent) => void

async function runOne(
  component: OnboardingComponentId,
  selected: boolean,
  broadcast: ProgressBroadcaster,
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

export async function runSkillInstallSelections(
  selections: Record<OnboardingComponentId, boolean>,
  broadcast: ProgressBroadcaster,
): Promise<OnboardingStatusSnapshot> {
  await runOne('cli', selections.cli, broadcast, () => installCli())
  await runOne('skill', selections.skill, broadcast, () => {
    const result = installSkill('specular')
    if (result.success) recordInstalledSkillHash('specular')
    return result
  })
  await runOne('agentBrowser', selections.agentBrowser, broadcast, async () => {
    const result = await installAgentBrowser()
    if (result.success) recordInstalledSkillHash('agent-browser')
    return result
  })
  const status = await getOnboardingStatus()
  broadcast({ kind: 'done', status })
  return status
}

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
