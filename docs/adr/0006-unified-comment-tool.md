# ADR 0006 — Unified comment tool (subsumes region-select)

**Status:** Proposed
**Date:** 2026-05-09
**Amends:** [ADR 0005 — Unified `Tool` concept](./0005-unified-tool-concept.md). Removes `{ kind: 'region-select' }` from the `Tool` union; the comment tool now covers both element/point clicks and region drags.
**Related:** [ADR 0001 — Click-to-enter page focus](./0001-click-to-enter-frame-focus.md) (gate predicate); [ADR 0002 — Canvas-anchored overlay UI](./0002-canvas-anchored-overlay-ui.md) (where the composer renders).

## Context

ADR 0005 enshrined `comment` and `region-select` as two separate persistent tools. In practice they are the same user intent — *"I want to leave a comment somewhere"* — distinguished only by the gesture used to specify the target. The split has measurable costs:

- **Two toolbar buttons** for one concept. Users have to learn that "Region Select" produces a comment too.
- **Two cursor labels** ("commenting" vs "selecting region") that mean the same thing to a domain expert.
- **Two render paths** (`PendingCommentComposer` and `RegionSelectComposer` in `CommentsLayer.tsx`) that share ~80% of their behavior.
- **Two distinct gate states** (comment keeps gate open; region-select keeps gate closed), which means switching between the two tools changes who owns native pointer input — a load-bearing detail users shouldn't have to track.

The data layer already anticipates unification: `Annotation` is one type, `anchor` is a discriminated union (`'element' | 'canvas' | 'region'`), the composer / status / threading code is shared. The legacy `Annotation.kind: 'comment' | 'region_select'` field is redundant with `anchor.type`.

The grilling session that produced this ADR also surfaced a long-standing scroll-sync bug: element-anchored popovers freeze at their creation bbox and don't follow page scroll. Fixing that bug naturally falls out of the page-paints contract introduced by this unification, so we're scoping it in.

## Decision

**One persistent tool: `comment`.** The gesture decides the anchor:

- **Click on a page DOM element** → element anchor (`{ type: 'element'; pageId; selector; boundingBox }`).
- **Click anywhere else on the canvas** (empty canvas, on top of a non-page canvas item) → canvas-point anchor (`{ type: 'canvas'; canvasX; canvasY }`).
- **Drag a marquee** → region anchor (`{ type: 'region'; canvasRect }`).

Threshold-crossing (the same threshold the pointer router uses for `begin-entity-press` → `begin-entity-drag`) is the click-vs-drag arbiter. Once the threshold is crossed, the gesture commits to region regardless of where pointerdown landed — a marquee may start on a page DOM element and still produce a region anchor.

### Input path

While the comment tool is active, **the gate stays closed** (the page does not receive native pointer input). The aboveView overlay is the sole capture for pointerdown/move/up. This matches today's region-select behavior and unifies the two tools' input plumbing.

Element resolution on a click is no longer driven by the page's own pointerdown listener. Instead, on pointerup-without-drag, the overlay invokes a new preload IPC `inspectAtPoint(x, y)` analogous to the inspect tool's existing `getInspectableElementByNodeId()` (`src/preload/dom-inspection.ts:297-342`). The page returns the element selector, bbox, and inspect metadata. The existing `inspectionPayload()` helper is reused.

### Page-paints contract

While the comment tool is active, main broadcasts `comment-tool-pointer-state { canvasPoint, regionRect | null }` to every page on the canvas (throttled to ~60 Hz during drag). Each page's preload subscribes and paints:

- A single-element outline for the element under the pointer (when no marquee is active).
- Outlines for every element whose bbox intersects the marquee (during drag).

Outlines render in the page's own DOM, giving pixel-perfect alignment with page content and zero IPC cost per frame. Multi-page marquees fall out naturally — each page handles its own contents; the marquee rectangle itself is painted by the overlay in canvas coords.

The same broadcast carries entries for **currently-displayed annotation popovers** (element-anchored). Each page recomputes the live bbox of the requested selectors on every layout tick / page scroll and broadcasts back. The overlay uses the live bbox to position the popover. This gives element-anchored comments scroll-sync for free.

### Composer

One `PendingAnnotationComposer` component. Placement is a pure function of `anchor.type`:

- `element` → above-right of the (live) element bbox.
- `canvas` → adjacent to the click point.
- `region` → above-right of the region rect.

