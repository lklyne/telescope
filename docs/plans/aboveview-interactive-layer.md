# Plan — aboveView as the interactive layer

The endpoint our current architecture is pointing at: aboveView becomes the
"everything above pages" plane. Live frame WCVs are bitmaps sandwiched between
bgView (grid only) and aboveView (all visual + interactive UI). aboveView stays
visible at all times in canvas mode; input intended for the **single-selected**
frame is forwarded into its `webContents` via `sendInputEvent`.

> **PoC outcome — passed (2026-05-06).** Forwarding via `sendInputEvent`
> reproduces native input fidelity under real use. The visual-layer migration
> proceeds per §8. PoC implementation log:
> [`aboveview-interactive-layer-poc.md`](./aboveview-interactive-layer-poc.md).
> Validation scenarios that informed the verdict live in §6; pass/fail
> criteria in §7; running findings + carve-outs in §9.

---

## 1. Why this is the endpoint

Today on `refactor/input-authority-frame-focus`:

- bgView paints frame borders, edges, group bounds, sticky bodies, file
  bodies, selection outlines, resize handles, drawings (saved). All of
  these get clipped by page WCVs above bgView.
- aboveView paints chrome, marquee, edge-drag preview, active drawing
  stroke. aboveView hides when a frame is focused, so chrome disappears
  with it.
- The input authority (canvas pointer router) lives in aboveView and is
  the right shape — single arbitration, pure hit-test, exhaustive action
  table, demolished bgView per-layer pointer hooks.

Symptoms the current split causes that the endpoint fixes:

- Stickies and notes can't render above frames.
- Selection outline + resize handles render below the page.
- Chrome of every entity disappears when one frame is focused.
- The "everything above frames" UX intent isn't expressible.

The router architecture (hit-test priority, `data-overlay-ui` yield,
entity-chrome-slots, useAnchoredPosition) is reusable as-is for the
remaining layers. The blocker is a single mechanism: the gate-flip on
`frameFocus` from ADR 0001. Removing it requires input forwarding.

---

## 2. End-state architecture

```
┌──────────────────────────────────────────────────────────┐
│  toolbar / sidebars / devtools  (their own WCVs)         │
├──────────────────────────────────────────────────────────┤
│  aboveView  (singleton WCV — the interactive layer)      │
│   ├─ chrome (frame URL bars, file titles, group labels)  │
│   ├─ selection outlines + resize handles                 │
│   ├─ marquee, edge drag preview, drag-copy preview       │
│   ├─ sticky/text/file/shape entity bodies                │
│   ├─ drawings (active + saved)                           │
│   ├─ comments, annotations, floating UI                  │
│   └─ canvas pointer router (input arbitration)           │
├──────────────────────────────────────────────────────────┤
│  pages  (live frame WCVs — paint only, sandwiched)       │
├──────────────────────────────────────────────────────────┤
│  bgView  (singleton WCV — grid + future bitmaps)         │
│   ├─ canvas grid, camera transform                       │
│   └─ inactive-page bitmaps (Phase 6, optional)           │
└──────────────────────────────────────────────────────────┘
```

**Input model:**

Selection — not a separate "focus" state — drives forwarding. Single-selected
frame = forward. The existing `frame-focus.*` runtime is mirrored from
selection during the PoC and collapses entirely in post-PoC cleanup.

aboveView's pointer router runs on every pointerdown/wheel/move. On each
event it consults the layout snapshot:

- Hit is on chrome / overlay UI / canvas-level visual → router handles
  (same as today).
- Hit is on the body of the **single-selected** frame → router forwards the
  event to that frame's `webContents` via `sendInputEvent`. The page reacts
  as if clicked / scrolled directly.
- Hit is on the body of an **unselected** frame → first click selects (the
  router eats the down/up pair; the page never sees it). Subsequent clicks
  forward once selection lands.
- Hit is on a frame inside a **multi-selection** → router treats it as a
  canvas-level gesture (drag, marquee). No forwarding.
- Hit is on canvas background → marquee / pan (same as today).

`gate-predicate.ts` collapses to `viewMode === 'canvas'` (always open in
canvas mode). The `frameFocus` carve-out goes away.

`page-content`'s blocking overlay disappears for the single-selected frame;
aboveView is the gatekeeper. Unselected frames keep the overlay until the
post-PoC migration completes.

---

## 3. The load-bearing unknown — `sendInputEvent` (resolved)

