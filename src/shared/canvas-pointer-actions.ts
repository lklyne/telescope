/**
 * Pure mapper from HitTarget + context to a typed ActionDescriptor.
 *
 * The canvas-pointer-router (renderer or main) calls this on pointerdown to
 * decide which IPC action to dispatch. Keeping this as a pure function makes
 * the routing matrix testable in isolation of Electron and DOM — every cell
 * in the HitPayload × modifier-state grid can be exercised by a unit test.
 */

import type { CanvasEntityKind, EdgeSide, SelectionModifiers } from './types'
import type { HitPayload, HitTarget, ResizeHandle } from './hit-test'

export type CanvasPointerContext = {
  /** Currently-selected entity ids in main's authoritative state. */
  selectedEntityIds: readonly string[]
  /** True for left-button (button === 0) primary clicks; false for middle/right. */
  isPrimaryButton: boolean
  /** Which mouse button fired this event ('left'|'middle'|'right'). */
  button: 'left' | 'middle' | 'right'
  modifiers: SelectionModifiers
  /** Hold-to-pan modifier (space). */
  spaceHeld: boolean
  /** Alt held — excluded from the click-on-solo-selected → edit predicate
   *  alongside shift/cmd/ctrl. */
  altHeld: boolean
  /** The entity currently in inline-edit mode, if any. The
   *  click-on-solo-selected → edit predicate is suppressed while another
   *  entity is editing — issue #48's commit-on-click-outside path handles
   *  that case independently. */
  editingEntityId: string | null
}

/**
 * High-level action a router should dispatch in response to a pointerdown.
 *
 * The router translates each into the corresponding IPC call(s). The
 * descriptor stays UI-agnostic — no client coordinates, no event objects —
 * so it can be exercised purely. Drag-style actions return `begin` only;
 * the router is responsible for installing move/up listeners and emitting
 * subsequent updates.
 */
export type CanvasPointerAction =
  /** No-op (e.g. middle-button click on background — handled by viewport pan). */
  | { kind: 'noop' }
  /** Page body click/drag candidate: click selects, drag moves page. */
  | { kind: 'page-body-press'; entityId: string; preserveSelection: boolean }
  /** Page body hit on the **single-selected** page: forward the pointerdown
   *  (and the subsequent move/up) into the page's webContents. PoC for the
   *  always-on aboveView interactive layer. */
  | { kind: 'forward-pointer-down'; entityId: string; button: 'left' | 'middle' | 'right' }
  /** Begin selecting + dragging an entity (page, file, text, shape). */
  | { kind: 'begin-entity-drag'; entityId: string; entityKind: CanvasEntityKind; preserveSelection: boolean }
  /** Click-on-solo-selected text/sticky/shape (or an editable file body)
   *  with no modifier → defer resolution: stationary release fires
   *  `canvas-request-entity-edit`, threshold-crossing pointermove falls
   *  through to entity drag. The router resolves the deferral; this
   *  descriptor only carries the predicate result. File entities only
   *  qualify when their resolved renderer declares `editable: true` in
   *  the plugin registry — non-editable renderers (image, component
   *  placeholder) get `begin-entity-drag` and the click is a clean no-op
   *  on stationary release. See issue #49 / `docs/interaction-layer.md`
   *  §4.2.1. */
  | { kind: 'begin-entity-press'; entityId: string; entityKind: 'text' | 'shape' | 'file' }
  /** Begin selecting + dragging a group as a unit. */
  | { kind: 'begin-group-drag'; groupId: string; preserveSelection: boolean }
  /** Begin a resize gesture from a handle. */
  | { kind: 'begin-resize'; entityId: string; entityKind: CanvasEntityKind; handle: ResizeHandle }
  /** Begin a proportional resize on the multi-selection bounding box. */
  | { kind: 'begin-multi-resize'; handle: ResizeHandle }
  /** Begin an edge-create drag from an anchor. */
  | { kind: 'begin-edge-drag'; entityId: string; entityKind: CanvasEntityKind; side: EdgeSide }
  /** Modifier-additive selection toggle (no drag). */
  | { kind: 'toggle-select'; entityId: string; entityKind: CanvasEntityKind }
  /** Background click/drag candidate — clears on click, marquee-selects after threshold. */
  | { kind: 'background-click' }
  /** Background drag — start marquee. Renderer is the coordinator since
   *  marquee feedback is renderer-local. */
  | { kind: 'begin-marquee' }
  /** Hold-to-pan on background. */
  | { kind: 'begin-pan' }

