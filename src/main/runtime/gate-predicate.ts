/**
 * Gate predicate — should the aboveView overlay cover the canvas?
 *
 * Spec §4.2 + ADR 0001. The gate is open (non-zero bounds) whenever
 * aboveView needs to capture pointer input or paint canvas-level UI.
 * Frame focus (ADR 0001) is a hard gate-closer in any mode so the focused
 * page receives native input.
 *
 * The "default-open in canvas mode" target from the plan is *not* yet in
 * effect — it would prevent the per-frame `chromeView` (URL bar, nav
 * buttons) and other bgView interactive surfaces from receiving pointer
 * events. Migrating those into the router or into aboveView is the
 * remaining work that lets the predicate collapse fully (§4.2 of the
 * plan). Until then we keep the legacy OR-chain in canvas mode too, but
 * the canvas-pointer-router is wired so every gate-open situation
 * (gestures, tool modes, etc.) goes through the single hit-test arbiter.
 *
 * Pure and testable. Authority lives in main; the renderer no longer
 * drives `setCommentOverlayActive` for the canvas-mode path.
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
  // PoC (aboveview-interactive-layer-poc.md): aboveView stays default-open in
  // canvas mode regardless of frameFocus. Pointer/wheel events that hit the
  // single-selected frame's body are forwarded into the page from inside
  // aboveView; everything else (chrome, selection outlines, marquee, etc.)
  // keeps painting and intercepting input. The legacy ADR 0001 gate-flip on
  // frameFocus has been retired here.
  // Inspect + annotate-comment drive feedback off the page's webContents
  // mousemove (eyedropper, comment hover). Keep the gate closed unless
  // the comment composer has been opened.
  if (inputs.toolMode === 'inspect' || inputs.toolMode === 'annotate-comment') {
    return inputs.commentOverlayActive
  }
  // Inline text edit owns its bgView textarea — the gate must yield so
  // keystrokes land in the textarea.
  if (inputs.interactionKind === 'editing-text') return false
  // ADR 0002 §"Landing as a single PR" Step 7: in canvas mode the gate is
  // default-open. Every interactive surface that used to live in bgView or
  // a per-page chromeView has migrated into aboveView's React tree and is
  // tagged `data-overlay-ui`, so the canvas-pointer-router yields to them
  // structurally and forwards the rest of the input through itself.
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
