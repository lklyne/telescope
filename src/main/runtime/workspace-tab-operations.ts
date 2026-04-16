import { randomUUID } from 'crypto'
import { markDirty } from './layout-dirty'
import { fileEntities, updateFileEntity } from './file-entity-state'
import { textEntities, updateTextEntity } from './text-entity-state'
import { drawingEntities, updateDrawingEntity } from './drawing-entity-state'
import { isRenamableNotePath, renameNoteFile } from './note-assets'
import type {
  PersistedWorkspaceTab,
  WorkspaceSnapshot,
} from '../../shared/types'
import {
  getUiState,
  replaceUiState,
  devtoolsPanelTab as uiDevtoolsPanelTab,
  devtoolsWidth as uiDevtoolsWidth,
  setDevtoolsOpen as setUiDevtoolsOpen,
  setBrowserMode as setUiBrowserMode,
  setCanvasMode as setUiCanvasMode,
} from '../ui-state'
import { withSuppressedDocSync } from './workspace-doc'
import {
  scheduleWorkspaceAutosave,
  withWorkspacePersistenceSuspended,
} from './workspace-autosave'
import { requestLayout } from './viewport-control'
import { setZoom, setPan } from './viewport-control'
import {
  activeWorkspaceTabId,
  setActiveWorkspaceTabId,
  workspaceAnnotations,
  workspaceEdges,
  workspaceGroups,
  workspaceTabs,
} from './workspace-model'
import {
  cloneAnnotationsForPersistence,
  cloneWorkspaceSnapshot,
} from './runtime-serialization'
import {
  ensureWorkspaceTabsInitialized,
  syncActiveTabRecord,
  makeEmptyTabSnapshot,
} from './workspace-tabs'
import {
  DEFAULT_TAB_NAME,
  DEFAULT_WORKSPACE_ID,
  deleteCanvasFile,
  makeWorkspaceTabId,
} from './workspace-persistence'
import { app } from 'electron'
import { findPageById } from './runtime-context'
import { destroyActivePages } from './workspace-restore'
import { restoreWorkspaceSnapshot, transitionToTab } from './workspace-restore'
import { clearInspectTargets, syncInspectionState, notifyDevtoolsPanelData } from './inspect-session'
import { sendInteractiveState } from './overlay-manager'

function makePageId(): string {
  return `frame_${randomUUID()}`
}

export function applyTabState(tab: PersistedWorkspaceTab): void {
  withWorkspacePersistenceSuspended(() => {
    replaceUiState({
      ...getUiState(),
      selection: { kind: 'none' },
      toolMode: 'select',
      viewMode:
        tab.snapshot.browserTabMode === 'frame' && tab.snapshot.selectedFrameId
          ? { kind: 'browser', frameId: tab.snapshot.selectedFrameId }
          : { kind: 'canvas' },
      devtools: {
        ...getUiState().devtools,
        open: false,
        activeTab: uiDevtoolsPanelTab(),
        focusedAnnotationId: null,
        width: uiDevtoolsWidth(),
      },
      overlays: {
        commentOverlayVisible: false,
        selectionMarqueeVisible: false,
      },
      pendingPlacement: null,
    })
    workspaceAnnotations.length = 0
    workspaceAnnotations.push(...cloneAnnotationsForPersistence(tab.annotations))
    destroyActivePages()
    workspaceGroups.length = 0
    workspaceEdges.length = 0
    if (tab.snapshot.pages.length || (tab.snapshot.entities && Object.keys(tab.snapshot.entities).length)) {
      restoreWorkspaceSnapshot(tab.snapshot)
    } else {
      setZoom(tab.snapshot.zoom)
      setPan(tab.snapshot.pan.x, tab.snapshot.pan.y)
      setUiDevtoolsOpen(false)
      clearInspectTargets()
      sendInteractiveState()
      syncInspectionState()
      notifyDevtoolsPanelData()
    }
  })
}

