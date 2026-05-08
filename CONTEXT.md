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

## Entity geometry

- **Entity rect** — the full bounding rect of an entity, body + chrome as one layout unit ([ADR 0002](./docs/adr/0002-canvas-anchored-overlay-ui.md)). Pan / zoom / drag / resize operate on this rect.
- **Body sub-rect** — the part of the entity rect that holds the entity's content (the live document for a page, the image for a file, etc.). Resize handles and edge anchors attach here.
- **Chrome slot** — the part of the entity rect reserved for canvas-anchored overlay UI. Per-kind, runtime-derived, **not persisted** in the `.canvas` schema.

## Input authority

- **Page focus** — runtime state `{ id, since } | null` in main. When set, the focused page receives native pointer input; aboveView's gate is closed. When null, aboveView is the sole input authority. See [ADR 0001](./docs/adr/0001-click-to-enter-frame-focus.md). (ADR 0001 was authored under the old "frame" name; the runtime variable is currently `frameFocus` and renames to `pageFocus` in the migration.)
- **Gate** (a.k.a. **input gate**) — `aboveView.setVisible(...)` predicate. Open in canvas mode iff `pageFocus === null`. The single arbiter of who receives canvas-region pointer events.
- **Pointer router** — `src/renderer/above-view/useCanvasPointerRouter.ts`. Single window-level capture-phase pointerdown listener that runs the shared `hitTest` and dispatches a typed `CanvasPointerAction`. Yields to any element inside `[data-overlay-ui]`.
- **Hit-test priority table** — 5 layers, top wins: `resize-handles > chrome (geometric) > anchors > body > background`. Lives in `src/shared/hit-test.ts`. Geometric only — DOM overlay UI in aboveView resolves above all of them structurally.

## Overlay UI in aboveView

Per [ADR 0002](./docs/adr/0002-canvas-anchored-overlay-ui.md). All canvas-anchored UI renders in aboveView's React tree, marked `data-overlay-ui` so the pointer router yields.

- **`CanvasItemChrome`** — persistent overlay UI rendered while an entity exists. Examples: page URL bar / nav buttons, file chrome buttons, group rename label.
- **`CanvasItemPopup`** — selection-state-driven overlay UI. Mounts when an entity is in a particular selection sub-state, unmounts when it leaves. Right-click context menus are out of scope.
- **`useAnchoredPosition(entityId, slot)`** — pure positioning hook. Reads the layout broadcast aboveView already receives, returns screen-space coords for the entity's chrome slot.
- **`EntityChrome` compound** — the `Root / DragTrigger / Title / Actions / Button` primitives composed inside `CanvasItemChrome` consumers. Style once, compose differently per consumer.

## UI copy voice

- **Sentence case** — capitalize the first word only. Default for menus, buttons, dialog text, chrome labels: "Reveal codebase in finder", "Delete project…", "Rename".
- **Lowercase gerund narration** — used **only** for cursor labels, status bar text, and live captions. "clicking submit", "dropping in frame", "looking at toolbar". No quotes, arrows, or colons.

---

*This file is the canonical glossary. When a term resolves during planning or grilling, update it here. Don't couple to implementation details — only include terms that are meaningful to the domain, not internal helpers.*
