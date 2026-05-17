# Plan: Page bounds — Path A (snap-rect-top is `canvasY`)

See `docs/explorations/page-bounds-snap-alignment.md` for the current-system map and rationale.

## 1. Goal and locked-in decisions

Re-anchor `page.canvasY` to the **top of the snap rect**, where the snap rect = body + device-frame insets. Chrome lives outside the snap rect and renders at `y - CHROME_HEADER_HEIGHT`.

Locked-in decisions:

1. **`page.canvasY` semantics change** to "top of the snap rect" (body top when unframed, device-bezel top when framed). Chrome paints above at `y - CHROME_HEADER_HEIGHT`.
2. **Snap rect = body + device-frame insets.** Chrome is always outside.
3. **Toggling a frame is anchored at `canvasY`.** With `canvasY` defined as the snap-rect top, turning a frame ON keeps the snap-rect-top anchored and *pushes the body down* by `insets.top` to make room for the bezel. Turning a frame OFF pulls the body back up to `canvasY`. This is the natural consequence of decision #1 — no extra logic needed.
4. **No `.canvas` migration.** Pre-existing files will visually shift by `CHROME_HEADER_HEIGHT` (and by `insets.top` when a frame is on) on reopen. Accepted.
5. **Reconcile `CHROME_HEADER_HEIGHT` to 36 px** — the renderer's visible value. Single source of truth lives in `src/shared/entity-chrome-slots.ts`; `runtime-constants.ts` re-exports. `page.chromeHeight` is removed from the `Page` interface (effectively constant).

### Chrome-height decision (callout)

- `src/main/runtime/runtime-constants.ts:8` defines `CHROME_HEADER_HEIGHT = 44`.
- `src/shared/entity-chrome-slots.ts:20` defines `CHROME_HEADER_HEIGHT = 36`.
- `src/shared/canvas-hit-geometry.ts:3` defines `PAGE_CHROME_HEIGHT_PX = 36` (used by hit-test).

**Decision:** the 36 in `src/shared/entity-chrome-slots.ts` becomes the single source of truth. Main imports it from `shared`; `runtime-constants.ts` no longer declares the constant. `PAGE_CHROME_HEIGHT_PX` is collapsed into the same export. `page.chromeHeight` is removed from the `Page` interface (`src/main/runtime/runtime-entities.ts:22`) — callsites read the shared constant.

Why 36 (not 44): 36 is what the user actually sees and what hit-test already uses. 44 is a phantom in main-only code paths; the 8 px excess only shows up as occluded space in placement, not as anything visible.

---

## 2. Implementation steps (in order)

### Step 1 — Unify the chrome-height constant

**Files:**
- `src/main/runtime/runtime-constants.ts:8` — delete `export const CHROME_HEADER_HEIGHT = 44`. Replace with `export { CHROME_HEADER_HEIGHT } from '../../shared/entity-chrome-slots'`.
- `src/shared/canvas-hit-geometry.ts:3` — delete `PAGE_CHROME_HEIGHT_PX = 36`, re-export `CHROME_HEADER_HEIGHT` from `entity-chrome-slots` (or rename callers).
- `src/shared/hit-test.ts:20,344,346` — switch references from `PAGE_CHROME_HEIGHT_PX` to `CHROME_HEADER_HEIGHT`.
- `src/main/runtime/runtime-entities.ts:22` — remove `chromeHeight: number` from the `Page` interface.
- `src/main/runtime/page-factory.ts:113` — delete `chromeHeight: CHROME_HEADER_HEIGHT,` from the `Page` literal.
- All sites that read `page.chromeHeight` read `CHROME_HEADER_HEIGHT` from shared.

**Verifies:** typecheck passes; `pnpm dev` still launches. The 36/44 mismatch (main thought chrome was 44 while renderer painted 36) disappears.

### Step 2 — Flip `page.canvasY` semantics (no rename of stored data)

Update the doc comment over `Page.canvasY` in `src/main/runtime/runtime-entities.ts:21`:

```typescript
/** Top-left of the page's snap rect in canvas coords. With a device frame
 *  this is the bezel top; without, it is the body top. Chrome renders
 *  above at (canvasY - CHROME_HEADER_HEIGHT). */
canvasY: number
```

