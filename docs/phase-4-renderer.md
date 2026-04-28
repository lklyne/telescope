# Phase 4 — Sectioned sidebar renderer

This is the user-facing half of the project sidebar restructure. The backend
(Phases 1–3) is shipped on `feat/project-sidebar-restructure`: the main
process emits a sectioned `LeftSidebarData`, the new project IPC channels
are live, and `userData/sidebar-state.json` is the source of truth for
ephemeral UI state. The renderer still ignores all of it. Phase 4 makes the
sidebar actually look like the new design and deletes `RepoMenu.tsx`.

## What you're building

```
┌───────────────────────────────────┐
│ Canvases             [chev] [ + ] │  header — "+" creates canvas in
│                                   │           active section
│ ▾ Scratchpad                  [+] │  per-section "+" creates canvas
│   ◦ Sketch                        │
│   ● Roadmap (active)              │
│      └ Frame: Garden              │  ← SidebarCanvasTree mounts here,
│      └ Group: Hero                │     under the active canvas only
│         └ Image                   │
│   ◦ Brainstorm                    │
│                                   │
│ ▾ telescope          [⋯]      [+] │  per-project kebab + "+"
│   ● Layouts (active in section)   │
│   ◦ Wireframes                    │
│                                   │
│ ▾ blog               [⋯]      [+] │
│   ◦ Drafts                        │
│                                   │
│ + Connect project                 │  bottom row
└───────────────────────────────────┘
```

Only **one** `SidebarCanvasTree` shows at a time — the one belonging to the
globally-active canvas, regardless of which section it lives in. Other
canvases collapse to a single row.

## Pre-reading (do this first)

Before writing any code, skim these in order:

1. **`docs/phase-4-renderer.md`** — this file.
2. **`/Users/lyleklyne/.claude/plans/looks-good-lets-plan-hazy-peacock.md`** —
   the original approved plan.
3. **`src/renderer/left-sidebar/App.tsx`** — current sidebar (279 lines).
   This file gets significantly rewritten in Phase 4.
4. **`src/renderer/left-sidebar/SidebarCanvasTree.tsx`** — the entity tree
   that mounts under the active canvas. **Do not modify** — only change
   where it's mounted.
5. **`src/renderer/toolbar/RepoMenu.tsx`** — getting deleted.
6. **`src/main/runtime/sidebar-builder.ts`** — see what `sections` and
   `activeProjectId` look like in `LeftSidebarData`.
7. **`src/shared/types.ts`** — search for `SidebarProjectSection`,
   `SidebarCanvasEntry`, `LeftSidebarElectronAPI` (lines 1649+).
8. **`src/preload/left-sidebar.ts`** — already has all the project methods
   you'll need (`connectProjectViaPicker`, `renameProject`, `relinkProject`,
   `setProjectUrl`, `deleteProject`, `revealProjectFolder`, `revealCodebase`,
   `createCanvasInProject`, `setActiveProject`, `listProjects`).
9. **`src/main/ipc/register-project-ipc.ts`** — the matching main-process
   handlers. The delete flow has its own native-confirm modal already; the
   renderer just calls `deleteProject(id)` and gets a boolean back.

## Locked decisions you must respect

These came out of an extensive grilling session. Don't relitigate them:

- **Header label** says **"Canvases"**, not "Spaces" (free the word "space"
  for the on-disk container concept).
- **Per-section `+`** creates `Untitled.canvas` in that section's folder
  immediately — no picker, no name dialog. Naming collisions auto-suffix
  (handled by `space-manager.createCanvasFile`).
- **Bottom-of-sidebar `+ Connect project`** opens a native folder picker.
  No form, no URL field. URL is captured lazily later (Phase 6 / handled
  by component-render plugin already wired in).
- **Scratchpad** is always first, has no kebab, can't be renamed or
  deleted. Its `+` button still works (creates at space root).
- **Project ordering** is `lastActiveAt` desc. Don't add drag-to-reorder.
- **Project kebab menu** items: Rename, Set dev URL…, Show in Finder,
  Reveal codebase in Finder, ─── divider ─── , **Delete project…** (red,
  destructive, last). On a broken project, an inline "Locate folder…"
  button surfaces in the section header — *not* in the kebab.
