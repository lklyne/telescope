# Cover persistence/undo/sync, delete noise, lock in a test standard

Source: https://github.com/lklyne/specular/issues/81

## Summary

One critical layer of the app — persistence, undo/redo, and forward/reverse Y.Doc sync — has no test coverage. A bug in any of it loses user work silently. The rest of the suite has a handful of noise files (assert on constants, mock internal collaborators) but is otherwise sound.

This issue closes the persistence/undo/sync gap, removes the noise, tightens existing smoke tests with lifecycle assertions, and locks in a short "test contract" in `CLAUDE.md` so future tests (often Claude-written) hold to a known standard.

## Why this matters

A bug in any of the following would land in `main` today and pass CI:

- `syncRuntimeToDoc()` drops a mutation under load → silent data loss on crash.
- A regression in tab-switch transactions sends undo to the wrong tab.
- `pendingPageRequests` doesn't clean up when a webview dies → main-process leak.
- Forward/reverse sync feedback loop multiplies undo entries.
- Autosave debounce tuned wrong → last fraction of a second of edits lost on quit.

None of these have a test today.

## Goals

- Persistence, undo/redo, and Y.Doc sync have smoke coverage.
- IPC pending-request lifecycle has unit coverage.
- The `.canvas` parser is fuzz-tested (user data lives in this format).
- A short, written standard for "a good test in this codebase" lives in `tests/README.md` and is referenced from `CLAUDE.md`.
- The handful of existing noise tests are deleted or rewritten.

## Non-goals (deliberately deferred)

These were considered and dropped as gold-plating for the current stage of the product:

- **Renderer E2E with Playwright+Electron** — high flake/maintenance tax. Reconsider once a UI regression slips past users.
- **Visual regression baselines** — UI churns frequently pre-1.0; baselines would be wrong constantly.
- **Performance budgets** — solving a problem we don't yet observe.
- **HTTP API and Y.Doc-merge fuzz** — parser fuzz covers the user-data risk; the others are low-leverage.
- **Full-suite backfilled mutation verification** — process burden disproportionate. New tests in this issue are mutation-verified inline; old tests are not retroactively audited.
- **CI dashboards / flake quarantine policy** — overkill until more layers exist.

