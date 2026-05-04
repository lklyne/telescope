/**
 * Shape Entity State
 *
 * Manages the in-memory state of shape entities on the canvas.
 * Shape entities are lightweight visual primitives — rectangle,
 * ellipse, or diamond bounding boxes with optional text inside.
 */

import { randomUUID } from 'crypto'
import type {
  CanvasSceneShapeEntity,
  PersistedShapeEntity,
  ShapeKind,
} from '../../shared/types'
import { markDirty } from './layout-dirty'

export interface ShapeEntity {
  id: string
  shapeKind: ShapeKind
  text: string
  color?: string
  strokeWidth?: number
  theme?: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  parentGroupId?: string
  label?: string
}

export const DEFAULT_SHAPE_WIDTH = 200
export const DEFAULT_SHAPE_HEIGHT = 120
export const DEFAULT_STROKE_WIDTH = 2
export const MIN_SHAPE_WIDTH = 24
export const MIN_SHAPE_HEIGHT = 24

export const shapeEntities: ShapeEntity[] = []

export function createShapeEntity(input: {
  canvasX: number
  canvasY: number
  shapeKind?: ShapeKind
  width?: number
  height?: number
  text?: string
  color?: string
  strokeWidth?: number
  theme?: string
  id?: string
  parentGroupId?: string
  label?: string
}): ShapeEntity {
  const entity: ShapeEntity = {
    id: input.id ?? `shape_${randomUUID()}`,
    shapeKind: input.shapeKind ?? 'rectangle',
    text: input.text ?? '',
    color: input.color,
    strokeWidth: input.strokeWidth,
    theme: input.theme,
    canvasX: input.canvasX,
    canvasY: input.canvasY,
    width: input.width ?? DEFAULT_SHAPE_WIDTH,
    height: input.height ?? DEFAULT_SHAPE_HEIGHT,
    parentGroupId: input.parentGroupId,
    label: input.label,
  }
  shapeEntities.push(entity)
  markDirty('canvas', 'sidebar', 'floating-ui')
  return entity
}

export function updateShapeEntity(
  id: string,
  patch: Partial<Omit<ShapeEntity, 'id'>>,
): ShapeEntity | null {
  const entity = shapeEntities.find((s) => s.id === id)
  if (!entity) return null
  if (patch.shapeKind !== undefined) entity.shapeKind = patch.shapeKind
  if (patch.text !== undefined) entity.text = patch.text
  if (patch.color !== undefined) entity.color = patch.color || undefined
  if (patch.strokeWidth !== undefined) entity.strokeWidth = patch.strokeWidth
  if (patch.theme !== undefined) entity.theme = patch.theme || undefined
  if (patch.canvasX !== undefined) entity.canvasX = patch.canvasX
  if (patch.canvasY !== undefined) entity.canvasY = patch.canvasY
  if (patch.width !== undefined) entity.width = patch.width
  if (patch.height !== undefined) entity.height = patch.height
  if (patch.parentGroupId !== undefined) entity.parentGroupId = patch.parentGroupId
  if (patch.label !== undefined) entity.label = patch.label || undefined
  markDirty('canvas', 'sidebar', 'floating-ui')
  return entity
}

export function deleteShapeEntity(id: string): boolean {
  const idx = shapeEntities.findIndex((s) => s.id === id)
  if (idx === -1) return false
  shapeEntities.splice(idx, 1)
  markDirty('canvas', 'sidebar', 'floating-ui')
  return true
}

export function clearShapeEntities(): void {
  shapeEntities.length = 0
}

export function buildShapeEntitySceneEntity(
  entity: ShapeEntity,
  zoom: number,
  pan: { x: number; y: number },
  canvasOrigin: { x: number; y: number },
): CanvasSceneShapeEntity {
  const screenX = canvasOrigin.x + entity.canvasX * zoom + pan.x
  const screenY = canvasOrigin.y + entity.canvasY * zoom + pan.y
  return {
    kind: 'shape',
    id: entity.id,
    shapeKind: entity.shapeKind,
    text: entity.text,
    color: entity.color,
    strokeWidth: entity.strokeWidth,
    theme: entity.theme,
    canvasX: entity.canvasX,
    canvasY: entity.canvasY,
    width: entity.width,
    height: entity.height,
    parentGroupId: entity.parentGroupId,
    screenX,
    screenY,
    screenWidth: entity.width * zoom,
    screenHeight: entity.height * zoom,
  }
}

export function persistShapeEntity(entity: ShapeEntity): PersistedShapeEntity {
  return {
    kind: 'shape',
    id: entity.id,
    shapeKind: entity.shapeKind,
    text: entity.text,
    color: entity.color,
    strokeWidth: entity.strokeWidth,
    theme: entity.theme,
    canvasX: entity.canvasX,
    canvasY: entity.canvasY,
    width: entity.width,
    height: entity.height,
    parentGroupId: entity.parentGroupId,
    label: entity.label,
  }
}

export function restoreShapeEntity(persisted: PersistedShapeEntity): ShapeEntity {
  return {
    id: persisted.id,
    shapeKind: persisted.shapeKind,
    text: persisted.text ?? '',
    color: persisted.color,
    strokeWidth: persisted.strokeWidth,
    theme: persisted.theme,
    canvasX: persisted.canvasX,
    canvasY: persisted.canvasY,
    width: persisted.width,
    height: persisted.height,
    parentGroupId: persisted.parentGroupId,
    label: persisted.label,
  }
}
