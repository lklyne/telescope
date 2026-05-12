# Keyboard Binding Registry

Branch: `claude/explore-keyboard-system-N5fjt`. Plan for collapsing Specular's
keyboard system into a single binding registry. The registry is the source of
truth for every shortcut; main is the sole dispatch site; renderer keydown
listeners go away. See [ADR 0010](../adr/0010-main-as-sole-shortcut-dispatch-site.md)
and [ADR 0011](../adr/0011-page-focus-respects-native-shortcuts.md).

## Status

| Step | Status |
|---|---|
| A — registry + dispatch + tests, no callers | ⬜ not started |
| B — port main's `keyboard-shortcuts.ts` to the registry | ⬜ not started |
| C — delete renderer keydown hooks; port to registry | ⬜ not started |
| D — `app-menu.ts` accelerators read from the registry | ⬜ not started |
| E — adjacent: `Cmd+A` select-all, Cmd+D no-grouping, paste-smart, P2 page focus | ⬜ not started |

Each step ends in a working app. Each ships as one PR.

## Context

Keyboard shortcuts today are scattered across:

- `src/main/runtime/keyboard-shortcuts.ts` — 285 lines of `if (input.type === 'keyDown' && input.meta && …)` blocks.
- Three renderer hooks (`useCanvasGlobalShortcuts`, `useAnnotateToggleShortcut`, `useAnnotationOverlayShortcuts`) that re-handle the same v/c/d keys when focus is in non-canvas views.
- `src/main/runtime/app-menu.ts` accelerator strings, totally disconnected from the rest.
- Per-WebContents `handleShortcuts: false` flag, which is the implicit "this view doesn't fire tool shortcuts" filter.

Effects:

- "Where is the `v` shortcut defined?" has three answers depending on which WebContents has focus.
- No tests exist on any of the keyboard code.
- The wiring uses a late-bound setter pattern (`wireKeyboardShortcuts(...)`) to dodge an import cycle.
- ADR 0005 explicitly flagged keyboard shortcuts as the natural follow-up to the unified `Tool` concept. ADR 0009 §93 flagged variant-key bindings (R/E/D, etc.) as a follow-up to tool-defaults.

This plan finishes that follow-up.

## Goals

1. **One source of truth for every shortcut.** The Bindings UI and the menu accelerators and the dispatcher all read the same table.
2. **One dispatch site.** Main's `before-input-event`. No renderer `keydown` listeners for shortcuts. ([ADR 0010](../adr/0010-main-as-sole-shortcut-dispatch-site.md))
3. **Coverage parity.** Every `Tool['kind']` has a default key (TypeScript exhaustiveness enforces it). Adding a new tool without a key is a build error.
4. **Predictable suppression.** Plain letters never fire while typing. Modifier shortcuts opt in to firing while typing. Same shape applies to page focus. ([ADR 0011](../adr/0011-page-focus-respects-native-shortcuts.md))
5. **Pure-function test surface.** Dispatch is unit-testable without spawning Electron.

## Non-goals (v1)

- Bindings settings pane.
- User overrides (no `userData/bindings.json`).
- `?` cheatsheet overlay.
- Toolbar tooltips. (Tooltips land in a later PR and become the source of truth for discoverability.)

## Architecture

### Modules

```
src/shared/bindings.ts            // pure data + types + dispatchKey()
src/main/runtime/binding-handlers.ts   // Record<BindingId, (ctx) => void>
src/main/runtime/binding-dispatcher.ts // watchModifierKeys replacement; per-WebContents adapter
src/renderer/{view}/binding-handlers.ts // small per-renderer handler maps (only for renderer-targeted bindings)
src/renderer/{view}/useRendererBindingHandlers.ts // tiny hook that listens for 'binding-fire' IPC
```

Deleted:
- `keyboard-shortcuts.ts` (replaced by `binding-dispatcher.ts` + `binding-handlers.ts`)
- `useAnnotateToggleShortcut.ts`
- `useAnnotationOverlayShortcuts.ts`
- v/c/d/escape/delete branches of `useCanvasGlobalShortcuts.ts` (clipboard remains, split into `useCanvasClipboard.ts`)
- `wireKeyboardShortcuts(...)` late-bound setter pattern
- `handleShortcuts: false` per-view flag

### Types

