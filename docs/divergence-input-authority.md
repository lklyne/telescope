# Divergence — Input Authority via Click-to-Enter Frame Focus

> **Branch:** `refactor/input-authority-frame-focus`
> **Plan:** [`docs/plans/input-authority-frame-focus.md`](./plans/input-authority-frame-focus.md)
> **Decision of record:** [`docs/adr/0001-click-to-enter-frame-focus.md`](./adr/0001-click-to-enter-frame-focus.md)

This document tracks where the implementation diverged from the plan. The architectural deepening is landed: canvas gestures route through aboveView, shared pure helpers define hit/resize/edge behavior, and bgView/page-content canvas gesture paths are gone or visual/native-only.

---

## Status

| Phase | State |
|---|---|
| Phase 0 (substrate) | ✅ landed earlier |
| Phase 1 (focus state machine + click-to-enter) | ✅ landed earlier |
| Phase 2 (architectural deepening + router substrate) | ✅ landed in this branch |
| Phase 2 (drawing inline menu retired) | ✅ landed — one bgView-broken surface eliminated outright |
| Phase 2 (gate-predicate flip to default-open) | ✅ landed via ADR 0002 — `shouldGateBeOpen` returns `true` in canvas mode |
| Phase 3 (demolition of bgView per-layer pointer hooks) | ✅ landed — bgView selection/resize/edge/group hooks deleted or visual-only; page-content select/group-drag/marquee canvas IPC removed. ESLint `no-mouse-events` stays at `warn` until remaining native/editing handlers are audited. |

**Tests:** 342/342 unit pass. `pnpm typecheck` clean. Smoke runs match baseline.

---

## What landed — the architectural deepening

ADR 0001 calls for "single hit-test authority, testable without DOM." That is now true: every gesture has one canonical home as a pure module in `src/shared/`, with comprehensive unit tests, and the router (`src/renderer/above-view/useCanvasPointerRouter.ts`) is the single dispatch point.

### Pure modules (src/shared)

| Module | Lines | Tests | What it owns |
|---|---|---|---|
| `hit-test.ts` | 257 | 10 | Priority-ordered hit classification (resize-handle > chrome > anchor > body > background). Moved from `src/main/runtime/`. |
| `interaction-priority.ts` | 17 | — | The `HitLayer` enum + ordered table the hit-tester walks. |
| `canvas-pointer-actions.ts` | 121 | 11 | `routePointerDown(target, ctx) → CanvasPointerAction`. Pure mapper from hit + context to typed action descriptor. Includes the **issue #41 regression test**. |
| `resize-accumulator.ts` | 222 | 16 | Aspect-lock arithmetic, corner/edge flip math, delta accumulation, min-size clamping. |
| `edge-drag-controller.ts` | 296 | 17 | State machine for anchor → edge gestures: `idle → create | edit → committed | cancelled`. Owns `findClosestAnchorTarget`, `findEdgeAtAnchor`, `buildBezierPath`. Lifted out of `EdgeLayer.tsx`. |

### Router (renderer)

`src/renderer/above-view/useCanvasPointerRouter.ts` — one window-level capture-phase pointerdown listener. Reads `layoutData`, runs `hitTest()`, calls `routePointerDown()`, dispatches the action. The dispatcher implements every kind:

- `enter-frame-focus` → `api.enterFrameFocus(frameId)` (programmatic page focus)
- `toggle-select` → frame/entity/group select with shift modifiers
- `begin-entity-drag` → select + `startDragFrame`/`startDragEntity` + window-level move/up forwarding deltas
- `begin-group-drag` → `GROUP_DRAG_THRESHOLD` click-vs-drag heuristic, `startDragGroup` + delta forwarding
- `begin-resize` → entity lookup → `startResize` + `applyHandleDelta` (accumulator) → kind-specific `update*Entity` IPC
- `begin-edge-drag` → controller `beginEdgeDrag` → snap updates on move → `commitEdgeDrag`/`commitEdgeEdit`/`discardEdgeEdit`/`cancelEdgeDrag` on up
- `begin-marquee` → selection-overlay rect updates + `canvasSelectInRect`
- `begin-pan` → `canvasPan(dx, dy)` per tick
- `background-click` → `canvasDeselect`

### Aboveview visual support

`src/renderer/above-view/EdgeDragLayer.tsx` — renders the rubber-band SVG path during an in-progress edge drag, driven by the same `EdgeDragState` the controller produces. Replaces the inline SVG that used to live in `EdgeLayer.tsx`'s React state.

