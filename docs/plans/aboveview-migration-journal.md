# AboveView migration journal

- **Branch:** `aboveview-migration` (cut from `poc/page-input-forwarding` after
  PoC verdict on 2026-05-06).
- **Plan:** `docs/plans/aboveview-interactive-layer.md` §8.
- **Prompt:** `docs/plans/aboveview-migration-prompt.md`.
- **Loop driver:** `/loop` self-paced via `ScheduleWakeup`.

This journal is **append-only**. Each Ralph iteration appends one entry. Phase
transitions and the final completion entry are appended here too. To correct a
past mistake, write a new entry that supersedes it — never rewrite history.

## Status at a glance

Phases (per §8 sequencing A → B → B′ → C → D → F):

- [x] Phase A — collapse `frame-focus.*` into selection
- [x] Phase B — selection outlines + resize handles into aboveView
- [x] Phase B′ — honor entity z-order in body hit-test
- [ ] Phase C — sticky / text / shape entity bodies into aboveView
- [ ] Phase D — file entity bodies + edges into aboveView
- [ ] Phase F — bgView reduces to grid only + keyboard owner flip

(E and G are deferred per the plan and out of scope for this migration.)

## Manual scenarios pending human walkthrough

Accumulated as the loop runs. Each entry is a §6 scenario the loop flagged
because it requires observing the running app.

- §6 #15 — click outside frame deselects → forwarding stops (Escape now
  routes through `selectNone()`; verify no state corruption)
- §6 #16 — click another frame → selection transfers, forwarding switches
- §6 #17 — Cmd-Tab away then back → forwarding resumes (page-side blur
  listener no longer manipulates state; reconciler re-focuses on next
  layout pass)
- §6 #18 — DevTools attached to keyboard-target frame still works (no
  page-side focus listener to interfere)
- Agent A1–A4 — CDP path is independent of these changes; sanity-check
  during Phase A walkthrough.

---

## Entries

### 2026-05-06 — Phase A — landed conversationally before loop start

- **Did:** Two commits on `aboveview-migration`:
  - `feat(focus): add shouldFocusSelectedFrame predicate` — pure helper +
    20 unit tests covering the four divergence cases from §8 Phase A.
  - `refactor(focus): retire frame-focus state — selection drives
    keyboard target (Phase A)` — large coupled refactor that deleted
    `frame-focus.ts`, `frame-focus-escape.ts`, `frame-focus-selection.ts`,
    the `commitSelection` mirror, the `canvas-frame-focus-enter` IPC,
    the `enterFrameFocus` API surface + preload bridge, the
    `enter-frame-focus` action kind, the `frameFocus` field on
    `GateInputs` and `LayoutUpdateData`, the `frameFocused` field on
    `CanvasPointerContext`, the `/test/frame-focus/*` HTTP routes, the
    `frame-focus` smoke + unit tests, and `withFocusEventsSuppressed`.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 368 / 368 passing (363 PoC baseline + 20 new
    predicate tests − 15 frame-focus tests).
  - `grep -rn "frameFocus" src/` — zero hits (the only remaining
    `focusedFrameId` references are renderer prop names and the
    `FocusState` field that's now filled by the predicate).
  - `routeWheel` now consults `interactionKind` so wheel during
    drag/marquee/edge gestures stays on the canvas.
  - Page cursor bridge is now per-pass (`reconcilePageCursorBridge()`
    called alongside `reconcileFocus()` from `layoutAllViews()`); no
    subscription model needed.
  - `frame-focus-escape` global Escape shortcut is gone — page-side
    `before-input-event` handler in `keyboard-shortcuts.ts` is now the
    sole Escape path, repointed at `selectNone()`. If validation finds
    the page-side handler flaky in some pages, add the global back as a
    safety net.
- **Next:** Loop kickoff at Phase B (selection outlines + resize handles
  into aboveView).
- **Status:** green
- **Manual:** §6 #15–18 + agent A1–A4 — see "Manual scenarios pending"
  list above.

### PHASE A COMPLETE — frame-focus retired; keyboard target derived from selection

- **Acceptance:** §8 Phase A acceptance — `grep -r frameFocus src/`
  returns zero hits in runtime code. Page focus follows the predicate,
  not raw selection. Four divergence cases each have a unit test
  (`tests/unit/should-focus-selected-frame.test.ts`).
- **Manual debt accumulated this phase:** §6 #15–18 boundary scenarios
  + agent A1–A4 (listed above).
- **Next phase:** Phase B — selection outlines + resize handles into
  aboveView.

### 2026-05-06 — Phase B — selection outlines + resize handles into aboveView

- **Did:** One commit on `aboveview-migration`:
  - `refactor(selection): move outlines + resize handles into aboveView
    (Phase B)` — created
    `src/renderer/above-view/SelectionOutlineLayer.tsx` consolidating
    frame outlines, multi-selection bounding box, entity outlines,
    hover outlines, and the selected-group overlay (folding the old
    aboveView `SelectedGroupResizeOverlay` into the new layer). Wired
    it into aboveView's `App.tsx` and removed the `<CanvasSelectionOutlineLayer>`
    + `<GroupSelectionOverlayLayer>` mounts from canvas-bg's `App.tsx`.
    Deleted `src/renderer/canvas-bg/CanvasSelectionLayers.tsx`.
    aboveView now derives `marqueePreviewIds` locally from its own
    `selectionOverlay` broadcast (it owns the marquee gesture); the
    canvas-bg fallback path is gone.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 368 / 368 passing (no test changes; outline
    rendering has no unit coverage).
  - Resize hit-tests already run in `useCanvasPointerRouter` against
    entity geometry (not the visual handles), so the migrated handles
    stay visual-only with `pointer-events: none`. No router rewiring
    needed.
  - `SelectableEntityShell`'s in-body `scaleWithZoom` handles still
    live in canvas-bg — those are entity-body decorations and migrate
    in Phase C alongside the bodies themselves.
- **Next:** Phase B′ — honor entity z-order in body hit-test.
- **Status:** green
- **Manual:** §6 #19 — multi-select bounding box still renders + handles
  show; §6 boundary scenarios should also be re-walked since outlines
  now live in a different WCV (no concrete failure expected — purely
  visual layer move).

### PHASE B COMPLETE — selection outlines + resize handles render in aboveView

- **Acceptance:** §8 Phase B acceptance — selection outline now lives in
  aboveView's tree, above page WCVs (`SelectionOutlineLayer.tsx`).
  Drag-to-resize continues to work because `useCanvasPointerRouter`'s
  `runResize` is unchanged — handles are visual; the router hit-tests
  against entity geometry. `bgView` no longer mounts
  `CanvasSelectionOutlineLayer` or `GroupSelectionOverlayLayer`; the
  associated derived state (`selectedGroupControlsMirroredToAboveView`,
  `frameInteractionsEnabled`) is removed and `CanvasSelectionLayers.tsx`
  is deleted. (`SelectableEntityShell` still references
  `CornerResizeHandle/EdgeResizeHandle` for in-body decorations, but
  those are entity-body chrome that migrates in Phase C.)
- **Manual debt accumulated this phase:** §6 #19 (multi-select bounding
  box) + general §6 boundary scenarios re-walk after layer move.