- **Inline rename**: double-click + F2 + right-click → Rename. Enter
  commits, blur commits, Esc cancels. Collisions reject inline (red
  border). Invalid chars get stripped silently while typing.
- **Delete confirm** is the OS-native message box from
  `dialog.showMessageBox`, fired from `register-project-ipc.ts`. The
  renderer just calls `api.deleteProject(id)` and reacts to the boolean
  return. **Do not** build a custom modal.
- **Entity tree** (`SidebarCanvasTree`) renders under the *globally
  active* canvas, not at the bottom of the sidebar. There is at most one
  tree visible at any moment.

## File-by-file changes

### Add

#### `src/renderer/left-sidebar/ProjectSection.tsx`

Renders one section header + its canvas list. Owns the per-section
expand/collapse state (local to the component — does not persist).

Props:

```ts
{
  section: SidebarProjectSection
  globallyActiveCanvasId: string | null
  // The renderer-side "the entity tree should mount under this canvas"
  // signal. Equal to the canvas id whose isActive===true and whose
  // projectId matches the activeProjectId.
  activeCanvasIdInThisSection: string | null
  isDark: boolean
  api: LeftSidebarElectronAPI
  onStartRename: (canvasId: string) => void
  editingCanvasId: string | null
  onCommitRename: (canvasId: string, oldName: string, newName: string) => void
  onCancelRename: () => void
  // Slot to render the entity tree under the active canvas in this
  // section. The parent passes the ready-to-mount node.
  treeSlot: ReactNode
}
```

Behavior:

- Header row:
  - Left: chevron (▾/▶) toggles local expansion.
  - Truncated label.
  - Right: kebab (`⋯`) for non-Scratchpad, then `+` button.
- Click anywhere on a canvas row: `api.selectTab(canvas-uuid)` *and*
  `api.setActiveProject(section.id)`.
