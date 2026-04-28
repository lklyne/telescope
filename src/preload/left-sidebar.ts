import { contextBridge, ipcRenderer } from 'electron'
import type {
  CanvasEntityKind,
  LeftSidebarData,
  LeftSidebarElectronAPI,
  ThemeData,
} from '../shared/types'

const api: LeftSidebarElectronAPI = {
  revealFrame: (frameId) => ipcRenderer.send('canvas-reveal-frame', { frameId }),
  revealEntity: (entityId, entityKind) =>
    ipcRenderer.send('canvas-reveal-entity', { entityId, entityKind }),
  deleteEntity: (entityId, entityKind) =>
    ipcRenderer.send('canvas-delete-entity', { entityId, entityKind }),
  revealGroup: (groupId) => ipcRenderer.send('canvas-reveal-group', { groupId }),
  ungroupGroup: (groupId) => ipcRenderer.send('canvas-ungroup-group', { groupId }),
  selectTab: (tabId) => ipcRenderer.send('canvas-select-tab', { tabId }),
  createTab: () => ipcRenderer.send('canvas-create-tab'),
  renameTab: (tabId, name) => ipcRenderer.send('canvas-rename-tab', { tabId, name }),
  renameFrame: (frameId, name) => ipcRenderer.send('canvas-rename-frame', { frameId, name }),
  renameGroup: (groupId, name) => ipcRenderer.send('canvas-rename-group', { groupId, name }),
  renameFileEntity: (entityId, name) =>
    ipcRenderer.send('canvas-rename-file-entity', { entityId, name }),
  renameTextEntity: (entityId, name) =>
    ipcRenderer.send('canvas-rename-text-entity', { entityId, name }),
  renameDrawingEntity: (entityId, name) =>
    ipcRenderer.send('canvas-rename-drawing-entity', { entityId, name }),
  duplicateTab: (tabId) => ipcRenderer.send('canvas-duplicate-tab', { tabId }),
  deleteTab: (tabId) => ipcRenderer.send('canvas-delete-tab', { tabId }),
  reorderTab: (tabId, toIndex) => ipcRenderer.send('canvas-reorder-tab', { tabId, toIndex }),
  deleteFrame: (frameId) => ipcRenderer.send('canvas-delete-frame', { frameId }),
  setTabExpanded: (tabId, expanded) =>
    ipcRenderer.send('canvas-set-tab-expanded', { tabId, expanded }),
  setTextEditing: (active) => ipcRenderer.send('canvas-set-text-editing', { active }),
  toggleBrowserMode: () => ipcRenderer.send('toolbar-toggle-browser-mode'),
  getInitialData: () => ipcRenderer.invoke('get-left-sidebar-bootstrap'),
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ThemeData) => callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },
  onSidebarData: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: LeftSidebarData) => callback(data)
    ipcRenderer.on('left-sidebar-data', handler)
    return () => ipcRenderer.removeListener('left-sidebar-data', handler)
  },
  // --- Project / sectioned sidebar (Phase 3) ---
  listProjects: () => ipcRenderer.invoke('project-list'),
  connectProjectViaPicker: () => ipcRenderer.invoke('project-connect-via-picker'),
  renameProject: (id, label) => ipcRenderer.invoke('project-rename', { id, label }),
  relinkProject: (id) => ipcRenderer.invoke('project-relink', { id }),
  setProjectUrl: (id, url) => ipcRenderer.invoke('project-set-url', { id, url }),
  deleteProject: (id) => ipcRenderer.invoke('project-delete', { id }),
  revealProjectFolder: (id) => ipcRenderer.invoke('project-reveal-folder', { id }),
  revealCodebase: (id) => ipcRenderer.invoke('project-reveal-codebase', { id }),
  createCanvasInProject: (projectId) =>
    ipcRenderer.invoke('project-create-canvas', { projectId }),
  setActiveProject: (id) => ipcRenderer.invoke('project-set-active', { id }),
}

contextBridge.exposeInMainWorld('electronAPI', api)