```ts
// src/shared/bindings.ts

export type KeyboardSourceView =
  | 'aboveView' | 'canvasBg'
  | 'toolbar' | 'leftSidebar' | 'rightDetailsPanel'
  | 'devtoolsHeader' | 'devtoolsResizeHandle'
  | 'page'

export type NormalizedKey = {
  key: string      // lowercased, e.g. 'v', 'escape', 'arrowleft'
  cmd: boolean     // CmdOrCtrl
  alt: boolean
  shift: boolean
}

export type BindingId =
  | 'tool-select' | 'tool-add-page' | 'tool-add-text-plain' | 'tool-add-text-sticky'
  | 'tool-add-shape-rectangle' | 'tool-add-shape-ellipse' | 'tool-add-shape-diamond'
  | 'tool-comment' | 'tool-draw-pen' | 'tool-draw-highlight' | 'tool-inspect'
  | 'undo' | 'redo' | 'reset-viewport' | 'group' | 'ungroup'
  | 'select-all' | 'duplicate' | 'delete-selection'
  | 'nav-left' | 'nav-right' | 'nav-up' | 'nav-down'
  | 'escape-tool' | 'escape-page-focus'
  | 'close-tab'
  | 'annotation-close-thread' | 'annotation-clear-draft'

export type BindingTarget = 'main' | KeyboardSourceView

export type BindingContext = {
  activeTool: Tool
  isTextEditing: boolean
  arrowNavigationLocked: boolean
  hasKeyboardTargetPage: boolean
  pageFocusActive: boolean
  canUndo: boolean
  canRedo: boolean
  selectionEmpty: boolean
  sourceView: KeyboardSourceView
  viewMode: 'canvas' | 'browser'
}

export type Binding = {
  id: BindingId
  defaultKey: NormalizedKey
  scope: KeyboardSourceView[]        // which source views can fire this binding
  target: BindingTarget              // where the handler runs
  firesWhileTyping?: boolean         // default false
  firesFromPageFocus?: boolean       // default false
  when?: (ctx: BindingContext) => boolean
  label: string                      // for future Bindings pane + tooltips
}
```

### Dispatch

```ts
// src/shared/bindings.ts

export function dispatchKey(
  table: readonly Binding[],
  key: NormalizedKey,
  ctx: BindingContext,
): BindingId | null
```

Pure function. Returns the first binding whose `defaultKey` matches the input
key and whose `scope`/`when`/`firesWhileTyping`/`firesFromPageFocus` predicates
all hold.

Match order: table order. No conflict detection needed because each binding's
scope is explicit; if two bindings have the same key + scope + modifiers, that's
a typo, caught by a unit test that asserts uniqueness.

### Main adapter

```ts
// src/main/runtime/binding-dispatcher.ts

export function attachBindingDispatcher(
  webContents: WebContents,
  sourceView: KeyboardSourceView,
): void
```

Registers a `before-input-event` listener. On keydown:

1. Normalize the Electron `Input` → `NormalizedKey`.
2. Build `BindingContext` from runtime state (active tool, text-editing flag, …).
3. Call `dispatchKey(BINDINGS, key, { ...ctx, sourceView })`.
4. If a `BindingId` came back:
   - `event.preventDefault()`.
   - If `binding.target === 'main'`: invoke `mainHandlers[id](ctx)`.
   - Else: `viewFor(binding.target).webContents.send('binding-fire', id)`.

This replaces `watchModifierKeys`. The `sourceView` argument replaces the
`handleShortcuts: false` flag.

### Main handler map

```ts
// src/main/runtime/binding-handlers.ts

export const mainHandlers: Record<MainBindingId, (ctx: BindingContext) => void>
```

Imports concrete runtime functions directly. No late-bound setters. The cycle
that motivated `wireKeyboardShortcuts(...)` is broken by placing this file at
a layer that runs *after* `runtime-core` is initialized.

### Renderer handler maps

```ts
// src/renderer/above-view/binding-handlers.ts

export const aboveViewBindingHandlers: Record<AboveViewBindingId, () => void>
```

Registered via a small hook on mount:

```ts
useRendererBindingHandlers(aboveViewBindingHandlers)
```

The hook listens for the `binding-fire` IPC and invokes the matching handler.
Two bindings use this path today: `annotation-close-thread` and
`annotation-clear-draft`, because their state (`openThreadId`,
`pendingAnnotation`) is renderer-local React `useState`.

### Menu accelerators

