# ADR 0006 — Unified comment tool (subsumes region-select)

**Status:** Accepted
**Implementation:** Mostly landed (commit `241de87` on `claude/unify-annotation-comments-EB2Uo`). The Tool union, gate predicate, toolbar, CLI (`specular annotate` no longer accepts `--kind`), MCP `create_annotation` schema, both Specular SKILL.md copies, and `Annotation.kind` retirement all ship with this PR. The renderer overlay does click-vs-drag arbitration: pointerup-without-drag fires a new `canvas-comment-click-at` IPC; main resolves the page via a new `pageAtWindowPoint` helper (`src/main/runtime/window-coords.ts`) and a new page-side `query-element-at-point` IPC, then routes to either `annotate-element-selected` (existing channel, element anchor) or `comment-canvas-point-committed` (new channel, canvas-point anchor). Drag past threshold reuses the existing `commitRegionSelect` flow. `PendingCommentComposer` + `RegionSelectComposer` collapse into a single `PendingAnnotationComposer`. Region annotations always paint their resting dashed-rose rectangle (status-filtered only). The page-side `handleAnnotateClick` self-firing path is retired. Gate predicate, tool-union, and should-focus-selected-page tests are updated; 472/472 unit tests pass.

**Deferred to a follow-up PR (originally scoped in §Decision but not in this commit):**
- The page-paints contract — main broadcasting `comment-tool-pointer-state` to every page, with each page painting an outline on the element under its local cursor (or per-element outlines inside the marquee). Today the user clicks "blind"; the click still resolves to the right element via `query-element-at-point`, but there's no in-page hover preview before the click. Needs a throttled main → all-pages broadcast, a page-side outline renderer, and cleanup hooks on tool change.
- The live-bbox round-trip for element-anchored popovers — pages reporting live bboxes for displayed selectors so popovers track page scroll. This was the long-standing scroll-sync bug the ADR scoped in as a side effect; it's still present after this PR. Element popovers continue to freeze at their creation bbox until this lands.
- Smoke-test coverage for the new comment-tool gestures (click-on-element, click-off-page, drag-makes-region, threshold-crossing-from-page). Existing smoke tests still pass; the new gestures need page-DOM fixtures we don't have helpers for yet.

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

- **Page-paints contract for hover preview** (originally scoped in §Decision; deferred from the implementation PR). Main broadcasts `comment-tool-pointer-state { canvasPoint, regionRect | null }` to every visible page; each page paints an outline on the element under its local cursor (or per-element outlines inside the marquee). Without it, comment-tool clicks resolve correctly but there's no in-page hover preview before the click. Needs a throttled main → all-pages broadcast, a page-side outline renderer, and cleanup hooks on tool change.
- **Live-bbox round-trip for element popovers / scroll-sync** (originally scoped in §Decision; deferred). Pages report live bboxes for displayed selectors on layout tick / scroll; the overlay uses them to position popovers. Until this lands, element-anchored popovers continue to freeze at their creation bbox when the page scrolls (the long-standing bug this ADR was meant to fix as a side effect).
- **Smoke coverage for the new comment gestures** — click-on-element, click-on-empty-canvas, drag-makes-region, threshold-crossing-from-page. Needs new page-DOM fixtures in `tests/smoke/`.
- Region anchors that track page scroll (alternative F above).
- "Stale anchor" UI treatment when an element selector no longer resolves — minimal indicator in the popover; full design is a follow-up.
- `specular delete <annotation_id> silently lies` — pre-existing bug noted in `resources/skills/specular/SKILL.md:210`.

## Migration

Status legend: ✅ landed in commit `241de87`; ⏳ deferred to a follow-up PR. Ordered to keep the working tree compilable at every step.

