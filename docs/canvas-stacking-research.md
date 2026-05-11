# Canvas Stacking and the Sidebar Tree — Research

Status: **Resolved by [ADR 0006 — Canvas stack order and the Notes/Pages sidebar](./adr/0006-canvas-stack-order.md).** Kept in-tree as the historical research note that seeded the ADR.
Origin branch: `claude/research-canvas-stacking-NQ7Lh`. Decisions locked during the grilling session on `claude/plan-canvas-stacking-s1th2`.

## Resolution summary (read ADR 0006 for the full picture)

- §3's open question: **Option C** (flat `entityOrder` + group contiguity invariant), with the group's own id pinned to the front of its run, recursive across nested groups.
- §6.1 (page WCV stacking): in scope and resolved — re-`addChildView` in `entityOrder` order on every mutation + load + undo.
- §6.2 (hit-test): no design change; the existing `collectBodyTargets` already iterates `entityOrder`. Added smoke tests for the user-mutable case.
- §6.3 (what belongs in `entityOrder`): the 6 entity kinds **plus edges** (FigJam-parity stack mutations). Annotations and anchors stay out.
- Net-new decisions captured in the ADR: the user-facing term **Stack order**; **Notes** / **Pages** sidebar sections that surface the cross-surface architectural limitation directly; **split representation** for mixed groups (two linked sidebar rows for one entity); rules for new-entity placement, multi-selection block moves, and eager group-contiguity migration.

The rest of this document remains as originally written — it captures the codebase evidence and reasoning that led to the ADR.

---

## 1. Why this exists

The left sidebar's canvas tree currently lists items by their position on the
canvas — top-to-bottom, then left-to-right, with a kind tiebreaker. That works
as an "index of things on the page" but doesn't answer the question users
increasingly ask of it: **what is on top of what?**

We want the Elements list to read as a layered stack — front-to-back —
matching the spatial reality of the canvas. Two design decisions are already
locked in:

- **Sort:** z-order replaces the position sort. Topmost entity at the top of
  the list.
- **Groups:** nested, with the group occupying its own z-slot. Expanding the
  group reveals indented children. Reordering the group moves the whole group
  in z.

This document explores how to wire that to the data model we already have, and
flags the one design question worth resolving before implementation: how
groups co-exist with a flat z-order array.

## 2. What the code already knows

### 2.1 Z-order is already a thing

`entityOrder` exists today as a Y.Doc array on the workspace and is documented
as "Ordered entity IDs for z-ordering (front-to-back)":

- `src/shared/types.ts:1091-1092` — typed on the workspace snapshot.
- `src/main/runtime/workspace-doc.ts:20,47` — `DOC_ARRAY_ENTITY_ORDER` Y.Array.
- `src/main/runtime/json-canvas-serializer.ts:49,258-283` — round-trips through
  the JSON Canvas file format. Node array order in `.canvas` ⇄ `entityOrder`.

So z-order is **not** implicit array order or an invented concept. It is an
explicit, persisted, serialised array. What it lacks is a user-facing mutation
API and any UI that reflects it.

### 2.2 The sidebar sorts by space, not by stack

`src/main/runtime/sidebar-builder.ts:53-60`:

```ts
function compareSidebarPositions(
  a: { y: number; x: number; priority: number },
  b: { y: number; x: number; priority: number },
): number {
  if (a.y !== b.y) return a.y - b.y
  if (a.x !== b.x) return a.x - b.x
  return a.priority - b.priority
}
```

The `priority` field is a kind tiebreaker (text=0, page=1, group=2), not a
z-position. The sort key is built per kind in lines 68–200 from each entity's
`canvasX` / `canvasY`.

### 2.3 The tree already supports nesting

`src/renderer/left-sidebar/SidebarCanvasTree.tsx:140-242` already wraps groups
in `Collapsible.Root` with chevron toggles, and `Collapsible.Panel` renders
`group.children` recursively. The tree shape is in place. What's missing:

- Drag-to-reorder. Today the only context-menu actions are Rename and Ungroup.
- A z-derived sort. Children are currently passed in position-sorted order from
  the builder.

### 2.4 Groups don't carry child order

`CanvasSceneGroupEntity.entityIds` (`src/shared/types.ts:196-213`) is an
unordered membership array. Group child order today is reconstructed by the
sidebar from each child's `canvasX`/`canvasY`.

### 2.5 No bring-to-front / send-to-back exists

A grep across `src/main/runtime/`, `src/main/routes/`, and the renderer canvas
turns up zero references to `bringToFront`, `sendToBack`, `raise`, `lower`, or
any user-facing stacking action. The `entityOrder` array is written only by
the JSON Canvas deserialiser. Nothing mutates it after load.

### 2.6 Docs are silent on entity stacking

- `docs/architecture.md:123-125` mentions z-order only as `layout-engine.ts —
  View z-order and layout dispatch` (overlay layering).
- `docs/interaction-layer.md` discusses z-order in two places: hit-test
  priority (resize-handle > chrome > anchor > body > background) and a gotcha
  about WebContentsView's `addChildView(view, index)` — both about *view*
  stacking, not entity stacking.

There is no documented contract for canvas-entity z-order. This research and
its successor ADR will be the first.

## 3. The one open design question

`entityOrder` is currently a flat list of every entity id, including groups.
The user-facing model we agreed on says a group occupies "one z-slot". Three
ways to reconcile those:

### Option A — Flat order, visual nesting only

Keep `entityOrder` flat as it is today. Group members keep their own slots in
`entityOrder`. The sidebar nests them under the group visually, but a child's
z-position is independent of its parent group.

