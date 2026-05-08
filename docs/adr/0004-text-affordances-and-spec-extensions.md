# ADR 0004 — Text affordances (Text / Sticky note / Document) and the Specular spec-extension convention

**Status:** Accepted
**Implementation:** Landed. `PersistedTextEntity.textStyle` (optional, defaults to `'sticky'` on read) flows through `text-entity-state`, the JSON Canvas serializer reads/writes `specular.textStyle`, and `StickyBodyLayer` branches on the field — `'plain'` renders without card or background. The toolbar's "Add Text Block" + "Add Note" buttons are replaced by a single `Add text ▾` dropdown with Text / Sticky note / Document. IPC: `toolbar-add-text` carries `{ style: 'plain' | 'sticky' }`; `toolbar-add-document` replaces `toolbar-add-note`. Serializer round-trip and legacy-default behaviors covered by `tests/unit/json-canvas-serializer.test.ts`.
**Date:** 2026-05-08
**Supersedes premise of:** the toolbar's "Add Text Block" + "Add Note" buttons, and the implicit assumption that a single `text` kind has one render style.
**Related:** [ADR 0003 — Page as canonical name for live web items](./0003-page-as-canonical-name-for-live-web-items.md). Both ADRs originate from a single naming pass on canvas items and tools (CONTEXT.md update, 2026-05-08).

## Context

Users want **three** distinct text-ish affordances on the canvas:

1. **Short titles** — plain text, no background. Headings, labels, captions.
2. **Sticky notes** — short text in a colored card. Quick thoughts, comments.
3. **Longer markdown documents** — full markdown content, reusable across canvases.

The codebase had only **two** placement tools, neither of which matched the desired model:

- **"Add Text Block"** (sticky-note icon) → `text` entity, rendered with the sticky-note treatment. No way to create plain unbacked text.
- **"Add Note"** (file-text icon) → `file` entity, markdown-rendered. Confusing: "Note" sounded like the sticky-note button, but actually created a file-backed document.

Icons and labels were inverted (StickyNote icon for "Text Block", FileText icon for "Note"), and there was no toolbar entry for the most basic case — a plain title on the canvas.

JSON Canvas v1.0 (`https://jsoncanvas.org/spec/1.0/`) defines four node types as a flat list: `text` (inline), `file` (path on disk), `link` (URL), `group` (container). It does *not* define a third text kind, but it tolerates additional fields on nodes — every JSON Canvas tool ignores fields it doesn't recognize.

So the design problem split in two:

1. **How to express three affordances on top of a spec with only two relevant kinds.**
2. **What conventions to use for Specular-only fields on disk** so they don't collide with other tools' extensions and so future Specular-only fields are easy to find and document.

## Decision

### 1. Three text affordances mapped to the spec

| UX affordance | Toolbar label | Spec mapping |
|---|---|---|
| Short text, no background | **Text** | `text` node + `specular.textStyle: 'plain'` |
| Sticky note (short text + bg color) | **Sticky note** | `text` node + `specular.textStyle: 'sticky'` (the default) |
| Longer markdown document | **Document** | `file` node, markdown renderer (selected by extension via `src/main/plugins/registry.ts`) |

Text and Sticky note are the same `text` kind, distinguished only by a render-style toggle. Document is a separate kind because its content lives on disk, not in the `.canvas` JSON — that distinction is meaningful (file-backed documents can be referenced from other canvases, edited outside Specular, version-controlled independently).

The three placement tools are grouped under a single **`Add text ▾`** dropdown in the toolbar (mirroring the existing `Add Shape ▾` pattern):

```
Select | Add page ▾ | Add text ▾ | Add shape ▾ | Comments | Draw | Region select | Inspect
                       ↓
                       Text
                       Sticky note
                       Document
```

### 2. Spec-extension convention: namespaced `specular: {}` object

Specular-only fields live under a top-level `specular: {}` object on each node:

```jsonc
{
  "id": "...",
  "type": "text",
  "x": 0, "y": 0, "width": 200, "height": 60,
  "text": "...",
  "specular": {
    "textStyle": "plain"
  }
}
```

Conventions:
- Specular-only fields live under `specular: {}`. No other Specular fields go at the top level.
- Reading our canvases in other tools: the `specular` object is silently ignored; the node still renders as a standard JSON Canvas `text`/`file`/`link`/`group`.
- Reading other tools' canvases in Specular: missing `specular` fields fall back to documented defaults (e.g. missing `textStyle` → `'sticky'`).
- Genuinely new node *kinds* (`drawing`, `shape`) remain top-level `type` values rather than going under `specular: {}`. They aren't spec kinds and no fallback rendering would be meaningful, so namespacing the kind itself buys nothing and would just complicate the discriminated union.

### 3. Default `textStyle` is `'sticky'`

