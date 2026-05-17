# Page bounds and snap/alignment alignment

**Status:** Exploration — no code changes yet.
**Trigger:** PR #97 (c2ec984) added alignment guides that exposed inconsistent snapping between page entities and other canvas items.
**Question:** What should be the authoritative rect for snap, grid alignment, and alignment guides — the page body, body+device-frame, or body+chrome+device-frame?

---

## 1. Current system map

### 1a. Stored page data

`page.canvasX` / `page.canvasY` = the **top-left corner of the chrome band**, not the page body.

`page.chromeHeight` is initialised to `CHROME_HEADER_HEIGHT` (44 px in `src/main/runtime/runtime-constants.ts:8`) at creation time (`src/main/runtime/page-factory.ts:113`). It is a mutable field on the `Page` interface (`src/main/runtime/runtime-entities.ts:22`) but nothing currently changes it after creation — it is effectively a constant.

`page.canvasX/Y` and the content `width/height` are serialised verbatim into `.canvas` files as `x/y/width/height` on the JSON Canvas `link` node (`src/main/runtime/json-canvas-serializer.ts:120-123`). The chrome height is **not** stored in `.canvas` — it is re-derived from the constant at load time.

### 1b. Canvas rect helpers (no chrome)

`pageCanvasBounds(page)` → `{ x: page.canvasX, y: page.canvasY, width, height }` where width/height is content-only (`src/main/runtime/runtime-geometry.ts:68-77`).

`pageOuterCanvasBounds(page)` → expands `pageCanvasBounds` outward by shell insets if a device frame is on (`src/main/runtime/runtime-geometry.ts:91-104`). When no shell is active, inner = outer = `pageCanvasBounds`.

Neither function subtracts chrome; `canvasY` is already above the page body.

### 1c. Screen bounds (with chrome)

`computeScreenBoundsForPage` returns four sub-rects (`src/main/runtime/runtime-geometry.ts:195-284`):

| Sub-rect | What it covers |
|---|---|
| `chrome` | The favicon/title row (y = `page.canvasY * zoom + pan.y + toolbarHeight`) |
| `page` | The webview (y = chrome.y + chromeH + gap) |
| `frame` | The webview + 1px card border |
| `shell` | The device bezel outer bounds (body + shell insets) |

The `page` sub-rect's Y is: `canvasY * zoom + pan + toolbarHeight + chromeH + gap`.

`backgroundPageOverlays()` broadcasts screen coords to canvas-bg:
- When shell is on: `screenX/Y/Width/Height` = `bounds.shell.*`
- When shell is off: `screenX/Y/Width/Height` = `bounds.page.*`
- `contentScreenX/Y/Width/Height` = always `bounds.page.*`

(`src/main/runtime/canvas-layout-data.ts:67-87`)

### 1d. Chrome rendering (floating above body)

`EntityChrome.Root` uses `transform: translateY(-100%)` to position itself above the entity's top edge (`src/renderer/shared/EntityChrome.tsx:74-78`).

`CanvasItemChrome.Root` (`src/renderer/above-view/CanvasItemChrome.tsx`) feeds `screenY = headerRect.y + headerRect.height` as the pseudo-bottom-edge to `EntityChrome.Root`, so the chrome paints at the top of the entity rect and translates upward. The net visual result: chrome floats above the body.

`useAnchoredPosition` (`src/renderer/above-view/useAnchoredPosition.ts`) receives `screenX/Y/Width/Height` from the layout broadcast — which today encodes the **page-body rect** (see §1c above). To reconstruct the chrome slot it synthetically extends upward by `CHROME_HEADER_HEIGHT` (36 px, from `src/shared/entity-chrome-slots.ts:20`):

```
entityRectFor() at line 107-120:
  headerExtension = hasHeader ? CHROME_HEADER_HEIGHT : 0
  return { x: screenX, y: screenY - headerExtension, width: screenWidth, height: screenHeight + headerExtension }
```

