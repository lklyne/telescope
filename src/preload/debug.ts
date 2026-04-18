import { contextBridge, ipcRenderer } from 'electron'
import type {
  CursorMotionParams,
  DebugElectronAPI,
  NarrationDebugEntry,
  ThemeData,
} from '../shared/types'

const api: DebugElectronAPI = {
  getInitialData: () => ipcRenderer.invoke('debug:get-initial-data'),
  updateCursorMotion: (params) =>
    ipcRenderer.send('debug:update-cursor-motion', params),
  resetCursorMotion: () => ipcRenderer.send('debug:reset-cursor-motion'),
  onCursorMotionChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, params: CursorMotionParams) =>
      callback(params)
    ipcRenderer.on('cursor-motion-changed', handler)
    return () => ipcRenderer.removeListener('cursor-motion-changed', handler)
  },
  updateCursorSplineViz: (on) =>
    ipcRenderer.send('debug:update-cursor-spline-viz', on),
  onCursorSplineVizChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, on: boolean) => callback(on)
    ipcRenderer.on('cursor-spline-viz-changed', handler)
    return () =>
      ipcRenderer.removeListener('cursor-spline-viz-changed', handler)
  },
  updateNarrationTuning: (params) =>
    ipcRenderer.send('debug:update-narration-tuning', params),
  resetNarrationTuning: () =>
    ipcRenderer.send('debug:reset-narration-tuning'),
  onNarrationTimelineAppend: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: NarrationDebugEntry) =>
      callback(entry)
    ipcRenderer.on('narration-timeline-append', handler)
    return () =>
      ipcRenderer.removeListener('narration-timeline-append', handler)
  },
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ThemeData) =>
      callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
