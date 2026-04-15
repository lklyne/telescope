# Generic Canvas Architecture Plan

## Purpose

This plan defines a target architecture for evolving Web Canvas from a frame-centric workspace into a generic canvas application.

The immediate motivation is adding sticky notes cleanly, but the real goal is broader:

- support multiple canvas object types without custom side channels
- make selection, placement, movement, persistence, and rendering consistent
- reduce feature cost for future canvas-native objects like notes, shapes, connectors, and templates
- keep renderer surfaces thin and make state transitions easier to reason about
- architect for undo/redo so it can be added later without a second rewrite

## Current Problem

The app currently behaves like a canvas visually, but its core model is still centered on browser frames:

- workspace snapshots persist `pages`, `groups`, and `edges`, while annotations live separately
- canvas layout payloads are centered on `frames`, `selectedFrameIds`, and `pendingFramePlacement`
- selection and browser mode assume the most important selectable thing is a frame
- input flows are extracted into cleaner modules, but they still speak frame-specific actions
- `runtime-core.ts` (~3500 lines) is the central state hub — it mixes document mutations, UI state, layout calculations, and IPC dispatch, making it hard to isolate mutation boundaries

This architecture works well for browser-frame workflows, but every new non-frame object pushes against the same assumptions.

## Design Principles

- model the truth, not the current implementation shortcuts
- distinguish workspace document state from UI state
- prefer typed domain entities over generic metadata blobs
- keep `App.tsx` files thin and push logic into focused modules
- make renderer surfaces projections of state, not owners of cross-surface coordination
- favor pure selectors and command handlers over ad hoc imperative mutations
- do not introduce generic wrappers unless they simplify the domain model
- design mutation paths so undo/redo can wrap them later without restructuring

## Target Architecture

### 1. Workspace Document

Introduce a canonical workspace document that describes all persisted canvas content.

Suggested shape:

```ts
type WorkspaceDocument = {
  entities: Record<string, CanvasEntity>
  entityOrder: string[]           // z-order, front-to-back
  groups: WorkspaceGroup[]
  edges: WorkspaceEdge[]
  annotations: Annotation[]
}

type CanvasEntity = CanvasFrameEntity | CanvasStickyNoteEntity

// Common fields shared by all entity types
type CanvasEntityBase = {
  id: string
  kind: string
  canvasX: number
  canvasY: number
  width: number
  height: number
}
```

The unified entity map is important: it gives a single document to snapshot for future undo/redo, and avoids split-brain state when operations span entity types (e.g., multi-select a frame and a sticky note, then move both).

`entityOrder` uses a flat array for now. If layering or nesting becomes necessary (e.g., entities inside groups), this can migrate to a tree structure — but a flat array covers frames, sticky notes, and simple z-order controls without over-engineering.

Responsibilities:

- persist all canvas-native objects in one place
- provide a stable home for future entity types
- separate content from UI concerns like active tool or transient placement
- remain structurally cloneable so a future undo/redo system can snapshot or diff it

### 2. Workspace UI State

Keep transient interaction and view state in a separate store.

Suggested responsibilities:

- active tool
- canvas selection
- browser mode target
- hovered entities
- pending placement
- overlay visibility
- devtools panel state

This should replace frame-specific UI assumptions with canvas-oriented ones.

### 3. Commands

Route document and UI mutations through explicit command functions.

This does not mean a heavyweight command-pattern framework. It means: each mutation has a named function with a clear input type, and document mutations are separated from UI-only mutations. This is the seam where undo/redo can hook in later.

Document commands (mutate `WorkspaceDocument`, undo/redo candidates):

- `createEntity(kind, props)` → returns new entity
- `updateEntity(id, patch)` → partial update
- `moveEntities(ids, delta)` → reposition
- `deleteEntities(ids)` → remove
- `reorderEntities(ids, position)` → z-order change
- `commitPlacement(entityData)` → finalize pending entity into document

UI commands (mutate UI state only, not undoable):

- `setSelection(entityRefs)`
- `startPlacement(kind, preview)`
- `cancelPlacement()`
- `enterBrowserMode(frameId)`
- `exitBrowserMode()`

The distinction matters: when undo/redo is added, only document commands need to be wrapped. UI commands (selection, tool state, view mode) should not participate in the undo stack.

Benefits:

