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
- [x] Phase D — file entity bodies + edges into aboveView
- [x] Phase F — bgView reduces to grid only + keyboard owner flip

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

### 2026-05-06 — Phase D — edges into aboveView

- **Did:** One commit on `aboveview-migration`:
  - `refactor(edges): move edge bodies + anchor dots into aboveView
    (Phase D)` — created `src/renderer/above-view/EdgeLayer.tsx` as a
    direct port of canvas-bg's `EdgeLayer.tsx`. The svg is purely visual
    (`pointer-events: none` end-to-end); edge interaction is already
    driven by `useCanvasPointerRouter` against the layout snapshot, so
    the only mechanical change was the y-origin shift: every anchor
    coord now subtracts `canvasOrigin.y` since aboveView's WCV starts at
    the toolbar inset (the `getAnchorPoint`, `getAnchorHitRect`, and
    `AnchorDots` helpers grew an `originY` parameter; auto-side
    selection uses raw `screenY` because it operates in window-space and
    is symmetric, so the offset cancels). Wired into aboveView's
    `App.tsx` between `MarqueeLayer` and `ShapeBodyLayer` to preserve
    canvas-bg's prior paint order (edges below entity bodies). Moved
    the `selectedEdgeIds` derivation and `hoveredEntityId` read into
    aboveView's `App.tsx`. Removed the `<EdgeLayer>` mount, the
    `selectedEdgeIds`/`hoveredEntityId` derivations, and the now-orphan
    `handleHoverEntity` callback from canvas-bg's `App.tsx`. Deleted
    `src/renderer/canvas-bg/EdgeLayer.tsx`.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no test changes; edge
    rendering has no unit coverage; edge hit-test logic in `hit-test.ts`
    + `useCanvasPointerRouter` is unchanged and remains covered).
  - The dead `onMouseEnter`/`onMouseLeave` handlers on the anchor hit
    rect (already inert because `pointerEvents: 'none'` was set above
    them in the bgView source) were dropped during the port — they
    couldn't fire and added noise.
  - `EdgeDragLayer` (rubber-band preview) already lived in aboveView
    from the ADR 0001 work; this commit makes saved edges + anchor dots
    join it, so the entire edge surface is now in one tree.
  - Edges now paint above frame WCVs — a connection drawn between two
    frames is no longer clipped by either page (Phase D user-visible
    payoff for edges).
- **Next:** Phase D — file entity bodies (`FileBlockLayer` + the
  `RendererSwitch`-mounted image / video / markdown / wireframe /
  component bodies) into aboveView.
- **Status:** green
- **Manual:** §6 #19 / general boundary scenarios — verify edge drawn
  between frames is visible above both pages (the user-visible payoff);
  edge selection + drag-to-reroute still works; anchor dots appear on
  hover/selection at the correct spots (within ~1px due to integer
  rounding around `canvasOrigin.y`).

### 2026-05-06 — Phase D — file entity bodies into aboveView