Every other piece of the endpoint is mechanical layer migration. The one
piece we couldn't predict from reading code was whether `sendInputEvent`
faithfully reproduces native input across the surface area users
exercise. The PoC answered: **yes, with a small set of known carve-outs**
recorded in §9.

The original worry list (none resolvable by inspection) is preserved
below for reference and to anchor regression testing during the
migration:

- **Wheel:** Trackpad inertia, momentum scroll, pinch-zoom (Cmd+wheel),
  smooth-scroll vs line-scroll deltas. Native scrolling on macOS uses
  CGEvent kinds the renderer wouldn't normally see.
- **Pointer fidelity:** Modern web is built on PointerEvent. Does
  `sendInputEvent` synthesize PointerEvents, or only legacy MouseEvents?
  Hover-driven UI (tooltips, drop-down opens on hover) needs mousemove
  forwarded continuously while the cursor is over the focused frame.
- **Click → navigation:** A simple anchor click should navigate. Drag a
  link to a new tab — does that still work? Triple-click select, double-
  click word-select, drag-select text.
- **IME / keyboard:** Keyboard goes through `webContents.focus()` already.
  Forwarding wheel/click shouldn't disturb that, but worth verifying.
- **Cursor styling:** Browser-native cursor changes (text caret over
  inputs, pointer cursor on links) require continuous mousemove
  forwarding so the page can hit-test on its end.
- **Right-click context menu:** macOS conventions, plus our own
  inspect/annotate handlers.
- **Drag-out from page:** dragging an image out of the page to the
  canvas. The page needs to originate the drag, then ownership transfers
  to the OS.
- **`sendInputEvent` BrowserWindow focus prerequisite:** Electron
  documents this. If the BrowserWindow loses focus, forwarded events
  drop. Behavior under app blur needs to be characterized.

In the event, none of these broke in a way that forced a redesign.
Carve-outs we accept and revisit per migration phase are tracked in §9.

---

## 4 & 5. PoC scope and implementation

**Moved to [`aboveview-interactive-layer-poc.md`](./aboveview-interactive-layer-poc.md).**

The actionable plan there covers:

- Selection-driven forwarding (no separate focus concept).
- No flag — always-on. Running `pnpm dev` exercises the new path.
- Six-file touch list, no visual-layer migration.
- Validation for both **users** (forwarded input) and **agents** (CDP via
  `agent-browser`).
- Five-commit landing sequence ending with findings recorded in §9 below.

The validation scenarios in §6, pass/fail in §7, and findings table in §9
remain the canonical reference; the PoC doc points back here for those.

---

## 6. Validation scenarios

For each scenario, run `pnpm dev`, select a frame (click the frame body
once — first click selects only, no forward), then perform the action.

### Wheel

1. **Vertical scroll** on a long page (e.g. wikipedia article).
   *Expected:* page scrolls, smoothly, with trackpad inertia preserved.
2. **Horizontal scroll** on a horizontally-scrollable element.
3. **Cmd / Ctrl + scroll** — does this zoom the canvas (current
   behavior) or zoom the page? Document and pick.
4. **Pinch-zoom on trackpad** — same question.
5. **Scroll inside a nested scrollable element** (e.g. a Twitter feed
   inside a sidebar that itself scrolls).
6. **Scroll near the cursor exiting the frame** — forwarding stops at
   the body edge; canvas zoom/pan resumes.

### Pointer

7. **Single click on a link** → page navigates.
8. **Click on a button** → button fires.
9. **Triple-click to select a paragraph**, then drag-select extension.
10. **Form interaction** — type into an input (keyboard already routes
    through `webContents.focus()`, but verify focus lands).
11. **Hover-driven UI** — hover a dropdown trigger on a real site and
    confirm the dropdown opens.
12. **Cursor styling** — mouse over a link, the cursor becomes a hand;
    over text, an I-beam.
13. **Right-click** → context menu (or our annotate menu — define
    behavior).
14. **Drag image out of page** to the canvas — does the OS-level drag
    initiate?

### Boundary

15. **Click outside frame** while selected → frame deselects → forwarding
    stops. Gate predicate stays open in canvas mode regardless.
16. **Click another frame** → selection transfers, forwarding switches.
17. **App loses focus** (Cmd+Tab away, then back) → forwarding still
    works after re-focus.