**Verifies:** no compile errors.

### Step 3 — Geometry helpers: redefine `pageOuterCanvasBounds` and add a chrome-inclusive helper

`src/main/runtime/runtime-geometry.ts:68-103`:

- **Rename** `pageCanvasBounds` → `pageBodyCanvasBounds` (the body, not the snap rect — old name misleads once `canvasY` is the snap-rect top).
- **Rename** `pageOuterCanvasBounds` → `pageSnapBounds`. Body inside is at `(canvasY + insets.top, canvasX + insets.left)` when framed; unchanged when unframed.

```typescript
export function pageSnapBounds(page): WorkspaceBounds {
  const size = pageContentSize(page)
  const insets = pageShellInsets(page)
  if (!insets) return { x: page.canvasX, y: page.canvasY, width: size.width, height: size.height }
  return {
    x: page.canvasX,
    y: page.canvasY,
    width: size.width + insets.left + insets.right,
    height: size.height + insets.top + insets.bottom,
  }
}

export function pageBodyCanvasBounds(page): WorkspaceBounds {
  const size = pageContentSize(page)
  const insets = pageShellInsets(page)
  return {
    x: page.canvasX + (insets?.left ?? 0),
    y: page.canvasY + (insets?.top ?? 0),
    width: size.width,
    height: size.height,
  }
}

export function pageVisualBounds(page): WorkspaceBounds {
  const snap = pageSnapBounds(page)
  return { x: snap.x, y: snap.y - CHROME_HEADER_HEIGHT, width: snap.width, height: snap.height + CHROME_HEADER_HEIGHT }
}
```

Three rects now exist: **body**, **snap** (body + frame insets), **visual** (snap + chrome above).

**Verifies:** typecheck. Every `pageOuterCanvasBounds` importer must update via single search-and-replace.

### Step 4 — `computeScreenBoundsForPage`: rewire chrome to live above `canvasY`

`src/main/runtime/runtime-geometry.ts:191-283`:

```typescript
// Before:
const pageY = ... : Math.round(canvasY * zoom + pan.y) + toolbarHeight + chromeH + gap
const chromeY = ... : Math.round(canvasY * zoom + pan.y) + toolbarHeight

// After:
const snapTopScreenY = Math.round(canvasY * zoom + pan.y) + toolbarHeight
const insetTopScreen = Math.round((insets?.top ?? 0) * zoom)
const pageY = ... : snapTopScreenY + insetTopScreen       // body top
const chromeY = ... : snapTopScreenY - chromeH            // chrome above snap top
const shellY = ... : snapTopScreenY                       // bezel top = canvasY in screen space
```

Shell rect: `shell.y = snapTopScreenY`, `shell.height = pageH + insets.top + insets.bottom`. Drop `CHROME_PAGE_GAP` if unused after.

**Verifies:** `pnpm dev` — drag a page; chrome floats above body. With a frame, bezel hugs body and chrome floats above the bezel. Toggle a frame on/off; body shifts down/up by `insets.top`, snap-rect-top stays put.

### Step 5 — Strip the `+ chromeHeight` offsets at call sites

Each currently compensates for `canvasY` being chrome-top. After Path A they simplify:

- `src/main/ipc/register-canvas-entity-ipc.ts:158` — drop the `- CHROME_HEADER_HEIGHT`.
- `src/main/presence-manager.ts:165-169`:
  ```typescript
  // before: canvasY: page.canvasY + page.chromeHeight + clamp(point.y, 0, height),
  // after:  canvasY: pageBodyCanvasBounds(page).y + clamp(point.y, 0, height),
  ```
- `src/main/runtime/canvas-layout-data.ts:421-424`:
  ```typescript
  // before: const chromeHeight = pageWcv?.chromeHeight ?? 0
  //         canvasY: page.canvasY + chromeHeight + clampedY,
  // after:  canvasY: pageBodyCanvasBounds(page).y + clampedY,
  ```
