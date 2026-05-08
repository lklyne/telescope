/**
 * Document Commands
 *
 * This module provides the canonical entry points for all mutations that change
 * persisted workspace data. Every function here modifies the workspace document
 * (pages, groups, edges, annotations) and triggers autosave.
 *
 * This is the seam where undo/redo will hook in: when undo is added, these
 * functions will be wrapped to capture before/after state. UI-only mutations
 * (selection, view mode, tool state) live in ui-actions.ts and do NOT
 * participate in the undo stack.
 *
 * Rules:
 * - Every document command triggers scheduleWorkspaceAutosave()
 * - Every document command triggers layoutAllViews() or requestLayout()
 * - Document commands may also change UI state (e.g., selecting a newly created page)
 * - UI commands (in ui-actions.ts) never change persisted document data
 */

import { GRID_SIZE, VIEWPORT_PRESETS } from '../../shared/constants'
import type { DeviceOrientation } from '../../shared/device-catalog'
import { deviceForPresetIndex } from '../../shared/device-catalog'
import type { EdgeEnd, EdgeSide } from '../../shared/types'
import type { WorkspaceGroup } from '../../shared/types'
import {
  updateSelectionForRemovedEntity,
  selectedEntityIds as uiSelectedEntityIds,
  selectedGroupId as uiSelectedGroupId,
} from '../ui-state'
import { removeEdgesTouchingEntities } from '../workspace-edges'
import {
  createUserGroup as createUserGroupInEngine,
  ungroupUserGroup as ungroupUserGroupInEngine,
} from '../workspace-groups'
import {
  deleteDrawingEntity as deleteDrawingEntityInState,
  drawingEntities,
  type DrawingEntity,
  updateDrawingEntity as updateDrawingEntityInState,
} from './drawing-entity-state'
import {
  createFileEntity as createFileEntityInState,
  updateFileEntity as updateFileEntityInState,
  deleteFileEntity as deleteFileEntityInState,
  fileEntities,
  type FileEntity,
} from './file-entity-state'
import {
  updateGroupEntity as updateGroupEntityInState,
} from './group-entity-state'
import { markDirty } from './layout-dirty'
import { pages } from './page-runtime'
import {
  clearCustomPageSizeMetadata,
  deviceIdFromMetadata,
  deviceOrientationFromMetadata,
  pageUsesCustomSize,
  setCustomPageSizeMetadata,
  setDeviceIdMetadata,
  setDeviceOrientationMetadata,
  setShowDeviceFrameMetadata,
  setUseSvgDeviceShellMetadata,
  showDeviceFrameFromMetadata,
  useSvgDeviceShellFromMetadata,
} from './runtime-entities'
import { selectEntities, selectGroup } from './selection-controller'
import { layoutAllViews, pageContentSize, requestLayout, snapToGrid, zoom } from './surface-layout'
import {
  createTextEntity as createTextEntityInState,
  updateTextEntity as updateTextEntityInState,
  deleteTextEntity as deleteTextEntityInState,
  textEntities,
  type TextEntity,
} from './text-entity-state'
import {
  createShapeEntity as createShapeEntityInState,
  updateShapeEntity as updateShapeEntityInState,
  deleteShapeEntity as deleteShapeEntityInState,
  shapeEntities,
  type ShapeEntity,
} from './shape-entity-state'
import { workspaceEdges, workspaceGroups } from './workspace-model'
import { beginBatch, endBatch } from './workspace-observers'
import { scheduleWorkspaceAutosave } from './workspace-session'
import { markUndoBoundary } from './workspace-undo'

// --- Page Commands ---

export {
  addPageFromSource,
  createPageAtPosition,
  createPages,
  duplicatePageFromSource,
  tidySelectedPages,
} from '../workspace-pages'
export { deletePages } from '../workspace-entities'
export { pastePagesFromClipboard } from '../workspace-clipboard'

// --- Entity Movement ---

/**
 * Find any movable canvas entity by ID (page or text entity).
 * Returns an object with mutable canvasX/canvasY.
 */
export function findMovableEntity(id: string): { canvasX: number; canvasY: number } | null {
  const page = pages.find((p) => p.id === id)
  if (page) return page
  const te = textEntities.find((n) => n.id === id)
  if (te) return te
  const fe = fileEntities.find((e) => e.id === id)
  if (fe) return fe
  const de = drawingEntities.find((e) => e.id === id)
  if (de) return de
  const se = shapeEntities.find((e) => e.id === id)
  if (se) return se
  const group = workspaceGroups.find((candidate) => candidate.id === id)
  if (group) return group
  return null
}

