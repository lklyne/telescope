import { contextBridge, ipcRenderer } from 'electron'
import type { DevtoolsResizeHandleElectronAPI } from '../shared/types'

const api: DevtoolsResizeHandleElectronAPI = {
  devtoolsResizeStart: (screenX) => ipcRenderer.send('devtools-resize-start', { screenX }),
  devtoolsResizeMove: (screenX) => ipcRenderer.send('devtools-resize-move', { screenX }),
  devtoolsResizeEnd: () => ipcRenderer.send('devtools-resize-end'),
  getInitialData: () => ipcRenderer.invoke('get-theme-bootstrap'),
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { isDark: boolean }) =>
      callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
