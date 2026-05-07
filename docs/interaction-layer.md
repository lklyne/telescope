# Interaction Layer — Architecture Spec

*Draft for `docs/interaction-layer.md`*

---

## 1. Philosophy

**The platform's honest signals become our explicit invariants.**

Electron gives us a small, opinionated set of primitives for stacking and input (`addChildView`, `setVisible`, `setBounds`, native focus routing). Every friction we've hit — undo breaking routing, bounds-hiding overlays, drop dedup, focus-stealing after load — is the platform telling us what shape the architecture wants to be. This spec codifies that shape instead of working around it per-feature.

Three commitments shape every decision below:

1. **Boundaries are expensive.** A WCV boundary costs ~70 MB, an IPC bridge, a preload surface, and a coordination problem. We add them only when a failure mode genuinely requires them.
2. **Input has one authority.** At any moment, exactly one place decides "what does this mouse event mean" — not five coordinated listeners.
3. **State changes happen at known moments.** View-stack, visibility, and bounds mutations happen inside one scheduled layout pass, never during event dispatch.

If a future change violates any of these, the change is wrong for this system, not the system wrong for the change.

---

## 2. Goals & Non-Goals

### Goals

- **Predictable gesture routing.** A user's pointer action maps to exactly one gesture, chosen by one arbiter.
- **Minimal stacking surface.** Three WCVs in the stacking region (bgView, aboveView, liveViews). Everything else is DOM composition.
- **Cheap idle state.** N frames on canvas ≠ N live renderer processes.
- **Structural testability.** Every gesture has a begin/update/commit/cancel path that can be exercised without Electron.
- **Agent-legible.** Canvas state is readable and mutable by CLI/HTTP without replaying mouse events.

### Non-Goals

- Supporting every combination of nested overlays we've ever experimented with. The architecture deliberately narrows what's expressible.
- Per-overlay process isolation as a general value. We keep isolation only where it actually buys crash containment (pages, DevTools) or independent lifecycle (toolbar, sidebar).
- Pixel-perfect parity with legacy interaction quirks that stemmed from accidental overlay ordering.
- A full offscreen-texture compositor for live pages. That's a separate track (`docs/offscreen-rendering-research.md`).

---

## 3. System Overview

### 3.1 The three planes

```
┌──────────────────────────────────────────────────────────┐
│  toolbar       ← own WCV (long-lived, independent UI)    │
├──────────────────────────────────────────────────────────┤
│  sidebar       ← own WCV                                 │
├──────────────────────────────────────────────────────────┤
│  devtools      ← own WCV (Chromium requirement)          │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ ABOVE-PAGES PLANE                                  │  │
│  │   aboveView (single WCV)                           │  │
│  │   ├─ input gate (canvas gesture capture)           │  │
│  │   ├─ selection / marquee / drag visuals            │  │
│  │   ├─ comments, annotations, floating UI            │  │
│  │   └─ over-page tooltips, hover chrome              │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ LIVE PAGES (0-N WCVs)                              │  │
│  │   One per active frame: selected + scroll peers    │  │
│  │   Inactive frames rendered as bitmaps into bgView  │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ BELOW-PAGES PLANE                                  │  │
│  │   bgView (single WCV)                              │  │
│  │   ├─ canvas grid, camera, pan/zoom transform       │  │
│  │   ├─ frame borders, device shells, chrome headers  │  │
│  │   ├─ text/file blocks, groups, edges               │  │
│  │   └─ bitmap compositor for inactive pages          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

     ┌──────────────────────────────────────────────┐
     │ cursorOverlayWindow  ← child BrowserWindow   │
     │   (sibling of win; NOT in the WCV stack)     │
     │   transparent, frameless, focusable:false,   │
     │   setIgnoreMouseEvents(true, forward:false)  │
     │   └─ agent-presence cursors only             │
     └──────────────────────────────────────────────┘
```