18. **DevTools open on selected frame** — does forwarding still reach the
    page? Does DevTools stay attached?
19. **Multi-select including the frame** — wheel and pointer over the
    frame go to the canvas, not the page (no forwarding when selection is
    not single).
20. **First-click consumed correctly** — click a button on an unselected
    frame: nothing happens (frame selects). Click again: button fires.

### Stress / regression

21. **Active drawing tool** while frame selected — drawing strokes still
    paint above the page (drawings already in aboveView).
22. **Marquee selection** while frame selected — marquee still works
    (background hit, not body forward).
23. **Existing chrome interactions** — URL bar, back/forward, hover
    titles all still work.

### Agents

24. **`agent-browser click @eN`** against a single-selected frame — CDP
    delivers; page reacts.
25. **Same against an unselected frame** — `beginAutomationInteractiveFrame`
    lifts the blocking overlay for the targeted frame; verify still works.
26. **`AgentCursorLayer`** ripple / cursor render above frames during
    agent activity.
27. **User + agent in parallel** — user interacts with frame A while
    agent runs in frame B; both pipelines work independently.

---

## 7. Pass / fail criteria

**Pass** if all of:

- Scenarios 1, 2, 5, 6 (wheel) feel native — no perceptible difference
  vs gate-flip path.
- Scenarios 7, 8, 9, 10, 11, 12 (pointer) all behave correctly. Hover
  cursor-styling is the most likely fragile case; if it works, the rest
  usually does.
- Scenario 14 (drag-out) works. If not, document the workaround
  (probably involves dispatching `dragstart` differently).
- Scenarios 15–18 (boundary cases) work without state corruption.

**Fail** if any of:

- Wheel scrolling has visibly different feel (jerky, missing inertia,
  wrong direction). Document specifically what feels wrong.
- Hover doesn't update — UI driven by `mouseenter` / `mouseleave` /
  `:hover` doesn't react.
- Clicking links navigates inconsistently or not at all.
- Forwarding races with normal navigation (e.g. forwarded click fires
  twice because page also gets a native event somehow).

If we hit a partial — wheel works but pointer doesn't, or pointer works
but cursor styling doesn't — document the boundary precisely so the
endpoint design can carve around it.

---

## 8. Migration plan — full move to aboveView

The PoC shipped the always-on forwarding path (no flag). What remains is
mechanical layer migration: pull each visual layer out of bgView (or its
own per-layer hook) and into aboveView, then retire the scaffolding the
old split required.

**Operating principles:**

- One phase per merge. Each phase ends with a working app, green typecheck
  + unit tests, and at least one smoke or scenario walk-through.
- Every phase produces a deletion in the next phase's diff. If a phase
  doesn't make subsequent code shrink, it's the wrong phase boundary.
- Geometry is already pure (`useAnchoredPosition` /
  `entity-chrome-slots`). Don't introduce new geometry abstractions
  during the migration; reuse what chrome already uses.
- Keep `data-overlay-ui` yields on every aboveView UI surface. The
  router treats them as canvas-handles-it; without them, hover and
  forwarded input collide.
- Re-run the §6 boundary scenarios (15–18) after every phase. Selection,
  app-blur, and DevTools are the most likely places a layer migration
  breaks in subtle ways.

### Phase A — Collapse `frame-focus.*` into selection

The PoC mirrors selection → `frameFocus` to keep the existing focus
reconciler running unchanged. That mirror is debt; selection should be
the single source of truth for "which page gets keyboard + forwarded
input".

The naive re-key — "reconciler returns `page` whenever a single frame is
selected" — is wrong in four real cases that today are absorbed by
`frameFocus` not always tracking selection:

1. Sticky/markdown editor active over a single-selected frame —
   keystrokes must land in aboveView's contenteditable, not the page.
2. `toolMode === 'annotate-draw'` with a single frame selected — strokes
   are canvas-bound, page must not capture keys.
3. Active drag of a single-selected frame — Escape must reach the canvas
   key handler.
4. `inspect` / `annotate-comment` modes with a single frame selected —
   keyboard goes to canvas (Escape exits the mode).

Phase A therefore introduces a small derived predicate, not a raw
selection read:

```
shouldFocusSelectedFrame =
  single-selected frame
  AND interactionKind === 'idle'
  AND toolMode === 'select'
  AND no aboveView contenteditable / input has focus
```

