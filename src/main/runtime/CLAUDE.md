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
- **Gesture-begin ordering**: Any code path that triggers a layout pass while a renderer-side gesture is armed must enter the gesture's `interactionState` *first*. `requestLayout()` runs `reconcileFocus()`, and if `interactionState.kind` is still `'idle'` the reconciler picks the canvas-mode default (aboveView post-Phase-F) or — if the selection elects a single page — the page itself. The renderer gesture's `window.blur` listener treats the resulting aboveView blur as a cancel and kills the gesture before any movement.

  Two flavors of this gotcha exist; both fix the same way:

  1. *IPC handler that mutates selection* (drag-start). `commitSelection` synchronously runs `layoutAllViews()`. `canvas-drag-{page,entity}-start` calls `tryEnter` before `applyDragStartSelection` for this reason — see `register-canvas-drag-ipc.ts`.
  2. *Renderer dispatches generic mutation IPC during pointermove* (resize). The router has no preceding "begin" IPC by default, so the first bounds-update IPC's synchronous `requestLayout` reconciles focus while still idle. The fix is a dedicated begin/end pair: `canvas-resize-begin` calls `tryEnter({ kind: 'resizing-entity', target })` so the first move tick reconciles against `'resizing-entity'` (which expects aboveView focus). `runResize` in `useCanvasPointerRouter` dispatches `beginResize` before installing listeners and `endResize` in cleanup.

  When adding a new gesture: if the renderer mutates anything that requestLayouts before the gesture is committed, you need a begin IPC that calls `tryEnter` first. Pages are the canary — non-page entities don't populate `focusedPageId`, so the bug is invisible for them.