- clearer mutation boundaries
- easier testing
- clean seam for future undo/redo without restructuring
- autosave can trigger on document commands only

### 4. Selectors and Projections

Derive surface-specific view models from the document and UI state instead of hand-assembling payloads in multiple places.

Primary projections:

- canvas scene
- toolbar state
- left sidebar state
- browser tab state
- devtools panel state

The renderer should consume view models like `CanvasSceneViewModel`, not raw runtime internals.

### 5. Canvas Scene Model

Represent the canvas as typed scene objects instead of just frame overlays.

Suggested shape:

```ts
type CanvasSceneViewModel = {
  zoom: number
  pan: { x: number; y: number }
  canvasOrigin: { x: number; y: number }
  entities: CanvasSceneEntity[]
  selection: CanvasSelectionViewModel
  pendingPlacement: PendingPlacementViewModel | null
  viewMode: WorkspaceViewMode
}
```

Where `CanvasSceneEntity` can include:

- frame
- sticky note
- group hull
- connector

### 6. Browser Mode As Projection

Browser mode should remain frame-specific, but it should be a projection of the workspace document plus UI state, not a competing architecture.

Rules:

- only frames can open in browser mode
- non-frame selections should not need to pretend to be frames
- entering browser mode should pin a frame target without redefining the entire canvas model

## Refactor Strategy

This should be done incrementally, with small reviewable phases.

### Phase 0: Architectural Cut Line

Goal: agree on target types and boundaries before changing behavior.

Tasks:

- define `WorkspaceDocument`, `CanvasEntity`, `CanvasEntityBase`, and canvas selection types
- define the separation between document state and UI state
- define the document-command vs UI-command boundary (which mutations are undoable candidates)
- decide whether annotations move into the document immediately or stay as a transitional sibling collection
- decide whether groups/edges remain top-level or become entity-backed

Deliverable:

- approved type definitions and migration notes

### Phase 1: Generic Selection, Placement, and Scene Model

Goal: remove frame-only assumptions from selection, placement, and the renderer contract in one pass.

These three concerns are tightly coupled — generic selection types without a generic scene model would create an awkward translation layer in `buildCanvasLayoutData()` that converts generic selection back to `selectedFrameIds`. Doing them together avoids that intermediate state.

Tasks:

- replace `UiSelection` kinds (`single-frame`, `multi-frame`) with entity-typed selection (`single-entity`, `multi-entity` with `CanvasEntityRef`)
- replace `PendingFramePlacement` with generic `PendingPlacement { kind, width, height, ... }`
- replace `frames: CanvasFrameOverlay[]` in `LayoutUpdateData` with `entities: CanvasSceneEntity[]`
- replace `selectedFrameIds: string[]` with `selectedEntityIds: string[]` in the layout payload
- introduce `CanvasSceneViewModel` as the renderer-facing contract
- update `buildCanvasLayoutData()` to produce the new scene model
- update canvas renderer to consume `entities` instead of `frames`
- update keyboard and gesture flows to target `CanvasEntityRef` where appropriate
- keep frames as the only entity type exercising the new paths initially

IPC migration for this phase:

- replace frame-specific IPC channels (`placePendingFrame`, `setSelectedFrames`, `cancelPendingFramePlacement`) with generic equivalents (`placePendingEntity`, `setSelection`, `cancelPendingPlacement`)
- update `src/preload/canvas-bg.ts` bridge to expose the new channel names
- remove old frame-specific IPC channels once all callers are migrated

Deliverable:

- selection, placement, scene projection, and IPC all speaking in generic entity terms
- frames still the only entity type, so no user-visible behavior change

### Phase 2: Command Layer and Document Persistence

Goal: route mutations through explicit commands and persist non-frame entities.

Tasks:

- extract document mutations from `runtime-core.ts` into dedicated command functions (e.g., `createEntity`, `moveEntities`, `deleteEntities`)
- separate UI-only mutations (selection, tool state, view mode) from document mutations
- ensure document commands are pure functions of `(document, input) → document` where practical, so undo/redo can wrap them later
- extend snapshot persistence to include generic entities in `WorkspaceDocument` form
- add migration logic from old `WorkspacePageSnapshot[]` snapshots to the new entity-backed format
- preserve existing frame workflows during migration

This phase is also the right time to begin decomposing `runtime-core.ts`. Document commands, UI state management, layout calculations, and IPC dispatch should move into separate modules. The command layer provides the natural seam.

