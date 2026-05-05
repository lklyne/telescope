/**
 * Gate predicate — should the aboveView overlay cover the canvas?
 *
 * Spec §4.2. The gate is open (non-zero bounds) whenever the canvas surface
 * needs to intercept pointer input or paint canvas-level UI: during any
 * non-idle gesture, while a non-select tool is armed, while space-pan is
 * held, while a marquee is showing,
 * while a selected drawing entity's inline menu is on screen, and
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
  selectionOwnsFrameContent: boolean
  hasSavedDrawings: boolean
  /** Frame focus (ADR 0001). When set, the focused page receives native input,
   *  so the gate must close so events fall through to the WebContentsView. */
  frameFocus: { id: string } | null
}

export function shouldGateBeOpen(inputs: GateInputs): boolean {
  // Frame focus closes the gate so the focused page receives native input
  // (ADR 0001). Even if a gesture or tool would otherwise open the gate,
  // focused frame interaction takes priority — the user must Escape or
  // click away first.
  if (inputs.frameFocus) return false
  if (interactionOpensGate(inputs.interactionKind)) return true
  if (toolModeOpensGate(inputs.toolMode)) return true
  if (inputs.commentOverlayActive) return true
  if (inputs.spaceHeld) return true
  if (inputs.hoveringCanvasChrome) return true
  if (inputs.selectionMarqueeVisible) return true
  if (inputs.selectionOwnsFrameContent) return true
  if (hasFloatingMenu(inputs)) return true
  if (hasVisibleSavedDrawings(inputs)) return true
  return false
}

function interactionOpensGate(interactionKind: GateInputs['interactionKind']): boolean {
  return interactionKind !== 'idle' && interactionKind !== 'editing-text'
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
  // Sticky-note controls render in bgView so text selection can keep
  // native pointer access to the card and its resize handles.
  return kind === 'drawing'
}

/**
 * Saved drawings render above frames. We only yield the gate when a SINGLE
 * frame is selected — that's the case where the user wants to interact with
 * the frame's webContents natively (scroll, click links, etc.). Multi-select
 * with a frame is a canvas-level gesture (drag, resize a group), not a frame
 * interaction, so drawings should stay visible.
 *
 * We also yield when the user is in a tool mode that needs the frame's
 * webContents to receive events (comment hover, inspect eyedropper).
 * Pending-placement keeps the gate open so drawings stay visible while
 * placing — above-view handles the placement preview and commit itself.
 */
function hasVisibleSavedDrawings(inputs: GateInputs): boolean {
  if (!inputs.hasSavedDrawings) return false
  if (inputs.toolMode !== 'select') return false
  const singleFrameSelected =
    inputs.selectedEntityIds.length === 1 &&
    inputs.selectedEntityKinds[0] === 'frame'
  return !singleFrameSelected
}
