// Unified Tool concept — see ADR 0005.

// Mirror of `ShapeKind` to avoid types.ts → tool.ts circular import.
type ToolShapeKind = 'rectangle' | 'ellipse' | 'diamond'

export type Tool =
  | { kind: 'select' }
  | { kind: 'add-page'; presetIndex?: number; customSize?: boolean; sourcePageId?: string }
  | { kind: 'add-text'; style: 'plain' | 'sticky' }
  | { kind: 'add-document' }
  | { kind: 'add-shape'; shapeKind: ToolShapeKind }
  | { kind: 'comment' }
  | { kind: 'draw'; brush?: 'pen' | 'highlight' }
  | { kind: 'region-select' }
  | { kind: 'inspect' }

export type ToolKind = Tool['kind']

export type ToolDuration = 'one-shot' | 'persistent'

export const toolDuration: Record<ToolKind, ToolDuration> = {
  select: 'persistent',
  'add-page': 'one-shot',
  'add-text': 'one-shot',
  'add-document': 'one-shot',
  'add-shape': 'one-shot',
  comment: 'persistent',
  draw: 'persistent',
  'region-select': 'persistent',
  inspect: 'persistent',
}

export function isOneShot(kind: ToolKind): boolean {
  return toolDuration[kind] === 'one-shot'
}

export function isPersistent(kind: ToolKind): boolean {
  return toolDuration[kind] === 'persistent'
}

export function isAnnotationTool(tool: Tool): boolean {
  return tool.kind === 'comment' || tool.kind === 'draw' || tool.kind === 'region-select'
}

export function isPlacementTool(tool: Tool): boolean {
  return (
    tool.kind === 'add-page' ||
    tool.kind === 'add-text' ||
    tool.kind === 'add-document' ||
    tool.kind === 'add-shape'
  )
}

export function applyPlacementCompletion(current: Tool): Tool {
  return isOneShot(current.kind) ? SELECT_TOOL : current
}

export function applyEscape(_current: Tool): Tool {
  return SELECT_TOOL
}

export const SELECT_TOOL: Tool = { kind: 'select' }

// Page-content overlay vocabulary (legacy IPC). Kept narrow on purpose —
// renderer-side mode that drives the comment-hover affordance vs region-select
// rect, intentionally not part of the unified Tool vocabulary.
export type AnnotateOverlayMode = 'off' | 'comment' | 'draw' | 'region_select'

export function toolAnnotateOverlay(tool: Tool): {
  enabled: boolean
  mode: AnnotateOverlayMode
} {
  if (tool.kind === 'comment') return { enabled: true, mode: 'comment' }
  if (tool.kind === 'draw') return { enabled: false, mode: 'draw' }
  if (tool.kind === 'region-select') return { enabled: false, mode: 'region_select' }
  return { enabled: false, mode: 'off' }
}

// Lowercase gerund for cursor labels, status-bar narration, and live captions.
export function toolGerund(tool: Tool): string {
  switch (tool.kind) {
    case 'select':
      return 'selecting'
    case 'add-page':
      return 'adding page'
    case 'add-text':
      return tool.style === 'sticky' ? 'adding sticky note' : 'adding text'
    case 'add-document':
      return 'adding document'
    case 'add-shape':
      return 'adding shape'
    case 'comment':
      return 'commenting'
    case 'draw':
      return 'drawing'
    case 'region-select':
      return 'selecting region'
    case 'inspect':
      return 'inspecting'
  }
}
