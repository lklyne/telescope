/**
 * Unified Tool concept — see ADR 0005.
 *
 * A Tool is the single representation of "what does my next click/gesture do?".
 * Exactly one tool is active at any moment. One-shot tools auto-revert to
 * `select` after a single placement; persistent tools stay until replaced or
 * dismissed (Escape).
 */

// Local mirror of `ShapeKind` from `./types` to avoid the circular import that
// types.ts → tool.ts would otherwise create. Keep these in sync.
type ToolShapeKind = 'rectangle' | 'ellipse' | 'diamond'

export type Tool =
  | { kind: 'select' }
  | { kind: 'add-page'; presetIndex?: number; customSize?: boolean; sourcePageId?: string }
  | { kind: 'add-text'; style: 'plain' | 'sticky' }
  | { kind: 'add-document' }
  | { kind: 'add-shape'; shapeKind: ToolShapeKind }
  | { kind: 'comment' }
  | { kind: 'draw' }
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

/** True when the active tool is one of the annotation-class tools (formerly
 *  `AnnotationMode !== 'off'`). */
export function isAnnotationTool(tool: Tool): boolean {
  return tool.kind === 'comment' || tool.kind === 'draw' || tool.kind === 'region-select'
}

/** True when the active tool is a one-shot placement tool that adds a new
 *  entity to the canvas on click. */
export function isPlacementTool(tool: Tool): boolean {
  return (
    tool.kind === 'add-page' ||
    tool.kind === 'add-text' ||
    tool.kind === 'add-document' ||
    tool.kind === 'add-shape'
  )
}

/**
 * Reducer for "the user just performed the placement gesture (a click that
 * commits a one-shot tool)." One-shot tools revert to `select`; persistent
 * tools stay where they are. The runtime calls `finishOneShotPlacement` for
 * the side-effectful version.
 */
export function applyPlacementCompletion(current: Tool): Tool {
  return isOneShot(current.kind) ? SELECT_TOOL : current
}

/**
 * Reducer for the Escape key. Always returns `select`, regardless of the
 * current tool. Mirrors the runtime behavior in keyboard-shortcuts.ts.
 */
export function applyEscape(_current: Tool): Tool {
  return SELECT_TOOL
}

export const SELECT_TOOL: Tool = { kind: 'select' }

/**
 * Lowercase gerund for cursor labels, status-bar narration, and live captions.
 * Sentence case is for menus and chrome — gerunds are for narration only.
 */
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
