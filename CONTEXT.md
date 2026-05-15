# CONTEXT — Specular domain glossary

Canonical terms used across the codebase, ADRs, and plans. Resolve language conflicts here. See `CLAUDE.md` for build/architecture; see `docs/adr/` for decisions of record.

---

## Canvas data model

Follows [JSON Canvas v1.0](https://jsoncanvas.org) on disk; uses Specular-native terms in runtime and UI.

- **Canvas item** — the user-facing and component-naming term for a thing on the canvas. Kinds: page, file, group, text, drawing, shape. Use this in docs, UI copy, and component names (`CanvasItemChrome`, `SidebarCanvasItem`).
- **Entity** — the runtime / persistence term for the same concept. Use this in `src/main/runtime/` types (`PersistedPageEntity`, `CanvasEntityKind`, `CanvasSceneEntity`). One entity ⇔ one canvas item.
- **Node** — JSON Canvas spec term. Use **only** in the disk-schema layer (`src/shared/json-canvas-types.ts`, `json-canvas-serializer.ts`). Never as a synonym for entity in runtime code.
- **Edge** — a connection between two canvas items. Same name across all three layers.
- **Canvas** — a single `.canvas` file; the spatial document.
- **Space** — a folder of canvases (Obsidian-vault analogue).
- **Page** — Specular's term for live web items: a URL rendered at a particular viewport size at a particular position on the canvas. The runtime `Page` (the `WebContentsView` wrapper in `src/main/runtime/page-factory.ts`) is the same concept — there is no separate "frame entity vs page wrapper" duality. Multiple pages can share the same URL (the multi-breakpoint workflow). Serialized as JSON Canvas `link` nodes; the serializer is the only place the two names meet. See [ADR 0003](./docs/adr/0003-page-as-canonical-name-for-live-web-items.md).

## Text affordances

The `text` and `file` kinds back three user-facing affordances. The toolbar exposes them under a single **`Add text ▾`** dropdown.

| UX affordance | What it is | Spec mapping |
|---|---|---|
| **Text** | Short text, no background. Plain floating text on the canvas. | `text` node + `specular.textStyle: 'plain'` |
| **Sticky note** | Short text inside a colored card. Padding, bg color. The default. | `text` node + `specular.textStyle: 'sticky'` |
| **Document** | Longer markdown content as a `.md` file on disk; reusable across canvases. | `file` node, markdown renderer (selected by extension via `src/main/plugins/registry.ts`) |

Text and Sticky note are the same `text` kind with a render-style toggle. Document is a separate `file` kind because its content lives on disk, not in the `.canvas` JSON.

Default `textStyle` when the field is absent is `'sticky'` — preserves rendering of legacy canvases without migration. New "Add text" placements stamp `'plain'`.

**User-facing grouping in the popup.** Plain text and Document (`.md`) are presented as two flavors of one "text" concept — the popup's leading variant pair (`short` / `long`) toggles between them. Picking *short* produces a `text` entity with `textStyle: 'plain'`; picking *long* produces a `file` entity backed by a new `.md` document. Sticky is **not** in this toggle — it's its own toolbar entry with its own popup. The short/long popup applies the kind-aware content rules: short-text popup carries text size + color swatches; long-text (markdown) popup omits both — markdown content owns its own formatting on disk.

**Cross-kind morph (text ↔ file).** Clicking the inactive variant in **selection mode** converts the entity across kinds:
- *short → long*: write the text body to a new `.md` file in the workspace, replace the `text` entity with a `file` entity at the same rect, strip the color/size fields (markdown content owns its formatting).
- *long → short*: read the `.md` content, strip markdown formatting (or preserve as plain text), replace the `file` entity with a `text` entity at the same rect.

Both directions trigger file CRUD and are lossy in one or both directions (color/size discarded on short → long; markdown formatting flattened on long → short). One undo step reverses the morph including the file write/delete. No confirmation dialog — the popup tile is the affordance.

## Specular extensions to JSON Canvas

JSON Canvas v1.0 tolerates additional fields on nodes; Specular adds its own under a single namespaced object so they don't collide with other tools' extensions and so this glossary can list them in one place:

```jsonc
{
  "id": "...",
  "type": "text",
  "x": 0, "y": 0, "width": 200, "height": 60,
  "text": "...",
  "specular": {
    "textStyle": "plain"   // 'plain' | 'sticky'
    // future Specular-only fields go here
  }
}
```

Conventions:
- Specular-only fields live under the top-level `specular: {}` object.
- Reading other tools' canvases: missing fields fall back to documented defaults.
- Reading our canvases in other tools: the `specular` object is silently ignored; nodes still render as standard JSON Canvas (text/file/link/group).
- Genuinely new node kinds (`drawing`, `shape`) remain top-level `type` values, since they aren't JSON Canvas spec kinds and no fallback rendering is meaningful.

## Entity geometry

- **Entity rect** — the full bounding rect of an entity, body + chrome as one layout unit ([ADR 0002](./docs/adr/0002-canvas-anchored-overlay-ui.md)). Pan / zoom / drag / resize operate on this rect.
- **Body sub-rect** — the part of the entity rect that holds the entity's content (the live document for a page, the image for a file, etc.). Resize handles and edge anchors attach here.
- **Chrome slot** — the part of the entity rect reserved for canvas-anchored overlay UI. Per-kind, runtime-derived, **not persisted** in the `.canvas` schema.

## Drag affordances

Modifiers and visual feedback that ride on top of entity drag (and resize) gestures. The single magnetic pull on the canvas is grid-snap (`snapToGrid`, 20 px); everything below either projects the delta before the snap (axis lock) or renders informationally after it (alignment / distribution guides). See [ADR 0012](./docs/adr/0012-alignment-guides-are-visual-only.md).

- **Axis lock** — holding `Shift` during an entity drag (with or without `Alt`/`Option` for copy) constrains movement to a single axis. Live: the dominant axis is recomputed every frame from cursor offset to drag origin, so the lock can flip H↔V mid-drag without releasing the mouse. Projection happens in main: `aboveView` adds a `shiftKey` flag to each `canvas-drag-entity` IPC update, and `applyDragDelta` zeros the smaller-magnitude axis. The locked axis bypasses grid-snap (entity holds its exact origin coordinate); the free axis still grid-snaps. Multi-select drag applies the same constrained delta to all entities.
- **Snap candidate** — an entity that contributes alignment edges during a drag or resize. Snapshot is taken once at gesture begin from the current viewport-visible entity set (rect intersects the available canvas viewport rect), excluding entities in the active selection. Pages and groups (snap to bbox) are included; group children inside an included group don't double-contribute. Pan is locked during drag, so the snapshot is stable.
- **Alignment guide** — a 1 px solid line in the canvas accent color, rendered in `aboveView`'s drag overlay layer, that confirms the dragged (or resized) entity's edge or center coincides with a snap candidate's edge or center within 0.5 px. Each candidate contributes 6 edges: top, bottom, left, right, horizontal-center, vertical-center; the dragged entity contributes its own 6 reference points (only the moving edge for resize). Guides are detected after grid-snap runs — they confirm an alignment, never create one — so they appear honestly and never lie. The line spans from min to max of the candidate and dragged rects on the snapping axis.
- **Distribution guide** — `==` measure marks rendered alongside alignment guides when the dragged entity sits at equal distance from two or more snap candidates along an axis (post-grid-snap). Same visual-only contract: detection only, no pull.

## Input authority

- **Page focus** — runtime state `{ id, since } | null` in main. When set, the focused page receives native pointer input; aboveView's gate is closed. When null, aboveView is the sole input authority. See [ADR 0001](./docs/adr/0001-click-to-enter-frame-focus.md). (ADR 0001 was authored under the old "frame" name; the runtime variable is currently `frameFocus` and renames to `pageFocus` in the migration.)
- **Gate** (a.k.a. **input gate**) — `aboveView.setVisible(...)` predicate. Open in canvas mode iff `pageFocus === null`. The single arbiter of who receives canvas-region pointer events.
- **Pointer router** — `src/renderer/above-view/useCanvasPointerRouter.ts`. Single window-level capture-phase pointerdown listener that runs the shared `hitTest` and dispatches a typed `CanvasPointerAction`. Yields to any element inside `[data-overlay-ui]`.
- **Hit-test priority table** — 5 layers, top wins: `resize-handles > chrome (geometric) > anchors > body > background`. Lives in `src/shared/hit-test.ts`. Geometric only — DOM overlay UI in aboveView resolves above all of them structurally. Refinement for `entity-body` on text/sticky/shape and editable file renderers (markdown, wireframe, video): when the hit entity is the sole current selection, no modifier is held, and nothing else is editing, the router emits `begin-entity-press` instead of `begin-entity-drag` — a stationary release routes to `canvas-request-entity-edit` while threshold-crossing movement falls through to drag. File renderers opt in via an `editable: boolean` flag on their plugin claim (broadcast as `rendererEditable` on the file scene entity); non-editable renderers (image, component placeholder) gracefully fall through to drag, and dblclick on those kinds is a noop rather than entering `editing-entity` mode with no editor on screen (issue #49 / `docs/interaction-layer.md` §4.2.1).
- **Edit mode** — runtime variable `editingEntityId: string | null` in main, derived from `interactionState` (controller mode `editing-entity`). Mutually exclusive with every other interaction mode (`dragging-entities`, `marquee`, `resizing-entity`, `dragging-edge`, `panning`). One IPC vocabulary covers every editable canvas item — `canvas-request-entity-edit`, `canvas-commit-entity-edit`, `canvas-cancel-entity-edit` — and main is the sole token holder. Renderers mount their editable surface (textarea / contentEditable / rename input) **iff** `editingEntityId === myId`; the read-only render is shown otherwise. Lifecycle: blur → commit, Escape → cancel (revert), pointer outside the editing entity's body → commit and swallow the click (the user clicks again to act on the new target), drag attempt on the editing entity → refused silently, drag attempt elsewhere → commits and swallows, selection change / entity deletion / undo / tab switch / window blur → cancel (the renderer's blur handler saves any in-flight text). Owned by `src/main/runtime/editing-entity-runtime.ts`.

## Overlay UI in aboveView

Per [ADR 0002](./docs/adr/0002-canvas-anchored-overlay-ui.md) and [ADR 0008](./docs/adr/0008-unified-canvas-item-popup.md). All canvas-anchored UI renders in aboveView's React tree, marked `data-overlay-ui` so the pointer router yields.

- **`CanvasItemChrome`** — persistent overlay UI for **identity** rendered while an entity exists. Per ADR 0008 §"File chrome", chrome carries identity affordances only (favicon + URL/filename + drag handle); all *actions* move into the popup. Examples: page favicon + URL display, file filename label.
- **`CanvasItemPopup`** — the unified popup for "configure this kind". One component, two anchor modes:
  - **Entity-anchored (selection mode)** — mounts when one entity (or a same-kind multi-selection) is selected, idle, after a 150 ms delay. Hidden during drag/marquee/resize/edit. Reads/writes that entity's fields.
  - **Viewport-anchored (tool mode)** — mounts under the toolbar, centered, when a creation tool with options is active (`add-text`, `add-shape`, `draw`). Reads/writes per-tool defaults in app settings; the next item created uses those defaults.
  - When a non-`select` tool with options is active, the tool popup wins; the selection popup is suppressed. Tools without options (`inspect`, `comment`, `add-page`, `add-document`) fall through to the selection popup.
  - Right-click context menus are out of scope.
- **`useAnchoredPosition(entityId, slot)`** — pure positioning hook. Reads the layout broadcast aboveView already receives, returns screen-space coords for the entity's chrome slot.
- **`EntityChrome` compound** — the `Root / DragTrigger / Title / Actions / Button` primitives composed inside `CanvasItemChrome` consumers. Style once, compose differently per consumer.

## Tool defaults

Per-tool, persistent app settings (not per-canvas, not in `.canvas`). Read by creation tools when stamping new entities; written by the tool-mode popup. Stored in user app settings (`~/Library/Application Support/Specular/...`) so each tool remembers its last-picked configuration across sessions and canvases.

| Tool | Defaults keys |
|---|---|
| `add-text` (plain) | `color`, `textSize` |
| `add-text` (sticky) | `color`, `textSize` |
| `add-shape` | `shapeKind`, `color`, `strokeWidth`, `textSize` |
| `draw` | `brushType`, `color`, `strokeWidth` |

Tool defaults never participate in undo/redo and never round-trip through Y.Doc — they're user preferences, not document data. See [ADR 0008](./docs/adr/0008-unified-canvas-item-popup.md) §"Tool defaults".

## Color palette

The popup color swatches expose **eight slots**, left → right: `neutral · purple · blue · cyan · green · yellow · orange · red`. Same lineup for every kind that picks a color. See [ADR 0013](./docs/adr/0013-popup-menus-v2.md) for the full encoding rationale.

**Slot 1 ("neutral") is theme-aware *and* role-aware.** Same on-disk encoding resolves to a different RGB depending on (a) the active color mode (light vs dark) and (b) the entity role:

| Role | Light mode | Dark mode |
|---|---|---|
| Surface-fill (sticky, shape fill, plain-text background if any) | Light | Dark |
| Ink (pen / highlighter stroke, plain text glyphs) | Dark | Light |

Stickies marked "neutral" recede into the canvas; pen strokes marked "neutral" stand out.

**Disk format (JSON Canvas v1.0 compliant via hex + Specular extension):**
- Neutral → `specular.colorRole: "neutral"` (the `color` field is omitted, or carries `"1"` as a fallback for other JSON Canvas readers).
- Hues (purple…red) → 6-char hex string in `color` (per the spec's hex form). Other JSON Canvas apps render the literal RGB.

Slots 2–8 are fixed hues whose muted saturation reads on both light and dark canvas. Resolution lives in `src/shared/canvas-colors.ts` (the existing module gains a role parameter).

## Text size

A per-entity property exposed by the popup for every kind that renders text — `text` (plain and sticky) and `shape` (the inner label rendered inside a rect/ellipse/diamond). Presented as a labeled dropdown in the popup ("Small ▾") with preset values **Small / Medium / Large / Extra large / Huge** (18 / 32 / 56 / 96 / 144 px) plus a raw-pixel input at the bottom for arbitrary values (8–256 range). Sentence case for the preset labels per the UI copy voice rule. The Pen popup deliberately does *not* use the labeled-dropdown pattern — pen stroke width stays as two inline preview buttons because the visual is the value. Shape **stroke width** is also future work and not in this pass; today's shape stroke width remains in the data model but isn't exposed in the new popup. See [ADR 0013](./docs/adr/0013-popup-menus-v2.md).

## Tools

A **Tool** is the single representation of "what does my next click/gesture do?" There is exactly one active tool at any moment. Tools are mutually exclusive; you switch by toolbar click, keyboard shortcut, or Escape (which returns to `select`). See [ADR 0005](./docs/adr/0005-unified-tool-concept.md), amended by [ADR 0006](./docs/adr/0006-unified-comment-tool.md) (comment tool subsumes region-select), and refined by [ADR 0009](./docs/adr/0009-tool-variants-in-popup-state.md) (variants move to tool defaults).

```ts
type Tool =
  | { kind: 'select' }       // default
  | { kind: 'add-page' }     // one-shot — "frame" in the toolbar (icon, not name)
  | { kind: 'add-text' }     // one-shot — no style variant; popup picks short/long
  | { kind: 'add-sticky' }   // one-shot — separate first-class tool, not a text style
  | { kind: 'add-shape' }    // one-shot — shapeKind in tool defaults
  | { kind: 'comment' }      // persistent — click for point/element comment, drag for region comment
  | { kind: 'draw' }         // persistent — brushType in tool defaults
  | { kind: 'inspect' }      // persistent
```

- **One-shot tools** auto-revert to `select` after one placement.
- **Persistent tools** stay active until toggled off, replaced, or Escape.
- The toolbar does **not** visually distinguish one-shot from persistent — users learn the duration by use.
- Tool name → cursor-label gerund: `select` → "selecting", `add-page` → "adding page", `add-sticky` → "adding sticky", `comment` → "commenting", `draw` → "drawing", `inspect` → "inspecting".
- **Toolbar grouping (left → right):** *nav* (`select`, `hand`) → *create* (`draw`, `add-sticky`, `add-shape`, `add-page`) → *annotate* (`add-text`, `comment`, `inspect`) → *view* (theme, zoom). Plain text sits in *annotate* because writing words on the canvas is an annotation act; sticky sits in *create* because the sticky is the thing itself. `add-document` is no longer a tool — markdown files are reached via the text popup's `short` → `long` toggle.
- **Variants live in tool defaults, not in the union.** `add-shape` no longer carries `shapeKind`; `draw` no longer encodes `brushType` via implicit Tool state. Both are picked from the tool-mode popup and persisted to app settings (per ADR 0009). `add-text` no longer carries `style` either — sticky is its own `add-sticky` tool, and the inline-text-vs-markdown choice lives in the text popup's short/long toggle.

Replaces three previously-parallel state machines: `pendingPlacement`, `AnnotationMode`, and the `inspect` boolean. The legacy term "annotation mode" no longer names a state — annotations themselves remain, but the *mode of being in the comment tool* is just a tool.

**Not a tool:** **View mode** (canvas vs browser). View mode answers "which surface am I looking at?", not "what does my next click do?" — it's structural, not transient. Stays in its own state.

## Annotations

Comments live on the canvas as a single user-facing concept ("comment") and a single runtime entity (`Annotation`). One tool — `comment` — produces all of them; the gesture decides the **anchor** (per [ADR 0006](./docs/adr/0006-unified-comment-tool.md)):

- **Click on a page element** → element anchor (DOM selector + bbox).
- **Click anywhere else on the canvas** → canvas-point anchor (the click position).
- **Drag a marquee** → region anchor (canvas-rect, may span pages).

Discriminated by `anchor.type: 'element' | 'canvas' | 'region'`. The legacy `Annotation.kind` field is redundant once the anchor is the source of truth.

**Resting visual on the canvas** is asymmetric and matches today's behavior:
- Region anchor → dashed rose-400 rectangle, always visible (filtered only by `status`). Click opens the thread. Region rects are in canvas coords — they do **not** track page scroll (intentional: regions mark canvas space, not page content).
- Element anchor → no resting visual; lives in the right panel and surfaces via composer (pending) or popover (opened from panel). Element popovers re-query the live bbox via `selector` on every layout tick / page scroll, so they track scroll. If the selector no longer matches, the popover stays at its last-known position with a "stale anchor" indicator.
- Canvas-point anchor → same as element — no resting visual; selection from the right panel reveals a temporary marker at the canvas point and opens the thread popover.

**Pending composer** — single component that mounts after the gesture and before the comment is committed. Placement is a thin function over the anchor: above-right of the element bbox, adjacent to the click point, or above-right of the region rect. Esc cancels; click outside commits (if non-empty) or discards (if empty); only one pending composer exists at a time.

**Element name** — a first-class label field on element-anchored annotations. The element composer surfaces a single-line "Element name" input above the body + thread, so the user names what they're commenting on (e.g. "Submit button", "Hero CTA") before adding their first message. Persisted on the annotation entity; visible in the right-panel comment list. Canvas-point and region anchors don't carry an element name (anchor itself is the identity).

## Keyboard bindings

A **Binding** is one entry in the keyboard registry: `{ id, defaultKey, scope, target, when?, firesWhileTyping?, firesFromPageFocus?, label }`. The registry is the single source of truth — the dispatcher reads it, the app menu reads it, future tooltips and Bindings settings read it. See [ADR 0010](./docs/adr/0010-main-as-sole-shortcut-dispatch-site.md) and [`docs/plans/keyboard-binding-registry.md`](./docs/plans/keyboard-binding-registry.md).

- **BindingId** — string-literal union of every shortcut's canonical name (e.g. `'tool-comment'`, `'undo'`, `'select-all'`). Lives in `src/shared/bindings.ts`.
- **NormalizedKey** — `{ key, cmd, alt, shift }` where `key` is lowercased and `cmd` collapses `Cmd`/`Ctrl` per platform. The cross-process key representation; both Electron `Input` events and DOM `KeyboardEvent`s normalise to this.
- **Binding dispatcher** — pure function `dispatchKey(table, key, ctx) → BindingId | null` in `src/shared/bindings.ts`. The only dispatch happens in main's `before-input-event` listener, attached to every WebContentsView (see ADR 0010).
- **Keyboard source view** — which WebContentsView produced a keystroke (`'aboveView' | 'canvasBg' | 'toolbar' | 'leftSidebar' | 'rightDetailsPanel' | 'devtoolsHeader' | 'devtoolsResizeHandle' | 'page'`). Each binding declares the source views it can fire from via `scope: KeyboardSourceView[]`. Distinct from **page focus** (ADR 0001): page focus says "which page receives native input"; keyboard source view says "which view produced this keystroke."
- **Binding target** — `'main' | KeyboardSourceView`. Where the handler runs. Most bindings run in main; a few (annotation overlay) run in a renderer because their state is renderer-local React `useState`.
- **`firesWhileTyping`** — opt-in flag for a binding to fire when `isTextEditing` is true. Default `false`. Only `undo`, `redo`, `reset-viewport`, and `escape-tool` opt in.
- **`firesFromPageFocus`** — opt-in flag for a binding to fire when a page has keyboard focus (per [ADR 0011](./docs/adr/0011-page-focus-respects-native-shortcuts.md)). Default `false`. Only `escape-page-focus` and `reset-viewport` opt in.

**Keyboard shortcuts and tools.** Every `Tool['kind']` has a default key, enforced by TypeScript exhaustiveness. Variant keys (e.g. Shift+R for diamond, Shift+M for highlight) activate the tool *and* write the variant to **tool defaults** per ADR 0009. Pressing a tool's key while that tool is already active is a no-op (FigJam reference); Escape is the only keyboard path back to `select`.

## UI copy voice

- **Sentence case** — capitalize the first word only. Default for menus, buttons, dialog text, chrome labels: "Reveal codebase in finder", "Delete project…", "Rename".
- **Lowercase gerund narration** — used **only** for cursor labels, status bar text, and live captions. "clicking submit", "dropping in frame", "looking at toolbar". No quotes, arrows, or colons.

---

*This file is the canonical glossary. When a term resolves during planning or grilling, update it here. Don't couple to implementation details — only include terms that are meaningful to the domain, not internal helpers.*
