import { ipcMain } from 'electron'
import { DEFAULT_CURSOR_MOTION, normalizeCursorMotion } from '../../shared/cursor-motion'
import {
  DEFAULT_CURSOR_TUNING,
  normalizeCursorTuning,
} from '../../shared/cursor-tuning'
import type { DebugBootstrapData } from '../../shared/types'
import {
  broadcastCursorMotion,
  broadcastCursorSplineViz,
  getCursorMotion,
  getCursorSplineViz,
  getCursorTuning,
  isDark,
  saveCursorMotion,
  saveCursorSplineViz,
  saveCursorTuning,
} from '../runtime/preferences'

export function registerDebugIpc(): void {
  ipcMain.handle('debug:get-initial-data', async (): Promise<DebugBootstrapData> => ({
    theme: { isDark: isDark() },
    cursorMotion: getCursorMotion(),
    cursorSplineViz: getCursorSplineViz(),
    cursorTuning: getCursorTuning(),
    presenceTimeline: [],
  }))

  ipcMain.on('debug:update-cursor-motion', (_event, raw: unknown) => {
    saveCursorMotion(normalizeCursorMotion(raw))
    broadcastCursorMotion()
  })

  ipcMain.on('debug:reset-cursor-motion', () => {
    saveCursorMotion(DEFAULT_CURSOR_MOTION)
    broadcastCursorMotion()
  })

  ipcMain.on('debug:update-cursor-spline-viz', (_event, on: unknown) => {
    saveCursorSplineViz(on === true)
    broadcastCursorSplineViz()
  })

  ipcMain.on('debug:update-cursor-tuning', (_event, raw: unknown) => {
    saveCursorTuning(normalizeCursorTuning(raw))
  })

  ipcMain.on('debug:reset-cursor-tuning', () => {
    saveCursorTuning(DEFAULT_CURSOR_TUNING)
  })
}
