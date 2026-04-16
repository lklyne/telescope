/**
 * Text Entity State
 *
 * Manages the in-memory state of text entities on the canvas.
 * Text entities are lightweight canvas entities — no Electron views,
 * no browser runtime, no devtools. They just have position, size,
 * text, and color.
 */

import { randomUUID } from 'crypto'
import type {
  CanvasSceneTextEntity,
  PersistedTextEntity,
} from '../../shared/types'
import { resolveCanvasColor, COLOR_PRESETS } from '../../shared/canvas-colors'
import { markDirty } from './layout-dirty'

export interface TextEntity {
  id: string
  text: string
  color: string
  canvasX: number
  canvasY: number
  width: number
  height: number
  parentGroupId?: string
  label?: string
}

export const DEFAULT_TEXT_WIDTH = 200
export const DEFAULT_TEXT_HEIGHT = 200
export const DEFAULT_TEXT_COLOR = COLOR_PRESETS['3'] // yellow preset

export const textEntities: TextEntity[] = []

export function createTextEntity(input: {
  canvasX: number
  canvasY: number
  text?: string
  color?: string
  width?: number
  height?: number
  id?: string
  parentGroupId?: string
  label?: string
}): TextEntity {
  const entity: TextEntity = {
    id: input.id ?? `text_${randomUUID()}`,
    text: input.text ?? '',
    color: resolveCanvasColor(input.color ?? '3'),
    canvasX: input.canvasX,
    canvasY: input.canvasY,
    width: input.width ?? DEFAULT_TEXT_WIDTH,
    height: input.height ?? DEFAULT_TEXT_HEIGHT,
    parentGroupId: input.parentGroupId,
    label: input.label,
  }
  textEntities.push(entity)
  markDirty('canvas', 'sidebar', 'floating-ui')
  return entity
}

export function updateTextEntity(id: string, patch: Partial<Omit<TextEntity, 'id'>>): TextEntity | null {
  const entity = textEntities.find((n) => n.id === id)
  if (!entity) return null
  if (patch.text !== undefined) entity.text = patch.text
  if (patch.color !== undefined) entity.color = resolveCanvasColor(patch.color)
  if (patch.canvasX !== undefined) entity.canvasX = patch.canvasX
  if (patch.canvasY !== undefined) entity.canvasY = patch.canvasY
  if (patch.width !== undefined) entity.width = patch.width
  if (patch.height !== undefined) entity.height = patch.height
  if (patch.parentGroupId !== undefined) entity.parentGroupId = patch.parentGroupId
  if (patch.label !== undefined) entity.label = patch.label || undefined
  markDirty('canvas', 'sidebar', 'floating-ui')
  return entity
}

export function deleteTextEntity(id: string): boolean {
  const idx = textEntities.findIndex((n) => n.id === id)
  if (idx === -1) return false
  textEntities.splice(idx, 1)
  markDirty('canvas', 'sidebar', 'floating-ui')
  return true
}

export function clearTextEntities(): void {
  textEntities.length = 0
}

export function buildTextEntitySceneEntity(
  entity: TextEntity,
  zoom: number,
  pan: { x: number; y: number },
  canvasOrigin: { x: number; y: number },
): CanvasSceneTextEntity {
  const screenX = canvasOrigin.x + entity.canvasX * zoom + pan.x
  const screenY = canvasOrigin.y + entity.canvasY * zoom + pan.y
  return {
    kind: 'text',
    id: entity.id,
    text: entity.text,
    color: entity.color,
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

export function persistTextEntity(entity: TextEntity): PersistedTextEntity {
  return {
    kind: 'text',
    id: entity.id,
    text: entity.text,
    color: entity.color,
    canvasX: entity.canvasX,
    canvasY: entity.canvasY,
    width: entity.width,
    height: entity.height,
    parentGroupId: entity.parentGroupId,
    label: entity.label,
  }
}