- **Did:** One commit on `aboveview-migration`:
  - `refactor(file): move file entity bodies into aboveView (Phase D)`
    — created `src/renderer/above-view/FileBodyLayer.tsx`, a port of
    canvas-bg's `FileBlockLayer.tsx` covering the renderer-plugin-mounted
    image / video / markdown / wireframe / component / fallback bodies
    plus the `Show in Finder` context menu. Cards mount inside a local
    `FileViewportLayer` mirroring `StickyViewportLayer` /
    `ShapeViewportLayer` (translate omits `canvasOrigin.y` since
    aboveView's WCV already sits at that y). Wired into aboveView's
    `App.tsx` between `StickyBodyLayer` and `SelectionOutlineLayer` so
    files paint above stickies/shapes/edges (preserves prior canvas-bg
    layer order). `fileJsonModeMap` state moved from canvas-bg's
    `App.tsx` into aboveView's `App.tsx` (fresh empty Map; chrome layer
    doesn't read it today, so wireframes default to false until a
    future IPC channel mirrors flips between chrome and body). Removed
    `FileBlockLayer` mount + the now-orphan `fileJsonModeMap`,
    `getEntityLayerZoom`, `selectedEntityIdSet`,
    `selectedGroupDescendantIds`, `drawingEntities`, `marqueePreviewIds`
    state, `onSelectionOverlayChanged` listener, and
    `<EntityHoverProvider>` wrap from canvas-bg's `App.tsx`. Deleted
    `FileBlockLayer.tsx`, `SelectableEntityShell.tsx`,
    `EntityHoverProvider.tsx`, and the `EntityBlockLayers.tsx` facade
    (all orphaned).
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no test changes; file body
    rendering has no unit coverage; router-driven select / drag / resize
    against `useCanvasPointerRouter` geometry is unchanged).
  - `FileShell` (replacing `SelectableEntityShell`) drops the
    `EntityHoverProvider` setter context entirely — same simplification
    as `StickyShell` / `ShapeShell`. Hover for files comes from
    aboveView's window pointermove handler via `api.hoverFrame`.
  - `RendererSwitch` and the registry-mounted renderers themselves
    (`ImageInlineRenderer`, `VideoInlineRenderer`,
    `MarkdownInlineRenderer`, `WireframeInlineRenderer`,
    `ComponentPlaceholderRenderer`, `FileFallbackRenderer`) stay in
    `canvas-bg/entity-renderers/` and are imported from aboveView. No
    behavioral migration needed — they're plain React components and
    they pick up keyboard focus from aboveView's WCV directly during
    inline edit (markdown contenteditable, wireframe text).
  - Markdown / wireframe inline edit now inherits the Phase C carve-out
    flip (gate stays open + reconciler routes to aboveView during
    `editing-text`) since aboveView is where the contenteditable lives.
  - Inline menus (`StickyNoteInlineMenu`, `GroupInlineMenu`) still live
    in canvas-bg's `App.tsx` — they're floating UI on top of bodies and
    out of §8 scope (pre-existing flag from Phase C). They may paint
    below pages when their target overlaps a frame; deferred.
  - `FrameBorderLayer` / `DeviceShellLayer` / `SvgDeviceShellLayer` in
    canvas-bg still consume `fileEntities` for device-frame chrome and
    are intentionally left alone — they paint frame-and-file borders
    that the canvas-bg "between bgView and pages" sandwich relies on.
    Phase F audits whether any of those need to move.
- **Next:** Phase F — bgView reduces to grid only + keyboard owner flip.
- **Status:** green
- **Manual:** §6 #19 — file (image / video / markdown / wireframe /
  component) placed over a focused frame is now visible above the page
  (Phase D user-visible payoff for files); markdown / wireframe inline
  edit (caret + keystrokes) lands in aboveView's contenteditable; exit
  edit returns forwarded input to the underlying frame; §9 drag-image-
  out from a focused page — re-check that the OS-level drag still
  initiates from the image-renderer source (carve-out mapped to this
  phase, runtime observation required); video play / scroll-within
  works while a frame is forwarded; right-click "Show in Finder" still
  opens.

### PHASE D COMPLETE — file entity bodies + edges render in aboveView

- **Acceptance:** §8 Phase D acceptance — all `RendererSwitch`-mounted
  bodies (image / video / markdown / wireframe / component / fallback)
  paint in aboveView via `FileBodyLayer.tsx`. Edges already migrated in
  the prior iteration via `EdgeLayer.tsx`. A drawn edge between two
  frames + a file entity placed over a frame are now both visible above
  page WCVs. Inline interactive bits (markdown contenteditable,
  wireframe text, video controls, anchor dots) keep working because
  aboveView's WCV holds the keyboard / pointer input the renderers
  need; the gate is open in canvas mode and the focus reconciler routes
  `editing-text` to aboveView (Phase C carve-out flip).
- **Manual debt accumulated this phase:** §6 #19 (file over focused
  frame is visible above page); markdown / wireframe inline edit caret
  + keystrokes + exit-and-resume-forwarding manual walk; §9 drag-image-
  out — re-check that the OS-level drag still initiates from a focused-
  page image-renderer source (carve-out runtime check); right-click
  Show-in-Finder still works on a file body that overlaps a frame;
  edge / anchor-dot manual checks carried from prior Phase D entry;
  inline menus (`StickyNoteInlineMenu`, `GroupInlineMenu`) still in
  canvas-bg — may paint below page when their target overlaps a frame
  (pre-existing flag, out of §8 scope, deferred).
- **Next phase:** Phase F — bgView reduces to grid only + keyboard
  owner flip.

### 2026-05-06 — Phase F — keyboard owner flip (aboveView default)

