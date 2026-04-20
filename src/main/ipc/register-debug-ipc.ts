import { ipcMain } from 'electron'
import type { CursorMotionParams, DebugBootstrapData } from '../../shared/types'
import {
  DEFAULT_CURSOR_MOTION,
  normalizeCursorMotion,
} from '../../shared/cursor-motion'
import {
  DEFAULT_CURSOR_TUNING,
  normalizeCursorTuning,
} from '../../shared/cursor-tuning'
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
import { setCursorTuning, setSplineVizEnabled } from '../presence/director'
import {
  snapshotDebugTimeline,
  subscribeDebugTimeline,
} from '../presence/debug-timeline'
import { getDebugWebContents } from '../debug-window'

export function registerDebugIpc(): void {
  ipcMain.handle('debug:get-initial-data', async (): Promise<DebugBootstrapData> => ({
    theme: { isDark: isDark() },
    cursorMotion: getCursorMotion(),
    cursorSplineViz: getCursorSplineViz(),
    cursorTuning: getCursorTuning(),
    presenceTimeline: snapshotDebugTimeline(),
  }))

  subscribeDebugTimeline((entry) => {
    const wc = getDebugWebContents()
    if (wc && !wc.isDestroyed()) {
      wc.send('presence-timeline-append', entry)
    }
  })

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

  ipcMain.on('debug:update-cursor-tuning', (_event, raw: unknown) => {
    const next = normalizeCursorTuning(raw)
    saveCursorTuning(next)
    setCursorTuning(next)
  })

  ipcMain.on('debug:reset-cursor-tuning', () => {
    saveCursorTuning(DEFAULT_CURSOR_TUNING)
    setCursorTuning(DEFAULT_CURSOR_TUNING)
  })
}