`entityChromeSlots()` then carves the top `CHROME_HEADER_HEIGHT` pixels of that synthetic rect as the `header` slot.

### 1e. Snap / alignment rect (the bug site)

`currentSnapSnapshotEntities()` builds the rect the snap engine sees for each entity:

```typescript
// src/main/runtime/document-commands.ts:188-200
pages.map((page) => {
  const bounds = pageOuterCanvasBounds(page)   // ← body + shell insets, NO chrome
  return {
    canvasX: bounds.x,
    canvasY: bounds.y,    // same as page.canvasY (chrome-top edge)
    width: bounds.width,
    height: bounds.height, // content height only
  }
})
```

`pageOuterCanvasBounds` returns `{ x: page.canvasX, y: page.canvasY, width, height }` — where `page.canvasY` is the **chrome top edge**, and `height` is the **content height only** (no chrome).

So the snap rect for a page is: `top = chrome top edge`, `bottom = body bottom edge`.

This is incoherent. The top of the snap rect is the chrome band's top, but the bottom is the page body's bottom. Guides fire against the chrome-top for top-edge alignment and against the body-bottom for bottom-edge alignment.

Grid snap (`snapToGrid` applied to `entity.canvasX/canvasY` in `applyDragDelta`, `src/main/runtime/document-commands.ts:356-357`) also operates on `canvasY`, which is the chrome-top. So grid-snapping works but snaps the chrome top, not the body top.

### 1f. Selectable bounds (chrome included in height)

`pageSelectableBounds()` expands `pageOuterCanvasBounds` height by `page.chromeHeight` (`src/main/workspace-entities.ts:56-64`). This is used for hit-testing (marquee select, region select, `entityBoundsById`), placement collision, and group-bounds computation via `groupBoundsForEntityIds` (which calls `entityBoundsById` which calls `pageSelectableBounds`).

So group bounds DO include chrome in their height when a page is a member.

### 1g. Placement collision

`occupiedRegions()` (`src/main/workspace-placement.ts:48-78`) takes `pageOuterCanvasBounds` (chrome-top, content-height) then calls `extendUpwardForChrome(bounds, page.chromeHeight)` to claim the chrome band above. The net occupied rect for a page is: top = chrome-top − chromeHeight (redundant since canvasY is already the chrome top), bottom = body-bottom. There's actually a double-shift here: `pageOuterCanvasBounds` starts at `canvasY` (chrome top), and `extendUpwardForChrome` subtracts `chromeHeight` again, producing a rect that starts 44 px above the chrome top. This was likely intended as a guard against new items landing under another item's chrome.

### 1h. Device frame (shell)

Shell insets are computed by `pageShellInsets()` (`src/main/runtime/runtime-geometry.ts:80-89`) from the device catalog. `pageOuterCanvasBounds` grows the rect by these insets, so the snap rect already includes the shell. However, the shell's screen-space rect (passed to `PageBorderLayer` and `DeviceShellLayer`) is derived from `bounds.shell.*` returned by `computeScreenBoundsForPage`, which pads around the page body — it does not start at the chrome top.

Consequence: the device frame straddles two coordinate systems. Its top edge in screen space aligns with the page body top (not the chrome top), but in snap-candidate space it's part of `pageOuterCanvasBounds`, whose `y` is the chrome top. Alignment guides against the frame's visual top will fire at the wrong position.

### 1i. CHROME_HEADER_HEIGHT constant mismatch

There are two separate constants with the same name and different values:

| File | Value | Used by |
|---|---|---|
| `src/main/runtime/runtime-constants.ts:8` | **44 px** | `page-factory.ts`, `workspace-placement.ts`, `register-canvas-entity-ipc.ts` |
| `src/shared/entity-chrome-slots.ts:20` | **36 px** | `useAnchoredPosition.ts` (renderer chrome position) |

The renderer chrome strip is rendered at 36 px; the snap candidate assumes 44 px. The two systems are already slightly misaligned by 8 px even when ignoring the body-vs-chrome origin question.

---

