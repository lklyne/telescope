# Runtime State Architecture

## Two-layer state model

| Layer | What | Where |
|---|---|---|
| **Y.Doc** | Workspace data (entities, groups, edges, annotations, viewport, active tab) | `workspace-doc.ts` |
| **Module variables** | Electron views, interaction mode, hover, drag, layout cache, timers, pages | `runtime-context.ts` |

Pages are hybrid: serializable fields (position, URL, preset) mirror to Y.Doc, but WebContentsView refs stay in `runtime-context.ts`.

## Global undo stack

One undo stack spans all tabs. Tab switches are tracked transactions in Y.Doc, so pressing undo after switching tabs navigates back to the previous tab and restores its state.

## Diff-sync approach

Y.Doc is NOT the sole source of truth. Runtime arrays are mutated by existing code, then a diff-sync copies changes to Y.Doc:

```
mutation → runtime arrays → scheduleWorkspaceAutosave() → requestDocSync() → microtask → syncRuntimeToDoc()
```

`syncRuntimeToDoc()` compares runtime state against Y.Doc and writes only the differences. This avoids modifying every mutation site — the sync is automatic via the existing `scheduleWorkspaceAutosave()` hook.

## Undo/redo flow

Forward: mutations update arrays → diff-sync writes to Y.Doc → UndoManager captures the Y.Doc diff.

Undo (same tab): UndoManager reverts Y.Doc → `afterTransaction` observer fires → `syncDocToRuntime()` patches runtime arrays → deferred `layoutAllViews()`.

Undo (cross-tab): UndoManager reverts Y.Doc including `activeTabId` → observer detects tab change → `destroyActivePages()` → full rebuild from Y.Doc → deferred `layoutAllViews()`.

Side effects after undo run synchronously inside `afterTransaction` — the 16ms `requestLayout()` debounce is the only deferral needed. See Gotchas → "Undo observer side effects".

## Tab switch as tracked transaction

Tab switches write to Y.Doc via `transitionToTab()`:
1. `applyTabState()` rebuilds runtime arrays (within `withSuppressedDocSync`)
2. `transitionToTab()` writes the new tab's state to Y.Doc as a tracked `'user'` transaction
3. UndoManager captures the diff between old and new tab state
4. `markUndoBoundary()` ensures the tab switch is a discrete undo step

## Drag batching

Drags produce many small position updates. Without batching, each would be a separate undo step.

- `initializeDrag()` calls `beginBatch()` — suppresses doc sync during drag
- `applyDragDelta()` updates positions but sync is held
- `finalizeDrag()` calls `endBatch()` — one sync for the entire drag, then `markUndoBoundary()`

## UndoManager scope

Tracked (undoable): entities, groups, edges, annotations, entity order, page positions, workspace metadata (active tab).

Not tracked: viewport zoom/pan (in a separate Y.Map excluded from UndoManager scope).

## Key files

- `workspace-doc.ts` — Y.Doc lifecycle, workspace accessors, snapshot hydration, diff-sync engine
- `workspace-undo.ts` — UndoManager setup, undo/redo API, selection metadata on undo steps
- `workspace-observers.ts` — forward sync (runtime→Y.Doc), undo sync (Y.Doc→runtime), cross-tab undo detection, batch control
- `workspace-model.ts` — owns workspace data arrays (edges, groups, annotations, tabs)
- `runtime-context.ts` — ephemeral state only (views, interaction, layout cache, timers, pages)

## Gotchas

- **Suppress flag**: `withSuppressedDocSync()` prevents sync loops during restore and undo. If you call `scheduleWorkspaceAutosave()` from inside an undo observer without suppressing, you create a feedback loop where each undo generates a new undo entry.
- **Tab switch suppress**: `applyTabState()` is called within `withSuppressedDocSync` during tab switches to prevent the normal forward-sync from running. The Y.Doc write happens separately in `transitionToTab()`.
- **Focus on page delete**: `removePageAtIndex()` transfers focus to `aboveView` after destroying page webContents, so keyboard shortcuts (including undo) keep working. (Pre-Phase-F this targeted bgView; aboveView now owns canvas-mode keyboard input.)
- **Undo observer side effects**: The undo observer runs `cancelActiveInteraction`, `sendInteractiveState`, `markAllDirty`, and `requestLayout` synchronously inside Y.Doc's `afterTransaction`. The 16ms debounce inside `requestLayout()` provides enough deferral to avoid stepping on Electron's event routing — no explicit `setTimeout(0)` needed since the controller is reentrancy-safe (Phase 5d-v2 E1).
- **Startup undo**: `clearUndoHistory()` is called after `initializeDocObservers()` to wipe any phantom entries from the initial doc sync.
- **Gesture-begin ordering**: An IPC handler that both begins a gesture and mutates selection (e.g. `canvas-drag-{frame,entity}-start`) must call `tryEnter` *before* the selection mutation. `commitSelection` synchronously runs `layoutAllViews()` → `reconcileFocus()`; if `interactionState.kind` is still `'idle'`, the reconciler picks the idle canvas-mode default (aboveView post-Phase-F) or — if the selection elects a single frame — the page itself, neither of which is the gesture-active aboveView state. The renderer drag's `window.blur` listener treats the swap as a cancel and kills the drag before any movement. Always `tryEnter` first so the reconciler routes to aboveView for the gesture mode.
