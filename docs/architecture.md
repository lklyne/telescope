# Architecture

## Process model

Specular is an Electron app with a main process and multiple renderer processes.

```
┌─────────────────────────────────────────────────────────────┐
│ Main Process                                                 │
│                                                              │
│  Runtime (src/main/runtime/)                                │
│  ├─ Y.Doc (Yjs)        persistent, undoable state           │
│  ├─ Runtime arrays      ephemeral state, view refs          │
│  ├─ Selection           current selection + tool mode        │
│  └─ Interaction         drag, resize, pan state             │
│                                                              │
│  IPC handlers (src/main/ipc/)                               │
│  ├─ canvas, toolbar, sidebar, inspector, chrome, etc.       │
│                                                              │
│  HTTP API (src/main/routes/)                                │
│  ├─ /workspace, /frames, /entities, /selection, etc.        │
│                                                              │
│  Persistence                                                 │
│  └─ .canvas files on disk (autosave, 350ms debounce)        │
└──────────────────┬──────────────────────────────────────────┘
                   │ IPC channels
┌──────────────────┴──────────────────────────────────────────┐
│ Preload bridges (src/preload/)                              │
│  One per renderer — exposes typed API via contextBridge      │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────────────┐
│ Renderer processes (src/renderer/)                          │
│                                                              │
│  canvas-bg/        Below-pages plane: grid, camera, node    │
│                    rendering, edges, group outlines          │
│  above-view/       Above-pages plane: gesture capture,      │
│                    marquee, comments, annotations,          │
│                    floating UI (merged from former          │
│                    interaction-overlay/floating-ui/         │
│                    annotation-overlay bundles)               │
│  agent-layer/      Click-through overlay for agent           │
│                    presence cursors (paint-only). Loaded    │
│                    into a child BrowserWindow sibling of    │
│                    the main window, not a WCV — see         │
│                    docs/interaction-layer.md §3.1.          │
│  toolbar/          Zoom, tool modes, navigation             │
│  left-sidebar/     Workspace tree (canvases, frames)        │
│  right-details-panel/  Inspector (properties, settings)     │
│  devtools-resize-handle/  Devtools panel splitter           │
└─────────────────────────────────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────────────┐
│ External clients                                             │
│  CLI (planned)     Agent interaction via command line        │
│  HTTP API          Runtime queries and mutations             │
│  CDP proxy         Chrome DevTools Protocol (WebSocket)      │
└─────────────────────────────────────────────────────────────┘
```

## Data flow

**State flows down.** Main process owns all workspace state. Renderers receive
layout data via IPC broadcasts and re-render.

**Actions flow up.** User interactions in renderers call preload API methods,
which send IPC messages to main, which mutates state and broadcasts updates.

**External access.** The HTTP API and CLI provide the same mutation capabilities
as IPC, used by agents and tests.

## Two-layer state model

See `src/main/runtime/CLAUDE.md` for the full technical reference.

| Layer | What it holds | Where |
|-------|--------------|-------|
| Y.Doc (Yjs) | Entities, groups, edges, annotations, viewport, active tab | `workspace-doc.ts` |
| Runtime variables | Electron views, interaction mode, hover, drag, timers | `runtime-context.ts` |

**Forward sync:** mutations update runtime arrays -> `scheduleWorkspaceAutosave()`
-> diff-sync copies changes to Y.Doc.

**Reverse sync:** undo/redo reverts Y.Doc -> observer patches runtime arrays.

**Persistence:** Y.Doc snapshot -> serialize to JSON Canvas -> write .canvas file
(350ms debounce).

## Entity type system

All canvas content is a **node** (following the JSON Canvas spec):

| Node type | Internal kind | Description |
|-----------|--------------|-------------|
| `link` | `frame` | Live web page in an Electron webview |
| `text` | `text` | Text/markdown note |
| `file` | `file` | Reference to a local file (image, etc.) |
| `group` | `group` | Visual container for other nodes |

Plus **edges** (connections between nodes) and **annotations** (freehand
drawings overlaid on the canvas).

Each entity type has:
- `Persisted*Entity` — serializable fields (saved to .canvas)
- `CanvasScene*Entity` — full runtime state including computed bounds and refs

## Key module responsibilities

### src/main/runtime/

