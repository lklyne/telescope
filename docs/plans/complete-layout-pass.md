# Complete the layout pass — route all view mutations through it

Source: GitHub issue [#127](https://github.com/lklyne/specular/issues/127) (revised plan, owner comment).

## Context

This Electron app builds its window from `WebContentsView` panels ("views"): the canvas
background, toolbar, sidebar, devtools panels, and each web page. Spec invariant I1
(`docs/interaction-layer.md` §6) requires that one scheduled layout pass is the only
site that mutates view bounds / visibility / child-lists — mutation elsewhere fragments
authority and causes bounds-drift bugs, focus storms, and undo-during-drag corruption.

Today that invariant is not real. Investigation found:

- 35 direct view mutations (`setBounds`/`setVisible`/`addChildView`/`removeChildView`)
  outside the layout pass — flagged by `local/no-direct-view-mutation`, currently `warn`.
- ~60 direct synchronous `layoutAllViews()` / `layoutDevtoolsViews()` calls across 20+
  files — so there are effectively four ways to trigger layout (`markDirty`,
  `requestLayout`, `layoutAllViews`, `layoutDevtoolsViews`).
- 99 `markDirty()` calls across 27 files, of which ~43 are no-ops — the surfaces
  `floating-ui` (20), `pages` (10), `bounds` (7), `devtools` (6) are consumed by
  `layoutAllViews()` and the result discarded. They do nothing.

The 35 mutations are not 35 separate problems. They exist because the layout pass is
incomplete — it never learned ~5 things (page child-list membership, per-page devtools
host hiding, toolbar-dropdown sizing, automation-page parking, devtools prewarm). Each
gap forces a call site to mutate views directly.

Intended outcome: make `layoutAllViews()` a complete, idempotent projection of app
state onto view geometry. Once complete, every one of the 35 sites and ~60 direct calls
collapses to a single argument-free `requestLayout()`. The dead dirty-flag machinery is
deleted. The rule flips to `error`. One verb, one authority, no exceptions.

This is scoped as "Level 2 + flag-free geometry": complete the pass and delete the
dead geometry flags. The three live data-send flags (`canvas`/`sidebar`/`toolbar`,
which gate IPC payload sends) are left alone — converting them to content-hashes is
explicitly out of scope (possible future follow-up). Delivered as a single PR.

## Part 1 — Complete the layout pass (the 5 capabilities)

All changes here are in `src/main/runtime/layout-engine.ts` and
`src/main/runtime/layer-stack.ts` unless noted.

### 1.1 Page child-list reconciliation

- Today: `page-factory.ts` calls `win.contentView.addChildView(frameView/pageView)`
  on create (lines ~88, 98) and `removeChildView` on destroy (~272–275).
  `applyStack()` re-adds singletons but never touches pages.
- Change: make the layout pass own the full child-list. Promote `applyStack()` in
  `layer-stack.ts` into an idempotent full reconcile: compute the desired ordered
  child list — `bgView` → live pages (in `pages[]` order, each contributing
  `frameView` + `pageView` + optional `devtoolsHostView`) → component views
  (`listComponentViews()`) → `aboveView` → `leftSidebar` → devtools cluster →
  `toolbar` — diff against `win.contentView.children`, and add/remove the delta.
  Skip the work when desired order already equals actual order (cheap no-op).
- `page-factory.createPage` keeps `new WebContentsView(...)` + `setBackgroundColor` +
  `webContents.loadURL` (construction is not a flagged mutation), pushes to `pages[]`,
  and calls `requestLayout()`. `removePageAtIndex` splices `pages[]`, closes
  `webContents`, calls `requestLayout()` — no `addChildView`/`removeChildView`.
- Ordering: run the reconcile after `syncComponentViews(fileEntities)`
  (currently called at `layout-engine.ts:455`) so component views created this pass are
  attached the same pass. This lets `component-page-factory.ts` `createView`/
  `destroyView` also drop their `addChildView`/`removeChildView` (lines 69, 122) — the
  reconcile owns them. Fallback if reconcile ordering proves fiddly: allowlist
  `component-page-factory.ts` with the comment "child-view mutation executes within
  layoutAllViews via syncComponentViews()" — its calls already run inside the pass.

### 1.2 Per-page devtools host hiding

- Today: `setDevtoolsView(nextInspectorView)` (`runtime-core.ts` ~133) aliases the
  module-level `devtoolsView` to the active page's `devtoolsHostView`. The layout
  pass sizes only that one; other pages' host views are hidden imperatively
  (`devtools-panel.ts:61,119`, `runtime-core.ts:131`).
- Change: in `layoutDevtoolsViews()`, iterate all pages: size the active
  page's `devtoolsHostView` to the devtools-content bounds when devtools is open;
  set every other page's `devtoolsHostView` to hidden bounds. Delete the imperative
  hides. `ensureDevtoolsView()` (`runtime-core.ts:165`) still constructs the WCV but
  drops its `addChildView` (line 171) — the §1.1 reconcile attaches it.

### 1.3 Toolbar dropdown sizing

- Today: `register-toolbar-ipc.ts` (~165–175) grows/shrinks `toolbarView` directly
  on `toolbar-dropdown-open/close` IPC so dropdowns can overflow the toolbar strip.
- Change: add a `toolbarDropdownOpen` boolean to `src/main/ui-state.ts` (with
  getter/setter, alongside the existing devtools/sidebar fields). The IPC handlers set
  the field + `requestLayout()`. The toolbar block in `layoutAllViews()` (~line 502)
  branches: full-window bounds when open, `toolbarHeight` otherwise.

### 1.4 Automation page parking

- Today: `overlay-manager.ts` `beginAutomationInteractivePage` (~108) sets a culled
  page's bounds directly to `{-10000,-10000,emulatedW,emulatedH}` so an agent has a
  real viewport. The layout pass already checks `automationInteractivePageCounts` to
  skip culling (`layout-engine.ts:359`) but doesn't set the bounds.
- Change: in the per-page loop, when `automationInteractivePageCounts.has(page.id)`
  and the page would otherwise be culled, set it to off-screen bounds with
  `boundEffectivePageContentSize(page)` (the logic currently in overlay-manager).
  `beginAutomationInteractivePage` just registers the id + `requestLayout()`.

### 1.5 Devtools prewarm unification

- Today: `window-init.ts` (~339–390) sets the three devtools WCVs to
  `{-10000,0,1,1}` (prewarm) at construction; `layoutDevtoolsViews()` uses `{0,0,0,0}`
  when devtools is closed. Two notions of "hidden."
- Change: introduce `DEVTOOLS_HIDDEN_BOUNDS = {x:-10000,y:0,width:1,height:1}` and
  use it for all hidden devtools states in `layoutDevtoolsViews()` (replacing the
  devtools `{0,0,0,0}` cases only — page culling keeps `{0,0,0,0}`). `window-init.ts`
  drops its prewarm `setBounds` calls entirely; the first layout pass warms the panels.

## Part 2 — Collapse trigger mechanisms to one verb

- Convert all ~60 direct `layoutAllViews()` / `layoutDevtoolsViews()` calls (outside
  `layout-engine.ts`) to `requestLayout()`. The audit confirmed no call site reads
  view bounds or otherwise depends on synchronous completion after the call.
- Delete the 35 direct view mutations — the completed layout pass now covers every
  one; replace with `requestLayout()` where the site doesn't already call it.
- Make `layoutAllViews` and `layoutDevtoolsViews` non-exported (module-private to
  `layout-engine.ts`). `requestLayout()` (`viewport-control.ts`) becomes the only public
  way to trigger layout.
- Evaluate the `setTimeout(0)` in `runtime-core.ts` (~115): if it only deferred layout,
  delete it; if the devtools attach-generation logic still needs deferral, keep that
  part but drop the layout call inside it.

Invariant to preserve: gesture-begin IPC handlers must call
`interaction.tryEnter(...)` before triggering layout, so the post-layout
`reconcileFocus()` sees the gesture's `interactionState.kind` (see `runtime/CLAUDE.md`
→ Gotchas → "Gesture-begin ordering"). This already holds in
`register-canvas-drag-ipc.ts`; do not regress it. Debounced layout is safe here —
the pass runs after `tryEnter` has set state.