/**
 * Accumulates sub-pixel drag deltas and applies grid-snapped positions.
 * Works with any entity type (pages, text entities).
 * When undo/redo is added, the drag-start snapshot and drag-end snapshot
 * form a single undoable operation.
 */
const dragAccumulatorById = new Map<string, { rawX: number; rawY: number }>()

export function initializeDrag(entityIds: string[]): void {
  dragAccumulatorById.clear()
  beginBatch()
  for (const id of entityIds) {
    const entity = findMovableEntity(id)
    if (!entity) continue
    dragAccumulatorById.set(id, { rawX: entity.canvasX, rawY: entity.canvasY })
  }
}

export function applyDragDelta(entityIds: string[], dx: number, dy: number): void {
  for (const id of entityIds) {
    const entity = findMovableEntity(id)
    if (!entity) continue
    let acc = dragAccumulatorById.get(id)
    if (!acc) {
      acc = { rawX: entity.canvasX, rawY: entity.canvasY }
      dragAccumulatorById.set(id, acc)
    } else {
      const driftX = Math.abs(snapToGrid(acc.rawX) - entity.canvasX)
      const driftY = Math.abs(snapToGrid(acc.rawY) - entity.canvasY)
      if (driftX > GRID_SIZE / 2 || driftY > GRID_SIZE / 2) {
        acc.rawX = entity.canvasX
        acc.rawY = entity.canvasY
      }
    }
    acc.rawX += dx / zoom
    acc.rawY += dy / zoom
    entity.canvasX = snapToGrid(acc.rawX)
    entity.canvasY = snapToGrid(acc.rawY)
  }
  if (entityIds.length) {
    markDirty('canvas', 'sidebar')
    scheduleWorkspaceAutosave()
  }
}

export function finalizeDrag(): void {
  dragAccumulatorById.clear()
  endBatch()
  markUndoBoundary()
}

/**
 * Move entities by a screen-pixel delta. For use outside of drag flows
 * (e.g., keyboard arrow movement).
 */
export function moveEntities(entityIds: string[], dx: number, dy: number): void {
  for (const id of entityIds) {
    const entity = findMovableEntity(id)
    if (!entity) continue
    entity.canvasX = snapToGrid(entity.canvasX + dx / zoom)
    entity.canvasY = snapToGrid(entity.canvasY + dy / zoom)
  }
  if (entityIds.length) {
    markDirty('canvas', 'sidebar')
    scheduleWorkspaceAutosave()
    requestLayout()
  }
}

// --- Group Commands ---

export { deleteGroups } from '../workspace-groups'

export function groupSelectedEntities(): WorkspaceGroup | null {
  const ids = uiSelectedEntityIds()
  if (ids.length < 2) return null
  const group = createUserGroupInEngine(ids)
  selectGroup(group.id)
  layoutAllViews()
  return group
}

export function ungroupSelectedGroup(): string[] | null {
  const groupId = uiSelectedGroupId()
  if (!groupId) return null
  const freedIds = ungroupUserGroupInEngine(groupId)
  if (!freedIds.length) return null
  selectEntities(freedIds)
  layoutAllViews()
  return freedIds
}

// --- Edge Commands ---

export {
  createEdges,
  deleteEdges,
  removeEdgesTouchingEntities,
} from '../workspace-edges'

export function updateEdge(
  id: string,
  patch: {
    fromEntityId?: string
    toEntityId?: string
    fromEnd?: EdgeEnd
    toEnd?: EdgeEnd
    fromSide?: EdgeSide
    toSide?: EdgeSide
    color?: string
    label?: string
  },
): boolean {
  const edge = workspaceEdges.find((e) => e.id === id)
  if (!edge) return false
  if (patch.fromEntityId !== undefined) edge.fromEntityId = patch.fromEntityId
  if (patch.toEntityId !== undefined) edge.toEntityId = patch.toEntityId
  if (patch.fromEnd !== undefined) edge.fromEnd = patch.fromEnd
  if (patch.toEnd !== undefined) edge.toEnd = patch.toEnd
  if (patch.fromSide !== undefined) edge.fromSide = patch.fromSide
  if (patch.toSide !== undefined) edge.toSide = patch.toSide
  if (patch.color !== undefined) edge.color = patch.color || undefined
  if (patch.label !== undefined) edge.label = patch.label || undefined
  markDirty('canvas')
  scheduleWorkspaceAutosave()
  requestLayout()
  return true
}

