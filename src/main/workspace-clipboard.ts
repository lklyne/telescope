import type {
  ClipboardEntityPayload,
  ClipboardEntitySelectionPayload,
  ClipboardFrameSelectionPayload,
} from '../shared/types'
import {
  createPage,
  findPageById,
} from './runtime/page-runtime'
import {
  getSelectedEntityIds,
  selectPageById,
  setSelectedEntities,
  setSelectedFrames,
} from './runtime/ui-actions'
import { textEntities } from './runtime/text-entity-state'
import { fileEntities } from './runtime/file-entity-state'
import { shapeEntities } from './runtime/shape-entity-state'
import { createTextEntity as createTextEntityInState } from './runtime/text-entity-state'
import { createFileEntity as createFileEntityInState } from './runtime/file-entity-state'
import { createShapeEntity as createShapeEntityInState } from './runtime/shape-entity-state'
import { layoutAllViews, snapToGrid } from './runtime/surface-layout'
import { scheduleWorkspaceAutosave } from './runtime/workspace-session'
import { cloneMetadata } from './workspace-utils'

export function copyableFramePayload(
  frameIds: string[],
): ClipboardFrameSelectionPayload | null {
  if (!frameIds.length) return null

  const selectedPages = frameIds
    .map((frameId) => findPageById(frameId))
    .filter((page): page is Exclude<typeof page, undefined> => page !== undefined)

  if (!selectedPages.length) return null

  const minX = Math.min(...selectedPages.map((page) => page.canvasX))
  const minY = Math.min(...selectedPages.map((page) => page.canvasY))

  return {
    version: 1,
    frames: selectedPages.map((page) => ({
      url: page.pageView.webContents.getURL() || 'about:blank',
      presetIndex: page.presetIndex,
      dx: page.canvasX - minX,
      dy: page.canvasY - minY,
    })),
  }
}

export function copyableSelectionPayload():
  | ClipboardEntitySelectionPayload
  | null {
  const entityIds = getSelectedEntityIds()
  if (!entityIds.length) return null

  const entities: ClipboardEntityPayload[] = []

  // Collect all positionable entities for bounding box
  const allPositions: { canvasX: number; canvasY: number }[] = []

  for (const id of entityIds) {
    const page = findPageById(id)
    if (page) {
      allPositions.push({ canvasX: page.canvasX, canvasY: page.canvasY })
      continue
    }
    const note = textEntities.find((n) => n.id === id)
    if (note) {
      allPositions.push({ canvasX: note.canvasX, canvasY: note.canvasY })
      continue
    }
    const file = fileEntities.find((f) => f.id === id)
    if (file) {
      allPositions.push({ canvasX: file.canvasX, canvasY: file.canvasY })
      continue
    }
    const shape = shapeEntities.find((s) => s.id === id)
    if (shape) {
      allPositions.push({ canvasX: shape.canvasX, canvasY: shape.canvasY })
    }
  }

  if (!allPositions.length) return null

  const minX = Math.min(...allPositions.map((p) => p.canvasX))
  const minY = Math.min(...allPositions.map((p) => p.canvasY))

  for (const id of entityIds) {
    const page = findPageById(id)
    if (page) {
      entities.push({
        kind: 'frame',
        url: page.pageView.webContents.getURL() || 'about:blank',
        presetIndex: page.presetIndex,
        metadata: cloneMetadata(page.metadata) as Record<string, unknown> | undefined,
        dx: page.canvasX - minX,
        dy: page.canvasY - minY,
      })
      continue
    }
    const note = textEntities.find((n) => n.id === id)
    if (note) {
      entities.push({
        kind: 'text',
        text: note.text,
        color: note.color,
        width: note.width,
        height: note.height,
        dx: note.canvasX - minX,
        dy: note.canvasY - minY,
      })
      continue
    }
    const file = fileEntities.find((f) => f.id === id)
    if (file) {
      entities.push({
        kind: 'file',
        file: file.file,
        subpath: file.subpath,
        width: file.width,
        height: file.height,
        dx: file.canvasX - minX,
        dy: file.canvasY - minY,
        presetIndex: file.presetIndex,
        metadata: file.metadata,
        objectFit: file.objectFit,
      })
      continue
    }
    const shape = shapeEntities.find((s) => s.id === id)
    if (shape) {
      entities.push({
        kind: 'shape',
        shapeKind: shape.shapeKind,
        text: shape.text,
        color: shape.color,
        strokeWidth: shape.strokeWidth,
        theme: shape.theme,
        label: shape.label,
        width: shape.width,
        height: shape.height,
        dx: shape.canvasX - minX,
        dy: shape.canvasY - minY,
      })
    }
  }

  if (!entities.length) return null

  return { version: 2, entities }
}