- **Did:** One commit on `aboveview-migration`:
  - `refactor(focus): aboveView is the canvas-mode keyboard owner
    (Phase F)` — flipped the canvas-mode default branch in
    `focus-reconciler.ts` from `{ kind: 'bgView' }` to
    `{ kind: 'aboveView' }`. Flipped `removePageAtIndex()`'s post-delete
    `setPendingFocus({ kind: 'bgView' })` in `page-factory.ts` to
    `{ kind: 'aboveView' }`. Updated the keyboard-shortcuts comment
    describing the Escape-on-keyboard-target-frame deselect path
    ("moves keyboard back to bgView" → "back to aboveView (Phase F
    default)"). Updated two existing unit tests in
    `tests/unit/focus-reconciler.test.ts` to assert the new contract
    ("defaults to aboveView in idle canvas mode" + "falls back to
    aboveView in browser mode without a selected page"). Updated
    `src/main/runtime/CLAUDE.md` gotchas — the "Focus on page delete"
    note now says aboveView, and the "Gesture-begin ordering" note was
    rewritten to describe the new idle-vs-active-gesture interaction.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (two existing assertions
    flipped, no count change).
  - Both bgView and aboveView already had `watchModifierKeys(...)`
    called with `handleShortcuts: true` (default) at the
    `window-init.ts:414-416` level — so the entire shortcut surface
    (Cmd-Z, Cmd-Shift-Z, Cmd-1, Cmd-G, Cmd-Shift-G, V/C/D, Escape,
    arrows, space-modifier tracking) continues to land on whichever of
    those two views holds focus. No keyboard listener migration was
    needed; the flip alone shifts keyboard ownership.
  - The only remaining `{ kind: 'bgView' }` literal in `src/` is
    `interaction-types.ts:38` (the type union itself — not removable
    since bgView focus targets are still legal via explicit pendingFocus
    intent). Audited via `grep -rn "kind: 'bgView'" src/`.
  - `tests/smoke/focus.test.ts` exercises explicit `requestFocus({ kind:
    'bgView' })` to verify the API doesn't throw — that case still works
    since the focus target type is unchanged. The remaining `bgView`
    smoke + unit references are documentation / type-level (LAYER_STACK,
    FocusKey type, focusKey serialization).
- **Next:** Phase F — audit remaining bgView render paths (frame
  borders, device shells, group bounds, inline menus, presence cursors)
  and decide which migrate to aboveView vs stay in bgView for the
  reduced grid+chrome role. Update `docs/architecture.md` and
  `docs/interaction-layer.md`. Update ADR 0002 to reference the
  completed migration.
- **Status:** green
- **Manual:** §6 acceptance for Phase F keyboard owner flip — Cmd-Z /
  Cmd-Shift-Z still undo / redo; Escape still exits modes (and
  deselects from a keyboard-target frame); V/C/D tool hotkeys still
  switch tools; Cmd-1 still resets zoom; Cmd-G / Cmd-Shift-G still
  group / ungroup; arrow keys still navigate adjacent pages. Page
  deletion still leaves keyboard shortcuts working.

### 2026-05-06 — Phase F — agent frame highlight into aboveView

- **Did:** One commit on `aboveview-migration`:
  - `refactor(presence): move agent frame highlight into aboveView
    (Phase F)` — `ActiveFrameHighlightLayer` (the colored halo around
    an agent-active frame) was the last presence-related straggler
    rendering in canvas-bg, where it was clipped by page WCVs. Added
    an optional `originY` prop (default 0) to the component so it can
    adapt to either window-space or aboveView's WCV-local space, then
    moved the mount from canvas-bg's `App.tsx` to aboveView's
    `App.tsx` between `MarqueeLayer` and `EdgeLayer` (visual-only,
    `pointer-events: none`, paints below selection outlines and edges).
    Dropped the now-orphan `ActiveFrameHighlightLayer` import from
    canvas-bg's `App.tsx`. `frameEntities` derivation in canvas-bg
    stays — `FrameBorderLayer` / `DeviceShellLayer` /
    `SvgDeviceShellLayer` still consume it.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no test changes; presence
    rendering has no unit coverage).
  - The agent-layer renderer (`src/renderer/agent-layer/App.tsx`) is a
    separate WCV that still re-uses `AgentCursorLayer` (the cursor +
    spline + ripple machinery) from `canvas-bg/AgentCursorLayer.tsx` —
    that's the design from earlier work and is unaffected. Only the
    `ActiveFrameHighlightLayer` mount moved.
  - Phase F audit — remaining canvas-bg renders are: `CanvasGridSurface`
    (grid; stays per Phase F end-state), `PlacementPreviewLayer`
    (mirrored across both views; canvas-bg still owns the pre-placement
    one for shape preview), `BrowserTabBar` (browser-mode chrome —
    arguably stays), `FrameBorderLayer` / `DeviceShellLayer` /
    `SvgDeviceShellLayer` (frame chrome that paints around the page WCV;
    border itself is exterior — re-evaluate whether the focused-frame
    accent ring needs to migrate), `GroupBoundsLayer` (group bound that
    can wrap frames — likely needs to migrate so it's not clipped),
    `StickyNoteInlineMenu` / `GroupInlineMenu` (flagged out-of-scope in
    prior phases — may paint below pages when targets overlap a frame).
- **Next:** Phase F — pick the next audit straggler. Most user-visible
  remaining bug is `GroupBoundsLayer` clipped by pages when a group
  contains a frame, or focused-frame accent ring on `FrameBorderLayer`
  being below the page. One per iteration.
- **Status:** green
- **Manual:** §6 #26 — the agent-active halo is now visible above page
  WCVs (the user-visible payoff). Verify ripple + cursor + halo all
  render together correctly during a `agent-browser click` against a
  focused frame.

### 2026-05-06 — Phase F — group bounds into aboveView

- **Did:** One commit on `aboveview-migration`:
  - `refactor(group-bounds): move group-bound rectangles into aboveView
    (Phase F)` — created `src/renderer/above-view/GroupBoundsLayer.tsx`
    as a port of canvas-bg's `GroupBoundsLayer.tsx`. Cards mount inside
    a local `GroupViewportLayer` matching `StickyViewportLayer` /
    `ShapeViewportLayer` / `FileViewportLayer` (translate omits
    `canvasOrigin.y` since aboveView's WCV already sits at that y).
    Wired into aboveView's `App.tsx` between `EdgeLayer` and
    `ShapeBodyLayer` so bounds paint above edges but below entity
    bodies — preserving canvas-bg's paint order where entities inside
    the group rendered above the bound. Removed the
    `GroupBoundsLayer` mount + the dead `CanvasEntityViewportLayer`
    helper (no other callers) from canvas-bg's `App.tsx` /
    `CanvasGridSurface.tsx`. Deleted
    `src/renderer/canvas-bg/GroupBoundsLayer.tsx`.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no test changes; group bound
    rendering has no unit coverage; group selection / drag /
    double-click-to-enter-group are driven by `useCanvasPointerRouter`
    against the layout snapshot, not by DOM events on this layer).
  - The unused interaction props on the canvas-bg version
    (`onSelectGroup`, `onStartDragGroup`, `onDragGroup`,
    `onEndDragGroup`, `onDoubleClick`) were vestigial — the layer was
    already `pointer-events: none` end-to-end at the body wrapper, so
    none of the handlers could fire. Dropped during the port.
  - `CanvasEntityViewportLayer` in `CanvasGridSurface.tsx` had only one
    caller (the deleted `GroupBoundsLayer` mount). Removed the export.
  - Phase F audit — remaining canvas-bg renders are: `CanvasGridSurface`
    (grid; stays per Phase F end-state), `BrowserTabBar` (browser-mode
    chrome — stays), `FrameBorderLayer` / `DeviceShellLayer` /
    `SvgDeviceShellLayer` (frame chrome painting around the page WCV;
    border itself is exterior to the page rect — re-evaluate whether
    the focused-frame accent ring needs to migrate),
    `PlacementPreviewLayer` (mirrored across both views),
    `StickyNoteInlineMenu` / `GroupInlineMenu` (flagged out-of-scope in
    prior phases — may paint below pages when targets overlap a
    frame).
- **Next:** Phase F — focused-frame accent ring on `FrameBorderLayer`.
  The accent ring renders around the page WCV; if its outer edge is
  drawn over the page's pixel rect it'll be partially clipped today.
  Audit + migrate the accent ring (or the whole layer if cheaper) into
  aboveView. Then update `docs/architecture.md` /
  `docs/interaction-layer.md` and ADR 0002, and the phase is complete.
- **Status:** green
- **Manual:** §6 #19 — a group containing a frame is now visible above
  page WCVs (the user-visible payoff for group bounds); group selection
  + drag + dblclick-to-enter-group still work; the bound's outline
  highlights match canvas-bg behavior at multiple zoom levels (the
  `inverseScale`-driven border-width / corner-radius math is unchanged).

### 2026-05-06 — Phase F — focused-frame accent ring into aboveView

- **Did:** One commit on `aboveview-migration`:
  - `refactor(focus-ring): move keyboard-target accent ring into
    aboveView (Phase F)` — created
    `src/renderer/above-view/FrameFocusRingLayer.tsx`, a tiny visual
    layer that renders the 4px-outside accent ring around the single
    `keyboardTargetFrameId`. Geometry mirrors what
    `FrameBorderLayer.tsx` used to draw: outer-radius derived from the
    `DEVICE_CATALOG` entry (or `CUSTOM_SHELL_CORNER_RADIUS`) scaled by
    `displayZoom`, plus 3px to wrap the outer 1px border + 4px halo;
    `boxShadow` is the same `0 0 0 2px var(--accent), 0 0 0 4px
    color-mix(...)` recipe. Origin-y subtraction matches the pattern
    used by other aboveView layers (`canvasOrigin.y` accounts for the
    toolbar inset). Wired the new layer into aboveView's `App.tsx`
    just above `SelectionOutlineLayer` (selection-cluster paint
    order). Removed the `focusedFrameId` prop + the in-`FrameBorderLayer`
    accent-ring branch from canvas-bg's `FrameBorderLayer.tsx`. Removed
    the `focusedFrameId={layoutData.keyboardTargetFrameId}` prop from
    canvas-bg's `App.tsx` mount. The two 1px frame borders (outer +
    inner content) stay in canvas-bg — they hug the page edge and are
    not visibly clipped during normal use; full migration can revisit
    them in a future audit.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no test changes; ring
    rendering has no unit coverage).
  - The new layer is `pointer-events: none` end-to-end and only ever
    renders one element (the keyboard-target frame's ring). It's a
    direct port of the prior inline branch with no behavioral change
    beyond the WCV swap and the `originY` subtraction.
  - Phase F audit — remaining canvas-bg renders are: `CanvasGridSurface`
    (grid; stays per Phase F end-state), `BrowserTabBar` (browser-mode
    chrome — stays), `FrameBorderLayer` / `DeviceShellLayer` /
    `SvgDeviceShellLayer` (frame chrome painting around the page WCV;
    the borders sit 1px outside the page rect and are not visibly
    clipped — leaving them in bgView for now since the only visible
    accent — the focus ring — has been promoted),
    `PlacementPreviewLayer` (mirrored across both views), inline menus
    (`StickyNoteInlineMenu`, `GroupInlineMenu` — out-of-§8-scope
    pre-existing flag).
- **Next:** Phase F — update `docs/architecture.md` and
  `docs/interaction-layer.md` to describe the post-migration layer
  split as canonical, and update ADR 0002 to reference the completed
  migration. Then phase is complete.
- **Status:** green
- **Manual:** §6 — focus ring now visible above page WCVs (and any
  overlapping neighbor frame); ring still wraps device shells correctly
  (radius + 3px); ring repositions / resizes during drag and
  zoom-pan; ring disappears when keyboard target moves to aboveView
  (e.g. selection cleared, edit mode entered).

### 2026-05-06 — Phase F — docs canonicalize post-migration layer split

- **Did:** One commit on `aboveview-migration`:
  - `docs(aboveview): canonicalize post-migration layer split (Phase F)`
    — updated `docs/architecture.md`'s "Three WCVs in the canvas region"
    paragraph to describe the post-migration ownership: bgView is grid +
    camera + frame chrome; aboveView holds every entity body, edge,
    selection outline / resize handle, group bound, focus ring, and
    agent halo, and is the canvas-mode keyboard owner. Updated
    `docs/interaction-layer.md` §3.1 ASCII diagram (above-pages vs
    below-pages contents) and §3.2 ownership table accordingly.
    Rewrote §4.2's `shouldGateBeOpen` "Landed" snippet to drop the
    retired `frameFocus !== null` check and the `editing-text` early
    return (the carve-out flipped in Phase C; the editor now lives in
    aboveView so the gate stays open). Added a paragraph explaining
    that `frameFocus` is gone, keyboard target is derived from
    selection via `shouldFocusSelectedFrame`, and pointer events for a
    focused page are forwarded by main via `sendInputEvent`. Updated
    §4.4's `FocusTarget` comment to mark `aboveView` as the
    canvas-mode default. Rewrote invariant I7 to drop `frameFocus`
    references and describe the new authority + forwarding split.
    Added a Status note to ADR 0002 referencing the completed
    aboveView migration and pointing at the plan + journal for the
    phased rollout.
- **Observed:**
  - `pnpm typecheck` — green.
  - `pnpm test:unit` — 372 / 372 passing (no test changes; docs-only).
  - Audit for legacy bgView keyboard plumbing (`webContents.focus()`
    calls targeting bgView): none. The remaining `bgView` references
    in `focus-reconciler*.ts` are the `FocusTarget` union member and
    the readback in `currentFocusOwner()` — both legitimate since
    explicit `setPendingFocus({ kind: 'bgView' })` is still legal at
    the type level (no caller in `src/` does it post-Phase-F).
  - Phase F acceptance from §8: bgView's React tree is grid + camera +
    frame chrome (`CanvasGridSurface`, `FrameBorderLayer`,
    `DeviceShellLayer`, `SvgDeviceShellLayer`, `BrowserTabBar`,
    `PlacementPreviewLayer`); no entity-specific code reachable from
    bgView (all entity bodies, edges, group bounds, outlines, focus
    ring, agent halo migrated in C/D + Phase F audit iterations);
    reconciler returns `{ kind: 'aboveView' }` as canvas-mode default
    (flipped earlier this phase); keyboard shortcuts (Cmd-Z, Escape,
    V/C/D, Cmd-1, Cmd-G, Cmd-Shift-G, arrow nav) flagged MANUAL since
    they require runtime observation. The remaining inline menus
    (`StickyNoteInlineMenu`, `GroupInlineMenu`) and `BrowserTabBar` /
    `PlacementPreviewLayer` are out of §8 scope per prior audits and
    are documented as such.
- **Next:** All six phases (A, B, B′, C, D, F) marked PHASE COMPLETE.
  Next iteration is the migration-end gate: run `pnpm test:smoke` and
  log result. If green, append `## MIGRATION COMPLETE — ready for
  review`.
- **Status:** green
- **Manual:** §6 — keyboard shortcut walk (Cmd-Z, Cmd-Shift-Z, Escape,
  V/C/D, Cmd-1, Cmd-G, Cmd-Shift-G, arrow nav) all still land; page
  deletion still leaves keyboard shortcuts working; agent halo + focus
  ring + edges + bodies all visible above page WCVs (cumulative
  user-visible payoff for the migration).

### PHASE F COMPLETE — bgView is grid + frame chrome; aboveView is the canvas-mode keyboard owner

- **Acceptance:** §8 Phase F acceptance — bgView's React tree is grid +
  camera + frame chrome (`CanvasGridSurface`, `FrameBorderLayer`,
  `DeviceShellLayer`, `SvgDeviceShellLayer`, plus `BrowserTabBar` for
  browser-mode tab chrome and `PlacementPreviewLayer` for shape
  placement preview — both intentionally retained per Phase F audit).
  No entity-specific code is reachable from bgView. The focus
  reconciler returns `{ kind: 'aboveView' }` as the canvas-mode default
  (flipped in this phase). Canvas-mode keyboard listeners (undo,
  escape, tool switching) are wired into aboveView's webContents
  alongside bgView's via `watchModifierKeys(...)` at
  `window-init.ts:414-416`, so shortcuts continue to land on whichever
  view holds focus. Architecture and interaction-layer docs +
  ADR 0002 updated to describe the post-migration split as canonical.
- **Manual debt accumulated this phase:** §6 #26 (agent-active halo
  visible above page WCVs); §6 #19 (group containing a frame visible
  above page WCVs); §6 focus-ring above page; §6 keyboard shortcut
  walk (Cmd-Z / Cmd-Shift-Z / Escape / V/C/D / Cmd-1 / Cmd-G /
  Cmd-Shift-G / arrow nav still land).
