/**
 * Gate predicate — should the aboveView overlay cover the canvas?
 *
 * In canvas mode the gate is unconditionally open: aboveView is the
 * interactive layer. Pointer/wheel events that hit the single-selected
 * frame's body are forwarded into the page from inside aboveView; chrome,
 * selection outlines, marquee, drawings, and overlays keep painting and
 * intercepting input there. Browser mode falls through to a narrower
 * OR-chain so the gate stays closed unless a gesture or tool mode needs it.
 *
 * Pure and testable. Authority lives in main.
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
}

export function shouldGateBeOpen(inputs: GateInputs): boolean {
  // Inspect + annotate-comment drive feedback off the page's webContents
  // mousemove (eyedropper, comment hover). Keep the gate closed unless
  // the comment composer has been opened.
  if (inputs.toolMode === 'inspect' || inputs.toolMode === 'annotate-comment') {
    return inputs.commentOverlayActive
  }
  if (inputs.viewMode === 'canvas') return true
  return browserModeNeedsGate(inputs)
}

function browserModeNeedsGate(inputs: GateInputs): boolean {
  if (interactionOpensGate(inputs.interactionKind)) return true
  if (toolModeOpensGate(inputs.toolMode)) return true
  if (inputs.commentOverlayActive) return true
  if (inputs.spaceHeld) return true
  if (inputs.hoveringCanvasChrome) return true
  if (inputs.selectionMarqueeVisible) return true
  if (inputs.selectionOwnsFrameContent) return true
  if (hasVisibleSavedDrawings(inputs)) return true
  return false
}

function interactionOpensGate(interactionKind: GateInputs['interactionKind']): boolean {
  // Inline editors (sticky / shape / markdown / wireframe) render in
  // aboveView, so `editing-text` needs the gate open like every other
  // non-idle interaction kind.
  return interactionKind !== 'idle'
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
