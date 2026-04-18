import { ipcMain } from 'electron'
import type { CursorMotionParams, DebugBootstrapData } from '../../shared/types'
import {
  DEFAULT_CURSOR_MOTION,
  normalizeCursorMotion,
} from '../../shared/cursor-motion'
import {
  DEFAULT_NARRATION_TUNING,
  normalizeNarrationTuning,
} from '../../shared/narration-tuning'
import {
  broadcastCursorMotion,
  broadcastCursorSplineViz,
  getCursorMotion,
  getCursorSplineViz,
  getNarrationTuning,
  isDark,
  saveCursorMotion,
  saveCursorSplineViz,
  saveNarrationTuning,
} from '../runtime/preferences'
import { setNarrationTuning, setSplineVizEnabled } from '../narration/director'
import {
  snapshotDebugTimeline,
  subscribeDebugTimeline,
} from '../narration/debug-timeline'
import { getDebugWebContents } from '../debug-window'

export function registerDebugIpc(): void {
  ipcMain.handle('debug:get-initial-data', async (): Promise<DebugBootstrapData> => ({
    theme: { isDark: isDark() },
    cursorMotion: getCursorMotion(),
    cursorSplineViz: getCursorSplineViz(),
    narrationTuning: getNarrationTuning(),
    narrationTimeline: snapshotDebugTimeline(),
  }))

  subscribeDebugTimeline((entry) => {
    const wc = getDebugWebContents()
    if (wc && !wc.isDestroyed()) {
      wc.send('narration-timeline-append', entry)
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

  ipcMain.on('debug:update-narration-tuning', (_event, raw: unknown) => {
    const next = normalizeNarrationTuning(raw)
    saveNarrationTuning(next)
    setNarrationTuning(next)
  })

  ipcMain.on('debug:reset-narration-tuning', () => {
    saveNarrationTuning(DEFAULT_NARRATION_TUNING)
    setNarrationTuning(DEFAULT_NARRATION_TUNING)
  })
}