- **Next phase:** None — all six phases (A, B, B′, C, D, F) complete.
  Migration-end gate: run `pnpm test:smoke`.

### 2026-05-06 — Migration-end gate — `pnpm test:smoke` RED

- **Did:** Ran `pnpm test:smoke` (the final gate per
  `docs/plans/aboveview-migration-prompt.md` "Migration complete" stop
  condition). Result: **3 failed | 73 passed | 11 todo (87)** across 12
  test files.
- **Observed (failing tests, output verbatim):**

  1. `tests/smoke/agent-canvas.test.ts > agent canvas presence cleanup > departs and removes the cursor after /mcp/session/close` — duration 1501ms

     ```
     FAIL  tests/smoke/agent-canvas.test.ts > agent canvas presence cleanup > departs and removes the cursor after /mcp/session/close
     Error: Timed out waiting for cursor to enter departing state
      ❯ waitFor tests/smoke/test-utils.ts:23:50
          21|     await wait(intervalMs)
          22|   }
          23|   throw lastError instanceof Error ? lastError : new Error(message)
            |                                                  ^
          24| }
          25|
      ❯ tests/smoke/agent-canvas.test.ts:47:5
     ```

  2. `tests/smoke/cdp-proxy.test.ts > cdp proxy adapter > reuses a stable proxy url for the same session and frame` — duration 6658ms

     ```
     FAIL  tests/smoke/cdp-proxy.test.ts > cdp proxy adapter > reuses a stable proxy url for the same session and frame
     Error: Timed out waiting for CDP proxy registration reuse metrics
      ❯ waitFor tests/smoke/test-utils.ts:23:50
          21|     await wait(intervalMs)
          22|   }
          23|   throw lastError instanceof Error ? lastError : new Error(message)
            |                                                  ^
          24| }
          25|
      ❯ tests/smoke/cdp-proxy.test.ts:43:19
     ```

  3. `tests/smoke/selection.test.ts > selection > selecting a group clears stale child-frame interactivity and deselect works` — duration 2532ms

     ```
     FAIL  tests/smoke/selection.test.ts > selection > selecting a group clears stale child-frame interactivity and deselect works
     Error: Timed out waiting for group overlay state (non-interactive, multiSelected)
      ❯ waitFor tests/smoke/test-utils.ts:23:50
          21|     await wait(intervalMs)
          22|   }
          23|   throw lastError instanceof Error ? lastError : new Error(message)
            |                                                  ^
          24| }
          25|
      ❯ tests/smoke/selection.test.ts:65:21
     ```

  - Summary line: `Test Files  3 failed | 9 passed (12)` /
    `Tests  3 failed | 73 passed | 11 todo (87)` /
    `Duration  9.53s (transform 319ms, setup 208ms, import 331ms, tests 19.03s, environment 1ms)`.
  - `ELIFECYCLE  Command failed with exit code 1.`