## 2. What the snap engine actually sees today (the smoking gun)

When you drag a page, `currentSnapSnapshotEntities()` produces:

```
{ canvasX: page.canvasX,  canvasY: page.canvasY,
  width: contentWidth,    height: contentHeight }
```

Where:
- `canvasY` = chrome top (e.g. y=100)
- `height` = body height only (e.g. 812 for iPhone)
- So `bottom` in snap space = 100 + 812 = 912

The visual body sits at `canvasY + chromeHeight` = 100 + 44 = 144.
The visual body bottom = 144 + 812 = 956.

If another entity sits at y=144 (body top), the alignment guide fires at `top = 100` — the chrome top — but the guide line is drawn at the chrome top in canvas space, which is 44 px above the visual body top. The guide line appears to float above the page.

If you're aligning bottom edges: the snap candidate bottom (912) is 44 px above the visual body bottom (956). A guide matching at 912 fires before the bodies are actually bottom-aligned.

For a page without a device frame, the snap rect is:
- `top = chrome top` (above the visible content)
- `bottom = body bottom` (matches visual)
- `left/right = body left/right` (matches visual)

The top edge is wrong; the rest are correct.

For a page with a device frame, the shell expands `pageOuterCanvasBounds` outward from the body. But since `canvasY` starts at the chrome top (above the body), `pageOuterCanvasBounds.y` for a framed page is actually `canvasY - shellInsets.top` — which places the snap top even further above the visual chrome. The shell's visual top aligns with the body top, but the snap candidate top is at `chrome_top - shell.inset.top`.

---

## 3. Paths forward

### Path A: Body-origin page — `canvasY` becomes the page body top

**Overview:** Change the semantic of `page.canvasX/Y` to point at the body/viewport origin (currently `canvasY + chromeHeight`). Chrome renders above as a true overlay at `y - chromeHeight` in canvas space. Snap, grid, group bounds, and collision all operate on body coordinates.

**What changes:**

| Concern | Change |
|---|---|
| `Page.canvasY` | Shift by `+chromeHeight` at migration time (existing .canvas files) |
| `pageCanvasBounds` | Returns body origin as-is — no change to the function signature |
| `pageOuterCanvasBounds` | Grows from body outward with shell insets — aligns with visual |
| Snap candidates | `canvasY` = body top; snap rect top is now correct |
| `computeScreenBoundsForPage` | `chrome.y = page.canvasY * zoom + pan - chromeH`; `page.y = canvasY * zoom + pan`; geometry becomes simpler |
| `pageSelectableBounds` | Can include chrome by extending upward: `{ y: outer.y - chromeH, height: outer.height + chromeH }` |
| Placement (`occupiedRegions`) | `extendUpwardForChrome` still needed but now starts from body top, not chrome top |
| `register-canvas-entity-ipc.ts:158` | `canvasY - CHROME_HEADER_HEIGHT` adjustment is removed (IPC now receives body Y) |
| `region-capture.ts:139` | `contentCanvasY = pageBounds.y` (no adjustment needed) |
| `presence-manager.ts:169` | Remove `+ page.chromeHeight` offset |
| `canvas-layout-data.ts:424` | Remove `+ chromeHeight` offset in cursor placement |
| `useAnchoredPosition.entityRectFor` | Extend upward by `CHROME_HEADER_HEIGHT` still needed (renderer receives body-only `screenY`) |
| `.canvas` file migration | All existing `link` nodes must have their `y` shifted by `+44` |

**Device frame with Path A:** `pageOuterCanvasBounds` starts at the body origin, so `outer.y = body.y - shellInsets.top`. Shell occupies body + insets in all directions. This cleanly aligns: the snap rect top for a framed page is the shell's visual top edge, not the chrome top.