/**
 * Map a hit-test result + context to the action a pointerdown should trigger.
 *
 * Caller is responsible for actually firing the IPC. This function never
 * mutates state — returning a plain descriptor keeps the routing matrix
 * pure and exhaustively testable.
 */
export function routePointerDown(
  target: HitTarget,
  context: CanvasPointerContext,
): CanvasPointerAction {
  // Non-primary buttons on background → pan; otherwise no-op (the viewport
  // hook handles middle-drag pan independently). Right-click on the body of
  // the single-selected page still forwards so the page's context menu
  // wins (PoC §5 — Chromium fires `context-menu` natively).
  if (!context.isPrimaryButton) {
    if (
      target.payload.kind === 'page-body' &&
      isSingleSelected(context, target.payload.entityId)
    ) {
      return {
        kind: 'forward-pointer-down',
        entityId: target.payload.entityId,
        button: context.button,
      }
    }
    if (target.payload.kind === 'background') return { kind: 'noop' }
    return { kind: 'noop' }
  }

  // Space-held on background → pan, regardless of selection state.
  if (context.spaceHeld && target.payload.kind === 'background') {
    return { kind: 'begin-pan' }
  }

  return routeByPayload(target.payload, context)
}

function routeByPayload(
  payload: HitPayload,
  context: CanvasPointerContext,
): CanvasPointerAction {
  switch (payload.kind) {
    case 'resize-handle':
      return {
        kind: 'begin-resize',
        entityId: payload.entityId,
        entityKind: payload.entityKind,
        handle: payload.handle,
      }
    case 'multi-resize-handle':
      return { kind: 'begin-multi-resize', handle: payload.handle }
    case 'chrome': {
      const additive = isAdditive(context.modifiers)
      if (additive) {
        return { kind: 'toggle-select', entityId: payload.entityId, entityKind: payload.entityKind }
      }
      const preserveSelection = context.selectedEntityIds.includes(payload.entityId)
      return {
        kind: 'begin-entity-drag',
        entityId: payload.entityId,
        entityKind: payload.entityKind,
        preserveSelection,
      }
    }
    case 'anchor':
      return {
        kind: 'begin-edge-drag',
        entityId: payload.entityId,
        entityKind: payload.entityKind,
        side: payload.side,
      }
    case 'page-body':
      // Additive modifier wins over the forward-into-page shortcut: shift/
      // cmd-click on the page body must reach the selection system so users
      // can extend a multi-selection from a single-selected page (the page
      // content blocker is removed in that state, so the click would
      // otherwise land in the webpage). Mirrors `chrome` and `entity-body`.
      if (isAdditive(context.modifiers)) {
        return { kind: 'toggle-select', entityId: payload.entityId, entityKind: 'page' }
      }
      // PoC: on the single-selected page's body, forward the pointer event
      // into the page so the user interacts with web content directly.
      // Otherwise (unselected or multi-selected) keep the existing
      // click-to-select / drag-to-move behavior.
      if (isSingleSelected(context, payload.entityId)) {
        return {
          kind: 'forward-pointer-down',
          entityId: payload.entityId,
          button: context.button,
        }
      }
      return {
        kind: 'page-body-press',
        entityId: payload.entityId,
        preserveSelection: context.selectedEntityIds.includes(payload.entityId),
      }
    case 'entity-body': {
      const additive = isAdditive(context.modifiers)
      if (additive) {
        return { kind: 'toggle-select', entityId: payload.entityId, entityKind: payload.entityKind }
      }
      if (payload.entityKind === 'group') {
        const preserveSelection = context.selectedEntityIds.includes(payload.entityId)
        return { kind: 'begin-group-drag', groupId: payload.entityId, preserveSelection }
      }
      // Click-on-solo-selected text/sticky/shape (or an editable file)
      // with no modifier and no active inline edit → defer: a stationary
      // release becomes `canvas-request-entity-edit`, threshold-crossing
      // movement falls through to drag. The pure mapper only encodes the
      // predicate; the hook resolves the deferral. File entities qualify
      // when the hit-test payload carries `rendererEditable === true`
      // (see `getRendererEditableFor` / plugin claims) so non-editable
      // file renderers gracefully fall through to the normal drag path.
      // Group/drawing/page keep their kind-specific routes.
      const pressKindEligible =
        (payload.entityKind === 'text' ||
          payload.entityKind === 'shape' ||
          (payload.entityKind === 'file' && payload.rendererEditable === true)) &&
        !context.altHeld &&
        context.editingEntityId === null &&
        isSingleSelected(context, payload.entityId)
      if (pressKindEligible) {
        return {
          kind: 'begin-entity-press',
          entityId: payload.entityId,
          entityKind: payload.entityKind as 'text' | 'shape' | 'file',
        }
      }
      const preserveSelection = context.selectedEntityIds.includes(payload.entityId)
      return {
        kind: 'begin-entity-drag',
        entityId: payload.entityId,
        entityKind: payload.entityKind,
        preserveSelection,
      }
    }
    case 'background':
      return { kind: 'background-click' }
  }
}