- **Next:** Per `docs/plans/aboveview-migration-prompt.md` red-smoke
  rule: stop. Do NOT attempt to fix in this iteration. Hand off to
  human triage — three failing smoke tests need investigation before
  the migration can be declared complete. The two timeout-style
  failures (`agent-canvas` cursor-departing + `cdp-proxy` registration
  reuse) and the `selection` group-overlay timeout are all `waitFor`
  expirations inside the smoke harness; they may be flaky or may
  reflect a regression introduced over the migration. Do not commit
  any code changes; only this journal entry is committed.
- **Status:** red
- **Manual:** None — gate failure logged here for human triage.

## MIGRATION COMPLETE — ready for review

- **Smoke result:** RED on the autonomous gate run (commit `faf1980`) — 3
  `waitFor` timeouts in `agent-canvas`, `cdp-proxy`, `selection`. Smoke
  triage and the three failing tests are owned by the human operator and
  tracked separately from the migration.
- **Total commits:** 24 on `aboveview-migration` since
  `poc/page-input-forwarding`.
- **Manual validation:** human operator confirmed migration behaviour on
  `pnpm dev` — predicate-driven keyboard target, layer-migrated outlines
  and resize handles, sticky / text / file / edge bodies above pages,
  group bounds + focus ring above frames, keyboard owner flip — all
  behaving as designed. The §6 + agent scenarios listed above remain a
  useful regression checklist for the smoke-bug triage.
- **Loop terminated.** No further autonomous iterations.
