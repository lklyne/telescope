import { ipcMain } from 'electron'
import type { CursorMotionParams, DebugBootstrapData } from '../../shared/types'
import {
  DEFAULT_CURSOR_MOTION,
  normalizeCursorMotion,
} from '../../shared/cursor-motion'
import {
  broadcastCursorMotion,
  getCursorMotion,
  isDark,
  saveCursorMotion,
} from '../runtime/preferences'

export function registerDebugIpc(): void {
  ipcMain.handle('debug:get-initial-data', async (): Promise<DebugBootstrapData> => ({
    theme: { isDark: isDark() },
    cursorMotion: getCursorMotion(),
  }))

  ipcMain.on('debug:update-cursor-motion', (_event, raw: unknown) => {
    const next: CursorMotionParams = normalizeCursorMotion(raw)
    saveCursorMotion(next)
    broadcastCursorMotion()
  })

  ipcMain.on('debug:reset-cursor-motion', () => {
    saveCursorMotion(DEFAULT_CURSOR_MOTION)
    broadcastCursorMotion()
  })
}
