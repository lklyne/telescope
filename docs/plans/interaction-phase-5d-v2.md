# Interaction Layer — Phases A–E (one PR)

Branch: `interaction-phase-5d-v2`. Plan for closing the remaining divergences in `docs/interaction-layer.md` §11 (D1–D13), minus phase 6 and I6, inside one PR.

## Status

| Phase | Status | Commits |
|---|---|---|
| A — Smoke test scaffold | ✅ done (Checkpoint 1) | `a9d6783b`, `f9144c21` |
| B — 5d-v2 mechanical consolidation | ✅ done (Checkpoint 2) | `d3807a2c`, `ba86d87a`, `b3fa2abf`, `b00515ee`, `c19a2c96` |
| C — FocusReconciler unconditional flip | ✅ done (Checkpoint 3) | `7de9e19d` |
| D — Gesture routing through controller | 🟡 partial — see below | `0df6f4c3`, `9cce1474` |
| E — Invariant enforcement | 🟡 partial — see below | `e9c34350`, `f59961d5`, `5e8010b8` |

### Phase D — partial

Done:
- D6: `shouldGateBeOpen(state)` is main-authoritative. Renderer no longer drives `setCommentOverlayActive`. 23 unit tests.
- D7: `spaceModifierHeld` + `hoveringCanvasChrome` runtime-context fields; space key wired in `watchModifierKeys`. `hoveringCanvasChrome` setter awaits renderer wiring from the gesture port.
- D2 (fully): IPC gesture-begin routed through `controller.tryEnter(...)`. `beginMarqueeSelect` / `beginDraggingEntities` / `beginEdgeDrag` / `beginTextEditing` called only from inside the controller.