**Pros:**
- Snap, grid, and alignment guides all operate on the visual body, which is what users expect.
- Device shell visual top = snap top. No more floating guide lines.
- `pageCanvasBounds` and `pageOuterCanvasBounds` return rects whose `y` matches the visible content origin — no mental shift needed when reading coordinates.
- `computeScreenBoundsForPage` simplifies: chrome.y is derived downward from `canvasY - chromeH`, rather than `canvasY` being the chrome origin.
- Region capture, presence, cursor placement all drop ad-hoc `+ chromeHeight` offsets.
- The `page.chromeHeight` field could eventually be retired (chrome height is a constant).
- Aligns with the ADR 0002 §1 intent: "entity rect = body + chrome stacked" where chrome extends above rather than body extending below.

**Cons:**
- Requires a `.canvas` file migration: all `link` nodes must shift `y` by `+CHROME_HEADER_HEIGHT` (44 px). Existing files opened without migration will render pages 44 px lower than they were placed.
- Every site that reads `page.canvasY` as the chrome-top (currently documented in several comments) needs to be audited and updated — approximately 8–10 callsites.
- The IPC that delivers `canvasY` from the renderer (drag start, click-to-place) assumes the renderer knows the chrome height. The renderer computes body position from `entity.screenY`; if IPC sends body coords that is already the right thing.
- Existing tests that assert specific `canvasY` values will need updating.

**Best for:** New builds or builds willing to accept a one-time migration. Highest long-term clarity.

**Blast radius:** Medium-high. Mostly additive changes (shift values, remove offsets), no architectural additions. The migration itself is the largest risk.

---

### Path B: Keep `canvasY` as chrome-top; expose `pageBodyCanvasBounds()` for snap

**Overview:** Do not change the stored coordinate meaning. Add a `pageBodyCanvasBounds()` helper that returns `{ y: page.canvasY + page.chromeHeight, height: contentHeight }`. Feed this (not `pageOuterCanvasBounds`) into `currentSnapSnapshotEntities()` for page entries. Alignment guides and grid snap operate on body bounds; view positioning continues using the existing chrome-aware paths.

**What changes:**

| Concern | Change |
|---|---|
| New function | `pageBodyCanvasBounds(page)` → `{ x: canvasX, y: canvasY + chromeHeight, width, height }` |
| `currentSnapSnapshotEntities` | Pages use `pageBodyCanvasBounds`; width/height unchanged |
| `currentSnapCandidateForEntity` | Same — use body bounds for pages |
| `pageOuterCanvasBounds` | Extend from body origin, not chrome origin — same fix as Path A for the shell |
| `pageSelectableBounds` | No change; hit-testing still uses chrome-inclusive bounds |
| Everything else | Unchanged |
| `.canvas` file migration | None |

**Device frame with Path B:** `pageOuterCanvasBounds` needs the same fix as Path A — it currently starts from `page.canvasY` (chrome top) and expands with shell insets. It should start from `page.canvasY + page.chromeHeight` (body top) before applying insets. Otherwise the snap rect for a framed page still has a wrong top edge.

**Pros:**
- Zero migration. Existing `.canvas` files work unchanged.
- Lower blast radius. Only 2–3 functions change in main.
- Two coordinate systems coexist cleanly: chrome-top for rendering/view-positioning, body-top for snap/align.
- Reversible. If the user changes their mind the function can be swapped back.

**Cons:**
- Two meanings of "page position" in the codebase. Any new code author must learn which `pageXxxCanvasBounds` to call.
- `page.canvasY` (and thus the `.canvas` file) continues to encode chrome-top, which is visually misleading — the stored coordinate does not point at any visible content corner.
- `pageOuterCanvasBounds` still needs fixing (see above), so there are changes in both Path A and B — Path B just avoids the migration.
- Group bounds still computed via `entityBoundsById` → `pageSelectableBounds` → `pageOuterCanvasBounds`. If `pageOuterCanvasBounds` is fixed to start at the body, group bounds change slightly (they shrink by `chromeHeight` at the top). This is a behaviour change even if small.
- The constant mismatch (44 vs 36 px) is not fixed.

**Best for:** Fast fixes with a preference for minimal risk. Good as a stepping-stone toward Path A.