| Module | Owns |
|--------|------|
| `runtime-core.ts` | High-level state mutations (create, delete, select) |
| `runtime-context.ts` | All ephemeral state (views, zoom, pan, interaction) |
| `workspace-doc.ts` | Y.Doc lifecycle, snapshot creation, diff-sync engine |
| `workspace-model.ts` | Workspace data arrays (groups, edges, annotations, tabs) |
| `workspace-observers.ts` | Forward and reverse sync between runtime and Y.Doc |
| `workspace-persistence.ts` | Disk I/O (.canvas read/write) |
| `workspace-autosave.ts` | Autosave scheduling |
| `workspace-undo.ts` | UndoManager setup, undo/redo API |
| `workspace-tab-operations.ts` | Tab CRUD and switching |
| `selection-controller.ts` | Selection mutations |
| `page-factory.ts` | Frame (webview) creation and deletion |
| `layout-engine.ts` | View z-order and layout dispatch |
| `json-canvas-serializer.ts` | JSON Canvas <-> internal format conversion |

### src/main/ipc/

Routes inbound IPC messages to domain handlers. One registration file per
renderer surface (canvas, toolbar, sidebar, inspector, chrome, etc.).

### src/main/routes/

HTTP API endpoints grouped by domain: workspace, frames, entities, selection,
layout, camera, inspector, presence. Used by CLI, tests, and automation.

### src/renderer/canvas-bg/

The main spatial surface. Key components:
- `CanvasGridSurface` — SVG canvas with pan/zoom
- `SelectableEntityShell` — draggable/resizable node wrapper
- `FrameBorderLayer`, `TextBlockLayer`, `FileBlockLayer` — node rendering
- `EdgeLayer` — connector lines
- `GroupBoundsLayer` — group outlines
- `AgentCursorLayer` — agent presence cursors (rendered in the `agent-layer` child window, not in canvas-bg itself)

### src/shared/

Pure types and utilities only. Key files:
- `types.ts` — core entity types
- `json-canvas-types.ts` — JSON Canvas spec types with extensions
- `constants.ts` — grid size, toolbar height, port numbers
- `device-catalog.ts` — viewport presets (iPhone, iPad, Desktop, etc.)

## Undo/redo

One global undo stack spans all tabs. Tab switches are tracked transactions,
so undo after a tab switch navigates back. Drags are batched into single undo
steps. Viewport zoom/pan is not undoable.

## Interaction layer

See `docs/interaction-layer.md` for the full spec. When adding a gesture,
overlay, focus handoff, or drag-and-drop target, read it first — the
following commitments are load-bearing and costly to unwind later.

**Three WCVs in the canvas region.** `bgView` below pages, 0–N live page
views in the middle, one merged `aboveView` on top. Every canvas-level
gesture visual and every input capture happens in `aboveView`. Adding a
new transparent overlay WCV is almost always wrong — compose into
`aboveView` as a React layer instead.

**One sibling window outside the WCV stack.** `cursorOverlayWindow` is a
child `BrowserWindow` of `win`, hosting the `agent-layer` renderer. It
exists because WCVs can't be made click-through in Electron 40
(`setIgnoreMouseEvents` is BrowserWindow-only — see interaction-layer
§3.1, §7.3). It is mouse-inert, paint-only, and the single sanctioned
exception to "canvas-region rendering lives in one of the three planes."
Don't add another — if you need to paint above pages, compose into
`aboveView`.

**One input authority.** The `InteractionController` (main) is the single
arbiter for canvas gestures via `tryEnter` / `update` / `commit` / `cancel`
with tokens. External interrupters (undo observer, tab switch, window
blur) use `cancelActive(reason)` — these four sites are the only blessed
callers. Any new gesture must route through the controller; coordinating
gestures via flags or direct state writes is the anti-pattern this exists
to eliminate.

**State changes happen inside `layoutAllViews()`.** View stack, visibility,
and bounds mutations are forbidden during event dispatch — subsystems call
`markDirty('<surface>')` and return. Focus is expressed as intent
(`setPendingFocus`) and applied by `FocusReconciler` post-layout; never
call `webContents.focus()` directly. If you feel the urge to
`setTimeout(0)`, you're mutating view state during dispatch — mark dirty
instead.

**Renderer gesture code uses `src/renderer/shared/useDragGesture.ts`.**
Pointer events only; no `mouse*` handlers in new code. The hook owns
pointer capture, blur/escape cancel, and threshold-before-begin.

**Canvas coord math lives in `src/shared/coords.ts`** — single source for
both main and renderer so hit-tests don't drift.

Load-bearing invariants (I1–I10) are listed in `interaction-layer.md` §6.
ESLint rules `no-direct-view-mutation` and `no-mouse-events` enforce I1
and I8 (currently as warnings — legacy sites pending cleanup).

## View modes

Browser mode and Canvas mode share the same .canvas data:
- **Canvas mode** — freeform spatial layout; all nodes visible
- **Browser mode** — traditional tab-based navigation between link nodes

The view mode is UI-level state, not a data distinction.