export function deleteEdge(id: string): boolean {
  const idx = workspaceEdges.findIndex((e) => e.id === id)
  if (idx === -1) return false
  workspaceEdges.splice(idx, 1)
  updateSelectionForRemovedEntity(id)
  markDirty('canvas')
  scheduleWorkspaceAutosave()
  requestLayout()
  return true
}

// --- Layout Task Commands ---

export {
  applyTaskLayout,
  layoutComponentStates,
} from '../workspace-layout-tasks'

// --- Text Entity Commands ---

export function createTextEntity(input: {
  canvasX: number
  canvasY: number
  text?: string
  color?: string
  textStyle?: import('../../shared/types').TextEntityStyle
  width?: number
  height?: number
  id?: string
}): TextEntity {
  const entity = createTextEntityInState(input)
  scheduleWorkspaceAutosave()
  requestLayout()
  return entity
}

export function updateTextEntity(id: string, patch: Partial<Omit<TextEntity, 'id'>>): TextEntity | null {
  const snapped = { ...patch }
  if (snapped.width !== undefined) snapped.width = snapToGrid(snapped.width)
  if (snapped.height !== undefined) snapped.height = snapToGrid(snapped.height)
  if (snapped.canvasX !== undefined) snapped.canvasX = snapToGrid(snapped.canvasX)
  if (snapped.canvasY !== undefined) snapped.canvasY = snapToGrid(snapped.canvasY)
  const entity = updateTextEntityInState(id, snapped)
  if (entity) {
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return entity
}

export function deleteTextEntity(id: string): boolean {
  const deleted = deleteTextEntityInState(id)
  if (deleted) {
    removeEdgesTouchingEntities(new Set([id]))
    updateSelectionForRemovedEntity(id)
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return deleted
}

export function getTextEntities(): TextEntity[] {
  return [...textEntities]
}

// --- File Entity Commands ---

export function createFileEntity(input: {
  canvasX: number
  canvasY: number
  file: string
  subpath?: string
  width?: number
  height?: number
  id?: string
  metadata?: Record<string, unknown>
}): FileEntity {
  const entity = createFileEntityInState(input)
  scheduleWorkspaceAutosave()
  requestLayout()
  return entity
}

export function updateFileEntity(id: string, patch: Partial<Omit<FileEntity, 'id'>>): FileEntity | null {
  const snapped = { ...patch }
  if (snapped.canvasX !== undefined) snapped.canvasX = snapToGrid(snapped.canvasX)
  if (snapped.canvasY !== undefined) snapped.canvasY = snapToGrid(snapped.canvasY)
  const entity = updateFileEntityInState(id, snapped)
  if (entity) {
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return entity
}

export function deleteFileEntity(id: string): boolean {
  const deleted = deleteFileEntityInState(id)
  if (deleted) {
    removeEdgesTouchingEntities(new Set([id]))
    updateSelectionForRemovedEntity(id)
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return deleted
}

export function getFileEntities(): FileEntity[] {
  return [...fileEntities]
}

export function updateDrawingEntity(
  id: string,
  patch: Partial<Omit<DrawingEntity, 'id'>>,
): DrawingEntity | null {
  const snapped = { ...patch }
  if (snapped.width !== undefined) snapped.width = snapToGrid(snapped.width)
  if (snapped.height !== undefined) snapped.height = snapToGrid(snapped.height)
  if (snapped.canvasX !== undefined) snapped.canvasX = snapToGrid(snapped.canvasX)
  if (snapped.canvasY !== undefined) snapped.canvasY = snapToGrid(snapped.canvasY)
  const entity = updateDrawingEntityInState(id, snapped)
  if (entity) {
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return entity
}

export function deleteDrawingEntity(id: string): boolean {
  const deleted = deleteDrawingEntityInState(id)
  if (deleted) {
    removeEdgesTouchingEntities(new Set([id]))
    updateSelectionForRemovedEntity(id)
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return deleted
}

// --- Shape Entity Commands ---

export function createShapeEntity(input: {
  canvasX: number
  canvasY: number
  shapeKind?: ShapeEntity['shapeKind']
  width?: number
  height?: number
  text?: string
  color?: string
  strokeWidth?: number
  id?: string
}): ShapeEntity {
  const entity = createShapeEntityInState(input)
  scheduleWorkspaceAutosave()
  requestLayout()
  return entity
}

export function updateShapeEntity(
  id: string,
  patch: Partial<Omit<ShapeEntity, 'id'>>,
): ShapeEntity | null {
  const snapped = { ...patch }
  if (snapped.width !== undefined) snapped.width = snapToGrid(snapped.width)
  if (snapped.height !== undefined) snapped.height = snapToGrid(snapped.height)
  if (snapped.canvasX !== undefined) snapped.canvasX = snapToGrid(snapped.canvasX)
  if (snapped.canvasY !== undefined) snapped.canvasY = snapToGrid(snapped.canvasY)
  const entity = updateShapeEntityInState(id, snapped)
  if (entity) {
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return entity
}

export function deleteShapeEntity(id: string): boolean {
  const deleted = deleteShapeEntityInState(id)
  if (deleted) {
    removeEdgesTouchingEntities(new Set([id]))
    updateSelectionForRemovedEntity(id)
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return deleted
}

export function getShapeEntities(): ShapeEntity[] {
  return [...shapeEntities]
}

export function updateGroupEntity(
  id: string,
  patch: Partial<Omit<WorkspaceGroup, 'id' | 'kind'>>,
): WorkspaceGroup | null {
  const snapped = { ...patch }
  if (snapped.width !== undefined) snapped.width = snapToGrid(snapped.width)
  if (snapped.height !== undefined) snapped.height = snapToGrid(snapped.height)
  if (snapped.canvasX !== undefined) snapped.canvasX = snapToGrid(snapped.canvasX)
  if (snapped.canvasY !== undefined) snapped.canvasY = snapToGrid(snapped.canvasY)
  const entity = updateGroupEntityInState(id, snapped)
  if (entity) {
    scheduleWorkspaceAutosave()
    requestLayout()
  }
  return entity
}

// --- Multi-Selection Resize (no grid snap) ---

export interface MultiResizeEntry {
  id: string
  kind: 'page' | 'text' | 'file' | 'drawing' | 'shape'
  width: number
  height: number
  canvasX: number
  canvasY: number
}

export function resizeMultiSelection(entries: MultiResizeEntry[]): void {
  let changed = false
  for (const entry of entries) {
    if (entry.kind === 'page') {
      const page = pages.find((p) => p.id === entry.id)
      if (!page) continue
      const currentSize = pageContentSize(page)
      const nextSize = { width: entry.width, height: entry.height }
      const sizeChanged =
        nextSize.width !== currentSize.width || nextSize.height !== currentSize.height
      if (pageUsesCustomSize(page.metadata) || sizeChanged) {
        let meta = setCustomPageSizeMetadata(page.metadata, nextSize)
        if (sizeChanged && deviceIdFromMetadata(meta)) {
          meta = setDeviceIdMetadata(meta, null)
        }
        page.metadata = meta
      }
      page.canvasX = entry.canvasX
      page.canvasY = entry.canvasY
      changed = true
    } else if (entry.kind === 'text') {
      const entity = updateTextEntityInState(entry.id, {
        width: entry.width,
        height: entry.height,
        canvasX: entry.canvasX,
        canvasY: entry.canvasY,
      })
      if (entity) changed = true
    } else if (entry.kind === 'file') {
      const entity = updateFileEntityInState(entry.id, {
        width: entry.width,
        height: entry.height,
        canvasX: entry.canvasX,
        canvasY: entry.canvasY,
      })
      if (entity) changed = true
    } else if (entry.kind === 'drawing') {
      const entity = updateDrawingEntityInState(entry.id, {
        width: entry.width,
        height: entry.height,
        canvasX: entry.canvasX,
        canvasY: entry.canvasY,
      })
      if (entity) changed = true
    } else if (entry.kind === 'shape') {
      const entity = updateShapeEntityInState(entry.id, {
        width: entry.width,
        height: entry.height,
        canvasX: entry.canvasX,
        canvasY: entry.canvasY,
      })
      if (entity) changed = true
    }
  }
  if (changed) {
    scheduleWorkspaceAutosave()
    requestLayout()
  }
}

// --- Device Page Commands ---

export function setPagePreset(pageId: string, presetIndex: number): void {
  if (presetIndex < 0 || presetIndex >= VIEWPORT_PRESETS.length) return
  const page = pages.find((p) => p.id === pageId)
  if (!page) return
  page.presetIndex = presetIndex
  let meta = clearCustomPageSizeMetadata(page.metadata) ?? {}
  // Auto-assign device based on the new preset
  const matchedDevice = deviceForPresetIndex(presetIndex)
  meta = setDeviceIdMetadata(meta, matchedDevice?.id ?? null)
  page.metadata = meta
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

export function setPageCustom(pageId: string): void {
  const page = pages.find((p) => p.id === pageId)
  if (!page) return
  const size = pageContentSize(page)
  let meta = setCustomPageSizeMetadata(page.metadata, size)
  meta = setDeviceIdMetadata(meta, null)
  page.metadata = meta
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

export function setDeviceOrientation(pageId: string, orientation: DeviceOrientation): void {
  const page = pages.find((p) => p.id === pageId)
  if (!page) return
  let meta = page.metadata ?? {}
  meta = setDeviceOrientationMetadata(meta, orientation)
  page.metadata = meta
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

export function toggleDeviceShell(pageId: string): void {
  const page = pages.find((p) => p.id === pageId)
  if (!page) return
  let meta = page.metadata ?? {}
  const current = showDeviceFrameFromMetadata(meta)
  meta = setShowDeviceFrameMetadata(meta, !current)
  page.metadata = meta
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

export function toggleSvgDeviceShell(pageId: string): void {
  const page = pages.find((p) => p.id === pageId)
  if (!page) return
  let meta = page.metadata ?? {}
  const current = useSvgDeviceShellFromMetadata(meta)
  meta = setUseSvgDeviceShellMetadata(meta, !current)
  page.metadata = meta
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

// --- File Device Commands ---

export function setFilePreset(fileId: string, presetIndex: number): void {
  if (presetIndex < 0 || presetIndex >= VIEWPORT_PRESETS.length) return
  const entity = fileEntities.find((e) => e.id === fileId)
  if (!entity) return
  const preset = VIEWPORT_PRESETS[presetIndex]
  entity.presetIndex = presetIndex
  entity.width = preset.width
  entity.height = preset.height
  let meta = clearCustomPageSizeMetadata(entity.metadata) ?? {}
  const matchedDevice = deviceForPresetIndex(presetIndex)
  meta = setDeviceIdMetadata(meta, matchedDevice?.id ?? null)
  entity.metadata = meta
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

export function setFileCustom(fileId: string): void {
  const entity = fileEntities.find((e) => e.id === fileId)
  if (!entity) return
  let meta = setCustomPageSizeMetadata(entity.metadata, { width: entity.width, height: entity.height })
  meta = setDeviceIdMetadata(meta, null)
  entity.metadata = meta
  entity.presetIndex = undefined
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

export function setFileDeviceOrientation(fileId: string, orientation: DeviceOrientation): void {
  const entity = fileEntities.find((e) => e.id === fileId)
  if (!entity) return
  // Swap width/height when changing orientation (only for preset sizes)
  const meta = entity.metadata ?? {}
  const currentOrientation = deviceOrientationFromMetadata(meta)
  if (currentOrientation !== orientation && entity.presetIndex !== undefined) {
    const temp = entity.width
    entity.width = entity.height
    entity.height = temp
  }
  entity.metadata = setDeviceOrientationMetadata(meta, orientation)
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

export function toggleFileDeviceShell(fileId: string): void {
  const entity = fileEntities.find((e) => e.id === fileId)
  if (!entity) return
  let meta = entity.metadata ?? {}
  const current = showDeviceFrameFromMetadata(meta)
  meta = setShowDeviceFrameMetadata(meta, !current)
  entity.metadata = meta
  scheduleWorkspaceAutosave()
  markDirty('canvas')
  requestLayout()
  markUndoBoundary()
}

// --- Annotation Commands ---

export {
  createAnnotation,
  updateAnnotationStatus,
  addAnnotationReply,
  moveAnnotation,
  deleteAnnotation,
} from '../workspace-annotations'
