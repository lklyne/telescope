# PoC plan — aboveView input forwarding

Prerequisite: `docs/plans/aboveview-interactive-layer.md` (endpoint architecture).

> **Status — landed and validated (2026-05-06).** The PoC shipped on
> `poc/page-input-forwarding`. `sendInputEvent` faithfully reproduces wheel,
> click, drag, hover, and cursor styling under real use. Forwarding is a
> viable path; the visual-layer migration in the endpoint doc proceeds.
> Known carve-outs (drag-out, IME, DevTools-while-focused) are tracked in
> the parent doc's §9 findings and revisited per migration phase.
>
> This document is preserved as the implementation log. The forward-looking
> migration plan lives in
> [`aboveview-interactive-layer.md`](./aboveview-interactive-layer.md) §8.

This is the actionable PoC. Goal: validate that with aboveView always-visible
in canvas mode, both **users** (forwarded `sendInputEvent`) and **agents**
(existing CDP via `agent-browser`) can interact with a frame the way they do
today. If validation passes, the visual-layer migration in the endpoint doc
proceeds. If a specific case fails (drag-out, inertia, hover) we document the
carve-out before migrating.

The PoC is built **without a flag** — running `pnpm dev` exercises it.

---

## 1. Interaction model

Selection drives forwarding. There is no separate "focus" concept in the
user-facing model — the existing `frame-focus.*` runtime is mirrored from
selection during the PoC and collapses entirely in post-PoC cleanup.

| Frame state | Body click | Body drag | Body wheel | Keyboard |
|---|---|---|---|---|
| **Not selected** | select (router eats the down/up pair) | drag frame on canvas | canvas zoom / pan | n/a |
| **Single-selected** | forward to page | forward (page text / image drag) | forward to page | forward to page |
| **In multi-selection** | toggle / extend selection | drag selection on canvas | canvas zoom / pan | n/a |

- **Deselect** = click canvas background, click another frame, or click a
  group / entity.
- **Escape** forwards to the page (closes a modal, exits fullscreen). There is
  no separate "exit focus" gesture; deselecting is the way out.
- **Chrome, edge handles, overlay UI** keep their existing `data-overlay-ui`
  yield — those clicks never forward, regardless of selection.

---

## 2. What we build

No flag. Six files touched.

| # | File | Change |
|---|---|---|
| 1 | `src/main/runtime/page-input-forwarding.ts` (new) | `forwardWheelToFrame`, `forwardPointerToFrame`. Translate window coords → page-local, call `pageView.webContents.sendInputEvent`. Wheel payload includes `phase` / `momentumPhase` for trackpad inertia. |
| 2 | `src/main/ipc/register-canvas-ipc.ts` + `src/preload/canvas-bg.ts` | two IPC channels (`canvas-forward-wheel`, `canvas-forward-pointer`); matching API on `CanvasBgElectronAPI`. |
| 3 | `src/renderer/shared/hooks/useViewportWheelAndMiddlePan.ts` | wheel hits the single-selected frame's body → forward; Cmd / Ctrl + wheel still zooms canvas. |
| 4 | `src/renderer/above-view/useCanvasPointerRouter.ts` | new `forward-to-page` action when `frame-body` hit AND that frame is the sole selected entity. Installs window-level continuous `pointermove` (cursor styling, hover-driven UI) + `pointerup`. Unselected frame body keeps the existing select-only / drag-frame branches. |
| 5 | `src/main/runtime/gate-predicate.ts` | drop the `if (inputs.frameFocus) return false` line. Gate is unconditionally open in canvas mode. |
| 6 | `src/main/runtime/selection-controller.ts` (or wherever the selection commit fans out) | mirror "single-selected frame" → `frameFocus` runtime state. Keeps the existing focus-reconciler's `webContents.focus()` working without re-keying it. **Temporary**; collapses with `frame-focus.*` in the post-PoC cleanup. |

Out of scope for the PoC:

- Migrating selection outlines / stickies / files / drawings into aboveView.
- Deleting `frame-focus.ts` / `frame-focus-escape.ts` / `frame-focus-selection.ts`.
- Removing `page-content`'s blocking overlay path for unselected frames.

---

## 3. Validation

### Users

Run `pnpm dev`. For each scenario: click the frame body to select (first
click, no forward), then perform the action (forwards).

The endpoint doc's §6 scenarios 1–21 run unchanged. The setup text "focus a
frame (click frame body)" becomes "select a frame (click frame body once)".

Plus:

- **First-click consumed correctly.** Click a button on an unselected frame
  → nothing happens (frame selects). Click again → button fires. The page
  never sees a stray pointerup without a matching down.
- **Switch selection from frame A to frame B** → forwarding follows.
- **Cmd-tab away then back** → forwarding resumes
  (`sendInputEvent` requires the BrowserWindow to be focused).
- **Multi-select including a frame** → wheel and pointer over the frame go
  to the canvas, not the page.

### Agents

Agent input goes via CDP through `agent-browser`. CDP injects directly into
the `webContents` and shouldn't be in aboveView's path at all — the
validations below confirm we don't regress the existing automation flow.

| # | Scenario | Expectation |
|---|---|---|
| A1 | `agent-browser click @eN` against a single-selected frame | CDP delivers; page reacts. |
| A2 | Same commands against an unselected frame | `beginAutomationInteractiveFrame` lifts the blocking overlay for the targeted frame; verify still works. |
| A3 | `AgentCursorLayer` ripple / cursor render above frames during agent activity | Visual presence unchanged. |
| A4 | User interacts with frame A while agent runs in frame B | Independent — both pipelines work in parallel. |

---

## 4. Implementation order

Each commit ends with `pnpm typecheck && pnpm test:unit` green and a working
app at runtime.

1. **`feat(forwarding): main-side helpers + IPC`** — module + channels +
   preload bridge. No callers. Smoke test by invoking from the devtools
   console.
2. **`feat(forwarding): wheel forwarding via aboveView`** — wires #3. Run
   endpoint §6 #1, 2, 5, 6.
3. **`feat(forwarding): pointer forwarding via router`** — wires #4
   (continuous `pointermove` + `pointerup`). Run endpoint §6 #7–13.
4. **`feat(forwarding): drop frameFocus gate carve-out, mirror selection
   → frameFocus`** — wires #5 and #6. Run endpoint §6 #14–21 + agent A1–A4
   above.
5. **`docs(plans): record PoC findings + decision`** — fill the endpoint
   doc's §9 findings table; choose: proceed with §8 migration, redesign, or
   retreat.

---

## 5. Decisions to revisit during the PoC

- **Cmd / Ctrl + wheel over a selected frame** → canvas zoom (default). The
  only canvas-zoom gesture today; revisit if the page-zoom expectation feels
  stronger in practice.
- **Right-click** forwards as `mouseDown(button:right)`. Chromium fires
  `context-menu` natively, so the page wins on selected frames; our annotate
  menu still wins on unselected.
- **Drag image out** (endpoint §6 #14) is the most likely fail. If it
  doesn't work, accept as a carve-out (deselect → re-grab) and document
  rather than redesign.
- **Trackpad inertia / phase.** Wheel forwarding includes `phase` and
  `momentumPhase`. If inertia still feels wrong, log specifically what's
  missing — that's diagnostic for whether the endpoint is reachable.
