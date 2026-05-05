import { app } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'fs'

export type SkillId = 'specular' | 'agent-browser'

const SKILL_FILENAME = 'SKILL.md'

function bundledSkillDir(skillId: SkillId): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'skills', skillId)
    : join(process.cwd(), 'resources', 'skills', skillId)
}

function bundledSkillPath(skillId: SkillId): string {
  return join(bundledSkillDir(skillId), SKILL_FILENAME)
}

export function claudeSkillsDir(): string {
  return join(homedir(), '.claude', 'skills')
}

export function installedSkillDir(skillId: SkillId): string {
  return join(claudeSkillsDir(), skillId)
}

export function installedSkillPath(skillId: SkillId): string {
  return join(installedSkillDir(skillId), SKILL_FILENAME)
}

export function claudeDirExists(): boolean {
  return existsSync(join(homedir(), '.claude'))
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function bundledSkillHash(skillId: SkillId): string | null {
  const data = readFileOrNull(bundledSkillPath(skillId))
  return data ? sha256(data) : null
}

export function installedSkillHash(skillId: SkillId): string | null {
  const data = readFileOrNull(installedSkillPath(skillId))
  return data ? sha256(data) : null
}

function readFileOrNull(path: string): Buffer | null {
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}

export type SkillStatus =
  | { kind: 'installed' }
  | { kind: 'outdated'; detail: string }
  | { kind: 'missing' }
  | { kind: 'blocked'; detail: string }

export function getSkillStatus(skillId: SkillId): SkillStatus {
  const bundled = readFileOrNull(bundledSkillPath(skillId))
  if (!bundled) {
    return {
      kind: 'blocked',
      detail: `Bundled skill source missing at ${bundledSkillPath(skillId)}`,
    }
  }
  const installed = readFileOrNull(installedSkillPath(skillId))
  if (!installed) return { kind: 'missing' }
  if (skillId === 'agent-browser') return { kind: 'installed' }
  if (sha256(bundled) === sha256(installed)) return { kind: 'installed' }
  return { kind: 'outdated', detail: 'Installed skill differs from bundled version.' }
}

export interface SkillInstallResult {
  success: boolean
  message: string
}

export function installSkill(skillId: SkillId): SkillInstallResult {
  const srcDir = bundledSkillDir(skillId)
  const srcFile = bundledSkillPath(skillId)
  if (!existsSync(srcFile)) {
    return { success: false, message: `Bundled skill source missing at ${srcFile}` }
  }
  try {
    cpSync(srcDir, installedSkillDir(skillId), { recursive: true })
    return {
      success: true,
      message: `${skillId} skill installed at ${installedSkillPath(skillId)}.`,
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to install ${skillId} skill: ${(error as Error).message}`,
    }
  }
}

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
