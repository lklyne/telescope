import { app } from 'electron'
import { join } from 'path'
import {
  chmodSync,
  existsSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'fs'

const SYMLINK_PATH = '/usr/local/bin/telescope'

function getCliWrapperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'telescope-cli.sh')
    : join(process.cwd(), 'resources', 'telescope-cli.sh')
}

export function installCli(): { success: boolean; message: string } {
  const wrapperPath = getCliWrapperPath()

  if (!existsSync(wrapperPath)) {
    return { success: false, message: `CLI wrapper not found at ${wrapperPath}` }
  }

  // Ensure the wrapper is executable
  try {
    chmodSync(wrapperPath, 0o755)
  } catch {
    // Best-effort — may fail in read-only app bundles on some systems
  }

  // Check for existing symlink
  try {
    const stat = lstatSync(SYMLINK_PATH)
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(SYMLINK_PATH)
      if (target === wrapperPath) {
        return { success: true, message: "'telescope' command is already installed." }
      }
      // Stale symlink pointing elsewhere — replace it
      unlinkSync(SYMLINK_PATH)
    } else {
      // A real file exists at the path — don't clobber it
      return {
        success: false,
        message: `${SYMLINK_PATH} already exists and is not a symlink. Remove it manually to install.`,
      }
    }
  } catch {
    // lstatSync throws if nothing exists — that's the happy path
  }

  try {
    symlinkSync(wrapperPath, SYMLINK_PATH)
    return { success: true, message: "'telescope' command installed in PATH." }
  } catch (error) {
    return {
      success: false,
      message: `Failed to create symlink: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function uninstallCli(): { success: boolean; message: string } {
  try {
    const stat = lstatSync(SYMLINK_PATH)
    if (!stat.isSymbolicLink()) {
      return { success: false, message: `${SYMLINK_PATH} is not a symlink — not removing.` }
    }
    unlinkSync(SYMLINK_PATH)
    return { success: true, message: "'telescope' command removed from PATH." }
  } catch {
    return { success: true, message: "'telescope' command was not installed." }
  }
}