export function pasteFramesFromClipboard(input: {
  payload: ClipboardFrameSelectionPayload
  canvasX: number
  canvasY: number
}): { frameIds: string[] } {
  const frames = input.payload.frames.filter((frame) =>
    Number.isFinite(frame.presetIndex) &&
    Number.isFinite(frame.dx) &&
    Number.isFinite(frame.dy) &&
    typeof frame.url === 'string' &&
    frame.url.trim().length > 0,
  )

  if (!frames.length) {
    return { frameIds: [] }
  }

  const frameIds = frames.map((frame) => {
    const page = createPage({
      url: frame.url,
      presetIndex: frame.presetIndex,
      linked: false,
      canvasX: snapToGrid(input.canvasX + frame.dx),
      canvasY: snapToGrid(input.canvasY + frame.dy),
      source: 'manual',
      metadata: {
        createdFrom: 'paste',
      },
    })
    return page.id
  })

  if (frameIds.length === 1) {
    selectPageById(frameIds[0])
  } else {
    setSelectedFrames(frameIds)
  }

  layoutAllViews()
  scheduleWorkspaceAutosave()
  return { frameIds }
}

export function pasteEntitiesFromClipboard(input: {
  payload: ClipboardEntitySelectionPayload
  canvasX: number
  canvasY: number
}): { entityIds: string[] } {
  const entityIds: string[] = []

  for (const entity of input.payload.entities) {
    if (!Number.isFinite(entity.dx) || !Number.isFinite(entity.dy)) continue

    if (entity.kind === 'frame') {
      if (
        !Number.isFinite(entity.presetIndex) ||
        typeof entity.url !== 'string' ||
        !entity.url?.trim().length
      ) continue

      const pasteMetadata = entity.metadata
        ? { ...entity.metadata, createdFrom: 'paste' }
        : { createdFrom: 'paste' }
      const page = createPage({
        url: entity.url!,
        presetIndex: entity.presetIndex!,
        linked: false,
        canvasX: snapToGrid(input.canvasX + entity.dx),
        canvasY: snapToGrid(input.canvasY + entity.dy),
        source: 'manual',
        metadata: pasteMetadata,
      })
      entityIds.push(page.id)
    } else if (entity.kind === 'text') {
      const note = createTextEntityInState({
        canvasX: snapToGrid(input.canvasX + entity.dx),
        canvasY: snapToGrid(input.canvasY + entity.dy),
        text: entity.text,
        color: entity.color,
        width: entity.width,
        height: entity.height,
      })
      entityIds.push(note.id)
    } else if (entity.kind === 'file') {
      if (typeof entity.file !== 'string' || !entity.file.trim().length) continue
      const file = createFileEntityInState({
        canvasX: snapToGrid(input.canvasX + entity.dx),
        canvasY: snapToGrid(input.canvasY + entity.dy),
        file: entity.file,
        subpath: entity.subpath,
        width: entity.width,
        height: entity.height,
        presetIndex: entity.presetIndex,
        metadata: entity.metadata ? { ...entity.metadata } : undefined,
        objectFit: entity.objectFit,
      })
      entityIds.push(file.id)
    } else if (entity.kind === 'shape') {
      const shape = createShapeEntityInState({
        canvasX: snapToGrid(input.canvasX + entity.dx),
        canvasY: snapToGrid(input.canvasY + entity.dy),
        shapeKind: entity.shapeKind,
        text: entity.text,
        color: entity.color,
        strokeWidth: entity.strokeWidth,
        theme: entity.theme,
        label: entity.label,
        width: entity.width,
        height: entity.height,
      })
      entityIds.push(shape.id)
    }
  }

  if (!entityIds.length) return { entityIds: [] }

  setSelectedEntities(entityIds)
  layoutAllViews()
  scheduleWorkspaceAutosave()
  return { entityIds }
}