Every existing `text` entity in every existing canvas has no `specular.textStyle` field. The renderer treats missing as `'sticky'`, preserving current rendering for all legacy canvases. New "Add text" placements stamp `'plain'` explicitly. No file migration needed.

### 4. `color` interpretation is style-dependent

The spec's optional `color` field has different meaning per style:
- `textStyle: 'sticky'` — `color` is the bg color of the card.
- `textStyle: 'plain'` — `color` is the text color.

Both interpretations are reasonable readings of "node color"; this choice keeps the spec field useful in both modes.

## Alternatives considered

**A. Top-level `textStyle` field, no namespacing.** Simplest. Risks collision if another JSON Canvas tool ever adopts the same field name with different semantics. Rejected — namespacing is cheap insurance.

**B. Use absence/presence of `color` to imply plain vs sticky.** Conflates color and style; can't have a colored plain title. Rejected.

**C. Add a third spec-extension kind (e.g. `note` for sticky, `text` for plain).** Adds disk-format complexity for what is one kind with two render modes; serializer would have to translate; other tools wouldn't render the new kind at all. Rejected — `drawing` and `shape` are kinds because they have *no* spec equivalent, but sticky vs plain text is one kind with two appearances.

**D. Names: Title / Sticky note / Document.** Considered as the toolbar labels. "Text" beat "Title" because (i) "Text" is more discoverable for users scanning for "how do I add text?", (ii) it matches the Figma "T" tool muscle memory, and (iii) it agrees with the underlying spec node name `text`.

**E. Three separate top-level toolbar buttons instead of an `Add text ▾` dropdown.** Considered. The dropdown wins for symmetry with `Add Shape ▾` and reduces toolbar visual weight; users still get one click + one menu pick.

## Consequences

**Replaces:**
- Toolbar buttons "Add Text Block" and "Add Note" → folded into the `Add text ▾` dropdown with three items: Text / Sticky note / Document.
- The implicit one-style-per-`text`-kind assumption.

**Enables:**
- A single namespaced extension point (`specular: {}`) for any future Specular-only field — text variants, layout hints, agent metadata, etc.
- Future text styles (`callout`, `quote`, `code`) added as new `textStyle` values without schema changes.
- Round-trip compatibility with other JSON Canvas tools: our canvases open elsewhere as plain text/file/link/group; their canvases open in Specular with sticky-default rendering.

**Costs:**
- Existing `text` entities pick up an implicit `'sticky'` reading. New "Add text" tool stamps `'plain'` explicitly. The renderer must handle both.
- The `Add text ▾` dropdown is one more interaction layer than three separate buttons — one click + one menu pick instead of one click. Mitigated by toolbar real estate gain and symmetry with `Add Shape`.
- Codebase needs a `textStyle` field on the `text` entity type, the persistence layer, the serializer, and a render branch in the text-entity renderer. Mechanical change.

**Out of scope:**
- Folding `drawing` and `shape` under `specular: {}`. They remain top-level `type` values for the reasons above.
- Right-click conversion between text styles (Text ↔ Sticky note). Selection-driven affordance to change style is plausible but separate from this ADR.
- Document chrome — what UI sits next to a `file`-rendered markdown document. ADR 0002 already covers the `CanvasItemChrome` pattern; specifics of Document chrome are implementation detail.

## Migration

1. Add `textStyle: 'plain' | 'sticky'` to `PersistedTextEntity` (optional — reader defaults to `'sticky'`).
2. Update `text-entity-state.ts` mutations to accept and persist `textStyle`.
3. Update serializer: write `specular.textStyle` when set; read it on deserialize.
4. Toolbar: collapse "Add Text Block" and "Add Note" into the new `Add text ▾` dropdown with three options. IPC channels: `toolbar-add-text-entity` becomes `toolbar-add-text-plain` (or carries a payload `{ style: 'plain' | 'sticky' }`); `toolbar-add-note` renames to `toolbar-add-document`.
5. Renderer: text-entity renderer branches on `textStyle`. Sticky path is the existing renderer; plain path is new (no card background, just text + position).
6. Tests: serializer round-trip for both styles; smoke test for the new `Add text ▾` dropdown.

## Tests

- Unit: serializer round-trip — `PersistedTextEntity` with `textStyle: 'plain'` ↔ JSON Canvas `text` node with `specular.textStyle: 'plain'`.
- Unit: legacy canvas parse — `text` node without `specular.textStyle` deserializes to `textStyle: 'sticky'`.
- Smoke: `Add text ▾ → Text` places a plain text entity. `Add text ▾ → Sticky note` places a sticky entity. `Add text ▾ → Document` creates a file entity with a markdown extension.
- Manual: open a Specular-saved canvas in Obsidian; verify text and sticky nodes render as plain text, ignoring the `specular` field.