export function createWorkspaceTab(name?: string): string {
  ensureWorkspaceTabsInitialized()
  syncActiveTabRecord()
  const now = new Date().toISOString()
  const nextTab: PersistedWorkspaceTab = {
    id: makeWorkspaceTabId(),
    name: name?.trim() || `Canvas ${workspaceTabs.length + 1}`,
    updatedAt: now,
    snapshot: makeEmptyTabSnapshot(),
    annotations: [],
    expanded: true,
  }
  workspaceTabs.push(nextTab)
  setActiveWorkspaceTab(nextTab.id)
  scheduleWorkspaceAutosave()
  return nextTab.id
}

export function renameWorkspaceTab(tabId: string, name: string): boolean {
  const tab = workspaceTabs.find((candidate) => candidate.id === tabId)
  const trimmed = name.trim()
  if (!tab || !trimmed) return false
  // Delete old .canvas file before renaming (next autosave writes the new one)
  const oldName = tab.name
  if (oldName !== trimmed) {
    deleteCanvasFile(app.getPath('userData'), DEFAULT_WORKSPACE_ID, oldName)
  }
  tab.name = trimmed
  tab.updatedAt = new Date().toISOString()
  markDirty('sidebar')
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function renameWorkspaceFrame(frameId: string, name: string): boolean {
  const page = findPageById(frameId)
  const trimmed = name.trim()
  if (!page || !trimmed) return false
  page.name = trimmed
  markDirty('sidebar')
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function renameWorkspaceGroup(groupId: string, name: string): boolean {
  const group = workspaceGroups.find((candidate) => candidate.id === groupId)
  const trimmed = name.trim()
  if (!group || !trimmed) return false
  group.label = trimmed
  markDirty('sidebar')
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function renameWorkspaceFileEntity(entityId: string, name: string): boolean {
  const entity = fileEntities.find((candidate) => candidate.id === entityId)
  const trimmed = name.trim()
  if (!entity || !trimmed) return false
  if (!isRenamableNotePath(entity.file)) return false
  const newPath = renameNoteFile(entity.file, trimmed)
  if (!newPath) return false
  if (newPath === entity.file) return true
  updateFileEntity(entity.id, { file: newPath })
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function renameWorkspaceTextEntity(entityId: string, name: string): boolean {
  const entity = textEntities.find((candidate) => candidate.id === entityId)
  const trimmed = name.trim()
  if (!entity || !trimmed) return false
  updateTextEntity(entity.id, { label: trimmed })
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function renameWorkspaceDrawingEntity(entityId: string, name: string): boolean {
  const entity = drawingEntities.find((candidate) => candidate.id === entityId)
  const trimmed = name.trim()
  if (!entity || !trimmed) return false
  updateDrawingEntity(entity.id, { label: trimmed })
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function duplicateWorkspaceTab(tabId: string): string | null {
  ensureWorkspaceTabsInitialized()
  syncActiveTabRecord()
  const source = workspaceTabs.find((candidate) => candidate.id === tabId)
  if (!source) return null
  const now = new Date().toISOString()
  const snapshot = cloneWorkspaceSnapshot(source.snapshot)
  snapshot.pages = snapshot.pages.map((page) => ({ ...page, id: makePageId() }))
  const frameIdMap = new Map<string, string>()
  source.snapshot.pages.forEach((page, index) => {
    const nextId = snapshot.pages[index]?.id
    if (page.id && nextId) frameIdMap.set(page.id, nextId)
  })
  snapshot.selectedFrameId =
    (snapshot.selectedFrameId && frameIdMap.get(snapshot.selectedFrameId)) ?? null
  snapshot.selectedFrameIds = snapshot.selectedFrameIds
    ?.map((frameId) => frameIdMap.get(frameId) ?? frameId)
    .filter(Boolean) as string[] | undefined
  snapshot.groups = snapshot.groups?.map((group) => ({
    ...group,
    frameIds: group.frameIds?.map((frameId) => frameIdMap.get(frameId) ?? frameId),
  }))
  snapshot.edges = snapshot.edges?.map((edge) => ({
    ...edge,
    fromEntityId: frameIdMap.get(edge.fromEntityId) ?? edge.fromEntityId,
    toEntityId: frameIdMap.get(edge.toEntityId) ?? edge.toEntityId,
  }))
  const annotations = cloneAnnotationsForPersistence(source.annotations).map((annotation) => {
    const anchor =
      annotation.anchor.type === 'canvas' || annotation.anchor.type === 'region'
        ? annotation.anchor
        : { ...annotation.anchor, frameId: frameIdMap.get(annotation.anchor.frameId) ?? annotation.anchor.frameId }
    return { ...annotation, id: `annotation_${randomUUID()}`, anchor }
  })
  const duplicate: PersistedWorkspaceTab = {
    id: makeWorkspaceTabId(),
    name: `${source.name} Copy`,
    updatedAt: now,
    snapshot,
    annotations,
    expanded: source.expanded ?? true,
  }
  const sourceIndex = workspaceTabs.findIndex((candidate) => candidate.id === tabId)
  workspaceTabs.splice(sourceIndex + 1, 0, duplicate)
  setActiveWorkspaceTab(duplicate.id)
  scheduleWorkspaceAutosave()
  return duplicate.id
}

export function deleteWorkspaceTab(tabId: string): boolean {
  ensureWorkspaceTabsInitialized()
  syncActiveTabRecord()
  const index = workspaceTabs.findIndex((candidate) => candidate.id === tabId)
  if (index === -1) return false
  const deletedTabName = workspaceTabs[index].name
  if (workspaceTabs.length === 1) {
    // Delete old canvas file if the tab is being reset to defaults with a new name
    if (deletedTabName !== DEFAULT_TAB_NAME) {
      deleteCanvasFile(app.getPath('userData'), DEFAULT_WORKSPACE_ID, deletedTabName)
    }
    workspaceTabs[index] = {
      ...workspaceTabs[index],
      name: DEFAULT_TAB_NAME,
      updatedAt: new Date().toISOString(),
      snapshot: makeEmptyTabSnapshot(),
      annotations: [],
      expanded: true,
    }
    setActiveWorkspaceTabId(workspaceTabs[index].id)
    withSuppressedDocSync(() => applyTabState(workspaceTabs[index]))
    transitionToTab(workspaceTabs[index].snapshot, workspaceTabs[index].id)
    markDirty('sidebar')
    requestLayout()
    scheduleWorkspaceAutosave()
    return true
  }
  // Delete the .canvas file for the removed tab
  deleteCanvasFile(app.getPath('userData'), DEFAULT_WORKSPACE_ID, deletedTabName)
  const fallback = workspaceTabs[index + 1] ?? workspaceTabs[index - 1] ?? null
  workspaceTabs.splice(index, 1)
  if (!fallback) return false
  setActiveWorkspaceTabId(fallback.id)
  withSuppressedDocSync(() => applyTabState(fallback))
  transitionToTab(fallback.snapshot, fallback.id)
  markDirty('sidebar')
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function reorderWorkspaceTab(tabId: string, toIndex: number): boolean {
  const fromIndex = workspaceTabs.findIndex((candidate) => candidate.id === tabId)
  if (fromIndex === -1) return false
  const clamped = Math.max(0, Math.min(toIndex, workspaceTabs.length - 1))
  if (fromIndex === clamped) return false
  const [tab] = workspaceTabs.splice(fromIndex, 1)
  workspaceTabs.splice(clamped, 0, tab)
  markDirty('sidebar')
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function setWorkspaceTabExpanded(tabId: string, expanded: boolean): boolean {
  const tab = workspaceTabs.find((candidate) => candidate.id === tabId)
  if (!tab) return false
  tab.expanded = expanded
  tab.updatedAt = new Date().toISOString()
  markDirty('sidebar')
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}

export function setActiveWorkspaceTab(tabId: string): boolean {
  ensureWorkspaceTabsInitialized()
  if (tabId === activeWorkspaceTabId) {
    requestLayout()
    return true
  }
  syncActiveTabRecord()
  const nextTab = workspaceTabs.find((candidate) => candidate.id === tabId)
  if (!nextTab) return false
  setActiveWorkspaceTabId(nextTab.id)
  withSuppressedDocSync(() => applyTabState(nextTab))
  transitionToTab(nextTab.snapshot, nextTab.id)
  markDirty('sidebar')
  requestLayout()
  scheduleWorkspaceAutosave()
  return true
}