**Blast radius:** Low. Mostly isolated to snap infrastructure.

---

### Path C: Separate snap bounds from selectable bounds via `getSnappableBounds(entity)`

**Overview:** Introduce a single dispatch function `getSnappableBounds(entityId)` that returns the rect the snap engine should use, independent of `pageOuterCanvasBounds` or `pageSelectableBounds`. For pages it returns body-only (or body+shell). Other entity kinds return their `{canvasX, canvasY, width, height}` unchanged. Feed this exclusively into `currentSnapSnapshotEntities`, `currentSnapCandidateForEntity`, and the resize guide session.

This is a generalisation of Path B: instead of a page-specific helper, the snap engine has a per-entity dispatch point that any future entity kind can override.

**What changes:**

| Concern | Change |
|---|---|
| New function in `workspace-entities.ts` | `getSnappableBounds(entityId): WorkspaceBounds \| null` |
| `currentSnapSnapshotEntities` | Call `getSnappableBounds` for each entity |
| `currentSnapCandidateForEntity` | Same |
| Page implementation | Returns `pageBodyCanvasBounds` (body + shell, no chrome) |
| `pageOuterCanvasBounds` | Fix shell to start from body origin (same as Path B) |
| `.canvas` migration | None |

**Pros:**
- Cleanest abstraction for a multi-kind canvas: snap semantics are owned per entity type at a single dispatch point, not scattered across the snap loop.
- Future entity types (e.g. sticky note with a tab, drawing with a label header) can opt into body-only snap without touching the snap engine.
- No migration.

**Cons:**
- More indirection than Path B for the same immediate fix. The distinction between `getSnappableBounds` and `entityBoundsById` (which is already a dispatch function) needs careful documentation to avoid confusion.
- Still leaves `page.canvasY` meaning chrome-top, which is the root semantic confusion. Path C cleans up snap but leaves the stored data ambiguous.
- The constant mismatch is still not fixed.

**Best for:** Teams expecting more entity kinds to need custom snap semantics. Good architecture for extensibility.

**Blast radius:** Low-medium. Touch snap infrastructure + add one dispatch function.

---

### Path D: Make chrome a sibling entity (separate node)

**Overview:** Chrome becomes its own persisted entity (or a "decoration" entity) parented to the page. The page's `canvasX/Y/width/height` stores only the body. Chrome is positioned by the parent-child relationship.

**What changes:** Essentially everything. New entity kind, parent-child references, serialization, undo, group semantics, IPC. The page entity type becomes clean but the implementation cost is very high.

**Pros:**
- Absolute clarity: a page entity is the body, period.
- Chrome can have its own z-ordering and styling.

**Cons:**
- Enormous blast radius. Every system that touches entities (snap, align, group, duplicate, delete, undo, serialization, IPC, CLI, agent tools) must handle chrome decorations.
- `.canvas` format changes significantly.
- Drag and hit-testing for chrome become coordination between two entities.
- Undo of a move must move both nodes atomically.

**Verdict:** Overkill for this problem. The chrome is not independently addressable — it is always owned by and moves with its page. A separate entity adds complexity without user-visible value.

---

## 4. Recommended path

**Start with Path B, then migrate to Path A.**

### Phase 1 — Path B (no migration, fixes snap immediately)

1. Add `pageBodyCanvasBounds(page)` returning `{ x: page.canvasX, y: page.canvasY + page.chromeHeight, width: contentWidth, height: contentHeight }`.

2. Fix `pageOuterCanvasBounds` to start from body origin: `inner = pageBodyCanvasBounds(page)`, then add shell insets. (Currently it starts from `page.canvasY` which is the chrome top — this is the device-frame bug.)

3. In `currentSnapSnapshotEntities` and `currentSnapCandidateForEntity`, use `pageBodyCanvasBounds` (not `pageOuterCanvasBounds`) for the base, then apply shell insets separately — or simply use the fixed `pageOuterCanvasBounds` (which now = body + shell).