```ts
// src/main/runtime/app-menu.ts

import { acceleratorFor } from './binding-accelerator'

{ label: 'Close Tab', accelerator: acceleratorFor('close-tab'), click: () => mainHandlers['close-tab']({}) }
```

`acceleratorFor(id)` returns the `CmdOrCtrl+W`-style string derived from
`bindingById(id).defaultKey`. The menu and the dispatcher cannot drift.

Menu items without a binding (About dialog, Setup) keep their inline `click:`
— they're not bindable anyway.

## The binding table

| Id | Default key | Scope | Target | While typing? | From page focus? |
|---|---|---|---|---|---|
| `tool-select` | `v` | canvas-region¹ | main | — | — |
| `tool-add-page` | `p` | canvas-region | main | — | — |
| `tool-add-text-plain` | `t` | canvas-region | main | — | — |
| `tool-add-text-sticky` | `s` | canvas-region | main | — | — |
| `tool-add-shape-rectangle` | `r` | canvas-region | main | — | — |
| `tool-add-shape-ellipse` | `o` | canvas-region | main | — | — |
| `tool-add-shape-diamond` | `Shift+R` | canvas-region | main | — | — |
| `tool-comment` | `c` | canvas-region | main | — | — |
| `tool-draw-pen` | `m` | canvas-region | main | — | — |
| `tool-draw-highlight` | `Shift+M` | canvas-region | main | — | — |
| `tool-inspect` | `i` | canvas-region | main | — | — |
| `escape-tool` | `Escape` | all | main | yes (commits text edit instead) | yes |
| `escape-page-focus` | `Escape` | `page` | main | — | yes |
| `undo` | `Cmd+Z` | all | main | **yes** | — |
| `redo` | `Cmd+Shift+Z` | all | main | **yes** | — |
| `reset-viewport` | `Cmd+1` | all | main | **yes** | **yes** |
| `group` | `Cmd+G` | canvas-region | main | — | — |
| `ungroup` | `Cmd+Shift+G` | canvas-region | main | — | — |
| `select-all` | `Cmd+A` | canvas-region | main | — | — |
| `duplicate` | `Cmd+D` | canvas-region | main | — | — |
| `delete-selection` | `Delete` / `Backspace` | canvas-region | main | — | — |
| `nav-left` | `ArrowLeft` | canvas-region | main | — | — |
| `nav-right` | `ArrowRight` | canvas-region | main | — | — |
| `nav-up` | `ArrowUp` | canvas-region | main | — | — |
| `nav-down` | `ArrowDown` | canvas-region | main | — | — |
| `close-tab` | `Cmd+W` | all | main | yes | — |
| `annotation-close-thread` | `Escape` | `aboveView` | `aboveView` | — | — |
| `annotation-clear-draft` | `Escape` | `aboveView` | `aboveView` | — | — |

¹ `canvas-region` is a convenience for `['aboveView', 'canvasBg', 'toolbar', 'rightDetailsPanel']` — the four views where canvas-style shortcuts should fire. Constant defined in `src/shared/bindings.ts`.

### `add-document` intentionally unbound

Has no default key. Users add documents via the toolbar's "Add text ▾"
dropdown. Bindable later via the (future) Bindings pane.

### `Escape` resolution order

Three bindings share `Escape`. Match order is:

1. `annotation-close-thread` / `annotation-clear-draft` (scope: `aboveView`, only when active state predicate holds — the `when` checks for `openThreadId` / `pendingAnnotation`).
2. `escape-page-focus` (scope: `page` only, only when page focus is active).
3. `escape-tool` (all scopes, fires whenever `activeTool.kind !== 'select'`).

Each binding's `when` predicate ensures only one fires per keystroke; if none of
them match, Escape falls through to native handling.

### Variant key handlers

Per [ADR 0009](../adr/0009-tool-variants-in-popup-state.md), shape and brush
variants live in tool defaults. The keyboard handler does **both**:

```ts
'tool-add-shape-rectangle': () => {
  setActiveTool({ kind: 'add-shape' })
  setToolDefault('add-shape.shapeKind', 'rectangle')
}
'tool-draw-highlight': () => {
  setActiveTool({ kind: 'draw' })
  setToolDefault('draw.brushType', 'highlight')
}
```

No compound-action framework needed — it's just a multi-statement handler body.

## Behavior rules

### No tool-toggle on second keypress

