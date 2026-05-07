import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AnnotationCreateRequest,
  CanvasBgElectronAPI,
  EdgeSide,
  LayoutUpdateData,
  SelectionOverlayPayload,
} from '../shared/types'

function installSelectionOverlayBridge(): void {
  if (location.href !== 'about:blank') return

  const marquee = document.createElement('div')
  marquee.style.position = 'absolute'
  marquee.style.display = 'none'
  marquee.style.pointerEvents = 'none'
  marquee.style.boxSizing = 'border-box'
  document.body.appendChild(marquee)

  const applyOverlayStyle = (variant: SelectionOverlayPayload['variant'] = 'default') => {
    if (variant === 'region-select') {
      marquee.style.border = '1px solid rgba(232, 180, 184, 0.95)'
      marquee.style.background = 'rgba(232, 180, 184, 0.22)'
      return
    }
    marquee.style.border = '1px solid rgba(59, 130, 246, 0.9)'
    marquee.style.background = 'rgba(59, 130, 246, 0.12)'
  }

  ipcRenderer.on(
    'canvas-selection-overlay',
    (
      _event,
      overlay: SelectionOverlayPayload | null,
    ) => {
      if (!overlay) {
        marquee.style.display = 'none'
        return
      }

      applyOverlayStyle(overlay.variant)
      const { rect } = overlay
      marquee.style.display = 'block'
      marquee.style.left = `${rect.left}px`
      marquee.style.top = `${rect.top}px`
      marquee.style.width = `${rect.width}px`
      marquee.style.height = `${rect.height}px`
    },
  )
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', installSelectionOverlayBridge, {
    once: true,
  })
} else {
  installSelectionOverlayBridge()
}