## Part 3 — Flag-free geometry: delete the dead dirty surfaces

- In `src/main/runtime/layout-dirty.ts`, reduce `DirtySurface` to
  `'canvas' | 'sidebar' | 'toolbar'`. Delete `'floating-ui'`, `'pages'`, `'bounds'`,
  `'devtools'`, `'visibility'`, and `'stack'` (the stack reconcile in §1.1 is now
  idempotent and runs every pass — no flag needed).
- Delete the now-dead `consumeDirty('floating-ui'/'bounds'/'pages'/'devtools')` lines in
  `layout-engine.ts` (~338, 518–520) and the `consumeDirty('stack')` gate (~207) —
  call the reconcile unconditionally.
- Sweep the ~55 dead `markDirty(...)` arguments (`floating-ui`/`pages`/`bounds`/
  `devtools`/`stack`) across the 27 caller files: trim dead args from mixed calls;
  delete calls whose every argument was dead. `markAllDirty()` keeps working over the
  3 remaining surfaces.

## Part 4 — eslint rule: refine + flip to error

In `eslint-rules/no-direct-view-mutation.js`:
- Refine: skip the `CallExpression` when the callee's receiver is the identifier
  `win` — `win` is the `BaseWindow`; resizing the OS window (`recording.ts`,
  `workspace-restore.ts`) was never a child-view mutation in scope. Add a code comment
  explaining this. No files need allowlisting for the `win.setBounds` cases.

In `eslint.config.js`:
- Flip `local/no-direct-view-mutation` from `'warn'` to `'error'`.

`ALLOWED_FILES` stays as `layout-engine.ts` + `layer-stack.ts` only (unless the §1.1
fallback for `component-page-factory.ts` is taken).

## Critical files

