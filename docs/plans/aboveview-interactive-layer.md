# Plan — aboveView as the interactive layer

The endpoint our current architecture is pointing at: aboveView becomes the
"everything above pages" plane. Live frame WCVs are bitmaps sandwiched between
bgView (grid only) and aboveView (all visual + interactive UI). aboveView stays
visible at all times in canvas mode; input intended for the **single-selected**
frame is forwarded into its `webContents` via `sendInputEvent`.

This plan is **gated on a proof of concept**. The whole architecture rests on
input forwarding behaving like native page input under real use — wheel,
click, drag, hover, keyboard. If forwarding has macOS-specific holes that
break common cases (trackpad inertia, IME, link drag, etc.), we redesign
*before* migrating layers. PoC first.

> The actionable PoC plan lives in
> [`aboveview-interactive-layer-poc.md`](./aboveview-interactive-layer-poc.md).
> It supersedes §4–§5 below. The validation scenarios in §6, pass/fail
> criteria in §7, and findings table in §9 are still the canonical reference
> for the PoC; the new doc points back here for those.

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

## 3. The load-bearing unknown — `sendInputEvent`

Every other piece of the endpoint is mechanical layer migration. The one
piece we cannot predict from reading code is whether `sendInputEvent`
faithfully reproduces native input across the surface area users
exercise.

Specific worries, none resolvable by inspection:

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

If any of these break in ways we can't paper over with shims, the
endpoint design has to change (e.g. carve-outs, hybrid forwarding, or
keep the gate-flip and accept the chrome regression). Better to know in
days, not weeks.

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

## 8. After the PoC (only if it passes)

The PoC ships the always-on forwarding path (no flag). The remaining
migration becomes mechanical. Suggested order:

1. **Collapse `frame-focus.*` into selection.** Re-key the focus-reconciler
   off "single-selected frame" and delete `frame-focus.ts`,
   `frame-focus-escape.ts`, `frame-focus-selection.ts` plus the temporary
   selection→`frameFocus` mirror introduced in PoC commit 4.
2. Migrate selection outlines + resize handles into aboveView. Geometry
   is already pure via `useAnchoredPosition` / `entity-chrome-slots`.
3. Migrate sticky / text / shape entity bodies into aboveView.
4. Migrate file blocks + edges into aboveView.
5. Retire `page-content`'s blocking overlay entirely (the unselected-frame
   path is the last user).
6. bgView reduces to grid only (and, eventually, inactive-page bitmaps
   per `interaction-layer.md` §4.7).

Each step ends with a working app and a deletion in the next step's
diff.

---

## 9. Findings

### Implementation status

The PoC code shipped in this branch (`poc/page-input-forwarding`):

- `src/main/runtime/page-input-forwarding.ts` — `forwardWheelToFrame` and
  `forwardPointerToFrame` translate window-space coords to page-local and
  call `pageView.webContents.sendInputEvent`. Wheel uses
  `hasPreciseScrollingDeltas` from `WheelEvent.deltaMode` so trackpad
  pixel-precise scrolling distinguishes from line-mode mouse wheels (which
  populate `wheelTicksX/Y`).
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
  `:hover`-driven UI.
- `gate-predicate.ts` no longer carves out `frameFocus`; the gate stays
  default-open in canvas mode unconditionally. Two existing unit tests
  inverted to assert the new contract.
- `selection-controller.commitSelection` mirrors single-selected frame →
  `enterFrameFocus`/`exitFrameFocus` so the existing focus-reconciler keeps
  driving `webContents.focus()` without re-keying. Loop-safe via
  idempotence + `selectionEquals` early-return.

`pnpm typecheck` and `pnpm test:unit` (363 tests) green. Smoke tests
explicitly skipped per the PoC plan.

### User-validation table

User-driven scenarios from §6 (require `pnpm dev` and a human at the
trackpad/keyboard) — **not yet run**.

| # | Scenario | Observed | Verdict | Notes |
|---|---|---|---|---|
| 1 | Vertical scroll | | | |
| 2 | Horizontal scroll | | | |
| 3 | Cmd/Ctrl + scroll | | | Implemented as canvas zoom (PoC §5). |
| 4 | Pinch-zoom | | | |
| 5 | Nested scrollable | | | |
| 6 | Cursor exits frame | | | |
| 7 | Click a link | | | |
| 8 | Click a button | | | |
| 9 | Triple-click + drag-select | | | |
| 10 | Form interaction | | | |
| 11 | Hover-driven UI | | | Continuous pointermove forwarder installed. |
| 12 | Cursor styling | | | Same as #11. |
| 13 | Right-click | | | Forwards to page on single-selected frame. |
| 14 | Drag image out | | | Likely fail per PoC §5; document carve-out. |
| 15 | Click outside frame | | | |
| 16 | Click another frame | | | |
| 17 | App blur / refocus | | | |
| 18 | DevTools | | | |
| 19 | Active drawing tool | | | |
| 20 | Marquee | | | |
| 21 | Existing chrome | | | |

**Decision:** _Pending user validation — proceed to §8 migration, redesign,
or retreat after running the table above._