- **Next phase:** Phase B′ — honor entity z-order in the body hit-test.

### 2026-05-06 — Phase B′ — z-ordered body hit-test

- **Did:** One commit on `aboveview-migration`:
  - `fix(hit-test): walk body layer front-to-back per entity z-order
    (Phase B′)` — `collectBodyTargets` in `src/shared/hit-test.ts` now
    iterates `inputs.entities` in reverse so the front-most non-group
    body wins the hit. Groups still come last in the body hit list
    (containers — members painted above must hit first). Added four
    unit tests in `tests/unit/hit-test.test.ts` covering: sticky
    declared front over a frame returns `entity-body`; reverse z-order
    returns `frame-body`; two stacked stickies — last in entities wins
    and reversing the array swaps the winner; group containment still
    wins regardless of declared order.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (368 baseline + 4 new
    z-order tests). All existing hit-test tests still green; the
    "click inside group selects inner" rule survives the iteration
    flip because groups remain last in the hit list.
  - `inputs.entities` order matches the `entityOrder` Y.Array
    semantics (`workspace-doc.ts:296` builds it as
    `[...pages, ...textEntities, ...fileEntities, ...drawingEntities,
    ...shapeEntities, ...workspaceGroups]` — same kind-then-insertion
    grouping as `canvas-layout-data.ts:348` builds for the layout
    snapshot). Both are back-to-front (paint order); JSON Canvas spec
    convention. So iterating in reverse = front-to-back, and no new
    field needed on `HitInputs`.
  - Today there's no user-facing reorder operation, so this change is
    invisible until Phase C lands stickies above frames. That's the
    point — B′ is the precursor.
- **Next:** Phase C — sticky / text / shape entity bodies into aboveView.
- **Status:** green
- **Manual:** none — z-order behavior is now covered by unit tests; no
  visual change to walk through.

### PHASE B′ COMPLETE — body hit-test honors entity z-order

- **Acceptance:** §8 Phase B′ acceptance — existing hit-test tests pass
  (368 → 372 with new tests added; zero existing tests modified). New
  z-order test passes (sticky over frame returns entity-body when
  declared front; reverse declaration returns frame-body). No visual
  change yet — this is invisible until Phase C lands sticky bodies in
  aboveView.
- **Manual debt accumulated this phase:** none.
- **Next phase:** Phase C — sticky / text / shape entity bodies into
  aboveView.