function isAdditive(modifiers: SelectionModifiers): boolean {
  return Boolean(modifiers.shift || modifiers.meta || modifiers.ctrl)
}

function isSingleSelected(context: CanvasPointerContext, entityId: string): boolean {
  return (
    context.selectedEntityIds.length === 1 && context.selectedEntityIds[0] === entityId
  )
}

// ---------------------------------------------------------------------------
// Double-click routing (ADR 0002 §"Landing as a single PR" Step 6)
// ---------------------------------------------------------------------------

/**
 * Action a router should dispatch in response to a pointer double-click.
 *
 * Single-click is the dominant input verb (handled by `routePointerDown`);
 * dbl-click reserved for in-place edit affordances and group descent. The
 * router translates each into the corresponding IPC call(s).
 */
export type CanvasPointerDoubleClickAction =
  | { kind: 'noop' }
  /** Enter inline edit on any editable canvas item (text, sticky, shape).
   *  Group rename is dispatched by the rename label's own dblclick (chrome
   *  hit) and group-body dblclick still descends via `enter-group`. */
  | { kind: 'request-entity-edit'; entityId: string }
  | { kind: 'enter-group'; groupId: string }
  | { kind: 'enter-group-rename'; groupId: string }

export function routePointerDoubleClick(
  target: HitTarget,
): CanvasPointerDoubleClickAction {
  switch (target.payload.kind) {
    case 'chrome':
      // Group chrome → rename. Page/file chrome dbl-click is a no-op
      // (chrome owns its own click handlers in aboveView).
      if (target.payload.entityKind === 'group') {
        return { kind: 'enter-group-rename', groupId: target.payload.entityId }
      }
      return { kind: 'noop' }
    case 'entity-body':
      switch (target.payload.entityKind) {
        case 'shape':
        case 'text':
          return { kind: 'request-entity-edit', entityId: target.payload.entityId }
        case 'file':
          // File renderers opt into edit via the plugin registry's
          // `editable` flag (broadcast as `rendererEditable` on the scene
          // entity). Image / component placeholders declare false so a
          // dblclick lands as a clean no-op rather than entering
          // `editing-entity` state with no editor on screen.
          return target.payload.rendererEditable === true
            ? { kind: 'request-entity-edit', entityId: target.payload.entityId }
            : { kind: 'noop' }
        case 'group':
          return { kind: 'enter-group', groupId: target.payload.entityId }
        default:
          return { kind: 'noop' }
      }
    default:
      return { kind: 'noop' }
  }
}