- F2 / double-click on canvas row: enter rename mode.
- Right-click on canvas row: small menu with Rename, Delete (the same
  rename + `api.deleteTab(id)` actions today's `App.tsx` already uses).
- The `+` calls `api.createCanvasInProject(section.id)`.
- Kebab opens a Menu (use `@base-ui/react/menu` like RepoMenu does):
  - Rename → enter rename mode on the section header
  - Set dev URL… → small inline prompt or a sub-menu input (see "Set
    URL UX" below)
  - Show in Finder → `api.revealProjectFolder(section.id)`
  - Reveal codebase in Finder → `api.revealCodebase(section.id)`
  - divider
  - Delete project… → `api.deleteProject(section.id)` (the main process
    shows the confirm; on `true` return, the section disappears via the
    next sidebar broadcast)
- Broken state (`section.health === 'broken'`):
  - Section header gets dimmed text.
  - Append an inline "Locate folder…" pill button next to the label.
    Click → `api.relinkProject(section.id)`.
  - The kebab still works; Delete is still available.
- Active canvas: row gets the existing active styling (`<Check />` on
  the right or whatever is current). When this row is the
  `globallyActiveCanvasId`, render `treeSlot` directly underneath.
- The `+` button is **always visible** even when the section is
  collapsed (it's an affordance to create a canvas without having to
  expand first).

#### `src/renderer/left-sidebar/ConnectProjectRow.tsx`

Bottom row. Single `<button>` styled like a sidebar item with a `<Plus />`
icon and the text "Connect project". Click → `api.connectProjectViaPicker()`.
No state of its own.

#### `src/renderer/left-sidebar/sectioned-data.ts` (helpers)

Pure functions:

- `findGloballyActiveCanvas(data: LeftSidebarData)` →
  `{ projectId, canvasId } | null`. Walks `data.tabs` for `isActive`.
- `sectionContainsActive(section, activeCanvasId)` → boolean.
- Anything else that turns `LeftSidebarData` into "what to render"
  without putting derivation inside the React tree.

### Modify

#### `src/renderer/left-sidebar/App.tsx` — major rewrite

Replace the flat `tabs.map` block (lines ~163–250) with a section-driven
layout. Pseudocode:

```tsx
const sections = sidebarData.sections ?? []
const active = findGloballyActiveCanvas(sidebarData)

return (
  <aside ...>
    <Header
      label={pagesExpanded ? 'Canvases' : currentCanvasName}
      onPlusClick={() => {
        // Header `+` creates in the *active* section.
        const target = sidebarData.activeProjectId ?? 'scratchpad'
        api.createCanvasInProject(target)
      }}
      onToggleExpanded={...}
    />
    <ScrollArea>
      {pagesExpanded ? (
        <>
          {sections.map((section) => (
            <ProjectSection
              key={section.id}
              section={section}
              globallyActiveCanvasId={active?.canvasId ?? null}
              activeCanvasIdInThisSection={
                section.id === active?.projectId ? active?.canvasId ?? null : null
              }
              treeSlot={
                section.id === active?.projectId ? (
                  <SidebarCanvasTree
                    items={sidebarData.items}
                    selectedEntityIds={sidebarData.selectedEntityIds}
                    selectedGroupId={sidebarData.selectedGroupId ?? null}
                    isDark={isDark}
                    api={api}
                  />
                ) : null
              }
              ...
            />
          ))}
          <ConnectProjectRow isDark={isDark} api={api} />
        </>
      ) : null}
    </ScrollArea>
  </aside>
)
```

Things to delete from `App.tsx` while you're in there:

- The `useDragReorder` import + setup. Tabs are no longer drag-reorderable
  in v1 (project order is `lastActiveAt`-driven, canvas order is mtime-
  driven). The hook stays in the codebase — just don't use it here.
- The `pagesHeaderLabel = ... 'Spaces'` line (rename to "Canvases").
- The bottom-of-sidebar `<SidebarCanvasTree>` mount — it moves into
  `ProjectSection`'s `treeSlot`.

Keep these:

- `useReportTextEditing(api.setTextEditing)` — the rename inline editor
  needs it.
- The keyboard delete handler (lines 53–86) — entity-tree deletion is
  unchanged.
- The frame-count auto-expand behavior (lines 98–105) — adapts to the
  section housing the active canvas.

#### `src/renderer/toolbar/toolbarSections.tsx`

Remove the `RepoMenu` import (line 27) and its mount inside the left
controls (line 114). Leave the surrounding `<div>` and the `PanelRight`
toggle alone.

#### `src/preload/toolbar.ts`

Remove `repoList`, `repoConnectViaPicker`, `repoDisconnect`,
`onReposChanged` from the toolbar bridge. Update the matching type in
`shared/types.ts` (search for `repoList: () => Promise<ConnectedRepo[]>`).

The component-render plugin still uses `findRepoForPath` + `urlForComponent`
internally — those are main-process calls, not toolbar-bridge calls, so
no change needed there.

### Delete

- **`src/renderer/toolbar/RepoMenu.tsx`** — entire file.

## Component contracts in detail

### "Set dev URL…" UX

Two reasonable shapes:

1. **Sub-menu with a text input** that submits on Enter. Cleanest. Use
   the existing `InlineEditLabel` pattern from `shared/InlineEditLabel`
   for consistency. On submit, `api.setProjectUrl(id, value)` and close
   the menu.
2. **Inline prompt** (small modal-ish overlay below the kebab). More
   work; not worth it for v1.

Pick option 1. Pre-fill with the current `section.url` if present.
Empty submit clears the URL (`api.setProjectUrl(id, null)`).

### Inline canvas rename

Today the sidebar uses `InlineEditLabel` (see `App.tsx` line 183). Reuse
it. The collision-rejection behavior happens server-side via
`space-manager.renameCanvasFileFor`, which returns `{ ok: false, reason:
'collision' | 'invalid' | 'missing' }`. The current preload doesn't
expose that channel — wire `api.renameCanvas(projectId, oldName,
newName): Promise<{ok: true; finalName: string} | {ok: false; reason: string}>`
through `register-project-ipc.ts` if it isn't already there. **Check
before adding** — Phase 3 may have stubbed it.

If the rename returns `{ ok: false, reason: 'collision' }`, the renderer
puts the input in red-border state and keeps focus. On `'invalid'`,
same. On `'missing'`, treat as collision (race).

For v1, you can also just call `api.renameTab(tabId, newName)` (the
existing canvas-rename channel) and let it succeed-or-fail silently.
Better UX is the rejection feedback above; if you're under time, ship
the silent path and follow up later.

### Connect project flow

```
user clicks "+ Connect project"
  → api.connectProjectViaPicker()
  → main shows native folder picker
  → if cancelled: returns null, nothing happens
  → if folder picked:
     → space-manager.connectProject() creates <space>/<basename>/ on disk,
       persists to projects.json with auto-suffixed folderName
     → main broadcasts updated sidebar via notifyLeftSidebarData()
     → renderer re-renders with the new section
```

No additional renderer code beyond the click handler.

### Delete project flow

```
user clicks Delete project… in kebab
  → api.deleteProject(id)
  → main shows native confirm:
       "Delete telescope?
        Telescope will delete the project's canvases inside the space
        folder. Your codebase folder at /Users/.../dev/telescope will not
        be modified."
        [Cancel] [Delete]
  → if cancel: returns false, nothing happens
  → if delete:
     → space-manager.deleteProject() rms <space>/<folderName>/, kills
       dev server, removes from projects.json
     → main broadcasts; section disappears
     → if the deleted project was active, sidebar-state falls back to
       SCRATCHPAD_PROJECT_ID automatically (handled in
       sidebar-state.ts dropProjectFromState)
```

### Broken project recovery flow

```
on launch (or on watcher tick), main re-evaluates section.health.
absolutePath no longer exists on disk → section.health = 'broken'.
  → ProjectSection renders the inline "Locate folder…" button.
user clicks → api.relinkProject(id)
  → main opens native folder picker
  → on pick: space-manager.relocateProject(id, newPath)
  → repos.json updates absolutePath; id stays stable
  → next sidebar broadcast: section.health goes back to 'ok'
```

### First-localhost capture (no renderer work needed)

This is wired in the main-process plugin layer (`component-render.ts` per
the original plan). The renderer just shows the URL once it lands in
`section.url`. If you find this isn't actually wired, that's a Phase 6
task — flag it but don't try to land it inside Phase 4.

## Pitfalls

### Stale `editingCanvasId` after rename

If you keep `editingCanvasId` in `App.tsx` state and a sidebar broadcast
arrives while editing, the canvas id may have changed (rename = name
change but in our model `id` is stable; should be safe). Still, gate
the rename effect on `tabs.some(t => t.id === editingCanvasId)` like
today's code does.

### Two sources of truth for "active"

`sidebarData.activeTabId` is the runtime active tab id (UUID).
`sidebarData.activeProjectId` is the active section. They should always
agree (the tab whose id === activeTabId belongs to the project whose id
=== activeProjectId), but during transitions they could be momentarily
out of sync. Always use `activeTabId` for "which canvas is active in the
runtime" and `activeProjectId` only for "which section's `+` does the
header `+` target."

### Watcher-induced flicker

When the user creates a canvas via Telescope, two events fire:
`createCanvasFile` writes the file (suppressed via the watcher's
suppression marker, so chokidar's `add` event doesn't trigger a sidebar
rebuild), AND the autosave system writes the snapshot. The first event
is suppressed; the second triggers a real rebuild. You should see the
canvas appear once, not twice. If you see flicker, suspect
`suppressedPaths` timing in `space-manager.ts` (500ms window today).

### Don't render `SidebarCanvasTree` more than once

The component is non-trivial; mounting it in multiple sections costs
real performance and creates duplicate refs. The `treeSlot` pattern
above guarantees one mount.

### Scratchpad's `+` is on the section, not the bottom row

The bottom row (`ConnectProjectRow`) is *only* for connecting projects.
Don't conflate it with canvas creation.

### RepoMenu deletion is wider than one line

After removing the import + mount in `toolbarSections.tsx`, also remove
the now-dead `repoList`/`repoConnectViaPicker`/`repoDisconnect`/
`onReposChanged` exposure from `src/preload/toolbar.ts` AND the matching
type fields in `src/shared/types.ts` (search for `ToolbarElectronAPI` or
similar). Run `pnpm typecheck` after each removal — it'll surface the
last consumer if there is one.

The `repo-*` IPC channels in `register-repo-ipc.ts` themselves can stay
for now — `component-render.ts` and `register-right-details-panel-ipc.ts`
still use the underlying functions. Channel renames are a separate cleanup
pass after Phase 4 ships.

### Tests that may break

- `tests/smoke/*` — drive the app via `AppClient` (`tests/smoke/test-utils.ts`)
  which uses HTTP API endpoints. Tab create/delete should still work
  (they default to Scratchpad). If a smoke test asserts on RepoMenu DOM,
  update or skip it. The plan called this out as expected breakage.
- `tests/unit/*` — should pass unchanged. Run after every meaningful step.

## Verification

After implementing, run:

```bash
pnpm typecheck            # must pass
pnpm test:unit            # 250+ tests, all passing
pnpm dev                  # interactive verification
```

Manual checks (in `pnpm dev`):

1. **Migration sanity** (only if you have legacy data):
   - `~/Documents/Telescope/*.canvas` exists with your canvases.
   - Sidebar shows them under Scratchpad.
   - Previously-active canvas opens at launch.

2. **Connect project**:
   - Click `+ Connect project`, pick `~/dev/<some-folder>`.
   - New section appears below Scratchpad with that folder's basename.
   - `~/Documents/Telescope/<basename>/` exists (empty).
   - Codebase folder at `~/dev/<some-folder>/` is unchanged.

3. **Create canvas in project**:
   - Click the project section's `+`.
   - `Untitled.canvas` appears under that section.
   - File on disk: `~/Documents/Telescope/<basename>/Untitled.canvas`.

4. **Active canvas + tree**:
   - Click any canvas row in any section.
   - `SidebarCanvasTree` renders under that row, with that canvas's
     entities.
   - Click a different canvas in a different section: tree moves.
   - Only one tree visible at any time.

5. **Section header `+`** (top-of-sidebar):
   - Click it.
   - New canvas appears in the *active* section (whichever section the
     active canvas is in).

6. **Inline rename**:
   - Double-click a canvas row → input appears.
   - Type new name, press Enter → file renames on disk, sidebar
     reflects.
   - Try renaming to a name that already exists → input stays in error
     state (or the rename silently no-ops if you took the simpler path).
   - Esc → reverts.

7. **Project rename**:
   - Open kebab on a project → Rename.
   - Type new name, Enter → `~/Documents/Telescope/<oldName>/` becomes
     `~/Documents/Telescope/<newName>/`. Codebase path unchanged.

8. **Delete project**:
   - Open kebab → Delete project…
   - Native confirm fires with the codebase-untouched copy.
   - Confirm → section disappears, `~/Documents/Telescope/<name>/` is
     gone, codebase folder unchanged.

9. **Broken project recovery**:
   - Connect a folder. Quit Telescope. `mv` the codebase folder.
   - Relaunch. Section header is dimmed with "Locate folder…" inline.
   - Click → folder picker → pick the moved folder.
   - Section recovers to healthy state.

10. **External edits (chokidar)**:
    - With Telescope open, drop a `.canvas` file into
      `~/Documents/Telescope/` via Finder.
    - Sidebar shows it under Scratchpad within ~200ms.
    - Drop into an unconnected folder inside the space — should NOT appear
      (orphan rule).

11. **No RepoMenu in toolbar**:
    - The plug icon is gone.

## Out of scope for Phase 4

- Drag-to-reorder projects.
- Multiple URLs per project.
- "Move canvas between sections" via drag.
- Channel renames (`repo-*` → `project-*`). Defer to a later cleanup PR.
- Custom in-app delete confirm. Native dialog is enough.
- "Show in Finder" for individual canvases (not requested).
- A toolbar button for connect-project (intentional — sidebar is the
  single home).

## When you finish

1. Commit as `feat(renderer): sectioned sidebar with project sections`.
2. Run `pnpm typecheck` and `pnpm test:unit`. Both must pass.
3. Update task #4 → completed in your task tracker.
4. The branch is `feat/project-sidebar-restructure`. Don't merge without
   user review — they want to see Phase 4 land before pushing.

If you discover a design ambiguity not covered here, **stop and ask** —
do not invent a behavior. The grilling that produced these decisions
was deliberate; new gaps deserve the same treatment.