- Pro: zero schema or invariant changes.
- Pro: matches JSON Canvas v1.0 — groups there are also flat nodes with id
  references.
- Con: contradicts the user's mental model. A group's children could be
  scattered across the stack with other entities sandwiched between them.
- Con: "move group up" has no obvious meaning if the group's children aren't
  contiguous.

### Option B — Hierarchical order

Move group children out of `entityOrder` entirely. Give each group its own
ordered children list. `entityOrder` contains only top-level entities and
groups.

- Pro: cleanest match to the mental model.
- Con: schema change to both the runtime types and the persisted format.
- Con: diverges from JSON Canvas semantics. Round-tripping a `.canvas` file
  through another tool and back could lose nesting order.
- Con: more invariants to maintain when groups are created, dissolved, or
  re-parented.

### Option C — Flat order with a contiguity invariant (recommended)

Keep `entityOrder` flat. Add the invariant: **all children of a group occupy a
contiguous run inside `entityOrder`.** The "z-slot of the group" is the
position of its frontmost member. The sidebar collapses that run into one row
when the group is collapsed; reordering the group in the sidebar moves the
whole run.

- Pro: no schema change. JSON Canvas round-trip is preserved exactly.
- Pro: matches the user's mental model — the group reads as one slot.
- Pro: implementation is local to `entityOrder` mutations; the data model is
  unchanged.
- Con: the invariant has to be enforced in every path that mutates
  `entityOrder` (add to group, remove from group, reorder, deserialise).
- Con: a one-time migration is needed for existing workspaces where groups
  may already be discontiguous (sort each group's members to a contiguous run
  at the group's frontmost position; deterministic, no data lost).

**Recommendation: Option C.** It honours the agreed mental model without
breaking the persisted format and without diverging from JSON Canvas.

## 4. Implementation sketch

This isn't a plan — it's a sanity check that the design lands somewhere
buildable. Each piece is a separate change.

### 4.1 New runtime mutations

In a new `src/main/runtime/entity-order-state.ts`, expose:

- `bringToFront(entityId)`
- `sendToBack(entityId)`
- `moveForward(entityId)` / `moveBackward(entityId)` (one slot)
- `moveBefore(entityId, anchorId)` (drag-target form)

Each operates on the `entityOrder` Y.Array inside a single Y transaction.
Reverse-sync from Y.Doc → runtime is already wired.

### 4.2 Group contiguity invariant

A small helper `enforceGroupContiguity(entityOrder, groups)` runs at the end
of every mutation that touches order or group membership. Strategy: for each
group, collect its members' current indices, choose the frontmost as the
anchor, and shift the rest to be contiguous behind it.

Cheaper alternative: scope the helper to the affected group only, and validate
the invariant in tests rather than recomputing globally.

### 4.3 Sidebar builder

`compareSidebarPositions` in `sidebar-builder.ts` becomes an `entityOrder`
index lookup. Top-level items render in `entityOrder` order (frontmost first
in the list). Group children render in their own contiguous-run order, also
front-to-back.

The position-based comparator can be deleted along with the per-kind
`priority` field.

### 4.4 Sidebar UI

Add drag-to-reorder to `SidebarCanvasTree`. Drag handle on each row; drop
zones between rows. Drop targets respect the tree shape: dropping inside a
group's children section adds to that group; dropping at top level removes
from any group. Outside scope of this doc, but worth noting that "drag into
group" is the natural reparenting affordance.

Context-menu additions: Bring to Front, Send to Back, Bring Forward, Send
Backward. These map to the mutations in §4.1.

### 4.5 HTTP API surface

Expose the same four mutations under `src/main/routes/` so agents and
scripts can reorder. This also gives smoke tests a way to drive the new
behaviour.

## 5. Migration

Workspaces saved before the contiguity invariant existed may have groups
whose members are interleaved with other entities. On load:

1. Read `entityOrder` as today.
2. Run `enforceGroupContiguity` once.
3. Mark the workspace dirty so the autosave debounce flushes the normalised
   order.

The migration is deterministic and produces no data loss — only a reordering.

## 6. Risks and out-of-scope

- **Page (WebContentsView) stacking** is governed by `LAYER_STACK` in
  `src/main/runtime/layer-stack.ts` and Electron's `addChildView(view, index)`.
  Entity z-order needs to be reflected there for pages so that the on-canvas
  rendering matches the sidebar. That mapping is mechanical but not free —
  worth a separate small investigation when implementing.
- **Hit-testing** today uses position + chrome priority, not entity z-order.
  Once z-order becomes user-mutable, the canvas hit-test should respect it
  (topmost entity wins overlapping clicks). This is a separate concern from
  the sidebar but will be the next user-visible question.
- **Drawings, edges, anchors** — confirm these belong in `entityOrder` (they
  appear to today via the JSON Canvas serialiser). If any entity kind lives
  outside `entityOrder`, decide whether the sidebar should show it at all
  under the new model.
- **Undo / redo** comes for free via the Y.Doc transaction wrapping each
  mutation. No special handling required.
- This doc deliberately does not design the drag-and-drop interaction in
  detail. That belongs in an interaction-layer note once the data model is
  settled.

## 7. Next steps

1. Land this doc.
2. If the recommendation in §3 is accepted, promote it to an ADR under
   `docs/adr/` (next number in sequence) and link it from `CONTEXT.md` under
   the entry for groups / entity order.
3. Implement §4 in small slices: mutations + invariant first (with unit
   tests), then the sidebar sort change, then drag-to-reorder.
4. Open a follow-up note on entity z-order ↔ WebContentsView stacking and
   hit-test (§6).