This is **transitional debt**. The end state is a clean 1:1 mapping
where "single-frame selection" *is* "page is the keyboard target," with
edit-mode ergonomics rebuilt so they no longer fight selection (e.g.
entering edit mode on a sticky moves selection to the sticky, vacating
the frame). The predicate ships now so we can delete `frame-focus.*`
without regressing any of the four cases above; it gets retired when
the edit-mode work catches up.

- Add `shouldFocusSelectedFrame(...)` as a pure helper next to
  `selection-controller`. Unit-test all four divergence cases.
- Re-key `focus-reconciler` off the predicate.
- Delete `frame-focus.ts`, `frame-focus-escape.ts`,
  `frame-focus-selection.ts`, and the
  `selection-controller.commitSelection` mirror.
- Drop `frameFocus` from runtime context entirely.
- While editing this hook, fix `routeWheel` in `above-view/App.tsx` to
  consult `interactionKind` — wheel during `dragging-entities` of a
  single-selected frame should not scroll the page underneath.
- Verify §6 #15–18 (boundary cases) and agent A1–A4 (CDP unaffected).

**Acceptance:** `grep -r frameFocus src/` returns zero hits in runtime
code. Page focus follows the predicate, not raw selection. The four
divergence cases each have a unit test and a manual scenario.

### Phase B — Selection outlines + resize handles into aboveView

The cheapest visible win — these already have the right geometry shape
and are the most painful to render below the page.

- Move outline + handle render from bgView entity layer into aboveView.
- Resize-edge hit-test moves from `useCanvasPointerRouter`'s existing
  edge branch to the same router but reading aboveView geometry.
- Delete the bgView resize-handle render path and any
  `pointer-events: none` shims that exist purely to make handles
  reachable through the page.

**Acceptance:** Selection outline visible above pages. Drag-to-resize
works on a focused frame. `bgView` no longer references resize-handle
geometry.

### Phase B′ — Honor entity z-order in the body hit-test (precursor to C)

Today `collectBodyTargets` in `src/shared/hit-test.ts` puts non-group
entities and frames in the same bucket and iterates `inputs.entities`
in insertion order — *not* z-order. The comment in the file admits the
proper z-sort isn't read. This is invisible today because stickies live
in bgView under the page; they never visually overlap a frame body.

The moment Phase C lands, a sticky painted over a single-selected frame
must hit before the frame-body — otherwise clicks on the sticky
sometimes resolve to `frame-body-press` and forward into the page
underneath.

- Read `entityOrder` (or its layout-snapshot proxy) and iterate bodies
  front-to-back in `collectBodyTargets`. Frame and non-group entity
  bodies sort together; the front-most wins regardless of kind.
- Groups stay last (containers; members on top still hit first).
- New unit test: sticky positioned over a frame body, sticky declared
  front, hit returns `entity-body`. Reverse z-order returns
  `frame-body`.

**Acceptance:** Existing hit-test tests pass. New z-order test passes.
No visual change yet (still pre-Phase-C). This phase is intentionally
small and standalone so it can ship even if C/D get reshuffled.

### Phase C — Sticky / text / shape entity bodies into aboveView

The "stickies on top of frames" UX intent. Bodies move; chrome already
lives in aboveView via `EntityChrome`.

- Migrate `StickyBody`, `TextBody`, `ShapeBody` mounts from bgView to
  aboveView.
- Pointer router's existing `entity-body` hit-test continues to work —
  the geometry source moves but the action table doesn't (and B′ has
  already fixed the z-order so stickies-on-frames resolve correctly).
- **Retire the `editing-text` carve-outs.** The inline editors (sticky
  contenteditable, markdown textarea, wireframe text) now live in
  aboveView's WCV — they need the gate to stay open so aboveView is
  sized to receive keystrokes, and they need the focus reconciler to
  send keyboard focus to aboveView, not bgView. Concretely:
  - `gate-predicate.ts:57` — delete the
    `if (interactionKind === 'editing-text') return false` branch.
  - `focus-reconciler.ts:58-61` — flip the `editing-text` case from
    `{ kind: 'bgView' }` to `{ kind: 'aboveView' }`. Update the comment.
- Verify drag, multi-select marquee, and edit-mode entry all still work.

**Acceptance:** Drop a sticky over a focused frame; sticky is visible
and interactable; entering sticky edit mode places the caret in the
sticky and keystrokes land in the contenteditable (not the page below);
exiting edit mode returns forwarded input to the frame; the underlying
page still scrolls when you wheel outside the sticky.

