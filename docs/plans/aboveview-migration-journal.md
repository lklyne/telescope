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
- [x] Phase C — sticky / text / shape entity bodies into aboveView
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

### 2026-05-06 — Phase C — sticky bodies (text entities) into aboveView

- **Did:** One commit on `aboveview-migration`:
  - `refactor(sticky): move sticky note bodies into aboveView (Phase C)`
    — created `src/renderer/above-view/StickyBodyLayer.tsx`, a port of
    canvas-bg's `TextBlockLayer.tsx`. Cards mount inside a local
    `StickyViewportLayer` that applies the canvas zoom/pan transform
    without `canvasOrigin.y` (aboveView's WCV origin already sits at
    that y, so cards in canvas coords land at the right window-y).
    Wired into aboveView's `App.tsx` between `MarqueeLayer` and
    `SelectionOutlineLayer`. Mirrored `pendingTextEditId` state +
    `onTextBeginEdit` listener into aboveView so dblclick-to-edit
    still flips a sticky into edit mode. `register-canvas-ipc.ts` now
    fans `text-begin-edit` to both bgView and aboveView (whichever
    layer mounts the body picks it up). Deleted
    `src/renderer/canvas-bg/TextBlockLayer.tsx`. Removed the
    `<TextBlockLayer>` mount + `pendingTextEditId` state + listener
    from canvas-bg's `App.tsx`. Updated the `EntityBlockLayers.tsx`
    facade to drop the re-export.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no test changes; sticky
    rendering has no unit coverage).
  - The router's `entity-body` hit-test continues to work unchanged —
    geometry comes from the layout snapshot, not DOM. Phase B′'s
    front-to-back iteration means a sticky declared after a frame in
    `entityOrder` now wins clicks that overlap both, which is the
    user-visible payoff.
  - `SelectableEntityShell`'s `EntityHoverProvider` context had no
    readers (only writers via `setHoveredEntityId`). The aboveView
    port drops it entirely — `SelectionOutlineLayer` already reads
    hover from `layoutData.hover.id`, broadcast by main.
  - Inline menus (`StickyNoteInlineMenu`, `GroupInlineMenu`) still
    render in canvas-bg. They're floating UI on top of bodies and
    will eventually need to migrate too — out of scope for Phase C
    per the plan ("entity bodies" only). Selected-text-entity menu
    therefore now paints below pages when a frame overlaps the
    sticky; flagged as MANUAL for the human walk.
  - Shape bodies and the `editing-text` carve-outs
    (`gate-predicate.ts:41`, `focus-reconciler.ts:58-61`) still need
    to migrate before Phase C is complete.
- **Next:** Phase C — shape bodies into aboveView (port
  `ShapeBlockLayer.tsx`).
- **Status:** green
- **Manual:** §6 #19 — sticky positioned over a focused frame is now
  visible above the page (Phase C user-visible payoff); dblclick the
  sticky enters edit mode, keystrokes land in the textarea, exit
  returns forwarded input to the frame; `StickyNoteInlineMenu` may
  paint below the page when selected sticky overlaps a frame (inline
  menu migration deferred to future phase).

### 2026-05-06 — Phase C — shape bodies into aboveView

- **Did:** One commit on `aboveview-migration`:
  - `refactor(shape): move shape bodies into aboveView (Phase C)` —
    created `src/renderer/above-view/ShapeBodyLayer.tsx`, a port of
    canvas-bg's `ShapeBlockLayer.tsx` covering rectangle, ellipse, and
    diamond bodies plus the in-shape contenteditable label. Cards
    mount inside a local `ShapeViewportLayer` mirroring
    `StickyViewportLayer` (translate omits `canvasOrigin.y` since
    aboveView's WCV already sits at that y). Wired into aboveView's
    `App.tsx` between `MarqueeLayer` and `StickyBodyLayer` so shapes
    paint below stickies/files (preserves prior canvas-bg layer
    order). Mirrored `pendingShapeEditId` state + `onShapeBeginEdit`
    listener for dblclick / post-creation auto-edit.
    `register-canvas-ipc.ts` (`canvas-request-shape-edit` handler) and
    `register-canvas-entity-ipc.ts` (post-shape-creation auto-edit)
    now both fan `shape-begin-edit` to both bgView and aboveView.
    Deleted `src/renderer/canvas-bg/ShapeBlockLayer.tsx`. Removed the
    `<ShapeBlockLayer>` mount + `pendingShapeEditId` /
    `requestShapeEdit` plumbing + the unused `CanvasSceneShapeEntity`
    import from canvas-bg's `App.tsx`.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no test changes; shape body
    rendering has no unit coverage).
  - The sticky port introduced `StickyShell` to replace
    `SelectableEntityShell` because the router does drag / resize /
    select; followed the same pattern with `ShapeShell`. Hover for
    shapes is forwarded by aboveView's window pointermove handler via
    `api.hoverFrame`, so the `EntityHoverProvider` setter usage from
    `SelectableEntityShell` was correctly dropped.
  - The contenteditable label in shapes is the one place we need real
    DOM events; it works because aboveView's WCV holds keyboard focus
    during text editing (same condition as stickies post-Phase-C
    plan).
  - Inline menus (`StickyNoteInlineMenu`, `GroupInlineMenu`) and
    `EntityHoverProvider` still live in canvas-bg's `App.tsx` because
    canvas-bg still mounts the file block layer. They migrate
    alongside file bodies in Phase D.
  - `EntityBlockLayers.tsx` facade still re-exports `FileBlockLayer`
    + `GroupBoundsLayer` but has no remaining importers in `src/`.
    Left in place — clean-up belongs to Phase D / F, not this chunk.
