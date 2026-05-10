// Unified Tool concept — see ADR 0005, amended by ADR 0006.

// Mirror of `ShapeKind` to avoid types.ts → tool.ts circular import.
type ToolShapeKind = 'rectangle' | 'ellipse' | 'diamond'

export type DrawingBrushType = 'pen' | 'highlight'

export type Tool =
  | { kind: 'select' }
  | { kind: 'add-page'; presetIndex?: number; customSize?: boolean; sourcePageId?: string }
  | { kind: 'add-text'; style: 'plain' | 'sticky' }
  | { kind: 'add-document' }
  | { kind: 'add-shape'; shapeKind: ToolShapeKind }
  | { kind: 'comment' }
  | { kind: 'draw'; brush?: DrawingBrushType }
  | { kind: 'inspect' }

// Returns the active brush for a draw tool (defaulting to 'pen'), or null if
// the tool isn't a draw tool. Use this everywhere instead of re-deriving the
// `kind === 'draw' && brush === ...` discriminator inline.
export function activeDrawBrush(tool: Tool): DrawingBrushType | null {
  if (tool.kind !== 'draw') return null
  return tool.brush ?? 'pen'
}

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
  inspect: 'persistent',
}

export function isOneShot(kind: ToolKind): boolean {
  return toolDuration[kind] === 'one-shot'
}

export function isPersistent(kind: ToolKind): boolean {
  return toolDuration[kind] === 'persistent'
}

export function isAnnotationTool(tool: Tool): boolean {
  return tool.kind === 'comment' || tool.kind === 'draw'
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
// renderer-side mode that drives the comment-hover affordance, intentionally
// not part of the unified Tool vocabulary.
export type AnnotateOverlayMode = 'off' | 'comment' | 'draw'

export function toolAnnotateOverlay(tool: Tool): {
  enabled: boolean
  mode: AnnotateOverlayMode
} {
  // ADR 0006: comment tool's element/region preview is now painted by the
  // page itself in response to `comment-tool-pointer-state` broadcasts from
  // main; the legacy in-page hover affordance is retired. The overlay mode
  // remains exposed only for `draw` (which still relies on the page-side
  // overlay to suppress native input) and as an `off` no-op default.
  if (tool.kind === 'draw') return { enabled: false, mode: 'draw' }
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
    case 'inspect':
      return 'inspecting'
  }
}