- `src/main/runtime/region-capture.ts:137-139`:
  ```typescript
  // before: const contentCanvasY = pageBounds.y + page.chromeHeight
  // after:  const contentCanvasY = pageBodyCanvasBounds(page).y
  ```
- `src/main/workspace-entities.ts:56-66` `pageSelectableBounds`:
  ```typescript
  // before: { y: outer.y, height: outer.height + page.chromeHeight }
  // after:  return pageVisualBounds(page)
  ```
  Old version stretched height *down*; under Path A chrome lives *above*.
- `src/main/workspace-placement.ts:45-58` `extendUpwardForChrome` — behavior is now correct as-named, no math change.

**Verifies:** typecheck; placement smoke yields same placement modulo the chromeHeight shift on stored pages.

### Step 6 — Snap and alignment guides

`src/main/runtime/document-commands.ts:188-200, 250-267`:

```typescript
// before: const bounds = pageOuterCanvasBounds(page)
// after:  const bounds = pageSnapBounds(page)
```

`currentSnapCandidateForEntity` at `document-commands.ts:253` likewise: `pageSnapBounds(page)`.

**Grid snap path:** `src/main/runtime/document-commands.ts:356-357` mutates `entity.canvasX/Y` directly via `snapToGrid`. Since `canvasY` now means snap-rect top, grid snap aligns the snap rect's top edge — design intent. No code change.

