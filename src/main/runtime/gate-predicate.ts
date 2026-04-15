/**
 * Gate predicate — should the aboveView overlay cover the canvas?
 *
 * Spec §4.2. The gate is open (non-zero bounds) whenever the canvas surface
 * needs to intercept pointer input or paint canvas-level UI: during any
 * non-idle gesture, while a non-select tool is armed, while space-pan is
 * held, while a marquee is showing,
 * while a selected text/drawing entity's inline menu is on screen, and
 * while saved drawings are visible above unselected frames.
 *
 * The predicate is pure and testable. Its authority is main: the renderer
 * no longer drives `setCommentOverlayActive`.
 */
import type { InteractionMode } from '../../shared/interaction-types'
import type { CanvasEntityKind } from '../../shared/types'

export type GateInputs = {
  interactionKind: InteractionMode['kind']
  toolMode: 'select' | 'inspect' | 'annotate-comment' | 'annotate-draw' | 'annotate-region-select'
  viewMode: 'canvas' | 'browser'
  /** Imperative override set by IPC handlers that open annotation/comment UI. */
  commentOverlayActive: boolean
  selectionMarqueeVisible: boolean
  spaceHeld: boolean
  hoveringCanvasChrome: boolean
  selectedEntityIds: readonly string[]
  selectedEntityKinds: readonly CanvasEntityKind[]
  hasSavedDrawings: boolean
}

export function shouldGateBeOpen(inputs: GateInputs): boolean {
  if (inputs.interactionKind !== 'idle') return true
  if (toolModeOpensGate(inputs.toolMode)) return true
  if (inputs.commentOverlayActive) return true
  if (inputs.spaceHeld) return true
  if (inputs.hoveringCanvasChrome) return true
  if (inputs.selectionMarqueeVisible) return true
  if (hasFloatingMenu(inputs)) return true
  if (hasVisibleSavedDrawings(inputs)) return true
  return false
}

/**
 * Tool modes that need the gate pre-armed to paint canvas-level UI above
 * frames (draw strokes, region-select marquee). `annotate-comment` and
 * `inspect` are excluded: they rely on the frame's own webContents receiving
 * mousemove to drive the DOM inspection eyedropper. The gate reopens via
 * `commentOverlayActive` once the user picks an element and the composer
 * opens.
 */
function toolModeOpensGate(toolMode: GateInputs['toolMode']): boolean {
  return toolMode === 'annotate-draw' || toolMode === 'annotate-region-select'
}

function hasFloatingMenu(inputs: GateInputs): boolean {
  if (inputs.viewMode !== 'canvas') return false
  if (inputs.selectedEntityIds.length !== 1) return false
  const kind = inputs.selectedEntityKinds[0]
  return kind === 'text' || kind === 'drawing'
}

/**
 * Saved drawings render above frames unless a frame is selected (then we
 * yield so the user can interact with the frame's webContents natively).
 */
function hasVisibleSavedDrawings(inputs: GateInputs): boolean {
  if (!inputs.hasSavedDrawings) return false
  const frameSelected = inputs.selectedEntityKinds.some((k) => k === 'frame')
  return !frameSelected
}