### Phase D — File entity bodies + edges into aboveView

File entities use the renderer-plugin registry; the migration is per
renderer mount but each one is small.

- Move `RendererSwitch`-mounted bodies (`image`, `video`, `markdown`,
  `wireframe`, `component`) from bgView to aboveView.
- Move edge rendering (`edges/`) into aboveView. Edges currently render
  in bgView so they sit below the page; that's the regression to fix.
- Drag-image-out from a focused page (§9 carve-out) is the riskiest
  case here — verify before merging, and if it still fails, document
  the workaround.

**Acceptance:** A drawn edge from one frame to another is visible above
both pages. Image / video / markdown entities render above pages with
working interaction (play, scroll-within, etc.).

### Phase E — Retire `page-content`'s blocking overlay (deferred)

With every visible UI now above the page and the gate open in canvas
mode for the dominant cases, the per-frame blocking overlay (injected
by the page's own preload) is the last user of the old "page gated from
inside" model.

**This phase is explicitly deferred to future work.** It's not
load-bearing for the layer migration: aboveView captures input on top
of the page whenever the gate is open, so unselected frames already
don't receive native input during normal canvas use. The overlay only
matters during gate-closed states (`inspect`, `annotate-comment`), and
in those modes letting unselected frames receive native input is
*correct* — eyedropper hover should work on any frame, not just the
selected one.

When we do come back to retire it:

- Remove the overlay div from `page-content`.
- Remove `beginAutomationInteractiveFrame` / matching teardown if the
  agent path no longer needs to lift an overlay (it currently does for
  unselected frames).
- Confirm §6 #19 (multi-select including a frame: wheel goes to
  canvas) still holds — the router, not the overlay, must be doing
  the work.

**Acceptance (when revisited):** `page-content.ts` has no overlay path.
Agents still drive unselected frames via CDP without preamble.

### Phase F — bgView reduces to grid only + keyboard owner flip

End state: bgView is just the grid + camera transform, plus (eventually)
inactive-page bitmaps per `interaction-layer.md` §4.7. **aboveView is
the singleton keyboard owner in canvas mode.** bgView never holds
keyboard focus post-migration; the only other keyboard target is a page
WCV during forwarded frame interaction.

- Audit bgView for any straggler render paths (selection, hover, etc.)
  and delete or migrate.
- **Flip `focus-reconciler.ts:79`** from `{ kind: 'bgView' }` to
  `{ kind: 'aboveView' }` for the canvas-mode default. Move canvas-mode
  keyboard listeners (undo, escape, tool switching) from bgView's
  webContents onto aboveView's. Verify Cmd-Z / Cmd-Shift-Z still work,
  Escape exits modes, and tool hotkeys land.
- Audit any remaining `webContents.focus()` calls targeting bgView; if
  they exist purely as legacy keyboard plumbing, delete them.
- Update `docs/architecture.md` and `docs/interaction-layer.md` to
  describe the new layer split as canonical.
- Update ADR 0002 (canvas-anchored overlay UI) to reference the
  completed migration.

**Acceptance:** bgView's React tree is grid + camera + (optionally)
bitmap layer. No entity-specific code reachable from bgView. Reconciler
returns `{ kind: 'aboveView' }` as the canvas-mode default. All keyboard
shortcuts continue to work.

### Phase G — Selection-driven attention model (deferred)

Once everything lives in aboveView, overlays (edges, stickies, drawings)
stay visible above a focused frame at full opacity. Most of the time
that's the point. Sometimes it's noise — a 4px edge crossing a YouTube
frame distracts while you're watching.

This phase is **deferred** until the mechanical migration lands. The
direction is "dim aboveView overlays when a single frame is selected;
restore on hover-over-the-overlay." That's a single opacity rule keyed
off selection, not a per-entity geometric calculation. Tuning happens
once everything's already in one tree.

### Sequencing constraints

- Natural order: **A → B → B′ → C → D → F**. (E and G are deferred —
  not on the critical path.)
- **B′ must precede C.** Without z-ordered body hit-tests, stickies
  painted above frames will sometimes resolve clicks to the frame body
  and forward into the page underneath. B′ is small and standalone, so
  it can also ship before B if convenient.
- B can ship before A in a pinch — outline geometry doesn't depend on
  `frameFocus`. We pay that back by not deleting `frame-focus.*` until
  A lands.
