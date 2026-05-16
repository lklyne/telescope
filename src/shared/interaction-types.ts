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
  | { kind: 'editing-entity'; id: string }

export type CancelReason = 'blur' | 'escape' | 'undo' | 'tab-switch' | 'external'

export type Token = { readonly id: string; readonly mode: InteractionMode['kind'] }

export type FocusTarget =
  | { kind: 'bgView' }
  | { kind: 'aboveView' }
  | { kind: 'page'; id: string }
  | { kind: 'toolbar' }
  | { kind: 'sidebar' }
