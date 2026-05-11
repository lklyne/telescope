/**
 * Gate predicate — should the aboveView overlay cover the canvas?
 *
 * In canvas mode the gate is unconditionally open: aboveView is the
 * interactive layer. Pointer/wheel events that hit the single-selected
 * page's body are forwarded into the page from inside aboveView; chrome,
 * selection outlines, marquee, drawings, and overlays keep painting and
 * intercepting input there. Browser mode falls through to a narrower
 * OR-chain so the gate stays closed unless a gesture or tool mode needs it.
 *
 * Pure and testable. Authority lives in main.
 */
import type { InteractionMode } from '../../shared/interaction-types'
import type { CanvasEntityKind, Tool } from '../../shared/types'

export type GateInputs = {
  interactionKind: InteractionMode['kind']
  activeTool: Tool
  viewMode: 'canvas' | 'browser'
  /** Imperative override set by IPC handlers that open annotation/comment UI. */
  commentOverlayActive: boolean
  selectionMarqueeVisible: boolean
  spaceHeld: boolean
  hoveringCanvasChrome: boolean
  selectedEntityIds: readonly string[]
  selectedEntityKinds: readonly CanvasEntityKind[]
  selectionOwnsPageContent: boolean
  hasSavedDrawings: boolean
}

export function shouldGateBeOpen(inputs: GateInputs): boolean {
  const toolKind = inputs.activeTool.kind
  // Inspect drives feedback off the page's webContents mousemove
  // (eyedropper). Keep the gate closed unless the comment composer has been
  // opened by a different UI path.
  if (toolKind === 'inspect') {
    return inputs.commentOverlayActive
  }
  if (inputs.viewMode === 'canvas') return true
  return browserModeNeedsGate(inputs)
}

function browserModeNeedsGate(inputs: GateInputs): boolean {
  if (interactionOpensGate(inputs.interactionKind)) return true
  if (toolOpensGate(inputs.activeTool)) return true
  if (inputs.commentOverlayActive) return true
  if (inputs.spaceHeld) return true
  if (inputs.hoveringCanvasChrome) return true
  if (inputs.selectionMarqueeVisible) return true
  if (inputs.selectionOwnsPageContent) return true
  if (hasVisibleSavedDrawings(inputs)) return true
  return false
}

function interactionOpensGate(interactionKind: GateInputs['interactionKind']): boolean {
  // Inline editors (sticky / shape / markdown / wireframe / group rename)
  // render in aboveView, so `editing-entity` needs the gate open like
  // every other non-idle interaction kind.
  return interactionKind !== 'idle'
}

/**
 * Tools that need the gate pre-armed to paint canvas-level UI above pages
 * (draw strokes, comment hover/region preview). Per ADR 0006, the comment
 * tool now captures pointerdown/move/up in the aboveView overlay (not the
 * page) for its full lifecycle — clicks, drags, and the resulting region
 * marquee. `inspect` is excluded: the eyedropper relies on the page's own
 * webContents receiving mousemove. The comment-tool-active gate reopens
 * (via `commentOverlayActive`) once the composer opens.
 */
function toolOpensGate(tool: Tool): boolean {
  return tool.kind === 'draw' || tool.kind === 'comment'
}

/**
 * Saved drawings render above pages. We only yield the gate when a SINGLE
 * page is selected — that's the case where the user wants to interact with
 * the page's webContents natively (scroll, click links, etc.). Multi-select
 * with a page is a canvas-level gesture (drag, resize a group), not a page
 * interaction, so drawings should stay visible.
 *
 * We also yield when the user is in a tool that needs the page's
 * webContents to receive events (inspect eyedropper). Placement tools keep
 * the gate open so drawings stay visible while placing — above-view
 * handles the placement preview and commit itself.
 */
function hasVisibleSavedDrawings(inputs: GateInputs): boolean {
  if (!inputs.hasSavedDrawings) return false
  if (inputs.activeTool.kind !== 'select') return false
  const singlePageSelected =
    inputs.selectedEntityIds.length === 1 &&
    inputs.selectedEntityKinds[0] === 'page'
  return !singlePageSelected
}
