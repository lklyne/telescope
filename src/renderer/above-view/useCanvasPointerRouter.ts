/**
 * Canvas pointer router (ADR 0001 — Phase 2 substrate).
 *
 * Runs the shared `hitTest` against the current layout snapshot on
 * pointerdown and dispatches a typed `CanvasPointerAction` to the existing
 * IPC surface. This is the single arbitration point for canvas pointer
 * events that the plan calls for — hit priority is encoded once, in
 * `src/shared/hit-test.ts`, instead of being scattered across per-layer
 * `onMouseDown` handlers in bgView.
 *
 * Phase 2 wiring strategy: the router is mounted as a parallel path. When
 * the gate predicate keeps aboveView covered (during gestures, marquee,
 * tool modes, etc.), this router intercepts pointerdown at the window
 * level and decides what to do. When the gate is closed (idle canvas with
 * no frame focus today), the bgView per-layer handlers continue to fire
 * unchanged. Phase 3 (demolition) will flip the gate to "always open in
 * canvas mode" and delete the bgView handlers.
 *
 * Hit-test runs purely in the renderer because the layout snapshot it
 * needs (entities, edges, selection, zoom) is already broadcast to
 * aboveView via `layout-update`. An IPC roundtrip per pointerdown adds
 * latency without benefit — see docs/divergence-input-authority.md.
 */

import { useEffect, useRef } from 'react'
import { hitTest, type HitInputs } from '../../shared/hit-test'
import {
  routePointerDown,
  type CanvasPointerAction,
  type CanvasPointerContext,
} from '../../shared/canvas-pointer-actions'
import { isOverlayUiTarget } from '../../shared/gesture-utils'
import type {
  CanvasBgElectronAPI,
  EdgeSide,
  LayoutUpdateData,
  SelectionModifiers,
} from '../../shared/types'

interface UseCanvasPointerRouterOptions {
  api: CanvasBgElectronAPI
  layoutRef: React.MutableRefObject<LayoutUpdateData>
  /** When false, the router does not intercept anything. Useful while
   *  annotations / drawing / region-select own pointer input. */
  enabled: boolean
  /** Hit kinds the router should consume. Other kinds fall through to the
   *  legacy aboveView pointer flow (existing useViewportForwarding hook).
   *  This lets us stage per-layer migration without a flag-day flip. */
  consume: ReadonlySet<CanvasPointerAction['kind']>
  /** Space-modifier state — already tracked by main but mirrored here so
   *  the router can short-circuit pan decisions without an IPC roundtrip. */
  spaceHeldRef: React.MutableRefObject<boolean>
}

const ALL_KINDS: ReadonlySet<CanvasPointerAction['kind']> = new Set<CanvasPointerAction['kind']>([
  'noop',
  'enter-frame-focus',
  'begin-entity-drag',
  'begin-group-drag',
  'begin-resize',
  'begin-edge-drag',
  'toggle-select',
  'background-click',
  'begin-marquee',
  'begin-pan',
])

/** Default consume set for incremental rollout — only the actions whose
 *  legacy bgView handlers have already been migrated. Frame-body focus
 *  enter is the safest first cut since it just programmatically focuses
 *  the page; bgView's existing focus event still works as a backup. */
export const DEFAULT_ROUTER_CONSUME: ReadonlySet<CanvasPointerAction['kind']> = new Set<CanvasPointerAction['kind']>([
  'enter-frame-focus',
])

export const FULL_ROUTER_CONSUME = ALL_KINDS

export function useCanvasPointerRouter(options: UseCanvasPointerRouterOptions): void {
  const { api, layoutRef, enabled, consume, spaceHeldRef } = options
  // Capture refs so the listener doesn't re-attach on every render.
  const apiRef = useRef(api)
  apiRef.current = api
  const consumeRef = useRef(consume)
  consumeRef.current = consume

  useEffect(() => {
    if (!enabled) return

    const handlePointerDown = (event: PointerEvent) => {
      // Don't intercept clicks targeted at floating UI rendered inside
      // aboveView (composers, popovers, FloatingUiLayer chrome).
      if (isOverlayUiTarget(event.target)) return
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return

      const layout = layoutRef.current
      if (layout.viewMode !== 'canvas') return

      // Translate aboveView-local clientY to window-local Y (scene entities
      // use window-relative screenY; aboveView origin sits at canvasOrigin.y).
      const windowY = event.clientY + layout.canvasOrigin.y
      const inputs: HitInputs = {
        entities: layout.entities,
        edges: layout.edges ?? [],
        selectedEntityIds: layout.selectedEntityIds,
        zoom: layout.zoom ?? 1,
      }
      const target = hitTest(inputs, { x: event.clientX, y: windowY })

      const modifiers: SelectionModifiers = {
        shift: event.shiftKey,
        meta: event.metaKey,
        ctrl: event.ctrlKey,
      }
      const context: CanvasPointerContext = {
        selectedEntityIds: layout.selectedEntityIds,
        frameFocused: layout.frameFocus !== null,
        isPrimaryButton: event.button === 0,
        modifiers,
        spaceHeld: spaceHeldRef.current,
      }

      const action = routePointerDown(target, context)
      if (!consumeRef.current.has(action.kind)) return

      const dispatched = dispatch(action, apiRef.current)
      if (dispatched) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true } as EventListenerOptions)
    }
  }, [enabled, layoutRef, spaceHeldRef])
}

/** Translate a CanvasPointerAction into IPC. Returns true if the action
 *  consumed the event; false means the caller should let it fall through. */
function dispatch(action: CanvasPointerAction, api: CanvasBgElectronAPI): boolean {
  switch (action.kind) {
    case 'noop':
      return false
    case 'enter-frame-focus':
      api.enterFrameFocus(action.entityId)
      return true
    case 'toggle-select':
      if (action.entityKind === 'frame') {
        api.selectFrame(action.entityId, { shift: true, meta: false, ctrl: false })
      } else if (action.entityKind === 'group') {
        api.selectGroup(action.entityId)
      } else {
        api.selectEntity(action.entityId, action.entityKind, { shift: true, meta: false, ctrl: false })
      }
      return true
    case 'begin-edge-drag':
      api.beginEdgeDrag(action.entityId, action.side as EdgeSide)
      return true
    // begin-entity-drag, begin-group-drag, begin-resize, begin-marquee,
    // background-click, begin-pan: leave to existing aboveView /
    // useViewportForwarding handlers in this Phase 2 substrate landing.
    // Per-layer migration to dispatch from here is tracked in the plan.
    case 'begin-entity-drag':
    case 'begin-group-drag':
    case 'begin-resize':
    case 'begin-marquee':
    case 'background-click':
    case 'begin-pan':
      return false
  }
}
