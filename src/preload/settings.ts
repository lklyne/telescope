import { contextBridge, ipcRenderer } from 'electron'
import type {
  FixConfig,
  OriginBindings,
  SettingsElectronAPI,
} from '../shared/types'

const api: SettingsElectronAPI = {
  getInitialData: () => ipcRenderer.invoke('settings:get-initial-data'),
  refreshStatus: () => ipcRenderer.invoke('settings:refresh-status'),
  installSkills: (selections) => ipcRenderer.invoke('settings:install-skills', selections),
  setComponentInstalled: (component, installed) =>
    ipcRenderer.invoke('settings:set-component-installed', { component, installed }),
  setFixConfig: (config) => ipcRenderer.send('settings:set-fix-config', config),
  removeOriginBinding: (origin) => ipcRenderer.send('settings:remove-origin-binding', origin),
  close: () => ipcRenderer.send('settings:close'),
  onSkillProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      callback(payload as Parameters<typeof callback>[0])
    }
    ipcRenderer.on('settings:skill-progress', handler)
    return () => ipcRenderer.removeListener('settings:skill-progress', handler)
  },
  onOriginBindingsChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: OriginBindings) =>
      callback(payload)
    ipcRenderer.on('settings:origin-bindings-changed', handler)
    return () => ipcRenderer.removeListener('settings:origin-bindings-changed', handler)
  },
  onFixConfigChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: FixConfig) =>
      callback(payload)
    ipcRenderer.on('settings:fix-config-changed', handler)
    return () => ipcRenderer.removeListener('settings:fix-config-changed', handler)
  },
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { isDark: boolean }) =>
      callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