- **Next:** Phase C — retire the `editing-text` carve-outs in
  `gate-predicate.ts:41` and `focus-reconciler.ts:58-61` (per §8 Phase
  C bullets) before declaring the phase complete. After that: Phase D
  — file entity bodies + edges into aboveView.
- **Status:** green
- **Manual:** §6 #19 — shape positioned over a focused frame is now
  visible above the page (Phase C user-visible payoff for shapes);
  dblclick the shape enters edit mode, keystrokes land in the
  contenteditable, exit returns forwarded input to the frame.

### 2026-05-06 — Phase C — retire editing-text carve-outs

- **Did:** One commit on `aboveview-migration`:
  - `refactor(focus): keyboard target is aboveView while editing-text
    (Phase C)` — deleted the `if (interactionKind === 'editing-text')
    return false` early-return in `gate-predicate.ts` (was line 41) so
    the gate now stays open during inline editing in canvas mode (and
    falls through to the OR-chain in browser mode). Also removed the
    `&& interactionKind !== 'editing-text'` exclusion from
    `interactionOpensGate` so editing-text opens the gate in browser
    mode too — the editor lives in aboveView post-Phase-C, so the gate
    must be open for keystrokes to reach it. Flipped
    `focus-reconciler.ts`'s `editing-text` case from `{ kind: 'bgView' }`
    to `{ kind: 'aboveView' }` and rewrote the comment. Updated the
    matching gate-predicate test ("closed while inline text is being
    edited" → "open while inline text is being edited") and the
    focus-reconciler test ("editing-text routes to bgView" → "...routes
    to aboveView").
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no count change; two existing
    assertions were inverted to match the new contract).
  - `should-focus-selected-frame.ts` already excludes `editing-text`
    (case 1 in the predicate), so the keyboard target will be aboveView
    rather than the page while typing — exactly what the new reconciler
    returns. The two predicates compose correctly without a third edit.
  - `layout-engine.ts:286` just maps interaction-state.kind → gate
    input; nothing to change there. The `selectionOwnsFrameContent`
    branch in browser mode is unaffected.
  - Confirmed `editing-text` references via grep land in: `shared/types`
    (state shape), `interaction-controller` (entry/exit), `interaction-
    state` (transition), `selection-controller` (label mapper),
    `focus-reconciler-runtime` (state binding), `layout-engine` (gate
    inputs), `register-canvas-ipc` (begin-edit IPC). None of those care
    about the gate value or focus target — they all consume the
    interaction kind itself, which is unchanged.
- **Next:** Phase D — file entity bodies + edges into aboveView.
- **Status:** green
- **Manual:** §6 acceptance for Phase C — sticky/shape edit mode places
  caret in the editor (now in aboveView) and keystrokes land there;
  exiting edit mode returns forwarded input to the underlying frame;
  page still scrolls when wheeling outside the sticky/shape.

### PHASE C COMPLETE — sticky/shape bodies render and edit in aboveView; editing-text carve-outs retired

- **Acceptance:** §8 Phase C acceptance — sticky and shape bodies now
  paint in aboveView (`StickyBodyLayer.tsx`, `ShapeBodyLayer.tsx`,
  prior commits). With Phase B′'s z-ordered hit-test, a sticky/shape
  declared front over a frame now wins clicks. Inline edit mode keeps
  the gate open (`gate-predicate.ts` no longer early-returns on
  `editing-text`) and routes keyboard focus to aboveView
  (`focus-reconciler.ts` `editing-text` → `{ kind: 'aboveView' }`),
  so keystrokes land in the contenteditable instead of leaking to the
  page below. Exiting edit mode returns to idle, the predicate
  (`shouldFocusSelectedFrame`) re-elects the page as keyboard target
  on the next layout pass, forwarding resumes. Note: TextBody in §8 is
  this codebase's text-entity (sticky) — there's no separate text body
  type.
- **Manual debt accumulated this phase:** §6 #19 (multi-select bounding
  box / sticky/shape over focused frame); editor caret + keystrokes +
  exit-and-resume-forwarding manual walk; §6 boundary scenarios re-walk
  after layer migration; `StickyNoteInlineMenu` still in canvas-bg —
  may paint below page when sticky overlaps a frame (deferred —
  inline-menu migration not in §8 scope).
- **Next phase:** Phase D — file entity bodies + edges into aboveView.
