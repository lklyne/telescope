import { ipcMain } from 'electron'
import type { CursorMotionParams, DebugBootstrapData } from '../../shared/types'
import {
  DEFAULT_CURSOR_MOTION,
  normalizeCursorMotion,
} from '../../shared/cursor-motion'
import {
  broadcastCursorMotion,
  broadcastCursorSplineViz,
  getCursorMotion,
  getCursorSplineViz,
  isDark,
  saveCursorMotion,
  saveCursorSplineViz,
} from '../runtime/preferences'
import { setSplineVizEnabled } from '../narration/director'

export function registerDebugIpc(): void {
  ipcMain.handle('debug:get-initial-data', async (): Promise<DebugBootstrapData> => ({
    theme: { isDark: isDark() },
    cursorMotion: getCursorMotion(),
    cursorSplineViz: getCursorSplineViz(),
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

  ipcMain.on('debug:update-cursor-spline-viz', (_event, on: unknown) => {
    const next = on === true
    saveCursorSplineViz(next)
    setSplineVizEnabled(next)
    broadcastCursorSplineViz()
  })
}
