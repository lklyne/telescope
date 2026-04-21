import { contextBridge, ipcRenderer } from 'electron'
import type {
  CursorMotionParams,
  DebugElectronAPI,
  PresenceDebugEntry,
  ThemeData,
} from '../shared/types'

const api: DebugElectronAPI = {
  getInitialData: () => ipcRenderer.invoke('debug:get-initial-data'),
  updateCursorMotion: (params) =>
    ipcRenderer.send('debug:update-cursor-motion', params),
  resetCursorMotion: () => ipcRenderer.send('debug:reset-cursor-motion'),
  onCursorMotionChanged: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      params: CursorMotionParams,
    ) => callback(params)
    ipcRenderer.on('cursor-motion-changed', handler)
    return () => ipcRenderer.removeListener('cursor-motion-changed', handler)
  },
  updateCursorSplineViz: (on) =>
    ipcRenderer.send('debug:update-cursor-spline-viz', on),
  onCursorSplineVizChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, on: boolean) =>
      callback(on)
    ipcRenderer.on('cursor-spline-viz-changed', handler)
    return () => ipcRenderer.removeListener('cursor-spline-viz-changed', handler)
  },
  updateCursorTuning: (params) =>
    ipcRenderer.send('debug:update-cursor-tuning', params),
  resetCursorTuning: () => ipcRenderer.send('debug:reset-cursor-tuning'),
  onPresenceTimelineAppend: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      entry: PresenceDebugEntry,
    ) => callback(entry)
    ipcRenderer.on('presence-timeline-append', handler)
    return () => ipcRenderer.removeListener('presence-timeline-append', handler)
  },
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ThemeData) =>
      callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
