/**
 * Pure mapper from HitTarget + context to a typed ActionDescriptor.
 *
 * The canvas-pointer-router (renderer or main) calls this on pointerdown to
 * decide which IPC action to dispatch. Keeping this as a pure function makes
 * the routing matrix testable in isolation of Electron and DOM — every cell
 * in the HitPayload × modifier-state grid can be exercised by a unit test.
 *
 * See docs/adr/0001-click-to-enter-frame-focus.md for the layer priority.
 */

import type { CanvasEntityKind, EdgeSide, SelectionModifiers } from './types'
import type { HitPayload, HitTarget, ResizeHandle } from './hit-test'

export type CanvasPointerContext = {
  /** Currently-selected entity ids in main's authoritative state. */
  selectedEntityIds: readonly string[]
  /** True when a frame is currently focused (page receives native input). */
  frameFocused: boolean
  /** True for left-button (button === 0) primary clicks; false for middle/right. */
  isPrimaryButton: boolean
  modifiers: SelectionModifiers
  /** Hold-to-pan modifier (space). */
  spaceHeld: boolean
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
  /** Programmatically promote the frame to focused; subsequent input goes to the page. */
  | { kind: 'enter-frame-focus'; entityId: string }
  /** Begin selecting + dragging an entity (frame, file, text, shape). */
  | { kind: 'begin-entity-drag'; entityId: string; entityKind: CanvasEntityKind; preserveSelection: boolean }
  /** Begin selecting + dragging a group as a unit. */
  | { kind: 'begin-group-drag'; groupId: string; preserveSelection: boolean }
  /** Begin a resize gesture from a handle. */
  | { kind: 'begin-resize'; entityId: string; entityKind: CanvasEntityKind; handle: ResizeHandle }
  /** Begin an edge-create drag from an anchor. */
  | { kind: 'begin-edge-drag'; entityId: string; entityKind: CanvasEntityKind; side: EdgeSide }
  /** Modifier-additive selection toggle (no drag). */
  | { kind: 'toggle-select'; entityId: string; entityKind: CanvasEntityKind }
  /** Background click — clears selection unless modifier-additive. */
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
  // hook handles middle-drag pan independently).
  if (!context.isPrimaryButton) {
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
    case 'frame-body':
      return { kind: 'enter-frame-focus', entityId: payload.entityId }
    case 'entity-body': {
      const additive = isAdditive(context.modifiers)
      if (additive) {
        return { kind: 'toggle-select', entityId: payload.entityId, entityKind: payload.entityKind }
      }
      if (payload.entityKind === 'group') {
        const preserveSelection = context.selectedEntityIds.includes(payload.entityId)
        return { kind: 'begin-group-drag', groupId: payload.entityId, preserveSelection }
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
      return isAdditive(context.modifiers)
        ? { kind: 'background-click' }
        : { kind: 'begin-marquee' }
  }
}

function isAdditive(modifiers: SelectionModifiers): boolean {
  return Boolean(modifiers.shift || modifiers.meta || modifiers.ctrl)
}