| File | Change |
| --- | --- |
| `src/main/runtime/layout-engine.ts` | Absorb capabilities §1.1–1.5; drop dead `consumeDirty`; un-export functions |
| `src/main/runtime/layer-stack.ts` | `applyStack` → idempotent full child-list reconcile incl. pages/components |
| `src/main/runtime/layout-dirty.ts` | `DirtySurface` → 3 surfaces |
| `src/main/runtime/page-factory.ts` | Drop `addChildView`/`removeChildView`; `requestLayout()` |
| `src/main/runtime/component-page-factory.ts` | Drop `addChildView`/`removeChildView` (or allowlist — fallback) |
| `src/main/runtime/devtools-panel.ts` | Drop imperative hides + direct `layout*` calls → `requestLayout()` |
| `src/main/runtime/runtime-core.ts` | Drop devtools host `setBounds`/`addChildView`; reassess `setTimeout(0)` |
| `src/main/runtime/overlay-manager.ts` | `beginAutomationInteractivePage` → register id + `requestLayout()` |
| `src/main/runtime/window-init.ts` | Drop bootstrap `addChildView` + prewarm `setBounds` |
| `src/main/runtime/workspace-restore.ts` | `win.setBounds` now rule-exempt; direct `layoutAllViews` → `requestLayout` |
| `src/main/ipc/register-toolbar-ipc.ts` | Dropdown IPC sets `toolbarDropdownOpen` + `requestLayout()` |
| `src/main/ui-state.ts` | New `toolbarDropdownOpen` field + accessors |
| `src/main/routes/recording.ts` | `win.setBounds` now rule-exempt (no code change needed) |
| `eslint-rules/no-direct-view-mutation.js` | Skip `win` receiver |
| `eslint.config.js` | `warn` → `error` |
| ~25 caller files | Trim/delete dead `markDirty` args; `layoutAllViews()` → `requestLayout()` |

Reuse, don't reinvent: `setBoundsIfChanged()` + `layoutCache.last*BoundsKey`
(`layout-engine.ts`) already make per-view bounds idempotent — apply the same pattern to
the new capabilities. `resolveStackOrder()` (`layer-stack.ts`) is the pure z-order helper
for the reconcile. `requestLayout()` (`viewport-control.ts`) is the 16ms scheduler.
`syncComponentViews()` is the model for the page reconcile. `boundEffectivePageContentSize()`
(`runtime-geometry`) for automation bounds. `automationInteractivePageCounts`
(`runtime-context.ts`) is already populated.

## Verification

Automated (per `CLAUDE.md` → Build & verify):
- `pnpm lint` → zero `local/no-direct-view-mutation` warnings; rule is `error`.
- `pnpm typecheck` — both tsconfigs.
- `pnpm test:unit` — pure logic, no Electron.
- `pnpm test:smoke` — full app via HTTP API (covers runtime / IPC / persistence).

Manual (`pnpm dev`), exercise each migrated cluster and watch for regressions:
- Create / delete / duplicate pages — page WCVs appear at correct z-order; toolbar and
  `aboveView` stay on top after a new page is created (the old "new page lands above
  everything" race must not reappear).
- Open / close devtools; switch devtools tabs (browser-devtools ↔ comments ↔ inspect) —
  panels hide fully on close; no orphaned visible devtools view; multi-page devtools
  host views all hidden except the active one.
- Resize the OS window; restore from a workspace snapshot.
- Drag pages and entities; resize entities; edge-drag — no spurious gesture cancels, no
  focus flicker (gesture-begin ordering preserved).
- Open / close toolbar dropdowns — dropdown overflows correctly; toolbar returns to
  normal height on close.
- Component file entities — render and reposition.
- Agent automation on an off-screen page (via HTTP API / smoke client) — page gets a
  real viewport.
- Undo / redo, including cross-tab — no `setTimeout` crutch needed; no bounds drift.
- No white-flash on page/view creation (invariant I6 — `setBackgroundColor('#00000000')`
  still set at construction before the reconcile attaches the view).

## Acceptance criteria

- Layout pass owns all 5 capabilities (§1.1–1.5); the 35 direct mutations are gone.
- All ~60 direct `layoutAllViews()`/`layoutDevtoolsViews()` calls → `requestLayout()`;
  both functions are module-private.
- `DirtySurface` reduced to `canvas`/`sidebar`/`toolbar`; ~55 dead `markDirty` args
  swept; no dead `consumeDirty` calls remain.
- `no-direct-view-mutation` refined to ignore the `win` `BaseWindow` receiver.
- `local/no-direct-view-mutation` flipped from `warn` to `error` in `eslint.config.js`.
- `pnpm lint` reports zero `local/no-direct-view-mutation` problems.
- `pnpm typecheck`, `pnpm test:unit`, `pnpm test:smoke` all pass.
- Manual verification checklist above passes.

## Out of scope (possible follow-ups)

- Converting the `canvas`/`sidebar`/`toolbar` data-send flags to content-hash memoization
  (full Level 3 — deletes `layout-dirty.ts` entirely).
- The `local/no-mouse-events` rule (separate invariant I8).
