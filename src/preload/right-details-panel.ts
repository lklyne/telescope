import { contextBridge, ipcRenderer } from 'electron'
import type {
  AnnotationCreateRequest,
  DevtoolsPanelData,
  DevtoolsPanelElectronAPI,
  ThemeData,
} from '../shared/types'

const api: DevtoolsPanelElectronAPI = {
  clearToolMode: () => ipcRenderer.send('toolbar-clear-tool-mode'),
  toggleAnnotateMode: () => ipcRenderer.send('toolbar-toggle-annotate'),
  toggleDrawMode: () => ipcRenderer.send('toolbar-toggle-draw'),
  setTextEditing: (active) => ipcRenderer.send('canvas-set-text-editing', { active }),
  selectFrame: (frameId: string) => ipcRenderer.send('right-details-panel-select-frame', { frameId }),
  clearInspectSelection: () => ipcRenderer.send('right-details-panel-clear-inspect-selection'),
  setInspectHoverNode: (frameId: string, nodeId: string | null) =>
    ipcRenderer.send('right-details-panel-hover-node', { frameId, nodeId }),
  setInspectSelectedNode: (frameId: string, nodeId: string | null) =>
    ipcRenderer.send('right-details-panel-select-node', { frameId, nodeId }),
  editComponentProp: (frameId, payload) =>
    ipcRenderer.send('right-details-panel-edit-component-prop', { frameId, ...payload }),
  editComponentToken: (frameId, payload) =>
      ipcRenderer.send('right-details-panel-edit-component-token', { frameId, ...payload }),
  createAnnotation: (request: AnnotationCreateRequest) =>
    ipcRenderer.send('right-details-panel-create-annotation', request),
  resolveAnnotation: (annotationId) =>
    ipcRenderer.send('right-details-panel-resolve-annotation', { annotationId }),
  deleteAnnotation: (annotationId) =>
    ipcRenderer.send('right-details-panel-delete-annotation', { annotationId }),
  openAnnotationThread: (annotationId) =>
    ipcRenderer.send('annotation-open-thread', { annotationId }),
  updateTextEntity: (id: string, patch: { color?: string }) =>
    ipcRenderer.send('canvas-update-text-entity', { id, patch }),
  duplicateTextEntity: (id: string) =>
    ipcRenderer.send('canvas-duplicate-text-entity', { id }),
  deleteTextEntity: (id: string) =>
    ipcRenderer.send('canvas-delete-text-entity', { id }),
  updateFileEntity: (id: string, patch: { objectFit?: string }) =>
    ipcRenderer.send('canvas-update-file-entity', { id, patch }),
  duplicateFileEntity: (id: string) =>
    ipcRenderer.send('canvas-duplicate-file-entity', { id }),
  deleteFileEntity: (id: string) =>
    ipcRenderer.send('canvas-delete-file-entity', { id }),
  setFilePreset: (fileId: string, presetIndex: number) =>
    ipcRenderer.send('right-details-panel-set-file-preset', { fileId, presetIndex }),
  setFileCustom: (fileId: string) =>
    ipcRenderer.send('right-details-panel-set-file-custom', { fileId }),
  setFileDeviceOrientation: (fileId: string, orientation: string) =>
    ipcRenderer.send('right-details-panel-set-file-device-orientation', { fileId, orientation }),
  toggleFileDeviceShell: (fileId: string) =>
    ipcRenderer.send('right-details-panel-toggle-file-device-shell', { fileId }),
  deleteDrawingEntity: (id: string) =>
    ipcRenderer.send('canvas-delete-drawing-entity', { id }),
  updateEdge: (id, patch) =>
    ipcRenderer.send('right-details-panel-update-edge', { id, patch }),
  deleteEdge: (id) =>
    ipcRenderer.send('right-details-panel-delete-edge', { id }),
  setFramePreset: (frameId: string, presetIndex: number) =>
    ipcRenderer.send('right-details-panel-set-frame-preset', { frameId, presetIndex }),
  setFrameCustom: (frameId: string) =>
    ipcRenderer.send('right-details-panel-set-frame-custom', { frameId }),
  setDeviceOrientation: (frameId: string, orientation: string) =>
    ipcRenderer.send('right-details-panel-set-device-orientation', { frameId, orientation }),
  toggleDeviceShell: (frameId: string) =>
    ipcRenderer.send('right-details-panel-toggle-device-shell', { frameId }),
  toggleSvgDeviceShell: (frameId: string) =>
    ipcRenderer.send('right-details-panel-toggle-svg-device-shell', { frameId }),
  navigateFrame: (frameId: string, url: string) =>
    ipcRenderer.send('right-details-panel-navigate-frame', { frameId, url }),
  goBackFrame: (frameId: string) =>
    ipcRenderer.send('right-details-panel-go-back-frame', { frameId }),
  goForwardFrame: (frameId: string) =>
    ipcRenderer.send('right-details-panel-go-forward-frame', { frameId }),
  reloadFrame: (frameId: string) =>
    ipcRenderer.send('right-details-panel-reload-frame', { frameId }),
  duplicateFrame: (frameId: string) =>
    ipcRenderer.send('right-details-panel-duplicate-frame', { frameId }),
  toggleLinkedFrame: (frameId: string) =>
    ipcRenderer.send('right-details-panel-toggle-linked-frame', { frameId }),
  deleteFrame: (frameId: string) =>
    ipcRenderer.send('right-details-panel-delete-frame', { frameId }),
  openBrowserDevTools: () => ipcRenderer.send('right-details-panel-open-browser-devtools'),
  closeBrowserDevTools: () => ipcRenderer.send('right-details-panel-dismiss-browser-devtools'),
  getInitialData: () => ipcRenderer.invoke('get-theme-bootstrap'),
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ThemeData) => callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },
  onPanelData: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DevtoolsPanelData) => callback(data)
    ipcRenderer.on('right-details-panel-data', handler)
    return () => ipcRenderer.removeListener('right-details-panel-data', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