FigJam reference: pressing the same tool key twice does nothing (the tool stays
active). Escape is the only way back to `select`. This removes the existing
toggle behavior in `useAnnotateToggleShortcut.ts`.

### Suppression while typing

Default: bindings do not fire while `isTextEditing` is true. Opt-in via
`firesWhileTyping: true`. Four bindings opt in:

- `undo`, `redo` — global Yjs undo spans text + canvas edits.
- `reset-viewport` — hand-of-god. Viewport reset doesn't mutate the document.
- `escape-tool` — Escape in a text input commits the edit; the text-edit
  context check inside the handler prevents double-firing as a tool reset.

`Cmd+A` is contextual: when `isTextEditing`, the native "select all text" wins
because the binding's `firesWhileTyping` is `false`. When not typing, our
`select-all` handler invokes `selectAllEntities()`.

### Page focus (P2 policy)

Per [ADR 0011](../adr/0011-page-focus-respects-native-shortcuts.md), when a
page has keyboard focus, the page wins almost all keystrokes. Specular reserves
only:

- `escape-page-focus` — exit page focus back to canvas.
- `reset-viewport` — hand-of-god.

Cmd+Z, Cmd+G, Cmd+W, arrows, and tool keys all fall through to the page
natively. To use canvas undo while page-focused, the user presses Escape first.

This is a behavior change from today. Changelog entry required.

## Clipboard split

Clipboard handling is **not** in the registry. `Cmd+C` / `Cmd+V` / `Cmd+X` arrive
as DOM `ClipboardEvent`s, not as keystrokes — and `event.clipboardData` /
`window.getSelection()` only exist renderer-side.

The new `src/renderer/canvas-bg/useCanvasClipboard.ts` (extracted from
`useCanvasGlobalShortcuts.ts`) owns this. The hijack rule:

- If `event.target` is a typing target, native wins.
- If `window.getSelection().toString()` is non-empty, native wins.
- Else, the canvas hijacks.

On hijack:

- **Copy** with entity selection → entity JSON to clipboard.
- **Cut** with entity selection → copy + delete.
- **Paste** smart-resolution order (`pasteFromClipboard()` in main):
  1. Our entity-shaped JSON → paste entities.
  2. Text that `looksLikeUrl()` matches → create a page (reuses existing URL paster).
  3. Image data → create a file entity.
  4. Plain text → create a sticky note.
  5. Otherwise → no-op.

Active page intercepts nothing — when page focus is held, the page receives
clipboard events natively. The renderer hook installs no listeners on the page.

## Duplicate cleanup

`Cmd+D` reuses `duplicatePageFromSource` / `duplicateEntity`. Side cleanup:

- Default `skipGrouping: true` across all three call sites in
  `register-canvas-entity-ipc.ts` and `register-right-details-panel-ipc.ts`.
- Remove the `mode: 'duplicate'` grouping codepath through `addPageFromSource`.

This is a behavior change for the existing context-menu and right-details-panel
duplicate buttons — they no longer auto-create row groups. Changelog entry
required.

## Build order

### Step A — registry + dispatch + tests (no callers)

Files added:
- `src/shared/bindings.ts` — types, the table, `dispatchKey()`, `normalizeElectronInput()`, `acceleratorString()`.
- `tests/unit/bindings.test.ts` — table uniqueness, dispatch for every binding × source view × modifier combination, scope and predicate filtering.

Files unchanged. App behavior unchanged. Pure addition. Zero risk.

### Step B — port main

Files added/changed:
- `src/main/runtime/binding-handlers.ts` — main-side handler map.
- `src/main/runtime/binding-dispatcher.ts` — `attachBindingDispatcher(wc, sourceView)`.
- `src/main/runtime/window-init.ts` — replace `watchModifierKeys(...)` calls with `attachBindingDispatcher(...)`.
- `src/main/runtime/page-factory.ts` — same swap.
- `src/main/ipc/register-canvas-ipc.ts` — `setTextEditingActive` import path stays.

Files deleted:
- `src/main/runtime/keyboard-shortcuts.ts`.

The `wireKeyboardShortcuts(...)` injection in `window-init.ts:132` is deleted;
`binding-handlers.ts` imports its dependencies directly.

Adjacent IPC additions:
- `selectAllEntities` — new IPC handler that selects every entity in the active tab. Used by `Cmd+A` when not typing.