**Alignment guides path (PR #97 / c2ec984):** detector at `src/main/runtime/alignment-guide-detector.ts:51` consumes `SnapCandidate` built via `snapCandidateFromRect(entity, rect)`. With the snap rect fed in, guides fire on visible edges.

**Verifies:** drag two pages (one framed, one unframed) — guides fire flush with visible edges. Bezel-top of framed page snaps to body-top of unframed page (both are snap-rect tops).

### Step 7 — Renderer chrome: render above the body

`src/renderer/above-view/useAnchoredPosition.ts:113-122` `entityRectFor` — synthetically extends upward by `CHROME_HEADER_HEIGHT` for kinds with chrome. After Step 4, entity `screenY` is the snap-rect top (bezel top for framed, body top for unframed). The synthetic extension upward by `CHROME_HEADER_HEIGHT` puts the chrome slot above. ✓

Update the doc comment at `useAnchoredPosition.ts:106-112` to reflect: "entity screenY is the snap-rect top of the page; chrome lives above".

**Device frame visual sanity:** `bezel top = canvasY` in canvas space ⇒ `bezel top = snapTopScreenY` in screen space. `body top = bezel top + insets.top * zoom`. Matches locked-in #2.

### Step 8 — Selection outline: recommendation

`src/renderer/above-view/SelectionOutlineLayer.tsx:47-79` currently outlines the snap rect with `-6` padding. Chrome NOT included.

**Recommendation: wrap the snap rect, not chrome.** Reasons:
1. Today's outline already wraps the snap rect; chrome floats outside.
2. Chrome is always shown on hover/active.
3. The snap rect IS the alignment/grid rect — outlining it tells the user where guides fire from.

No code change. Add doc comment confirming intent. Multi-selection bbox already uses union of snap rects via `entityBoundsById → pageSelectableBounds`; under Step 5 this becomes `pageVisualBounds` (chrome-inclusive). See Step 11 for the group decision — if groups use visual bounds, multi-select bbox does too.

### Step 9 — Main process view positioning (verification — no offset to remove)

`src/main/runtime/layout-engine.ts:384-385`:

```typescript
page.lastFrameBoundsKey = setBoundsIfChanged(page.frameView, bounds.frame, ...)
page.lastPageBoundsKey  = setBoundsIfChanged(page.pageView,  bounds.page,  ...)
```

`bounds.page` from `computeScreenBoundsForPage` (Step 4) = body screen rect. No `+ CHROME_HEADER_HEIGHT` offset needed.

**Verifies:** click-into-page focus shifts to WCV at body region; 36 px above body is the chrome strip (renderer-painted), not WCV.

### Step 10 — Hit-test / drag-handle confirmation

`src/shared/hit-test.ts:341-348`:

```typescript
function chromeRect(entity: CanvasSceneEntity): Rect {
  return {
    x: entity.screenX,
    y: entity.screenY - CHROME_HEADER_HEIGHT,
    width: entity.screenWidth,
    height: CHROME_HEADER_HEIGHT,
  }
}
```

`entity.screenY` is the snap-rect top (Step 4). Chrome hit region is above the snap rect. Correct.

**File responsible for chrome-as-drag-handle:** `src/main/ipc/register-canvas-drag-ipc.ts:204` (`canvas-drag-page-start`).

**Verifies:** click on chrome strip and drag → page moves. With a framed page, clicking the bezel does NOT trigger drag — bezel is part of the snap rect, not chrome hit region. (Deliberate behavior change vs. ambiguous status quo; revisit if users complain.)

### Step 11 — Groups

`src/main/workspace-entities.ts:164-176` `groupBoundsForEntityIds` → `pageSelectableBounds`. After Step 5's rewrite, `pageSelectableBounds = pageVisualBounds = snap rect + chrome above`.

**Deliberate change:** group bounds containing a page shift up by `CHROME_HEADER_HEIGHT` (chrome now claimed as visible-but-above), bottom moves up by the old `page.chromeHeight` (no longer extending downward).

**Recommendation: groups use *visual* bounds (chrome-inclusive).** Reasons:
1. Group outline is a visual frame; users expect it to wrap everything visible.
2. Grouped pages need chrome handle reachable; cropping chrome would visually overflow.
3. Matches today's behavior (height-extended bounds), just inverted in direction.

No `groupBoundsForEntityIds` change needed; it inherits corrected `pageSelectableBounds`.

### Step 12 — CLI + HTTP API

`src/main/app-control-server.ts:451,573,594` returns `canvasX/canvasY`. Values change meaning: "chrome top" → "snap-rect top". Existing CLI scripts that pass explicit y values will render in slightly different spots:

- Unframed: 36 px higher than before.
- Framed: `36 + insets.top` px higher than before.

**Document as known visible-but-accepted shift.** No code change to HTTP API surface — field name `canvasY` stays.

---

## 3. Known visible behavior changes

1. **Existing `.canvas` files reopen with pages shifted** by `CHROME_HEADER_HEIGHT` (unframed) or `CHROME_HEADER_HEIGHT + insets.top` (framed). **Accepted.**
2. **Toggling a frame** now pushes body down by `insets.top` (frame ON) or pulls body up by `insets.top` (frame OFF), keeping snap-rect-top anchored at `canvasY`. **Desired.**
3. **Group bounds change shape** — extend `chromeHeight` *up* instead of *down*.
4. **CLI `specular create page --x --y` semantics shift** — `y` now means snap-rect top.
5. **Selection outline excludes chrome** (unchanged, now documented as intentional).
6. **Bezel is no longer a drag handle** (unchanged from today's hit-test).
7. **Constant collapse: 44 → 36.** Placement reserves 8 px less of chrome headroom.

---

## 4. Testing strategy

### Existing tests to update

Search for:
- `canvasY` values asserted directly — flip semantics or query `pageBodyCanvasBounds`.
- `CHROME_HEADER_HEIGHT === 44` — update to 36 or remove.
- `pageOuterCanvasBounds` — rename to `pageSnapBounds`.
- Placement collision tests asserting specific occupied-region rects — adjust by 8 px at the top.

### Tests that should fail and signal a real bug

- Any test asserting visual bottom of a framed page = `canvasY + insets.top + height + insets.bottom`. Under Path A this should be `canvasY + height + insets.top + insets.bottom`.
- Any snap-engine test asserting a guide fires at chrome-top y. Under Path A guides fire at snap-rect top — **smoking gun fix**.

### New tests worth adding

`src/main/runtime/runtime-geometry.test.ts` (create if absent):

```typescript
describe('page snap bounds', () => {
  it('unframed page: snap rect = body rect', () => {
    const page = mkPage({ canvasX: 100, canvasY: 200, presetIndex: 0 })
    expect(pageSnapBounds(page)).toEqual({ x: 100, y: 200, width: 393, height: 852 })
    expect(pageBodyCanvasBounds(page)).toEqual({ x: 100, y: 200, width: 393, height: 852 })
  })

  it('framed page: snap rect = bezel rect, body inset by insets', () => {
    const page = mkPage({ canvasX: 100, canvasY: 200, presetIndex: 0, metadata: { showDeviceFrame: true, deviceId: 'iphone-15' } })
    const insets = pageShellInsets(page)!
    expect(pageSnapBounds(page)).toEqual({
      x: 100, y: 200,
      width: 393 + insets.left + insets.right,
      height: 852 + insets.top + insets.bottom,
    })
    expect(pageBodyCanvasBounds(page)).toEqual({
      x: 100 + insets.left, y: 200 + insets.top,
      width: 393, height: 852,
    })
  })

  it('chrome lives above the snap rect', () => {
    const page = mkPage({ canvasX: 100, canvasY: 200 })
    expect(pageVisualBounds(page).y).toBe(200 - CHROME_HEADER_HEIGHT)
  })

  it('toggling frame on keeps canvasY stable and pushes body down', () => {
    const unframed = mkPage({ canvasX: 100, canvasY: 200 })
    const framed = { ...unframed, metadata: { showDeviceFrame: true, deviceId: 'iphone-15' } }
    expect(pageSnapBounds(framed).y).toBe(pageSnapBounds(unframed).y)             // anchor stable
    expect(pageBodyCanvasBounds(framed).y).toBeGreaterThan(pageBodyCanvasBounds(unframed).y) // body moves down
  })
})
```

`src/main/runtime/alignment-guide-detector.test.ts`:

```typescript
it('two unframed pages with the same body top produce a top-edge guide', () => { /* ... */ })
it('framed + unframed at same bezel/body top produces a top-edge guide', () => { /* ... */ })
```

---

## 5. Rollout / sanity-check checklist (manual smoke in `pnpm dev`)

- [ ] **Open a fresh workspace:** create one unframed page. Chrome above body; body top = stored Y (via `specular list pages`).
- [ ] **Add a framed page:** bezel hugs body; chrome floats above the *bezel*.
- [ ] **Toggle frame on an existing page:** body shifts *down* by `insets.top`; bezel-top stays put at `canvasY`. Toggle off → body returns to `canvasY`.
- [ ] **Drag-from-chrome:** chrome strip drags page. Click bezel of framed page → no drag.
- [ ] **Alignment guides — top edge (unframed pair):** guide fires flush with visible top edges.
- [ ] **Alignment guides — framed-vs-unframed:** guide fires when B's body top aligns with A's *bezel top*.
- [ ] **Grid snap:** snap-rect top snaps to grid (visible top of page or bezel).
- [ ] **Group:** group outline wraps chrome+frame+body.
- [ ] **Open a pre-Path-A `.canvas` file:** pages reposition visually by `CHROME_HEADER_HEIGHT` (and `insets.top` if framed). Stored coordinates unchanged.
- [ ] **CLI:** `specular create page --x 100 --y 100`. Snap-rect-top at (100, 100). Body top = (100, 100) unframed or `(100 + insets.left, 100 + insets.top)` framed.
- [ ] **Region capture:** screenshot region overlapping a page lands content at correct vertical offset.
- [ ] **Presence cursor:** remote cursor over page body lands on body, not 36 px below.
- [ ] **Resize handles:** sit on snap-rect edges (bezel for framed, body for unframed). 6 px outward padding unchanged.

---

## Critical files

- `src/main/runtime/runtime-geometry.ts`
- `src/main/runtime/document-commands.ts`
- `src/main/runtime/runtime-constants.ts`
- `src/main/runtime/page-factory.ts`
- `src/main/workspace-entities.ts`

Supporting (one-line changes each): `src/main/runtime/runtime-entities.ts`, `src/main/runtime/region-capture.ts`, `src/main/runtime/canvas-layout-data.ts`, `src/main/workspace-placement.ts`, `src/main/presence-manager.ts`, `src/main/ipc/register-canvas-entity-ipc.ts`, `src/shared/entity-chrome-slots.ts`, `src/shared/canvas-hit-geometry.ts`, `src/shared/hit-test.ts`, `src/renderer/above-view/useAnchoredPosition.ts`.