Esc cancels and discards. Clicking outside commits if non-empty, discards if empty (matches the canvas's edit-mode dismissal pattern in `CONTEXT.md` §Edit mode). Only one pending composer exists at a time; starting a new gesture commits or discards the prior one.

### Resting visuals

Asymmetric and matching today's behavior:

- **Region anchor** → dashed rose-400 rectangle, always visible (filtered only by `status`). Click opens the thread popover.
- **Element anchor** → no resting visual. Lives in the right panel; surfaces via the composer (pending) or thread popover (selected from panel).
- **Canvas-point anchor** → no resting visual. Same right-panel discovery as element anchors. Selecting from the panel reveals a temporary marker at the canvas point and opens the thread popover.

No new "comment pin" primitive is introduced. The unification is about the tool, not about adding persistent canvas chrome.

### `Annotation.kind` retired

`anchor.type` is the only discriminator. `Annotation.kind?: 'comment' | 'region_select'` is removed from the type and stops being read or written. Existing `.canvas` files keep their `kind` field harmlessly (it's optional and now ignored).

### Inspect tool stays separate

ADR 0005's `{ kind: 'inspect' }` remains. The mechanical overlap with comment hover is real (both paint element outlines), but the user-facing intent differs — inspect reads, comment writes — and the difference is obvious after one use. No code-level factoring is required by this ADR.

## Alternatives considered

**A. Keep two tools, just clean up the duplicated render paths.** Cosmetic; doesn't fix the dual-cursor-label confusion, doesn't fix the gate-state asymmetry, doesn't simplify the keyboard shortcut surface. Rejected.

**B. One tool with modifier-key sub-modes (e.g. hold Shift to drag a region).** Discoverability problem — the region gesture is hidden behind a modifier. Also conflates two concepts at the input layer that we already have a clean discriminator for (drag distance). Rejected.

**C. Keep gate open while comment tool is active; add a parallel overlay listener.** The gate predicate is binary (`pageFocus === null`) per ADR 0001. Punching a hole in it would invalidate a load-bearing invariant relied on by `useCanvasPointerRouter` and the focus reconciliation logic. Rejected.

**D. Page-side drag detection (page reports pointermove to main, who decides drag vs click).** Marquee would lag at native input rates. Worse than centralized capture. Rejected.

**E. Introduce a "comment pin" primitive at every annotation's resting position.** Canvas noise on busy boards; deviates from today's asymmetric model where regions have presence and element comments don't. Rejected for now; revisit if discoverability turns out to be a real user complaint.

**F. Make region anchors track page scroll (new `page-region` anchor type).** Significant new surface area: new anchor variant, multi-page edge cases (which page wins for a marquee that spans?), serializer changes, MCP/CLI flag changes. The user-visible payoff (a region pinned to scrolling page content) is real but pre-dates this unification. Deferred to a follow-up issue.

**G. Fold `inspect` into `comment` as a peek sub-mode.** Conflates "I want to read" with "I want to write"; modifier-gated peek is hard to discover; the cursor label "commenting" lies during a peek. Rejected.

## Consequences

**Replaces:**

- Tool union variant `{ kind: 'region-select' }` is removed.
- `Annotation.kind?: 'comment' | 'region_select'` is removed from the type and from the create-annotation MCP/CLI surfaces.
- `RegionSelectComposer` and `PendingCommentComposer` collapse into one `PendingAnnotationComposer`.
- The page-side `handleAnnotateClick` self-firing path in `src/preload/page-content.ts:142-156` is retired; the same selector/bbox extraction (`inspectionPayload()`) is exposed via a new `inspectAtPoint(x, y)` query handler.
- The keyboard shortcut for `c` already targets `comment`. Region-select had no dedicated shortcut. Nothing to remove.
- Toolbar button for "Region Select" (`SquareDashedMousePointer` icon at `toolbarSections.tsx:384-392`) is removed.

**Enables:**

- Single mental model for users — "comment tool, click or drag."
- Single render path for composers, single broadcast for hover/region preview.
- Element-anchored popovers track page scroll (new behavior; fixes a long-standing bug as a side effect).
- Multi-page marquee preview falls out naturally because each page paints its own contained-element outlines.

**Costs:**

- Real refactor. Touches `src/shared/tool.ts`, `src/shared/types.ts`, `src/preload/page-content.ts`, the entire `src/renderer/above-view/` annotation surface, the toolbar, the gate predicate, the CLI, MCP schemas, both copies of the Specular skill, and the smoke tests that toggled the two tools separately.
- Page input is suppressed while the comment tool is active. Designers iterating on `:hover` styles will need to drop the tool to see them — same as region-select today, but a regression for users who used the comment tool to inspect hover states.
- A small per-click IPC round-trip (`inspectAtPoint`) replaces the in-page direct path. Sub-2 ms in the common case; worth measuring before/after.

**Out of scope (follow-up issues):**

- Region anchors that track page scroll (alternative F above).
- "Stale anchor" UI treatment when an element selector no longer resolves — minimal indicator in the popover; full design is a follow-up.
- `specular delete <annotation_id> silently lies` — pre-existing bug noted in `resources/skills/specular/SKILL.md:210`.

## Migration

The next agent picks up here. Ordered to keep the working tree compilable at every step.

1. **Tool union & glossary already updated.** `src/shared/tool.ts` removes `region-select` from the union; `CONTEXT.md` is already updated to match. Verify and adjust call sites.
2. **Gate predicate.** `src/main/runtime/gate-predicate.ts` — comment-tool-active closes the gate (currently it stays open; region-select closes it). Update the predicate and its tests.
3. **Preload IPC.** Add `inspectAtPoint(x, y)` to `src/preload/page-content.ts` (or a dedicated preload module). Reuse `inspectionPayload()`. Add a subscription handler for `comment-tool-pointer-state` that paints element outlines into the page DOM — single hover element when no rect, intersecting elements when a rect is present.
4. **Live bbox broadcast.** Extend the `comment-tool-pointer-state` broadcast (or a sibling channel) to carry currently-displayed popover selectors; pages return live bbox on layout tick / scroll. Wire the result into `annotationMath.ts` so popover/composer positions use the live bbox.
5. **Retire `handleAnnotateClick`.** Stop the page's pointerdown listener from self-firing the annotate IPC. Either remove or repurpose as a no-op when the comment tool is active.
6. **Pointer router.** `src/renderer/above-view/useCanvasPointerRouter.ts` — when `activeTool.kind === 'comment'`, capture pointerdown in the overlay, track movement, branch on threshold:
   - Below threshold on pointerup → call `inspectAtPoint(x, y)`; if it returns an element, draft an element anchor; if not, draft a canvas-point anchor.
   - Above threshold → render marquee in canvas coords, draft a region anchor on pointerup.
7. **Composers.** Collapse `PendingCommentComposer` + `RegionSelectComposer` in `src/renderer/above-view/CommentsLayer.tsx` into a single `PendingAnnotationComposer`. Placement function reads `anchor.type`. Esc / click-outside / submit behaviors are unified.
8. **Annotation type.** `src/shared/types.ts` — remove `Annotation.kind` from the interface. Sweep the codebase for `kind === 'region_select'` / `kind === 'comment'` reads; replace with `anchor.type`-based checks.
9. **Toolbar.** `src/renderer/toolbar/toolbarSections.tsx:384-392` — delete the Region Select button.
10. **CLI.** `src/main/cli-commands.ts:289-306` — drop the `--kind` flag from `specular annotate`. The route ignores it; the help text drops it.
11. **MCP schemas.** `src/main/mcp-tool-schemas.ts:321-330` — remove the `kind` enum from `create_annotation`. Update the `anchor` description string to include the `region` example: `{ type: 'region', canvasRect: { x, y, width, height } }`.
12. **Skill files.** Update both `resources/skills/specular/SKILL.md` and `.claude/skills/specular/SKILL.md` (per `CLAUDE.md`'s skill-files note) — clarify that `specular annotate` always creates a comment, list the four anchor types (`element | canvas | page | region`), drop any reference to `region_select` as a separate concept.
13. **Smoke tests.** Tests that called `setTool({ kind: 'region-select' })` switch to `setTool({ kind: 'comment' })` plus a drag gesture. Add coverage for click-on-element, click-on-empty-canvas, drag-makes-region, and threshold-crossing-from-page.

## Tests

- **Unit:** click-vs-drag arbitration at the threshold; `Annotation.kind` no longer set on new annotations; `anchor.type === 'canvas'` is producible from the comment tool; popover position recomputes when a `live-bbox` IPC arrives.
- **Smoke:** activate comment tool → click empty canvas → canvas-point composer mounts at click; activate comment tool → click DOM element → element composer mounts at element bbox; activate comment tool → drag from inside a page across empty canvas → region composer mounts at marquee; activate comment tool → page input is suppressed (no `:hover` styles fire); element popover stays over its element after page scroll.
- **Manual / agent:** existing `.canvas` files containing `kind: 'region_select'` annotations open and render the dashed rectangle correctly; `specular annotations` lists them; `specular annotate "..."` from the CLI creates a viewport-anchored comment without `--kind`.
