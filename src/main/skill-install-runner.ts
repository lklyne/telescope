import type {
  OnboardingComponentId,
  OnboardingProgressEvent,
  OnboardingStatusSnapshot,
} from '../shared/types'
import { getOnboardingStatus } from './onboarding-status'
import { installCli } from './cli-install'
import { installSkill } from './skill-install'
import { installAgentBrowser } from './agent-browser-install'
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