1. ✅ **Tool union & glossary already updated.** `src/shared/tool.ts` removes `region-select` from the union; `CONTEXT.md` is updated to match. Call sites swept (the renderer's region-drag branch is now keyed on `comment`).
2. ✅ **Gate predicate.** `src/main/runtime/gate-predicate.ts` — comment-tool-active now opens the gate (aboveView captures the gesture); inspect stays closed so the eyedropper receives mousemove. Tests updated to match.
3. ⚠️ **Preload IPC.** Element resolution landed via a new `query-element-at-point` page IPC, invoked from main on pointerup-without-drag through the new `canvas-comment-click-at` channel (`src/main/runtime/window-coords.ts` resolves the page; `src/main/runtime/page-queries.ts` carries the helper). The `comment-tool-pointer-state` page-paints broadcast — element outline previews painted in the page DOM — is **deferred**.
4. ⏳ **Live bbox broadcast.** Deferred. Element popovers still freeze at their creation bbox on page scroll (the long-standing bug this ADR was meant to fix as a side effect).
5. ✅ **Retire `handleAnnotateClick`.** The page-side mousedown / mousemove / click / mouseleave listeners are removed; `applyAnnotateState` is a no-op kept for shape compatibility.
6. ✅ **Pointer router.** The aboveView overlay's existing region-drag handler is now the unified comment-tool gesture: captures pointerdown when `activeTool.kind === 'comment'`, branches on a 4px threshold — below → `commitCommentClickAt(windowX, windowY)`, above → marquee → existing `commitRegionSelect` flow.
7. ✅ **Composers.** `PendingCommentComposer` + `RegionSelectComposer` collapse into a single `PendingAnnotationComposer` in `src/renderer/above-view/CommentsLayer.tsx`. `useAnnotationDraftState` adds a canvas-point composer-placement helper and an `onCommentCanvasPointCommitted` listener.
8. ✅ **Annotation type.** `Annotation.kind` and `AnnotationKind` removed from `src/shared/types.ts`; the lone reader in `src/main/shared/entity-ops.ts` swept to `anchor.type === 'region'`. `workspace-annotations.ts` no longer writes the field.
9. ✅ **Toolbar.** Region Select button + `SquareDashedMousePointer` import removed from `toolbarSections.tsx`.
10. ✅ **CLI.** `specular annotate` no longer reads or forwards `--kind`.
11. ✅ **MCP schemas.** `create_annotation` drops the `kind` enum; `anchor` description gains the region example.
12. ✅ **Skill files.** Both `resources/skills/specular/SKILL.md` and `.claude/skills/specular/SKILL.md` document the unified comment tool, the four anchor types, and the absence of `--kind`.
13. ⏳ **Smoke tests.** No existing tests called `setTool({ kind: 'region-select' })`, so nothing breaks; new gesture coverage (click-on-element, click-on-empty-canvas, drag-makes-region, threshold-crossing) is **deferred** — needs page-DOM fixtures we don't have helpers for. Existing 472 unit tests pass.

## Tests

- **Unit (landed):** `tests/unit/tool.test.ts` and `tests/unit/should-focus-selected-page.test.ts` swept clean of `region-select`; `tests/unit/gate-predicate.test.ts` pivots to the new contract (comment-tool opens the gate, inspect closes it). `tests/unit/workspace-annotations.test.ts` no longer fixtures a `kind` field. 472/472 pass.
- **Unit (deferred):** click-vs-drag arbitration at the threshold and popover position recomputing on a `live-bbox` IPC — both belong to the deferred page-paints / live-bbox infra.
- **Smoke (deferred):** activate comment tool → click empty canvas → canvas-point composer mounts at click; click DOM element → element composer mounts at element bbox; drag inside a page across empty canvas → region composer mounts at marquee; element popover stays over its element after page scroll. Needs page-DOM fixtures.
- **Manual / agent:** existing `.canvas` files containing `kind: 'region_select'` annotations open and render the dashed rectangle correctly (the field is now ignored, not written); `specular annotations` lists them; `specular annotate "..."` from the CLI creates a viewport-anchored comment without `--kind`.