The cursor overlay is deliberately outside the three-plane model. It sits in its own OS-level child window because Electron 40's `WebContentsView` has no `setIgnoreMouseEvents` (see §7.3); a WCV would block native frame input. It is paint-only, never captures events, and is the single sanctioned exception to "all canvas-region rendering lives in one of the three planes."

### 3.2 What each plane owns

| Plane | Owns visuals | Owns input | Number of WCVs |
|---|---|---|---|
| `bgView` | Everything drawn below pages, including inactive-page bitmaps | Nothing (always `setVisible(true)`, but input arbitration happens in `aboveView` when any gesture is active) | 1 |
| `liveViews` | Active web content | Native page input (when `aboveView` gate is off) | 0-N |
| `aboveView` | Everything drawn above pages; all gesture visuals | All canvas-level input when visible | 1 |
| `toolbar` / `sidebar` / `devtools` | Their own UI | Their own UI | 1 each |
| `cursorOverlayWindow` | Agent-presence cursors (paint-only) | Nothing — `setIgnoreMouseEvents(true)` | Not a WCV; sibling child `BrowserWindow` of `win` |

### 3.3 State authority

Main process owns all workspace state via the two-layer model (Y.Doc + runtime variables) described in `src/main/runtime/CLAUDE.md`. The interaction layer adds three main-process singletons:

- **`InteractionController`** — the gesture state machine.
- **`FocusReconciler`** — decides which webContents holds focus.
- **`DropOwner`** — decides which WCV is the drop target right now.

Renderers are clients. They observe state via IPC broadcasts and send intent messages. They never hold authoritative interaction state.

---

## 4. Subsystem Specs

### 4.1 `InteractionController` (main)

The single arbiter for canvas-level gestures.

```ts
type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'panning' }
  | { kind: 'marquee', origin: CanvasPoint, current: CanvasPoint }
  | { kind: 'dragging-entities', ids: string[], anchor: CanvasPoint }
  | { kind: 'resizing-entity', id: string, edge: ResizeEdge }
  | { kind: 'dragging-edge', from: EdgeEndpoint, target: EdgeEndpoint | null }
  | { kind: 'editing-text', id: string }

interface InteractionController {
  peek(): InteractionMode
  tryEnter(mode: InteractionMode): Token | InteractionRefused
  update(token: Token, delta: DragDelta): void
  commit(token: Token): void
  cancel(token: Token, reason: 'blur' | 'escape' | 'undo' | 'tab-switch' | 'external'): void
  cancelActive(reason: 'undo' | 'tab-switch' | 'blur' | 'external'): void
  subscribe(listener: (m: InteractionMode) => void): Unsubscribe
}
```

**Rules:**
- Only one non-idle mode at a time. `tryEnter` returns `InteractionRefused` when conflicting — callers **must** handle refusal; refusal is not warned, it is returned.
- Every `tryEnter` that succeeds must pair with exactly one `commit`, `cancel(token)`, or be terminated by a blessed `cancelActive` call. Tokens expire if never closed within N seconds → forced `cancelActive('external')`.
- `cancel` is idempotent and always safe.
- Mode transitions broadcast via IPC to `aboveView` and `bgView` renderers for visual sync.
- `subscribe` listeners fire **after** the state transition, never during event dispatch.

**`cancelActive(reason)` — the external-interrupter back door.**

Some cancel paths don't own the token: the undo observer, tab switches, window blur, and app-wide escape handlers fire from code that didn't start the gesture. They use `cancelActive(reason)` which terminates whatever gesture is currently active, bypassing token ownership. This is the **only** sanctioned way to end a gesture without its token.

Legitimate callers of `cancelActive`, exhaustively:
- Undo/redo observer (runtime reverse-sync) — `reason: 'undo'`.
- Tab switch / workspace switch — `reason: 'tab-switch'`.
- OS window blur (when the app itself loses focus) — `reason: 'blur'`.
- Token expiry timer (internal to the controller) — `reason: 'external'`.

Any other site that feels it needs `cancelActive` is almost certainly a gesture producer that should be calling `cancel(token, reason)` with its own token. Grep discipline applies.

