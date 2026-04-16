import type {
  OnboardingComponentStatus,
  OnboardingStatusSnapshot,
} from '../shared/types'
import { isCliInstalled } from './cli-install'
import { claudeDirExists, getSkillStatus, type SkillStatus } from './skill-install'
import { getAgentBrowserStatus } from './agent-browser-install'

function cliStatus(): OnboardingComponentStatus {
  const result = isCliInstalled()
  if (!result.installed) return { kind: 'missing' }
  if (result.needsPathUpdate) {
    return {
      kind: 'installed',
      detail: `Installed at ${result.path} — add ~/.local/bin to PATH to invoke.`,
    }
  }
  return { kind: 'installed', detail: `Installed at ${result.path}` }
}

function skillToStatus(status: SkillStatus): OnboardingComponentStatus {
  switch (status.kind) {
    case 'installed':
      return { kind: 'installed' }
    case 'missing':
      return { kind: 'missing' }
    case 'outdated':
      return { kind: 'outdated', detail: status.detail }
    case 'blocked':
      return { kind: 'blocked', detail: status.detail }
  }
}

export async function getOnboardingStatus(): Promise<OnboardingStatusSnapshot> {
  const agent = await getAgentBrowserStatus()
  let agentBrowser: OnboardingComponentStatus
  if (agent.binary.kind === 'installed' && agent.skill.kind === 'installed') {
    agentBrowser = { kind: 'installed', detail: `agent-browser ${agent.binary.version}` }
  } else if (agent.binary.kind === 'blocked') {
    agentBrowser = { kind: 'blocked', detail: agent.binary.detail }
  } else if (agent.skill.kind === 'blocked') {
    agentBrowser = { kind: 'blocked', detail: agent.skill.detail }
  } else if (agent.skill.kind === 'outdated' && agent.binary.kind === 'installed') {
    agentBrowser = { kind: 'outdated', detail: agent.skill.detail }
  } else {
    agentBrowser = { kind: 'missing' }
  }

  return {
    cli: cliStatus(),
    skill: skillToStatus(getSkillStatus('telescope')),
    agentBrowser,
    agentBrowserUserInstall: agent.userInstall,
    claudeDirExists: claudeDirExists(),
  }
}