Deferred (needs bitmap compositor, Phase 6, out of this PR's scope):
- D3/D4/D8: Port `useCanvasViewportGestures.ts` + `useAnnotationDrawingGestures.ts` onto `useDragGesture` consumers and move the gesture producer from `canvas-bg/` to `above-view/useCanvasGestures.ts`. The move requires the aboveView to hit-test pointer events from the idle + select state, which requires the bitmap compositor to provide a continuously-present above surface.
- D5: Layer split of `AnnotationComponents.tsx` → `CommentsLayer.tsx` / `AnnotationsLayer.tsx` / `PresenceLayer.tsx`.
- D7: `DragPreviewLayer` subscribing to `InteractionMode` broadcast.
- Real token plumbing through IPC payloads (vs. the main-local token bookkeeping Phase B installed) — meaningful once commit vs. cancel diverge semantically.

### Phase E — partial

Done:
- E1: `setTimeout(0)` crutch removed from `workspace-observers.ts`; undo observer runs side effects synchronously now that gesture cancellation flows through the controller.
- E2: `restackOverlayViews` / `bringTopViewsToFront` / `bringOverlayViewsToFront` wrappers deleted; 14 callers moved to `markDirty('stack'); requestLayout()`.
- E4: ESLint stood up with two local custom rules — `no-direct-view-mutation` (I1) and `no-mouse-events` (I8). Rules run as warnings because pre-existing call sites total 145 violations; they're visible in CI/PR and prevent new violations from landing silently. Converting to error is a legacy-cleanup follow-up.

Not done (plan premise was outdated):
- E3: "Remove dead chromeView" — `chromeView` is the active per-page chrome header (24 references across 9 files), not dead. Skipped.

### Follow-ups done (after user reframed away from the bitmap compositor)

- Deleted `canvasInteractionActive` dead flag (write-only across 9 sites).
- Split `AnnotationComponents.tsx` (430 lines) into `DrawingsLayer.tsx`, `AnnotationsLayer.tsx`, `CommentsLayer.tsx` by responsibility.
- Ported `useCanvasViewportGestures.ts` onto `useDragGesture` in-place (3 drag modes collapsed into one consumer; primitive owns escape/blur/cancel; 60 lines shorter).
- Not ported: `useAnnotationDrawingGestures.ts` uses a React-prop handler pattern incompatible with `useDragGesture`'s attach-to-ref model — port requires larger structural change, deferred as separate work.

Phase A delivered: `/test/*` HTTP routes (`src/main/routes/test.ts`), AppClient extensions (`tests/smoke/app-client.ts`), three test files (`gestures.test.ts`, `focus.test.ts`, `drop-dedup.test.ts`). 36 controller state-machine tests + 3 drop-dedup tests + 2 focus-wiring tests pass. 11 `it.todo()` placeholders flip as B–D land.

## Context

`docs/interaction-layer.md` defines the target architecture. PR `interaction-phase-5d-v1` landed the structural skeleton (3 transparent overlays → 1 merged `aboveView`, scaffolded `InteractionController` / `FocusReconciler` / `DropOwner` / `useDragGesture` with unit tests) but stopped short of routing real gestures through the new primitives. §11 catalogs 13 divergences; §12 plans the work to close them.

This PR closes everything in §12 except phase 6 (bitmap compositor) and I6 (view-factory adoption) inside one branch, phased internally with smoke checkpoints. Tests land first against current behavior so later phases have a regression baseline. End state: every non-idle gesture transition traces to a `tryEnter` call, gestures live only in `above-view/` + `shared/useDragGesture.ts`, focus is reconciled unconditionally from state, and the layout-pass invariants are statically enforced.

## Scope corrections from exploration

The spec's site counts were estimates. Actuals:

- `clearInteractionState()` — **19** call sites, not 30. 13 IPC, 1 undo observer, 3 selection, 2 internal-to-controller. The 3 selection-controller / selection-state sites don't fit Phase B's "IPC → undo → main/index" categorization — they migrate alongside but become `cancelActive('external')` calls.
- `commentOverlayView` rename — **14** sites, not 30. Concentrated in `src/main/runtime/` and `src/main/ipc/`. The semantic layer ID is already `'aboveView'` in `layer-stack.ts` — only the variable name lags.
- `webContents.focus()` imperative calls — **6 total**: 1 in `src/main/runtime/page-factory.ts:264`, 5 in `src/main/ipc/` (page-chrome, canvas-entity, annotation-inspection ×2, toolbar). User decision: migrate all 6.
- `setTimeout(0)` crutches — **1** in scope (`workspace-observers.ts:273` undo reverse-sync). The other (`region-capture.ts:120`) is paint-timing, out of scope.
- `restackOverlayViews` callers — **12** confirmed.
- `forceCancel` — defined but **unused**. Migration is add-the-new-path, no old-path to delete.
- ESLint — **no config exists**. Standing up from scratch (user decision).
- Smoke gesture coverage — **none today**. AppClient has no pointer/drag/pan APIs; Phase A extends it before writing tests.

## Phase A — Smoke test scaffold ✅

Lands first against current behavior so later phases have a baseline. Tests encoding not-yet-correct behavior use `it.todo()` and flip when the owning phase lands.

**Files added/modified:**
- `src/main/routes/test.ts` (new) — `/test/interaction/*`, `/test/focus/*`, `/test/drop/*` routes.
- `src/main/app-control-server.ts` — wire `testRoutes`.
- `tests/smoke/app-client.ts` — extend `AppClient` with `beginInteraction` / `commitInteraction` / `cancelInteraction` / `cancelActiveInteraction` / `getInteractionMode` / `getCurrentFocus` / `requestFocus` / `consumeDragId` / `resetInteraction` / `resetDropOwner`.
- `tests/smoke/gestures.test.ts` (new) — per-mode begin/commit/cancel matrix.
- `tests/smoke/focus.test.ts` (new) — wiring-only (OS focus not observable in headless smoke).
- `tests/smoke/drop-dedup.test.ts` (new) — DropOwner.consumeDragId.

**Checkpoint 1 (smoke):** ✅ all new tests pass; only pre-existing flakes (cdp-proxy, selection) remain.

## Phase B — 5d-v2 mechanical consolidation

Closes D1, D2 (most), D12. Commit batches for bisect: (1) rename, (2) IPC migration, (3) undo migration, (4) selection migration, (5) cleanup.

**Files modified:**
- **Rename `commentOverlayView` → `aboveView`** across 14 sites:
  - `src/main/runtime/`: `view-refs.ts`, `window-init.ts` (×5), `window-shell.ts`, `surface-layout.ts`, `preferences.ts` (×3), `layout-engine.ts` (×3), `layer-stack.ts` (×3), `frame-compositor.ts` (×3), `canvas-layout-data.ts` (×3), `overlay-manager.ts`.
  - `src/main/ipc/`: `register-annotation-inspection-ipc.ts` (×7), `register-page-chrome-ipc.ts` (×4), `register-canvas-entity-ipc.ts` (×4), `register-canvas-ipc.ts`.
- **Migrate 19 `clearInteractionState()` sites** onto controller (`src/main/runtime/interaction-controller.ts`):
  - 13 IPC handlers in `register-canvas-ipc.ts:149,265`, `register-canvas-drag-ipc.ts:160,186,232,254,289,323`, `register-page-chrome-ipc.ts:178,205,233,261,289` → `controller.commit(token)` for gesture-end paths, `controller.cancel(token, reason)` for abort paths. IPC payloads gain a `token` field stamped at gesture begin.
  - 1 undo observer in `workspace-observers.ts:275` → `controller.cancelActive('undo')`.
  - 3 selection sites in `selection-state.ts:50`, `selection-controller.ts:118,137` → `controller.cancelActive('external')` (selection mutations don't own a token).
- **Wire `cancelActive(reason)`** in `interaction-controller.ts` per spec §4.1 amendment. Token expiry timer routes through it. Retire `forceCancel` (delete from controller; no external callers).
- **Delete `floatingUiDropdownOpen`** IPC + state field: `runtime-context.ts:35`, `register-canvas-ipc.ts` handlers, `layout-engine.ts:40` import.
- **Inline `setCanvasInteractionMode`** at its 8 callers (`keyboard-shortcuts.ts` ×6, `window-init.ts`, `window-shell.ts` re-export). Replace with direct `setCanvasInteractionActive(active)`. Delete from `overlay-manager.ts:127`.

**Checkpoint 2 (smoke):** Phase A gesture matrix end-to-end. Cancel paths are the riskiest part. Flip any `it.todo()` tests that should now pass.

## Phase C — FocusReconciler unconditional flip

Closes D4. Migrates all 6 imperative `webContents.focus()` calls.

**Files modified:**
- `src/main/runtime/page-factory.ts:264` — `bgView.webContents.focus()` → `setPendingFocus({ kind: 'bgView' }) + markDirty('focus')`.
- `src/main/ipc/register-page-chrome-ipc.ts:308` — aboveView focus (region-select) → `setPendingFocus({ kind: 'aboveView' })`.
- `src/main/ipc/register-canvas-entity-ipc.ts:501` — aboveView focus (comment composer) → `setPendingFocus({ kind: 'aboveView' })`.
- `src/main/ipc/register-annotation-inspection-ipc.ts:110,242` — aboveView focus (annotation thread) → `setPendingFocus({ kind: 'aboveView' })`.
- `src/main/ipc/register-toolbar-ipc.ts:159` — toolbarView focus (address bar) → `setPendingFocus({ kind: 'toolbar' })`.
- `src/main/runtime/focus-reconciler-runtime.ts:75` — delete `if (!pendingFocus) return` gate. `reconcileFocus()` derives target from state unconditionally on every layout pass.
- Consider deleting `pendingFocus` field entirely if `expectedFocus(state)` derives from state directly. Investigate during implementation; fall back to keeping `pendingFocus` if state derivation needs more inputs than are currently in `FocusState`.

**Checkpoint 3 (smoke):** focus-after-mutation tests from Phase A are the tripwire. Run gesture matrix too — focus storms can manifest as gesture-cancel regressions.

## Phase D — 5e gesture routing through controller

Closes D2 fully, D6, D7, D8.

**Files modified:**
- **Implement `shouldGateBeOpen(state)` per §4.2** in `src/main/runtime/layout-engine.ts:277-292`. Inputs: `interaction.mode.kind !== 'idle'` || `toolMode !== 'select'` || `modifiers.space` || `hoveringCanvasChrome`. Replace the renderer-driven `uiCommentOverlayVisible() || getPresenceCursors().length > 0` check from commit `e1bbfa05`. Single call site inside `layoutAllViews()`. Authority moves from renderer (`overlayActive` signal in `above-view/App.tsx:122`) to main; renderer `setCommentOverlayActive` call goes away or becomes informational only.
- **Surface modifier + chrome-hover state** in `runtime-context.ts` if not present: `modifiers: { space: boolean }`, `hoveringCanvasChrome: boolean`. Wire keyboard handlers in `keyboard-shortcuts.ts` to update modifier state; wire `aboveView` hit-test to update chrome-hover via existing IPC.
- **Port `useCanvasViewportGestures.ts` onto `useDragGesture`.** Move the gesture *producer* from `src/renderer/canvas-bg/useCanvasViewportGestures.ts` to `src/renderer/above-view/useCanvasGestures.ts` (new file). Canvas-bg keeps camera/grid/below-page rendering only. Each gesture mode becomes a `useDragGesture` consumer with its own `onBegin`/`onUpdate`/`onCommit`/`onCancel`. `filter` predicate handles button/pointerType/viewMode disambiguation. Modes: pan, marquee, region-select, pending-placement.
- **Port `useAnnotationDrawingGestures.ts` onto `useDragGesture`** in the same fashion (drawing strokes, region-select).
- **Route every gesture through controller.** On `onBegin`: call `interaction.tryEnter(mode)` via IPC; receive token; store on gesture-local state. On `onUpdate`: `interaction.update(token, delta)`. On `onCommit`/`onCancel`: `interaction.commit(token)` / `interaction.cancel(token, reason)`. Replace placeholder anchor/edge payloads in `interaction-controller.ts:59` (`snapshotMode()`) with real values from gesture begin.
- **Layer split** in `src/renderer/above-view/`. Extract from `AnnotationComponents.tsx` into `CommentsLayer.tsx`, `AnnotationsLayer.tsx`, `PresenceLayer.tsx`. Add empty `DragPreviewLayer.tsx` ready for entity-drag previews. Final file layout matches spec §8.
- **Add `DragPreviewLayer`** rendering canvas-space previews for `dragging-entities` mode (subscribed to `InteractionMode` broadcast).
- **Unit tests** for `shouldGateBeOpen(state)` covering every mode × modifier combination.

**Checkpoint 4 (smoke + manual QA):** marquee, pan, entity drag, resize, edge drag, text edit, space-pan, tool-mode arming. Manual QA budget: half a day — gesture edge cases (modifier combos, interrupted drags) won't all be in the smoke matrix.

## Phase E — Invariant enforcement

Closes D3, D10, D11. Stands up ESLint per user decision.

**Files modified:**
- **Delete `setTimeout(0)` crutch** in `src/main/runtime/workspace-observers.ts:273-278`. Replace with `markAllDirty(); requestLayout()` — the layout pass's deferred scheduling is now sufficient because Phase B/D moved gesture cancellation off the synchronous undo path. Remove the documentation block at `src/main/runtime/CLAUDE.md:34,71`.
- **Convert 12 `restackOverlayViews` callers to `markDirty('stack')`** then delete the wrapper at `layout-engine.ts:88`:
  - `runtime-core.ts:141`, `devtools-panel.ts:47,83,103,131,145,160,174`, `page-factory.ts:243`, `window-init.ts:355`, `register-page-chrome-ipc.ts:367`.
- **Remove dead `chromeView`** — delete creation at `page-factory.ts:94-103`, delete HIDDEN_BOUNDS sets at `layout-engine.ts:311,324,348`, audit `register-page-chrome-ipc.ts:339-343` devtools-expand path (the only non-hidden user) — if it's still meaningful, preserve via a different mechanism.
- **Stand up ESLint** (new files):
  - `eslint.config.js` — flat config, TypeScript support, project-wide rules.
  - `eslint-rules/` — local plugin directory with two custom rules:
    - `no-direct-view-mutation` — forbid `setBounds` / `setVisible` / `addChildView` / `removeChildView` calls outside `src/main/runtime/layout-engine.ts` and `src/main/runtime/layer-stack.ts`.
    - `no-mouse-events` — forbid `mousedown` / `mouseup` / `mousemove` / `mouseenter` / `mouseleave` / `onMouse*` in `src/renderer/`.
  - `package.json` — add `eslint` script, dependencies (`eslint`, `typescript-eslint`).
  - Wire into existing `pnpm` scripts; if CI config exists, add `pnpm eslint` step.

**Final:** full smoke + `pnpm typecheck` + `pnpm eslint`.

## Out of scope

- **Phase 6** — bitmap compositor (§4.7).
- **I6 / view-factory adoption** — 11 `setBackgroundColor('#00000000')` site migrations and the ESLint rule banning raw `new WebContentsView()` outside a factory.
- **§13 open questions** — remain open as written.
- **`region-capture.ts:120` setTimeout** — paint-timing helper, not the I1 crutch class.

## Critical files to touch

Hot list for reviewers:
- `src/main/runtime/interaction-controller.ts` — `cancelActive` becomes the canonical external-interrupter; `forceCancel` retired.
- `src/main/runtime/focus-reconciler-runtime.ts` — gate removed; runs every layout.
- `src/main/runtime/layout-engine.ts` — `shouldGateBeOpen(state)` becomes the gate authority; `restackOverlayViews` wrapper deleted.
- `src/renderer/above-view/useCanvasGestures.ts` (new) — moves gesture producer out of canvas-bg.
- `src/renderer/canvas-bg/useCanvasViewportGestures.ts` — shrinks to camera/grid only or is deleted.
- `src/renderer/above-view/AnnotationComponents.tsx` — split into per-layer files.
- `tests/smoke/test-utils.ts` — gains pointer/drag/focus assertion APIs.
- `eslint.config.js` + `eslint-rules/` — new.

## Verification

End-to-end:

1. `pnpm install` — picks up new ESLint deps.
2. `pnpm typecheck` — both node and web tsconfigs clean.
3. `pnpm test:unit` — controller, focus reconciler, drop owner, gate predicate unit tests pass.
4. Build via `npx electron-forge package` (smoke uses `.vite/build/index.js` directly).
5. `pnpm test:smoke` — gesture matrix, focus, drop dedup tests pass; only pre-existing flakes (cdp-proxy, selection) remain.
6. `pnpm eslint` — clean (no `setBounds`/`setVisible`/`addChildView`/`removeChildView` outside layout files; no `mouse*` in renderer).
7. `pnpm dev` — manual QA per Checkpoint 4.

Exit-criterion grep:
```
rg "commentOverlayView|clearInteractionState\(|pendingFocus !== null|forceCancel\(|setTimeout\(0|restackOverlayViews|chromeView" src/
```
Returns empty or a short, justified list.

Spec invariants check:
- §6 I1 — enforced by ESLint rule + no `setTimeout(0)` in `src/main/runtime/`.
- §6 I2, I3 — `cancelActive` callers exhaustively the four blessed sites in §4.1.
- §6 I4 — every `webContents.focus()` in `src/main/` goes through `setPendingFocus`.
- §6 I7 — `aboveView` visibility derived from `shouldGateBeOpen(state)` only.
- §6 I8 — enforced by ESLint rule.
