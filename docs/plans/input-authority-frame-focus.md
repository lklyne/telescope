# Plan — Input authority via click-to-enter frame focus

> **Status:** Phase 0 + Phase 1 complete. **Phase 2 substrate landed** (pure router, tests including #41 regression, Escape globalShortcut fallback, `enterFrameFocus` IPC, hit-test promoted to `src/shared/`). **Per-layer migration + gate-predicate flip deferred** for interactive validation. Phase 3 not started.
>
> **Decision of record:** [`docs/adr/0001-click-to-enter-frame-focus.md`](../adr/0001-click-to-enter-frame-focus.md)
> **Divergence log:** [`docs/divergence-input-authority.md`](../divergence-input-authority.md) — read this first if picking up after the autonomous overnight session of 2026-05-05.
>
> **Closes:** [#41](https://github.com/lklyne/specular/issues/41) once full Phase 2 (per-layer migration + predicate flip) lands.

This document is the single source of truth for picking up this refactor in a new session. Read the ADR first; it captures the design decisions (total focus, click-to-enter, 5-layer hit-region priority table). This file tracks **what's built, what's deferred, and the precise next steps**.

---

## Architecture, in one paragraph

Frames stay live `WebContentsView`s at all times — they paint, run JS, play media. They do not receive native pointer input until explicitly **focused**. Focus is a main-process variable (`frameFocus: { id, since } | null`). Click a frame's body → focus enters → page receives native input. Click anywhere else → page blurs → focus exits. Escape exits. The input gate (`aboveView`) becomes always-on when `frameFocus === null`; main runs a hit-test against a 5-layer priority table (`resize-handles > chrome > anchors > body > background`) to classify pointer events. Replaces the per-bgView-layer pointer arbitration that produced the bug class in #41.

---

## Phase 0 — Substrate (DONE)

Pure, testable foundations. Nothing wired to runtime input yet.

### Files added

| File | What |
|---|---|
| `src/shared/hit-regions.ts` | `HitRegion` ADT (`rect | disc | stroke`) + pure containment helpers. Screen-space. No React, no Electron. |
| `src/main/runtime/interaction-priority.ts` | `HitLayer` enum + `HIT_LAYER_ORDER` (the 5 layers, top wins). |
| `src/main/runtime/hit-test.ts` | Per-layer selectors + top-down `hitTest(inputs, point) → HitTarget`. Returns a tagged `HitPayload` (`resize-handle | chrome | anchor | frame-body | entity-body | background`). |
| `tests/unit/hit-regions.test.ts` | 10 tests for the ADT. |
| `tests/unit/hit-test.test.ts` | 10 tests covering #41 collision classes (anchor near chrome, handle near body, group containment, frame-body vs entity-body kind dispatch, background fallback). |

### Files modified

| File | Change |
|---|---|
| `src/main/runtime/page-factory.ts` | Opt-in spike instrumentation behind `BLUR_SPIKE=1` (logs page focus/blur/devtools events). |

### Spike protocol

[`docs/plans/blur-spike-protocol.md`](./blur-spike-protocol.md) — 9-scenario manual protocol to validate `webContents.blur` reliability for option B (the chosen exit-detection mechanism). **Mostly validated implicitly during Phase 1 manual testing**: blur fires on click-away across canvas/sidebar/other-frames; DevTools attach is correctly treated as a companion (focus state stays).

### Verification

- `pnpm test:unit` → all green
- `pnpm typecheck` → clean

---

## Phase 1 — Frame focus state, end-to-end (DONE)

Goal: ship a cohesive testable slice — focus state, click-to-enter, blur-exit, focus ring — without flipping the input gate. The existing bgView pointer handlers stay in place and intact.

### Files added

| File | What |
|---|---|
| `src/main/runtime/frame-focus.ts` | State machine: `enterFrameFocus`, `exitFrameFocus`, `exitFrameFocusIfMatches`, `currentFrameFocus`, `withFocusEventsSuppressed`, `subscribeFrameFocus`. Pure module — no Electron imports. |
| `tests/unit/frame-focus.test.ts` | 12 tests for the state machine. |
| `tests/smoke/frame-focus.test.ts` | 6 smoke tests via the test HTTP routes. |

### Files modified

| File | Change |
|---|---|
| `src/main/runtime/page-factory.ts` | Page `webContents` listeners: `focus` → `enterFrameFocus(page.id)` (gated on canvas mode + `!isLoading()` + `!areFocusEventsSuppressed()`); `blur` → `exitFrameFocus('blur')`; `removePageAtIndex` calls `exitFrameFocusIfMatches`. |
| `src/main/runtime/focus-reconciler.ts` | New `focusedFrameId` field on `FocusState`. `expectedFocus` routes to the focused page in idle canvas mode, yields to active gestures and comment overlay. |
| `src/main/runtime/focus-reconciler-runtime.ts` | Wraps programmatic `target.focus()` in `withFocusEventsSuppressed` so the resulting `focus` event isn't classified as a user click. |
| `src/main/runtime/keyboard-shortcuts.ts` | Escape → `exitFrameFocus('escape')`. **⚠ Confirmed flaky in user testing — see "Known issues" below.** |
| `src/main/runtime/selection-state.ts` | View-mode switch → `exitFrameFocus('view-mode-switch')`. |
| `src/main/runtime/canvas-layout-data.ts` | Adds `frameFocus: currentFrameFocus()` to the canvas layout broadcast. |
| `src/shared/types.ts` | `LayoutUpdateData.frameFocus: { id, since } | null`. |
| `src/renderer/canvas-bg/canvasBgConstants.ts` | `EMPTY_LAYOUT.frameFocus = null`. |
| `src/renderer/canvas-bg/FrameBorderLayer.tsx` | Renders an accent ring around the focused frame (uses `var(--accent)` with a soft outer glow). |
| `src/renderer/canvas-bg/App.tsx` | Threads `focusedFrameId={layoutData.frameFocus?.id ?? null}` into `FrameBorderLayer`. |
| `src/main/routes/test.ts` | Test routes: `GET /test/frame-focus/current`, `POST /test/frame-focus/enter`, `POST /test/frame-focus/exit`. |
| `tests/smoke/app-client.ts` | Client helpers: `getFrameFocus`, `enterFrameFocus`, `exitFrameFocus`. |
| `tests/unit/focus-reconciler.test.ts` | Adds 4 tests for the `focusedFrameId` branch. |

### Behavior delivered

Confirmed working in `pnpm dev`:

1. Click a frame body → page gains native focus → accent ring appears.
2. Click another frame's body → ring moves; focus swaps via blur.
3. Click canvas background or sidebar → ring disappears.
4. Delete the focused frame → focus clears.
5. Toggle view mode (canvas ↔ browser) → focus clears.
6. Open DevTools for the focused frame → ring stays (DevTools is a companion).

### Tests

- 296 unit tests pass
- 6 frame-focus smoke tests pass
- 3 pre-existing smoke flakes in `agent-canvas`, `cdp-proxy`, `selection` — verified by stash to be unrelated to this change

---

## Phase 2 — Flip the gate (NOT STARTED — pick up here)

This is where the **#41 bug class actually gets eliminated**. `aboveView` becomes the single input authority in canvas mode; main classifies pointer events via the priority table; the per-bgView-layer pointer handlers become vestigial (and get demolished in Phase 3).

### Pre-flight: diagnose the Escape bug

Before flipping the gate, determine why `before-input-event` on a focused page's `webContents` doesn't reach the Escape branch in `keyboard-shortcuts.ts`. Three possibilities, in likelihood order:

1. The page consumes Escape natively before `before-input-event` fires (unlikely — Electron docs say `before-input-event` is preempt). Verify with diagnostic logging.
2. `isTextEditingActive()` returns true when the user types in a page-internal input (would early-bail before reaching the Escape branch). Check `setTextEditingActive` callers.
3. `before-input-event` has a known limitation on `WebContentsView` that we haven't accounted for.

**To investigate:** re-add the diagnostic logs that were on this branch briefly (see git history for keyboard-shortcuts.ts during the Phase 1 session). They print `[frame-focus] before-input-event fired` and `[frame-focus] escape pressed` with the `webContentsId`, `handleShortcuts`, `textEditingActive`, and `focused` state. Run `pnpm dev`, focus a frame, press Escape, observe terminal.

If `before-input-event` doesn't fire, fall back: register a `globalShortcut` for Escape, gated on `currentFrameFocus()`. This bypasses page consumption.

### Step 1 — Replace the gate predicate

**File:** `src/main/runtime/gate-predicate.ts` (and its test `tests/unit/gate-predicate.test.ts`)

Today the predicate is open by gesture/tool-mode/space-pan/etc. After Phase 2 it should be:

```ts
function shouldGateBeOpen(inputs: GateInputs): boolean {
  // Frame focus closes the gate so the focused page receives native input.
  if (inputs.frameFocus) return false
  // Otherwise: open by default in canvas mode; closed in browser mode
  // unless an active gesture/overlay needs it.
  if (inputs.viewMode === 'canvas') return true
  // Browser-mode rules (port the existing OR-chain).
  return browserModeNeedsGate(inputs)
}
```

Add `frameFocus: { id: string } | null` to `GateInputs`. Plumb through from `currentFrameFocus()` at the call site in `layout-engine.ts`.

**Update `tests/unit/gate-predicate.test.ts`** to cover the new branches.

### Step 2 — aboveView pointer ingestion

`aboveView` currently only handles zoom/pan and selection-overlay rendering. Phase 2 adds canvas-region pointer event capture.

**Files to add/modify:**
- `src/preload/above-view.ts` — expose `canvasPointerEvent` IPC sender + `onPointerHitResult` listener.
- `src/renderer/above-view/App.tsx` — register a single root `pointerdown` (and `pointermove` / `pointerup` during active gestures) listener that forwards to main.
- `src/main/runtime/canvas-pointer-router.ts` (new) — IPC handler that calls `hitTest()` from `src/main/runtime/hit-test.ts`, then routes the result.

**Routing table** (matches the Phase 0 `HitPayload` ADT):

| Payload kind | Action |
|---|---|
| `frame-body` | `enterFrameFocus(payload.entityId)` — closes gate, page receives subsequent input |
| `entity-body` | Selection mutation via existing `selection-controller` |
| `chrome` | Begin chrome drag via existing chrome-drag begin (currently in `useFrameChromeDrag`) |
| `anchor` | Begin edge drag via existing `beginEdgeDrag` IPC |
| `resize-handle` | Begin entity resize via existing `useEntityResize` begin |
| `background` | Begin marquee or pan based on modifiers (existing `useCanvasViewportGestures` logic) |

**Critical detail:** Phase 2 routes through aboveView but reuses the *existing* main-side gesture begin/update/commit logic. The bgView per-layer handlers continue to exist; they just stop being the only entry point. This minimizes Phase 2 churn — the demolition is Phase 3.

### Step 3 — Per-layer migration sequence

Migrate one layer at a time, ship each independently, smoke-test each before moving on. Order matches priority (top first so collisions resolve in favor of higher-priority layers as you migrate down):

1. **Resize handles** — top priority, smallest blast radius, easiest to test.
2. **Chrome** — `useFrameChromeDrag.ts`. Smoke: drag chrome via aboveView path → frame's `canvasX/canvasY` updates.
3. **Anchors** — edge anchor rings. Smoke: drag from anchor via aboveView → edge created. **This is the #41 regression test:** click in the anchor/chrome overlap zone → assert chrome wins, not anchor.
4. **Entity bodies** — text/file/shape/drawing select + drag. Smoke: click body → selection state updated.
5. **Group bounds** — `useGroupBoundsDrag.ts`. Smoke: drag group bounds → group canvasX/canvasY updates.
6. **Background** — marquee + pan. Already partially through aboveView via `useCanvasViewportGestures`; verify unification.

After each layer migrates, promote its `no-mouse-events` ESLint exemption to error.

### Step 4 — Spec amendment

Update `docs/interaction-layer.md` to reflect the new reality:

- **§4.2** — `shouldGateBeOpen` simplifies to "open in canvas mode iff `frameFocus === null`."
- **§4.7** — Bitmap compositor marked optional (no longer load-bearing for input authority; only for memory/perf if N-live-frame regresses).
- **§6 (invariants)** — I7 wording reflects single always-on gate with frame-focus carve-out instead of the old multi-input gate-open conditions.

### Step 5 — Regression test for #41

Add `tests/smoke/issue-41-anchor-near-chrome.test.ts`:

```ts
// Create a frame, select it (anchors visible).
// Compute the screen point that overlaps both chrome and anchor.
// Send a synthetic pointer event via the canvas-pointer-router.
// Assert: chrome target wins (selection state, not edge drag start).
```

### Phase 2 verification gates

- All Phase 1 smoke tests still pass
- New per-layer smoke tests for each migrated layer
- Issue #41 regression test passes
- `pnpm typecheck` clean
- Manual: every gesture mode still feels right (drag, resize, marquee, pan, edge create, edge select)

---

## Phase 3 — Demolition (NOT STARTED)

After Phase 2 stable across all layers. The bug class can't return because the parallel input path is gone.

### Files to delete

- `src/renderer/canvas-bg/useFrameChromeDrag.ts`
- `src/renderer/canvas-bg/useGroupBoundsDrag.ts`
- `src/renderer/canvas-bg/useEntityResize.ts`
- `src/renderer/canvas-bg/useMultiSelectionResize.ts`
- The drawing-tool raw `addEventListener('mousemove'/'mouseup')` block in `src/renderer/canvas-bg/App.tsx` (around lines 412-443 at time of writing — replace with a `useDragGesture` consumer in aboveView).

### Files to modify

- `src/renderer/canvas-bg/App.tsx` — remove `handleChromeMouseDown` and similar props-drilled handlers.
- All bgView layer components (`FrameChromeLayer.tsx`, `EdgeLayer.tsx`, `EntityBlockLayers.tsx`, `ResizeHandles.tsx`, `SelectionResizeGrid.tsx`, `GroupBoundsLayer.tsx`, `ShapeBlockLayer.tsx`) — delete `onMouseDown` props and `closest('[data-overlay-ui]')` checks.
- Remove `data-overlay-ui` markers everywhere.
- ESLint `no-mouse-events` rule promotes from per-file warning to project-wide error.

---

## Known issues / open questions

| Item | Status | Notes |
|---|---|---|
| Escape doesn't exit focus | **Bug — defer to Phase 2 pre-flight** | See "Pre-flight" above. Diagnostic logs were briefly on this branch and reverted; re-add to investigate. |
| Two-click semantics for click-away-then-interact | Works as expected today | Click-away fires blur which exits focus; the click that exited does NOT also interact (it landed on background/sidebar). The next click is fresh. ADR 0001's "two clicks to act on another canvas element" emerges naturally. |
| Page modals that rely on Escape | Acceptable per ADR | When focused, the user's Escape exits frame focus and the page never sees it. Page-internal Escape handlers (close modal, exit fullscreen) won't fire. ADR 0001 explicitly accepts this. |
| Pre-existing smoke flakes | Unrelated | `agent-canvas`, `cdp-proxy`, `selection` flake on main without these changes. |
| Spike protocol formal sign-off | Optional | DevTools companion + click-away exit are both validated by manual Phase 1 testing. Native dialogs (file picker / `alert`) not exercised; document if encountered. |

---

## File map for a new agent

If you're picking this up cold:

- **Decision:** `docs/adr/0001-click-to-enter-frame-focus.md`
- **This plan:** `docs/plans/input-authority-frame-focus.md` (you're reading it)
- **Spike protocol:** `docs/plans/blur-spike-protocol.md`
- **Phase 0 substrate** (ready to wire up in Phase 2):
  - `src/shared/hit-regions.ts`
  - `src/main/runtime/interaction-priority.ts`
  - `src/main/runtime/hit-test.ts`
- **Phase 1 state machine** (live now):
  - `src/main/runtime/frame-focus.ts`
  - `src/main/runtime/focus-reconciler.ts` (focusedFrameId branch)
- **Existing gate predicate** (modify in Phase 2):
  - `src/main/runtime/gate-predicate.ts`
- **Existing aboveView** (extend in Phase 2):
  - `src/renderer/above-view/`
  - `src/preload/above-view.ts`
- **Layers to migrate** (Phase 2/3):
  - `grep -rn "onMouseDown\|onPointerDown" src/renderer/canvas-bg/` enumerates the targets

Branch: `refactor/input-authority-frame-focus`. Base: `main`.