4. Reconcile the constant mismatch: pick one value (36 px, matching the renderer) and update `runtime-constants.ts`, `page-factory.ts`, and all callers.

5. Update `pageSelectableBounds` to extend upward from the fixed outer bounds: `{ y: outer.y - chromeH, height: outer.height + chromeH }`.

**Result:** Snap and alignment guides fire at the body's visual edges. Device shell top aligns with snap top. No `.canvas` migration.

### Phase 2 — Path A (migration, cleans stored semantics)

Once Phase 1 is stable, write a one-time migration in `workspace-restore.ts` (or the JSON canvas loader) that detects legacy files (where `y` = chrome top) and shifts `y += chromeHeight` on every `link` node. Flip `page.canvasY` to mean body origin. Remove all `+ chromeHeight` offsets from callsites.

The migration can be detected reliably: when loading a file, if the stored page `y` equals `page.canvasY - 44` of what the chrome-top logic would produce, it's a pre-migration file. A simpler heuristic: add a `__formatVersion` field to the `.canvas` `appState` extension and bump it.

### Why this order

Path B is a targeted, reviewable fix with near-zero migration risk. It closes the snap bug and the device-frame misalignment in one small PR. Path A's migration introduces risk on every `.canvas` file a user has ever created — doing that after behaviour is validated in Path B is safer.

---

## 5. Open questions

1. **Chrome height constant**: Which value is correct — 44 px (`runtime-constants.ts`) or 36 px (`entity-chrome-slots.ts`)? The renderer paints at 36 px (the actual pixel height of the chrome strip); the main process assumes 44 px everywhere. The 8 px gap means the view is positioned 8 px lower than the chrome bottom in screen space. Decide which is canonical before Phase 1.

2. **Should the device frame be inside or outside the snap rect?** Path B as described puts the snap rect at body + shell insets (the full outer bezel). An alternative: snap rect = body only; frame is visual chrome. The user's words say the page body should be the source of truth, which suggests body-only snap with the device frame as visual decoration. But that would mean alignment guides fire at the body edges, not the outer bezel — two framed pages that look visually flush at their bezels would not produce a guide. Clarify the expected UX before implementing.

3. **Group bounds and the chrome above pages**: `groupBoundsForEntityIds` calls `entityBoundsById` → `pageSelectableBounds` → `pageOuterCanvasBounds` (after the fix, body+shell), then adds `chromeH` on top. Group bounds therefore include the chrome band. When a page is grouped, should the group outline include chrome? If yes, the current logic is correct after the fix. If no, `pageSelectableBounds` should not extend upward for chrome.

4. **Grid-snap anchor**: With Path B/A, `applyDragDelta` snaps `entity.canvasX/Y`. After Path A, `canvasY` is the body top, so grid lines align with body tops — the design intent. Before Path A (during Path B phase), `canvasY` is still chrome-top, so grid alignment is still broken for the stored coordinate even though snap guides show correctly. Is this acceptable interim state?

5. **Undo/redo correctness**: The undo stack records `canvasX/Y` mutations via Y.Doc. After Path A's migration, any undo of a pre-migration drag that was recorded with chrome-top coordinates will replay correctly because the delta is relative. Cross-session undo (stored in the `.canvas` file) will work only if the migration runs before the undo stack replays. Confirm whether undo history is cleared on file open (it is, via `clearUndoHistory()` in `workspace-restore.ts`) — if so, no special handling is needed.

6. **CLI and agent tools**: The HTTP API routes expose `canvasX/canvasY` directly (e.g. `update-page-bounds`, `list-pages`). After Path A these semantics change. Agent tools that position pages by explicit `canvasY` will need to account for the shift. Consider a deprecation notice in the API response or a migration guide for agents.

7. **`pageSelectableBounds` height expansion**: The current `page.chromeHeight` (44 px) is used to expand selectable height. After fixing the constant to 36 px, selectable bounds shrink slightly at the top. Check whether this affects marquee selection feel — the drag target for the chrome strip would shrink from 44 to 36 px.
