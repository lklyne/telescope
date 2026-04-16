import { app } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'fs'

const PRIMARY_SYMLINK_PATH = '/usr/local/bin/telescope'

function userLocalBinDir(): string {
  return join(homedir(), '.local', 'bin')
}

function userLocalSymlinkPath(): string {
  return join(userLocalBinDir(), 'telescope')
}

function getCliWrapperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'telescope-cli.sh')
    : join(process.cwd(), 'resources', 'telescope-cli.sh')
}

function readSymlinkTarget(path: string): string | null {
  try {
    const stat = lstatSync(path)
    if (!stat.isSymbolicLink()) return null
    return readlinkSync(path)
  } catch {
    return null
  }
}

function createSymlink(
  linkPath: string,
  target: string,
): { success: true } | { success: false; error: NodeJS.ErrnoException } {
  try {
    const existingTarget = readSymlinkTarget(linkPath)
    if (existingTarget === target) {
      return { success: true }
    }
    if (existingTarget !== null) {
      unlinkSync(linkPath)
    } else if (existsSync(linkPath)) {
      return {
        success: false,
        error: Object.assign(new Error(`${linkPath} exists and is not a symlink`), {
          code: 'EEXIST',
        }) as NodeJS.ErrnoException,
      }
    }
    symlinkSync(target, linkPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error as NodeJS.ErrnoException }
  }
}

export interface CliInstallResult {
  success: boolean
  message: string
  installedPath?: string
  needsPathUpdate?: boolean
}

export function isCliInstalled(): {
  installed: boolean
  path?: string
  needsPathUpdate?: boolean
} {
  const wrapperPath = getCliWrapperPath()
  for (const candidate of [PRIMARY_SYMLINK_PATH, userLocalSymlinkPath()]) {
    if (readSymlinkTarget(candidate) === wrapperPath) {
      return {
        installed: true,
        path: candidate,
        needsPathUpdate:
          candidate === userLocalSymlinkPath() && !pathContains(userLocalBinDir()),
      }
    }
  }
  return { installed: false }
}

function pathContains(dir: string): boolean {
  const parts = (process.env.PATH ?? '').split(':')
  return parts.includes(dir)
}

export function installCli(): CliInstallResult {
  const wrapperPath = getCliWrapperPath()

  if (!existsSync(wrapperPath)) {
    return { success: false, message: `CLI wrapper not found at ${wrapperPath}` }
  }

  try {
    chmodSync(wrapperPath, 0o755)
  } catch {
    // Best-effort — may fail in read-only app bundles on some systems
  }

  const primary = createSymlink(PRIMARY_SYMLINK_PATH, wrapperPath)
  if (primary.success) {
    return {
      success: true,
      message: "'telescope' command installed in /usr/local/bin.",
      installedPath: PRIMARY_SYMLINK_PATH,
    }
  }

  const code = primary.error.code
  if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EROFS') {
    return { success: false, message: `Failed to install CLI: ${primary.error.message}` }
  }

  try {
    mkdirSync(userLocalBinDir(), { recursive: true })
  } catch (error) {
    return {
      success: false,
      message: `Failed to create ${userLocalBinDir()}: ${(error as Error).message}`,
    }
  }

  const fallback = createSymlink(userLocalSymlinkPath(), wrapperPath)
  if (!fallback.success) {
    return {
      success: false,
      message: `Failed to install CLI at ${userLocalSymlinkPath()}: ${fallback.error.message}`,
    }
  }

  const needsPathUpdate = !pathContains(userLocalBinDir())
  return {
    success: true,
    message: needsPathUpdate
      ? `'telescope' installed at ${userLocalSymlinkPath()}. Add ~/.local/bin to your PATH to use it.`
      : `'telescope' installed at ${userLocalSymlinkPath()}.`,
    installedPath: userLocalSymlinkPath(),
    needsPathUpdate,
  }
}

export function uninstallCli(): { success: boolean; message: string } {
  const paths = [PRIMARY_SYMLINK_PATH, userLocalSymlinkPath()]
  let removed = false
  for (const path of paths) {
    if (readSymlinkTarget(path) !== null) {
      try {
        unlinkSync(path)
        removed = true
      } catch (error) {
        return {
          success: false,
          message: `Failed to remove ${path}: ${(error as Error).message}`,
        }
      }
    }
  }
  return {
    success: true,
    message: removed
      ? "'telescope' command removed from PATH."
      : "'telescope' command was not installed.",
  }
}
