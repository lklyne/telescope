# Plan — aboveView as the interactive layer

The endpoint our current architecture is pointing at: aboveView becomes the
"everything above pages" plane. Live frame WCVs are bitmaps sandwiched between
bgView (grid only) and aboveView (all visual + interactive UI). aboveView stays
visible at all times in canvas mode; input intended for a focused page is
forwarded into its `webContents` via `sendInputEvent`.

This plan is **gated on a proof of concept**. The whole architecture rests on
input forwarding behaving like native page input under real use — wheel,
click, drag, hover, keyboard. If forwarding has macOS-specific holes that
break common cases (trackpad inertia, IME, link drag, etc.), we redesign
*before* migrating layers. PoC first.

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

aboveView's pointer router runs on every pointerdown/wheel/move. On each
event it consults the layout snapshot:

- Hit is on chrome / overlay UI / canvas-level visual → router handles
  (same as today).
- Hit is on the body of the **focused** frame → router forwards the
  event to the frame's `webContents` via `sendInputEvent`. The page
  reacts as if clicked / scrolled directly.
- Hit is on the body of an **unfocused** frame → router treats it as
  click-to-enter-focus (same as today).
- Hit is on canvas background → marquee / pan (same as today).

`gate-predicate.ts` collapses to `viewMode === 'canvas'` (always open in
canvas mode). The `frameFocus` carve-out goes away. Frame focus remains
as state — it's still what tells the router "forward, don't intercept."

`page-content` preload's blocking overlay goes away too. The page
receives only the events the router chooses to forward.

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

## 4. PoC scope — the smallest experiment that answers the question

The PoC's job is to answer: **does input forwarding produce native page
behavior indistinguishable from clicking / scrolling the page directly,
across the scenarios in §6?**

**In scope:**

- A feature flag `SPECULAR_INPUT_FORWARDING=1` (env var) that swaps
  behavior for one frame at a time, no migration of any visual layer.
- Wheel forwarding when cursor is over the focused frame's body.
- Pointer (down / move / up) forwarding when cursor is over the focused
  frame's body.
- Gate-predicate behavior: when the flag is on AND a frame is focused,
  aboveView stays visible (gate stays open). When the flag is off,
  current behavior is preserved.
- `page-content` blocking overlay: skipped while the flag is on for the
  focused frame, since the router controls what reaches the page.

**Out of scope for the PoC:**

- Migrating any visual layer (chrome stays where it is, selection
  outlines stay in bgView, stickies stay in bgView).
- Removing `page-content` blocking overlay for unfocused frames.
- Multi-frame forwarding (only the focused frame is exercised).
- Keyboard forwarding (already works through `webContents.focus()`).
- Performance tuning. The PoC is correctness-first.

If the PoC passes, the visual layer migrations follow as separate
slices. If it fails, we redesign before moving any layer.

---

## 5. PoC implementation sketch

**New file: `src/main/runtime/page-input-forwarding.ts`**

```ts
export function forwardWheelToFrame(
  frameId: string,
  payload: { deltaX: number; deltaY: number; x: number; y: number; shift: boolean; meta: boolean; ctrl: boolean; alt: boolean },
): void
export function forwardPointerToFrame(
  frameId: string,
  payload: { type: 'down' | 'up' | 'move'; button: 'left' | 'middle' | 'right'; x: number; y: number; clickCount: number; shift: boolean; meta: boolean; ctrl: boolean; alt: boolean },
): void
```

Both look up the page by id, translate window-space coords to page-local
coords (subtract page bounds origin), and call
`page.pageView.webContents.sendInputEvent({ type: 'mouseWheel' | 'mouseDown' | 'mouseUp' | 'mouseMove', ... })`.

**New IPC channels: `canvas-forward-wheel`, `canvas-forward-pointer`** in
`register-canvas-ipc.ts`.

**`gate-predicate.ts`** — keep current behavior unless
`SPECULAR_INPUT_FORWARDING === '1'`. Under the flag, drop the
`if (inputs.frameFocus) return false` line so the gate stays open.

**`overlay-manager.ts`** — under the flag, suppress the blocking overlay
for the focused frame (skip `set-interactive: false` for that frame).

**`useViewportWheelAndMiddlePan` (aboveView)** — under the flag, before
running canvas-zoom/pan logic, check: cursor is over focused frame body?
→ forward and return.

**`useCanvasPointerRouter` (aboveView)** — under the flag, add a branch
in `routePointerDown`: if hit payload is `frame-body` AND
`payload.entityId === focusedFrameId`, return a new action
`{ kind: 'forward-to-page', entityId, ... }` instead of
`frame-body-press`. Dispatch installs a window-level move/up listener
that forwards `pointermove` and `pointerup` until the gesture ends.

**Total touch points:** ~6 files. ~200–250 lines added, 0 deleted. The
flag default is off so it doesn't affect normal use.

---

## 6. Validation scenarios

For each scenario, run with `SPECULAR_INPUT_FORWARDING=1 pnpm dev`,
focus a frame (click frame body), then perform the action.

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

15. **Click outside frame** while focused → frame blurs (existing exit
    path) → forwarding stops, gate predicate doesn't change because the
    flag keeps it always-open.
16. **Click another frame** → focus transfers, forwarding switches.
17. **App loses focus** (Cmd+Tab away, then back) → forwarding still
    works after re-focus.
18. **DevTools open on focused frame** — does forwarding still reach the
    page? Does DevTools stay attached?

### Stress / regression

19. **Active drawing tool** while frame focused — drawing strokes still
    paint above the page (drawings already in aboveView).
20. **Marquee selection** while frame focused — marquee still works
    (background hit, not body forward).
21. **Existing chrome interactions** — URL bar, back/forward, hover
    titles all still work.

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

The migration becomes mechanical. Suggested order:

1. Land the wheel-forwarding path behind the feature flag.
2. Land the pointer-forwarding path behind the feature flag.
3. Flip `gate-predicate.ts` to drop the `frameFocus` carve-out
   permanently. Remove the flag, make forwarding always-on.
4. Migrate selection outlines + resize handles into aboveView. Geometry
   is already pure via `useAnchoredPosition` / `entity-chrome-slots`.
5. Migrate sticky/text/shape entity bodies into aboveView.
6. Migrate file blocks + edges into aboveView.
7. Retire `page-content`'s blocking overlay entirely.
8. bgView reduces to grid only (and, eventually, inactive-page
   bitmaps per `interaction-layer.md` §4.7).

Each step ends with a working app and a deletion in the next step's
diff.

---

## 9. Findings

_Fill in as scenarios are run._

| # | Scenario | Observed | Verdict | Notes |
|---|---|---|---|---|
| 1 | Vertical scroll | | | |
| 2 | Horizontal scroll | | | |
| 3 | Cmd/Ctrl + scroll | | | |
| 4 | Pinch-zoom | | | |
| 5 | Nested scrollable | | | |
| 6 | Cursor exits frame | | | |
| 7 | Click a link | | | |
| 8 | Click a button | | | |
| 9 | Triple-click + drag-select | | | |
| 10 | Form interaction | | | |
| 11 | Hover-driven UI | | | |
| 12 | Cursor styling | | | |
| 13 | Right-click | | | |
| 14 | Drag image out | | | |
| 15 | Click outside frame | | | |
| 16 | Click another frame | | | |
| 17 | App blur / refocus | | | |
| 18 | DevTools | | | |
| 19 | Active drawing tool | | | |
| 20 | Marquee | | | |
| 21 | Existing chrome | | | |

**Decision:** _After running scenarios — do we proceed with the migration,
redesign the endpoint, or stay on the gate-flip path?_