Deliverable:

- document-backed persistence for at least frames and sticky notes
- document mutations routed through named command functions
- `runtime-core.ts` reduced in scope

### Phase 3: Sticky Notes

Goal: implement the first non-frame canvas entity on the new foundation.

Tasks:

- add `CanvasStickyNoteEntity` to the entity union
- add toolbar action for note placement
- add note entity rendering and editing in the canvas renderer
- support create, move, select, delete, persist, and reload via existing command and scene paths

Deliverable:

- sticky notes shipped on the generic canvas model
- validates that the architecture actually makes new entity types cheap

### Phase 4: Follow-On Canvas Objects

Goal: prove the architecture scales.

Potential follow-ups:

- shapes
- arrows/connectors
- templates
- richer grouping
- z-order controls
- undo/redo (the command layer and document model from Phase 2 provide the seam)

## Key Decisions To Resolve Early

### Should annotations become document entities?

Recommendation:

- keep annotations persisted with the workspace, but do not force them into the generic canvas entity union in the first pass

Reason:

- annotations behave more like anchored discussion artifacts than normal canvas objects
- they should eventually share some scene projection paths, but folding them into the first entity migration adds risk

### Should groups be entities?

Recommendation:

- not initially

Reason:

- group semantics are already present and can stay top-level during the first migration
- forcing them into the entity model early would expand scope without helping sticky notes much

### Should frames remain special?

Recommendation:

- yes, but only in browser-specific flows

Reason:

- frames have browser runtime, navigation, and devtools concerns that other entities do not
- they should be one entity type with extra capabilities, not the base assumption for all canvas state

## Undo/Redo Readiness

This plan does not implement undo/redo, but it architects for it:

- **Unified document model**: all entities in one `Record` means one thing to snapshot or diff
- **Document vs UI command separation**: only document commands need undo wrapping; UI state (selection, tool mode) does not participate in the undo stack
- **Pure-ish command functions**: `(document, input) → document` shape makes it straightforward to capture before/after states or generate inverse operations
- **Structurally cloneable document**: no live references (WebContentsView, etc.) in the document model — those live on the runtime `Page` objects and are reconciled separately

When undo/redo is built, the likely approach is snapshot-based (clone document before each command) with structural sharing for efficiency. The command layer provides the interception point; the document model provides the thing to snapshot. No architectural changes should be needed — just a history stack wrapping the existing command functions.

## Risks

- partial migration could leave two competing state models alive too long
- browser mode may keep pulling generic selection back toward frame-only assumptions
- layout and interaction code may become temporarily more complex during the transition
- snapshot migration must preserve existing workspaces reliably
- IPC channel migration needs to be atomic per feature — partially migrated IPC is a source of subtle bugs

## Guardrails

- preserve current frame workflows throughout migration
- keep `App.tsx` files thin during the rewrite
- avoid compatibility abstractions that survive past their phase
- validate typecheck, build, and core manual flows after each structural phase

Core flows to protect:

- frame selection and deselection
- drag and drag-copy frames
- pending placement and cancellation
- browser mode entry, exit, and tab switching
- comment mode and draw mode flows
- persistence and workspace restore

## Success Criteria

We should consider this architecture successful when:

- adding a new canvas object type does not require inventing a new storage path
- selection, placement, and deletion are shared concepts across object types
- browser mode remains cleanly frame-specific without warping canvas state
- the canvas renderer consumes a scene model rather than frame-specific internals
- sticky notes land as a straightforward feature, not an architecture exception
- document mutations flow through named commands that could be wrapped for undo/redo without restructuring

## Recommended First Implementation Slice

If we want the smallest meaningful first step, it should be Phase 0 + Phase 1 together:

1. define `WorkspaceDocument`, `CanvasEntity`, `CanvasEntityBase`, and generic selection types
2. replace `PendingFramePlacement` with generic `PendingPlacement`
3. replace `LayoutUpdateData.frames` with `entities: CanvasSceneEntity[]` and `selectedEntityIds`
4. migrate IPC channels from frame-specific to generic names
5. update canvas renderer to consume the new scene model
6. keep frames as the only entity using the new paths at first

That gives us the structural win — generic types, generic scene model, generic IPC — before sticky notes or persistence migration, without forcing the entire product to migrate in one PR.