const api: CanvasBgElectronAPI = {
  canvasZoom: (deltaY, mouseX, mouseY) =>
    ipcRenderer.send('canvas-zoom', { deltaY, mouseX, mouseY }),
  canvasPan: (deltaX, deltaY) => ipcRenderer.send('canvas-pan', { deltaX, deltaY }),
  canvasPanTo: (x, y) => ipcRenderer.send('canvas-pan-to', { x, y }),
  setSelectionOverlayRect: (overlay) => ipcRenderer.send('canvas-selection-overlay', overlay),
  onSelectionOverlayChanged: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      overlay: import('../shared/types').SelectionOverlayPayload | null,
    ) => callback(overlay)
    ipcRenderer.on('canvas-selection-overlay', handler)
    return () => ipcRenderer.removeListener('canvas-selection-overlay', handler)
  },
  canvasSelectInRect: (rect, modifiers) =>
    ipcRenderer.send('canvas-select-in-rect', { ...rect, modifiers }),
  canvasSelectInScreenRect: (rect, modifiers) =>
    ipcRenderer.send('canvas-select-in-screen-rect', { ...rect, modifiers }),
  canvasDeselect: (modifiers) => ipcRenderer.send('page-deselect', { modifiers }),
  canvasClickAt: (screenX, screenY, modifiers) =>
    ipcRenderer.send('canvas-click-at', { screenX, screenY, modifiers }),
  clearAnnotateHover: () => ipcRenderer.send('canvas-clear-annotate-hover'),
  selectFrame: (frameId, modifiers) =>
    ipcRenderer.send('canvas-select-frame', { frameId, modifiers }),
  selectBrowserTab: (frameId) => ipcRenderer.send('canvas-select-browser-tab', { frameId }),
  addBrowserFrame: (presetIndex) => ipcRenderer.send('add-browser-frame', presetIndex),
  navigateFrame: (frameId, url) => ipcRenderer.send('canvas-navigate-frame', { frameId, url }),
  goBackFrame: (frameId) => ipcRenderer.send('canvas-back-frame', { frameId }),
  goForwardFrame: (frameId) => ipcRenderer.send('canvas-forward-frame', { frameId }),
  reloadFrame: (frameId) => ipcRenderer.send('canvas-reload-frame', { frameId }),
  setFrameCustom: (frameId) => ipcRenderer.send('canvas-set-frame-custom', { frameId }),
  setBrowserSizeMode: (frameId, mode) => ipcRenderer.send('canvas-set-browser-size-mode', { frameId, mode }),
  updateFrameBounds: (frameId, patch) => ipcRenderer.send('canvas-update-frame-bounds', { frameId, patch }),
  placePendingEntity: (canvasX, canvasY) =>
    ipcRenderer.send('canvas-place-pending-entity', { canvasX, canvasY }),
  cancelPendingPlacement: () => ipcRenderer.send('cancel-pending-placement'),
  clearToolMode: () => ipcRenderer.send('toolbar-clear-tool-mode'),
  startDragFrame: (frameId, selection) =>
    ipcRenderer.send('canvas-drag-frame-start', { frameId, selection }),
  dragFrame: (frameId, dx, dy) => ipcRenderer.send('canvas-drag-frame', { frameId, dx, dy }),
  endDragFrame: () => ipcRenderer.send('canvas-drag-frame-end'),
  dragCopyFrame: (frameId, canvasX, canvasY) =>
    ipcRenderer.send('canvas-drag-copy-frame', { frameId, canvasX, canvasY }),
  setFramePreset: (frameId, index) => ipcRenderer.send('canvas-set-frame-preset', { frameId, index }),
  renameFrame: (frameId, name) => ipcRenderer.send('canvas-rename-frame', { frameId, name }),
  duplicateFrame: (frameId) => ipcRenderer.send('canvas-duplicate-frame', { frameId }),
  toggleLinkedFrame: (frameId) => ipcRenderer.send('canvas-toggle-linked-frame', { frameId }),
  deleteFrame: (frameId) => ipcRenderer.send('canvas-delete-frame', { frameId }),
  showFrameContextMenu: (frameId) => ipcRenderer.send('canvas-show-frame-context-menu', { frameId }),
  dropdownOpen: () => ipcRenderer.send('canvas-bg-dropdown-open'),
  dropdownClose: () => ipcRenderer.send('canvas-bg-dropdown-close'),
  copySelection: () => ipcRenderer.send('canvas-copy-selection'),
  pasteSelection: (canvasX, canvasY) =>
    ipcRenderer.send('canvas-paste-selection', { canvasX, canvasY }),
  deleteSelectedEntities: () => ipcRenderer.send('canvas-delete-selection'),
  tidySelectedEntities: () => ipcRenderer.send('canvas-tidy-selection'),
  createTextEntity: (canvasX: number, canvasY: number, text?: string, color?: string) =>
    ipcRenderer.send('canvas-create-text-entity', { canvasX, canvasY, text, color }),
  updateTextEntity: (id: string, patch: { text?: string; color?: string; width?: number; height?: number; canvasX?: number; canvasY?: number }) =>
    ipcRenderer.send('canvas-update-text-entity', { id, patch }),
  duplicateTextEntity: (id: string) =>
    ipcRenderer.send('canvas-duplicate-text-entity', { id }),
  deleteTextEntity: (id: string) =>
    ipcRenderer.send('canvas-delete-text-entity', { id }),
  updateFileEntity: (id: string, patch: { width?: number; height?: number; canvasX?: number; canvasY?: number }) =>
    ipcRenderer.send('canvas-update-file-entity', { id, patch }),
  deleteFileEntity: (id: string) =>
    ipcRenderer.send('canvas-delete-file-entity', { id }),
  updateDrawingEntity: (id: string, patch: { width?: number; height?: number; canvasX?: number; canvasY?: number }) =>
    ipcRenderer.send('canvas-update-drawing-entity', { id, patch }),
  deleteDrawingEntity: (id: string) =>
    ipcRenderer.send('canvas-delete-drawing-entity', { id }),
  updateShapeEntity: (id, patch) =>
    ipcRenderer.send('canvas-update-shape', { id, patch }),
  deleteShapeEntity: (id) =>
    ipcRenderer.send('canvas-delete-shape', { id }),
  placePendingShape: (canvasX, canvasY, dragRect) =>
    ipcRenderer.send('canvas-place-pending-entity', { canvasX, canvasY, dragRect: dragRect ?? null }),
  onShapeBeginEdit: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { entityId: string },
    ) => callback(data)
    ipcRenderer.on('shape-begin-edit', handler)
    return () => ipcRenderer.removeListener('shape-begin-edit', handler)
  },
  onTextBeginEdit: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { entityId: string },
    ) => callback(data)
    ipcRenderer.on('text-begin-edit', handler)
    return () => ipcRenderer.removeListener('text-begin-edit', handler)
  },
  requestTextEdit: (entityId) =>
    ipcRenderer.send('canvas-request-text-edit', { entityId }),
  requestShapeEdit: (entityId) =>
    ipcRenderer.send('canvas-request-shape-edit', { entityId }),
  showFileInFinder: (filePath: string) =>
    ipcRenderer.send('canvas-show-file-in-finder', { filePath }),
  updateGroupEntity: (id: string, patch: { width?: number; height?: number; canvasX?: number; canvasY?: number; label?: string; color?: string }) =>
    ipcRenderer.send('canvas-update-group-entity', { id, patch }),
  duplicateGroup: (id: string) =>
    ipcRenderer.send('canvas-duplicate-group', { id }),
  deleteGroup: (id: string) =>
    ipcRenderer.send('canvas-delete-group', { id }),
  renameGroup: (groupId: string, name: string) =>
    ipcRenderer.send('canvas-rename-group', { groupId, name }),
  renameFileEntity: (entityId: string, name: string) =>
    ipcRenderer.send('canvas-rename-file-entity', { entityId, name }),
  renameTextEntity: (entityId: string, name: string) =>
    ipcRenderer.send('canvas-rename-text-entity', { entityId, name }),
  renameDrawingEntity: (entityId: string, name: string) =>
    ipcRenderer.send('canvas-rename-drawing-entity', { entityId, name }),
  dropFileBuffer: (buffer: Uint8Array, ext: string, canvasX: number, canvasY: number) =>
    ipcRenderer.send('canvas-drop-file-buffer', { buffer: Buffer.from(buffer), ext, canvasX, canvasY }),
  dropComponentFile: (file: File, canvasX: number, canvasY: number) => {
    const absolutePath = webUtils.getPathForFile(file)
    if (!absolutePath) return
    ipcRenderer.send('canvas-drop-component-path', { absolutePath, canvasX, canvasY })
  },
  selectEntity: (entityId, entityKind, modifiers) =>
    ipcRenderer.send('canvas-select-entity', { entityId, entityKind, modifiers }),
  selectGroup: (groupId: string) =>
    ipcRenderer.send('canvas-select-group', { groupId }),
  enterGroup: (groupId: string) =>
    ipcRenderer.send('canvas-enter-group', { groupId }),
  startDragGroup: (groupId: string) =>
    ipcRenderer.send('canvas-drag-group-start', { groupId }),
  dragGroup: (groupId: string, dx: number, dy: number) =>
    ipcRenderer.send('canvas-drag-group', { groupId, dx, dy }),
  endDragGroup: () => ipcRenderer.send('canvas-drag-group-end'),
  startDragEntity: (entityId: string, selection) =>
    ipcRenderer.send('canvas-drag-entity-start', { entityId, selection }),
  dragEntity: (entityId: string, dx: number, dy: number) =>
    ipcRenderer.send('canvas-drag-entity', { entityId, dx, dy }),
  endDragEntity: () => ipcRenderer.send('canvas-drag-entity-end'),
  commitRegionSelect: (canvasRect) => ipcRenderer.send('canvas-commit-region-select', canvasRect),
  createAnnotation: (request: AnnotationCreateRequest) =>
    ipcRenderer.send('canvas-create-annotation', request),
  createDrawing: (input) =>
    ipcRenderer.send('canvas-create-drawing', input),
  selectEntities: (entityIds: string[]) =>
    ipcRenderer.send('canvas-select-entities', entityIds),
  resizeMultiSelection: (entries) =>
    ipcRenderer.send('canvas-resize-multi-selection', { entries }),
  deleteSelection: () =>
    ipcRenderer.send('canvas-delete-selection'),
  moveAnnotation: (annotationId: string, dx: number, dy: number) =>
    ipcRenderer.send('canvas-move-annotation', { annotationId, dx, dy }),
  addAnnotationReply: (annotationId: string, text: string) =>
    ipcRenderer.send('right-details-panel-reply-annotation', { annotationId, text }),
  resolveAnnotation: (annotationId: string) =>
    ipcRenderer.send('right-details-panel-resolve-annotation', { annotationId }),
  deleteAnnotation: (annotationId: string) =>
    ipcRenderer.send('right-details-panel-delete-annotation', { annotationId }),
  openAnnotationThread: (annotationId: string) =>
    ipcRenderer.send('annotation-open-thread', { annotationId }),
  setCommentOverlayActive: (active: boolean) =>
    ipcRenderer.send('comment-overlay-set-active', active),
  onCaptureMode: (callback: (active: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, active: boolean) => callback(active)
    ipcRenderer.on('capture-mode', handler)
    return () => ipcRenderer.removeListener('capture-mode', handler)
  },
  onAnnotateElementSelected: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('annotate-element-selected', handler)
    return () => ipcRenderer.removeListener('annotate-element-selected', handler)
  },
  onRegionSelectCommitted: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('region-select-committed', handler)
    return () => ipcRenderer.removeListener('region-select-committed', handler)
  },
  createRegionAnnotation: (canvasRect, text) =>
    ipcRenderer.send('canvas-create-region-annotation', { canvasRect, text }),
  onAnnotationThreadOpen: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) =>
      callback(data)
    ipcRenderer.on('annotation-thread-open', handler)
    return () => ipcRenderer.removeListener('annotation-thread-open', handler)
  },
  beginEdgeDrag: (fromEntityId: string, fromSide: EdgeSide) =>
    ipcRenderer.send('canvas-edge-drag-begin', { fromEntityId, fromSide }),
  updateEdgeDragTarget: (targetEntityId: string | null, targetSide: EdgeSide | null) =>
    ipcRenderer.send('canvas-edge-drag-target-change', { targetEntityId, targetSide }),
  commitEdgeDrag: (fromEntityId: string, toEntityId: string, fromSide: EdgeSide, toSide: EdgeSide) =>
    ipcRenderer.send('canvas-edge-drag-commit', { fromEntityId, toEntityId, fromSide, toSide }),
  cancelEdgeDrag: () =>
    ipcRenderer.send('canvas-edge-drag-cancel'),
  commitEdgeEdit: (
    edgeId: string,
    movingEnd: 'from' | 'to',
    targetEntityId: string,
    targetSide: EdgeSide,
  ) =>
    ipcRenderer.send('canvas-edge-edit-commit', { edgeId, movingEnd, targetEntityId, targetSide }),
  discardEdgeEdit: (edgeId: string) =>
    ipcRenderer.send('canvas-edge-edit-discard', { edgeId }),
  createEdge: (fromEntityId: string, toEntityId: string, fromSide?: EdgeSide, toSide?: EdgeSide) =>
    ipcRenderer.send('canvas-create-edge', { fromEntityId, toEntityId, fromSide, toSide }),
  deleteEdge: (edgeId: string) =>
    ipcRenderer.send('canvas-delete-edge', { edgeId }),
  selectEdge: (edgeId: string | null) =>
    ipcRenderer.send('canvas-select-edge', { edgeId }),
  hoverFrame: (frameId: string | null) =>
    ipcRenderer.send('canvas-hover-frame', { frameId }),
  forwardWheelToFrame: (frameId, payload) =>
    ipcRenderer.send('canvas-forward-wheel', { frameId, payload }),
  forwardPointerToFrame: (frameId, payload) =>
    ipcRenderer.send('canvas-forward-pointer', { frameId, payload }),
  onPageCursorChange: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { type: string | null },
    ) => callback(data)
    ipcRenderer.on('aboveview-cursor-update', handler)
    return () => ipcRenderer.removeListener('aboveview-cursor-update', handler)
  },
  setTextEditing: (active: boolean) =>
    ipcRenderer.send('canvas-set-text-editing', { active }),
  readNoteFile: (filePath: string) =>
    ipcRenderer.invoke('read-note-file', { filePath }),
  writeNoteFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('write-note-file', { filePath, content }),
  renameNoteFile: (filePath: string, newName: string) =>
    ipcRenderer.invoke('rename-note-file', { filePath, newName }),
  getInitialData: () => ipcRenderer.invoke('get-canvas-layout-bootstrap'),
  repoConnect: (absolutePath: string) =>
    ipcRenderer.invoke('repo-connect', { absolutePath }),
  onLayoutUpdate: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: LayoutUpdateData) => callback(data)
    ipcRenderer.on('layout-update', handler)
    return () => ipcRenderer.removeListener('layout-update', handler)
  },
  onFixProgressUpdate: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: LayoutUpdateData['fixProgress']) =>
      callback(data)
    ipcRenderer.on('fix-progress-update', handler)
    return () => ipcRenderer.removeListener('fix-progress-update', handler)
  },
  onThemeChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { isDark: boolean }) =>
      callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