Existing smoke tests should pass unchanged. Add:
- `tests/smoke/keyboard-shortcuts.test.ts` — happy path for every binding.

### Step C — delete renderer hooks

Files deleted:
- `src/renderer/shared/hooks/useAnnotateToggleShortcut.ts`.
- `src/renderer/shared/hooks/useAnnotationOverlayShortcuts.ts`.
- v/c/d/escape/delete branches removed from `useCanvasGlobalShortcuts.ts` (it becomes empty for keyboard; remove the hook).

Files added/changed:
- `src/renderer/canvas-bg/useCanvasClipboard.ts` — clipboard events only.
- `src/renderer/above-view/binding-handlers.ts` — `annotation-close-thread`, `annotation-clear-draft`.
- `src/renderer/shared/hooks/useRendererBindingHandlers.ts` — generic IPC listener.

Renderer App.tsx files updated to use the new hooks.

### Step D — port menu accelerators

Files changed:
- `src/main/runtime/app-menu.ts` — `accelerator: acceleratorFor('close-tab')` etc.
- `src/main/runtime/binding-accelerator.ts` — `acceleratorFor(id)` helper.

The menu cannot drift from the dispatcher; they read the same table.

### Step E — adjacent behavior changes

Lands as part of Step B/C or split into its own PR. Each is small but
user-visible:

- `select-all` action + Cmd+A wiring.
- `duplicate` action: reuse helpers, drop auto-grouping in all paths.
- Smart-paste resolution.
- P2 page-focus enforcement.

Each gets a changelog entry. Alt-drag-to-duplicate (pointer-router work) is
**adjacent** to this plan and should ship in the same release for narrative
coherence, but is tracked separately because it touches the router not the
keyboard.

## Tests

### Unit

- `bindings.test.ts` — the table is well-formed (every `Tool['kind']` has a binding; no two bindings share `(key, scope, modifiers)`).
- `bindings.test.ts` — `dispatchKey` returns the right id for every binding × source-view × context combination.
- `bindings.test.ts` — `acceleratorString` round-trips for every modifier combination.
- `bindings.test.ts` — `firesWhileTyping` and `firesFromPageFocus` defaults are respected.

### Smoke

- `keyboard-shortcuts.test.ts` — Cmd+Z, Cmd+G, v, c, m, paste-URL-creates-page, paste-text-creates-sticky, Cmd+A select-all, Cmd+D duplicate-no-grouping, Escape exits page focus, Escape exits tool, Cmd+1 from page focus resets viewport.

### Regression

- Existing tests for tool switching, undo/redo, grouping, paste — should all pass unchanged after the port. Only the wiring changed, not the actions.

## Out of scope

- Bindings settings pane (UI).
- User-override storage.
- Toolbar tooltips (separate PR; reads from the same registry).
- `?` cheatsheet overlay (later).
- Empty-canvas onboarding hints.
- Alt-drag-to-duplicate (pointer-router work; adjacent).
- Promoting `pendingAnnotation` / `openThreadId` to main runtime state (would
  let those bindings be `target: 'main'`; not worth the scope creep here).

## Migration notes

- `wireKeyboardShortcuts(...)` deleted — search for it; one call site in `window-init.ts`.
- `watchModifierKeys(...)` deleted — every call site swaps to `attachBindingDispatcher(wc, sourceView)`.
- `handleShortcuts: false` flag deleted — replaced by per-binding `scope`.
- `setTextEditingActive(...)` stays — it's the same flag, same IPC, same logic.
- `useAnnotateToggleShortcut` / `useAnnotationOverlayShortcuts` deleted; consumers updated.
- Tool-toggle behavior removed: pressing `c` while in comment tool no longer goes back to select. Changelog.
- Duplicate no longer auto-groups. Changelog.
- Page focus no longer captures Cmd+Z and friends. Changelog.

## Future work

- **Bindings pane in Settings.** Reads `listBindings()`. β1 (read-only) for v1
  of the pane; β2 (rebinding + `userData/bindings.json`) later.
- **Toolbar tooltips.** Reads `binding.label` + `acceleratorString(binding.key)`
  for each toolbar button. Will be the source of truth for discoverability.
- **`?` overlay.** Modal cheatsheet listing all bindings. One-day add once the
  registry exists.
- **Per-binding context labels.** "Group entities (when entities selected)" —
  the `when` predicate gets a human-readable explanation for the Bindings pane.
