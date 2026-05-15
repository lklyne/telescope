# Popup menus v2

End-to-end build plan for the popup-menu refresh, broken into 8 tracer-bullet vertical slices.

**Canonical decisions:** [`docs/adr/0013-popup-menus-v2.md`](../adr/0013-popup-menus-v2.md). Read this first — every phase below is a slice of that ADR.

**Figma source of truth:** `agent-canvas` file (key `hgwwoe0EzUrErdviULmRtb`). Use `mcp__plugin_figma_figma__get_design_context` / `…__get_screenshot` against the popup row node ids listed in ADR 0013 §8 to refresh visual references. Custom-drawn icons (`PenSlimIcon`, `PenMarkerIcon`, `StrokeThinIcon`, `StrokeThickIcon`) already exported into `src/renderer/shared/PopupIcons.tsx` — standard icons come from `lucide-react`.

**Tracker issues:**

| Phase | Issue | Type | Blocked by |
|---|---|---|---|
| 1 | [#101](https://github.com/lklyne/specular/issues/101) Popup visual token refresh | AFK | — |
| 2 | [#102](https://github.com/lklyne/specular/issues/102) Tool union: split `add-sticky`, remove `add-document` | AFK | — |
| 3 | [#103](https://github.com/lklyne/specular/issues/103) Element-name composer | HITL | — |
| 4 | [#104](https://github.com/lklyne/specular/issues/104) Eight-slot color palette with neutral | AFK | #101 |
| 5 | [#105](https://github.com/lklyne/specular/issues/105) Text size for text, sticky, shape | AFK | #101 |
| 6 | [#106](https://github.com/lklyne/specular/issues/106) Page + wireframe-file popup additions | AFK | #101 |
| 7 | [#107](https://github.com/lklyne/specular/issues/107) Cross-kind morph: text ↔ markdown file | AFK | #102 |
| 8 | [#108](https://github.com/lklyne/specular/issues/108) Toolbar regrouping | AFK | #102 |

**Build order:** 1 and 2 land in parallel (no blockers). Then 4 / 5 / 6 (need 1) and 7 / 8 (need 2). Phase 3 is HITL — visual review on the comment thread treatment; sequence at the user's discretion.

---

## Phase 1 — Popup visual token refresh

Foundation slice. Updates the `CanvasItemPopup` shared primitives (container, inner button, color swatch, divider) to match the locked visual tokens in ADR 0013 §8. No behavior change — this pins the visual treatment before subsequent palette / text-size / page-popup work builds on it.

**Tokens to land** (from ADR 0013 §8):

- Container: bg `#ece9e7` light / `#3a3836` dark; border `#dcdcda` / `#414141`; radius 10; padding 4; gap 4; shadow per ADR.
- Inner button: 24×24, radius 6, no border in any state. Fill `#fdf8f5` light / `rgba(253,248,245,0.1)` dark on hover (any button) and on persistent-active (toggles).
- Color swatch: 20×20 with 12px dot; outer ring in the swatch's own color when active.
- Single fill color drives hover and active. `DestructiveButton` variant is removed.

**Custom icons**: `src/renderer/shared/PopupIcons.tsx` (already in this branch — `PenSlimIcon`, `PenMarkerIcon`, `StrokeThinIcon`, `StrokeThickIcon`). Wire `PenSlimIcon` / `PenMarkerIcon` into the brush variant buttons and `StrokeThinIcon` / `StrokeThickIcon` into the stroke-width preview buttons. Standard popup glyphs (copy, trash, chevron, etc.) keep using `lucide-react`.

**Visual reference**: Figma node `360:10` (light mode) and `360:66` (dark mode). Pull with `mcp__plugin_figma_figma__get_screenshot` for parity checks.

**Acceptance criteria**

- [ ] `CanvasItemPopup.Frame`, `IconButton`, `ColorSwatch` primitives updated to ADR 0013 §8 tokens.
- [ ] `DestructiveButton` removed; trash uses the same primitive as copy.
- [ ] Existing popup consumers (sticky, shape, drawing, group, page, file — selection and tool modes) render with the new tokens, no content changes.
- [ ] `pnpm typecheck` + `pnpm test:unit` + `pnpm test:smoke` green.
- [ ] Manual: light/dark mode visual parity with Figma nodes 360:10 and 360:66.

Tracker: [#101](https://github.com/lklyne/specular/issues/101).

---

## Phase 2 — Tool union: split add-sticky, remove add-document, drop add-text.style

Refactor the `Tool` union per ADR 0013 §4:

- Add `{ kind: 'add-sticky' }` as a first-class tool.
- Remove `{ kind: 'add-document' }` — markdown files are reached via the text popup's short/long toggle (phase 7), not a top-level tool.
- Remove the `style` field from `{ kind: 'add-text' }` — sticky is now its own tool.

Toolbar gains a separate sticky button; "Add text ▾" dropdown is removed; add-document button is removed. Tool defaults restructure: `add-sticky` and `add-text` each carry `{ color, textSize }`; `add-document` defaults are dropped.

**Acceptance criteria**

- [ ] `Tool` union in `src/shared/tool.ts` reflects the new shape (sticky added, document gone, text.style gone).
- [ ] Toolbar exposes a separate sticky button. "Add text ▾" dropdown removed. Add-document button removed.
- [ ] Tool defaults: `add-sticky.{color, textSize}`; `add-text.{color, textSize}`; `add-document` entry removed.
- [ ] IPC `setTool` payloads updated; keyboard shortcuts re-targeted for the new tools.
- [ ] Placing a sticky from the toolbar uses `add-sticky` tool defaults; placing text uses `add-text` defaults.
- [ ] `pnpm typecheck` + `pnpm test:unit` + `pnpm test:smoke` green.

Tracker: [#102](https://github.com/lklyne/specular/issues/102).

---

## Phase 3 — Element-name composer (HITL)

Per ADR 0013 §6: element-anchored annotations gain a first-class `elementName` field. The pending composer is rewritten — for element anchors it presents the "Element name" input above the message thread. The new composer also subsumes the comment-thread surface (replies) for committed element-anchored comments. Canvas-point and region anchors keep their current composer shape.

**HITL note:** the thread/replies visual treatment was not fully locked in the Figma file (only the pending-name input shape was). Design review during implementation.

**Acceptance criteria**

- [ ] `Annotation.elementName: string | undefined` field added; serializes to `.canvas` under `specular.elementName`.
- [ ] Element-anchor pending composer surfaces the name input as the top field.
- [ ] Committed element-anchored annotations show name + thread; replies work end-to-end.
- [ ] Right-panel comment list displays `elementName` when present.
- [ ] Canvas-point and region anchors unchanged.
- [ ] `pnpm typecheck` + `pnpm test:unit` + `pnpm test:smoke` green.
- [ ] HITL: thread/replies visual treatment reviewed with the user.

Tracker: [#103](https://github.com/lklyne/specular/issues/103).

---

## Phase 4 — Eight-slot color palette with theme/role-aware neutral

Replace the six-pastel `canvas-colors.ts` palette with the eight-slot palette per ADR 0013 §1: `neutral · purple · blue · cyan · green · yellow · orange · red`. Wire through every consuming kind's popup swatch row (sticky, text, shape fill, drawing/pen).

Slot 1 ("neutral") is theme- and role-aware:

- **Surface-fill role** (sticky, shape fill): light in light mode, dark in dark mode.
- **Ink role** (pen/highlighter/plain text glyphs): dark in light mode, light in dark mode.

**Disk format:** hues stored as 6-char hex in the JSON Canvas `color` field; neutral stored as `specular.colorRole: "neutral"` with optional `color: "1"` fallback for cross-tool readers.

**Migration:** existing canvases with legacy digit colors (`"1"`–`"6"`) continue to render via the old red/orange/yellow/green/cyan/purple mapping — no automatic re-keying. New picks write hex.

**Acceptance criteria**

- [ ] `src/shared/canvas-colors.ts` exports the eight-slot palette and a `(slot, role, theme) → rgb` resolver.
- [ ] Sticky, text, shape, and drawing/pen popups all show the same 8 swatches in the same order.
- [ ] Pen popup ink-role rendering: neutral pen contrasts against the canvas in both modes.
- [ ] Picking neutral on a sticky in light mode and toggling theme flips its RGB without re-saving.
- [ ] Serializer round-trips `specular.colorRole` and hex `color` values.
- [ ] Legacy canvases with `color: "1"` still render red (no auto-migration).
- [ ] `pnpm typecheck` + `pnpm test:unit` + `pnpm test:smoke` green.

Blocked by phase 1. Tracker: [#104](https://github.com/lklyne/specular/issues/104).

---

## Phase 5 — Text size for text, sticky, and shape

Per ADR 0013 §2: add a `textSize` per-entity property to `text` (plain and sticky) and `shape` (inner label). The popup surfaces a labeled dropdown ("Small ▾") with presets:

| Preset | Pixels |
|---|---|
| Small | 18 |
| Medium | 32 |
| Large | 56 |
| Extra large | 96 |
| Huge | 144 |

Plus a raw-pixel input at the bottom of the open dropdown (8–256 range, integers). Dropdown opens below the trigger, left-aligned, with a `✓` marker on the active preset. Outside-click and Escape dismiss without committing.

Tool defaults gain `textSize` for `add-text`, `add-sticky`, and `add-shape`. Entities without `textSize` default to Small (18) on render.

**Out of scope:** pen stroke width — keeps the inline preview-button affordance.

**Acceptance criteria**

- [ ] `textSize` field on text and shape entities; serializes under `specular.textSize`.
- [ ] New labeled-dropdown component used in text, sticky, and shape popups.
- [ ] Tool defaults updated; placing a text/sticky/shape uses the persisted default size.
- [ ] Raw input commits on Enter/blur, validates 8–256 silently.
- [ ] Outside-click and Escape dismiss without committing.
- [ ] Selection-mode popup writes immediately on preset click.
- [ ] `pnpm typecheck` + `pnpm test:unit` + `pnpm test:smoke` green.

Blocked by phase 1. Tracker: [#105](https://github.com/lklyne/specular/issues/105).

---

## Phase 6 — Page and wireframe-file popup: device-frame + rotate viewport

Per ADR 0013 §7: `PagePopup` and the wireframe variant of `FilePopup` gain two controls moved from the right panel:

- **Device-frame toggle** — sets the existing `showDeviceFrame` boolean. Persistent active state on the button.
- **Rotate viewport** — momentary action toggling between portrait and landscape (same code path as the right-panel `PagePane` rotation). No persistent active state on the button.

Right-panel controls remain — the popup adds a faster path, not a replacement.

The wireframe-renderer claim contributes both controls through the renderer-plugin contribution surface (ADR 0008 §7). Non-wireframe file kinds (image, plain markdown, video, component) do not get these buttons.

**Acceptance criteria**

- [ ] Page popup shows device-frame toggle and rotate-viewport button alongside back/forward/reload/copy/trash.
- [ ] Wireframe-file popup gains the same two buttons via the renderer-plugin contribution surface.
- [ ] Toggling device frame from the popup matches the right-panel behavior 1:1.
- [ ] Rotate flips portrait↔landscape, persists per entity.
- [ ] Non-wireframe file kinds do not get these buttons.
- [ ] `pnpm typecheck` + `pnpm test:unit` + `pnpm test:smoke` green.

Blocked by phase 1. Tracker: [#106](https://github.com/lklyne/specular/issues/106).

---

## Phase 7 — Cross-kind morph: text ↔ markdown file

Per ADR 0013 §3: in selection mode, clicking the inactive variant of the text popup's short/long toggle morphs the selected entity across kinds.

- **short → long**: write the text body to a new `.md` file in the workspace; replace the `text` entity with a `file` entity at the same rect; strip color and size fields (markdown content owns its own formatting).
- **long → short**: read the `.md` content; flatten markdown to plain text; replace the `file` entity with a `text` entity at the same rect.

Both directions are **transactional under one undo step** — the file write/delete reverses with the entity replacement. No confirmation dialog; the popup tile is the affordance.

Tool-mode behavior: the toggle picks the kind for the next creation, persisting to tool defaults.

**Acceptance criteria**

- [ ] New IPC channel (e.g. `morph-text-file`) performs the transactional swap.
- [ ] Selection-mode popup wires the short/long toggle; clicking `long` on selected plain text creates a new `.md` and replaces the entity.
- [ ] Clicking `short` on a selected markdown file reads content, flattens, replaces with a plain-text entity.
- [ ] Single undo reverses both halves (entity restored, file deleted or recreated).
- [ ] Tool-mode short/long toggle persists last choice; `add-text` creation routes accordingly.
- [ ] `pnpm typecheck` + `pnpm test:unit` + `pnpm test:smoke` green.

Blocked by phase 2. Tracker: [#107](https://github.com/lklyne/specular/issues/107).

---

## Phase 8 — Toolbar regrouping into nav / create / annotate / view

Per ADR 0013 §5: re-order the top toolbar into four groups separated by dividers.

- **Nav** — select, hand
- **Create** — draw, add-sticky, add-shape, add-page
- **Annotate** — add-text, comment, inspect
- **View** — theme toggle, zoom

The "Add text ▾" dropdown is gone (removed in phase 2). Plain text moves into the *annotate* group because writing words on the canvas is an annotation act. Sticky lives in *create* because the sticky is the thing itself. Visual treatment matches the popup tokens locked in ADR 0013 §8.

`add-page` is named "frame" in the design (icon only) but the runtime tool stays `add-page` per ADR 0003.

**Acceptance criteria**

- [ ] Toolbar buttons render in the new grouping with dividers between groups.
- [ ] Tooltips/labels: "Select", "Hand", "Draw", "Add sticky", "Add shape", "Add page", "Add text", "Comment", "Inspect".
- [ ] Toolbar visual tokens (container, button hover/active fill, radii) match the popup tokens from ADR 0013 §8.
- [ ] Keyboard shortcut bindings remain functional and re-targeted as needed.
- [ ] `pnpm typecheck` + `pnpm test:unit` + `pnpm test:smoke` green.

Blocked by phase 2. Tracker: [#108](https://github.com/lklyne/specular/issues/108).
