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
- [ ] Phase B — selection outlines + resize handles into aboveView
- [ ] Phase B′ — honor entity z-order in body hit-test
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