- C and D are independent of each other once B′ has landed; C is cheaper
  and produces a visible UX win, so do it first.
- F depends on C + D (so the bgView audit finds nothing left). F also
  bundles the keyboard-owner flip — splitting that out into its own
  phase is fine if the bgView keyboard plumbing turns out to be deeper
  than expected.
- The §9 carve-outs (drag-out, IME, DevTools-while-focused) do not gate
  any phase. They get re-checked at the phase that touches the relevant
  surface (D for drag-out, A for IME, any phase for DevTools).

---

## 9. Findings

### Verdict — PASS (2026-05-06)

User-driven scenarios from §6 walked through on `poc/page-input-forwarding`
with `pnpm dev`. Forwarding via `sendInputEvent` matches the gate-flip
path closely enough to migrate visual layers behind it. Hover, cursor
styling, click, scroll (incl. trackpad inertia), right-click, form input,
and selection-driven boundary cases all behave correctly.

**Decision:** Proceed with the §8 migration plan. No redesign.

### Carve-outs to revisit during migration

These didn't block the verdict but warrant explicit re-validation at the
phase that touches them:

| Item | Origin | Where it lands |
|---|---|---|
| Drag image out of page → canvas | §6 #14 — flagged fragile in PoC §5 | Phase D (file entity migration). If still broken, document workaround (deselect → re-grab is acceptable). |
| IME composition under forwarding | §3 worry list | Phase A (focus reconciler re-key). Keyboard already routes via `webContents.focus()`; verify composition events don't drop. |
| DevTools attached to focused frame | §6 #18 | Any phase. Re-check that DevTools stays attached and forwarding still reaches the page. |
| Trackpad inertia edge cases | §6 #1 / §3 worry list | Re-check after Phase F (when bgView is grid-only and there's no longer any second wheel path to fall back to). |

### Implementation snapshot — what shipped on `poc/page-input-forwarding`

- `src/main/runtime/page-input-forwarding.ts` — `forwardWheelToFrame` and
  `forwardPointerToFrame` translate window-space coords to page-local and
  call `pageView.webContents.sendInputEvent`. Wheel uses
  `hasPreciseScrollingDeltas` from `WheelEvent.deltaMode` so trackpad
  pixel-precise scrolling distinguishes from line-mode mouse wheels (which
  populate `wheelTicksX/Y`).
- `src/main/runtime/page-cursor-bridge.ts` — mirrors `cursor-changed`
  events from the focused page back into aboveView so the OS shows the
  page-native hand / I-beam / etc. Electron's `pointer` cursor (Blink-era
  naming for the arrow) is mapped to CSS `default`.
- `canvas-forward-wheel` / `canvas-forward-pointer` IPC + matching
  `forwardWheelToFrame` / `forwardPointerToFrame` API on
  `CanvasBgElectronAPI`.
- `useViewportWheelAndMiddlePan` accepts an optional `routeWheel`
  pre-router. aboveView's `App.tsx` passes one that forwards wheel hits
  on the single-selected frame's body to the page; Cmd/Ctrl+wheel is
  classified as `'zoom'` upstream and stays on the canvas.
- `routePointerDown` returns a new `forward-pointer-down` action when
  the frame body of a single-selected frame is hit (covered by three new
  unit tests). `useCanvasPointerRouter`'s `runForwardPointer` forwards
  the down + window-level move/up; aboveView's `App.tsx` adds a
  hover-only continuous `pointermove` forwarder for cursor styling and
  `:hover`-driven UI. `pointerleave` resets `document.body.style.cursor`
  so forwarded hand/I-beam doesn't bleed into canvas chrome.
- `gate-predicate.ts` no longer carves out `frameFocus`; the gate stays
  default-open in canvas mode unconditionally. Two existing unit tests
  inverted to assert the new contract.
- `selection-controller.commitSelection` mirrors single-selected frame →
  `enterFrameFocus`/`exitFrameFocus` so the existing focus-reconciler keeps
  driving `webContents.focus()` without re-keying. **This mirror is debt;
  Phase A removes it.** Loop-safe via idempotence + `selectionEquals`
  early-return.
- `page-factory.ts` blur listener no longer fires `exitFrameFocus` —
  selection is the source of truth now; the reconciler keeps the page
  focused on the next layout pass.

`pnpm typecheck` and `pnpm test:unit` (363 tests) green.
