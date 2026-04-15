import type { CanvasPoint } from './coords'

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export type EdgeEndpoint = { entityId: string; side: 'top' | 'right' | 'bottom' | 'left' }

export type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'panning' }
  | { kind: 'marquee'; origin: CanvasPoint; current: CanvasPoint }
  | { kind: 'dragging-entities'; ids: string[]; anchor: CanvasPoint }
  | { kind: 'resizing-entity'; id: string; edge: ResizeEdge }
  | { kind: 'dragging-edge'; from: EdgeEndpoint; target: EdgeEndpoint | null }
  | { kind: 'editing-text'; id: string }

export type CancelReason = 'blur' | 'escape' | 'undo' | 'tab-switch' | 'external'

export type Token = { readonly id: string; readonly mode: InteractionMode['kind'] }

export type InteractionRefused = { refused: true; reason: string }

export type DragDelta = {
  dxCanvas: number
  dyCanvas: number
  point: CanvasPoint
  modifiers: { shift: boolean; meta: boolean; alt: boolean; ctrl: boolean }
}

export type GestureContext = {
  point: CanvasPoint
  startPoint: CanvasPoint
  delta: { dx: number; dy: number }
  modifiers: { shift: boolean; meta: boolean; alt: boolean; ctrl: boolean }
  buttons: number
}

export type FocusTarget =
  | { kind: 'bgView' }
  | { kind: 'aboveView' }
  | { kind: 'page'; id: string }
  | { kind: 'toolbar' }
  | { kind: 'sidebar' }

export type DropTarget =
  | { kind: 'canvas' }
  | { kind: 'entity'; id: string }
  | { kind: 'sidebar' }
  | { kind: 'none' }