**Why a controller, not a flag:** tokens prevent orphan state when a renderer crashes or a blur storm interrupts a drag. The controller holds the single truth; no one else derives it.

### 4.2 Input gate (`aboveView`)

The input gate is not a separate WCV — it's a *behavior* of `aboveView`. When any canvas gesture is active or available, `aboveView` is `setVisible(true)` and captures all pointer events in the canvas region. When the user should interact with page content directly, `aboveView` is `setVisible(false)` and native page input works.

**Visibility predicate (single source of truth):**

```ts
function shouldGateBeOpen(s: AppState): boolean {
  // ADR 0001 — Frame focus closes the gate so the focused page receives
  // native input. Always wins.
  if (s.frameFocus !== null) return false
  return (
    s.interaction.mode.kind !== 'idle' ||
    s.toolMode !== 'select' ||       // draw, annotate, wire modes pre-arm the gate
    s.modifiers.space ||             // hold-space pan
    s.hoveringCanvasChrome           // hovering a frame border, resize handle, etc.
  )
}
```

Evaluated inside `layoutAllViews()`. `aboveView.setVisible(shouldGateBeOpen(state))` is the only call that toggles it.

**Landed (ADR 0001 + ADR 0002):**

```ts
function shouldGateBeOpen(s: AppState): boolean {
  if (s.frameFocus !== null) return false
  // Inspect & annotate-comment drive feedback off the page's webContents
  // mousemove (eyedropper, comment hover); keep the gate closed unless the
  // composer is open.
  if (s.toolMode === 'inspect' || s.toolMode === 'annotate-comment') {
    return s.commentOverlayActive
  }
  if (s.interactionKind === 'editing-text') return false
  if (s.viewMode === 'canvas') return true
  return browserModeNeedsGate(s)
}
```

The OR-chain in canvas mode has collapsed: the canvas-pointer-router (§4.2.1) classifies all pointerdowns from the always-on aboveView via `src/shared/hit-test.ts`, and every interactive surface that used to live in `bgView` or in a per-page `chromeView` WCV has moved into aboveView's React tree as `CanvasItemChrome` / `CanvasItemPopup` (`data-overlay-ui` so the router yields to them structurally). The per-page `chromeView` WCV and its `chrome-header` preload + renderer were retired wholesale; the chrome-action IPCs (`canvas-navigate-frame` / `canvas-back-frame` / etc., addressed by `frameId`) replace the sender-based `chrome-*` channels.

### 4.2.1 Canvas pointer router (Phase 2 substrate)

