import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { resolveAgentBrowserPath } from './shared/browse-handler'
import { getSkillStatus, installSkill, type SkillStatus } from './skill-install'

const VERSION_TIMEOUT_MS = 4000

function bundledAgentBrowserPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin', 'agent-browser')
    : join(process.cwd(), 'resources', 'bin', 'agent-browser')
}

function findAgentBrowserOnPath(skip: string): string | null {
  const dirs = (process.env.PATH ?? '').split(':')
  for (const dir of dirs) {
    if (!dir) continue
    const candidate = join(dir, 'agent-browser')
    if (candidate === skip) continue
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function bundledAgentBrowserExists(): boolean {
  return existsSync(bundledAgentBrowserPath())
}

/**
 * Set AGENT_BROWSER_PATH so the existing resolver picks up the bundled binary
 * without requiring the user to symlink it into /usr/local/bin.
 */
export function configureBundledAgentBrowser(): void {
  if (process.env.AGENT_BROWSER_PATH) return
  const bundled = bundledAgentBrowserPath()
  if (existsSync(bundled)) {
    process.env.AGENT_BROWSER_PATH = bundled
  }
}

function runVersion(binary: string): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, error: `Timed out running ${binary} --version` })
    }, VERSION_TIMEOUT_MS)
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, error: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ ok: true, version: stdout.trim() || stderr.trim() || 'unknown' })
      } else {
        resolve({
          ok: false,
          error: stderr.trim() || `agent-browser --version exited ${code ?? '?'}`,
        })
      }
    })
  })
}

export interface AgentBrowserStatus {
  binary:
    | { kind: 'installed'; path: string; version: string }
    | { kind: 'missing' }
    | { kind: 'blocked'; detail: string }
  skill: SkillStatus
  userInstall?: { path: string; version: string }
}

async function detectUserInstall(activePath: string): Promise<
  { path: string; version: string } | undefined
> {
  const candidate = findAgentBrowserOnPath(activePath)
  if (!candidate) return undefined
  const result = await runVersion(candidate)
  if (!result.ok) return undefined
  return { path: candidate, version: result.version }
}

export async function getAgentBrowserStatus(): Promise<AgentBrowserStatus> {
  const skill = getSkillStatus('agent-browser')
  const path = resolveAgentBrowserPath()
  let active: AgentBrowserStatus['binary']
  let userInstall: { path: string; version: string } | undefined
  if (path === 'agent-browser' && !process.env.AGENT_BROWSER_PATH) {
    const result = await runVersion('agent-browser')
    if (result.ok) {
      active = { kind: 'installed', path: 'agent-browser', version: result.version }
    } else {
      active = { kind: 'missing' }
    }
  } else if (!existsSync(path)) {
    active = { kind: 'missing' }
  } else {
    const result = await runVersion(path)
    if (result.ok) {
      active = { kind: 'installed', path, version: result.version }
    } else {
      active = { kind: 'blocked', detail: result.error }
    }
  }
  if (active.kind === 'installed') {
    userInstall = await detectUserInstall(active.path)
  }
  return { binary: active, skill, userInstall }
}

export interface AgentBrowserInstallResult {
  success: boolean
  message: string
}

export async function installAgentBrowser(): Promise<AgentBrowserInstallResult> {
  if (!bundledAgentBrowserExists()) {
    return {
      success: false,
      message: `Bundled agent-browser binary missing at ${bundledAgentBrowserPath()}`,
    }
  }
  configureBundledAgentBrowser()
  const existingSkill = getSkillStatus('agent-browser')
  if (existingSkill.kind === 'missing') {
    const skillResult = installSkill('agent-browser')
    if (!skillResult.success) return skillResult
  }
  const status = await getAgentBrowserStatus()
  if (status.binary.kind !== 'installed') {
    const detail =
      status.binary.kind === 'blocked' ? status.binary.detail : 'binary missing'
    return { success: false, message: `agent-browser binary check failed: ${detail}` }
  }
  return {
    success: true,
    message: `agent-browser ${status.binary.version} ready; skill installed.`,
  }
}

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