If any of these become justified later (e.g. a regression report we wish we'd caught), they get their own issue with their own justification.

## Phase 0 — Decisions before starting

Capture answers in a comment on this issue before Phase 1.

1. **Bugs to not encode as correct.** List any production behaviors currently suspected of being bugs. New tests must not encode them as expected.
2. **`tests/agent/` scenarios.** Keep as-is, fold representative scenarios into smoke, or delete?
3. **Smoke runtime budget.** Max acceptable wall time for `pnpm test:smoke`. Drives how many autosave-round-trip tests we can add (each ~400ms+).
4. **Fuzz library.** Default to `fast-check`; confirm or pick alternative.

## Phase 1 — Demolition (one PR)

Pure deletion and rewrite. No new coverage. Stop the suite from carrying weight that doesn't pull its own.

- [ ] Delete `tests/unit/presence-timing.test.ts` (asserts arithmetic on constants).
- [ ] Audit `tests/unit/zoom.test.ts`; delete constant-asserting blocks, keep behavior-driven blocks.
- [ ] Delete `.todo()` blocks in `tests/smoke/focus.test.ts` and `tests/smoke/gestures.test.ts` not covered by later phases.
- [ ] Rewrite `tests/unit/interaction-controller.test.ts` to drive the controller through its public `dispatch()` API and assert on observable outputs (events emitted, snapshot from `runtimeContext.getSnapshot()`, IPC broadcasts). Remove `vi.mock('../runtime-context')` style mocks.
- [ ] Rewrite `tests/unit/cli-commands.test.ts`: shrink to a pure parser test; move command behavior coverage to a new `tests/smoke/cli.test.ts` (Phase 2) that spawns the real CLI against a running app via `AppClient`.
- [ ] Audit `tests/unit/presence-targeting.test.ts`; rewrite if it has the same internal-mock pattern.
- [ ] Confirm `pnpm test:unit && pnpm test:smoke` is green.

**Exit:** no deleted test was protecting a real regression worth keeping. Diff reviewable in one sitting.

## Phase 2 — Cover the dangerous layers (one PR)

New tests for what's currently uncovered. Each is **mutation-verified** before merging — the commit message names the production-code mutation used to verify it. (Examples: comment out `scheduleAutosave()`; remove the tab-id from undo transaction metadata; remove the guard flag suppressing forward sync during reverse application.)

**New smoke files:**

- [ ] `tests/smoke/persistence.test.ts`
  - Mutate workspace → wait past 350ms autosave debounce → assert `.canvas` file on disk matches snapshot.
  - Dirty-quit between mutation and flush → reopen → workspace matches last committed state.
  - Multi-tab: mutate in tab B → switch to A → switch back → state preserved.
  - Reload after autosave → in-memory snapshot equals on-disk snapshot.
- [ ] `tests/smoke/undo.test.ts`
  - Undo across tab switches lands in the originating tab.
  - Undo of grouping restores prior group membership.
  - Undo of entity creation removes from selection and from Y.Doc.
  - Redo replays correctly.
  - Undo doesn't double-fire when triggered immediately after a tab switch.
  - Undo of edge creation removes the edge and restores prior endpoint state.
- [ ] `tests/smoke/sync.test.ts`
  - Runtime mutation produces exactly one Y.Doc transaction (no echo).
  - Y.Doc update from undo flows to runtime without re-triggering forward sync.
  - Concurrent mutation + undo doesn't corrupt the doc.
- [ ] `tests/smoke/cli.test.ts` (moved from Phase 1)
  - Real CLI subprocess against running app for: `create page`, `workspace`, `select`, `delete`, `undo`, `redo`, and any other production command.

**New unit files:**

- [ ] `tests/unit/ipc-pending-requests.test.ts`
  - Pending request rejects within 5s when no response arrives.
  - `clearPendingRequestsForPage(webContentsId)` rejects matching pending requests immediately.
  - Webview destruction triggers cleanup.
- [ ] `tests/unit/autosave-debounce.test.ts`
  - 350ms debounce coalesces multiple rapid mutations into one write.
  - Flush-on-quit triggers immediate write.
- [ ] `tests/unit/undo-manager-batching.test.ts`
  - Logically-grouped mutations within a transaction collapse to one undo step.
  - Distinct user actions remain distinct undo steps.
- [ ] Audit `tests/unit/entity-renderer-registry.test.ts`; add coverage for claim ordering and `getRendererTagFor` contract if missing.

**Helpers added to `tests/smoke/test-utils.ts`:**

- [ ] `client.waitForAutosave()` — waits past debounce, confirms file on disk updated.
- [ ] `client.simulateDirtyQuit()` + `client.reopen()` — for crash recovery tests.
- [ ] `client.observeYDocTransactions(fn)` — counts transactions during a callback.

## Phase 3 — Tighten existing smoke tests (one PR)

Upgrade existing smoke tests from "appeared in snapshot" to "behaves across lifecycle."

**Helpers added to `tests/smoke/test-utils.ts`:**

- [ ] `assertPersists(client, setup)`: runs `setup`, captures snapshot, simulates reload, asserts post-reload snapshot equals pre-reload.
- [ ] `assertUndoable(client, setup)`: runs `setup`, captures snapshot S1, undoes, asserts snapshot equals pre-setup, redoes, asserts snapshot equals S1.

**Apply both helpers to:**

- [ ] `tests/smoke/pages.test.ts`
- [ ] `tests/smoke/selection.test.ts`
- [ ] `tests/smoke/text-entities.test.ts`
- [ ] `tests/smoke/sidebar-hierarchy.test.ts`
- [ ] `tests/smoke/upsert-layout.test.ts`
- [ ] `tests/smoke/drop-dedup.test.ts`

**Also:**

- [ ] Audit every smoke test for assertions of the form `snapshot.entities[id].field === literal`. Replace with assertions on user-visible outcomes (selection bounds, broadcast events, renderer tag) where the field isn't itself the user-visible outcome.

## Phase 4 — Lock it in (one PR)

The most important phase. Prevents drift back to a suite that accretes Claude-written tests of unknown value.

- [ ] Add `tests/README.md` documenting:
  - **The bar.** A test earns its keep iff all four:
    1. Catches a real regression (you can name the production-code change that would break it).
    2. Tests an observable outcome (function output, IPC broadcast, snapshot field), not an internal mechanism.
    3. Survives refactors — if production code is reorganized but behavior preserved, the test passes.
    4. Locally legible — reading just the test file tells you what it protects.
  - Test buckets (unit / smoke / fuzz / agent) and when to use each.
  - The `AppClient` helpers and when to reach for each.
  - Mutation-verification convention with one example commit message.
  - What's intentionally uncovered and why (link to "Non-goals" above).
- [ ] Add a "Test contract" section to `CLAUDE.md`:
  - Any new entity kind ships with smoke coverage of persistence + undo round-trip.
  - Any new runtime mutator ships with forward/reverse sync coverage.
  - PRs touching `src/main/runtime/workspace-*.ts` require smoke coverage updates.
  - No new `.todo()` test merged without a linked issue.
  - Before writing a test, Claude should re-read `tests/README.md` and the bar.
- [ ] Update `src/main/runtime/CLAUDE.md` to cross-reference the new persistence/undo/sync smoke tests so future contributors find them when changing this layer.

## Phase 5 — Parser fuzz (one PR, optional)

The `.canvas` file format is user data. A parser bug can corrupt or refuse to load real workspaces.

- [ ] `tests/fuzz/canvas-parser.test.ts` — property-based tests generating `.canvas` documents (valid, near-valid, malformed, oversized, deeply nested). Parser must either accept or reject cleanly; never throw an uncaught error or corrupt state.
- [ ] Add `pnpm test:fuzz` script; run on every PR (fuzz is fast for parsers).

Scoped to the parser only — HTTP API and Y.Doc merge fuzz deliberately deferred.

## Success criteria

- [ ] Phase 0 decisions recorded in this issue's comments.
- [ ] Phases 1–4 merged as separate PRs, each green. Phase 5 optional.
- [ ] `pnpm test:unit && pnpm test:smoke` green on `main` after each phase.
- [ ] `tests/README.md` published with the four-criterion bar.
- [ ] `CLAUDE.md` "Test contract" section published.
- [ ] Persistence, undo/redo, sync, IPC lifecycle, autosave debounce, and undo batching all have coverage.
- [ ] Zero `.todo()` blocks in any test file.

## Risks and mitigations

- **Phase 2 tests encode current bugs as correct.** Phase 0 produces an explicit bug list; cross-reference before writing each test.
- **Smoke runtime balloons.** Use the lowest debounce wait that proves the behavior. Phase 0 sets the budget.
- **Drift back after this lands.** Phase 4 is the lock-in. `tests/README.md` is the artifact Claude reads before writing the next test.

## Scope decisions captured in this issue

Earlier drafts of this issue covered renderer E2E (Playwright+Electron), visual regression, performance budgets, broader fuzz, full-suite backfilled mutation verification, and CI dashboards. Each was reviewed and deferred — see "Non-goals" above. The intent is that this issue closes a real gap (persistence/undo/sync), sets a durable standard (the four-criterion bar in `tests/README.md`), and stays small enough to land in two weeks.