A single window-level pointerdown listener inside `aboveView` (`src/renderer/above-view/useCanvasPointerRouter.ts`) runs the shared `hitTest()` against the current layout snapshot and dispatches a typed `CanvasPointerAction` (`src/shared/canvas-pointer-actions.ts`). The hit-test priority table — resize-handle > chrome > anchor > body > background — is encoded once and tested in isolation (`tests/unit/canvas-pointer-actions.test.ts` includes the #41 anchor-near-chrome regression).

The router consumes the full action set (`FULL_ROUTER_CONSUME`): `enter-frame-focus`, `begin-entity-drag`, `begin-group-drag`, `begin-resize`, `begin-edge-drag`, `toggle-select`, `background-click`, `begin-marquee`, `begin-pan`. The remaining viewport helper is limited to wheel zoom/pan and middle-button pan.

A sibling pure mapper, `routePointerDoubleClick`, classifies double-clicks; the router installs a window-level `dblclick` capture listener and dispatches `enter-shape-edit` / `enter-group` / `request-text-edit` (and yields `enter-group-rename` to the GroupRenameLabel's own DOM `onDoubleClick`). The text/shape branches use the `canvas-request-text-edit` / `canvas-request-shape-edit` IPC channels, which select the entity in main and signal bgView to focus its inline editor.

**Gate responsibilities when visible:**
1. Capture pointer events at the WCV boundary.
2. Hit-test against the current canvas scene (via main-process coord math).
3. Classify the gesture (pan vs marquee vs entity drag vs resize vs edge drag).
4. Call `interaction.tryEnter(mode)`.
5. Forward deltas via `interaction.update(token, delta)` on every `pointermove`.
6. Call `interaction.commit(token)` on `pointerup`.
7. Call `interaction.cancel(token, reason)` on blur/escape.

**Gate does not:**
- Render page content.
- Own entity data.
- Make authoritative state changes.
- Decide focus (that's `FocusReconciler`).

### 4.3 `LAYER_STACK` and the layout pass

```ts
const LAYER_STACK: readonly LayerDescriptor[] = [
  { id: 'bgView',       kind: 'singleton' },
  { id: 'pages',        kind: 'group', order: 'creation-order' },
  { id: 'aboveView',    kind: 'singleton' },
  { id: 'leftSidebar',  kind: 'singleton' },
  { id: 'devtools',     kind: 'cluster' },   // background, contents, header, resize
  { id: 'toolbar',      kind: 'singleton' },
] as const
```

**The layout pass is the only place any of these mutate:**

```ts
function layoutAllViews() {
  if (consumeDirty('stack')) applyStack(LAYER_STACK, state)
  if (consumeDirty('visibility')) applyVisibility(state)
  if (consumeDirty('bounds')) applyBounds(state)
  if (consumeDirty('pages')) applyPageLayout(state)
}
```

`requestLayout()` schedules the pass on a 16 ms timer. Every other subsystem (IPC handlers, observers, interaction controller, undo) calls `markDirty('<surface>')` and returns. **No one calls `setBounds`, `setVisible`, `addChildView`, or `removeChildView` outside the layout pass.** This is the invariant that makes the `setTimeout(0)` undo crutches unnecessary.

### 4.4 `FocusReconciler` (main)

```ts
interface FocusReconciler {
  expectedFocus(s: AppState): FocusTarget
  reconcile(): void   // called at the end of layoutAllViews
}

type FocusTarget =
  | { kind: 'bgView' }           // default
  | { kind: 'aboveView' }        // during gesture
  | { kind: 'page', id: string } // when editing text in a live page
  | { kind: 'toolbar' | 'sidebar' }
```

`reconcile()` compares the expected focus to the actual focused webContents and calls `focus()` once if they disagree. It runs **after** all bounds/visibility changes so focus lands on a view that's actually visible. Every subsystem that might need focus (page-create, page-delete, tab-switch, undo cross-tab) sets a focus intent in state and lets the reconciler carry it out.

**Why a reconciler:** WebContentsView steals focus on load (#42578), macOS window-level focus doesn't fire webContents `blur` (#22201), and refocus callbacks cause storms if done reactively. A single post-layout reconciliation avoids all three.

### 4.5 `DropOwner` (main)

```ts
interface DropOwner {
  currentOwner(s: AppState): DropTarget
  isDuplicate(dragId: string, payloadHash: string): boolean
}

type DropTarget =
  | { kind: 'canvas' }           // drop creates entity at canvas coords
  | { kind: 'entity', id: string } // drop targets a specific entity (image into frame, etc.)
  | { kind: 'sidebar' }          // drop into workspace tree
  | { kind: 'none' }
```

On app start, every WCV registers a `dragover/drop` handler that calls `preventDefault` and forwards the event to main. Main consults `DropOwner.currentOwner()` and routes the drop. Dedup is by `dragId` (stamped on `dragstart`) — never by payload hash + timeout.

**Why ownership:** Electron's drag/drop delivery across overlapping WCVs is ambiguous (see #2897, #18226). Declaring ownership per drag eliminates the ambiguity rather than masking it.

### 4.6 `useDragGesture` hook (renderer)

Every gesture in `aboveView` uses this single primitive:

```ts
interface DragGestureSpec<T> {
  target: RefObject<HTMLElement>
  threshold?: number                  // px before drag "starts"
  onBegin(ctx: GestureContext): T | null   // null = decline, event bubbles
  onUpdate(ctx: GestureContext, token: T): void
  onCommit(ctx: GestureContext, token: T): void
  onCancel(token: T, reason: CancelReason): void
}

function useDragGesture<T>(spec: DragGestureSpec<T>): void
```

**Internal conventions:**
- Pointer events only. No `mouse*` in new code.
- `setPointerCapture` on the target.
- Window `blur` with `buttons === 0` → cancel.
- `Escape` → cancel.
- Raw event never escapes the hook; callers see canvas-space `GestureContext`.

### 4.7 Bitmap compositor (pages below the active set)

> **Status (ADR 0001 + ADR 0002):** Optional. The original motivation — keeping the gate always-on without breaking native page input — is supplanted by click-to-enter focus and (per [ADR 0002](./adr/0002-canvas-anchored-overlay-ui.md)) by moving canvas-anchored overlay UI into aboveView's React tree so the gate flip can't orphan it. The compositor is now a future memory/CPU optimisation if N-live-frame regresses, not a load-bearing input-authority requirement.

Inactive pages (not selected, not scroll-peer of selected, not loading, no DevTools) render via offscreen `BrowserWindow` with `offscreen: true` at low frame rate. Their bitmaps are drawn as React-rendered `<canvas>` elements inside `bgView`.

Full staging plan lives in `docs/offscreen-rendering-research.md`. The interaction-layer contract this spec establishes:

- Inactive pages appear to the input system as regions within `bgView`'s DOM.
- Clicking an inactive page triggers a **promote-to-live** transition: the offscreen BrowserWindow is destroyed, a new `pageView` WCV is created, scroll state is restored, the bitmap fades out.
- Promotions happen inside the layout pass, not in the click handler.

---

## 5. Heuristics (for future decisions)

### 5.1 Should this be its own WCV?

Add a WCV only if **at least one** is true:

1. It contains content you don't control (a web page, DevTools).
2. It has a genuinely different lifecycle (long-lived, rarely reloaded, different hot-reload needs).
3. Its crash is recoverable without the rest of the app.
4. Its z-order needs differ from other overlays in a way single-DOM composition can't express.

If none apply, it belongs in an existing WCV's React tree.

### 5.2 Should this state live in main or renderer?

**Main** if:
- More than one renderer needs to observe or mutate it.
- It persists across renderer reloads.
- An agent/CLI/test should be able to read or write it.
- It participates in undo.

**Renderer** if:
- It's pure visual ephemera (hover preview, dropdown-open state, scroll position within a panel).
- No other surface cares.

### 5.3 Should this go through the `InteractionController`?

Any interaction that:
- Can conflict with another interaction, or
- Has a visual drag preview, or
- Needs to be cancelable by blur/escape/undo

…goes through the controller. Momentary clicks (single select, button press) don't need it.

### 5.4 Should I add a `setTimeout(0)` here?

**No.** If you feel the urge, it means you're mutating view state during event dispatch. Mark dirty and return. If that doesn't work, the subsystem you're calling needs to move its mutation into the layout pass.

### 5.5 Which event family should I use?

Pointer events. Always. No new `mouse*` code.

### 5.6 Should I add a new interaction mode?

First check whether your behavior is an existing mode with a new payload. Modes are expensive — each one is a transition edge in the state machine, a visual in `aboveView`, a cancel path, and a test. Payloads are cheap.

---

## 6. Load-bearing invariants

These are the invariants that, if broken, produce the classes of bugs this refactor exists to eliminate. Any PR that violates one needs explicit discussion.

| # | Invariant | If broken |
|---|---|---|
| I1 | View-stack/visibility/bounds mutations only inside `layoutAllViews` | Event-routing breaks, spurious focus events, undo-during-drag corruption |
| I2 | One active `InteractionController` token at a time | Concurrent drags, orphan state, impossible undo steps |
| I3 | Every `tryEnter` pairs with `commit`, `cancel(token)`, or a blessed `cancelActive(reason)` from an external interrupter (§4.1) | Stuck gestures, orphan visuals |
| I4 | Focus is expressed as intent, applied by `FocusReconciler` | Focus storms, keyboard shortcuts silently broken |
| I5 | Drop ownership is declared per `dragId`, never dedup by payload hash | Duplicate drops, missed drops |
| I6 | `setBackgroundColor('#00000000')` set on every WCV before `addChildView` | White-flash during creation |
| I7 | (ADR 0001) `aboveView` is the single input authority in canvas mode; `frameFocus !== null` is the only condition that releases it so the focused page can receive native input. Per-layer pointerdown handlers in `bgView` are vestigial during Phase 2 migration and removed in Phase 3. `cursorOverlayWindow` remains mouse-inert (`setIgnoreMouseEvents(true)`) | Regression to the multi-overlay-coordination model and the #41 layer-arbitration bug class |
| I8' | (ADR 0002) Canvas-anchored overlay UI (chrome, popups) lives in aboveView's React tree, not in `bgView` layers and not in per-page WCVs. Components tag themselves `data-overlay-ui`; the router yields to them on capture-phase pointerdown via `isOverlayUiTarget`. Geometry comes from `entity-chrome-slots.ts` + `useAnchoredPosition` | Chrome stops receiving clicks when the gate flips fully open; #41 anchor-near-chrome arbitration bugs reappear |
| I8 | Pointer events only in renderer gesture code | Divergent behavior between capture/cleanup code |
| I9 | Canvas coord math imported from `src/shared/coords.ts` | Hit-test drift between main and renderer |
| I10 | Live pages only for active frames + scroll peers + loading + DevTools-attached | Memory/CPU regression, idle renderers |

---

## 7. Electron gotchas (the ones that shaped this)

Cross-reference for future contributors. Each is why a choice above exists.

1. **WebContentsView has no z-order API.** Only `addChildView(view, index)` and `removeChildView` + re-add. → We formalize this via `LAYER_STACK` applied in `layoutAllViews`. [#42061]
2. **Overlapping WCVs do not pass pointer events through.** CSS `pointer-events: none` inside a WCV does not leak to a WCV beneath. → We minimize overlap (three planes) and gate input via visibility. [#45027]
3. **`setIgnoreMouseEvents` is BrowserWindow-only.** No per-view version. `forward: true` is macOS/Windows only, has reload quirks on Windows, and mousemove quirks on macOS. → We depend on it in exactly one place: `cursorOverlayWindow`, a child `BrowserWindow` sibling of `win`, used with `forward: false` (paint-only, no hover needed) to host agent-presence cursors. Its bounds are synced inside `layoutAllViews()` from `win.getContentBounds()` + `contentTopInset` plus listeners on `move` / `resize` / `enter-full-screen` / `leave-full-screen` / `display-metrics-changed`. A WCV cannot substitute because it would block native frame input. [#23863, #16777, #26718, #15376, #35030, #30808, #33281]
4. **WCVs default to opaque white background until load completes.** → Mandatory `setBackgroundColor('#00000000')` on creation. [#47351, #44914]
5. **WCVs steal focus at `did-finish-load`.** No `focusable: false`. → `FocusReconciler` reasserts expected focus post-layout. [#42578, #42922]
6. **Focus/blur on webContents don't fire for window-level focus changes on macOS.** → Expected-focus model instead of reactive focus chains. [#22201]
7. **Mutating the view stack during event dispatch loses events and can crash.** → Invariant I1. [#42131, #47247 + empirical observation in our undo path]
8. **`setAutoResize` doesn't exist on WebContentsView.** → Our layout pass explicitly resizes; not a regression. [#43802]
9. **Drag/drop events across overlapping views are ambiguous.** → `DropOwner` per `dragId`, never payload-hash dedup. [#2897, #18226, #7118]
10. **`sendInputEvent` requires the containing BrowserWindow focused.** → Not part of the default input path; reserved for offscreen-bitmap-click-through if/when needed.
11. **Native `setBorderRadius` exists on `View`.** → Use it for frame corners instead of compositing an extra overlay.
12. **`useSharedTexture` (Electron 33+) exists but needs a native addon.** → Not required for this spec; documented as the upgrade path for the compositor when IPC bandwidth becomes a bottleneck.

---

## 8. File layout (target)

```
src/main/
  runtime/
    interaction-controller.ts       # the state machine
    focus-reconciler.ts             # expected-focus resolution
    drop-owner.ts                   # drag-id keyed drop routing
    layout-engine.ts                # the single layout pass
    layer-stack.ts                  # LAYER_STACK descriptor + applyStack
    overlay-policy.ts               # OVERLAY_INPUT_POLICY table
    page-compositor.ts              # live vs bitmap tier management
    view-factory.ts                 # WCV creation with invariants (bg color, etc.)
  ipc/
    interaction-ipc.ts              # tryEnter/update/commit/cancel IPC
    input-gate-ipc.ts               # gate events from aboveView

src/shared/
  coords.ts                         # screen ↔ canvas math (SINGLE source)
  interaction-types.ts              # InteractionMode, GestureContext, tokens
  drag-ids.ts                       # dragId generator + types

src/renderer/
  above-view/                       # merged: interaction + comment + floating + annotation
    App.tsx
    InputGate.tsx                   # listens to pointer events via useDragGesture
    MarqueeLayer.tsx
    DragPreviewLayer.tsx
    CommentsLayer.tsx
    AnnotationsLayer.tsx
    FloatingUiLayer.tsx
  bg-view/                          # canvas-bg, extended with:
    PageBitmapLayer.tsx             # bitmap compositor for inactive pages
    (...existing canvas chrome)
  shared/
    useDragGesture.ts               # the single gesture primitive
```

Retained as separate bundles: `toolbar/`, `left-sidebar/`, `devtools-*`. Retired: `interaction-overlay/`, `annotation-overlay/`, `floating-ui/` (merged into `above-view/`).

---

## 9. Testing strategy

### Unit

- `InteractionController` — full state-machine coverage, token lifecycle, concurrent `tryEnter` refusal.
- `FocusReconciler.expectedFocus` — pure function of state, no Electron.
- `DropOwner.currentOwner` — pure function of state.
- `coords.ts` — round-trip canvas↔screen, zoom/pan extremes.
- `layer-stack.applyStack` — deterministic output from state (no view list needed; work on descriptor IDs).

### Integration (smoke)

- Every gesture mode: begin, commit, cancel on blur, cancel on escape, cancel on undo, cancel on tab switch.
- Focus lands correctly after: page create, page delete, tab switch, undo cross-tab, window blur.
- Drop with two overlapping drag targets → exactly one drop handler fires.
- Gate visibility predicate on every mode transition.

**Smoke matrix lands before behavior changes.** When executing phased rollouts of this spec, the smoke suite is built first against current behavior so subsequent phases have a regression baseline. Tests that encode not-yet-correct behavior are marked `xfail` and flipped as the owning phase lands.

### Agent / scenario

- Multi-frame workspace: marquee across frames, entity drag across frames, edge drag.
- Canvas↔Browser mode switch preserves focus and gesture idle.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **Plane** | One of the three stacking regions: below-pages (`bgView`), pages, above-pages (`aboveView`). |
| **Input gate** | The behavior of `aboveView` toggling input capture via `setVisible`. Not a separate WCV. |
| **Gesture** | A pointer-initiated interaction with begin/update/commit/cancel phases. |
| **Mode** | The current `InteractionController` state. At most one non-idle mode at a time. |
| **Token** | Opaque handle returned by `tryEnter`, consumed by `commit`/`cancel`. Prevents orphan state. |
| **Live frame** | A frame rendered as a `pageView` WCV. |
| **Bitmap frame** | An inactive frame rendered offscreen and composited into `bgView` as pixels. |
| **Expected focus** | The `FocusTarget` a state implies; the reconciler enforces it. |
| **Drop owner** | The single WCV authorized to consume a given drag (keyed by `dragId`). |
| **Layout pass** | `layoutAllViews()`. The only place view-stack, visibility, and bounds change. |
| **Dirty flag** | A deferred-work marker consumed by the next layout pass. |