### Frame-focus exit detection

`src/main/runtime/frame-focus-escape.ts` — `globalShortcut('Escape')` registered on focus enter, unregistered on exit. Fixes the Phase 1 flaky-Escape gap without depending on the page-side `before-input-event` reliability. The page-side handler stays in place as a fallback.

`canvas-frame-focus-enter` IPC channel + preload bridge let the router promote a frame to focused programmatically. The handler updates state and calls `webContents.focus()` inside `withFocusEventsSuppressed` so the resulting focus event isn't double-classified.

---

## Why the predicate flip is deferred

The plan's Phase 2 Step 1 collapses the gate predicate to:

```ts
if (frameFocus) return false
if (viewMode === 'canvas') return true
return browserModeNeedsGate(...)
```

I attempted this and rolled back. The flip makes `aboveView` cover the entire canvas region whenever no frame is focused. **`aboveView` sits z-above `chromeView`** (per `LAYER_STACK` in `src/main/runtime/layer-stack.ts`) and the OS routes pointer events to the topmost WCV at a given pixel. Net effect: clicking the URL bar / nav buttons / chrome action menus stops working. The same is true for any other interactive bgView surface the router doesn't yet hit-test for:

| bgView interactive surface | Status post-flip without further migration |
|---|---|
| `chromeView` URL bar, nav buttons | Broken — migration to aboveView decided (see below) |
| Group rename label (above group bounds) | Broken (clicks fall outside any router hit-region → background marquee) |
| Inline text edit trigger (double-click on text entity) | Broken (router only handles pointerdown) |
| ~~Saved drawing inline menu~~ | ✅ retired — delete via select+delete or right-details panel |
| File chrome buttons | Broken |

Each of these needs to either (a) move into aboveView's React tree, or (b) gain a richer `HitPayload` kind so the router can route to it. That's the next focused refactor; it's distinct from the work that landed tonight.

---

## Recommended next sequence

**Superseded by [ADR 0002 — Canvas-anchored overlay UI in aboveView](./adr/0002-canvas-anchored-overlay-ui.md).** Read the ADR first; it captures Shape B (entity rect = body + chrome as one layout unit), the `CanvasItemChrome` / `CanvasItemPopup` / `useAnchoredPosition` primitives, and the single-PR landing plan that flips the gate and demolishes the parallel input path together.

Entry point next session: ADR 0002 §"Landing as a single PR" — a 9-step ordered list. Step 1 is `src/shared/entity-chrome-slots.ts` (pure module + tests).

---

## Testing additions in this branch

| Test file | Cases | Covers |
|---|---|---|
| `tests/unit/canvas-pointer-actions.test.ts` | 11 | Routing matrix + #41 anchor-near-chrome regression |
| `tests/unit/resize-accumulator.test.ts` | 16 | Corner/edge math, aspect-lock both modes, min-size clamp, zoom division, accumulator mutation |
| `tests/unit/edge-drag-controller.test.ts` | 17 | State machine transitions, snap targeting, commit/cancel outcomes, bezier path build |
| `tests/unit/gate-predicate.test.ts` | +3 | Frame-focus forced-closed branch |

---

## File map (additions in this branch)

```
src/shared/
  hit-test.ts                Moved from src/main/runtime/
  interaction-priority.ts    Moved from src/main/runtime/
  canvas-pointer-actions.ts  NEW — routing descriptor
  resize-accumulator.ts      NEW — pure resize math
  edge-drag-controller.ts    NEW — pure edge-drag state machine

src/main/runtime/
  frame-focus-escape.ts      NEW — globalShortcut Escape fallback
src/main/ipc/
  register-canvas-ipc.ts     +canvas-frame-focus-enter handler
src/preload/
  canvas-bg.ts               +enterFrameFocus

src/renderer/above-view/
  useCanvasPointerRouter.ts  NEW — single window-level pointerdown router
  EdgeDragLayer.tsx          NEW — rubber-band visual

src/renderer/canvas-bg/
  entityConstants.ts         Re-exports resize ADT from src/shared/
  ResizeHandles.tsx          Visual handles only; router owns resize input

docs/
  interaction-layer.md       §4.2/§4.2.1/§4.7/§6 amended
  divergence-input-authority.md  This file

tests/unit/
  canvas-pointer-actions.test.ts  NEW
  resize-accumulator.test.ts      NEW
  edge-drag-controller.test.ts    NEW
  gate-predicate.test.ts          +frame-focus branches
  hit-test.test.ts                Updated import path
```
